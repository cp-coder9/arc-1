# Architex CPD Assessment Platform Starter Code

This codebase is intentionally separate from the toolbox/calculator pack.

The important change in this version is that the assessment is not treated as a text document. It is modelled as a workable assessment application flow:

1. Course/content intake.
2. AI draft question generation.
3. Human review and accreditation approval.
4. Monetised/free assessment entitlement via dedicated CPD payment service.
5. Live assessment runner using structured questions.
6. Server-side scoring.
7. Attempt analytics and lecturer/course analytics.
8. Automatic certificate and CPD record issue after a passing attempt.

Files:
- cpdTypes.ts: CPD content, professional profiles, question options, assessments, courses, accreditation, attempts, certificates, records and analytics types.
- cpdAssessmentGeneratorService.ts: deterministic starter service that models AI generation of a structured question bank. The default assessment uses multiple choice / scenario MCQ questions. Optional text questions are supported but require manual review.
- cpdAccreditationWorkflowService.ts: accreditation application, course publication, server-side assessment scoring and CPD record issue guardrails.
- cpdCertificateService.ts: certificate creation and certificate text rendering for PDF/QR integration.
- cpdCategoryRulesService.ts: professional-body CPD category/rule profiles and body-specific credit/point calculations, including SACAP Category 1 and SACPLAN points model.
- cpdPaymentService.ts: configurable low-price assessment purchase, Architex platform fee calculation, paid entitlement and lecturer/content-owner payout records.
- cpdAnalyticsService.ts: assessment pass-rate, average-score, question-performance and lecturer analytics.
- cpdExample.ts: runnable example for the Architex launch webinar flow.

Integration target:
- Move these concepts into src/services/cpdService.ts, src/services/cpdAssessmentGeneratorService.ts, src/services/cpdAccreditationService.ts, src/services/cpdCertificateService.ts, src/services/cpdPaymentService.ts and CPD components once approved.
- Recommended UI components: CPDHub, CPDAssessmentRunner, CPDCertificateViewer, AdminCPDManager, LecturerAnalyticsDashboard and AdminCPDAnalyticsDashboard.

Important:
- AI assessment generation is a draft workflow only.
- Accreditation and CPD credits require human/provider approval.
- No learner self-awarded CPD points.
- No fake SACAP/ECSA/SACQSP/SACPLAN/SACLAP/SACPCMP/SAGC integration. Use official API only where one exists and has permission/credentials; otherwise use portal-assisted, document-export, email-submission or manual-record connector modes.
- Paid assessments require confirmed payment or admin/free entitlement before the assessment runner starts.
- Assessment pricing, Architex platform fee percentage, minimum fee and payout records must be controlled server-side/admin-side, not by client-side learner input.


Pricing models supported:
- paid_webinar_addon_assessment: lower additional fee after a paid CPD Central/partner webinar.
- standalone_article_based_assessment: higher-value article/reading-based CPD assessment.
- dedicated_cpd_course_assessment: judgement/formula-based price using assessment duration, approved CPD category and credit value.
- partner_bundle_included / free_launch_or_partner_funnel where the assessment is included or intentionally free.


CPD category strategy:
- Target Category 1/developmental CPD where possible, especially for SACAP architecture.
- SACAP Category 1 estimate is 10 hours = 1 credit / 0.1 credit per hour, with 1 Category 1 credit per annum minimum and 5 over the 5-year cycle, subject to accreditor approval.
- SACPLAN uses a different points model; do not convert all bodies into SACAP credits.
- ECSA/SACQSP/SACLAP/SACPCMP/SAGC rule sets are placeholders until current official/partner rules are confirmed.

## Professional-body-specific CPD services

The starter code now includes:

- cpdCategoryRulesService.ts: rule profiles for SACAP, ECSA, SACQSP, SACPCMP, SACPLAN, SACLAP, SAGC and preliminary SACPVP compliance mode.
- cpdRoleBodyMappingService.ts: maps Architex roles such as structural engineer, quantity surveyor, construction project manager, planner and landscape professional to the correct professional body and default CPD category.
- CPD_PROFESSIONAL_BODY_RESEARCH_MATRIX.md: human-readable research matrix and implementation implications.

The example validates that SACAP, ECSA, SACLAP and SAGC use 10 hours = 1 credit for their relevant developmental/category-1 style activities; SACPLAN uses points; SACQSP displays hours; SACPCMP uses a separate 300-credit/3-year category model; and SACPVP remains manual-compliance mode until confirmed.
