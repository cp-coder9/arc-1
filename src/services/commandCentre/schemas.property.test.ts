/**
 * Property 1: Entity Creation Validation
 *
 * - For any entity type, missing required fields → rejection
 * - All required fields valid → success
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  createTaskSchema,
  createMilestoneSchema,
  createRiskSchema,
  createSnagSchema,
  createRFISchema,
  createProcurementOrderSchema,
  createContractSchema,
  createProjectSchema,
  TaskPriorityEnum,
  RiskCategoryEnum,
  RiskSeverityEnum,
  SnagSeverityEnum,
  ContractFormEnum,
} from './schemas';

// ── Arbitraries ──────────────────────────────────────────────────────────────

const isoDateArb = fc.integer({
  min: new Date('2020-01-01T00:00:00.000Z').getTime(),
  max: new Date('2030-12-31T00:00:00.000Z').getTime(),
}).map((ts) => new Date(ts).toISOString().split('T')[0]);

const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0);
const positiveNumberArb = fc.double({ min: 0.01, max: 1_000_000_000, noNaN: true, noDefaultInfinity: true });
const priorityArb = fc.constantFrom('low', 'medium', 'high', 'critical');
const riskCategoryArb = fc.constantFrom('supply_chain', 'resource', 'quality', 'compliance', 'commercial', 'safety');
const riskSeverityArb = fc.constantFrom('critical', 'high', 'medium', 'low');
const snagSeverityArb = fc.constantFrom('high', 'medium', 'low');
const contractFormArb = fc.constantFrom('jbcc_pba', 'jbcc_ns', 'jbcc_mwa', 'nec_ecc', 'nec_psc', 'nec_tsc', 'custom');

// ── Property Tests ───────────────────────────────────────────────────────────

describe('Property 1: Entity Creation Validation', () => {
  describe('createTaskSchema', () => {
    it('accepts valid input with all required fields', () => {
      fc.assert(
        fc.property(
          nonEmptyStringArb,
          nonEmptyStringArb,
          priorityArb,
          isoDateArb,
          (title, assigneeId, priority, dueDate) => {
            const result = createTaskSchema.safeParse({ title, assigneeId, priority, dueDate });
            expect(result.success).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('rejects input with missing title', () => {
      fc.assert(
        fc.property(
          nonEmptyStringArb,
          priorityArb,
          isoDateArb,
          (assigneeId, priority, dueDate) => {
            const result = createTaskSchema.safeParse({ title: '', assigneeId, priority, dueDate });
            expect(result.success).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('rejects input with missing assigneeId', () => {
      fc.assert(
        fc.property(
          nonEmptyStringArb,
          priorityArb,
          isoDateArb,
          (title, priority, dueDate) => {
            const result = createTaskSchema.safeParse({ title, assigneeId: '', priority, dueDate });
            expect(result.success).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('createMilestoneSchema', () => {
    it('accepts valid input with required fields', () => {
      fc.assert(
        fc.property(nonEmptyStringArb, isoDateArb, (name, plannedDate) => {
          const result = createMilestoneSchema.safeParse({ name, plannedDate });
          expect(result.success).toBe(true);
        }),
        { numRuns: 100 },
      );
    });

    it('rejects input with empty name', () => {
      fc.assert(
        fc.property(isoDateArb, (plannedDate) => {
          const result = createMilestoneSchema.safeParse({ name: '', plannedDate });
          expect(result.success).toBe(false);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('createRiskSchema', () => {
    it('accepts valid input with all required fields', () => {
      fc.assert(
        fc.property(
          nonEmptyStringArb,
          riskCategoryArb,
          riskSeverityArb,
          nonEmptyStringArb,
          (description, category, severity, ownerId) => {
            const result = createRiskSchema.safeParse({ description, category, severity, ownerId });
            expect(result.success).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('rejects input with missing description', () => {
      fc.assert(
        fc.property(riskCategoryArb, riskSeverityArb, nonEmptyStringArb, (category, severity, ownerId) => {
          const result = createRiskSchema.safeParse({ description: '', category, severity, ownerId });
          expect(result.success).toBe(false);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('createSnagSchema', () => {
    it('accepts valid input with all required fields', () => {
      fc.assert(
        fc.property(
          nonEmptyStringArb,
          nonEmptyStringArb,
          snagSeverityArb,
          nonEmptyStringArb,
          (description, location, severity, assignedPartyId) => {
            const result = createSnagSchema.safeParse({ description, location, severity, assignedPartyId });
            expect(result.success).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('rejects input with missing location', () => {
      fc.assert(
        fc.property(nonEmptyStringArb, snagSeverityArb, nonEmptyStringArb, (description, severity, assignedPartyId) => {
          const result = createSnagSchema.safeParse({ description, location: '', severity, assignedPartyId });
          expect(result.success).toBe(false);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('createRFISchema', () => {
    it('accepts valid input with all required fields', () => {
      fc.assert(
        fc.property(
          nonEmptyStringArb,
          nonEmptyStringArb,
          nonEmptyStringArb,
          priorityArb,
          (subject, description, addresseeId, priority) => {
            const result = createRFISchema.safeParse({ subject, description, addresseeId, priority });
            expect(result.success).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('rejects input with missing subject', () => {
      fc.assert(
        fc.property(nonEmptyStringArb, nonEmptyStringArb, priorityArb, (description, addresseeId, priority) => {
          const result = createRFISchema.safeParse({ subject: '', description, addresseeId, priority });
          expect(result.success).toBe(false);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('createProcurementOrderSchema', () => {
    it('accepts valid input with all required fields', () => {
      fc.assert(
        fc.property(
          nonEmptyStringArb,
          nonEmptyStringArb,
          positiveNumberArb,
          isoDateArb,
          (description, supplierId, value, expectedDeliveryDate) => {
            const result = createProcurementOrderSchema.safeParse({ description, supplierId, value, expectedDeliveryDate });
            expect(result.success).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('rejects input with non-positive value', () => {
      fc.assert(
        fc.property(
          nonEmptyStringArb,
          nonEmptyStringArb,
          fc.double({ min: -1_000_000, max: 0, noNaN: true, noDefaultInfinity: true }),
          isoDateArb,
          (description, supplierId, value, expectedDeliveryDate) => {
            const result = createProcurementOrderSchema.safeParse({ description, supplierId, value, expectedDeliveryDate });
            expect(result.success).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('createContractSchema', () => {
    it('accepts valid input with all required fields', () => {
      fc.assert(
        fc.property(
          nonEmptyStringArb,
          nonEmptyStringArb,
          positiveNumberArb,
          contractFormArb,
          isoDateArb,
          isoDateArb,
          (contractorSupplier, scope, value, form, startDate, expiryDate) => {
            const result = createContractSchema.safeParse({ contractorSupplier, scope, value, form, startDate, expiryDate });
            expect(result.success).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('rejects input with missing scope', () => {
      fc.assert(
        fc.property(
          nonEmptyStringArb,
          positiveNumberArb,
          contractFormArb,
          isoDateArb,
          isoDateArb,
          (contractorSupplier, value, form, startDate, expiryDate) => {
            const result = createContractSchema.safeParse({ contractorSupplier, scope: '', value, form, startDate, expiryDate });
            expect(result.success).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('createProjectSchema', () => {
    it('accepts valid input with all required fields', () => {
      fc.assert(
        fc.property(
          nonEmptyStringArb,
          nonEmptyStringArb,
          positiveNumberArb,
          nonEmptyStringArb,
          nonEmptyStringArb,
          nonEmptyStringArb,
          (name, clientId, estimatedValue, projectType, location, estimatedDuration) => {
            const result = createProjectSchema.safeParse({ name, clientId, estimatedValue, projectType, location, estimatedDuration });
            expect(result.success).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('rejects input with missing name', () => {
      fc.assert(
        fc.property(
          nonEmptyStringArb,
          positiveNumberArb,
          nonEmptyStringArb,
          nonEmptyStringArb,
          nonEmptyStringArb,
          (clientId, estimatedValue, projectType, location, estimatedDuration) => {
            const result = createProjectSchema.safeParse({ name: '', clientId, estimatedValue, projectType, location, estimatedDuration });
            expect(result.success).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
