import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

const mockPut = vi.fn();
const mockDel = vi.fn();

vi.mock('@vercel/blob', () => ({
  put: (...args: any[]) => mockPut(...args),
  del: (...args: any[]) => mockDel(...args),
}));

vi.mock('@/services/feedbackValidation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/feedbackValidation')>();
  return {
    ...actual,
    validateAttachment: actual.validateAttachment,
  };
});

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('feedbackAttachmentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set env var for blob token
    process.env.BLOB_READ_WRITE_TOKEN = 'test-blob-token';
    process.env.VITE_BLOB_READ_WRITE_TOKEN = 'test-blob-token';
  });

  describe('uploadFeedbackAttachment', () => {
    it('uploads a valid PNG file and returns the blob URL', async () => {
      mockPut.mockResolvedValue({
        url: 'https://blob.vercel-storage.com/feedback/sub-123/screenshot.png',
      });

      const { uploadFeedbackAttachment } = await import('../feedbackAttachmentService');

      const file = {
        buffer: Buffer.from('fake-png-data'),
        originalname: 'screenshot.png',
        mimetype: 'image/png',
        size: 1_000_000, // 1MB
      };

      const url = await uploadFeedbackAttachment('sub-123', file);

      expect(url).toBe('https://blob.vercel-storage.com/feedback/sub-123/screenshot.png');
      expect(mockPut).toHaveBeenCalledWith(
        'feedback/sub-123/screenshot.png',
        file.buffer,
        {
          access: 'public',
          token: 'test-blob-token',
          contentType: 'image/png',
          addRandomSuffix: true,
        }
      );
    });

    it('uploads a valid JPEG file and returns the blob URL', async () => {
      mockPut.mockResolvedValue({
        url: 'https://blob.vercel-storage.com/feedback/sub-456/photo.jpg',
      });

      const { uploadFeedbackAttachment } = await import('../feedbackAttachmentService');

      const file = {
        buffer: Buffer.from('fake-jpeg-data'),
        originalname: 'photo.jpg',
        mimetype: 'image/jpeg',
        size: 2_500_000, // 2.5MB
      };

      const url = await uploadFeedbackAttachment('sub-456', file);

      expect(url).toBe('https://blob.vercel-storage.com/feedback/sub-456/photo.jpg');
      expect(mockPut).toHaveBeenCalledWith(
        'feedback/sub-456/photo.jpg',
        file.buffer,
        {
          access: 'public',
          token: 'test-blob-token',
          contentType: 'image/jpeg',
          addRandomSuffix: true,
        }
      );
    });

    it('rejects files that are not PNG or JPEG', async () => {
      const { uploadFeedbackAttachment } = await import('../feedbackAttachmentService');

      const file = {
        buffer: Buffer.from('fake-pdf-data'),
        originalname: 'document.pdf',
        mimetype: 'application/pdf',
        size: 500_000,
      };

      await expect(uploadFeedbackAttachment('sub-789', file)).rejects.toThrow(
        'Attachment must be PNG or JPEG format'
      );
      expect(mockPut).not.toHaveBeenCalled();
    });

    it('rejects files over 5MB', async () => {
      const { uploadFeedbackAttachment } = await import('../feedbackAttachmentService');

      const file = {
        buffer: Buffer.alloc(6_000_000), // 6MB
        originalname: 'large-screenshot.png',
        mimetype: 'image/png',
        size: 6_000_000,
      };

      await expect(uploadFeedbackAttachment('sub-101', file)).rejects.toThrow(
        /must not exceed 5MB/
      );
      expect(mockPut).not.toHaveBeenCalled();
    });

    it('rejects GIF files', async () => {
      const { uploadFeedbackAttachment } = await import('../feedbackAttachmentService');

      const file = {
        buffer: Buffer.from('fake-gif-data'),
        originalname: 'animation.gif',
        mimetype: 'image/gif',
        size: 200_000,
      };

      await expect(uploadFeedbackAttachment('sub-102', file)).rejects.toThrow(
        'Attachment must be PNG or JPEG format'
      );
      expect(mockPut).not.toHaveBeenCalled();
    });
  });

  describe('deleteFeedbackAttachments', () => {
    it('calls del() with all provided URLs', async () => {
      mockDel.mockResolvedValue(undefined);

      const { deleteFeedbackAttachments } = await import('../feedbackAttachmentService');

      const urls = [
        'https://blob.vercel-storage.com/feedback/sub-1/file1.png',
        'https://blob.vercel-storage.com/feedback/sub-1/file2.jpg',
      ];

      await deleteFeedbackAttachments(urls);

      expect(mockDel).toHaveBeenCalledWith(urls, { token: 'test-blob-token' });
    });

    it('does not call del() when urls array is empty', async () => {
      const { deleteFeedbackAttachments } = await import('../feedbackAttachmentService');

      await deleteFeedbackAttachments([]);

      expect(mockDel).not.toHaveBeenCalled();
    });

    it('passes single URL array to del()', async () => {
      mockDel.mockResolvedValue(undefined);

      const { deleteFeedbackAttachments } = await import('../feedbackAttachmentService');

      const urls = ['https://blob.vercel-storage.com/feedback/sub-5/only-one.png'];

      await deleteFeedbackAttachments(urls);

      expect(mockDel).toHaveBeenCalledWith(urls, { token: 'test-blob-token' });
    });
  });
});
