'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export interface TelemetryTick {
  sensorId: string;
  roomId: string;
  roomName: string;
  type: string;
  unit: string;
  value: number;
  timestamp: string;
}

export interface LiveEventNotification {
  id: string;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  title: string;
  description: string;
  category: string;
  createdAt: string;
}

export type ConnectionState = 'CONNECTING' | 'LIVE' | 'RECONNECTING' | 'OFFLINE';

export function useRealtimeTelemetry(onTick?: (tick: TelemetryTick) => void) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('CONNECTING');
  const [lastTick, setLastTick] = useState<TelemetryTick | null>(null);
  const [lastHeartbeat, setLastHeartbeat] = useState<Date | null>(null);
  const [liveNotifications, setLiveNotifications] = useState<LiveEventNotification[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);
  const tickHandlerRef = useRef(onTick);

  useEffect(() => {
    tickHandlerRef.current = onTick;
  }, [onTick]);

  const connect = useCallback(() => {
    if (typeof window === 'undefined') return;

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setConnectionState('CONNECTING');
    const es = new EventSource('/api/realtime/stream');
    eventSourceRef.current = es;

    es.addEventListener('connected', () => {
      setConnectionState('LIVE');
      setLastHeartbeat(new Date());
    });

    es.addEventListener('telemetry_tick', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as TelemetryTick;
        setLastTick(data);
        setLastHeartbeat(new Date());
        if (tickHandlerRef.current) {
          tickHandlerRef.current(data);
        }
      } catch (err) {
        console.error('Error parsing telemetry tick:', err);
      }
    });

    es.addEventListener('event_created', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as LiveEventNotification;
        setLiveNotifications((prev) => [data, ...prev.slice(0, 4)]);
      } catch (err) {
        console.error('Error parsing event_created:', err);
      }
    });

    es.onerror = () => {
      setConnectionState('RECONNECTING');
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [connect]);

  return {
    connectionState,
    lastTick,
    lastHeartbeat,
    liveNotifications,
    reconnect: connect,
  };
}
