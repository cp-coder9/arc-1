import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.ENCRYPTION_KEY = 'test-encryption-key-32-characters-long';
process.env.AGENT_API_KEY = 'agent-secret';
process.env.BLOB_READ_WRITE_TOKEN = 'blob-token';
process.env.VITE_PAYFAST_MERCHANT_ID = '10000100';
process.env.VITE_PAYFAST_MERCHANT_KEY = 'merchant-key';
process.env.VITE_PAYFAST_SANDBOX = 'true';
process.env.APP_BASE_URL = 'https://architex.test';

type StoredDoc = Record<string, any>;

type QueryFilter = { field: string; op: string; value: any };

class MockDocSnapshot {
  constructor(public id: string, private value: StoredDoc | undefined, public ref: MockDocRef) {}
  get exists() {
    return this.value !== undefined;
  }
  data() {
    return this.value;
  }
}

class MockQuerySnapshot {
  docs: MockDocSnapshot[];
  empty: boolean;
  size: number;

  constructor(docs: MockDocSnapshot[]) {
    this.docs = docs;
    this.empty = docs.length === 0;
    this.size = docs.length;
  }
}

class MockDocRef {
  id: string;

  constructor(private db: MockAdminDb, private path: string) {
    this.id = path.split('/').at(-1) || path;
  }

  collection(name: string) {
    return new MockCollectionRef(this.db, `${this.path}/${name}`);
  }

  async get() {
    return new MockDocSnapshot(this.id, this.db.getDoc(this.path), this);
  }

  async set(data: StoredDoc, options?: { merge?: boolean }) {
    this.db.setDoc(this.path, data, options?.merge);
  }

  async update(data: StoredDoc) {
    this.db.updateDoc(this.path, data);
  }

  async delete() {
    this.db.deleteDoc(this.path);
  }
}

class MockCollectionRef {
  private filters: QueryFilter[] = [];
  private limitCount?: number;

  constructor(private db: MockAdminDb, private path: string) {}

  doc(id?: string) {
    return new MockDocRef(this.db, `${this.path}/${id || this.db.nextId(this.path)}`);
  }

  async add(data: StoredDoc) {
    const ref = this.doc();
    await ref.set(data);
    return ref;
  }

  where(field: string, op: string, value: any) {
    const next = new MockCollectionRef(this.db, this.path);
    next.filters = [...this.filters, { field, op, value }];
    next.limitCount = this.limitCount;
    return next;
  }

  orderBy() {
    return this;
  }

  limit(count: number) {
    const next = new MockCollectionRef(this.db, this.path);
    next.filters = [...this.filters];
    next.limitCount = count;
    return next;
  }

  async get() {
    let docs = this.db.listCollection(this.path).filter(({ data }) => this.filters.every(filter => {
      const actual = data[filter.field];
      if (filter.op === '==') return actual === filter.value;
      if (filter.op === 'in') return Array.isArray(filter.value) && filter.value.includes(actual);
      return false;
    }));
    if (this.limitCount !== undefined) docs = docs.slice(0, this.limitCount);
    return new MockQuerySnapshot(docs.map(({ id, data }) => new MockDocSnapshot(id, data, new MockDocRef(this.db, `${this.path}/${id}`))));
  }
}

class MockAdminDb {
  store = new Map<string, StoredDoc>();
  writes: Array<{ op: string; path: string; data?: StoredDoc }> = [];
  private counters = new Map<string, number>();

  reset() {
    this.store.clear();
    this.writes = [];
    this.counters.clear();
  }

  seed(path: string, data: StoredDoc) {
    this.store.set(path, structuredClone(data));
  }

  collection(name: string) {
    return new MockCollectionRef(this, name);
  }

  batch() {
    const ops: Array<() => void> = [];
    return {
      set: (ref: MockDocRef, data: StoredDoc) => ops.push(() => this.setDoc((ref as any).path, data)),
      update: (ref: MockDocRef, data: StoredDoc) => ops.push(() => this.updateDoc((ref as any).path, data)),
      delete: (ref: MockDocRef) => ops.push(() => this.deleteDoc((ref as any).path)),
      commit: vi.fn(async () => ops.forEach(op => op())),
    };
  }

  async runTransaction<T>(callback: (tx: any) => Promise<T>) {
    const tx = {
      get: (ref: MockDocRef) => ref.get(),
      set: (ref: MockDocRef, data: StoredDoc) => this.setDoc((ref as any).path, data),
      update: (ref: MockDocRef, data: StoredDoc) => this.updateDoc((ref as any).path, data),
      delete: (ref: MockDocRef) => this.deleteDoc((ref as any).path),
    };
    return callback(tx);
  }

  async listCollections() {
    return Array.from(new Set(Array.from(this.store.keys()).map(path => path.split('/')[0]))).map(id => ({ id }));
  }

  nextId(collectionPath: string) {
    const next = (this.counters.get(collectionPath) || 0) + 1;
    this.counters.set(collectionPath, next);
    return `${collectionPath.replace(/\//g, '_')}_${next}`;
  }

  getDoc(path: string) {
    const value = this.store.get(path);
    return value ? structuredClone(value) : undefined;
  }

  setDoc(path: string, data: StoredDoc, merge = false) {
    const current = merge ? this.store.get(path) || {} : {};
    this.store.set(path, structuredClone({ ...current, ...data }));
    this.writes.push({ op: 'set', path, data: structuredClone(data) });
  }

  updateDoc(path: string, data: StoredDoc) {
    const current = this.store.get(path) || {};
    this.store.set(path, structuredClone({ ...current, ...data }));
    this.writes.push({ op: 'update', path, data: structuredClone(data) });
  }

  deleteDoc(path: string) {
    this.store.delete(path);
    this.writes.push({ op: 'delete', path });
  }

  listCollection(path: string) {
    const prefix = `${path}/`;
    return Array.from(this.store.entries())
      .filter(([key]) => key.startsWith(prefix) && key.slice(prefix.length).split('/').length === 1)
      .map(([key, data]) => ({ id: key.slice(prefix.length), data: structuredClone(data) }));
  }
}

const mockAdminDb = new MockAdminDb();
const verifyIdToken = vi.fn(async (token: string) => {
  const users: Record<string, any> = {
    client: { uid: 'client-1', email: 'client@example.com', displayName: 'Client One' },
    architect: { uid: 'architect-1', email: 'architect@example.com', displayName: 'Architect One' },
    intruder: { uid: 'intruder-1', email: 'intruder@example.com', displayName: 'Intruder' },
    admin: { uid: 'admin-1', email: 'gm.tarb@gmail.com', displayName: 'Admin' },
    contractor: { uid: 'contractor-1', email: 'contractor@example.com', displayName: 'Contractor One' },
    newbep: { uid: 'new-bep-1', email: 'newbep@example.com', displayName: 'New BEP' },
  };
  if (!users[token]) throw new Error('bad token');
  return users[token];
});

