export type ApiRouteDomain =
  | 'platform'
  | 'auth'
  | 'profile'
  | 'governance'
  | 'directory'
  | 'briefs'
  | 'projects'
  | 'marketplace'
  | 'ai'
  | 'agent'
  | 'files'
  | 'notifications'
  | 'payments'
  | 'resources'
  | 'municipal'
  | 'verifications'
  | 'agents';

export interface ApiRouteDomainRegistryEntry {
  domain: ApiRouteDomain;
  label: string;
  description: string;
  prefixes: readonly string[];
  exactPaths?: readonly string[];
}

export const API_ROUTE_DOMAINS: readonly ApiRouteDomain[] = [
  'platform',
  'auth',
  'profile',
  'governance',
  'directory',
  'briefs',
  'projects',
  'marketplace',
  'ai',
  'agent',
  'files',
  'notifications',
  'payments',
  'resources',
  'municipal',
  'verifications',
  'agents',
] as const;

export const API_ROUTE_DOMAIN_LABELS: Record<ApiRouteDomain, string> = {
  platform: 'Platform diagnostics',
  auth: 'Authentication and session checks',
  profile: 'Role profile management',
  governance: 'Governance and audit records',
  directory: 'Professional directory',
  briefs: 'Brief and appointment intake',
  projects: 'Project OS spine',
  marketplace: 'Marketplace and proposals',
  ai: 'AI review and orchestration',
  agent: 'Agent and service automation',
  files: 'File storage',
  notifications: 'Notifications',
  payments: 'Payments and escrow',
  resources: 'Resource centre',
  municipal: 'Municipal and statutory tracking',
  verifications: 'Professional verification',
  agents: 'Agent orchestration and recommendations',
};

export const API_ROUTE_REGISTRY: readonly ApiRouteDomainRegistryEntry[] = [
  {
    domain: 'platform',
    label: API_ROUTE_DOMAIN_LABELS.platform,
    description: 'Public health and Firebase diagnostics that prove the API edge is alive without exposing workflow data.',
    exactPaths: ['/health', '/firebase/test'],
    prefixes: [],
  },
  {
    domain: 'auth',
    label: API_ROUTE_DOMAIN_LABELS.auth,
    description: 'Authentication/session checks that gate role-aware access into the OS.',
    prefixes: ['/auth/'],
  },
  {
    domain: 'profile',
    label: API_ROUTE_DOMAIN_LABELS.profile,
    description: 'User and admin profile endpoints used to align identity, role readiness, and onboarding state.',
    prefixes: ['/profile/', '/users/', '/admin/users/'],
  },
  {
    domain: 'governance',
    label: API_ROUTE_DOMAIN_LABELS.governance,
    description: 'Audit and governance record endpoints for sensitive project decisions.',
    prefixes: ['/governance/'],
  },
  {
    domain: 'directory',
    label: API_ROUTE_DOMAIN_LABELS.directory,
    description: 'Professional directory and invitation endpoints.',
    prefixes: ['/directory/'],
  },
  {
    domain: 'briefs',
    label: API_ROUTE_DOMAIN_LABELS.briefs,
    description: 'Client brief, technical brief, BEP assignment, and appointment package endpoints.',
    prefixes: ['/project-briefs', '/client-briefs'],
  },
  {
    domain: 'projects',
    label: API_ROUTE_DOMAIN_LABELS.projects,
    description: 'Core project command-centre, documents, tasks, approvals, messages, transmittals, AI issues, teams, coordination, and drawing checklist endpoints.',
    prefixes: ['/projects/'],
  },
  {
    domain: 'marketplace',
    label: API_ROUTE_DOMAIN_LABELS.marketplace,
    description: 'Marketplace opportunities, proposals, jobs, fee proposals, and application endpoints.',
    prefixes: ['/jobs/', '/marketplace/', '/proposals'],
  },
  {
    domain: 'ai',
    label: API_ROUTE_DOMAIN_LABELS.ai,
    description: 'AI review routes and admin AI-review governance actions. AI remains advisory only.',
    prefixes: ['/review', '/gemini/', '/ai/', '/admin/ai-review'],
  },
  {
    domain: 'agent',
    label: API_ROUTE_DOMAIN_LABELS.agent,
    description: 'Service/agent automation endpoints guarded separately from normal user workflow routes.',
    prefixes: ['/agent/'],
  },
  {
    domain: 'files',
    label: API_ROUTE_DOMAIN_LABELS.files,
    description: 'File upload/delete endpoints.',
    prefixes: ['/files/'],
  },
  {
    domain: 'notifications',
    label: API_ROUTE_DOMAIN_LABELS.notifications,
    description: 'Notification token and delivery preference endpoints.',
    prefixes: ['/notifications/'],
  },
  {
    domain: 'payments',
    label: API_ROUTE_DOMAIN_LABELS.payments,
    description: 'Payment, escrow, refund, receipt, and signed/webhook callback endpoints.',
    prefixes: ['/payment/'],
  },
  {
    domain: 'resources',
    label: API_ROUTE_DOMAIN_LABELS.resources,
    description: 'Resource centre and booking/provisioning readiness endpoints.',
    prefixes: ['/resources/'],
  },
  {
    domain: 'municipal',
    label: API_ROUTE_DOMAIN_LABELS.municipal,
    description: 'Municipal submission, OCR, shadow tracking, heatmap, settings, and crowdsource endpoints.',
    prefixes: ['/municipal/', '/track-municipality'],
  },
  {
    domain: 'verifications',
    label: API_ROUTE_DOMAIN_LABELS.verifications,
    description: 'Professional verification self-service and admin review endpoints.',
    prefixes: ['/verifications/', '/admin/verifications', '/architect/verify-sacap'],
  },
  {
    domain: 'agents',
    label: API_ROUTE_DOMAIN_LABELS.agents,
    description: 'Agent orchestration, recommendations, and event endpoints.',
    prefixes: ['/agents/'],
    exactPaths: ['/agents'],
  },
] as const;

function normalizeRoutePath(path: string): string {
  const trimmed = path.trim();
  return trimmed.startsWith('/api/') ? trimmed.slice(4) : trimmed;
}

export function getApiRouteDomainForPath(path: string): ApiRouteDomain | undefined {
  const normalized = normalizeRoutePath(path);
  return API_ROUTE_REGISTRY.find((entry) =>
    entry.exactPaths?.includes(normalized) || entry.prefixes.some((prefix) => normalized.startsWith(prefix)),
  )?.domain;
}

export function requireApiRouteDomainForPath(path: string): ApiRouteDomain {
  const domain = getApiRouteDomainForPath(path);
  if (!domain) throw new Error(`No API route domain registered for ${path}`);
  return domain;
}
