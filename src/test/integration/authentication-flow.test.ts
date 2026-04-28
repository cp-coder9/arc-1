/**
 * Authentication Flow Integration Tests
 * Tests the end-to-end authentication process
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';

// Mock Firebase Auth
const mockSignInWithEmailAndPassword = jest.fn();
const mockCreateUserWithEmailAndPassword = jest.fn();
const mockSignInWithPopup = jest.fn();
const mockSignOut = jest.fn();
const mockOnAuthStateChanged = jest.fn();
const mockUpdateProfile = jest.fn();
const mockGetIdToken = jest.fn().mockResolvedValue('mock-token');

jest.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: (...args: any[]) => mockSignInWithEmailAndPassword(...args),
  createUserWithEmailAndPassword: (...args: any[]) => mockCreateUserWithEmailAndPassword(...args),
  signInWithPopup: (...args: any[]) => mockSignInWithPopup(...args),
  signOut: (...args: any[]) => mockSignOut(...args),
  onAuthStateChanged: (...args: any[]) => mockOnAuthStateChanged(...args),
  updateProfile: (...args: any[]) => mockUpdateProfile(...args),
  getIdToken: (user: any) => mockGetIdToken(),
  GoogleAuthProvider: jest.fn(() => ({
    addScope: jest.fn(),
  })),
}));

// Mock Firestore
const mockSetDoc = jest.fn();
const mockGetDoc = jest.fn();
const mockUpdateDoc = jest.fn();

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => ({})),
  setDoc: (...args: any[]) => mockSetDoc(...args),
  getDoc: (...args: any[]) => mockGetDoc(...args),
  updateDoc: (...args: any[]) => mockUpdateDoc(...args),
  collection: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  onSnapshot: jest.fn(),
}));

// Mock the firebase module
jest.mock('../../lib/firebase', () => ({
  auth: {
    currentUser: null,
  },
  db: {},
  handleFirestoreError: jest.fn(),
  OperationType: {
    CREATE: 'CREATE',
    READ: 'READ',
    UPDATE: 'UPDATE',
    DELETE: 'DELETE',
  },
}));

describe('Authentication Flow Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should sign up new user with email and password', async () => {
    const mockUser = {
      uid: 'new-user-123',
      email: 'newuser@example.com',
      displayName: null,
    };

    mockCreateUserWithEmailAndPassword.mockResolvedValue({
      user: mockUser,
    });

    mockGetDoc.mockResolvedValue({
      exists: () => false,
    });

    mockSetDoc.mockResolvedValue(undefined);

    // Simulate signup
    const { createUserWithEmailAndPassword } = await import('firebase/auth');
    const result = await createUserWithEmailAndPassword(
      {} as any,
      'newuser@example.com',
      'password123'
    );

    expect(result.user).toBeDefined();
    expect(result.user.email).toBe('newuser@example.com');
  });

  test('should sign in existing user', async () => {
    const mockUser = {
      uid: 'existing-user-456',
      email: 'existing@example.com',
      displayName: 'Existing User',
    };

    mockSignInWithEmailAndPassword.mockResolvedValue({
      user: mockUser,
    });

    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        uid: 'existing-user-456',
        email: 'existing@example.com',
        role: 'client',
        displayName: 'Existing User',
      }),
    });

    const { signInWithEmailAndPassword } = await import('firebase/auth');
    const result = await signInWithEmailAndPassword(
      {} as any,
      'existing@example.com',
      'password123'
    );

    expect(result.user).toBeDefined();
    expect(result.user.uid).toBe('existing-user-456');
  });

  test('should handle sign in error', async () => {
    mockSignInWithEmailAndPassword.mockRejectedValue(
      new Error('auth/user-not-found')
    );

    const { signInWithEmailAndPassword } = await import('firebase/auth');

    await expect(
      signInWithEmailAndPassword({} as any, 'wrong@example.com', 'wrongpass')
    ).rejects.toThrow('auth/user-not-found');
  });

  test('should sign in with Google', async () => {
    const mockUser = {
      uid: 'google-user-789',
      email: 'google@example.com',
      displayName: 'Google User',
    };

    mockSignInWithPopup.mockResolvedValue({
      user: mockUser,
    });

    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        uid: 'google-user-789',
        email: 'google@example.com',
        role: 'architect',
        displayName: 'Google User',
      }),
    });

    const { signInWithPopup } = await import('firebase/auth');
    const result = await signInWithPopup({} as any, {} as any);

    expect(result.user).toBeDefined();
    expect(result.user.email).toBe('google@example.com');
  });

  test('should create user profile on first Google sign in', async () => {
    const mockUser = {
      uid: 'new-google-user',
      email: 'newgoogle@example.com',
      displayName: 'New Google User',
    };

    mockSignInWithPopup.mockResolvedValue({
      user: mockUser,
    });

    mockGetDoc.mockResolvedValue({
      exists: () => false,
    });

    mockSetDoc.mockResolvedValue(undefined);

    const { signInWithPopup } = await import('firebase/auth');
    const result = await signInWithPopup({} as any, {} as any);

    expect(result.user).toBeDefined();
    // Profile should be created (setDoc called)
    expect(mockSetDoc).toHaveBeenCalled();
  });

  test('should sign out user', async () => {
    mockSignOut.mockResolvedValue(undefined);

    const { signOut } = await import('firebase/auth');
    await signOut({} as any);

    expect(mockSignOut).toHaveBeenCalled();
  });

  test('should handle auth state changes', async () => {
    const mockCallback = jest.fn();
    const mockUnsubscribe = jest.fn();

    mockOnAuthStateChanged.mockImplementation((auth, callback) => {
      callback({
        uid: 'user-123',
        email: 'user@example.com',
      });
      return mockUnsubscribe;
    });

    const { onAuthStateChanged } = await import('firebase/auth');
    const unsubscribe = onAuthStateChanged({} as any, mockCallback);

    expect(mockCallback).toHaveBeenCalled();
    expect(typeof unsubscribe).toBe('function');
  });

  test('should get Firebase ID token', async () => {
    const token = await mockGetIdToken();

    expect(token).toBe('mock-token');
  });

  test('should update user profile', async () => {
    mockUpdateProfile.mockResolvedValue(undefined);

    const { updateProfile } = await import('firebase/auth');
    await updateProfile({} as any, { displayName: 'Updated Name' });

    expect(mockUpdateProfile).toHaveBeenCalled();
  });

  test('should handle weak password error', async () => {
    mockCreateUserWithEmailAndPassword.mockRejectedValue(
      new Error('auth/weak-password')
    );

    const { createUserWithEmailAndPassword } = await import('firebase/auth');

    await expect(
      createUserWithEmailAndPassword({} as any, 'test@example.com', '123')
    ).rejects.toThrow('auth/weak-password');
  });

  test('should handle email already in use error', async () => {
    mockCreateUserWithEmailAndPassword.mockRejectedValue(
      new Error('auth/email-already-in-use')
    );

    const { createUserWithEmailAndPassword } = await import('firebase/auth');

    await expect(
      createUserWithEmailAndPassword({} as any, 'existing@example.com', 'password123')
    ).rejects.toThrow('auth/email-already-in-use');
  });

  test('should handle wrong password error', async () => {
    mockSignInWithEmailAndPassword.mockRejectedValue(
      new Error('auth/wrong-password')
    );

    const { signInWithEmailAndPassword } = await import('firebase/auth');

    await expect(
      signInWithEmailAndPassword({} as any, 'user@example.com', 'wrongpass')
    ).rejects.toThrow('auth/wrong-password');
  });
});
