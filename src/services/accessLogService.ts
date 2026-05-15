export type AccessLogOutcome = 'allowed' | 'denied' | 'error';

export interface AccessLogActor {
  uid?: string;
  role?: string;
  email?: string;
  authorizationType?: string;
}

export interface AccessLogInput {
  requestId: string;
  method: string;
  path: string;
  statusCode: number;
  outcome: AccessLogOutcome;
  actor?: AccessLogActor;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

export interface AccessLogEntry extends AccessLogInput {
  id?: string;
  createdAt: string;
  immutable: true;
}

export interface AccessLogWriter {
  add(collectionPath: string, data: Record<string, unknown>): Promise<{ id: string }>;
}

function normalizeAccessPath(path: string): string {
  const [pathWithoutQuery] = path.trim().split('?');
  return pathWithoutQuery || '/';
}

export function buildAccessLogEntry(input: AccessLogInput): AccessLogEntry {
  if (!input.requestId?.trim()) throw new Error('Access log requestId is required');
  if (!input.method?.trim()) throw new Error('Access log method is required');
  if (!input.path?.trim()) throw new Error('Access log path is required');
  if (!Number.isInteger(input.statusCode) || input.statusCode < 100 || input.statusCode > 599) {
    throw new Error('Access log statusCode must be a valid HTTP status code');
  }

  return {
    ...input,
    requestId: input.requestId.trim(),
    method: input.method.trim().toUpperCase(),
    path: normalizeAccessPath(input.path),
    metadata: input.metadata || {},
    createdAt: input.createdAt || new Date().toISOString(),
    immutable: true,
  };
}

export async function writeAccessLogEntry(writer: AccessLogWriter, input: AccessLogInput): Promise<AccessLogEntry> {
  const entry = buildAccessLogEntry(input);
  const ref = await writer.add('access_logs', entry as unknown as Record<string, unknown>);
  return { ...entry, id: ref.id };
}

export function assertAccessLogImmutableUpdateAttempt(changedKeys: string[]): void {
  if (changedKeys.length > 0) {
    const error = new Error('Access logs are immutable and cannot be updated');
    (error as Error & { status?: number }).status = 403;
    throw error;
  }
}
