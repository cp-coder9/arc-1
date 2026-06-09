import type { CPDAssessmentAnalytics, CPDAttempt, CPDLecturerAnalytics } from './cpdTypes';

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function calculateAssessmentAnalytics(params: {
  assessmentId: string;
  courseId: string;
  attempts: CPDAttempt[];
}): CPDAssessmentAnalytics {
  const relevant = params.attempts.filter((attempt) => attempt.assessmentId === params.assessmentId && attempt.courseId === params.courseId);
  const uniqueLearners = new Set(relevant.map((attempt) => attempt.userId)).size;
  const passed = relevant.filter((attempt) => attempt.passed).length;
  const questionIds = [...new Set(relevant.flatMap((attempt) => attempt.results.map((result) => result.questionId)))];

  return {
    assessmentId: params.assessmentId,
    courseId: params.courseId,
    totalAttempts: relevant.length,
    uniqueLearners,
    passRatePercent: relevant.length === 0 ? 0 : Math.round((passed / relevant.length) * 100),
    averageScorePercent: average(relevant.map((attempt) => attempt.scorePercent)),
    questionStats: questionIds.map((questionId) => {
      const results = relevant.flatMap((attempt) => attempt.results).filter((result) => result.questionId === questionId);
      const correct = results.filter((result) => result.correct).length;
      return {
        questionId,
        correctRatePercent: results.length === 0 ? 0 : Math.round((correct / results.length) * 100),
        averageAwardedPoints: average(results.map((result) => result.awardedPoints)),
        attempts: results.length,
      };
    }),
  };
}

export function calculateLecturerAnalytics(params: {
  lecturerUserId: string;
  courseIds: string[];
  attempts: CPDAttempt[];
}): CPDLecturerAnalytics {
  const relevant = params.attempts.filter((attempt) => params.courseIds.includes(attempt.courseId));
  const totalLearners = new Set(relevant.map((attempt) => attempt.userId)).size;
  const passed = relevant.filter((attempt) => attempt.passed).length;
  return {
    lecturerUserId: params.lecturerUserId,
    courseIds: params.courseIds,
    totalLearners,
    totalAttempts: relevant.length,
    passRatePercent: relevant.length === 0 ? 0 : Math.round((passed / relevant.length) * 100),
    averageScorePercent: average(relevant.map((attempt) => attempt.scorePercent)),
  };
}
