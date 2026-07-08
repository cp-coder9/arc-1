/**
 * Unit tests for useComplianceIntegration hook.
 * Validates: Requirements 5.7, 5.10, 5.12, 5.13
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useComplianceIntegration, daysUntil } from './useComplianceIntegration';
import type { ComplianceEntityForWarning } from './useComplianceIntegration';
import { createWorkflowEvent } from '@/services/inboxEventAdapter';
import { createAuditEntry } from '@/services/auditTrailService';

// Mock the services
vi.mock('@/services/inboxEventAdapter', () => ({
  createWorkflowEvent: vi.fn(() => ({
    id: 'wfe-1',
    type: 'risk_detected',
    projectId: 'proj-1',
    title: 'test',
    detail: 'test',
    priority: 'high',
    sourceModule: 'projects',
    assignedRoles: ['architect'],
    createdAt: new Date().toISOString(),
  })),
}));

vi.mock('@/services/auditTrailService', () => ({
  createAuditEntry: vi.fn((params: { actorId: string; action: string; sourceObjectId: string }) => ({
    auditId: 'audit-1',
    actorId: params.actorId,
    action: params.action,
    sourceObjectId: params.sourceObjectId,
    createdAt: new Date().toISOString(),
  })),
}));

const mockedCreateWorkflowEvent = vi.mocked(createWorkflowEvent);
const mockedCreateAuditEntry = vi.mocked(createAuditEntry);

describe('daysUntil', () => {
  it('returns positive days for future dates', () => {
    const now = new Date('2026-07-01');
    const result = daysUntil('2026-07-15', now);
    expect(result).toBe(14);
  });

  it('returns negative days for past dates', () => {
    const now = new Date('2026-07-15');
    const result = daysUntil('2026-07-01', now);
    expect(result).toBeLessThan(0);
  });

  it('returns 0 or 1 for same day', () => {
    const now = new Date('2026-07-01T00:00:00Z');
    const result = daysUntil('2026-07-01', now);
    expect(result).toBeLessThanOrEqual(1);
  });
});

describe('useComplianceIntegration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const defaultParams = {
    projectId: 'proj-1' as string | null,
    userId: 'user-123',
  };

  describe('checkExpiryWarnings', () => {
    it('returns warnings for checks expiring within 30 days', () => {
      const { result } = renderHook(() => useComplianceIntegration(defaultParams));

      const now = new Date();
      const in15Days = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const entities: ComplianceEntityForWarning[] = [
        {
          id: 'ent-1',
          name: 'Test Contractor',
          type: 'contractor',
          checks: {
            health_safety_file: { status: 'compliant', expiresAt: in15Days },
            coida_registration: { status: 'compliant', expiresAt: '2030-01-01' },
          },
        },
      ];

      const warnings = result.current.checkExpiryWarnings(entities);
      expect(warnings.length).toBe(1);
      expect(warnings[0].entityId).toBe('ent-1');
      expect(warnings[0].entityName).toBe('Test Contractor');
      expect(warnings[0].checkType).toBe('health_safety_file');
      expect(warnings[0].daysUntilExpiry).toBeLessThanOrEqual(30);
      expect(warnings[0].daysUntilExpiry).toBeGreaterThan(0);
    });

    it('does not return warnings for checks expiring beyond 30 days', () => {
      const { result } = renderHook(() => useComplianceIntegration(defaultParams));

      const entities: ComplianceEntityForWarning[] = [
        {
          id: 'ent-1',
          name: 'Test Contractor',
          type: 'contractor',
          checks: {
            health_safety_file: { status: 'compliant', expiresAt: '2030-12-31' },
          },
        },
      ];

      const warnings = result.current.checkExpiryWarnings(entities);
      expect(warnings.length).toBe(0);
    });

    it('does not return warnings for already-expired checks', () => {
      const { result } = renderHook(() => useComplianceIntegration(defaultParams));

      const entities: ComplianceEntityForWarning[] = [
        {
          id: 'ent-1',
          name: 'Test Contractor',
          type: 'contractor',
          checks: {
            health_safety_file: { status: 'expired', expiresAt: '2020-01-01' },
          },
        },
      ];

      const warnings = result.current.checkExpiryWarnings(entities);
      expect(warnings.length).toBe(0);
    });

    it('does not return warnings for checks without expiresAt', () => {
      const { result } = renderHook(() => useComplianceIntegration(defaultParams));

      const entities: ComplianceEntityForWarning[] = [
        {
          id: 'ent-1',
          name: 'Test Contractor',
          type: 'contractor',
          checks: {
            health_safety_file: { status: 'pending' },
          },
        },
      ];

      const warnings = result.current.checkExpiryWarnings(entities);
      expect(warnings.length).toBe(0);
    });

    it('sorts warnings by urgency (fewest days first)', () => {
      const { result } = renderHook(() => useComplianceIntegration(defaultParams));

      const now = new Date();
      const in5Days = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const in20Days = new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const entities: ComplianceEntityForWarning[] = [
        {
          id: 'ent-1',
          name: 'Test Contractor',
          type: 'contractor',
          checks: {
            health_safety_file: { status: 'compliant', expiresAt: in20Days },
            coida_registration: { status: 'compliant', expiresAt: in5Days },
          },
        },
      ];

      const warnings = result.current.checkExpiryWarnings(entities);
      expect(warnings.length).toBe(2);
      expect(warnings[0].checkType).toBe('coida_registration');
      expect(warnings[1].checkType).toBe('health_safety_file');
    });
  });

  describe('writeComplianceAuditEvent', () => {
    it('creates an audit event with entity, check type, prev/new status', () => {
      const { result } = renderHook(() => useComplianceIntegration(defaultParams));

      const auditEvent = result.current.writeComplianceAuditEvent(
        'ent-1',
        'health_safety_file',
        'pending',
        'compliant',
      );

      expect(mockedCreateAuditEntry).toHaveBeenCalledWith({
        actorId: 'user-123',
        action: 'compliance_check_update: health_safety_file changed from pending to compliant',
        sourceObjectId: 'ent-1',
      });

      expect(auditEvent.entityId).toBe('ent-1');
      expect(auditEvent.checkType).toBe('health_safety_file');
      expect(auditEvent.previousStatus).toBe('pending');
      expect(auditEvent.newStatus).toBe('compliant');
      expect(auditEvent.actorId).toBe('user-123');
      expect(auditEvent.timestamp).toBeDefined();
    });
  });

  describe('surfaceEarlyWarning', () => {
    it('creates a workflow event for Action Centre', () => {
      const { result } = renderHook(() => useComplianceIntegration(defaultParams));

      act(() => {
        result.current.surfaceEarlyWarning('Test Contractor', 'coida_registration', '2026-08-01');
      });

      expect(mockedCreateWorkflowEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'risk_detected',
          projectId: 'proj-1',
          title: expect.stringContaining('COIDA'),
          detail: expect.stringContaining('Test Contractor'),
          priority: 'high',
          assignedRoles: ['architect', 'site_manager'],
          sourceModule: 'projects',
        }),
      );
    });

    it('does not surface duplicate warnings in same session', () => {
      const { result } = renderHook(() => useComplianceIntegration(defaultParams));

      act(() => {
        result.current.surfaceEarlyWarning('Test Contractor', 'coida_registration', '2026-08-01');
        result.current.surfaceEarlyWarning('Test Contractor', 'coida_registration', '2026-08-01');
      });

      expect(mockedCreateWorkflowEvent).toHaveBeenCalledTimes(1);
    });

    it('does not surface warnings when no project selected', () => {
      const { result } = renderHook(() =>
        useComplianceIntegration({ projectId: null, userId: 'user-123' }),
      );

      act(() => {
        result.current.surfaceEarlyWarning('Test Contractor', 'coida_registration', '2026-08-01');
      });

      expect(mockedCreateWorkflowEvent).not.toHaveBeenCalled();
    });
  });

  describe('surfaceAllWarnings', () => {
    it('surfaces multiple warnings in batch', () => {
      const { result } = renderHook(() => useComplianceIntegration(defaultParams));

      act(() => {
        result.current.surfaceAllWarnings([
          { entityId: 'ent-1', entityName: 'Contractor A', checkType: 'coida_registration', checkLabel: 'COIDA', expiryDate: '2026-08-01', daysUntilExpiry: 10 },
          { entityId: 'ent-2', entityName: 'Contractor B', checkType: 'sars_tax_pin', checkLabel: 'SARS Tax PIN', expiryDate: '2026-08-05', daysUntilExpiry: 14 },
        ]);
      });

      expect(mockedCreateWorkflowEvent).toHaveBeenCalledTimes(2);
    });
  });
});
