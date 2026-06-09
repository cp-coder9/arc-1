/**
 * End-to-End Integration Test: Finance / Payment / Escrow + Commercial Control
 *
 * Simulates the full commercial control workflow as described in the
 * pack specification and validation report:
 *
 *   Baseline → Variation → Claim → Certify → Retention →
 *   Escrow Release → Webhook → Payment → Cashflow Update
 */
import { describe, it, expect } from 'vitest';
import { createCommercialBaseline, incorporateVariationIntoBaseline } from '../commercialBaselineService';
import { buildPaymentSchedule, findNextPaymentDue } from '../paymentScheduleService';
import { createAndSubmitVariation, approveAndIncorporateVariation } from '../variationControlService';
import { submitPaymentClaim, disputeClaim } from '../claimSubmissionService';
import { certifyPaymentClaim, approveCertificateForRelease } from '../paymentCertificateService';
import { selectProvider, assessProviderReadiness, isProviderLiveReady } from '../thirdPartyFinancialProviderRegistry';
import { createReleaseRequest, approveReleaseRequest, getReleaseBlockers } from '../escrowReleaseRequestService';
import { recordProviderStatusEvent, confirmPaymentReceived } from '../paymentProviderWebhookAdapter';
import { createCashflowForecast, compareActualsVsForecast } from '../cashflowForecastService';
import { createProjectRecords, createBaselineRecord } from '../projectRecordAdapter';
import { createInboxEvents } from '../inboxEventAdapter';
import { createAuditTrail } from '../auditTrailService';
import { createAgentRecommendations } from '../agentRecommendationService';
import { calculateRetention, createRetentionRecord, releaseRetention } from '../retentionService';
import { sampleAward, sampleProviders } from '../sampleData';
import type {
  CommercialBaseline,
  VariationRequest,
  PaymentClaim,
  PaymentCertificate,
  ReleaseRequest,
  FinancialProvider,
} from '../types';

