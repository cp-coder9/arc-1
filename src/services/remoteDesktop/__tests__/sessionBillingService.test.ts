/**
 * Session Billing Service — Unit Tests
 *
 * Tests billing calculation, reporting, adjustment, and governance logic.
 *
 * Requirements: 12.1, 12.2, 12.4, 12.5, 12.6, 12.7, 14.2, 14.5
 *
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  calculateBilledDuration,
  generateUsageRecord,
  adjustBilledDuration,
  handleZeroMinuteEdge,
  cancelBillingRecord,
  finaliseBilling,
  isFinalisationBlocked,
  sendReminder,
  reportToBillingPipeline,
  getUsageRecord,
  _clearAllUsageRecords,
  _getDeductibleGapThreshold,
  _getMaxReportRetries,
  _getReminderThresholdMs,
  _getFinalisationBlockThresholdMs,
  type SessionBillingInput,
  type DisconnectionGap,
} from '../sessionBillingService';

// ─── Test Helpers ───────────────────────────────────────────────────────────────

function createValidBillingInput(overrides?: Partial<SessionBillingInput>): SessionBillingInput {
  const now = Date.now();
  return {
    sessionId: 'session-001',
    bookingId: 'booking-001',
    ownerUid: 'owner-abc',
    consumerUid: 'consumer-xyz',
    totalConnectedSeconds: 3600, // 1 hour
    disconnectionGaps: [],
    bookingWindowMinutes: 120, // 2 hour window
    sessionEndTimestamp: now,
    ...overrides,
  };
}

// ─── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  _clearAllUsageRecords();
});

// ─── calculateBilledDuration ────────────────────────────────────────────────────

describe('calculateBilledDuration', () => {
  it('should return 0 for 0 connected seconds with no gaps', () => {
    const result = calculateBilledDuration(0, []);
    expect(result).toBe(0);
  });

  it('should round up to the nearest minute', () => {
    // 61 seconds → 2 minutes (rounded up)
    const result = calculateBilledDuration(61, []);
    expect(result).toBe(2);
  });

  it('should return exactly 1 minute for 60 seconds', () => {
    const result = calculateBilledDuration(60, []);
    expect(result).toBe(1);
  });

  it('should return exactly 1 minute for 1 second (rounds up)', () => {
    const result = calculateBilledDuration(1, []);
    expect(result).toBe(1);
  });

  it('should deduct disconnection gaps ≥60 seconds', () => {
    const gaps: DisconnectionGap[] = [
      { durationSeconds: 120 }, // 2 minutes — deductible
    ];
    // 3600s - 120s = 3480s → 58 minutes
    const result = calculateBilledDuration(3600, gaps);
    expect(result).toBe(58);
  });

  it('should NOT deduct disconnection gaps <60 seconds', () => {
    const gaps: DisconnectionGap[] = [
      { durationSeconds: 30 }, // not deductible
      { durationSeconds: 59 }, // not deductible
    ];
    // 3600s - 0s = 3600s → 60 minutes
    const result = calculateBilledDuration(3600, gaps);
    expect(result).toBe(60);
  });

  it('should deduct only gaps ≥60s in a mixed set', () => {
    const gaps: DisconnectionGap[] = [
      { durationSeconds: 30 },  // not deductible
      { durationSeconds: 60 },  // deductible (exactly 60)
      { durationSeconds: 120 }, // deductible
      { durationSeconds: 45 },  // not deductible
    ];
    // 3600s - (60 + 120) = 3420s → 57 minutes
    const result = calculateBilledDuration(3600, gaps);
    expect(result).toBe(57);
  });

  it('should handle negative totalConnectedSeconds gracefully', () => {
    const result = calculateBilledDuration(-100, []);
    expect(result).toBe(0);
  });

  it('should handle large deductions that exceed connected time', () => {
    const gaps: DisconnectionGap[] = [
      { durationSeconds: 5000 },
    ];
    // 3600 - 5000 → clamped to 0
    const result = calculateBilledDuration(3600, gaps);
    expect(result).toBe(0);
  });

  it('should handle exactly 60-second gap as deductible', () => {
    const gaps: DisconnectionGap[] = [
      { durationSeconds: 60 },
    ];
    // 120s - 60s = 60s → 1 minute
    const result = calculateBilledDuration(120, gaps);
    expect(result).toBe(1);
  });

  it('should handle multiple large gaps', () => {
    const gaps: DisconnectionGap[] = [
      { durationSeconds: 300 }, // 5 min
      { durationSeconds: 600 }, // 10 min
    ];
    // 3600 - 900 = 2700s → 45 minutes
    const result = calculateBilledDuration(3600, gaps);
    expect(result).toBe(45);
  });
});

// ─── generateUsageRecord ────────────────────────────────────────────────────────

describe('generateUsageRecord', () => {
  it('should create a valid usage record', () => {
    const input = createValidBillingInput();
    const record = generateUsageRecord(input);

    expect(record.sessionId).toBe(input.sessionId);
    expect(record.bookingId).toBe(input.bookingId);
    expect(record.ownerUid).toBe(input.ownerUid);
    expect(record.consumerUid).toBe(input.consumerUid);
    expect(record.bookedDurationMinutes).toBe(input.bookingWindowMinutes);
    expect(record.actualDurationMinutes).toBe(60); // 3600s → 60 min
    expect(record.billedDurationMinutes).toBe(60);
    expect(record.ownerApproved).toBe(false);
    expect(record.finalisationTimestamp).toBeNull();
    expect(record.status).toBe('pending');
    expect(record.zeroMinuteEdge).toBe(false);
  });

  it('should detect zero-minute edge case', () => {
    const input = createValidBillingInput({
      totalConnectedSeconds: 30, // less than 60s
      disconnectionGaps: [{ durationSeconds: 30 }], // not deductible but still <60s total
    });
    // 30s → rounds up to 1 minute, NOT zero
    const record = generateUsageRecord(input);
    expect(record.zeroMinuteEdge).toBe(false);
    expect(record.actualDurationMinutes).toBe(1);
  });

  it('should flag zero-minute edge when all time is in deductible gaps', () => {
    const input = createValidBillingInput({
      totalConnectedSeconds: 120,
      disconnectionGaps: [{ durationSeconds: 120 }], // deductible: full time deducted
    });
    // 120 - 120 = 0 → zero minute edge
    const record = generateUsageRecord(input);
    expect(record.zeroMinuteEdge).toBe(true);
    expect(record.actualDurationMinutes).toBe(0);
    expect(record.billedDurationMinutes).toBe(0);
  });

  it('should store the record and make it retrievable', () => {
    const input = createValidBillingInput();
    const record = generateUsageRecord(input);

    const retrieved = getUsageRecord(record.sessionId);
    expect(retrieved).toBeDefined();
    expect(retrieved!.sessionId).toBe(record.sessionId);
  });

  it('should reject missing sessionId', () => {
    const input = createValidBillingInput({ sessionId: '' });
    expect(() => generateUsageRecord(input)).toThrow();
  });

  it('should reject missing bookingId', () => {
    const input = createValidBillingInput({ bookingId: '' });
    expect(() => generateUsageRecord(input)).toThrow();
  });

  it('should reject zero booking window', () => {
    const input = createValidBillingInput({ bookingWindowMinutes: 0 });
    expect(() => generateUsageRecord(input)).toThrow();
  });

  it('should reject negative booking window', () => {
    const input = createValidBillingInput({ bookingWindowMinutes: -10 });
    expect(() => generateUsageRecord(input)).toThrow();
  });
});

// ─── adjustBilledDuration ───────────────────────────────────────────────────────

describe('adjustBilledDuration', () => {
  it('should allow owner to adjust billed duration within bounds', () => {
    const input = createValidBillingInput();
    generateUsageRecord(input);

    const updated = adjustBilledDuration({
      sessionId: input.sessionId,
      ownerAdjustedMinutes: 45,
    });

    expect(updated.billedDurationMinutes).toBe(45);
  });

  it('should accept minimum of 1 minute', () => {
    const input = createValidBillingInput();
    generateUsageRecord(input);

    const updated = adjustBilledDuration({
      sessionId: input.sessionId,
      ownerAdjustedMinutes: 1,
    });

    expect(updated.billedDurationMinutes).toBe(1);
  });

  it('should accept maximum equal to booking window', () => {
    const input = createValidBillingInput({ bookingWindowMinutes: 120 });
    generateUsageRecord(input);

    const updated = adjustBilledDuration({
      sessionId: input.sessionId,
      ownerAdjustedMinutes: 120,
    });

    expect(updated.billedDurationMinutes).toBe(120);
  });

  it('should reject less than 1 minute', () => {
    const input = createValidBillingInput();
    generateUsageRecord(input);

    expect(() =>
      adjustBilledDuration({ sessionId: input.sessionId, ownerAdjustedMinutes: 0 }),
    ).toThrow('Billed duration must be at least 1 minute');
  });

  it('should reject exceeding booking window', () => {
    const input = createValidBillingInput({ bookingWindowMinutes: 60 });
    generateUsageRecord(input);

    expect(() =>
      adjustBilledDuration({ sessionId: input.sessionId, ownerAdjustedMinutes: 61 }),
    ).toThrow(/cannot exceed booking window/i);
  });

  it('should reject adjustment on finalised record', () => {
    const input = createValidBillingInput();
    generateUsageRecord(input);
    finaliseBilling(input.sessionId);

    expect(() =>
      adjustBilledDuration({ sessionId: input.sessionId, ownerAdjustedMinutes: 30 }),
    ).toThrow(/finalised/i);
  });

  it('should reject adjustment on blocked record', () => {
    const input = createValidBillingInput({
      sessionEndTimestamp: Date.now() - 15 * 24 * 60 * 60 * 1000, // 15 days ago
    });
    generateUsageRecord(input);

    // Attempt finalisation to trigger blocking
    try {
      finaliseBilling(input.sessionId, Date.now());
    } catch {
      // Expected to throw and block
    }

    expect(() =>
      adjustBilledDuration({ sessionId: input.sessionId, ownerAdjustedMinutes: 30 }),
    ).toThrow(/blocked/i);
  });

  it('should reject adjustment for non-existent session', () => {
    expect(() =>
      adjustBilledDuration({ sessionId: 'non-existent', ownerAdjustedMinutes: 30 }),
    ).toThrow(/not found/i);
  });

  it('should clear zero-minute edge flag when adjusted to ≥1 min', () => {
    const input = createValidBillingInput({
      totalConnectedSeconds: 120,
      disconnectionGaps: [{ durationSeconds: 120 }],
    });
    const record = generateUsageRecord(input);
    expect(record.zeroMinuteEdge).toBe(true);

    const updated = adjustBilledDuration({
      sessionId: input.sessionId,
      ownerAdjustedMinutes: 1,
    });

    expect(updated.zeroMinuteEdge).toBe(false);
  });
});

// ─── handleZeroMinuteEdge ───────────────────────────────────────────────────────

describe('handleZeroMinuteEdge', () => {
  it('should indicate action required when zero-minute edge exists', () => {
    const input = createValidBillingInput({
      totalConnectedSeconds: 120,
      disconnectionGaps: [{ durationSeconds: 120 }],
    });
    generateUsageRecord(input);

    const result = handleZeroMinuteEdge(input.sessionId);
    expect(result.requiresAction).toBe(true);
  });

  it('should indicate no action required for normal records', () => {
    const input = createValidBillingInput();
    generateUsageRecord(input);

    const result = handleZeroMinuteEdge(input.sessionId);
    expect(result.requiresAction).toBe(false);
  });

  it('should throw for non-existent session', () => {
    expect(() => handleZeroMinuteEdge('non-existent')).toThrow(/not found/i);
  });
});

// ─── cancelBillingRecord ────────────────────────────────────────────────────────

describe('cancelBillingRecord', () => {
  it('should cancel a pending record', () => {
    const input = createValidBillingInput();
    generateUsageRecord(input);

    const cancelled = cancelBillingRecord(input.sessionId);
    expect(cancelled.status).toBe('cancelled');
  });

  it('should reject cancelling a finalised record', () => {
    const input = createValidBillingInput();
    generateUsageRecord(input);
    finaliseBilling(input.sessionId);

    expect(() => cancelBillingRecord(input.sessionId)).toThrow(/finalised/i);
  });

  it('should throw for non-existent session', () => {
    expect(() => cancelBillingRecord('non-existent')).toThrow(/not found/i);
  });
});

// ─── finaliseBilling ────────────────────────────────────────────────────────────

describe('finaliseBilling', () => {
  it('should finalise a pending record with owner approval', () => {
    const input = createValidBillingInput();
    generateUsageRecord(input);

    const finalised = finaliseBilling(input.sessionId);

    expect(finalised.status).toBe('finalised');
    expect(finalised.ownerApproved).toBe(true);
    expect(finalised.finalisationTimestamp).toBeGreaterThan(0);
  });

  it('should never auto-finalise (Req 14.2) — requires explicit call', () => {
    const input = createValidBillingInput();
    const record = generateUsageRecord(input);

    // Record should start as non-finalised
    expect(record.ownerApproved).toBe(false);
    expect(record.status).toBe('pending');
    expect(record.finalisationTimestamp).toBeNull();
  });

  it('should reject finalising an already finalised record', () => {
    const input = createValidBillingInput();
    generateUsageRecord(input);
    finaliseBilling(input.sessionId);

    expect(() => finaliseBilling(input.sessionId)).toThrow(/already finalised/i);
  });

  it('should reject finalising a cancelled record', () => {
    const input = createValidBillingInput();
    generateUsageRecord(input);
    cancelBillingRecord(input.sessionId);

    expect(() => finaliseBilling(input.sessionId)).toThrow(/cancelled/i);
  });

  it('should reject finalising with unresolved zero-minute edge', () => {
    const input = createValidBillingInput({
      totalConnectedSeconds: 120,
      disconnectionGaps: [{ durationSeconds: 120 }],
    });
    generateUsageRecord(input);

    expect(() => finaliseBilling(input.sessionId)).toThrow(/0 minutes/i);
  });

  it('should block finalisation after 14 days (Req 14.5)', () => {
    const fifteenDaysAgo = Date.now() - 15 * 24 * 60 * 60 * 1000;
    const input = createValidBillingInput({
      sessionEndTimestamp: fifteenDaysAgo,
    });
    generateUsageRecord(input);

    expect(() => finaliseBilling(input.sessionId, Date.now())).toThrow(/14 days/i);

    // Verify the record is now blocked
    const record = getUsageRecord(input.sessionId);
    expect(record!.status).toBe('blocked');
  });

  it('should allow finalisation within 14 days', () => {
    const thirteenDaysAgo = Date.now() - 13 * 24 * 60 * 60 * 1000;
    const input = createValidBillingInput({
      sessionEndTimestamp: thirteenDaysAgo,
    });
    generateUsageRecord(input);

    const finalised = finaliseBilling(input.sessionId, Date.now());
    expect(finalised.status).toBe('finalised');
  });

  it('should throw for non-existent session', () => {
    expect(() => finaliseBilling('non-existent')).toThrow(/not found/i);
  });
});

// ─── isFinalisationBlocked ──────────────────────────────────────────────────────

describe('isFinalisationBlocked', () => {
  it('should return false within 14 days', () => {
    const now = Date.now();
    const sessionEnd = now - 13 * 24 * 60 * 60 * 1000; // 13 days ago
    expect(isFinalisationBlocked(sessionEnd, now)).toBe(false);
  });

  it('should return true after 14 days', () => {
    const now = Date.now();
    const sessionEnd = now - 15 * 24 * 60 * 60 * 1000; // 15 days ago
    expect(isFinalisationBlocked(sessionEnd, now)).toBe(true);
  });

  it('should return false at exactly 14 days', () => {
    const now = Date.now();
    const sessionEnd = now - 14 * 24 * 60 * 60 * 1000; // exactly 14 days
    // At exactly 14 days, (now - sessionEnd) equals the threshold, NOT greater
    expect(isFinalisationBlocked(sessionEnd, now)).toBe(false);
  });

  it('should return true at 14 days + 1ms', () => {
    const now = Date.now();
    const sessionEnd = now - (14 * 24 * 60 * 60 * 1000 + 1);
    expect(isFinalisationBlocked(sessionEnd, now)).toBe(true);
  });
});

// ─── sendReminder ───────────────────────────────────────────────────────────────

describe('sendReminder', () => {
  it('should send reminder after 48 hours', () => {
    const sessionEnd = Date.now() - 49 * 60 * 60 * 1000; // 49 hours ago
    const input = createValidBillingInput({ sessionEndTimestamp: sessionEnd });
    generateUsageRecord(input);

    const result = sendReminder(input.sessionId, Date.now());
    expect(result.sent).toBe(true);
    expect(result.record.reminderSentAt).toBeGreaterThan(0);
  });

  it('should NOT send reminder before 48 hours', () => {
    const sessionEnd = Date.now() - 24 * 60 * 60 * 1000; // 24 hours ago
    const input = createValidBillingInput({ sessionEndTimestamp: sessionEnd });
    generateUsageRecord(input);

    const result = sendReminder(input.sessionId, Date.now());
    expect(result.sent).toBe(false);
    expect(result.record.reminderSentAt).toBeNull();
  });

  it('should not resend if already sent', () => {
    const sessionEnd = Date.now() - 49 * 60 * 60 * 1000;
    const input = createValidBillingInput({ sessionEndTimestamp: sessionEnd });
    generateUsageRecord(input);

    // First reminder
    sendReminder(input.sessionId, Date.now());
    // Second attempt
    const result = sendReminder(input.sessionId, Date.now());
    expect(result.sent).toBe(false);
  });

  it('should not send reminder for finalised records', () => {
    const sessionEnd = Date.now() - 49 * 60 * 60 * 1000;
    const input = createValidBillingInput({ sessionEndTimestamp: sessionEnd });
    generateUsageRecord(input);
    finaliseBilling(input.sessionId, Date.now());

    const result = sendReminder(input.sessionId, Date.now());
    expect(result.sent).toBe(false);
  });

  it('should not send reminder for cancelled records', () => {
    const sessionEnd = Date.now() - 49 * 60 * 60 * 1000;
    const input = createValidBillingInput({ sessionEndTimestamp: sessionEnd });
    generateUsageRecord(input);
    cancelBillingRecord(input.sessionId);

    const result = sendReminder(input.sessionId, Date.now());
    expect(result.sent).toBe(false);
  });

  it('should throw for non-existent session', () => {
    expect(() => sendReminder('non-existent')).toThrow(/not found/i);
  });
});

// ─── reportToBillingPipeline ────────────────────────────────────────────────────

describe('reportToBillingPipeline', () => {
  it('should succeed on first attempt', async () => {
    const input = createValidBillingInput();
    generateUsageRecord(input);

    const reportFn = vi.fn().mockResolvedValue(true);
    const result = await reportToBillingPipeline(input.sessionId, reportFn);

    expect(result.success).toBe(true);
    expect(result.record).toBeDefined();
    expect(reportFn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and succeed on second attempt', async () => {
    vi.useFakeTimers();
    const input = createValidBillingInput();
    generateUsageRecord(input);

    const reportFn = vi.fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValue(true);

    const promise = reportToBillingPipeline(input.sessionId, reportFn);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    expect(reportFn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('should flag as billing-pending after 3 failed attempts', async () => {
    vi.useFakeTimers();
    const input = createValidBillingInput();
    generateUsageRecord(input);

    const reportFn = vi.fn().mockRejectedValue(new Error('Network error'));

    const promise = reportToBillingPipeline(input.sessionId, reportFn);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(false);
    expect(result.retriesExhausted).toBe(true);
    expect(reportFn).toHaveBeenCalledTimes(3);

    const record = getUsageRecord(input.sessionId);
    expect(record!.status).toBe('billing-pending');
    vi.useRealTimers();
  });

  it('should flag as billing-pending when reportFn returns false', async () => {
    vi.useFakeTimers();
    const input = createValidBillingInput();
    generateUsageRecord(input);

    const reportFn = vi.fn().mockResolvedValue(false);

    const promise = reportToBillingPipeline(input.sessionId, reportFn);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(false);
    expect(result.retriesExhausted).toBe(true);
    expect(reportFn).toHaveBeenCalledTimes(3);

    const record = getUsageRecord(input.sessionId);
    expect(record!.status).toBe('billing-pending');
    vi.useRealTimers();
  });

  it('should return error for non-existent session', async () => {
    const reportFn = vi.fn();
    const result = await reportToBillingPipeline('non-existent', reportFn);

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
    expect(reportFn).not.toHaveBeenCalled();
  });
});

// ─── Governance Invariants ──────────────────────────────────────────────────────

describe('Governance Invariants', () => {
  it('billing records are never auto-finalised (Req 14.2, 14.5)', () => {
    const input = createValidBillingInput();
    const record = generateUsageRecord(input);

    // Verify initial state is pending and not approved
    expect(record.ownerApproved).toBe(false);
    expect(record.status).toBe('pending');
    expect(record.finalisationTimestamp).toBeNull();
  });

  it('finalisation requires explicit owner action (Req 14.2)', () => {
    const input = createValidBillingInput();
    generateUsageRecord(input);

    // Only the explicit finaliseBilling() call sets ownerApproved = true
    const finalised = finaliseBilling(input.sessionId);
    expect(finalised.ownerApproved).toBe(true);
  });

  it('blocked records cannot be finalised (Req 14.5)', () => {
    const fifteenDaysAgo = Date.now() - 15 * 24 * 60 * 60 * 1000;
    const input = createValidBillingInput({ sessionEndTimestamp: fifteenDaysAgo });
    generateUsageRecord(input);

    // First attempt blocks the record
    try {
      finaliseBilling(input.sessionId, Date.now());
    } catch {
      // expected
    }

    // Subsequent attempts also fail
    expect(() => finaliseBilling(input.sessionId, Date.now())).toThrow(/blocked/i);
  });
});

// ─── Constants ──────────────────────────────────────────────────────────────────

describe('Constants', () => {
  it('deductible gap threshold is 60 seconds', () => {
    expect(_getDeductibleGapThreshold()).toBe(60);
  });

  it('max report retries is 3', () => {
    expect(_getMaxReportRetries()).toBe(3);
  });

  it('reminder threshold is 48 hours', () => {
    expect(_getReminderThresholdMs()).toBe(48 * 60 * 60 * 1000);
  });

  it('finalisation block threshold is 14 days', () => {
    expect(_getFinalisationBlockThresholdMs()).toBe(14 * 24 * 60 * 60 * 1000);
  });
});
