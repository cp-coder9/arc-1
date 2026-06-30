import { describe, it, expect, beforeEach } from 'vitest';
import { createProject, addLineItem, _resetStore } from '../bomBuilderService';
import { submitForReview, batchApprove } from '../qsReviewService';
import { generatePackages, addBidder, issueToTenderers, _resetSeq } from '../tenderService';

describe('tenderService', () => {
  beforeEach(() => { _resetStore(); _resetSeq(); });

  it('throws when issuing tender without QS sign-off', () => {
    const project = createProject('Tender Test');
    addLineItem(project.id, { sourceIds: [], itemCode: '001-masonry', description: 'Walls', material: 'Brick', tradePackage: 'masonry', costCode: 'CC-2300', unit: 'm2', quantity: 100, rate: 680, confidence: 1, status: 'approved' });

    const packages = generatePackages(project.id);
    addBidder(project.id, packages[0].id, 'TestCo', 2);

    expect(() => issueToTenderers(project.id, packages[0].id)).toThrow('QS sign-off');
  });

  it('generates packages only from approved items', () => {
    const project = createProject('Gen Test');
    addLineItem(project.id, { sourceIds: [], itemCode: '001-masonry', description: 'Walls', material: 'Brick', tradePackage: 'masonry', costCode: 'CC-2300', unit: 'm2', quantity: 100, rate: 680, confidence: 1, status: 'approved' });
    addLineItem(project.id, { sourceIds: [], itemCode: '002-electrical', description: 'Wiring', material: 'Cable', tradePackage: 'electrical', costCode: 'CC-6100', unit: 'm', quantity: 50, rate: 900, confidence: 1, status: 'flagged' });

    const packages = generatePackages(project.id);
    expect(packages).toHaveLength(1); // Only masonry (approved)
    expect(packages[0].tradePackage).toBe('masonry');
  });
});
