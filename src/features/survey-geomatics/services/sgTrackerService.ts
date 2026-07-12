/**
 * SG Tracker Service
 *
 * Manages Surveyor-General diagram lifecycle: registration,
 * stage transitions, overdue processing detection, and withdrawal.
 *
 * State machine:
 *   Sequential: prepared → checked → lodged → examination_in_progress → approved → registered
 *   Queries loop: examination_in_progress → queries_raised → queries_resolved → examination_in_progress
 *   Withdrawal: from any stage BEFORE 'approved' (prepared through queries_resolved)
 *
 * Processing time is calculated as Working_Days since lodgementDate using WorkingDayCalculator.
 * Overdue threshold: expectedProcessingDays * 1.2 (20% buffer).
 *
 * Requirements: 17.1–17.11
 */

import { sgDiagramSchema } from '../schemas';
import type { SGDiagram, SGDiagramStage } from '../types';
import type { WorkingDayCalculator } from '../../p1-shared/services/workingDayCalculator';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Input type derived from the sgDiagramSchema for registration. */
export type CreateSGDiagramInput = {
  diagramReference: string;
  diagramType: SGDiagram['diagramType'];
  linkedSurveyInstructionId: string;
  propertyDescription: string;
  lodgementDate: string;
  lodgementOffice: SGDiagram['lodgementOffice'];
  surveyorName: string;
  surveyorPLATO: string;
  expectedProcessingDays?: number;
};

/** Optional data passed during stage transitions. */
export interface SGTransitionData {
  /** Required when transitioning to 'queries_raised'. */
  queryDetails?: string;
  /** Deadline date for query response. */
  queryResponseDeadline?: string;
  /** Required when transitioning to 'approved'. */
  approvalDate?: string;
  /** Required when transitioning to 'approved'. */
  sgApprovalNumber?: string;
}

/** Service interface for SG diagram tracking. */
export interface SGTrackerService {
  registerDiagram(projectId: string, input: CreateSGDiagramInput, actorId: string): Promise<SGDiagram>;
  transitionStage(projectId: string, diagramId: string, newStage: SGDiagramStage, data?: SGTransitionData, actorId?: string): Promise<SGDiagram>;
  getProjectDiagrams(projectId: string): Promise<SGDiagram[]>;
  getOverdueProcessing(projectId: string): Promise<SGDiagram[]>;
  withdrawDiagram(projectId: string, diagramId: string, reason: string, actorId: string): Promise<SGDiagram>;
}

// ─── State Machine Definition ─────────────────────────────────────────────────

/**
 * Valid transitions for the SG diagram stage state machine.
 * Key: current stage → Value: allowed next stages.
 */
const VALID_TRANSITIONS: Record<SGDiagramStage, SGDiagramStage[]> = {
  prepared: ['checked', 'withdrawn'],
  checked: ['lodged', 'withdrawn'],
  lodged: ['examination_in_progress', 'withdrawn'],
  examination_in_progress: ['queries_raised', 'approved', 'withdrawn'],
  queries_raised: ['queries_resolved', 'withdrawn'],
  queries_resolved: ['examination_in_progress', 'withdrawn'],
  approved: ['registered'],
  registered: [],
  withdrawn: [],
};

/** Stages from which withdrawal is permitted (all stages before 'approved'). */
const WITHDRAWABLE_STAGES: SGDiagramStage[] = [
  'prepared',
  'checked',
  'lodged',
  'examination_in_progress',
  'queries_raised',
  'queries_resolved',
];

/** Stages after which processing time is tracked (after lodgement). */
const POST_LODGEMENT_STAGES: SGDiagramStage[] = [
  'examination_in_progress',
  'queries_raised',
  'queries_resolved',
  'approved',
  'registered',
];

// ─── Service Options ──────────────────────────────────────────────────────────

