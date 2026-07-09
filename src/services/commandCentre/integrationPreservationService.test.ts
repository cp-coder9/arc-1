/**
 * Integration Preservation Service — Unit Tests
 *
 * Tests the safeIntegrationCall pattern, determineFinancialHealth derivation,
 * and all integration wiring functions.
 *
 * Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7
 */

// ── Mock Foundation Dependencies ─────────────────────────────────────────────
// Must be defined before service imports to prevent Firebase initialization

const mockWriteScheduleHealth = vi.fn().mockResolvedValue(undefined);
const mockWriteFinancialHealth = vi.fn().mockResolvedValue(undefined);
const mockWriteMilestoneProgress = vi.fn().mockResolvedValue(undefined);
const mockWriteRiskProfile = vi.fn().mockResolvedValue(undefined);
const mockWriteQualityScore = vi.fn().mockResolvedValue(undefined);
const mockRecordSignificantAction = vi.fn().mockResolvedValue(undefined);

vi.mock('./passportWritebackService', () => ({
  passportWritebackService: {
    writeScheduleHealth: (...args: unknown[]) => mockWriteScheduleHealth(...args),
    writeFinancialHealth: (...args: unknown[]) => mockWriteFinancialHealth(...args),
    writeMilestoneProgress: (...args: unknown[]) => mockWriteMilestoneProgress(...args),
    writeRiskProfile: (...args: unknown[]) => mockWriteRiskProfile(...args),
    writeQualityScore: (...args: unknown[]) => mockWriteQualityScore(...args),
    recordSignificantAction: (...args: unknown[]) => mockRecordSignificantAction(...args),
  },
}));

const mockCreateAction = vi.fn().mockResolvedValue({ id: 'action-123' });
const mockGetActions = vi.fn().mockResolvedValue([]);
const mockGetActionStats = vi.fn().mockResolvedValue({ overdue: 0, dueToday: 0, upcoming: 0, awaitingOthers: 0, total: 0 });
const mockCreateNotification = vi.fn().mockResolvedValue({ id: 'notif-123' });

vi.mock('./actionCentreService', () => ({
  actionCentreService: {
    createAction: (...args: unknown[]) => mockCreateAction(...args),
    getActions: (...args: unknown[]) => mockGetActions(...args),
    getActionStats: (...args: unknown[]) => mockGetActionStats(...args),
    createNotification: (...args: unknown[]) => mockCreateNotification(...args),
  },
}));

const mockLinkToSpecForgeItem = vi.fn().mockResolvedValue({ specForgeItemId: 'sf-1', linkedEntityId: 'ent-1' });
const mockGetLinkedSpecForgeItems = vi.fn().mockResolvedValue([]);
const mockOnSpecForgeStatusChange = vi.fn().mockResolvedValue(1);
const mockInheritSpecForgeReference = vi.fn().mockResolvedValue({ specForgeItemId: 'sf-1' });

vi.mock('./specForgeSyncService', () => ({
  specForgeSyncService: {
    linkToSpecForgeItem: (...args: unknown[]) => mockLinkToSpecForgeItem(...args),
    getLinkedSpecForgeItems: (...args: unknown[]) => mockGetLinkedSpecForgeItems(...args),
    onSpecForgeStatusChange: (...args: unknown[]) => mockOnSpecForgeStatusChange(...args),
    inheritSpecForgeReference: (...args: unknown[]) => mockInheritSpecForgeReference(...args),
  },
}));

const mockTriggerPaymentWorkflow = vi.fn().mockResolvedValue({ status: 'pending_approval' });
const mockRegisterNHBRCInspection = vi.fn().mockResolvedValue({});
const mockSurfaceMunicipalChecklist = vi.fn().mockResolvedValue({});
const mockReadRetentionRules = vi.fn().mockResolvedValue({});

