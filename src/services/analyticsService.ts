// ─── Pack 15: Analytics Service ─────────────────────────────────────────────
// Project and platform analytics, metrics calculation, KPI computation.
// Aggregates data from across the platform for dashboards and reporting.

import { collection, doc, getDoc, getDocs, addDoc, updateDoc, query, where, orderBy, limit, Timestamp, type QueryConstraint, type QueryDocumentSnapshot, type DocumentData } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { ArchitexRole, Priority, ProjectPhase } from '@/services/lifecycleTypes';


import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';
// ─── Types ─────────────────────────────────────────────────────────────────

export type MetricUnit = 'count' | 'percentage' | 'days' | 'currency_zar' | 'rate' | 'score' | 'hours' | 'status';

export type MetricCategory =
  | 'project_health'
  | 'financial'
  | 'schedule'
  | 'compliance'
  | 'quality'
  | 'productivity'
  | 'safety'
  | 'platform';

export type TrendDirection = 'up' | 'down' | 'stable' | 'not_applicable';

export interface AnalyticsMetric {
  metricId: string;
  projectId?: string;           // undefined for platform-wide metrics
  tenantId: string;
  category: MetricCategory;
  name: string;
  value: number | string;
  unit: MetricUnit;
  previousValue?: number | string;
  change?: number;              // absolute or percentage change
  trend: TrendDirection;
  targetValue?: number;
  formulaVersion: string;
  calculatedAt: string;
  sourceRecordIds: string[];
}

export interface AnalyticsSnapshot {
  snapshotId: string;
  projectId?: string;
  tenantId: string;
  timestamp: string;
  metrics: AnalyticsMetric[];
  period: {
    start: string;
    end: string;
  };
}

export interface ProjectHealthScore {
  projectId: string;
  overallScore: number;         // 0-100
  scheduleHealth: number;       // 0-100
  financialHealth: number;      // 0-100
  complianceHealth: number;     // 0-100
  qualityHealth: number;        // 0-100
  safetyHealth: number;         // 0-100
  riskLevel: Priority;
  lastUpdated: string;
}

