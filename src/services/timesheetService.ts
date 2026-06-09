import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  orderBy,
  writeBatch,
} from 'firebase/firestore';
import type { TimesheetEntry, TimesheetSummary, TimesheetBillableStatus, FeeReconciliation } from '@/types';
import type { ProjectStage } from '@/types';
import { notificationService } from './notificationService';

const TIMESHEETS_COL = 'timesheets';

const VALID_BILLABLE: TimesheetBillableStatus[] = ['billable', 'non_billable', 'internal'];

function assertValidBillable(billable: TimesheetBillableStatus): void {
  if (!VALID_BILLABLE.includes(billable)) throw new Error(`Invalid billable status: ${billable}`);
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

export async function logTime(input: {
  userId: string;
  firmId: string;
  projectId?: string;
  workstage?: ProjectStage;
  date: string;
  startTime: string;
  endTime: string;
  description: string;
  billable?: TimesheetBillableStatus;
  hourlyRateCents?: number;
  tags?: string[];
}): Promise<TimesheetEntry> {
  try {
    if (!input.userId || !input.firmId || !input.date || !input.startTime || !input.endTime || !input.description) {
      throw new Error('userId, firmId, date, startTime, endTime, and description are required.');
    }

    const billable = input.billable || 'billable';
    assertValidBillable(billable);

    const durationMinutes = timeToMinutes(input.endTime) - timeToMinutes(input.startTime);
    if (durationMinutes <= 0) throw new Error('endTime must be after startTime.');
    if (durationMinutes > 1440) throw new Error('Timesheet entry cannot exceed 24 hours.');

    const hourlyRate = input.hourlyRateCents || 0;
    const totalValueCents = billable !== 'non_billable'
      ? Math.round((durationMinutes / 60) * hourlyRate)
      : 0;

    const now = new Date().toISOString();
    const ref = doc(collection(db, TIMESHEETS_COL));
    const entry: TimesheetEntry = {
      id: ref.id,
      userId: input.userId,
      firmId: input.firmId,
      projectId: input.projectId,
      workstage: input.workstage,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      durationMinutes,
      description: input.description.trim(),
      billable,
      hourlyRateCents: input.hourlyRateCents,
      totalValueCents,
      tags: input.tags,
      invoiced: false,
      createdAt: now,
      updatedAt: now,
    };

    await setDoc(ref, entry);

    // Send timesheet_due notification for review
    await notificationService.sendNotification(
      input.userId,
      'timesheet_due',
      `Timesheet entry logged: ${input.description.slice(0, 80)}`,
      { timesheetId: ref.id, firmId: input.firmId, projectId: input.projectId }
    );

    return entry;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, TIMESHEETS_COL);
  }
}

export async function getTimesheetEntry(id: string): Promise<TimesheetEntry | null> {
  try {
    const snap = await getDoc(doc(db, TIMESHEETS_COL, id));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as TimesheetEntry) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${TIMESHEETS_COL}/${id}`);
  }
}

export async function updateTimesheetEntry(id: string, updates: {
  date?: string;
  startTime?: string;
  endTime?: string;
  description?: string;
  billable?: TimesheetBillableStatus;
  hourlyRateCents?: number;
  workstage?: ProjectStage;
  projectId?: string;
  tags?: string[];
}): Promise<void> {
  try {
    if (updates.billable) assertValidBillable(updates.billable);

    const data: Record<string, unknown> = { updatedAt: new Date().toISOString() };

    // Recalculate duration and value if times change
    if (updates.startTime !== undefined) data.startTime = updates.startTime;
    if (updates.endTime !== undefined) data.endTime = updates.endTime;
    if (updates.startTime || updates.endTime) {
      const entry = await getTimesheetEntry(id);
      if (entry) {
        const startTime = (updates.startTime || entry.startTime) as string;
        const endTime = (updates.endTime || entry.endTime) as string;
        const durationMinutes = timeToMinutes(endTime) - timeToMinutes(startTime);
        if (durationMinutes <= 0) throw new Error('endTime must be after startTime.');
        data.durationMinutes = durationMinutes;

        const hourlyRate = (updates.hourlyRateCents ?? entry.hourlyRateCents) || 0;
        const billable = (updates.billable || entry.billable) as TimesheetBillableStatus;
        data.totalValueCents = billable !== 'non_billable' ? Math.round((durationMinutes / 60) * hourlyRate) : 0;
      }
    }

    if (updates.description !== undefined) data.description = updates.description.trim();
    if (updates.billable !== undefined) data.billable = updates.billable;
    if (updates.hourlyRateCents !== undefined) data.hourlyRateCents = updates.hourlyRateCents;
    if (updates.workstage !== undefined) data.workstage = updates.workstage;
    if (updates.projectId !== undefined) data.projectId = updates.projectId;
    if (updates.tags !== undefined) data.tags = updates.tags;

    await updateDoc(doc(db, TIMESHEETS_COL, id), data);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${TIMESHEETS_COL}/${id}`);
  }
}

