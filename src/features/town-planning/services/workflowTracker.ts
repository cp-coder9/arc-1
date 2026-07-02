/**
 * Workflow Tracker Service — State Machine & Stage Transitions
 *
 * Implements the SPLUMA application lifecycle state machine:
 * preparation → submission → acknowledgement → circulation → advertising
 * → comment_period → hearing → decision → conditions_compliance
 *
 * Any stage (except conditions_compliance) → withdrawn
 *
 * Manages stage transitions with validation, metadata capture,
 * deadline calculation, overdue detection, and integration with
 * audit trail and Action Centre.
 */

import type { UserRole } from '@/types';
import type {
  ApplicationStage,
  DecisionOutcome,
  LandUseApplication,
  MunicipalityProfile,
} from '../types';
import type { FirestoreDB, DocumentSnapshot, QuerySnapshot } from './municipalityConfig';
import {
  addWorkingDays,
  getSouthAfricanHolidays,
} from '@/services/contractAdmin/workingDayCalculator';
import type { PublicHoliday } from '@/services/contractAdmin/contractTypes';

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Permitted stage transitions defining the SPLUMA state machine.
 * Each key maps to an array of valid target stages.
 */
export const PERMITTED_TRANSITIONS: Record<ApplicationStage, ApplicationStage[]> = {
  preparation: ['submission', 'withdrawn'],
  submission: ['acknowledgement', 'withdrawn'],
  acknowledgement: ['circulation', 'withdrawn'],
  circulation: ['advertising', 'withdrawn'],
  advertising: ['comment_period', 'withdrawn'],
  objection_period: ['hearing', 'withdrawn'],
  comment_period: ['hearing', 'withdrawn'],
  hearing: ['consideration', 'withdrawn'],
  consideration: ['decision', 'withdrawn'],
  decision: ['conditions_compliance', 'withdrawn'],
  conditions_compliance: [],
  appeal: ['withdrawn'],
  withdrawn: [],
};

// ─── Types ───────────────────────────────────────────────────────────────────

export class TransitionError extends Error {
  constructor(
    public readonly currentStage: ApplicationStage,
    public readonly targetStage: ApplicationStage,
    message?: string
  ) {
    super(
      message ??
        `Invalid transition: cannot move from '${currentStage}' to '${targetStage}'`
    );
    this.name = 'TransitionError';
  }
}

export interface TransitionActor {
  id: string;
  role: UserRole;
}

export interface TransitionParams {
  // Submission metadata
  submissionDate?: string;
  submissionMethod?: string;
  municipalReference?: string;

  // Acknowledgement metadata
  acknowledgementDate?: string;

  // Advertising metadata
  advertisingStartDate?: string;

  // Hearing metadata
  hearingDate?: string;
  venue?: string;
  hearingReference?: string;

  // Decision metadata
  decisionOutcome?: DecisionOutcome;
  decisionDate?: string;
  decisionReference?: string;
  decisionLetterDocId?: string;
  deferralReason?: string;
  nextHearingDate?: string;

  // Withdrawal metadata
  withdrawalReason?: string;

  // Notes for any transition
  notes?: string;
}

export interface StageTransition {
  id: string;
  applicationId: string;
  projectId: string;
  previousStage: ApplicationStage;
  newStage: ApplicationStage;
  transitionDate: string;
  actorId: string;
  actorRole: UserRole;
  metadata: Record<string, unknown>;
  notes?: string;
}

export interface WorkflowDeadline {
  id: string;
  applicationId: string;
  projectId: string;
  deadlineType: string;
  deadlineDate: string;
  referenceStage: ApplicationStage;
  isActive: boolean;
  createdAt: string;
}

export interface ActionCentreEvent {
  type: 'deadline' | 'notification' | 'calendar';
  title: string;
  description: string;
  dueDate?: string;
  severity: 'info' | 'warning' | 'critical';
  applicationId: string;
  projectId: string;
  metadata?: Record<string, unknown>;
}

