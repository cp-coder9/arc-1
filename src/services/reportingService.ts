// ─── Pack 15: Reporting Service ─────────────────────────────────────────────
// Report generation — structured project reports, compliance reports,
// financial summaries, and export-ready formatted outputs.

import { collection, doc, getDoc, getDocs, addDoc, updateDoc, query, where, orderBy, limit, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { AnalyticsMetric, ProjectHealthScore, PlatformMetrics, MetricCategory } from '@/services/analyticsService';
import type { ComplianceCheck, ComplianceSummary } from '@/services/complianceService';
import type { RfqPackage } from '@/services/rfqService';
import type { Bid } from '@/types';


import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';
// ─── Types ─────────────────────────────────────────────────────────────────

export type ReportFormat = 'markdown' | 'html' | 'json' | 'csv';

export type ReportType =
  | 'project_health'
  | 'compliance'
  | 'financial'
  | 'tender_evaluation'
  | 'platform_overview'
  | 'custom';

export type ReportScope = 'project' | 'platform' | 'tenant';

export type ReportStatus = 'draft' | 'generated' | 'archived';

export interface ReportDefinition {
  reportId: string;
  type: ReportType;
  scope: ReportScope;
  projectId?: string;
  tenantId: string;
  title: string;
  description: string;
  format: ReportFormat;
  includeGraphics: boolean;
  generatedAt: string;
  generatedBy: string;
  status: ReportStatus;
  content?: string;            // The rendered report content
  contentUrl?: string;         // Firestore storage URL if stored externally
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ReportTemplate {
  templateId: string;
  name: string;
  type: ReportType;
  description: string;
  defaultSections: string[];
  format: ReportFormat;
  isBuiltIn: boolean;
}

export interface ReportSection {
  sectionId: string;
  title: string;
  content: string;
  order: number;
  metrics?: AnalyticsMetric[];
}

// ─── Built-in Templates ────────────────────────────────────────────────────

const BUILT_IN_TEMPLATES: ReportTemplate[] = [
  {
    templateId: 'tpl-project-health',
    name: 'Project Health Report',
    type: 'project_health',
    description: 'Comprehensive project health overview including schedule, financial, compliance, quality, and safety scores.',
    defaultSections: ['Executive Summary', 'Health Scores', 'Schedule Analysis', 'Financial Overview', 'Compliance Status', 'Risk Assessment', 'Recommendations'],
    format: 'markdown',
    isBuiltIn: true,
  },
  {
    templateId: 'tpl-compliance',
    name: 'Compliance Report',
    type: 'compliance',
    description: 'Detailed compliance check results, SANS verification status, and document expiry tracking.',
    defaultSections: ['Summary', 'Compliance Checks', 'Findings', 'Document Expiry', 'Action Items'],
    format: 'markdown',
    isBuiltIn: true,
  },
  {
    templateId: 'tpl-financial',
    name: 'Financial Summary Report',
    type: 'financial',
    description: 'Financial overview including budgets, awarded amounts, and cost performance.',
    defaultSections: ['Summary', 'Budget Overview', 'Awarded Contracts', 'Cost Performance'],
    format: 'markdown',
    isBuiltIn: true,
  },
  {
    templateId: 'tpl-tender-evaluation',
    name: 'Tender Evaluation Report',
    type: 'tender_evaluation',
    description: 'Bid comparison, evaluation scores, and award recommendation.',
    defaultSections: ['RFQ Summary', 'Bid Overview', 'Evaluation Scores', 'Comparison', 'Recommendation'],
    format: 'markdown',
    isBuiltIn: true,
  },
  {
    templateId: 'tpl-platform-overview',
    name: 'Platform Overview Report',
    type: 'platform_overview',
    description: 'Platform-wide aggregate metrics and KPIs.',
    defaultSections: ['Overview', 'Active Projects', 'User Growth', 'Compliance Rate', 'Market Activity'],
    format: 'markdown',
    isBuiltIn: true,
  },
];

// ─── Service Functions ─────────────────────────────────────────────────────

/**
 * Get all available report templates.
 */
export async function getReportTemplates(): Promise<ReportTemplate[]> {
  try {
    const snapshot = await getDocs(getDemoCol( 'report_templates'));
    if (snapshot.empty) return BUILT_IN_TEMPLATES;
    const customTemplates = snapshot.docs.map((d) => d.data() as ReportTemplate);
    return [...BUILT_IN_TEMPLATES, ...customTemplates];
  } catch {
    return BUILT_IN_TEMPLATES;
  }
}

/**
 * Generate a project health report.
 */
export async function generateProjectHealthReport(
  projectId: string,
  tenantId: string,
  generatedBy: string,
  format: ReportFormat = 'markdown',
): Promise<ReportDefinition> {
  const [health, metrics, complianceSummary] = await Promise.all([
    getDoc(getDemoDoc( 'project_health_scores', projectId)).catch(async () => {
      const q = query(getDemoCol( 'project_health_scores'), where('projectId', '==', projectId), limit(1));
      const snap = await getDocs(q);
      return snap.docs[0] ?? null;
    }),
    getDocs(query(getDemoCol( 'analytics_metrics'), where('projectId', '==', projectId), limit(50))),
    getDocs(query(getDemoCol( 'compliance_checks'), where('projectId', '==', projectId))),
  ]);

  const healthData = health ? (health as unknown as { data(): ProjectHealthScore }).data() ?? health.data() : null;
  const metricsData = metrics.docs.map((d) => d.data() as AnalyticsMetric);

  const sections: ReportSection[] = [
    {
      sectionId: 'executive-summary',
      title: 'Executive Summary',
      content: healthData
        ? `Overall project health score: **${(healthData as ProjectHealthScore).overallScore}/100** (${(healthData as ProjectHealthScore).riskLevel.toUpperCase()} risk level).`
        : 'Health score not yet calculated.',
      order: 1,
    },
    {
      sectionId: 'health-scores',
      title: 'Health Scores',
      content: healthData
        ? [
          `| Metric | Score | Target |`,
          `|---|---:|---:|`,
          `| Schedule Health | ${(healthData as ProjectHealthScore).scheduleHealth} | 80 |`,
          `| Financial Health | ${(healthData as ProjectHealthScore).financialHealth} | 80 |`,
          `| Compliance Health | ${(healthData as ProjectHealthScore).complianceHealth} | 100 |`,
          `| Quality Health | ${(healthData as ProjectHealthScore).qualityHealth} | 80 |`,
          `| Safety Health | ${(healthData as ProjectHealthScore).safetyHealth} | 80 |`,
        ].join('\n')
        : 'No health scores available.',
      order: 2,
      metrics: metricsData,
    },
    {
      sectionId: 'compliance-status',
      title: 'Compliance Status',
      content: complianceSummary.empty
        ? 'No compliance checks found.'
        : `${complianceSummary.docs.filter((d) => d.data().status === 'passed').length}/${complianceSummary.docs.length} checks passed.`,
      order: 3,
    },
    {
      sectionId: 'recommendations',
      title: 'Recommendations',
      content: generateHealthRecommendations(healthData as ProjectHealthScore | null),
      order: 4,
    },
  ];

  return await createReport({
    type: 'project_health',
    scope: 'project',
    projectId,
    tenantId,
    title: `Project Health Report — ${projectId}`,
    description: 'Automatically generated project health assessment.',
    format,
    generatedBy,
    sections,
  });
}

/**
 * Generate a compliance report.
 */
export async function generateComplianceReport(
  projectId: string,
  tenantId: string,
  generatedBy: string,
  format: ReportFormat = 'markdown',
): Promise<ReportDefinition> {
  const checks = await getDocs(query(getDemoCol( 'compliance_checks'), where('projectId', '==', projectId)));
  const expiringDocs = await getDocs(query(getDemoCol( 'document_expiry'), where('projectId', '==', projectId)));

  const passed = checks.docs.filter((d) => d.data().status === 'passed').length;
  const failed = checks.docs.filter((d) => d.data().status === 'failed').length;
  const pending = checks.docs.filter((d) => d.data().status === 'pending_review').length;

  const complianceTable = checks.docs.map((d) => {
    const data = d.data();
    return `| ${data.title} | ${data.checkType} | ${data.status} | ${data.severity} |`;
  }).join('\n');

  const expiryTable = expiringDocs.docs.map((d) => {
    const data = d.data();
    return `| ${data.documentName} | ${data.documentType} | ${data.expiryDate} | ${data.status} |`;
  }).join('\n');

  const sections: ReportSection[] = [
    {
      sectionId: 'summary',
      title: 'Summary',
      content: [
        `## Compliance Summary`,
        ``,
        `- **Passed:** ${passed}`,
        `- **Failed:** ${failed}`,
        `- **Pending Review:** ${pending}`,
        `- **Total Checks:** ${checks.docs.length}`,
        `- **Expiring/Expired Documents:** ${expiringDocs.docs.length}`,
      ].join('\n'),
      order: 1,
    },
    {
      sectionId: 'compliance-checks',
      title: 'Compliance Checks',
      content: checks.docs.length > 0
        ? `| Check | Type | Status | Severity |\n|---|---:|---:|---:|\n${complianceTable}`
        : 'No compliance checks found for this project.',
      order: 2,
    },
    {
      sectionId: 'document-expiry',
      title: 'Document Expiry',
      content: expiringDocs.docs.length > 0
        ? `| Document | Type | Expiry Date | Status |\n|---|---:|---:|---:|\n${expiryTable}`
        : 'No document expiry records found.',
      order: 3,
    },
  ];

  return await createReport({
    type: 'compliance',
    scope: 'project',
    projectId,
    tenantId,
    title: `Compliance Report — ${projectId}`,
    description: 'Compliance check results and document expiry status.',
    format,
    generatedBy,
    sections,
  });
}

/**
 * Generate a tender evaluation report.
 */
export async function generateTenderEvaluationReport(
  rfqId: string,
  tenantId: string,
  generatedBy: string,
  format: ReportFormat = 'markdown',
): Promise<ReportDefinition> {
  const rfqSnapshot = await getDoc(getDemoDoc( 'rfq_packages', rfqId));
  if (!rfqSnapshot.exists()) throw new Error(`RFQ ${rfqId} not found`);
  const rfq = rfqSnapshot.data() as RfqPackage;

  const bidsSnapshot = await getDocs(getDemoCol( 'rfq_packages', rfqId, 'bids'));
  const bids = bidsSnapshot.docs.map((d) => ({ ...d.data(), id: d.id } as Bid));
  const submittedBids = bids.filter((b) => b.status === 'submitted' || b.status === 'shortlisted');

  const bidTable = submittedBids.map((b, i) =>
    `| ${i + 1} | ${b.contractorName} | ${formatCurrency(b.totalAmount)} | ${b.proposedTimeline} | ${b.aiScore ?? 'N/A'} | ${b.status} |`
  ).join('\n');

  const sections: ReportSection[] = [
    {
      sectionId: 'rfq-summary',
      title: 'RFQ Summary',
      content: [
        `## ${rfq.title}`,
        ``,
        `- **RFQ Number:** ${rfq.rfqNumber ?? rfq.id}`,
        `- **Method:** ${rfq.method}`,
        `- **Stage:** ${rfq.stage}`,
        `- **Bids Received:** ${submittedBids.length}`,
        `- **Estimated Budget:** ${rfq.estimatedBudget ? formatCurrency(rfq.estimatedBudget) : 'Not specified'}`,
        `- **Deadline:** ${rfq.deadline}`,
      ].join('\n'),
      order: 1,
    },
    {
      sectionId: 'bid-overview',
      title: 'Bid Overview',
      content: bids.length > 0
        ? `| # | Contractor | Amount | Timeline | Score | Status |\n|---|---:|---:|---:|---:|---:|\n${bidTable}`
        : 'No bids received.',
      order: 2,
    },
    {
      sectionId: 'addenda',
      title: 'Addenda Issued',
      content: rfq.addenda?.length > 0
        ? rfq.addenda.map((a) => `- **Addendum ${a.addendumNumber}:** ${a.summary} (${a.issuedAt})`).join('\n')
        : 'No addenda issued.',
      order: 3,
    },
    {
      sectionId: 'recommendation',
      title: 'Recommendation',
      content: rfq.awardedBidId
        ? `Awarded to bid ${rfq.awardedBidId}.`
        : 'Evaluation in progress — no award recommendation has been made yet.',
      order: 4,
    },
  ];

  return await createReport({
    type: 'tender_evaluation',
    scope: 'project',
    projectId: rfq.projectId,
    tenantId,
    title: `Tender Evaluation Report — ${rfq.title}`,
    description: `Evaluation report for RFQ ${rfq.id}`,
    format,
    generatedBy,
    sections,
  });
}

/**
 * Generate a platform overview report.
 */
export async function generatePlatformOverviewReport(
  tenantId: string,
  generatedBy: string,
  format: ReportFormat = 'markdown',
): Promise<ReportDefinition> {
  const [projectsSnapshot, usersSnapshot, firmsSnapshot, rfqsSnapshot] = await Promise.all([
    getDocs(getDemoCol( 'projects')),
    getDocs(getDemoCol( 'users')),
    getDocs(getDemoCol( 'firms')),
    getDocs(getDemoCol( 'rfq_packages')),
  ]);

  const sections: ReportSection[] = [
    {
      sectionId: 'overview',
      title: 'Platform Overview',
      content: [
        `## Platform Overview`,
        ``,
        `- **Active Projects:** ${projectsSnapshot.size}`,
        `- **Total Users:** ${usersSnapshot.size}`,
        `- **Registered Firms:** ${firmsSnapshot.size}`,
        `- **Total RFQs:** ${rfqsSnapshot.size}`,
      ].join('\n'),
      order: 1,
    },
    {
      sectionId: 'project-metrics',
      title: 'Project Metrics',
      content: [
        `| Metric | Value |`,
        `|---|---:|`,
        `| Total Projects | ${projectsSnapshot.size} |`,
        `| Active RFQs | ${rfqsSnapshot.docs.filter((d) => d.data().stage === 'published').length} |`,
        `| Awarded RFQs | ${rfqsSnapshot.docs.filter((d) => d.data().stage === 'awarded').length} |`,
      ].join('\n'),
      order: 2,
    },
  ];

  return await createReport({
    type: 'platform_overview',
    scope: 'platform',
    tenantId,
    title: 'Platform Overview Report',
    description: 'Platform-wide aggregate metrics.',
    format,
    generatedBy,
    sections,
  });
}

// ─── Internal Report Creation ──────────────────────────────────────────────

async function createReport(input: {
  type: ReportType;
  scope: ReportScope;
  projectId?: string;
  tenantId: string;
  title: string;
  description: string;
  format: ReportFormat;
  generatedBy: string;
  sections: ReportSection[];
}): Promise<ReportDefinition> {
  const now = new Date().toISOString();

  let content: string;
  switch (input.format) {
    case 'markdown':
      content = renderMarkdown(input.title, input.description, input.sections);
      break;
    case 'json':
      content = JSON.stringify({ title: input.title, description: input.description, sections: input.sections, generatedAt: now }, null, 2);
      break;
    case 'csv':
      content = renderCsv(input.sections);
      break;
    default:
      content = renderMarkdown(input.title, input.description, input.sections);
  }

  const report: Omit<ReportDefinition, 'reportId'> = {
    type: input.type,
    scope: input.scope,
    projectId: input.projectId,
    tenantId: input.tenantId,
    title: input.title,
    description: input.description,
    format: input.format,
    includeGraphics: false,
    generatedAt: now,
    generatedBy: input.generatedBy,
    status: 'generated',
    content,
    metadata: { sectionCount: input.sections.length, version: ANALYTICS_REPORT_VERSION },
    createdAt: now,
    updatedAt: now,
  };

  const docRef = await addDoc(getDemoCol( 'reports'), report);
  return { ...report, reportId: docRef.id };
}

/**
 * Get a report by ID.
 */
export async function getReport(reportId: string): Promise<ReportDefinition | null> {
  const snapshot = await getDoc(getDemoDoc( 'reports', reportId));
  if (!snapshot.exists()) return null;
  return { ...snapshot.data(), reportId } as ReportDefinition;
}

/**
 * Get all reports for a project.
 */
export async function getProjectReports(projectId: string): Promise<ReportDefinition[]> {
  const q = query(getDemoCol( 'reports'), where('projectId', '==', projectId), orderBy('generatedAt', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ ...d.data(), reportId: d.id } as ReportDefinition));
}

/**
 * Archive a report.
 */
export async function archiveReport(reportId: string): Promise<void> {
  await updateDoc(getDemoDoc( 'reports', reportId), { status: 'archived', updatedAt: new Date().toISOString() });
}

// ─── Renderers ─────────────────────────────────────────────────────────────

const ANALYTICS_REPORT_VERSION = 'analytics-report-v0.1.0';

function renderMarkdown(title: string, description: string, sections: ReportSection[]): string {
  const header = [
    `# ${title}`,
    ``,
    description,
    ``,
    `---`,
    ``,
  ].join('\n');

  const body = sections
    .sort((a, b) => a.order - b.order)
    .map((section) => {
      if (section.metrics && section.metrics.length > 0) {
        const metricRows = section.metrics.map((m) =>
          `| ${m.name} | ${m.value} ${m.unit} | ${m.trend} |`
        ).join('\n');
        return `## ${section.title}\n\n${section.content}\n\n| Metric | Value | Trend |\n|---|---:|---:|\n${metricRows}\n`;
      }
      return `## ${section.title}\n\n${section.content}\n`;
    })
    .join('\n\n');

  const footer = [
    ``,
    `---`,
    `*Generated on ${new Date().toISOString()} by Architex Analytics Engine*`,
    `*Report Version: ${ANALYTICS_REPORT_VERSION}*`,
  ].join('\n');

  return header + body + footer;
}

function renderCsv(sections: ReportSection[]): string {
  const rows: string[][] = [['Section', 'Metric', 'Value', 'Unit']];
  for (const section of sections) {
    if (section.metrics) {
      for (const metric of section.metrics) {
        rows.push([section.title, metric.name, String(metric.value), metric.unit]);
      }
    }
  }
  return rows.map((row) => row.join(',')).join('\n');
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function generateHealthRecommendations(health: ProjectHealthScore | null): string {
  if (!health) return 'Calculate project health first to receive recommendations.';

  const recs: string[] = [];
  if (health.scheduleHealth < 60) recs.push('- Review overdue milestones and update project schedule.');
  if (health.financialHealth < 60) recs.push('- Review budget utilization and identify cost overruns.');
  if (health.complianceHealth < 80) recs.push('- Address outstanding compliance findings promptly.');
  if (health.qualityHealth < 60) recs.push('- Review expired documents and update records.');
  if (health.safetyHealth < 60) recs.push('- Conduct safety audit and address OHSA compliance gaps.');

  return recs.length > 0 ? recs.join('\n') : '- All metrics are within acceptable ranges. Continue monitoring.';
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(value);
}
