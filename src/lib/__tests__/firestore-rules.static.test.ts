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

});
