// ─── Unified Project Workflow Orchestration: Embedded AI Guidance ────────────
// Produces in-context AI guidance for a dashboard, tool, or workflow step. This
// is a thin orchestrator: it derives `AgentRecommendation`s from the project's
// reconciled source of truth (the `ProjectPassport`), delegates the heavy AI
// generation to an injectable generator (wired to `agentRecommendationService`
// + `geminiService` in production), enforces the 10 s AI timeout, caps and
// orders the result, flags gated recommendations as advisory-only, restricts
// every input/output to the requesting tenant + project, and audits every
// produced recommendation.
//
// The layer is decision-support only. It NEVER executes a sensitive action: a
// recommendation that would lead to professional_certification, municipal_
// submission, signature, payment_release, or closeout_acceptance is flagged
// `requiresHumanApproval` and routed to the qualified human via the gate — the
// AI never satisfies the gate itself (R6.5, R6.6).
//
// The AI dependency, clock, timeout, and audit sink are injectable so the
// timeout / failure / empty states are testable without live network calls.
//
// Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11.

import type { BaseContext } from '../../types/agentOrchestration';
import { audit as defaultAudit } from '../auditTrailService';
import type {
  AgentRecommendation,
  AuthorizationContext,
  GuidanceRequest,
  GuidanceResult,
  HumanGate,
  Priority,
  ProjectPassport,
  ProjectRecordType,
} from './orchestrationTypes';

// ── Constants ────────────────────────────────────────────────────────────────

/** Maximum recommendations presented in any surface (R6.2). */
const DEFAULT_RECOMMENDATION_CAP = 10;

/** AI generation budget; on elapse the surface renders without guidance (R6.10). */
const DEFAULT_AI_TIMEOUT_MS = 10_000;

/** Ordering rank for the existing four-level `Priority`. Higher is more urgent. */
const PRIORITY_RANK: Record<Priority, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

/**
 * The sensitive `HumanGate` each gated record type sits behind. A recommendation
 * touching one of these record types is advisory only and is routed to the
 * qualified human through the gate; the AI never executes it (R6.5, R6.6).
 */
const GATE_BY_RECORD_TYPE: Partial<Record<ProjectRecordType, HumanGate>> = {
  municipal_submission_pack: 'municipal_submission',
  municipal_approval_letter: 'municipal_submission',
  payment_certificate: 'payment_release',
  professional_appointment: 'signature',
  technical_drawings: 'professional_certification',
  closeout_pack: 'closeout_acceptance',
};

// ── Dependency injection ──────────────────────────────────────────────────────

/**
 * The AI generation seam. Receives the in-scope request and returns the raw
 * `AgentRecommendation`s. Production wires this to `agentRecommendationService`
 * and `geminiService`; tests inject deterministic, slow, failing, or empty
 * generators to exercise the timeout / `unavailable` / `none` states.
 */
export type GuidanceGenerator = (
  req: GuidanceRequest,
) => Promise<AgentRecommendation[]> | AgentRecommendation[];

/** Audit sink (injectable for tests). Mirrors `auditTrailService.audit`. */
export type GuidanceAuditFn = (
  ctx: BaseContext,
  action: string,
  sourceObjectId: string,
) => void;

export interface AiGuidanceServiceConfig {
  /** AI recommendation generator. Defaults to a passport-derived generator. */
  generate?: GuidanceGenerator;
  /** Step-level guidance generator for tool/workflow surfaces (R6.4). */
  generateStepGuidance?: (req: GuidanceRequest) => string | undefined;
  /** Returns the current instant as an ISO 8601 string. Defaults to wall clock. */
  clock?: () => string;
  /** AI timeout budget in ms (R6.10). Default 10_000. */
  timeoutMs?: number;
  /** Maximum recommendations to present (R6.2). Default 10. */
  recommendationCap?: number;
  /** Audit sink. Defaults to `auditTrailService.audit`. */
  audit?: GuidanceAuditFn;
}

export interface AiGuidanceService {
  generateGuidance(req: GuidanceRequest): Promise<GuidanceResult>;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Race a promise against a timeout, rejecting with `onTimeout()` if it elapses. */
function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(onTimeout()), ms);
    p.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** Format a record type for display (`technical_drawings` → `Technical Drawings`). */
function formatRecordType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Normalise the four-level `Priority` to the three display levels required by
 * R6.3 ({High, Medium, Low}): `critical` collapses to `high` so every presented
 * recommendation carries exactly one of high/medium/low.
 */
