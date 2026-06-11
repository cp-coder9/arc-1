import { describe, expect, it } from "vitest";
import {
  matchMarketplaceListings,
  getTopRecommendations,
  type MarketplaceListing,
  type ProcurementRequirement,
} from "../marketplaceMatcherService";

const baseRequirement: ProcurementRequirement = {
  projectId: "proj-1",
  location: "Cape Town, Western Cape",
  requiredTrades: ["general_building", "electrical"],
  requiredDisciplines: [],
  estimatedValueZar: 500000,
  categoryPreferences: ["main_contractor"],
  verificationRequirements: ["cidb", "tax_clearance"],
  excludeListingIds: [],
};

const makeListing = (overrides: Partial<MarketplaceListing> = {}): MarketplaceListing => ({
  listingId: "list-1",
  name: "ABC Construction",
  category: "main_contractor",
  trades: ["general_building", "electrical", "plumbing"],
  location: "Cape Town",
  province: "Western Cape",
  availability: "available",
  verified: true,
  verificationBadges: ["cidb_grade_7", "tax_clearance", "bbbee_level_1"],
  rating: 4.5,
  completedProjects: 25,
  capacityUtilization: 0.3,
  conflictProjectIds: [],
  supervisionRequired: false,
  ...overrides,
});

describe("marketplaceMatcherService", () => {
  describe("matchMarketplaceListings", () => {
    it("matches a listing by trade and location", () => {
      const listing = makeListing();
      const result = matchMarketplaceListings([listing], baseRequirement);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].score).toBeGreaterThan(50);
      expect(result.matches[0].recommendedInvite).toBe(true);
    });

    it("ranks higher for better trade match", () => {
      const good = makeListing({ listingId: "good", trades: ["general_building", "electrical", "plumbing", "hvac"] });
      const poor = makeListing({ listingId: "poor", trades: ["painting"] });
      const result = matchMarketplaceListings([good, poor], baseRequirement);
      expect(result.matches[0].listing.listingId).toBe("good");
      expect(result.matches[1].listing.listingId).toBe("poor");
    });

    it("sorts conflicts to the bottom", () => {
      const clean = makeListing({ listingId: "clean" });
      const conflicted = makeListing({ listingId: "conflicted", conflictProjectIds: ["proj-1"] });
      const result = matchMarketplaceListings([clean, conflicted], baseRequirement);
      expect(result.matches.find((m) => m.listing.listingId === "conflicted")!.conflict).toBe(true);
    });

    it("excludes explicit exclusions", () => {
      const listing = makeListing({ listingId: "excluded" });
      const result = matchMarketplaceListings([listing], {
        ...baseRequirement,
        excludeListingIds: ["excluded"],
      });
      expect(result.matches).toHaveLength(0);
    });

    it("scores unavailable listings low", () => {
      const available = makeListing({ listingId: "a", availability: "available" });
      const unavailable = makeListing({ listingId: "u", availability: "unavailable" });
      const result = matchMarketplaceListings([available, unavailable], baseRequirement);
      const uMatch = result.matches.find((m) => m.listing.listingId === "u")!;
      expect(uMatch.recommendedInvite).toBe(false);
      expect(uMatch.normalizedScore).toBeLessThan(
        result.matches.find((m) => m.listing.listingId === "a")!.normalizedScore,
      );
    });

    it("includes verification badge matches in reasons", () => {
      const listing = makeListing({
        verificationBadges: ["cidb_grade_7", "tax_clearance"],
      });
      const result = matchMarketplaceListings([listing], baseRequirement);
      expect(result.matches[0].reasons.some((r) => r.includes("cidb"))).toBe(true);
    });

    it("flags missing verification badges", () => {
      const listing = makeListing({
        verificationBadges: [],
      });
      const result = matchMarketplaceListings([listing], baseRequirement);
      expect(result.matches[0].flags.some((f) => /missing verification/i.test(f))).toBe(true);
    });

    it("flags supervision required", () => {
      const listing = makeListing({ supervisionRequired: true });
      const result = matchMarketplaceListings([listing], baseRequirement);
      expect(result.matches[0].flags.some((f) => /supervision required/i.test(f))).toBe(true);
    });

    it("returns advisory note", () => {
      const result = matchMarketplaceListings([makeListing()], baseRequirement);
      expect(result.advisoryNote).toContain("advisory");
    });

    it("scores geographic proximity", () => {
      const local = makeListing({ listingId: "local", location: "Cape Town", province: "Western Cape" });
      const distant = makeListing({ listingId: "distant", location: "Johannesburg", province: "Gauteng" });
      const result = matchMarketplaceListings([local, distant], baseRequirement);
      expect(result.matches[0].listing.listingId).toBe("local");
    });

    it("handles empty listings", () => {
      const result = matchMarketplaceListings([], baseRequirement);
      expect(result.matches).toHaveLength(0);
    });
  });

  describe("getTopRecommendations", () => {
    it("returns top N recommended matches excluding conflicts", () => {
      const listings = Array.from({ length: 6 }, (_, i) =>
        makeListing({ listingId: `list-${i}`, trades: ["general_building", "electrical"], rating: 4 + i * 0.1 }),
      );
      const result = matchMarketplaceListings(listings, baseRequirement);
      const top = getTopRecommendations(result, 3);
      expect(top).toHaveLength(3);
      expect(top.every((m) => m.recommendedInvite)).toBe(true);
    });
  });
});
