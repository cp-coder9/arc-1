/**
 * Unit tests for projectPassportService (Pack 2)
 * Tests passport building, team extraction, and status calculations.
 */
import { describe, expect, it } from 'vitest';
import {
  buildProjectPassport,
  extractTeamAppointments,
  calculateApprovalStatus,
  calculateDocumentStatus,
  calculateFinancialStatus,
  calculateReadinessScore,
} from '../masterExpansion/projectPassportService';
import type { ProjectMetadata, ProjectRecord } from '@/types/architexMasterTypes';

function makeRecord(
  overrides: Partial<ProjectRecord> & { id: string },
): ProjectRecord {
  return {
    tenantId: 't1',
    projectId: 'p1',
    phase: 'lead_enquiry',
    moduleKey: 'site_execution',
    recordType: 'site_diary',
    title: 'Test Record',
    status: 'draft',
    payload: {},
    approval: {
      status: 'draft',
      requiredApproverRoles: [],
    },
    audit: {
      createdByUserId: 'u1',
      createdAt: '2026-06-09T00:00:00Z',
    },
    linkedRecordIds: [],
    ...overrides,
  };
}

const metadata: ProjectMetadata = {
  tenantId: 't1',
  projectId: 'p1',
  projectName: 'Test Project',
  clientName: 'Test Client',
  municipality: 'City of Cape Town',
  propertyReference: 'Erf 5678',
  propertyUse: 'Commercial',
  landUseNotes: 'Standard zoning',
  currentPhase: 'construction_execution',
  leadProfessionalRole: 'architect',
};

describe('buildProjectPassport', () => {
  it('builds a full passport from metadata and records', () => {
    const records = [
      makeRecord({
        id: 'r1',
        recordType: 'site_diary',
        approval: { status: 'approved', requiredApproverRoles: [] },
      }),
      makeRecord({
        id: 'r2',
        recordType: 'snag',
        approval: { status: 'approved', requiredApproverRoles: [] },
      }),
      makeRecord({
        id: 'r3',
        recordType: 'payment_certificate',
        approval: { status: 'pending_review', requiredApproverRoles: ['quantity_surveyor'] },
        status: 'pending_review',
      }),
    ];

    const passport = buildProjectPassport(metadata, records);

    expect(passport.projectName).toBe('Test Project');
    expect(passport.clientName).toBe('Test Client');
    expect(passport.municipality).toBe('City of Cape Town');
    expect(passport.currentPhase).toBe('construction_execution');
    expect(passport.totalRecords).toBe(3);
    expect(passport.openRisks).toBeGreaterThanOrEqual(0);
    expect(passport.pendingApprovals).toBe(1);
    expect(passport.outstandingPayments).toBe(1);
    expect(passport.riskLevel).toBeDefined();
    expect(passport.lifecycle).toBeDefined();
  });

  it('sets risk level to low when lifecycle is clear', () => {
    const records = [
      makeRecord({
        id: 'r1',
        recordType: 'site_diary',
        approval: { status: 'approved', requiredApproverRoles: [] },
      }),
      makeRecord({
        id: 'r2',
        recordType: 'snag',
        approval: { status: 'approved', requiredApproverRoles: [] },
      }),
    ];

    const passport = buildProjectPassport(
      { ...metadata, currentPhase: 'lead_enquiry' },
      records,
    );

    expect(passport.riskLevel).toBe('low');
  });

  it('sets approval, document, and financial status', () => {
    const records: ProjectRecord[] = [
      makeRecord({
        id: 'r1',
        recordType: 'municipal_submission_item',
        approval: { status: 'approved', requiredApproverRoles: [] },
      }),
      makeRecord({
        id: 'r2',
        recordType: 'drawing_revision',
        approval: { status: 'issued', requiredApproverRoles: [] },
      }),
      makeRecord({
        id: 'r3',
        recordType: 'payment_certificate',
        approval: { status: 'approved', requiredApproverRoles: [] },
        status: 'paid',
      }),
    ];

    const passport = buildProjectPassport(metadata, records);

    expect(passport.approvalStatus).toBe('approved');
    expect(passport.documentStatus).toBe('issued');
    expect(passport.financialStatus).toBe('current');
  });
});

