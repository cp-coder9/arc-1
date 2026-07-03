/**
 * Survey Engine Service
 *
 * Manages survey instruction lifecycle: creation, issuance,
 * stage transitions, and town planning integration.
 *
 * Stage transition rules:
 *   drafted → issued → accepted → fieldwork_in_progress
 *     → office_processing → submitted_to_sg → completed
 *
 * SG Bypass: 'office_processing' → 'completed' is allowed ONLY for
 * survey types 'topographic_survey' and 'as_built_survey' (no SG approval required).
 *
 * Requirements: 16.1–16.7, 20.1, 20.2
 */

import { surveyInstructionSchema } from '../schemas';
import type { SurveyInstructionInput } from '../schemas';
import type { SurveyInstruction, SurveyInstructionStage, SurveyType } from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Ordered stage sequence for survey instructions. */
const STAGE_ORDER: SurveyInstructionStage[] = [
  'drafted',
  'issued',
  'accepted',
  'fieldwork_in_progress',
  'office_processing',
  'submitted_to_sg',
  'completed',
];

/** Survey types that do not require SG approval — can bypass 'submitted_to_sg'. */
const SG_BYPASS_TYPES: SurveyType[] = ['topographic_survey', 'as_built_survey'];

/** Mandatory fields required before issuing an instruction. */
const MANDATORY_ISSUE_FIELDS: (keyof SurveyInstruction)[] = [
  'surveyType',
  'propertyDescription',
  'scopeOfWork',
  'appointedSurveyorName',
  'requiredCompletionDate',
];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SurveyEngineServiceOptions {
  /** Injectable clock for deterministic testing. Returns ISO date-time string. */
  now?: () => string;
}

export interface SurveyEngineService {
  /** Create a new survey instruction in 'drafted' stage. */
  createInstruction(projectId: string, input: SurveyInstructionInput, actorId: string): SurveyInstruction;
  /** Issue a drafted instruction — transitions from 'drafted' to 'issued'. */
  issueInstruction(projectId: string, instructionId: string, actorId: string): SurveyInstruction;
  /** Transition an instruction to the next sequential stage. */
  transitionStage(projectId: string, instructionId: string, newStage: SurveyInstructionStage, actorId: string): SurveyInstruction;
  /** Get all instructions for a project. */
  getProjectInstructions(projectId: string): SurveyInstruction[];
  /** Create a draft instruction pre-populated from a town planning condition. */
  createFromTownPlanning(projectId: string, applicationId: string, conditionId: string): SurveyInstruction;
}

// ─── Implementation ───────────────────────────────────────────────────────────

class SurveyEngineServiceImpl implements SurveyEngineService {
  private instructions: Map<string, SurveyInstruction> = new Map();
  private sequenceCounter = 0;
  private readonly now: () => string;

