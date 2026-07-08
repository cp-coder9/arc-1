/**
 * Remote Desktop Core — WebSocket Signalling Relay
 *
 * Implements the signalling server for WebRTC session establishment.
 * The broker acts as a signalling-only relay — it never relays media streams.
 *
 * - Accepts WebSocket connections at /api/remote-desktop/signal
 * - Validates session tokens on connect
 * - Pairs host and viewer connections by sessionId
 * - Relays SDP offer/answer and ICE candidates between paired peers
 * - Enforces 30-second connection timeout
 * - Supports minimum 50 concurrent signalling sessions with ≤2s round-trip latency
 *
 * Requirements: 4.1, 4.2, 4.5, 4.7, 4.8
 */

import { EventEmitter } from 'node:events';
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { validateToken } from './tokenEngine';
import type { RemoteDesktopErrorCode } from './types';

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

export interface SessionConnection {
  hostWs: WebSocket | null;
  viewerWs: WebSocket | null;
  sessionId: string;
  hostId: string;
  consumerUid: string;
  createdAt: number;
  connectionTimeoutTimer: ReturnType<typeof setTimeout> | null;
  established: boolean;
}

export type PeerRole = 'host' | 'viewer';

/** Fields that must never appear in relayed messages (credential safety). */
const BLOCKED_PAYLOAD_FIELDS = [
  'windowsLogin',
  'windowsPassword',
  'rdpPassword',
  'hostIp',
  'hostIpAddress',
  'ipAddress',
  'rdpCredentials',
  'credentials',
];

// ─── Configuration ──────────────────────────────────────────────────────────────

const CONNECTION_TIMEOUT_MS = 30_000; // 30 seconds
const MAX_CONCURRENT_SESSIONS = 50;

// ─── Signalling Service ─────────────────────────────────────────────────────────

