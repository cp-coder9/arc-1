/**
 * EMPr Compliance Service — Unit Tests
 *
 * Tests for audit schedule generation, corrective action state transitions,
 * compliance status derivation, overdue flagging, and incident logging.
 *
 * Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.7, 19.8, 19.9
 */

import { describe, it, expect } from 'vitest';
import {
  generateAuditSchedule,
  transitionCorrectiveAction,
  calculateEMPrComplianceStatus,
  flagOverdueCorrectiveActions,
  logEnvironmentalIncident,
} from '../services/emprCompliance';
import type { EMPrRecord, ECOAudit, CorrectiveAction } from '../types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeEMPr(overrides: Partial<EMPrRecord> = {}): EMPrRecord {
  return {
    id: 'empr-001',
    projectId: 'proj-001',
    emprDocumentRef: 'DOC-EMPr-2025-001',
    approvalDate: '2025-01-15',
    ecoName: 'Jane Green',
    ecoContactEmail: 'jane@eco-consultants.co.za',
    auditFrequency: 'monthly',
    constructionPhase: 'bulk_earthworks',
    createdAt: '2025-01-15T00:00:00Z',
    updatedAt: '2025-01-15T00:00:00Z',
    ...overrides,
  };
}

function makeAudit(overrides: Partial<ECOAudit> = {}): ECOAudit {
  return {
    id: 'audit-001',
    emprId: 'empr-001',
    projectId: 'proj-001',
    auditDate: '2025-03-15',
    auditorName: 'Jane Green',
    overallRating: 'compliant',
    findingsCount: 0,
    correctiveActions: [],
    auditReportRef: 'DOC-AUDIT-001',
    createdAt: '2025-03-15T00:00:00Z',
    ...overrides,
  };
}

function makeCorrectiveAction(overrides: Partial<CorrectiveAction> = {}): CorrectiveAction {
  return {
    id: 'ca-001',
    auditId: 'audit-001',
    findingDescription: 'Dust suppression not adequate on access road',
    severity: 'minor_non_conformance',
    responsibleParty: 'Main Contractor',
    deadline: '2025-04-15',
    state: 'issued',
    stateHistory: [{ state: 'issued', date: '2025-03-15', actor: 'eco-jane' }],
    ...overrides,
  };
}

// ─── generateAuditSchedule ────────────────────────────────────────────────────

