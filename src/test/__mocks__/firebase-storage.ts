// Mock for firebase/storage — Jest stub to avoid ESM parse errors
import { jest } from '@jest/globals';
export const getStorage = jest.fn(() => ({}));
export const ref = jest.fn(() => ({}));
export const uploadBytes = jest.fn(() => Promise.resolve({ ref: {} }));
export const uploadBytesResumable = jest.fn(() => ({
  on: jest.fn(),
  snapshot: { state: 'success', bytesTransferred: 100, totalBytes: 100 },
}));
export const getDownloadURL = jest.fn(() => Promise.resolve('https://mock.storage.url/file'));
export const deleteObject = jest.fn(() => Promise.resolve());
export const listAll = jest.fn(() => Promise.resolve({ items: [], prefixes: [] }));
