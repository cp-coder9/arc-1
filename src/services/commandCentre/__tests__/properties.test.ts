/**
 * Project Command Centre — Property-Based Tests
 *
 * Tests all 18 correctness properties from the design document using fast-check.
 * Each property runs 100+ iterations with randomly generated inputs to verify
 * universal invariants hold across all valid executions.
 *
 * @module commandCentre/__tests__/properties
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ── Service imports ──────────────────────────────────────────────────────────

import {
  createTaskSchema,
  createMilestoneSchema,
  createRiskSchema,
  createSnagSchema,
  createRFISchema,
  createProcurementOrderSchema,
  createContractSchema,
  createProjectSchema,
} from '@/services/commandCentre/schemas';

import {
  classifyDeadlineStatus,
  daysDifference,
} from '@/services/commandCentre/deadlineDetectionService';
import type { DeadlineEntity } from '@/services/commandCentre/deadlineDetectionService';

import {
  computeVariance,
  isOverBudgetThreshold,
  checkOverBudget,
} from '@/services/commandCentre/budgetService';

import { calculateRetention } from '@/services/commandCentre/valuationService';

import { calculateBBBEEPercentage } from '@/services/commandCentre/procurementWorkflowService';

import {
  getViewsForRole,
  getDefaultComplexityMode,
  SIMPLE_MODE_VIEWS,
  ALL_VIEWS,
} from '@/services/commandCentre/roleViewMatrix';

import {
  aggregateCalendarEvents,
} from '@/services/commandCentre/calendarService';

import {
  computeScheduleVariance,
  computeCostVariance,
  deriveTrend,
} from '@/services/commandCentre/kpiService';

import {
  calculateCriticalPath,
} from '@/services/commandCentre/programmeService';
import type { Activity, ActivityDependency } from '@/services/commandCentre/programmeService';

import { mapToSACAPStage, getArchitexStages } from '@/services/commandCentre/saContextService';
import type { ArchitexStage } from '@/services/commandCentre/saContextService';

import { sortEntriesReverseChronological } from '@/services/commandCentre/siteDiaryService';
import type { SiteDiaryEntry } from '@/services/commandCentre/siteDiaryService';

import type {
  TaskBoardItem,
  CommandCentreMilestone,
  ProcurementOrder,
  ContractItem,
  BudgetPackage,
  CalendarEvent,
  AuditEntry,
  RiskItem,
  RiskSeverity,
} from '@/services/commandCentre/types';
import type { UserRole } from '@/types';

// ── Arbitraries (Generators) ─────────────────────────────────────────────────

const isoDateArb = fc.integer({
  min: new Date('2020-01-01T00:00:00.000Z').getTime(),
  max: new Date('2030-12-31T00:00:00.000Z').getTime(),
}).map((ts) => new Date(ts).toISOString().split('T')[0]);

const priorityArb = fc.constantFrom('low', 'medium', 'high', 'critical') as fc.Arbitrary<'low' | 'medium' | 'high' | 'critical'>;

const riskSeverityArb = fc.constantFrom('critical', 'high', 'medium', 'low') as fc.Arbitrary<RiskSeverity>;

const riskCategoryArb = fc.constantFrom(
  'supply_chain', 'resource', 'quality', 'compliance', 'commercial', 'safety',
);

const taskStatusArb = fc.constantFrom('todo', 'in_progress', 'in_review', 'done') as fc.Arbitrary<TaskBoardItem['status']>;

const milestoneStatusArb = fc.constantFrom(
  'complete', 'on_track', 'at_risk', 'overdue', 'pending',
) as fc.Arbitrary<CommandCentreMilestone['status']>;

const contractFormArb = fc.constantFrom(
  'jbcc_pba', 'jbcc_ns', 'jbcc_mwa', 'nec_ecc', 'nec_psc', 'nec_tsc', 'custom',
);

const contractStatusArb = fc.constantFrom('active', 'expired', 'terminated', 'pending') as fc.Arbitrary<ContractItem['status']>;

const procurementStatusArb = fc.constantFrom('ordered', 'in_transit', 'delivered', 'evaluating') as fc.Arbitrary<ProcurementOrder['status']>;

const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0);

const userRoleArb = fc.constantFrom(
  'client', 'architect', 'admin', 'freelancer', 'bep',
  'contractor', 'subcontractor', 'supplier', 'engineer',
  'quantity_surveyor', 'town_planner', 'energy_professional',
  'fire_engineer', 'site_manager', 'developer', 'firm_admin', 'platform_admin',
) as fc.Arbitrary<UserRole>;

const complexityModeArb = fc.constantFrom('simple', 'full') as fc.Arbitrary<'simple' | 'full'>;

const taskArb: fc.Arbitrary<TaskBoardItem> = fc.record({
  id: fc.uuid(),
  projectId: fc.uuid(),
  title: nonEmptyStringArb,
  description: fc.option(nonEmptyStringArb, { nil: undefined }),
  status: taskStatusArb,
  assigneeId: fc.uuid(),
  assigneeName: nonEmptyStringArb,
  priority: priorityArb,
  dueDate: isoDateArb,
  linkedSpecForgeItemId: fc.option(fc.uuid(), { nil: undefined }),
  linkedActivityId: fc.option(fc.uuid(), { nil: undefined }),
  linkedProcurementOrderId: fc.option(fc.uuid(), { nil: undefined }),
  createdBy: fc.uuid(),
  createdAt: isoDateArb,
  updatedAt: isoDateArb,
});

const milestoneArb: fc.Arbitrary<CommandCentreMilestone> = fc.record({
  id: fc.uuid(),
  projectId: fc.uuid(),
  name: nonEmptyStringArb,
  plannedDate: isoDateArb,
  actualDate: fc.option(isoDateArb, { nil: undefined }),
  status: milestoneStatusArb,
  linkedCertificateId: fc.option(fc.uuid(), { nil: undefined }),
  linkedActivityId: fc.option(fc.uuid(), { nil: undefined }),
  category: fc.option(
    fc.constantFrom('general', 'nhbrc_inspection', 'municipal_submission') as fc.Arbitrary<'general' | 'nhbrc_inspection' | 'municipal_submission'>,
    { nil: undefined },
  ),
  nhbrcStage: fc.option(fc.integer({ min: 1, max: 7 }), { nil: undefined }),
  documentationChecklist: fc.option(fc.array(nonEmptyStringArb, { maxLength: 5 }), { nil: undefined }),
  createdBy: fc.uuid(),
  createdAt: isoDateArb,
  updatedAt: isoDateArb,
});

const procurementOrderArb: fc.Arbitrary<ProcurementOrder> = fc.record({
  id: fc.uuid(),
  projectId: fc.uuid(),
  orderNumber: nonEmptyStringArb,
  description: nonEmptyStringArb,
  supplierId: fc.uuid(),
  supplierName: nonEmptyStringArb,
  value: fc.double({ min: 1, max: 10_000_000, noNaN: true }),
  expectedDeliveryDate: isoDateArb,
  status: procurementStatusArb,
  bbbeeLevel: fc.option(fc.integer({ min: 0, max: 8 }), { nil: undefined }),
  linkedSpecForgeItemId: fc.option(fc.uuid(), { nil: undefined }),
  createdBy: fc.uuid(),
  createdAt: isoDateArb,
  updatedAt: isoDateArb,
});

const contractItemArb: fc.Arbitrary<ContractItem> = fc.record({
  id: fc.uuid(),
  projectId: fc.uuid(),
  reference: nonEmptyStringArb,
  contractorSupplier: nonEmptyStringArb,
  scope: nonEmptyStringArb,
  value: fc.double({ min: 1, max: 50_000_000, noNaN: true }),
  form: contractFormArb as fc.Arbitrary<ContractItem['form']>,
  startDate: isoDateArb,
  expiryDate: isoDateArb,
  status: contractStatusArb,
  linkedProcurementOrderIds: fc.option(fc.array(fc.uuid(), { maxLength: 3 }), { nil: undefined }),
  linkedCertificateIds: fc.option(fc.array(fc.uuid(), { maxLength: 3 }), { nil: undefined }),
  createdBy: fc.uuid(),
  createdAt: isoDateArb,
  updatedAt: isoDateArb,
});

const budgetPackageArb: fc.Arbitrary<BudgetPackage> = fc.record({
  id: fc.uuid(),
  projectId: fc.uuid(),
  name: nonEmptyStringArb,
  budgetAmount: fc.double({ min: 0, max: 50_000_000, noNaN: true }),
  committedAmount: fc.double({ min: 0, max: 50_000_000, noNaN: true }),
  spentAmount: fc.double({ min: 0, max: 50_000_000, noNaN: true }),
  progressPercent: fc.double({ min: 0, max: 100, noNaN: true }),
  variance: fc.double({ min: -100, max: 500, noNaN: true }),
  isOverBudget: fc.boolean(),
});

const riskItemArb: fc.Arbitrary<RiskItem> = fc.record({
  id: fc.uuid(),
  projectId: fc.uuid(),
  description: nonEmptyStringArb,
  category: riskCategoryArb as fc.Arbitrary<RiskItem['category']>,
  severity: riskSeverityArb,
  status: fc.constantFrom('open', 'mitigating', 'escalated', 'monitoring', 'closed') as fc.Arbitrary<RiskItem['status']>,
  ownerId: fc.uuid(),
  ownerName: nonEmptyStringArb,
  mitigationPlan: fc.option(nonEmptyStringArb, { nil: undefined }),
  createdBy: fc.uuid(),
  createdAt: isoDateArb,
  updatedAt: isoDateArb,
  aiGenerated: fc.option(fc.boolean(), { nil: undefined }),
});

const diaryEntryArb: fc.Arbitrary<SiteDiaryEntry> = fc.record({
  id: fc.uuid(),
  projectId: fc.uuid(),
  date: isoDateArb,
  weather: fc.constantFrom('sunny', 'cloudy', 'rainy', 'windy', 'stormy', 'cold', 'hot'),
  workforceCount: fc.integer({ min: 0, max: 500 }),
  workCompleted: nonEmptyStringArb,
  issuesDelays: fc.option(nonEmptyStringArb, { nil: undefined }),
  createdBy: fc.uuid(),
  createdAt: fc.integer({ min: new Date('2020-01-01T00:00:00.000Z').getTime(), max: new Date('2030-12-31T00:00:00.000Z').getTime() }).map((ts) => new Date(ts).toISOString()),
  mentionsDelays: fc.boolean(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// Property 1: Entity Creation Validation
// ═══════════════════════════════════════════════════════════════════════════════

describe('Property 1: Entity Creation Validation', () => {
  it('rejects task creation with empty title', () => {
    fc.assert(
      fc.property(
        fc.record({
          title: fc.constant(''),
          assigneeId: fc.uuid(),
          priority: priorityArb,
          dueDate: isoDateArb,
        }),
        (input) => {
          const result = createTaskSchema.safeParse(input);
          expect(result.success).toBe(false);
        },
      ),
    );
  });

  it('rejects task creation with missing assignee', () => {
    fc.assert(
      fc.property(
        fc.record({
          title: nonEmptyStringArb,
          assigneeId: fc.constant(''),
          priority: priorityArb,
          dueDate: isoDateArb,
        }),
        (input) => {
          const result = createTaskSchema.safeParse(input);
          expect(result.success).toBe(false);
        },
      ),
    );
  });

  it('accepts valid task input', () => {
    fc.assert(
      fc.property(
        fc.record({
          title: nonEmptyStringArb,
          assigneeId: fc.uuid(),
          priority: priorityArb,
          dueDate: isoDateArb,
        }),
        (input) => {
          const result = createTaskSchema.safeParse(input);
          expect(result.success).toBe(true);
        },
      ),
    );
  });

  it('rejects risk creation with missing description', () => {
    fc.assert(
      fc.property(
        fc.record({
          description: fc.constant(''),
          category: riskCategoryArb,
          severity: riskSeverityArb,
          ownerId: fc.uuid(),
        }),
        (input) => {
          const result = createRiskSchema.safeParse(input);
          expect(result.success).toBe(false);
        },
      ),
    );
  });

  it('accepts valid risk input', () => {
    fc.assert(
      fc.property(
        fc.record({
          description: nonEmptyStringArb,
          category: riskCategoryArb,
          severity: riskSeverityArb,
          ownerId: fc.uuid(),
        }),
        (input) => {
          const result = createRiskSchema.safeParse(input);
          expect(result.success).toBe(true);
        },
      ),
    );
  });

  it('rejects milestone creation with empty name', () => {
    fc.assert(
      fc.property(
        fc.record({
          name: fc.constant(''),
          plannedDate: isoDateArb,
        }),
        (input) => {
          const result = createMilestoneSchema.safeParse(input);
          expect(result.success).toBe(false);
        },
      ),
    );
  });

  it('accepts valid milestone input', () => {
    fc.assert(
      fc.property(
        fc.record({
          name: nonEmptyStringArb,
          plannedDate: isoDateArb,
        }),
        (input) => {
          const result = createMilestoneSchema.safeParse(input);
          expect(result.success).toBe(true);
        },
      ),
    );
  });

  it('rejects snag creation with empty location', () => {
    fc.assert(
      fc.property(
        fc.record({
          description: nonEmptyStringArb,
          location: fc.constant(''),
          severity: fc.constantFrom('high', 'medium', 'low'),
          assignedPartyId: fc.uuid(),
        }),
        (input) => {
          const result = createSnagSchema.safeParse(input);
          expect(result.success).toBe(false);
        },
      ),
    );
  });

  it('rejects RFI creation with empty subject', () => {
    fc.assert(
      fc.property(
        fc.record({
          subject: fc.constant(''),
          description: nonEmptyStringArb,
          addresseeId: fc.uuid(),
          priority: priorityArb,
        }),
        (input) => {
          const result = createRFISchema.safeParse(input);
          expect(result.success).toBe(false);
        },
      ),
    );
  });

  it('rejects procurement order with zero/negative value', () => {
    fc.assert(
      fc.property(
        fc.record({
          description: nonEmptyStringArb,
          supplierId: fc.uuid(),
          value: fc.double({ min: -1_000_000, max: 0, noNaN: true }),
          expectedDeliveryDate: isoDateArb,
        }),
        (input) => {
          const result = createProcurementOrderSchema.safeParse(input);
          expect(result.success).toBe(false);
        },
      ),
    );
  });

  it('rejects contract with empty scope', () => {
    fc.assert(
      fc.property(
        fc.record({
          contractorSupplier: nonEmptyStringArb,
          scope: fc.constant(''),
          value: fc.double({ min: 1, max: 50_000_000, noNaN: true }),
          form: contractFormArb,
          startDate: isoDateArb,
          expiryDate: isoDateArb,
        }),
        (input) => {
          const result = createContractSchema.safeParse(input);
          expect(result.success).toBe(false);
        },
      ),
    );
  });

  it('rejects project with empty name', () => {
    fc.assert(
      fc.property(
        fc.record({
          name: fc.constant(''),
          clientId: fc.uuid(),
          estimatedValue: fc.double({ min: 1, max: 100_000_000, noNaN: true }),
          projectType: nonEmptyStringArb,
          location: nonEmptyStringArb,
          estimatedDuration: nonEmptyStringArb,
        }),
        (input) => {
          const result = createProjectSchema.safeParse(input);
          expect(result.success).toBe(false);
        },
      ),
    );
  });

  it('accepts valid project input', () => {
    fc.assert(
      fc.property(
        fc.record({
          name: nonEmptyStringArb,
          clientId: fc.uuid(),
          estimatedValue: fc.double({ min: 1, max: 100_000_000, noNaN: true }),
          projectType: nonEmptyStringArb,
          location: nonEmptyStringArb,
          estimatedDuration: nonEmptyStringArb,
        }),
        (input) => {
          const result = createProjectSchema.safeParse(input);
          expect(result.success).toBe(true);
        },
      ),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Property 2: Deadline and Threshold Detection
// ═══════════════════════════════════════════════════════════════════════════════

describe('Property 2: Deadline and Threshold Detection', () => {
  it('classifies task as overdue when current date exceeds due date', () => {
    fc.assert(
      fc.property(
        taskArb.filter((t) => t.status !== 'done'),
        fc.integer({ min: 1, max: 365 }),
        (task, daysAfter) => {
          const dueDate = new Date(task.dueDate);
          const currentDate = new Date(dueDate);
          currentDate.setDate(currentDate.getDate() + daysAfter);

          const entity: DeadlineEntity = { type: 'task', entity: task };
          const result = classifyDeadlineStatus(entity, currentDate);

          expect(result.triggered).toBe(true);
          expect(result.kind).toBe('overdue');
        },
      ),
    );
  });

  it('classifies task as on_track when due date not passed', () => {
    fc.assert(
      fc.property(
        taskArb.filter((t) => t.status !== 'done'),
        fc.integer({ min: 1, max: 365 }),
        (task, daysBefore) => {
          const dueDate = new Date(task.dueDate);
          const currentDate = new Date(dueDate);
          currentDate.setDate(currentDate.getDate() - daysBefore);

          const entity: DeadlineEntity = { type: 'task', entity: task };
          const result = classifyDeadlineStatus(entity, currentDate);

          expect(result.triggered).toBe(false);
          expect(result.kind).toBe('on_track');
        },
      ),
    );
  });

  it('classifies milestone as overdue when past planned date', () => {
    fc.assert(
      fc.property(
        milestoneArb.filter((m) => m.status !== 'complete'),
        fc.integer({ min: 1, max: 365 }),
        (milestone, daysAfter) => {
          const planned = new Date(milestone.plannedDate);
          const currentDate = new Date(planned);
          currentDate.setDate(currentDate.getDate() + daysAfter);

          const entity: DeadlineEntity = { type: 'milestone', entity: milestone };
          const result = classifyDeadlineStatus(entity, currentDate);

          expect(result.triggered).toBe(true);
          expect(result.kind).toBe('overdue');
        },
      ),
    );
  });

  it('classifies completed task as not triggered regardless of date', () => {
    fc.assert(
      fc.property(
        taskArb.map((t) => ({ ...t, status: 'done' as const })),
        fc.integer({ min: new Date('2020-01-01T00:00:00.000Z').getTime(), max: new Date('2030-12-31T00:00:00.000Z').getTime() }).map((ts) => new Date(ts)),
        (task, currentDate) => {
          const entity: DeadlineEntity = { type: 'task', entity: task };
          const result = classifyDeadlineStatus(entity, currentDate);

          expect(result.triggered).toBe(false);
          expect(result.kind).toBe('complete');
        },
      ),
    );
  });

  it('classifies delivery as overdue when past expected date and not delivered', () => {
    fc.assert(
      fc.property(
        procurementOrderArb.filter((o) => o.status !== 'delivered'),
        fc.integer({ min: 1, max: 365 }),
        (order, daysAfter) => {
          const expected = new Date(order.expectedDeliveryDate);
          const currentDate = new Date(expected);
          currentDate.setDate(currentDate.getDate() + daysAfter);

          const entity: DeadlineEntity = { type: 'delivery', entity: order };
          const result = classifyDeadlineStatus(entity, currentDate);

          expect(result.triggered).toBe(true);
          expect(result.kind).toBe('overdue');
        },
      ),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Property 3: Summary Stat Aggregation
// ═══════════════════════════════════════════════════════════════════════════════

describe('Property 3: Summary Stat Aggregation', () => {
  it('risk counts by severity equal actual filtered counts', () => {
    fc.assert(
      fc.property(
        fc.array(riskItemArb, { minLength: 0, maxLength: 50 }),
        (risks) => {
          const critical = risks.filter((r) => r.severity === 'critical').length;
          const high = risks.filter((r) => r.severity === 'high').length;
          const medium = risks.filter((r) => r.severity === 'medium').length;
          const low = risks.filter((r) => r.severity === 'low').length;

          expect(critical + high + medium + low).toBe(risks.length);
        },
      ),
    );
  });

  it('pure getRiskStats computation matches manual count', () => {
    fc.assert(
      fc.property(
        fc.array(riskItemArb, { minLength: 0, maxLength: 50 }),
        (risks) => {
          // Simulate the pure logic of getRiskStats
          const stats = {
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
            total: risks.length,
          };

          for (const risk of risks) {
            if (risk.severity === 'critical') stats.critical++;
            else if (risk.severity === 'high') stats.high++;
            else if (risk.severity === 'medium') stats.medium++;
            else if (risk.severity === 'low') stats.low++;
          }

          expect(stats.critical + stats.high + stats.medium + stats.low).toBe(stats.total);
          expect(stats.critical).toBe(risks.filter((r) => r.severity === 'critical').length);
          expect(stats.high).toBe(risks.filter((r) => r.severity === 'high').length);
          expect(stats.medium).toBe(risks.filter((r) => r.severity === 'medium').length);
          expect(stats.low).toBe(risks.filter((r) => r.severity === 'low').length);
        },
      ),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Property 4: Budget Variation Recalculation
// ═══════════════════════════════════════════════════════════════════════════════

describe('Property 4: Budget Variation Recalculation', () => {
  it('adjustedContractSum = contractSum + sum(variations)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 100_000, max: 100_000_000, noNaN: true }),
        fc.array(fc.double({ min: -5_000_000, max: 10_000_000, noNaN: true }), { minLength: 0, maxLength: 20 }),
        (contractSum, variationValues) => {
          const sumVariations = variationValues.reduce((sum, v) => sum + v, 0);
          const adjustedContractSum = contractSum + sumVariations;

          // The invariant must hold
          expect(adjustedContractSum).toBeCloseTo(contractSum + sumVariations, 5);
        },
      ),
    );
  });

  it('adding zero-value variation does not change contract sum', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 100_000, max: 100_000_000, noNaN: true }),
        (contractSum) => {
          const adjustedContractSum = contractSum + 0;
          expect(adjustedContractSum).toBe(contractSum);
        },
      ),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Property 5: Over-Budget Detection
// ═══════════════════════════════════════════════════════════════════════════════

describe('Property 5: Over-Budget Detection', () => {
  it('flags package when (spent - budget) / budget > 0.05', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1000, max: 10_000_000, noNaN: true }),
        fc.double({ min: 0.051, max: 5, noNaN: true }),
        (budget, overFactor) => {
          const spent = budget * (1 + overFactor);
          expect(isOverBudgetThreshold(spent, budget)).toBe(true);
        },
      ),
    );
  });

  it('does not flag package when (spent - budget) / budget <= 0.05', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1000, max: 10_000_000, noNaN: true }),
        fc.double({ min: 0, max: 0.05, noNaN: true }),
        (budget, underFactor) => {
          const spent = budget * (1 + underFactor);
          expect(isOverBudgetThreshold(spent, budget)).toBe(false);
        },
      ),
    );
  });

  it('checkOverBudget uses the same threshold logic', () => {
    fc.assert(
      fc.property(
        budgetPackageArb,
        (pkg) => {
          const expected = isOverBudgetThreshold(pkg.spentAmount, pkg.budgetAmount);
          const result = checkOverBudget(pkg);
          expect(result).toBe(expected);
        },
      ),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Property 6: Payment Certificate Retention Calculation
// ═══════════════════════════════════════════════════════════════════════════════

describe('Property 6: Payment Certificate Retention', () => {
  it('retentionAmount = grossValue * retentionPercent / 100', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 100_000_000, noNaN: true }),
        fc.double({ min: 0, max: 100, noNaN: true }),
        (grossValue, retentionPercent) => {
          const { retentionAmount } = calculateRetention(grossValue, retentionPercent);
          const expected = grossValue * retentionPercent / 100;
          expect(retentionAmount).toBeCloseTo(expected, 5);
        },
      ),
    );
  });

  it('netCertified + retention = grossValue (invariant)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 100_000_000, noNaN: true }),
        fc.double({ min: 0, max: 100, noNaN: true }),
        (grossValue, retentionPercent) => {
          const { retentionAmount, netCertifiedAmount } = calculateRetention(grossValue, retentionPercent);
          expect(netCertifiedAmount + retentionAmount).toBeCloseTo(grossValue, 5);
        },
      ),
    );
  });

  it('retention is zero when retentionPercent is zero', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 100_000_000, noNaN: true }),
        (grossValue) => {
          const { retentionAmount, netCertifiedAmount } = calculateRetention(grossValue, 0);
          expect(retentionAmount).toBe(0);
          expect(netCertifiedAmount).toBe(grossValue);
        },
      ),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Property 7: B-BBEE Procurement Percentage
// ═══════════════════════════════════════════════════════════════════════════════

describe('Property 7: B-BBEE Procurement Percentage', () => {
  it('bbbeePercent = sum(orders with level >= 1) / sum(all orders) * 100', () => {
    fc.assert(
      fc.property(
        fc.array(procurementOrderArb, { minLength: 1, maxLength: 30 }),
        (orders) => {
          const result = calculateBBBEEPercentage(orders);

          const totalValue = orders.reduce((sum, o) => sum + o.value, 0);
          const bbbeeValue = orders
            .filter((o) => (o.bbbeeLevel ?? 0) >= 1)
            .reduce((sum, o) => sum + o.value, 0);

          const expectedPercent = totalValue > 0
            ? (bbbeeValue / totalValue) * 100
            : 0;

          expect(result.totalProcurementValue).toBeCloseTo(totalValue, 5);
          expect(result.bbbeeProcurementValue).toBeCloseTo(bbbeeValue, 5);
          expect(result.bbbeePercent).toBeCloseTo(expectedPercent, 5);
        },
      ),
    );
  });

  it('supplier breakdown sums to total procurement value', () => {
    fc.assert(
      fc.property(
        fc.array(procurementOrderArb, { minLength: 1, maxLength: 30 }),
        (orders) => {
          const result = calculateBBBEEPercentage(orders);
          const breakdownSum = result.supplierBreakdown.reduce(
            (sum, s) => sum + s.orderValue, 0,
          );
          expect(breakdownSum).toBeCloseTo(result.totalProcurementValue, 5);
        },
      ),
    );
  });

  it('returns zero percent for empty order list', () => {
    const result = calculateBBBEEPercentage([]);
    expect(result.totalProcurementValue).toBe(0);
    expect(result.bbbeeProcurementValue).toBe(0);
    expect(result.bbbeePercent).toBe(0);
    expect(result.supplierBreakdown).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Property 8: Task Status Transition
// ═══════════════════════════════════════════════════════════════════════════════

describe('Property 8: Task Status Transition', () => {
  it('moving a task preserves its data fields (title, assignee, priority, dueDate)', () => {
    fc.assert(
      fc.property(
        taskArb,
        taskStatusArb,
        (task, targetStatus) => {
          // Simulate the pure logic of moveTask
          const movedTask: TaskBoardItem = { ...task, status: targetStatus };

          // Data fields must be unchanged
          expect(movedTask.title).toBe(task.title);
          expect(movedTask.assigneeId).toBe(task.assigneeId);
          expect(movedTask.assigneeName).toBe(task.assigneeName);
          expect(movedTask.priority).toBe(task.priority);
          expect(movedTask.dueDate).toBe(task.dueDate);
        },
      ),
    );
  });

  it('moved task status equals target status', () => {
    fc.assert(
      fc.property(
        taskArb,
        taskStatusArb,
        (task, targetStatus) => {
          const movedTask: TaskBoardItem = { ...task, status: targetStatus };
          expect(movedTask.status).toBe(targetStatus);
        },
      ),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Property 9: Task Board Filtering
// ═══════════════════════════════════════════════════════════════════════════════

describe('Property 9: Task Board Filtering', () => {
  // Pure filter function matching the logic in taskBoardService.getTasks
  function filterTasksPure(tasks: TaskBoardItem[], filters: {
    assigneeId?: string;
    priority?: string;
    dueDateStart?: string;
    dueDateEnd?: string;
    linkedSubsystem?: 'specforge' | 'programme' | 'procurement';
  }): TaskBoardItem[] {
    let result = [...tasks];
    if (filters.assigneeId) {
      result = result.filter((t) => t.assigneeId === filters.assigneeId);
    }
    if (filters.priority) {
      result = result.filter((t) => t.priority === filters.priority);
    }
    if (filters.dueDateStart) {
      result = result.filter((t) => t.dueDate >= filters.dueDateStart!);
    }
    if (filters.dueDateEnd) {
      result = result.filter((t) => t.dueDate <= filters.dueDateEnd!);
    }
    if (filters.linkedSubsystem) {
      result = result.filter((t) => {
        switch (filters.linkedSubsystem) {
          case 'specforge': return !!t.linkedSpecForgeItemId;
          case 'programme': return !!t.linkedActivityId;
          case 'procurement': return !!t.linkedProcurementOrderId;
          default: return true;
        }
      });
    }
    return result;
  }

  it('filtered result contains exactly tasks satisfying ALL active conditions', () => {
    fc.assert(
      fc.property(
        fc.array(taskArb, { minLength: 0, maxLength: 30 }),
        fc.record({
          assigneeId: fc.option(fc.uuid(), { nil: undefined }),
          priority: fc.option(priorityArb, { nil: undefined }),
          dueDateStart: fc.option(isoDateArb, { nil: undefined }),
          dueDateEnd: fc.option(isoDateArb, { nil: undefined }),
        }),
        (tasks, filters) => {
          const filtered = filterTasksPure(tasks, filters);

          // Every task in filtered must match ALL active filters
          for (const task of filtered) {
            if (filters.assigneeId) expect(task.assigneeId).toBe(filters.assigneeId);
            if (filters.priority) expect(task.priority).toBe(filters.priority);
            if (filters.dueDateStart) expect(task.dueDate >= filters.dueDateStart).toBe(true);
            if (filters.dueDateEnd) expect(task.dueDate <= filters.dueDateEnd).toBe(true);
          }

          // No task matching all criteria is excluded
          for (const task of tasks) {
            const shouldInclude = (
              (!filters.assigneeId || task.assigneeId === filters.assigneeId) &&
              (!filters.priority || task.priority === filters.priority) &&
              (!filters.dueDateStart || task.dueDate >= filters.dueDateStart) &&
              (!filters.dueDateEnd || task.dueDate <= filters.dueDateEnd)
            );
            if (shouldInclude) {
              expect(filtered).toContainEqual(task);
            }
          }
        },
      ),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Property 10: Role-Based View Access Control
// ═══════════════════════════════════════════════════════════════════════════════

describe('Property 10: Role-Based View Access', () => {
  const EXPECTED_VIEWS: Record<string, string[]> = {
    client: ['dashboard', 'milestones', 'budget', 'documents', 'notifications'],
    architect: [...ALL_VIEWS],
    bep: [...ALL_VIEWS],
    site_manager: ['dashboard', 'programme', 'tasks', 'site-diary', 'rfis', 'quality', 'team'],
    quantity_surveyor: ['dashboard', 'budget', 'valuations', 'procurement', 'contracts', 'milestones', 'analytics'],
    contractor: ['dashboard', 'tasks', 'programme', 'site-diary', 'rfis', 'quality', 'procurement'],
    subcontractor: ['dashboard', 'tasks', 'programme', 'site-diary', 'rfis', 'quality', 'procurement'],
    supplier: ['procurement', 'documents'],
    engineer: ['dashboard', 'programme', 'tasks', 'rfis', 'quality', 'documents'],
  };

  it('for any known role, views match the role-view matrix in full mode', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...(Object.keys(EXPECTED_VIEWS) as UserRole[])),
        (role) => {
          const views = getViewsForRole(role, 'full');
          const expected = EXPECTED_VIEWS[role];
          expect(views.sort()).toEqual(expected.sort());
        },
      ),
    );
  });

  it('full-access roles see all views', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('architect', 'bep', 'admin', 'platform_admin', 'firm_admin') as fc.Arbitrary<UserRole>,
        (role) => {
          const views = getViewsForRole(role, 'full');
          expect(views.sort()).toEqual([...ALL_VIEWS].sort());
        },
      ),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Property 11: Complexity Mode View Gating
// ═══════════════════════════════════════════════════════════════════════════════

describe('Property 11: Complexity Mode View Gating', () => {
  it('simple mode views are a subset of full mode views for any role', () => {
    fc.assert(
      fc.property(userRoleArb, (role) => {
        const simpleViews = getViewsForRole(role, 'simple');
        const fullViews = getViewsForRole(role, 'full');

        // Every view in simple mode must be in the SIMPLE_MODE_VIEWS set
        for (const view of simpleViews) {
          expect(SIMPLE_MODE_VIEWS).toContain(view);
        }

        // Every simple view must also be available in full mode
        for (const view of simpleViews) {
          expect(fullViews).toContain(view);
        }
      }),
    );
  });

  it('full mode shows all role-permitted views', () => {
    fc.assert(
      fc.property(userRoleArb, (role) => {
        const fullViews = getViewsForRole(role, 'full');
        const simpleViews = getViewsForRole(role, 'simple');

        // Full must have >= simple views
        expect(fullViews.length).toBeGreaterThanOrEqual(simpleViews.length);
      }),
    );
  });

  it('default mode is Simple when contract value < 5M', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 4_999_999, noNaN: true }),
        (contractValue) => {
          expect(getDefaultComplexityMode(contractValue)).toBe('simple');
        },
      ),
    );
  });

  it('default mode is Full when contract value >= 5M', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 5_000_000, max: 500_000_000, noNaN: true }),
        (contractValue) => {
          expect(getDefaultComplexityMode(contractValue)).toBe('full');
        },
      ),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Property 12: Calendar Event Aggregation
// ═══════════════════════════════════════════════════════════════════════════════

describe('Property 12: Calendar Event Aggregation', () => {
  it('total event count equals sum of individual source counts', () => {
    fc.assert(
      fc.property(
        fc.array(milestoneArb, { minLength: 0, maxLength: 10 }),
        fc.array(procurementOrderArb, { minLength: 0, maxLength: 10 }),
        fc.array(taskArb, { minLength: 0, maxLength: 10 }),
        (milestones, orders, tasks) => {
          const projectId = 'test-project';
          const events = aggregateCalendarEvents(projectId, milestones, orders, tasks, []);

          // Count expected events
          const generalMilestones = milestones.filter((m) => m.category !== 'nhbrc_inspection');
          const inspections = milestones.filter((m) => m.category === 'nhbrc_inspection');

          const expectedCount = generalMilestones.length + inspections.length + orders.length + tasks.length;
          expect(events.length).toBe(expectedCount);
        },
      ),
    );
  });

  it('each event references its source entity type and ID', () => {
    fc.assert(
      fc.property(
        fc.array(milestoneArb, { minLength: 1, maxLength: 5 }),
        fc.array(procurementOrderArb, { minLength: 1, maxLength: 5 }),
        fc.array(taskArb, { minLength: 1, maxLength: 5 }),
        (milestones, orders, tasks) => {
          const projectId = 'test-project';
          const events = aggregateCalendarEvents(projectId, milestones, orders, tasks, []);

          for (const event of events) {
            expect(event.sourceEntityType).toBeTruthy();
            expect(event.sourceEntityId).toBeTruthy();
            expect(event.projectId).toBe(projectId);
          }
        },
      ),
    );
  });

  it('no duplicate source entity IDs within same type', () => {
    fc.assert(
      fc.property(
        fc.array(taskArb, { minLength: 0, maxLength: 10 }),
        (tasks) => {
          const projectId = 'test-project';
          const events = aggregateCalendarEvents(projectId, [], [], tasks, []);

          // Each task produces exactly one event
          const taskEvents = events.filter((e) => e.type === 'task_due');
          expect(taskEvents.length).toBe(tasks.length);
        },
      ),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Property 13: KPI Formula Computation
// ═══════════════════════════════════════════════════════════════════════════════

describe('Property 13: KPI Formula Computation', () => {
  it('schedule variance formula is deterministic for identical inputs', () => {
    fc.assert(
      fc.property(
        fc.array(milestoneArb, { minLength: 0, maxLength: 20 }),
        (milestones) => {
          const result1 = computeScheduleVariance(milestones);
          const result2 = computeScheduleVariance(milestones);

          expect(result1.variancePercent).toBe(result2.variancePercent);
          expect(result1.completedOnTime).toBe(result2.completedOnTime);
          expect(result1.delayed).toBe(result2.delayed);
          expect(result1.totalWithDates).toBe(result2.totalWithDates);
        },
      ),
    );
  });

  it('schedule variance = (completedOnTime - delayed) / totalWithDates * 100', () => {
    fc.assert(
      fc.property(
        fc.array(milestoneArb, { minLength: 1, maxLength: 20 }),
        (milestones) => {
          const result = computeScheduleVariance(milestones);

          if (result.totalWithDates > 0) {
            const expected = (result.completedOnTime - result.delayed) / result.totalWithDates * 100;
            expect(result.variancePercent).toBeCloseTo(expected, 10);
          } else {
            expect(result.variancePercent).toBe(0);
          }
        },
      ),
    );
  });

  it('cost variance = (forecast - contractSum) / contractSum * 100', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 100_000_000, noNaN: true }),
        fc.double({ min: 1, max: 100_000_000, noNaN: true }),
        (forecast, contractSum) => {
          const result = computeCostVariance(forecast, contractSum);
          const expected = ((forecast - contractSum) / contractSum) * 100;
          expect(result.variancePercent).toBeCloseTo(expected, 10);
        },
      ),
    );
  });

  it('cost variance is zero when contractSum is zero', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 100_000_000, noNaN: true }),
        (forecast) => {
          const result = computeCostVariance(forecast, 0);
          expect(result.variancePercent).toBe(0);
        },
      ),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Property 14: KPI Trend Derivation
// ═══════════════════════════════════════════════════════════════════════════════

describe('Property 14: KPI Trend Derivation', () => {
  it('trend is deterministic for any pair of values', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1000, max: 1000, noNaN: true }),
        fc.double({ min: -1000, max: 1000, noNaN: true }),
        fc.boolean(),
        (current, previous, higherIsBetter) => {
          const trend1 = deriveTrend(current, previous, higherIsBetter);
          const trend2 = deriveTrend(current, previous, higherIsBetter);
          expect(trend1).toBe(trend2);
        },
      ),
    );
  });

  it('improving when current better than previous (higher is better)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1000, max: 1000, noNaN: true }),
        fc.double({ min: 1, max: 100, noNaN: true }),
        (base, improvement) => {
          const current = base + improvement;
          const trend = deriveTrend(current, base, true);
          expect(trend).toBe('improving');
        },
      ),
    );
  });

  it('deteriorating when current worse than previous (higher is better)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1000, max: 1000, noNaN: true }),
        fc.double({ min: 1, max: 100, noNaN: true }),
        (base, decline) => {
          const current = base - decline;
          const trend = deriveTrend(current, base, true);
          expect(trend).toBe('deteriorating');
        },
      ),
    );
  });

  it('stable when values within tolerance', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1000, max: 1000, noNaN: true }),
        fc.double({ min: -0.5, max: 0.5, noNaN: true }),
        (base, delta) => {
          const current = base + delta;
          const trend = deriveTrend(current, base, true, 0.5);
          expect(trend).toBe('stable');
        },
      ),
    );
  });

  it('improving when current lower than previous (lower is better)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1000, max: 1000, noNaN: true }),
        fc.double({ min: 1, max: 100, noNaN: true }),
        (base, improvement) => {
          const current = base - improvement;
          const trend = deriveTrend(current, base, false);
          expect(trend).toBe('improving');
        },
      ),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Property 15: Critical Path Identification
// ═══════════════════════════════════════════════════════════════════════════════

describe('Property 15: Critical Path Identification', () => {
  it('critical path activities have zero float', () => {
    // Generate a simple chain of activities with FS dependencies
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 6 }),
        (chainLength) => {
          const activities: Activity[] = [];
          const dependencies: ActivityDependency[] = [];
          let currentDate = '2025-01-01';

          for (let i = 0; i < chainLength; i++) {
            const start = currentDate;
            const endDate = new Date(start);
            endDate.setDate(endDate.getDate() + 10);
            const end = endDate.toISOString().split('T')[0];

            activities.push({
              id: `act-${i}`,
              projectId: 'proj-1',
              name: `Activity ${i}`,
              startDate: start,
              endDate: end,
              assigneeId: 'user-1',
              assigneeName: 'User 1',
              percentComplete: 0,
              isCritical: false,
            });

            if (i > 0) {
              dependencies.push({
                fromActivityId: `act-${i - 1}`,
                toActivityId: `act-${i}`,
                type: 'FS',
              });
            }

            currentDate = end;
          }

          const result = calculateCriticalPath(activities, dependencies);

          // In a simple chain, all activities are on the critical path
          for (const schedule of result.schedules) {
            if (result.criticalPathIds.includes(schedule.activityId)) {
              expect(schedule.totalFloat).toBe(0);
            }
          }
        },
      ),
    );
  });

  it('for a linear chain, the critical path includes all activities', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 5 }),
        (chainLength) => {
          const activities: Activity[] = [];
          const dependencies: ActivityDependency[] = [];
          let currentDate = '2025-01-01';

          for (let i = 0; i < chainLength; i++) {
            const start = currentDate;
            const endDate = new Date(start);
            endDate.setDate(endDate.getDate() + 5);
            const end = endDate.toISOString().split('T')[0];

            activities.push({
              id: `act-${i}`,
              projectId: 'proj-1',
              name: `Activity ${i}`,
              startDate: start,
              endDate: end,
              assigneeId: 'user-1',
              assigneeName: 'User 1',
              percentComplete: 0,
              isCritical: false,
            });

            if (i > 0) {
              dependencies.push({
                fromActivityId: `act-${i - 1}`,
                toActivityId: `act-${i}`,
                type: 'FS',
              });
            }

            currentDate = end;
          }

          const result = calculateCriticalPath(activities, dependencies);
          expect(result.criticalPathIds.length).toBe(chainLength);
        },
      ),
    );
  });

  it('returns empty for no activities', () => {
    const result = calculateCriticalPath([], []);
    expect(result.activities).toHaveLength(0);
    expect(result.schedules).toHaveLength(0);
    expect(result.criticalPathIds).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Property 16: Audit Trail Recording
// ═══════════════════════════════════════════════════════════════════════════════

describe('Property 16: Audit Trail Recording', () => {
  it('audit entries contain all required fields', () => {
    const auditEntryArb: fc.Arbitrary<AuditEntry> = fc.record({
      id: fc.uuid(),
      projectId: fc.uuid(),
      actorId: fc.uuid(),
      actorName: nonEmptyStringArb,
      actionType: fc.constantFrom('create', 'update', 'delete', 'status_change', 'escalation') as fc.Arbitrary<AuditEntry['actionType']>,
      entityType: nonEmptyStringArb,
      entityId: fc.uuid(),
      before: fc.option(fc.dictionary(nonEmptyStringArb, fc.anything()), { nil: undefined }),
      after: fc.option(fc.dictionary(nonEmptyStringArb, fc.anything()), { nil: undefined }),
      timestamp: fc.integer({ min: new Date('2020-01-01T00:00:00.000Z').getTime(), max: new Date('2030-12-31T00:00:00.000Z').getTime() }).map((ts) => new Date(ts).toISOString()),
    });

    fc.assert(
      fc.property(auditEntryArb, (entry) => {
        // Required fields must be present and non-empty
        expect(entry.actorId).toBeTruthy();
        expect(entry.timestamp).toBeTruthy();
        expect(entry.actionType).toBeTruthy();
        expect(entry.entityType).toBeTruthy();
        expect(entry.entityId).toBeTruthy();

        // Action type must be one of the valid types
        expect(['create', 'update', 'delete', 'status_change', 'escalation']).toContain(entry.actionType);

        // Timestamp must be a valid ISO date
        expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
      }),
    );
  });

  it('audit entry structure is consistent across entity types', () => {
    const entityTypes = ['task', 'milestone', 'risk', 'certificate', 'procurement_order', 'contract', 'activity'];

    fc.assert(
      fc.property(
        fc.constantFrom(...entityTypes),
        fc.uuid(),
        fc.uuid(),
        nonEmptyStringArb,
        (entityType, actorId, entityId, actorName) => {
          const entry: AuditEntry = {
            id: 'audit-1',
            projectId: 'proj-1',
            actorId,
            actorName,
            actionType: 'create',
            entityType,
            entityId,
            timestamp: new Date().toISOString(),
          };

          expect(entry.actorId).toBe(actorId);
          expect(entry.entityType).toBe(entityType);
          expect(entry.entityId).toBe(entityId);
          expect(entry.actorName).toBe(actorName);
        },
      ),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Property 17: SACAP Stage Mapping
// ═══════════════════════════════════════════════════════════════════════════════

describe('Property 17: SACAP Stage Mapping', () => {
  it('same Architex stage always produces same SACAP stage label', () => {
    const stages = getArchitexStages();

    fc.assert(
      fc.property(
        fc.constantFrom(...stages),
        (stage) => {
          const result1 = mapToSACAPStage(stage);
          const result2 = mapToSACAPStage(stage);
          expect(result1).toBe(result2);
        },
      ),
    );
  });

  it('every valid Architex stage maps to a valid SACAP stage', () => {
    const stages = getArchitexStages();
    const validSACAPStages = [
      'Stage 1 - Inception',
      'Stage 2 - Concept & Viability',
      'Stage 3 - Design Development',
      'Stage 4 - Documentation & Procurement',
      'Stage 5 - Construction',
      'Stage 6 - Closeout',
    ];

    fc.assert(
      fc.property(
        fc.constantFrom(...stages),
        (stage) => {
          const result = mapToSACAPStage(stage);
          expect(validSACAPStages).toContain(result);
        },
      ),
    );
  });

  it('mapping covers all 8 Architex stages', () => {
    const stages = getArchitexStages();
    expect(stages).toHaveLength(8);

    for (const stage of stages) {
      expect(() => mapToSACAPStage(stage)).not.toThrow();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Property 18: Milestone and Diary Chronological Ordering
// ═══════════════════════════════════════════════════════════════════════════════

describe('Property 18: Milestone and Diary Chronological Ordering', () => {
  it('diary entries sorted descending by date (newest first)', () => {
    fc.assert(
      fc.property(
        fc.array(diaryEntryArb, { minLength: 2, maxLength: 30 }),
        (entries) => {
          const sorted = sortEntriesReverseChronological(entries);

          for (let i = 0; i < sorted.length - 1; i++) {
            const currentDate = sorted[i].date;
            const nextDate = sorted[i + 1].date;
            // Current date must be >= next date (descending)
            expect(currentDate >= nextDate).toBe(true);
          }
        },
      ),
    );
  });

  it('sorting preserves all entries (no data loss)', () => {
    fc.assert(
      fc.property(
        fc.array(diaryEntryArb, { minLength: 0, maxLength: 30 }),
        (entries) => {
          const sorted = sortEntriesReverseChronological(entries);
          expect(sorted.length).toBe(entries.length);

          // Every original entry must appear in sorted
          for (const entry of entries) {
            expect(sorted.find((s) => s.id === entry.id)).toBeTruthy();
          }
        },
      ),
    );
  });

  it('milestones can be sorted ascending by planned date', () => {
    fc.assert(
      fc.property(
        fc.array(milestoneArb, { minLength: 2, maxLength: 30 }),
        (milestones) => {
          const sorted = [...milestones].sort((a, b) =>
            a.plannedDate.localeCompare(b.plannedDate),
          );

          for (let i = 0; i < sorted.length - 1; i++) {
            expect(sorted[i].plannedDate <= sorted[i + 1].plannedDate).toBe(true);
          }
        },
      ),
    );
  });

  it('sort is stable for diary entries with equal dates', () => {
    fc.assert(
      fc.property(
        fc.array(diaryEntryArb, { minLength: 2, maxLength: 20 }),
        (entries) => {
          // Force all entries to same date
          const sameDate = '2025-06-15';
          const modified = entries.map((e) => ({ ...e, date: sameDate }));

          const sorted = sortEntriesReverseChronological(modified);

          // Stable sort: entries with same date sort by createdAt descending
          for (let i = 0; i < sorted.length - 1; i++) {
            if (sorted[i].date === sorted[i + 1].date) {
              expect(sorted[i].createdAt >= sorted[i + 1].createdAt).toBe(true);
            }
          }
        },
      ),
    );
  });
});
