/**
 * Notice Timeline Service
 *
 * Calculates contractual deadlines per contract form (JBCC, NEC, GCC, FIDIC),
 * detects approaching/overdue deadlines, and provides timeline visualisation data.
 *
 * Deadline rules:
 *   JBCC_PBA:  notification = causativeEventDate + 20 Working_Days
 *              particulars = causativeEventDate + 40 Working_Days
 *              adjudication_referral = notice_of_dissatisfaction + 20 Working_Days
 *
 *   NEC_ECC:   notification = notificationDate + 56 calendar days (8 weeks)
 *              particulars = notificationDate + 56 calendar days (8 weeks from notification)
 *              adjudication_referral = notice_of_dissatisfaction + 28 calendar days (4 weeks)
 *
 *   GCC_2025:  notification = causativeEventDate + 28 calendar days
 *              particulars = from contract data sheet second-stage period (null if not configured)
 *              adjudication_referral = notice_of_dissatisfaction + 28 calendar days
 *
 *   FIDIC:     notification = notificationDate + 28 calendar days
 *              particulars = notificationDate + 42 calendar days
 *              adjudication_referral = notice_of_dissatisfaction + 42 calendar days
 *
 * Requirements: 6.1–6.9
 */

import type { WorkingDayCalculator } from '@/features/p1-shared/services/workingDayCalculator';
import { createWorkingDayCalculator } from '@/features/p1-shared/services/workingDayCalculator';
import type { ContractForm } from '@/services/contractAdmin/contractTypes';
import type { FormalClaim, NoticeDeadline, ClaimStage } from '../types';

// ─── Supporting Types ─────────────────────────────────────────────────────────

/**
 * Minimal contract data sheet interface for GCC second-stage period lookup.
 * Consumers inject the relevant fields from the full ContractDataSheet.
 */
export interface ContractDataSheetForTimeline {
  /** GCC 2025 second-stage claim period in working days */
  secondStageClaimWorkingDays?: number;
}

/**
 * Timeline milestone for visualisation purposes (Requirement 6.6).
 */
export interface TimelineMilestone {
  label: string;
  date: string | null;
  type: 'event' | 'deadline' | 'current';
  isPast: boolean;
  isOverdue: boolean;
}

/**
 * Timeline visualisation data for a single claim (Requirement 6.6).
 */
export interface TimelineVisualisationData {
  claimId: string;
  milestones: TimelineMilestone[];
  currentDate: string;
}

// ─── Service Interface ────────────────────────────────────────────────────────

export interface NoticeTimelineService {
  calculateDeadlines(
    claim: FormalClaim,
    contractForm: ContractForm,
    contractDataSheet?: ContractDataSheetForTimeline
  ): NoticeDeadline[];

  getApproachingDeadlines(
    projectId: string,
    withinDays: number
  ): Promise<NoticeDeadline[]>;

  getOverdueDeadlines(projectId: string): Promise<NoticeDeadline[]>;

  getTimelineData(claimId: string): Promise<TimelineVisualisationData>;
}

// ─── Factory Options ──────────────────────────────────────────────────────────

export interface CreateNoticeTimelineServiceOptions {
  /** Working day calculator — injected or created internally */
  workingDayCalculator?: WorkingDayCalculator;
  /** Injected dependency: retrieve claims for a project */
  getClaims: (projectId: string) => Promise<FormalClaim[]>;
  /** Injected dependency: retrieve contract form for a project */
  getContractForm: (projectId: string) => Promise<ContractForm | null>;
  /** Optional: retrieve contract data sheet for GCC second-stage period */
  getContractDataSheet?: (projectId: string) => Promise<ContractDataSheetForTimeline | null>;
  /** Optional clock for testing */
  now?: () => string;
}

// ─── Date Arithmetic Helpers ──────────────────────────────────────────────────

function addCalendarDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return toISODate(date);
}

function toISODate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function todayISO(): string {
  return toISODate(new Date());
}

