import '@testing-library/jest-dom';

// With globals: true, vi is available as a global during setup
const vi = (globalThis as any).vi;

Object.defineProperty(globalThis, 'jest', {
  configurable: true,
  value: vi,
});

// Mock Firebase with full implementation
const mockDb = {
  collection: vi.fn<any>(() => ({
    doc: vi.fn<any>(() => mockDb),
    add: vi.fn<any>(),
    where: vi.fn<any>(() => mockDb),
    orderBy: vi.fn<any>(() => mockDb),
    get: vi.fn<any>(),
    onSnapshot: vi.fn<any>(),
  })),
  doc: vi.fn<any>(() => ({
    get: vi.fn<any>(),
    set: vi.fn<any>(),
    update: vi.fn<any>(),
    delete: vi.fn<any>(),
  })),
  getDoc: vi.fn<any>(),
  setDoc: vi.fn<any>(),
  updateDoc: vi.fn<any>(),
  addDoc: vi.fn<any>(),
  deleteDoc: vi.fn<any>(),
  query: vi.fn<any>(),
  where: vi.fn<any>(),
  orderBy: vi.fn<any>(),
  onSnapshot: vi.fn<any>(),
  writeBatch: vi.fn<any>(() => ({
    set: vi.fn<any>(),
    update: vi.fn<any>(),
    delete: vi.fn<any>(),
    commit: vi.fn<any>(),
  })),
};

const mockAuth = {
  currentUser: { uid: 'test-user-id', email: 'test@example.com' },
  onAuthStateChanged: vi.fn<any>((callback: any) => {
    callback(mockAuth.currentUser);
    return vi.fn();
  }),
  signInWithEmailAndPassword: vi.fn<any>(),
  createUserWithEmailAndPassword: vi.fn<any>(),
  signOut: vi.fn<any>(),
  GoogleAuthProvider: vi.fn<any>(),
};

vi.mock('@/lib/firebase', () => ({
  db: mockDb,
  auth: mockAuth,
  handleFirestoreError: vi.fn<any>(),
  OperationType: {
    CREATE: 'CREATE',
    READ: 'READ',
    UPDATE: 'UPDATE',
    DELETE: 'DELETE',
    LIST: 'LIST',
    UPLOAD: 'UPLOAD',
    GET: 'GET',
    WRITE: 'WRITE',
  },
}));

// Mock Vercel Blob
vi.mock('@vercel/blob', () => ({
  put: vi.fn<any>().mockResolvedValue({
    url: 'https://mock.blob.url/test.pdf',
    downloadUrl: 'https://mock.blob.url/test.pdf?download=1',
  }),
  del: vi.fn<any>().mockResolvedValue(undefined),
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
    VITE_PAYFAST_MERCHANT_ID: '10000100',
    VITE_PAYFAST_MERCHANT_KEY: '46f0cd694581a',
  },
};

// Mock window.crypto for MD5 hashing
Object.defineProperty(globalThis, 'crypto', {
  configurable: true,
  value: {
    ...(globalThis as any).crypto,
    subtle: {
      digest: vi.fn<any>().mockResolvedValue(new ArrayBuffer(16)),
    },
  },
});

// Mock ResizeObserver
(global as any).ResizeObserver = vi.fn<any>().mockImplementation(() => ({
  observe: vi.fn<any>(),
  unobserve: vi.fn<any>(),
  disconnect: vi.fn<any>(),
}));

// Mock IntersectionObserver
(global as any).IntersectionObserver = vi.fn<any>().mockImplementation(() => ({
  observe: vi.fn<any>(),
  unobserve: vi.fn<any>(),
  disconnect: vi.fn<any>(),
}));

// Mock matchMedia when a browser-like environment is available.
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn<any>().mockImplementation(query => ({
      matches: false,
      media: query as any,
      onchange: null,
      addListener: vi.fn<any>(),
      removeListener: vi.fn<any>(),
      addEventListener: vi.fn<any>(),
      removeEventListener: vi.fn<any>(),
      dispatchEvent: vi.fn<any>(),
    })),
  });
}

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
  vi.clearAllMocks();
});
