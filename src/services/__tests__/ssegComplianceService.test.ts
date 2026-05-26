import { describe, expect, it } from "vitest";
import { evaluateSsegComplianceReadiness } from "../ssegComplianceService";

describe("ssegComplianceService", () => {
  it("blocks solar PV / battery projects until SSEG registration, electrical certificates, and distributor evidence exist", () => {
    const result = evaluateSsegComplianceReadiness({
      projectId: "project-sseg-1",
      location: "Johannesburg City Power",
      scopeTags: ["solar PV", "hybrid inverter", "battery storage", "grid-tied embedded generation"],
      system: {
        hasSolarPv: true,
        hasBatteryStorage: true,
        hasGridTieInverter: true,
        inverterCapacityKw: 8,
        distributor: "city_power",
      },
      evidence: {
        applicationPackRef: "blob://sseg/application-pack.pdf",
      },
      checks: {
        nrs097Compliant: false,
        antiIslandingConfirmed: false,
        singleLineDiagramReviewed: false,
        professionalElectricalSignoff: false,
        distributorApprovalReceived: false,
      },
    });

    expect(result.required).toBe(true);
    expect(result.status).toBe("blocked");
    expect(result.riskLevel).toBe("high");
    expect(result.missingEvidence).toEqual([
      "municipal / distributor SSEG registration reference",
      "approved single-line diagram reference",
      "NRS 097 inverter compliance certificate",
      "electrical COC / competent-person sign-off",
      "distributor approval / permission-to-operate reference",
    ]);
    expect(result.blockers).toContain("NRS 097 compliance must be confirmed before SSEG readiness can be approved.");
    expect(result.blockers).toContain("Anti-islanding protection must be confirmed before grid-tied operation is treated as compliant.");
    expect(result.nextAction).toMatchObject({
      label: "Resolve SSEG compliance blockers",
      target: "municipal-tracker",
      priority: "high",
      requiresHumanConfirmation: true,
      automationLevel: "advisory",
    });
    expect(result.audit).toEqual({
      prdSection: "Section 46: Solar PV & Small-Scale Embedded Generation (SSEG) Compliance",
      noAuthoritySubmission: true,
      noDistributorSubmission: true,
      humanReviewRequired: true,
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("marks complete SSEG evidence ready for professional review without auto-submitting to the distributor", () => {
    const result = evaluateSsegComplianceReadiness({
      scopeTags: ["solar array", "SSEG registration"],
      system: {
        hasSolarPv: true,
        hasGridTieInverter: true,
        inverterCapacityKw: 5,
        distributor: "eskom",
      },
      evidence: {
        applicationPackRef: "blob://sseg/application-pack.pdf",
        registrationRef: "Eskom-SSEG-123",
        singleLineDiagramRef: "blob://sld.pdf",
        inverterCertificateRef: "blob://nrs097.pdf",
        electricalCocRef: "blob://coc.pdf",
        distributorApprovalRef: "eskom://pto/123",
      },
      checks: {
        nrs097Compliant: true,
        antiIslandingConfirmed: true,
        singleLineDiagramReviewed: true,
        professionalElectricalSignoff: true,
        distributorApprovalReceived: true,
      },
    });

    expect(result.status).toBe("ready_for_professional_review");
    expect(result.riskLevel).toBe("low");
    expect(result.blockers).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.nextAction.label).toBe("Approve SSEG evidence for municipal/distributor pack");
    expect(result.audit.noDistributorSubmission).toBe(true);
  });

  it("does not require the SSEG workflow for non-electrical interior work", () => {
    const result = evaluateSsegComplianceReadiness({
      scopeTags: ["interior partition", "paint", "joinery"],
      system: { distributor: "other" },
    });

    expect(result.required).toBe(false);
    expect(result.status).toBe("not_required");
    expect(result.riskLevel).toBe("low");
    expect(result.missingEvidence).toEqual([]);
    expect(result.nextAction).toMatchObject({ label: "Confirm SSEG compliance workflow not required", priority: "low" });
  });
});
