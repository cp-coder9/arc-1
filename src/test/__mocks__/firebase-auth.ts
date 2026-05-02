// Mock for firebase/auth — Jest stub to avoid ESM parse errors
import { jest } from '@jest/globals';
export const getAuth = jest.fn(() => ({
  currentUser: null,
  onAuthStateChanged: jest.fn(() => jest.fn()),
}));
export const onAuthStateChanged = jest.fn((_auth: any, cb: any) => { cb(null); return jest.fn(); });
export const signInWithEmailAndPassword = jest.fn(() => Promise.resolve({ user: { uid: 'test-uid', email: 'test@example.com' } }));
export const createUserWithEmailAndPassword = jest.fn(() => Promise.resolve({ user: { uid: 'test-uid', email: 'test@example.com' } }));
export const signOut = jest.fn(() => Promise.resolve());
export const GoogleAuthProvider = jest.fn().mockImplementation(() => ({ addScope: jest.fn() }));
export const GithubAuthProvider = jest.fn().mockImplementation(() => ({}));
export const signInWithPopup = jest.fn(() => Promise.resolve({ user: { uid: 'test-uid', email: 'test@example.com' } }));
export const sendPasswordResetEmail = jest.fn(() => Promise.resolve());
export const updatePassword = jest.fn(() => Promise.resolve());
export const updateProfile = jest.fn(() => Promise.resolve());
export const updateEmail = jest.fn(() => Promise.resolve());
export const deleteUser = jest.fn(() => Promise.resolve());
export const EmailAuthProvider = { credential: jest.fn() };
export const reauthenticateWithCredential = jest.fn(() => Promise.resolve());
export const getIdToken = jest.fn(() => Promise.resolve('mock-token'));
export const setPersistence = jest.fn(() => Promise.resolve());
export const browserLocalPersistence = 'LOCAL';
export const browserSessionPersistence = 'SESSION';
