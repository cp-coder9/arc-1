const fallbackRole = (import.meta.env.VITE_TEST_ROLE || 'client') as string;
const now = new Date('2026-05-01T12:00:00.000Z').toISOString();

function getRole() {
  if (typeof window === 'undefined') return fallbackRole;
  return new URLSearchParams(window.location.search).get('role') || fallbackRole;
}

function getUsers() {
  return [
    { uid: 'client-user', email: 'client@example.test', displayName: 'Client User', role: 'client', createdAt: now, averageRating: 4.8, completedJobs: 2 },
    { uid: 'architect-user', email: 'architect@example.test', displayName: 'Architect User', role: 'architect', createdAt: now, averageRating: 4.9, completedJobs: 7 },
    { uid: 'admin-user', email: 'admin@example.test', displayName: 'Admin User', role: 'admin', createdAt: now },
    { uid: 'freelancer-user', email: 'freelancer@example.test', displayName: 'Freelancer User', role: 'freelancer', createdAt: now },
    { uid: 'bep-user', email: 'bep@example.test', displayName: 'BEP User', role: 'bep', createdAt: now },
    { uid: 'contractor-user', email: 'contractor@example.test', displayName: 'Contractor User', role: 'contractor', createdAt: now, cidbGrading: '4GB' },
    { uid: 'subcontractor-user', email: 'subcontractor@example.test', displayName: 'Subcontractor User', role: 'subcontractor', createdAt: now, tradeLicense: 'TR-123' },
    { uid: 'supplier-user', email: 'supplier@example.test', displayName: 'Supplier User', role: 'supplier', createdAt: now, region: 'Gauteng' },
  ];
}

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

const projects = [
  { id: 'project-1', jobId: 'job-2', clientId: 'client-user', leadArchitectId: 'architect-user', currentStage: 'coordination', stageHistory: [], teamMembers: [], createdAt: now, updatedAt: now },
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
  { id: 'task-1', jobId: 'job-1', architectId: 'architect-user', assigneeId: `${getRole()}-user`, assigneeName: 'Assigned User', assigneeRole: getRole(), deadline: '2026-06-01', notes: 'Review drawings', status: 'pending', createdAt: now },
];
const invoices: unknown[] = [];
const files: unknown[] = [];
const directoryProfiles = getUsers().map(user => ({ ...user, uid: user.uid, visible: true, verificationStatus: 'verified', updatedAt: now }));
const tenderPackages = [
  { id: 'tender-1', projectId: 'project-1', jobId: 'job-2', title: 'Envelope package', description: 'Facade and envelope package.', scope: ['Supply and install'], status: 'published', createdBy: 'architect-user', estimatedBudget: 250000, deadline: '2026-08-01', createdAt: now, updatedAt: now },
];
const packageProcurementCommitments = [
  { id: 'commitment-1', packageId: 'tender-1', projectId: 'project-1', jobId: 'job-2', type: 'supplier_quote', title: 'Window quote', status: 'draft', requestedBy: 'contractor-user', humanReviewRequired: false, createdAt: now, updatedAt: now },
];
const cpdAssessments = [
  { id: 'cpd-1', courseId: 'course-1', title: 'SANS refresher', cpdPoints: 1, passMark: 60, questions: [{ id: 'q1', prompt: 'AI output requires human review.', type: 'true_false', correctOptionIds: ['true'] }], createdAt: now },
];
const resourceListings = [
  { id: 'resource-1', ownerId: 'architect-user', name: 'BIM workstation', capability: 'Remote modelling', visibilityRoles: ['bep', 'architect', 'freelancer'], status: 'active', createdAt: now },
];

function dataForCollection(name: string) {
  const collectionName = name.split('/').pop() || name;
  switch (collectionName) {
    case 'users': return getUsers();
    case 'projects': return projects;
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
    case 'tasks': return delegatedTasks;
    case 'approvals': return [];
    case 'directoryProfiles': return directoryProfiles;
    case 'directoryInvitations': return [];
    case 'tender_packages': return tenderPackages;
    case 'bids': return [];
    case 'package_procurement_commitments': return packageProcurementCommitments;
    case 'package_delivery_evidence': return [];
    case 'package_snags': return [];
    case 'rfis': return [];
    case 'gantt_tasks': return [];
    case 'site_logs': return [];
    case 'site_inspections': return [];
    case 'project_progress_reports': return [];
    case 'resource_checklists': return [];
    case 'resource_listings': return resourceListings;
    case 'resource_bookings': return [];
    case 'resource_usage_logs': return [];
    case 'cpd_assessments': return cpdAssessments;
    case 'cpd_attempts': return [];
    case 'technical_briefs': return [];
    case 'marketplace_opportunities': return [];
    case 'ledger': return [];
    case 'escrow': return [];
    case 'contractor_staff_records': return [];
    case 'contractor_plant_records': return [];
    case 'contractor_wage_records': return [];
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
export function memoryLocalCache() { return {}; }
export function persistentLocalCache() { return {}; }
export function persistentMultipleTabManager() { return {}; }
export function initializeFirestore() { return { __mockDb: true }; }
export function getFirestore() { return { __mockDb: true }; }

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

export function doc(_db: unknown, path: string, ...segments: string[]) {
  const fullPath = [path, ...segments].filter(Boolean).join('/');
  return { kind: 'doc', path: fullPath, id: fullPath.split('/').pop() };
}

export function collection(_db: unknown, path: string, ...segments: string[]) {
  const fullPath = [path, ...segments].filter(Boolean).join('/');
  return { kind: 'collection', path: fullPath, collectionName: fullPath.split('/').pop() || fullPath, constraints: [] as any[] };
}

export async function getDoc(ref: any) {
  const id = ref.id;
  const collectionName = ref.path?.split('/')?.at(-2) || ref.path?.split('/')?.at(0);
  const items = dataForCollection(collectionName || 'users');
  const found = items.find((item: any) => item.id === id || item.uid === id) || getUsers().find(u => u.uid === id);
  return found ? makeDoc(found) : { id, exists: () => false, data: () => undefined };
}

export async function getDocs(q: any) {
  const items = applyConstraints(dataForCollection(q.collectionName || q.path), q.constraints || []);
  return { docs: items.map(makeDoc), size: items.length };
}

export function onSnapshot(q: any, callback: (snapshot: any) => void) {
  if (q.kind === 'doc') {
    queueMicrotask(async () => callback(await getDoc(q)));
    return () => undefined;
  }
  const collectionName = q.collectionName || q.path;
  const items = applyConstraints(dataForCollection(collectionName), q.constraints || []);
  queueMicrotask(() => callback({ docs: items.map(makeDoc), size: items.length }));
  return () => undefined;
}

export async function addDoc() { return { id: `new-${Date.now()}` }; }
export async function updateDoc() {}
export async function setDoc() {}
export async function deleteDoc() {}
export async function runTransaction(_db: unknown, updateFunction: (transaction: { get: typeof getDoc; set: () => void; update: () => void; delete: () => void }) => unknown) {
  return updateFunction({ get: getDoc, set() {}, update() {}, delete() {} });
}
export function deleteField() { return undefined; }
export function increment(value: number) { return value; }
export function arrayUnion(...values: unknown[]) { return values; }
export function arrayRemove(...values: unknown[]) { return values; }
export function writeBatch() { return { set() {}, update() {}, delete() {}, commit: async () => undefined }; }
