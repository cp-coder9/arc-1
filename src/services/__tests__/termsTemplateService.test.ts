import { ARCHITEX_STANDARD_TERMS, ARCHITECT_TERMS, ENGINEER_TERMS, QS_TERMS, TOWN_PLANNER_TERMS, TERMS_TEMPLATE_REGISTRY, defaultTermsForRole, listAvailableTemplates, getTermsTemplate, createTermsSnapshot, termsRequireApproval, termsRequireClientAcceptance, saveCustomTermsTemplate, loadCustomTermsTemplate, listCustomTermsTemplates, calculateValidityExpiry, isProposalExpired, daysUntilExpiry, type TermsTemplate } from '../termsTemplateService';

describe('termsTemplateService', () => {
  it('has standard terms with all required fields', () => {
    expect(ARCHITEX_STANDARD_TERMS.templateId).toBe('architex-standard-professional-services');
    expect(ARCHITEX_STANDARD_TERMS.clauses.length).toBeGreaterThan(5);
    expect(ARCHITEX_STANDARD_TERMS.requiresProfessionalApproval).toBe(true);
    expect(ARCHITEX_STANDARD_TERMS.requiresClientAcceptance).toBe(true);
    expect(ARCHITEX_STANDARD_TERMS.defaultValidityDays).toBe(14);
  });

  it('has 5 templates in registry', () => {
    expect(Object.keys(TERMS_TEMPLATE_REGISTRY).length).toBe(5);
  });

  it('returns standard + profession-specific for known roles', () => {
    expect(defaultTermsForRole('architect').length).toBe(2);
    expect(defaultTermsForRole('engineer').length).toBe(2);
    expect(defaultTermsForRole('quantity_surveyor').length).toBe(2);
    expect(defaultTermsForRole('town_planner').length).toBe(2);
    expect(defaultTermsForRole('client').length).toBe(1);
    expect(defaultTermsForRole('contractor').length).toBe(1);
  });

  it('listAvailableTemplates includes profession-specific', () => {
    const tpls = listAvailableTemplates('architect');
    const ids = tpls.map(t => t.templateId);
    expect(ids).toContain('architex-standard-professional-services');
    expect(ids).toContain('architect-profession-specific');
  });

  it('getTermsTemplate retrieves by ID', () => {
    expect(getTermsTemplate('architex-standard-professional-services')).toBeDefined();
    expect(getTermsTemplate('non-existent')).toBeUndefined();
  });

  it('createTermsSnapshot produces valid snapshot', () => {
    const snap = createTermsSnapshot([ARCHITEX_STANDARD_TERMS]);
    expect(snap.termsTemplateId).toContain('architex-standard-professional-services');
    expect(snap.standardTermsText).toBeTruthy();
    expect(snap.paymentTerms).toBeTruthy();
    expect(snap.validityPeriodDays).toBe(14);
    expect(snap.acceptanceMethod).toBe('digital_acceptance');
    expect(snap.clientResponsibilities!.length).toBeGreaterThan(0);
    expect(snap.exclusions!.length).toBeGreaterThan(0);
  });

  it('createTermsSnapshot accepts overrides', () => {
    const snap = createTermsSnapshot([ARCHITEX_STANDARD_TERMS], { customTermsText: 'Custom', validityPeriodDays: 30, acceptanceMethod: 'signature_upload' });
    expect(snap.customTermsText).toBe('Custom');
    expect(snap.validityPeriodDays).toBe(30);
    expect(snap.acceptanceMethod).toBe('signature_upload');
  });

  it('termsRequireApproval detects approval requirement', () => {
    expect(termsRequireApproval([ARCHITECT_TERMS])).toBe(true);
  });

  it('termsRequireClientAcceptance works', () => {
    expect(termsRequireClientAcceptance([ARCHITEX_STANDARD_TERMS])).toBe(true);
  });

  it('saves and retrieves custom terms', () => {
    const tpl: TermsTemplate = { templateId: 'custom-1', version: '1.0', label: 'Custom', scope: 'company_saved', description: 'Desc', clauses: [{ id: 'c1', text: 'Clause', optional: false, category: 'general' }], applicableRoles: ['architect'], requiresProfessionalApproval: true, requiresClientAcceptance: true, defaultValidityDays: 14, defaultPaymentTerms: 'Terms', defaultClientResponsibilities: [], defaultExclusions: [] };
    saveCustomTermsTemplate(tpl);
    expect(loadCustomTermsTemplate('custom-1')).toBeDefined();
    expect(listCustomTermsTemplates('company_saved').length).toBeGreaterThan(0);
  });

  it('throws on wrong scope for custom terms', () => {
    const tpl: TermsTemplate = { templateId: 'bad', version: '1.0', label: 'Bad', scope: 'architex_standard', description: 'D', clauses: [], applicableRoles: ['architect'], requiresProfessionalApproval: true, requiresClientAcceptance: true, defaultValidityDays: 14, defaultPaymentTerms: 'T', defaultClientResponsibilities: [], defaultExclusions: [] };
    expect(() => saveCustomTermsTemplate(tpl)).toThrow();
  });

  it('validity expiry works', () => {
    const expiry = calculateValidityExpiry('2026-06-09T12:00:00Z', 14);
    expect(new Date(expiry).getTime()).toBeGreaterThan(new Date('2026-06-09').getTime());
  });

  it('isProposalExpired detects expired', () => {
    const past = new Date(); past.setDate(past.getDate() - 5);
    expect(isProposalExpired(past.toISOString())).toBe(true);
    const future = new Date(); future.setDate(future.getDate() + 5);
    expect(isProposalExpired(future.toISOString())).toBe(false);
  });

  it('daysUntilExpiry calculates correctly', () => {
    const future = new Date(); future.setDate(future.getDate() + 7);
    const days = daysUntilExpiry(future.toISOString());
    expect(days).toBeGreaterThanOrEqual(6);
    expect(days).toBeLessThanOrEqual(8);
  });
});
