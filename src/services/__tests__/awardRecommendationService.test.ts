import { describe, expect, it } from "vitest";
import {
  createAwardRecommendation,
  recordClientApproval,
  recordProfessionalApproval,
  rejectAwardRecommendation,
  confirmAppointmentCreated,
  checkConflictOfInterest,
  checkCandidateProfessionalSupervision,
} from "../awardRecommendationService";

describe("awardRecommendationService", () => {
  const baseInput = {
    rfqId: "rfq-1",
    projectId: "proj-1",
    recommendedQuoteId: "quote-1",
    recommendedBidderId: "bidder-1",
    recommendedBidderName: "ABC Construction",
    recommendedPriceZar: 145000,
    comparedQuoteIds: ["quote-1", "quote-2", "quote-3"],
    justification: "ABC Construction offers the best value with strong methodology and competitive pricing.",
    riskNotes: ["Slight lead time risk — monitor programme closely"],
    createdBy: "prof-1",
    createdByRole: "lead_professional",
  };

  describe("createAwardRecommendation", () => {
    it("creates a recommendation requiring dual approval", () => {
      const rec = createAwardRecommendation(baseInput);
      expect(rec.recommendationId).toMatch(/^award_rfq-1_/);
      expect(rec.status).toBe("recommended");
      expect(rec.requiresClientApproval).toBe(true);
      expect(rec.requiresProfessionalApproval).toBe(true);
      expect(rec.humanApprovalGate).toBe(true);
    });

    it("throws on empty justification", () => {
      expect(() => createAwardRecommendation({ ...baseInput, justification: "" }))
        .toThrow("Justification is required");
    });

    it("throws on fewer than 1 comparison quote", () => {
      expect(() => createAwardRecommendation({ ...baseInput, comparedQuoteIds: [] }))
        .toThrow("At least one comparison quote is required");
    });

    it("includes conflict flags from checks", () => {
      const conflicts = checkConflictOfInterest("bidder-1", "ABC Construction", ["ABC Construction has a financial interest in the project"], "prof-1");
      const rec = createAwardRecommendation(baseInput, conflicts);
      expect(rec.conflictOfInterestFlags.length).toBeGreaterThan(0);
    });
  });

  describe("approval workflow", () => {
    it("records client approval", () => {
      const rec = createAwardRecommendation(baseInput);
      const clientApproved = recordClientApproval(rec, "client-1");
      expect(clientApproved.status).toBe("pending_professional_approval");
      expect(clientApproved.clientApprovedBy).toBe("client-1");
    });

    it("records professional approval after client", () => {
      const rec = createAwardRecommendation(baseInput);
      const clientApproved = recordClientApproval(rec, "client-1");
      const fullyApproved = recordProfessionalApproval(clientApproved, "prof-1");
      expect(fullyApproved.status).toBe("approved");
    });

    it("prevents professional approval before client approval", () => {
      const rec = createAwardRecommendation(baseInput);
      expect(() => recordProfessionalApproval(rec, "prof-1"))
        .toThrow("Client approval must be recorded before professional approval");
    });

    it("prevents client approval with unresolved conflicts", () => {
      const conflicts = checkConflictOfInterest("bidder-1", "ABC Construction", ["related party transaction"], "prof-1");
      const rec = createAwardRecommendation(baseInput, conflicts);
      expect(() => recordClientApproval(rec, "client-1"))
        .toThrow("conflict of interest");
    });

    it("rejects an award recommendation", () => {
      const rec = createAwardRecommendation(baseInput);
      const rejected = rejectAwardRecommendation(rec, "prof-1", "Price exceeds budget");
      expect(rejected.status).toBe("rejected");
      expect(rejected.riskNotes.some((n) => n.includes("Price exceeds budget"))).toBe(true);
    });

    it("confirms appointment creation from approved recommendation", () => {
      const rec = createAwardRecommendation(baseInput);
      const clientApproved = recordClientApproval(rec, "client-1");
      const approved = recordProfessionalApproval(clientApproved, "prof-1");
      const appointed = confirmAppointmentCreated(approved);
      expect(appointed.status).toBe("appointment_created");
    });
  });

  describe("checkConflictOfInterest", () => {
    it("detects related party declarations", () => {
      const checks = checkConflictOfInterest("b-1", "ABC Construction", ["This bidder has a related party connection to the client"], "evaluator-1");
      expect(checks.some((c) => c.flagged && c.checkType === "related_party")).toBe(true);
    });

    it("detects evaluator bidding on own RFQ", () => {
      const checks = checkConflictOfInterest("bidder-1", "ABC Construction", [], "bidder-1");
      expect(checks.some((c) => c.flagged && c.detail.includes("same entity"))).toBe(true);
    });

    it("passes clean checks", () => {
      const checks = checkConflictOfInterest("b-1", "ABC Construction", ["No conflicts declared"], "evaluator-1");
      expect(checks.every((c) => !c.flagged)).toBe(true);
    });
  });

  describe("checkCandidateProfessionalSupervision", () => {
    it("flags candidate professionals without registration", () => {
      const result = checkCandidateProfessionalSupervision("freelancer_candidate_professional", []);
      expect(result.supervisionRequired).toBe(true);
    });

    it("flags candidates even with registration (requires verification)", () => {
      const result = checkCandidateProfessionalSupervision("candidate", ["PrArch 12345"]);
      expect(result.supervisionRequired).toBe(true);
    });

    it("does not flag registered professionals", () => {
      const result = checkCandidateProfessionalSupervision("main_contractor", ["CIDB Grade 7"]);
      expect(result.supervisionRequired).toBe(false);
    });
  });
});