  constructor(options: SurveyEngineServiceOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  createInstruction(projectId: string, input: SurveyInstructionInput, actorId: string): SurveyInstruction {
    // Validate input with Zod schema
    const parsed = surveyInstructionSchema.parse(input);

    const id = this.generateId();
    const referenceNumber = this.generateReferenceNumber();
    const timestamp = this.now();

    const instruction: SurveyInstruction = {
      id,
      projectId,
      referenceNumber,
      surveyType: parsed.surveyType,
      propertyDescription: parsed.propertyDescription,
      scopeOfWork: parsed.scopeOfWork,
      appointedSurveyorId: parsed.appointedSurveyorId,
      appointedSurveyorName: parsed.appointedSurveyorName,
      appointedSurveyorPLATO: parsed.appointedSurveyorPLATO,
      requiredCompletionDate: parsed.requiredCompletionDate,
      linkedDocuments: parsed.linkedDocuments,
      linkedTownPlanningAppId: parsed.linkedTownPlanningAppId,
      currentStage: 'drafted',
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.instructions.set(id, instruction);
    return { ...instruction };
  }

  issueInstruction(projectId: string, instructionId: string, actorId: string): SurveyInstruction {
    const instruction = this.instructions.get(instructionId);
    if (!instruction) {
      throw new Error(`Survey instruction not found: ${instructionId}`);
    }

    if (instruction.projectId !== projectId) {
      throw new Error(`Instruction ${instructionId} does not belong to project ${projectId}`);
    }

    if (instruction.currentStage !== 'drafted') {
      throw new Error(
        `Cannot issue instruction in stage '${instruction.currentStage}'. ` +
        `Instruction must be in 'drafted' stage to be issued.`,
      );
    }

    // Validate all mandatory fields are present (Requirement 16.5)
    const missingFields: string[] = [];
    for (const field of MANDATORY_ISSUE_FIELDS) {
      const value = instruction[field];
      if (value === undefined || value === null || value === '') {
        missingFields.push(field);
      }
    }

    if (missingFields.length > 0) {
      throw new Error(
        `Cannot issue survey instruction: mandatory fields missing: ${missingFields.join(', ')}`,
      );
    }

    const timestamp = this.now();
    const updated: SurveyInstruction = {
      ...instruction,
      currentStage: 'issued',
      issuedBy: actorId,
      issuedAt: timestamp,
      updatedAt: timestamp,
    };

    this.instructions.set(instructionId, updated);
    return { ...updated };
  }

  transitionStage(
    projectId: string,
    instructionId: string,
    newStage: SurveyInstructionStage,
    actorId: string,
  ): SurveyInstruction {
    const instruction = this.instructions.get(instructionId);
    if (!instruction) {
      throw new Error(`Survey instruction not found: ${instructionId}`);
    }

    if (instruction.projectId !== projectId) {
      throw new Error(`Instruction ${instructionId} does not belong to project ${projectId}`);
    }

    const currentIndex = STAGE_ORDER.indexOf(instruction.currentStage);
    const targetIndex = STAGE_ORDER.indexOf(newStage);

    if (targetIndex === -1) {
      throw new Error(`Invalid target stage: '${newStage}'`);
    }

    // Check if this is the SG bypass case
    const isSGBypass =
      instruction.currentStage === 'office_processing' &&
      newStage === 'completed' &&
      SG_BYPASS_TYPES.includes(instruction.surveyType);

    if (isSGBypass) {
      // Valid SG bypass — allow skipping 'submitted_to_sg'
      const timestamp = this.now();
      const updated: SurveyInstruction = {
        ...instruction,
        currentStage: newStage,
        updatedAt: timestamp,
      };
      this.instructions.set(instructionId, updated);
      return { ...updated };
    }

    // Standard sequential transition: target must be exactly the next stage
    const expectedNextIndex = currentIndex + 1;
    if (targetIndex !== expectedNextIndex) {
      const nextPermitted = expectedNextIndex < STAGE_ORDER.length
        ? STAGE_ORDER[expectedNextIndex]
        : 'none (already completed)';

      throw new Error(
        `Invalid transition: cannot move from '${instruction.currentStage}' to '${newStage}'. ` +
        `Current stage: '${instruction.currentStage}', next permitted stage: '${nextPermitted}'.`,
      );
    }

    const timestamp = this.now();
    const updated: SurveyInstruction = {
      ...instruction,
      currentStage: newStage,
      updatedAt: timestamp,
    };

    this.instructions.set(instructionId, updated);
    return { ...updated };
  }

  getProjectInstructions(projectId: string): SurveyInstruction[] {
    const results: SurveyInstruction[] = [];
    for (const instruction of this.instructions.values()) {
      if (instruction.projectId === projectId) {
        results.push({ ...instruction });
      }
    }
    return results;
  }

  createFromTownPlanning(
    projectId: string,
    applicationId: string,
    conditionId: string,
  ): SurveyInstruction {
    // Stubbed: creates a draft instruction pre-populated from a town planning
    // subdivision/consolidation condition. In production this would read from
    // the Town Planning module's application and condition data.
    const timestamp = this.now();
    const id = this.generateId();
    const referenceNumber = this.generateReferenceNumber();

    const instruction: SurveyInstruction = {
      id,
      projectId,
      referenceNumber,
      surveyType: 'subdivision_survey', // Default; in production derived from application type
      propertyDescription: `Town Planning Application ${applicationId}`,
      scopeOfWork: `Survey required per condition ${conditionId} of town planning application ${applicationId}`,
      appointedSurveyorName: '',
      appointedSurveyorPLATO: '',
      requiredCompletionDate: '',
      linkedDocuments: [],
      linkedTownPlanningAppId: applicationId,
      currentStage: 'drafted',
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.instructions.set(id, instruction);
    return { ...instruction };
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private generateId(): string {
    return `si_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private generateReferenceNumber(): string {
    this.sequenceCounter++;
    return `SI-${String(this.sequenceCounter).padStart(3, '0')}`;
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a new SurveyEngineService instance.
 * Uses in-memory Map storage. Injectable clock for deterministic tests.
 */
export function createSurveyEngineService(
  options: SurveyEngineServiceOptions = {},
): SurveyEngineService {
  return new SurveyEngineServiceImpl(options);
}
