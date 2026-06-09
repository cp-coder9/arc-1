/**
 * Tests: Revision Control State Machine
 *
 * Core rules:
 * - Draft documents may be updated
 * - Issued documents must be revised (not mutated)
 * - Revisions link to previous via supersedesRevisionId
 * - Superseded revisions remain visible in audit trail
 * - Construction users alerted when drawings they rely on are superseded
 */
import { describe, expect, it } from 'vitest';
import {
  allSupersededDrawings,
  auditTrailFromRevisions,
  canMutateDocument,
  constructionAlertMessage,
  createRevision,
  findSupersedingRevision,
  latestRevision,
  mustReviseDocument,
  mutationRuleForStatus,
  revisionChainForDocument,
  revisionFindings,
  shouldAlertConstructionUsers,
  supersedeDocument,
  supersedeRevision,
  supersededConstructionDrawings,
  supersessionChain,
} from '../revisionControlService';
import { sampleDocuments, sampleDrawings, sampleRevisions } from '../sampleDocumentData';
import type { DocumentRecord } from '@/types/documentTypes';

describe('revisionControlService', () => {
  // ── Superseded Drawing Detection ──
  it('detects superseded construction drawings', () => {
    const superseded = supersededConstructionDrawings(sampleDrawings);
    expect(superseded.length).toBe(1);
    expect(superseded[0].drawingNumber).toBe('A-102');
    expect(superseded[0].issuePurpose).toBe('for_construction');
  });

  it('returns all superseded drawings regardless of purpose', () => {
    const all = allSupersededDrawings(sampleDrawings);
    expect(all.length).toBe(1);
  });

  // ── Revision Chain ──
  it('builds ordered revision chain for a document', () => {
    const chain = revisionChainForDocument('doc-a102', sampleRevisions);
    expect(chain.length).toBe(1);
    expect(chain[0].revisionCode).toBe('B');
    expect(chain[0].status).toBe('superseded');
  });

  it('finds the latest revision', () => {
    const latest = latestRevision('doc-a102', sampleRevisions);
    expect(latest).toBeDefined();
    expect(latest!.revisionCode).toBe('B');
  });

  it('finds superseding revision', () => {
    const successor = findSupersedingRevision('rev-a102-b', sampleRevisions);
    expect(successor).toBeDefined();
    expect(successor!.revisionId).toBe('rev-a102-c');
    expect(successor!.supersedesRevisionId).toBe('rev-a102-b');
  });

  it('builds full supersession chain', () => {
    const chain = supersessionChain('rev-a102-b', sampleRevisions);
    expect(chain.length).toBe(2);
    expect(chain[0].revisionId).toBe('rev-a102-b');
    expect(chain[1].revisionId).toBe('rev-a102-c');
  });

  // ── Mutation Guards ──
  it.each([
    ['draft', true],
    ['pending_review', true],
    ['approved', false],
    ['issued', false],
    ['superseded', false],
    ['rejected', true],
  ] as const)('canMutateDocument returns %s for status %s', (status, expected) => {
    const doc = { ...sampleDocuments[0], status } as DocumentRecord;
    expect(canMutateDocument(doc)).toBe(expected);
  });

  it('mustReviseDocument is opposite of canMutateDocument', () => {
    const draft = { ...sampleDocuments[0], status: 'draft' } as DocumentRecord;
    const issued = { ...sampleDocuments[0], status: 'issued' } as DocumentRecord;
    expect(mustReviseDocument(draft)).toBe(false);
    expect(mustReviseDocument(issued)).toBe(true);
  });

  it('provides correct mutation rules per status', () => {
    expect(mutationRuleForStatus('draft').canMutate).toBe(true);
    expect(mutationRuleForStatus('issued').canMutate).toBe(false);
    expect(mutationRuleForStatus('issued').description).toContain('immutable');
    expect(mutationRuleForStatus('superseded').canMutate).toBe(false);
  });

  // ── Create / Supersede Revisions ──
  it('creates a new revision that supersedes the previous', () => {
    const rev = createRevision({
      documentId: 'doc-a100',
      previousRevisionId: 'rev-a100-b',
      revisionCode: 'C',
      issuePurpose: 'for_construction',
      authorUserId: 'u-architect-001',
      reviewerUserId: 'u-architect-002',
      notes: 'Updated for construction.',
    });

    expect(rev.status).toBe('pending_review');
    expect(rev.supersedesRevisionId).toBe('rev-a100-b');
    expect(rev.revisionCode).toBe('C');
    expect(rev.issuedAt).toBeDefined();
  });

  it('supersedes a revision by linking to the new one', () => {
    const original = sampleRevisions[0]; // rev-a100-b
    const updated = supersedeRevision(original, 'rev-a100-c');

    expect(updated.status).toBe('superseded');
    expect(updated.supersededByRevisionId).toBe('rev-a100-c');
    expect(updated.revisionCode).toBe('B'); // code unchanged
  });

  it('supersedes a document and links to new revision', () => {
    const doc = sampleDocuments[0]; // issued
    const updated = supersedeDocument(doc, 'rev-a100-c');

    expect(updated.status).toBe('superseded');
    expect(updated.currentRevisionId).toBe('rev-a100-c');
  });

  // ── Findings ──
  it('generates findings from superseded construction drawings', () => {
    const findings = revisionFindings(sampleDrawings);
    expect(findings.length).toBe(1);
    expect(findings[0].code).toBe('SUPERSEDED_CONSTRUCTION_DRAWING');
    expect(findings[0].priority).toBe('high');
    expect(findings[0].message).toContain('A-102');
    expect(findings[0].assignedRoles).toContain('contractor');
  });

  // ── Audit Trail ──
  it('builds audit trail from revisions', () => {
    const trail = auditTrailFromRevisions(sampleRevisions);
    expect(trail.length).toBe(4);
    expect(trail[0]).toHaveProperty('revisionId');
    expect(trail[0]).toHaveProperty('action');
    expect(trail[0]).toHaveProperty('timestamp');

    // The superseding revision (rev-a102-c) should note the supersession
    const superseding = trail.find((t) => t.action.includes('Supersedes'));
    expect(superseding).toBeDefined();
    expect(superseding!.revisionCode).toBe('C');
    expect(superseding!.action).toContain('rev-a102-b');
  });

  // ── Construction Alerts ──
  it('detects when construction user alert is needed', () => {
    expect(shouldAlertConstructionUsers(sampleDrawings)).toBe(true);
  });

  it('builds construction alert message', () => {
    const message = constructionAlertMessage(sampleDrawings);
    expect(message).not.toBeNull();
    expect(message).toContain('A-102');
    expect(message).toContain('superseded');
    expect(message).toContain('must not be used for construction');
  });

  it('returns null alert when no superseded construction drawings', () => {
    const noSuperseded = sampleDrawings.filter(
      (d) => d.status !== 'superseded',
    );
    expect(constructionAlertMessage(noSuperseded)).toBeNull();
  });
});
