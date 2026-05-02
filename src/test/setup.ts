import '@testing-library/jest-dom';
import { jest } from '@jest/globals';

Object.defineProperty(globalThis, 'jest', {
  configurable: true,
  value: jest,
});

// Mock Firebase with full implementation
const mockDb = {
  collection: jest.fn<any>(() => ({
    doc: jest.fn<any>(() => mockDb),
    add: jest.fn<any>(),
    where: jest.fn<any>(() => mockDb),
    orderBy: jest.fn<any>(() => mockDb),
    get: jest.fn<any>(),
    onSnapshot: jest.fn<any>(),
  })),
  doc: jest.fn<any>(() => ({
    get: jest.fn<any>(),
    set: jest.fn<any>(),
    update: jest.fn<any>(),
    delete: jest.fn<any>(),
  })),
  getDoc: jest.fn<any>(),
  setDoc: jest.fn<any>(),
  updateDoc: jest.fn<any>(),
  addDoc: jest.fn<any>(),
  deleteDoc: jest.fn<any>(),
  query: jest.fn<any>(),
  where: jest.fn<any>(),
  orderBy: jest.fn<any>(),
  onSnapshot: jest.fn<any>(),
  writeBatch: jest.fn<any>(() => ({
    set: jest.fn<any>(),
    update: jest.fn<any>(),
    delete: jest.fn<any>(),
    commit: jest.fn<any>(),
  })),
};

const mockAuth = {
  currentUser: { uid: 'test-user-id', email: 'test@example.com' },
  onAuthStateChanged: jest.fn<any>((callback: any) => {
    callback(mockAuth.currentUser);
    return jest.fn();
  }),
  signInWithEmailAndPassword: jest.fn<any>(),
  createUserWithEmailAndPassword: jest.fn<any>(),
  signOut: jest.fn<any>(),
  GoogleAuthProvider: jest.fn<any>(),
};

jest.mock('@/lib/firebase', () => ({
  db: mockDb,
  auth: mockAuth,
  handleFirestoreError: jest.fn<any>(),
  OperationType: {
    CREATE: 'CREATE',
    READ: 'READ',
    UPDATE: 'UPDATE',
    DELETE: 'DELETE',
    LIST: 'LIST',
    UPLOAD: 'UPLOAD',
  },
}));

// Mock Vercel Blob
jest.mock('@vercel/blob', () => ({
  put: jest.fn<any>().mockResolvedValue({
    url: 'https://mock.blob.url/test.pdf',
    downloadUrl: 'https://mock.blob.url/test.pdf?download=1',
  }),
  del: jest.fn<any>().mockResolvedValue(undefined),
}));

// Mock environment variables
globalThis.process = {
  ...globalThis.process,
  env: {
    ...globalThis.process?.env,
    VITE_FIREBASE_API_KEY: 'test-api-key',
    VITE_FIREBASE_AUTH_DOMAIN: 'test.firebaseapp.com',
    VITE_FIREBASE_PROJECT_ID: 'test-project',
    VITE_BLOB_READ_WRITE_TOKEN: 'test-token',
    GEMINI_API_KEY: 'test-gemini-key',
  },
};

// Mock window.crypto for MD5 hashing
Object.defineProperty(globalThis, 'crypto', {
  configurable: true,
  value: {
    ...(globalThis as any).crypto,
    subtle: {
      digest: jest.fn<any>().mockResolvedValue(new ArrayBuffer(16)),
    },
  },
});

// Mock ResizeObserver
(global as any).ResizeObserver = jest.fn<any>().mockImplementation(() => ({
  observe: jest.fn<any>(),
  unobserve: jest.fn<any>(),
  disconnect: jest.fn<any>(),
}));

// Mock IntersectionObserver
(global as any).IntersectionObserver = jest.fn<any>().mockImplementation(() => ({
  observe: jest.fn<any>(),
  unobserve: jest.fn<any>(),
  disconnect: jest.fn<any>(),
}));

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn<any>().mockImplementation(query => ({
    matches: false,
    media: query as any,
    onchange: null,
    addListener: jest.fn<any>(),
    removeListener: jest.fn<any>(),
    addEventListener: jest.fn<any>(),
    removeEventListener: jest.fn<any>(),
    dispatchEvent: jest.fn<any>(),
  })),
});

// Suppress console errors during tests
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('ReactDOMTestUtils') ||
       args[0].includes('act(...)') ||
       args[0].includes('Warning:'))
    ) {
      return;
    }
    originalConsoleError(...args);
  };
});

afterAll(() => {
  console.error = originalConsoleError;
});

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});
