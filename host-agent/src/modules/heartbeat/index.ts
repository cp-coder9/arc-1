/**
 * Host Agent — Heartbeat Module
 *
 * Provides the HeartbeatService class for maintaining connectivity
 * with the Architex Session Broker.
 */

export {
  HeartbeatService,
  shouldMarkHostOffline,
  getOfflineThresholdMs,
  FetchHttpClient,
  type HostStatus,
  type HeartbeatPayload,
  type HeartbeatAcknowledgement,
  type SessionPolicy,
  type AllowlistEntry,
  type HeartbeatServiceConfig,
  type HeartbeatState,
  type HeartbeatEvent,
  type HttpClient,
  type HttpResponse,
} from './heartbeatService';
