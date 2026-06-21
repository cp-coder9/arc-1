import { AuditViewerService } from './auditViewerService';
import { PaymentConfigService } from './paymentConfigService';
import { PolicyGateService } from './policyGateService';
import { ReviewQueueService } from './reviewQueueService';
import { TariffEditorService } from './tariffEditorService';
import { VerificationService } from './verificationService';
import { agentRecommendation, toInboxTask, toProjectRecord } from './integrationAdapters';
import type { AdminActor, AuditEvent } from './types';

export function runDemo() {
  const superAdmin: AdminActor = { id: 'admin-1', role: 'super_admin', tenantScopes: ['tenant-architex'], canViewSensitiveAudit: true };
  const tariffEditor: AdminActor = { id: 'tariff-1', role: 'tariff_editor', tenantScopes: ['tenant-architex'], canViewSensitiveAudit: false };
  const auditViewer: AdminActor = { id: 'audit-1', role: 'audit_viewer', tenantScopes: ['tenant-architex'], canViewSensitiveAudit: false };
  const financeAdmin: AdminActor = { id: 'finance-1', role: 'finance_admin', tenantScopes: ['tenant-architex'], canViewSensitiveAudit: false };
  const verifier: AdminActor = { id: 'verify-1', role: 'verification_reviewer', tenantScopes: ['tenant-architex'], canViewSensitiveAudit: false };
  const aiModerator: AdminActor = { id: 'ai-1', role: 'ai_review_moderator', tenantScopes: ['tenant-architex'], canViewSensitiveAudit: false };

  const tariffs = new TariffEditorService();
  const verification = new VerificationService();
  const audit = new AuditViewerService();
  const reviewQueue = new ReviewQueueService();
  const payments = new PaymentConfigService();
  const gates = new PolicyGateService();

  const draftTariff = tariffs.draft(tariffEditor, { profession: 'architect', sourceName: 'Admin editable Architex tariff table', sourceRef: 'manual://tariff-source-v1', effectiveFrom: '2026-07-01', lines: [{ code: 'ARCH_BASIC', description: 'Basic service guideline percentage', formula: 'percentage', value: 6.25, unit: 'percent' }, { code: 'ARCH_HOURLY', description: 'Hourly admin-adjustable rate', formula: 'hourly', value: 950, unit: 'ZAR/hour' }] });
  const reviewTariff = tariffs.submitForReview(tariffEditor, draftTariff);
  const publishedTariff = tariffs.publish(superAdmin, reviewTariff);
  const replacement = tariffs.publish(superAdmin, tariffs.submitForReview(tariffEditor, tariffs.draft(tariffEditor, { profession: 'architect', sourceName: 'Admin editable Architex tariff table', sourceRef: 'manual://tariff-source-v2', effectiveFrom: '2027-01-01', version: 2, lines: [{ code: 'ARCH_BASIC', description: 'Basic service guideline percentage', formula: 'percentage', value: 6.5, unit: 'percent' }] })));
  const [supersededTariff, activeTariff] = tariffs.supersede(superAdmin, publishedTariff, replacement);

  const verificationCase = verification.create('supplier-1', 'supplier', ['file://tax-clearance.pdf', 'file://bbbee-certificate.pdf']);
  const verifiedSupplier = verification.review(verifier, verificationCase, 'manually_verified', 'Documents checked manually; external API not configured.');
  const expiredVerification = verification.expire(verifiedSupplier);

  const reviewItem = reviewQueue.create({ tenantId: 'tenant-architex', sourceType: 'ai_takeoff', sourceRef: 'takeoff-draft-001', risk: 'high', proposedAction: 'Approve AI draft BoQ quantities for human QS review pack', reviewerRole: 'ai_review_moderator' });
  const inReview = reviewQueue.start(aiModerator, reviewItem);
  const approvedReview = reviewQueue.decide(aiModerator, inReview, 'approved', 'Approved as draft-only; QS/professional still responsible before issue.');

  const provider = payments.configure(financeAdmin, { providerName: 'PayFast', mode: 'test', enabledScopes: ['assessment_payment', 'payment_release'], settlementCurrency: 'ZAR', platformFeePercent: 1.5, webhookConfigured: true, providerRef: 'provider-config-ref-redacted' });
  const disabledProvider = payments.disable(financeAdmin, provider);

  const event1 = audit.createEvent({ tenantId: 'tenant-architex', projectId: 'project-1', userId: superAdmin.id, objectRef: activeTariff.id, eventType: 'TARIFF_VERSION_PUBLISHED', payload: { tariffId: activeTariff.id, sourceRef: activeTariff.sourceRef, apiKey: 'secret-value-not-for-display' }, redactedFields: ['apiKey'] });
  const event2 = audit.createEvent({ tenantId: 'tenant-architex', projectId: 'project-1', userId: verifier.id, objectRef: verifiedSupplier.id, eventType: 'VERIFICATION_REVIEW_COMPLETED', payload: { subjectId: verifiedSupplier.subjectId, providerToken: 'token-value-not-for-display', badge: verifiedSupplier.badgeLabel }, redactedFields: ['providerToken'], previousHash: event1.hash });
  const events: AuditEvent[] = [event1, event2];
  const redactedAudit = audit.query(auditViewer, events, { tenantId: 'tenant-architex' });
  const privilegedAudit = audit.query(superAdmin, events, { tenantId: 'tenant-architex' });

  const decisions = [gates.tariffUse(activeTariff), gates.verificationUse(expiredVerification), gates.aiFormalAction(approvedReview), gates.paymentRelease(disabledProvider)];
  const blocked = decisions.filter((d) => d.decision === 'blocked');

  return {
    tariffs: { draftStatus: draftTariff.status, publishedStatus: publishedTariff.status, supersededStatus: supersededTariff.status, activeVersion: activeTariff.version, immutablePattern: supersededTariff.supersededBy === activeTariff.id },
    verification: { uploadedStatus: verificationCase.status, reviewedStatus: verifiedSupplier.status, expiredStatus: expiredVerification.status, badgeLabel: expiredVerification.badgeLabel },
    reviewQueue: { initialStatus: reviewItem.status, finalStatus: approvedReview.status },
    paymentConfig: { providerStatus: provider.status, disabledStatus: disabledProvider.status, canRequestReleaseWhenActive: payments.canRequestRelease(provider), canRequestReleaseWhenDisabled: payments.canRequestRelease(disabledProvider) },
    audit: { eventCount: events.length, chainValid: audit.verifyChain(events), redactedApiKey: redactedAudit[0]?.payload.apiKey, privilegedApiKeyVisible: privilegedAudit[0]?.payload.apiKey === 'secret-value-not-for-display' },
    policyGates: { allowed: decisions.filter((d) => d.decision === 'allowed').length, requiresReview: decisions.filter((d) => d.decision === 'requires_review').length, blocked: blocked.length, blockedCodes: blocked.map((b) => b.policyCode) },
  };
}
