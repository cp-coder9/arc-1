import type {
  CPDAccreditationApplication,
  CPDAnswerSubmission,
  CPDAssessmentDraft,
  CPDCourse,
  CPDProfessionalProfile,
  CPDRecord,
  CPDAttempt,
} from './cpdTypes';

function sameSet(a: string[] = [], b: string[] = []): boolean {
  return a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');
}

export function createAccreditationApplication(input: {
  courseId: string;
  assessment: CPDAssessmentDraft;
  provider: CPDAccreditationApplication['provider'];
  targetBodies: CPDAccreditationApplication['targetBodies'];
  connectorMode: CPDAccreditationApplication['connectorMode'];
  requestedCredits: number;
}): CPDAccreditationApplication {
  if (input.assessment.reviewStatus !== 'approved_for_accreditation') {
    throw new Error('Assessment must be human-approved before accreditation submission.');
  }
  return {
    id: `accred_${input.courseId}`,
    courseId: input.courseId,
    assessmentId: input.assessment.id,
    provider: input.provider,
    targetBodies: input.targetBodies,
    connectorMode: input.connectorMode,
    status: 'submitted_to_partner',
    requestedCredits: input.requestedCredits,
    reviewerNotes: [],
  };
}

export function publishCourseAfterAccreditation(input: {
  contentItemId: string;
  assessment: CPDAssessmentDraft;
  application: CPDAccreditationApplication;
  title: string;
  providerName: string;
  certificateTemplateId: string;
}): CPDCourse {
  if (input.application.status !== 'accredited' || !input.application.approvedCredits) {
    throw new Error('Course cannot go live until accreditation is approved and credit value is captured.');
  }
  return {
    id: input.application.courseId,
    contentItemId: input.contentItemId,
    assessmentId: input.assessment.id,
    title: input.title,
    approvedCredits: input.application.approvedCredits,
    professionalBodies: input.application.targetBodies,
    accreditationReference: input.application.accreditationReference,
    validFrom: input.application.validFrom,
    validUntil: input.application.validUntil,
    providerName: input.providerName,
    certificateTemplateId: input.certificateTemplateId,
    status: 'live',
  };
}

export function scoreAttempt(params: {
  assessment: CPDAssessmentDraft;
  course: CPDCourse;
  userId: string;
  answers: CPDAnswerSubmission[];
  attemptNumber: number;
}): CPDAttempt {
  if (params.course.status !== 'live') throw new Error('Assessment attempts are only allowed for live courses.');
  if (params.attemptNumber > params.assessment.allowedAttempts) throw new Error('Allowed attempt limit exceeded.');

  const answerMap = new Map(params.answers.map((answer) => [answer.questionId, answer]));
  const results = params.assessment.questions.map((question) => {
    const answer = answerMap.get(question.id);
    const correct = question.autoMarkable ? sameSet(answer?.selectedOptionIds || [], question.correctOptionIds || []) : false;
    return {
      questionId: question.id,
      awardedPoints: correct ? question.points : 0,
      maxPoints: question.points,
      correct,
      needsManualReview: question.requiresManualReview,
    };
  });

  const autoMarkedResults = results.filter((result) => !result.needsManualReview);
  const total = autoMarkedResults.reduce((sum, result) => sum + result.maxPoints, 0);
  const awarded = autoMarkedResults.reduce((sum, result) => sum + result.awardedPoints, 0);
  const scorePercent = total === 0 ? 0 : Math.round((awarded / total) * 100);
  const manualReviewRequired = results.some((result) => result.needsManualReview);

  return {
    id: `attempt_${params.userId}_${Date.now()}`,
    assessmentId: params.assessment.id,
    courseId: params.course.id,
    userId: params.userId,
    answers: params.answers,
    results,
    scorePercent,
    passed: !manualReviewRequired && scorePercent >= params.assessment.passMarkPercent,
    submittedAt: new Date().toISOString(),
    attemptNumber: params.attemptNumber,
    manualReviewRequired,
  };
}

export function issueRecordAfterPass(params: {
  attempt: CPDAttempt;
  learner: CPDProfessionalProfile;
  course: CPDCourse;
  certificateId: string;
  verificationCode: string;
}): CPDRecord {
  if (!params.attempt.passed) throw new Error('Cannot issue CPD record for failed or manually pending attempt.');
  return {
    id: `record_${params.course.id}_${params.learner.userId}`,
    userId: params.learner.userId,
    courseId: params.course.id,
    professionalBody: params.learner.professionalBody,
    creditsAwarded: params.course.approvedCredits,
    certificateId: params.certificateId,
    issuedAt: new Date().toISOString(),
    verificationCode: params.verificationCode,
  };
}