export class SignallingService extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private sessions: Map<string, SessionConnection> = new Map();

  /** Get number of active signalling sessions */
  get activeSessionCount(): number {
    return this.sessions.size;
  }

  /** Get a copy of sessions map (for testing) */
  getSession(sessionId: string): SessionConnection | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Attach the signalling WebSocket server to an existing HTTP server.
   * Listens for upgrade requests at /api/remote-desktop/signal.
   */
  attach(server: HttpServer): void {
    this.wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (request: IncomingMessage, socket, head) => {
      const url = new URL(request.url || '', `http://${request.headers.host}`);
      if (url.pathname !== '/api/remote-desktop/signal') {
        // Not our upgrade — let other handlers deal with it
        return;
      }

      this.wss!.handleUpgrade(request, socket, head, (ws) => {
        this.handleConnection(ws, request, url);
      });
    });
  }

  /**
   * Handle a new WebSocket connection.
   * Validates the token from query params and registers the peer.
   */
  private handleConnection(ws: WebSocket, request: IncomingMessage, url: URL): void {
    const token = url.searchParams.get('token');
    const role = url.searchParams.get('role') as PeerRole | null;
    const sessionId = url.searchParams.get('sessionId');

    // Validate required parameters
    if (!token || !role || !sessionId) {
      this.sendError(ws, {
        code: 'invalid_token',
        message: 'Missing required connection parameters: token, role, sessionId',
      });
      ws.close(4001, 'Missing parameters');
      return;
    }

    if (role !== 'host' && role !== 'viewer') {
      this.sendError(ws, {
        code: 'invalid_token',
        message: 'Invalid role. Must be "host" or "viewer".',
      });
      ws.close(4001, 'Invalid role');
      return;
    }

    // Validate token
    // For token validation we need consumerUid and hostId from the token itself.
    // We parse the token to extract the payload first, then validate fully.
    const tokenValidation = this.validateConnectionToken(token, role, sessionId);
    if (!tokenValidation.valid) {
      this.sendError(ws, {
        code: tokenValidation.errorCode || 'invalid_token',
        message: tokenValidation.errorMessage || 'Token validation failed',
      });
      ws.close(4003, 'Token validation failed');
      return;
    }

    const { consumerUid, hostId } = tokenValidation;

    // Check concurrent session limit
    if (!this.sessions.has(sessionId) && this.sessions.size >= MAX_CONCURRENT_SESSIONS) {
      this.sendError(ws, {
        code: 'signalling_timeout',
        message: 'Maximum concurrent signalling sessions reached',
      });
      ws.close(4029, 'Too many sessions');
      return;
    }

    // Register the connection
    this.registerPeer(ws, sessionId, role, hostId!, consumerUid!);

    // Handle messages
    ws.on('message', (data) => {
      this.handleMessage(ws, sessionId, role, data);
    });

    // Handle close
    ws.on('close', () => {
      this.handleDisconnect(sessionId, role);
    });

    ws.on('error', () => {
      this.handleDisconnect(sessionId, role);
    });
  }

  /**
   * Validate the session token for WebSocket connection.
   * Returns validation result with extracted identity fields.
   */
  private validateConnectionToken(
    token: string,
    role: PeerRole,
    sessionId: string,
  ): {
    valid: boolean;
    consumerUid?: string;
    hostId?: string;
    errorCode?: RemoteDesktopErrorCode;
    errorMessage?: string;
  } {
    // Decode the token payload to extract consumerUid and hostId
    // Token format: base64url(payload).base64url(signature)
    const parts = token.split('.');
    if (parts.length !== 2) {
      return { valid: false, errorCode: 'invalid_token', errorMessage: 'Malformed token format' };
    }

    let payload: { cid?: string; hid?: string; bid?: string };
    try {
      const payloadJson = Buffer.from(
        parts[0].replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (parts[0].length % 4)) % 4),
        'base64',
      ).toString('utf-8');
      payload = JSON.parse(payloadJson);
    } catch {
      return { valid: false, errorCode: 'invalid_token', errorMessage: 'Failed to decode token' };
    }

    if (!payload.cid || !payload.hid) {
      return { valid: false, errorCode: 'invalid_token', errorMessage: 'Token missing required fields' };
    }

    // Full token validation
    const result = validateToken({
      token,
      consumerUid: payload.cid,
      hostId: payload.hid,
    });

    if (!result.valid) {
      return {
        valid: false,
        errorCode: result.error?.code || 'invalid_token',
        errorMessage: result.error?.message || 'Token validation failed',
      };
    }

    return {
      valid: true,
      consumerUid: payload.cid,
      hostId: payload.hid,
    };
  }

  /**
   * Register a peer (host or viewer) for a signalling session.
   * Starts the connection timeout if both peers aren't connected yet.
   */
  private registerPeer(
    ws: WebSocket,
    sessionId: string,
    role: PeerRole,
    hostId: string,
    consumerUid: string,
  ): void {
    let session = this.sessions.get(sessionId);

    if (!session) {
      session = {
        hostWs: null,
        viewerWs: null,
        sessionId,
        hostId,
        consumerUid,
        createdAt: Date.now(),
        connectionTimeoutTimer: null,
        established: false,
      };
      this.sessions.set(sessionId, session);
    }

    if (role === 'host') {
      // Close existing host connection if any
      if (session.hostWs && session.hostWs.readyState === WebSocket.OPEN) {
        session.hostWs.close(4000, 'Replaced by new connection');
      }
      session.hostWs = ws;
    } else {
      // Close existing viewer connection if any
      if (session.viewerWs && session.viewerWs.readyState === WebSocket.OPEN) {
        session.viewerWs.close(4000, 'Replaced by new connection');
      }
      session.viewerWs = ws;
    }

    // Start or reset connection timeout
    this.startConnectionTimeout(sessionId);

    // Notify if both peers are now connected
    if (session.hostWs && session.viewerWs) {
      this.emit('peers_paired', { sessionId, hostId, consumerUid });
    }

    // Send acknowledgement to the connected peer
    this.sendMessage(ws, {
      type: 'session_init',
      sessionId,
      payload: { status: 'connected', role, peered: !!(session.hostWs && session.viewerWs) },
    });
  }

  /**
   * Start or reset the 30-second connection timeout for a session.
   * If both peers don't complete the WebRTC exchange within 30 seconds,
   * the session is terminated with a signalling_timeout error.
   */
  private startConnectionTimeout(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Clear existing timer
    if (session.connectionTimeoutTimer) {
      clearTimeout(session.connectionTimeoutTimer);
    }

    // Don't timeout if already established
    if (session.established) return;

    session.connectionTimeoutTimer = setTimeout(() => {
      const currentSession = this.sessions.get(sessionId);
      if (currentSession && !currentSession.established) {
        this.terminateSession(sessionId, 'signalling_timeout', 'Connection not established within 30 seconds');
      }
    }, CONNECTION_TIMEOUT_MS);
  }

  /**
   * Handle an incoming message from a peer.
   * Validates the message format and relays it to the paired peer.
   */
  private handleMessage(ws: WebSocket, sessionId: string, senderRole: PeerRole, rawData: unknown): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.sendError(ws, {
        code: 'signalling_timeout',
        message: 'Session not found',
      });
      return;
    }

    let message: SignallingMessage;
    try {
      const data = typeof rawData === 'string' ? rawData : rawData?.toString() || '';
      message = JSON.parse(data) as SignallingMessage;
    } catch {
      this.sendError(ws, {
        code: 'invalid_token',
        message: 'Invalid message format: expected JSON',
      });
      return;
    }

    // Validate message structure
    if (!message.type || !message.sessionId || !message.payload) {
      this.sendError(ws, {
        code: 'invalid_token',
        message: 'Invalid message: missing required fields (type, sessionId, payload)',
      });
      return;
    }

    // Validate message type
    const validTypes: SignallingMessageType[] = [
      'session_init', 'sdp_offer', 'sdp_answer',
      'ice_candidate', 'session_end', 'session_pause', 'quality_change',
    ];
    if (!validTypes.includes(message.type)) {
      this.sendError(ws, {
        code: 'invalid_token',
        message: `Invalid message type: ${message.type}`,
      });
      return;
    }

    // Ensure sessionId matches
    if (message.sessionId !== sessionId) {
      this.sendError(ws, {
        code: 'token_scope_violation',
        message: 'Message sessionId does not match connection sessionId',
      });
      return;
    }

    // Security: strip any credential fields from payload
    const sanitizedPayload = this.sanitizePayload(message.payload);

    // Handle session_end
    if (message.type === 'session_end') {
      this.terminateSession(sessionId, undefined, 'Session ended by peer');
      return;
    }

    // Mark as established when SDP answer is received (connection complete)
    if (message.type === 'sdp_answer') {
      session.established = true;
      if (session.connectionTimeoutTimer) {
        clearTimeout(session.connectionTimeoutTimer);
        session.connectionTimeoutTimer = null;
      }
      this.emit('connection_established', { sessionId });
    }

    // Relay to the paired peer
    const targetWs = senderRole === 'host' ? session.viewerWs : session.hostWs;
    if (!targetWs || targetWs.readyState !== WebSocket.OPEN) {
      // Peer not connected yet — determine the appropriate error
      if (senderRole === 'viewer' && !session.hostWs) {
        this.sendError(ws, {
          code: 'host_unreachable',
          message: 'Host is not connected to signalling',
        });
      }
      return;
    }

    // Relay the sanitized message
    const relayMessage: SignallingMessage = {
      type: message.type,
      sessionId: message.sessionId,
      payload: sanitizedPayload,
    };

    this.sendMessage(targetWs, relayMessage);
  }

  /**
   * Sanitize a message payload by removing any fields that could contain
   * host credentials (Windows login, IP address, RDP passwords).
   *
   * Property 5: Signalling messages never contain host credentials.
   */
  private sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(payload)) {
      const lowerKey = key.toLowerCase();
      if (BLOCKED_PAYLOAD_FIELDS.some(blocked => lowerKey.includes(blocked.toLowerCase()))) {
        continue; // Skip blocked fields
      }

      // Recursively sanitize nested objects
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        sanitized[key] = this.sanitizePayload(value as Record<string, unknown>);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Handle a peer disconnecting from the signalling session.
   */
  private handleDisconnect(sessionId: string, role: PeerRole): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (role === 'host') {
      session.hostWs = null;
    } else {
      session.viewerWs = null;
    }

    // Notify the other peer
    const otherWs = role === 'host' ? session.viewerWs : session.hostWs;
    if (otherWs && otherWs.readyState === WebSocket.OPEN) {
      this.sendMessage(otherWs, {
        type: 'session_end',
        sessionId,
        payload: { reason: `${role}_disconnected` },
      });
    }

    // Clean up if both peers are gone
    if (!session.hostWs && !session.viewerWs) {
      this.cleanupSession(sessionId);
    }

    this.emit('peer_disconnected', { sessionId, role });
  }

  /**
   * Terminate a signalling session with an error code.
   */
  terminateSession(
    sessionId: string,
    errorCode?: RemoteDesktopErrorCode,
    message?: string,
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const errorPayload: SignallingMessage = {
      type: 'session_end',
      sessionId,
      payload: {
        reason: errorCode || 'session_terminated',
        message: message || 'Session terminated',
      },
    };

    // Notify both peers
    if (session.hostWs && session.hostWs.readyState === WebSocket.OPEN) {
      this.sendMessage(session.hostWs, errorPayload);
      session.hostWs.close(4000, message || 'Session terminated');
    }

    if (session.viewerWs && session.viewerWs.readyState === WebSocket.OPEN) {
      this.sendMessage(session.viewerWs, errorPayload);
      session.viewerWs.close(4000, message || 'Session terminated');
    }

    this.cleanupSession(sessionId);

    this.emit('session_terminated', { sessionId, errorCode, message });
  }

  /**
   * Clean up session resources.
   */
  private cleanupSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (session.connectionTimeoutTimer) {
      clearTimeout(session.connectionTimeoutTimer);
      session.connectionTimeoutTimer = null;
    }

    this.sessions.delete(sessionId);
  }

  /**
   * Send a signalling message to a WebSocket.
   */
  private sendMessage(ws: WebSocket, message: SignallingMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Send an error message to a WebSocket.
   */
  private sendError(ws: WebSocket, error: SignallingError): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ error }));
    }
  }

  /**
   * Shut down the signalling service and clean up all sessions.
   */
  shutdown(): void {
    // Terminate all active sessions
    for (const sessionId of this.sessions.keys()) {
      this.terminateSession(sessionId, undefined, 'Server shutting down');
    }

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }
}

// ─── Singleton Instance ─────────────────────────────────────────────────────────

export const signallingService = new SignallingService();

// ─── Factory for Testing ────────────────────────────────────────────────────────

export function createSignallingService(): SignallingService {
  return new SignallingService();
}
