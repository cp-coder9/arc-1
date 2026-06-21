import { describe, expect, it } from 'vitest';
import {
  canMutateDocument,
  revisionChainForDocument,
  revisionFindings,
  supersededConstructionDrawings,
} from '../revisionControlService';
import { sampleDocuments, sampleDrawings, sampleRevisions } from '../sampleDocumentData';
import type { DocumentRecord } from '@/types/documentTypes';

describe('revisionControlService', () => {
  it('detects superseded construction drawings', () => {
    const superseded = supersededConstructionDrawings(sampleDrawings);
    expect(superseded.length).toBe(1);
    expect(superseded[0].drawingNumber).toBe('A-102');
    expect(superseded[0].issuePurpose).toBe('for_construction');
  });

  it('builds ordered revision chain for a document', () => {
    const chain = revisionChainForDocument('doc-a102', sampleRevisions);
    expect(chain.length).toBe(1);
    expect(chain[0].revisionCode).toBe('B');
    expect(chain[0].status).toBe('superseded');
  });

  it.each([
    ['draft', true],
    ['pending_review', true],
    ['approved', false],
    ['issued', false],
    ['superseded', false],
    ['rejected', false],
  ] as const)('canMutateDocument returns %s for status %s', (status, expected) => {
    const doc = { ...sampleDocuments[0], status } as DocumentRecord;
    expect(canMutateDocument(doc)).toBe(expected);
  });

  it('generates findings from superseded construction drawings', () => {
    const findings = revisionFindings(sampleDrawings);
    expect(findings.length).toBe(1);
    expect(findings[0].code).toBe('SUPERSEDED_CONSTRUCTION_DRAWING');
    expect(findings[0].priority).toBe('high');
    expect(findings[0].message).toContain('A-102');
    expect(findings[0].assignedRoles).toContain('contractor');
  });
});