describe('generateAuditSchedule', () => {
  it('generates monthly audit dates within a range', () => {
    const empr = makeEMPr({ auditFrequency: 'monthly' });
    const result = generateAuditSchedule(empr, {
      start: new Date('2025-02-01'),
      end: new Date('2025-05-01'),
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    // Monthly = 30 days. From Feb 1 to May 1 ~ 89 days → 3 audits (day 0, 30, 60)
    expect(result.data.length).toBeGreaterThanOrEqual(3);
    expect(result.data[0].scheduledDate).toEqual(new Date('2025-02-01'));
    expect(result.data[0].emprId).toBe('empr-001');
    expect(result.data[0].auditFrequency).toBe('monthly');
  });

  it('generates weekly audit dates within a range', () => {
    const empr = makeEMPr({ auditFrequency: 'weekly' });
    const result = generateAuditSchedule(empr, {
      start: new Date('2025-03-01'),
      end: new Date('2025-03-31'),
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    // Weekly = 7 days. From Mar 1 to Mar 31 → 5 audits (day 0, 7, 14, 21, 28)
    expect(result.data.length).toBe(5);
  });

  it('generates quarterly audit dates within a range', () => {
    const empr = makeEMPr({ auditFrequency: 'quarterly' });
    const result = generateAuditSchedule(empr, {
      start: new Date('2025-01-01'),
      end: new Date('2025-12-31'),
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    // Quarterly = 91 days. Over 365 days → 4–5 audits
    expect(result.data.length).toBeGreaterThanOrEqual(4);
  });

  it('generates fortnightly audit dates', () => {
    const empr = makeEMPr({ auditFrequency: 'fortnightly' });
    const result = generateAuditSchedule(empr, {
      start: new Date('2025-03-01'),
      end: new Date('2025-03-31'),
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    // Fortnightly = 14 days. From Mar 1 to Mar 31 → 3 audits (day 0, 14, 28)
    expect(result.data.length).toBe(3);
  });

  it('returns error when range start is after end', () => {
    const empr = makeEMPr();
    const result = generateAuditSchedule(empr, {
      start: new Date('2025-06-01'),
      end: new Date('2025-01-01'),
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe('INVALID_RANGE');
  });

  it('returns error when empr is null', () => {
    const result = generateAuditSchedule(null as unknown as EMPrRecord, {
      start: new Date('2025-01-01'),
      end: new Date('2025-03-01'),
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe('INVALID_EMPR');
  });

  it('returns single audit when range equals one interval', () => {
    const empr = makeEMPr({ auditFrequency: 'monthly' });
    const result = generateAuditSchedule(empr, {
      start: new Date('2025-03-01'),
      end: new Date('2025-03-01'),
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.length).toBe(1);
  });
});

// ─── transitionCorrectiveAction ───────────────────────────────────────────────

describe('transitionCorrectiveAction', () => {
  it('transitions from issued to in_progress', () => {
    const action = makeCorrectiveAction({ state: 'issued' });
    const result = transitionCorrectiveAction(action, 'in_progress');

    expect(result.valid).toBe(true);
    expect(result.next.state).toBe('in_progress');
    expect(result.next.stateHistory.length).toBe(2);
  });

  it('transitions from in_progress to completed', () => {
    const action = makeCorrectiveAction({ state: 'in_progress' });
    const result = transitionCorrectiveAction(action, 'completed');

    expect(result.valid).toBe(true);
    expect(result.next.state).toBe('completed');
  });

  it('transitions from completed to verified_closed', () => {
    const action = makeCorrectiveAction({ state: 'completed' });
    const result = transitionCorrectiveAction(action, 'verified_closed');

    expect(result.valid).toBe(true);
    expect(result.next.state).toBe('verified_closed');
  });

  it('rejects backward transition', () => {
    const action = makeCorrectiveAction({ state: 'in_progress' });
    const result = transitionCorrectiveAction(action, 'issued');

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Cannot transition backwards');
    expect(result.next.state).toBe('in_progress');
  });

  it('rejects skipping states', () => {
    const action = makeCorrectiveAction({ state: 'issued' });
    const result = transitionCorrectiveAction(action, 'completed');

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Cannot skip states');
    expect(result.next.state).toBe('issued');
  });

  it('rejects transition from terminal state', () => {
    const action = makeCorrectiveAction({ state: 'verified_closed' });
    const result = transitionCorrectiveAction(action, 'issued');

    expect(result.valid).toBe(false);
    expect(result.next.state).toBe('verified_closed');
  });

  it('records state history on valid transition', () => {
    const action = makeCorrectiveAction({
      state: 'issued',
      stateHistory: [{ state: 'issued', date: '2025-03-15', actor: 'eco-jane' }],
    });
    const result = transitionCorrectiveAction(action, 'in_progress');

    expect(result.valid).toBe(true);
    expect(result.next.stateHistory).toHaveLength(2);
    expect(result.next.stateHistory[1].state).toBe('in_progress');
  });
});

// ─── calculateEMPrComplianceStatus ────────────────────────────────────────────

describe('calculateEMPrComplianceStatus', () => {
  it('returns "no_audits" when no audits provided', () => {
    expect(calculateEMPrComplianceStatus([])).toBe('no_audits');
  });

  it('returns "compliant" when most recent audit is compliant', () => {
    const audits = [
      makeAudit({ auditDate: '2025-03-15', overallRating: 'compliant' }),
    ];
    expect(calculateEMPrComplianceStatus(audits)).toBe('compliant');
  });

  it('returns "at_risk" for minor non-conformance', () => {
    const audits = [
      makeAudit({ auditDate: '2025-03-15', overallRating: 'minor_non_conformance' }),
    ];
    expect(calculateEMPrComplianceStatus(audits)).toBe('at_risk');
  });

  it('returns "non_compliant" for major non-conformance', () => {
    const audits = [
      makeAudit({ auditDate: '2025-03-15', overallRating: 'major_non_conformance' }),
    ];
    expect(calculateEMPrComplianceStatus(audits)).toBe('non_compliant');
  });

  it('returns "non_compliant" for critical non-conformance', () => {
    const audits = [
      makeAudit({ auditDate: '2025-03-15', overallRating: 'critical_non_conformance' }),
    ];
    expect(calculateEMPrComplianceStatus(audits)).toBe('non_compliant');
  });

  it('uses the most recent audit by date, not array order', () => {
    const audits = [
      makeAudit({ auditDate: '2025-01-15', overallRating: 'critical_non_conformance' }),
      makeAudit({ auditDate: '2025-04-15', overallRating: 'compliant' }),
      makeAudit({ auditDate: '2025-02-15', overallRating: 'major_non_conformance' }),
    ];
    // Most recent is April 15 → compliant
    expect(calculateEMPrComplianceStatus(audits)).toBe('compliant');
  });
});

// ─── flagOverdueCorrectiveActions ─────────────────────────────────────────────

describe('flagOverdueCorrectiveActions', () => {
  it('flags actions past their deadline that are not completed', () => {
    const actions = [
      makeCorrectiveAction({ state: 'issued', deadline: '2025-03-01' }),
      makeCorrectiveAction({ state: 'in_progress', deadline: '2025-03-10' }),
    ];
    const now = new Date('2025-03-15');
    const result = flagOverdueCorrectiveActions(actions, now);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.length).toBe(2);
    expect(result.data[0].daysPastDeadline).toBe(14);
    expect(result.data[1].daysPastDeadline).toBe(5);
  });

  it('does not flag completed actions', () => {
    const actions = [
      makeCorrectiveAction({ state: 'completed', deadline: '2025-03-01' }),
    ];
    const now = new Date('2025-03-15');
    const result = flagOverdueCorrectiveActions(actions, now);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.length).toBe(0);
  });

  it('does not flag verified_closed actions', () => {
    const actions = [
      makeCorrectiveAction({ state: 'verified_closed', deadline: '2025-03-01' }),
    ];
    const now = new Date('2025-03-15');
    const result = flagOverdueCorrectiveActions(actions, now);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.length).toBe(0);
  });

  it('does not flag actions before their deadline', () => {
    const actions = [
      makeCorrectiveAction({ state: 'issued', deadline: '2025-04-01' }),
    ];
    const now = new Date('2025-03-15');
    const result = flagOverdueCorrectiveActions(actions, now);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.length).toBe(0);
  });

  it('returns empty array when no actions provided', () => {
    const result = flagOverdueCorrectiveActions([], new Date());
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.length).toBe(0);
  });
});

// ─── logEnvironmentalIncident ─────────────────────────────────────────────────

describe('logEnvironmentalIncident', () => {
  it('creates a valid incident record', () => {
    const result = logEnvironmentalIncident({
      id: 'inc-001',
      emprId: 'empr-001',
      projectId: 'proj-001',
      incidentType: 'spill',
      description: 'Diesel spill near stormwater drain',
      locationOnSite: 'Grid C4, parking area',
      photographicEvidence: ['photo-001.jpg', 'photo-002.jpg'],
      immediateRemedialAction: 'Absorbent material deployed, area cordoned off',
      date: '2025-03-10',
      reportedBy: 'site-manager-001',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.incidentType).toBe('spill');
    expect(result.data.description).toBe('Diesel spill near stormwater drain');
    expect(result.data.photographicEvidence).toHaveLength(2);
  });

  it('rejects incident with description exceeding 1000 characters', () => {
    const result = logEnvironmentalIncident({
      id: 'inc-002',
      emprId: 'empr-001',
      projectId: 'proj-001',
      incidentType: 'dust',
      description: 'x'.repeat(1001),
      locationOnSite: 'Grid A1',
      photographicEvidence: [],
      immediateRemedialAction: 'Water applied',
      date: '2025-03-10',
      reportedBy: 'site-manager-001',
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects incident with location exceeding 200 characters', () => {
    const result = logEnvironmentalIncident({
      id: 'inc-003',
      emprId: 'empr-001',
      projectId: 'proj-001',
      incidentType: 'noise',
      description: 'Excessive noise from piling operations',
      locationOnSite: 'x'.repeat(201),
      photographicEvidence: [],
      immediateRemedialAction: 'Operations paused',
      date: '2025-03-10',
      reportedBy: 'site-manager-001',
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects incident with more than 10 photos', () => {
    const result = logEnvironmentalIncident({
      id: 'inc-004',
      emprId: 'empr-001',
      projectId: 'proj-001',
      incidentType: 'water_pollution',
      description: 'Cement slurry entering watercourse',
      locationOnSite: 'Grid B2, river edge',
      photographicEvidence: Array.from({ length: 11 }, (_, i) => `photo-${i}.jpg`),
      immediateRemedialAction: 'Sandbagging deployed',
      date: '2025-03-10',
      reportedBy: 'site-manager-001',
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects incident with missing description', () => {
    const result = logEnvironmentalIncident({
      id: 'inc-005',
      emprId: 'empr-001',
      projectId: 'proj-001',
      incidentType: 'spill',
      description: '',
      locationOnSite: 'Grid A1',
      photographicEvidence: [],
      immediateRemedialAction: '',
      date: '2025-03-10',
      reportedBy: 'site-manager-001',
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe('MISSING_FIELD');
  });

  it('rejects invalid incident type', () => {
    const result = logEnvironmentalIncident({
      id: 'inc-006',
      emprId: 'empr-001',
      projectId: 'proj-001',
      incidentType: 'explosion' as any,
      description: 'Something happened',
      locationOnSite: 'Grid A1',
      photographicEvidence: [],
      immediateRemedialAction: '',
      date: '2025-03-10',
      reportedBy: 'site-manager-001',
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('accepts incident with zero photographic evidence', () => {
    const result = logEnvironmentalIncident({
      id: 'inc-007',
      emprId: 'empr-001',
      projectId: 'proj-001',
      incidentType: 'waste',
      description: 'Illegal dumping of rubble',
      locationOnSite: 'Grid D1',
      photographicEvidence: [],
      immediateRemedialAction: 'Area cleaned, waste removed to licensed facility',
      date: '2025-03-10',
      reportedBy: 'site-manager-001',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.photographicEvidence).toHaveLength(0);
  });
});