function normaliseDisplayPriority(priority: Priority): Priority {
  return priority === 'critical' ? 'high' : priority;
}

/** The sensitive gate (if any) a recommendation sits behind. */
function gateForRecommendation(rec: AgentRecommendation): HumanGate {
  if (!rec.relatedRecordType) return 'none';
  return GATE_BY_RECORD_TYPE[rec.relatedRecordType] ?? 'none';
}

/**
 * True when the request's passport belongs to the requesting tenant. The
 * passport itself defines the in-project scope, so a tenant match confines
 * guidance to in-tenant, in-project data (R6.8, R6.9).
 */
function isInScope(req: GuidanceRequest): boolean {
  return req.passport.tenantId === req.ctx.tenantId;
}

// ── Default passport-derived recommendation generator ───────────────────────

/**
 * Derive `AgentRecommendation`s from the reconciled `ProjectPassport` — the
 * single source of truth. Mirrors the documented `recommendationsFromPassport`
 * pack logic but stays type-correct against `lifecycleTypes`. Uses only the
 * in-scope passport, so no out-of-tenant / out-of-project data can leak in
 * (R6.8, R6.9). Production may replace this seam with a `geminiService`-backed
 * generator that returns the same shape.
 */
export function deriveRecommendationsFromPassport(
  passport: ProjectPassport,
): AgentRecommendation[] {
  const recs: AgentRecommendation[] = [];
  const projectId = passport.projectId;

  // Missing required records (each may block phase advancement downstream).
  for (const missing of passport.lifecycle.missingRecords) {
    recs.push({
      id: `rec-missing-${missing.recordType}`,
      scope: 'project',
      title: `Resolve missing ${formatRecordType(missing.recordType)}`,
      rationale: missing.reason,
      priority: missing.priority,
      recommendedActionLabel: `Create ${formatRecordType(missing.recordType)} record`,
      relatedRecordType: missing.recordType,
      relatedRoute: `/projects/${projectId}/records`,
      requiresHumanApproval: false,
    });
  }

  // Lifecycle blockers surfaced by the existing engine.
  for (const blocker of passport.lifecycle.blockers) {
    recs.push({
      id: `rec-blocker-${hashString(blocker)}`,
      scope: 'project',
      title: 'Resolve lifecycle blocker',
      rationale: blocker,
      priority: 'high',
      recommendedActionLabel: 'Open project passport to review blocker',
      relatedRoute: `/projects/${projectId}/passport`,
      requiresHumanApproval: false,
    });
  }

  // Status-based recommendations from the derived passport summary fields.
  if (passport.approvalStatus === 'missing') {
    recs.push({
      id: 'rec-approval-missing',
      scope: 'project',
      title: 'Address missing approvals',
      rationale: 'No municipal or regulatory approval evidence found for this project.',
      priority: 'high',
      recommendedActionLabel: 'Upload approval evidence',
      relatedRecordType: 'municipal_approval_letter',
      relatedRoute: `/projects/${projectId}/compliance`,
      requiresHumanApproval: true,
    });
  }

  if (passport.financialStatus === 'pending_review') {
    recs.push({
      id: 'rec-financial-pending',
      scope: 'project',
      title: 'Review pending payments',
      rationale: 'Payment certificates require QS and client review before release.',
      priority: 'high',
      recommendedActionLabel: 'Review payments in Finance',
      relatedRecordType: 'payment_certificate',
      relatedRoute: `/projects/${projectId}/finance`,
      requiresHumanApproval: true,
    });
  }

  if (passport.documentStatus === 'incomplete') {
    recs.push({
      id: 'rec-docs-incomplete',
      scope: 'project',
      title: 'Complete project documentation',
      rationale: 'Required documents are missing or incomplete for the current phase.',
      priority: 'medium',
      recommendedActionLabel: 'Upload missing documents',
      relatedRoute: `/projects/${projectId}/documents`,
      requiresHumanApproval: false,
    });
  }

  return recs;
}

/**
 * Default step-level guidance for tool / workflow_step surfaces (R6.4): a
 * plain-language description of what the step requires and the next best action
 * for the user's role, derived from the in-scope passport's lifecycle.
 */
export function defaultStepGuidance(req: GuidanceRequest): string | undefined {
  if (req.surface === 'dashboard') return undefined;
  const { lifecycle, currentPhase } = req.passport;
  const nextAction = lifecycle.nextBestActions[0];
  const phaseLabel = formatRecordType(currentPhase);
  if (nextAction) {
    return `This step is part of the ${phaseLabel} phase. Next best action for your role: ${nextAction}`;
  }
  if (lifecycle.missingRecords.length > 0) {
    const need = lifecycle.missingRecords
      .map((m) => formatRecordType(m.recordType))
      .join(', ');
    return `This step is part of the ${phaseLabel} phase. It requires: ${need}.`;
  }
  return `This step is part of the ${phaseLabel} phase. No outstanding requirements detected for your role.`;
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < Math.min(str.length, 50); i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36).slice(0, 6);
}