const put = vi.fn(async () => ({ url: 'https://files.public.blob.vercel-storage.com/drawing.pdf' }));
const del = vi.fn(async () => undefined);
const runMunicipalBrowserAutomation = vi.fn(async () => ({ success: true, status: 'checked' }));
const trackMunicipalityStatus = vi.fn(async () => ({ status: 'Submitted' }));
const processReceiptOCR = vi.fn(async () => ({ success: true, amount: 12345 }));
const detectMunicipalInvoices = vi.fn(async () => ({ invoices: [{ municipality: 'city_of_cape_town' }] }));
const getMunicipalityHeatMap = vi.fn(async () => ({ municipality: 'city_of_cape_town', count: 1 }));

vi.mock('../firebase-admin', () => ({
  admin: {},
  adminDb: mockAdminDb,
  auth: { verifyIdToken },
  firebaseConfig: { projectId: 'test-project', firestoreDatabaseId: 'test-db' },
}));

vi.mock('@vercel/blob', () => ({ put, del }));
vi.mock('../../services/ocrService', () => ({ processReceiptOCR }));
vi.mock('../../services/shadowTrackerService', () => ({ detectMunicipalInvoices, getMunicipalityHeatMap }));
vi.mock('../../services/sacapVerificationService', () => ({ verifySACAPByName: vi.fn(async () => ({ isValid: true })) }));
vi.mock('../../services/verificationAgentService', () => ({
  runVerificationBrowserAgent: vi.fn(async () => ({
    provider: 'sacap',
    status: 'verified',
    source: 'automated_browser_agent',
    checkedAt: '2026-01-02T03:04:05.000Z',
    officialUrl: 'https://search.mymembership.co.za/Search/?Id=4f3f0fde-d5dc-4af0-97cd-0a192a56830e',
    searchMode: 'name',
    requiresHumanReview: false,
    details: { category: 'Professional Architect', registrationNumber: 'SACAP-123' },
  })),
}));
vi.mock('../municipalAutomation', () => ({ runMunicipalBrowserAutomation, trackMunicipalityStatus }));
vi.mock('../../services/notificationService', () => ({ notificationService: { create: vi.fn(), sendNotification: vi.fn() } }));

async function buildApp() {
  const router = (await import('../api-router')).default;
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '50mb' }));
  app.use('/api', router);
  return app;
}

function authHeader(token = 'client') {
  return { Authorization: `Bearer ${token}`, Origin: 'http://127.0.0.1', Host: '127.0.0.1' };
}

function seedVerifiedBepVerification(userId = 'architect-1', overrides: StoredDoc = {}) {
  mockAdminDb.seed(`user_verifications/${userId}_bep_SACAP_SACAP-123`, {
    userId,
    subjectType: 'bep',
    statutoryBody: 'SACAP',
    registrationNumber: 'SACAP-123',
    status: 'verified',
    source: 'automated_browser_agent',
    submittedAt: '2026-01-01T00:00:00.000Z',
    submittedBy: userId,
    lastVerifiedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    metadata: {},
    ...overrides,
  });
}

function seedVerifiedDirectoryVerification(userId: string, subjectType: string, statutoryBody: string, registrationNumber: string, overrides: StoredDoc = {}) {
  mockAdminDb.seed(`user_verifications/${userId}_${subjectType}_${statutoryBody}_${registrationNumber}`, {
    userId,
    subjectType,
    statutoryBody,
    registrationNumber,
    status: 'verified',
    source: 'automated_browser_agent',
    submittedAt: '2026-01-01T00:00:00.000Z',
    submittedBy: userId,
    lastVerifiedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    metadata: {},
    ...overrides,
  });
}

function seedDirectoryProfile(userId: string, data: StoredDoc) {
  mockAdminDb.seed(`directory_profiles/${userId}`, {
    userId,
    name: data.displayName || data.name || data.company || data.companyName || data.businessName || 'Directory profile',
    role: data.role,
    normalizedRole: data.normalizedRole,
    company: data.company || data.companyName || data.businessName || null,
    professionalDiscipline: data.professionalDiscipline || data.discipline || data.contractorCategory || null,
    trade: data.trade || data.tradeCategory || null,
    region: data.region || null,
    directoryVisibility: data.directoryVisibility ?? true,
    averageRating: data.averageRating ?? 0,
    totalReviews: data.totalReviews ?? 0,
    verificationStatus: data.verificationStatus || 'unverified',
    verificationLabel: data.verificationLabel || data.verificationStatus || 'unverified',
    verificationId: data.verificationId || null,
    registrationNumber: data.registrationNumber || null,
    canInvite: data.verificationStatus === 'verified',
    ...data,
  });
}

