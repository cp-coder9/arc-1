import { describe, expect, it } from "vitest";
import { evaluateBbbeeProcurementAudit } from "../bbbeeProcurementAuditService";

describe("bbbeeProcurementAuditService", () => {
  it("blocks public/high-value awards until B-BBEE certificate and spend evidence are verified", () => {
    const result = evaluateBbbeeProcurementAudit({
      projectId: "project-proc-1",
      procurement: { publicSector: true, estimatedValue: 2_500_000, localSpendTargetPercent: 40 },
      supplier: { supplierId: "supplier-1", bbbeeLevel: 2, blackOwnershipPercent: 51, localSupplier: true },
      evidence: { taxClearanceRef: "blob://tax.pdf" },
      spend: [
        { supplierId: "supplier-1", amount: 100_000, bbbeeRecognized: true, localSpend: true, verified: false },
        { supplierId: "supplier-2", amount: 300_000, bbbeeRecognized: false, localSpend: false, verified: true },
      ],
      checks: { certificateVerified: false, certificateCurrent: false, scorecardReviewed: false, spendVerified: false, preferentialScoringApproved: false },
    });

    expect(result.required).toBe(true);
    expect(result.status).toBe("blocked");
    expect(result.riskLevel).toBe("high");
    expect(result.missingEvidence).toEqual(["SANAS B-BBEE certificate or sworn affidavit reference", "preferential procurement scorecard reference"]);
    expect(result.blockers).toContain("B-BBEE certificate/affidavit must be verified before award readiness.");
    expect(result.blockers).toContain("B-BBEE/local spend entries must be verified before dashboard totals are trusted.");
    expect(result.metrics).toMatchObject({ totalSpend: 400_000, verifiedSpend: 300_000, bbbeeRecognizedSpend: 0, localSpend: 0, localSpendPercent: 0 });
    expect(result.nextAction).toMatchObject({ label: "Resolve B-BBEE procurement audit blockers", target: "procurement", priority: "high", requiresHumanConfirmation: true, automationLevel: "advisory" });
    expect(result.audit).toEqual({ prdSection: "Section 48: Local Sourcing & B-BBEE Procurement Auditing", noAutomaticAward: true, noCertificateMutation: true, humanReviewRequired: true });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("marks verified B-BBEE evidence ready for award review and computes recognized spend", () => {
    const result = evaluateBbbeeProcurementAudit({
      procurement: { estimatedValue: 1_200_000, localSpendTargetPercent: 50 },
      supplier: { supplierId: "supplier-1", bbbeeLevel: 1, blackOwnershipPercent: 60, localSupplier: true },
      evidence: { bbbeeCertificateRef: "blob://bee.pdf", preferentialScorecardRef: "blob://score.pdf", taxClearanceRef: "blob://tax.pdf" },
      spend: [
        { supplierId: "supplier-1", amount: 600_000, bbbeeRecognized: true, localSpend: true, verified: true },
        { supplierId: "supplier-2", amount: 200_000, bbbeeRecognized: true, localSpend: false, verified: true },
      ],
      checks: { certificateVerified: true, certificateCurrent: true, scorecardReviewed: true, spendVerified: true, preferentialScoringApproved: true },
    });

    expect(result.status).toBe("ready_for_award_review");
    expect(result.riskLevel).toBe("low");
    expect(result.blockers).toEqual([]);
    expect(result.metrics.bbbeeRecognizedSpend).toBe(800_000);
    expect(result.metrics.localSpendPercent).toBe(75);
    expect(result.nextAction.label).toBe("Approve B-BBEE procurement audit for award review");
    expect(result.audit.noAutomaticAward).toBe(true);
  });

  it("does not require B-BBEE audit for low-value private procurement without policy trigger", () => {
    const result = evaluateBbbeeProcurementAudit({ procurement: { publicSector: false, estimatedValue: 75_000 }, supplier: { supplierId: "supplier-1" } });
    expect(result.required).toBe(false);
    expect(result.status).toBe("not_required");
    expect(result.missingEvidence).toEqual([]);
    expect(result.nextAction.label).toBe("Confirm B-BBEE procurement audit not required");
  });
});
