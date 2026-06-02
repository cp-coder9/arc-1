import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EXTERNAL_ACTIONS_DRY_RUN_FLAG,
  SENSITIVE_WORKFLOW_FLAGS,
  assertSensitiveWorkflowEnabled,
  assertSensitiveWorkflowPreflight,
  preflightSensitiveWorkflow,
  requireSensitiveWorkflowEnabled,
  resolveSensitiveWorkflowFlag,
  type SensitiveWorkflowEnv,
} from '../sensitiveWorkflowGuards';

const env = (values: SensitiveWorkflowEnv = {}) => values;
const sensitiveWorkflowDocs = readFileSync(resolve(process.cwd(), 'docs/backend/sensitive-workflow-feature-flags.md'), 'utf8');

describe('sensitive workflow guards', () => {
  it('keeps the operational docs aligned with every sensitive workflow flag', () => {
    expect(sensitiveWorkflowDocs).toContain(`${EXTERNAL_ACTIONS_DRY_RUN_FLAG}=true`);
    for (const flagName of Object.values(SENSITIVE_WORKFLOW_FLAGS)) {
      expect(sensitiveWorkflowDocs, `Expected docs to include default for ${flagName}`).toContain(`${flagName}=false`);
      expect(sensitiveWorkflowDocs, `Expected docs to include launch flag reference for ${flagName}`).toContain(`${flagName}=true`);
    }
  });

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

  it('requires human confirmation and idempotency keys before any provider submission preflight can pass', () => {
    const result = preflightSensitiveWorkflow({
      workflow: 'livePayments',
      actorId: 'client-1',
      targetType: 'invoice',
      targetId: 'invoice-1',
      action: 'payment.checkout.create',
      provider: 'payfast',
      env: env({
        [SENSITIVE_WORKFLOW_FLAGS.livePayments]: 'true',
        [EXTERNAL_ACTIONS_DRY_RUN_FLAG]: 'false',
      }),
    });

    expect(result.canSubmitToProvider).toBe(false);
    expect(result.missingHumanConfirmation).toBe(true);
    expect(result.missingIdempotencyKey).toBe(true);
    expect(result.safeResponse).toMatchObject({
      canSubmitToProvider: false,
      externalActionQueued: false,
      createsPayment: false,
      createsContract: false,
      createsSignature: false,
      submitsToProvider: false,
      auditAction: 'payment.checkout.create',
    });
    expect(result.guard.reason).toContain('humanConfirmationId is required');
    expect(result.guard.reason).toContain('idempotencyKey is required');
  });

  it('creates an audit-ready preflight event only when flag, dry-run, human confirmation, and idempotency gates pass', () => {
    const result = preflightSensitiveWorkflow({
      workflow: 'eSignatureSubmission',
      actorId: 'bep-1',
      targetType: 'appointment_contract',
      targetId: 'contract-1',
      action: 'signature.provider.submit',
      provider: 'signing-provider',
      humanConfirmationId: 'confirm-1',
      idempotencyKey: 'idem-1',
      env: env({
        [SENSITIVE_WORKFLOW_FLAGS.eSignatureSubmission]: 'true',
        [EXTERNAL_ACTIONS_DRY_RUN_FLAG]: 'false',
      }),
    });

    expect(result.canSubmitToProvider).toBe(true);
    expect(result.guard.allowed).toBe(true);
    expect(result.auditEvent).toMatchObject({
      category: 'sensitive_workflow',
      action: 'signature.provider.submit',
      actorId: 'bep-1',
      target: { type: 'appointment_contract', id: 'contract-1' },
      provider: 'signing-provider',
      humanConfirmationId: 'confirm-1',
      idempotencyKey: 'idem-1',
    });
  });

  it('throws a 403-style preflight error when the provider submission gates fail', () => {
    expect(() => assertSensitiveWorkflowPreflight({
      workflow: 'escrowReleases',
      actorId: 'client-1',
      targetType: 'escrow_milestone',
      targetId: 'milestone-1',
      action: 'escrow.release.submit',
      env: env({
        [SENSITIVE_WORKFLOW_FLAGS.escrowReleases]: 'true',
        [EXTERNAL_ACTIONS_DRY_RUN_FLAG]: 'false',
      }),
    })).toThrowError(/humanConfirmationId is required/);
  });
});
