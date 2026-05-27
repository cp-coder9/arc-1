export type MigrationRehearsalGateStatus = 'ready' | 'blocked';

export interface MigrationCollectionCoverageInput {
  collection: string;
  backupRequired: boolean;
  dryRunRequired: boolean;
  rollbackRequired: boolean;
}

export interface MigrationRehearsalReadinessInput {
  stagingProjectId?: string;
  serviceAccountApproved: boolean;
  backupApproved: boolean;
  targetCollections: string[];
  releaseCommitSha: string;
}

export interface MigrationRehearsalReadinessProjection {
  status: MigrationRehearsalGateStatus;
  blockers: string[];
  requiredCollections: string[];
  backupPlan: string[];
  dryRunSteps: string[];
  rollbackSteps: string[];
  collectionCoverage: MigrationCollectionCoverageInput[];
  audit: {
    mode: 'rehearsal_plan_only';
    mutatesProduction: false;
    requiresHumanApproval: true;
  };
}

export const REQUIRED_MIGRATION_REHEARSAL_COLLECTIONS = Object.freeze([
  'users',
  'profiles',
  'firms',
  'projects',
  'jobs',
  'work_packages',
  'submissions',
  'notifications',
  'payments',
  'ledger',
  'escrow',
  'cpd_certificates',
  'governance_audit_logs',
]);

export function projectMigrationRehearsalReadiness(input: MigrationRehearsalReadinessInput): MigrationRehearsalReadinessProjection {
  const blockers = [
    ...(!input.stagingProjectId?.trim() ? ['Staging Firebase project ID must be approved before rehearsal.'] : []),
    ...(!input.serviceAccountApproved ? ['Staging service account approval is required.'] : []),
    ...(!input.backupApproved ? ['Backup/export approval is required before dry-run rehearsal.'] : []),
    ...(!input.releaseCommitSha.trim() ? ['Release commit SHA is required for rollback traceability.'] : []),
    ...REQUIRED_MIGRATION_REHEARSAL_COLLECTIONS
      .filter((collection) => !input.targetCollections.includes(collection))
      .map((collection) => `Missing migration rehearsal coverage for ${collection}.`),
  ];

  return Object.freeze({
    status: blockers.length === 0 ? 'ready' : 'blocked',
    blockers: Object.freeze(blockers) as unknown as string[],
    requiredCollections: Object.freeze([...REQUIRED_MIGRATION_REHEARSAL_COLLECTIONS]) as unknown as string[],
    backupPlan: Object.freeze([
      'export_firestore_staging_before_rehearsal',
      'record_collection_counts_and_checksums',
      'store_export_uri_and_retention_window',
      'require_human_approval_before_any_write_mode',
    ]) as unknown as string[],
    dryRunSteps: Object.freeze([
      'load_staging_export_metadata',
      'validate_source_documents_and_required_fields',
      'compute_idempotent_mutation_plan_without_writes',
      'compare_before_after_counts',
      'write_dry_run_report_artifact',
    ]) as unknown as string[],
    rollbackSteps: Object.freeze([
      'pause_deployments_background_jobs_and_webhooks',
      'restore_previous_static_and_api_bundle',
      'restore_previous_firestore_rules',
      'restore_firestore_export_if_write_mode_was_approved',
      'rerun_smoke_and_security_rule_tests',
      'resume_only_after_human_release_owner_signoff',
    ]) as unknown as string[],
    collectionCoverage: Object.freeze(REQUIRED_MIGRATION_REHEARSAL_COLLECTIONS.map((collection) => Object.freeze({
      collection,
      backupRequired: true,
      dryRunRequired: true,
      rollbackRequired: true,
    }))) as unknown as MigrationCollectionCoverageInput[],
    audit: Object.freeze({
      mode: 'rehearsal_plan_only',
      mutatesProduction: false,
      requiresHumanApproval: true,
    }),
  });
}