describe('extractTeamAppointments', () => {
  it('extracts appointments from practice records', () => {
    const records = [
      makeRecord({
        id: 'appt-1',
        recordType: 'practice_record',
        title: 'Architect appointment',
        payload: { role: 'architect', appointedParty: 'Demo Architects', discipline: 'architecture' },
        approval: { status: 'approved', requiredApproverRoles: [] },
      }),
    ];

    const appointments = extractTeamAppointments(records);
    expect(appointments).toHaveLength(1);
    expect(appointments[0].role).toBe('architect');
    expect(appointments[0].appointedParty).toBe('Demo Architects');
    expect(appointments[0].discipline).toBe('architecture');
  });

  it('falls back to verification records with appointment title', () => {
    const records = [
      makeRecord({
        id: 'ver-1',
        recordType: 'verification_record',
        title: 'Appointment verification',
        payload: { role: 'engineer', appointedParty: 'Eng Co' },
        approval: { status: 'issued', requiredApproverRoles: [] },
      }),
    ];

    const appointments = extractTeamAppointments(records);
    expect(appointments).toHaveLength(1);
    expect(appointments[0].role).toBe('engineer');
  });

  it('returns empty array when no appointments found', () => {
    const records = [makeRecord({ id: 'r1', recordType: 'site_diary' })];
    expect(extractTeamAppointments(records)).toEqual([]);
  });
});

describe('calculateApprovalStatus', () => {
  it('returns missing when no approval records', () => {
    expect(calculateApprovalStatus([])).toBe('missing');
  });

  it('returns approved when municipal submission is approved', () => {
    const records = [
      makeRecord({
        id: 'r1',
        recordType: 'municipal_submission_item',
        approval: { status: 'approved', requiredApproverRoles: [] },
      }),
    ];
    expect(calculateApprovalStatus(records)).toBe('approved');
  });

  it('returns pending when record in review', () => {
    const records = [
      makeRecord({
        id: 'r1',
        recordType: 'municipal_submission_item',
        approval: { status: 'pending_review', requiredApproverRoles: [] },
      }),
    ];
    expect(calculateApprovalStatus(records)).toBe('pending');
  });

  it('returns missing when only draft records exist', () => {
    const records = [
      makeRecord({
        id: 'r1',
        recordType: 'municipal_submission_item',
        approval: { status: 'draft', requiredApproverRoles: [] },
      }),
    ];
    expect(calculateApprovalStatus(records)).toBe('missing');
  });
});

describe('calculateDocumentStatus', () => {
  it('returns incomplete with no document records', () => {
    expect(calculateDocumentStatus([])).toBe('incomplete');
  });

  it('returns issued when drawing is issued', () => {
    const records = [
      makeRecord({
        id: 'r1',
        recordType: 'drawing_revision',
        approval: { status: 'issued', requiredApproverRoles: [] },
      }),
    ];
    expect(calculateDocumentStatus(records)).toBe('issued');
  });

  it('returns ready when drawing is pending review', () => {
    const records = [
      makeRecord({
        id: 'r1',
        recordType: 'drawing_revision',
        approval: { status: 'pending_review', requiredApproverRoles: [] },
      }),
    ];
    expect(calculateDocumentStatus(records)).toBe('ready');
  });
});

describe('calculateFinancialStatus', () => {
  it('returns not_started with no financial records', () => {
    expect(calculateFinancialStatus([])).toBe('not_started');
  });

  it('returns pending_review with pending payment', () => {
    const records = [
      makeRecord({
        id: 'r1',
        recordType: 'payment_certificate',
        approval: { status: 'pending_review', requiredApproverRoles: [] },
      }),
    ];
    expect(calculateFinancialStatus(records)).toBe('pending_review');
  });

  it('returns current with approved payment', () => {
    const records = [
      makeRecord({
        id: 'r1',
        recordType: 'payment_certificate',
        approval: { status: 'approved', requiredApproverRoles: [] },
      }),
    ];
    expect(calculateFinancialStatus(records)).toBe('current');
  });
});

describe('calculateReadinessScore', () => {
  it('returns a score between 0 and 100', () => {
    const passport = buildProjectPassport(metadata, [
      makeRecord({
        id: 'r1',
        recordType: 'site_diary',
        approval: { status: 'approved', requiredApproverRoles: [] },
      }),
      makeRecord({
        id: 'r2',
        recordType: 'snag',
        approval: { status: 'approved', requiredApproverRoles: [] },
      }),
    ]);
    const score = calculateReadinessScore(passport);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('returns higher score when all required records are present', () => {
    const records = [
      makeRecord({
        id: 'r1',
        recordType: 'site_diary',
        approval: { status: 'approved', requiredApproverRoles: [] },
      }),
      makeRecord({
        id: 'r2',
        recordType: 'snag',
        approval: { status: 'approved', requiredApproverRoles: [] },
      }),
      makeRecord({
        id: 'r3',
        recordType: 'municipal_submission_item',
        approval: { status: 'approved', requiredApproverRoles: [] },
      }),
    ];

    const passport = buildProjectPassport(metadata, records);
    const score = calculateReadinessScore(passport);
    expect(score).toBeGreaterThan(50);
  });
});
