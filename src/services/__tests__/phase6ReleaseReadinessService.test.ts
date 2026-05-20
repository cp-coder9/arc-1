import {
  PHASE6_ENVIRONMENT_REQUIREMENTS,
  PHASE6_RELEASE_GATES,
  PHASE6_SECURITY_RULE_MATRIX,
  buildPhase6ReleaseReadinessReport,
  buildPhase6RollbackPlan,
  buildPhase6DryRunMigrationPlan,
  evaluatePhase6GateResults,
  classifyEnvironmentVariables,
} from ../phase6ReleaseReadinessService;

describe(phase6ReleaseReadinessService, () => {
  it(defines the required security rule matrix for Phase 1-5 collections, () => {
    const collectionKeys = PHASE6_SECURITY_RULE_MATRIX.map((entry) => entry.collection);

    expect(collectionKeys).toEqual(expect.arrayContaining([
      users,
      firms,
      firmInvites,
      cpdCourses,
      cpdRecords,
      subscriptions,
      credits,
      ledger,
      escrow,
      materialOrders,
      supplierQuotes,
      aiActionLogs,
      auditLogs,
    ]));
    expect(PHASE6_SECURITY_RULE_MATRIX.every((entry) => entry.allowCases.length > 0 && entry.denyCases.length > 0)).toBe(true);
    expect(PHASE6_SECURITY_RULE_MATRIX.find((entry) => entry.collection === ledger)?.denyCases).toContain(browser_user_direct_write);
    expect(PHASE6_SECURITY_RULE_MATRIX.find((entry) => entry.collection === cpdRecords)?.denyCases).toContain(professional_self_awards_points);
    expect(PHASE6_SECURITY_RULE_MATRIX.find((entry) => entry.collection === firms)?.denyCases).toContain(member_self_escalates_role);
  });

  it(builds dry-run migration plans that are idempotent and rollback aware, () => {
    const plan = buildPhase6DryRunMigrationPlan({
      version: 2026.05.phase6,
      requestedBy: admin-1,
      targetCollections: [users, firms, subscriptions],
      estimatedWrites: 42,
    });

    expect(plan.mode).toBe(dry-run);
    expect(plan.idempotencyKey).toBe(phase6:2026.05.phase6:users,firms,subscriptions);
    expect(plan.steps).toEqual(expect.arrayContaining([
      snapshot_current_counts,
      validate_source_documents,
      compute_backfill_mutations_without_writing,
      write_migration_report,
    ]));
    expect(plan.rollback.requiredArtifacts).toEqual(expect.arrayContaining([pre_migration_export, mutation_report, release_commit_sha]));
    expect(Object.isFrozen(plan)).toBe(true);
    expect(() => buildPhase6DryRunMigrationPlan({ version: , requestedBy: admin-1, targetCollections: [users], estimatedWrites: 1 })).toThrow(Migration version is required);
    expect(() => buildPhase6DryRunMigrationPlan({ version: v1, requestedBy: admin-1, targetCollections: [], estimatedWrites: 1 })).toThrow(At least one target collection);
  });

  it(classifies environment variables without leaking server-only secrets to browser bundles, () => {
    const env = classifyEnvironmentVariables({
      PAYFAST_MERCHANT_ID: merchant,
      PAYFAST_MERCHANT_KEY: secret,
      VITE_FIREBASE_API_KEY: browser-safe,
      SUPPLIER_API_KEY: ,
      BLOB_READ_WRITE_TOKEN: blob-secret,
    });

    expect(env.serverOnly.present).toEqual(expect.arrayContaining([PAYFAST_MERCHANT_ID, PAYFAST_MERCHANT_KEY, BLOB_READ_WRITE_TOKEN]));
    expect(env.serverOnly.missing).toContain(SUPPLIER_API_KEY);
    expect(env.browserExposed.present).toContain(VITE_FIREBASE_API_KEY);
    expect(env.leakWarnings).toEqual([]);

    const leaked = classifyEnvironmentVariables({ VITE_PAYFAST_MERCHANT_KEY: leaked });
    expect(leaked.leakWarnings[0]).toContain(VITE_PAYFAST_MERCHANT_KEY);
  });

  it(evaluates release gates with no-go blockers for security, payments, migrations, and tests, () => {
    const result = evaluatePhase6GateResults([
      { gateId: security-rules, status: pass, evidence: rules emulator passed },
      { gateId: payment-webhooks, status: blocked, evidence: missing PayFast sandbox },
      { gateId: dry-run-migrations, status: pass, evidence: dry run generated report },
      { gateId: e2e-role-flows, status: fail, evidence: contractor flow failed },
    ]);

    expect(result.canRelease).toBe(false);
    expect(result.blockers).toEqual([
      payment-webhooks: missing PayFast sandbox,
      e2e-role-flows: contractor flow failed,
    ]);
    expect(result.passedGateIds).toEqual([security-rules, dry-run-migrations]);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it(builds a complete Phase 6 report and rollback plan from canonical gates, () => {
    const report = buildPhase6ReleaseReadinessReport({
      generatedAt: 2026-05-21T00:00:00.000Z,
      generatedBy: hermes,
      gateResults: PHASE6_RELEASE_GATES.map((gate) => ({ gateId: gate.id, status: pass as const, evidence: `${gate.id} checked` })),
      environment: { PAYFAST_MERCHANT_ID: merchant, PAYFAST_MERCHANT_KEY: key, BLOB_READ_WRITE_TOKEN: blob, FIREBASE_SERVICE_ACCOUNT_JSON: {}, SUPPLIER_API_KEY: supplier, LLM_PROVIDER_API_KEY: llm, VITE_FIREBASE_API_KEY: browser },
    });

    expect(report.canRelease).toBe(true);
    expect(report.securityMatrixCount).toBe(PHASE6_SECURITY_RULE_MATRIX.length);
    expect(report.requiredEnvironmentCount).toBe(PHASE6_ENVIRONMENT_REQUIREMENTS.length);
    expect(report.noGoConditions).toContain(Any failed or blocked required release gate);
    expect(report.rollbackPlan.steps[0]).toBe(pause_deployments_and_background_jobs);
    expect(buildPhase6RollbackPlan(commit-1).releaseCommitSha).toBe(commit-1);
    expect(Object.isFrozen(report)).toBe(true);
  });
});
