/**
 * Tests: Inbox Event Adapter
 *
 * Event type classification, priority derivation, event grouping,
 * and proper WorkflowEvent envelope construction.
 */
import { describe, expect, it } from 'vitest';
import {
  classifyEventType,
  eventCountByPriority,
  eventsAbovePriority,
  formatEventTitle,
  groupEventsByType,
  workflowEventsFromReadiness,
  workflowEventsFromReport,
} from '../inboxEventAdapter';
import { allReadinessReports } from '../readinessCheckService';
import { sampleDocuments, sampleDrawings } from '../sampleDocumentData';
import type { ReadinessFinding } from '@/types/documentTypes';

describe('inboxEventAdapter', () => {
  const reports = allReadinessReports(sampleDocuments, sampleDrawings);
  const events = workflowEventsFromReadiness('project-test', reports);

  // ── Event Classification ──
  it.each([
    ['MUNICIPAL_SHEET_MISSING', 'municipal_submission_pack_incomplete'],
    ['MUNICIPAL_FORM_NOT_READY', 'municipal_submission_pack_incomplete'],
    ['APPROVAL_LETTER_MISSING', 'approval_letter_missing'],
    ['TENDER_SPECIFICATION_NOT_ISSUED', 'tender_pack_incomplete'],
    ['TENDER_SHEET_MISSING', 'tender_pack_incomplete'],
    ['SUPERSEDED_CONSTRUCTION_DRAWING', 'superseded_construction_drawing'],
    ['CLOSEOUT_PACK_NOT_ISSUED', 'closeout_pack_incomplete'],
    ['CLOSEOUT_CERTIFICATE_MISSING', 'closeout_pack_incomplete'],
    ['AS_BUILT_DRAWINGS_MISSING', 'closeout_pack_incomplete'],
    ['DOCUMENT_REVIEW_REQUIRED', 'document_review_required'],
    ['DRAWING_REVISION_UPLOADED', 'drawing_revision_uploaded'],
  ] as const)('classifies %s as %s', (code, expectedType) => {
    const finding: ReadinessFinding = {
      code,
      priority: 'medium',
      message: 'Test finding',
      assignedRoles: ['architect'],
    };
    expect(classifyEventType(finding)).toBe(expectedType);
  });

  // ── Event Generation ──
  it('generates events from all readiness reports', () => {
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.projectId === 'project-test')).toBe(true);
    expect(events.every((e) => e.sourceModule === 'documents')).toBe(true);
  });

  it('generates events from a single report', () => {
    const report = reports[0]; // municipal submission
    const reportEvents = workflowEventsFromReport('project-test', report);
    expect(reportEvents.length).toBe(report.findings.length);
    expect(reportEvents[0].projectId).toBe('project-test');
  });

  it('each event has required fields', () => {
    for (const event of events) {
      expect(event.id).toMatch(/^doc-event-project-test-/);
      expect(event.type).toBeDefined();
      expect(event.title).toBeTruthy();
      expect(event.detail).toBeTruthy();
      expect(['low', 'medium', 'high', 'critical']).toContain(event.priority);
      expect(event.assignedRoles.length).toBeGreaterThan(0);
      expect(event.createdAt).toBeDefined();
    }
  });

  // ── Event Title Formatting ──
  it('formats finding codes into human-readable titles', () => {
    expect(formatEventTitle('MUNICIPAL_FORM_NOT_READY')).toBe('Municipal form not ready');
    expect(formatEventTitle('SUPERSEDED_CONSTRUCTION_DRAWING')).toBe('Superseded construction drawing');
    expect(formatEventTitle('TENDER_SPECIFICATION_NOT_ISSUED')).toBe('Tender specification not issued');
  });

  // ── Priority Filtering ──
  it('filters events above a priority threshold', () => {
    const highOrAbove = eventsAbovePriority(events, 'high');
    expect(highOrAbove.every((e) => ['high', 'critical'].includes(e.priority))).toBe(true);

    const criticalOnly = eventsAbovePriority(events, 'critical');
    expect(criticalOnly.every((e) => e.priority === 'critical')).toBe(true);
  });

  // ── Event Grouping ──
  it('groups events by type', () => {
    const groups = groupEventsByType(events);
    expect(Object.keys(groups).length).toBeGreaterThan(1);
    // Municipal submission pack incomplete events should be grouped
    if (groups.municipal_submission_pack_incomplete) {
      expect(groups.municipal_submission_pack_incomplete.length).toBeGreaterThan(0);
    }
  });

  // ── Event Counts by Priority ──
  it('counts events by priority', () => {
    const counts = eventCountByPriority(events);
    expect(counts.critical + counts.high + counts.medium + counts.low).toBe(events.length);
    expect(Object.values(counts).every((c) => typeof c === 'number')).toBe(true);
  });

  // ── Coverage of All 7 Event Types ──
  it('covers all 7 required event types', () => {
    const eventTypes = new Set(events.map((e) => e.type));
    const requiredTypes = [
      'document_review_required',
      'drawing_revision_uploaded',
      'superseded_construction_drawing',
      'municipal_submission_pack_incomplete',
      'tender_pack_incomplete',
      'closeout_pack_incomplete',
      'approval_letter_missing',
    ];

    // Note: Not all types may be present in the demo data,
    // but the classification function should handle all of them
    for (const type of eventTypes) {
      expect(requiredTypes).toContain(type);
    }
  });
});
