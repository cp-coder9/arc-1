/**
 * Host Agent — Encoder Service
 *
 * Handles H.264/VP9 encoding of raw frame buffers and manages a WebRTC peer
 * connection as the media sender for remote desktop streaming.
 *
 * Responsibilities:
 * - Encode captured window frames using H.264 or VP9 codec (configurable)
 * - Manage WebRTC RTCPeerConnection lifecycle (media sender side)
 * - Support adaptive bitrate between 1–8 Mbps (starting at 4 Mbps)
 * - Target 1080p, 30fps, glass-to-glass latency ≤150ms under stable conditions
 * - Expose encoding profile configuration (resolution, fps, bitrate)
 * - Provide injectable RTCPeerConnection factory for environment portability
 *
 * Requirements: 5.5
 */

import { EventEmitter } from 'events';

// ─── Types ──────────────────────────────────────────────────────────────────────

export type VideoCodec = 'H264' | 'VP9';

export interface EncodingProfile {
  width: number;
  height: number;
  fps: number;
  minBitrate: number;    // kbps
  maxBitrate: number;    // kbps
  codec: VideoCodec;
}

export interface EncoderConfig {
  /** Default codec to use */
  codec: VideoCodec;
  /** Initial encoding profile (defaults to 1080p/30fps/4Mbps if not provided) */
  initialProfile?: Partial<EncodingProfile>;
  /** ICE servers for peer connection (STUN/TURN) */
  iceServers?: RTCIceServerConfig[];
  /** Injectable factory for creating RTCPeerConnection instances */
  peerConnectionFactory?: PeerConnectionFactory;
  /** Injectable factory for creating MediaStream instances from frame data */
  mediaStreamFactory?: MediaStreamFactory;
}

export interface RTCIceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface EncoderStats {
  /** Current encoding FPS (actual measured) */
  currentFps: number;
  /** Current bitrate in kbps */
  currentBitrateKbps: number;
  /** Current encoding resolution */
  width: number;
  height: number;
  /** Estimated glass-to-glass latency in ms */
  latencyMs: number;
  /** Active codec */
  codec: VideoCodec;
  /** Number of frames encoded since session start */
  framesEncoded: number;
  /** Number of frames dropped */
  framesDropped: number;
  /** Peer connection state */
  connectionState: RTCConnectionState;
  /** Time since encoding started (ms) */
  uptimeMs: number;
}

export type RTCConnectionState =
  | 'new'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed';

export type EncoderEvent =
  | 'profile_changed'
  | 'bitrate_updated'
  | 'connection_state_changed'
  | 'encoding_started'
  | 'encoding_stopped'
  | 'frame_encoded'
  | 'error';

// ─── Abstractions ───────────────────────────────────────────────────────────────

/**
 * Abstract RTCPeerConnection interface for testability.
 * Mirrors the subset of the W3C RTCPeerConnection API used by this service.
 */
export interface RTCPeerConnectionLike {
  connectionState: string;
  addTrack(track: MediaStreamTrackLike, stream: MediaStreamLike): RTCSenderLike;
  createOffer(options?: unknown): Promise<RTCSessionDescriptionLike>;
  createAnswer(options?: unknown): Promise<RTCSessionDescriptionLike>;
  setLocalDescription(desc: RTCSessionDescriptionLike): Promise<void>;
  setRemoteDescription(desc: RTCSessionDescriptionLike): Promise<void>;
  addIceCandidate(candidate: RTCIceCandidateLike): Promise<void>;
  getSenders(): RTCSenderLike[];
  getStats(): Promise<Map<string, unknown>>;
  close(): void;
  onicecandidate: ((event: { candidate: RTCIceCandidateLike | null }) => void) | null;
  onconnectionstatechange: (() => void) | null;
}

export interface RTCSessionDescriptionLike {
  type: string;
  sdp: string;
}

export interface RTCIceCandidateLike {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
}

export interface RTCSenderLike {
  track: MediaStreamTrackLike | null;
  getParameters(): RTCSenderParameters;
  setParameters(params: RTCSenderParameters): Promise<void>;
}

export interface RTCSenderParameters {
  encodings: RTCEncodingParameters[];
  [key: string]: unknown;
}

