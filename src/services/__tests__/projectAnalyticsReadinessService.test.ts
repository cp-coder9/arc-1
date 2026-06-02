import { describe, expect, it } from "vitest";
import { evaluateProjectAnalyticsReadiness } from "../projectAnalyticsReadinessService";

describe("projectAnalyticsReadinessService", () => {
  it("blocks completed-project analytics capture until anonymised metadata and audit evidence are complete", () => {
    const result = evaluateProjectAnalyticsReadiness({
      projectId: "ATX-0427",
      stage: "Stage 8 final completion",
      finalCompletionAccepted: true,
      anonymisation: { piiRemoved: false, projectIdHashed: true, consentOrLegitimateInterestRecorded: false },
      metadata: { actualCostPerSqmByTrade: { structure: 8200 }, municipalTurnaroundDays: 47, contractorDelayDays: 9 },
      auditTrail: { completionSnapshotRef: "blob://completion.json" },
    });

    expect(result.required).toBe(true);
    expect(result.status).toBe("blocked");
    expect(result.riskLevel).toBe("high");
    expect(result.missingMetadata).toEqual(["baseline estimate per sqm", "vendor reliability ratings", "material delivery delay duration", "subcontractor package performance", "anonymisation audit log reference", "analytics indexing approval reference"]);
    expect(result.blockers).toContain("PII must be removed before completed-project metadata can be indexed.");
    expect(result.derivedMetrics).toEqual({ tradeCount: 1, averageActualCostPerSqm: 8200, delayDays: 9, hasVendorRatings: false });
    expect(result.nextAction).toMatchObject({ label: "Resolve anonymised analytics capture blockers", target: "analytics-audit", requiresHumanConfirmation: true, automationLevel: "advisory" });
    expect(result.audit).toEqual({ prdSection: "Section 52: Closed-Loop Machine Learning & Project Analytics", anonymisedOnly: true, noTrainingSideEffects: true, humanReviewRequired: true });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("marks anonymised complete metadata ready for indexing review without ML training side effects", () => {
    const result = evaluateProjectAnalyticsReadiness({
      finalCompletionAccepted: true,
      anonymisation: { piiRemoved: true, projectIdHashed: true, consentOrLegitimateInterestRecorded: true },
      metadata: { actualCostPerSqmByTrade: { structure: 8000, finishes: 6000 }, baselineEstimatePerSqm: 7000, municipalTurnaroundDays: 40, municipality: "eThekwini", contractorDelayDays: 2, vendorReliabilityRatings: { supplierA: 4.5 }, materialDeliveryDelayDays: 3, subcontractorPackagePerformance: { roofing: "on_time" } },
      auditTrail: { completionSnapshotRef: "blob://completion.json", anonymisationLogRef: "blob://anon.json", analyticsIndexApprovalRef: "blob://approval.json", capturedBy: "admin-1", capturedAtIso: "2026-05-26T00:00:00.000Z" },
    });

    expect(result.status).toBe("ready_for_indexing_review");
    expect(result.blockers).toEqual([]);
    expect(result.derivedMetrics).toEqual({ tradeCount: 2, averageActualCostPerSqm: 7000, delayDays: 5, hasVendorRatings: true });
    expect(result.nextAction.label).toBe("Approve anonymised project metadata for indexing");
    expect(result.audit.noTrainingSideEffects).toBe(true);
  });

  it("does not capture analytics before final completion", () => {
    const result = evaluateProjectAnalyticsReadiness({ stage: "Stage 5 construction documentation" });
    expect(result.required).toBe(false);
    expect(result.status).toBe("not_ready");
    expect(result.nextAction.label).toBe("Wait for final completion before analytics capture");
  });
});
