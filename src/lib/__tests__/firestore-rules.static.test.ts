import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');

describe('firestore security rules static regressions', () => {
  it('keeps audit logs append-only and admin-readable', () => {
    expect(rules).toContain('match /audit_logs/{auditId}');
    expect(rules).toContain('allow read: if isAdmin();');
    expect(rules).toContain('allow create: if isAuthenticated() && request.resource.data.immutable == true;');
    expect(rules).toContain('allow update, delete: if false;');
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
    expect(rules).toContain("hasRole('contractor') || hasRole('subcontractor')");
    expect(rules).toContain('function isActiveContractorBidVerification(verificationId)');
    expect(rules).toContain('isActiveContractorBidVerification(request.resource.data.verificationId)');
    expect(rules).toContain("'verificationId'");
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

});