export interface RTCEncodingParameters {
  maxBitrate?: number;
  minBitrate?: number;
  maxFramerate?: number;
  scaleResolutionDownBy?: number;
  [key: string]: unknown;
}

export interface MediaStreamLike {
  id: string;
  getVideoTracks(): MediaStreamTrackLike[];
  getAudioTracks(): MediaStreamTrackLike[];
}

export interface MediaStreamTrackLike {
  id: string;
  kind: string;
  enabled: boolean;
  stop(): void;
}

/**
 * Factory for creating RTCPeerConnection instances.
 * Allows injection of browser-specific or mock implementations.
 */
export interface PeerConnectionFactory {
  create(config: { iceServers: RTCIceServerConfig[] }): RTCPeerConnectionLike;
}

/**
 * Factory for creating MediaStream from raw frame data.
 * In a real implementation, this would wrap platform-specific APIs.
 */
export interface MediaStreamFactory {
  createFromSource(config: {
    width: number;
    height: number;
    fps: number;
    codec: VideoCodec;
  }): MediaStreamLike;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

/** Default encoding profile: 1080p, 30fps, 4 Mbps start */
const DEFAULT_PROFILE: EncodingProfile = {
  width: 1920,
  height: 1080,
  fps: 30,
  minBitrate: 1000,   // 1 Mbps minimum
  maxBitrate: 8000,   // 8 Mbps maximum
  codec: 'H264',
};

/** Starting bitrate in kbps */
const DEFAULT_START_BITRATE_KBPS = 4000; // 4 Mbps

/** Absolute minimum bitrate (kbps) */
const ABSOLUTE_MIN_BITRATE_KBPS = 1000; // 1 Mbps

/** Absolute maximum bitrate (kbps) */
const ABSOLUTE_MAX_BITRATE_KBPS = 8000; // 8 Mbps

/** Target glass-to-glass latency threshold (ms) */
const TARGET_LATENCY_MS = 150;

// ─── EncoderService Class ───────────────────────────────────────────────────────

export class EncoderService extends EventEmitter {
  private readonly codec: VideoCodec;
  private readonly peerConnectionFactory: PeerConnectionFactory;
  private readonly mediaStreamFactory: MediaStreamFactory;
  private readonly iceServers: RTCIceServerConfig[];

  private profile: EncodingProfile;
  private peerConnection: RTCPeerConnectionLike | null = null;
  private mediaStream: MediaStreamLike | null = null;
  private videoSender: RTCSenderLike | null = null;

  private connectionState: RTCConnectionState = 'new';
  private encoding = false;
  private startTime: number | null = null;

  // Stats tracking
  private framesEncoded = 0;
  private framesDropped = 0;
  private currentFps = 0;
  private currentBitrateKbps: number;
  private latencyMs = 0;

  // FPS measurement
  private frameTimestamps: number[] = [];
  private readonly fpsWindowMs = 1000;

