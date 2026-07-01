/**
 * Unit tests for the Command Centre RFI & Site Instruction Service
 *
 * Tests cover:
 * - RFI creation with sequential numbering and Action Centre event generation
 * - RFI retrieval and update
 * - RFI escalation to Critical status
 * - Site Instruction creation and retrieval
 * - Pure utility functions (computeResponseDueDate, shouldEscalate)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Firebase
vi.mock('@/lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn((error: unknown) => { throw error; }),
  OperationType: { CREATE: 'CREATE', UPDATE: 'UPDATE', GET: 'GET', LIST: 'LIST' },
}));

// Track Firestore calls for assertions
const mockTransactionGet = vi.fn();
const mockTransactionSet = vi.fn();
const mockRunTransaction = vi.fn(async (_db: unknown, fn: (t: unknown) => Promise<void>) => {
  await fn({ get: mockTransactionGet, set: mockTransactionSet });
});
const mockAddDoc = vi.fn();
const mockGetDoc = vi.fn();
const mockGetDocs = vi.fn();
const mockUpdateDoc = vi.fn();
const mockDoc = vi.fn(() => ({ id: 'mock-rfi-id' }));
const mockQuery = vi.fn((...args: unknown[]) => args[0]);
const mockOrderBy = vi.fn();

vi.mock('firebase/firestore', () => ({
  addDoc: (...args: unknown[]) => mockAddDoc(...args),
  doc: (...args: unknown[]) => mockDoc(...args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
  runTransaction: (...args: unknown[]) => mockRunTransaction(...args),
  query: (...args: unknown[]) => mockQuery(...args),
  orderBy: (...args: unknown[]) => mockOrderBy(...args),
}));

vi.mock('@/demo-seed/demoFirestore', () => ({
  getDemoCol: vi.fn((...segments: string[]) => `col:${segments.join('/')}`),
  getDemoDoc: vi.fn((...segments: string[]) => `doc:${segments.join('/')}`),
}));

vi.mock('@/services/commandCentre/commandCentreService', () => ({
  recordAudit: vi.fn(),
}));

import {
  createRFI,
  getRFIs,
  updateRFI,
  escalateRFI,
  createSiteInstruction,
  getSiteInstructions,
  computeResponseDueDate,
  shouldEscalate,
  createRFIActionEvent,
  createEscalationActionEvent,
  DEFAULT_RESPONSE_PERIOD_DAYS,
  type CommandCentreRFI,
} from './rfiService';

describe('rfiService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransactionGet.mockResolvedValue({ exists: () => false, data: () => ({}) });
    mockTransactionSet.mockResolvedValue(undefined);
  });

  // ── Pure Utility Tests ───────────────────────────────────────────────────

  describe('computeResponseDueDate', () => {
    it('adds response period days to the raised date', () => {
      const result = computeResponseDueDate('2025-06-01T10:00:00.000Z', 7);
      expect(result).toBe('2025-06-08');
    });

    it('handles month boundary crossing', () => {
      const result = computeResponseDueDate('2025-01-28T00:00:00.000Z', 7);
      expect(result).toBe('2025-02-04');
    });

    it('handles year boundary crossing', () => {
      const result = computeResponseDueDate('2025-12-28T00:00:00.000Z', 7);
      expect(result).toBe('2026-01-04');
    });

    it('uses default period of 7 days', () => {
      expect(DEFAULT_RESPONSE_PERIOD_DAYS).toBe(7);
    });
  });

  describe('shouldEscalate', () => {
    it('returns true when current date is past response due date', () => {
      const rfi = { status: 'pending' as const, responseDueDate: '2025-06-01' };
      const currentDate = new Date('2025-06-02');
      expect(shouldEscalate(rfi, currentDate)).toBe(true);
    });

    it('returns false when current date is before response due date', () => {
      const rfi = { status: 'pending' as const, responseDueDate: '2025-06-10' };
      const currentDate = new Date('2025-06-05');
      expect(shouldEscalate(rfi, currentDate)).toBe(false);
    });

    it('returns false when current date equals response due date', () => {
      const rfi = { status: 'pending' as const, responseDueDate: '2025-06-01' };
      const currentDate = new Date('2025-06-01');
      expect(shouldEscalate(rfi, currentDate)).toBe(false);
    });

    it('returns false for closed RFIs', () => {
      const rfi = { status: 'closed' as const, responseDueDate: '2025-01-01' };
      const currentDate = new Date('2025-06-15');
      expect(shouldEscalate(rfi, currentDate)).toBe(false);
    });

    it('returns false for already critical RFIs', () => {
      const rfi = { status: 'critical' as const, responseDueDate: '2025-01-01' };
      const currentDate = new Date('2025-06-15');
      expect(shouldEscalate(rfi, currentDate)).toBe(false);
    });
  });

  // ── Action Centre Event Tests ────────────────────────────────────────────

  describe('createRFIActionEvent', () => {
    it('creates an action event for the addressee', () => {
      const rfi: CommandCentreRFI = {
        id: 'rfi-1',
        projectId: 'proj-1',
        rfiNumber: 5,
        subject: 'Foundation detail query',
        description: 'Please clarify the foundation detail at gridline B3',
        addresseeId: 'architect-1',
        dateRaised: '2025-06-01T10:00:00.000Z',
        responseDueDate: '2025-06-08',
        status: 'pending',
        originatorId: 'contractor-1',
        priority: 'high',
        createdBy: 'contractor-1',
        createdAt: '2025-06-01T10:00:00.000Z',
        updatedAt: '2025-06-01T10:00:00.000Z',
      };

      const action = createRFIActionEvent(rfi);

      expect(action.projectId).toBe('proj-1');
      expect(action.type).toBe('technical');
      expect(action.title).toBe('RFI #5: Foundation detail query');
      expect(action.assigneeId).toBe('architect-1');
      expect(action.dueDate).toBe('2025-06-08');
      expect(action.priority).toBe('high');
      expect(action.sourceSubsystem).toBe('rfis');
      expect(action.sourceEntityId).toBe('rfi-1');
      expect(action.status).toBe('pending');
    });
  });

  describe('createEscalationActionEvent', () => {
    it('creates a critical action event for the principal agent', () => {
      const rfi: CommandCentreRFI = {
        id: 'rfi-1',
        projectId: 'proj-1',
        rfiNumber: 3,
        subject: 'Steel specification',
        description: 'Need clarification on steel grade',
        addresseeId: 'engineer-1',
        dateRaised: '2025-05-20T10:00:00.000Z',
        responseDueDate: '2025-05-27',
        status: 'critical',
        originatorId: 'contractor-1',
        priority: 'high',
        createdBy: 'contractor-1',
        createdAt: '2025-05-20T10:00:00.000Z',
        updatedAt: '2025-06-01T10:00:00.000Z',
      };

      const action = createEscalationActionEvent(rfi, 'pa-user-1');

      expect(action.projectId).toBe('proj-1');
      expect(action.type).toBe('technical');
      expect(action.title).toContain('CRITICAL');
      expect(action.title).toContain('RFI #3');
      expect(action.assigneeId).toBe('pa-user-1');
      expect(action.priority).toBe('critical');
      expect(action.sourceSubsystem).toBe('rfis');
      expect(action.sourceEntityId).toBe('rfi-1');
    });

    it('defaults to principal_agent when no ID provided', () => {
      const rfi: CommandCentreRFI = {
        id: 'rfi-2',
        projectId: 'proj-1',
        rfiNumber: 1,
        subject: 'Test',
        description: 'Test desc',
        addresseeId: 'user-1',
        dateRaised: '2025-06-01T00:00:00.000Z',
        responseDueDate: '2025-06-08',
        status: 'critical',
        originatorId: 'user-2',
        priority: 'medium',
        createdBy: 'user-2',
        createdAt: '2025-06-01T00:00:00.000Z',
        updatedAt: '2025-06-01T00:00:00.000Z',
      };

      const action = createEscalationActionEvent(rfi);
      expect(action.assigneeId).toBe('principal_agent');
    });
  });

  // ── RFI CRUD Operation Tests ─────────────────────────────────────────────

  describe('createRFI', () => {
    it('creates an RFI with sequential number and returns action event', async () => {
      mockTransactionGet.mockResolvedValue({ exists: () => true, data: () => ({ lastNumber: 4 }) });

      const result = await createRFI('proj-1', {
        subject: 'Foundation query',
        description: 'Clarify detail at gridline A1',
        addresseeId: 'architect-1',
        priority: 'high',
        originatorId: 'contractor-1',
      }, 'contractor-1');

      expect(result.rfi.rfiNumber).toBe(5);
      expect(result.rfi.projectId).toBe('proj-1');
      expect(result.rfi.subject).toBe('Foundation query');
      expect(result.rfi.description).toBe('Clarify detail at gridline A1');
      expect(result.rfi.addresseeId).toBe('architect-1');
      expect(result.rfi.status).toBe('pending');
      expect(result.rfi.priority).toBe('high');
      expect(result.rfi.originatorId).toBe('contractor-1');
      expect(result.action.assigneeId).toBe('architect-1');
      expect(result.action.type).toBe('technical');
    });

    it('starts at RFI #1 when no counter exists', async () => {
      mockTransactionGet.mockResolvedValue({ exists: () => false, data: () => ({}) });

      const result = await createRFI('proj-1', {
        subject: 'First RFI',
        description: 'First query',
        addresseeId: 'user-1',
        priority: 'medium',
        originatorId: 'user-2',
      });

      expect(result.rfi.rfiNumber).toBe(1);
    });

    it('rejects creation with missing required fields', async () => {
      await expect(
        createRFI('proj-1', {
          subject: '',
          description: 'Some desc',
          addresseeId: 'user-1',
          priority: 'medium',
          originatorId: 'user-2',
        }),
      ).rejects.toThrow();
    });

    it('uses custom response period when provided', async () => {
      mockTransactionGet.mockResolvedValue({ exists: () => false, data: () => ({}) });

      const result = await createRFI('proj-1', {
        subject: 'Urgent RFI',
        description: 'Need answer in 3 days',
        addresseeId: 'user-1',
        priority: 'critical',
        originatorId: 'user-2',
        responsePeriodDays: 3,
      });

      // The response due date should be 3 days from creation
      const dateRaised = new Date(result.rfi.dateRaised);
      const expectedDue = new Date(dateRaised);
      expectedDue.setDate(expectedDue.getDate() + 3);
      expect(result.rfi.responseDueDate).toBe(expectedDue.toISOString().split('T')[0]);
    });
  });

  describe('getRFIs', () => {
    it('returns RFIs for a project ordered by number descending', async () => {
      const mockRfis = [
        { id: 'rfi-2', data: () => ({ rfiNumber: 2, subject: 'Second', projectId: 'proj-1' }) },
        { id: 'rfi-1', data: () => ({ rfiNumber: 1, subject: 'First', projectId: 'proj-1' }) },
      ];
      mockGetDocs.mockResolvedValue({ docs: mockRfis });

      const result = await getRFIs('proj-1');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('rfi-2');
      expect(result[0].rfiNumber).toBe(2);
    });

    it('returns empty array when no RFIs exist', async () => {
      mockGetDocs.mockResolvedValue({ docs: [] });
      const result = await getRFIs('proj-1');
      expect(result).toEqual([]);
    });
  });

  describe('updateRFI', () => {
    it('updates RFI fields and records audit', async () => {
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        id: 'rfi-1',
        data: () => ({
          projectId: 'proj-1',
          rfiNumber: 1,
          subject: 'Old subject',
          status: 'pending',
          priority: 'low',
        }),
      });
      mockUpdateDoc.mockResolvedValue(undefined);

      const result = await updateRFI('proj-1', 'rfi-1', {
        subject: 'Updated subject',
        priority: 'high',
      });

      expect(result.subject).toBe('Updated subject');
      expect(result.priority).toBe('high');
      expect(mockUpdateDoc).toHaveBeenCalled();
    });

    it('throws when RFI not found', async () => {
      mockGetDoc.mockResolvedValue({ exists: () => false });

      await expect(
        updateRFI('proj-1', 'nonexistent', { subject: 'Test' }),
      ).rejects.toThrow("RFI 'nonexistent' not found");
    });
  });

  describe('escalateRFI', () => {
    it('escalates a pending RFI to critical and generates action', async () => {
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        id: 'rfi-1',
        data: () => ({
          projectId: 'proj-1',
          rfiNumber: 1,
          subject: 'Overdue RFI',
          status: 'pending',
          addresseeId: 'user-1',
          dateRaised: '2025-05-01T00:00:00.000Z',
          responseDueDate: '2025-05-08',
          priority: 'high',
          originatorId: 'user-2',
          createdBy: 'user-2',
          createdAt: '2025-05-01T00:00:00.000Z',
          updatedAt: '2025-05-01T00:00:00.000Z',
          description: 'Overdue query',
        }),
      });
      mockUpdateDoc.mockResolvedValue(undefined);

      const result = await escalateRFI('proj-1', 'rfi-1', 'pa-1');

      expect(result.rfi.status).toBe('critical');
      expect(result.action.assigneeId).toBe('pa-1');
      expect(result.action.priority).toBe('critical');
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: 'critical' }),
      );
    });

    it('throws when RFI not found', async () => {
      mockGetDoc.mockResolvedValue({ exists: () => false });

      await expect(
        escalateRFI('proj-1', 'nonexistent'),
      ).rejects.toThrow("RFI 'nonexistent' not found");
    });

    it('throws when RFI is already closed', async () => {
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        id: 'rfi-1',
        data: () => ({ status: 'closed', projectId: 'proj-1' }),
      });

      await expect(
        escalateRFI('proj-1', 'rfi-1'),
      ).rejects.toThrow('already closed');
    });

    it('throws when RFI is already critical', async () => {
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        id: 'rfi-1',
        data: () => ({ status: 'critical', projectId: 'proj-1' }),
      });

      await expect(
        escalateRFI('proj-1', 'rfi-1'),
      ).rejects.toThrow('already at Critical status');
    });
  });

  // ── Site Instruction Tests ───────────────────────────────────────────────

  describe('createSiteInstruction', () => {
    it('creates a site instruction and returns it', async () => {
      mockAddDoc.mockResolvedValue({ id: 'si-1' });

      const result = await createSiteInstruction('proj-1', {
        title: 'Change brickwork bond',
        instruction: 'Switch from stretcher bond to English bond at ground floor.',
        issuerId: 'architect-1',
        recipientId: 'contractor-1',
      }, 'architect-1');

      expect(result.id).toBe('si-1');
      expect(result.projectId).toBe('proj-1');
      expect(result.title).toBe('Change brickwork bond');
      expect(result.status).toBe('issued');
      expect(result.complianceConfirmed).toBe(false);
      expect(result.issuerId).toBe('architect-1');
      expect(result.recipientId).toBe('contractor-1');
    });

    it('links to an RFI when linkedRfiId provided', async () => {
      mockAddDoc.mockResolvedValue({ id: 'si-2' });

      const result = await createSiteInstruction('proj-1', {
        title: 'Follow-up instruction',
        instruction: 'Implement response from RFI #3.',
        issuerId: 'architect-1',
        recipientId: 'contractor-1',
        linkedRfiId: 'rfi-3',
      });

      expect(result.linkedRfiId).toBe('rfi-3');
    });

    it('rejects creation with empty title', async () => {
      await expect(
        createSiteInstruction('proj-1', {
          title: '',
          instruction: 'Some instruction',
          issuerId: 'user-1',
          recipientId: 'user-2',
        }),
      ).rejects.toThrow('title is required');
    });

    it('rejects creation with empty instruction', async () => {
      await expect(
        createSiteInstruction('proj-1', {
          title: 'A title',
          instruction: '',
          issuerId: 'user-1',
          recipientId: 'user-2',
        }),
      ).rejects.toThrow('instruction content is required');
    });

    it('rejects creation with empty recipientId', async () => {
      await expect(
        createSiteInstruction('proj-1', {
          title: 'A title',
          instruction: 'Some instruction',
          issuerId: 'user-1',
          recipientId: '',
        }),
      ).rejects.toThrow('recipient is required');
    });
  });

  describe('getSiteInstructions', () => {
    it('returns site instructions ordered by creation date', async () => {
      const mockInstructions = [
        { id: 'si-2', data: () => ({ title: 'Second', projectId: 'proj-1', createdAt: '2025-06-02' }) },
        { id: 'si-1', data: () => ({ title: 'First', projectId: 'proj-1', createdAt: '2025-06-01' }) },
      ];
      mockGetDocs.mockResolvedValue({ docs: mockInstructions });

      const result = await getSiteInstructions('proj-1');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('si-2');
      expect(result[0].title).toBe('Second');
    });

    it('returns empty array when no instructions exist', async () => {
      mockGetDocs.mockResolvedValue({ docs: [] });
      const result = await getSiteInstructions('proj-1');
      expect(result).toEqual([]);
    });
  });
});
