import { beforeEach, describe, expect, it, vi } from 'vitest';

const adminMocks = vi.hoisted(() => ({
  update: vi.fn(),
  get: vi.fn(),
  limit: vi.fn(),
  where: vi.fn(),
  collection: vi.fn(),
}));

vi.mock('../../lib/firebase-admin', () => ({
  adminDb: {
    collection: adminMocks.collection,
  },
}));

describe('shadowTrackerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminMocks.collection.mockReturnValue({ where: adminMocks.where });
    adminMocks.where.mockReturnValue({ where: adminMocks.where, limit: adminMocks.limit, get: adminMocks.get });
    adminMocks.limit.mockReturnValue({ get: adminMocks.get });
    adminMocks.update.mockResolvedValue(undefined);
  });

  it('returns no detection and does not query Firestore when municipal keywords are absent', async () => {
    const { detectMunicipalInvoices } = await import('../shadowTrackerService');

    await expect(detectMunicipalInvoices('Please review the design notes.', 'user-1')).resolves.toEqual({ detected: false });

    expect(adminMocks.collection).not.toHaveBeenCalled();
  });

  it('updates a matching Johannesburg submission with a shadow tracker tracking event', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.123456789);
    adminMocks.get.mockResolvedValue({
      empty: false,
      docs: [{
        ref: { update: adminMocks.update },
        data: () => ({ trackingHistory: [{ status: 'Submitted', timestamp: '2026-01-01T00:00:00.000Z' }] }),
      }],
    });
    const { detectMunicipalInvoices } = await import('../shadowTrackerService');

    const result = await detectMunicipalInvoices('City of Johannesburg Plan Fees Invoice ready', 'user-1');

    expect(result).toEqual({ detected: true, ref: 'INV-XJYLRX', municipality: 'COJ', action: 'updated_submission' });
    expect(adminMocks.collection).toHaveBeenCalledWith('council_submissions');
    expect(adminMocks.where).toHaveBeenCalledWith('userId', '==', 'user-1');
    expect(adminMocks.where).toHaveBeenCalledWith('municipality', '==', 'COJ');
    expect(adminMocks.limit).toHaveBeenCalledWith(1);
    expect(adminMocks.update).toHaveBeenCalledWith({
      status: 'Fees Invoiced',
      trackingHistory: [
        { status: 'Submitted', timestamp: '2026-01-01T00:00:00.000Z' },
        expect.objectContaining({
          status: 'Fees Invoiced',
          notes: expect.stringContaining('INV-XJYLRX from COJ'),
          source: 'shadow_tracker',
        }),
      ],
    });
  });

  it('detects Cape Town invoices but reports no action when no matching submission exists', async () => {
    adminMocks.get.mockResolvedValue({ empty: true, docs: [] });
    const { detectMunicipalInvoices } = await import('../shadowTrackerService');

    await expect(detectMunicipalInvoices('City of Cape Town Statement Invoice', 'user-2')).resolves.toEqual({ detected: false });

    expect(adminMocks.where).toHaveBeenCalledWith('municipality', '==', 'COCT');
    expect(adminMocks.update).not.toHaveBeenCalled();
  });

  it('aggregates recent crowdsource updates by department and backlog level', async () => {
    adminMocks.get.mockResolvedValue({
      docs: [
        { data: () => ({ department: 'Planning', backlogLevel: 'high' }) },
        { data: () => ({ department: 'Planning', backlogLevel: 'medium' }) },
        { data: () => ({ department: 'Building Control', backlogLevel: 'low' }) },
        { data: () => ({ backlogLevel: 'high' }) },
      ],
    });
    const { getMunicipalityHeatMap } = await import('../shadowTrackerService');

    const heatMap = await getMunicipalityHeatMap('COJ');

    expect(adminMocks.collection).toHaveBeenCalledWith('crowdsource_updates');
    expect(adminMocks.where).toHaveBeenCalledWith('municipality', '==', 'COJ');
    expect(adminMocks.where).toHaveBeenCalledWith('timestamp', '>', expect.any(String));
    expect(heatMap).toEqual({
      Planning: { count: 2, high: 1, med: 1, low: 0 },
      'Building Control': { count: 1, high: 0, med: 0, low: 1 },
      General: { count: 1, high: 1, med: 0, low: 0 },
    });
  });
});
