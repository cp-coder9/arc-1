/**
 * CPD Assessment Platform — service integration test
 * Validates that all arc-cpd services work correctly together.
 */
import { describe, it, expect } from 'vitest';
import { generateAssessmentDraft, validateDraftForHumanReview } from '../cpdAssessmentGeneratorService';
import { createAccreditationApplication, publishCourseAfterAccreditation, scoreAttempt, issueRecordAfterPass } from '../cpdAccreditationWorkflowService';
import { createCertificateAfterPass, renderCertificateText } from '../cpdCertificateService';
import { calculateCPDCredits, getProfessionalBodyRuleSet, isCategoryOneStrategicTarget } from '../cpdCategoryRulesService';
import { getRoleBodyMapping, listRoleBodyMappings } from '../cpdRoleBodyMappingService';
import { calculateAssessmentAnalytics, calculateLecturerAnalytics } from '../cpdAnalyticsService';
import { calculateAssessmentPrice, createAssessmentPurchase, markPurchasePaid, createInstructorPayout, canStartPaidAssessment, recommendAssessmentPrice } from '../cpdPaymentService';
import type { CPDContentItem, CPDProfessionalProfile } from '../cpdTypes';

// ── Test fixtures ──────────────────────────────────────────────

const testContent: CPDContentItem = {
  id: 'test_content_001',
  title: 'Architex Platform Training Webinar',
  contentType: 'platform_training_course',
  providerName: 'Architex / CPD Central',
  presenterNames: ['Test Presenter'],
  durationMinutes: 60,
  permissionStatus: 'owned_by_architex',
  targetBodies: ['SACAP', 'ECSA', 'SACPLAN', 'SACQSP'],
  learningOutcomes: [
    'Navigate the Architex professional workflow from brief to closeout',
    'Understand how project records, compliance checks and human sign-off interact',
    'Use CPD evidence and certificates responsibly within professional registration cycles',
  ],
  transcript: 'This training explains how professionals use Architex for project management, compliance, and CPD records.',
  createdByUserId: 'admin_test',
};

const testLearner: CPDProfessionalProfile = {
  userId: 'learner_test_001',
  fullName: 'Test Professional',
  email: 'test@example.com',
  profession: 'Architect',
  professionalBody: 'SACAP',
  registrationNumber: 'SACAP-TEST-123',
};

const paymentSettings = {
  id: 'cpd_payment_settings_default',
  enabled: true,
  defaultAssessmentPriceRand: 50,
  platformFeePercent: 10,
  minimumPlatformFeeRand: 1,
  currency: 'ZAR' as const,
  paymentProviders: ['payfast', 'yoco', 'manual_eft'] as const,
  contentOwnerPayoutEnabled: true,
  updatedByUserId: 'admin',
  updatedAt: new Date().toISOString(),
};

// ── Tests ──────────────────────────────────────────────────────

describe('CPD Assessment Generator', () => {
  it('generates a question for every learning outcome', () => {
    const draft = generateAssessmentDraft(testContent);
    expect(draft.questions).toHaveLength(testContent.learningOutcomes.length);
  });

  it('uses multiple_choice and scenario_mcq by default', () => {
    const draft = generateAssessmentDraft(testContent);
    const types = new Set(draft.questions.map((q) => q.type));
    expect(types.has('multiple_choice')).toBe(true);
    draft.questions.forEach((q) => {
      expect(['multiple_choice', 'scenario_mcq']).toContain(q.type);
    });
  });

  it('generates auto-markable questions with correctOptionIds', () => {
    const draft = generateAssessmentDraft(testContent);
    draft.questions.forEach((q) => {
      expect(q.autoMarkable).toBe(true);
      expect(q.requiresManualReview).toBe(false);
      expect(q.correctOptionIds).toBeDefined();
      expect(q.correctOptionIds!.length).toBeGreaterThan(0);
    });
  });

  it('flags short_answer questions for manual review when included', () => {
    const draft = generateAssessmentDraft(testContent, { includeTextQuestions: true });
    const textQuestions = draft.questions.filter((q) => q.type === 'short_answer');
    expect(textQuestions.length).toBeGreaterThan(0);
    textQuestions.forEach((q) => {
      expect(q.autoMarkable).toBe(false);
      expect(q.requiresManualReview).toBe(true);
    });
  });

  it('validates drafts and catches issues', () => {
    const draft = generateAssessmentDraft(testContent);
    const issues = validateDraftForHumanReview(draft);
    // A well-formed draft should have no issues
    expect(issues.filter((i) => i.includes('Every question must map'))).toHaveLength(0);
  });

  it('flags missing correct option IDs as an issue', () => {
    const draft = generateAssessmentDraft(testContent);
    // Corrupt a question
    draft.questions[0] = { ...draft.questions[0], correctOptionIds: undefined };
    const issues = validateDraftForHumanReview(draft);
    expect(issues.some((i) => i.includes('correct option'))).toBe(true);
  });
});