export interface SGTrackerServiceOptions {
  /** Injectable clock for testability. Defaults to () => new Date(). */
  now?: () => Date;
  /** Working day calculator instance for processing time calculation. */
  workingDayCalculator: WorkingDayCalculator;
}

// ─── ID Generation ────────────────────────────────────────────────────────────

let idCounter = 0;

function generateId(): string {
  idCounter += 1;
  const timestamp = Date.now().toString(36);
  const counter = idCounter.toString(36).padStart(4, '0');
  const random = Math.random().toString(36).slice(2, 8);
  return `sgd_${timestamp}_${counter}_${random}`;
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function toISODateString(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create an SG Tracker Service instance.
 *
 * @param options - Configuration including injectable workingDayCalculator and clock.
 * @returns SGTrackerService implementation with in-memory storage.
 */
export function createSGTrackerService(options: SGTrackerServiceOptions): SGTrackerService {
  const now = options.now ?? (() => new Date());
  const { workingDayCalculator } = options;

  // In-memory store: Map<projectId, SGDiagram[]>
  const store = new Map<string, SGDiagram[]>();

  function getProjectStore(projectId: string): SGDiagram[] {
    if (!store.has(projectId)) {
      store.set(projectId, []);
    }
    return store.get(projectId)!;
  }

  /**
   * Calculate processing days (Working_Days since lodgementDate).
   * Returns 0 if the diagram has not been lodged yet.
   */
  function calculateProcessingDays(lodgementDate: string): number {
    const today = toISODateString(now());
    return workingDayCalculator.countWorkingDays(lodgementDate, today);
  }

  // ─── Service Implementation ───────────────────────────────────────────────

  const service: SGTrackerService = {
    async registerDiagram(projectId, input, actorId) {
      // Validate input with Zod schema
      const parseResult = sgDiagramSchema.safeParse(input);
      if (!parseResult.success) {
        const fieldErrors = parseResult.error.issues.map(
          (issue) => `${issue.path.join('.')}: ${issue.message}`
        );
        throw new Error(`Validation failed: ${fieldErrors.join('; ')}`);
      }

      const validated = parseResult.data;

      // Check unique reference within project
      const diagrams = getProjectStore(projectId);
      const duplicate = diagrams.find(
        (d) => d.diagramReference === validated.diagramReference
      );
      if (duplicate) {
        throw new Error(
          `Diagram reference '${validated.diagramReference}' already exists within this project`
        );
      }

      const timestamp = now().toISOString();

      const diagram: SGDiagram = {
        id: generateId(),
        projectId,
        diagramReference: validated.diagramReference,
        diagramType: validated.diagramType,
        linkedSurveyInstructionId: validated.linkedSurveyInstructionId,
        propertyDescription: validated.propertyDescription,
        lodgementDate: validated.lodgementDate,
        lodgementOffice: validated.lodgementOffice,
        surveyorName: validated.surveyorName,
        surveyorPLATO: validated.surveyorPLATO,
        currentStage: 'prepared',
        processingDays: 0,
        expectedProcessingDays: validated.expectedProcessingDays ?? 60,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      diagrams.push(diagram);
      // Suppress unused variable warning for actorId (used for audit trail in adapter layer)
      void actorId;

      return diagram;
    },

    async transitionStage(projectId, diagramId, newStage, data, actorId) {
      const diagrams = getProjectStore(projectId);
      const index = diagrams.findIndex((d) => d.id === diagramId);

      if (index === -1) {
        throw new Error(
          `Diagram not found: projectId=${projectId}, diagramId=${diagramId}`
        );
      }

      const diagram = diagrams[index];
      const currentStage = diagram.currentStage;

      // Check if the transition is valid
      const allowedTransitions = VALID_TRANSITIONS[currentStage];
      if (!allowedTransitions.includes(newStage)) {
        throw new Error(
          `Invalid transition: cannot move from '${currentStage}' to '${newStage}'. ` +
          `Allowed transitions from '${currentStage}': ${allowedTransitions.filter(s => s !== 'withdrawn').join(', ') || 'none'}`
        );
      }

      // Reject transitions from 'approved' or 'registered' to 'withdrawn'
      if (newStage === 'withdrawn') {
        if (!WITHDRAWABLE_STAGES.includes(currentStage)) {
          throw new Error(
            `Cannot withdraw diagram from '${currentStage}' stage. Withdrawal is only permitted from stages before 'approved'.`
          );
        }
      }

      // Validate required data for specific transitions
      if (newStage === 'queries_raised') {
        if (!data?.queryDetails) {
          throw new Error(
            `Query details are required when transitioning to 'queries_raised'`
          );
        }
      }

      if (newStage === 'approved') {
        if (!data?.approvalDate || !data?.sgApprovalNumber) {
          throw new Error(
            `Approval date and SG approval number are required when transitioning to 'approved'`
          );
        }
      }

      const timestamp = now().toISOString();

      // Calculate processing days for post-lodgement stages
      let processingDays = diagram.processingDays;
      if (POST_LODGEMENT_STAGES.includes(newStage)) {
        processingDays = calculateProcessingDays(diagram.lodgementDate);
      }

      // Build updated diagram
      const updated: SGDiagram = {
        ...diagram,
        currentStage: newStage,
        processingDays,
        updatedAt: timestamp,
      };

      // Apply transition-specific data
      if (newStage === 'queries_raised' && data) {
        updated.queryDetails = data.queryDetails;
        if (data.queryResponseDeadline) {
          updated.queryResponseDeadline = data.queryResponseDeadline;
        }
      }

      if (newStage === 'approved' && data) {
        updated.approvalDate = data.approvalDate;
        updated.sgApprovalNumber = data.sgApprovalNumber;
      }

      if (newStage === 'withdrawn' && data?.queryDetails) {
        // If withdrawal has reason passed via data, record it
        updated.withdrawalReason = data.queryDetails;
      }

      diagrams[index] = updated;
      // Suppress unused variable warnings
      void actorId;

      return updated;
    },

    async getProjectDiagrams(projectId) {
      return [...getProjectStore(projectId)];
    },

    async getOverdueProcessing(projectId) {
      const diagrams = getProjectStore(projectId);
      const overdue: SGDiagram[] = [];

      for (const diagram of diagrams) {
        // Only check diagrams in examination_in_progress or queries_raised
        if (
          diagram.currentStage !== 'examination_in_progress' &&
          diagram.currentStage !== 'queries_raised'
        ) {
          continue;
        }

        // Calculate current processing days
        const currentProcessingDays = calculateProcessingDays(diagram.lodgementDate);
        const threshold = diagram.expectedProcessingDays * 1.2;

        if (currentProcessingDays > threshold) {
          overdue.push({
            ...diagram,
            processingDays: currentProcessingDays,
          });
        }
      }

      return overdue;
    },

    async withdrawDiagram(projectId, diagramId, reason, actorId) {
      const diagrams = getProjectStore(projectId);
      const index = diagrams.findIndex((d) => d.id === diagramId);

      if (index === -1) {
        throw new Error(
          `Diagram not found: projectId=${projectId}, diagramId=${diagramId}`
        );
      }

      const diagram = diagrams[index];

      // Only allowed from pre-approved stages
      if (!WITHDRAWABLE_STAGES.includes(diagram.currentStage)) {
        throw new Error(
          `Cannot withdraw diagram from '${diagram.currentStage}' stage. ` +
          `Withdrawal is only permitted from stages before 'approved'.`
        );
      }

      const timestamp = now().toISOString();

      const withdrawn: SGDiagram = {
        ...diagram,
        currentStage: 'withdrawn',
        withdrawalReason: reason,
        updatedAt: timestamp,
      };

      diagrams[index] = withdrawn;
      // Suppress unused variable warning
      void actorId;

      return withdrawn;
    },
  };

  return service;
}
