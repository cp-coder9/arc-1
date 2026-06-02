import { describe, expect, it, vi } from 'vitest';
import {
  assertAccessLogImmutableUpdateAttempt,
  buildAccessLogEntry,
  writeAccessLogEntry,
} from '../accessLogService';

describe('accessLogService', () => {
  it('builds immutable access logs with normalized method, path, and metadata', () => {
    const entry = buildAccessLogEntry({
      requestId: ' req-1 ',
      method: ' get ',
      path: '/api/projects/project-1/access?token=secret',
      statusCode: 200,
      outcome: 'allowed',
      actor: { uid: 'user-1', role: 'client', authorizationType: 'bearer' },
      metadata: { projectId: 'project-1' },
      createdAt: '2026-05-15T19:10:00.000Z',
    });

    expect(entry).toMatchObject({
      requestId: 'req-1',
      method: 'GET',
      path: '/api/projects/project-1/access',
      statusCode: 200,
      outcome: 'allowed',
      immutable: true,
      createdAt: '2026-05-15T19:10:00.000Z',
    });
  });

  it('rejects logs without correlation and HTTP status details', () => {
    expect(() => buildAccessLogEntry({ requestId: '', method: 'GET', path: '/api', statusCode: 200, outcome: 'allowed' })).toThrow(/requestId/);
    expect(() => buildAccessLogEntry({ requestId: 'req-1', method: '', path: '/api', statusCode: 200, outcome: 'allowed' })).toThrow(/method/);
    expect(() => buildAccessLogEntry({ requestId: 'req-1', method: 'GET', path: '', statusCode: 200, outcome: 'allowed' })).toThrow(/path/);
    expect(() => buildAccessLogEntry({ requestId: 'req-1', method: 'GET', path: '/api', statusCode: 99, outcome: 'allowed' })).toThrow(/statusCode/);
  });

  it('writes access logs through an injected persistent writer', async () => {
    const add = vi.fn(async () => ({ id: 'access-1' }));

    const entry = await writeAccessLogEntry({ add }, {
      requestId: 'req-2',
      method: 'POST',
      path: '/api/admin/users/user-1/verify',
      statusCode: 403,
      outcome: 'denied',
      reason: 'verification:review permission denied',
      actor: { uid: 'user-2', role: 'client' },
    });

    expect(add).toHaveBeenCalledWith('access_logs', expect.objectContaining({
      requestId: 'req-2',
      method: 'POST',
      path: '/api/admin/users/user-1/verify',
      outcome: 'denied',
      immutable: true,
    }));
    expect(entry.id).toBe('access-1');
  });

  it('guards the append-only access log model', () => {
    expect(() => assertAccessLogImmutableUpdateAttempt(['statusCode'])).toThrow(/immutable/);
    expect(() => assertAccessLogImmutableUpdateAttempt([])).not.toThrow();
  });
});
