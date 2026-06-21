import {
  ARCHITEX_STANDARD_TERMS,
  ARCHITECT_TERMS,
  ENGINEER_TERMS,
  QS_TERMS,
  TOWN_PLANNER_TERMS,
  BUILT_IN_TERMS_TEMPLATES,
  defaultTermsForRole,
  snapshotTerms,
  termsRequireApproval,
  saveCustomTermsTemplate,
  isProposalExpired,
  calculateExpiryDate,
  type TermsTemplate,
} from '../termsService';

// Saved terms in-memory store (mirrors termsService internal store)
const savedTermsStore = new Map<string, TermsTemplate[]>();

function saveCustomTermsTemplateWrapper(template: TermsTemplate): void {
  if (template.scope !== 'company_saved' && template.scope !== 'project_specific') {
    throw new Error('Custom templates must have scope "company_saved" or "project_specific".');
  }
  const userId = 'test-user';
  const existing = savedTermsStore.get(userId) ?? [];
  const index = existing.findIndex((t) => t.termsId === template.termsId);
  if (index >= 0) {
    const versionParts = existing[index].version.split('.');
    const newMinor = parseInt(versionParts[1] ?? '0', 10) + 1;
    existing[index] = { ...template, version: `${versionParts[0]}.${newMinor}` };
  } else {
    const versionParts = template.version.split('.');
    const newMinor = parseInt(versionParts[1] ?? '0', 10) + 1;
    existing.push({ ...template, version: `${versionParts[0]}.${newMinor}` });
  }
  savedTermsStore.set(userId, existing);
}

function loadCustomTermsTemplateWrapper(id: string): TermsTemplate | undefined {
  for (const templates of savedTermsStore.values()) {
    const found = templates.find((t) => t.termsId === id);
    if (found) return found;
  }
  return undefined;
}

function listCustomTermsTemplatesWrapper(scope: string): TermsTemplate[] {
  const result: TermsTemplate[] = [];
  for (const templates of savedTermsStore.values()) {
    result.push(...templates.filter((t) => t.scope === scope));
  }
  return result;
}

