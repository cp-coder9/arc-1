import { jest } from '@jest/globals';

export const mockFirestore = {
  collection: jest.fn(() => ({
    doc: jest.fn(() => ({
      get: jest.fn(),
      set: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    })),
    add: jest.fn(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    get: jest.fn(),
    onSnapshot: jest.fn(() => jest.fn()),
  })),
  doc: jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  })),
  getDoc: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
  addDoc: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
  collectionGroup: jest.fn(),
  writeBatch: jest.fn(() => ({
    set: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    commit: jest.fn(),
  })),
  serverTimestamp: jest.fn(() => new Date().toISOString()),
};

export const mockAuth = {
  currentUser: null,
  signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
  onAuthStateChanged: jest.fn(() => jest.fn()),
};

export const mockStorage = {
  ref: jest.fn(() => ({
    put: jest.fn(),
    getDownloadURL: jest.fn(),
  })),
};
