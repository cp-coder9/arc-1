import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
const indexes = JSON.parse(readFileSync(resolve(process.cwd(), 'firestore.indexes.json'), 'utf8')) as {
  indexes: Array<{
    collectionGroup: string;
    queryScope: string;
    fields: Array<{ fieldPath: string; order?: string; arrayConfig?: string }>;
  }>;
};
const phase2VerificationDocs = readFileSync(resolve(process.cwd(), 'docs/phase-reports/phase-2-automated-verification-workflows.md'), 'utf8');
const aiGovernanceDocs = readFileSync(resolve(process.cwd(), 'docs/backend/ai-governance-human-signoff.md'), 'utf8');

function hasIndex(collectionGroup: string, fields: Array<{ fieldPath: string; order?: string; arrayConfig?: string }>) {
  return indexes.indexes.some((index) =>
    index.collectionGroup === collectionGroup &&
    index.fields.length === fields.length &&
    fields.every((field, indexPosition) => {
      const candidate = index.fields[indexPosition];
      return candidate.fieldPath === field.fieldPath &&
        candidate.order === field.order &&
        candidate.arrayConfig === field.arrayConfig;
    }),
  );
}

describe('firestore security rules static regressions', () => {
  it('keeps audit logs append-only and admin-readable', () => {
    expect(rules).toContain('match /audit_logs/{auditId}');
    expect(rules).toContain('allow read: if isAdmin();');
    expect(rules).toContain('allow create: if isAuthenticated() && request.resource.data.immutable == true;');
    expect(rules).toContain('allow update, delete: if false;');
  });

  it('keeps access logs server-owned and admin-readable', () => {
    expect(rules).toContain('match /access_logs/{accessLogId}');
    expect(rules).toContain('allow read: if isAdmin();');
    expect(rules).toContain('allow create, update, delete: if false;');
  });

  it('supports generalized user verifications without client-side approvals', () => {
    expect(rules).toContain('match /user_verifications/{verificationId}');
    expect(rules).toContain("request.resource.data.status == 'pending'");
    expect(rules).toContain("request.resource.data.subjectType in ['bep', 'contractor', 'subcontractor', 'supplier', 'freelancer', 'admin']");
    expect(rules).toContain('allow update: if isAdmin();');
    expect(rules).toContain('allow delete: if false;');
  });

  it('keeps architect users authorized as BEP subtype for marketplace applications', () => {
    expect(rules).toContain("request.resource.data.role in ['client', 'architect', 'admin', 'freelancer', 'bep', 'contractor', 'subcontractor', 'supplier']");
    expect(rules).toContain("(hasRole('architect') || hasRole('bep'))");
  });

  it('requires active contractor verification references for tender bids', () => {
    expect(rules).toContain("hasRole('contractor') || hasRole('subcontractor') || hasRole('supplier')");
    expect(rules).toContain('function isActiveContractorBidVerification(verificationId)');
    expect(rules).toContain('isActiveContractorBidVerification(request.resource.data.verificationId)');
    expect(rules).toContain("'verificationId'");
  });

  it('covers production dashboard collections used by role workspaces', () => {
    for (const collection of [
      'directoryProfiles',
      'directoryInvitations',
      'technical_briefs',
      'delegatedTasks',
      'cpd_assessments',
      'cpd_attempts',
      'firms',
      'firm_invites',
      'project_progress_reports',
      'resource_checklists',
      'resource_listings',
      'resource_bookings',
      'resource_usage_logs',
      'contractor_staff_records',
      'contractor_plant_records',
      'contractor_wage_records',
      'package_procurement_commitments',
      'package_delivery_evidence',
      'package_snags',
      'rfis',
      'gantt_tasks',
      'site_logs',
      'site_inspections',
    ]) {
      expect(rules).toContain(`match /${collection}/`);
    }

    expect(rules).toContain('function canReadPackageLinkedRecord(data)');
    expect(rules).toContain('function canCreateOwnedDashboardRecord(data)');
    expect(rules).toContain('data.assignedTo == request.auth.uid');
    expect(rules).toContain('match /interpretations/{interpretationId}');
    expect(rules).toContain('resource.data.awardedContractorId == request.auth.uid');
  });

  it('gates Phase 3/4 operational collections by project access and immutable identity fields', () => {
    expect(rules).toContain('function canReadProject(projectId)');
    expect(rules).toContain('function canManageProject(projectId)');
    expect(rules).toContain('match /project_command_views/{viewId}');
    expect(rules).toContain('resource.data.viewerUserId == request.auth.uid');
    expect(rules).toContain('match /resource_centre/{resourceId}');
    expect(rules).toContain('match /drawing_checklists/{checklistId}');
    expect(rules).toContain('match /municipal_submissions/{submissionId}');
    expect(rules).toContain('match /work_packages/{packageId}');
    expect(rules).toContain('match /ai_issues/{issueId}');
    expect(rules).toContain('match /coordination_items/{itemId}');
    expect(rules).toContain('request.resource.data.humanConfirmed == false');
    expect(rules).toContain("request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status', 'deliverables', 'updatedAt'])");
    expect(rules).toContain("request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status', 'resolutionStatus', 'assigneeNotes', 'updatedAt'])");
  });

  it('allows only bounded freelancer deliverable submission and BEP review fields', () => {
    expect(rules).toContain('match /delegatedTasks/{taskId}');
    expect(rules).toContain("request.resource.data.humanApprovalRequired == true");
    expect(rules).toContain('function isLegacyTaskStatusPatch()');
    expect(rules).toContain('function isFreelancerDeliverableSubmissionPatch()');
    expect(rules).toContain('function isBepDeliverableReviewPatch()');
    expect(rules).toContain("resource.data.submissionStatus == 'submitted'");
    expect(rules).toContain("request.resource.data.paymentStatus == 'ready_for_invoice'");
    expect(rules).toContain("request.resource.data.paymentStatus == 'review_pending'");
    expect(rules).toContain('match /tasks/{taskId}');
    expect(rules).toContain('isFreelancerDeliverableSubmissionPatch() ||');
    expect(rules).toContain('isBepDeliverableReviewPatch()');
  });

  it('keeps AI governance logs, queues, and human signoffs server-owned', () => {
    expect(rules).toContain('match /ai_action_logs/{logId}');
    expect(rules).toContain('match /ai_review_queue/{itemId}');
    expect(rules).toContain('match /human_signoffs/{signoffId}');
    expect(rules).toContain('allow read: if canReadProject(resource.data.projectId);');
    expect(rules).toContain('allow read: if isAdmin() || canReadProject(resource.data.projectId);');
    expect(rules).toContain('allow read: if isAdmin() || canReadProject(resource.data.target.projectId);');
    const serverOwnedRuleCount = rules.match(/allow create, update, delete: if false;/g)?.length || 0;
    expect(serverOwnedRuleCount).toBeGreaterThanOrEqual(4);
  });

  it('keeps Firestore indexes aligned with AI governance and Phase 2 verification queries', () => {
    expect(hasIndex('ai_action_logs', [
      { fieldPath: 'projectId', order: 'ASCENDING' },
      { fieldPath: 'status', order: 'ASCENDING' },
      { fieldPath: 'createdAt', order: 'DESCENDING' },
    ])).toBe(true);
    expect(hasIndex('ai_review_queue', [
      { fieldPath: 'projectId', order: 'ASCENDING' },
      { fieldPath: 'status', order: 'ASCENDING' },
      { fieldPath: 'priority', order: 'ASCENDING' },
      { fieldPath: 'createdAt', order: 'DESCENDING' },
    ])).toBe(true);
    expect(hasIndex('human_signoffs', [
      { fieldPath: 'target.projectId', order: 'ASCENDING' },
      { fieldPath: 'domain', order: 'ASCENDING' },
      { fieldPath: 'createdAt', order: 'DESCENDING' },
    ])).toBe(true);
    expect(hasIndex('user_verifications', [
      { fieldPath: 'userId', order: 'ASCENDING' },
      { fieldPath: 'subjectType', order: 'ASCENDING' },
      { fieldPath: 'status', order: 'ASCENDING' },
    ])).toBe(true);
  });

  it('covers canonical Phase 2 profile, brief, marketplace, proposal, and appointment collections', () => {
    for (const collection of [
      'role_profiles',
      'project_briefs',
      'project_attachments',
      'brief_interpretations',
      'marketplace_opportunities',
      'proposals',
      'proposal_comparisons',
      'appointments',
      'project_stage_history',
    ]) {
      expect(rules).toContain(`match /${collection}/`);
      expect(indexes.indexes.some((index) => index.collectionGroup === collection)).toBe(true);
    }

    expect(rules).toContain("!('verificationStatus' in request.resource.data)");
    expect(rules).toContain("resource.data.status == 'published' && (hasRole('architect') || hasRole('bep'))");
    expect(rules).toContain('request.resource.data.humanReviewRequired == true');
    expect(rules).toContain('match /proposal_comparisons/{comparisonId}');
    expect(rules).toContain('match /appointments/{appointmentId}');
    expect(rules).toContain('allow create, update, delete: if false;');
  });

  it('keeps Firestore indexes aligned with canonical Phase 2 workflow queries', () => {
    expect(hasIndex('project_briefs', [
      { fieldPath: 'clientId', order: 'ASCENDING' },
      { fieldPath: 'status', order: 'ASCENDING' },
      { fieldPath: 'updatedAt', order: 'DESCENDING' },
    ])).toBe(true);
    expect(hasIndex('marketplace_opportunities', [
      { fieldPath: 'status', order: 'ASCENDING' },
      { fieldPath: 'updatedAt', order: 'DESCENDING' },
    ])).toBe(true);
    expect(hasIndex('proposals', [
      { fieldPath: 'opportunityId', order: 'ASCENDING' },
      { fieldPath: 'status', order: 'ASCENDING' },
      { fieldPath: 'updatedAt', order: 'DESCENDING' },
    ])).toBe(true);
    expect(hasIndex('appointments', [
      { fieldPath: 'clientId', order: 'ASCENDING' },
      { fieldPath: 'status', order: 'ASCENDING' },
      { fieldPath: 'updatedAt', order: 'DESCENDING' },
    ])).toBe(true);
  });

  it('documents human-only AI signoff controls and verification recheck persistence', () => {
    expect(aiGovernanceDocs).toContain('AI and system actors cannot create human sign-off records');
    expect(aiGovernanceDocs).toContain('requiresHumanConfirmation');
    expect(phase2VerificationDocs).toContain('verificationAgentStatus: queued');
    expect(phase2VerificationDocs).toContain('recheckRequestedAt');
  });

});
