/**
 * useSignalling — WebSocket signalling hook for Remote Desktop sessions
 *
 * Manages the WebSocket connection to `/api/remote-desktop/signal`,
 * handles session token authentication on connect, and relays signalling
 * messages between the Browser Viewer and Session Broker.
 *
 * Message types: session_init, sdp_offer, sdp_answer, ice_candidate,
 * session_end, session_pause, quality_change
 *
 * Requirements: 4.1
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RemoteDesktopErrorCode } from '@/services/remoteDesktop/types';

// ─── Types ──────────────────────────────────────────────────────────────────────

export type SignallingMessageType =
  | 'session_init'
  | 'sdp_offer'
  | 'sdp_answer'
  | 'ice_candidate'
  | 'session_end'
  | 'session_pause'
  | 'quality_change';

export interface SignallingMessage {
  type: SignallingMessageType;
  sessionId: string;
  payload: Record<string, unknown>;
}

export interface SignallingError {
  code: RemoteDesktopErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export type SignallingConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

export interface UseSignallingParams {
  /** Session token for authentication */
  sessionToken: string;
  /** The session ID to join */
  sessionId: string;
  /** Whether to auto-connect on mount */
  autoConnect?: boolean;
  /** Callback when a signalling message is received */
  onMessage?: (message: SignallingMessage) => void;
  /** Callback when an error is received from the signalling server */
  onError?: (error: SignallingError) => void;
  /** Callback when the connection state changes */
  onStateChange?: (state: SignallingConnectionState) => void;
}

export interface UseSignallingResult {
  /** Current connection state */
  connectionState: SignallingConnectionState;
  /** Send a signalling message to the broker */
  sendMessage: (type: SignallingMessageType, payload: Record<string, unknown>) => void;
  /** Manually connect to the signalling server */
  connect: () => void;
  /** Manually disconnect from the signalling server */
  disconnect: () => void;
  /** Last error received, if any */
  lastError: SignallingError | null;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const SIGNALLING_PATH = '/api/remote-desktop/signal';
const RECONNECT_DELAY_MS = 3_000;

// ─── Hook Implementation ────────────────────────────────────────────────────────

export function useSignalling(params: UseSignallingParams): UseSignallingResult {
  const {
    sessionToken,
    sessionId,
    autoConnect = true,
    onMessage,
    onError,
    onStateChange,
  } = params;

  const [connectionState, setConnectionState] = useState<SignallingConnectionState>('disconnected');
  const [lastError, setLastError] = useState<SignallingError | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentionalCloseRef = useRef(false);

  // Keep callbacks in refs to avoid re-creating the WebSocket on callback changes
  const onMessageRef = useRef(onMessage);
  const onErrorRef = useRef(onError);
  const onStateChangeRef = useRef(onStateChange);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    onStateChangeRef.current = onStateChange;
  }, [onStateChange]);

  const updateState = useCallback((state: SignallingConnectionState) => {
    setConnectionState(state);
    onStateChangeRef.current?.(state);
  }, []);

  /**
   * Build the WebSocket URL with authentication query parameters.
   * Token, role (viewer), and sessionId are sent as query params.
   */
  const buildWsUrl = useCallback((): string => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const url = new URL(`${protocol}//${host}${SIGNALLING_PATH}`);
    url.searchParams.set('token', sessionToken);
    url.searchParams.set('role', 'viewer');
    url.searchParams.set('sessionId', sessionId);
    return url.toString();
  }, [sessionToken, sessionId]);

  /**
   * Connect to the signalling WebSocket server.
   */
  const connect = useCallback(() => {
    // Clean up any existing connection
    if (wsRef.current) {
      intentionalCloseRef.current = true;
      wsRef.current.close();
      wsRef.current = null;
    }

    // Clear any pending reconnect
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    intentionalCloseRef.current = false;
    updateState('connecting');
    setLastError(null);

    const wsUrl = buildWsUrl();
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      updateState('connected');
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string);

        // Handle error messages from the server
        if (data.error) {
          const error: SignallingError = {
            code: data.error.code ?? 'connection_failed',
            message: data.error.message ?? 'Unknown signalling error',
            details: data.error.details,
          };
          setLastError(error);
          onErrorRef.current?.(error);
          return;
        }

        // Handle signalling messages
        const message = data as SignallingMessage;
        if (message.type && message.sessionId && message.payload) {
          onMessageRef.current?.(message);
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onerror = () => {
      updateState('error');
      const error: SignallingError = {
        code: 'connection_failed',
        message: 'WebSocket connection error',
      };
      setLastError(error);
      onErrorRef.current?.(error);
    };

    ws.onclose = (event: CloseEvent) => {
      wsRef.current = null;

      if (intentionalCloseRef.current) {
        updateState('disconnected');
        return;
      }

      // If closed unexpectedly, set error state
      updateState('error');

      // Attempt reconnection after a delay (unless intentionally closed)
      if (!intentionalCloseRef.current) {
        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null;
          // Only reconnect if not intentionally closed
          if (!intentionalCloseRef.current) {
            connect();
          }
        }, RECONNECT_DELAY_MS);
      }
    };

    wsRef.current = ws;
  }, [buildWsUrl, updateState]);

  /**
   * Disconnect from the signalling WebSocket server.
   */
  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close(1000, 'Client disconnect');
      wsRef.current = null;
    }

    updateState('disconnected');
  }, [updateState]);

  /**
   * Send a signalling message through the WebSocket connection.
   */
  const sendMessage = useCallback(
    (type: SignallingMessageType, payload: Record<string, unknown>) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        return;
      }

      const message: SignallingMessage = {
        type,
        sessionId,
        payload,
      };

      wsRef.current.send(JSON.stringify(message));
    },
    [sessionId],
  );

  // Auto-connect on mount if enabled
  useEffect(() => {
    if (autoConnect && sessionToken && sessionId) {
      connect();
    }

    return () => {
      intentionalCloseRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmount');
        wsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    connectionState,
    sendMessage,
    connect,
    disconnect,
    lastError,
  };
}

export default useSignalling;