export interface AuditRecord {
  action: string;
  actorId: string;
  actorRole: UserRole;
  timestamp: string;
  applicationId: string;
  projectId: string;
  referenceNumber: string;
  previousStage: ApplicationStage;
  newStage: ApplicationStage;
  notes?: string;
  metadata?: Record<string, unknown>;
}

/** Audit function signature for DI */
export type WorkflowAuditFn = (record: AuditRecord) => Promise<void>;

/** Action Centre function signature for DI */
export type ActionCentreFn = (events: ActionCentreEvent[]) => Promise<void>;

/** Date utilities interface for DI (allows mocking current date in tests) */
export interface DateUtils {
  now(): string;
  today(): string;
}

export interface TransitionDeps {
  db: FirestoreDB;
  auditFn: WorkflowAuditFn;
  actionCentreFn: ActionCentreFn;
  dateUtils?: DateUtils;
}

export interface TransitionResult {
  success: true;
  transition: StageTransition;
  triggerConditionsRegister?: boolean;
  deadlinesCreated: WorkflowDeadline[];
}

// ─── Default DateUtils ───────────────────────────────────────────────────────

const defaultDateUtils: DateUtils = {
  now: () => new Date().toISOString(),
  today: () => new Date().toISOString().split('T')[0],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getHolidaysForYear(dateStr: string): PublicHoliday[] {
  const year = new Date(dateStr).getFullYear();
  return [
    ...getSouthAfricanHolidays(year),
    ...getSouthAfricanHolidays(year + 1),
  ];
}

function buildMetadata(
  targetStage: ApplicationStage,
  params: TransitionParams
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};

  switch (targetStage) {
    case 'submission':
      if (params.submissionDate) metadata.submissionDate = params.submissionDate;
      if (params.submissionMethod) metadata.submissionMethod = params.submissionMethod;
      if (params.municipalReference) metadata.municipalReference = params.municipalReference;
      break;

    case 'acknowledgement':
      if (params.acknowledgementDate) metadata.acknowledgementDate = params.acknowledgementDate;
      break;

    case 'advertising':
      if (params.advertisingStartDate) metadata.advertisingStartDate = params.advertisingStartDate;
      break;

    case 'hearing':
      if (params.hearingDate) metadata.hearingDate = params.hearingDate;
      if (params.venue) metadata.venue = params.venue;
      if (params.hearingReference) metadata.hearingReference = params.hearingReference;
      break;

    case 'decision':
      if (params.decisionOutcome) metadata.decisionOutcome = params.decisionOutcome;
      if (params.decisionDate) metadata.decisionDate = params.decisionDate;
      if (params.decisionReference) metadata.decisionReference = params.decisionReference;
      if (params.decisionLetterDocId) metadata.decisionLetterDocId = params.decisionLetterDocId;
      if (params.deferralReason) metadata.deferralReason = params.deferralReason;
      if (params.nextHearingDate) metadata.nextHearingDate = params.nextHearingDate;
      break;

    case 'withdrawn':
      if (params.withdrawalReason) metadata.withdrawalReason = params.withdrawalReason;
      break;
  }

  return metadata;
}

// ─── Service Implementation ──────────────────────────────────────────────────

/**
 * Transitions an application to a new stage.
 *
 * - Validates the transition against PERMITTED_TRANSITIONS
 * - Captures stage-specific metadata
 * - Calculates deadlines (acknowledgement: 15 Working Days, advertising: from config)
 * - Creates immutable audit trail record
 * - Surfaces deadlines and events to Action Centre
 * - Handles decision outcomes (conditions register trigger, refusal, deferral)
 */
