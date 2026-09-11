import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { validateEnv } from '@/lib/env';
import { simulatorEngine } from '@/server/simulator/engine';
import { mqttGateway } from '@/server/iot/mqtt-gateway';

type CleanupHandler = () => Promise<void> | void;

export class ApplicationLifecycleManager {
  private static instance: ApplicationLifecycleManager | null = null;

  private isInitialized: boolean = false;
  private isShuttingDown: boolean = false;
  private cleanupHandlers: CleanupHandler[] = [];
  private signalHandlersRegistered: boolean = false;

  private constructor() {}

  public static getInstance(): ApplicationLifecycleManager {
    if (!ApplicationLifecycleManager.instance) {
      ApplicationLifecycleManager.instance = new ApplicationLifecycleManager();
    }
    return ApplicationLifecycleManager.instance;
  }

  /**
   * Initializes server runtime: environment validation, database ping, signal handlers.
   */
  public async startup(): Promise<{ success: boolean; error?: string }> {
    if (this.isInitialized) {
      return { success: true };
    }

    try {
      logger.info('Initiating Home Intelligence Platform startup sequence...', {
        module: 'lifecycle',
      });

      // 1. Validate environment
      const envValidation = validateEnv({ strict: process.env.NODE_ENV === 'production' });
      if (!envValidation.success) {
        const errorMsg = `Environment validation failed:\n${envValidation.errors?.join('\n')}`;
        logger.error(errorMsg, { module: 'lifecycle' });
        return { success: false, error: errorMsg };
      }

      // 2. Establish database readiness check
      try {
        await prisma.$queryRaw`SELECT 1`;
        logger.info('Database connection established and verified', { module: 'lifecycle' });
      } catch (dbErr: any) {
        const dbErrMsg = `Database connection failed during startup: ${dbErr.message || String(dbErr)}`;
        logger.error(dbErrMsg, { module: 'lifecycle' });
        // In production, database is mandatory for core operation
        if (process.env.NODE_ENV === 'production') {
          return { success: false, error: dbErrMsg };
        }
      }

      // 3. Register signal handlers
      this.registerSignalHandlers();

      this.isInitialized = true;
      logger.info('Home Intelligence Platform startup completed successfully', {
        module: 'lifecycle',
      });

      return { success: true };
    } catch (err: any) {
      logger.error('Unexpected error during startup sequence', { module: 'lifecycle' }, err);
      return { success: false, error: err.message || String(err) };
    }
  }

  /**
   * Registers a cleanup callback to be executed during graceful shutdown.
   */
  public registerCleanup(handler: CleanupHandler): void {
    this.cleanupHandlers.push(handler);
  }

  /**
   * Executes graceful shutdown across all application services.
   */
  public async shutdown(signal: string = 'SIGTERM'): Promise<void> {
    if (this.isShuttingDown) {
      logger.warn('Shutdown already in progress, ignoring duplicate signal', {
        signal,
        module: 'lifecycle',
      });
      return;
    }

    this.isShuttingDown = true;
    logger.info(`Received ${signal}. Commencing graceful shutdown of Home Intelligence Platform...`, {
      signal,
      module: 'lifecycle',
    });

    try {
      // 1. Stop background simulation loops
      try {
        simulatorEngine.stop();
        logger.info('Thermodynamic simulator loop halted', { module: 'lifecycle' });
      } catch (simErr) {
        logger.warn('Error halting simulator loop during shutdown', { module: 'lifecycle' });
      }

      // 2. Disconnect MQTT gateway
      try {
        await mqttGateway.stop();
        logger.info('MQTT Gateway disconnected cleanly', { module: 'lifecycle' });
      } catch (mqttErr) {
        logger.warn('Error disconnecting MQTT Gateway during shutdown', { module: 'lifecycle' });
      }

      // 3. Execute custom cleanup handlers (in reverse registration order)
      for (const handler of [...this.cleanupHandlers].reverse()) {
        try {
          await handler();
        } catch (handlerErr: any) {
          logger.error('Error in custom cleanup handler', {
            error: handlerErr.message || String(handlerErr),
            module: 'lifecycle',
          });
        }
      }

      // 4. Disconnect Prisma client
      try {
        await prisma.$disconnect();
        logger.info('Database client disconnected cleanly', { module: 'lifecycle' });
      } catch (dbErr) {
        logger.warn('Error disconnecting database client during shutdown', { module: 'lifecycle' });
      }

      logger.info('Graceful shutdown completed successfully. Process ready to exit.', {
        module: 'lifecycle',
      });
    } catch (err: any) {
      logger.error('Fatal error during shutdown sequence', { module: 'lifecycle' }, err);
    }
  }

  public isTerminating(): boolean {
    return this.isShuttingDown;
  }

  public isReady(): boolean {
    return this.isInitialized && !this.isShuttingDown;
  }

  private registerSignalHandlers(): void {
    if (this.signalHandlersRegistered) return;
    this.signalHandlersRegistered = true;

    // Only register OS signal handlers in Node process environments
    if (typeof process !== 'undefined' && typeof process.on === 'function') {
      const handleSignal = (sig: string) => {
        this.shutdown(sig).finally(() => {
          if (process.env.NODE_ENV !== 'test') {
            process.exit(0);
          }
        });
      };

      process.once('SIGTERM', () => handleSignal('SIGTERM'));
      process.once('SIGINT', () => handleSignal('SIGINT'));
    }
  }
}

export const lifecycleManager = ApplicationLifecycleManager.getInstance();
