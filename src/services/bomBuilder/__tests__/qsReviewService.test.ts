import { describe, it, expect, beforeEach } from 'vitest';
import {
  createProject,
  addLineItem,
  _resetStore,
} from '../bomBuilderService';
import {
  submitForReview,
  reviewItem,
  batchApprove,
  validateSignOffReadiness,
  signOff,
  getMarketRate,
  _resetSeq,
} from '../qsReviewService';

function seedProject() {
  const project = createProject('QS Review Test');
  addLineItem(project.id, { sourceIds: [], itemCode: '001-masonry', description: 'External walls', material: 'Clay brick', tradePackage: 'masonry', costCode: 'CC-2300', unit: 'm2', quantity: 200, rate: 680, confidence: 1, status: 'extracted' });
  addLineItem(project.id, { sourceIds: [], itemCode: '002-concrete', description: 'Strip footings', material: '25MPa concrete', tradePackage: 'concrete', costCode: 'CC-2100', unit: 'm3', quantity: 12, rate: 2450, confidence: 1, status: 'extracted' });
  addLineItem(project.id, { sourceIds: [], itemCode: '003-electrical', description: 'DB board', material: 'CBI board', tradePackage: 'electrical', costCode: 'CC-6100', unit: 'nr', quantity: 1, rate: 900, confidence: 1, status: 'extracted' });
  return project;
}

describe('qsReviewService', () => {
  beforeEach(() => {
    _resetStore();
    _resetSeq();
  });

  it('returns market rate bands for a trade package', () => {
    const rate = getMarketRate('Clay brick', 'masonry');
    expect(rate.min).toBeLessThan(rate.max);
    expect(rate.min).toBeGreaterThan(0);
  });

  it('submits all line items for QS review with variance analysis', () => {
    const project = seedProject();
    const reviews = submitForReview(project.id);

    expect(reviews).toHaveLength(3);
    for (const review of reviews) {
      expect(review.marketRateMin).toBeGreaterThan(0);
      expect(review.marketRateMax).toBeGreaterThanOrEqual(review.marketRateMin);
      expect(['in_range', 'above', 'below']).toContain(review.variance);
    }
  });

  it('reviews a single item with approve decision', () => {
    const project = seedProject();
    submitForReview(project.id);
    const lineItemId = project.lineItems[0].id;

    const review = reviewItem(project.id, lineItemId, 'approve', 'qs@firm.co.za', 'Rate acceptable');
    expect(review.decision).toBe('approve');
    expect(review.reviewer).toBe('qs@firm.co.za');
    expect(review.note).toBe('Rate acceptable');
    expect(review.reviewedAt).toBeDefined();
    expect(project.lineItems[0].status).toBe('approved');
  });

  it('reviews a single item with reject decision', () => {
    const project = seedProject();
    submitForReview(project.id);
    const lineItemId = project.lineItems[1].id;

    reviewItem(project.id, lineItemId, 'reject', 'qs@firm.co.za', 'Rate too high');
    expect(project.lineItems[1].status).toBe('rejected');
  });

  it('reviews a single item with request_info decision', () => {
    const project = seedProject();
    submitForReview(project.id);
    const lineItemId = project.lineItems[2].id;

    reviewItem(project.id, lineItemId, 'request_info', 'qs@firm.co.za', 'Need supplier quote');
    expect(project.lineItems[2].status).toBe('info_required');
  });

  it('batch approves multiple items', () => {
    const project = seedProject();
    submitForReview(project.id);
    const ids = project.lineItems.map((i) => i.id);

    const approved = batchApprove(project.id, ids, 'qs@firm.co.za');
    expect(approved).toHaveLength(3);
    for (const item of project.lineItems) {
      expect(item.status).toBe('approved');
    }
  });

  it('validates sign-off readiness — blocks when items unreviewed', () => {
    const project = seedProject();
    submitForReview(project.id);
    // Don't review any items

    const readiness = validateSignOffReadiness(project.id);
    expect(readiness.ready).toBe(false);
    expect(readiness.unreviewed).toBe(3);
    expect(readiness.blockers.length).toBeGreaterThan(0);
    expect(readiness.blockers.some((b) => b.includes('not yet reviewed'))).toBe(true);
  });

  it('validates sign-off readiness — blocks when items rejected', () => {
    const project = seedProject();
    submitForReview(project.id);

    // Approve 2, reject 1
    reviewItem(project.id, project.lineItems[0].id, 'approve', 'qs@firm.co.za');
    reviewItem(project.id, project.lineItems[1].id, 'approve', 'qs@firm.co.za');
    reviewItem(project.id, project.lineItems[2].id, 'reject', 'qs@firm.co.za');

    const readiness = validateSignOffReadiness(project.id);
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers.some((b) => b.includes('rejected'))).toBe(true);
  });

  it('validates sign-off readiness - blocks when items have info_required status', () => {
    const project = seedProject();
    submitForReview(project.id);

    // Approve 2, request info on 1
    reviewItem(project.id, project.lineItems[0].id, 'approve', 'qs@firm.co.za');
    reviewItem(project.id, project.lineItems[1].id, 'approve', 'qs@firm.co.za');
    reviewItem(project.id, project.lineItems[2].id, 'request_info', 'qs@firm.co.za');

    const readiness = validateSignOffReadiness(project.id);
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers.some((b) => b.includes('awaiting information'))).toBe(true);
  });

  it('signs off when all conditions met', () => {
    const project = seedProject();
    submitForReview(project.id);
    batchApprove(project.id, project.lineItems.map((i) => i.id), 'qs@firm.co.za');

    const cert = signOff(project.id, 'qs@firm.co.za');
    expect(cert.signedBy).toBe('qs@firm.co.za');
    expect(cert.itemCount).toBe(3);
    expect(cert.totalValue).toBeGreaterThan(0);
    expect(cert.certificateRef).toMatch(/^QS-CERT-/);
    expect(project.qsSignOff).toBeDefined();
  });

  it('throws on sign-off when conditions not met', () => {
    const project = seedProject();
    submitForReview(project.id);
    // No reviews done

    expect(() => signOff(project.id, 'qs@firm.co.za')).toThrow('Cannot sign off');
  });

  it('throws when reviewing item that has not been submitted', () => {
    const project = seedProject();
    // Don't call submitForReview
    const lineItemId = project.lineItems[0].id;

    expect(() => reviewItem(project.id, lineItemId, 'approve', 'qs@firm.co.za')).toThrow('Submit for review first');
  });
});