describe('CPD Category Rules', () => {
  it('SACAP uses 10 hours = 1 credit for Category 1', () => {
    const result = calculateCPDCredits({
      professionalBody: 'SACAP',
      approvedCategory: 'category_1_developmental_activity',
      durationHours: 2,
    });
    expect(result.calculatedCredits).toBeCloseTo(0.2, 1);
    expect(result.creditUnitLabel).toBe('credits');
  });

  it('SACPLAN uses points, not credits', () => {
    const result = calculateCPDCredits({
      professionalBody: 'SACPLAN',
      approvedCategory: 'planning_category_a_professional_knowledge',
      durationHours: 1,
    });
    expect(result.creditUnitLabel).toBe('points');
    expect(result.calculatedCredits).toBe(1);
  });

  it('SACQSP uses hours as unit label', () => {
    const result = calculateCPDCredits({
      professionalBody: 'SACQSP',
      approvedCategory: 'quantity_surveying_category_1',
      durationHours: 2,
      approvedCreditsOverride: 2,
    });
    expect(result.creditUnitLabel).toBe('hours');
  });

  it('approved override takes precedence', () => {
    const result = calculateCPDCredits({
      professionalBody: 'SACAP',
      approvedCategory: 'category_1_developmental_activity',
      durationHours: 5,
      approvedCreditsOverride: 1.5,
    });
    expect(result.calculatedCredits).toBe(1.5);
    expect(result.calculationConfidence).toBe('confirmed_from_accreditor');
  });

  it('identifies Category 1 strategic targets', () => {
    expect(isCategoryOneStrategicTarget('category_1_developmental_activity')).toBe(true);
    expect(isCategoryOneStrategicTarget('engineering_category_1_developmental_activity')).toBe(true);
    expect(isCategoryOneStrategicTarget('planning_category_a_professional_knowledge')).toBe(true);
    expect(isCategoryOneStrategicTarget('category_3_individual_activity')).toBe(false);
  });

  it('all professional body rule sets are defined', () => {
    const bodies = ['SACAP', 'ECSA', 'SACQSP', 'SACPLAN', 'SACLAP', 'SACPCMP', 'SAGC', 'SACPVP', 'Voluntary Association', 'Other'] as const;
    bodies.forEach((body) => {
      const rs = getProfessionalBodyRuleSet(body);
      expect(rs).toBeDefined();
      expect(rs.professionalBody).toBe(body);
    });
  });
});

describe('CPD Role Body Mapping', () => {
  it('routes architect to SACAP', () => {
    const m = getRoleBodyMapping('architectural_professional');
    expect(m.professionalBody).toBe('SACAP');
    expect(m.cpdRequired).toBe(true);
  });

  it('routes structural engineer to ECSA', () => {
    const m = getRoleBodyMapping('structural_engineer');
    expect(m.professionalBody).toBe('ECSA');
    expect(m.defaultApprovedCategory).toBe('engineering_category_1_developmental_activity');
  });

  it('routes quantity surveyor to SACQSP', () => {
    const m = getRoleBodyMapping('quantity_surveyor');
    expect(m.professionalBody).toBe('SACQSP');
  });

  it('routes planner to SACPLAN', () => {
    const m = getRoleBodyMapping('professional_planner');
    expect(m.professionalBody).toBe('SACPLAN');
  });

  it('lists all 13 role mappings', () => {
    const all = listRoleBodyMappings();
    expect(all).toHaveLength(13);
  });
});

