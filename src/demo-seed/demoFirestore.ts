/**
 * Demo-mode Firestore persistence wrapper.
 *
 * In demo mode, ALL Firestore reads and writes are transparently
 * redirected under /demo/{uid}/ so each user gets an isolated sandbox.
 * This means user changes (upload drawings, issue invoices, edit projects)
 * PERSIST to their sandbox, stay isolated from other users, and survive
 * page reloads.
 *
 * In non-demo mode, these functions pass through to Firestore normally.
 */

import { useMemo } from 'react';
import { auth, db } from '../lib/firebase';
import {
  doc,
  collection,
  type DocumentReference,
  type CollectionReference,
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

export function getDemoPrefix(uid?: string): string {
  const isDemo = typeof window !== 'undefined'
    && import.meta.env.VITE_DEMO_MODE === 'true';
  if (!isDemo) return '';
  const userId = uid || auth.currentUser?.uid;
  if (!userId) return '';
  return `demo/${userId}`;
}

export function buildDemoPathStr(...segments: string[]): string {
  const prefix = getDemoPrefix();
  if (!prefix) return segments.join('/');
  return `${prefix}/${segments.join('/')}`;
}

// ─── REACT HOOKS ───

export function useDemoDoc(...pathSegments: string[]): DocumentReference {
  return useMemo(() => {
    return doc(db, buildDemoPathStr(...pathSegments));
  }, [pathSegments.join('/')]);
}

export function useDemoCol(...pathSegments: string[]): CollectionReference {
  return useMemo(() => {
    return collection(db, buildDemoPathStr(...pathSegments));
  }, [pathSegments.join('/')]);
}

export function useDemoSubCol(
  parentRef: DocumentReference,
  subCollection: string
): CollectionReference {
  return useMemo(() => {
    return collection(parentRef, subCollection);
  }, [parentRef.path, subCollection]);
}

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

export function getDemoDoc(...pathSegments: string[]): DocumentReference {
  return doc(db, buildDemoPathStr(...pathSegments));
}

export function getDemoCol(...pathSegments: string[]): CollectionReference {
  return collection(db, buildDemoPathStr(...pathSegments));
}

export function getDemoStorageRef(...pathSegments: string[]): StorageReference {
  const isDemo = import.meta.env.VITE_DEMO_MODE === 'true';
  const storage = getStorage();
  if (!isDemo) return storageRef(storage, pathSegments.join('/'));
  const userId = auth.currentUser?.uid || 'anonymous';
  return storageRef(storage, `demo/${userId}/${pathSegments.join('/')}`);
}

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
