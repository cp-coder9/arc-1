const fallbackRole = (import.meta.env.VITE_TEST_ROLE || 'client') as string;

function getRole() {
  if (typeof window === 'undefined') return fallbackRole;
  return new URLSearchParams(window.location.search).get('role') || fallbackRole;
}

function makeMockAuthUser() {
  const role = getRole();
  return {
    uid: `${role}-user`,
    email: `${role}@example.test`,
    displayName: `${role[0].toUpperCase()}${role.slice(1)} User`,
    emailVerified: true,
    isAnonymous: false,
    tenantId: null,
    providerData: [],
    getIdToken: async () => 'mock-token',
  };
}

export const mockAuthUser = makeMockAuthUser();

export function getAuth() {
  return { get currentUser() { return makeMockAuthUser(); } };
}

export function setPersistence() {
  return Promise.resolve();
}

export const browserLocalPersistence = {};

export function onAuthStateChanged(_auth: unknown, callback: (user: ReturnType<typeof makeMockAuthUser>) => void) {
  queueMicrotask(() => callback(makeMockAuthUser()));
  return () => undefined;
}

export class GoogleAuthProvider {
  setCustomParameters() {}
}

export async function signInWithPopup() {
  return { user: makeMockAuthUser() };
}

export async function signOut() {}

export async function signInWithEmailAndPassword() {
  return { user: makeMockAuthUser() };
}

export async function createUserWithEmailAndPassword() {
  return { user: makeMockAuthUser() };
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