export interface PlatformMetrics {
  activeProjects: number;
  totalUsers: number;
  totalFirms: number;
  averageProjectCompletion: number;
  totalBidsSubmitted: number;
  averageBidValue: number;
  complianceRate: number;
  onTimeDeliveryRate: number;
  disputeRate: number;
  platformGrowthRate: number;
  periodStart: string;
  periodEnd: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const ANALYTICS_FORMULA_VERSION = 'analytics-v0.2.0';

// ─── Service Functions ─────────────────────────────────────────────────────

/**
 * Calculate a comprehensive project health score.
 */
export async function calculateProjectHealth(projectId: string): Promise<ProjectHealthScore> {
  // Fetch relevant records for this project
  const settled = await Promise.allSettled([
    getDocs(query(getDemoCol( 'compliance_checks'), where('projectId', '==', projectId))),
    getDocs(query(getDemoCol( 'rfq_packages'), where('projectId', '==', projectId))),
    getDocs(getDemoCol( 'projects', projectId, 'bids')) .catch(() => getDocs(query(getDemoCol( 'rfq_packages', '_', 'bids'), where('status', '==', 'submitted')))),
    getDocs(query(getDemoCol( 'document_expiry'), where('projectId', '==', projectId))),
  ]);
  const emptyDocs: QueryDocumentSnapshot<DocumentData, DocumentData>[] = [];
  const complianceChecks = settled[0].status === 'fulfilled' ? settled[0].value : { docs: emptyDocs, empty: true };
  const rfqs = settled[1].status === 'fulfilled' ? settled[1].value : { docs: emptyDocs, empty: true };
  const bidsSnapshot = settled[2].status === 'fulfilled' ? settled[2].value : { docs: emptyDocs, empty: true };
  const expiryDocs = settled[3].status === 'fulfilled' ? settled[3].value : { docs: emptyDocs, empty: true };

  // Schedule health (simplified)
  const deadlinePassedItems = rfqs.docs.filter((d) => {
    const data = d.data();
    return data.deadline && new Date(data.deadline) < new Date() && data.stage !== 'awarded' && data.stage !== 'cancelled';
  }).length;
  const scheduleHealth = Math.max(0, 100 - deadlinePassedItems * 25);

  // Financial health
  const totalBudget = rfqs.docs.reduce((sum, d) => sum + ((d.data().estimatedBudget as number) ?? 0), 0);
  const totalAwarded = rfqs.docs
    .filter((d) => d.data().stage === 'awarded')
    .reduce((sum, d) => sum + ((d.data().estimatedBudget as number) ?? 0), 0);
  const financialHealth = totalBudget > 0 ? Math.round((1 - totalAwarded / totalBudget) * 100) : 100;

  // Compliance health
  const failedChecks = complianceChecks.docs.filter((d) => d.data().status === 'failed').length;
  const totalChecks = complianceChecks.docs.length;
  const complianceHealth = totalChecks > 0 ? Math.round(((totalChecks - failedChecks) / totalChecks) * 100) : 100;

  // Quality health
  const expired = expiryDocs.docs.filter((d) => {
    const expiryDate = new Date(d.data().expiryDate as string);
    return expiryDate < new Date();
  }).length;
  const qualityHealth = Math.max(0, 100 - expired * 30);

  // Safety health
  const safetyHealth = Math.max(0, 100 - failedChecks * 20);

  // Overall weighted score
  const overallScore = Math.round(
    scheduleHealth * 0.25 +
    financialHealth * 0.25 +
    complianceHealth * 0.20 +
    qualityHealth * 0.15 +
    safetyHealth * 0.15
  );

  let riskLevel: Priority = 'low';
  if (overallScore < 40) riskLevel = 'critical';
  else if (overallScore < 60) riskLevel = 'high';
  else if (overallScore < 75) riskLevel = 'medium';

  const health: ProjectHealthScore = {
    projectId,
    overallScore,
    scheduleHealth,
    financialHealth,
    complianceHealth,
    qualityHealth,
    safetyHealth,
    riskLevel,
    lastUpdated: new Date().toISOString(),
  };

  // Persist to Firestore
  const healthRef = getDemoCol( 'project_health_scores');
  const existingQ = query(healthRef, where('projectId', '==', projectId), limit(1));
  const existing = await getDocs(existingQ);

  if (existing.docs.length > 0) {
    await updateDoc(getDemoDoc( 'project_health_scores', existing.docs[0].id), health as any);
  } else {
    await addDoc(healthRef, health as any);
  }

  return health;
}

/**
 * Calculate all metrics for a project and take a snapshot.
 */
export async function computeProjectMetrics(projectId: string, tenantId: string): Promise<AnalyticsMetric[]> {
  const health = await calculateProjectHealth(projectId);

  const metrics: AnalyticsMetric[] = [
    {
      metricId: `metric-project-health-${projectId}`,
      projectId,
      tenantId,
      category: 'project_health',
      name: 'project_health_score',
      value: health.overallScore,
      unit: 'score',
      trend: trendFromScore(health.overallScore),
      targetValue: 80,
      formulaVersion: ANALYTICS_FORMULA_VERSION,
      calculatedAt: new Date().toISOString(),
      sourceRecordIds: [],
    },
    {
      metricId: `metric-schedule-health-${projectId}`,
      projectId,
      tenantId,
      category: 'schedule',
      name: 'schedule_health',
      value: health.scheduleHealth,
      unit: 'score',
      trend: trendFromScore(health.scheduleHealth),
      targetValue: 80,
      formulaVersion: ANALYTICS_FORMULA_VERSION,
      calculatedAt: new Date().toISOString(),
      sourceRecordIds: [],
    },
    {
      metricId: `metric-financial-health-${projectId}`,
      projectId,
      tenantId,
      category: 'financial',
      name: 'financial_health',
      value: health.financialHealth,
      unit: 'percentage',
      trend: trendFromScore(health.financialHealth),
      targetValue: 80,
      formulaVersion: ANALYTICS_FORMULA_VERSION,
      calculatedAt: new Date().toISOString(),
      sourceRecordIds: [],
    },
    {
      metricId: `metric-compliance-health-${projectId}`,
      projectId,
      tenantId,
      category: 'compliance',
      name: 'compliance_health',
      value: health.complianceHealth,
      unit: 'percentage',
      trend: trendFromScore(health.complianceHealth),
      targetValue: 100,
      formulaVersion: ANALYTICS_FORMULA_VERSION,
      calculatedAt: new Date().toISOString(),
      sourceRecordIds: [],
    },
  ];

  // Persist metrics
  const metricsRef = getDemoCol( 'analytics_metrics');
  for (const metric of metrics) {
    await addDoc(metricsRef, metric);
  }

  return metrics;
}

/**
 * Compute platform-wide aggregate metrics.
 */
export async function computePlatformMetrics(
  tenantId: string,
  periodStart: string,
  periodEnd: string,
): Promise<PlatformMetrics> {
  const [projects, users, firms, rfqsAll, complianceAll] = await Promise.all([
    getDocs(getDemoCol( 'projects')),
    getDocs(getDemoCol( 'users')),
    getDocs(getDemoCol( 'firms')),
    getDocs(getDemoCol( 'rfq_packages')),
    getDocs(getDemoCol( 'compliance_checks')),
  ]);

  const totalProjects = projects.size;
  const awardedProjects = rfqsAll.docs.filter((d) => d.data().stage === 'awarded').length;
  const averageCompletion = totalProjects > 0 ? Math.round((awardedProjects / totalProjects) * 100) : 0;

  const totalBidsDesc = rfqsAll.docs.length;
  const totalBidValue = rfqsAll.docs.reduce((sum, d) => sum + ((d.data().estimatedBudget as number) ?? 0), 0);
  const avgBidValue = totalBidsDesc > 0 ? Math.round(totalBidValue / totalBidsDesc) : 0;

  const totalComplianceChecks = complianceAll.size;
  const passedChecks = complianceAll.docs.filter((d) => d.data().status === 'passed').length;
  const complianceRate = totalComplianceChecks > 0 ? Math.round((passedChecks / totalComplianceChecks) * 100) : 0;

  return {
    activeProjects: totalProjects,
    totalUsers: users.size,
    totalFirms: firms.size,
    averageProjectCompletion: averageCompletion,
    totalBidsSubmitted: totalBidsDesc,
    averageBidValue: avgBidValue,
    complianceRate,
    onTimeDeliveryRate: 75,            // placeholder — requires milestone tracking
    disputeRate: 5,                    // placeholder — requires dispute tracking
    platformGrowthRate: 12,            // placeholder — requires period-over-period comparison
    periodStart,
    periodEnd,
  };
}

/**
 * Get the latest project health score.
 */
export async function getProjectHealth(projectId: string): Promise<ProjectHealthScore | null> {
  const q = query(getDemoCol( 'project_health_scores'), where('projectId', '==', projectId), limit(1));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  return snapshot.docs[0].data() as ProjectHealthScore;
}

/**
 * Get recent metrics for a project.
 */
export async function getProjectMetrics(
  projectId: string,
  category?: MetricCategory,
): Promise<AnalyticsMetric[]> {
  const constraints: QueryConstraint[] = [where('projectId', '==', projectId)];
  if (category) constraints.push(where('category', '==', category));
  constraints.push(orderBy('calculatedAt', 'desc'));
  constraints.push(limit(100));

  const q = query(getDemoCol( 'analytics_metrics'), ...constraints);
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ ...doc.data(), metricId: doc.id } as AnalyticsMetric));
}

// ─── Helper ────────────────────────────────────────────────────────────────

function trendFromScore(score: number): TrendDirection {
  if (score >= 75) return 'up';
  if (score >= 50) return 'stable';
  return 'down';
}
