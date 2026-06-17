import { collection, doc, addDoc, getDocs, onSnapshot, query, orderBy, updateDoc, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import type { SiteLog, WeatherCondition } from '@/types';


import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';
const PROJECTS_COL = 'projects';
const SITE_LOGS_COL = 'site_logs';

type FirestoreUnsubscribe = () => void;

function siteLogsCollection(projectId: string) {
  if (!projectId) throw new Error('projectId is required');
  return getDemoCol( PROJECTS_COL, projectId, SITE_LOGS_COL);
}

function siteLogDocument(projectId: string, logId: string) {
  if (!logId) throw new Error('logId is required');
  return getDemoDoc( PROJECTS_COL, projectId, SITE_LOGS_COL, logId);
}

function withId<T extends { id: string }>(snap: { id: string; data: () => Record<string, unknown> }): T {
  return { id: snap.id, ...snap.data() } as T;
}

export interface DailyLogInput {
  projectId: string;
  date: string;
  weather: WeatherCondition;
  weatherDetail?: string;
  temperature?: number;
  workDescription: string;
  labourOnSite?: Record<string, number>;
  labourCount?: number;
  plantOnSite?: string[];
  deliveries?: string[];
  visitors?: string[];
  safetyNotes?: string[];
  delayNotes?: string[];
  materialsUsed?: string[];
  issues?: string[];
  evidenceIds?: string[];
  photos?: { url: string; caption: string }[];
  createdBy: string;
}

export async function createRichSiteLog(input: DailyLogInput): Promise<string> {
  try {
    const now = new Date().toISOString();
    const log: Omit<SiteLog, 'id'> = {
      projectId: input.projectId,
      date: input.date,
      weather: input.weather,
      weatherDetail: input.weatherDetail,
      temperature: input.temperature,
      workDescription: input.workDescription,
      labourOnSite: input.labourOnSite,
      labourCount: input.labourCount ?? (input.labourOnSite ? Object.values(input.labourOnSite).reduce((a, b) => a + b, 0) : undefined),
      plantOnSite: input.plantOnSite ?? [],
      deliveries: input.deliveries ?? [],
      visitors: input.visitors ?? [],
      safetyNotes: input.safetyNotes ?? [],
      delayNotes: input.delayNotes ?? [],
      materialsUsed: input.materialsUsed ?? [],
      issues: input.issues ?? [],
      evidenceIds: input.evidenceIds ?? [],
      photos: input.photos ?? [],
      status: 'submitted',
      createdBy: input.createdBy,
      createdAt: now,
    };
    const ref = await addDoc(siteLogsCollection(input.projectId), log);
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${input.projectId}/${SITE_LOGS_COL}`);
  }
}

export async function updateSiteLogStatus(
  projectId: string,
  logId: string,
  status: 'draft' | 'submitted',
): Promise<void> {
  try {
    await updateDoc(siteLogDocument(projectId, logId), { status });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${SITE_LOGS_COL}/${logId}`);
  }
}

export async function getRichSiteLogs(projectId: string): Promise<SiteLog[]> {
  try {
    const snap = await getDocs(query(siteLogsCollection(projectId), orderBy('date', 'desc')));
    return snap.docs.map((d) => withId<SiteLog>(d));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${PROJECTS_COL}/${projectId}/${SITE_LOGS_COL}`);
  }
}

export function subscribeToRichSiteLogs(
  projectId: string,
  cb: (logs: SiteLog[]) => void,
  pageSize = 50,
): FirestoreUnsubscribe {
  const q = query(siteLogsCollection(projectId), orderBy('date', 'desc'), limit(pageSize));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => withId<SiteLog>(d))), (error) => {
    console.error('Failed to subscribe to site logs:', error);
    cb([]);
  });
}

/** Calculate site log coverage statistics */
export function getSiteLogCoverage(
  logs: SiteLog[],
  expectedWorkingDays: string[],
): {
  expectedDays: number;
  loggedDays: number;
  missingDays: string[];
  coveragePercent: number;
  issueCount: number;
} {
  const loggedDaySet = new Set(logs.map((l) => l.date));
  const missingDays = expectedWorkingDays.filter((d) => !loggedDaySet.has(d));
  const issueCount = logs.reduce((sum, l) => sum + (l.issues?.length ?? 0), 0);

  return {
    expectedDays: expectedWorkingDays.length,
    loggedDays: expectedWorkingDays.filter((d) => loggedDaySet.has(d)).length,
    missingDays,
    coveragePercent: expectedWorkingDays.length === 0 ? 100 : Math.round(((expectedWorkingDays.length - missingDays.length) / expectedWorkingDays.length) * 100),
    issueCount,
  };
}

export const dailyLogService = {
  createRichSiteLog,
  updateSiteLogStatus,
  getRichSiteLogs,
  subscribeToRichSiteLogs,
  getSiteLogCoverage,
};

export default dailyLogService;