export async function getTimesheetEntries(input: {
  firmId: string;
  userId?: string;
  projectId?: string;
  dateFrom?: string;
  dateTo?: string;
  billable?: TimesheetBillableStatus;
  invoiced?: boolean;
}): Promise<TimesheetEntry[]> {
  try {
    const constraints = [where('firmId', '==', input.firmId), orderBy('date', 'desc'), orderBy('startTime', 'desc')];
    if (input.userId) constraints.unshift(where('userId', '==', input.userId));
    if (input.projectId) constraints.unshift(where('projectId', '==', input.projectId));
    if (input.billable) constraints.unshift(where('billable', '==', input.billable));
    if (input.invoiced !== undefined) constraints.unshift(where('invoiced', '==', input.invoiced));
    if (input.dateFrom) constraints.unshift(where('date', '>=', input.dateFrom));
    if (input.dateTo) constraints.unshift(where('date', '<=', input.dateTo));

    const q = query(collection(db, TIMESHEETS_COL), ...constraints);
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as TimesheetEntry));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, TIMESHEETS_COL);
  }
}

export async function getTimesheetSummary(input: {
  firmId: string;
  periodStart: string;
  periodEnd: string;
  userId?: string;
}): Promise<TimesheetSummary> {
  try {
    const entries = await getTimesheetEntries({
      firmId: input.firmId,
      userId: input.userId,
      dateFrom: input.periodStart,
      dateTo: input.periodEnd,
    });

    let totalHours = 0;
    let billableHours = 0;
    let nonBillableHours = 0;
    let internalHours = 0;
    let totalValueCents = 0;
    const byProject: Record<string, { hours: number; valueCents: number }> = {};
    const byUser: Record<string, { hours: number; valueCents: number }> = {};

    for (const entry of entries) {
      const hours = minutesToHours(entry.durationMinutes);
      totalHours += hours;
      totalValueCents += entry.totalValueCents || 0;

      if (entry.billable === 'billable') billableHours += hours;
      else if (entry.billable === 'non_billable') nonBillableHours += hours;
      else internalHours += hours;

      const projectKey = entry.projectId || 'no_project';
      if (!byProject[projectKey]) byProject[projectKey] = { hours: 0, valueCents: 0 };
      byProject[projectKey].hours += hours;
      byProject[projectKey].valueCents += entry.totalValueCents || 0;

      if (!byUser[entry.userId]) byUser[entry.userId] = { hours: 0, valueCents: 0 };
      byUser[entry.userId].hours += hours;
      byUser[entry.userId].valueCents += entry.totalValueCents || 0;
    }

    return {
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      totalHours: Math.round(totalHours * 100) / 100,
      billableHours: Math.round(billableHours * 100) / 100,
      nonBillableHours: Math.round(nonBillableHours * 100) / 100,
      internalHours: Math.round(internalHours * 100) / 100,
      totalValueCents,
      byProject,
      byUser,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${TIMESHEETS_COL}/summary`);
  }
}

export async function reconcileFees(projectId: string, feeChargedCents: number): Promise<FeeReconciliation[]> {
  try {
    const entries = await getTimesheetEntries({ firmId: '', projectId });
    return entries.map((entry) => {
      const timesheetValue = entry.totalValueCents || 0;
      const variance = feeChargedCents - timesheetValue;
      return {
        timesheetEntryId: entry.id,
        projectId,
        userId: entry.userId,
        hoursLogged: minutesToHours(entry.durationMinutes),
        timesheetValueCents: timesheetValue,
        feeChargedCents: feeChargedCents,
        varianceCents: variance,
        variancePercent: feeChargedCents > 0 ? Math.round((variance / feeChargedCents) * 10000) / 100 : 0,
        reconciled: Math.abs(variance) < feeChargedCents * 0.1,
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${TIMESHEETS_COL}/reconcile/${projectId}`);
  }
}

export async function markTimesheetInvoiced(ids: string[], invoiceId: string): Promise<void> {
  try {
    const batch = writeBatch(db);
    const now = new Date().toISOString();
    for (const id of ids) {
      batch.update(doc(db, TIMESHEETS_COL, id), { invoiced: true, invoiceId, updatedAt: now });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, TIMESHEETS_COL);
  }
}

export async function deleteTimesheetEntry(id: string): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, TIMESHEETS_COL, id));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${TIMESHEETS_COL}/${id}`);
  }
}

export function subscribeToTimesheets(firmId: string, callback: (entries: TimesheetEntry[]) => void): () => void {
  return onSnapshot(
    query(collection(db, TIMESHEETS_COL), where('firmId', '==', firmId), orderBy('date', 'desc')),
    (snapshot) => callback(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as TimesheetEntry))),
    (error) => {
      console.error('Failed to subscribe to timesheets:', error);
      callback([]);
    }
  );
}

export const timesheetService = {
  logTime,
  getTimesheetEntry,
  updateTimesheetEntry,
  getTimesheetEntries,
  getTimesheetSummary,
  reconcileFees,
  markTimesheetInvoiced,
  deleteTimesheetEntry,
  subscribeToTimesheets,
};

export default timesheetService;