describe('CPD Accreditation Workflow', () => {
  it('blocks accreditation submission until human-approved', () => {
    const draft = generateAssessmentDraft(testContent);
    expect(() =>
      createAccreditationApplication({
        assessment: draft,
        provider: 'CPD Central',
        targetBodies: ['SACAP'],
        connectorMode: 'document_export',
        requestedCredits: 0.1,
      })
    ).toThrow('human-approved');
  });

  it('publishes course only with accredited status and approved credits', () => {
    let draft = generateAssessmentDraft(testContent);
    draft = { ...draft, reviewStatus: 'approved_for_accreditation' };

    const app = createAccreditationApplication({
      assessment: draft,
      provider: 'CPD Central',
      targetBodies: ['SACAP'],
      connectorMode: 'document_export',
      requestedCredits: 0.1,
    });

    const accredited = { ...app, status: 'accredited' as const, approvedCredits: 0.1 };

    const course = publishCourseAfterAccreditation({
      contentItemId: testContent.id,
      assessment: draft,
      application: accredited,
      title: testContent.title,
      providerName: testContent.providerName,
      certificateTemplateId: 'cert_v1',
    });

    expect(course.status).toBe('live');
    expect(course.approvedCredits).toBe(0.1);
  });

  it('scores correct answers and fails incorrect ones', () => {
    let draft = generateAssessmentDraft(testContent);
    draft = { ...draft, reviewStatus: 'approved_for_accreditation' };

    const app = createAccreditationApplication({
      assessment: draft,
      provider: 'CPD Central',
      targetBodies: ['SACAP'],
      connectorMode: 'document_export',
      requestedCredits: 0.1,
    });

    const accredited = { ...app, status: 'accredited' as const, approvedCredits: 0.1 };
    const course = publishCourseAfterAccreditation({
      contentItemId: testContent.id,
      assessment: draft,
      application: accredited,
      title: testContent.title,
      providerName: testContent.providerName,
      certificateTemplateId: 'cert_v1',
    });

    const correctAnswers = draft.questions.map((q) => ({
      questionId: q.id,
      selectedOptionIds: q.correctOptionIds || [],
    }));

    const attempt = scoreAttempt({
      assessment: draft,
      course,
      userId: testLearner.userId,
      answers: correctAnswers,
      attemptNumber: 1,
    });

    expect(attempt.scorePercent).toBe(100);
    expect(attempt.passed).toBe(true);
  });

  it('blocks CPD record for failed attempts', () => {
    let draft = generateAssessmentDraft(testContent);
    draft = { ...draft, reviewStatus: 'approved_for_accreditation' };

    const app = createAccreditationApplication({
      assessment: draft,
      provider: 'CPD Central',
      targetBodies: ['SACAP'],
      connectorMode: 'document_export',
      requestedCredits: 0.1,
    });

    const accredited = { ...app, status: 'accredited' as const, approvedCredits: 0.1 };
    const course = publishCourseAfterAccreditation({
      contentItemId: testContent.id,
      assessment: draft,
      application: accredited,
      title: testContent.title,
      providerName: testContent.providerName,
      certificateTemplateId: 'cert_v1',
    });

    const wrongAnswers = draft.questions.map((q) => ({
      questionId: q.id,
      selectedOptionIds: ['wrong_option'],
    }));

    const failedAttempt = scoreAttempt({
      assessment: draft,
      course,
      userId: testLearner.userId,
      answers: wrongAnswers,
      attemptNumber: 1,
    });

    expect(failedAttempt.passed).toBe(false);
    expect(() =>
      issueRecordAfterPass({
        attempt: failedAttempt,
        learner: testLearner,
        course,
        certificateId: 'cert_001',
        verificationCode: 'TEST-CODE',
      })
    ).toThrow('Cannot issue CPD record');
  });
});