// ── Service factory ───────────────────────────────────────────────────────

/**
 * Build an `aiGuidanceService` with injectable dependencies. The default
 * generator derives recommendations from the in-scope passport; production
 * supplies a `geminiService` + `agentRecommendationService`-backed generator.
 */
export function createAiGuidanceService(config: AiGuidanceServiceConfig = {}): AiGuidanceService {
  const generate: GuidanceGenerator =
    config.generate ?? ((req) => deriveRecommendationsFromPassport(req.passport));
  const generateStepGuidance = config.generateStepGuidance ?? defaultStepGuidance;
  const clock = config.clock ?? (() => new Date().toISOString());
  const timeoutMs = config.timeoutMs ?? DEFAULT_AI_TIMEOUT_MS;
  const cap = config.recommendationCap ?? DEFAULT_RECOMMENDATION_CAP;
  const audit = config.audit ?? defaultAudit;

  function auditRecommendation(
    ctx: AuthorizationContext,
    passport: ProjectPassport,
    surface: GuidanceRequest['surface'],
    rec: AgentRecommendation,
    gate: HumanGate,
    nowIso: string,
  ): void {
    const auditCtx: BaseContext = {
      tenantId: ctx.tenantId,
      projectId: passport.projectId,
      userId: ctx.userId,
      actorRole: ctx.role,
      now: nowIso,
    };
    audit(
      auditCtx,
      `ai_guidance:recommendation:surface=${surface}:gate=${gate}:advisory=${gate !== 'none'}`,
      rec.id,
    );
  }

  /**
   * Cap, order, normalise, and gate-flag the raw recommendations. Ordering is by
   * descending original priority (so a critical item still leads) before the
   * display priority is collapsed to {high, medium, low} (R6.2, R6.3).
   */
  function finalise(raw: AgentRecommendation[]): {
    recommendations: AgentRecommendation[];
    gates: HumanGate[];
  } {
    const ordered = raw
      .slice()
      .sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority])
      .slice(0, cap);

    const gates: HumanGate[] = [];
    const recommendations = ordered.map((rec) => {
      const gate = gateForRecommendation(rec);
      gates.push(gate);
      return {
        ...rec,
        priority: normaliseDisplayPriority(rec.priority),
        // A gated recommendation is advisory only; preserve any existing flag.
        requiresHumanApproval: rec.requiresHumanApproval || gate !== 'none',
      };
    });
    return { recommendations, gates };
  }

  async function generateGuidance(req: GuidanceRequest): Promise<GuidanceResult> {
    const nowIso = clock();

    // Tenant + project scope guard: guidance uses only in-scope data. An out-of-
    // scope passport yields no recommendations rather than leaking foreign data
    // (R6.8, R6.9).
    if (!isInScope(req)) {
      return { recommendations: [], status: 'none' };
    }

    const stepGuidance =
      req.surface === 'dashboard' ? undefined : generateStepGuidance(req);

    // Run the AI generation against the 10 s budget. On timeout or failure the
    // surface still renders, marked guidance-unavailable (R6.10).
    let raw: AgentRecommendation[];
    try {
      raw = await withTimeout(
        Promise.resolve(generate(req)),
        timeoutMs,
        () => new Error('AI guidance generation timed out'),
      );
    } catch {
      return { recommendations: [], stepGuidance, status: 'unavailable' };
    }

    const { recommendations, gates } = finalise(raw);

    // No applicable recommendations → render with an explicit empty state (R6.11).
    if (recommendations.length === 0) {
      return { recommendations: [], stepGuidance, status: 'none' };
    }

    // Audit every produced recommendation with its source context (R6.7).
    recommendations.forEach((rec, i) =>
      auditRecommendation(req.ctx, req.passport, req.surface, rec, gates[i], nowIso),
    );

    return { recommendations, stepGuidance, status: 'ok' };
  }

  return { generateGuidance };
}

// ── Default instance ─────────────────────────────────────────────────────────

/** The default service instance used by dashboards, tools, and workflow steps. */
export const aiGuidanceService = createAiGuidanceService();

export const generateGuidance = aiGuidanceService.generateGuidance;
