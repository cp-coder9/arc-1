# Amy/Greg CPD Implementation Note

This is a separate CPD platform iteration. Do not merge it into calculator/toolbox menus.

Recommended next steps:

1. Add separate CPD menu item and CPD Hub route.
2. Implement CPD data models and Firestore rules with server/admin-controlled records.
3. Build professional-body CPD category/rule profiles first: SACAP Category 1/2/3 with 10 hours = 1 credit for Category 1 estimate, Category 1 annual/cycle minimums, SACPLAN points/category model, and preliminary rule placeholders for ECSA/SACQSP/SACLAP/SACPCMP/SAGC pending official confirmation.
4. Build Admin CPD Manager for content intake, transcript upload, AI assessment drafts, human review and accreditation status.
5. Build learner CPD Hub and actual CPD assessment application: course list, enrolment, structured MCQ/scenario-MCQ assessment runner, attempt timer/retry policy, server-side scoring, pass/fail result page, certificate download and CPD record tracker.
6. Build certificate service: auto-issue only after live/accredited course, passing attempt and no pending manual review. Certificate must include professional name, professional body, registration number where available, course title, provider/accreditation reference, approved CPD credits, issue date and verification QR/link.
7. Build CPD payment service with commercial pricing models: lower add-on fee for learners who already paid for a CPD Central/partner webinar, higher standalone value for approved article/reading-based assessments, and judgement-based pricing for dedicated CPD courses based on duration, CPD category, credit value and content-owner proposal. Include configurable low per-assessment price, free/paid entitlement, payment gateway checkout/webhook, Architex configurable platform fee percentage/minimum fee, content-owner net amount, lecturer payout records and revenue reporting.
8. Build analytics dashboards: per-assessment attempts, unique learners, pass rate, average score, question performance, certificate issue count and lecturer/content-provider pass-rate reporting.
9. Add CPD Central launch funnel: referral source, webinar registration, attendance/completion, assessment, Architex signup/conversion.
10. Build partner workflow for CPD Central/voluntary associations/professional bodies: accreditation submission pack, reference number, approved credits, validity dates, connector mode and certificate wording.
11. Add article/reading assessments for reviewed/refereed content.

Key guardrails:
- AI drafts assessments but does not accredit content.
- Human approval required before publication and accreditation submission.
- Category 1 CPD must be treated as a strategic target, not a self-declared platform status. The accreditor/partner must approve the category and credit value.
- SACAP architecture estimate: 10 hours = 1 credit / 0.1 credit per hour for Category 1 developmental activities, but final certificate value must use the approved credit value.
- Do not apply SACAP credit maths to SACPLAN/ECSA/SACQSP/SACLAP/SACPCMP/SAGC without body-specific rule confirmation.
- Learners cannot write CPD records directly.
- Learners cannot start paid assessments until payment/free entitlement is confirmed server-side.
- Assessment price, platform fee percentage, minimum fee and payout settings must be admin-controlled and audit logged.
- No fake statutory-body sync; use official API only where documentation, credentials and permission exist. Otherwise use portal-assisted, document-export, email-submission or manual-record connector modes for SACAP, ECSA, SACQSP, SACPLAN, SACLAP, SACPCMP, SAGC and voluntary associations.
- Third-party content requires permission.

## New implementation requirement: role-routed CPD workflows

Before building CPD screens, add a role/body routing layer. A project planner, structural engineer, QS, landscape architect, construction project manager and geomatics practitioner cannot share the same CPD calculation screen.

Implementation sequence update:
1. Add professional role/body fields to learner profile.
2. Use cpdRoleBodyMappingService.ts to resolve the default professional body and CPD rule profile.
3. Use cpdCategoryRulesService.ts for category choices, unit label and cycle targets.
4. Build dashboards that show credits/points/hours/compliance status according to the body.
5. Block certificates unless the course has body-specific category/value/provider evidence.
6. For SACPVP, use manual compliance verification until the exact official public rules are obtained.

This prevents an ECSA engineer, SACQSP QS or SACPCMP project manager from being issued an architecture-style SACAP CPD certificate incorrectly.
