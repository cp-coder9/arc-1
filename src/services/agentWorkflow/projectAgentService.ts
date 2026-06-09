/**
 * Project Agent Service — Pack 14: Agent Orchestration Core
 *
 * Per-project agent instance, project context accumulation from all
 * ProjectRecords, and cross-phase recommendation continuity.
 */

import type { ProjectPhase, ProjectRecord } from '@/types/architexMasterTypes';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ProjectAgentProfile {
  id: string;
  projectId: string;
  tenantId: string;
  currentPhase: ProjectPhase;
  phaseHistory: PhaseContext[];
  accumulatedRecords: number;
  crossPhaseInsights: CrossPhaseInsight[];
  recommendations: ProjectRecommendation[];
  createdAt: string;
  updatedAt: string;
}

export interface PhaseContext {
  phase: ProjectPhase;
  enteredAt: string;
  exitedAt?: string;
  recordCount: number;
  keyDecisions: string[];
  risksIdentified: number;
  blockersResolved: number;
}

export interface CrossPhaseInsight {
  id: string;
  title: string;
  description: string;
  relatedPhases: ProjectPhase[];
  confidence: number;
  basedOnRecords: string[];
  createdAt: string;
}

export interface ProjectRecommendation {
  id: string;
  title: string;
  rationale: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  basedOnPhases: ProjectPhase[];
  requiresAttention: boolean;
  createdAt: string;
}

// ─── Profile Factory ──────────────────────────────────────────────────────

export function createProjectAgent(params: {
  projectId: string;
  tenantId: string;
  currentPhase: ProjectPhase;
}): ProjectAgentProfile {
  const now = new Date().toISOString();
  return {
    id: `project-agent-${params.projectId}`,
    projectId: params.projectId,
    tenantId: params.tenantId,
    currentPhase: params.currentPhase,
    phaseHistory: [
      {
        phase: params.currentPhase,
        enteredAt: now,
        recordCount: 0,
        keyDecisions: [],
        risksIdentified: 0,
        blockersResolved: 0,
      },
    ],
    accumulatedRecords: 0,
    crossPhaseInsights: [],
    recommendations: [],
    createdAt: now,
    updatedAt: now,
  };
}

// ─── Context Accumulation ─────────────────────────────────────────────────

export function accumulateProjectRecord(
  profile: ProjectAgentProfile,
  record: ProjectRecord<unknown>,
): ProjectAgentProfile {
  const currentPhaseContext = profile.phaseHistory.find(
    (p) => p.phase === profile.currentPhase && !p.exitedAt,
  );

  const updatedHistory = profile.phaseHistory.map((p) => {
    if (p.phase === profile.currentPhase && !p.exitedAt) {
      return {
        ...p,
        recordCount: p.recordCount + 1,
      };
    }
    return p;
  });

  // If record is a risk_alert, increment the count
  if (record.recordType === 'risk_alert') {
    return {
      ...profile,
      accumulatedRecords: profile.accumulatedRecords + 1,
      phaseHistory: updatedHistory.map((p) => {
        if (p.phase === profile.currentPhase && !p.exitedAt) {
          return { ...p, risksIdentified: p.risksIdentified + 1 };
        }
        return p;
      }),
      updatedAt: new Date().toISOString(),
    };
  }

  return {
    ...profile,
    accumulatedRecords: profile.accumulatedRecords + 1,
    phaseHistory: updatedHistory,
    updatedAt: new Date().toISOString(),
  };
}

// ─── Phase Transitions ───────────────────────────────────────────────────

export function transitionProjectPhase(
  profile: ProjectAgentProfile,
  newPhase: ProjectPhase,
): ProjectAgentProfile {
  const now = new Date().toISOString();

  // Close current phase
  const updatedHistory = profile.phaseHistory.map((p) => {
    if (p.phase === profile.currentPhase && !p.exitedAt) {
      return { ...p, exitedAt: now };
    }
    return p;
  });

  // Start new phase
  updatedHistory.push({
    phase: newPhase,
    enteredAt: now,
    recordCount: 0,
    keyDecisions: [],
    risksIdentified: 0,
    blockersResolved: 0,
  });

  return {
    ...profile,
    currentPhase: newPhase,
    phaseHistory: updatedHistory,
    updatedAt: now,
  };
}

// ─── Cross-Phase Insights ────────────────────────────────────────────────

export function generateCrossPhaseInsights(
  profile: ProjectAgentProfile,
): CrossPhaseInsight[] {
  const insights: CrossPhaseInsight[] = [];
  const completedPhases = profile.phaseHistory.filter((p) => p.exitedAt);

  if (completedPhases.length < 2) return insights;

  // Insight: risk accumulation across phases
  const totalRisks = profile.phaseHistory.reduce(
    (sum, p) => sum + p.risksIdentified,
    0,
  );
  if (totalRisks > 5) {
    insights.push({
      id: `insight-${profile.projectId}-risks`,
      title: 'High risk accumulation across phases',
      description: `${totalRisks} risks identified across ${completedPhases.length} completed phases. Consider a project risk review.`,
      relatedPhases: completedPhases.map((p) => p.phase),
      confidence: Math.min(totalRisks / 20, 0.95),
      basedOnRecords: [],
      createdAt: new Date().toISOString(),
    });
  }

  // Insight: rapid phase transitions
  const quickPhases = completedPhases.filter((p) => {
    const duration =
      new Date(p.exitedAt!).getTime() - new Date(p.enteredAt).getTime();
    return duration < 7 * 24 * 60 * 60 * 1000 && p.recordCount < 3; // < 7 days and < 3 records
  });
  if (quickPhases.length > 0) {
    insights.push({
      id: `insight-${profile.projectId}-quick-phases`,
      title: 'Rapid phase transitions detected',
      description: `${quickPhases.length} phase(s) completed unusually quickly with minimal records. Verify gate compliance.`,
      relatedPhases: quickPhases.map((p) => p.phase),
      confidence: 0.7,
      basedOnRecords: [],
      createdAt: new Date().toISOString(),
    });
  }

  return insights;
}

// ─── Project Recommendations ─────────────────────────────────────────────

export function generateProjectRecommendations(
  profile: ProjectAgentProfile,
): ProjectRecommendation[] {
  const recs: ProjectRecommendation[] = [];

  // Recommendation based on phase progression
  const phasesWithLowRecords = profile.phaseHistory
    .filter((p) => p.exitedAt)
    .filter((p) => p.recordCount < 2);

  if (phasesWithLowRecords.length > 0) {
    recs.push({
      id: `rec-${profile.projectId}-documentation`,
      title: 'Strengthen phase documentation',
      rationale: `${phasesWithLowRecords.length} completed phase(s) have fewer than 2 records. Missing documentation creates downstream risk.`,
      priority: 'high',
      basedOnPhases: phasesWithLowRecords.map((p) => p.phase),
      requiresAttention: true,
      createdAt: new Date().toISOString(),
    });
  }

  return recs;
}
