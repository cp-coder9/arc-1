/**
 * Risk Register Service Tests
 *
 * Tests CRUD operations, escalation workflow with Action Centre event creation,
 * severity stats aggregation, validation, and error handling.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
} from 'firebase/firestore';

vi.mock('@/demo-seed/demoFirestore', () => ({
  getDemoDoc: (...segments: string[]) => ({ path: segments.join('/'), type: 'doc' }),
  getDemoCol: (...segments: string[]) => ({ path: segments.join('/'), type: 'col' }),
}));

// Mock recordAudit
const recordAuditMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/services/commandCentre/commandCentreService', () => ({
  recordAudit: (...args: any[]) => recordAuditMock(...args),
}));

// Cast mocks for firebase/firestore functions
const getDocMock = vi.mocked(getDoc);
const getDocsMock = vi.mocked(getDocs);
const addDocMock = vi.mocked(addDoc);
const updateDocMock = vi.mocked(updateDoc);
const queryMock = vi.mocked(query);

describe('riskRegisterService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryMock.mockImplementation((ref: any) => ref);
    addDocMock.mockResolvedValue({ id: 'new-risk-id' } as any);
    updateDocMock.mockResolvedValue(undefined as any);
  });

  describe('createRisk', () => {
    it('creates a risk with valid data and records audit entry', async () => {
      const { createRisk } = await import('./riskRegisterService');

      const risk = await createRisk('proj-1', {
        description: 'Supply chain disruption for steel reinforcement',
        category: 'supply_chain',
        severity: 'high',
        ownerId: 'user-1',
        ownerName: 'John Smith',
        createdBy: 'user-1',
      });

      expect(risk.description).toBe('Supply chain disruption for steel reinforcement');
      expect(risk.category).toBe('supply_chain');
      expect(risk.severity).toBe('high');
      expect(risk.status).toBe('open');
      expect(risk.ownerId).toBe('user-1');
      expect(risk.ownerName).toBe('John Smith');
      expect(risk.projectId).toBe('proj-1');
      expect(risk.createdAt).toBeDefined();
      expect(risk.updatedAt).toBeDefined();
      expect(risk.id).toBeDefined();

      expect(addDocMock).toHaveBeenCalledOnce();
      expect(recordAuditMock).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'proj-1',
          actorId: 'user-1',
          actionType: 'create',
          entityType: 'risk',
        }),
      );
    });

    it('creates a risk with optional mitigationPlan and aiGenerated flag', async () => {
      const { createRisk } = await import('./riskRegisterService');

      const risk = await createRisk('proj-1', {
        description: 'AI-detected schedule risk',
        category: 'resource',
        severity: 'medium',
        ownerId: 'user-2',
        ownerName: 'Jane Doe',
        mitigationPlan: 'Reallocate resources from non-critical tasks',
        createdBy: 'system',
        aiGenerated: true,
      });

      expect(risk.mitigationPlan).toBe('Reallocate resources from non-critical tasks');
      expect(risk.aiGenerated).toBe(true);
    });

    it('rejects risk creation with empty description', async () => {
      const { createRisk } = await import('./riskRegisterService');

      await expect(
        createRisk('proj-1', {
          description: '',
          category: 'safety',
          severity: 'critical',
          ownerId: 'user-1',
          ownerName: 'John',
          createdBy: 'user-1',
        }),
      ).rejects.toThrow('Validation failed');

      expect(addDocMock).not.toHaveBeenCalled();
    });

    it('rejects risk creation with empty ownerId', async () => {
      const { createRisk } = await import('./riskRegisterService');

      await expect(
        createRisk('proj-1', {
          description: 'Valid risk',
          category: 'quality',
          severity: 'low',
          ownerId: '',
          ownerName: 'John',
          createdBy: 'user-1',
        }),
      ).rejects.toThrow('Validation failed');

      expect(addDocMock).not.toHaveBeenCalled();
    });

    it('rejects risk creation with invalid category', async () => {
      const { createRisk } = await import('./riskRegisterService');

      await expect(
        createRisk('proj-1', {
          description: 'Valid risk',
          category: 'unknown_category' as any,
          severity: 'medium',
          ownerId: 'user-1',
          ownerName: 'John',
          createdBy: 'user-1',
        }),
      ).rejects.toThrow('Validation failed');

      expect(addDocMock).not.toHaveBeenCalled();
    });

    it('rejects risk creation with invalid severity', async () => {
      const { createRisk } = await import('./riskRegisterService');

      await expect(
        createRisk('proj-1', {
          description: 'Valid risk',
          category: 'commercial',
          severity: 'extreme' as any,
          ownerId: 'user-1',
          ownerName: 'John',
          createdBy: 'user-1',
        }),
      ).rejects.toThrow('Validation failed');

      expect(addDocMock).not.toHaveBeenCalled();
    });

    it('throws when projectId is empty', async () => {
      const { createRisk } = await import('./riskRegisterService');

      await expect(
        createRisk('', {
          description: 'Valid risk',
          category: 'safety',
          severity: 'high',
          ownerId: 'user-1',
          ownerName: 'John',
          createdBy: 'user-1',
        }),
      ).rejects.toThrow('projectId is required');
    });
  });

  describe('updateRisk', () => {
    const existingRisk = {
      id: 'risk-1',
      projectId: 'proj-1',
      description: 'Original risk description',
      category: 'supply_chain' as const,
      severity: 'medium' as const,
      status: 'open' as const,
      ownerId: 'user-1',
      ownerName: 'Jane Doe',
      createdBy: 'user-1',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    };

    it('updates risk fields and records audit entry', async () => {
      getDocMock.mockResolvedValue({
        exists: () => true,
        data: () => existingRisk,
      } as any);

      const { updateRisk } = await import('./riskRegisterService');

      const result = await updateRisk('proj-1', 'risk-1', {
        severity: 'critical',
        mitigationPlan: 'Engage alternative supplier',
      });

      expect(result.severity).toBe('critical');
      expect(result.mitigationPlan).toBe('Engage alternative supplier');
      expect(result.updatedAt).not.toBe(existingRisk.updatedAt);

      expect(updateDocMock).toHaveBeenCalledOnce();
      expect(recordAuditMock).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'update',
          entityType: 'risk',
          entityId: 'risk-1',
        }),
      );
    });

    it('throws when risk is not found', async () => {
      getDocMock.mockResolvedValue({
        exists: () => false,
      } as any);

      const { updateRisk } = await import('./riskRegisterService');

      await expect(
        updateRisk('proj-1', 'nonexistent', { severity: 'high' }),
      ).rejects.toThrow('not found');
    });
  });

  describe('escalateRisk', () => {
    const existingRisk = {
      id: 'risk-1',
      projectId: 'proj-1',
      description: 'Critical safety concern on scaffolding',
      category: 'safety' as const,
      severity: 'critical' as const,
      status: 'open' as const,
      ownerId: 'user-1',
      ownerName: 'Site Manager',
      createdBy: 'user-1',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    };

    it('changes status to escalated and creates action event', async () => {
      getDocMock.mockResolvedValue({
        exists: () => true,
        data: () => existingRisk,
      } as any);

      const { escalateRisk } = await import('./riskRegisterService');

      const result = await escalateRisk('proj-1', 'risk-1', 'user-2', 'Project Manager');

      expect(result.risk.status).toBe('escalated');
      expect(result.risk.description).toBe(existingRisk.description);

      // Verify action event structure
      expect(result.actionEvent.projectId).toBe('proj-1');
      expect(result.actionEvent.type).toBe('technical');
      expect(result.actionEvent.title).toContain('Risk Escalated');
      expect(result.actionEvent.assigneeId).toBe('principal_agent');
      expect(result.actionEvent.sourceSubsystem).toBe('risk_register');
      expect(result.actionEvent.sourceEntityId).toBe('risk-1');
      expect(result.actionEvent.status).toBe('pending');
      expect(result.actionEvent.priority).toBe('critical');

      expect(updateDocMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: 'escalated' }),
      );

      expect(recordAuditMock).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'proj-1',
          actorId: 'user-2',
          actorName: 'Project Manager',
          actionType: 'escalation',
          entityType: 'risk',
          entityId: 'risk-1',
          before: { status: 'open' },
          after: { status: 'escalated' },
        }),
      );
    });

    it('sets action priority to high for non-critical risks', async () => {
      const highRisk = { ...existingRisk, severity: 'high' as const };
      getDocMock.mockResolvedValue({
        exists: () => true,
        data: () => highRisk,
      } as any);

      const { escalateRisk } = await import('./riskRegisterService');

      const result = await escalateRisk('proj-1', 'risk-1');

      expect(result.actionEvent.priority).toBe('high');
    });

    it('uses risk owner info when actorId/actorName not provided', async () => {
      getDocMock.mockResolvedValue({
        exists: () => true,
        data: () => existingRisk,
      } as any);

      const { escalateRisk } = await import('./riskRegisterService');

      const result = await escalateRisk('proj-1', 'risk-1');

      expect(recordAuditMock).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'user-1',
          actorName: 'Site Manager',
        }),
      );
      expect(result.risk.status).toBe('escalated');
    });

    it('throws when risk is not found', async () => {
      getDocMock.mockResolvedValue({
        exists: () => false,
      } as any);

      const { escalateRisk } = await import('./riskRegisterService');

      await expect(
        escalateRisk('proj-1', 'nonexistent'),
      ).rejects.toThrow('not found');
    });
  });

  describe('getRisks', () => {
    const risksList = [
      {
        id: 'risk-1',
        projectId: 'proj-1',
        description: 'Supply delay',
        category: 'supply_chain',
        severity: 'high',
        status: 'open',
        ownerId: 'user-1',
        ownerName: 'Alice',
        createdBy: 'user-1',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
      {
        id: 'risk-2',
        projectId: 'proj-1',
        description: 'Weather disruption',
        category: 'resource',
        severity: 'medium',
        status: 'mitigating',
        ownerId: 'user-2',
        ownerName: 'Bob',
        createdBy: 'user-2',
        createdAt: '2026-07-02T00:00:00.000Z',
        updatedAt: '2026-07-02T00:00:00.000Z',
      },
    ];

    it('returns all risks for a project', async () => {
      getDocsMock.mockResolvedValue({
        docs: risksList.map((r) => ({
          id: r.id,
          data: () => r,
        })),
      } as any);

      const { getRisks } = await import('./riskRegisterService');

      const risks = await getRisks('proj-1');

      expect(risks).toHaveLength(2);
      expect(risks[0].description).toBe('Supply delay');
      expect(risks[1].description).toBe('Weather disruption');
    });

    it('returns empty array when no risks exist', async () => {
      getDocsMock.mockResolvedValue({
        docs: [],
      } as any);

      const { getRisks } = await import('./riskRegisterService');

      const risks = await getRisks('proj-1');

      expect(risks).toHaveLength(0);
    });
  });

  describe('getRiskStats', () => {
    const risksList = [
      { id: 'r1', severity: 'critical', status: 'open' },
      { id: 'r2', severity: 'critical', status: 'escalated' },
      { id: 'r3', severity: 'high', status: 'open' },
      { id: 'r4', severity: 'medium', status: 'mitigating' },
      { id: 'r5', severity: 'medium', status: 'open' },
      { id: 'r6', severity: 'low', status: 'monitoring' },
    ];

    it('computes correct severity counts', async () => {
      getDocsMock.mockResolvedValue({
        docs: risksList.map((r) => ({
          id: r.id,
          data: () => r,
        })),
      } as any);

      const { getRiskStats } = await import('./riskRegisterService');

      const stats = await getRiskStats('proj-1');

      expect(stats.critical).toBe(2);
      expect(stats.high).toBe(1);
      expect(stats.medium).toBe(2);
      expect(stats.low).toBe(1);
      expect(stats.total).toBe(6);
    });

    it('returns all zeros when no risks exist', async () => {
      getDocsMock.mockResolvedValue({
        docs: [],
      } as any);

      const { getRiskStats } = await import('./riskRegisterService');

      const stats = await getRiskStats('proj-1');

      expect(stats.critical).toBe(0);
      expect(stats.high).toBe(0);
      expect(stats.medium).toBe(0);
      expect(stats.low).toBe(0);
      expect(stats.total).toBe(0);
    });
  });
});
