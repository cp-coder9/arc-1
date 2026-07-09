/**
 * Unit tests for financialActionService
 */
import {
  executeFinancialAction,
  presentFinancialConfirmation,
  DOWNSTREAM_TIMEOUT_MS,
  type FinancialActionPayload,
  type DownstreamService,
} from './financialActionService';

// Mocks are handled by the vitest config aliases for firebase

const basePayload: FinancialActionPayload = {
  projectId: 'proj-001',
  actionType: 'payment_certification',
  entityId: 'cert-001',
  entityType: 'payment_certificate',
  confirmationSummary: 'Certificate #5 for Main Building',
  amount: 250_000,
  actorId: 'user-001',
  actorRole: 'quantity_surveyor',
};

describe('financialActionService', () => {
  describe('presentFinancialConfirmation', () => {
    it('returns true when user confirms', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      expect(presentFinancialConfirmation(basePayload)).toBe(true);
    });

    it('returns false when user dismisses', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      expect(presentFinancialConfirmation(basePayload)).toBe(false);
    });
  });

  describe('executeFinancialAction', () => {
    it('returns cancelled status when user declines confirmation', async () => {
      const result = await executeFinancialAction(
        basePayload,
        [],
        () => false,
      );

      expect(result.confirmed).toBe(false);
      expect(result.actionStatus).toBe('cancelled');
      expect(result.downstreamResults).toHaveLength(0);
    });

    it('returns completed when all downstream services succeed', async () => {
      const services: DownstreamService[] = [
        { name: 'Finance Module', invoke: vi.fn().mockResolvedValue({ status: 'ok' }) },
        { name: 'Payment Gateway', invoke: vi.fn().mockResolvedValue({ status: 'queued' }) },
      ];

      const result = await executeFinancialAction(basePayload, services, () => true);

      expect(result.confirmed).toBe(true);
      expect(result.allDownstreamsSucceeded).toBe(true);
      expect(result.actionStatus).toBe('completed');
      expect(result.downstreamResults).toHaveLength(2);
      expect(result.downstreamResults.every((r) => r.success)).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns completed_with_pending_downstream when a service fails', async () => {
      const services: DownstreamService[] = [
        { name: 'Finance Module', invoke: vi.fn().mockResolvedValue({ status: 'ok' }) },
        { name: 'Compliance Hub', invoke: vi.fn().mockRejectedValue(new Error('Service unavailable')) },
      ];

      const result = await executeFinancialAction(basePayload, services, () => true);

      expect(result.confirmed).toBe(true);
      expect(result.allDownstreamsSucceeded).toBe(false);
      expect(result.actionStatus).toBe('completed_with_pending_downstream');
      expect(result.downstreamResults[0].success).toBe(true);
      expect(result.downstreamResults[1].success).toBe(false);
      expect(result.downstreamResults[1].error).toContain('Compliance Hub');
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Compliance Hub');
    });

    it('handles abort (timeout simulation) as downstream failure', async () => {
      // Simulate what happens when the abort controller triggers (timeout scenario)
      const abortedPromise = () =>
        Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));

      const slowService: DownstreamService = {
        name: 'Slow Service',
        invoke: abortedPromise,
      };

      const result = await executeFinancialAction(
        basePayload,
        [slowService],
        () => true,
      );

      expect(result.allDownstreamsSucceeded).toBe(false);
      expect(result.actionStatus).toBe('completed_with_pending_downstream');
      expect(result.downstreamResults[0].success).toBe(false);
      // Error message should contain the service name
      expect(result.errors[0]).toContain('Slow Service');
    });

    it('records audit entry regardless of downstream outcome', async () => {
      const services: DownstreamService[] = [
        { name: 'Finance Module', invoke: vi.fn().mockRejectedValue(new Error('fail')) },
      ];

      const result = await executeFinancialAction(basePayload, services, () => true);

      // Audit record should still be written (mock returns 'mock-new-id')
      expect(result.auditRecordId).toBe('mock-new-id');
    });
  });

  describe('DOWNSTREAM_TIMEOUT_MS', () => {
    it('is 30 seconds', () => {
      expect(DOWNSTREAM_TIMEOUT_MS).toBe(30_000);
    });
  });
});
