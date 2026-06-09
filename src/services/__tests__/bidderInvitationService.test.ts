import { describe, expect, it } from "vitest";
import {
  createBidderInvitation,
  createBatchInvitations,
  issueInvitation,
  acceptInvitation,
  declineInvitation,
  revokeInvitation,
  checkAndExpireInvitations,
  getInvitationStatusSummary,
} from "../bidderInvitationService";

const baseInvitation = {
  rfqId: "rfq_proj-1_123",
  rfqTitle: "Kitchen Renovation",
  bidderId: "bidder-1",
  bidderName: "ABC Construction",
  bidderEmail: "abc@example.com",
  bidderCategory: "main_contractor",
  invitedBy: "user-1",
};

describe("bidderInvitationService", () => {
  describe("createBidderInvitation", () => {
    it("creates an invitation with draft status", () => {
      const inv = createBidderInvitation(baseInvitation);
      expect(inv.invitationId).toBe(`inv_${baseInvitation.rfqId}_${baseInvitation.bidderId}`);
      expect(inv.status).toBe("draft");
      expect(inv.bidderName).toBe("ABC Construction");
      expect(inv.expiresAt).toBeTruthy();
    });

    it("throws on missing rfqId", () => {
      expect(() => createBidderInvitation({ ...baseInvitation, rfqId: "" }))
        .toThrow("RFQ ID is required");
    });

    it("throws on invalid email", () => {
      expect(() => createBidderInvitation({ ...baseInvitation, bidderEmail: "not-an-email" }))
        .toThrow("Valid bidder email is required");
    });

    it("uses custom expiry days", () => {
      const inv = createBidderInvitation({ ...baseInvitation, expiryDays: 7 });
      const expiresAt = new Date(inv.expiresAt).getTime();
      const createdAt = new Date(inv.createdAt).getTime();
      expect(expiresAt - createdAt).toBeCloseTo(7 * 24 * 60 * 60 * 1000, -2); // within ~100ms
    });
  });

  describe("createBatchInvitations", () => {
    it("creates multiple invitations", () => {
      const inputs = [
        { ...baseInvitation, bidderId: "b1", bidderName: "A", bidderEmail: "a@test.com" },
        { ...baseInvitation, bidderId: "b2", bidderName: "B", bidderEmail: "b@test.com" },
      ];
      const batch = createBatchInvitations(inputs);
      expect(batch.totalInvited).toBe(2);
      expect(batch.invitations).toHaveLength(2);
    });

    it("throws if invitations have different rfqIds", () => {
      const inputs = [
        { ...baseInvitation, bidderId: "b1", bidderName: "A", bidderEmail: "a@test.com" },
        { ...baseInvitation, rfqId: "other-rfq", bidderId: "b2", bidderName: "B", bidderEmail: "b@test.com" },
      ];
      expect(() => createBatchInvitations(inputs)).toThrow("same RFQ");
    });
  });

  describe("status transitions", () => {
    it("issues an invitation", () => {
      const inv = createBidderInvitation(baseInvitation);
      const issued = issueInvitation(inv);
      expect(issued.status).toBe("invited");
    });

    it("accepts an invitation", () => {
      const inv = createBidderInvitation(baseInvitation);
      const issued = issueInvitation(inv);
      const accepted = acceptInvitation(issued);
      expect(accepted.status).toBe("accepted");
      expect(accepted.respondedAt).toBeTruthy();
    });

    it("declines an invitation with reason", () => {
      const inv = createBidderInvitation(baseInvitation);
      const declined = declineInvitation(inv, "Too busy");
      expect(declined.status).toBe("declined");
      expect(declined.declineReason).toBe("Too busy");
    });

    it("revokes an invitation", () => {
      const inv = createBidderInvitation(baseInvitation);
      const issued = issueInvitation(inv);
      const revoked = revokeInvitation(issued);
      expect(revoked.status).toBe("revoked");
    });

    it("prevents revoking accepted invitation", () => {
      const inv = createBidderInvitation(baseInvitation);
      const issued = issueInvitation(inv);
      const accepted = acceptInvitation(issued);
      expect(() => revokeInvitation(accepted)).toThrow("Cannot revoke an already accepted invitation");
    });
  });

  describe("checkAndExpireInvitations", () => {
    it("expires past-due invitations", () => {
      const inv = createBidderInvitation({ ...baseInvitation, expiryDays: 0 });
      const issued = { ...issueInvitation(inv), expiresAt: new Date("2020-01-01").toISOString() };
      const results = checkAndExpireInvitations([issued]);
      expect(results[0].status).toBe("expired");
    });
  });

  describe("getInvitationStatusSummary", () => {
    it("computes correct counts", () => {
      const inv1 = { ...createBidderInvitation(baseInvitation), status: "accepted" as const };
      const inv2 = { ...createBidderInvitation({ ...baseInvitation, bidderId: "b2", bidderName: "B", bidderEmail: "b@test.com" }), status: "declined" as const };
      const summary = getInvitationStatusSummary([inv1, inv2]);
      expect(summary.total).toBe(2);
      expect(summary.accepted).toBe(1);
      expect(summary.declined).toBe(1);
    });
  });
});
