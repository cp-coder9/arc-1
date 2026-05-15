import { describe, expect, it } from 'vitest';
import { buildDirectoryProfile, sanitizeRoleProfileUpdate } from '../roleProfileService';

describe('roleProfileService', () => {
  it('allows only role-specific fields and blocks privilege escalation', () => {
    const sanitized = sanitizeRoleProfileUpdate('bep', {
      displayName: 'BEP One',
      disciplines: ['architecture'],
      role: 'admin',
      isAdmin: true,
      verificationStatus: 'verified',
      trustScore: 100,
    });

    expect(sanitized).toEqual({ displayName: 'BEP One', disciplines: ['architecture'] });
  });

  it('builds safe verified directory projections', () => {
    const directoryProfile = buildDirectoryProfile(
      { uid: 'bep-1', displayName: 'BEP One', role: 'architect' },
      { region: 'Western Cape', disciplines: ['architecture'], bio: 'Registered professional', verificationStatus: 'rejected' },
      { status: 'verified', checkedAt: '2026-01-01T00:00:00.000Z' },
    );

    expect(directoryProfile).toMatchObject({
      userId: 'bep-1',
      role: 'bep',
      verified: true,
      verificationStatus: 'verified',
      disciplines: ['architecture'],
      visibility: 'directory',
    });
    expect(directoryProfile).not.toHaveProperty('email');
  });
});
