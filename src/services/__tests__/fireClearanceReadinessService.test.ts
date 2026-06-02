import { describe, expect, it } from "vitest";
import { evaluateFireClearanceReadiness } from "../fireClearanceReadinessService";

describe("fireClearanceReadinessService", () => {
  it("blocks commercial fire workflows until SANS 10400-T and fire-department evidence exists", () => {
    const result = evaluateFireClearanceReadiness({
      projectId: "project-fire-1",
      category: "Commercial",
      scopeTags: ["occupancy change", "sprinkler", "fire detection", "assembly use"],
      design: { occupancyClassChanged: true, sprinklerSystem: true, fireDetectionSystem: true, publicAssembly: true },
      evidence: { firePlanRef: "blob://fire-plan.pdf" },
      checks: { escapeRoutesChecked: false, compartmentationChecked: false, equipmentPlacementChecked: false, rationalDesignAccepted: false, municipalFireSubmissionReady: false, fireInstallationCertificateUploaded: false },
    });

    expect(result.required).toBe(true);
    expect(result.status).toBe("blocked");
    expect(result.missingEvidence).toEqual([
      "fire rational design / competent-person review reference",
      "municipal fire department submission reference",
      "sprinkler / detection design reference",
      "fire installation certificate / Form 4 reference",
    ]);
    expect(result.blockers).toContain("Escape route geometry must be checked against SANS 10400-T before readiness approval.");
    expect(result.nextAction).toMatchObject({ label: "Resolve fire clearance blockers", priority: "high", target: "sans-forms", requiresHumanConfirmation: true, automationLevel: "advisory" });
    expect(result.audit).toEqual({ prdSection: "Section 49: Fire Protection & Municipal Fire Department Clearances (SANS 10400-T)", noMunicipalSubmission: true, noOccupancyCertification: true, humanReviewRequired: true });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("marks complete fire evidence ready for professional review without certifying occupancy", () => {
    const result = evaluateFireClearanceReadiness({
      category: "Industrial",
      design: { fireDetectionSystem: true },
      evidence: { firePlanRef: "blob://fire-plan.pdf", rationalDesignRef: "blob://rational.pdf", municipalFireSubmissionRef: "jhb-ems://123", sprinklerOrDetectionDesignRef: "blob://detection.pdf", fireInstallationCertificateRef: "blob://form4.pdf" },
      checks: { escapeRoutesChecked: true, compartmentationChecked: true, equipmentPlacementChecked: true, rationalDesignAccepted: true, municipalFireSubmissionReady: true, fireInstallationCertificateUploaded: true },
    });
    expect(result.status).toBe("ready_for_professional_review");
    expect(result.blockers).toEqual([]);
    expect(result.nextAction.label).toBe("Approve fire clearance evidence for municipal/close-out pack");
    expect(result.audit.noOccupancyCertification).toBe(true);
  });

  it("does not require fire clearance workflow for low-risk cosmetic residential work", () => {
    const result = evaluateFireClearanceReadiness({ category: "Residential", scopeTags: ["paint", "cupboards"] });
    expect(result.required).toBe(false);
    expect(result.status).toBe("not_required");
    expect(result.nextAction.label).toBe("Confirm fire clearance workflow not required");
  });
});
