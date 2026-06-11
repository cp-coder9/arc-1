import { describe, expect, it } from "vitest";
import { classifyProcurementScope } from "../procurementScopeClassifier";

describe("procurementScopeClassifier", () => {
  const baseInput = {
    projectId: "proj-1",
    projectName: "Test Project",
    estimatedValueZar: 2_000_000,
    complexity: "medium" as const,
    urgency: "standard" as const,
    publicSector: false,
    requiredTrades: ["general_building", "electrical"],
    requiredSpecialists: [],
    municipalReadinessScore: 70,
    regulatoryRequirements: [],
    riskFlags: [],
    location: "Cape Town",
  };

  it("classifies public sector high-value projects as open_tender", () => {
    const result = classifyProcurementScope({
      ...baseInput,
      publicSector: true,
      estimatedValueZar: 5_000_000,
    });
    expect(result.classification).toBe("open_tender");
    expect(result.publicAdvertisement).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it("classifies emergency procurement as direct_appointment", () => {
    const result = classifyProcurementScope({
      ...baseInput,
      urgency: "emergency",
      complexity: "low",
      estimatedValueZar: 100_000,
    });
    expect(result.classification).toBe("direct_appointment");
    expect(result.minimumBidders).toBe(1);
  });

  it("classifies very high complexity as open_tender above threshold", () => {
    const result = classifyProcurementScope({
      ...baseInput,
      complexity: "very_high",
      estimatedValueZar: 10_000_000,
    });
    expect(result.classification).toBe("open_tender");
    expect(result.minimumBidders).toBe(3);
    expect(result.recommendedBidders).toBe(6);
  });

  it("classifies high complexity medium value as invited_tender", () => {
    const result = classifyProcurementScope({
      ...baseInput,
      complexity: "high",
      estimatedValueZar: 3_000_000,
    });
    expect(result.classification).toBe("invited_tender");
    expect(result.minimumBidders).toBe(3);
  });

  it("classifies medium value as invited_tender", () => {
    const result = classifyProcurementScope({
      ...baseInput,
      estimatedValueZar: 1_500_000,
    });
    expect(result.classification).toBe("invited_tender");
  });

  it("classifies multi-trade as rfq", () => {
    const result = classifyProcurementScope({
      ...baseInput,
      estimatedValueZar: 500_000,
      requiredTrades: ["plumbing", "electrical", "plastering"],
    });
    expect(result.classification).toBe("rfq");
    expect(result.minimumBidders).toBe(2);
  });

  it("classifies small single-trade low-complexity as direct_appointment", () => {
    const result = classifyProcurementScope({
      ...baseInput,
      estimatedValueZar: 100_000,
      complexity: "low",
      requiredTrades: ["painting"],
    });
    expect(result.classification).toBe("direct_appointment");
  });

  it("reduces confidence with low municipal readiness", () => {
    const highReadiness = classifyProcurementScope({
      ...baseInput,
      municipalReadinessScore: 80,
    });
    const lowReadiness = classifyProcurementScope({
      ...baseInput,
      municipalReadinessScore: 20,
    });
    expect(lowReadiness.confidence).toBeLessThan(highReadiness.confidence);
  });

  it("includes required participant categories", () => {
    const result = classifyProcurementScope({
      ...baseInput,
      estimatedValueZar: 5_000_000,
      complexity: "high",
      requiredSpecialists: ["structural_engineer"],
    });
    expect(result.requiredParticipantCategories).toContain("client");
    expect(result.requiredParticipantCategories).toContain("lead_professional");
    expect(result.requiredParticipantCategories).toContain("quantity_surveyor");
    expect(result.requiredParticipantCategories).toContain("specialist_consultant");
  });

  it("includes regulatory triggers for public sector", () => {
    const result = classifyProcurementScope({
      ...baseInput,
      publicSector: true,
      estimatedValueZar: 5_000_000,
    });
    expect(result.regulatoryTriggers.some(t => /MFMA|PFMA/i.test(t))).toBe(true);
  });

  it("includes safety-critical regulatory triggers", () => {
    const result = classifyProcurementScope({
      ...baseInput,
      riskFlags: ["structural_risk"],
    });
    expect(result.regulatoryTriggers.some(t => /safety/i.test(t))).toBe(true);
  });

  it("estimates duration based on classification and urgency", () => {
    const standard = classifyProcurementScope({ ...baseInput, urgency: "standard" });
    const expedited = classifyProcurementScope({ ...baseInput, urgency: "expedited" });
    expect(expedited.estimatedDurationDays).toBeLessThan(standard.estimatedDurationDays);
  });

  it("includes governance note in every result", () => {
    const result = classifyProcurementScope(baseInput);
    expect(result.governanceNote).toBeTruthy();
    expect(result.governanceNote.length).toBeGreaterThan(50);
  });

  it("demotes open_tender to invited_tender when below public advertisement threshold", () => {
    const result = classifyProcurementScope({
      ...baseInput,
      complexity: "high",
      estimatedValueZar: 3_000_000,
    });
    // High complexity but not public sector and below R5M
    // Should become invited_tender not open_tender
    expect(result.publicAdvertisement).toBe(false);
    expect(["invited_tender", "rfq"]).toContain(result.classification);
  });

  it("returns confidence between 0.3 and 0.98", () => {
    const result = classifyProcurementScope(baseInput);
    expect(result.confidence).toBeGreaterThanOrEqual(0.3);
    expect(result.confidence).toBeLessThanOrEqual(0.98);
  });
});