describe('api-router security and high-value integration routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-02T03:04:05.000Z'));
    mockAdminDb.reset();
    mockAdminDb.seed('users/client-1', { role: 'client', displayName: 'Client One', email: 'client@example.com' });
    mockAdminDb.seed('users/architect-1', { role: 'architect', displayName: 'Architect One', sacapNumber: 'SACAP-123', mainSpecialization: 'residential' });
    mockAdminDb.seed('users/admin-1', { role: 'admin', displayName: 'Admin', email: 'gm.tarb@gmail.com' });
    mockAdminDb.seed('users/intruder-1', { role: 'architect', displayName: 'Intruder' });
    mockAdminDb.seed('users/contractor-1', { role: 'contractor', displayName: 'Contractor One', companyName: 'BuildCo', region: 'Cape Town', contractorCategory: 'general contractor', averageRating: 4.5, totalReviews: 7 });
    mockAdminDb.seed('system_settings/llm_config', { provider: 'openai', apiKey: 'test-llm-key', model: 'gpt-test', baseUrl: 'https://llm.test/v1' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('blocks cross-origin state-changing requests before route handlers run', async () => {
    const app = await buildApp();

    const response = await request(app)
      .post('/api/auth/check-admin')
      .set('Origin', 'https://evil.example')
      .set('Host', 'architex.test')
      .send({ role: 'admin' });

    expect(response.status).toBe(403);
    expect(response.body.error).toContain('Cross-origin');
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it('requires Firebase auth for protected API routes', async () => {
    const app = await buildApp();

    const response = await request(app)
      .post('/api/files/upload')
      .set('Origin', 'http://127.0.0.1')
      .set('Host', '127.0.0.1')
      .send({ context: 'job', fileBase64: 'ZmlsZQ==' });

    expect(response.status).toBe(401);
    expect(response.body.error).toContain('Missing authorization');
  });

  it('sanitizes check-admin profile data and ignores non-whitelisted role escalation fields', async () => {
    const app = await buildApp();
    mockAdminDb.store.delete('users/client-1');

    const response = await request(app)
      .post('/api/auth/check-admin')
      .set(authHeader('client'))
      .send({
        role: 'admin',
        displayName: 'Client One',
        profileData: {
          bio: 'Safe biography',
          role: 'admin',
          isAdmin: true,
          email: 'attacker@example.com',
        },
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ role: 'client', isAdmin: false, created: true });
    expect(mockAdminDb.getDoc('users/client-1')).toMatchObject({
      role: 'client',
      email: 'client@example.com',
      bio: 'Safe biography',
    });
    expect(mockAdminDb.getDoc('users/client-1')).not.toHaveProperty('isAdmin');
    expect(mockAdminDb.getDoc('users/client-1')).not.toHaveProperty('sacapNumber');
    expect(mockAdminDb.listCollection('audit_logs')[0].data).toMatchObject({
      category: 'auth',
      action: 'auth.user_bootstrapped',
      target: { type: 'user', id: 'client-1' },
      immutable: true,
    });
  });

  it('upgrades only allow-listed admin email accounts during check-admin', async () => {
    const app = await buildApp();
    mockAdminDb.seed('users/admin-1', { role: 'client', email: 'gm.tarb@gmail.com' });

    const response = await request(app)
      .post('/api/auth/check-admin')
      .set(authHeader('admin'))
      .send({ role: 'client' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ role: 'admin', isAdmin: true, upgraded: true });
    expect(mockAdminDb.getDoc('users/admin-1')?.role).toBe('admin');
    expect(mockAdminDb.listCollection('audit_logs')[0].data).toMatchObject({
      category: 'role',
      action: 'role.admin_allowlist_upgraded',
      target: { type: 'user', id: 'admin-1' },
    });
  });

  it('allows architects to apply once to open jobs and notifies the client', async () => {
    const app = await buildApp();
    mockAdminDb.seed('jobs/job-1', { title: 'House plan', clientId: 'client-1', status: 'open' });
    seedVerifiedBepVerification();

    const response = await request(app)
      .post('/api/jobs/job-1/applications')
      .set(authHeader('architect'))
      .send({ proposal: 'I can deliver compliant plans.', notes: 'Available now' });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ jobId: 'job-1', status: 'pending' });
    const apps = mockAdminDb.listCollection('jobs/job-1/applications');
    expect(apps).toHaveLength(1);
    expect(apps[0].data).toMatchObject({ architectId: 'architect-1', status: 'pending', proposal: 'I can deliver compliant plans.', verificationId: 'architect-1_bep_SACAP_SACAP-123' });
    expect(mockAdminDb.listCollection('notifications')[0].data).toMatchObject({ userId: 'client-1', type: 'job_application' });
    expect(mockAdminDb.listCollection('audit_logs')[0].data).toMatchObject({
      category: 'project',
      action: 'marketplace.application_submitted',
      actor: { uid: 'architect-1', role: 'architect' },
      metadata: { normalizedRole: 'bep', verificationId: 'architect-1_bep_SACAP_SACAP-123' },
    });
  });

  it('treats BEP users as eligible for marketplace application while preserving legacy architect fields', async () => {
    const app = await buildApp();
    mockAdminDb.seed('users/bep-1', { role: 'bep', displayName: 'BEP One', mainSpecialization: 'coordination' });
    verifyIdToken.mockImplementationOnce(async () => ({ uid: 'bep-1', email: 'bep@example.com', displayName: 'BEP One' }));
    mockAdminDb.seed('jobs/job-1', { title: 'House plan', clientId: 'client-1', status: 'open' });
    seedVerifiedBepVerification('bep-1');

    const response = await request(app)
      .post('/api/jobs/job-1/applications')
      .set(authHeader('bep'))
      .send({ proposal: 'BEP coordination proposal' });

    expect(response.status).toBe(201);
    expect(mockAdminDb.listCollection('jobs/job-1/applications')[0].data).toMatchObject({ architectId: 'bep-1', status: 'pending' });
    expect(mockAdminDb.listCollection('audit_logs')[0].data).toMatchObject({ metadata: { normalizedRole: 'bep' } });
  });

  it('prevents clients, unverified architects, and duplicate architects from applying to marketplace jobs', async () => {
    const app = await buildApp();
    mockAdminDb.seed('jobs/job-1', { title: 'House plan', clientId: 'client-1', status: 'open' });

    const clientResponse = await request(app)
      .post('/api/jobs/job-1/applications')
      .set(authHeader('client'))
      .send({ proposal: 'Let me apply' });
    const unverifiedResponse = await request(app)
      .post('/api/jobs/job-1/applications')
      .set(authHeader('architect'))
      .send({ proposal: 'I am not verified yet' });

    seedVerifiedBepVerification();
    mockAdminDb.seed('jobs/job-1/applications/app-existing', { architectId: 'architect-1', status: 'pending' });
    const duplicateResponse = await request(app)
      .post('/api/jobs/job-1/applications')
      .set(authHeader('architect'))
      .send({ proposal: 'Second application' });

    expect(clientResponse.status).toBe(403);
    expect(unverifiedResponse.status).toBe(403);
    expect(unverifiedResponse.body).toMatchObject({ verificationRequired: { subjectType: 'bep', statutoryBody: 'SACAP' } });
    expect(mockAdminDb.listCollection('audit_logs').some(({ data }) => data.action === 'marketplace.application_blocked_unverified_bep')).toBe(true);
    expect(duplicateResponse.status).toBe(409);
  });

  it('accepts applications only for the job owner and creates/updates project team data', async () => {
    const app = await buildApp();
    mockAdminDb.seed('jobs/job-1', { title: 'House plan', clientId: 'client-1', status: 'open', statusHistory: [] });
    mockAdminDb.seed('jobs/job-1/applications/app-1', { architectId: 'architect-1', architectName: 'Architect One', status: 'pending' });

    const forbidden = await request(app)
      .post('/api/jobs/job-1/applications/app-1/accept')
      .set(authHeader('intruder'))
      .send({});
    const accepted = await request(app)
      .post('/api/jobs/job-1/applications/app-1/accept')
      .set(authHeader('client'))
      .send({});

    expect(forbidden.status).toBe(403);
    expect(accepted.status).toBe(200);
    expect(mockAdminDb.getDoc('jobs/job-1')).toMatchObject({ status: 'in-progress', selectedArchitectId: 'architect-1' });
    expect(mockAdminDb.getDoc('projects/job-1')).toMatchObject({ clientId: 'client-1', leadArchitectId: 'architect-1', currentStage: 'intake' });
    expect(mockAdminDb.listCollection('audit_logs')[0].data).toMatchObject({
      category: 'approval',
      action: 'marketplace.application_accepted',
      metadata: { selectedBepId: 'architect-1' },
    });
  });

  it('enforces job ownership/admin authorization for uploads and persists Blob metadata', async () => {
    const app = await buildApp();
    mockAdminDb.seed('jobs/job-1', { title: 'House plan', clientId: 'client-1', selectedArchitectId: 'architect-1' });

    const forbidden = await request(app)
      .post('/api/files/upload')
      .set(authHeader('intruder'))
      .send({ context: 'job', jobId: 'job-1', fileBase64: 'ZmlsZQ==', fileName: 'drawing.pdf', fileType: 'application/pdf', fileSize: 4 });
    const uploaded = await request(app)
      .post('/api/files/upload')
      .set(authHeader('architect'))
      .send({ context: 'job', jobId: 'job-1', fileBase64: 'ZmlsZQ==', fileName: 'drawing.pdf', fileType: 'application/pdf', fileSize: 4 });

    expect(forbidden.status).toBe(403);
    expect(uploaded.status).toBe(200);
    expect(put).toHaveBeenCalledWith('drawing.pdf', expect.any(Buffer), expect.objectContaining({ token: 'blob-token', contentType: 'application/pdf' }));
    expect(mockAdminDb.listCollection('uploaded_files')[0].data).toMatchObject({ uploadedBy: 'architect-1', jobId: 'job-1', context: 'job' });
  });

  it('allows file deletion only by owner or admin and removes both Blob and Firestore record', async () => {
    const app = await buildApp();
    mockAdminDb.seed('uploaded_files/file-1', { uploadedBy: 'architect-1', url: 'https://files.public.blob.vercel-storage.com/drawing.pdf' });

    const forbidden = await request(app)
      .post('/api/files/delete')
      .set(authHeader('client'))
      .send({ fileId: 'file-1', fileUrl: 'https://files.public.blob.vercel-storage.com/drawing.pdf' });
    const deleted = await request(app)
      .post('/api/files/delete')
      .set(authHeader('architect'))
      .send({ fileId: 'file-1', fileUrl: 'https://files.public.blob.vercel-storage.com/drawing.pdf' });

    expect(forbidden.status).toBe(403);
    expect(deleted.status).toBe(200);
    expect(del).toHaveBeenCalledWith('https://files.public.blob.vercel-storage.com/drawing.pdf', { token: 'blob-token' });
    expect(mockAdminDb.getDoc('uploaded_files/file-1')).toBeUndefined();
  });

  it('rejects Gemini review requests with untrusted drawing URLs', async () => {
    const app = await buildApp();

    const response = await request(app)
      .post('/api/gemini/review')
      .set(authHeader('client'))
      .send({ prompt: 'review', drawingUrl: 'https://evil.example/drawing.png', config: { apiKey: 'gemini-key' } });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('valid Vercel Blob URLs');
  });

  it('routes non-Gemini review requests through configured provider with guardrails', async () => {
    const app = await buildApp();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{}' } }] }),
    })) as any;
    vi.stubGlobal('fetch', fetchMock);

    const response = await request(app)
      .post('/api/review')
      .set(authHeader('client'))
      .send({ prompt: 'Check walls', systemInstruction: 'Return JSON.', config: { provider: 'openai', apiKey: 'key', model: 'gpt-4o', baseUrl: 'https://llm.example/v1' } });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith('https://llm.example/v1/chat/completions', expect.objectContaining({ method: 'POST' }));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages[0].content).toContain('preliminary South African built-environment review');
    expect(body.messages[1].content[0].text).toBe('Check walls');
    vi.unstubAllGlobals();
  });

  it('initializes escrow only for job clients and creates a signed PayFast payment URL', async () => {
    const app = await buildApp();
    mockAdminDb.seed('jobs/job-1', { title: 'House plan', clientId: 'client-1', selectedArchitectId: 'architect-1', budget: 100000 });

    const forbidden = await request(app)
      .post('/api/payment/escrow/init')
      .set(authHeader('architect'))
      .send({ jobId: 'job-1' });
    const initialized = await request(app)
      .post('/api/payment/escrow/init')
      .set(authHeader('client'))
      .send({ jobId: 'job-1' });

    expect(forbidden.status).toBe(403);
    expect(initialized.status).toBe(200);
    expect(initialized.body.paymentUrl).toContain('signature=');
    const payment = mockAdminDb.listCollection('payments')[0].data;
    expect(payment).toMatchObject({ payerId: 'client-1', payeeId: 'architect-1', amount: 105000, status: 'pending' });
    expect(mockAdminDb.getDoc('escrow/job-1')).toMatchObject({ totalAmount: 105000, status: 'pending' });
    expect(mockAdminDb.listCollection('audit_logs')[0].data).toMatchObject({
      category: 'payment',
      action: 'payment.escrow_initiated',
      target: { type: 'payment' },
      metadata: { totalAmount: 105000, platformFee: 5000 },
    });
  });

  it('restricts refund request listing and processing to admins', async () => {
    const app = await buildApp();
    mockAdminDb.seed('refund_requests/refund-1', { status: 'pending', jobId: 'job-1', clientId: 'client-1', amount: 1000 });
    mockAdminDb.seed('jobs/job-1', { title: 'House plan', budget: 100000 });

    const forbidden = await request(app)
      .get('/api/payment/refund/requests')
      .set(authHeader('client'));
    const listed = await request(app)
      .get('/api/payment/refund/requests')
      .set(authHeader('admin'));
    const rejected = await request(app)
      .post('/api/payment/refund/refund-1/process')
      .set(authHeader('admin'))
      .send({ action: 'reject', adminNote: 'Insufficient grounds' });

    expect(forbidden.status).toBe(403);
    expect(listed.status).toBe(200);
    expect(listed.body.requests[0]).toMatchObject({ id: 'refund-1', jobTitle: 'House plan' });
    expect(rejected.status).toBe(200);
    expect(mockAdminDb.getDoc('refund_requests/refund-1')).toMatchObject({ status: 'rejected', processedBy: 'admin-1' });
    expect(mockAdminDb.listCollection('audit_logs')[0].data).toMatchObject({
      category: 'admin_override',
      action: 'payment.refund_rejected',
      reason: 'Insufficient grounds',
    });
  });

  it('stores municipal credentials encrypted and enforces ownership for credential reads', async () => {
    const app = await buildApp();

    const saved = await request(app)
      .post('/api/municipal/credentials')
      .set(authHeader('client'))
      .send({ municipality: 'city_of_cape_town', username: 'portal-user', password: 'super-secret', referenceNumber: 'REF-1' });
    const forbidden = await request(app)
      .get('/api/municipal/settings')
      .query({ credentialId: 'client-1_city_of_cape_town' })
      .set(authHeader('architect'));
    const settings = await request(app)
      .get('/api/municipal/settings')
      .query({ credentialId: 'client-1_city_of_cape_town' })
      .set(authHeader('client'));

    expect(saved.status).toBe(200);
    const credential = mockAdminDb.getDoc('municipal_credentials/client-1_city_of_cape_town');
    expect(credential).toMatchObject({ userId: 'client-1', username: 'portal-user', municipality: 'city_of_cape_town' });
    expect(credential?.encryptedPassword).not.toBe('super-secret');
    expect(credential).not.toHaveProperty('password');
    expect(forbidden.status).toBe(403);
    expect(settings.status).toBe(200);
    expect(settings.body.credential).toMatchObject({ id: 'client-1_city_of_cape_town', username: 'portal-user' });
    expect(mockAdminDb.listCollection('audit_logs')[0].data).toMatchObject({
      category: 'access',
      action: 'municipal.credentials_saved',
      target: { type: 'municipal_credentials', id: 'client-1_city_of_cape_town' },
    });
  });

  it('submits generalized verifications and queues the browser verification agent', async () => {
    const app = await buildApp();

    const response = await request(app)
      .post('/api/verifications/submit')
      .set(authHeader('architect'))
      .send({
        subjectType: 'bep',
        statutoryBody: 'SACAP',
        registrationNumber: 'SACAP-123',
        evidenceUrls: ['https://files.public.blob.vercel-storage.com/certificate.pdf'],
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      userId: 'architect-1',
      subjectType: 'bep',
      statutoryBody: 'SACAP',
      source: 'automated_browser_agent',
      status: 'pending',
    });
    expect(mockAdminDb.getDoc(`user_verifications/${response.body.id}`)).toMatchObject({ metadata: { verificationAgentStatus: 'queued' } });
    expect(mockAdminDb.getDoc('architect_verifications/architect-1')).toMatchObject({ userVerificationId: response.body.id, sacapNumber: 'SACAP-123' });
    expect(mockAdminDb.listCollection('audit_logs').some(({ data }) => data.action === 'verification.submitted')).toBe(true);
  });

  it('allows admins to review verification records and mirrors SACAP legacy records', async () => {
    const app = await buildApp();
    mockAdminDb.seed('user_verifications/ver-1', {
      userId: 'architect-1',
      subjectType: 'bep',
      statutoryBody: 'SACAP',
      registrationNumber: 'SACAP-123',
      status: 'pending',
      source: 'automated_browser_agent',
      submittedAt: '2026-01-02T03:04:05.000Z',
      submittedBy: 'architect-1',
      createdAt: '2026-01-02T03:04:05.000Z',
      metadata: {},
    });

    const forbidden = await request(app)
      .post('/api/admin/verifications/ver-1/review')
      .set(authHeader('architect'))
      .send({ status: 'verified' });
    const approved = await request(app)
      .post('/api/admin/verifications/ver-1/review')
      .set(authHeader('admin'))
      .send({ status: 'verified', adminReviewNote: 'Confirmed against official register evidence' });

    expect(forbidden.status).toBe(403);
    expect(approved.status).toBe(200);
    expect(mockAdminDb.getDoc('user_verifications/ver-1')).toMatchObject({ status: 'verified', reviewedBy: 'admin-1' });
    expect(mockAdminDb.getDoc('architect_verifications/architect-1')).toMatchObject({ status: 'verified', userVerificationId: 'ver-1' });
    expect(mockAdminDb.listCollection('audit_logs').some(({ data }) => data.action === 'verification.verified')).toBe(true);
  });



  it('lets admins queue official register rechecks for expiring verification records', async () => {
    const app = await buildApp();
    mockAdminDb.seed('user_verifications/ver-recheck', {
      userId: 'architect-1',
      subjectType: 'bep',
      statutoryBody: 'SACAP',
      registrationNumber: 'SACAP-123',
      status: 'verified',
      source: 'automated_browser_agent',
      submittedAt: '2026-01-01T00:00:00.000Z',
      submittedBy: 'architect-1',
      lastVerifiedAt: '2026-01-01T00:00:00.000Z',
      expiresAt: '2026-01-20T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      metadata: { existing: true },
    });

    const forbidden = await request(app)
      .post('/api/admin/verifications/ver-recheck/recheck')
      .set(authHeader('architect'))
      .send({ reason: 'Trying as non-admin' });
    const queued = await request(app)
      .post('/api/admin/verifications/ver-recheck/recheck')
      .set(authHeader('admin'))
      .send({ reason: 'Expiry due soon' });

    expect(forbidden.status).toBe(403);
    expect(queued.status).toBe(200);
    expect(queued.body).toMatchObject({ status: 'pending', metadata: { existing: true, verificationAgentStatus: 'queued', recheckRequestedBy: 'admin-1', previousStatus: 'verified' } });
    expect(mockAdminDb.getDoc('architect_verifications/architect-1')).toMatchObject({ userVerificationId: 'ver-recheck' });
    expect(mockAdminDb.listCollection('audit_logs').some(({ data }) => data.action === 'verification.recheck_queued')).toBe(true);
  });

  it('lets users update role-specific profile fields and projects directory-safe data', async () => {
    const app = await buildApp();
    seedVerifiedBepVerification('architect-1');

    const response = await request(app)
      .put('/api/profile/me')
      .set(authHeader('architect'))
      .send({
        profileData: {
          displayName: 'Architect Updated',
          practiceName: 'Studio Profile',
          professionalDiscipline: 'architecture',
          region: 'Cape Town',
          availability: 'available',
          billingDetails: { vat: 'VAT-123' },
          bankingPayoutDetails: { account: 'should-not-save-for-bep' },
          role: 'admin',
          isAdmin: true,
        },
      });

    expect(response.status).toBe(200);
    expect(mockAdminDb.getDoc('users/architect-1')).toMatchObject({ displayName: 'Architect Updated', practiceName: 'Studio Profile', professionalDiscipline: 'architecture', billingDetails: { vat: 'VAT-123' } });
    expect(mockAdminDb.getDoc('users/architect-1')).not.toHaveProperty('bankingPayoutDetails');
    expect(mockAdminDb.getDoc('users/architect-1')).not.toHaveProperty('isAdmin');
    expect(mockAdminDb.getDoc('directory_profiles/architect-1')).toMatchObject({ userId: 'architect-1', name: 'Architect Updated', company: 'Studio Profile', normalizedRole: 'bep', professionalDiscipline: 'architecture', region: 'Cape Town', verificationStatus: 'verified', verificationId: 'architect-1_bep_SACAP_SACAP-123' });
    expect(mockAdminDb.getDoc('directory_profiles/architect-1')).not.toHaveProperty('billingDetails');
    expect(mockAdminDb.listCollection('audit_logs').some(({ data }) => data.action === 'profile.updated')).toBe(true);
  });

  it('allows admins to update role profiles with scoped fields and audit trail', async () => {
    const app = await buildApp();
    seedVerifiedDirectoryVerification('contractor-1', 'contractor', 'CIDB', 'CIDB-1');

    const response = await request(app)
      .put('/api/admin/users/contractor-1/profile')
      .set(authHeader('admin'))
      .send({ profileData: { companyName: 'BuildCo Updated', trades: ['general building'], regionsServed: ['Gauteng'], cpdRecords: ['not-contractor-field'] }, reason: 'Correct contractor profile' });

    expect(response.status).toBe(200);
    expect(mockAdminDb.getDoc('users/contractor-1')).toMatchObject({ companyName: 'BuildCo Updated', trades: ['general building'], regionsServed: ['Gauteng'] });
    expect(mockAdminDb.getDoc('users/contractor-1')).not.toHaveProperty('cpdRecords');
    expect(mockAdminDb.getDoc('directory_profiles/contractor-1')).toMatchObject({ company: 'BuildCo Updated', normalizedRole: 'contractor', trade: 'general building', region: 'Gauteng', verificationStatus: 'verified' });
    expect(mockAdminDb.listCollection('audit_logs').some(({ data }) => data.action === 'profile.admin_updated')).toBe(true);
  });

  it('persists guided client briefs with AI interpretation and sanitized evidence', async () => {
    const app = await buildApp();

    const blocked = await request(app)
      .post('/api/client-briefs')
      .set(authHeader('architect'))
      .send({ projectGoal: 'I need plans approved for an existing house addition.' });

    const response = await request(app)
      .post('/api/client-briefs')
      .set(authHeader('client'))
      .send({
        selectedOption: 'I need plans approved.',
        projectGoal: 'I built a small house extension and need plans approved by council.',
        siteAddress: '12 Main Road, Cape Town',
        hasExistingPlans: false,
        workExistsAlready: true,
        urgency: 'urgent',
        budgetComfortLevel: 'limited',
        supportNeeds: ['plans', 'approvals', 'not-a-real-option'],
        evidenceUploads: [
          { name: 'photo.jpg', url: 'https://files.public.blob.vercel-storage.com/photo.jpg', type: 'image/jpeg' },
          { name: 'evil.jpg', url: 'https://evil.example/evil.jpg', type: 'image/jpeg' },
        ],
      });

    expect(blocked.status).toBe(403);
    expect(response.status).toBe(201);
    expect(response.body.brief).toMatchObject({ clientId: 'client-1', status: 'ai_interpreted', selectedOption: 'I need plans approved.' });
    expect(response.body.brief.interpretation.clientSummary).toContain('plans approved');
    expect(response.body.brief.interpretation.riskFlags.length).toBeGreaterThan(0);
    expect(response.body.brief.supportNeeds).toEqual(['plans', 'approvals']);
    expect(response.body.brief.evidenceUploads).toHaveLength(1);
    expect(mockAdminDb.getDoc('client_briefs/client_briefs_1')).toMatchObject({ clientId: 'client-1', status: 'ai_interpreted' });
    expect(mockAdminDb.listCollection('audit_logs').some(({ data }) => data.action === 'brief.client_created')).toBe(true);
  });

  it('assigns verified BEPs and lets only assigned BEPs finalize technical briefs', async () => {
    const app = await buildApp();
    seedVerifiedBepVerification('architect-1');
    mockAdminDb.seed('client_briefs/brief-1', {
      id: 'brief-1',
      clientId: 'client-1',
      clientName: 'Client One',
      status: 'ai_interpreted',
      selectedOption: 'I want to renovate or add to my house.',
      projectGoal: 'We need a residential addition with council approvals.',
      evidenceUploads: [],
      interpretation: { clientSummary: 'Residential addition', possibleProjectRoute: 'BEP feasibility review' },
      assignedBepIds: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const unassigned = await request(app)
      .put('/api/client-briefs/brief-1/technical-brief')
      .set(authHeader('architect'))
      .send({ technicalClassification: 'Residential additions', deliverables: ['Sketch plan'] });

    const assigned = await request(app)
      .post('/api/client-briefs/brief-1/assign-bep')
      .set(authHeader('client'))
      .send({ targetBepId: 'architect-1' });

    const finalized = await request(app)
      .put('/api/client-briefs/brief-1/technical-brief')
      .set(authHeader('architect'))
      .send({
        finalize: true,
        technicalClassification: 'Residential additions and municipal regularisation',
        requiredProfessionals: ['Architectural professional', 'Structural engineer'],
        likelyApprovals: ['Municipal building plan approval'],
        projectScope: ['Measured survey', 'Council submission drawings'],
        deliverables: ['Technical brief', 'Submission drawing pack'],
        exclusions: ['Construction contract administration'],
        assumptions: ['Client can provide title deed'],
        missingInformation: ['Confirm erf number', 'Upload title deed'],
        riskFlags: ['Existing work may need regularisation'],
      });

    const readAsBep = await request(app)
      .get('/api/client-briefs/brief-1')
      .set(authHeader('architect'));

    expect(unassigned.status).toBe(403);
    expect(assigned.status).toBe(200);
    expect(assigned.body).toMatchObject({ assignedBepId: 'architect-1' });
    expect(mockAdminDb.getDoc('client_briefs/brief-1')?.assignedBepIds).toEqual(['architect-1']);
    expect(finalized.status).toBe(200);
    expect(finalized.body.technicalBrief).toMatchObject({ status: 'finalized', clientBriefId: 'brief-1', bepId: 'architect-1' });
    expect(finalized.body.technicalBrief.tasks.map((task: any) => task.title)).toEqual(['Confirm erf number', 'Upload title deed']);
    expect(finalized.body.technicalBrief.downstreamFeeds).toEqual(expect.arrayContaining(['contract_builder', 'drawing_register', 'municipal_tracker', 'ai_workflows']));
    expect(mockAdminDb.getDoc('client_briefs/brief-1')).toMatchObject({ status: 'technical_finalized', technicalBriefId: 'brief-1' });
    expect(mockAdminDb.getDoc('technical_briefs/brief-1')).toMatchObject({ technicalClassification: 'Residential additions and municipal regularisation', status: 'finalized' });
    expect(readAsBep.status).toBe(200);
    expect(readAsBep.body.technicalBrief.status).toBe('finalized');
    expect(mockAdminDb.listCollection('audit_logs').some(({ data }) => data.action === 'brief.bep_assigned')).toBe(true);
    expect(mockAdminDb.listCollection('audit_logs').some(({ data }) => data.action === 'brief.technical_finalized')).toBe(true);

    const overwriteFinal = await request(app)
      .put('/api/client-briefs/brief-1/technical-brief')
      .set(authHeader('architect'))
      .send({ technicalClassification: 'Changed after final', deliverables: ['Changed'] });
    expect(overwriteFinal.status).toBe(409);
  });

  it('revalidates assigned BEP verification before technical brief edits', async () => {
    const app = await buildApp();
    mockAdminDb.seed('client_briefs/brief-unverified', {
      id: 'brief-unverified',
      clientId: 'client-1',
      clientName: 'Client One',
      status: 'ready_for_bep',
      projectGoal: 'Need professional scope confirmation for alterations.',
      evidenceUploads: [],
      interpretation: { clientSummary: 'Alterations' },
      assignedBepIds: ['architect-1'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const response = await request(app)
      .put('/api/client-briefs/brief-unverified/technical-brief')
      .set(authHeader('architect'))
      .send({ technicalClassification: 'Residential alteration', deliverables: ['Scope note'] });

    expect(response.status).toBe(403);
    expect(response.body.verificationRequired).toMatchObject({ subjectType: 'bep', statutoryBody: 'SACAP' });
    expect(mockAdminDb.getDoc('technical_briefs/brief-unverified')).toBeUndefined();
  });

  it('creates appointment contract, project code, milestones, invoices, and escrow from a finalized technical brief', async () => {
    const app = await buildApp();
    seedVerifiedBepVerification('architect-1');
    mockAdminDb.seed('client_briefs/brief-appoint', {
      id: 'brief-appoint',
      clientId: 'client-1',
      clientName: 'Client One',
      status: 'technical_finalized',
      projectGoal: 'Residential addition requiring approvals.',
      assignedBepIds: ['architect-1'],
      evidenceUploads: [],
      interpretation: { clientSummary: 'Residential addition' },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockAdminDb.seed('technical_briefs/brief-appoint', {
      id: 'brief-appoint',
      clientBriefId: 'brief-appoint',
      clientId: 'client-1',
      bepId: 'architect-1',
      status: 'finalized',
      technicalClassification: 'Residential additions and municipal submission',
      requiredProfessionals: ['Architectural professional', 'Structural engineer'],
      projectScope: ['Measured survey', 'Submission drawings'],
      deliverables: ['Technical brief', 'Drawing pack'],
      exclusions: ['Construction administration'],
      assumptions: ['Client supplies title deed'],
      downstreamFeeds: ['contract_builder', 'drawing_register', 'municipal_tracker'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const forbidden = await request(app)
      .post('/api/client-briefs/brief-appoint/appoint-bep')
      .set(authHeader('intruder'))
      .send({ professionalFee: 200000 });
    const response = await request(app)
      .post('/api/client-briefs/brief-appoint/appoint-bep')
      .set(authHeader('client'))
      .send({ professionalFee: 200000 });
    const duplicate = await request(app)
      .post('/api/client-briefs/brief-appoint/appoint-bep')
      .set(authHeader('client'))
      .send({ professionalFee: 200000 });

    expect(forbidden.status).toBe(403);
    expect(response.status).toBe(201);
    expect(response.body.project.projectCode).toMatch(/^ARC-20260102-/);
    expect(response.body.project).toMatchObject({ clientBriefId: 'brief-appoint', technicalBriefId: 'brief-appoint', clientId: 'client-1', leadArchitectId: 'architect-1', currentStage: 'appointment' });
    expect(response.body.contract).toMatchObject({ status: 'generated_pending_acceptance', professionalFee: 200000, platformFee: 10000, totalEscrowAmount: 210000, verificationId: 'architect-1_bep_SACAP_SACAP-123' });
    expect(response.body.contract.milestones).toHaveLength(5);
    expect(response.body.invoices).toHaveLength(5);
    expect(response.body.invoices.reduce((sum: number, invoice: any) => sum + invoice.totalAmount, 0)).toBe(200000);
    expect(mockAdminDb.listCollection('projects')).toHaveLength(1);
    const projectId = response.body.project.id;
    expect(mockAdminDb.getDoc(`appointment_contracts/${projectId}`)).toMatchObject({ projectId, clientBriefId: 'brief-appoint' });
    expect(mockAdminDb.getDoc(`escrow/${projectId}`)).toMatchObject({ totalAmount: 210000, platformFeeAmount: 10000, status: 'pending', payeeId: 'architect-1' });
    expect(mockAdminDb.getDoc('client_briefs/brief-appoint')).toMatchObject({ status: 'appointed', projectId, appointmentContractId: projectId });
    expect(mockAdminDb.getDoc('technical_briefs/brief-appoint')).toMatchObject({ projectId, appointmentContractId: projectId });
    expect(mockAdminDb.listCollection('audit_logs').some(({ data }) => data.action === 'contract.appointment_generated')).toBe(true);
    expect(duplicate.status).toBe(409);
  });

  it('returns profile-backed manual directory results without exposing private or unverified-only filtered records', async () => {
    const app = await buildApp();
    mockAdminDb.seed('users/architect-2', { role: 'architect', displayName: 'Verified Architect', companyName: 'Studio A', region: 'Cape Town', professionalDiscipline: 'architecture', averageRating: 4.8, totalReviews: 12 });
    mockAdminDb.seed('users/architect-private', { role: 'architect', displayName: 'Private Architect', region: 'Cape Town', directoryVisibility: 'private' });
    mockAdminDb.seed('users/contractor-2', { role: 'contractor', displayName: 'Verified Contractor', companyName: 'BuildRight', region: 'Cape Town', contractorCategory: 'general contractor' });
    seedVerifiedBepVerification('architect-2', { registrationNumber: 'SACAP-999' });
    seedVerifiedDirectoryVerification('contractor-2', 'contractor', 'CIDB', 'CIDB-7GB');
    seedDirectoryProfile('architect-2', { role: 'architect', normalizedRole: 'bep', name: 'Verified Architect', company: 'Studio A', region: 'Cape Town', professionalDiscipline: 'architecture', averageRating: 4.8, totalReviews: 12, verificationStatus: 'verified', verificationLabel: 'verified', verificationId: 'architect-2_bep_SACAP_SACAP-123', registrationNumber: 'SACAP-999' });
    seedDirectoryProfile('architect-private', { role: 'architect', normalizedRole: 'bep', name: 'Private Architect', region: 'Cape Town', directoryVisibility: 'private', verificationStatus: 'unverified' });
    seedDirectoryProfile('contractor-1', { role: 'contractor', normalizedRole: 'contractor', name: 'Contractor One', company: 'BuildCo', region: 'Cape Town', professionalDiscipline: 'general contractor', averageRating: 4.5, totalReviews: 7, verificationStatus: 'unverified', verificationLabel: 'unverified' });
    seedDirectoryProfile('contractor-2', { role: 'contractor', normalizedRole: 'contractor', name: 'Verified Contractor', company: 'BuildRight', region: 'Cape Town', professionalDiscipline: 'general contractor', verificationStatus: 'verified', verificationLabel: 'verified', verificationId: 'contractor-2_contractor_CIDB_CIDB-7GB', registrationNumber: 'CIDB-7GB' });

    const response = await request(app)
      .get('/api/directory/search')
      .query({ role: 'bep,contractor', region: 'cape' })
      .set(authHeader('client'));
    const verifiedOnly = await request(app)
      .get('/api/directory/search')
      .query({ role: 'bep,contractor', region: 'cape', verificationStatus: 'verified' })
      .set(authHeader('client'));

    expect(response.status).toBe(200);
    expect(response.body.results.map((result: any) => result.userId)).toEqual(expect.arrayContaining(['architect-2', 'contractor-1', 'contractor-2']));
    expect(response.body.results.map((result: any) => result.userId)).not.toContain('architect-private');
    const unverified = response.body.results.find((result: any) => result.userId === 'contractor-1');
    expect(unverified).toMatchObject({ verificationStatus: 'unverified', verificationLabel: 'unverified', canInvite: false });
    expect(verifiedOnly.body.results.map((result: any) => result.userId)).toEqual(expect.arrayContaining(['architect-2', 'contractor-2']));
    expect(verifiedOnly.body.results.every((result: any) => result.verificationStatus === 'verified' && result.canInvite === true)).toBe(true);
    expect(mockAdminDb.listCollection('audit_logs').some(({ data }) => data.action === 'directory.search')).toBe(true);
  });

  it('enforces Full_scope role eligibility for manual directory search', async () => {
    const app = await buildApp();

    const supplierSearch = await request(app)
      .get('/api/directory/search')
      .query({ role: 'supplier' })
      .set(authHeader('client'));

    expect(supplierSearch.status).toBe(403);
    expect(supplierSearch.body.error).toContain('Requested directory role');
  });

  it('creates verified directory invitations and blocks unverified invitees', async () => {
    const app = await buildApp();
    mockAdminDb.seed('users/architect-2', { role: 'architect', displayName: 'Verified Architect', region: 'Cape Town' });
    mockAdminDb.seed('users/contractor-unverified', { role: 'contractor', displayName: 'No Verification Construction', region: 'Cape Town' });
    seedVerifiedBepVerification('architect-2', { registrationNumber: 'SACAP-999' });

    const blocked = await request(app)
      .post('/api/directory/invitations')
      .set(authHeader('client'))
      .send({ targetUserId: 'contractor-unverified', action: 'quote', context: { jobId: 'job-1', unsafe: 'ignored' } });
    const created = await request(app)
      .post('/api/directory/invitations')
      .set(authHeader('client'))
      .send({ targetUserId: 'architect-2', action: 'project', context: { jobId: 'job-1', projectId: 'project-1', unsafe: 'ignored' } });

    expect(blocked.status).toBe(403);
    expect(blocked.body).toMatchObject({ verificationRequired: { role: 'contractor' } });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ status: 'pending_acceptance', verificationId: 'architect-2_bep_SACAP_SACAP-123', requiresAcceptance: true });
    const invite = mockAdminDb.listCollection('directory_invitations')[0].data;
    expect(invite).toMatchObject({ inviterId: 'client-1', targetUserId: 'architect-2', targetRole: 'bep', action: 'project', status: 'pending_acceptance', context: { jobId: 'job-1', projectId: 'project-1' } });
    expect(invite.context).not.toHaveProperty('unsafe');
    expect(mockAdminDb.listCollection('notifications')[0].data).toMatchObject({ userId: 'architect-2', type: 'directory_invitation' });
    expect(mockAdminDb.listCollection('audit_logs').some(({ data }) => data.action === 'directory.invitation_blocked_unverified')).toBe(true);
    expect(mockAdminDb.listCollection('audit_logs').some(({ data }) => data.action === 'directory.invitation_created')).toBe(true);
  });

  it('creates registration invitations for unregistered recipients and requires verification before acceptance', async () => {
    const app = await buildApp();

    const created = await request(app)
      .post('/api/directory/invitations')
      .set(authHeader('client'))
      .send({ targetEmail: 'newbep@example.com', targetRole: 'bep', action: 'quote', context: { jobId: 'job-1' } });

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ status: 'pending_registration', targetEmail: 'newbep@example.com', targetRole: 'bep', onboardingRequired: true, requiresAcceptance: true });
    const invitationId = created.body.id;
    const blockedAcceptance = await request(app)
      .post(`/api/directory/invitations/${invitationId}/respond`)
      .set(authHeader('newbep'))
      .send({ decision: 'accepted' });

    expect(blockedAcceptance.status).toBe(403);
    expect(blockedAcceptance.body).toMatchObject({ verificationRequired: { role: 'bep' } });

    mockAdminDb.seed('users/new-bep-1', { role: 'bep', displayName: 'New BEP', email: 'newbep@example.com' });
    seedVerifiedBepVerification('new-bep-1', { registrationNumber: 'SACAP-NEW' });
    const accepted = await request(app)
      .post(`/api/directory/invitations/${invitationId}/respond`)
      .set(authHeader('newbep'))
      .send({ decision: 'accepted' });

    expect(accepted.status).toBe(200);
    expect(accepted.body).toMatchObject({ status: 'accepted', verificationId: 'new-bep-1_bep_SACAP_SACAP-123' });
    expect(mockAdminDb.getDoc(`directory_invitations/${invitationId}`)).toMatchObject({ targetUserId: 'new-bep-1', status: 'accepted' });
    expect(mockAdminDb.listCollection('audit_logs').some(({ data }) => data.action === 'directory.registration_invitation_created')).toBe(true);
    expect(mockAdminDb.listCollection('audit_logs').some(({ data }) => data.action === 'directory.invitation_accepted')).toBe(true);
  });

  it('enforces the directory role-action invitation matrix', async () => {
    const app = await buildApp();
    mockAdminDb.seed('users/freelancer-1', { role: 'freelancer', displayName: 'Freelancer One', email: 'freelancer@example.com' });
    seedVerifiedDirectoryVerification('freelancer-1', 'freelancer', 'freelancer', 'manual');

    const blocked = await request(app)
      .post('/api/directory/invitations')
      .set(authHeader('client'))
      .send({ targetUserId: 'freelancer-1', action: 'task', context: { taskId: 'task-1' } });

    expect(blocked.status).toBe(403);
    expect(blocked.body.error).toContain('not eligible');
  });

  it('delegates municipal automation, OCR, heatmap, and shadow-tracker routes after auth', async () => {
    const app = await buildApp();
    mockAdminDb.seed('municipal_credentials/client-1_city_of_cape_town', { userId: 'client-1', municipality: 'city_of_cape_town' });

    const tracked = await request(app).post('/api/track-municipality').set(authHeader('client')).send({ credentialId: 'client-1_city_of_cape_town' });
    const scraped = await request(app).post('/api/municipal/scrape').set(authHeader('client')).send({ municipality: 'city_of_cape_town' });
    const ocr = await request(app).post('/api/municipal/ocr').set(authHeader('client')).send({ imageUrl: 'https://files.public.blob.vercel-storage.com/receipt.png' });
    const heatmap = await request(app).get('/api/municipal/heatmap/city_of_cape_town').set(authHeader('client'));
    const shadow = await request(app).post('/api/municipal/shadow-track').set(authHeader('client')).send({ content: 'Invoice from council' });

    expect(tracked.body).toMatchObject({ status: 'Submitted' });
    expect(scraped.body).toMatchObject({ success: true });
    expect(ocr.body).toMatchObject({ success: true, amount: 12345 });
    expect(heatmap.body).toMatchObject({ municipality: 'city_of_cape_town', count: 1 });
    expect(shadow.body.invoices).toHaveLength(1);
    expect(trackMunicipalityStatus).toHaveBeenCalledWith('client-1_city_of_cape_town');
    expect(runMunicipalBrowserAutomation).toHaveBeenCalledWith('client-1', 'city_of_cape_town');
  });
});
