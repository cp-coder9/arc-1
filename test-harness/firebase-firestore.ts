const role = (import.meta.env.VITE_TEST_ROLE || 'client') as string;
const now = new Date('2026-05-01T12:00:00.000Z').toISOString();

const users = [
  { uid: 'client-user', email: 'client@example.test', displayName: 'Client User', role: 'client', createdAt: now, averageRating: 4.8, completedJobs: 2 },
  { uid: 'architect-user', email: 'architect@example.test', displayName: 'Architect User', role: 'architect', createdAt: now, averageRating: 4.9, completedJobs: 7 },
  { uid: 'admin-user', email: 'admin@example.test', displayName: 'Admin User', role: 'admin', createdAt: now },
  { uid: 'freelancer-user', email: 'freelancer@example.test', displayName: 'Freelancer User', role: 'freelancer', createdAt: now },
  { uid: 'bep-user', email: 'bep@example.test', displayName: 'BEP User', role: 'bep', createdAt: now },
];

const jobs = [
  {
    id: 'job-1',
    clientId: 'client-user',
    title: 'Residential Extension',
    description: 'A compact extension requiring municipal submission.',
    requirements: ['SANS review', 'Council drawings'],
    deadline: '2026-06-15',
    budget: 150000,
    category: 'Residential',
    location: 'Cape Town',
    status: 'open',
    selectedArchitectId: 'architect-user',
    createdAt: now,
  },
  {
    id: 'job-2',
    clientId: 'client-user',
    title: 'Commercial Fit Out',
    description: 'Tenant improvement drawings and compliance review.',
    requirements: ['Fire plan'],
    deadline: '2026-07-01',
    budget: 300000,
    category: 'Commercial',
    location: 'Johannesburg',
    status: 'in-progress',
    selectedArchitectId: 'architect-user',
    createdAt: now,
  },
];

const applications = [
  { id: 'app-1', jobId: 'job-1', architectId: 'architect-user', architectName: 'Architect User', proposal: 'I can complete this.', status: 'pending', createdAt: now },
];

const reviews = [
  { id: 'review-1', jobId: 'job-1', fromId: 'client-user', toId: 'architect-user', rating: 5, comment: 'Excellent work.', status: 'approved', type: 'client_to_architect', createdAt: now },
];

const agents = [
  { id: 'agent-1', name: 'Wall Compliance Agent', role: 'wall_compliance', description: 'Checks wall compliance.', systemPrompt: 'Check walls.', temperature: 0.2, status: 'online', lastActive: now },
];

const submissions = [
  { id: 'sub-1', jobId: 'job-1', architectId: 'architect-user', drawingUrl: '#', drawingName: 'plan.pdf', status: 'ai_passed', traceability: [], createdAt: now },
];

const logs = [
  { id: 'log-1', timestamp: now, level: 'info', source: 'test', message: 'Harness log entry' },
];

const disputes: unknown[] = [];
const notifications: unknown[] = [];
const councilSubmissions: unknown[] = [];
const delegatedTasks = [
  { id: 'task-1', jobId: 'job-1', architectId: 'architect-user', assigneeId: `${role}-user`, assigneeName: 'Assigned User', assigneeRole: role, deadline: '2026-06-01', notes: 'Review drawings', status: 'pending', createdAt: now },
];
const invoices: unknown[] = [];
const files: unknown[] = [];

function dataForCollection(name: string) {
  switch (name) {
    case 'users': return users;
    case 'jobs': return jobs;
    case 'reviews': return reviews;
    case 'agents': return agents;
    case 'system_logs': return logs;
    case 'disputes': return disputes;
    case 'notifications': return notifications;
    case 'council_submissions': return councilSubmissions;
    case 'invoices': return invoices;
    case 'files': return files;
    case 'applications': return applications;
    case 'submissions': return submissions;
    case 'delegatedTasks': return delegatedTasks;
    default: return [];
  }
}

function matchesWhere(item: any, filter: any) {
  if (!filter || filter.kind !== 'where') return true;
  if (filter.op === '==') return item[filter.field] === filter.value;
  return true;
}

function makeDoc(item: any) {
  return {
    id: item.id || item.uid || 'mock-id',
    ref: { path: 'mock/ref' },
    exists: () => true,
    data: () => item,
  };
}

function applyConstraints(items: any[], constraints: any[]) {
  return items.filter(item => constraints.every(c => matchesWhere(item, c)));
}

export const CACHE_SIZE_UNLIMITED = -1;
export function persistentLocalCache() { return {}; }
export function persistentMultipleTabManager() { return {}; }
export function initializeFirestore() { return { __mockDb: true }; }

export function collection(_db: unknown, path: string) {
  return { kind: 'collection', path, collectionName: path.split('/').pop() || path, constraints: [] as any[] };
}

export function collectionGroup(_db: unknown, collectionName: string) {
  return { kind: 'collectionGroup', collectionName, constraints: [] as any[] };
}

export function query(base: any, ...constraints: any[]) {
  return { ...base, constraints: [...(base.constraints || []), ...constraints] };
}

export function where(field: string, op: string, value: unknown) {
  return { kind: 'where', field, op, value };
}

export function orderBy(field: string, direction = 'asc') {
  return { kind: 'orderBy', field, direction };
}

export function limit(count: number) {
  return { kind: 'limit', count };
}

export function doc(_db: unknown, path: string, id?: string) {
  return { kind: 'doc', path: id ? `${path}/${id}` : path, id: id || path.split('/').pop() };
}

export async function getDoc(ref: any) {
  const id = ref.id;
  const collectionName = ref.path?.split('/')?.at(-2) || ref.path?.split('/')?.at(0);
  const items = dataForCollection(collectionName || 'users');
  const found = items.find((item: any) => item.id === id || item.uid === id) || users.find(u => u.uid === id);
  return found ? makeDoc(found) : { id, exists: () => false, data: () => undefined };
}

export async function getDocs(q: any) {
  const items = applyConstraints(dataForCollection(q.collectionName || q.path), q.constraints || []);
  return { docs: items.map(makeDoc), size: items.length };
}

export function onSnapshot(q: any, callback: (snapshot: any) => void) {
  const collectionName = q.collectionName || q.path;
  const items = applyConstraints(dataForCollection(collectionName), q.constraints || []);
  queueMicrotask(() => callback({ docs: items.map(makeDoc), size: items.length }));
  return () => undefined;
}

export async function addDoc() { return { id: `new-${Date.now()}` }; }
export async function updateDoc() {}
export async function setDoc() {}
export async function deleteDoc() {}
export function deleteField() { return undefined; }
export function increment(value: number) { return value; }
export function writeBatch() { return { set() {}, update() {}, delete() {}, commit: async () => undefined }; }
