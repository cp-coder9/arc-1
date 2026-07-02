/**
 * Unit Tests for Conditions of Approval Register Service
 *
 * Tests condition creation, status transitions, evidence/waiver enforcement,
 * compliance checking, summary calculation, overdue detection, and passport update.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createCondition,
  updateConditionStatus,
  isConditionsCompliant,
  getConditionsSummary,
  checkOverdueConditions,
  updatePassportOnComplete,
  exposeToReadinessAdapter,
  CONDITION_STATUS_TRANSITIONS,
  type ConditionActor,
  type ConditionDeps,
  type ConditionAuditFn,
  type PassportUpdateFn,
  type ReadinessAdapterFn,
} from '../services/conditionsRegister';
import type { FirestoreDB } from '../services/municipalityConfig';
import type { ConditionStatus } from '../types';

// ─── Mock Helpers ────────────────────────────────────────────────────────────

function createMockDb(existingCondition: Record<string, unknown> | null = null): FirestoreDB {
  let addCounter = 0;

  const mockDocRef = {
    get: vi.fn().mockResolvedValue({
      exists: existingCondition !== null,
      id: 'cond-001',
      data: () => existingCondition,
    }),
    set: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
  };

  return {
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue(mockDocRef),
      add: vi.fn().mockImplementation(() => {
        addCounter++;
        return Promise.resolve({ id: `cond-${addCounter}` });
      }),
      get: vi.fn().mockResolvedValue({ docs: [], empty: true }),
    }),
  };
}

function createMockDbWithConditions(conditions: Array<{ id: string; data: Record<string, unknown> }>): FirestoreDB {
  const docs = conditions.map((c) => ({
    exists: true,
    id: c.id,
    data: () => c.data,
  }));

  return {
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockImplementation((id: string) => {
        const found = conditions.find((c) => c.id === id);
        return {
          get: vi.fn().mockResolvedValue({
            exists: !!found,
            id: found?.id ?? id,
            data: () => found?.data ?? null,
          }),
          set: vi.fn().mockResolvedValue(undefined),
          update: vi.fn().mockResolvedValue(undefined),
        };
      }),
      add: vi.fn().mockResolvedValue({ id: 'new-cond' }),
      get: vi.fn().mockResolvedValue({ docs, empty: docs.length === 0 }),
    }),
  };
}

const actor: ConditionActor = { id: 'user-001', role: 'town_planner' };

function createDeps(db: FirestoreDB): ConditionDeps {
  return {
    db,
    auditFn: vi.fn().mockResolvedValue(undefined) as unknown as ConditionAuditFn,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Conditions Register — createCondition', () => {
  it('creates a condition with initial status outstanding', async () => {
    const db = createMockDb();
    const deps = createDeps(db);

    const result = await createCondition(
      'app-001', 'proj-001',
      {
        conditionNumber: 1,
        description: 'Submit engineering services report',
        responsibleParty: 'Applicant',
        deadline: '2025-09-01',
      },
      actor,
      deps
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('outstanding');
      expect(result.data.conditionNumber).toBe(1);
      expect(result.data.description).toBe('Submit engineering services report');
      expect(result.data.evidenceDocuments).toEqual([]);
    }
  });

  it('rejects invalid input (missing description)', async () => {
    const db = createMockDb();
    const deps = createDeps(db);

    const result = await createCondition(
      'app-001', 'proj-001',
      { conditionNumber: 1 }, // missing description
      actor,
      deps
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Validation failed');
    }
  });

  it('creates audit record on creation', async () => {
    const db = createMockDb();
    const deps = createDeps(db);

    await createCondition(
      'app-001', 'proj-001',
      { conditionNumber: 2, description: 'Test condition' },
      actor,
      deps
    );

    expect(deps.auditFn).toHaveBeenCalledTimes(1);
    expect(deps.auditFn).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'condition_created',
        applicationId: 'app-001',
        projectId: 'proj-001',
      })
    );
  });
});

describe('Conditions Register — updateConditionStatus', () => {
  it('transitions outstanding → in_progress', async () => {
    const db = createMockDb({
      status: 'outstanding',
      applicationId: 'app-001',
      conditionNumber: 1,
      description: 'Test',
      evidenceDocuments: [],
    });
    const deps = createDeps(db);

    const result = await updateConditionStatus(
      'cond-001', 'app-001', 'proj-001', 'in_progress', {}, actor, deps
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('in_progress');
    }
  });

  it('transitions in_progress → fulfilled with evidence', async () => {
    const db = createMockDb({
      status: 'in_progress',
      applicationId: 'app-001',
      conditionNumber: 1,
      description: 'Test',
      evidenceDocuments: [],
    });
    const deps = createDeps(db);

    const result = await updateConditionStatus(
      'cond-001', 'app-001', 'proj-001', 'fulfilled',
      { evidenceDocIds: ['doc-001', 'doc-002'] },
      actor, deps
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('fulfilled');
      expect(result.data.evidenceDocuments).toContain('doc-001');
      expect(result.data.evidenceDocuments).toContain('doc-002');
    }
  });

  it('rejects fulfilled without evidence', async () => {
    const db = createMockDb({
      status: 'in_progress',
      applicationId: 'app-001',
      conditionNumber: 1,
      description: 'Test',
      evidenceDocuments: [],
    });
    const deps = createDeps(db);

    const result = await updateConditionStatus(
      'cond-001', 'app-001', 'proj-001', 'fulfilled',
      { evidenceDocIds: [] },
      actor, deps
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('at least 1 evidence document');
    }
  });

  it('transitions outstanding → waived with waiver reference and reason', async () => {
    const db = createMockDb({
      status: 'outstanding',
      applicationId: 'app-001',
      conditionNumber: 1,
      description: 'Test',
      evidenceDocuments: [],
    });
    const deps = createDeps(db);

    const result = await updateConditionStatus(
      'cond-001', 'app-001', 'proj-001', 'waived',
      { waiverReference: 'WAV-2025-001', waiverReason: 'Not applicable to this site' },
      actor, deps
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('waived');
      expect(result.data.waiverReference).toBe('WAV-2025-001');
      expect(result.data.waiverReason).toBe('Not applicable to this site');
    }
  });

  it('rejects waived without waiver reference', async () => {
    const db = createMockDb({
      status: 'outstanding',
      applicationId: 'app-001',
      conditionNumber: 1,
      description: 'Test',
      evidenceDocuments: [],
    });
    const deps = createDeps(db);

    const result = await updateConditionStatus(
      'cond-001', 'app-001', 'proj-001', 'waived',
      { waiverReason: 'reason but no reference' },
      actor, deps
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('waiver reference');
    }
  });

  it('rejects waived without waiver reason', async () => {
    const db = createMockDb({
      status: 'outstanding',
      applicationId: 'app-001',
      conditionNumber: 1,
      description: 'Test',
      evidenceDocuments: [],
    });
    const deps = createDeps(db);

    const result = await updateConditionStatus(
      'cond-001', 'app-001', 'proj-001', 'waived',
      { waiverReference: 'WAV-001' },
      actor, deps
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('waiver reason');
    }
  });

  it('rejects reverse from fulfilled (terminal state)', async () => {
    const db = createMockDb({
      status: 'fulfilled',
      applicationId: 'app-001',
      conditionNumber: 1,
      description: 'Test',
      evidenceDocuments: ['doc-001'],
    });
    const deps = createDeps(db);

    const result = await updateConditionStatus(
      'cond-001', 'app-001', 'proj-001', 'outstanding', {}, actor, deps
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('terminal state');
    }
  });

  it('rejects reverse from waived (terminal state)', async () => {
    const db = createMockDb({
      status: 'waived',
      applicationId: 'app-001',
      conditionNumber: 1,
      description: 'Test',
      evidenceDocuments: [],
      waiverReference: 'WAV-001',
      waiverReason: 'Not needed',
    });
    const deps = createDeps(db);

    const result = await updateConditionStatus(
      'cond-001', 'app-001', 'proj-001', 'outstanding', {}, actor, deps
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('terminal state');
    }
  });

  it('returns error when condition not found', async () => {
    const db = createMockDb(null);
    const deps = createDeps(db);

    const result = await updateConditionStatus(
      'nonexistent', 'app-001', 'proj-001', 'in_progress', {}, actor, deps
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('not found');
    }
  });
});

describe('Conditions Register — isConditionsCompliant', () => {
  it('returns false when no conditions exist', async () => {
    const db = createMockDbWithConditions([]);
    const result = await isConditionsCompliant('app-001', 'proj-001', db);
    expect(result).toBe(false);
  });

  it('returns true when all conditions are fulfilled', async () => {
    const db = createMockDbWithConditions([
      { id: 'c1', data: { status: 'fulfilled' } },
      { id: 'c2', data: { status: 'fulfilled' } },
    ]);
    const result = await isConditionsCompliant('app-001', 'proj-001', db);
    expect(result).toBe(true);
  });

  it('returns true when all conditions are waived', async () => {
    const db = createMockDbWithConditions([
      { id: 'c1', data: { status: 'waived' } },
      { id: 'c2', data: { status: 'waived' } },
    ]);
    const result = await isConditionsCompliant('app-001', 'proj-001', db);
    expect(result).toBe(true);
  });

  it('returns true when mix of fulfilled and waived', async () => {
    const db = createMockDbWithConditions([
      { id: 'c1', data: { status: 'fulfilled' } },
      { id: 'c2', data: { status: 'waived' } },
      { id: 'c3', data: { status: 'fulfilled' } },
    ]);
    const result = await isConditionsCompliant('app-001', 'proj-001', db);
    expect(result).toBe(true);
  });

  it('returns false when any condition is outstanding', async () => {
    const db = createMockDbWithConditions([
      { id: 'c1', data: { status: 'fulfilled' } },
      { id: 'c2', data: { status: 'outstanding' } },
    ]);
    const result = await isConditionsCompliant('app-001', 'proj-001', db);
    expect(result).toBe(false);
  });

  it('returns false when any condition is in_progress', async () => {
    const db = createMockDbWithConditions([
      { id: 'c1', data: { status: 'fulfilled' } },
      { id: 'c2', data: { status: 'in_progress' } },
    ]);
    const result = await isConditionsCompliant('app-001', 'proj-001', db);
    expect(result).toBe(false);
  });
});

describe('Conditions Register — getConditionsSummary', () => {
  it('returns zero counts when no conditions', async () => {
    const db = createMockDbWithConditions([]);
    const summary = await getConditionsSummary('app-001', 'proj-001', db);
    expect(summary).toEqual({
      total: 0,
      outstanding: 0,
      inProgress: 0,
      fulfilled: 0,
      waived: 0,
      overdue: 0,
    });
  });

  it('correctly counts each status', async () => {
    const db = createMockDbWithConditions([
      { id: 'c1', data: { status: 'outstanding', deadline: '2030-12-01' } },
      { id: 'c2', data: { status: 'in_progress', deadline: '2030-12-01' } },
      { id: 'c3', data: { status: 'fulfilled' } },
      { id: 'c4', data: { status: 'waived' } },
      { id: 'c5', data: { status: 'outstanding', deadline: '2030-12-01' } },
    ]);

    const summary = await getConditionsSummary('app-001', 'proj-001', db);

    expect(summary.total).toBe(5);
    expect(summary.outstanding).toBe(2);
    expect(summary.inProgress).toBe(1);
    expect(summary.fulfilled).toBe(1);
    expect(summary.waived).toBe(1);
  });

  it('counts overdue conditions (deadline passed, not fulfilled/waived)', async () => {
    const db = createMockDbWithConditions([
      { id: 'c1', data: { status: 'outstanding', deadline: '2020-01-01' } },
      { id: 'c2', data: { status: 'in_progress', deadline: '2020-06-01' } },
      { id: 'c3', data: { status: 'fulfilled', deadline: '2020-01-01' } }, // not overdue, fulfilled
      { id: 'c4', data: { status: 'waived', deadline: '2020-01-01' } }, // not overdue, waived
      { id: 'c5', data: { status: 'outstanding' } }, // no deadline, not overdue
    ]);

    const summary = await getConditionsSummary('app-001', 'proj-001', db);
    expect(summary.overdue).toBe(2); // c1 and c2
  });
});

describe('Conditions Register — checkOverdueConditions', () => {
  it('returns empty when no conditions exist', async () => {
    const db = createMockDbWithConditions([]);
    const result = await checkOverdueConditions('app-001', 'proj-001', db, '2025-06-15');
    expect(result.overdueIds).toEqual([]);
    expect(result.count).toBe(0);
  });

  it('identifies overdue conditions', async () => {
    const db = createMockDbWithConditions([
      { id: 'c1', data: { status: 'outstanding', deadline: '2025-06-01' } },
      { id: 'c2', data: { status: 'in_progress', deadline: '2025-06-10' } },
      { id: 'c3', data: { status: 'outstanding', deadline: '2025-07-01' } }, // not overdue
      { id: 'c4', data: { status: 'fulfilled', deadline: '2025-05-01' } }, // fulfilled, not overdue
    ]);

    const result = await checkOverdueConditions('app-001', 'proj-001', db, '2025-06-15');
    expect(result.overdueIds).toContain('c1');
    expect(result.overdueIds).toContain('c2');
    expect(result.count).toBe(2);
  });

  it('does not flag conditions without deadlines', async () => {
    const db = createMockDbWithConditions([
      { id: 'c1', data: { status: 'outstanding' } }, // no deadline
    ]);

    const result = await checkOverdueConditions('app-001', 'proj-001', db, '2025-06-15');
    expect(result.count).toBe(0);
  });
});

describe('Conditions Register — updatePassportOnComplete', () => {
  it('reports compliant=true when all conditions fulfilled/waived', async () => {
    const db = createMockDbWithConditions([
      { id: 'c1', data: { status: 'fulfilled' } },
      { id: 'c2', data: { status: 'waived' } },
    ]);
    const passportFn = vi.fn().mockResolvedValue(undefined) as unknown as PassportUpdateFn;

    const result = await updatePassportOnComplete('app-001', 'proj-001', { db, passportFn });

    expect(result.compliant).toBe(true);
    expect(passportFn).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'proj-001',
        applicationId: 'app-001',
        conditionsCompliant: true,
      })
    );
  });

  it('reports compliant=false when conditions still pending', async () => {
    const db = createMockDbWithConditions([
      { id: 'c1', data: { status: 'fulfilled' } },
      { id: 'c2', data: { status: 'in_progress' } },
    ]);
    const passportFn = vi.fn().mockResolvedValue(undefined) as unknown as PassportUpdateFn;

    const result = await updatePassportOnComplete('app-001', 'proj-001', { db, passportFn });

    expect(result.compliant).toBe(false);
    expect(passportFn).toHaveBeenCalledWith(
      expect.objectContaining({ conditionsCompliant: false })
    );
  });
});

describe('Conditions Register — exposeToReadinessAdapter', () => {
  it('exposes compliance status to readiness adapter', async () => {
    const db = createMockDbWithConditions([
      { id: 'c1', data: { status: 'fulfilled' } },
      { id: 'c2', data: { status: 'fulfilled' } },
    ]);
    const readinessFn = vi.fn().mockResolvedValue(undefined) as unknown as ReadinessAdapterFn;

    const result = await exposeToReadinessAdapter('app-001', 'proj-001', { db, readinessFn });

    expect(result.compliant).toBe(true);
    expect(readinessFn).toHaveBeenCalledWith(
      expect.objectContaining({
        conditionsCompliant: true,
        projectId: 'proj-001',
        applicationId: 'app-001',
      })
    );
  });
});
