// @vitest-environment node
/**
 * Enquiry Pipeline Service — Unit Tests
 *
 * Tests for:
 * - transitionEnquiry: permitted transitions, terminal state rejection, loss reason enforcement
 * - calculatePipelineMetrics: totals, conversion rate, time per stage, win/loss ratio
 * - evaluateStaleEnquiries: stale detection, terminal state exclusion, threshold handling
 */

import { describe, it, expect } from 'vitest';
import {
  transitionEnquiry,
  calculatePipelineMetrics,
  evaluateStaleEnquiries,
} from '../services/enquiryPipeline';
import type { EnquiryRecord, EnquiryStage } from '../types';

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function makeEnquiry(overrides: Partial<EnquiryRecord> = {}): EnquiryRecord {
  return {
    id: 'enq-1',
    firmId: 'firm-1',
    source: 'referral',
    clientName: 'Test Client',
    clientEmail: 'test@example.com',
    projectDescription: 'Test project',
    estimatedProjectValueZAR: 1_000_000,
    estimatedFeeValueZAR: 100_000,
    discipline: 'architecture',
    enquiryDate: '2025-01-01',
    currentStage: 'lead',
    stageHistory: [{ stage: 'lead', date: '2025-01-01T00:00:00.000Z', actor: 'user-1' }],
    lastActivityDate: '2025-01-01T00:00:00.000Z',
    createdBy: 'user-1',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ─── transitionEnquiry ────────────────────────────────────────────────────────

describe('transitionEnquiry', () => {
  describe('permitted transitions', () => {
    it('should allow lead → quote_sent', () => {
      const enquiry = makeEnquiry({ currentStage: 'lead' });
      const result = transitionEnquiry(enquiry, 'quote_sent');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.next.currentStage).toBe('quote_sent');
        expect(result.data.valid).toBe(true);
      }
    });

    it('should allow quote_sent → quote_accepted', () => {
      const enquiry = makeEnquiry({ currentStage: 'quote_sent' });
      const result = transitionEnquiry(enquiry, 'quote_accepted');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.next.currentStage).toBe('quote_accepted');
      }
    });

    it('should allow quote_sent → lost (with reason)', () => {
      const enquiry = makeEnquiry({ currentStage: 'quote_sent' });
      const result = transitionEnquiry(enquiry, 'lost', { lossReason: 'price' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.next.currentStage).toBe('lost');
        expect(result.data.next.lossReason).toBe('price');
      }
    });

    it('should allow quote_accepted → appointed', () => {
      const enquiry = makeEnquiry({ currentStage: 'quote_accepted' });
      const result = transitionEnquiry(enquiry, 'appointed');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.next.currentStage).toBe('appointed');
      }
    });

    it('should allow appointed → active', () => {
      const enquiry = makeEnquiry({ currentStage: 'appointed' });
      const result = transitionEnquiry(enquiry, 'active');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.next.currentStage).toBe('active');
      }
    });

    it('should allow active → complete', () => {
      const enquiry = makeEnquiry({ currentStage: 'active' });
      const result = transitionEnquiry(enquiry, 'complete');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.next.currentStage).toBe('complete');
      }
    });

    it('should allow active → on_hold', () => {
      const enquiry = makeEnquiry({ currentStage: 'active' });
      const result = transitionEnquiry(enquiry, 'on_hold');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.next.currentStage).toBe('on_hold');
      }
    });

    it('should allow on_hold → active', () => {
      const enquiry = makeEnquiry({ currentStage: 'on_hold' });
      const result = transitionEnquiry(enquiry, 'active');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.next.currentStage).toBe('active');
      }
    });

    it('should allow on_hold → lost (with reason)', () => {
      const enquiry = makeEnquiry({ currentStage: 'on_hold' });
      const result = transitionEnquiry(enquiry, 'lost', { lossReason: 'client_cancelled' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.next.currentStage).toBe('lost');
        expect(result.data.next.lossReason).toBe('client_cancelled');
      }
    });
  });

  describe('invalid transitions', () => {
    it('should reject lead → appointed (must go through quote_sent)', () => {
      const enquiry = makeEnquiry({ currentStage: 'lead' });
      const result = transitionEnquiry(enquiry, 'appointed');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_TRANSITION');
      }
    });

    it('should reject lead → lost (not a permitted path)', () => {
      const enquiry = makeEnquiry({ currentStage: 'lead' });
      const result = transitionEnquiry(enquiry, 'lost', { lossReason: 'price' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_TRANSITION');
      }
    });

    it('should reject appointed → lost (not in permitted transitions)', () => {
      const enquiry = makeEnquiry({ currentStage: 'appointed' });
      const result = transitionEnquiry(enquiry, 'lost', { lossReason: 'price' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_TRANSITION');
      }
    });

    it('should reject complete → active (complete is terminal)', () => {
      const enquiry = makeEnquiry({ currentStage: 'complete' });
      const result = transitionEnquiry(enquiry, 'active');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TERMINAL_STAGE');
      }
    });
  });

  describe('terminal stage enforcement', () => {
    it('should reject any transition from "lost"', () => {
      const enquiry = makeEnquiry({ currentStage: 'lost', lossReason: 'price' });
      const result = transitionEnquiry(enquiry, 'lead');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TERMINAL_STAGE');
      }
    });

    it('should reject any transition from "complete"', () => {
      const enquiry = makeEnquiry({ currentStage: 'complete' });
      const result = transitionEnquiry(enquiry, 'active');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TERMINAL_STAGE');
      }
    });
  });

  describe('loss reason enforcement', () => {
    it('should require lossReason when transitioning to "lost"', () => {
      const enquiry = makeEnquiry({ currentStage: 'quote_sent' });
      const result = transitionEnquiry(enquiry, 'lost');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('LOSS_REASON_REQUIRED');
      }
    });

    it('should accept transition to "lost" with valid lossReason', () => {
      const enquiry = makeEnquiry({ currentStage: 'quote_sent' });
      const result = transitionEnquiry(enquiry, 'lost', { lossReason: 'competitor_won', notes: 'Lost to competitor' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.next.lossReason).toBe('competitor_won');
        expect(result.data.next.lossNotes).toBe('Lost to competitor');
      }
    });
  });

  describe('stageHistory tracking', () => {
    it('should append the new stage to stageHistory', () => {
      const enquiry = makeEnquiry({ currentStage: 'lead' });
      const result = transitionEnquiry(enquiry, 'quote_sent');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.next.stageHistory).toHaveLength(2);
        expect(result.data.next.stageHistory[1].stage).toBe('quote_sent');
      }
    });

    it('should update lastActivityDate on transition', () => {
      const enquiry = makeEnquiry({ currentStage: 'lead', lastActivityDate: '2024-01-01T00:00:00.000Z' });
      const result = transitionEnquiry(enquiry, 'quote_sent');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(new Date(result.data.next.lastActivityDate).getTime()).toBeGreaterThan(
          new Date('2024-01-01T00:00:00.000Z').getTime()
        );
      }
    });
  });
});

