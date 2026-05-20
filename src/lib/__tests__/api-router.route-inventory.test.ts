import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch';
type AuthExpectation = 'public' | 'authenticated' | 'admin' | 'service-or-admin' | 'webhook' | 'signed-callback';

type RouteInventoryEntry = {
  method: HttpMethod;
  paths: string[];
  canonicalPath: string;
  line: number;
  domain: string;
  authExpectation: AuthExpectation;
  authGate: string;
};

const apiRouterPath = resolve(dirname(fileURLToPath(import.meta.url)), '../api-router.ts');
const source = readFileSync(apiRouterPath, 'utf8');

const ROUTE_DECLARATION = /router\.(get|post|put|delete|patch)\(([^\n]+)/g;
const AUTH_HELPERS = [
  'getAuthContext',
  'verifyAuth',
  'isAdmin(',
  'getProjectCoordinatorContext',
  'getProjectLeadContext',
  'getPaymentAuthContext',
  'getVerifiedFreelancerContext',
  'getResourceCentreContext',
  'requireAdmin',
];

const PUBLIC_ROUTES = new Set(['GET /health', 'POST /payment/notify', 'GET /firebase/test']);
const WEBHOOK_ROUTES = new Set(['POST /payment/notify']);
const SIGNED_CALLBACK_ROUTES = new Set(['POST /payment/confirm']);
const SERVICE_OR_ADMIN_PREFIXES = ['/agent/'];
const ADMIN_PREFIXES = ['/admin/'];

function lineFor(index: number) {
  return source.slice(0, index).split('\n').length;
}

function parsePaths(argumentPreview: string) {
  return Array.from(argumentPreview.matchAll(/["']([^"']+)["']/g)).map(match => match[1]);
}

function canonicalPath(paths: string[]) {
  const nonApiAlias = paths.find(path => !path.startsWith('/api/'));
  return nonApiAlias || paths[0];
}

function domainFor(path: string) {
  const normalized = path.replace(/^\/api/, '');
  if (normalized === '/health' || normalized === '/firebase/test') return 'platform';
  if (normalized.startsWith('/auth/')) return 'auth';
  if (normalized.startsWith('/profile/') || normalized.startsWith('/users/') || normalized.startsWith('/admin/users/')) return 'profile';
  if (normalized.startsWith('/governance/')) return 'governance';
  if (normalized.startsWith('/directory/')) return 'directory';
  if (normalized.startsWith('/project-briefs') || normalized.startsWith('/client-briefs')) return 'briefs';
  if (normalized.startsWith('/projects/')) return 'projects';
  if (normalized.startsWith('/jobs/') || normalized.startsWith('/marketplace/') || normalized.startsWith('/proposals')) return 'marketplace';
  if (normalized.startsWith('/review') || normalized.startsWith('/gemini/') || normalized.startsWith('/ai/') || normalized.startsWith('/admin/ai-review')) return 'ai';
  if (normalized.startsWith('/agent/')) return 'agent';
  if (normalized.startsWith('/files/')) return 'files';
  if (normalized.startsWith('/notifications/')) return 'notifications';
  if (normalized.startsWith('/payment/')) return 'payments';
  if (normalized.startsWith('/resources/')) return 'resources';
  if (normalized.startsWith('/municipal/') || normalized.startsWith('/track-municipality')) return 'municipal';
  if (normalized.startsWith('/verifications/') || normalized.startsWith('/admin/verifications') || normalized.startsWith('/architect/verify-sacap')) return 'verifications';
  return 'uncategorized';
}

function authExpectationFor(method: HttpMethod, path: string): AuthExpectation {
  const key = `${method.toUpperCase()} ${path}`;
  if (WEBHOOK_ROUTES.has(key)) return 'webhook';
  if (SIGNED_CALLBACK_ROUTES.has(key)) return 'signed-callback';
  if (PUBLIC_ROUTES.has(key)) return 'public';
  if (ADMIN_PREFIXES.some(prefix => path.startsWith(prefix))) return 'admin';
  if (SERVICE_OR_ADMIN_PREFIXES.some(prefix => path.startsWith(prefix))) return 'service-or-admin';
  return 'authenticated';
}

function routeChunk(matches: RegExpMatchArray[], index: number) {
  const start = matches[index].index ?? 0;
  const end = matches[index + 1]?.index ?? source.indexOf('export default', start);
  return source.slice(start, end === -1 ? undefined : end);
}

function authGateFor(chunk: string, canonicalPath: string) {
  if (canonicalPath === '/directory/search') {
    const handlerMatch = source.match(/const directorySearchHandler:[\s\S]*?^};/m);
    if (handlerMatch && AUTH_HELPERS.some(helper => handlerMatch[0].includes(helper))) return 'directorySearchHandler -> getAuthContext';
  }

  const helper = AUTH_HELPERS.find(name => chunk.includes(name));
  if (helper) return helper.replace('(', '');
  if (canonicalPath === '/payment/notify') return 'PayFast IPN webhook validation';
  if (canonicalPath === '/payment/confirm') return 'PayFast signature validation';
  if (canonicalPath === '/health' || canonicalPath === '/firebase/test') return 'public diagnostic route';
  return 'missing-static-auth-gate';
}

function inventoryRoutes(): RouteInventoryEntry[] {
  const matches = Array.from(source.matchAll(ROUTE_DECLARATION));
  return matches.map((match, index) => {
    const method = match[1] as HttpMethod;
    const paths = parsePaths(match[2]);
    const canonical = canonicalPath(paths);
    const chunk = routeChunk(matches, index);
    return {
      method,
      paths,
      canonicalPath: canonical,
      line: lineFor(match.index ?? 0),
      domain: domainFor(canonical),
      authExpectation: authExpectationFor(method, canonical),
      authGate: authGateFor(chunk, canonical),
    };
  });
}