function diffCalendarDays(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const fromDate = new Date(Date.UTC(fy, fm - 1, fd));
  const toDate = new Date(Date.UTC(ty, tm - 1, td));
  return Math.round((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
}

// ─── Claim Stage Ordering ─────────────────────────────────────────────────────

const STAGE_ORDER: ClaimStage[] = [
  'notified',
  'particularised',
  'assessed',
  'responded',
  'notice_of_dissatisfaction',
  'referred_to_adjudication',
  'adjudication_decision_issued',
  'settled',
];

function stageAtLeast(current: ClaimStage, target: ClaimStage): boolean {
  return STAGE_ORDER.indexOf(current) >= STAGE_ORDER.indexOf(target);
}

// ─── Deadline Calculation Logic ───────────────────────────────────────────────

function calculateNotificationDeadline(
  claim: FormalClaim,
  contractForm: ContractForm,
  wdCalc: WorkingDayCalculator,
  currentDate: string
): NoticeDeadline {
  let dueDate: string;

  switch (contractForm) {
    case 'jbcc_pba':
      // JBCC PBA: causativeEventDate + 20 Working_Days
      dueDate = wdCalc.addWorkingDays(claim.causativeEventDate, 20);
      break;
    case 'nec_ecc':
      // NEC ECC: notificationDate + 56 calendar days (8 weeks)
      dueDate = addCalendarDays(claim.notificationDate, 56);
      break;
    case 'gcc_2025':
      // GCC 2025: causativeEventDate + 28 calendar days
      dueDate = addCalendarDays(claim.causativeEventDate, 28);
      break;
    case 'fidic':
      // FIDIC: notificationDate + 28 calendar days
      dueDate = addCalendarDays(claim.notificationDate, 28);
      break;
  }

  const daysRemaining = diffCalendarDays(currentDate, dueDate);
  const isOverdue = daysRemaining < 0;

  return {
    claimId: claim.id,
    deadlineType: 'notification',
    dueDate,
    contractForm,
    isOverdue,
    daysRemaining,
  };
}

function calculateParticularsDeadline(
  claim: FormalClaim,
  contractForm: ContractForm,
  wdCalc: WorkingDayCalculator,
  currentDate: string,
  contractDataSheet?: ContractDataSheetForTimeline
): NoticeDeadline | null {
  // Only applicable when claim has progressed to 'particularised' stage or beyond
  if (!stageAtLeast(claim.currentStage, 'particularised')) {
    return null;
  }

  let dueDate: string | null = null;

  switch (contractForm) {
    case 'jbcc_pba':
      // JBCC PBA: causativeEventDate + 40 Working_Days
      dueDate = wdCalc.addWorkingDays(claim.causativeEventDate, 40);
      break;
    case 'nec_ecc':
      // NEC ECC: notificationDate + 56 calendar days (8 weeks from notification)
      dueDate = addCalendarDays(claim.notificationDate, 56);
      break;
    case 'gcc_2025':
      // GCC 2025: from contract data sheet second-stage period
      // Requirement 6.8: return null if not configured
      if (contractDataSheet?.secondStageClaimWorkingDays) {
        dueDate = wdCalc.addWorkingDays(
          claim.causativeEventDate,
          contractDataSheet.secondStageClaimWorkingDays
        );
      } else {
        // Cannot calculate without the configured second-stage period
        return null;
      }
      break;
    case 'fidic':
      // FIDIC: notificationDate + 42 calendar days
      dueDate = addCalendarDays(claim.notificationDate, 42);
      break;
  }

  if (!dueDate) {
    return null;
  }

  const daysRemaining = diffCalendarDays(currentDate, dueDate);
  const isOverdue = daysRemaining < 0;

  return {
    claimId: claim.id,
    deadlineType: 'particulars',
    dueDate,
    contractForm,
    isOverdue,
    daysRemaining,
  };
}

function calculateAdjudicationReferralDeadline(
  claim: FormalClaim,
  contractForm: ContractForm,
  wdCalc: WorkingDayCalculator,
  currentDate: string
): NoticeDeadline | null {
  // Only applicable when claim reaches 'notice_of_dissatisfaction' stage or beyond
  if (!stageAtLeast(claim.currentStage, 'notice_of_dissatisfaction')) {
    return null;
  }

  // The reference date for adjudication referral is the updatedAt of the claim
  // (representing when notice of dissatisfaction was issued).
  // In practice, this would be tracked as a separate date field but we use updatedAt
  // as a proxy since the claim moves to this stage at that point.
  const referenceDate = claim.updatedAt.substring(0, 10); // take date portion only

  let dueDate: string;

  switch (contractForm) {
    case 'jbcc_pba':
      // JBCC PBA: 20 Working_Days from notice of dissatisfaction
      dueDate = wdCalc.addWorkingDays(referenceDate, 20);
      break;
    case 'nec_ecc':
      // NEC ECC: 28 calendar days (4 weeks)
      dueDate = addCalendarDays(referenceDate, 28);
      break;
    case 'gcc_2025':
      // GCC 2025: 28 calendar days
      dueDate = addCalendarDays(referenceDate, 28);
      break;
    case 'fidic':
      // FIDIC: 42 calendar days
      dueDate = addCalendarDays(referenceDate, 42);
      break;
  }

  const daysRemaining = diffCalendarDays(currentDate, dueDate);
  const isOverdue = daysRemaining < 0;

  return {
    claimId: claim.id,
    deadlineType: 'adjudication_referral',
    dueDate,
    contractForm,
    isOverdue,
    daysRemaining,
  };
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a NoticeTimelineService instance.
 *
 * @param options - Injected dependencies and configuration.
 * @returns A fully-configured NoticeTimelineService.
 */
export function createNoticeTimelineService(
  options: CreateNoticeTimelineServiceOptions
): NoticeTimelineService {
  const wdCalc = options.workingDayCalculator ?? createWorkingDayCalculator();
  const { getClaims, getContractForm, getContractDataSheet } = options;
  const getNow = options.now ?? todayISO;

  function calculateDeadlines(
    claim: FormalClaim,
    contractForm: ContractForm,
    contractDataSheet?: ContractDataSheetForTimeline
  ): NoticeDeadline[] {
    const currentDate = getNow();
    const deadlines: NoticeDeadline[] = [];

    // Always calculate notification deadline
    deadlines.push(
      calculateNotificationDeadline(claim, contractForm, wdCalc, currentDate)
    );

    // Particulars deadline (when stage >= particularised)
    const particularsDeadline = calculateParticularsDeadline(
      claim,
      contractForm,
      wdCalc,
      currentDate,
      contractDataSheet
    );
    if (particularsDeadline) {
      deadlines.push(particularsDeadline);
    }

    // Adjudication referral deadline (when stage >= notice_of_dissatisfaction)
    const adjudicationDeadline = calculateAdjudicationReferralDeadline(
      claim,
      contractForm,
      wdCalc,
      currentDate
    );
    if (adjudicationDeadline) {
      deadlines.push(adjudicationDeadline);
    }

    return deadlines;
  }

  async function getApproachingDeadlines(
    projectId: string,
    withinDays: number
  ): Promise<NoticeDeadline[]> {
    const contractForm = await getContractForm(projectId);
    if (!contractForm) {
      return [];
    }

    const claims = await getClaims(projectId);
    const approaching: NoticeDeadline[] = [];
    const dataSheet = getContractDataSheet
      ? await getContractDataSheet(projectId)
      : undefined;

    for (const claim of claims) {
      const deadlines = calculateDeadlines(claim, contractForm, dataSheet ?? undefined);
      for (const deadline of deadlines) {
        // Approaching: daysRemaining <= withinDays AND not yet overdue
        if (deadline.daysRemaining >= 0 && deadline.daysRemaining <= withinDays) {
          approaching.push(deadline);
        }
      }
    }

    return approaching;
  }

  async function getOverdueDeadlines(projectId: string): Promise<NoticeDeadline[]> {
    const contractForm = await getContractForm(projectId);
    if (!contractForm) {
      return [];
    }

    const claims = await getClaims(projectId);
    const overdue: NoticeDeadline[] = [];
    const dataSheet = getContractDataSheet
      ? await getContractDataSheet(projectId)
      : undefined;

    for (const claim of claims) {
      const deadlines = calculateDeadlines(claim, contractForm, dataSheet ?? undefined);
      for (const deadline of deadlines) {
        if (deadline.isOverdue) {
          overdue.push(deadline);
        }
      }
    }

    return overdue;
  }

  async function getTimelineData(claimId: string): Promise<TimelineVisualisationData> {
    const currentDate = getNow();
    const milestones: TimelineMilestone[] = [];

    // Attempt to find the claim across projects using the getClaims dependency.
    // In a real Firestore implementation, this would be a direct document lookup.
    // For now, we return the current-date milestone as a baseline;
    // the UI layer enriches the timeline with the claim + deadlines it already holds.

    milestones.push({
      label: 'Current Date',
      date: currentDate,
      type: 'current',
      isPast: false,
      isOverdue: false,
    });

    return {
      claimId,
      milestones,
      currentDate,
    };
  }

  return {
    calculateDeadlines,
    getApproachingDeadlines,
    getOverdueDeadlines,
    getTimelineData,
  };
}
