import { describe, expect, it } from "vitest";
import { evaluateSgBoundaryAudit } from "../sgBoundaryAuditService";

describe("sgBoundaryAuditService", () => {
  it("blocks boundary-triggered work until SG diagram, deed, overlay, and coordinate evidence exists", () => {
    const result = evaluateSgBoundaryAudit({
      erfNumber: "Erf 123 Cape Town",
      scopeTags: ["subdivision", "servitude", "boundary dispute"],
      uploadedEvidence: { sgDiagramRef: "sg://diagram/123" },
      checks: {
        erfMatchesDeed: true,
        boundaryMatchesDrawing: false,
        servitudesIdentified: true,
        encroachmentFlagged: true,
        coordinatesVerified: false,
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.required).toBe(true);
    expect(result.riskLevel).toBe("high");
    expect(result.missingEvidence).toEqual([
      "vectorised boundary overlay reference",
      "title deed / property registry reference",
      "drawing boundary overlay confirmation",
      "coordinate verification confirmation",
    ]);
    expect(result.blockers).toContain("Potential encroachment must be resolved before municipal submission or site release.");
    expect(result.warnings).toContain("Servitudes are identified and must be carried into the municipal submission notes and site constraints.");
    expect(result.nextAction).toMatchObject({
      label: "Resolve SG boundary audit blockers",
      priority: "high",
      target: "municipal-tracker",
      requiresHumanConfirmation: true,
      automationLevel: "advisory",
    });
    expect(result.audit).toEqual({
      prdSection: "Section 45: Surveyor-General (SG) Diagrams & Boundary Auditing",
      noAuthoritySubmission: true,
      noRegistryMutation: true,
      humanReviewRequired: true,
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("marks complete SG evidence ready for professional review without submitting to authorities", () => {
    const result = evaluateSgBoundaryAudit({
      propertyDeedKey: "T12345/2026",
      scopeTags: ["cadastral boundary confirmation"],
      uploadedEvidence: {
        sgDiagramRef: "sg://diagram/456",
        vectorisedBoundaryRef: "blob://boundary-overlay.geojson",
        titleDeedRef: "deeds://T12345/2026",
        surveyorConfirmationRef: "letter://surveyor-confirmation",
      },
      checks: {
        erfMatchesDeed: true,
        boundaryMatchesDrawing: true,
        coordinatesVerified: true,
      },
    });

    expect(result.status).toBe("ready_for_professional_review");
    expect(result.riskLevel).toBe("low");
    expect(result.blockers).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.nextAction.label).toBe("Approve SG boundary evidence for submission pack");
    expect(result.audit.noAuthoritySubmission).toBe(true);
  });

  it("does not force SG workflow when no boundary trigger is present", () => {
    const result = evaluateSgBoundaryAudit({
      scopeTags: ["interior paint refresh", "joinery"],
    });

    expect(result.status).toBe("not_required");
    expect(result.required).toBe(false);
    expect(result.riskLevel).toBe("low");
    expect(result.missingEvidence).toEqual([]);
    expect(result.nextAction).toMatchObject({ label: "Confirm SG boundary audit not required", priority: "low" });
  });
});
