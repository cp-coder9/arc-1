import { put } from '@vercel/blob';
import { db } from './firebase';
import { collection, addDoc } from 'firebase/firestore';
import { UploadedFile } from '../types';

export interface UploadOptions {
  fileName: string;
  fileType: string;
  fileSize: number;
  uploadedBy: string;
  context: UploadedFile['context'];
  jobId?: string;
  submissionId?: string;
  token?: string;
  access?: 'public';
}

/**
 * Uploads a file to Vercel Blob and tracks it in Firestore's uploaded_files collection.
 */
export async function uploadAndTrackFile(
  fileData: Buffer | Blob | string,
  options: UploadOptions
): Promise<string> {
  const { 
    fileName, 
    fileType, 
    fileSize, 
    uploadedBy, 
    context, 
    jobId, 
    submissionId,
    token,
    access = 'public'
  } = options;

  // 1. Upload to Vercel Blob
  const blob = await put(fileName, fileData, {
    access,
    token: token || import.meta.env.VITE_BLOB_READ_WRITE_TOKEN
  });

  // 2. Track in Firestore
  await addDoc(collection(db, 'uploaded_files'), {
    url: blob.url,
    fileName,
    fileType,
    fileSize,
    uploadedBy,
    context,
    jobId: jobId || null,
    submissionId: submissionId || null,
    uploadedAt: new Date().toISOString()
  });

  return blob.url;
}
