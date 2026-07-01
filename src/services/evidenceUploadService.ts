import { collection, addDoc, getDocs, query, where, orderBy } from 'firebase/firestore';
import { auth } from '@/lib/firebase';
import { getIdToken } from 'firebase/auth';
import { apiFetch } from '@/lib/apiClient';
import { getDemoCol } from '../demo-seed/demoFirestore';

// ─── Constants ───

const CPD_EVIDENCE_COL = 'cpd_evidence';
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

// ─── Types ───

export interface EvidenceItem {
  id: string;
  certificateId: string;
  userId: string;
  fileName: string;
  fileUrl: string;
  uploadedAt: string;
  status: 'pending_review' | 'accepted' | 'rejected';
}

export interface UploadEvidenceInput {
  certificateId: string;
  userId: string;
  file: File;
}

export interface UploadEvidenceResult {
  success: boolean;
  evidence?: EvidenceItem;
  error?: string;
}

// ─── Helpers ───

function evidenceCollection() {
  return getDemoCol(CPD_EVIDENCE_COL);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data-URL prefix (e.g. "data:application/pdf;base64,")
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Public API ───

/**
 * Validates the file is a PDF under 50MB, uploads to Vercel Blob,
 * then creates a Firestore document linking evidence to the certificate.
 */
export async function uploadEvidence(input: UploadEvidenceInput): Promise<UploadEvidenceResult> {
  const { certificateId, userId, file } = input;

  // Validate MIME type
  if (file.type !== 'application/pdf') {
    return { success: false, error: 'Only PDF files are accepted' };
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { success: false, error: 'File too large' };
  }

  // Ensure user is authenticated
  const user = auth.currentUser;
  if (!user) {
    return { success: false, error: 'You must be signed in to upload evidence.' };
  }

  try {
    const idToken = await getIdToken(user);
    const fileBase64 = await fileToBase64(file);

    // Upload to Vercel Blob via the server-side endpoint
    const res = await apiFetch('/api/files/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        context: 'cpd_evidence',
        fileBase64,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 413) {
        return { success: false, error: 'File too large' };
      }
      return {
        success: false,
        error: data.details
          ? `Upload failed: ${data.details}`
          : (data.error || `Upload failed: ${res.status}`),
      };
    }

    const fileUrl = data.url as string;

    // Create Firestore evidence document
    const now = new Date().toISOString();
    const evidenceData: Omit<EvidenceItem, 'id'> = {
      certificateId,
      userId,
      fileName: file.name,
      fileUrl,
      uploadedAt: now,
      status: 'pending_review',
    };

    const docRef = await addDoc(evidenceCollection(), evidenceData);

    const evidence: EvidenceItem = {
      id: docRef.id,
      ...evidenceData,
    };

    return { success: true, evidence };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed. Please try again.';
    return { success: false, error: message };
  }
}

/**
 * Retrieves all evidence items for a given certificate.
 */
export async function getEvidenceForCertificate(certificateId: string): Promise<EvidenceItem[]> {
  const q = query(
    evidenceCollection(),
    where('certificateId', '==', certificateId),
    orderBy('uploadedAt', 'desc'),
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as EvidenceItem));
}
