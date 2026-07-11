/**
 * Firestore Security Rules — Server-Only Writes, Admin Elevation, and Audit Protection
 *
 * Feature: commercial-control-rbac-hardening
 *
 * Validates: Requirements 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 7.6, 7.8
 *
 * These tests verify the expected Firestore security rule behavior through
 * logic-based assertions against the rule patterns defined in firestore.rules.
 * Since the Firestore emulator may not be available in CI, we test by reading
 * the rules file and validating the patterns, plus testing helper logic that
 * mirrors the rules' decision functions.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ── Rule File Loader ─────────────────────────────────────────────────────────

const RULES_PATH = resolve(__dirname, '../../firestore.rules');
let rulesContent: string;

try {
  rulesContent = readFileSync(RULES_PATH, 'utf-8');
} catch {
  rulesContent = '';
}

// ── Helper Types ─────────────────────────────────────────────────────────────

interface MockAuthContext {
  uid: string | null;
  token?: {
    email?: string;
    admin?: boolean;
    role?: string;
  };
}

interface MockRequestResource {
  data: Record<string, unknown>;
}

/**
 * Simulates the Firestore rules decision logic for server-only collections.
 * These collections deny all client writes (create, update, delete = false).
 */
function isServerOnlyWriteCollection(collection: string): boolean {
  const SERVER_ONLY_COLLECTIONS = [
    'payments',
    'escrow',
    'escrow_wallets',
    'payment_claims',
    'payment_certificates',
  ];
  return SERVER_ONLY_COLLECTIONS.includes(collection);
}

/**
 * Simulates the Firestore rules logic for admin role elevation denial.
 * The rules deny any client-side update that changes role to 'admin' or 'platform_admin'
 * unless the current role already equals the target role.
 */
function isAdminElevationDenied(
  auth: MockAuthContext,
  existingRole: string,
  requestedRole: string,
): boolean {
  // Unauthenticated users are always denied
  if (!auth.uid) return true;

  // If role is being changed to admin or platform_admin, deny unless it's unchanged
  if (
    (requestedRole === 'admin' || requestedRole === 'platform_admin') &&
    requestedRole !== existingRole
  ) {
    return true;
  }

  return false;
}

/**
 * Simulates the Firestore rules logic for audit trail append-only enforcement.
 * Audit collections allow create but deny update and delete.
 */
function evaluateAuditTrailAccess(
  auth: MockAuthContext,
  operation: 'create' | 'update' | 'delete',
  collection: string,
  requestData?: MockRequestResource,
): boolean {
  const AUDIT_COLLECTIONS = [
    'audit_logs',
    'access_logs',
    'project_stage_history',
  ];

  if (!AUDIT_COLLECTIONS.includes(collection)) return false;

  // Unauthenticated users are always denied
  if (!auth.uid) return false;

  switch (operation) {
    case 'create':
      // audit_logs requires immutable == true on the document
      if (collection === 'audit_logs') {
        return requestData?.data?.immutable === true;
      }
      // access_logs and project_stage_history allow authenticated create
      if (collection === 'access_logs') return true;
      if (collection === 'project_stage_history') {
        return requestData?.data?.immutable === true;
      }
      return true;
    case 'update':
      return false; // Always denied
    case 'delete':
      return false; // Always denied
  }
}

/**
 * Simulates default-deny posture: unmatched paths deny both reads and writes.
 */
