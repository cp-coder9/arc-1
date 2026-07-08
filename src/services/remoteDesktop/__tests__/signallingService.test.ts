/**
 * Signalling Service — Unit Tests
 *
 * Tests for the WebSocket signalling relay that brokers
 * WebRTC connection establishment between host and viewer peers.
 *
 * Requirements: 4.1, 4.2, 4.5, 4.7, 4.8
 *

 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, Server as HttpServer } from 'node:http';
import { WebSocket } from 'ws';
import { createSignallingService, SignallingService } from '../signallingService';
import { generateToken, type GenerateTokenInput } from '../tokenEngine';

// ─── Test Helpers ───────────────────────────────────────────────────────────────

let server: HttpServer;
let service: SignallingService;
let port: number;

function createValidTokenInput(): GenerateTokenInput {
  const now = Date.now();
  return {
    bookingId: 'booking-test-123',
    consumerUid: 'consumer-test-abc',
    hostId: 'host-test-xyz',
    windowStart: now - 5 * 60_000,
    windowEnd: now + 55 * 60_000,
    gracePeriodSeconds: 300,
  };
}

function getBaseUrl(): string {
  return `ws://127.0.0.1:${port}/api/remote-desktop/signal`;
}

/**
 * Connect a peer and collect the initial session_init message.
 * Returns both the WebSocket and the first message received.
 */
function connectPeer(
  token: string,
  role: 'host' | 'viewer',
  sessionId: string,
): Promise<{ ws: WebSocket; initMsg: any }> {
  return new Promise((resolve, reject) => {
    const url = `${getBaseUrl()}?token=${encodeURIComponent(token)}&role=${role}&sessionId=${sessionId}`;
    const ws = new WebSocket(url);
    const messages: any[] = [];

    ws.on('message', (data) => {
      messages.push(JSON.parse(data.toString()));
      // Resolve on first message (session_init)
      if (messages.length === 1) {
        resolve({ ws, initMsg: messages[0] });
      }
    });

    ws.on('error', (err) => reject(err));
    ws.on('close', (code, reason) => {
      if (messages.length === 0) {
        reject(new Error(`Closed before message: ${code} ${reason}`));
      }
    });
  });
}

function waitForMessage(ws: WebSocket, timeoutMs = 3000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for message')), timeoutMs);
    ws.once('message', (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString()));
    });
  });
}

function waitForClose(ws: WebSocket, timeoutMs = 3000): Promise<{ code: number; reason: string }> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.CLOSED) {
      resolve({ code: 0, reason: 'already closed' });
      return;
    }
    const timer = setTimeout(() => reject(new Error('Timeout waiting for close')), timeoutMs);
    ws.once('close', (code, reason) => {
      clearTimeout(timer);
      resolve({ code, reason: reason.toString() });
    });
  });
}

function connectRaw(urlSuffix: string): WebSocket {
  return new WebSocket(`${getBaseUrl()}${urlSuffix}`);
}

// ─── Setup / Teardown ───────────────────────────────────────────────────────────

beforeEach(async () => {
  service = createSignallingService();
  server = createServer();
  service.attach(server);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve();
    });
  });
});