describe('api-router route inventory', () => {
  const inventory = inventoryRoutes();

  it('keeps a static inventory of every Express route declaration', () => {
    expect(inventory).toHaveLength(98);
    expect(inventory.map(route => `${route.method.toUpperCase()} ${route.canonicalPath}`)).toMatchInlineSnapshot(`
      [
        "GET /directory/search",
        "POST /directory/invitations",
        "POST /directory/invitations/:invitationId/respond",
        "GET /health",
        "POST /project-briefs",
        "GET /project-briefs",
        "GET /project-briefs/:briefId",
        "POST /project-briefs/:briefId/attachments",
        "POST /project-briefs/:briefId/interpretations",
        "POST /auth/check-admin",
        "GET /profile/me",
        "PUT /profile/me",
        "POST /governance/records",
        "GET /governance/records",
        "PUT /users/:userId/profile",
        "PUT /admin/users/:userId/profile",
        "POST /client-briefs",
        "GET /client-briefs/:briefId",
        "PUT /client-briefs/:briefId",
        "POST /client-briefs/:briefId/assign-bep",
        "PUT /client-briefs/:briefId/technical-brief",
        "POST /client-briefs/:briefId/appoint-bep",
        "GET /projects/:projectId/command-centre",
        "POST /projects/:projectId/documents",
        "POST /projects/:projectId/document-versions",
        "POST /projects/:projectId/tasks",
        "POST /projects/:projectId/approvals",
        "POST /projects/:projectId/message-threads",
        "POST /projects/:projectId/messages",
        "POST /projects/:projectId/transmittals",
        "POST /projects/:projectId/ai-issues",
        "POST /projects/:projectId/ai-issues/:issueId/resolve",
        "POST /projects/:projectId/ai-issues/:issueId/review",
        "POST /ai/action-logs",
        "POST /admin/ai-review/:itemId/resolve",
        "POST /projects/:projectId/work-packages",
        "POST /projects/:projectId/work-packages/:packageId/applications",
        "POST /projects/:projectId/work-packages/:packageId/applications/:applicationId/assign",
        "POST /projects/:projectId/work-packages/:packageId/submissions",
        "POST /projects/:projectId/work-packages/:packageId/submissions/:submissionId/review",
        "POST /projects/:projectId/team-members",
        "POST /projects/:projectId/coordination/items",
        "GET /jobs/opportunities",
        "POST /marketplace/opportunities",
        "GET /marketplace/opportunities",
        "GET /marketplace/opportunities/:id",
        "POST /proposals",
        "GET /proposals/:proposalId",
        "GET /proposals/:proposalId/appointment-readiness",
        "POST /proposals/:proposalId/compare",
        "POST /jobs/:jobId/fee-proposals",
        "POST /jobs/:jobId/applications",
        "POST /jobs/:jobId/applications/:applicationId/accept",
        "POST /review",
        "POST /gemini/review",
        "POST /agent/test-settings",
        "POST /agent/search",
        "POST /files/upload",
        "POST /files/delete",
        "POST /notifications/token",
        "POST /payment/escrow/init",
        "POST /payment/milestone/release",
        "POST /payment/confirm",
        "POST /payment/milestone/request",
        "POST /payment/refund/request",
        "GET /payment/refund/requests",
        "POST /payment/refund/:requestId/process",
        "POST /payment/refund",
        "POST /payment/notify",
        "POST /resources/centre",
        "GET /resources/centre",
        "POST /projects/:projectId/checklists/drawing",
        "POST /projects/:projectId/checklists/drawing/:checklistId/items/:itemId/status",
        "GET /projects/:projectId/checklists/drawing",
        "POST /projects/:projectId/municipal/submissions",
        "POST /projects/:projectId/municipal/submissions/:submissionId/status",
        "GET /projects/:projectId/municipal/status",
        "POST /track-municipality",
        "POST /agent/scope",
        "POST /municipal/scrape",
        "POST /municipal/credentials",
        "GET /municipal/settings",
        "POST /municipal/ocr",
        "GET /municipal/heatmap/:municipality",
        "POST /municipal/shadow-track",
        "POST /municipal/submissions",
        "GET /municipal/submissions",
        "GET /verifications/me",
        "POST /verifications/submit",
        "GET /admin/verifications",
        "POST /admin/verifications/:verificationId/recheck",
        "POST /admin/verifications/:verificationId/review",
        "POST /architect/verify-sacap",
        "POST /municipal/crowdsource",
        "GET /payment/:paymentId/receipt",
        "POST /payment/:paymentId/receipt/pdf",
        "GET /payment/receipts",
        "GET /firebase/test",
      ]
    `);
  });

  it('categorizes canonical routes by implemented domain and auth expectation', () => {
    expect(inventory.filter(route => route.domain === 'uncategorized')).toEqual([]);
    expect(inventory.map(({ method, canonicalPath, domain, authExpectation }) => ({ method, canonicalPath, domain, authExpectation }))).toMatchSnapshot();
  });

  it('flags non-public canonical routes that lack a static auth gate signal', () => {
    const missingAuthGate = inventory.filter(route => !['public', 'webhook', 'signed-callback'].includes(route.authExpectation) && route.authGate === 'missing-static-auth-gate');
    expect(missingAuthGate).toEqual([]);
  });
});