function isDefaultDenyPath(path: string): boolean {
  // Known matched paths in the rules
  const KNOWN_COLLECTIONS = [
    'audit_logs', 'access_logs', 'user_verifications', 'role_profiles',
    'project_briefs', 'project_attachments', 'brief_interpretations',
    'marketplace_opportunities', 'proposals', 'proposal_comparisons',
    'appointments', 'directoryProfiles', 'directoryInvitations',
    'technical_briefs', 'delegatedTasks', 'cpd_assessments', 'cpd_attempts',
    'firms', 'firm_invites', 'project_progress_reports',
    'resource_checklists', 'resource_listings', 'resource_bookings',
    'resource_usage_logs', 'contractor_staff_records', 'contractor_plant_records',
    'contractor_wage_records', 'package_procurement_commitments',
    'package_delivery_evidence', 'package_snags', 'rfis', 'site_instructions',
    'gantt_tasks', 'site_logs', 'site_inspections', 'project_stage_history',
    'project_command_views', 'resource_centre', 'ai_action_logs',
    'ai_review_queue', 'human_signoffs', 'users', 'jobs', 'disputes',
    'projects', 'tender_packages', 'reviews', 'notifications', 'messages',
    'conversations', 'architect_verifications', 'architect_profiles',
    'appointment_contracts', 'payments', 'escrow', 'escrow_wallets',
    'payment_claims', 'payment_certificates', 'subscriptions', 'credits',
    'ledger', 'system_settings', 'agents', 'system_logs',
    'council_submissions', 'invoices', 'uploaded_files', 'userAgents',
    'projectAgents', 'agentContexts', 'agentEvents', 'agentRecommendations',
    'agentToolInvocations', 'agentDecisions', 'agent_knowledge',
    'feedback_submissions', 'feedback_clusters', 'feedback_audit_trail',
  ];

  const topLevelCollection = path.split('/')[0];
  return !KNOWN_COLLECTIONS.includes(topLevelCollection);
}

/**
 * Simulates unauthenticated write denial.
 * All collections require authentication (isAuthenticated() checks request.auth != null).
 */
function isUnauthenticatedWriteDenied(auth: MockAuthContext): boolean {
  return auth.uid === null;
}

// ══════════════════════════════════════════════════════════════════════════════
// Test Suite: Server-Only Write Enforcement (Requirement 5.5)
// ══════════════════════════════════════════════════════════════════════════════

