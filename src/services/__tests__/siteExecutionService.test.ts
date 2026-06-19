/**
 * Site Execution Integration Orchestrator Tests
 *
 * Tests the full field-control acceptance test scenario from the pack:
 *   daily log → evidence → RFI → response → site instruction → NCR
 *   → snag → inspection → delay warning → payment blocker
 *   → ProjectRecords → inbox events → agent recommendations
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as firestore from 'firebase/firestore';
import type { UserRole } from '../../types';

const handleFirestoreErrorMock = vi.fn((error: unknown) => { throw error; });
const addDocMock = vi.mocked(firestore.addDoc) as any;
const collectionMock = vi.mocked(firestore.collection) as any;
const docMock = vi.mocked(firestore.doc) as any;
const getDocsMock = vi.mocked(firestore.getDocs) as any;
const updateDocMock = vi.mocked(firestore.updateDoc) as any;
const runTransactionMock = vi.mocked(firestore.runTransaction) as any;
const orderByMock = vi.mocked(firestore.orderBy) as any;
const queryMock = vi.mocked(firestore.query) as any;
const onSnapshotMock = vi.mocked(firestore.onSnapshot) as any;

vi.mock('@/lib/firebase', () => ({
  db: { name: 'mock-db' },
  OperationType: {
    CREATE: 'create',
    UPDATE: 'update',
    DELETE: 'delete',
    LIST: 'list',
    GET: 'get',
    WRITE: 'write',
  },
  handleFirestoreError: handleFirestoreErrorMock,
}));

// Successive doc IDs for deterministic test assertions
let mockDocCounter = 0;

describe('siteExecutionOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDocCounter = 0;

    collectionMock.mockImplementation((_db: unknown, ...path: string[]) => ({ type: 'collection', path }));
    docMock.mockImplementation((_dbOrRef: any, ...path: string[]) => {
      if (_dbOrRef?.type === 'collection') {
        const id = `generated-doc-${++mockDocCounter}`;
        return { type: 'doc', path: [..._dbOrRef.path, id], id };
      }
      return { type: 'doc', path, id: path[path.length - 1] };
    });
    addDocMock.mockImplementation((_col: any) => Promise.resolve({ id: `add-doc-${++mockDocCounter}` }));
    updateDocMock.mockResolvedValue(undefined);
    orderByMock.mockImplementation((f: string, d: string) => ({ field: f, direction: d }));
    queryMock.mockImplementation((ref: unknown, ...constraints: unknown[]) => ({ ref, constraints }));

    // Mock runTransaction for NCR corrective action, snag transitions, and instruction state machine
    // Dynamic mock that returns appropriate state based on the collection being accessed
    runTransactionMock.mockImplementation(async (_db: unknown, runner: (tx: any) => Promise<void>) => {
      const tx = {
        get: vi.fn().mockImplementation((docRef: any) => {
          const rawPath = docRef?.path ?? [];
          const path = rawPath.length === 1 && typeof rawPath[0] === 'string'
            ? rawPath[0].split('/')
            : rawPath;
          const collection = path[path.length - 2] ?? '';
          // RFI counter doc (under _meta)
          const isCounter = path[path.length - 2] === '_meta';
          // Snag documents: need status 'allocated' for ready_for_reinspection transition
          const isSnag = collection === 'snags';
          // Site instruction documents: need status 'issued', authorised true for acknowledge
          const isInstruction = collection === 'site_instructions';
          return Promise.resolve({
            exists: () => true,
            data: () => ({
              lastNumber: isCounter ? 7 : undefined,
              status: isSnag ? 'allocated' : isInstruction ? 'issued' : 'open',
              authorised: isInstruction ? true : false,
              blocksPayment: true,
            }),
          });
        }),
        set: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
      };
      await runner(tx);
    });
  });

  it('executes the full acceptance-test scenario and emits records, inbox events, and recommendations', { timeout: 30000 }, async () => {
    const { executeSiteExecutionScenario } = await import('../siteExecutionService');

    const ctx = {
      tenantId: 'tenant-architex-demo',
      projectId: 'project-site-exec-001',
      jobId: 'job-001',
      actorId: 'user-principal-agent-001',
      actorRole: 'architect' as UserRole,
    };

    const result = await executeSiteExecutionScenario({
      ctx,
      evidenceItems: [
        { type: 'photo', title: 'Slab conflict photo', uri: 'architex://files/slab.jpg', location: 'Level 1 B3' },
        { type: 'delivery_note', title: 'Brick delivery note', uri: 'architex://files/brick.pdf', location: 'Site gate' },
      ],
      dailyLog: {
        date: '2026-06-09',
        weather: 'clear_morning_rain_afternoon' as any,
        weatherDetail: 'Clear morning, light rain afternoon',
        workDescription: 'Brickwork and services first fix',
        labourOnSite: { main_contractor: 12, brickwork_subcontractor: 6 },
        plantOnSite: ['mobile crane', 'concrete mixer'],
        deliveries: ['face bricks', 'electrical conduit'],
        visitors: ['architect', 'client representative'],
        safetyNotes: ['Toolbox talk completed'],
        delayNotes: ['Rain affected afternoon brickwork'],
      },
      rfi: {
        subject: 'Conflict between slab penetration and electrical route',
        question: 'Confirm conduit reroute around beam zone A-210 Rev C.',
        requestedBy: 'contractor-1',
        assignedTo: 'architect-1',
        priority: 'high',
      },
      rfiResponse: {
        answer: 'Reroute conduit along grid B and coordinate with structural engineer.',
        responderId: 'architect-1',
        requiresInstruction: true,
      },
      siteInstruction: {
        title: 'Reroute conduit at Level 1 grid B3',
        instruction: 'Proceed with reroute subject to structural engineer confirmation.',
        issuedByRole: 'architect',
        costImpact: 'possible',
        timeImpact: 'possible',
      },
      ncr: {
        title: 'Unapproved beam chase observed',
        severity: 'high',
        responsiblePartyId: 'sub-1',
        correctiveAction: 'Stop work; submit method statement.',
      },
      snag: {
        location: 'Level 1 passage',
        description: 'Patch finish around rerouted conduit incomplete',
        priority: 'medium',
        responsiblePartyId: 'sub-1',
      },
      inspection: {
        inspectionType: 'structural',
        findings: ['No further chasing without written method statement'],
        followUps: ['Contractor to submit method statement'],
        signOffRequired: true,
      },
      delayWarning: {
        cause: 'weather',
        description: 'Rain and coordination hold affecting brickwork sequence.',
        likelyProgrammeImpactDays: 2,
      },
    });

    // Verify core identifiers
    expect(result.dailyLogId).toBeTruthy();
    expect(result.evidenceIds).toHaveLength(2);
    expect(result.rfiId).toBeTruthy();
    expect(result.siteInstructionId).toBeTruthy();
    expect(result.ncrId).toBeTruthy();
    expect(result.snagId).toBeTruthy();
    expect(result.inspectionId).toBeTruthy();
    expect(result.warningId).toBeTruthy();
    expect(result.programmeImpactId).toBeTruthy();

    // Verify state
    expect(result.rfiStatus).toBe('responded');
    expect(result.instructionStatus).toBe('acknowledged');
    expect(result.ncrStatus).toBe('open');
    expect(result.ncrBlocksPayment).toBe(true); // high severity
    expect(result.snagStatus).toBe('ready_for_reinspection');
    expect(result.snagBlocksPayment).toBe(false); // medium priority
    expect(result.inspectionStatus).toBe('requires_follow_up'); // has followUps
    expect(result.warningStatus).toBe('notice_required');
    expect(result.requiresPlannerReview).toBe(true);

    // Verify payment blockers (NCR is high → blocker created)
    expect(result.paymentBlockers.length).toBe(1);
    expect(result.paymentBlockers[0].reason).toContain('NCR');

    // Verify ProjectRecords
    expect(result.projectRecords.length).toBe(8);
    expect(result.projectRecords.map((r) => r.recordType)).toEqual([
      'daily_log', 'rfi', 'site_instruction', 'non_conformance_report',
      'snag_item', 'inspection_record', 'delay_early_warning', 'programme_impact',
    ]);

    // Verify inbox events
    expect(result.inboxEvents.length).toBe(3);
    expect(result.inboxEvents[0].recipientRole).toBe('contractor');
    expect(result.inboxEvents[1].recipientRole).toBe('architect');

    // Verify agent recommendations
    // rfi requiresInstruction=true → 1 rec, ncr high → 1 rec, warning impact > 0 → 1 rec, blockers > 0 → 1 rec
    expect(result.agentRecommendations.length).toBe(4);
    expect(result.agentRecommendations[0].agentKey).toBe('site_execution_agent');

    // Verify summary
    expect(result.summary.projectId).toBe('project-site-exec-001');
    expect(result.summary.evidenceCount).toBe(2);
    expect(result.summary.dailyLogStatus).toBe('submitted');
    expect(result.summary.rfiStatus).toBe('responded');
    expect(result.summary.activeBlockers).toBe(1);
    expect(result.summary.projectRecords).toBe(8);
    expect(result.summary.inboxEvents).toBe(3);
    expect(result.summary.recommendations).toBe(4);
  });

  it('does not create payment blockers for low-severity items', { timeout: 30000 }, async () => {
    const { executeSiteExecutionScenario } = await import('../siteExecutionService');

    const ctx = {
      tenantId: 'tenant-1',
      projectId: 'project-1',
      actorId: 'user-1',
      actorRole: 'architect' as UserRole,
    };

    const result = await executeSiteExecutionScenario({
      ctx,
      evidenceItems: [],
      dailyLog: { date: '2026-06-09', weather: 'sunny', workDescription: 'Work' },
      rfi: { subject: 'Q', question: '?', requestedBy: 'c-1', assignedTo: 'a-1' },
      rfiResponse: { answer: 'A', responderId: 'a-1', requiresInstruction: false },
      siteInstruction: { title: 'Inst', instruction: 'Do', issuedByRole: 'architect' },
      ncr: { title: 'Minor NCR', severity: 'low', responsiblePartyId: 's-1' },
      snag: { location: 'Room', description: 'Minor snag', priority: 'low', responsiblePartyId: 's-1' },
      inspection: { inspectionType: 'progress', findings: [], followUps: [] },
      delayWarning: { cause: 'unknown', description: 'Test', likelyProgrammeImpactDays: 0 },
    });

    expect(result.paymentBlockers).toHaveLength(0);
    expect(result.warningStatus).toBe('recorded');
    expect(result.requiresPlannerReview).toBe(false);
    // Only one rec: the delay warning no longer triggers when impact is 0
    // rfi requiresInstruction=false → no rec, ncr low → no rec, snag low → no rec, no blockers
    expect(result.agentRecommendations).toHaveLength(0);
  });
});