// ─── calculatePipelineMetrics ─────────────────────────────────────────────────

describe('calculatePipelineMetrics', () => {
  const now = new Date('2025-06-15T12:00:00.000Z');

  it('should count enquiries by stage', () => {
    const enquiries = [
      makeEnquiry({ currentStage: 'lead' }),
      makeEnquiry({ currentStage: 'lead', id: 'enq-2' }),
      makeEnquiry({ currentStage: 'quote_sent', id: 'enq-3' }),
      makeEnquiry({ currentStage: 'appointed', id: 'enq-4' }),
    ];

    const result = calculatePipelineMetrics(enquiries, now);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.totalByStage.lead).toBe(2);
      expect(result.data.totalByStage.quote_sent).toBe(1);
      expect(result.data.totalByStage.appointed).toBe(1);
      expect(result.data.totalByStage.lost).toBe(0);
    }
  });

  it('should sum fee values by stage', () => {
    const enquiries = [
      makeEnquiry({ currentStage: 'lead', estimatedFeeValueZAR: 50_000 }),
      makeEnquiry({ currentStage: 'lead', estimatedFeeValueZAR: 75_000, id: 'enq-2' }),
      makeEnquiry({ currentStage: 'active', estimatedFeeValueZAR: 200_000, id: 'enq-3' }),
    ];

    const result = calculatePipelineMetrics(enquiries, now);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.feeValueByStage.lead).toBe(125_000);
      expect(result.data.feeValueByStage.active).toBe(200_000);
    }
  });

  it('should calculate conversion rate correctly', () => {
    const enquiries = [
      makeEnquiry({ currentStage: 'appointed', id: 'enq-1', stageHistory: [{ stage: 'lead', date: '2025-01-01T00:00:00.000Z', actor: 'u1' }, { stage: 'appointed', date: '2025-02-01T00:00:00.000Z', actor: 'u1' }] }),
      makeEnquiry({ currentStage: 'lead', id: 'enq-2' }),
      makeEnquiry({ currentStage: 'lost', id: 'enq-3', stageHistory: [{ stage: 'lead', date: '2025-01-01T00:00:00.000Z', actor: 'u1' }, { stage: 'lost', date: '2025-02-01T00:00:00.000Z', actor: 'u1' }] }),
      makeEnquiry({ currentStage: 'active', id: 'enq-4', stageHistory: [{ stage: 'lead', date: '2025-01-01T00:00:00.000Z', actor: 'u1' }, { stage: 'appointed', date: '2025-02-01T00:00:00.000Z', actor: 'u1' }, { stage: 'active', date: '2025-03-01T00:00:00.000Z', actor: 'u1' }] }),
    ];

    const result = calculatePipelineMetrics(enquiries, now);
    expect(result.success).toBe(true);
    if (result.success) {
      // 2 out of 4 reached appointed (enq-1 is appointed, enq-4 reached active which is beyond appointed)
      expect(result.data.conversionRate).toBe(50);
    }
  });

  it('should handle empty enquiry list', () => {
    const result = calculatePipelineMetrics([], now);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.conversionRate).toBe(0);
      expect(result.data.winLossRatioMonth).toBe(0);
      expect(result.data.winLossRatio12Month).toBe(0);
    }
  });

  it('should calculate average time per stage from stageHistory', () => {
    const enquiries = [
      makeEnquiry({
        id: 'enq-1',
        currentStage: 'quote_sent',
        stageHistory: [
          { stage: 'lead', date: '2025-01-01T00:00:00.000Z', actor: 'u1' },
          { stage: 'quote_sent', date: '2025-01-11T00:00:00.000Z', actor: 'u1' }, // 10 days at lead
        ],
      }),
      makeEnquiry({
        id: 'enq-2',
        currentStage: 'quote_sent',
        stageHistory: [
          { stage: 'lead', date: '2025-01-01T00:00:00.000Z', actor: 'u1' },
          { stage: 'quote_sent', date: '2025-01-21T00:00:00.000Z', actor: 'u1' }, // 20 days at lead
        ],
      }),
    ];

    const result = calculatePipelineMetrics(enquiries, now);
    expect(result.success).toBe(true);
    if (result.success) {
      // average of 10 and 20 = 15
      expect(result.data.averageTimePerStage.lead).toBe(15);
    }
  });

  it('should calculate win/loss ratio for current month', () => {
    const monthNow = new Date('2025-06-15T12:00:00.000Z');
    const enquiries = [
      makeEnquiry({
        id: 'enq-1',
        currentStage: 'appointed',
        stageHistory: [
          { stage: 'lead', date: '2025-06-01T00:00:00.000Z', actor: 'u1' },
          { stage: 'appointed', date: '2025-06-05T00:00:00.000Z', actor: 'u1' },
        ],
      }),
      makeEnquiry({
        id: 'enq-2',
        currentStage: 'lost',
        lossReason: 'price',
        stageHistory: [
          { stage: 'lead', date: '2025-06-01T00:00:00.000Z', actor: 'u1' },
          { stage: 'lost', date: '2025-06-10T00:00:00.000Z', actor: 'u1' },
        ],
      }),
      makeEnquiry({
        id: 'enq-3',
        currentStage: 'appointed',
        stageHistory: [
          { stage: 'lead', date: '2025-06-01T00:00:00.000Z', actor: 'u1' },
          { stage: 'appointed', date: '2025-06-12T00:00:00.000Z', actor: 'u1' },
        ],
      }),
    ];

    const result = calculatePipelineMetrics(enquiries, monthNow);
    expect(result.success).toBe(true);
    if (result.success) {
      // 2 wins / 1 loss = 2.0
      expect(result.data.winLossRatioMonth).toBe(2);
    }
  });

  it('should return wins count when there are no losses', () => {
    const monthNow = new Date('2025-06-15T12:00:00.000Z');
    const enquiries = [
      makeEnquiry({
        id: 'enq-1',
        currentStage: 'appointed',
        stageHistory: [
          { stage: 'lead', date: '2025-06-01T00:00:00.000Z', actor: 'u1' },
          { stage: 'appointed', date: '2025-06-05T00:00:00.000Z', actor: 'u1' },
        ],
      }),
    ];

    const result = calculatePipelineMetrics(enquiries, monthNow);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.winLossRatioMonth).toBe(1);
    }
  });
});