describe('CPD Certificate Service', () => {
  it('creates certificate after passing attempt', () => {
    const draft = generateAssessmentDraft(testContent);
    let app = createAccreditationApplication({
      assessment: { ...draft, reviewStatus: 'approved_for_accreditation' },
      provider: 'CPD Central',
      targetBodies: ['SACAP'],
      connectorMode: 'document_export',
      requestedCredits: 0.1,
    });
    app = { ...app, status: 'accredited', approvedCredits: 0.1 };

    const course = publishCourseAfterAccreditation({
      contentItemId: testContent.id,
      assessment: { ...draft, reviewStatus: 'approved_for_accreditation' },
      application: app,
      title: testContent.title,
      providerName: testContent.providerName,
      certificateTemplateId: 'cert_v1',
    });

    const correctAnswers = draft.questions.map((q) => ({
      questionId: q.id,
      selectedOptionIds: q.correctOptionIds || [],
    }));

    const attempt = scoreAttempt({
      assessment: { ...draft, reviewStatus: 'approved_for_accreditation' },
      course,
      userId: testLearner.userId,
      answers: correctAnswers,
      attemptNumber: 1,
    });

    const cert = createCertificateAfterPass({
      learner: testLearner,
      course,
      attempt,
      verificationBaseUrl: 'https://architex.co.za',
    });

    expect(cert.learnerName).toBe(testLearner.fullName);
    expect(cert.passed).toBe(true);
    expect(cert.verificationCode).toBeDefined();
    expect(cert.verificationCode).toMatch(/^ARCHITEX-CPD-/);
    expect(cert.verificationUrl).toContain('cpd/certificates/verify');
  });

  it('renders certificate text with all required fields', () => {
    const draft = generateAssessmentDraft(testContent);
    let app = createAccreditationApplication({
      assessment: { ...draft, reviewStatus: 'approved_for_accreditation' },
      provider: 'CPD Central',
      targetBodies: ['SACAP'],
      connectorMode: 'document_export',
      requestedCredits: 0.1,
    });
    app = { ...app, status: 'accredited', approvedCredits: 0.1 };

    const course = publishCourseAfterAccreditation({
      contentItemId: testContent.id,
      assessment: { ...draft, reviewStatus: 'approved_for_accreditation' },
      application: app,
      title: testContent.title,
      providerName: testContent.providerName,
      certificateTemplateId: 'cert_v1',
    });

    const correctAnswers = draft.questions.map((q) => ({
      questionId: q.id,
      selectedOptionIds: q.correctOptionIds || [],
    }));

    const attempt = scoreAttempt({
      assessment: { ...draft, reviewStatus: 'approved_for_accreditation' },
      course,
      userId: testLearner.userId,
      answers: correctAnswers,
      attemptNumber: 1,
    });

    const cert = createCertificateAfterPass({
      learner: testLearner,
      course,
      attempt,
      verificationBaseUrl: 'https://architex.co.za',
    });

    const text = renderCertificateText(cert);
    expect(text).toContain('ARCHITEX CPD CERTIFICATE');
    expect(text).toContain(testLearner.fullName);
    expect(text).toContain('SACAP');
    expect(text).toContain(testLearner.registrationNumber!);
    expect(text).toContain(cert.verificationCode);
  });
});

describe('CPD Payment Service', () => {
  const courseWithPrice = {
    id: 'course_test',
    contentItemId: testContent.id,
    assessmentId: 'assessment_test',
    title: testContent.title,
    approvedCredits: 0.1,
    professionalBodies: ['SACAP'] as any[],
    providerName: testContent.providerName,
    certificateTemplateId: 'cert_v1',
    status: 'live' as const,
    assessmentPriceRand: 50,
    contentOwnerUserId: 'lecturer_001',
    monetizationEnabled: true,
    commercialModel: 'paid_webinar_addon_assessment' as const,
    pricingBasis: 'admin_fixed' as const,
    approvedCategory: 'category_1_developmental_activity' as const,
    expectedAssessmentMinutes: 20,
  };

  it('calculates price with platform fee', () => {
    const price = calculateAssessmentPrice({ course: courseWithPrice, settings: paymentSettings });
    expect(price.assessmentPriceRand).toBe(50);
    expect(price.platformFeeRand).toBe(5); // 10% of 50
    expect(price.contentOwnerNetRand).toBe(45);
  });

  it('respects minimum platform fee', () => {
    const settings = { ...paymentSettings, minimumPlatformFeeRand: 10 };
    const price = calculateAssessmentPrice({ course: { ...courseWithPrice, assessmentPriceRand: 30 }, settings });
    expect(price.platformFeeRand).toBeGreaterThanOrEqual(10);
  });

  it('free assessments have paid status immediately', () => {
    const purchase = createAssessmentPurchase({
      course: { ...courseWithPrice, assessmentPriceRand: 0 },
      learnerUserId: testLearner.userId,
      contentOwnerUserId: 'lecturer_001',
      settings: paymentSettings,
      paymentProvider: 'manual_eft',
    });
    expect(purchase.paymentStatus).toBe('paid');
    expect(canStartPaidAssessment(purchase)).toBe(true);
  });

  it('recommends prices per commercial model', () => {
    const freeRec = recommendAssessmentPrice({ course: { ...courseWithPrice, commercialModel: 'free_launch_or_partner_funnel' } });
    expect(freeRec.recommendedPriceRand).toBe(0);

    const webinarRec = recommendAssessmentPrice({ course: courseWithPrice });
    expect(webinarRec.recommendedPriceRand).toBeGreaterThanOrEqual(25);
    expect(webinarRec.recommendedPriceRand).toBeLessThanOrEqual(75);
  });

  it('marks purchase paid and creates payouts', () => {
    let purchase = createAssessmentPurchase({
      course: courseWithPrice,
      learnerUserId: testLearner.userId,
      contentOwnerUserId: 'lecturer_001',
      settings: paymentSettings,
      paymentProvider: 'payfast',
    });
    expect(purchase.paymentStatus).toBe('pending');

    purchase = markPurchasePaid({ purchase, providerReference: 'PAYFAST-REF-001' });
    expect(purchase.paymentStatus).toBe('paid');
    expect(purchase.providerReference).toBe('PAYFAST-REF-001');
    expect(canStartPaidAssessment(purchase)).toBe(true);

    const payout = createInstructorPayout({
      contentOwnerUserId: 'lecturer_001',
      purchases: [purchase],
    });
    expect(payout.grossRand).toBe(50);
    expect(payout.platformFeeRand).toBe(5);
    expect(payout.payoutRand).toBe(45);
  });
});

