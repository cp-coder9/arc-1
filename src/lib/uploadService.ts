import { auth } from './firebase';
import { getIdToken } from 'firebase/auth';
import { UploadedFile } from '../types';

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_UPLOAD_SIZE_LABEL = '20 MB';

export interface UploadOptions {
  fileName: string;
  fileType: string;
  fileSize: number;
  uploadedBy: string;
  context: UploadedFile['context'];
  jobId?: string;
  submissionId?: string;
}

/**
 * Uploads a file via the server-side /api/files/upload endpoint (auth-protected).
 * The server validates MIME type, file size, and authorization against job/submission,
 * then uploads to Vercel Blob and tracks the result in Firestore.
 */
export async function uploadAndTrackFile(
  fileData: Blob | File,
  options: UploadOptions
): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in to upload files.');

  const actualSize = 'size' in fileData ? fileData.size : options.fileSize;
  if (actualSize > MAX_UPLOAD_BYTES || options.fileSize > MAX_UPLOAD_BYTES) {
    throw new Error(`File is too large. Maximum upload size is ${MAX_UPLOAD_SIZE_LABEL}.`);
  }

  const idToken = await getIdToken(user);

  // Convert Blob/File to base64 for JSON transport.
  const fileBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data-URL prefix (e.g. "data:image/png;base64,")
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(fileData);
  });

  const res = await fetch('/api/files/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      fileName:     options.fileName,
      fileType:     options.fileType,
      fileSize:     options.fileSize,
      context:      options.context,
      jobId:        options.jobId || null,
      submissionId: options.submissionId || null,
      fileBase64,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 413) {
      throw new Error(`File is too large. Maximum upload size is ${MAX_UPLOAD_SIZE_LABEL}.`);
    }
    throw new Error(data.details ? `Upload failed: ${data.details}` : (data.error || `Upload failed: ${res.status}`));
  }

  return data.url as string;
}
