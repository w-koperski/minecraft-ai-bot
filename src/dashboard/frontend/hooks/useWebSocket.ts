'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { BotState, ConnectionState, WSMessage } from '@/lib/types';

const WS_URL = 'ws://localhost:3001/ws';
const MAX_BACKOFF_MS = 30_000;
const INITIAL_BACKOFF_MS = 1_000;

interface UseWebSocketReturn {
  state: BotState | null;
  connectionState: ConnectionState;
  lastUpdate: number | null;
  error: string | null;
}

const DEFAULT_STATE: BotState = {
  status: 'disconnected',
  health: 0,
  position: { x: 0, y: 0, z: 0 },
  inventory: [],
  goal: null,
  connectedClients: 0,
};

export function useWebSocket(): UseWebSocketReturn {
  const [state, setState] = useState<BotState | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(INITIAL_BACKOFF_MS);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    clearReconnectTimer();
    setConnectionState('connecting');
    setError(null);

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        setConnectionState('connected');
        setError(null);
        backoffRef.current = INITIAL_BACKOFF_MS;
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          const message: WSMessage = JSON.parse(event.data);
          if (message.data) {
            setState((prev) => ({
              ...DEFAULT_STATE,
              ...prev,
              ...message.data,
              position: {
                ...DEFAULT_STATE.position,
                ...(prev?.position ?? {}),
                ...(message.data.position ?? {}),
              },
            }));
            setLastUpdate(message.data.timestamp ?? Date.now());
          }
        } catch {
          // intentionally empty: arbitrary WS data may not be valid JSON
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setConnectionState('disconnected');
        wsRef.current = null;
        scheduleReconnect();
      };

      ws.onerror = () => {
        if (!mountedRef.current) return;
        setError('WebSocket connection failed');
        setConnectionState('error');
        wsRef.current = null;
      };
    } catch {
      if (!mountedRef.current) return;
      setError('Failed to create WebSocket');
      setConnectionState('error');
      scheduleReconnect();
    }
  }, [clearReconnectTimer]);

  const scheduleReconnect = useCallback(() => {
    if (!mountedRef.current) return;
    const delay = backoffRef.current;
    backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
    reconnectTimerRef.current = setTimeout(connect, delay);
  }, [connect]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      clearReconnectTimer();
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.onmessage = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect, clearReconnectTimer]);

  return { state, connectionState, lastUpdate, error };
}