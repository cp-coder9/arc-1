import { describe, expect, it } from "vitest";
import {
  buildRfqPackage,
  getDefaultReturnables,
  getDefaultEvaluationCriteria,
  validateRfqPackageCompleteness,
} from "../rfqPackageBuilder";
import type { RfqPackageInput } from "../rfqPackageBuilder";

const baseInput: RfqPackageInput = {
  projectId: "proj-1",
  title: "Kitchen Renovation RFQ",
  scopeSummary: "Complete kitchen renovation including plumbing, electrical, cabinetry, tiling, and finishes for a 20sqm kitchen space.",
  procurementScope: {
    classification: "rfq",
    confidence: 0.8,
    rationale: ["Standard procurement"],
    requiredParticipantCategories: ["client", "lead_professional", "contractor"],
    minimumBidders: 2,
    recommendedBidders: 4,
    publicAdvertisement: false,
    regulatoryTriggers: [],
    riskFlags: [],
    estimatedDurationDays: 21,
    governanceNote: "Advisory only",
  },
  drawings: [
    { drawingNumber: "A-101", title: "Kitchen Floor Plan", revision: "C", requiredForPricing: true },
    { drawingNumber: "A-201", title: "Kitchen Elevations", revision: "B", requiredForPricing: true },
  ],
  returnables: getDefaultReturnables(),
  evaluationCriteria: getDefaultEvaluationCriteria(),
  deadlineIso: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
  budgetEstimateZar: 150000,
  siteAddress: "123 Main Road, Cape Town",
  contactEmail: "architect@example.com",
  createdBy: "user-1",
};

describe("rfqPackageBuilder", () => {
  describe("buildRfqPackage", () => {
    it("builds a complete RFQ package with valid inputs", () => {
      const pkg = buildRfqPackage(baseInput);
      expect(pkg.rfqId).toMatch(/^rfq_proj-1_\d+$/);
      expect(pkg.status).toBe("ready_for_review");
      expect(pkg.isComplete).toBe(true);
      expect(pkg.drawings).toHaveLength(2);
      expect(pkg.returnables.length).toBeGreaterThan(0);
      expect(pkg.evaluationCriteria.reduce((s, c) => s + c.weight, 0)).toBe(100);
    });

    it("sets status to draft when completeness checks fail", () => {
      const pkg = buildRfqPackage({
        ...baseInput,
        drawings: [],
        scopeSummary: "short",
        siteAddress: "",
        contactEmail: "invalid",
      });
      expect(pkg.status).toBe("draft");
      expect(pkg.isComplete).toBe(false);
    });

    it("throws on empty title", () => {
      expect(() => buildRfqPackage({ ...baseInput, title: "" })).toThrow("RFQ title is required");
    });

    it("throws on empty scope summary", () => {
      expect(() => buildRfqPackage({ ...baseInput, scopeSummary: "" })).toThrow("Scope summary is required");
    });

    it("throws on deadline in the past", () => {
      expect(() =>
        buildRfqPackage({
          ...baseInput,
          deadlineIso: new Date("2020-01-01").toISOString(),
        }),
      ).toThrow("Deadline must be after creation date");
    });

    it("throws on deadline less than 7 days", () => {
      expect(() =>
        buildRfqPackage({
          ...baseInput,
          deadlineIso: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      ).toThrow("Deadline must be at least 7 days");
    });

    it("throws on evaluation weights not summing to 100", () => {
      expect(() =>
        buildRfqPackage({
          ...baseInput,
          evaluationCriteria: [
            { id: "c1", name: "Price", weight: 50, description: "", scoringGuidance: "" },
            { id: "c2", name: "Quality", weight: 60, description: "", scoringGuidance: "" },
          ],
        }),
      ).toThrow("weights must sum to 100");
    });

    it("includes fairness rule", () => {
      const pkg = buildRfqPackage(baseInput);
      expect(pkg.fairnessRule).toContain("equal material information");
    });

    it("includes completeness checks in output", () => {
      const pkg = buildRfqPackage(baseInput);
      expect(pkg.completenessChecks.length).toBeGreaterThan(0);
      expect(pkg.completenessChecks.every((c) => typeof c.check === "string")).toBe(true);
    });
  });

  describe("getDefaultReturnables", () => {
    it("returns at least 7 default returnable templates", () => {
      const returnables = getDefaultReturnables();
      expect(returnables.length).toBeGreaterThanOrEqual(7);
    });

    it("includes mandatory returnables", () => {
      const returnables = getDefaultReturnables();
      expect(returnables.filter((r) => r.mandatory).length).toBeGreaterThanOrEqual(4);
    });
  });

  describe("getDefaultEvaluationCriteria", () => {
    it("returns 8 default criteria", () => {
      const criteria = getDefaultEvaluationCriteria();
      expect(criteria).toHaveLength(8);
    });

    it("weights sum to 100", () => {
      const criteria = getDefaultEvaluationCriteria();
      const total = criteria.reduce((sum, c) => sum + c.weight, 0);
      expect(total).toBe(100);
    });
  });

  describe("validateRfqPackageCompleteness", () => {
    it("validates a complete package", () => {
      const pkg = buildRfqPackage(baseInput);
      const result = validateRfqPackageCompleteness(pkg);
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it("flags incomplete packages", () => {
      const pkg = buildRfqPackage({
        ...baseInput,
        drawings: [],
        scopeSummary: "too short",
      });
      const result = validateRfqPackageCompleteness(pkg);
      expect(result.valid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    });
  });
});