// ─── evaluateStaleEnquiries ───────────────────────────────────────────────────

describe('evaluateStaleEnquiries', () => {
  const now = new Date('2025-06-15T12:00:00.000Z');

  it('should flag enquiries inactive for longer than threshold', () => {
    const enquiries = [
      makeEnquiry({
        id: 'stale-1',
        currentStage: 'lead',
        lastActivityDate: '2025-05-01T00:00:00.000Z', // 45 days ago
      }),
      makeEnquiry({
        id: 'fresh-1',
        currentStage: 'lead',
        lastActivityDate: '2025-06-10T00:00:00.000Z', // 5 days ago
      }),
    ];

    const result = evaluateStaleEnquiries(enquiries, now, 30);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('stale-1');
    }
  });

  it('should NOT flag enquiries in terminal states as stale', () => {
    const enquiries = [
      makeEnquiry({
        id: 'lost-1',
        currentStage: 'lost',
        lossReason: 'price',
        lastActivityDate: '2025-01-01T00:00:00.000Z', // very old
      }),
      makeEnquiry({
        id: 'complete-1',
        currentStage: 'complete',
        lastActivityDate: '2025-01-01T00:00:00.000Z', // very old
      }),
    ];

    const result = evaluateStaleEnquiries(enquiries, now, 30);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(0);
    }
  });

  it('should use custom threshold days', () => {
    const enquiries = [
      makeEnquiry({
        id: 'enq-1',
        currentStage: 'quote_sent',
        lastActivityDate: '2025-06-05T00:00:00.000Z', // 10 days ago
      }),
    ];

    // With 7-day threshold, should be stale
    const result7 = evaluateStaleEnquiries(enquiries, now, 7);
    expect(result7.success).toBe(true);
    if (result7.success) {
      expect(result7.data).toHaveLength(1);
    }

    // With 14-day threshold, should NOT be stale
    const result14 = evaluateStaleEnquiries(enquiries, now, 14);
    expect(result14.success).toBe(true);
    if (result14.success) {
      expect(result14.data).toHaveLength(0);
    }
  });

  it('should return empty array for empty input', () => {
    const result = evaluateStaleEnquiries([], now, 30);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(0);
    }
  });

  it('should reject invalid threshold', () => {
    const result = evaluateStaleEnquiries([], now, 0);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_THRESHOLD');
    }
  });

  it('should flag enquiries in on_hold stage as stale if beyond threshold', () => {
    const enquiries = [
      makeEnquiry({
        id: 'hold-1',
        currentStage: 'on_hold',
        lastActivityDate: '2025-04-01T00:00:00.000Z', // 75 days ago
      }),
    ];

    const result = evaluateStaleEnquiries(enquiries, now, 30);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('hold-1');
    }
  });
});