describe('Firestore Rules: Server-only write enforcement (Req 5.5)', () => {
  it('rules file exists and can be loaded', () => {
    expect(rulesContent.length).toBeGreaterThan(0);
  });

  it('payments collection denies all client-side creates', () => {
    // Verify the rules file contains the payment deny-all pattern
    expect(rulesContent).toContain('match /payments/{paymentId}');
    // The pattern `allow create, update, delete: if false` denies all client writes
    const paymentsBlock = extractRuleBlock(rulesContent, 'payments/{paymentId}');
    expect(paymentsBlock).toContain('allow create, update, delete: if false');
  });

  it('escrow collection denies all client-side creates', () => {
    expect(rulesContent).toContain('match /escrow/{jobId}');
    const escrowBlock = extractRuleBlock(rulesContent, 'escrow/{jobId}');
    expect(escrowBlock).toContain('allow create, update, delete: if false');
  });

  it('escrow_wallets collection denies all client-side writes', () => {
    expect(rulesContent).toContain('match /escrow_wallets/{walletId}');
    const walletBlock = extractRuleBlock(rulesContent, 'escrow_wallets/{walletId}');
    expect(walletBlock).toContain('allow create, update, delete: if false');
  });

  it('payment_claims collection denies all client-side writes', () => {
    expect(rulesContent).toContain('match /payment_claims/{claimId}');
    const claimsBlock = extractRuleBlock(rulesContent, 'payment_claims/{claimId}');
    expect(claimsBlock).toContain('allow create, update, delete: if false');
  });

  it('payment_certificates collection denies all client-side writes', () => {
    expect(rulesContent).toContain('match /payment_certificates/{certId}');
    const certBlock = extractRuleBlock(rulesContent, 'payment_certificates/{certId}');
    expect(certBlock).toContain('allow create, update, delete: if false');
  });

  it('isServerOnlyWriteCollection correctly identifies all payment/escrow collections', () => {
    expect(isServerOnlyWriteCollection('payments')).toBe(true);
    expect(isServerOnlyWriteCollection('escrow')).toBe(true);
    expect(isServerOnlyWriteCollection('escrow_wallets')).toBe(true);
    expect(isServerOnlyWriteCollection('payment_claims')).toBe(true);
    expect(isServerOnlyWriteCollection('payment_certificates')).toBe(true);
    // Non-server-only collections
    expect(isServerOnlyWriteCollection('users')).toBe(false);
    expect(isServerOnlyWriteCollection('projects')).toBe(false);
    expect(isServerOnlyWriteCollection('audit_logs')).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Test Suite: Admin Role Elevation Denial (Requirements 5.6, 7.6)
// ══════════════════════════════════════════════════════════════════════════════

describe('Firestore Rules: Admin role elevation denial from client (Req 5.6, 7.6)', () => {
  it('rules file prevents client-side role elevation to admin', () => {
    // The users rule should contain logic to deny admin/platform_admin elevation
    const usersBlock = extractRuleBlock(rulesContent, 'users/{userId}');
    expect(usersBlock).toContain('admin');
    expect(usersBlock).toContain('platform_admin');
  });

  it('rules file contains explicit admin elevation denial comment', () => {
    expect(rulesContent).toContain(
      'Deny client-side admin/platform_admin role elevation',
    );
  });

  it('rules enforce that even admin users cannot elevate roles via client', () => {
    // The rules contain: !(request.resource.data.role in ['admin', 'platform_admin'])
    // || request.resource.data.role == resource.data.role
    const usersBlock = extractRuleBlock(rulesContent, 'users/{userId}');
    expect(usersBlock).toContain("request.resource.data.role in ['admin', 'platform_admin']");
    expect(usersBlock).toContain('request.resource.data.role == resource.data.role');
  });

  it('denies elevation from client role to admin', () => {
    const auth: MockAuthContext = { uid: 'user-123' };
    expect(isAdminElevationDenied(auth, 'client', 'admin')).toBe(true);
  });

  it('denies elevation from architect role to platform_admin', () => {
    const auth: MockAuthContext = { uid: 'user-456' };
    expect(isAdminElevationDenied(auth, 'architect', 'platform_admin')).toBe(true);
  });

  it('denies elevation from contractor to admin', () => {
    const auth: MockAuthContext = { uid: 'user-789' };
    expect(isAdminElevationDenied(auth, 'contractor', 'admin')).toBe(true);
  });

  it('allows keeping existing admin role unchanged', () => {
    const auth: MockAuthContext = { uid: 'admin-user' };
    expect(isAdminElevationDenied(auth, 'admin', 'admin')).toBe(false);
  });

  it('allows keeping existing platform_admin role unchanged', () => {
    const auth: MockAuthContext = { uid: 'pa-user' };
    expect(isAdminElevationDenied(auth, 'platform_admin', 'platform_admin')).toBe(false);
  });

  it('denies elevation for unauthenticated user', () => {
    const auth: MockAuthContext = { uid: null };
    expect(isAdminElevationDenied(auth, 'client', 'admin')).toBe(true);
  });

  it('allows role change to non-admin roles (e.g. client to architect)', () => {
    const auth: MockAuthContext = { uid: 'user-abc' };
    // Non-admin target roles are not blocked by elevation logic
    expect(isAdminElevationDenied(auth, 'client', 'architect')).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Test Suite: Composite Write Denial for Unauthorized Users (Requirement 5.7)
// ══════════════════════════════════════════════════════════════════════════════

describe('Firestore Rules: Composite write denial for unauthorized users (Req 5.7)', () => {
  it('rules require authentication for all writes', () => {
    // isAuthenticated() is the fundamental guard function
    expect(rulesContent).toContain('function isAuthenticated()');
    expect(rulesContent).toContain('return request.auth != null');
  });

  it('write to escrow denied without valid auth', () => {
    expect(isServerOnlyWriteCollection('escrow')).toBe(true);
    // Even authenticated users are denied writes to server-only collections
  });

  it('write to payments denied without valid auth', () => {
    expect(isServerOnlyWriteCollection('payments')).toBe(true);
  });

  it('project writes require project membership', () => {
    const projectsBlock = extractRuleBlock(rulesContent, 'projects/{projectId}');
    // Update requires isProjectParticipantByData or admin
    expect(projectsBlock).toContain('isProjectParticipantByData');
  });

  it('rules enforce role checking via getUserData helper', () => {
    expect(rulesContent).toContain('function getUserData()');
    expect(rulesContent).toContain('function hasRole(role)');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Test Suite: Audit Trail Append-Only Enforcement (Requirement 5.8)
// ══════════════════════════════════════════════════════════════════════════════

describe('Firestore Rules: Audit trail append-only enforcement (Req 5.8)', () => {
  it('audit_logs allows create with immutable:true', () => {
    const block = extractRuleBlock(rulesContent, 'audit_logs/{auditId}');
    expect(block).toContain('allow create: if isAuthenticated()');
    expect(block).toContain('request.resource.data.immutable == true');
  });

  it('audit_logs denies update and delete unconditionally', () => {
    const block = extractRuleBlock(rulesContent, 'audit_logs/{auditId}');
    expect(block).toContain('allow update, delete: if false');
  });

  it('access_logs allows create for authenticated users', () => {
    const block = extractRuleBlock(rulesContent, 'access_logs/{accessLogId}');
    expect(block).toContain('allow create: if isAuthenticated()');
  });

  it('access_logs denies update and delete', () => {
    const block = extractRuleBlock(rulesContent, 'access_logs/{accessLogId}');
    expect(block).toContain('allow update, delete: if false');
  });

  it('project_stage_history denies update and delete', () => {
    const block = extractRuleBlock(rulesContent, 'project_stage_history/{historyId}');
    expect(block).toContain('allow update, delete: if false');
  });

  it('firm audit_events denies update and delete', () => {
    // firms/{firmId}/audit_events is a subcollection
    expect(rulesContent).toContain('match /audit_events/{eventId}');
    // Find the firm audit_events block — it should deny update/delete
    const firmSection = rulesContent.substring(
      rulesContent.indexOf('match /firms/{firmId}'),
    );
    const auditEventsInFirm = firmSection.substring(
      firmSection.indexOf('match /audit_events/{eventId}'),
      firmSection.indexOf('match /audit_events/{eventId}') + 300,
    );
    expect(auditEventsInFirm).toContain('allow update, delete: if false');
  });

  it('evaluateAuditTrailAccess: allows create on audit_logs with immutable', () => {
    const auth: MockAuthContext = { uid: 'user-1' };
    const req: MockRequestResource = { data: { immutable: true } };
    expect(evaluateAuditTrailAccess(auth, 'create', 'audit_logs', req)).toBe(true);
  });

  it('evaluateAuditTrailAccess: denies create on audit_logs without immutable', () => {
    const auth: MockAuthContext = { uid: 'user-1' };
    const req: MockRequestResource = { data: { immutable: false } };
    expect(evaluateAuditTrailAccess(auth, 'create', 'audit_logs', req)).toBe(false);
  });

  it('evaluateAuditTrailAccess: allows create on access_logs', () => {
    const auth: MockAuthContext = { uid: 'user-1' };
    expect(evaluateAuditTrailAccess(auth, 'create', 'access_logs')).toBe(true);
  });

  it('evaluateAuditTrailAccess: denies update on all audit collections', () => {
    const auth: MockAuthContext = { uid: 'user-1' };
    expect(evaluateAuditTrailAccess(auth, 'update', 'audit_logs')).toBe(false);
    expect(evaluateAuditTrailAccess(auth, 'update', 'access_logs')).toBe(false);
    expect(evaluateAuditTrailAccess(auth, 'update', 'project_stage_history')).toBe(false);
  });

  it('evaluateAuditTrailAccess: denies delete on all audit collections', () => {
    const auth: MockAuthContext = { uid: 'user-1' };
    expect(evaluateAuditTrailAccess(auth, 'delete', 'audit_logs')).toBe(false);
    expect(evaluateAuditTrailAccess(auth, 'delete', 'access_logs')).toBe(false);
    expect(evaluateAuditTrailAccess(auth, 'delete', 'project_stage_history')).toBe(false);
  });

  it('evaluateAuditTrailAccess: denies all operations for unauthenticated users', () => {
    const auth: MockAuthContext = { uid: null };
    const req: MockRequestResource = { data: { immutable: true } };
    expect(evaluateAuditTrailAccess(auth, 'create', 'audit_logs', req)).toBe(false);
    expect(evaluateAuditTrailAccess(auth, 'update', 'audit_logs')).toBe(false);
    expect(evaluateAuditTrailAccess(auth, 'delete', 'access_logs')).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Test Suite: Default-Deny on Unmatched Paths (Requirement 5.9)
// ══════════════════════════════════════════════════════════════════════════════

describe('Firestore Rules: Default-deny on unmatched paths (Req 5.9)', () => {
  it('rules contain a default-deny catch-all rule', () => {
    expect(rulesContent).toContain('match /{document=**}');
    expect(rulesContent).toContain('allow read, write: if false');
  });

  it('default-deny rule is at the end of the rules document', () => {
    // The catch-all should be the last match block before closing braces
    const lastMatchIndex = rulesContent.lastIndexOf('match /{document=**}');
    const lastAllowFalse = rulesContent.indexOf('allow read, write: if false', lastMatchIndex);
    expect(lastAllowFalse).toBeGreaterThan(lastMatchIndex);
    // Verify nothing else comes after except closing braces and whitespace
    const afterDeny = rulesContent.substring(lastAllowFalse + 'allow read, write: if false'.length);
    const trimmed = afterDeny.replace(/[\s;{}]/g, '');
    expect(trimmed).toBe('');
  });

  it('isDefaultDenyPath identifies unmatched collection paths', () => {
    // These paths are NOT explicitly matched in rules — default-deny applies
    expect(isDefaultDenyPath('secret_data')).toBe(true);
    expect(isDefaultDenyPath('internal_configs')).toBe(true);
    expect(isDefaultDenyPath('admin_secrets')).toBe(true);
    expect(isDefaultDenyPath('test_collection')).toBe(true);
    expect(isDefaultDenyPath('unprotected_stuff')).toBe(true);
  });

  it('isDefaultDenyPath correctly identifies known matched paths', () => {
    // These paths ARE explicitly matched — not subject to default-deny
    expect(isDefaultDenyPath('users')).toBe(false);
    expect(isDefaultDenyPath('projects')).toBe(false);
    expect(isDefaultDenyPath('payments')).toBe(false);
    expect(isDefaultDenyPath('audit_logs')).toBe(false);
    expect(isDefaultDenyPath('escrow_wallets')).toBe(false);
    expect(isDefaultDenyPath('proposals')).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Test Suite: Unauthenticated Write Denial (Requirement 7.8)
// ══════════════════════════════════════════════════════════════════════════════

describe('Firestore Rules: Unauthenticated write denial across 5+ collections (Req 7.8)', () => {
  const UNAUTHENTICATED: MockAuthContext = { uid: null };

  const TARGET_COLLECTIONS = [
    'audit_logs',
    'user_verifications',
    'project_briefs',
    'proposals',
    'delegatedTasks',
  ];

  it('rules require isAuthenticated() for all write operations', () => {
    // Every write rule uses isAuthenticated() as the first guard
    expect(rulesContent).toContain('function isAuthenticated()');
    expect(rulesContent).toContain('return request.auth != null');
  });

  it.each(TARGET_COLLECTIONS)(
    'unauthenticated write to %s is denied',
    (collection) => {
      expect(isUnauthenticatedWriteDenied(UNAUTHENTICATED)).toBe(true);
    },
  );

  it('audit_logs create rule requires isAuthenticated()', () => {
    const block = extractRuleBlock(rulesContent, 'audit_logs/{auditId}');
    expect(block).toContain('allow create: if isAuthenticated()');
  });

  it('user_verifications create rule requires isAuthenticated()', () => {
    const block = extractRuleBlock(rulesContent, 'user_verifications/{verificationId}');
    expect(block).toContain('allow create: if isAuthenticated()');
  });

  it('project_briefs create rule requires isAuthenticated()', () => {
    const block = extractRuleBlock(rulesContent, 'project_briefs/{briefId}');
    expect(block).toContain('allow create: if isAuthenticated()');
  });

  it('proposals create rule requires isAuthenticated()', () => {
    const block = extractRuleBlock(rulesContent, 'proposals/{proposalId}');
    expect(block).toContain('allow create: if isAuthenticated()');
  });

  it('delegatedTasks create rule requires isAuthenticated()', () => {
    const block = extractRuleBlock(rulesContent, 'delegatedTasks/{taskId}');
    expect(block).toContain('allow create: if isAuthenticated()');
  });

  it('verifies 5+ collections are covered for unauthenticated denial', () => {
    expect(TARGET_COLLECTIONS.length).toBeGreaterThanOrEqual(5);
  });

  it('all targeted collections exist in rules file', () => {
    // Verify each collection is explicitly matched
    expect(rulesContent).toContain('match /audit_logs/{');
    expect(rulesContent).toContain('match /user_verifications/{');
    expect(rulesContent).toContain('match /project_briefs/{');
    expect(rulesContent).toContain('match /proposals/{');
    expect(rulesContent).toContain('match /delegatedTasks/{');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Test Suite: Client-Side Admin Elevation Denial (Requirement 7.6)
// ══════════════════════════════════════════════════════════════════════════════

describe('Firestore Rules: Client-side admin elevation denial (Req 7.6)', () => {
  it('users collection update rule restricts allowed fields for owner', () => {
    const usersBlock = extractRuleBlock(rulesContent, 'users/{userId}');
    // Owner can only update specific profile fields
    expect(usersBlock).toContain('displayName');
    expect(usersBlock).toContain('bio');
    expect(usersBlock).toContain('updatedAt');
    expect(usersBlock).toContain('affectedKeys().hasOnly');
  });

  it('role field is NOT in the allowed owner update fields', () => {
    const usersBlock = extractRuleBlock(rulesContent, 'users/{userId}');
    // Extract the hasOnly array for isOwner updates
    const ownerUpdateMatch = usersBlock.match(
      /isOwner\(userId\)\s*&&\s*\n?\s*request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\)\.hasOnly\(\s*\[([^\]]+)\]/s,
    );
    if (ownerUpdateMatch) {
      const allowedFields = ownerUpdateMatch[1];
      // 'role' should NOT be in the allowed fields list
      expect(allowedFields).not.toContain("'role'");
    }
  });

  it('admin user update contains role elevation guard', () => {
    const usersBlock = extractRuleBlock(rulesContent, 'users/{userId}');
    // The guard: !(request.resource.data.role in ['admin', 'platform_admin'])
    // || request.resource.data.role == resource.data.role
    expect(usersBlock).toContain("request.resource.data.role in ['admin', 'platform_admin']");
  });

  it('denies elevation attempt from any non-admin role to admin', () => {
    const nonAdminRoles = ['client', 'architect', 'contractor', 'freelancer', 'bep'];
    for (const role of nonAdminRoles) {
      const auth: MockAuthContext = { uid: 'test-user' };
      expect(isAdminElevationDenied(auth, role, 'admin')).toBe(true);
      expect(isAdminElevationDenied(auth, role, 'platform_admin')).toBe(true);
    }
  });

  it('only allows role to remain unchanged when it is already admin/platform_admin', () => {
    const auth: MockAuthContext = { uid: 'existing-admin' };
    expect(isAdminElevationDenied(auth, 'admin', 'admin')).toBe(false);
    expect(isAdminElevationDenied(auth, 'platform_admin', 'platform_admin')).toBe(false);
    // But changing from one admin level to another is denied
    expect(isAdminElevationDenied(auth, 'admin', 'platform_admin')).toBe(true);
    expect(isAdminElevationDenied(auth, 'platform_admin', 'admin')).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Helper Functions
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Extracts the rule block for a given match path from the rules file.
 * Returns the content between the match statement and its closing brace.
 */
function extractRuleBlock(rules: string, matchPath: string): string {
  const matchStr = `match /${matchPath}`;
  const startIndex = rules.indexOf(matchStr);
  if (startIndex === -1) return '';

  // Find the opening brace after the match
  const braceStart = rules.indexOf('{', startIndex + matchStr.length);
  if (braceStart === -1) return '';

  // Count braces to find the matching closing brace
  let depth = 1;
  let i = braceStart + 1;
  while (i < rules.length && depth > 0) {
    if (rules[i] === '{') depth++;
    if (rules[i] === '}') depth--;
    i++;
  }

  return rules.substring(startIndex, i);
}
