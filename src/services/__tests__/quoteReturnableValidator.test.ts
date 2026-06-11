import { describe, expect, it } from "vitest";
import {
  createQuoteSubmission,
  validateQuoteSubmission,
} from "../quoteReturnableValidator";
import { getDefaultReturnables } from "../rfqPackageBuilder";

const baseQuote = {
  rfqId: "rfq-1",
  bidderId: "bidder-1",
  bidderName: "ABC Construction",
  priceZar: 145000,
  leadTimeWeeks: 4,
  exclusions: ["Painting not included"],
  qualifications: ["Subject to material availability"],
  returnables: getDefaultReturnables().map((r) => ({
    returnableId: r.id,
    provided: true,
    fileName: `${r.id}.pdf`,
    format: r.format,
  })),
  programmeSummary: "12-week programme with key milestones",
  methodologySummary: "Traditional construction methodology with dedicated site team",
  validUntilIso: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  submittedAtIso: new Date().toISOString(),
};

describe("quoteReturnableValidator", () => {
  describe("createQuoteSubmission", () => {
    it("creates a quote submission record", () => {
      const quote = createQuoteSubmission(baseQuote);
      expect(quote.quoteId).toBe(`quote_rfq-1_bidder-1`);
      expect(quote.status).toBe("submitted");
      expect(quote.priceZar).toBe(145000);
    });

    it("throws on negative price", () => {
      expect(() => createQuoteSubmission({ ...baseQuote, priceZar: -1000 }))
        .toThrow("Price must be a non-negative number");
    });

    it("throws on negative lead time", () => {
      expect(() => createQuoteSubmission({ ...baseQuote, leadTimeWeeks: -1 }))
        .toThrow("Lead time must be non-negative");
    });
  });

  describe("validateQuoteSubmission", () => {
    const returnables = getDefaultReturnables();

    it("validates a fully compliant quote", () => {
      const result = validateQuoteSubmission(baseQuote, returnables, 150000);
      expect(result.compliant).toBe(true);
      expect(result.status).toBe("compliant");
      expect(result.completenessScore).toBe(1);
      expect(result.missingReturnables).toHaveLength(0);
    });

    it("detects missing mandatory returnables", () => {
      const incompleteReturnables = [
        { returnableId: "returnable_quote_form", provided: true, format: "spreadsheet" },
        // Missing all other returnables
      ];
      const result = validateQuoteSubmission(
        { ...baseQuote, returnables: incompleteReturnables },
        returnables,
      );
      expect(result.compliant).toBe(false);
      expect(result.status).toBe("non_compliant");
      expect(result.completenessScore).toBeLessThan(1);
      expect(result.missingReturnables.length).toBeGreaterThan(0);
    });

    it("flags exclusions for visibility", () => {
      const result = validateQuoteSubmission(baseQuote, returnables);
      expect(result.exclusionFlags.length).toBeGreaterThan(0);
    });

    it("flags excluded/non-included items", () => {
      const result = validateQuoteSubmission(
        { ...baseQuote, exclusions: ["All electrical work is not included in this quote"] },
        returnables,
      );
      expect(result.exclusionFlags.length).toBeGreaterThan(0);
    });

    it("detects price anomaly when significantly over budget", () => {
      const result = validateQuoteSubmission(
        { ...baseQuote, priceZar: 300000 },
        returnables,
        150000,
      );
      expect(result.priceAnomaly).toBeTruthy();
      expect(result.riskFlags.some((f) => /exceeds/i.test(f))).toBe(true);
    });

    it("detects price anomaly when significantly under budget", () => {
      const result = validateQuoteSubmission(
        { ...baseQuote, priceZar: 30000 },
        returnables,
        150000,
      );
      expect(result.priceAnomaly).toBeTruthy();
      expect(result.riskFlags.some((f) => /below/i.test(f))).toBe(true);
    });

    it("flags expired validity", () => {
      const result = validateQuoteSubmission(
        { ...baseQuote, validUntilIso: new Date("2020-01-01").toISOString() },
        returnables,
      );
      expect(result.riskFlags.some((f) => /expired/i.test(f))).toBe(true);
    });

    it("flags qualification warnings", () => {
      const result = validateQuoteSubmission(
        { ...baseQuote, qualifications: ["Price is subject to exchange rate fluctuations"] },
        returnables,
      );
      expect(result.qualificationWarnings.length).toBeGreaterThan(0);
    });

    it("sets humanReviewRequired when non-compliant", () => {
      const result = validateQuoteSubmission(
        { ...baseQuote, returnables: [], priceZar: 0 },
        returnables,
      );
      expect(result.humanReviewRequired).toBe(true);
    });
  });
});
