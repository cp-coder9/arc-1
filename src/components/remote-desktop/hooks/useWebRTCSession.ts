/**
 * useWebRTCSession — React hook managing the WebRTC peer connection lifecycle
 * for the Browser Viewer (media receiver).
 *
 * Responsibilities:
 * - Manage RTCPeerConnection lifecycle (create, connect, close)
 * - Handle SDP offer/answer exchange via signalling WebSocket
 * - Implement ICE candidate exchange
 * - Handle TURN fallback when P2P fails within 10 seconds
 * - Implement 30-second connection timeout with error display
 *
 * Requirements: 4.1, 4.3, 6.1, 6.11
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RemoteDesktopErrorCode } from '@/services/remoteDesktop/types';

// ─── Types ──────────────────────────────────────────────────────────────────────

export type WebRTCSessionStatus =
  | 'idle'
  | 'connecting'
  | 'waiting_for_host'
  | 'negotiating'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'failed';

export interface ICEServer {
  urls: string | string[];
  username?: string;
  credential?: string;
  credentialType?: 'password';
}

export interface TurnCredentials {
  urls: string[];
  username: string;
  credential: string;
  credentialType: 'password';
  expiresAt: number;
}

export interface WebRTCSessionError {
  code: RemoteDesktopErrorCode;
  message: string;
}

export interface UseWebRTCSessionParams {
  /** The session ID for signalling */
  sessionId: string;
  /** Session token for authentication */
  sessionToken: string;
  /** WebSocket URL for signalling (defaults to /api/remote-desktop/signal) */
  signallingUrl?: string;
  /** Optional ICE servers to use for the initial connection attempt */
  iceServers?: ICEServer[];
  /** Callback when connection is established */
  onConnected?: (connectionType: 'peer-to-peer' | 'turn-relay') => void;
  /** Callback when connection fails */
  onFailed?: (error: WebRTCSessionError) => void;
  /** Callback when session ends (from remote) */
  onSessionEnd?: (reason: string) => void;
  /** Callback when a remote media stream is received */
  onRemoteStream?: (stream: MediaStream) => void;
}

