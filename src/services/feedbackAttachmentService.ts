/**
 * Feedback Loop — Attachment Service
 *
 * Handles uploading and deleting feedback screenshot attachments
 * via Vercel Blob storage. Validates file type (PNG/JPEG) and size (≤5MB)
 * before upload. Files stored at path `feedback/{submissionId}/{filename}`.
 *
 * @module feedbackAttachmentService
 */

import { put, del } from '@vercel/blob';
import { validateAttachment } from '@/services/feedbackValidation';

// ─── Constants ──────────────────────────────────────────────────────────────────

const BLOB_READ_WRITE_TOKEN = process.env.BLOB_READ_WRITE_TOKEN || process.env.VITE_BLOB_READ_WRITE_TOKEN || '';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface AttachmentFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

// ─── Upload ─────────────────────────────────────────────────────────────────────

/**
 * Uploads a feedback attachment to Vercel Blob storage.
 *
 * Validates the file type (PNG/JPEG only) and size (≤5MB) before uploading.
 * Stores at path `feedback/{submissionId}/{filename}`.
 *
 * @param submissionId - The feedback submission ID this attachment belongs to
 * @param file - The file to upload (buffer, originalname, mimetype, size)
 * @returns The public blob URL for the uploaded file
 * @throws Error if validation fails or upload fails
 */
export async function uploadFeedbackAttachment(
  submissionId: string,
  file: AttachmentFile
): Promise<string> {
  // Validate file type and size (currentCount=0 since we validate one at a time here)
  const validation = validateAttachment(
    { type: file.mimetype, size: file.size },
    0
  );

  if (!validation.valid) {
    throw new Error(validation.error);
  }

  if (!BLOB_READ_WRITE_TOKEN) {
    throw new Error('Storage configuration error: missing blob token');
  }

  const blobPath = `feedback/${submissionId}/${file.originalname}`;

  const blob = await put(blobPath, file.buffer, {
    access: 'public',
    token: BLOB_READ_WRITE_TOKEN,
    contentType: file.mimetype,
    addRandomSuffix: true,
  });

  return blob.url;
}

// ─── Delete ─────────────────────────────────────────────────────────────────────

/**
 * Deletes multiple feedback attachment blob URLs.
 *
 * Used during soft-delete operations to remove user attachment data.
 * Silently handles already-deleted blobs.
 *
 * @param urls - Array of Vercel Blob URLs to delete
 */
export async function deleteFeedbackAttachments(urls: string[]): Promise<void> {
  if (urls.length === 0) return;

  await del(urls, { token: BLOB_READ_WRITE_TOKEN });
}
