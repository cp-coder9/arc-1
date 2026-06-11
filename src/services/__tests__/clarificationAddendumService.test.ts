import { describe, expect, it } from "vitest";
import {
  submitClarificationQuestion,
  respondToClarification,
  assessMateriality,
  createAddendum,
  issueAddendum,
  verifyEqualDistribution,
} from "../clarificationAddendumService";

describe("clarificationAddendumService", () => {
  describe("assessMateriality", () => {
    it("flags scope questions as material", () => {
      const result = assessMateriality("scope", "What is included in the scope?");
      expect(result.isMaterial).toBe(true);
    });

    it("flags price questions as material", () => {
      const result = assessMateriality("price", "Can we use an alternative material that costs less?");
      expect(result.isMaterial).toBe(true);
    });

    it("flags programme questions as material", () => {
      const result = assessMateriality("programme", "Can the deadline be extended?");
      expect(result.isMaterial).toBe(true);
    });

    it("detects material keywords in other categories", () => {
      const result = assessMateriality("other", "Can we substitute the specified flooring with an equivalent product?");
      expect(result.isMaterial).toBe(true);
    });

    it("marks purely administrative questions as non-material", () => {
      const result = assessMateriality("other", "What time can we visit the site?");
      expect(result.isMaterial).toBe(false);
    });
  });

  describe("submitClarificationQuestion", () => {
    it("creates a clarification with materiality assessment", () => {
      const q = submitClarificationQuestion({
        rfqId: "rfq-1",
        bidderId: "bidder-1",
        bidderName: "ABC Construction",
        question: "What is the scope of electrical works included?",
        category: "scope",
      });
      expect(q.questionId).toMatch(/^clar_rfq-1_/);
      expect(q.status).toBe("submitted");
      expect(q.isMaterial).toBe(true);
    });

    it("throws on short question", () => {
      expect(() =>
        submitClarificationQuestion({
          rfqId: "rfq-1",
          bidderId: "b-1",
          bidderName: "ABC",
          question: "Hi",
          category: "other",
        }),
      ).toThrow("at least 10 characters");
    });
  });

  describe("respondToClarification", () => {
    it("responds and escalates material questions to addendum", () => {
      const q = submitClarificationQuestion({
        rfqId: "rfq-1",
        bidderId: "b-1",
        bidderName: "ABC",
        question: "What is the total floor area?",
        category: "scope",
      });
      const responded = respondToClarification(q, "prof-1", "The total floor area is 150sqm as per drawing A-101.");
      expect(responded.status).toBe("escalated_to_addendum");
      expect(responded.response).toContain("150sqm");
      expect(responded.respondedBy).toBe("prof-1");
    });

    it("responds without escalating non-material questions", () => {
      const q = {
        ...submitClarificationQuestion({
          rfqId: "rfq-1",
          bidderId: "b-1",
          bidderName: "ABC",
          question: "When can we visit the site?",
          category: "other",
        }),
        isMaterial: false,
      };
      const responded = respondToClarification(q, "prof-1", "Site visits are available on Tuesdays.");
      expect(responded.status).toBe("responded");
    });
  });

  describe("createAddendum", () => {
    it("creates an addendum distributed to all bidders", () => {
      const addendum = createAddendum({
        rfqId: "rfq-1",
        rfqTitle: "Kitchen Renovation",
        subject: "Clarification: Floor Area",
        description: "The total floor area is confirmed as 150sqm.",
        sourceQuestionIds: ["clar-1"],
        issuedBy: "prof-1",
        allBidderIds: ["b-1", "b-2", "b-3"],
        allBidderEmails: ["a@test.com", "b@test.com", "c@test.com"],
      });
      expect(addendum.addendumId).toMatch(/^addendum_rfq-1_/);
      expect(addendum.distributedToBidderIds).toHaveLength(3);
      expect(addendum.equalInformationCompliant).toBe(true);
      expect(addendum.status).toBe("draft");
    });

    it("enforces distribution to all bidders (fairness)", () => {
      expect(() =>
        createAddendum({
          rfqId: "rfq-1",
          rfqTitle: "Test",
          subject: "Test",
          description: "Test",
          sourceQuestionIds: ["q-1"],
          issuedBy: "prof-1",
          allBidderIds: ["b-1"], // Only the asker, not all bidders
          allBidderEmails: ["a@test.com"],
        }),
      ).toThrow("EQUAL-INFORMATION");
    });
  });

  describe("issueAddendum", () => {
    it("issues an addendum and creates distribution records", () => {
      const addendum = createAddendum({
        rfqId: "rfq-1",
        rfqTitle: "Test",
        subject: "Test Addendum",
        description: "Test description",
        sourceQuestionIds: ["q-1"],
        issuedBy: "prof-1",
        allBidderIds: ["b-1", "b-2"],
        allBidderEmails: ["a@test.com", "b@test.com"],
      });
      const { addendum: issued, distributions } = issueAddendum(addendum, "verifier-1");
      expect(issued.status).toBe("issued");
      expect(issued.distributionVerifiedBy).toBe("verifier-1");
      expect(distributions).toHaveLength(2);
      expect(distributions[0].method).toBe("platform");
    });
  });

  describe("verifyEqualDistribution", () => {
    it("confirms all bidders received all addenda", () => {
      const addenda = [{
        addendumId: "add-1",
        number: 1,
        rfqId: "rfq-1",
        rfqTitle: "Test",
        subject: "Test",
        description: "Test",
        status: "issued" as const,
        sourceQuestionIds: ["q-1"],
        issuedBy: "prof-1",
        distributedToBidderIds: ["b-1", "b-2"],
        distributedToBidderEmails: ["a@test.com", "b@test.com"],
        equalInformationCompliant: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }];
      const result = verifyEqualDistribution(["b-1", "b-2"], addenda);
      expect(result.compliant).toBe(true);
    });

    it("flags missing bidders", () => {
      const addenda = [{
        addendumId: "add-1",
        number: 1,
        rfqId: "rfq-1",
        rfqTitle: "Test",
        subject: "Test",
        description: "Test",
        status: "issued" as const,
        sourceQuestionIds: ["q-1"],
        issuedBy: "prof-1",
        distributedToBidderIds: ["b-1"],
        distributedToBidderEmails: ["a@test.com"],
        equalInformationCompliant: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }];
      const result = verifyEqualDistribution(["b-1", "b-2", "b-3"], addenda);
      expect(result.compliant).toBe(false);
      expect(result.missingBidders).toContain("b-2");
      expect(result.missingBidders).toContain("b-3");
    });
  });
});
