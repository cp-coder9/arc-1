const role = (import.meta.env.VITE_TEST_ROLE || 'client') as string;

export const mockAuthUser = {
  uid: `${role}-user`,
  email: `${role}@example.test`,
  displayName: `${role[0].toUpperCase()}${role.slice(1)} User`,
  emailVerified: true,
  isAnonymous: false,
  tenantId: null,
  providerData: [],
  getIdToken: async () => 'mock-token',
};

export function getAuth() {
  return { currentUser: mockAuthUser };
}

export function onAuthStateChanged(_auth: unknown, callback: (user: typeof mockAuthUser) => void) {
  queueMicrotask(() => callback(mockAuthUser));
  return () => undefined;
}

export class GoogleAuthProvider {}

export async function signInWithPopup() {
  return { user: mockAuthUser };
}

export async function signOut() {}

export async function signInWithEmailAndPassword() {
  return { user: mockAuthUser };
}

export async function createUserWithEmailAndPassword() {
  return { user: mockAuthUser };
}

export async function updateProfile() {}
export async function sendEmailVerification() {}
export async function updateEmail() {}
export async function reauthenticateWithCredential() {}
export async function sendPasswordResetEmail() {}
export async function reload() {}
export async function getIdToken() { return 'mock-token'; }

export const EmailAuthProvider = {
  credential: () => ({}),
};
