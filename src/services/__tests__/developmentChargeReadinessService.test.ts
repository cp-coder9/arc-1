import { describe, expect, it } from "vitest";
import { evaluateDevelopmentChargeReadiness } from "../developmentChargeReadinessService";

describe("developmentChargeReadinessService", () => {
  it("blocks service connections until development charges, clearance, and requested applications are complete", () => {
    const result = evaluateDevelopmentChargeReadiness({
      projectId: "project-bulk-1",
      municipality: "City of Johannesburg",
      development: { landUseChange: true, floorAreaIncreaseSqm: 120, newServiceConnections: ["electricity", "water"], zoningOrSitePlanApproved: false },
      evidence: { chargeEstimateRef: "blob://estimate.pdf", connectionApplicationRefs: { electricity: "blob://city-power.pdf" } },
      checks: { chargesCalculated: true, municipalDemandReceived: false, paymentCleared: false, connectionApplicationsReady: false, siteInspectionComplete: false, metersCommissioned: false },
    });

    expect(result.required).toBe(true);
    expect(result.status).toBe("blocked");
    expect(result.riskLevel).toBe("high");
    expect(result.serviceConnectionReadiness).toMatchObject({ electricity: "application_ready", water: "missing_application", sewer: "not_requested", stormwater: "not_requested" });
    expect(result.missingEvidence).toEqual(["municipal development-charge demand reference", "development-charge payment proof reference", "municipal charge clearance / service readiness reference", "water connection application reference"]);
    expect(result.blockers).toContain("Development-charge payment must be cleared before service connection or occupancy readiness.");
    expect(result.nextAction).toMatchObject({ label: "Resolve development-charge/service-connection blockers", target: "municipal-tracker", requiresHumanConfirmation: true, automationLevel: "advisory" });
    expect(result.audit).toEqual({ prdSection: "Section 51: Municipal Bulk Service Connections & Development Charges", noAutomaticMunicipalSubmission: true, noAutomaticPaymentRelease: true, humanReviewRequired: true });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("marks complete municipal connection evidence ready for human municipal review", () => {
    const result = evaluateDevelopmentChargeReadiness({
      municipality: "City of Cape Town",
      development: { landUseChange: true, floorAreaIncreaseSqm: 50, newServiceConnections: ["electricity", "water"], zoningOrSitePlanApproved: true },
      evidence: { chargeEstimateRef: "blob://estimate.pdf", municipalDemandRef: "blob://demand.pdf", paymentProofRef: "blob://paid.pdf", clearanceRef: "blob://clearance.pdf", connectionApplicationRefs: { electricity: "blob://electricity.pdf", water: "blob://water.pdf" }, meterCommissioningRef: "blob://meters.pdf" },
      checks: { chargesCalculated: true, municipalDemandReceived: true, paymentCleared: true, connectionApplicationsReady: true, siteInspectionComplete: true, metersCommissioned: true },
    });

    expect(result.status).toBe("ready_for_municipal_review");
    expect(result.blockers).toEqual([]);
    expect(result.nextAction.label).toBe("Approve municipal service-connection readiness pack");
    expect(result.audit.noAutomaticPaymentRelease).toBe(true);
  });

  it("does not require development-charge tracking for unrelated interior work", () => {
    const result = evaluateDevelopmentChargeReadiness({ scopeTags: ["interior paint", "joinery"] });
    expect(result.required).toBe(false);
    expect(result.status).toBe("not_required");
    expect(result.nextAction.label).toBe("Confirm development-charge workflow not required");
  });
});