describe('CPD Analytics Service', () => {
  it('calculates assessment analytics from attempts', () => {
    const draft = generateAssessmentDraft(testContent);
    let app = createAccreditationApplication({
      assessment: { ...draft, reviewStatus: 'approved_for_accreditation' },
      provider: 'CPD Central',
      targetBodies: ['SACAP'],
      connectorMode: 'document_export',
      requestedCredits: 0.1,
    });
    app = { ...app, status: 'accredited', approvedCredits: 0.1 };

    const course = publishCourseAfterAccreditation({
      contentItemId: testContent.id,
      assessment: { ...draft, reviewStatus: 'approved_for_accreditation' },
      application: app,
      title: testContent.title,
      providerName: testContent.providerName,
      certificateTemplateId: 'cert_v1',
    });

    const correctAnswers = draft.questions.map((q) => ({
      questionId: q.id,
      selectedOptionIds: q.correctOptionIds || [],
    }));

    const passingAttempt = scoreAttempt({
      assessment: { ...draft, reviewStatus: 'approved_for_accreditation' },
      course,
      userId: 'user1',
      answers: correctAnswers,
      attemptNumber: 1,
    });

    const wrongAnswers = draft.questions.map((q) => ({
      questionId: q.id,
      selectedOptionIds: ['wrong'],
    }));

    const failingAttempt = scoreAttempt({
      assessment: { ...draft, reviewStatus: 'approved_for_accreditation' },
      course,
      userId: 'user2',
      answers: wrongAnswers,
      attemptNumber: 1,
    });

    const analytics = calculateAssessmentAnalytics({
      assessmentId: draft.id,
      courseId: course.id,
      attempts: [passingAttempt, failingAttempt],
    });

    expect(analytics.totalAttempts).toBe(2);
    expect(analytics.uniqueLearners).toBe(2);
    expect(analytics.passRatePercent).toBe(50);
    expect(analytics.questionStats).toHaveLength(draft.questions.length);
  });

  it('calculates lecturer analytics', () => {
    const draft = generateAssessmentDraft(testContent);
    let app = createAccreditationApplication({
      assessment: { ...draft, reviewStatus: 'approved_for_accreditation' },
      provider: 'CPD Central',
      targetBodies: ['SACAP'],
      connectorMode: 'document_export',
      requestedCredits: 0.1,
    });
    app = { ...app, status: 'accredited', approvedCredits: 0.1 };

    const course = publishCourseAfterAccreditation({
      contentItemId: testContent.id,
      assessment: { ...draft, reviewStatus: 'approved_for_accreditation' },
      application: app,
      title: testContent.title,
      providerName: testContent.providerName,
      certificateTemplateId: 'cert_v1',
    });

    const correctAnswers = draft.questions.map((q) => ({
      questionId: q.id,
      selectedOptionIds: q.correctOptionIds || [],
    }));

    const attempt = scoreAttempt({
      assessment: { ...draft, reviewStatus: 'approved_for_accreditation' },
      course,
      userId: 'user1',
      answers: correctAnswers,
      attemptNumber: 1,
    });

    const la = calculateLecturerAnalytics({
      lecturerUserId: testContent.createdByUserId,
      courseIds: [course.id],
      attempts: [attempt],
    });

    expect(la.totalLearners).toBe(1);
    expect(la.passRatePercent).toBe(100);
  });
});
