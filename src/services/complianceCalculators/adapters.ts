export function toProjectRecord(report: { id: string; verdict: string; auditHash: string; actionCards?: string[] }) {
  return { type: 'COMPLIANCE_CALCULATOR_REPORT' as const, reportId: report.id, verdict: report.verdict, auditHash: report.auditHash, actionCount: report.actionCards?.length ?? 0 };
}

export function toInboxTasks(report: { verdict: string; actionCards?: string[]; id: string }) {
  return (report.actionCards ?? []).map((a: string, i: number) => ({
    type: 'COMPLIANCE_ACTION' as const,
    priority: report.verdict === 'fail' ? 'high' as const : 'normal' as const,
    title: `Compliance action ${i + 1}`,
    message: a,
    reportId: report.id,
  }));
}

export function toMunicipalReadiness(report: { verdict: string; actionCards?: string[]; id: string }) {
  return {
    complianceVerdict: report.verdict,
    blockers: (report.actionCards ?? []).filter((_: string, i: number) => report.verdict === 'fail' || i < 3),
    evidenceReportId: report.id,
    professionalSignoffRequired: true,
    municipalApproval: false,
  };
}