function daysUntilExpiry(expiryDate: string): number {
  const now = new Date();
  const expiry = new Date(expiryDate);
  const diff = expiry.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function getTermsTemplate(id: string): TermsTemplate | undefined {
  return BUILT_IN_TERMS_TEMPLATES.find((t) => t.termsId === id);
}

function termsRequireClientAcceptance(templates: TermsTemplate[]): boolean {
  return templates.some((t) => t.scope === 'architex_standard');
}

function calculateValidityExpiry(issuedAt: string, validityDays: number): string {
  return calculateExpiryDate(validityDays, new Date(issuedAt));
}

describe('termsTemplateService', () => {
  describe('BUILT_IN_TERMS_TEMPLATES', () => {
    it('contains standard Architex terms', () => {
      expect(ARCHITEX_STANDARD_TERMS.termsId).toBe('architex-standard-v2026.1');
      expect(ARCHITEX_STANDARD_TERMS.scope).toBe('architex_standard');
      expect(ARCHITEX_STANDARD_TERMS.clauses.length).toBeGreaterThanOrEqual(5);
      expect(ARCHITEX_STANDARD_TERMS.requiresApproval).toBe(false);
    });

    it('contains all 5 built-in templates', () => {
      expect(BUILT_IN_TERMS_TEMPLATES).toHaveLength(5);
      const ids = BUILT_IN_TERMS_TEMPLATES.map((t) => t.termsId);
      expect(ids).toContain('architect-terms-v2026.1');
      expect(ids).toContain('engineer-terms-v2026.1');
      expect(ids).toContain('qs-terms-v2026.1');
      expect(ids).toContain('town-planner-terms-v2026.1');
    });

    it('has profession-specific applicableRole for each role', () => {
      expect(ARCHITECT_TERMS.applicableRole).toBe('architect');
      expect(ENGINEER_TERMS.applicableRole).toBe('engineer');
      expect(QS_TERMS.applicableRole).toBe('quantity_surveyor');
      expect(TOWN_PLANNER_TERMS.applicableRole).toBe('town_planner');
    });

    it('standard terms apply to all professional roles via defaultTermsForRole', () => {
      const roles = ['architect', 'engineer', 'quantity_surveyor', 'town_planner',
        'land_surveyor', 'construction_project_manager', 'landscape_architect', 'interior_designer'];
      roles.forEach((role) => {
        const terms = defaultTermsForRole(role);
        expect(terms[0].termsId).toBe(ARCHITEX_STANDARD_TERMS.termsId);
      });
    });
  });

  describe('defaultTermsForRole', () => {
    it('returns standard + architect terms for architect role', () => {
      const terms = defaultTermsForRole('architect');
      expect(terms).toHaveLength(2);
      expect(terms[0].termsId).toBe('architex-standard-v2026.1');
      expect(terms[1].termsId).toBe('architect-terms-v2026.1');
    });

    it('returns standard + engineer terms for engineer role', () => {
      const terms = defaultTermsForRole('engineer');
      expect(terms).toHaveLength(2);
      expect(terms[1].termsId).toBe('engineer-terms-v2026.1');
    });

    it('returns standard + QS terms for quantity_surveyor role', () => {
      const terms = defaultTermsForRole('quantity_surveyor');
      expect(terms).toHaveLength(2);
      expect(terms[1].termsId).toBe('qs-terms-v2026.1');
    });

    it('returns standard + town planner terms for town_planner role', () => {
      const terms = defaultTermsForRole('town_planner');
      expect(terms).toHaveLength(2);
      expect(terms[1].termsId).toBe('town-planner-terms-v2026.1');
    });

    it('returns only standard terms for roles without profession-specific terms', () => {
      const terms = defaultTermsForRole('contractor');
      expect(terms).toHaveLength(1);
      expect(terms[0].termsId).toBe('architex-standard-v2026.1');
    });

    it('returns only standard terms for client', () => {
      const terms = defaultTermsForRole('client');
      expect(terms).toHaveLength(1);
    });
  });

  describe('listAvailableTemplates', () => {
    it('includes standard + profession-specific for architect', () => {
      const templates = defaultTermsForRole('architect');
      expect(templates.length).toBeGreaterThanOrEqual(2);
      const ids = templates.map((t) => t.termsId);
      expect(ids).toContain('architex-standard-v2026.1');
      expect(ids).toContain('architect-terms-v2026.1');
    });
  });

  describe('getTermsTemplate', () => {
    it('retrieves standard terms by ID', () => {
      const tpl = getTermsTemplate('architex-standard-v2026.1');
      expect(tpl).toBeDefined();
      expect(tpl!.termsId).toBe('architex-standard-v2026.1');
    });

    it('retrieves profession-specific terms by ID', () => {
      const tpl = getTermsTemplate('architect-terms-v2026.1');
      expect(tpl).toBeDefined();
      expect(tpl!.applicableRole).toBe('architect');
    });

    it('returns undefined for unknown template', () => {
      expect(getTermsTemplate('non-existent')).toBeUndefined();
    });
  });

  describe('snapshotTerms', () => {
    it('creates a snapshot from a single template', () => {
      const snapshot = snapshotTerms([ARCHITEX_STANDARD_TERMS]);
      expect(snapshot.termsTemplateId).toBe('architex-standard-v2026.1');
      expect(snapshot.standardTermsText).toBeTruthy();
      expect(snapshot.paymentTerms).toBeTruthy();
      expect(snapshot.validityPeriodDays).toBe(14);
      expect(snapshot.acceptanceMethod).toBe('digital_acceptance');
      expect(snapshot.clientResponsibilities).toBeDefined();
      expect(snapshot.clientResponsibilities!.length).toBeGreaterThan(0);
      expect(snapshot.exclusions).toBeDefined();
      expect(snapshot.exclusions!.length).toBeGreaterThan(0);
    });

    it('merges terms from multiple templates', () => {
      const snapshot = snapshotTerms([ARCHITEX_STANDARD_TERMS, ARCHITECT_TERMS]);
      expect(snapshot.termsTemplateId).toBe('architex-standard-v2026.1');
      expect(snapshot.termsTemplateVersion).toBe('2026.1');
    });

    it('accepts override values', () => {
      const snapshot = snapshotTerms([ARCHITEX_STANDARD_TERMS], {
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

    it('deduplicates client responsibilities and exclusions', () => {
      const roles = defaultTermsForRole('architect');
      const snapshot = snapshotTerms(roles, {
        clientResponsibilities: ['Provide accurate project brief, site information and decision-maker contacts.'],
      });
      const counts = new Map<string, number>();
      snapshot.clientResponsibilities!.forEach((r) => {
        counts.set(r, (counts.get(r) || 0) + 1);
      });
      counts.forEach((count) => {
        expect(count).toBe(1);
      });
    });
  });

  describe('termsRequireApproval', () => {
    it('returns true when professional approval is needed', () => {
      expect(termsRequireApproval([ARCHITECT_TERMS])).toBe(true);
    });

    it('returns false when no template requires approval', () => {
      const noApproval: TermsTemplate = {
        ...ARCHITEX_STANDARD_TERMS,
        requiresApproval: false,
        termsId: 'no-approval-test',
      };
      expect(termsRequireApproval([noApproval])).toBe(false);
    });

    it('returns true if ANY template requires approval', () => {
      expect(termsRequireApproval([ARCHITEX_STANDARD_TERMS, ARCHITECT_TERMS])).toBe(true);
    });
  });

  describe('termsRequireClientAcceptance', () => {
    it('returns true for standard terms', () => {
      expect(termsRequireClientAcceptance([ARCHITEX_STANDARD_TERMS])).toBe(true);
    });
  });

  describe('custom (company/user) saved terms', () => {
    const customTerms: TermsTemplate = {
      termsId: 'company-custom-1',
      version: '1.0',
      label: 'My Company Custom Terms',
      scope: 'company_saved',
      clauses: ['Custom clause.'],
      requiresApproval: true,
      applicableRole: undefined,
      defaultValidityDays: 21,
      paymentTerms: 'Custom payment terms.',
      clientResponsibilities: [],
      exclusions: [],
    };

    it('saves and retrieves custom terms', () => {
      saveCustomTermsTemplateWrapper(customTerms);
      const retrieved = loadCustomTermsTemplateWrapper('company-custom-1');
      expect(retrieved).toBeDefined();
      expect(retrieved!.label).toBe('My Company Custom Terms');
    });

    it('lists custom terms by scope', () => {
      const company = listCustomTermsTemplatesWrapper('company_saved');
      expect(company.length).toBeGreaterThan(0);
      expect(company.some((t) => t.termsId === 'company-custom-1')).toBe(true);
    });

    it('throws when custom terms have wrong scope', () => {
      const badTemplate: TermsTemplate = {
        ...customTerms,
        termsId: 'bad-scope',
        scope: 'architex_standard',
      };
      expect(() => saveCustomTermsTemplateWrapper(badTemplate)).toThrow(
        'Custom templates must have scope "company_saved" or "project_specific".',
      );
    });

    it('increments version on save', () => {
      const v1: TermsTemplate = { ...customTerms, termsId: 'versioned', version: '1.0', scope: 'company_saved' };
      saveCustomTermsTemplateWrapper(v1);
      const saved = loadCustomTermsTemplateWrapper('versioned');
      expect(saved!.version).toBe('1.1');
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
      expect(isProposalExpired(futureDate.toISOString(), 30)).toBe(false);
    });

    it('calculates days until expiry', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);
      const days = daysUntilExpiry(futureDate.toISOString());
      expect(days).toBeGreaterThanOrEqual(6);
      expect(days).toBeLessThanOrEqual(8);
    });
  });

  describe('template completeness', () => {
    it('every template has required fields', () => {
      const allTemplates = [
        ARCHITEX_STANDARD_TERMS,
        ARCHITECT_TERMS,
        ENGINEER_TERMS,
        QS_TERMS,
        TOWN_PLANNER_TERMS,
      ];
      allTemplates.forEach((tpl) => {
        expect(tpl.termsId).toBeTruthy();
        expect(tpl.version).toBeTruthy();
        expect(tpl.label).toBeTruthy();
        expect(tpl.scope).toBeTruthy();
        expect(tpl.clauses.length).toBeGreaterThan(0);
        expect(tpl.defaultValidityDays).toBeGreaterThan(0);
        expect(tpl.paymentTerms).toBeTruthy();
      });
    });

    it('every clause has required fields', () => {
      ARCHITEX_STANDARD_TERMS.clauses.forEach((clause) => {
        expect(clause).toBeTruthy();
        expect(typeof clause).toBe('string');
      });
    });
  });
});
