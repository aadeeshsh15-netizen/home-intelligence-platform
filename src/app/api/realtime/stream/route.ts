import { NextRequest } from 'next/server';
import { systemEventsBus } from '@/server/event-engine/rules';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();

  let isClosed = false;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection handshake
      controller.enqueue(
        encoder.encode(`event: connected\ndata: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`)
      );

      const sendEvent = (eventName: string, data: any) => {
        if (isClosed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch (e) {
          // Stream closed
          cleanup();
        }
      };

      const handleTelemetryTick = (data: any) => sendEvent('telemetry_tick', data);
      const handleEventCreated = (data: any) => sendEvent('event_created', data);
      const handleInsightGenerated = (data: any) => sendEvent('insight_generated', data);
      const handleHealthChanged = (data: any) => sendEvent('health_changed', data);
      const handleIncidentDetected = (data: any) => sendEvent('incident_detected', data);
      const handleIncidentUpdated = (data: any) => sendEvent('incident_updated', data);
      const handleIncidentResolved = (data: any) => sendEvent('incident_resolved', data);
      const handleSystemEvent = (data: any) => sendEvent('system_event', data);

      systemEventsBus.on('telemetry_tick', handleTelemetryTick);
      systemEventsBus.on('event_created', handleEventCreated);
      systemEventsBus.on('insight_generated', handleInsightGenerated);
      systemEventsBus.on('sensor_health_changed', handleHealthChanged);
      systemEventsBus.on('incident_detected', handleIncidentDetected);
      systemEventsBus.on('incident_updated', handleIncidentUpdated);
      systemEventsBus.on('incident_resolved', handleIncidentResolved);
      systemEventsBus.on('system_event', handleSystemEvent);

      // Keepalive heartbeat every 15 seconds
      const heartbeatInterval = setInterval(() => {
        if (isClosed) {
          clearInterval(heartbeatInterval);
          return;
        }
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch (e) {
          cleanup();
        }
      }, 15000);

      const cleanup = () => {
        if (isClosed) return;
        isClosed = true;
        clearInterval(heartbeatInterval);
        systemEventsBus.off('telemetry_tick', handleTelemetryTick);
        systemEventsBus.off('event_created', handleEventCreated);
        systemEventsBus.off('insight_generated', handleInsightGenerated);
        systemEventsBus.off('sensor_health_changed', handleHealthChanged);
        systemEventsBus.off('incident_detected', handleIncidentDetected);
        systemEventsBus.off('incident_updated', handleIncidentUpdated);
        systemEventsBus.off('incident_resolved', handleIncidentResolved);
        systemEventsBus.off('system_event', handleSystemEvent);
        try {
          controller.close();
        } catch (_) {}
      };

      req.signal.addEventListener('abort', cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