export async function transitionStage(
  applicationId: string,
  projectId: string,
  targetStage: ApplicationStage,
  params: TransitionParams,
  actor: TransitionActor,
  deps: TransitionDeps
): Promise<TransitionResult> {
  const { db, auditFn, actionCentreFn, dateUtils = defaultDateUtils } = deps;

  // 1. Fetch current application
  const appPath = `projects/${projectId}/townPlanning/applications`;
  const appDoc = await db.collection(appPath).doc(applicationId).get();

  if (!appDoc.exists) {
    throw new TransitionError(
      'preparation' as ApplicationStage,
      targetStage,
      `Application '${applicationId}' not found`
    );
  }

  const appData = appDoc.data() as Record<string, unknown>;
  const currentStage = appData.stage as ApplicationStage;
  const referenceNumber = (appData.referenceNumber as string) ?? applicationId;

  // 2. Validate transition
  const permitted = PERMITTED_TRANSITIONS[currentStage] ?? [];
  if (!permitted.includes(targetStage)) {
    throw new TransitionError(currentStage, targetStage);
  }

  // 3. Capture stage-specific metadata
  const metadata = buildMetadata(targetStage, params);

  const transitionDate = dateUtils.now();
  const todayStr = dateUtils.today();

  // 4. Calculate deadlines
  const deadlinesCreated: WorkflowDeadline[] = [];
  const actionCentreEvents: ActionCentreEvent[] = [];

  if (targetStage === 'acknowledgement') {
    // 15 Working Days deadline for acknowledgement
    const ackDate = params.acknowledgementDate ?? todayStr;
    const holidays = getHolidaysForYear(ackDate);
    const deadlineDate = addWorkingDays(ackDate, 15, holidays);
    metadata.acknowledgementDeadline = deadlineDate;

    const deadline: WorkflowDeadline = {
      id: `deadline-ack-${applicationId}-${Date.now()}`,
      applicationId,
      projectId,
      deadlineType: 'acknowledgement_response',
      deadlineDate,
      referenceStage: 'acknowledgement',
      isActive: true,
      createdAt: transitionDate,
    };
    deadlinesCreated.push(deadline);

    actionCentreEvents.push({
      type: 'deadline',
      title: 'Acknowledgement Response Deadline',
      description: `Application ${referenceNumber}: municipality response expected by ${deadlineDate} (15 working days)`,
      dueDate: deadlineDate,
      severity: 'info',
      applicationId,
      projectId,
    });
  }

  if (targetStage === 'advertising' && params.advertisingStartDate) {
    // Get municipality config for advertising period
    const municipalityId = appData.municipalityId as string;
    let advertisingDays = 28; // default
    if (municipalityId) {
      try {
        const profileDoc = await db.collection('municipalityProfiles').doc(municipalityId).get();
        if (profileDoc.exists) {
          const profileData = profileDoc.data();
          if (profileData?.advertisingPeriodDays) {
            advertisingDays = profileData.advertisingPeriodDays as number;
          }
        }
      } catch {
        // Use default if config unavailable
      }
    }

    // Advertising period is calendar days
    const startDate = new Date(params.advertisingStartDate + 'T00:00:00');
    startDate.setDate(startDate.getDate() + advertisingDays);
    const endDate = startDate.toISOString().split('T')[0];
    metadata.advertisingEndDate = endDate;
    metadata.advertisingPeriodDays = advertisingDays;

    const deadline: WorkflowDeadline = {
      id: `deadline-adv-${applicationId}-${Date.now()}`,
      applicationId,
      projectId,
      deadlineType: 'advertising_period_end',
      deadlineDate: endDate,
      referenceStage: 'advertising',
      isActive: true,
      createdAt: transitionDate,
    };
    deadlinesCreated.push(deadline);

    actionCentreEvents.push({
      type: 'deadline',
      title: 'Advertising Period Ends',
      description: `Application ${referenceNumber}: advertising period ends on ${endDate} (${advertisingDays} calendar days)`,
      dueDate: endDate,
      severity: 'info',
      applicationId,
      projectId,
    });
  }

  if (targetStage === 'hearing' && params.hearingDate) {
    // Surface hearing calendar reminders at 14, 7, 1 days before
    const hearingDate = new Date(params.hearingDate + 'T00:00:00');
    const reminderDays = [14, 7, 1];

    for (const daysBefore of reminderDays) {
      const reminderDate = new Date(hearingDate);
      reminderDate.setDate(reminderDate.getDate() - daysBefore);
      const reminderDateStr = reminderDate.toISOString().split('T')[0];

      // Only create reminder if it's in the future
      if (reminderDateStr >= todayStr) {
        actionCentreEvents.push({
          type: 'calendar',
          title: `Hearing in ${daysBefore} day${daysBefore > 1 ? 's' : ''}`,
          description: `Application ${referenceNumber}: hearing scheduled for ${params.hearingDate} at ${params.venue ?? 'TBD'}`,
          dueDate: reminderDateStr,
          severity: daysBefore === 1 ? 'critical' : daysBefore === 7 ? 'warning' : 'info',
          applicationId,
          projectId,
          metadata: { hearingDate: params.hearingDate, venue: params.venue },
        });
      }
    }
  }

  // 5. Handle decision outcomes
  let triggerConditionsRegister = false;

  if (targetStage === 'decision' && params.decisionOutcome) {
    switch (params.decisionOutcome) {
      case 'approved_with_conditions':
        triggerConditionsRegister = true;
        actionCentreEvents.push({
          type: 'notification',
          title: 'Approved with Conditions',
          description: `Application ${referenceNumber}: approved with conditions. Conditions register must be established.`,
          severity: 'warning',
          applicationId,
          projectId,
        });
        break;

      case 'refused':
        actionCentreEvents.push({
          type: 'notification',
          title: 'Application Refused',
          description: `Application ${referenceNumber}: application has been refused. Decision reference: ${params.decisionReference ?? 'N/A'}`,
          severity: 'critical',
          applicationId,
          projectId,
          metadata: { decisionReference: params.decisionReference },
        });
        break;

      case 'deferred':
        actionCentreEvents.push({
          type: 'notification',
          title: 'Decision Deferred',
          description: `Application ${referenceNumber}: decision deferred. Reason: ${params.deferralReason ?? 'Not specified'}`,
          dueDate: params.nextHearingDate,
          severity: 'warning',
          applicationId,
          projectId,
          metadata: {
            deferralReason: params.deferralReason,
            nextHearingDate: params.nextHearingDate,
          },
        });
        break;

      case 'approved':
        actionCentreEvents.push({
          type: 'notification',
          title: 'Application Approved',
          description: `Application ${referenceNumber}: unconditionally approved.`,
          severity: 'info',
          applicationId,
          projectId,
        });
        break;
    }
  }

  // 6. Update application stage in Firestore
  const updateData: Record<string, unknown> = {
    stage: targetStage,
    updatedAt: transitionDate,
  };

  // Persist stage-specific fields on the application
  if (targetStage === 'submission') {
    if (params.submissionDate) updateData.submissionDate = params.submissionDate;
    if (params.municipalReference) updateData.municipalReference = params.municipalReference;
  } else if (targetStage === 'acknowledgement') {
    if (params.acknowledgementDate) updateData.acknowledgementDate = params.acknowledgementDate;
  } else if (targetStage === 'advertising') {
    if (params.advertisingStartDate) updateData.advertisingStartDate = params.advertisingStartDate;
    if (metadata.advertisingEndDate) updateData.advertisingEndDate = metadata.advertisingEndDate;
  } else if (targetStage === 'hearing') {
    if (params.hearingDate) updateData.hearingDate = params.hearingDate;
  } else if (targetStage === 'decision') {
    if (params.decisionDate) updateData.decisionDate = params.decisionDate;
    if (params.decisionOutcome) updateData.decisionOutcome = params.decisionOutcome;
    if (params.decisionReference) updateData.decisionReasons = params.decisionReference;
  }

  await db.collection(appPath).doc(applicationId).update(updateData);

  // 7. Create StageTransition record
  const transitionRecord: Omit<StageTransition, 'id'> = {
    applicationId,
    projectId,
    previousStage: currentStage,
    newStage: targetStage,
    transitionDate,
    actorId: actor.id,
    actorRole: actor.role,
    metadata,
    notes: params.notes,
  };

  const transitionsPath = `projects/${projectId}/townPlanning/applications/${applicationId}/transitions`;
  const transitionDocRef = await db.collection(transitionsPath).add(
    transitionRecord as unknown as Record<string, unknown>
  );

  const transition: StageTransition = {
    id: transitionDocRef.id,
    ...transitionRecord,
  };

  // 8. Persist deadlines
  const deadlinesPath = `projects/${projectId}/townPlanning/applications/${applicationId}/deadlines`;
  for (const deadline of deadlinesCreated) {
    await db.collection(deadlinesPath).add(deadline as unknown as Record<string, unknown>);
  }

  // 9. Create immutable audit trail record
  await auditFn({
    action: 'stage_transition',
    actorId: actor.id,
    actorRole: actor.role,
    timestamp: transitionDate,
    applicationId,
    projectId,
    referenceNumber,
    previousStage: currentStage,
    newStage: targetStage,
    notes: params.notes,
    metadata,
  });

  // 10. Surface events to Action Centre
  if (actionCentreEvents.length > 0) {
    await actionCentreFn(actionCentreEvents);
  }

  return {
    success: true,
    transition,
    triggerConditionsRegister: triggerConditionsRegister || undefined,
    deadlinesCreated,
  };
}

