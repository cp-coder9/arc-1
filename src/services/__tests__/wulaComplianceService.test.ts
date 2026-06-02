import { describe, expect, it } from "vitest";
import { evaluateWulaComplianceReadiness } from "../wulaComplianceService";

describe("wulaComplianceService", () => {
  it("blocks borehole and greywater work until WULA/SANS 10252 evidence is complete", () => {
    const result = evaluateWulaComplianceReadiness({
      projectId: "project-water-1",
      location: "wetland buffer zone",
      scopeTags: ["borehole", "greywater irrigation", "blackwater treatment", "rainwater harvesting"],
      system: {
        hasBorehole: true,
        hasGreywaterReuse: true,
        hasBlackwaterTreatment: true,
        hasRainwaterHarvesting: true,
        sensitiveWaterArea: true,
        drinkingWaterConnectionPresent: true,
      },
      evidence: {
        sans10252PlumbingReviewRef: "blob://plumbing-review.pdf",
      },
      checks: {
        potableNonPotableSeparationConfirmed: false,
        sans10252Compliant: false,
        eapOrGeohydrologistReviewComplete: false,
        waterQualityCertificateAccepted: false,
        plumbingCocUploaded: false,
        dwsAuthorizationReceived: false,
      },
    });

    expect(result.required).toBe(true);
    expect(result.status).toBe("blocked");
    expect(result.riskLevel).toBe("high");
    expect(result.missingEvidence).toEqual([
      "DWS WULA / registration reference",
      "EAP or geohydrologist review reference",
      "borehole yield / abstraction test reference",
      "SANS 241 water quality certificate",
      "plumbing certificate of compliance reference",
    ]);
    expect(result.blockers).toContain("Potable and non-potable water separation must be confirmed before plumbing compliance readiness.");
    expect(result.blockers).toContain("DWS authorization or registration evidence must be recorded before WULA readiness approval.");
    expect(result.nextAction).toMatchObject({
      label: "Resolve WULA / water compliance blockers",
      priority: "high",
      target: "municipal-tracker",
      requiresHumanConfirmation: true,
      automationLevel: "advisory",
    });
    expect(result.audit).toEqual({
      prdSection: "Section 47: Water Infrastructure & Water Use License Applications (WULA)",
      noAuthoritySubmission: true,
      noPermitMutation: true,
      humanReviewRequired: true,
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("marks complete water infrastructure evidence ready for professional review without submitting to DWS", () => {
    const result = evaluateWulaComplianceReadiness({
      scopeTags: ["borehole registration", "rainwater harvesting"],
      system: {
        hasBorehole: true,
        hasRainwaterHarvesting: true,
        sensitiveWaterArea: false,
        drinkingWaterConnectionPresent: true,
      },
      evidence: {
        dwsAuthorizationRef: "dws://registration/123",
        eapOrGeohydrologistRef: "blob://geo-report.pdf",
        yieldTestRef: "blob://yield-test.pdf",
        waterQualityCertificateRef: "blob://sans241.pdf",
        sans10252PlumbingReviewRef: "blob://sans10252.pdf",
        plumbingCocRef: "blob://plumbing-coc.pdf",
      },
      checks: {
        potableNonPotableSeparationConfirmed: true,
        sans10252Compliant: true,
        eapOrGeohydrologistReviewComplete: true,
        waterQualityCertificateAccepted: true,
        plumbingCocUploaded: true,
        dwsAuthorizationReceived: true,
      },
    });

    expect(result.status).toBe("ready_for_professional_review");
    expect(result.riskLevel).toBe("low");
    expect(result.blockers).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.nextAction.label).toBe("Approve WULA / water evidence for authority pack");
    expect(result.audit.noAuthoritySubmission).toBe(true);
  });

  it("does not require WULA workflow for ordinary dry interior work", () => {
    const result = evaluateWulaComplianceReadiness({
      scopeTags: ["drywall", "paint", "joinery"],
    });

    expect(result.required).toBe(false);
    expect(result.status).toBe("not_required");
    expect(result.riskLevel).toBe("low");
    expect(result.missingEvidence).toEqual([]);
    expect(result.nextAction).toMatchObject({ label: "Confirm WULA / water compliance workflow not required", priority: "low" });
  });
});