afterEach(async () => {
  service.shutdown();
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

// ─── Connection and Authentication ──────────────────────────────────────────────

describe('WebSocket Connection', () => {
  it('should reject connection without token', async () => {
    const ws = connectRaw('?role=host&sessionId=test-session');
    const closeResult = await waitForClose(ws);
    expect(closeResult.code).toBe(4001);
  });

  it('should reject connection without role', async () => {
    const input = createValidTokenInput();
    const { token } = generateToken(input);
    const ws = connectRaw(`?token=${encodeURIComponent(token)}&sessionId=test-session`);
    const closeResult = await waitForClose(ws);
    expect(closeResult.code).toBe(4001);
  });

  it('should reject connection without sessionId', async () => {
    const input = createValidTokenInput();
    const { token } = generateToken(input);
    const ws = connectRaw(`?token=${encodeURIComponent(token)}&role=host`);
    const closeResult = await waitForClose(ws);
    expect(closeResult.code).toBe(4001);
  });

  it('should reject connection with invalid role', async () => {
    const input = createValidTokenInput();
    const { token } = generateToken(input);
    const ws = connectRaw(`?token=${encodeURIComponent(token)}&role=admin&sessionId=test`);
    const closeResult = await waitForClose(ws);
    expect(closeResult.code).toBe(4001);
  });

  it('should reject connection with invalid token', async () => {
    const ws = connectRaw('?token=invalid.token&role=host&sessionId=test');
    const closeResult = await waitForClose(ws);
    expect(closeResult.code).toBe(4003);
  });

  it('should accept valid host connection and send session_init', async () => {
    const input = createValidTokenInput();
    const { token } = generateToken(input);

    const { ws, initMsg } = await connectPeer(token, 'host', 'session-001');

    expect(initMsg.type).toBe('session_init');
    expect(initMsg.sessionId).toBe('session-001');
    expect(initMsg.payload.status).toBe('connected');
    expect(initMsg.payload.role).toBe('host');
    expect(initMsg.payload.peered).toBe(false);

    ws.close();
  });

  it('should accept valid viewer connection', async () => {
    const input = createValidTokenInput();
    const { token } = generateToken(input);

    const { ws, initMsg } = await connectPeer(token, 'viewer', 'session-002');

    expect(initMsg.type).toBe('session_init');
    expect(initMsg.payload.role).toBe('viewer');

    ws.close();
  });

  it('should indicate peered=true when both peers connect', async () => {
    const input = createValidTokenInput();
    const { token } = generateToken(input);
    const sessionId = 'session-003';

    const { ws: hostWs } = await connectPeer(token, 'host', sessionId);
    const { ws: viewerWs, initMsg } = await connectPeer(token, 'viewer', sessionId);

    expect(initMsg.payload.peered).toBe(true);

    hostWs.close();
    viewerWs.close();
  });
});

// ─── Message Relay ──────────────────────────────────────────────────────────────

describe('Message Relay', () => {
  it('should relay sdp_offer from host to viewer', async () => {
    const input = createValidTokenInput();
    const { token } = generateToken(input);
    const sessionId = 'session-relay-1';

    const { ws: hostWs } = await connectPeer(token, 'host', sessionId);
    const { ws: viewerWs } = await connectPeer(token, 'viewer', sessionId);

    // Host sends SDP offer
    const sdpOffer = {
      type: 'sdp_offer',
      sessionId,
      payload: { sdp: 'v=0\r\no=- 123 IN IP4 0.0.0.0\r\n...' },
    };
    hostWs.send(JSON.stringify(sdpOffer));

    const relayed = await waitForMessage(viewerWs);
    expect(relayed.type).toBe('sdp_offer');
    expect(relayed.sessionId).toBe(sessionId);
    expect(relayed.payload.sdp).toBe(sdpOffer.payload.sdp);

    hostWs.close();
    viewerWs.close();
  });

  it('should relay sdp_answer from viewer to host', async () => {
    const input = createValidTokenInput();
    const { token } = generateToken(input);
    const sessionId = 'session-relay-2';

    const { ws: hostWs } = await connectPeer(token, 'host', sessionId);
    const { ws: viewerWs } = await connectPeer(token, 'viewer', sessionId);

    const sdpAnswer = {
      type: 'sdp_answer',
      sessionId,
      payload: { sdp: 'v=0\r\no=- 456 IN IP4 0.0.0.0\r\n...' },
    };
    viewerWs.send(JSON.stringify(sdpAnswer));

    const relayed = await waitForMessage(hostWs);
    expect(relayed.type).toBe('sdp_answer');
    expect(relayed.payload.sdp).toBe(sdpAnswer.payload.sdp);

    hostWs.close();
    viewerWs.close();
  });

  it('should relay ice_candidate between peers', async () => {
    const input = createValidTokenInput();
    const { token } = generateToken(input);
    const sessionId = 'session-relay-3';

    const { ws: hostWs } = await connectPeer(token, 'host', sessionId);
    const { ws: viewerWs } = await connectPeer(token, 'viewer', sessionId);

    const iceCandidate = {
      type: 'ice_candidate',
      sessionId,
      payload: { candidate: 'candidate:123 1 udp 2130706431 10.0.0.1 9 typ host' },
    };
    hostWs.send(JSON.stringify(iceCandidate));

    const relayed = await waitForMessage(viewerWs);
    expect(relayed.type).toBe('ice_candidate');
    expect(relayed.payload.candidate).toBe(iceCandidate.payload.candidate);

    hostWs.close();
    viewerWs.close();
  });

  it('should reject messages with mismatched sessionId', async () => {
    const input = createValidTokenInput();
    const { token } = generateToken(input);
    const sessionId = 'session-relay-4';

    const { ws: hostWs } = await connectPeer(token, 'host', sessionId);

    hostWs.send(JSON.stringify({
      type: 'sdp_offer',
      sessionId: 'wrong-session',
      payload: { sdp: 'test' },
    }));

    const errorMsg = await waitForMessage(hostWs);
    expect(errorMsg.error).toBeDefined();
    expect(errorMsg.error.code).toBe('token_scope_violation');

    hostWs.close();
  });

  it('should reject invalid JSON messages', async () => {
    const input = createValidTokenInput();
    const { token } = generateToken(input);
    const sessionId = 'session-relay-5';

    const { ws: hostWs } = await connectPeer(token, 'host', sessionId);

    hostWs.send('not valid json {{{}}}');

    const errorMsg = await waitForMessage(hostWs);
    expect(errorMsg.error).toBeDefined();
    expect(errorMsg.error.message).toContain('Invalid message format');

    hostWs.close();
  });

  it('should reject messages with invalid type', async () => {
    const input = createValidTokenInput();
    const { token } = generateToken(input);
    const sessionId = 'session-relay-6';

    const { ws: hostWs } = await connectPeer(token, 'host', sessionId);

    hostWs.send(JSON.stringify({
      type: 'invalid_type',
      sessionId,
      payload: {},
    }));

    const errorMsg = await waitForMessage(hostWs);
    expect(errorMsg.error).toBeDefined();
    expect(errorMsg.error.message).toContain('Invalid message type');

    hostWs.close();
  });
});

// ─── Credential Safety (Property 5) ─────────────────────────────────────────────

describe('Credential Safety', () => {
  it('should strip host credentials from relayed messages', async () => {
    const input = createValidTokenInput();
    const { token } = generateToken(input);
    const sessionId = 'session-cred-1';

    const { ws: hostWs } = await connectPeer(token, 'host', sessionId);
    const { ws: viewerWs } = await connectPeer(token, 'viewer', sessionId);

    // Host sends message with credential fields that should be stripped
    hostWs.send(JSON.stringify({
      type: 'sdp_offer',
      sessionId,
      payload: {
        sdp: 'v=0\r\n...',
        windowsLogin: 'admin',
        windowsPassword: 'secret123',
        hostIpAddress: '192.168.1.100',
        rdpPassword: 'rdp-secret',
      },
    }));

    const relayed = await waitForMessage(viewerWs);
    expect(relayed.payload.sdp).toBe('v=0\r\n...');
    expect(relayed.payload.windowsLogin).toBeUndefined();
    expect(relayed.payload.windowsPassword).toBeUndefined();
    expect(relayed.payload.hostIpAddress).toBeUndefined();
    expect(relayed.payload.rdpPassword).toBeUndefined();

    hostWs.close();
    viewerWs.close();
  });

  it('should strip nested credential fields', async () => {
    const input = createValidTokenInput();
    const { token } = generateToken(input);
    const sessionId = 'session-cred-2';

    const { ws: hostWs } = await connectPeer(token, 'host', sessionId);
    const { ws: viewerWs } = await connectPeer(token, 'viewer', sessionId);

    hostWs.send(JSON.stringify({
      type: 'ice_candidate',
      sessionId,
      payload: {
        candidate: 'candidate:1 ...',
        metadata: {
          hostIp: '10.0.0.1',
          validField: 'keep-this',
        },
      },
    }));

    const relayed = await waitForMessage(viewerWs);
    expect(relayed.payload.candidate).toBe('candidate:1 ...');
    expect(relayed.payload.metadata.hostIp).toBeUndefined();
    expect(relayed.payload.metadata.validField).toBe('keep-this');

    hostWs.close();
    viewerWs.close();
  });
});

// ─── Connection Timeout ─────────────────────────────────────────────────────────

describe('Connection Timeout', () => {
  it('should terminate session via terminateSession with signalling_timeout', async () => {
    const input = createValidTokenInput();
    const { token } = generateToken(input);
    const sessionId = 'session-timeout-1';

    const { ws: hostWs } = await connectPeer(token, 'host', sessionId);

    // Verify session exists and is not established
    const session = service.getSession(sessionId);
    expect(session).toBeDefined();
    expect(session!.established).toBe(false);

    // Manually trigger terminateSession (simulates what the timer does)
    const closePromise = waitForClose(hostWs, 5000);
    service.terminateSession(sessionId, 'signalling_timeout', 'Connection not established within 30 seconds');

    const closeResult = await closePromise;
    expect(closeResult.code).toBe(4000);
    expect(service.activeSessionCount).toBe(0);
  });

  it('should mark session as established after sdp_answer', async () => {
    const input = createValidTokenInput();
    const { token } = generateToken(input);
    const sessionId = 'session-timeout-2';

    const { ws: hostWs } = await connectPeer(token, 'host', sessionId);
    const { ws: viewerWs } = await connectPeer(token, 'viewer', sessionId);

    // Before sdp_answer
    let session = service.getSession(sessionId);
    expect(session!.established).toBe(false);

    // Viewer sends sdp_answer (marks session as established)
    viewerWs.send(JSON.stringify({
      type: 'sdp_answer',
      sessionId,
      payload: { sdp: 'answer-sdp' },
    }));

    // Wait for the relay
    await waitForMessage(hostWs);

    // After sdp_answer — session should be established
    session = service.getSession(sessionId);
    expect(session!.established).toBe(true);

    hostWs.close();
    viewerWs.close();
  });
});

// ─── Session Management ─────────────────────────────────────────────────────────

describe('Session Management', () => {
  it('should track active session count', async () => {
    const input = createValidTokenInput();
    const { token } = generateToken(input);

    expect(service.activeSessionCount).toBe(0);

    const { ws: ws1 } = await connectPeer(token, 'host', 'session-count-1');
    expect(service.activeSessionCount).toBe(1);

    const { ws: ws2 } = await connectPeer(token, 'host', 'session-count-2');
    expect(service.activeSessionCount).toBe(2);

    ws1.close();
    ws2.close();
    await new Promise((r) => setTimeout(r, 100));
  });

  it('should notify viewer when host disconnects', async () => {
    const input = createValidTokenInput();
    const { token } = generateToken(input);
    const sessionId = 'session-disconnect-1';

    const { ws: hostWs } = await connectPeer(token, 'host', sessionId);
    const { ws: viewerWs } = await connectPeer(token, 'viewer', sessionId);

    // Host disconnects
    hostWs.close();

    const notification = await waitForMessage(viewerWs);
    expect(notification.type).toBe('session_end');
    expect(notification.payload.reason).toBe('host_disconnected');

    viewerWs.close();
  });

  it('should notify host when viewer disconnects', async () => {
    const input = createValidTokenInput();
    const { token } = generateToken(input);
    const sessionId = 'session-disconnect-2';

    const { ws: hostWs } = await connectPeer(token, 'host', sessionId);
    const { ws: viewerWs } = await connectPeer(token, 'viewer', sessionId);

    // Viewer disconnects
    viewerWs.close();

    const notification = await waitForMessage(hostWs);
    expect(notification.type).toBe('session_end');
    expect(notification.payload.reason).toBe('viewer_disconnected');

    hostWs.close();
  });

  it('should clean up session when both peers disconnect', async () => {
    const input = createValidTokenInput();
    const { token } = generateToken(input);
    const sessionId = 'session-cleanup-1';

    const { ws: hostWs } = await connectPeer(token, 'host', sessionId);
    const { ws: viewerWs } = await connectPeer(token, 'viewer', sessionId);

    expect(service.activeSessionCount).toBe(1);

    hostWs.close();
    viewerWs.close();

    await new Promise((r) => setTimeout(r, 150));
    expect(service.activeSessionCount).toBe(0);
  });

  it('should handle session_end message to terminate session', async () => {
    const input = createValidTokenInput();
    const { token } = generateToken(input);
    const sessionId = 'session-end-1';

    const { ws: hostWs } = await connectPeer(token, 'host', sessionId);
    const { ws: viewerWs } = await connectPeer(token, 'viewer', sessionId);

    // Viewer sends session_end
    const hostClosePromise = waitForClose(hostWs);
    const viewerClosePromise = waitForClose(viewerWs);

    viewerWs.send(JSON.stringify({
      type: 'session_end',
      sessionId,
      payload: { reason: 'user_disconnect' },
    }));

    // Host should receive close with code 4000
    const hostClose = await hostClosePromise;
    expect(hostClose.code).toBe(4000);

    // Viewer also gets closed (code may vary — server closes it)
    const viewerClose = await viewerClosePromise;
    expect([4000, 1000, 0]).toContain(viewerClose.code);

    // Session should be cleaned up
    await new Promise((r) => setTimeout(r, 50));
    expect(service.activeSessionCount).toBe(0);
  });
});

// ─── Signalling-Only Relay (Req 4.2) ────────────────────────────────────────────

describe('Signalling-Only Relay', () => {
  it('should relay all valid signalling message types', async () => {
    const input = createValidTokenInput();
    const { token } = generateToken(input);
    const sessionId = 'session-relay-only-1';

    const { ws: hostWs } = await connectPeer(token, 'host', sessionId);
    const { ws: viewerWs } = await connectPeer(token, 'viewer', sessionId);

    const signallingTypes = ['sdp_offer', 'ice_candidate', 'session_pause', 'quality_change'] as const;

    for (const type of signallingTypes) {
      hostWs.send(JSON.stringify({
        type,
        sessionId,
        payload: { data: `test-${type}` },
      }));

      const relayed = await waitForMessage(viewerWs);
      expect(relayed.type).toBe(type);
      expect(relayed.payload.data).toBe(`test-${type}`);
    }

    hostWs.close();
    viewerWs.close();
  });
});

// ─── Error Codes (Req 4.5) ──────────────────────────────────────────────────────

describe('Error Codes', () => {
  it('should return host_unreachable when host is not connected', async () => {
    const input = createValidTokenInput();
    const { token } = generateToken(input);
    const sessionId = 'session-error-1';

    // Only viewer connects (no host)
    const { ws: viewerWs } = await connectPeer(token, 'viewer', sessionId);

    // Viewer tries to send message to non-existent host
    viewerWs.send(JSON.stringify({
      type: 'sdp_answer',
      sessionId,
      payload: { sdp: 'answer' },
    }));

    const errorMsg = await waitForMessage(viewerWs);
    expect(errorMsg.error).toBeDefined();
    expect(errorMsg.error.code).toBe('host_unreachable');

    viewerWs.close();
  });
});