// ─── Query Functions ─────────────────────────────────────────────────────────

/**
 * Returns all StageTransition records for an application, ordered by date.
 */
export async function getStageHistory(
  applicationId: string,
  projectId: string,
  db: FirestoreDB
): Promise<StageTransition[]> {
  const transitionsPath = `projects/${projectId}/townPlanning/applications/${applicationId}/transitions`;
  const snapshot: QuerySnapshot = await db.collection(transitionsPath).get();

  if (snapshot.empty) {
    return [];
  }

  const transitions = snapshot.docs.map((doc: DocumentSnapshot) => ({
    id: doc.id,
    ...doc.data(),
  })) as StageTransition[];

  // Sort by transitionDate ascending
  return transitions.sort((a, b) =>
    a.transitionDate.localeCompare(b.transitionDate)
  );
}

/**
 * Returns active WorkflowDeadline records for an application.
 */
export async function getDeadlines(
  applicationId: string,
  projectId: string,
  db: FirestoreDB
): Promise<WorkflowDeadline[]> {
  const deadlinesPath = `projects/${projectId}/townPlanning/applications/${applicationId}/deadlines`;
  const snapshot: QuerySnapshot = await db.collection(deadlinesPath).get();

  if (snapshot.empty) {
    return [];
  }

  const deadlines = snapshot.docs.map((doc: DocumentSnapshot) => ({
    id: doc.id,
    ...doc.data(),
  })) as WorkflowDeadline[];

  // Return only active deadlines, sorted by date
  return deadlines
    .filter((d) => d.isActive)
    .sort((a, b) => a.deadlineDate.localeCompare(b.deadlineDate));
}

