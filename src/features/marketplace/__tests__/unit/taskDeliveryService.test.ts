import { describe, it, expect, vi } from 'vitest';
import {
  validateDeliverableFormat,
  canResubmit,
  isPaymentReleasable,
} from '../../services/taskDeliveryService';
import type { DeliverableFile, DeliverableFormat } from '../../types';

// Mock the dependencies required by the import chain
vi.mock('@/services/auditTrailService', () => ({
  createAuditEntry: vi.fn(),
}));

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        set: vi.fn(() => Promise.resolve()),
        get: vi.fn(() => Promise.resolve({ exists: false })),
        update: vi.fn(() => Promise.resolve()),
      })),
      where: vi.fn(() => ({
        orderBy: vi.fn(() => ({
          limit: vi.fn(() => ({
            get: vi.fn(() => Promise.resolve({ empty: true, docs: [] })),
          })),
        })),
      })),
    })),
  },
}));

// ─── Helper Factories ─────────────────────────────────────────────────────────

function makeFile(format: DeliverableFormat, name?: string): DeliverableFile {
  return {
    fileId: `file-${Date.now()}`,
    fileName: name || `test.${format}`,
    format,
    sizeBytes: 1024,
  };
}

// ─── validateDeliverableFormat ─────────────────────────────────────────────────

describe('validateDeliverableFormat', () => {
  it('returns true when at least one file matches the required format', () => {
    const files = [makeFile('pdf'), makeFile('image')];
    expect(validateDeliverableFormat(files, 'pdf')).toBe(true);
  });

  it('returns true when all files match the required format', () => {
    const files = [makeFile('certificate'), makeFile('certificate')];
    expect(validateDeliverableFormat(files, 'certificate')).toBe(true);
  });

  it('returns false when no file matches the required format', () => {
    const files = [makeFile('image'), makeFile('datasheet')];
    expect(validateDeliverableFormat(files, 'pdf')).toBe(false);
  });

  it('returns false for an empty file array', () => {
    expect(validateDeliverableFormat([], 'pdf')).toBe(false);
  });

  it('returns false for null/undefined files', () => {
    expect(validateDeliverableFormat(null as any, 'pdf')).toBe(false);
    expect(validateDeliverableFormat(undefined as any, 'pdf')).toBe(false);
  });

  it('handles every valid deliverable format', () => {
    const formats: DeliverableFormat[] = [
      'pdf', 'image', 'certificate', 'datasheet', 'model', 'other',
    ];
    for (const fmt of formats) {
      const files = [makeFile(fmt)];
      expect(validateDeliverableFormat(files, fmt)).toBe(true);
    }
  });
});

// ─── canResubmit ──────────────────────────────────────────────────────────────

describe('canResubmit', () => {
  const futureDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const pastDeadline = new Date(Date.now() - 1000).toISOString();

  it('returns true for submission 1 with future deadline', () => {
    expect(canResubmit(1, futureDeadline)).toBe(true);
  });

  it('returns true for submission 2 with future deadline', () => {
    expect(canResubmit(2, futureDeadline)).toBe(true);
  });

  it('returns true for submission 3 with future deadline', () => {
    expect(canResubmit(3, futureDeadline)).toBe(true);
  });

  it('returns false for submission 4 (max reached)', () => {
    expect(canResubmit(4, futureDeadline)).toBe(false);
  });

  it('returns false for submission > 4', () => {
    expect(canResubmit(5, futureDeadline)).toBe(false);
  });

  it('returns false when deadline has passed (submission 1)', () => {
    expect(canResubmit(1, pastDeadline)).toBe(false);
  });

  it('returns false when deadline has passed (submission 3)', () => {
    expect(canResubmit(3, pastDeadline)).toBe(false);
  });

  it('uses provided now parameter for comparison', () => {
    const deadline = '2026-06-15T12:00:00.000Z';
    const beforeDeadline = new Date('2026-06-14T12:00:00.000Z');
    const afterDeadline = new Date('2026-06-16T12:00:00.000Z');

    expect(canResubmit(1, deadline, beforeDeadline)).toBe(true);
    expect(canResubmit(1, deadline, afterDeadline)).toBe(false);
  });

  it('returns false when now exactly equals deadline', () => {
    const deadline = '2026-06-15T12:00:00.000Z';
    const exactDeadline = new Date('2026-06-15T12:00:00.000Z');
    expect(canResubmit(1, deadline, exactDeadline)).toBe(false);
  });
});

// ─── isPaymentReleasable ──────────────────────────────────────────────────────

describe('isPaymentReleasable', () => {
  it('returns true when both conditions are met', () => {
    expect(isPaymentReleasable(true, 'passed')).toBe(true);
  });

  it('returns false when professional has not signed off', () => {
    expect(isPaymentReleasable(false, 'passed')).toBe(false);
  });

  it('returns false when AI review is pending', () => {
    expect(isPaymentReleasable(true, 'pending')).toBe(false);
  });

  it('returns false when AI review is rejected', () => {
    expect(isPaymentReleasable(true, 'rejected')).toBe(false);
  });

  it('returns false when neither condition is met', () => {
    expect(isPaymentReleasable(false, 'pending')).toBe(false);
  });

  it('returns false when sign-off is false and AI review rejected', () => {
    expect(isPaymentReleasable(false, 'rejected')).toBe(false);
  });
});
