export type CPDQuestionType = 'single_choice' | 'multiple_choice' | 'true_false';

export interface CPDAssessmentQuestion {
  id: string;
  prompt: string;
  type: CPDQuestionType;
  points: number;
  correctOptionIds: string[];
  options?: Array<{ id: string; label: string }>;
}

export interface CPDAssessment {
  id: string;
  courseId: string;
  passMarkPercent: number;
  title?: string;
  description?: string;
  cpdPoints?: number;
  questions: CPDAssessmentQuestion[];
}

export interface CPDAttemptSubmission {
  userId: string;
  assessmentId: string;
  answers: Record<string, string[]>;
  submittedAt: string;
}

export interface CPDAttemptResult {
  userId: string;
  assessmentId: string;
  score: number;
  maxScore: number;
  scorePercent: number;
  passed: boolean;
  submittedAt: string;
  gradedAt: string;
  questionResults: Array<{
    questionId: string;
    earnedPoints: number;
    maxPoints: number;
    correct: boolean;
  }>;
}

const normaliseAnswers = (answers: string[] | undefined): string[] =>
  Array.from(new Set(answers ?? [])).sort();

const answersMatch = (actual: string[], expected: string[]): boolean =>
  actual.length === expected.length && actual.every((value, index) => value === expected[index]);

export const assertCPDAssessment = (assessment: CPDAssessment): void => {
  if (assessment.passMarkPercent < 0 || assessment.passMarkPercent > 100) {
    throw new Error('CPD assessment passMarkPercent must be between 0 and 100.');
  }

  if (assessment.questions.length === 0) {
    throw new Error('CPD assessment must contain at least one question.');
  }

  for (const question of assessment.questions) {
    if (question.points <= 0) {
      throw new Error(`CPD question ${question.id} must have positive points.`);
    }
    if (question.correctOptionIds.length === 0) {
      throw new Error(`CPD question ${question.id} must define at least one correct option.`);
    }
  }
};

export const scoreCPDAttempt = (
  assessment: CPDAssessment,
  submission: CPDAttemptSubmission,
  gradedAt = new Date().toISOString()
): CPDAttemptResult => {
  assertCPDAssessment(assessment);

  if (submission.assessmentId !== assessment.id) {
    throw new Error('CPD submission assessmentId does not match assessment.');
  }

  const questionResults = assessment.questions.map((question) => {
    const actual = normaliseAnswers(submission.answers[question.id]);
    const expected = normaliseAnswers(question.correctOptionIds);
    const correct = answersMatch(actual, expected);

    return {
      questionId: question.id,
      earnedPoints: correct ? question.points : 0,
      maxPoints: question.points,
      correct,
    };
  });

  const score = questionResults.reduce((total, result) => total + result.earnedPoints, 0);
  const maxScore = questionResults.reduce((total, result) => total + result.maxPoints, 0);
  const scorePercent = Math.round((score / maxScore) * 10000) / 100;

  return {
    userId: submission.userId,
    assessmentId: assessment.id,
    score,
    maxScore,
    scorePercent,
    passed: scorePercent >= assessment.passMarkPercent,
    submittedAt: submission.submittedAt,
    gradedAt,
    questionResults,
  };
};
