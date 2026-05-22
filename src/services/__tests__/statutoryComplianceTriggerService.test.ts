import { describe, expect, it } from "vitest";
import { evaluateStatutoryComplianceTriggers } from "../statutoryComplianceTriggerService";

describe("statutoryComplianceTriggerService", () => {
  it("raises deterministic PRD statutory triggers from project attributes without permitting automation to submit", () => {
    const result = evaluateStatutoryComplianceTriggers({
      projectId: "project-1",
      category: "Residential",
      location: "Cape Town heritage overlay",
      scopeTags: ["alteration", "demolition", "asbestos", "roof trusses", "solar pv", "borehole", "stormwater discharge", "boundary dispute", "fire rational design"],
      procurement: { publicSector: true, estimatedValue: 2_500_000 },
      constructionQuality: { requiresConcreteCubeTests: true, requiresCompactionTests: true },
      municipalAccount: { developmentChargeEstimate: 125000 },
      evidence: {
        sgDiagramApproved: false,
        ssegRegistrationSubmitted: false,
        wulaScreeningCompleted: false,
        bbbeeCertificateVerified: false,
        fireRationalDesignAccepted: false,
        trussCertificateUploaded: false,
        developmentChargesAcknowledged: false,
        demolitionPermitUploaded: false,
        asbestosClearanceUploaded: false,
        heritageApprovalUploaded: false,
        labTestResultsUploaded: false,
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.humanReviewRequired).toBe(true);
    expect(result.aiMaySubmitToAuthority).toBe(false);
    expect(result.requiredTriggers.map(trigger => trigger.key)).toEqual([
      "sg_boundary",
      "sseg_registration",
      "wula_screening",
      "bbbee_verification",
      "fire_rational_design",
      "truss_certificate",
      "development_charges",
      "demolition_permit",
      "asbestos_clearance",
      "heritage_approval",
      "lab_testing",
    ]);
    expect(result.blockers).toContain("SG boundary confirmation is required before statutory submission or construction release.");
    expect(result.nextAction).toMatchObject({ target: "municipal-tracker", priority: "high" });
    expect(result.summary).toContain("11 statutory trigger");
  });

  it("marks triggers ready when matching evidence is present and keeps warnings advisory", () => {
    const result = evaluateStatutoryComplianceTriggers({
      category: "Commercial",
      scopeTags: ["fire occupancy change", "glazing tests"],
      evidence: {
        fireRationalDesignAccepted: true,
        labTestResultsUploaded: true,
      },
    });

    expect(result.status).toBe("ready_for_review");
    expect(result.blockers).toEqual([]);
    expect(result.warnings).toContain("Commercial work may require competent-person confirmations even when core trigger evidence is present.");
    expect(result.nextAction.label).toBe("Review statutory trigger evidence");
  });
});
