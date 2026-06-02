// Mock for firebase/firestore — Jest stub covering all exports used in the codebase
import { jest } from '@jest/globals';
export const CACHE_SIZE_UNLIMITED = -1;

export const initializeFirestore = jest.fn(() => ({}));
export const getFirestore = jest.fn(() => ({}));
export const enableIndexedDbPersistence = jest.fn(() => Promise.resolve());
export const enableMultiTabIndexedDbPersistence = jest.fn(() => Promise.resolve());

// Persistent cache (used in firebase.ts init)
export const persistentLocalCache = jest.fn(() => ({}));
export const persistentMultipleTabManager = jest.fn(() => ({}));
export const memoryLocalCache = jest.fn(() => ({}));

// Collection / Document builders
export const collection = jest.fn(() => ({ id: 'mock-collection' }));
export const collectionGroup = jest.fn(() => ({}));
export const doc = jest.fn(() => ({ id: 'mock-doc' }));

// Read
export const getDoc = jest.fn(() =>
  Promise.resolve({
    exists: () => true,
    id: 'mock-id',
    data: () => ({ notificationPreferences: { in_app: true, email: true, push: true } }),
    ref: { id: 'mock-id' },
  })
);
export const getDocs = jest.fn(() =>
  Promise.resolve({
    empty: true,
    size: 0,
    docs: [],
    forEach: jest.fn(),
  })
);
export const getDocFromCache = jest.fn(() => Promise.resolve({ exists: () => false, data: () => ({}) }));
export const getDocFromServer = jest.fn(() => Promise.resolve({ exists: () => false, data: () => ({}) }));

// Write
export const setDoc = jest.fn(() => Promise.resolve());
export const updateDoc = jest.fn(() => Promise.resolve());
export const deleteDoc = jest.fn(() => Promise.resolve());
export const addDoc = jest.fn(() => Promise.resolve({ id: 'mock-new-id' }));

// Query helpers
export const query = jest.fn((...args: any[]) => args[0]);
export const where = jest.fn(() => ({}));
export const orderBy = jest.fn(() => ({}));
export const limit = jest.fn(() => ({}));
export const limitToLast = jest.fn(() => ({}));
export const startAfter = jest.fn(() => ({}));
export const startAt = jest.fn(() => ({}));
export const endAt = jest.fn(() => ({}));
export const endBefore = jest.fn(() => ({}));

// Real-time listener
export const onSnapshot = jest.fn((_ref: any, cb: any) => {
  if (typeof cb === 'function') {
    cb({
      docs: [
        {
          id: 'notif-1',
          ref: { id: 'notif-1' },
          data: () => ({
            userId: 'user-1',
            type: 'job_application',
            title: 'New Application',
            body: 'Test notification',
            isRead: false,
            createdAt: '2026-01-01T00:00:00Z',
          }),
        },
      ],
      empty: false,
      forEach: jest.fn(),
    });
  }
  return jest.fn(); // unsubscribe
});

// Batch / transaction
export const writeBatch = jest.fn(() => ({
  set: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  commit: jest.fn(() => Promise.resolve()),
}));
export const runTransaction = jest.fn((_db: any, fn: any) =>
  fn({
    get: jest.fn(() => Promise.resolve({ exists: () => false, data: () => ({}) })),
    set: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  })
);

// Field values / timestamps
export const serverTimestamp = jest.fn(() => new Date().toISOString());
export const Timestamp = {
  now: jest.fn(() => ({ toDate: () => new Date(), seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 })),
  fromDate: jest.fn((d: Date) => ({ toDate: () => d, seconds: Math.floor(d.getTime() / 1000), nanoseconds: 0 })),
  fromMillis: jest.fn((ms: number) => ({ toDate: () => new Date(ms), seconds: Math.floor(ms / 1000), nanoseconds: 0 })),
};
export const FieldValue = {
  serverTimestamp: jest.fn(),
  increment: jest.fn((n: number) => n),
  arrayUnion: jest.fn((...items: any[]) => items),
  arrayRemove: jest.fn((...items: any[]) => items),
  delete: jest.fn(),
};
export const deleteField = jest.fn();
export const increment = jest.fn((n: number) => n);
export const arrayUnion = jest.fn((...items: any[]) => items);
export const arrayRemove = jest.fn((...items: any[]) => items);

// Snapshot classes (used in types)
export const DocumentSnapshot = jest.fn();
export const QuerySnapshot = jest.fn();
export const QueryDocumentSnapshot = jest.fn();
