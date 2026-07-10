/**
 * Host Agent — Encoder Service Tests
 *
 * Tests for the EncoderService class covering:
 * - Constructor configuration and validation
 * - Encoding profile management (set/get)
 * - WebRTC peer connection creation and management
 * - Video track addition and bitrate configuration
 * - Adaptive bitrate updates (1–8 Mbps range, starting at 4 Mbps)
 * - Frame encoding stats tracking (FPS, latency, frames)
 * - Connection state tracking
 * - Resource cleanup on close
 *
 * Requirements: 5.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  EncoderService,
  ENCODING_PROFILES,
  getEncodingProfile,
  type EncoderConfig,
  type PeerConnectionFactory,
  type MediaStreamFactory,
  type RTCPeerConnectionLike,
  type RTCSenderLike,
  type RTCSenderParameters,
  type MediaStreamLike,
  type MediaStreamTrackLike,
  type RTCIceServerConfig,
  type EncodingProfile,
} from '../encoderService';

// ─── Mock Factories ─────────────────────────────────────────────────────────────

function createMockTrack(id = 'track-1', kind = 'video'): MediaStreamTrackLike {
  return { id, kind, enabled: true, stop: vi.fn() };
}

function createMockStream(videoTracks?: MediaStreamTrackLike[]): MediaStreamLike {
  const tracks = videoTracks ?? [createMockTrack()];
  return {
    id: 'stream-1',
    getVideoTracks: () => tracks,
    getAudioTracks: () => [],
  };
}

function createMockSender(overrides?: Partial<RTCSenderLike>): RTCSenderLike {
  const params: RTCSenderParameters = { encodings: [{}] };
  return {
    track: createMockTrack(),
    getParameters: vi.fn(() => ({ ...params, encodings: [...params.encodings] })),
    setParameters: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

function createMockPeerConnection(
  overrides?: Partial<RTCPeerConnectionLike>,
): RTCPeerConnectionLike {
  const sender = createMockSender();
  return {
    connectionState: 'new',
    addTrack: vi.fn(() => sender),
    createOffer: vi.fn(() => Promise.resolve({ type: 'offer', sdp: 'mock-sdp' })),
    createAnswer: vi.fn(() => Promise.resolve({ type: 'answer', sdp: 'mock-sdp' })),
    setLocalDescription: vi.fn(() => Promise.resolve()),
    setRemoteDescription: vi.fn(() => Promise.resolve()),
    addIceCandidate: vi.fn(() => Promise.resolve()),
    getSenders: vi.fn(() => [sender]),
    getStats: vi.fn(() => Promise.resolve(new Map())),
    close: vi.fn(),
    onicecandidate: null,
    onconnectionstatechange: null,
    ...overrides,
  };
}

function createMockPeerConnectionFactory(
  pc?: RTCPeerConnectionLike,
): PeerConnectionFactory {
  return {
    create: vi.fn(() => pc ?? createMockPeerConnection()),
  };
}

function createMockMediaStreamFactory(
  stream?: MediaStreamLike,
): MediaStreamFactory {
  return {
    createFromSource: vi.fn(() => stream ?? createMockStream()),
  };
}

function createConfig(overrides?: Partial<EncoderConfig>): EncoderConfig {
  return {
    codec: 'H264',
    peerConnectionFactory: createMockPeerConnectionFactory(),
    mediaStreamFactory: createMockMediaStreamFactory(),
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('EncoderService', () => {
  let service: EncoderService;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    service?.close();
    vi.useRealTimers();
  });

  describe('Constructor', () => {
    it('should throw if peerConnectionFactory is not provided', () => {
      expect(() => new EncoderService({
        codec: 'H264',
        mediaStreamFactory: createMockMediaStreamFactory(),
      } as EncoderConfig)).toThrow('peerConnectionFactory');
    });

    it('should throw if mediaStreamFactory is not provided', () => {
      expect(() => new EncoderService({
        codec: 'H264',
        peerConnectionFactory: createMockPeerConnectionFactory(),
      } as EncoderConfig)).toThrow('mediaStreamFactory');
    });

    it('should create with default 1080p/30fps/4Mbps profile', () => {
      service = new EncoderService(createConfig());
      const profile = service.getProfile();

      expect(profile.width).toBe(1920);
      expect(profile.height).toBe(1080);
      expect(profile.fps).toBe(30);
      expect(profile.minBitrate).toBe(1000);
      expect(profile.maxBitrate).toBe(8000);
      expect(profile.codec).toBe('H264');
    });

    it('should accept VP9 codec configuration', () => {
      service = new EncoderService(createConfig({ codec: 'VP9' }));
      expect(service.getProfile().codec).toBe('VP9');
    });

    it('should apply initial profile overrides', () => {
      service = new EncoderService(createConfig({
        initialProfile: { width: 1280, height: 720, fps: 24 },
      }));
      const profile = service.getProfile();

      expect(profile.width).toBe(1280);
      expect(profile.height).toBe(720);
      expect(profile.fps).toBe(24);
    });

    it('should not be encoding initially', () => {
      service = new EncoderService(createConfig());
      expect(service.isEncoding()).toBe(false);
    });

    it('should have connection state "new" initially', () => {
      service = new EncoderService(createConfig());
      expect(service.getConnectionState()).toBe('new');
    });
  });

  describe('Encoding Profile Management', () => {
    it('should set a new encoding profile', () => {
      service = new EncoderService(createConfig());

      const newProfile: EncodingProfile = {
        width: 1280,
        height: 720,
        fps: 24,
        minBitrate: 1500,
        maxBitrate: 4000,
        codec: 'VP9',
      };
      service.setProfile(newProfile);

      const profile = service.getProfile();
      expect(profile.width).toBe(1280);
      expect(profile.height).toBe(720);
      expect(profile.fps).toBe(24);
      expect(profile.codec).toBe('VP9');
    });

    it('should clamp minBitrate to absolute minimum (1000 kbps)', () => {
      service = new EncoderService(createConfig());
      service.setProfile({
        width: 640, height: 360, fps: 10,
        minBitrate: 200, maxBitrate: 4000, codec: 'H264',
      });

      expect(service.getProfile().minBitrate).toBe(1000);
    });

    it('should clamp maxBitrate to absolute maximum (8000 kbps)', () => {
      service = new EncoderService(createConfig());
      service.setProfile({
        width: 1920, height: 1080, fps: 30,
        minBitrate: 4000, maxBitrate: 12000, codec: 'H264',
      });

      expect(service.getProfile().maxBitrate).toBe(8000);
    });

    it('should ensure minBitrate does not exceed maxBitrate after clamping', () => {
      service = new EncoderService(createConfig());
      // If we set min=9000, max=7000, after clamping: min=8000, max=7000
      // Then min should be clamped to max
      service.setProfile({
        width: 1920, height: 1080, fps: 30,
        minBitrate: 9000, maxBitrate: 7000, codec: 'H264',
      });

      const profile = service.getProfile();
      expect(profile.minBitrate).toBeLessThanOrEqual(profile.maxBitrate);
    });

    it('should emit profile_changed event', () => {
      service = new EncoderService(createConfig());
      const handler = vi.fn();
      service.on('profile_changed', handler);

      service.setProfile({
        width: 854, height: 480, fps: 15,
        minBitrate: 1000, maxBitrate: 2000, codec: 'H264',
      });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        previous: expect.objectContaining({ width: 1920 }),
        current: expect.objectContaining({ width: 854 }),
      }));
    });
  });

  describe('Peer Connection Management', () => {
    it('should create a peer connection using the factory', () => {
      const mockPc = createMockPeerConnection();
      const factory = createMockPeerConnectionFactory(mockPc);
      service = new EncoderService(createConfig({ peerConnectionFactory: factory }));

      const pc = service.createPeerConnection();

      expect(pc).toBe(mockPc);
      expect(factory.create).toHaveBeenCalledTimes(1);
    });

    it('should pass ICE servers to the factory', () => {
      const factory = createMockPeerConnectionFactory();
      service = new EncoderService(createConfig({ peerConnectionFactory: factory }));

      const iceServers: RTCIceServerConfig[] = [
        { urls: 'stun:stun.example.com:3478' },
        { urls: 'turn:turn.example.com:3478', username: 'user', credential: 'pass' },
      ];

      service.createPeerConnection(iceServers);

      expect(factory.create).toHaveBeenCalledWith({ iceServers });
    });

    it('should close existing connection when creating a new one', () => {
      const mockPc1 = createMockPeerConnection();
      const mockPc2 = createMockPeerConnection();
      let callCount = 0;

      const factory: PeerConnectionFactory = {
        create: vi.fn(() => {
          callCount++;
          return callCount === 1 ? mockPc1 : mockPc2;
        }),
      };

      service = new EncoderService(createConfig({ peerConnectionFactory: factory }));

      service.createPeerConnection();
      service.createPeerConnection();

      expect(mockPc1.close).toHaveBeenCalledTimes(1);
    });

    it('should track connection state changes', () => {
      const mockPc = createMockPeerConnection();
      const factory = createMockPeerConnectionFactory(mockPc);
      service = new EncoderService(createConfig({ peerConnectionFactory: factory }));

      const handler = vi.fn();
      service.on('connection_state_changed', handler);

      service.createPeerConnection();

      // Simulate state change
      (mockPc as any).connectionState = 'connected';
      mockPc.onconnectionstatechange!();

      expect(handler).toHaveBeenCalledWith('connected');
      expect(service.getConnectionState()).toBe('connected');
    });

    it('should return null peer connection before creation', () => {
      service = new EncoderService(createConfig());
      expect(service.getPeerConnection()).toBeNull();
    });
  });

  describe('Video Track and Encoding', () => {
    it('should throw when adding track without peer connection', () => {
      service = new EncoderService(createConfig());
      const stream = createMockStream();

      expect(() => service.addVideoTrack(stream)).toThrow('Peer connection not created');
    });

    it('should throw when stream has no video tracks', () => {
      const factory = createMockPeerConnectionFactory();
      service = new EncoderService(createConfig({ peerConnectionFactory: factory }));
      service.createPeerConnection();

      const stream: MediaStreamLike = {
        id: 'empty',
        getVideoTracks: () => [],
        getAudioTracks: () => [],
      };

      expect(() => service.addVideoTrack(stream)).toThrow('no video tracks');
    });

    it('should add video track to peer connection', () => {
      const mockPc = createMockPeerConnection();
      const factory = createMockPeerConnectionFactory(mockPc);
      service = new EncoderService(createConfig({ peerConnectionFactory: factory }));

      service.createPeerConnection();
      const stream = createMockStream();
      service.addVideoTrack(stream);

      expect(mockPc.addTrack).toHaveBeenCalledTimes(1);
      expect(service.isEncoding()).toBe(true);
    });

    it('should emit encoding_started event', () => {
      const mockPc = createMockPeerConnection();
      const factory = createMockPeerConnectionFactory(mockPc);
      service = new EncoderService(createConfig({ peerConnectionFactory: factory }));

      const handler = vi.fn();
      service.on('encoding_started', handler);

      service.createPeerConnection();
      service.addVideoTrack(createMockStream());

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        codec: 'H264',
        width: 1920,
        height: 1080,
        fps: 30,
      }));
    });

    it('should apply bitrate parameters to sender on addVideoTrack', () => {
      const sender = createMockSender();
      const mockPc = createMockPeerConnection({ addTrack: vi.fn(() => sender) });
      const factory = createMockPeerConnectionFactory(mockPc);
      service = new EncoderService(createConfig({ peerConnectionFactory: factory }));

      service.createPeerConnection();
      service.addVideoTrack(createMockStream());

      expect(sender.setParameters).toHaveBeenCalledTimes(1);
      const params = (sender.setParameters as any).mock.calls[0][0];
      expect(params.encodings[0].maxBitrate).toBe(8000 * 1000); // 8 Mbps in bps
      expect(params.encodings[0].maxFramerate).toBe(30);
    });
  });

  describe('startEncoding()', () => {
    it('should throw without peer connection', () => {
      service = new EncoderService(createConfig());
      expect(() => service.startEncoding()).toThrow('Peer connection not created');
    });

    it('should create stream from factory and add track', () => {
      const mockPc = createMockPeerConnection();
      const pcFactory = createMockPeerConnectionFactory(mockPc);
      const stream = createMockStream();
      const streamFactory = createMockMediaStreamFactory(stream);

      service = new EncoderService(createConfig({
        peerConnectionFactory: pcFactory,
        mediaStreamFactory: streamFactory,
      }));

      service.createPeerConnection();
      service.startEncoding();

      expect(streamFactory.createFromSource).toHaveBeenCalledWith({
        width: 1920,
        height: 1080,
        fps: 30,
        codec: 'H264',
      });
      expect(mockPc.addTrack).toHaveBeenCalledTimes(1);
      expect(service.isEncoding()).toBe(true);
    });

    it('should not start twice', () => {
      const mockPc = createMockPeerConnection();
      const pcFactory = createMockPeerConnectionFactory(mockPc);
      service = new EncoderService(createConfig({ peerConnectionFactory: pcFactory }));

      service.createPeerConnection();
      service.startEncoding();
      service.startEncoding(); // no-op

      expect(mockPc.addTrack).toHaveBeenCalledTimes(1);
    });
  });

  describe('Adaptive Bitrate (Requirement 5.5)', () => {
    it('should start at 4 Mbps bitrate', () => {
      service = new EncoderService(createConfig());
      const stats = service.getStats();
      expect(stats.currentBitrateKbps).toBe(4000);
    });

    it('should update bitrate within valid range', () => {
      const sender = createMockSender();
      const mockPc = createMockPeerConnection({ addTrack: vi.fn(() => sender) });
      const factory = createMockPeerConnectionFactory(mockPc);
      service = new EncoderService(createConfig({ peerConnectionFactory: factory }));

      service.createPeerConnection();
      service.startEncoding();
      service.updateBitrate(2000, 6000);

      expect(sender.setParameters).toHaveBeenCalled();
      const lastCall = (sender.setParameters as any).mock.calls.at(-1)[0];
      expect(lastCall.encodings[0].maxBitrate).toBe(6000 * 1000);
    });

    it('should clamp bitrate below 1 Mbps minimum', () => {
      service = new EncoderService(createConfig());
      service.updateBitrate(500, 800);

      const stats = service.getStats();
      // Min is clamped to 1000, max is clamped to at least min (1000)
      expect(stats.currentBitrateKbps).toBeGreaterThanOrEqual(1000);
    });

    it('should clamp bitrate above 8 Mbps maximum', () => {
      service = new EncoderService(createConfig());
      service.updateBitrate(5000, 12000);

      const stats = service.getStats();
      expect(stats.currentBitrateKbps).toBeLessThanOrEqual(8000);
    });

    it('should emit bitrate_updated event', () => {
      service = new EncoderService(createConfig());
      const handler = vi.fn();
      service.on('bitrate_updated', handler);

      service.updateBitrate(2000, 5000);

      expect(handler).toHaveBeenCalledWith({ minKbps: 2000, maxKbps: 5000 });
    });

    it('should ensure min does not exceed max after clamping', () => {
      service = new EncoderService(createConfig());
      const handler = vi.fn();
      service.on('bitrate_updated', handler);

      // min=900 → clamped to 1000, max=800 → clamped to 1000 (>= min)
      service.updateBitrate(900, 800);

      const { minKbps, maxKbps } = handler.mock.calls[0][0];
      expect(minKbps).toBeLessThanOrEqual(maxKbps);
    });
  });

  describe('Stats Tracking', () => {
    it('should track frames encoded', () => {
      service = new EncoderService(createConfig());

      service.recordFrameEncoded(10);
      service.recordFrameEncoded(12);
      service.recordFrameEncoded(11);

      const stats = service.getStats();
      expect(stats.framesEncoded).toBe(3);
    });

    it('should track frames dropped', () => {
      service = new EncoderService(createConfig());

      service.recordFrameDropped();
      service.recordFrameDropped();

      const stats = service.getStats();
      expect(stats.framesDropped).toBe(2);
    });

    it('should measure FPS within 1-second window', () => {
      service = new EncoderService(createConfig());

      const baseTime = new Date('2026-01-15T10:00:00.000Z').getTime();

      // Record 30 frames within 1 second (each ~33ms apart)
      for (let i = 0; i < 30; i++) {
        vi.setSystemTime(new Date(baseTime + (i * 33)));
        service.recordFrameEncoded(10);
      }

      const stats = service.getStats();
      expect(stats.currentFps).toBe(30);
    });

    it('should track latency from last recorded frame', () => {
      service = new EncoderService(createConfig());

      service.recordFrameEncoded(120);
      expect(service.getStats().latencyMs).toBe(120);

      service.recordFrameEncoded(85);
      expect(service.getStats().latencyMs).toBe(85);
    });

    it('should track uptime since encoding started', () => {
      const mockPc = createMockPeerConnection();
      const factory = createMockPeerConnectionFactory(mockPc);
      service = new EncoderService(createConfig({ peerConnectionFactory: factory }));

      vi.setSystemTime(new Date('2026-01-15T10:00:00.000Z'));

      service.createPeerConnection();
      service.startEncoding();

      vi.setSystemTime(new Date('2026-01-15T10:00:05.000Z'));

      const stats = service.getStats();
      expect(stats.uptimeMs).toBe(5000);
    });

    it('should return zero uptime when not encoding', () => {
      service = new EncoderService(createConfig());
      expect(service.getStats().uptimeMs).toBe(0);
    });

    it('should emit frame_encoded event', () => {
      service = new EncoderService(createConfig());
      const handler = vi.fn();
      service.on('frame_encoded', handler);

      service.recordFrameEncoded(10);

      expect(handler).toHaveBeenCalledWith({
        framesEncoded: 1,
        fps: 1,
      });
    });

    it('should report resolution from current profile', () => {
      service = new EncoderService(createConfig());
      const stats = service.getStats();

      expect(stats.width).toBe(1920);
      expect(stats.height).toBe(1080);
    });

    it('should report codec from current profile', () => {
      service = new EncoderService(createConfig({ codec: 'VP9' }));
      expect(service.getStats().codec).toBe('VP9');
    });
  });

  describe('Resource Cleanup', () => {
    it('should stop encoding and close peer connection', () => {
      const mockPc = createMockPeerConnection();
      const factory = createMockPeerConnectionFactory(mockPc);
      service = new EncoderService(createConfig({ peerConnectionFactory: factory }));

      service.createPeerConnection();
      service.startEncoding();
      expect(service.isEncoding()).toBe(true);

      service.close();

      expect(service.isEncoding()).toBe(false);
      expect(mockPc.close).toHaveBeenCalled();
      expect(service.getConnectionState()).toBe('closed');
    });

    it('should stop media stream tracks', () => {
      const track = createMockTrack();
      const stream = createMockStream([track]);
      const mockPc = createMockPeerConnection();
      const factory = createMockPeerConnectionFactory(mockPc);
      const streamFactory = createMockMediaStreamFactory(stream);

      service = new EncoderService(createConfig({
        peerConnectionFactory: factory,
        mediaStreamFactory: streamFactory,
      }));

      service.createPeerConnection();
      service.startEncoding();
      service.close();

      expect(track.stop).toHaveBeenCalled();
    });

    it('should emit encoding_stopped event', () => {
      const mockPc = createMockPeerConnection();
      const factory = createMockPeerConnectionFactory(mockPc);
      service = new EncoderService(createConfig({ peerConnectionFactory: factory }));

      const handler = vi.fn();
      service.on('encoding_stopped', handler);

      service.createPeerConnection();
      service.startEncoding();
      service.close();

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should handle close when not encoding', () => {
      service = new EncoderService(createConfig());
      // Should not throw
      expect(() => service.close()).not.toThrow();
      expect(service.getConnectionState()).toBe('closed');
    });

    it('should nullify peer connection after close', () => {
      const mockPc = createMockPeerConnection();
      const factory = createMockPeerConnectionFactory(mockPc);
      service = new EncoderService(createConfig({ peerConnectionFactory: factory }));

      service.createPeerConnection();
      service.close();

      expect(service.getPeerConnection()).toBeNull();
    });
  });

  describe('Profile change while encoding', () => {
    it('should apply new bitrate to active sender', () => {
      const sender = createMockSender();
      const mockPc = createMockPeerConnection({ addTrack: vi.fn(() => sender) });
      const factory = createMockPeerConnectionFactory(mockPc);
      service = new EncoderService(createConfig({ peerConnectionFactory: factory }));

      service.createPeerConnection();
      service.startEncoding();

      // Reset mock to track new calls
      (sender.setParameters as any).mockClear();

      service.setProfile({
        width: 1280, height: 720, fps: 24,
        minBitrate: 1500, maxBitrate: 4000, codec: 'H264',
      });

      expect(sender.setParameters).toHaveBeenCalledTimes(1);
      const params = (sender.setParameters as any).mock.calls[0][0];
      expect(params.encodings[0].maxBitrate).toBe(4000 * 1000);
      expect(params.encodings[0].maxFramerate).toBe(24);
    });
  });
});

describe('ENCODING_PROFILES', () => {
  it('should define high profile as 1080p/30fps', () => {
    expect(ENCODING_PROFILES.high.width).toBe(1920);
    expect(ENCODING_PROFILES.high.height).toBe(1080);
    expect(ENCODING_PROFILES.high.fps).toBe(30);
    expect(ENCODING_PROFILES.high.minBitrate).toBe(4000);
    expect(ENCODING_PROFILES.high.maxBitrate).toBe(8000);
  });

  it('should define balanced profile as 720p/24fps', () => {
    expect(ENCODING_PROFILES.balanced.width).toBe(1280);
    expect(ENCODING_PROFILES.balanced.height).toBe(720);
    expect(ENCODING_PROFILES.balanced.fps).toBe(24);
  });

  it('should define low profile as 480p/15fps', () => {
    expect(ENCODING_PROFILES.low.width).toBe(854);
    expect(ENCODING_PROFILES.low.height).toBe(480);
    expect(ENCODING_PROFILES.low.fps).toBe(15);
  });

  it('should define critical profile as 360p/10fps', () => {
    expect(ENCODING_PROFILES.critical.width).toBe(640);
    expect(ENCODING_PROFILES.critical.height).toBe(360);
    expect(ENCODING_PROFILES.critical.fps).toBe(10);
  });
});

describe('getEncodingProfile', () => {
  it('should return a copy of the named profile', () => {
    const profile = getEncodingProfile('high');
    expect(profile.width).toBe(1920);
    expect(profile.height).toBe(1080);

    // Ensure it returns a copy, not the original
    profile.width = 100;
    expect(ENCODING_PROFILES.high.width).toBe(1920);
  });

  it('should allow codec override', () => {
    const profile = getEncodingProfile('balanced', 'VP9');
    expect(profile.codec).toBe('VP9');
    expect(profile.width).toBe(1280);
  });

  it('should throw for unknown profile name', () => {
    expect(() => getEncodingProfile('ultra' as any)).toThrow('Unknown encoding profile');
  });
});