/**
 * Checks for overdue applications by comparing days-in-stage against
 * municipality typical processing times.
 *
 * Returns applications that have exceeded the expected processing time.
 */
export async function checkOverdueApplications(
  projectId: string,
  db: FirestoreDB,
  municipalityConfig: MunicipalityProfile
): Promise<Array<{ application: LandUseApplication; daysInStage: number; expectedDays: number }>> {
  const appPath = `projects/${projectId}/townPlanning/applications`;
  const snapshot: QuerySnapshot = await db.collection(appPath).get();

  if (snapshot.empty) {
    return [];
  }

  const today = new Date();
  const overdueApps: Array<{
    application: LandUseApplication;
    daysInStage: number;
    expectedDays: number;
  }> = [];

  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (!data) continue;

    const app = { id: doc.id, ...data } as LandUseApplication;

    // Skip terminal stages
    if (app.stage === 'conditions_compliance' || app.stage === 'withdrawn') {
      continue;
    }

    // Only check apps in this municipality
    if (app.municipalityId !== municipalityConfig.id) {
      continue;
    }

    // Calculate days since last update
    const lastUpdate = new Date(app.updatedAt);
    const diffMs = today.getTime() - lastUpdate.getTime();
    const daysInStage = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    const expectedDays = municipalityConfig.typicalProcessingDays;

    if (daysInStage > expectedDays) {
      overdueApps.push({ application: app, daysInStage, expectedDays });
    }
  }

  return overdueApps;
}
