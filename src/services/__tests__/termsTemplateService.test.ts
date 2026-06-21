import { describe, expect, it } from 'vitest';
import {
  ARCHITEX_STANDARD_TERMS,
  ARCHITECT_TERMS,
  ENGINEER_TERMS,
  QS_TERMS,
  TOWN_PLANNER_TERMS,
  BUILT_IN_TERMS_TEMPLATES,
  defaultTermsForRole,
  snapshotTerms,
  calculateExpiryDate,
  isProposalExpired,
  saveCustomTermsTemplate,
  type TermsTemplate as InnerTermsTemplate,
} from '../termsService';
import {
  listAvailableTemplates,
  createTermsSnapshot,
  termsRequireApproval,
  calculateValidityExpiry,
  daysUntilExpiry,
} from '../termsTemplateService';
import type { TermsTemplate } from '../termsTemplateService';

describe('termsTemplateService', () => {
  describe('built-in terms', () => {
    it('contains standard Architex terms with correct fields', () => {
      expect(ARCHITEX_STANDARD_TERMS.termsId).toMatch(/^architex-standard-/);
      expect(ARCHITEX_STANDARD_TERMS.scope).toBe('architex_standard');
      expect(ARCHITEX_STANDARD_TERMS.clauses.length).toBeGreaterThan(0);
    });

    it('contains all 5 template types', () => {
      expect(BUILT_IN_TERMS_TEMPLATES).toHaveLength(5);
    });

    it('has profession-specific terms for each role', () => {
      const arch = BUILT_IN_TERMS_TEMPLATES.find((t) => t.applicableRole === 'architect');
      const eng = BUILT_IN_TERMS_TEMPLATES.find((t) => t.applicableRole === 'engineer');
      const qs = BUILT_IN_TERMS_TEMPLATES.find((t) => t.applicableRole === 'quantity_surveyor');
      const tp = BUILT_IN_TERMS_TEMPLATES.find((t) => t.applicableRole === 'town_planner');
      expect(arch).toBeDefined();
      expect(eng).toBeDefined();
      expect(qs).toBeDefined();
      expect(tp).toBeDefined();
    });
  });

  describe('defaultTermsForRole', () => {
    it('returns standard + architect terms for architect role', () => {
      const terms = defaultTermsForRole('architect');
      expect(terms).toHaveLength(2);
      expect(terms[0].scope).toBe('architex_standard');
      expect(terms[1].applicableRole).toBe('architect');
    });

    it('returns standard + engineer terms for engineer role', () => {
      const terms = defaultTermsForRole('engineer');
      expect(terms).toHaveLength(2);
      expect(terms[1].applicableRole).toBe('engineer');
    });

    it('returns standard + QS terms for quantity_surveyor role', () => {
      const terms = defaultTermsForRole('quantity_surveyor');
      expect(terms).toHaveLength(2);
      expect(terms[1].applicableRole).toBe('quantity_surveyor');
    });

    it('returns standard + town planner terms for town_planner role', () => {
      const terms = defaultTermsForRole('town_planner');
      expect(terms).toHaveLength(2);
      expect(terms[1].applicableRole).toBe('town_planner');
    });

    it('returns only standard terms for roles without profession-specific terms', () => {
      const terms = defaultTermsForRole('contractor');
      expect(terms).toHaveLength(1);
    });

    it('returns only standard terms for client', () => {
      const terms = defaultTermsForRole('client');
      expect(terms).toHaveLength(1);
    });
  });

  describe('listAvailableTemplates', () => {
    it('includes standard + profession-specific for architect', () => {
      const templates = listAvailableTemplates('architect');
      expect(templates.length).toBeGreaterThanOrEqual(2);
      const ids = templates.map((t) => t.templateId);
      expect(ids).toContain(ARCHITEX_STANDARD_TERMS.termsId);
      expect(ids).toContain(ARCHITECT_TERMS.termsId);
    });
  });

  describe('createTermsSnapshot', () => {
    it('creates a snapshot from a single template ID', () => {
      const snapshot = createTermsSnapshot([ARCHITEX_STANDARD_TERMS.termsId]);
      expect(snapshot.termsTemplateId).toBeTruthy();
      expect(snapshot.standardTermsText).toBeTruthy();
      expect(snapshot.paymentTerms).toBeTruthy();
      expect(snapshot.validityPeriodDays).toBeGreaterThan(0);
      expect(snapshot.acceptanceMethod).toBe('digital_acceptance');
    });

    it('accepts override values', () => {
      const snapshot = createTermsSnapshot([ARCHITEX_STANDARD_TERMS.termsId], {
        customTermsText: 'Custom clause here.',
        specialConditions: 'Project-specific condition.',
        paymentTerms: '50% upfront, 50% on completion.',
        validityPeriodDays: 30,
        clientResponsibilities: ['Custom responsibility'],
        exclusions: ['Custom exclusion'],
        acceptanceMethod: 'signature_upload',
      });

      expect(snapshot.customTermsText).toBe('Custom clause here.');
      expect(snapshot.specialConditions).toBe('Project-specific condition.');
      expect(snapshot.paymentTerms).toBe('50% upfront, 50% on completion.');
      expect(snapshot.validityPeriodDays).toBe(30);
      expect(snapshot.clientResponsibilities).toContain('Custom responsibility');
      expect(snapshot.exclusions).toContain('Custom exclusion');
      expect(snapshot.acceptanceMethod).toBe('signature_upload');
    });
  });

  describe('termsRequireApproval', () => {
    it('returns true when professional approval is needed', () => {
      expect(termsRequireApproval([ARCHITECT_TERMS.termsId])).toBe(true);
    });

    it('returns false when no template requires approval', () => {
      expect(termsRequireApproval(['non-existent-id'])).toBe(false);
    });
  });

  describe('validity and expiry', () => {
    it('calculates correct expiry date', () => {
      const issued = '2026-06-09T12:00:00Z';
      const expiry = calculateValidityExpiry(issued, 14);
      const expiryDate = new Date(expiry);
      const issuedDate = new Date(issued);
      const diffDays = Math.round((expiryDate.getTime() - issuedDate.getTime()) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBe(14);
    });

    it('identifies expired proposals', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 5);
      expect(isProposalExpired(pastDate.toISOString(), 1)).toBe(true);
    });

    it('identifies non-expired proposals', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);
      expect(isProposalExpired(futureDate.toISOString(), 20)).toBe(false);
    });

    it('calculates days until expiry', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);
      const days = daysUntilExpiry(futureDate.toISOString());
      expect(days).toBeGreaterThanOrEqual(6);
      expect(days).toBeLessThanOrEqual(8);
    });
  });

  describe('snapshot terms', () => {
    it('merges clauses from multiple templates', () => {
      const snapshot = snapshotTerms([ARCHITEX_STANDARD_TERMS, ARCHITECT_TERMS]);
      expect(snapshot.termsTemplateId).toBeTruthy();
      expect(snapshot.clientResponsibilities!.length).toBeGreaterThan(0);
      expect(snapshot.exclusions!.length).toBeGreaterThan(0);
    });
  });

  describe('custom saved terms', () => {
    const customTerms: InnerTermsTemplate = {
      termsId: 'company-custom-1',
      version: '1.0',
      label: 'My Company Custom Terms',
      scope: 'company_saved',
      clauses: ['Custom clause.'],
      requiresApproval: true,
      createdBy: 'user-1',
      createdAt: new Date().toISOString(),
    };

    it('saves and retrieves custom terms', () => {
      saveCustomTermsTemplate('user-1', customTerms);
      const templates = defaultTermsForRole('architect');
      expect(templates.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('template completeness', () => {
    it('every built-in template has required fields', () => {
      BUILT_IN_TERMS_TEMPLATES.forEach((tpl) => {
        expect(tpl.termsId).toBeTruthy();
        expect(tpl.version).toBeTruthy();
        expect(tpl.label).toBeTruthy();
        expect(tpl.scope).toBeTruthy();
        expect(tpl.clauses.length).toBeGreaterThan(0);
      });
    });

    it('every clause has text', () => {
      ARCHITEX_STANDARD_TERMS.clauses.forEach((clause) => {
        expect(clause).toBeTruthy();
      });
    });
  });
});