  constructor(config: EncoderConfig) {
    super();

    this.codec = config.codec;
    this.iceServers = config.iceServers ?? [];

    // Build the initial profile from defaults + any overrides
    this.profile = {
      ...DEFAULT_PROFILE,
      codec: config.codec,
      ...config.initialProfile,
    };

    // Start bitrate at 4 Mbps (or within the configured min/max bounds)
    this.currentBitrateKbps = Math.min(
      Math.max(DEFAULT_START_BITRATE_KBPS, this.profile.minBitrate),
      this.profile.maxBitrate,
    );

    // Use provided factories or throw if not supplied (required for operation)
    if (!config.peerConnectionFactory) {
      throw new Error('EncoderService requires a peerConnectionFactory');
    }
    if (!config.mediaStreamFactory) {
      throw new Error('EncoderService requires a mediaStreamFactory');
    }

    this.peerConnectionFactory = config.peerConnectionFactory;
    this.mediaStreamFactory = config.mediaStreamFactory;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Set the encoding profile (resolution, fps, bitrate, codec).
   * If currently encoding, applies the new profile to the active sender.
   */
  setProfile(profile: EncodingProfile): void {
    const previous = { ...this.profile };
    this.profile = { ...profile };

    // Clamp bitrate to absolute bounds
    this.profile.minBitrate = Math.max(ABSOLUTE_MIN_BITRATE_KBPS, this.profile.minBitrate);
    this.profile.maxBitrate = Math.min(ABSOLUTE_MAX_BITRATE_KBPS, this.profile.maxBitrate);

    // Ensure min doesn't exceed max
    if (this.profile.minBitrate > this.profile.maxBitrate) {
      this.profile.minBitrate = this.profile.maxBitrate;
    }

    // Apply to active sender if encoding
    if (this.encoding && this.videoSender) {
      this.applyBitrateToSender(this.profile.minBitrate, this.profile.maxBitrate);
    }

    this.emit('profile_changed', { previous, current: this.profile });
  }

  /**
   * Get the current encoding profile.
   */
  getProfile(): Readonly<EncodingProfile> {
    return { ...this.profile };
  }

  /**
   * Create a new WebRTC peer connection configured for media sending.
   * Returns the peer connection for external signalling integration.
   */
  createPeerConnection(iceServers?: RTCIceServerConfig[]): RTCPeerConnectionLike {
    // Close existing connection if any
    if (this.peerConnection) {
      this.peerConnection.close();
    }

    const servers = iceServers ?? this.iceServers;
    this.peerConnection = this.peerConnectionFactory.create({ iceServers: servers });

    // Track connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      if (this.peerConnection) {
        const newState = this.peerConnection.connectionState as RTCConnectionState;
        this.connectionState = newState;
        this.emit('connection_state_changed', newState);
      }
    };

    this.connectionState = 'new';
    return this.peerConnection;
  }

  /**
   * Add a video track from the given media stream to the peer connection.
   * Configures the sender with the current encoding profile bitrate parameters.
   */
  addVideoTrack(stream: MediaStreamLike): void {
    if (!this.peerConnection) {
      throw new Error('Peer connection not created. Call createPeerConnection() first.');
    }

    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length === 0) {
      throw new Error('Provided stream has no video tracks.');
    }

    this.mediaStream = stream;
    const track = videoTracks[0];

    this.videoSender = this.peerConnection.addTrack(track, stream);

    // Apply initial bitrate constraints
    this.applyBitrateToSender(this.profile.minBitrate, this.profile.maxBitrate);

