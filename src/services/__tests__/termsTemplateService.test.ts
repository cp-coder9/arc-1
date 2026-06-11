import {
  ARCHITEX_STANDARD_TERMS,
  ARCHITECT_TERMS,
  ENGINEER_TERMS,
  QS_TERMS,
  TOWN_PLANNER_TERMS,
  TERMS_TEMPLATE_REGISTRY,
  defaultTermsForRole,
  listAvailableTemplates,
  getTermsTemplate,
  createTermsSnapshot,
  termsRequireApproval,
  termsRequireClientAcceptance,
  saveCustomTermsTemplate,
  loadCustomTermsTemplate,
  listCustomTermsTemplates,
  calculateValidityExpiry,
  isProposalExpired,
  daysUntilExpiry,
} from '../termsTemplateService';
import type { TermsTemplate, TermsScope } from '../termsTemplateService';

describe('termsTemplateService', () => {
  describe('TERMS_TEMPLATE_REGISTRY', () => {
    it('contains standard Architex terms', () => {
      expect(ARCHITEX_STANDARD_TERMS.templateId).toBe('architex-standard-professional-services');
      expect(ARCHITEX_STANDARD_TERMS.scope).toBe('architex_standard');
      expect(ARCHITEX_STANDARD_TERMS.clauses.length).toBeGreaterThan(5);
      expect(ARCHITEX_STANDARD_TERMS.requiresProfessionalApproval).toBe(true);
      expect(ARCHITEX_STANDARD_TERMS.requiresClientAcceptance).toBe(true);
    });

    it('contains all 5 template types in registry', () => {
      expect(Object.keys(TERMS_TEMPLATE_REGISTRY)).toHaveLength(5);
      expect(TERMS_TEMPLATE_REGISTRY['architect-profession-specific']).toBeDefined();
      expect(TERMS_TEMPLATE_REGISTRY['engineer-profession-specific']).toBeDefined();
      expect(TERMS_TEMPLATE_REGISTRY['qs-profession-specific']).toBeDefined();
      expect(TERMS_TEMPLATE_REGISTRY['town-planner-profession-specific']).toBeDefined();
    });

    it('has profession-specific clauses for each role', () => {
      expect(ARCHITECT_TERMS.applicableRoles).toEqual(['architect']);
      expect(ENGINEER_TERMS.applicableRoles).toEqual(['engineer']);
      expect(QS_TERMS.applicableRoles).toEqual(['quantity_surveyor']);
      expect(TOWN_PLANNER_TERMS.applicableRoles).toEqual(['town_planner']);
    });

    it('standard terms apply to all professional roles', () => {
      const roles = ['architect', 'engineer', 'quantity_surveyor', 'town_planner',
        'land_surveyor', 'construction_project_manager', 'landscape_architect', 'interior_designer'];
      roles.forEach((role) => {
        expect(ARCHITEX_STANDARD_TERMS.applicableRoles).toContain(role);
      });
    });
  });

  describe('defaultTermsForRole', () => {
    it('returns standard + architect terms for architect role', () => {
      const terms = defaultTermsForRole('architect');
      expect(terms).toHaveLength(2);
      expect(terms[0].templateId).toBe('architex-standard-professional-services');
      expect(terms[1].templateId).toBe('architect-profession-specific');
    });

    it('returns standard + engineer terms for engineer role', () => {
      const terms = defaultTermsForRole('engineer');
      expect(terms).toHaveLength(2);
      expect(terms[1].templateId).toBe('engineer-profession-specific');
    });

    it('returns standard + QS terms for quantity_surveyor role', () => {
      const terms = defaultTermsForRole('quantity_surveyor');
      expect(terms).toHaveLength(2);
      expect(terms[1].templateId).toBe('qs-profession-specific');
    });

    it('returns standard + town planner terms for town_planner role', () => {
      const terms = defaultTermsForRole('town_planner');
      expect(terms).toHaveLength(2);
      expect(terms[1].templateId).toBe('town-planner-profession-specific');
    });

    it('returns only standard terms for roles without profession-specific terms', () => {
      const terms = defaultTermsForRole('contractor');
      expect(terms).toHaveLength(1);
      expect(terms[0].templateId).toBe('architex-standard-professional-services');
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
      expect(ids).toContain('architex-standard-professional-services');
      expect(ids).toContain('architect-profession-specific');
    });
  });

  describe('getTermsTemplate', () => {
    it('retrieves standard terms by ID', () => {
      const tpl = getTermsTemplate('architex-standard-professional-services');
      expect(tpl).toBeDefined();
      expect(tpl!.templateId).toBe('architex-standard-professional-services');
    });

    it('retrieves profession-specific terms by ID', () => {
      const tpl = getTermsTemplate('architect-profession-specific');
      expect(tpl).toBeDefined();
      expect(tpl!.applicableRoles).toContain('architect');
    });

    it('returns undefined for unknown template', () => {
      expect(getTermsTemplate('non-existent')).toBeUndefined();
    });
  });

  describe('createTermsSnapshot', () => {
    it('creates a snapshot from a single template', () => {
      const snapshot = createTermsSnapshot([ARCHITEX_STANDARD_TERMS]);
      expect(snapshot.termsTemplateId).toContain('architex-standard-professional-services');
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
      const snapshot = createTermsSnapshot([ARCHITEX_STANDARD_TERMS, ARCHITECT_TERMS]);
      expect(snapshot.termsTemplateId).toContain('architect-profession-specific');
      expect(snapshot.termsTemplateVersion).toContain('/');
    });

    it('accepts override values', () => {
      const snapshot = createTermsSnapshot([ARCHITEX_STANDARD_TERMS], {
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
      const snapshot = createTermsSnapshot(roles, {
        clientResponsibilities: ['Provide accurate project brief, site information and decision-maker contacts.'],
      });
      // Should not have duplicate entries
      const counts = new Map<string, number>();
      snapshot.clientResponsibilities!.forEach((r) => {
        counts.set(r, (counts.get(r) || 0) + 1);
      });
      counts.forEach((count, resp) => {
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
        requiresProfessionalApproval: false,
        templateId: 'no-approval-test',
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
      templateId: 'company-custom-1',
      version: '1.0',
      label: 'My Company Custom Terms',
      scope: 'company_saved',
      description: 'Custom company terms',
      clauses: [{ id: 'cust-1', text: 'Custom clause.', optional: false, category: 'general' }],
      applicableRoles: ['architect', 'engineer'],
      requiresProfessionalApproval: true,
      requiresClientAcceptance: true,
      defaultValidityDays: 21,
      defaultPaymentTerms: 'Custom payment terms.',
      defaultClientResponsibilities: [],
      defaultExclusions: [],
    };

    it('saves and retrieves custom terms', () => {
      saveCustomTermsTemplate(customTerms);
      const retrieved = loadCustomTermsTemplate('company-custom-1');
      expect(retrieved).toBeDefined();
      expect(retrieved!.label).toBe('My Company Custom Terms');
    });

    it('lists custom terms by scope', () => {
      const company = listCustomTermsTemplates('company_saved');
      expect(company.length).toBeGreaterThan(0);
      expect(company.some((t) => t.templateId === 'company-custom-1')).toBe(true);
    });

    it('throws when custom terms have wrong scope', () => {
      const badTemplate: TermsTemplate = {
        ...customTerms,
        templateId: 'bad-scope',
        scope: 'architex_standard' as TermsScope,
      };
      expect(() => saveCustomTermsTemplate(badTemplate)).toThrow(
        'Custom templates must have scope "company_saved" or "project_specific".',
      );
    });

    it('increments version on save', () => {
      const v1: TermsTemplate = { ...customTerms, templateId: 'versioned', version: '1.0', scope: 'company_saved' };
      saveCustomTermsTemplate(v1);
      const saved = loadCustomTermsTemplate('versioned');
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
      expect(isProposalExpired(pastDate.toISOString())).toBe(true);
    });

    it('identifies non-expired proposals', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);
      expect(isProposalExpired(futureDate.toISOString())).toBe(false);
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
        expect(tpl.templateId).toBeTruthy();
        expect(tpl.version).toBeTruthy();
        expect(tpl.label).toBeTruthy();
        expect(tpl.scope).toBeTruthy();
        expect(tpl.clauses.length).toBeGreaterThan(0);
        expect(tpl.applicableRoles.length).toBeGreaterThan(0);
        expect(tpl.defaultValidityDays).toBeGreaterThan(0);
        expect(tpl.defaultPaymentTerms).toBeTruthy();
      });
    });

    it('every clause has required fields', () => {
      ARCHITEX_STANDARD_TERMS.clauses.forEach((clause) => {
        expect(clause.id).toBeTruthy();
        expect(clause.text).toBeTruthy();
        expect(typeof clause.optional).toBe('boolean');
        expect(clause.category).toBeTruthy();
      });
    });
  });
});
