import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const settingsGetMock = vi.hoisted(() => vi.fn());
const docMock = vi.hoisted(() => vi.fn(() => ({ get: settingsGetMock })));
const collectionMock = vi.hoisted(() => vi.fn(() => ({ doc: docMock })));

vi.mock('../lib/firebase-admin', () => ({
  adminDb: { collection: collectionMock },
}));
vi.mock('../../lib/firebase-admin', () => ({
  adminDb: { collection: collectionMock },
}));

const { processReceiptOCR } = await import('../ocrService');

describe('ocrService', () => {
  const originalNvidiaApiKey = process.env.NVIDIA_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-15T12:00:00.000Z'));
    vi.spyOn(Math, 'random').mockReturnValue(0.123456789);
    process.env.NVIDIA_API_KEY = 'env-key';
    settingsGetMock.mockResolvedValue({ exists: false, data: () => undefined });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalNvidiaApiKey === undefined) {
      delete process.env.NVIDIA_API_KEY;
    } else {
      process.env.NVIDIA_API_KEY = originalNvidiaApiKey;
    }
  });

  it('loads municipal tracker settings and returns deterministic extracted receipt data', async () => {
    settingsGetMock.mockResolvedValue({
      exists: true,
      data: () => ({ nvidiaApiKey: 'settings-key', nvidiaOcrModel: 'custom-ocr-model' }),
    });

    const pendingResult = processReceiptOCR('https://files.example/receipt.png', 'user-1');
    await vi.advanceTimersByTimeAsync(2000);
    const result = await pendingResult;

    expect(collectionMock).toHaveBeenCalledWith('system_settings');
    expect(docMock).toHaveBeenCalledWith('municipal_tracker');
    expect(result).toEqual({
      success: true,
      data: {
        referenceNumber: 'OCR-XJYLRX',
        municipality: 'COJ',
        date: '2026-05-15T12:00:02.000Z',
        erfNumber: 'ERF-1234',
        projectDescription: 'New Residential Building',
      },
    });
  });

  it('falls back to the environment API key when settings do not contain one', async () => {
    settingsGetMock.mockResolvedValue({ exists: true, data: () => ({}) });

    const pendingResult = processReceiptOCR('https://files.example/receipt.png', 'user-2');
    await vi.advanceTimersByTimeAsync(2000);
    const result = await pendingResult;

    expect(result.success).toBe(true);
    expect(result.data?.referenceNumber).toBe('OCR-XJYLRX');
  });

  it('returns a failure object when no NVIDIA API key is configured', async () => {
    delete process.env.NVIDIA_API_KEY;
    settingsGetMock.mockResolvedValue({ exists: true, data: () => ({ nvidiaApiKey: '' }) });

    const result = await processReceiptOCR('https://files.example/receipt.png', 'user-3');

    expect(result).toEqual({ success: false, error: 'NVIDIA API Key not configured' });
  });
});