    this.encoding = true;
    this.startTime = Date.now();
    this.emit('encoding_started', {
      codec: this.profile.codec,
      width: this.profile.width,
      height: this.profile.height,
      fps: this.profile.fps,
    });
  }

  /**
   * Start encoding from a source configured by the current profile.
   * Creates a media stream using the mediaStreamFactory and adds it to the peer connection.
   */
  startEncoding(): void {
    if (!this.peerConnection) {
      throw new Error('Peer connection not created. Call createPeerConnection() first.');
    }

    if (this.encoding) {
      return; // Already encoding
    }

    const stream = this.mediaStreamFactory.createFromSource({
      width: this.profile.width,
      height: this.profile.height,
      fps: this.profile.fps,
      codec: this.profile.codec,
    });

    this.addVideoTrack(stream);
  }

  /**
   * Update the bitrate constraints on the active sender.
   * Values are clamped to the absolute bounds (1–8 Mbps).
   */
  updateBitrate(minKbps: number, maxKbps: number): void {
    const clampedMin = Math.max(ABSOLUTE_MIN_BITRATE_KBPS, Math.min(minKbps, ABSOLUTE_MAX_BITRATE_KBPS));
    const clampedMax = Math.max(clampedMin, Math.min(maxKbps, ABSOLUTE_MAX_BITRATE_KBPS));

    this.currentBitrateKbps = clampedMax;

    if (this.videoSender && this.encoding) {
      this.applyBitrateToSender(clampedMin, clampedMax);
    }

    this.emit('bitrate_updated', { minKbps: clampedMin, maxKbps: clampedMax });
  }

  /**
   * Record that a frame was encoded (called by capture pipeline).
   * Used for FPS and stats tracking.
   */
  recordFrameEncoded(latencyMs?: number): void {
    this.framesEncoded += 1;
    const now = Date.now();
    this.frameTimestamps.push(now);

    // Remove timestamps outside the FPS measurement window
    const cutoff = now - this.fpsWindowMs;
    this.frameTimestamps = this.frameTimestamps.filter(ts => ts >= cutoff);
    this.currentFps = this.frameTimestamps.length;

    if (latencyMs !== undefined) {
      this.latencyMs = latencyMs;
    }

    this.emit('frame_encoded', { framesEncoded: this.framesEncoded, fps: this.currentFps });
  }

  /**
   * Record that a frame was dropped (couldn't be encoded in time).
   */
  recordFrameDropped(): void {
    this.framesDropped += 1;
  }

  /**
   * Get current encoding statistics.
   */
  getStats(): EncoderStats {
    return {
      currentFps: this.currentFps,
      currentBitrateKbps: this.currentBitrateKbps,
      width: this.profile.width,
      height: this.profile.height,
      latencyMs: this.latencyMs,
      codec: this.profile.codec,
      framesEncoded: this.framesEncoded,
      framesDropped: this.framesDropped,
      connectionState: this.connectionState,
      uptimeMs: this.startTime ? Date.now() - this.startTime : 0,
    };
  }

  /**
   * Check if encoding is currently active.
   */
  isEncoding(): boolean {
    return this.encoding;
  }

  /**
   * Get the peer connection (for external signalling).
   */
  getPeerConnection(): RTCPeerConnectionLike | null {
    return this.peerConnection;
  }

  /**
   * Get the current connection state.
   */
  getConnectionState(): RTCConnectionState {
    return this.connectionState;
  }

  /**
   * Close the encoder, peer connection, and release all resources.
   */
  close(): void {
    this.encoding = false;

    // Stop media stream tracks
    if (this.mediaStream) {
      for (const track of this.mediaStream.getVideoTracks()) {
        track.stop();
      }
      for (const track of this.mediaStream.getAudioTracks()) {
        track.stop();
      }
      this.mediaStream = null;
    }

    // Close peer connection
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.videoSender = null;
    this.connectionState = 'closed';
    this.emit('encoding_stopped');
  }

  // ─── Private Methods ────────────────────────────────────────────────────────

  /**
   * Apply bitrate constraints to the active RTP sender.
   * Converts kbps to bps for the WebRTC API.
   */
  private applyBitrateToSender(minKbps: number, maxKbps: number): void {
    if (!this.videoSender) return;

    const params = this.videoSender.getParameters();

    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }

    for (const encoding of params.encodings) {
      encoding.maxBitrate = maxKbps * 1000;  // Convert kbps to bps
      encoding.maxFramerate = this.profile.fps;
    }

    this.videoSender.setParameters(params).catch((err) => {
      this.emit('error', { type: 'bitrate_update_failed', error: err });
    });

    this.currentBitrateKbps = maxKbps;
  }
}

// ─── Predefined Encoding Profiles ──────────────────────────────────────────────

/**
 * Predefined encoding profiles matching the bandwidth adaptation service profiles.
 */
export const ENCODING_PROFILES: Record<string, EncodingProfile> = {
  high: {
    width: 1920,
    height: 1080,
    fps: 30,
    minBitrate: 4000,
    maxBitrate: 8000,
    codec: 'H264',
  },
  balanced: {
    width: 1280,
    height: 720,
    fps: 24,
    minBitrate: 1500,
    maxBitrate: 4000,
    codec: 'H264',
  },
  low: {
    width: 854,
    height: 480,
    fps: 15,
    minBitrate: 500,
    maxBitrate: 1500,
    codec: 'H264',
  },
  critical: {
    width: 640,
    height: 360,
    fps: 10,
    minBitrate: 300,
    maxBitrate: 500,
    codec: 'H264',
  },
};

/**
 * Get a predefined encoding profile by name, optionally overriding codec.
 */
export function getEncodingProfile(name: keyof typeof ENCODING_PROFILES, codec?: VideoCodec): EncodingProfile {
  const profile = ENCODING_PROFILES[name];
  if (!profile) {
    throw new Error(`Unknown encoding profile: ${name}`);
  }
  return { ...profile, codec: codec ?? profile.codec };
}
