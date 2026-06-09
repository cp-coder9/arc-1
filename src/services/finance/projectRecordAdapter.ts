/**
 * ProjectRecord Adapter for Finance / Commercial Control
 *
 * Creates ProjectRecord entities that integrate with the Project Passport
 * lifecycle. Each financial entity (baseline, certification, release, etc.)
 * produces a linked record for the project's permanent record trail.
 */
import type {
  CommercialBaseline,
  FinanceProjectRecord,
  PaymentCertificate,
  PaymentMilestone,
  ReleaseRequest,
  RetentionRecord,
  VariationRequest,
} from './types';

/**
 * Create a full set of project records for the commercial control workflow.
 * Each record links to its predecessors, forming a traceable chain.
 */
export function createProjectRecords(
  baseline: CommercialBaseline,
  variation: VariationRequest,
  certificate: PaymentCertificate,
  release: ReleaseRequest,
): FinanceProjectRecord[] {
  const projectId = baseline.award.projectId;

  return [
    createBaselineRecord(baseline),
    createVariationRecord(variation, baseline, projectId),
    createCertificateRecord(certificate, variation, projectId),
    createReleaseRecord(release, certificate, projectId),
  ];
}

/** Create a project record for the commercial baseline */
export function createBaselineRecord(
  baseline: CommercialBaseline,
): FinanceProjectRecord {
  return {
    recordId: `rec-${baseline.baselineId}`,
    projectId: baseline.award.projectId,
    moduleKey: 'finance_commercial_control',
    recordType: 'commercial_baseline',
    title: 'Commercial baseline',
    status: baseline.status,
    linkedRecordIds: [baseline.award.awardId],
  };
}

/** Create a project record for a variation */
export function createVariationRecord(
  variation: VariationRequest,
  baseline: CommercialBaseline,
  projectId?: string,
): FinanceProjectRecord {
  return {
    recordId: `rec-${variation.variationId}`,
    projectId: projectId ?? baseline.award.projectId,
    moduleKey: 'finance_commercial_control',
    recordType: 'variation_order',
    title: variation.description,
    status: variation.status,
    linkedRecordIds: [`rec-${baseline.baselineId}`],
  };
}

/** Create a project record for a payment certificate */
export function createCertificateRecord(
  certificate: PaymentCertificate,
  variationOrBaseline: VariationRequest | CommercialBaseline,
  projectId?: string,
): FinanceProjectRecord {
  const linkedRecordId =
    'variationId' in variationOrBaseline
      ? `rec-${variationOrBaseline.variationId}`
      : `rec-${variationOrBaseline.baselineId}`;

  return {
    recordId: `rec-${certificate.certificateId}`,
    projectId:
      projectId ??
      ('award' in variationOrBaseline
        ? variationOrBaseline.award.projectId
        : ''),
    moduleKey: 'finance_commercial_control',
    recordType: 'payment_certificate',
    title: 'Payment certificate',
    status: certificate.status,
    linkedRecordIds: [linkedRecordId],
  };
}

/** Create a project record for a provider release request */
export function createReleaseRecord(
  release: ReleaseRequest,
  certificate: PaymentCertificate,
  projectId: string,
): FinanceProjectRecord {
  return {
    recordId: `rec-${release.releaseRequestId}`,
    projectId,
    moduleKey: 'finance_commercial_control',
    recordType: 'escrow_release_request',
    title: 'Third-party provider release request',
    status: release.status,
    linkedRecordIds: [`rec-${certificate.certificateId}`],
  };
}

/** Create a project record for the payment schedule */
export function createPaymentScheduleRecord(
  schedule: PaymentMilestone[],
  projectId: string,
  baselineId: string,
): FinanceProjectRecord {
  return {
    recordId: `rec-schedule-${projectId}`,
    projectId,
    moduleKey: 'finance_commercial_control',
    recordType: 'payment_schedule',
    title: `Payment schedule — ${schedule.length} milestones`,
    status: schedule.every((m) => m.status === 'provider_confirmed_paid')
      ? 'provider_confirmed_paid'
      : 'approval_required',
    linkedRecordIds: [`rec-${baselineId}`, ...schedule.map((m) => `milestone-${m.milestoneId}`)],
  };
}

/** Create a project record for a retention release */
export function createRetentionRecord(
  retention: RetentionRecord,
  projectId: string,
  certificateId: string,
): FinanceProjectRecord {
  return {
    recordId: `rec-${retention.retentionId}`,
    projectId,
    moduleKey: 'finance_commercial_control',
    recordType: 'retention_release',
    title: `Retention — ${retention.status}`,
    status: retention.status,
    linkedRecordIds: [`rec-${certificateId}`],
  };
}

/** Create a project record for a cashflow forecast */
export function createCashflowForecastRecord(
  forecastId: string,
  projectId: string,
  baselineId: string,
  scheduleRecordId: string,
  status: string = 'active',
): FinanceProjectRecord {
  return {
    recordId: `rec-${forecastId}`,
    projectId,
    moduleKey: 'finance_commercial_control',
    recordType: 'cashflow_forecast',
    title: 'Cashflow forecast',
    status,
    linkedRecordIds: [`rec-${baselineId}`, scheduleRecordId],
  };
}