describe('Finance Commercial Control — Full Workflow Integration', () => {
  // Step 1: Create commercial baseline from award
  let baseline: CommercialBaseline;
  let provider: FinancialProvider;

  it('Step 1: creates commercial baseline from award', () => {
    baseline = createCommercialBaseline(sampleAward);
    expect(baseline.status).toBe('active');
    expect(baseline.currentContractSum.amount).toBe(2_650_000);
    expect(baseline.retentionPercent).toBe(5);
  });

  // Step 2: Submit and approve a variation
  let variation: VariationRequest;

  it('Step 2: submits and approves a variation', () => {
    const v = createAndSubmitVariation({
      description: 'Client-approved drainage upgrade',
      requestedBy: 'contractor',
      estimatedImpact: { currency: 'ZAR', amount: 85_000 },
      programmeImpactDays: 5,
    });
    const result = approveAndIncorporateVariation(baseline, v);
    baseline = result.baseline;
    variation = result.variation;

    expect(variation.status).toBe('incorporated');
    expect(variation.approved).toBe(true);
    expect(baseline.currentContractSum.amount).toBe(2_735_000); // 2.65M + 85k
    expect(baseline.approvedVariationsTotal.amount).toBe(85_000);
  });

  // Step 3: Build payment schedule
  let schedule = buildPaymentSchedule(baseline);

  it('Step 3: builds payment schedule from baseline', () => {
    expect(schedule).toHaveLength(5);
    const nextDue = findNextPaymentDue(schedule);
    expect(nextDue).toBeTruthy();
    expect(nextDue!.milestoneId).toBe('deposit');
  });

  // Step 4: Submit a payment claim
  let claim: PaymentClaim;

  it('Step 4: submits contractor payment claim', () => {
    claim = submitPaymentClaim({
      claimantRole: 'contractor',
      claimedAmount: { currency: 'ZAR', amount: 820_000 },
      linkedMilestoneId: 'milestone-structure',
      linkedVariationIds: [variation.variationId],
    });
    expect(claim.claimantRole).toBe('contractor');
    expect(claim.claimedAmount.amount).toBe(820_000);
    expect(claim.linkedVariationIds).toContain(variation.variationId);
  });

  // Step 5: Certify the claim
  let certificate: PaymentCertificate;

  it('Step 5: certifies the payment claim (QS review)', () => {
    certificate = certifyPaymentClaim(claim, baseline, {
      currency: 'ZAR',
      amount: 790_000,
    });
    expect(certificate.certifiedAmount.amount).toBe(790_000);
    expect(certificate.retentionHeld.amount).toBe(39_500); // 5% of 790k
    expect(certificate.disputedAmount.amount).toBe(30_000); // 820k - 790k
    expect(certificate.approvedForRelease.amount).toBe(750_500); // 790k - 39.5k
    expect(certificate.status).toBe('approval_required');
  });

  // Step 6: Disputed claim locks release
  let disputedClaim: PaymentClaim;
  let disputedCertificate: PaymentCertificate;
  let disputedRelease: ReleaseRequest;

  it('Step 6: disputed claim blocks release', () => {
    disputedClaim = submitPaymentClaim({
      claimantRole: 'contractor',
      claimedAmount: { currency: 'ZAR', amount: 150_000 },
      linkedMilestoneId: 'milestone-enclosure',
      disputed: true,
    });
    disputedCertificate = certifyPaymentClaim(
      disputedClaim,
      baseline,
      { currency: 'ZAR', amount: 0 },
    );
    expect(disputedCertificate.status).toBe('disputed_locked');
  });

  // Step 7: Select third-party provider
  it('Step 7: selects escrow provider and checks readiness', () => {
    provider = selectProvider(sampleProviders, 'escrow_hold');
    expect(provider.providerId).toBe('fsp-escrow-demo');

    const notes = assessProviderReadiness(provider);
    expect(notes.length).toBeGreaterThan(0);
    // Provider is not live-configured
    expect(isProviderLiveReady(provider, 'escrow_hold')).toBe(false);
  });

  // Step 8: Create release request
  let release: ReleaseRequest;

  it('Step 8: creates release request — provider_configuration_required', () => {
    release = createReleaseRequest(certificate, provider, ['client']);
    // Provider not live-configured, so stays provider_configuration_required
    // Even with some approvals, provider is not live
    expect(release.status).toBe('provider_configuration_required');
    expect(release.amount.amount).toBe(750_500);
  });

  // Step 9: Disputed release is blocked
  it('Step 9: disputed release request is locked', () => {
    disputedRelease = createReleaseRequest(disputedCertificate, provider, [
      'client',
      'lead_professional',
    ]);
    expect(disputedRelease.status).toBe('disputed_locked');
  });

  // Step 10: Record webhook event
  it('Step 10: records provider webhook placeholder', () => {
    const webhook = recordProviderStatusEvent(release);
    expect(webhook.status).toBe('received');
    expect(webhook.providerId).toBe(provider.providerId);
    expect(webhook.providerReference).toBe('not-submitted');
  });

  // Step 11: Create cashflow forecast
  it('Step 11: creates cashflow forecast', () => {
    const forecast = createCashflowForecast(
      sampleAward.projectId,
      schedule,
      certificate,
    );
    expect(forecast.projectId).toBe(sampleAward.projectId);
    expect(forecast.nextRelease.amount).toBe(750_500);
    expect(forecast.retentionHeld.amount).toBe(39_500);

    const comparison = compareActualsVsForecast(forecast, forecast.totalScheduled.amount);
    expect(comparison.status).toBe('on_track');
  });

  // Step 12: Generate ProjectRecords
  it('Step 12: generates linked ProjectRecords', () => {
    const records = createProjectRecords(
      baseline,
      variation,
      certificate,
      release,
    );
    expect(records).toHaveLength(4);

    const recordTypes = records.map((r) => r.recordType);
    expect(recordTypes).toContain('commercial_baseline');
    expect(recordTypes).toContain('variation_order');
    expect(recordTypes).toContain('payment_certificate');
    expect(recordTypes).toContain('escrow_release_request');

    // Verify linking chain
    const baselineRec = records.find(
      (r) => r.recordType === 'commercial_baseline',
    );
    expect(baselineRec!.linkedRecordIds).toContain(sampleAward.awardId);
  });

  // Step 13: Generate inbox events
  it('Step 13: generates inbox events for all parties', () => {
    const inbox = createInboxEvents(certificate, release, variation);
    expect(inbox.length).toBeGreaterThanOrEqual(4);

    const blockedEvents = inbox.filter((e) => e.severity === 'blocked');
    expect(blockedEvents.length).toBeGreaterThan(0);
    expect(
      blockedEvents.some((e) => e.title.includes('Configure registered third-party')),
    ).toBe(true);

    const actionEvents = inbox.filter((e) => e.severity === 'action_required');
    expect(actionEvents.length).toBeGreaterThan(0);
  });

  // Step 14: Generate audit trail
  it('Step 14: generates complete audit trail', () => {
    const audit = createAuditTrail(baseline, variation, certificate, release);
    expect(audit).toHaveLength(4);
    expect(audit[0].action).toBe('commercial_baseline_created');
    expect(audit[3].action).toBe(
      'third_party_provider_release_request_created',
    );
    expect(audit[3].notes).toContain('Architex does not hold funds');
  });

  // Step 15: Generate agent recommendations
  it('Step 15: generates agent recommendations', () => {
    const providerNotes = assessProviderReadiness(provider);
    const recs = createAgentRecommendations(
      certificate,
      release,
      providerNotes,
    );

    // Should include "configure provider" since provider not live
    expect(recs.some((r) => r.id === 'rec-configure-provider')).toBe(true);
    // Should include "resolve dispute" since disputedAmount > 0
    expect(recs.some((r) => r.id === 'rec-resolve-dispute')).toBe(true);
    // Core recommendations always present
    expect(recs.some((r) => r.id === 'rec-approval-gates')).toBe(true);
    expect(recs.some((r) => r.id === 'rec-provider-boundary')).toBe(true);
    expect(recs.some((r) => r.id === 'rec-separate-amounts')).toBe(true);
  });

  // Step 16: Retention tracking
  it('Step 16: tracks retention from certificate', () => {
    const retentionAmount = calculateRetention(
      certificate.certifiedAmount,
      baseline.retentionPercent,
    );
    expect(retentionAmount.amount).toBe(39_500);

    const record = createRetentionRecord({
      projectId: sampleAward.projectId,
      certificateId: certificate.certificateId,
      amountHeld: retentionAmount,
      percent: baseline.retentionPercent,
      scheduledReleaseDate: '2027-06-01T00:00:00.000Z',
    });
    expect(record.status).toBe('held');
    expect(record.amountHeld.amount).toBe(39_500);

    // Simulate partial release
    const partialRelease = releaseRetention(record, {
      currency: 'ZAR',
      amount: 20_000,
    });
    expect(partialRelease.status).toBe('partially_released');

    // Full release
    const fullRelease = releaseRetention(partialRelease, {
      currency: 'ZAR',
      amount: 19_500,
    });
    expect(fullRelease.status).toBe('fully_released');
  });

  // Step 17: Verify provider boundary — Architex does NOT hold funds
  it('Step 17: verifies Architex provider boundary — does not hold funds', () => {
    const providerNotes = assessProviderReadiness(provider);
    const isLive = isProviderLiveReady(provider, 'escrow_hold');

    // Architex must NOT hold funds — all release must go through live provider
    expect(isLive).toBe(false);
    expect(providerNotes.join(' ')).toContain(
      'not live-configured',
    );
    // Release status reflects provider boundary
    expect(release.status).toBe('provider_configuration_required');
  });
});
