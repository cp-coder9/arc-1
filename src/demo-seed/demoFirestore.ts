// @ts-nocheck
/**
 * Demo-mode Firestore persistence wrapper.
 *
 * In demo mode, ALL Firestore reads and writes are transparently
 * redirected under /demo/{uid}/ so each user gets an isolated sandbox.
 * This means user changes (upload drawings, issue invoices, edit projects)
 * PERSIST to their sandbox, stay isolated from other users, and survive
 * page reloads.
 *
 * USAGE (import in any component that reads/writes Firestore):
 *
 *   import { useDemoDoc, useDemoCol } from '../demo-seed/demoFirestore';
 *   // instead of:
 *   //   import { doc, collection } from 'firebase/firestore';
 *   //   const ref = doc(db, 'projects', id);
 *   // use:
 *   //   const ref = useDemoDoc('projects', id);
 *   //   const refs = useDemoCol('projects');
 *
 * In non-demo mode, these functions pass through to Firestore normally.
 * The wrapper pattern means NO existing component logic changes —
 * only the path/ref construction function switches.
 *
 * FIREBASE STORAGE (file uploads):
 *   Demo-mode file uploads go to demo/{uid}/uploads/ prefix in the storage bucket.
 *   Use useDemoStoragePath() to get the correct prefix.
 *
 * NOTE: This is a React hook pattern. For non-React code (seed scripts, etc.),
 * use the raw buildDemoPath() function directly.
 */

import { useMemo } from 'react';
import { auth, db } from '../lib/firebase';
import {
  doc,
  collection,
  collectionGroup,
  type Firestore,
  type DocumentReference,
  type CollectionReference,
  type Query,
} from 'firebase/firestore';
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  type StorageReference,
  type UploadResult,
} from 'firebase/storage';
import { getStorage } from 'firebase/storage';

// ─── PATH BUILDING ───

/**
 * Returns the demo-mode path prefix for the current user.
 * In demo mode: 'demo/{uid}'
 * In live mode: '' (empty string — pass-through)
 */
export function getDemoPrefix(uid?: string): string {
  const isDemo = typeof window !== 'undefined'
    && import.meta.env.VITE_DEMO_MODE === 'true';
  if (!isDemo) return '';
  const userId = uid || auth.currentUser?.uid;
  if (!userId) return '';
  return `demo/${userId}`;
}

/**
 * Build a Firestore document path, prefixed with /demo/{uid}/ in demo mode.
 * Non-demo mode returns the path as-is.
 *
 * Can be used in seed scripts and non-React contexts.
 */
export function buildDemoPath(...segments: string[]): string[] {
  const prefix = getDemoPrefix();
  if (!prefix) return segments;
  return [prefix, ...segments];
}

/**
 * Build a full Firestore document path string (for direct string-based lookups).
 */
export function buildDemoPathStr(path: string, ...subSegments: string[]): string {
  const prefix = getDemoPrefix();
  if (!prefix) return subSegments.length > 0 ? `${path}/${subSegments.join('/')}` : path;
  return subSegments.length > 0
    ? `${prefix}/${path}/${subSegments.join('/')}`
    : `${prefix}/${path}`;
}

// ─── REACT HOOKS ───

/**
 * Hook: get a demo-aware DocumentReference.
 *
 *   const projRef = useDemoDoc('projects', projectId);
 *   // In demo mode: doc(db, 'demo/{uid}/projects/{projectId}')
 *   // In live mode: doc(db, 'projects/{projectId}')
 */
export function useDemoDoc(...pathSegments: string[]): DocumentReference {
  return useMemo(() => {
    const prefixed = buildDemoPath(...pathSegments);
    return doc(db, ...prefixed) as DocumentReference;
  }, [pathSegments.join('/')]);
}

/**
 * Hook: get a demo-aware CollectionReference.
 *
 *   const projCol = useDemoCol('projects');
 *   // In demo mode: collection(db, 'demo/{uid}/projects')
 *   // In live mode: collection(db, 'projects')
 */
export function useDemoCol(...pathSegments: string[]): CollectionReference {
  return useMemo(() => {
    const prefixed = buildDemoPath(...pathSegments);
    return collection(db, ...prefixed) as CollectionReference;
  }, [pathSegments.join('/')]);
}

/**
 * Hook: get a demo-aware subcollection reference under a parent document.
 *
 *   const subsRef = useDemoSubCol(projRef, 'submissions');
 *   // In demo mode: collection(projRef, 'submissions')
 *   // Works identically in both modes since doc ref already has prefix
 */
export function useDemoSubCol(
  parentRef: DocumentReference,
  subCollection: string
): CollectionReference {
  return useMemo(() => {
    return collection(parentRef, subCollection) as CollectionReference;
  }, [parentRef.path, subCollection]);
}

/**
 * Hook: get a demo-aware Storage path for file uploads.
 * Returns a StorageReference under the correct demo prefix.
 *
 *   const uploadRef = useDemoStoragePath('uploads', fileName);
 *   await uploadBytes(uploadRef, file);
 */
export function useDemoStoragePath(...pathSegments: string[]): StorageReference {
  return useMemo(() => {
    const isDemo = import.meta.env.VITE_DEMO_MODE === 'true';
    const storage = getStorage();
    if (!isDemo) {
      return storageRef(storage, pathSegments.join('/'));
    }
    const userId = auth.currentUser?.uid || 'anonymous';
    return storageRef(storage, `demo/${userId}/${pathSegments.join('/')}`);
  }, [pathSegments.join('/')]);
}

// ─── RAW (NON-HOOK) HELPERS FOR SCRIPTS ───

/**
 * Get a demo-aware DocumentReference without using a React hook.
 * Use in seed scripts, service workers, and non-component contexts.
 */
export function getDemoDoc(...pathSegments: string[]): DocumentReference {
  const prefixed = buildDemoPath(...pathSegments);
  return doc(db, ...prefixed) as DocumentReference;
}

/**
 * Get a demo-aware CollectionReference without using a React hook.
 */
export function getDemoCol(...pathSegments: string[]): CollectionReference {
  const prefixed = buildDemoPath(...pathSegments);
  return collection(db, ...prefixed) as CollectionReference;
}

/**
 * Get a demo-aware StorageReference for file uploads in scripts.
 */
export function getDemoStorageRef(...pathSegments: string[]): StorageReference {
  const isDemo = import.meta.env.VITE_DEMO_MODE === 'true';
  const storage = getStorage();
  if (!isDemo) return storageRef(storage, pathSegments.join('/'));
  const userId = auth.currentUser?.uid || 'anonymous';
  return storageRef(storage, `demo/${userId}/${pathSegments.join('/')}`);
}

/**
 * Upload a file to demo-aware Storage path.
 * Returns the download URL after upload.
 */
export async function uploadDemoFile(
  file: File | Blob | Uint8Array,
  path: string,
  fileName: string,
  metadata?: Record<string, string>
): Promise<string> {
  const ref = getDemoStorageRef(path, fileName);
  const result: UploadResult = await uploadBytes(ref, file, {
    customMetadata: metadata,
  });
  return getDownloadURL(result.ref);
}
