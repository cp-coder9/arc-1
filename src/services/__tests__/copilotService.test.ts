import { describe, it, expect, vi } from 'vitest';

// Mock firebase-admin (required because copilotService now imports provenanceService which uses adminDb)
vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({ id: 'mock-id', set: vi.fn(), get: vi.fn(), update: vi.fn() })),
    })),
    doc: vi.fn(() => ({ get: vi.fn(), set: vi.fn(), update: vi.fn() })),
  },
}));

// Mock geminiService (to avoid network call imports)
vi.mock('@/services/geminiService', () => ({
  callGeminiProxy: vi.fn(),
}));

import { getCapabilitiesForRole, validateCapabilityAccess } from '@/services/copilotService';
import { CAPABILITY_ROLE_MAP, UNIVERSAL_CAPABILITIES } from '@/services/copilotTypes';
import type { UserRole } from '@/types';
import type { CopilotCapability } from '@/services/copilotTypes';

describe('copilotService — capability access control', () => {
  describe('getCapabilitiesForRole', () => {
    it('returns empty array for platform_admin role', () => {
      const result = getCapabilitiesForRole('platform_admin');
      expect(result).toEqual([]);
    });

    it('returns universal capabilities for any professional role', () => {
      const result = getCapabilitiesForRole('client');
      for (const cap of UNIVERSAL_CAPABILITIES) {
        expect(result).toContain(cap);
      }
    });

    it('returns role-specific capabilities for architect', () => {
      const result = getCapabilitiesForRole('architect');
      expect(result).toContain('draft_rfi');
      expect(result).toContain('draft_site_instruction');
      expect(result).toContain('flag_compliance');
      expect(result).toContain('generate_narrative');
      expect(result).toContain('summarise_financials');
    });

    it('returns role-specific capabilities for quantity_surveyor', () => {
      const result = getCapabilitiesForRole('quantity_surveyor');
      expect(result).toContain('draft_rfi');
      expect(result).toContain('draft_site_instruction');
      expect(result).toContain('generate_narrative');
      expect(result).toContain('summarise_financials');
      expect(result).not.toContain('flag_compliance');
    });

    it('returns only universal capabilities for roles with no scoped access', () => {
      const result = getCapabilitiesForRole('freelancer');
      expect(result).toHaveLength(UNIVERSAL_CAPABILITIES.length);
      for (const cap of UNIVERSAL_CAPABILITIES) {
        expect(result).toContain(cap);
      }
    });

    it('does not duplicate universal capabilities', () => {
      const result = getCapabilitiesForRole('architect');
      const unique = new Set(result);
      expect(unique.size).toBe(result.length);
    });
  });

  describe('validateCapabilityAccess', () => {
    it('denies platform_admin-only users with appropriate message', () => {
      const result = validateCapabilityAccess('platform_admin', 'summarise_status');
      expect(result.allowed).toBe(false);
      expect(result.error).toBe('Copilot capabilities require a professional role.');
    });

    it('denies unrecognized capabilities with generic message', () => {
      const result = validateCapabilityAccess('architect', 'nonexistent_capability');
      expect(result.allowed).toBe(false);
      expect(result.error).toBe('The requested capability is unrecognized.');
    });

    it('does not reveal role mappings in unrecognized capability error', () => {
      const result = validateCapabilityAccess('architect', 'hack_system');
      expect(result.error).not.toContain('architect');
      expect(result.error).not.toContain('role');
    });

    it('allows universal capabilities for any professional role', () => {
      const professionalRoles: UserRole[] = ['client', 'architect', 'engineer', 'freelancer', 'supplier'];
      for (const role of professionalRoles) {
        for (const cap of UNIVERSAL_CAPABILITIES) {
          const result = validateCapabilityAccess(role, cap);
          expect(result.allowed).toBe(true);
          expect(result.error).toBeUndefined();
        }
      }
    });

    it('allows role-scoped capability for authorized role', () => {
      const result = validateCapabilityAccess('architect', 'draft_rfi');
      expect(result.allowed).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('denies role-scoped capability for unauthorized role without revealing access', () => {
      const result = validateCapabilityAccess('client', 'draft_rfi');
      expect(result.allowed).toBe(false);
      expect(result.error).toBe('This capability is not available for your role.');
      // Must not reveal which roles DO have access
      expect(result.error).not.toContain('architect');
      expect(result.error).not.toContain('bep');
    });

    it('handles dual-role users (pass professional role for resolution)', () => {
      // Dual-role users pass their professional role — platform_admin is ignored
      const result = validateCapabilityAccess('architect', 'draft_rfi');
      expect(result.allowed).toBe(true);
    });

    it('denies platform_admin for all capabilities regardless of type', () => {
      const allCapabilities = Object.keys(CAPABILITY_ROLE_MAP) as CopilotCapability[];
      for (const cap of allCapabilities) {
        const result = validateCapabilityAccess('platform_admin', cap);
        expect(result.allowed).toBe(false);
        expect(result.error).toBe('Copilot capabilities require a professional role.');
      }
    });
  });
});
