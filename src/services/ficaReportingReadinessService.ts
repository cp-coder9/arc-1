export type FicaReportState = 'none' | 'draft' | 'queued_for_mlro_review' | 'reported' | 'closed';
export interface FicaTransaction { id: string; amount: number; payerId: string; payeeId: string; createdAt: string; method?: string; flagged?: boolean }
export interface FicaReportingReadinessInput { accountableInstitutionRegistered?: boolean; ctrThreshold?: number; transactions?: FicaTransaction[]; evidence?: { kycPackRef?: string; sourceOfFundsRef?: string; mlroReviewRef?: string; reportReceiptRef?: string }; reportState?: FicaReportState }
export function evaluateFicaReportingReadiness(input: FicaReportingReadinessInput) {
  const threshold = input.ctrThreshold ?? 49_999.99;
  const txs = input.transactions ?? [];
  const ctrTransactions = txs.filter((t) => t.amount > threshold).map((t) => t.id);
  const byPayerDay = new Map<string, number>();
  for (const t of txs) byPayerDay.set(`${t.payerId}:${t.createdAt.slice(0, 10)}`, (byPayerDay.get(`${t.payerId}:${t.createdAt.slice(0, 10)}`) ?? 0) + t.amount);
  const splitDetected = [...byPayerDay.values()].some((sum) => sum > threshold) && ctrTransactions.length === 0;
  const suspiciousTransactions = txs.filter((t) => t.flagged || splitDetected).map((t) => t.id);
  const reportingRequired = ctrTransactions.length > 0 || suspiciousTransactions.length > 0;
  const e = input.evidence ?? {};
  const blockers = reportingRequired ? [!input.accountableInstitutionRegistered && 'Accountable Institution registration must be confirmed.', !e.kycPackRef && 'KYC/FICA pack reference is required.', !e.sourceOfFundsRef && 'Source-of-funds evidence is required.', (!input.reportState || input.reportState === 'none') && 'STR/CTR case must be drafted and queued for admin/MLRO review.', input.reportState === 'reported' && !e.reportReceiptRef && 'Reported STR/CTR must retain regulator receipt proof.'].filter(Boolean) as string[] : [];
  return Object.freeze({ status: !reportingRequired ? 'not_required' : blockers.length ? 'blocked' : 'ready_for_admin_queue', reportingRequired, ctrTransactions, suspiciousTransactions, paymentSplittingDetected: splitDetected, reportState: input.reportState ?? 'none', blockers, nextAction: { label: !reportingRequired ? 'Monitor payments for FICA thresholds' : blockers.length ? 'Resolve FICA STR/CTR reporting blockers' : 'Queue suspicious transaction case for MLRO/admin review', priority: reportingRequired ? 'high' : 'low', target: 'admin-governance', requiresHumanConfirmation: true, automationLevel: 'advisory' as const }, audit: { prdSection: 'Section 57: FICA Compliance Architecture & Suspicious Transaction Reporting (STR/CTR)' as const, noAutomaticRegulatorReport: true, humanReviewRequired: true } });
}
