import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  getFirestore,
  CACHE_SIZE_UNLIMITED,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
} from 'firebase/firestore';
import { getAnalytics, isSupported, logEvent, type Analytics } from 'firebase/analytics';
import firebaseConfig from '../../firebase-applet-config.json';
import demoFirebaseConfig from '../../demo-firebase-config.json';

// Demo mode override: use architex-demo Firebase project when VITE_DEMO_MODE=true
const isDemoMode = typeof window !== 'undefined' && import.meta.env.VITE_DEMO_MODE === 'true';
const config = isDemoMode
  ? { ...firebaseConfig, ...demoFirebaseConfig, apiKey: demoFirebaseConfig.apiKey }
  : firebaseConfig;

const app = initializeApp(config);
const firestoreDatabaseId = config.firestoreDatabaseId && config.firestoreDatabaseId !== '(default)'
  ? config.firestoreDatabaseId
  : undefined;

function canUsePersistentFirestoreCache() {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
}

function initializeArchitexFirestore() {
  try {
    return initializeFirestore(app, {
      localCache: canUsePersistentFirestoreCache()
        ? persistentLocalCache({
            cacheSizeBytes: CACHE_SIZE_UNLIMITED,
            tabManager: persistentMultipleTabManager(),
          })
        : memoryLocalCache(),
    }, firestoreDatabaseId);
  } catch (error) {
    console.warn('Persistent Firestore cache unavailable; falling back to memory cache.', error);
    try {
      return initializeFirestore(app, { localCache: memoryLocalCache() }, firestoreDatabaseId);
    } catch (fallbackError) {
      console.warn('Firestore memory-cache initialization fallback failed; using existing Firestore instance.', fallbackError);
      return getFirestore(app, firestoreDatabaseId);
    }
  }
}

export const db = initializeArchitexFirestore();
export const auth = getAuth(app);

const measurementId = config.measurementId?.trim();
const isValidMeasurementId = Boolean(measurementId && measurementId !== 'undefined');

// Initialize Analytics only when Firebase has a valid measurement ID.
// Without this guard Firebase Analytics injects a gtag script with id=undefined.
export const analytics: Promise<Analytics | null> | null =
  typeof window !== 'undefined' && isValidMeasurementId
    ? isSupported()
        .then((yes) => (yes ? getAnalytics(app) : null))
        .catch((error) => {
          console.warn('Firebase Analytics is unavailable in this browser:', error);
          return null;
        })
    : null;

export async function trackEvent(eventName: string, params?: Record<string, string | number | boolean | null>) {
  const instance = await analytics;
  if (instance) logEvent(instance, eventName, params);
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
