import '@testing-library/jest-dom';

// Mock Firebase with full implementation
const mockDb = {
  collection: jest.fn(() => ({
    doc: jest.fn(() => mockDb),
    add: jest.fn(),
    where: jest.fn(() => mockDb),
    orderBy: jest.fn(() => mockDb),
    get: jest.fn(),
    onSnapshot: jest.fn(),
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
  addDoc: jest.fn(),
  deleteDoc: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  onSnapshot: jest.fn(),
  writeBatch: jest.fn(() => ({
    set: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    commit: jest.fn(),
  })),
};

const mockAuth = {
  currentUser: { uid: 'test-user-id', email: 'test@example.com' },
  onAuthStateChanged: jest.fn((callback) => {
    callback(mockAuth.currentUser);
    return jest.fn();
  }),
  signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
  GoogleAuthProvider: jest.fn(),
};

jest.mock('../lib/firebase', () => ({
  db: mockDb,
  auth: mockAuth,
  handleFirestoreError: jest.fn(),
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
  put: jest.fn().mockResolvedValue({
    url: 'https://mock.blob.url/test.pdf',
    downloadUrl: 'https://mock.blob.url/test.pdf?download=1',
  }),
  del: jest.fn().mockResolvedValue(undefined),
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
globalThis.crypto = {
  ...globalThis.crypto,
  subtle: {
    digest: jest.fn().mockResolvedValue(new ArrayBuffer(16)),
  },
};

// Mock ResizeObserver
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
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
