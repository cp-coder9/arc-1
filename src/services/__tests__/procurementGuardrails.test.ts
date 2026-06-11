import { describe, expect, it } from "vitest";
import {
  runAllGuardrails,
  guardrailEqualInformation,
  guardrailNoAutoAppointment,
  guardrailExclusionsVisible,
  guardrailConflictOfInterest,
  guardrailCandidateSupervision,
  guardrailAdvisoryMatching,
} from "../procurementGuardrails";

describe("procurementGuardrails", () => {
  describe("guardrailEqualInformation", () => {
    it("passes when no addenda exist", () => {
      const result = guardrailEqualInformation(["b-1", "b-2"], []);
      expect(result.status).toBe("passed");
    });

    it("blocks when addenda not distributed to all bidders", () => {
      const addenda = [{
        addendumId: "add-1",
        number: 1,
        rfqId: "rfq-1",
        rfqTitle: "Test",
        subject: "Test",
        description: "Test",
        status: "issued" as const,
        sourceQuestionIds: [],
        issuedBy: "prof-1",
        distributedToBidderIds: ["b-1"],
        distributedToBidderEmails: ["b-1@test.com"],
        equalInformationCompliant: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }];
      const result = guardrailEqualInformation(["b-1", "b-2"], addenda);
      expect(result.status).toBe("blocked");
    });
  });

  describe("guardrailNoAutoAppointment", () => {
    it("passes when no recommendation exists", () => {
      const result = guardrailNoAutoAppointment(null);
      expect(result.status).toBe("passed");
    });

    it("blocks when no approvals recorded", () => {
      const rec = {
        recommendationId: "rec-1",
        rfqId: "rfq-1",
        projectId: "proj-1",
        recommendedQuoteId: "q-1",
        recommendedBidderId: "b-1",
        recommendedBidderName: "ABC",
        recommendedPriceZar: 100000,
        comparedQuoteIds: ["q-1", "q-2"],
        justification: "Best value",
        riskNotes: [],
        status: "recommended" as const,
        requiresClientApproval: true,
        requiresProfessionalApproval: true,
        conflictOfInterestFlags: [],
        candidateProfessionalSupervision: false,
        humanApprovalGate: true as const,
        createdBy: "prof-1",
        createdByRole: "lead_professional",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const result = guardrailNoAutoAppointment(rec);
      expect(result.status).toBe("blocked");
    });
  });

  describe("guardrailExclusionsVisible", () => {
    it("passes with no quotes", () => {
      const result = guardrailExclusionsVisible([]);
      expect(result.status).toBe("passed");
    });

    it("passes with exclusion flags documented", () => {
      const validations = [{
        quoteId: "q-1",
        status: "compliant" as const,
        compliant: true,
        completenessScore: 1,
        mandatoryReturnablesProvided: 8,
        mandatoryReturnablesTotal: 8,
        missingReturnables: [],
        formatIssues: [],
        exclusionFlags: ["Exclusion: Painting not included"],
        qualificationWarnings: [],
        riskFlags: [],
        validationNotes: "OK",
        humanReviewRequired: false,
      }];
      const result = guardrailExclusionsVisible(validations);
      expect(result.status).toBe("passed");
    });
  });

  describe("guardrailConflictOfInterest", () => {
    it("blocks when conflicts detected", () => {
      const checks = [{
        bidderId: "b-1",
        bidderName: "ABC",
        checkType: "related_party" as const,
        flagged: true,
        detail: "Related party detected",
      }];
      const result = guardrailConflictOfInterest(checks);
      expect(result.status).toBe("blocked");
    });

    it("passes when no conflicts", () => {
      const checks = [{
        bidderId: "b-1",
        bidderName: "ABC",
        checkType: "related_party" as const,
        flagged: false,
        detail: "No related party detected",
      }];
      const result = guardrailConflictOfInterest(checks);
      expect(result.status).toBe("passed");
    });
  });

  describe("guardrailCandidateSupervision", () => {
    it("warns when supervision required", () => {
      const result = guardrailCandidateSupervision(true, "Candidate Architect");
      expect(result.status).toBe("warning");
    });

    it("passes when no supervision needed", () => {
      const result = guardrailCandidateSupervision(false, "Registered Contractor");
      expect(result.status).toBe("passed");
    });
  });

  describe("guardrailAdvisoryMatching", () => {
    it("blocks when auto-selected", () => {
      const result = guardrailAdvisoryMatching(5, true);
      expect(result.status).toBe("blocked");
    });

    it("passes when advisory only", () => {
      const result = guardrailAdvisoryMatching(5, false);
      expect(result.status).toBe("passed");
    });
  });

  describe("runAllGuardrails", () => {
    it("runs all six guardrails and returns report", () => {
      const report = runAllGuardrails({
        invitedBidderIds: ["b-1", "b-2"],
        addenda: [],
        awardRecommendation: null,
        quoteValidations: [],
        conflictChecks: [],
        supervisionRequired: false,
        supervisionBidderName: "ABC",
        marketplaceMatchCount: 3,
        marketplaceAutoSelected: false,
      });
      expect(report.checks).toHaveLength(6);
      expect(report.allPassed).toBe(true);
      expect(report.blockedActions).toHaveLength(0);
    });

    it("reports blocked actions when guardrails fail", () => {
      const addenda = [{
        addendumId: "add-1",
        number: 1,
        rfqId: "rfq-1",
        rfqTitle: "Test",
        subject: "Test",
        description: "Test",
        status: "issued" as const,
        sourceQuestionIds: [],
        issuedBy: "prof-1",
        distributedToBidderIds: ["b-1"],
        distributedToBidderEmails: ["b-1@test.com"],
        equalInformationCompliant: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }];
      const report = runAllGuardrails({
        invitedBidderIds: ["b-1", "b-2", "b-3"],
        addenda,
        awardRecommendation: null,
        quoteValidations: [],
        conflictChecks: [],
        supervisionRequired: false,
        supervisionBidderName: "ABC",
        marketplaceMatchCount: 3,
        marketplaceAutoSelected: false,
      });
      expect(report.allPassed).toBe(false);
      expect(report.blockedActions.length).toBeGreaterThan(0);
    });

    it("includes governance note", () => {
      const report = runAllGuardrails({
        invitedBidderIds: [],
        addenda: [],
        awardRecommendation: null,
        quoteValidations: [],
        conflictChecks: [],
        supervisionRequired: false,
        supervisionBidderName: "",
        marketplaceMatchCount: 0,
        marketplaceAutoSelected: false,
      });
      expect(report.governanceNote).toBeTruthy();
    });
  });
});
