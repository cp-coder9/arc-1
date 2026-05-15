import { describe, expect, it } from 'vitest';
import {
  EXTERNAL_ACTIONS_DRY_RUN_FLAG,
  SENSITIVE_WORKFLOW_FLAGS,
  assertSensitiveWorkflowEnabled,
  requireSensitiveWorkflowEnabled,
  resolveSensitiveWorkflowFlag,
  type SensitiveWorkflowEnv,
} from '../sensitiveWorkflowGuards';

const env = (values: SensitiveWorkflowEnv = {}) => values;

describe('sensitive workflow guards', () => {
  it('keeps every sensitive workflow default-off and in dry-run posture', () => {
    for (const [workflow, flagName] of Object.entries(SENSITIVE_WORKFLOW_FLAGS)) {
      const result = requireSensitiveWorkflowEnabled(workflow as keyof typeof SENSITIVE_WORKFLOW_FLAGS, env());

      expect(result).toMatchObject({
        flagName,
        allowed: false,
        dryRun: true,
        requiresHumanConfirmation: true,
        externalActionQueued: false,
        createsPayment: false,
        createsContract: false,
        createsSignature: false,
        submitsToProvider: false,
      });
      expect(result.reason).toContain(flagName);
    }
  });

  it('does not allow live action when the workflow flag is true but global dry-run remains enabled', () => {
    const result = requireSensitiveWorkflowEnabled('livePayments', env({
      [SENSITIVE_WORKFLOW_FLAGS.livePayments]: 'true',
    }));

    expect(result.allowed).toBe(false);
    expect(result.dryRun).toBe(true);
    expect(result.requiresHumanConfirmation).toBe(true);
    expect(result.createsPayment).toBe(false);
  });

  it('allows a workflow only when the specific flag is true and dry-run is explicitly false', () => {
    const result = requireSensitiveWorkflowEnabled('municipalSubmissions', env({
      [SENSITIVE_WORKFLOW_FLAGS.municipalSubmissions]: 'true',
      [EXTERNAL_ACTIONS_DRY_RUN_FLAG]: 'false',
    }));

    expect(result).toMatchObject({
      flagName: SENSITIVE_WORKFLOW_FLAGS.municipalSubmissions,
      allowed: true,
      dryRun: false,
      requiresHumanConfirmation: false,
      externalActionQueued: false,
      createsPayment: false,
      createsContract: false,
      createsSignature: false,
      submitsToProvider: false,
    });
    expect(result.reason).toBeUndefined();
  });

  it('resolves either friendly workflow keys or raw environment flag names', () => {
    expect(resolveSensitiveWorkflowFlag('escrowReleases')).toBe(SENSITIVE_WORKFLOW_FLAGS.escrowReleases);
    expect(resolveSensitiveWorkflowFlag('ARCHITEX_ENABLE_ESCROW_RELEASES')).toBe(SENSITIVE_WORKFLOW_FLAGS.escrowReleases);
  });

  it('throws a 403-style error with the safe response payload when assertion fails', () => {
    expect(() => assertSensitiveWorkflowEnabled('supplierOrdering', env({
      [SENSITIVE_WORKFLOW_FLAGS.supplierOrdering]: 'false',
      [EXTERNAL_ACTIONS_DRY_RUN_FLAG]: 'false',
    }))).toThrowError(/ARCHITEX_ENABLE_SUPPLIER_ORDERING/);

    try {
      assertSensitiveWorkflowEnabled('supplierOrdering', env({
        [SENSITIVE_WORKFLOW_FLAGS.supplierOrdering]: 'false',
        [EXTERNAL_ACTIONS_DRY_RUN_FLAG]: 'false',
      }));
    } catch (error) {
      expect(error).toMatchObject({
        status: 403,
        sensitiveWorkflowGuard: {
          allowed: false,
          dryRun: false,
          externalActionQueued: false,
          submitsToProvider: false,
        },
      });
    }
  });
});