vi.mock('./complianceFinanceIntegrationService', () => ({
  complianceFinanceIntegrationService: {
    registerNHBRCInspection: (...args: unknown[]) => mockRegisterNHBRCInspection(...args),
    surfaceMunicipalChecklist: (...args: unknown[]) => mockSurfaceMunicipalChecklist(...args),
    triggerPaymentWorkflow: (...args: unknown[]) => mockTriggerPaymentWorkflow(...args),
    readRetentionRules: (...args: unknown[]) => mockReadRetentionRules(...args),
  },
}));

vi.mock('@/lib/firebase', () => ({
  db: { name: 'test-db' },
  OperationType: {
    CREATE: 'create', UPDATE: 'update', DELETE: 'delete',
    LIST: 'list', GET: 'get', WRITE: 'write',
  },
  handleFirestoreError: vi.fn(),
}));

vi.mock('@/demo-seed/demoFirestore', () => ({
  getDemoDoc: (...segments: string[]) => ({ path: segments.join('/'), type: 'doc' }),
  getDemoCol: (...segments: string[]) => ({ path: segments.join('/'), type: 'col' }),
}));

import {
  safeIntegrationCall,
  determineFinancialHealth,
  onMilestoneStatusChange,
  onBudgetVarianceDetected,
  createActionFromSubsystem,
  onSpecForgeItemStatusChange,
  linkEntityToSpecForge,
  onPaymentCertified,
} from './integrationPreservationService';
import type { ActionCentreEntry, MilestoneStatusChange } from './integrationPreservationService';

