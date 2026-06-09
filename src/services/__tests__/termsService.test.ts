import {
  defaultTermsForRole,
  termsRequireApproval,
  snapshotTerms,
  calculateExpiryDate,
  isProposalExpired,
  resolveTermsSnapshot,
  saveCustomTermsTemplate,
  deleteCustomTermsTemplate,
  availableTermsForRole,
  ARCHITEX_STANDARD_TERMS,
  ARCHITECT_TERMS,
  ENGINEER_TERMS,
  QS_TERMS,
  TOWN_PLANNER_TERMS,
} from '../termsService';

describe('termsService', () => {
  describe('defaultTermsForRole', () => {
    it('returns Architex standard terms for any role', () => {
      const terms = defaultTermsForRole('client');
      expect(terms.some((t) => t.termsId === 'architex-standard-v2026.1')).toBe(true);
    });

    it('includes architect-specific terms for architect role', () => {
      const terms = defaultTermsForRole('architect');
      expect(terms.some((t) => t.termsId === 'architect-terms-v2026.1')).toBe(true);
      expect(terms.some((t) => t.termsId === 'architex-standard-v2026.1')).toBe(true);
    });

    it('includes engineer-specific terms for engineer role', () => {
      const terms = defaultTermsForRole('engineer');
      expect(terms.some((t) => t.termsId === 'engineer-terms-v2026.1')).toBe(true);
    });

    it('includes QS-specific terms for quantity_surveyor role', () => {
      const terms = defaultTermsForRole('quantity_surveyor');
      expect(terms.some((t) => t.termsId === 'qs-terms-v2026.1')).toBe(true);
    });

    it('returns only standard terms for roles without profession-specific terms', () => {
      const terms = defaultTermsForRole('unknown_role');
      expect(terms).toHaveLength(1);
      expect(terms[0].termsId).toBe('architex-standard-v2026.1');
    });
  });

  describe('termsRequireApproval', () => {
    it('returns false when only standard terms', () => {
      expect(termsRequireApproval([ARCHITEX_STANDARD_TERMS])).toBe(false);
    });

    it('returns true when profession-specific terms require approval', () => {
      expect(termsRequireApproval([ARCHITEX_STANDARD_TERMS, ARCHITECT_TERMS])).toBe(true);
    });

    it('returns false for empty array', () => {
      expect(termsRequireApproval([])).toBe(false);
    });
  });

  describe('snapshotTerms', () => {
    it('creates a snapshot with template IDs and clauses', () => {
      const snapshot = snapshotTerms([ARCHITEX_STANDARD_TERMS]);
      expect(snapshot.termsTemplateId).toBe('architex-standard-v2026.1');
      expect(snapshot.termsTemplateVersion).toBe('2026.1');
      expect(snapshot.standardTermsText).toBeTruthy();
      expect(snapshot.standardTermsText!.length).toBeGreaterThan(50);
      expect(snapshot.validityPeriodDays).toBe(14);
      expect(snapshot.acceptanceMethod).toBe('digital_acceptance');
    });

    it('handles multiple templates', () => {
      const snapshot = snapshotTerms([ARCHITEX_STANDARD_TERMS, ARCHITECT_TERMS]);
      expect(snapshot.standardTermsText).toContain('Fees exclude statutory');
      expect(snapshot.standardTermsText).toContain('SACAP');
    });

    it('applies overrides', () => {
      const snapshot = snapshotTerms(
        [ARCHITEX_STANDARD_TERMS],
        { customTermsText: 'Custom clause', validityPeriodDays: 30, acceptanceMethod: 'signature_upload' },
      );
      expect(snapshot.customTermsText).toBe('Custom clause');
      expect(snapshot.validityPeriodDays).toBe(30);
      expect(snapshot.acceptanceMethod).toBe('signature_upload');
    });

    it('deduplicates client responsibilities across templates', () => {
      const snapshot = snapshotTerms([ARCHITEX_STANDARD_TERMS, ARCHITECT_TERMS]);
      const responsibilities = snapshot.clientResponsibilities ?? [];
      // Should have unique entries
      expect(new Set(responsibilities).size).toBe(responsibilities.length);
    });
  });

  describe('calculateExpiryDate', () => {
    it('calculates expiry from a given date', () => {
      const from = new Date('2026-06-01');
      const expiry = calculateExpiryDate(14, from);
      expect(new Date(expiry).toISOString()).toBe('2026-06-15T00:00:00.000Z');
    });
  });

  describe('isProposalExpired', () => {
    it('returns false when within validity period', () => {
      const issuedAt = '2026-06-01T00:00:00.000Z';
      const now = new Date('2026-06-10');
      expect(isProposalExpired(issuedAt, 14, now)).toBe(false);
    });

    it('returns true when past validity period', () => {
      const issuedAt = '2026-06-01T00:00:00.000Z';
      const now = new Date('2026-06-20');
      expect(isProposalExpired(issuedAt, 14, now)).toBe(true);
    });
  });

  describe('resolveTermsSnapshot', () => {
    it('resolves a frozen snapshot back to displayable format', () => {
      const snapshot = snapshotTerms([ARCHITEX_STANDARD_TERMS]);
      const resolved = resolveTermsSnapshot(snapshot);
      expect(resolved.templateId).toBe('architex-standard-v2026.1');
      expect(resolved.version).toBe('2026.1');
      expect(resolved.clauses.length).toBeGreaterThan(0);
    });
  });

  describe('custom terms CRUD', () => {
    const customTemplate = {
      termsId: 'custom-test-v1',
      label: 'Custom Test Terms',
      version: 'v1',
      scope: 'company_saved' as const,
      requiresApproval: false,
      clauses: ['Custom clause 1'],
    };

    it('saves and retrieves custom terms', () => {
      saveCustomTermsTemplate('user-1', customTemplate);
      const available = availableTermsForRole('architect', 'user-1');
      expect(available.some((t) => t.termsId === 'custom-test-v1')).toBe(true);
    });

    it('deletes custom terms', () => {
      saveCustomTermsTemplate('user-2', customTemplate);
      expect(deleteCustomTermsTemplate('user-2', 'custom-test-v1')).toBe(true);
      expect(deleteCustomTermsTemplate('user-2', 'custom-test-v1')).toBe(false);
    });
  });
});
