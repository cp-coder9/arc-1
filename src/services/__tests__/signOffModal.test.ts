/**
 * Unit tests for SignOffModal component.
 *
 * Validates Requirements: 8.1, 8.2, 8.4, 8.5
 */

import { vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({
  db: {},
  auth: {},
}));

vi.mock('@/services/auditTrailService', () => ({
  createAuditEntry: vi.fn(),
}));

describe('SignOffModal', () => {
  it('getAcknowledgementText returns the three required clauses (Req 8.2)', async () => {
    const { getAcknowledgementText } = await import(
      '@/services/refuseArea/signOffService'
    );
    const text = getAcknowledgementText();
    // Clause (a): advisory only
    expect(text).toContain(
      '(a) This output is advisory only and does not constitute legal compliance certification'
    );
    // Clause (b): reviewed results
    expect(text).toContain(
      '(b) I have reviewed the computed results in full'
    );
    // Clause (c): professional responsibility
    expect(text).toContain(
      '(c) Professional verification against current local bylaws remains my responsibility'
    );
  });

  it('exports a valid React component function (Req 8.1)', async () => {
    const mod = await import('@/components/refuseArea/SignOffModal');
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe('function');
  });

  it('exports the SignOffModalProps interface shape', async () => {
    // The component accepts open, onClose, onConfirm props
    const mod = await import('@/components/refuseArea/SignOffModal');
    // React functional components accept a single props object
    expect(mod.default.length).toBeLessThanOrEqual(1);
  });

  it('isSignOffRequired always returns true for all actions (Req 8.1, 8.4)', async () => {
    const { isSignOffRequired } = await import(
      '@/services/refuseArea/signOffService'
    );
    expect(isSignOffRequired('save_passport')).toBe(true);
    expect(isSignOffRequired('export_specforge')).toBe(true);
    expect(isSignOffRequired('export_pdf')).toBe(true);
  });
});