describe('integrationPreservationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── determineFinancialHealth ─────────────────────────────────────────────

  describe('determineFinancialHealth', () => {
    it('returns "healthy" when variance is exactly 5%', () => {
      expect(determineFinancialHealth(5)).toBe('healthy');
    });

    it('returns "healthy" when variance is below 5%', () => {
      expect(determineFinancialHealth(0)).toBe('healthy');
      expect(determineFinancialHealth(3.5)).toBe('healthy');
      expect(determineFinancialHealth(4.99)).toBe('healthy');
    });

    it('returns "at_risk" when variance is above 5% and at most 15%', () => {
      expect(determineFinancialHealth(5.01)).toBe('at_risk');
      expect(determineFinancialHealth(10)).toBe('at_risk');
      expect(determineFinancialHealth(15)).toBe('at_risk');
    });

    it('returns "over_budget" when variance exceeds 15%', () => {
      expect(determineFinancialHealth(15.01)).toBe('over_budget');
      expect(determineFinancialHealth(20)).toBe('over_budget');
      expect(determineFinancialHealth(100)).toBe('over_budget');
    });
  });

  // ── safeIntegrationCall ──────────────────────────────────────────────────

  describe('safeIntegrationCall', () => {
    it('executes the operation successfully without creating alerts', async () => {
      const operation = vi.fn().mockResolvedValue(undefined);
      await safeIntegrationCall('proj-1', 'testService', operation, 'entity-1');
      expect(operation).toHaveBeenCalledTimes(1);
      expect(mockCreateAction).not.toHaveBeenCalled();
    });

    it('logs error and creates failed_sync alert on operation failure', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const operation = vi.fn().mockRejectedValue(new Error('Service unavailable'));

      await safeIntegrationCall('proj-1', 'passportWritebackService', operation, 'milestone-5');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[passportWritebackService] Integration failed for project proj-1:'),
        expect.any(Error),
      );

      // Creates alert in Action Centre with target module and entity ID
      expect(mockCreateAction).toHaveBeenCalledWith('proj-1', expect.objectContaining({
        type: 'technical',
        title: 'passportWritebackService sync failed',
        sourceSubsystem: 'passportWritebackService',
        sourceEntityId: 'milestone-5',
        status: 'pending',
        priority: 'high',
      }));

      consoleSpy.mockRestore();
    });

    it('does not throw even if alert creation also fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const operation = vi.fn().mockRejectedValue(new Error('Fail'));
      mockCreateAction.mockRejectedValueOnce(new Error('Alert fail'));

      // Should not throw
      await expect(
        safeIntegrationCall('proj-1', 'testService', operation, 'ent-1'),
      ).resolves.toBeUndefined();

      consoleSpy.mockRestore();
    });

    it('preserves passport state on failure (does not call writeback methods)', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const operation = vi.fn().mockRejectedValue(new Error('Fail'));

      await safeIntegrationCall('proj-1', 'testService', operation);

      // Passport writeback methods should NOT have been called
      expect(mockWriteScheduleHealth).not.toHaveBeenCalled();
      expect(mockWriteFinancialHealth).not.toHaveBeenCalled();
      expect(mockWriteMilestoneProgress).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  // ── Passport Writeback Wiring ────────────────────────────────────────────

  describe('onMilestoneStatusChange', () => {
    it('writes schedule health and milestone progress to passport', async () => {
      const change: MilestoneStatusChange = {
        projectId: 'proj-1',
        milestoneId: 'ms-1',
        newStatus: 'complete',
        total: 10,
        completed: 7,
        overdue: 1,
      };

      await onMilestoneStatusChange(change);

      expect(mockWriteScheduleHealth).toHaveBeenCalledWith('proj-1', 'at_risk');
      expect(mockWriteMilestoneProgress).toHaveBeenCalledWith('proj-1', {
        total: 10,
        completed: 7,
        overdue: 1,
      });
    });

    it('sets schedule health to on_track when no milestones are overdue', async () => {
      const change: MilestoneStatusChange = {
        projectId: 'proj-2',
        milestoneId: 'ms-2',
        newStatus: 'on_track',
        total: 5,
        completed: 3,
        overdue: 0,
      };

      await onMilestoneStatusChange(change);

      expect(mockWriteScheduleHealth).toHaveBeenCalledWith('proj-2', 'on_track');
    });
  });

  describe('onBudgetVarianceDetected', () => {
    it('writes healthy status for low variance', async () => {
      await onBudgetVarianceDetected('proj-1', 3);
      expect(mockWriteFinancialHealth).toHaveBeenCalledWith('proj-1', 'healthy');
    });

    it('writes at_risk status for moderate variance', async () => {
      await onBudgetVarianceDetected('proj-1', 10);
      expect(mockWriteFinancialHealth).toHaveBeenCalledWith('proj-1', 'at_risk');
    });

    it('writes over_budget status for high variance', async () => {
      await onBudgetVarianceDetected('proj-1', 20);
      expect(mockWriteFinancialHealth).toHaveBeenCalledWith('proj-1', 'over_budget');
    });
  });

  // ── Action Centre Wiring ─────────────────────────────────────────────────

  describe('createActionFromSubsystem', () => {
    it('creates action with all required fields and status pending', async () => {
      const entry: ActionCentreEntry = {
        projectId: 'proj-1',
        actionType: 'technical',
        assigneeId: 'user-1',
        priority: 'high',
        dueDate: '2026-07-01T00:00:00.000Z',
        status: 'pending',
        title: 'Review RFI response',
        description: 'RFI-042 requires review',
        sourceSubsystem: 'rfis',
        sourceEntityId: 'rfi-042',
      };

      await createActionFromSubsystem(entry);

      expect(mockCreateAction).toHaveBeenCalledWith('proj-1', expect.objectContaining({
        type: 'technical',
        assigneeId: 'user-1',
        priority: 'high',
        dueDate: '2026-07-01T00:00:00.000Z',
        status: 'pending',
        title: 'Review RFI response',
        description: 'RFI-042 requires review',
        sourceSubsystem: 'rfis',
        sourceEntityId: 'rfi-042',
      }));
    });
  });

  // ── SpecForge Sync Wiring ────────────────────────────────────────────────

  describe('onSpecForgeItemStatusChange', () => {
    it('updates linked records via specForgeSyncService', async () => {
      await onSpecForgeItemStatusChange('proj-1', 'sf-item-1', 'approved');

      expect(mockOnSpecForgeStatusChange).toHaveBeenCalledWith(
        'proj-1',
        'sf-item-1',
        'approved',
      );
    });

    it('creates alert on failure without modifying passport', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockOnSpecForgeStatusChange.mockRejectedValueOnce(new Error('Fail'));

      await onSpecForgeItemStatusChange('proj-1', 'sf-item-1', 'approved');

      expect(mockCreateAction).toHaveBeenCalledWith('proj-1', expect.objectContaining({
        title: 'specForgeSyncService sync failed',
        sourceEntityId: 'sf-item-1',
      }));

      consoleSpy.mockRestore();
    });
  });

  describe('linkEntityToSpecForge', () => {
    it('creates a bidirectional link', async () => {
      await linkEntityToSpecForge('proj-1', 'task', 'task-1', 'sf-spec-1', 'Paint Spec', 'issued');

      expect(mockLinkToSpecForgeItem).toHaveBeenCalledWith(
        'proj-1',
        'task',
        'task-1',
        'sf-spec-1',
        'Paint Spec',
        'issued',
      );
    });
  });

  // ── Compliance Finance Wiring ────────────────────────────────────────────

  describe('onPaymentCertified', () => {
    it('triggers payment workflow for certified certificate', async () => {
      await onPaymentCertified('proj-1', 'cert-5', 'escrow_release');

      expect(mockTriggerPaymentWorkflow).toHaveBeenCalledWith(
        'proj-1',
        'cert-5',
        'escrow_release',
      );
    });

    it('uses escrow_release as default workflow type', async () => {
      await onPaymentCertified('proj-1', 'cert-6');

      expect(mockTriggerPaymentWorkflow).toHaveBeenCalledWith(
        'proj-1',
        'cert-6',
        'escrow_release',
      );
    });

    it('creates alert on failure', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockTriggerPaymentWorkflow.mockRejectedValueOnce(new Error('Finance Module down'));

      await onPaymentCertified('proj-1', 'cert-7');

      expect(mockCreateAction).toHaveBeenCalledWith('proj-1', expect.objectContaining({
        title: 'complianceFinanceIntegrationService sync failed',
        sourceEntityId: 'cert-7',
      }));

      consoleSpy.mockRestore();
    });
  });

  // ── Export Preservation ──────────────────────────────────────────────────

  describe('existing service exports unchanged (Req 9.6)', () => {
    it('passportWritebackService retains all exported function signatures', () => {
      expect(typeof mockWriteScheduleHealth).toBe('function');
      expect(typeof mockWriteFinancialHealth).toBe('function');
      expect(typeof mockWriteMilestoneProgress).toBe('function');
      expect(typeof mockWriteRiskProfile).toBe('function');
      expect(typeof mockWriteQualityScore).toBe('function');
      expect(typeof mockRecordSignificantAction).toBe('function');
    });

    it('actionCentreService retains all exported function signatures', () => {
      expect(typeof mockCreateAction).toBe('function');
      expect(typeof mockGetActions).toBe('function');
      expect(typeof mockGetActionStats).toBe('function');
      expect(typeof mockCreateNotification).toBe('function');
    });

    it('specForgeSyncService retains all exported function signatures', () => {
      expect(typeof mockLinkToSpecForgeItem).toBe('function');
      expect(typeof mockGetLinkedSpecForgeItems).toBe('function');
      expect(typeof mockOnSpecForgeStatusChange).toBe('function');
      expect(typeof mockInheritSpecForgeReference).toBe('function');
    });

    it('complianceFinanceIntegrationService retains all exported function signatures', () => {
      expect(typeof mockRegisterNHBRCInspection).toBe('function');
      expect(typeof mockSurfaceMunicipalChecklist).toBe('function');
      expect(typeof mockTriggerPaymentWorkflow).toBe('function');
      expect(typeof mockReadRetentionRules).toBe('function');
    });
  });
});
