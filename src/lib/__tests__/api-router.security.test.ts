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
    freelancer: { uid: 'freelancer-1', email: 'freelancer@example.com', displayName: 'Freelancer One' },
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
    mockAdminDb.seed('users/freelancer-1', { role: 'freelancer', displayName: 'Freelancer One', fullName: 'Freelancer One', skills: ['drafting'] });
    mockAdminDb.seed('system_settings/llm_config', { provider: 'openai', apiKey: 'test-llm-key', model: 'gpt-test', baseUrl: 'https://llm.test/v1' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('blocks cross-origin state-changing requests before route handlers run', async () => {
    vi.useRealTimers();
    const app = await buildApp();

    try {
      const response = await request(app)
        .post('/api/auth/check-admin')
        .set('Origin', 'https://evil.example')
        .set('Host', 'architex.test')
        .send({ role: 'admin' });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Cross-origin');
      expect(verifyIdToken).not.toHaveBeenCalled();
    } finally {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-02T03:04:05.000Z'));
    }
  }, 20_000);


  it('allows trusted static app origins to call the hosted API domain for state-changing routes', async () => {
    vi.useRealTimers();
    const app = await buildApp();

    try {
      const response = await request(app)
        .post('/api/auth/check-admin')
        .set('Authorization', 'Bearer client')
        .set('Origin', 'https://test.architex.co.za')
        .set('Host', 'api.architex.co.za')
        .send({ role: 'client' });

      expect(response.status).not.toBe(403);
      expect(verifyIdToken).toHaveBeenCalled();
    } finally {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-02T03:04:05.000Z'));
    }
  }, 20_000);

  it('blocks originless browser form submissions except trusted webhooks', async () => {
    vi.useRealTimers();
    const app = await buildApp();

    try {
      const blocked = await request(app)
        .post('/api/auth/check-admin')
        .set('Host', 'architex.test')
        .type('form')
        .send({ role: 'admin' });

      expect(blocked.status).toBe(403);
      expect(blocked.body.error).toContain('Missing origin');
      expect(verifyIdToken).not.toHaveBeenCalled();

      const webhook = await request(app)
        .post('/api/payment/notify')
        .set('Host', 'architex.test')
        .type('form')
        .send({});

      expect(webhook.status).toBe(400);
      expect(webhook.text).toContain('No payment ID provided');
    } finally {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-02T03:04:05.000Z'));
    }
  }, 20_000);

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

  it('lists searchable AI-matched opportunities only for verified BEPs', async () => {
    const app = await buildApp();
    mockAdminDb.seed('jobs/job-1', { title: 'Residential House Plan', description: 'Residential additions', clientId: 'client-1', status: 'open', category: 'Residential', region: 'Cape Town', budget: 120000, createdAt: '2026-01-02T00:00:00.000Z' });
    mockAdminDb.seed('jobs/job-2', { title: 'Industrial Warehouse', description: 'Large shed', clientId: 'client-1', status: 'open', category: 'Industrial', region: 'Durban', createdAt: '2026-01-01T00:00:00.000Z' });
    mockAdminDb.seed('jobs/job-3', { title: 'Closed project', clientId: 'client-1', status: 'in-progress', category: 'Residential', region: 'Cape Town' });
    seedVerifiedBepVerification();

    const response = await request(app)
      .get('/api/jobs/opportunities?q=house&region=cape')
      .set(authHeader('architect'));

    expect(response.status).toBe(200);
    expect(response.body.verificationId).toBe('architect-1_bep_SACAP_SACAP-123');
    expect(response.body.opportunities).toHaveLength(1);
    expect(response.body.opportunities[0]).toMatchObject({ id: 'job-1', title: 'Residential House Plan', aiMatchScore: 0.9, verificationId: 'architect-1_bep_SACAP_SACAP-123' });
    expect(mockAdminDb.listCollection('audit_logs')[0].data).toMatchObject({
      category: 'access',
      action: 'marketplace.opportunities_viewed',
      metadata: { verificationId: 'architect-1_bep_SACAP_SACAP-123', resultCount: 1, search: 'house', region: 'cape' },
    });
  });

  it('blocks unverified BEPs from viewing marketplace opportunities and audits the gate', async () => {
    const app = await buildApp();
    mockAdminDb.seed('jobs/job-1', { title: 'House plan', clientId: 'client-1', status: 'open' });

    const response = await request(app)
      .get('/api/jobs/opportunities')
      .set(authHeader('architect'));

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ verificationRequired: { subjectType: 'bep', statutoryBody: 'SACAP' } });
    expect(mockAdminDb.listCollection('audit_logs')[0].data).toMatchObject({
      category: 'access',
      action: 'marketplace.opportunities_blocked_unverified_bep',
      metadata: { normalizedRole: 'bep', requiredSubjectType: 'bep', requiredStatutoryBody: 'SACAP' },
    });
  });

  it('creates project briefs with canonical service sanitization and audit metadata', async () => {
    const app = await buildApp();

    const response = await request(app)
      .post('/api/project-briefs')
      .set(authHeader('client'))
      .send({
        title: '  Residential alteration  ',
        description: '  Need plans for additions  ',
        category: 'Residential',
        location: 'Cape Town',
        budgetRange: { min: 50000, max: 100000 },
        requirements: ['  survey  ', '', 'concept design'],
        propertyDetails: { erf: '123', nested: { ignored: true }, vacant: null },
      });

    expect(response.status).toBe(201);
    expect(response.body.brief).toMatchObject({
      clientId: 'client-1',
      createdBy: 'client-1',
      title: 'Residential alteration',
      description: 'Need plans for additions',
      requirements: ['survey', 'concept design'],
      propertyDetails: { erf: '123', vacant: null },
      status: 'submitted',
    });
    expect(mockAdminDb.getDoc(`project_briefs/${response.body.brief.id}`)).toMatchObject({ clientId: 'client-1', status: 'submitted' });
    expect(mockAdminDb.listCollection('audit_logs')[0].data).toMatchObject({
      category: 'project',
      action: 'project_brief.created',
      metadata: { clientId: 'client-1', status: 'submitted', canonicalRoute: true },
    });
  });

  it('lists project briefs as a read-only endpoint scoped to the authenticated client', async () => {
    const app = await buildApp();
    mockAdminDb.seed('project_briefs/brief-1', { clientId: 'client-1', title: 'Owned brief', description: 'Client scope', status: 'submitted' });
    mockAdminDb.seed('project_briefs/brief-2', { clientId: 'other-client', title: 'Other brief', description: 'Private scope', status: 'submitted' });

    const writesBefore = mockAdminDb.writes.length;
    const response = await request(app)
      .get('/api/project-briefs?limit=10')
      .set(authHeader('client'));

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body).toMatchObject({ readOnly: true });
    expect(response.body.briefs).toHaveLength(1);
    expect(response.body.briefs[0]).toMatchObject({ id: 'brief-1', clientId: 'client-1', title: 'Owned brief' });
    expect(response.body.briefs.some((brief: StoredDoc) => brief.id === 'brief-2')).toBe(false);
    expect(mockAdminDb.writes).toHaveLength(writesBefore);
    expect(mockAdminDb.listCollection('audit_logs')).toHaveLength(0);
  });

  it('reads project brief details with attachments and interpretations without mutating state', async () => {
    const app = await buildApp();
    mockAdminDb.seed('project_briefs/brief-1', { clientId: 'client-1', title: 'Owned brief', description: 'Client scope', status: 'submitted', assignedBepIds: ['architect-1'] });
    mockAdminDb.seed('project_briefs/brief-1/attachments/attachment-1', { briefId: 'brief-1', clientId: 'client-1', fileName: 'survey.pdf', fileUrl: 'https://files.public.blob.vercel-storage.com/survey.pdf' });
    mockAdminDb.seed('project_briefs/brief-1/interpretations/interpretation-1', { briefId: 'brief-1', clientId: 'client-1', summary: 'Advisory summary', advisoryOnly: true, status: 'ready_for_review' });

    const blocked = await request(app)
      .get('/api/project-briefs/brief-1')
      .set(authHeader('intruder'));
    expect(blocked.status).toBe(403);

    seedVerifiedBepVerification();
    const writesBefore = mockAdminDb.writes.length;
    const response = await request(app)
      .get('/api/project-briefs/brief-1')
      .set(authHeader('architect'));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ readOnly: true, brief: { id: 'brief-1', clientId: 'client-1', title: 'Owned brief' } });
    expect(response.body.attachments).toEqual([expect.objectContaining({ id: 'attachment-1', fileName: 'survey.pdf' })]);
    expect(response.body.interpretations).toEqual([expect.objectContaining({ id: 'interpretation-1', advisoryOnly: true })]);
    expect(mockAdminDb.writes).toHaveLength(writesBefore);
    expect(mockAdminDb.listCollection('audit_logs')).toHaveLength(0);
  });

  it('persists project brief attachments and advisory interpretations with owner gates', async () => {
    const app = await buildApp();
    mockAdminDb.seed('project_briefs/brief-1', { clientId: 'client-1', title: 'Alteration', description: 'Scope', status: 'submitted', assignedBepIds: ['architect-1'] });

    const forbiddenAttachment = await request(app)
      .post('/api/project-briefs/brief-1/attachments')
      .set(authHeader('intruder'))
      .send({ fileName: 'survey.pdf', fileUrl: 'https://files.public.blob.vercel-storage.com/survey.pdf' });
    const attachment = await request(app)
      .post('/api/project-briefs/brief-1/attachments')
      .set(authHeader('client'))
      .send({ fileName: 'survey.pdf', fileUrl: 'https://files.public.blob.vercel-storage.com/survey.pdf', evidenceType: 'survey' });
    const interpretation = await request(app)
      .post('/api/project-briefs/brief-1/interpretations')
      .set(authHeader('architect'))
      .send({ summary: 'Likely needs an architect and municipal submission.', confidence: 0.75, sourceAttachmentIds: [attachment.body.attachment.id] });

    expect(forbiddenAttachment.status).toBe(403);
    expect(attachment.status).toBe(201);
    expect(attachment.body.attachment).toMatchObject({ briefId: 'brief-1', clientId: 'client-1', uploadedBy: 'client-1', evidenceType: 'survey', storageProvider: 'vercel_blob' });
    expect(mockAdminDb.listCollection('project_briefs/brief-1/attachments')[0].data).toMatchObject({ fileName: 'survey.pdf', evidenceType: 'survey' });
    expect(interpretation.status).toBe(201);
    expect(interpretation.body.interpretation).toMatchObject({
      briefId: 'brief-1',
      clientId: 'client-1',
      createdBy: 'architect-1',
      advisoryOnly: true,
      confidence: 0.75,
      sourceAttachmentIds: [attachment.body.attachment.id],
      status: 'ready_for_review',
    });
    expect(mockAdminDb.listCollection('audit_logs').some(({ data }) => data.action === 'project_brief.attachment_added' && data.metadata.canonicalRoute === true)).toBe(true);
    expect(mockAdminDb.listCollection('audit_logs').some(({ data }) => data.action === 'project_brief.interpretation_added' && data.category === 'ai' && data.metadata.advisoryOnly === true)).toBe(true);
  });

  it('reads and lists project briefs only for owners, assigned verified BEPs, or admins', async () => {
    const app = await buildApp();
    mockAdminDb.seed('project_briefs/brief-1', { clientId: 'client-1', title: 'Owner brief', description: 'Scope', status: 'submitted', assignedBepIds: ['architect-1'] });
    mockAdminDb.seed('project_briefs/brief-2', { clientId: 'other-client', title: 'Private brief', description: 'Hidden', status: 'submitted', assignedBepIds: [] });

    const ownerRead = await request(app)
      .get('/api/project-briefs/brief-1')
      .set(authHeader('client'));
    expect(ownerRead.status).toBe(200);
    expect(ownerRead.body).toMatchObject({ readOnly: true, brief: { id: 'brief-1', clientId: 'client-1' } });

    const unverifiedAssigned = await request(app)
      .get('/api/project-briefs/brief-1')
      .set(authHeader('architect'));
    expect(unverifiedAssigned.status).toBe(403);

    seedVerifiedBepVerification();
    const assignedRead = await request(app)
      .get('/api/project-briefs/brief-1')
      .set(authHeader('architect'));
    expect(assignedRead.status).toBe(200);
    expect(assignedRead.body.brief).toMatchObject({ id: 'brief-1', title: 'Owner brief' });

    const clientMine = await request(app)
      .get('/api/project-briefs?mine=true')
      .set(authHeader('client'));
    expect(clientMine.status).toBe(200);
    expect(clientMine.body.briefs.map((brief: StoredDoc) => brief.id)).toEqual(['brief-1']);

    const blocked = await request(app)
      .get('/api/project-briefs/brief-2')
      .set(authHeader('intruder'));
    expect(blocked.status).toBe(403);
  });

  it('persists AI action logs, creates review queue items, resolves with human sign-off, and audits both steps', async () => {
    const app = await buildApp();
    mockAdminDb.seed('projects/project-1', { clientId: 'client-1', leadArchitectId: 'architect-1', teamMembers: [] });

    const logged = await request(app)
      .post('/api/ai/action-logs')
      .set(authHeader('client'))
      .send({
        projectId: 'project-1',
        actionKind: 'drawing_check',
        target: { type: 'drawing_check_run', id: 'run-1' },
        prompt: { provider: 'gemini', model: 'gemini-2.0-flash', promptVersion: 'drawing-check-v1' },
        sourceReferences: [{ type: 'drawing', id: 'drawing-1', excerptHash: 'sha256:abc' }],
        confidence: 0.41,
        outputSummary: 'Possible compliance risk. Advisory only.',
        flags: ['legal_or_compliance_risk'],
      });

    expect(logged.status).toBe(201);
    expect(logged.body.actionLog).toMatchObject({ projectId: 'project-1', actorUid: 'client-1', status: 'requires_review', requiresHumanConfirmation: true, immutable: true });
    expect(logged.body.reviewQueueItem).toMatchObject({ projectId: 'project-1', priority: 'critical', assignedRole: 'admin', status: 'open' });
    expect(mockAdminDb.listCollection('audit_logs')[0].data).toMatchObject({
      category: 'ai',
      action: 'ai.action_logged_requires_review',
      target: { type: 'ai_action_log', projectId: 'project-1' },
      metadata: expect.objectContaining({ confidence: 0.41, reviewQueueId: logged.body.reviewQueueItem.id }),
    });

    const resolved = await request(app)
      .post(`/api/admin/ai-review/${logged.body.reviewQueueItem.id}/resolve`)
      .set(authHeader('admin'))
      .send({
        decision: 'resolved',
        reason: 'Admin reviewed evidence and recorded responsible human confirmation.',
        humanSignOff: {
          domain: 'municipal_submission',
          target: { type: 'municipal_submission', id: 'submission-1', projectId: 'project-1' },
          declaration: 'I reviewed the municipal package and approve this governance resolution.',
        },
      });

    expect(resolved.status).toBe(200);
    expect(mockAdminDb.getDoc(`ai_review_queue/${logged.body.reviewQueueItem.id}`)).toMatchObject({ status: 'resolved', resolvedBy: 'admin-1', humanSignOffRecorded: true });
    expect(mockAdminDb.getDoc(`ai_action_logs/${logged.body.actionLog.id}`)).toMatchObject({ status: 'human_confirmed', reviewedBy: 'admin-1', reviewDecision: 'resolved' });
    expect(mockAdminDb.listCollection('human_signoffs')[0].data).toMatchObject({ actorUid: 'admin-1', actorRole: 'admin', humanConfirmed: true, aiMayNotSign: true, immutable: true, aiActionLogIds: [logged.body.actionLog.id] });
    expect(mockAdminDb.listCollection('audit_logs').some(({ data }) => data.action === 'ai.review_resolved_with_human_signoff' && data.category === 'approval')).toBe(true);
  });

  it('blocks non-participants from AI logs and non-admins from AI review resolution', async () => {
    const app = await buildApp();
    mockAdminDb.seed('projects/project-1', { clientId: 'client-1', leadArchitectId: 'architect-1', teamMembers: [] });
    mockAdminDb.seed('ai_review_queue/queue-1', { id: 'queue-1', projectId: 'project-1', actionLogId: 'ai-log-1', target: { type: 'drawing', id: 'drawing-1' }, status: 'open' });

    const logAttempt = await request(app)
      .post('/api/ai/action-logs')
      .set(authHeader('intruder'))
      .send({ projectId: 'project-1', actionKind: 'drawing_check', target: { type: 'drawing', id: 'drawing-1' }, prompt: { provider: 'gemini', model: 'gemini-2.0-flash', promptVersion: 'v1' }, sourceReferences: [{ type: 'drawing', id: 'drawing-1' }], confidence: 0.9, outputSummary: 'Advisory only.' });
    const resolveAttempt = await request(app)
      .post('/api/admin/ai-review/queue-1/resolve')
      .set(authHeader('client'))
      .send({ decision: 'resolved', reason: 'not allowed' });

    expect(logAttempt.status).toBe(403);
    expect(resolveAttempt.status).toBe(403);
    expect(mockAdminDb.getDoc('ai_review_queue/queue-1')).toMatchObject({ status: 'open' });
  });

  it('creates persisted fee proposals for verified BEPs using estimator snapshots', async () => {
    const app = await buildApp();
    mockAdminDb.seed('jobs/job-1', { title: 'House plan', clientId: 'client-1', status: 'open', category: 'Residential' });
    seedVerifiedBepVerification();

    const feeInput = {
      projectType: 'residential',
      constructionValue: 1000000,
      areaSqm: 120,
      complexity: 'medium',
      municipality: 'Cape Town',
      urgency: 'standard',
      serviceStages: ['inception', 'concept', 'design'],
      deliverables: ['conceptDesign'],
      includeCouncilAdmin: false,
      includePlatformFee: true,
      vatApplicable: false,
    };

    const response = await request(app)
      .post('/api/jobs/job-1/fee-proposals')
      .set(authHeader('architect'))
      .send({ feeInput, scopeSummary: 'Concept to design development', terms: 'Valid for 14 days' });

    expect(response.status).toBe(201);
    expect(response.body.proposal).toMatchObject({
      id: 'architect-1',
      jobId: 'job-1',
      bepId: 'architect-1',
      clientId: 'client-1',
      status: 'submitted',
      scopeSummary: 'Concept to design development',
      terms: 'Valid for 14 days',
      verificationId: 'architect-1_bep_SACAP_SACAP-123',
      sacapNumber: 'SACAP-123',
    });
    expect(response.body.proposal.total).toBeGreaterThan(0);
    expect(mockAdminDb.getDoc('jobs/job-1/fee_proposals/architect-1')).toMatchObject({ verificationId: 'architect-1_bep_SACAP_SACAP-123' });
    expect(mockAdminDb.listCollection('audit_logs')[0].data).toMatchObject({
      category: 'project',
      action: 'marketplace.fee_proposal_submitted',
      metadata: { jobId: 'job-1', verificationId: 'architect-1_bep_SACAP_SACAP-123' },
    });
  });

  it('blocks unverified BEPs from creating fee proposals and audits the gate', async () => {
    const app = await buildApp();
    mockAdminDb.seed('jobs/job-1', { title: 'House plan', clientId: 'client-1', status: 'open' });

    const response = await request(app)
      .post('/api/jobs/job-1/fee-proposals')
      .set(authHeader('architect'))
      .send({ feeInput: { projectType: 'residential' } });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ verificationRequired: { subjectType: 'bep', statutoryBody: 'SACAP' } });
    expect(mockAdminDb.listCollection('audit_logs')[0].data).toMatchObject({
      category: 'access',
      action: 'marketplace.fee_proposal_blocked_unverified_bep',
    });
  });


  it('publishes canonical marketplace opportunities from client briefs as advisory matches', async () => {
    const app = await buildApp();
    mockAdminDb.seed('project_briefs/brief-1', { clientId: 'client-1', title: 'New house', description: 'Residential plans', status: 'submitted', category: 'Residential', location: 'Cape Town' });

    const response = await request(app)
      .post('/api/marketplace/opportunities')
      .set(authHeader('client'))
      .send({ briefId: 'brief-1' });

    expect(response.status).toBe(201);
    expect(response.body.opportunity).toMatchObject({ id: 'brief-1', briefId: 'brief-1', clientId: 'client-1', status: 'published', advisoryMatchingOnly: true });
    expect(mockAdminDb.getDoc('marketplace_opportunities/brief-1')).toMatchObject({ advisoryMatchingOnly: true, status: 'published' });
    expect(mockAdminDb.getDoc('project_briefs/brief-1')).toMatchObject({ status: 'published', marketplaceOpportunityId: 'brief-1' });
    expect(mockAdminDb.listCollection('audit_logs')[0].data).toMatchObject({ action: 'marketplace.opportunity_published', metadata: { advisoryMatchingOnly: true, canonicalRoute: true } });
  });

  it('requires verified BEPs to list and submit canonical proposals without auto appointment', async () => {
    const app = await buildApp();
    mockAdminDb.seed('marketplace_opportunities/opp-1', { briefId: 'brief-1', clientId: 'client-1', title: 'New house', description: 'Residential plans', status: 'published', advisoryMatchingOnly: true });

    const blockedList = await request(app)
      .get('/api/marketplace/opportunities')
      .set(authHeader('architect'));
    expect(blockedList.status).toBe(403);

    seedVerifiedBepVerification();
    const listed = await request(app)
      .get('/api/marketplace/opportunities')
      .set(authHeader('architect'));
    expect(listed.status).toBe(200);
    expect(listed.body).toMatchObject({ verificationId: 'architect-1_bep_SACAP_SACAP-123', advisoryOnly: true });
    expect(listed.body.opportunities[0]).toMatchObject({ id: 'opp-1', advisoryMatchingOnly: true });

    const submitted = await request(app)
      .post('/api/proposals')
      .set(authHeader('architect'))
      .send({ opportunityId: 'opp-1', feeAmount: 125000, scopeSummary: 'Stages 1 to 4', exclusions: ['Council fees'] });

    expect(submitted.status).toBe(201);
    expect(submitted.body.proposal).toMatchObject({ opportunityId: 'opp-1', briefId: 'brief-1', clientId: 'client-1', professionalId: 'architect-1', status: 'submitted', humanReviewRequired: true, advisoryOnly: true, autoAppointment: false, verificationId: 'architect-1_bep_SACAP_SACAP-123' });
    const proposal = mockAdminDb.listCollection('proposals')[0].data;
    expect(proposal).toMatchObject({ autoAppointment: false, humanReviewRequired: true });
  });

  it('reads marketplace opportunities and proposals with participant gates and no writes', async () => {
    const app = await buildApp();
    mockAdminDb.seed('marketplace_opportunities/opp-1', { briefId: 'brief-1', clientId: 'client-1', title: 'New house', description: 'Residential plans', status: 'published', advisoryMatchingOnly: true });
    mockAdminDb.seed('proposals/proposal-1', { briefId: 'brief-1', opportunityId: 'opp-1', clientId: 'client-1', professionalId: 'architect-1', feeAmount: 125000, scopeSummary: 'Stages 1 to 4', status: 'submitted', humanReviewRequired: true });

    const writesBefore = mockAdminDb.writes.length;
    const clientOpportunity = await request(app)
      .get('/api/marketplace/opportunities/opp-1')
      .set(authHeader('client'));
    expect(clientOpportunity.status).toBe(200);
    expect(clientOpportunity.body).toMatchObject({ advisoryOnly: true, readOnly: true, opportunity: { id: 'opp-1', clientId: 'client-1', advisoryMatchingOnly: true } });

    const blockedOpportunity = await request(app)
      .get('/api/marketplace/opportunities/opp-1')
      .set(authHeader('architect'));
    expect(blockedOpportunity.status).toBe(403);

    seedVerifiedBepVerification();
    const verifiedOpportunity = await request(app)
      .get('/api/marketplace/opportunities/opp-1')
      .set(authHeader('architect'));
    expect(verifiedOpportunity.status).toBe(200);
    expect(verifiedOpportunity.body.verificationId).toBe('architect-1_bep_SACAP_SACAP-123');

    const clientProposal = await request(app)
      .get('/api/proposals/proposal-1')
      .set(authHeader('client'));
    expect(clientProposal.status).toBe(200);
    expect(clientProposal.body).toMatchObject({ readOnly: true, proposal: { id: 'proposal-1', clientId: 'client-1', professionalId: 'architect-1', advisoryOnly: true, autoAppointment: false } });

    const professionalProposal = await request(app)
      .get('/api/proposals/proposal-1')
      .set(authHeader('architect'));
    expect(professionalProposal.status).toBe(200);
    expect(professionalProposal.body.verificationId).toBe('architect-1_bep_SACAP_SACAP-123');

    const blockedProposal = await request(app)
      .get('/api/proposals/proposal-1')
      .set(authHeader('intruder'));
    expect(blockedProposal.status).toBe(403);
    expect(mockAdminDb.writes).toHaveLength(writesBefore);
  });

  it('checks appointment readiness without creating contracts, signatures, payments, or audit writes', async () => {
    const app = await buildApp();
    mockAdminDb.seed('project_briefs/brief-1', { clientId: 'client-1', title: 'New house', description: 'Residential plans', status: 'published' });
    mockAdminDb.seed('proposals/proposal-1', { briefId: 'brief-1', opportunityId: 'opp-1', clientId: 'client-1', professionalId: 'architect-1', feeAmount: 125000, scopeSummary: 'Stages 1 to 4', status: 'submitted' });
    seedVerifiedBepVerification('architect-1', { expiresAt: '2099-01-01T00:00:00.000Z' });

    const blocked = await request(app)
      .get('/api/proposals/proposal-1/appointment-readiness')
      .set(authHeader('intruder'));
    expect(blocked.status).toBe(403);

    const writesBefore = mockAdminDb.writes.length;
    const response = await request(app)
      .get('/api/proposals/proposal-1/appointment-readiness')
      .set(authHeader('client'));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      ready: true,
      proposalId: 'proposal-1',
      briefId: 'brief-1',
      professionalId: 'architect-1',
      verificationId: 'architect-1_bep_SACAP_SACAP-123',
      createsAppointment: false,
      createsContract: false,
      createsSignature: false,
      createsPayment: false,
    });
    expect(response.body.requiredHumanActions).toEqual(['client_contract_acceptance', 'professional_contract_acceptance']);
    expect(mockAdminDb.writes).toHaveLength(writesBefore);
    expect(mockAdminDb.listCollection('appointment_contracts')).toHaveLength(0);
    expect(mockAdminDb.listCollection('payments')).toHaveLength(0);
    expect(mockAdminDb.listCollection('audit_logs')).toHaveLength(0);
  });

  it('returns appointment readiness blockers without mutating state', async () => {
    const app = await buildApp();
    mockAdminDb.seed('project_briefs/brief-1', { clientId: 'client-1', title: 'New house', description: 'Residential plans', status: 'appointed', appointmentId: 'existing-appointment' });
    mockAdminDb.seed('proposals/proposal-1', { briefId: 'brief-1', opportunityId: 'opp-1', clientId: 'client-1', professionalId: 'architect-1', feeAmount: 125000, scopeSummary: 'Stages 1 to 4', status: 'submitted' });
    seedVerifiedBepVerification('architect-1', { expiresAt: '2099-01-01T00:00:00.000Z' });

    const writesBefore = mockAdminDb.writes.length;
    const response = await request(app)
      .get('/api/proposals/proposal-1/appointment-readiness')
      .set(authHeader('client'));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      ready: false,
      blocker: 'A professional has already been appointed for this brief',
      blockerStatus: 409,
      createsAppointment: false,
      createsContract: false,
      createsSignature: false,
      createsPayment: false,
    });
    expect(mockAdminDb.writes).toHaveLength(writesBefore);
  });

  it('creates advisory proposal comparisons only for the client owner', async () => {
    const app = await buildApp();
    mockAdminDb.seed('proposals/proposal-1', { briefId: 'brief-1', opportunityId: 'opp-1', clientId: 'client-1', professionalId: 'architect-1', feeAmount: 100000, scopeSummary: 'A', status: 'submitted' });
    mockAdminDb.seed('proposals/proposal-2', { briefId: 'brief-1', opportunityId: 'opp-1', clientId: 'client-1', professionalId: 'bep-2', feeAmount: 110000, scopeSummary: 'B', status: 'submitted' });

    const blocked = await request(app)
      .post('/api/proposals/proposal-1/compare')
      .set(authHeader('intruder'))
      .send({ proposalIds: ['proposal-2'] });
    expect(blocked.status).toBe(403);

    const response = await request(app)
      .post('/api/proposals/proposal-1/compare')
      .set(authHeader('client'))
      .send({ proposalIds: ['proposal-2'], criteria: ['fee', 'scope'], recommendationSummary: 'Advisory shortlist only' });

    expect(response.status).toBe(201);
    expect(response.body.comparison).toMatchObject({ briefId: 'brief-1', clientId: 'client-1', proposalIds: ['proposal-1', 'proposal-2'], advisoryOnly: true, autoAppointment: false });
    expect(response.body.comparison.limitations.join(' ')).toContain('does not automatically appoint');
    expect(mockAdminDb.listCollection('proposal_comparisons')[0].data).toMatchObject({ advisoryOnly: true, autoAppointment: false });
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
    expect(payment).toMatchObject({ payerId: 'client-1', payeeId: 'architect-1', amount: 101000, status: 'pending' });
    expect(mockAdminDb.getDoc('escrow/job-1')).toMatchObject({ totalAmount: 101000, status: 'pending' });
    expect(mockAdminDb.listCollection('audit_logs')[0].data).toMatchObject({
      category: 'payment',
      action: 'payment.escrow_initiated',
      target: { type: 'payment' },
      metadata: { totalAmount: 101000, platformFee: 1000 },
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

  it('projects the admin verification queue with prioritized next actions', async () => {
    const app = await buildApp();
    mockAdminDb.seed('user_verifications/ver-overdue-cipc', {
      userId: 'supplier-1',
      subjectType: 'supplier',
      statutoryBody: 'CIPC',
      status: 'pending',
      source: 'document_upload',
      submittedAt: '2020-01-01T00:00:00.000Z',
      submittedBy: 'supplier-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockAdminDb.seed('user_verifications/ver-sacap-expiring', {
      userId: 'architect-1',
      subjectType: 'bep',
      statutoryBody: 'SACAP',
      registrationNumber: 'SACAP-123',
      status: 'verified',
      source: 'public_register',
      submittedAt: '2026-01-02T00:00:00.000Z',
      submittedBy: 'architect-1',
      expiresAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    const forbidden = await request(app)
      .get('/api/admin/verifications')
      .query({ view: 'queue' })
      .set(authHeader('architect'));
    const response = await request(app)
      .get('/api/admin/verifications')
      .query({ view: 'queue' })
      .set(authHeader('admin'));

    expect(forbidden.status).toBe(403);
    expect(response.status).toBe(200);
    expect(response.body.summary).toMatchObject({ total: 2, pending: 1, overdue: 1, dueForRecheck: 1 });
    expect(response.body.items.map((item: any) => item.id)).toEqual(['ver-overdue-cipc', 'ver-sacap-expiring']);
    expect(response.body.items[0]).toMatchObject({
      provider: 'cipc',
      priority: 'urgent',
      blocker: 'Verification has exceeded the 48 hour SLA.',
      action: 'Review uploaded evidence manually against official CIPC record',
    });
    expect(response.body.items[1]).toMatchObject({ priority: 'high', action: 'Queue public-register recheck before verified status expires' });
  });

  it('lets admins tune verification queue SLA and recheck policy windows safely', async () => {
    const app = await buildApp();
    const submittedAt = new Date(Date.now() - 36 * 3_600_000).toISOString();
    mockAdminDb.seed('user_verifications/ver-policy-window', {
      userId: 'architect-1',
      subjectType: 'bep',
      statutoryBody: 'SACAP',
      registrationNumber: 'SACAP-456',
      status: 'pending',
      source: 'automated_browser_agent',
      submittedAt,
      submittedBy: 'architect-1',
      createdAt: submittedAt,
      updatedAt: submittedAt,
    });

    const defaultQueue = await request(app)
      .get('/api/admin/verifications')
      .query({ view: 'queue' })
      .set(authHeader('admin'));
    const stricterQueue = await request(app)
      .get('/api/admin/verifications')
      .query({ view: 'queue', slaHours: '24', recheckWithinDays: '14' })
      .set(authHeader('admin'));
    const invalidPolicyQueue = await request(app)
      .get('/api/admin/verifications')
      .query({ view: 'queue', slaHours: '-1', recheckWithinDays: 'not-a-number' })
      .set(authHeader('admin'));

    expect(defaultQueue.status).toBe(200);
    expect(defaultQueue.body.summary.overdue).toBe(0);
    expect(defaultQueue.body.items[0]).toMatchObject({ id: 'ver-policy-window', priority: 'medium' });
    expect(stricterQueue.status).toBe(200);
    expect(stricterQueue.body.summary.overdue).toBe(1);
    expect(stricterQueue.body.items[0]).toMatchObject({ id: 'ver-policy-window', priority: 'urgent', blocker: 'Verification has exceeded the 24 hour SLA.' });
    expect(invalidPolicyQueue.body.summary.overdue).toBe(0);
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

  it('supports canonical user profile route without allowing self role escalation', async () => {
    const app = await buildApp();

    const response = await request(app)
      .put('/api/users/client-1/profile')
      .set(authHeader('client'))
      .send({ profileData: { displayName: 'Canonical Client', residentialAddress: '1 Safe Street', role: 'admin', isAdmin: true, verificationStatus: 'verified' } });

    expect(response.status).toBe(200);
    expect(mockAdminDb.getDoc('users/client-1')).toMatchObject({ displayName: 'Canonical Client', residentialAddress: '1 Safe Street', role: 'client' });
    expect(mockAdminDb.getDoc('users/client-1')).not.toHaveProperty('isAdmin');
    expect(mockAdminDb.getDoc('users/client-1')).not.toHaveProperty('verificationStatus');
    expect(mockAdminDb.listCollection('audit_logs').some(({ data }) => data.action === 'profile.updated' && data.metadata?.canonicalRoute === true)).toBe(true);
  });

  it('blocks non-admin canonical profile updates for other users', async () => {
    const app = await buildApp();

    const response = await request(app)
      .put('/api/users/contractor-1/profile')
      .set(authHeader('client'))
      .send({ profileData: { companyName: 'Not Allowed' } });

    expect(response.status).toBe(403);
    expect(mockAdminDb.getDoc('users/contractor-1')?.companyName).toBe('BuildCo');
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

  it('aliases canonical api directory search to existing verified directory search', async () => {
    const app = await buildApp();
    seedDirectoryProfile('contractor-1', { role: 'contractor', companyName: 'BuildCo', region: 'Cape Town', contractorCategory: 'general contractor', registrationNumber: 'CIDB-1', verificationStatus: 'verified' });
    seedVerifiedDirectoryVerification('contractor-1', 'contractor', 'CIDB', 'CIDB-1');

    const response = await request(app)
      .get('/api/api/directory/search?role=contractor&q=buildco&verificationStatus=verified')
      .set(authHeader('client'));

    expect(response.status).toBe(200);
    expect(response.body.results).toHaveLength(1);
    expect(response.body.results[0]).toMatchObject({ userId: 'contractor-1', normalizedRole: 'contractor', verificationStatus: 'verified', canInvite: true });
    expect(mockAdminDb.listCollection('audit_logs').some(({ data }) => data.action === 'directory.search')).toBe(true);
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
    expect(response.body.contract).toMatchObject({ status: 'generated_pending_acceptance', professionalFee: 200000, platformFee: 2000, totalEscrowAmount: 202000, verificationId: 'architect-1_bep_SACAP_SACAP-123' });
    expect(response.body.contract.milestones).toHaveLength(5);
    expect(response.body.invoices).toHaveLength(5);
    expect(response.body.invoices.reduce((sum: number, invoice: any) => sum + invoice.totalAmount, 0)).toBe(200000);
    expect(mockAdminDb.listCollection('projects')).toHaveLength(1);
    const projectId = response.body.project.id;
    expect(mockAdminDb.getDoc(`appointment_contracts/${projectId}`)).toMatchObject({ projectId, clientBriefId: 'brief-appoint' });
    expect(mockAdminDb.getDoc(`escrow/${projectId}`)).toMatchObject({ totalAmount: 202000, platformFeeAmount: 2000, status: 'pending', payeeId: 'architect-1' });
    expect(mockAdminDb.getDoc('client_briefs/brief-appoint')).toMatchObject({ status: 'appointed', projectId, appointmentContractId: projectId });
    expect(mockAdminDb.getDoc('technical_briefs/brief-appoint')).toMatchObject({ projectId, appointmentContractId: projectId });
    expect(mockAdminDb.listCollection('audit_logs').some(({ data }) => data.action === 'contract.appointment_generated')).toBe(true);
    expect(duplicate.status).toBe(409);
  });

  it('returns and persists a permission-gated project command-centre projection', async () => {
    const app = await buildApp();
    seedVerifiedBepVerification('architect-1');
    mockAdminDb.seed('projects/project-command-1', {
      projectCode: 'ARC-20260102-ABC123',
      clientId: 'client-1',
      leadArchitectId: 'architect-1',
      currentStage: 'appointment',
      stageHistory: [{ stage: 'appointment', enteredAt: '2026-01-02T00:00:00.000Z' }],
      teamMembers: [
        { userId: 'client-1', role: 'client', status: 'active' },
        { userId: 'architect-1', role: 'architect', discipline: 'architecture', status: 'active', verificationId: 'ver-1' },
      ],
    });
    mockAdminDb.seed('projects/project-command-1/tasks/task-1', { status: 'open', dueDate: '2026-01-01T00:00:00.000Z' });
    mockAdminDb.seed('projects/project-command-1/tasks/task-2', { status: 'completed' });
    mockAdminDb.seed('projects/project-command-1/approvals/approval-1', { status: 'pending' });
    mockAdminDb.seed('projects/project-command-1/documents/doc-1', { updatedAt: '2026-01-02T01:00:00.000Z' });
    mockAdminDb.seed('projects/project-command-1/message_threads/thread-1', { unreadFor: ['architect-1'] });
    mockAdminDb.seed('projects/project-command-1/ai_issues/issue-1', { resolutionStatus: 'unresolved' });

    const forbidden = await request(app)
      .get('/api/projects/project-command-1/command-centre')
      .set(authHeader('intruder'));
    const response = await request(app)
      .get('/api/projects/project-command-1/command-centre')
      .set(authHeader('architect'));

    expect(forbidden.status).toBe(403);
    expect(response.status).toBe(200);
    expect(response.body.commandCentre).toMatchObject({
      projectId: 'project-command-1',
      projectCode: 'ARC-20260102-ABC123',
      viewer: { userId: 'architect-1', role: 'lead_bep', normalizedUserRole: 'bep' },
      team: { activeCount: 2, leadBepId: 'architect-1' },
      panels: {
        tasks: { total: 2, open: 1, overdue: 1 },
        approvals: { total: 1, pending: 1 },
        documents: { total: 1, latestRevisionAt: '2026-01-02T01:00:00.000Z' },
        messages: { threadCount: 1, unreadForViewer: 1 },
        aiIssues: { total: 1, unresolved: 1 },
      },
    });
    expect(mockAdminDb.getDoc('project_command_views/project-command-1_architect-1')).toMatchObject({ projectId: 'project-command-1', viewer: { role: 'lead_bep' } });
    expect(mockAdminDb.listCollection('audit_logs').some(({ data }) => data.action === 'project.command_centre_viewed')).toBe(true);
  });

  it('persists Phase 3 project workflow writes with audit trails and immutable document versions', async () => {
    const app = await buildApp();
    seedVerifiedBepVerification('architect-1');
    mockAdminDb.seed('projects/project-workflow-1', {
      id: 'project-workflow-1',
      projectCode: 'ARC-20260102-WF001',
      clientId: 'client-1',
      leadArchitectId: 'architect-1',
      currentStage: 'coordination',
      stageHistory: [],
      teamMembers: [
        { userId: 'client-1', role: 'client', status: 'active' },
        { userId: 'architect-1', role: 'architect', discipline: 'architecture', status: 'active', verificationId: 'ver-1' },
      ],
    });

    const blocked = await request(app)
      .post('/api/projects/project-workflow-1/tasks')
      .set(authHeader('intruder'))
      .send({ title: 'Intruder task' });
    const documentResponse = await request(app)
      .post('/api/projects/project-workflow-1/documents')
      .set(authHeader('architect'))
      .send({ title: 'Submission drawing pack', documentType: 'drawing_register', discipline: 'architecture', revision: 'P01', fileUrl: 'https://files.public.blob.vercel-storage.com/a100.pdf', fileName: 'A100.pdf' });
    const documentId = documentResponse.body.document.id;
    const versionResponse = await request(app)
      .post('/api/projects/project-workflow-1/document-versions')
      .set(authHeader('architect'))
      .send({ documentId, revision: 'P02', fileUrl: 'https://files.public.blob.vercel-storage.com/a100-p02.pdf', fileName: 'A100-P02.pdf' });
    const taskResponse = await request(app)
      .post('/api/projects/project-workflow-1/tasks')
      .set(authHeader('architect'))
      .send({ title: 'Coordinate fire notes', assigneeId: 'architect-1', dueDate: '2026-01-05T00:00:00.000Z', linkedItems: [{ id: documentId, type: 'document', label: 'Drawing pack' }] });
    const approvalResponse = await request(app)
      .post('/api/projects/project-workflow-1/approvals')
      .set(authHeader('architect'))
      .send({ title: 'Client approve submission pack', approverId: 'client-1', linkedItems: [{ id: versionResponse.body.version.id, type: 'document_version' }] });
    const threadResponse = await request(app)
      .post('/api/projects/project-workflow-1/message-threads')
      .set(authHeader('architect'))
      .send({ subject: 'Submission coordination', contextType: 'approval', contextId: approvalResponse.body.approval.id, participantIds: ['client-1'] });
    const messageResponse = await request(app)
      .post('/api/projects/project-workflow-1/messages')
      .set(authHeader('architect'))
      .send({ threadId: threadResponse.body.thread.id, body: 'Please review the updated submission pack.', attachments: [{ id: versionResponse.body.version.id, type: 'document_version' }] });
    const transmittalResponse = await request(app)
      .post('/api/projects/project-workflow-1/transmittals')
      .set(authHeader('architect'))
      .send({ title: 'Issue P02 to client', recipientIds: ['client-1'], documentVersionIds: [versionResponse.body.version.id], purpose: 'Client review' });

    expect(blocked.status).toBe(403);
    expect(documentResponse.status).toBe(201);
    expect(documentResponse.body.document).toMatchObject({ projectId: 'project-workflow-1', title: 'Submission drawing pack', currentVersionId: 'v1', currentRevision: 'P01' });
    expect(documentResponse.body.version).toMatchObject({ versionNumber: 1, revision: 'P01', createdBy: 'architect-1' });
    expect(versionResponse.status).toBe(201);
    expect(versionResponse.body.version).toMatchObject({ documentId, versionNumber: 2, revision: 'P02', supersedesVersionId: 'v1' });
    expect(mockAdminDb.getDoc(`projects/project-workflow-1/documents/${documentId}`)).toMatchObject({ currentVersionId: 'v2', currentRevision: 'P02' });
    expect(mockAdminDb.getDoc(`projects/project-workflow-1/documents/${documentId}/versions/v1`)).toMatchObject({ revision: 'P01' });
    expect(taskResponse.body.task).toMatchObject({ title: 'Coordinate fire notes', status: 'open', assigneeId: 'architect-1' });
    expect(approvalResponse.body.approval).toMatchObject({ title: 'Client approve submission pack', status: 'requested', approverId: 'client-1' });
    expect(threadResponse.body.thread).toMatchObject({ subject: 'Submission coordination', contextType: 'approval', participantIds: ['architect-1', 'client-1'], unreadFor: ['client-1'] });
    expect(messageResponse.body.message).toMatchObject({ threadId: threadResponse.body.thread.id, body: 'Please review the updated submission pack.', contextType: 'approval' });
    expect(mockAdminDb.getDoc(`projects/project-workflow-1/message_threads/${threadResponse.body.thread.id}`)).toMatchObject({ lastMessageId: messageResponse.body.message.id, unreadFor: ['client-1'] });
    expect(transmittalResponse.body.transmittal).toMatchObject({ title: 'Issue P02 to client', status: 'issued', documentVersionIds: [versionResponse.body.version.id] });
    const auditActions = mockAdminDb.listCollection('audit_logs').map(({ data }) => data.action);
    expect(auditActions).toEqual(expect.arrayContaining(['document.created', 'document.version_created', 'task.created', 'approval.requested', 'message.thread_created', 'message.created', 'transmittal.issued']));
  });

  it('routes AI drawing issues to verified assignees and tracks resolution review', async () => {
    const app = await buildApp();
    mockAdminDb.seed('projects/project-1', {
      id: 'project-1',
      jobId: 'job-1',
      clientId: 'client-1',
      leadArchitectId: 'architect-1',
      currentStage: 'coordination',
      stageHistory: [],
      teamMembers: [{ userId: 'architect-1', role: 'architect', discipline: 'architecture', joinedAt: '2026-01-01T00:00:00.000Z', status: 'active' }],
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    seedVerifiedBepVerification();
    seedVerifiedDirectoryVerification('freelancer-1', 'freelancer', 'freelancer', 'manual');

    const routed = await request(app)
      .post('/api/projects/project-1/ai-issues')
      .set(authHeader('architect'))
      .send({ title: 'Missing door schedule', description: 'AI detected missing schedule', severity: 'high', discipline: 'documentation', sourceSubmissionId: 'submission-1', sourceFindingIndex: 2, assigneeId: 'freelancer-1' });
    const issueId = routed.body.issue.id;
    const resolved = await request(app)
      .post(`/api/projects/project-1/ai-issues/${issueId}/resolve`)
      .set(authHeader('freelancer'))
      .send({ resolutionNotes: 'Door schedule uploaded', evidenceUrls: ['https://files.public.blob.vercel-storage.com/door-schedule.pdf'] });
    const reviewed = await request(app)
      .post(`/api/projects/project-1/ai-issues/${issueId}/review`)
      .set(authHeader('architect'))
      .send({ decision: 'accepted', reviewNotes: 'Resolution accepted' });

    expect(routed.status).toBe(201);
    expect(routed.body.issue).toMatchObject({ title: 'Missing door schedule', status: 'assigned', resolutionStatus: 'unresolved', assigneeId: 'freelancer-1', assigneeVerificationId: 'freelancer-1_freelancer_freelancer_manual' });
    expect(resolved.status).toBe(200);
    expect(resolved.body).toMatchObject({ status: 'resolved', resolutionStatus: 'resolved_pending_review', resolvedBy: 'freelancer-1', evidenceUrls: ['https://files.public.blob.vercel-storage.com/door-schedule.pdf'] });
    expect(reviewed.status).toBe(200);
    expect(reviewed.body).toMatchObject({ status: 'closed', resolutionStatus: 'accepted', reviewedBy: 'architect-1' });
    expect(mockAdminDb.getDoc(`projects/project-1/ai_issues/${issueId}`)).toMatchObject({ status: 'closed', resolutionStatus: 'accepted' });
    expect(mockAdminDb.listCollection('notifications')[0].data).toMatchObject({ userId: 'freelancer-1', type: 'message' });
    expect(mockAdminDb.listCollection('audit_logs').some(({ data }) => data.action === 'ai.issue_routed')).toBe(true);
    expect(mockAdminDb.listCollection('audit_logs').some(({ data }) => data.action === 'ai.issue_resolution_accepted')).toBe(true);
  });

  it('blocks AI issue routing to unverified assignees and freelancer resolution of unrelated issues', async () => {
    const app = await buildApp();
    mockAdminDb.seed('projects/project-1', {
      id: 'project-1',
      jobId: 'job-1',
      clientId: 'client-1',
      leadArchitectId: 'architect-1',
      currentStage: 'coordination',
      stageHistory: [],
      teamMembers: [{ userId: 'architect-1', role: 'architect', discipline: 'architecture', joinedAt: '2026-01-01T00:00:00.000Z', status: 'active' }],
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    mockAdminDb.seed('projects/project-1/ai_issues/issue-1', { id: 'issue-1', projectId: 'project-1', title: 'Unassigned issue', status: 'open', assigneeId: 'someone-else' });
    seedVerifiedBepVerification();
    seedVerifiedDirectoryVerification('freelancer-1', 'freelancer', 'freelancer', 'manual');

    const blockedRoute = await request(app)
      .post('/api/projects/project-1/ai-issues')
      .set(authHeader('architect'))
      .send({ title: 'Unverified assignee', assigneeId: 'contractor-1' });
    const blockedResolve = await request(app)
      .post('/api/projects/project-1/ai-issues/issue-1/resolve')
      .set(authHeader('freelancer'))
      .send({ resolutionNotes: 'Trying to resolve unrelated issue' });

    expect(blockedRoute.status).toBe(403);
    expect(blockedRoute.body).toMatchObject({ verificationRequired: { role: 'contractor' } });
    expect(blockedResolve.status).toBe(403);
    expect(blockedResolve.body.error).toContain('Only the assignee');
  });

  it('runs the verified freelancer work package lifecycle from posting to approval', async () => {
    const app = await buildApp();
    mockAdminDb.seed('projects/project-1', {
      id: 'project-1',
      jobId: 'job-1',
      clientId: 'client-1',
      leadArchitectId: 'architect-1',
      currentStage: 'coordination',
      stageHistory: [],
      teamMembers: [{ userId: 'architect-1', role: 'architect', discipline: 'architecture', joinedAt: '2026-01-01T00:00:00.000Z', status: 'active' }],
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    seedVerifiedBepVerification();
    seedVerifiedDirectoryVerification('freelancer-1', 'freelancer', 'freelancer', 'manual');

    const created = await request(app)
      .post('/api/projects/project-1/work-packages')
      .set(authHeader('architect'))
      .send({ title: 'Door schedule drafting', description: 'Prepare schedules', requirements: ['DWG deliverable'], budget: 4500, deadline: '2026-02-01', invitedFreelancerIds: ['freelancer-1'] });
    const packageId = created.body.workPackage.id;
    const applied = await request(app)
      .post(`/api/projects/project-1/work-packages/${packageId}/applications`)
      .set(authHeader('freelancer'))
      .send({ proposal: 'I can draft the schedule this week', proposedFee: 4200 });
    const assigned = await request(app)
      .post(`/api/projects/project-1/work-packages/${packageId}/applications/freelancer-1/assign`)
      .set(authHeader('architect'))
      .send({});
    const submitted = await request(app)
      .post(`/api/projects/project-1/work-packages/${packageId}/submissions`)
      .set(authHeader('freelancer'))
      .send({ deliverableUrls: ['https://files.public.blob.vercel-storage.com/door-schedule.pdf'], notes: 'Submitted for review' });
    const submissionId = submitted.body.submission.id;
    const reviewed = await request(app)
      .post(`/api/projects/project-1/work-packages/${packageId}/submissions/${submissionId}/review`)
      .set(authHeader('architect'))
      .send({ decision: 'approved', reviewNotes: 'Approved for issue' });

    expect(created.status).toBe(201);
    expect(created.body.workPackage).toMatchObject({ title: 'Door schedule drafting', status: 'open', postedBy: 'architect-1', invitedFreelancerIds: ['freelancer-1'] });
    expect(applied.status).toBe(201);
    expect(applied.body.application).toMatchObject({ freelancerId: 'freelancer-1', status: 'submitted', verificationId: 'freelancer-1_freelancer_freelancer_manual' });
    expect(assigned.status).toBe(200);
    expect(assigned.body).toMatchObject({ status: 'assigned', assignedFreelancerId: 'freelancer-1', agreementStatus: 'pending_signature' });
    expect(submitted.status).toBe(201);
    expect(submitted.body.submission).toMatchObject({ freelancerId: 'freelancer-1', status: 'submitted', deliverableUrls: ['https://files.public.blob.vercel-storage.com/door-schedule.pdf'] });
    expect(reviewed.status).toBe(200);
    expect(reviewed.body).toMatchObject({ status: 'approved', reviewedBy: 'architect-1', reviewNotes: 'Approved for issue' });
    expect(mockAdminDb.getDoc(`projects/project-1/work_packages/${packageId}`)).toMatchObject({ status: 'approved', assignedFreelancerId: 'freelancer-1' });
    expect(mockAdminDb.listCollection('audit_logs').some(({ data }) => data.action === 'freelancer.work_package_created')).toBe(true);
    expect(mockAdminDb.listCollection('audit_logs').some(({ data }) => data.action === 'freelancer.work_package_submission_approved')).toBe(true);
  });

  it('blocks unverified freelancers and non-lead BEPs in work package workflows', async () => {
    const app = await buildApp();
    mockAdminDb.seed('projects/project-1', {
      id: 'project-1',
      jobId: 'job-1',
      clientId: 'client-1',
      leadArchitectId: 'architect-1',
      currentStage: 'coordination',
      stageHistory: [],
      teamMembers: [{ userId: 'architect-1', role: 'architect', discipline: 'architecture', joinedAt: '2026-01-01T00:00:00.000Z', status: 'active' }],
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    mockAdminDb.seed('projects/project-1/work_packages/pkg-1', { id: 'pkg-1', projectId: 'project-1', status: 'open', title: 'Drafting', postedBy: 'architect-1' });

    const unverifiedLead = await request(app)
      .post('/api/projects/project-1/work-packages')
      .set(authHeader('architect'))
      .send({ title: 'Blocked package' });
    seedVerifiedBepVerification();
    const clientBlocked = await request(app)
      .post('/api/projects/project-1/work-packages')
      .set(authHeader('client'))
      .send({ title: 'Client package' });
    const unverifiedFreelancer = await request(app)
      .post('/api/projects/project-1/work-packages/pkg-1/applications')
      .set(authHeader('freelancer'))
      .send({ proposal: 'Please pick me' });

    expect(unverifiedLead.status).toBe(403);
    expect(unverifiedLead.body).toMatchObject({ verificationRequired: { subjectType: 'bep', statutoryBody: 'SACAP' } });
    expect(clientBlocked.status).toBe(403);
    expect(unverifiedFreelancer.status).toBe(403);
    expect(unverifiedFreelancer.body).toMatchObject({ verificationRequired: { role: 'freelancer' } });
  });

  it('lets verified lead BEPs invite consultants and seed coordination deliverables', async () => {
    const app = await buildApp();
    mockAdminDb.seed('users/consultant-1', { role: 'bep', displayName: 'Structural Consultant', professionalDiscipline: 'structure' });
    mockAdminDb.seed('projects/project-1', {
      id: 'project-1',
      jobId: 'job-1',
      clientId: 'client-1',
      leadArchitectId: 'architect-1',
      currentStage: 'coordination',
      stageHistory: [],
      teamMembers: [{ userId: 'architect-1', role: 'architect', discipline: 'architecture', joinedAt: '2026-01-01T00:00:00.000Z', status: 'active' }],
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    seedVerifiedBepVerification();
    seedVerifiedBepVerification('consultant-1', { registrationNumber: 'SACAP-456' });

    const response = await request(app)
      .post('/api/projects/project-1/team-members')
      .set(authHeader('architect'))
      .send({ userId: 'consultant-1', discipline: 'structure', deliverables: ['Structural concept markups', 'Foundation input'], unsafe: 'ignored' });

    expect(response.status).toBe(201);
    expect(response.body.teamMember).toMatchObject({ userId: 'consultant-1', discipline: 'structure', status: 'invited', verificationId: 'consultant-1_bep_SACAP_SACAP-123' });
    expect(response.body.deliverables).toHaveLength(2);
    expect(mockAdminDb.getDoc('projects/project-1')?.teamMembers).toEqual(expect.arrayContaining([expect.objectContaining({ userId: 'consultant-1', deliverables: ['Structural concept markups', 'Foundation input'] })]));
    expect(mockAdminDb.listCollection('projects/project-1/coordination_items')).toHaveLength(2);
    expect(mockAdminDb.listCollection('notifications')[0].data).toMatchObject({ userId: 'consultant-1', type: 'directory_invitation' });
    expect(mockAdminDb.listCollection('audit_logs')[0].data).toMatchObject({ action: 'coordination.team_member_invited', metadata: { targetUserId: 'consultant-1', discipline: 'structure', deliverableCount: 2 } });
  });

  it('persists coordination items only for verified project coordinators', async () => {
    const app = await buildApp();
    mockAdminDb.seed('projects/project-1', {
      id: 'project-1',
      jobId: 'job-1',
      clientId: 'client-1',
      leadArchitectId: 'architect-1',
      currentStage: 'coordination',
      stageHistory: [],
      teamMembers: [{ userId: 'architect-1', role: 'architect', discipline: 'architecture', joinedAt: '2026-01-01T00:00:00.000Z', status: 'active' }],
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    const unverifiedLead = await request(app)
      .post('/api/projects/project-1/coordination/items')
      .set(authHeader('architect'))
      .send({ itemType: 'rfi', title: 'Confirm roof loading' });

    seedVerifiedBepVerification();
    const forbiddenClient = await request(app)
      .post('/api/projects/project-1/coordination/items')
      .set(authHeader('client'))
      .send({ itemType: 'rfi', title: 'Client cannot coordinate' });
    const created = await request(app)
      .post('/api/projects/project-1/coordination/items')
      .set(authHeader('architect'))
      .send({ itemType: 'rfi', title: 'Confirm roof loading', description: 'Need structural input', discipline: 'structure', assigneeId: 'consultant-1', dependsOnIds: ['drawing-A'], status: 'blocked' });

    expect(unverifiedLead.status).toBe(403);
    expect(unverifiedLead.body).toMatchObject({ verificationRequired: { subjectType: 'bep', statutoryBody: 'SACAP' } });
    expect(forbiddenClient.status).toBe(403);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ itemType: 'rfi', title: 'Confirm roof loading', discipline: 'structure', assigneeId: 'consultant-1', status: 'blocked', dependsOnIds: ['drawing-A'] });
    expect(mockAdminDb.listCollection('projects/project-1/coordination_items')[0].data).toMatchObject({ itemType: 'rfi', createdBy: 'architect-1' });
    expect(mockAdminDb.listCollection('audit_logs').some(({ data }) => data.action === 'coordination.rfi_created')).toBe(true);
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
    expect(created.body).toMatchObject({ status: 'pending_acceptance', verificationId: 'architect-2_bep_SACAP_SACAP-123', requiresAcceptance: true, expiryPolicy: 'none' });
    const invite = mockAdminDb.listCollection('directory_invitations')[0].data;
    expect(invite).toMatchObject({
      inviterId: 'client-1',
      targetUserId: 'architect-2',
      targetRole: 'bep',
      action: 'project',
      status: 'pending_acceptance',
      context: { jobId: 'job-1', projectId: 'project-1' },
      expiryPolicy: 'none',
      expiresAt: null,
      reminderPolicy: { cadence: 'periodic', intervalDays: 7, channels: ['in_app', 'email'], purpose: 'acceptance' },
      reminderCount: 0,
      lastReminderAt: null,
    });
    expect(invite.nextReminderAt).toBe('2026-01-09T03:04:05.000Z');
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
    expect(created.body).toMatchObject({ status: 'pending_registration', targetEmail: 'newbep@example.com', targetRole: 'bep', onboardingRequired: true, requiresAcceptance: true, expiryPolicy: 'none', nextReminderAt: '2026-01-09T03:04:05.000Z' });
    const registrationInvite = mockAdminDb.listCollection('directory_invitations')[0].data;
    expect(registrationInvite).toMatchObject({
      expiryPolicy: 'none',
      expiresAt: null,
      reminderPolicy: { cadence: 'periodic', intervalDays: 7, channels: ['in_app', 'email'], purpose: 'registration_and_acceptance' },
      nextReminderAt: '2026-01-09T03:04:05.000Z',
      reminderCount: 0,
      lastReminderAt: null,
    });
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

  it('limits resource centre publishing and browsing to verified BEPs and freelancers', async () => {
    const app = await buildApp();
    seedVerifiedBepVerification();
    seedVerifiedDirectoryVerification('freelancer-1', 'freelancer', 'freelancer', 'manual');

    const created = await request(app)
      .post('/api/resources/centre')
      .set(authHeader('architect'))
      .send({
        resourceType: 'submission_portal',
        title: 'Cape Town portal',
        municipality: 'City of Cape Town',
        submissionType: 'Building plan submission',
        discipline: 'architectural',
        url: 'https://example.gov.za/portal',
        tags: ['municipal', 'portal'],
        checklistItems: [{ id: 'owner-consent', title: 'Owner consent', status: 'complete' }],
      });
    const freelancerBrowse = await request(app)
      .get('/api/resources/centre?municipality=cape&resourceType=submission_portal')
      .set(authHeader('freelancer'));
    const clientBlocked = await request(app)
      .get('/api/resources/centre')
      .set(authHeader('client'));

    expect(created.status).toBe(201);
    expect(created.body.resource).toMatchObject({ resourceType: 'submission_portal', title: 'Cape Town portal', municipality: 'City of Cape Town', createdBy: 'architect-1' });
    expect(created.body.resource.checklistItems[0]).toMatchObject({ id: 'owner-consent', status: 'complete' });
    expect(freelancerBrowse.status).toBe(200);
    expect(freelancerBrowse.body.resources).toHaveLength(1);
    expect(clientBlocked.status).toBe(403);
    expect(mockAdminDb.listCollection('audit_logs').some(({ data }) => data.action === 'resource_centre.resource_created')).toBe(true);
    expect(mockAdminDb.listCollection('audit_logs').some(({ data }) => data.action === 'resource_centre.resources_viewed')).toBe(true);
  });

  it('tracks municipal drawing checklist requirements and component completion', async () => {
    const app = await buildApp();
    mockAdminDb.seed('projects/project-1', {
      id: 'project-1',
      jobId: 'job-1',
      clientId: 'client-1',
      leadArchitectId: 'architect-1',
      currentStage: 'municipal_submission',
      stageHistory: [],
      teamMembers: [{ userId: 'architect-1', role: 'architect', discipline: 'architecture', joinedAt: '2026-01-01T00:00:00.000Z', status: 'active' }],
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    seedVerifiedBepVerification();

    const created = await request(app)
      .post('/api/projects/project-1/checklists/drawing')
      .set(authHeader('architect'))
      .send({
        municipality: 'City of Cape Town',
        submissionType: 'alterations',
        stage: 'municipal_submission',
        disciplines: ['architectural', 'fire'],
        linkedDrawingIds: ['A-100'],
        linkedMunicipalSubmissionId: 'municipal-1',
        linkedTaskBoardIds: ['task-1'],
        requirements: [{ id: 'site-plan', title: 'Site plan', status: 'in_progress', responsibleParty: 'architect-1', linkedDrawingIds: ['A-100'] }],
        componentChecks: [{ id: 'north-point', title: 'North point', discipline: 'architectural' }],
      });
    const checklistId = created.body.checklist.id;
    const updated = await request(app)
      .post(`/api/projects/project-1/checklists/drawing/${checklistId}/items/north-point/status`)
      .set(authHeader('architect'))
      .send({ status: 'complete', notes: 'North point added to all sheets', linkedDrawingIds: ['A-100'] });
    const clientView = await request(app)
      .get('/api/projects/project-1/checklists/drawing')
      .set(authHeader('client'));
    const intruderView = await request(app)
      .get('/api/projects/project-1/checklists/drawing')
      .set(authHeader('intruder'));

    expect(created.status).toBe(201);
    expect(created.body.checklist).toMatchObject({ municipality: 'City of Cape Town', submissionType: 'alterations', progress: { total: 2, complete: 0 } });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ progress: { total: 2, complete: 1 } });
    expect(updated.body.componentChecks[0]).toMatchObject({ id: 'north-point', status: 'complete', notes: 'North point added to all sheets' });
    expect(clientView.status).toBe(200);
    expect(clientView.body.checklists[0]).toMatchObject({ id: checklistId, progress: { total: 2, complete: 1 } });
    expect(intruderView.status).toBe(403);
    expect(mockAdminDb.listCollection('audit_logs').some(({ data }) => data.action === 'resource_centre.drawing_checklist_created')).toBe(true);
    expect(mockAdminDb.listCollection('audit_logs').some(({ data }) => data.action === 'resource_centre.drawing_checklist_item_updated')).toBe(true);
  });

  it('lets verified lead BEPs manage municipal tracker records and publishes client insights', async () => {
    const app = await buildApp();
    mockAdminDb.seed('projects/project-1', {
      id: 'project-1',
      jobId: 'job-1',
      clientId: 'client-1',
      leadArchitectId: 'architect-1',
      currentStage: 'coordination',
      stageHistory: [],
      teamMembers: [{ userId: 'architect-1', role: 'architect', discipline: 'architecture', joinedAt: '2026-01-01T00:00:00.000Z', status: 'active' }],
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    seedVerifiedBepVerification();

    const created = await request(app)
      .post('/api/projects/project-1/municipal/submissions')
      .set(authHeader('architect'))
      .send({
        municipality: 'City of Cape Town',
        submissionReference: 'BP-123',
        status: 'submitted',
        aiExtractedStatus: 'Payment received',
        clientUpdate: 'Plans submitted to council.',
        contractorImpact: 'No site start until approval.',
        expectedNextStep: 'Await first plan examiner comments.',
        actionItems: ['Client to keep rates account active'],
        evidenceUrls: ['https://files.public.blob.vercel-storage.com/receipt.pdf'],
        linkedDrawingIds: ['drawing-1'],
        linkedComplianceFormIds: ['sans-form-1'],
        linkedSubmissionPackId: 'pack-1',
      });
    const submissionId = created.body.submission.id;
    const updated = await request(app)
      .post(`/api/projects/project-1/municipal/submissions/${submissionId}/status`)
      .set(authHeader('architect'))
      .send({ status: 'under_review', confirmAiStatus: true, clientUpdate: 'Council has started review.', contractorImpact: 'Procurement can continue, but site start remains blocked.', expectedNextStep: 'Respond to examiner comments.', actionItems: ['BEP to monitor portal'], note: 'Confirmed from portal screenshot' });
    const clientView = await request(app)
      .get('/api/projects/project-1/municipal/status')
      .set(authHeader('client'));
    const leadView = await request(app)
      .get('/api/projects/project-1/municipal/status')
      .set(authHeader('architect'));

    expect(created.status).toBe(201);
    expect(created.body.submission).toMatchObject({ municipality: 'City of Cape Town', status: 'submitted', aiStatusConfirmed: false, linkedSubmissionPackId: 'pack-1' });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ status: 'under_review', aiStatusConfirmed: true, clientUpdate: 'Council has started review.' });
    expect(clientView.status).toBe(200);
    expect(clientView.body).toMatchObject({ controlView: false });
    expect(clientView.body.submissions[0]).toMatchObject({ municipality: 'City of Cape Town', status: 'under_review', expectedNextStep: 'Respond to examiner comments.' });
    expect(clientView.body.submissions[0]).not.toHaveProperty('evidenceUrls');
    expect(leadView.body).toMatchObject({ controlView: true });
    expect(leadView.body.submissions[0]).toHaveProperty('evidenceUrls');
    expect(mockAdminDb.listCollection('audit_logs').some(({ data }) => data.action === 'municipal.submission_created')).toBe(true);
    expect(mockAdminDb.listCollection('audit_logs').some(({ data }) => data.action === 'municipal.status_updated')).toBe(true);
    expect(mockAdminDb.listCollection('audit_logs').some(({ data }) => data.action === 'municipal.insight_viewed')).toBe(true);
  });

  it('blocks clients from editing municipal tracker control records', async () => {
    const app = await buildApp();
    mockAdminDb.seed('projects/project-1', {
      id: 'project-1',
      jobId: 'job-1',
      clientId: 'client-1',
      leadArchitectId: 'architect-1',
      currentStage: 'coordination',
      stageHistory: [],
      teamMembers: [{ userId: 'architect-1', role: 'architect', discipline: 'architecture', joinedAt: '2026-01-01T00:00:00.000Z', status: 'active' }],
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    const clientCreate = await request(app)
      .post('/api/projects/project-1/municipal/submissions')
      .set(authHeader('client'))
      .send({ municipality: 'City of Cape Town', status: 'submitted' });
    const intruderView = await request(app)
      .get('/api/projects/project-1/municipal/status')
      .set(authHeader('intruder'));

    expect(clientCreate.status).toBe(403);
    expect(intruderView.status).toBe(403);
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
