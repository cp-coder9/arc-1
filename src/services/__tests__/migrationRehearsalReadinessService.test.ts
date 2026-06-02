import {
  REQUIRED_MIGRATION_REHEARSAL_COLLECTIONS,
  projectMigrationRehearsalReadiness,
} from '../migrationRehearsalReadinessService';

describe('migrationRehearsalReadinessService', () => {
  it('blocks rehearsal until staging credentials, backup approval, release SHA, and collection coverage exist', () => {
    const projection = projectMigrationRehearsalReadiness({
      serviceAccountApproved: false,
      backupApproved: false,
      targetCollections: ['users'],
      releaseCommitSha: '',
    });

    expect(projection.status).toBe('blocked');
    expect(projection.blockers).toEqual(expect.arrayContaining([
      'Staging Firebase project ID must be approved before rehearsal.',
      'Staging service account approval is required.',
      'Backup/export approval is required before dry-run rehearsal.',
      'Release commit SHA is required for rollback traceability.',
      'Missing migration rehearsal coverage for payments.',
      'Missing migration rehearsal coverage for governance_audit_logs.',
    ]));
    expect(projection.audit).toEqual({
      mode: 'rehearsal_plan_only',
      mutatesProduction: false,
      requiresHumanApproval: true,
    });
  });

  it('projects complete dry-run, backup, rollback, and collection coverage when approvals are present', () => {
    const projection = projectMigrationRehearsalReadiness({
      stagingProjectId: 'architex-staging',
      serviceAccountApproved: true,
      backupApproved: true,
      targetCollections: [...REQUIRED_MIGRATION_REHEARSAL_COLLECTIONS],
      releaseCommitSha: 'abc123',
    });

    expect(projection.status).toBe('ready');
    expect(projection.blockers).toEqual([]);
    expect(projection.backupPlan).toContain('export_firestore_staging_before_rehearsal');
    expect(projection.dryRunSteps).toContain('compute_idempotent_mutation_plan_without_writes');
    expect(projection.rollbackSteps).toContain('restore_firestore_export_if_write_mode_was_approved');
    expect(projection.collectionCoverage).toHaveLength(REQUIRED_MIGRATION_REHEARSAL_COLLECTIONS.length);
    expect(projection.collectionCoverage.every((entry) => entry.backupRequired && entry.dryRunRequired && entry.rollbackRequired)).toBe(true);
    expect(Object.isFrozen(projection)).toBe(true);
  });
});
