import type { ComplianceReport } from './types';
import { hash, id, verdictFrom } from './utils';

export class ComplianceReportService {
  consolidate(project: ComplianceReport['project'], reports: ComplianceReport[]): ComplianceReport {
    const verdict = verdictFrom(reports);
    const report: ComplianceReport = {
      id: id('comp'), title: 'Architex Compliance Calculator Pack Summary', verdict, project,
      sourceVersion: reports.map((r) => r.sourceVersion).filter(Boolean).join(', '),
      summary: reports.flatMap((r) => r.summary ?? []),
      actionCards: reports.flatMap((r) => r.actionCards ?? []),
      results: reports, createdAt: new Date().toISOString(), auditHash: '',
    };
    report.auditHash = hash(JSON.stringify(report));
    return report;
  }
}