export interface UseWebRTCSessionResult {
  /** Current connection status */
  status: WebRTCSessionStatus;
  /** Error details if status is 'failed' */
  error: WebRTCSessionError | null;
  /** The received remote media stream */
  remoteStream: MediaStream | null;
  /** The RTCPeerConnection instance (for advanced use / data channels) */
  peerConnection: RTCPeerConnection | null;
  /** Connection type once established */
  connectionType: 'peer-to-peer' | 'turn-relay' | null;
  /** Initiate the WebRTC connection */
  connect: () => void;
  /** Disconnect and clean up */
  disconnect: () => void;
  /** Attempt reconnection (after a drop) */
  reconnect: () => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

/** Time to wait for P2P before requesting TURN credentials */
const P2P_TIMEOUT_MS = 10_000;

/** Maximum time for the entire connection to establish */
const CONNECTION_TIMEOUT_MS = 30_000;

/** Default signalling WebSocket endpoint */
const DEFAULT_SIGNALLING_PATH = '/api/remote-desktop/signal';

// ─── Hook Implementation ────────────────────────────────────────────────────────

export function useWebRTCSession(params: UseWebRTCSessionParams): UseWebRTCSessionResult {
  const {
    sessionId,
    sessionToken,
    signallingUrl,
    iceServers = [],
    onConnected,
    onFailed,
    onSessionEnd,
    onRemoteStream,
  } = params;

  // ── State ──────────────────────────────────────────────────────────────────

  const [status, setStatus] = useState<WebRTCSessionStatus>('idle');
  const [error, setError] = useState<WebRTCSessionError | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [connectionType, setConnectionType] = useState<'peer-to-peer' | 'turn-relay' | null>(null);
  const [peerConnection, setPeerConnection] = useState<RTCPeerConnection | null>(null);

  // ── Refs (mutable state that doesn't trigger re-renders) ───────────────────

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const p2pTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turnRequestedRef = useRef(false);
  const isConnectedRef = useRef(false);
  const cleanedUpRef = useRef(false);

  // Store latest callbacks in refs to avoid stale closures
  const onConnectedRef = useRef(onConnected);
  const onFailedRef = useRef(onFailed);
  const onSessionEndRef = useRef(onSessionEnd);
  const onRemoteStreamRef = useRef(onRemoteStream);

  useEffect(() => {
    onConnectedRef.current = onConnected;
    onFailedRef.current = onFailed;
    onSessionEndRef.current = onSessionEnd;
    onRemoteStreamRef.current = onRemoteStream;
  }, [onConnected, onFailed, onSessionEnd, onRemoteStream]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const clearTimers = useCallback(() => {
    if (p2pTimeoutRef.current) {
      clearTimeout(p2pTimeoutRef.current);
      p2pTimeoutRef.current = null;
    }
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
  }, []);

  const handleError = useCallback((code: RemoteDesktopErrorCode, message: string) => {
    const sessionError: WebRTCSessionError = { code, message };
    setError(sessionError);
    setStatus('failed');
    onFailedRef.current?.(sessionError);
  }, []);

  const sendSignallingMessage = useCallback((type: string, payload: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, sessionId, payload }));
    }
  }, [sessionId]);

  // ── Cleanup ────────────────────────────────────────────────────────────────

  const cleanup = useCallback(() => {
    if (cleanedUpRef.current) return;
    cleanedUpRef.current = true;

    clearTimers();

    // Close peer connection
    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.ontrack = null;
      pcRef.current.oniceconnectionstatechange = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
      setPeerConnection(null);
    }

    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.onmessage = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      if (wsRef.current.readyState === WebSocket.OPEN) {
        sendSignallingMessage('session_end', { reason: 'viewer_disconnected' });
        wsRef.current.close(1000, 'Session ended');
      }
      wsRef.current = null;
    }

    isConnectedRef.current = false;
    turnRequestedRef.current = false;
  }, [clearTimers, sendSignallingMessage]);

  // ── WebRTC Peer Connection Setup ───────────────────────────────────────────

  const createPeerConnection = useCallback((servers: ICEServer[]): RTCPeerConnection => {
    const config: RTCConfiguration = {
      iceServers: servers.length > 0
        ? servers.map(s => ({
            urls: s.urls,
            username: s.username,
            credential: s.credential,
          }))
        : [{ urls: 'stun:stun.l.google.com:19302' }],
      iceCandidatePoolSize: 4,
    };

    const pc = new RTCPeerConnection(config);

    // Send ICE candidates to the host via signalling
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignallingMessage('ice_candidate', {
          candidate: event.candidate.toJSON(),
        });
      }
    };

    // Handle incoming media tracks
    pc.ontrack = (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      setRemoteStream(stream);
      onRemoteStreamRef.current?.(stream);
    };

    // Monitor ICE connection state for P2P timeout
    pc.oniceconnectionstatechange = () => {
      const iceState = pc.iceConnectionState;

      if (iceState === 'connected' || iceState === 'completed') {
        // Connection established
        clearTimers();
        isConnectedRef.current = true;

        // Determine connection type based on whether TURN was requested
        const connType = turnRequestedRef.current ? 'turn-relay' : 'peer-to-peer';
        setConnectionType(connType);
        setStatus('connected');
        onConnectedRef.current?.(connType);
      } else if (iceState === 'failed') {
        // ICE failed — if TURN wasn't tried yet, it'll be handled by P2P timeout
        if (turnRequestedRef.current) {
          // TURN was already tried and still failed
          handleError('connection_failed', 'WebRTC connection failed after TURN fallback');
          cleanup();
        }
      } else if (iceState === 'disconnected') {
        // Temporary disconnection — don't immediately fail
        if (isConnectedRef.current) {
          setStatus('reconnecting');
        }
      }
    };

    // Monitor overall connection state
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;

      if (state === 'connected') {
        clearTimers();
        isConnectedRef.current = true;
        const connType = turnRequestedRef.current ? 'turn-relay' : 'peer-to-peer';
        setConnectionType(connType);
        setStatus('connected');
        onConnectedRef.current?.(connType);
      } else if (state === 'failed') {
        if (!isConnectedRef.current) {
          handleError('connection_failed', 'WebRTC connection could not be established');
          cleanup();
        }
      } else if (state === 'closed') {
        if (isConnectedRef.current) {
          setStatus('disconnected');
        }
      }
    };

    pcRef.current = pc;
    setPeerConnection(pc);
    return pc;
  }, [sendSignallingMessage, clearTimers, handleError, cleanup]);

  // ── Signalling Message Handler ─────────────────────────────────────────────

  const handleSignallingMessage = useCallback(async (data: string) => {
    let message: { type?: string; sessionId?: string; payload?: Record<string, unknown>; error?: { code?: string; message?: string } };
    try {
      message = JSON.parse(data);
    } catch {
      return; // Ignore malformed messages
    }

    // Handle error messages from the broker
    if (message.error) {
      const errCode = (message.error.code || 'connection_failed') as RemoteDesktopErrorCode;
      handleError(errCode, message.error.message || 'Signalling error');
      cleanup();
      return;
    }

    const { type, payload } = message;
    if (!type || !payload) return;

    const pc = pcRef.current;

    switch (type) {
      case 'session_init': {
        // Signalling acknowledged our connection
        setStatus('waiting_for_host');
        break;
      }

      case 'sdp_offer': {
        // Received SDP offer from host — create answer
        if (!pc) break;
        setStatus('negotiating');

        try {
          const offer = new RTCSessionDescription({
            type: 'offer',
            sdp: payload.sdp as string,
          });
          await pc.setRemoteDescription(offer);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          sendSignallingMessage('sdp_answer', { sdp: answer.sdp });
        } catch (err) {
          handleError('signalling_timeout', `SDP negotiation failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
          cleanup();
        }
        break;
      }

      case 'ice_candidate': {
        // Received ICE candidate from host
        if (!pc) break;

        try {
          const candidate = new RTCIceCandidate(payload.candidate as RTCIceCandidateInit);
          await pc.addIceCandidate(candidate);
        } catch {
          // Non-fatal: some candidates may arrive for already-closed connections
        }
        break;
      }

      case 'turn_credentials': {
        // Broker is providing TURN credentials for relay fallback
        const turnCreds = payload as unknown as TurnCredentials;
        if (turnCreds && turnCreds.urls && pc) {
          turnRequestedRef.current = true;

          // Recreate peer connection with TURN servers included
          const currentRemoteDesc = pc.remoteDescription;
          const turnServers: ICEServer[] = [
            ...iceServers,
            {
              urls: turnCreds.urls,
              username: turnCreds.username,
              credential: turnCreds.credential,
              credentialType: 'password',
            },
          ];

          // Close old connection and create new one with TURN
          pc.onicecandidate = null;
          pc.ontrack = null;
          pc.oniceconnectionstatechange = null;
          pc.onconnectionstatechange = null;
          pc.close();

          const newPc = createPeerConnection(turnServers);

          // If we had a remote description, re-apply and answer
          if (currentRemoteDesc) {
            try {
              await newPc.setRemoteDescription(currentRemoteDesc);
              const answer = await newPc.createAnswer();
              await newPc.setLocalDescription(answer);
              sendSignallingMessage('sdp_answer', { sdp: answer.sdp });
            } catch {
              // Will be handled by connection timeout
            }
          }
        }
        break;
      }

      case 'session_end': {
        // Host or broker ended the session
        const reason = (payload.reason as string) || 'session_ended';
        setStatus('disconnected');
        clearTimers();
        onSessionEndRef.current?.(reason);
        cleanup();
        break;
      }

      case 'session_pause': {
        // Session temporarily paused (e.g., system dialog on host)
        // UI can react to this via status or a separate callback
        break;
      }

      case 'quality_change': {
        // Quality profile change notification — handled by useBandwidthMonitor
        break;
      }

      default:
        break;
    }
  }, [handleError, cleanup, sendSignallingMessage, createPeerConnection, iceServers, clearTimers]);

  // ── Connect ────────────────────────────────────────────────────────────────

  const connect = useCallback(() => {
    // Reset state for new connection
    cleanedUpRef.current = false;
    isConnectedRef.current = false;
    turnRequestedRef.current = false;
    setError(null);
    setRemoteStream(null);
    setConnectionType(null);
    setStatus('connecting');

    // Build WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const basePath = signallingUrl || DEFAULT_SIGNALLING_PATH;
    const wsUrl = `${protocol}//${host}${basePath}?token=${encodeURIComponent(sessionToken)}&role=viewer&sessionId=${encodeURIComponent(sessionId)}`;

    // Create WebSocket connection to signalling server
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      // Create the RTCPeerConnection once signalling is connected
      createPeerConnection(iceServers);

      // Start P2P timeout — if P2P doesn't connect in 10s, request TURN
      p2pTimeoutRef.current = setTimeout(() => {
        if (!isConnectedRef.current && !turnRequestedRef.current) {
          turnRequestedRef.current = true;
          sendSignallingMessage('quality_change', {
            request: 'turn_credentials',
            reason: 'p2p_timeout',
          });
        }
      }, P2P_TIMEOUT_MS);

      // Start overall connection timeout (30 seconds)
      connectionTimeoutRef.current = setTimeout(() => {
        if (!isConnectedRef.current) {
          handleError('signalling_timeout', 'Connection could not be established within 30 seconds');
          cleanup();
        }
      }, CONNECTION_TIMEOUT_MS);
    };

    ws.onmessage = (event) => {
      handleSignallingMessage(event.data as string);
    };

    ws.onclose = (event) => {
      // If we weren't already connected, this is a failure
      if (!isConnectedRef.current && !cleanedUpRef.current) {
        if (event.code === 4003) {
          handleError('invalid_token', 'Session token validation failed');
        } else if (event.code === 4029) {
          handleError('signalling_timeout', 'Maximum concurrent sessions reached');
        } else {
          handleError('host_unreachable', 'Signalling connection closed unexpectedly');
        }
        cleanup();
      }
    };

    ws.onerror = () => {
      if (!isConnectedRef.current && !cleanedUpRef.current) {
        handleError('host_unreachable', 'Failed to connect to signalling server');
        cleanup();
      }
    };
  }, [
    sessionId,
    sessionToken,
    signallingUrl,
    iceServers,
    createPeerConnection,
    sendSignallingMessage,
    handleSignallingMessage,
    handleError,
    cleanup,
  ]);

  // ── Disconnect ─────────────────────────────────────────────────────────────

  const disconnect = useCallback(() => {
    setStatus('disconnected');
    cleanup();
  }, [cleanup]);

  // ── Reconnect ──────────────────────────────────────────────────────────────

  const reconnect = useCallback(() => {
    // Clean up existing connection first
    cleanedUpRef.current = false;
    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.ontrack = null;
      pcRef.current.oniceconnectionstatechange = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
      setPeerConnection(null);
    }
    if (wsRef.current) {
      wsRef.current.onmessage = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close(1000, 'Reconnecting');
      }
      wsRef.current = null;
    }
    clearTimers();
    isConnectedRef.current = false;
    turnRequestedRef.current = false;

    // Reconnect
    setStatus('reconnecting');
    connect();
  }, [connect, clearTimers]);

  // ── Cleanup on Unmount ─────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      clearTimers();
      if (pcRef.current) {
        pcRef.current.onicecandidate = null;
        pcRef.current.ontrack = null;
        pcRef.current.oniceconnectionstatechange = null;
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.close();
        pcRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onmessage = null;
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.close(1000, 'Component unmounted');
        }
        wsRef.current = null;
      }
    };
  }, [clearTimers]);

  // ── Return ─────────────────────────────────────────────────────────────────

  return {
    status,
    error,
    remoteStream,
    peerConnection,
    connectionType,
    connect,
    disconnect,
    reconnect,
  };
}

export default useWebRTCSession;
