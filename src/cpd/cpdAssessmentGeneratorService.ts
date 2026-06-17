import type { CPDContentItem, CPDAssessmentDraft, CPDQuestion } from './cpdTypes';

function sentenceCandidates(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 50)
    .slice(0, 20);
}

function mcqQuestion(index: number, outcome: string, explanation: string): CPDQuestion {
  const correctId = `q_${index + 1}_a`;
  return {
    id: `q_${index + 1}`,
    type: index % 2 === 0 ? 'multiple_choice' : 'scenario_mcq',
    prompt: index % 2 === 0
      ? `Which statement best reflects this learning outcome: ${outcome}?`
      : `Scenario: A built-environment professional has completed this module. What is the most appropriate way to apply: ${outcome}?`,
    options: [
      { id: correctId, label: `Apply ${outcome} through a documented professional workflow with appropriate evidence.` },
      { id: `q_${index + 1}_b`, label: 'Treat CPD as optional once the lecture has been watched.' },
      { id: `q_${index + 1}_c`, label: 'Allow AI to take over the professional responsibility and sign-off.' },
      { id: `q_${index + 1}_d`, label: 'Wait until the professional council requests evidence before keeping any record.' },
    ],
    correctOptionIds: [correctId],
    explanation,
    learningOutcome: outcome,
    sourceReference: explanation ? `auto_extracted_or_outcome_${index + 1}` : 'learning_outcome',
    difficulty: index % 2 === 0 ? 'easy' : 'medium',
    points: 1,
    autoMarkable: true,
    requiresManualReview: false,
  };
}

function optionalShortAnswerQuestion(index: number, outcome: string): CPDQuestion {
  return {
    id: `q_${index + 1}`,
    type: 'short_answer',
    prompt: `Briefly explain how you would apply this learning outcome in your own practice: ${outcome}.`,
    options: [],
    modelAnswer: `The learner should explain practical application of ${outcome}, with professional judgement, evidence and documented responsibility.`,
    explanation: `This optional text answer tests applied understanding of: ${outcome}.`,
    learningOutcome: outcome,
    sourceReference: 'learning_outcome',
    difficulty: 'medium',
    points: 2,
    autoMarkable: false,
    requiresManualReview: true,
  };
}

export function generateAssessmentDraft(content: CPDContentItem, options?: { includeTextQuestions?: boolean }): CPDAssessmentDraft {
  const source = content.transcript || content.learningOutcomes.join('. ');
  const candidates = sentenceCandidates(source);

  const questions: CPDQuestion[] = content.learningOutcomes.map((outcome, index) =>
    mcqQuestion(index, outcome, candidates[index] || `This question tests whether the learner understood: ${outcome}.`),
  );

  if (options?.includeTextQuestions && content.learningOutcomes.length > 0) {
    questions.push(optionalShortAnswerQuestion(questions.length, content.learningOutcomes[0]));
  }

  return {
    id: `draft_${content.id}`,
    contentItemId: content.id,
    generatedBy: 'ai',
    title: `${content.title} Assessment`,
    questions,
    passMarkPercent: 70,
    timeLimitMinutes: Math.max(15, Math.min(60, content.durationMinutes || 30)),
    allowedAttempts: 3,
    reviewStatus: 'creator_review',
    riskFlags: content.permissionStatus === 'permission_required'
      ? ['Source permission must be resolved before assessment publication.']
      : [],
  };
}

export function validateDraftForHumanReview(draft: CPDAssessmentDraft): string[] {
  const issues: string[] = [];
  if (draft.questions.length < 3) issues.push('Assessment should have at least 3 questions for a short CPD module.');
  if (draft.passMarkPercent < 50 || draft.passMarkPercent > 90) issues.push('Pass mark should be within a defensible range.');
  if (draft.questions.some((q) => !q.learningOutcome)) issues.push('Every question must map to a learning outcome.');
  if (draft.questions.some((q) => q.autoMarkable && (!q.correctOptionIds || q.correctOptionIds.length === 0))) {
    issues.push('Every auto-marked question must have correct option IDs.');
  }
  if (draft.reviewStatus === 'approved_for_accreditation' && draft.riskFlags.length) issues.push('Risk flags must be resolved before accreditation submission.');
  return issues;
}
