import { describe, expect, it } from "vitest";
import { evaluateTrussCertificationReadiness } from "../trussCertificationReadinessService";

describe("trussCertificationReadinessService", () => {
  it("blocks timber roof milestones until ITC-SA design pack and A19 evidence are complete", () => {
    const result = evaluateTrussCertificationReadiness({
      projectId: "project-truss-1",
      scopeTags: ["timber roof", "truss fabrication", "SA Pine"],
      roof: { timberTrusses: true, roofCoveringPending: true, structuralTimberSpecies: "S5 SA Pine", windLoadingRegion: "coastal" },
      evidence: { trussLayoutRef: "blob://truss-layout.pdf" },
      checks: { manufacturerPackReviewed: false, windLoadingChecked: false, bracingChecked: false, engineerInspectionComplete: false, a19CertificateUploaded: false, roofCoveringReleaseApproved: false },
    });

    expect(result.required).toBe(true);
    expect(result.status).toBe("blocked");
    expect(result.riskLevel).toBe("high");
    expect(result.missingEvidence).toEqual([
      "truss manufacturer engineering design pack reference",
      "wind bracing / loading calculation reference",
      "registered engineer inspection reference",
      "ITC-SA / A19 structural timber roof certificate reference",
    ]);
    expect(result.blockers).toContain("Roof covering release must remain blocked until engineer inspection and A19 certificate evidence are approved.");
    expect(result.nextAction).toMatchObject({ label: "Resolve truss certification blockers", target: "snagging", priority: "high", requiresHumanConfirmation: true, automationLevel: "advisory" });
    expect(result.audit).toEqual({ prdSection: "Section 50: Structural Timber & Truss Certification (SANS 10082 & ITC-SA A19)", noPaymentRelease: true, noRoofCoveringRelease: true, humanReviewRequired: true });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("marks complete truss evidence ready for professional review without releasing payment automatically", () => {
    const result = evaluateTrussCertificationReadiness({
      scopeTags: ["roof trusses"],
      roof: { timberTrusses: true, roofCoveringPending: false, structuralTimberSpecies: "S5 SA Pine", windLoadingRegion: "inland" },
      evidence: { manufacturerDesignPackRef: "blob://pack.pdf", trussLayoutRef: "blob://layout.pdf", windBracingCalculationRef: "blob://wind.pdf", engineerInspectionRef: "blob://inspection.pdf", a19CertificateRef: "blob://a19.pdf" },
      checks: { manufacturerPackReviewed: true, windLoadingChecked: true, bracingChecked: true, engineerInspectionComplete: true, a19CertificateUploaded: true, roofCoveringReleaseApproved: true },
    });

    expect(result.status).toBe("ready_for_professional_review");
    expect(result.blockers).toEqual([]);
    expect(result.nextAction.label).toBe("Approve truss certification evidence for close-out/payment gate");
    expect(result.audit.noPaymentRelease).toBe(true);
  });

  it("does not require truss certification for non-roof interior work", () => {
    const result = evaluateTrussCertificationReadiness({ scopeTags: ["interior paint", "joinery"] });
    expect(result.required).toBe(false);
    expect(result.status).toBe("not_required");
    expect(result.nextAction.label).toBe("Confirm truss certification workflow not required");
  });
});
