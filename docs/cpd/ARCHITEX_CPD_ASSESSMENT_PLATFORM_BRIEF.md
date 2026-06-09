# Architex CPD Assessment Platform Brief

Version: 0.1 draft
Scope: separate CPD menu/workflow for Architex, not part of calculators/toolboxes.

## 1. Key conclusion

Architex should implement CPD as a separate top-level learning/compliance workflow, not as a toolbox item. It should become a professional CPD evidence, assessment, certificate and accreditation-support layer for South African built-environment professionals.

Launch concept:
1. Leor creates a CPD-accredited webinar/lecture series on how to use Architex.
2. CPD Central can launch/promote it to its built-environment audience.
3. Professionals attend a free webinar, discover Architex and are encouraged to sign up.
4. Architex hosts assessment workflows, certificates/evidence and ongoing CPD record tracking.
5. Future content can include Architex-owned courses, reviewed/refereed articles, partner webinars, voluntary association content and assessment extensions to existing workshops.

## 2. Current Architex CPD architecture found

Existing planning files found in the current repo:
- Phases/new-implementation-plan/phase-03-cpd-prd.md
- Phases/new-implementation-plan/phase-03-cpd-workflow.md
- Phases/new-implementation-plan/phase-03-cpd-tasks.md

The current plan already covers:
- CPD course, lesson, quiz, attempt, record and certificate models.
- Professional-facing CPD hub and points tracker.
- Admin course management.
- Certificate PDF generation through existing PDF/Blob patterns.
- Transcript promotion to knowledge base as pending review.
- No fake SACAP/ECSA sync unless a real provider/API exists.

This new brief extends it with:
- CPD Central partnership and launch workflow.
- External/partner webinar assessment extensions.
- AI assessment generation from webinar/article/course content.
- Accreditation application/status workflow.
- Reviewed/refereed article assessment workflow.
- Professional body/cycle mapping across SACAP/ECSA/SACQSP/SACPLAN/etc.

## 3. CPD Central public positioning observed

From public CPD Central website inspection:
- Main message: “Stay CPD Compliant, the Easy way” and “Accredited courses. One simple platform. Learn on your schedule”.
- Offers live/on-demand built-environment courses and readings.
- Example content: JBCC contracts, Revit Detailing Essentials, Heritage Applications, Mediation for Architects, 2D/3D Modelling, SANS 10400-XA, Passive House, property development and Architect & Builder readings.
- Describes itself as offering built-environment workshops/courses in Southern Africa and serving trained professionals requiring CPD credits under SACAP.
- CPD administration for architectural professionals includes a certificate submission/compliance service shown publicly at R380/year or R59.99/month.
- CPD administration for engineers is advertised as annual ECSA submission under CESA accreditation at R535/year.
- Digital Resources includes a document resource bank with municipal/SACAP/SANS resources and filters for Cape Town, Johannesburg, Tshwane, Ekurhuleni, SACAP and SANS Forms.

## 4. Product distinction from toolbox work

This CPD platform must stay separate from the calculator/toolbox implementation.

Separate navigation:
- Main menu item: CPD / Learning / Professional Development.
- Not inside the contractor/professional toolbox menu.
- Separate admin area: CPD Content & Accreditation Admin.
- Separate records: CPD courses, content items, assessment drafts, accreditation applications, attempts, CPD records and certificates.

Shared platform services may be reused:
- Auth/user roles.
- File upload / Blob storage.
- PDF generation.
- Notification service.
- Knowledge service for reviewed content.
- Payment/subscription integration later.
- Audit service.

## 5. Core roles

Professional learner:
- View CPD dashboard and required/earned credits by profession/cycle.
- Enrol in Architex/partner CPD content.
- Complete assessments.
- Download certificates.
- Track evidence for SACAP/ECSA/SACQSP/SACPLAN/other bodies.

Content creator / lecturer:
- Upload webinar recording, transcript, slides, article, reading pack or external content reference.
- Provide learning outcomes, profession category, CPD credit target and assessment style.
- Review AI-generated quiz/assessment before submission.

CPD reviewer / accreditor admin:
- Review content metadata and AI-generated assessments.
- Approve/return/refine assessment before accreditation submission.
- Record accreditation provider, reference number, credit value, validity period and conditions.

Platform admin:
- Manage workflows, certificates, disputes, reports, partner channels and launch funnel analytics.

## 6. Supported content sources

- Architex launch webinar: how to use the platform.
- Architex-owned lecture series.
- Partner CPD Central courses where a supplementary assessment is agreed.
- Voluntary association webinars/workshops.
- Existing workshop recordings and transcripts, subject to permission.
- Reviewed/refereed articles.
- Magazine/journal readings.
- Regulatory guidance notes, municipal process guides and SANS/NBR educational content.
- Platform workflow tutorials.

Rights guardrail:
- Do not ingest or assess third-party content unless Architex has permission or the content owner/partner has provided it for assessment use.
- Store source permission status and permitted use scope.

## 7. AI assessment generation workflow

1. Intake
- Upload or reference video, transcript, audio, article, slides, webinar outline or reading pack.
- Capture title, presenter, provider, profession, council category, target credit value, learning outcomes, duration and permission status.

2. Content extraction
- Transcribe audio/video where needed.
- Extract key topics, sections, learning outcomes, terms, regulations, case studies and practice implications.
- Flag low-confidence or missing transcript areas.

3. AI draft assessment
- Generate MCQ, true/false, scenario, short-answer and reflection questions.
- Map each question to a learning outcome and source reference.
- Generate model answers, explanations, difficulty levels and pass mark recommendation.
- Generate anti-cheat variants where appropriate.

4. Human review
- Content creator reviews for accuracy and tone.
- CPD reviewer/admin approves or revises.
- No assessment goes live from AI alone.

5. Accreditation workflow
- Package metadata, learning outcomes, assessment, pass mark, duration, presenter bio and evidence for CPD Central or another accrediting partner.
- Track status: draft, internal review, submitted, changes requested, accredited, expired, archived.

6. Learner completion
- Learner completes content and assessment.
- Server-side scoring creates attempt record.
- Passing attempt creates CPD record and certificate.
- Failed attempt stores feedback and retry policy.

7. Record and certificate
- Certificate includes learner details, professional registration number, provider/accreditation details, course title, CPD credits, assessment pass status, issue date, verification code and QR/link.

## 8. Workable assessment application requirement

The CPD assessment output must be a functional assessment application, not a generated text document.

Minimum learner-facing assessment runner:
- Course landing page with content, duration, accreditation status and CPD credit value.
- Start/resume assessment button.
- Question-by-question or paginated assessment UI.
- Default question type: multiple choice / scenario multiple choice.
- Optional question types: multiple select, true/false and short text answer.
- Short text answers require manual review unless a later approved rubric/AI-marking policy is agreed.
- Attempt timer where required.
- Attempt count / retry policy.
- Submission confirmation.
- Result screen showing pass/fail, score and approved feedback.
- Certificate download/verification only after pass and only after the course is live/accredited.

Minimum admin/lecturer assessment builder:
- AI generates a structured question bank with question IDs, option IDs, correct option IDs, points, explanations, learning-outcome mapping and source references.
- Lecturer/content creator can edit questions, options, explanations and model answers.
- CPD reviewer/admin must approve the assessment before it goes live.
- Assessment versioning is required so learner attempts remain tied to the exact version completed.

Default assessment policy:
- Keep MVP assessments primarily multiple choice for automatic marking.
- Allow optional short-answer/reflection questions later, but mark them as manual-review-required.
- Do not automatically issue certificates where manual review is still pending.

## 9. Analytics and reporting requirement

The platform must capture analytics from actual assessment attempts.

Minimum analytics:
- Per-assessment total attempts.
- Unique learners.
- Pass rate percentage.
- Average score percentage.
- Question-level correct rate and weak-question indicators.
- Learner completion status.
- Failed/retry rate.
- Certificate issue count.
- Course/lecturer/provider dashboard so the person or organisation that submitted the content can see pass rate, average score, learner volume and question performance.
- Partner/admin reporting by CPD Central, voluntary association, accreditation provider and professional body where permitted under POPIA/data-sharing rules.

Analytics must support quality control:
- Very low pass rates may indicate poor content, bad questions or overly difficult assessments.
- Very high pass rates may indicate questions are too obvious.
- Question-level analytics should help lecturers and reviewers improve future versions.

## 10. Certificate output requirement

A passing eligible attempt must automatically create a certificate and CPD record.

Certificate must include:
- Professional/learner full name.
- Professional body and registration number where available.
- Course/webinar/article title.
- Presenter/provider name.
- CPD Central / partner / accreditation provider name where applicable.
- Accreditation reference number where applicable.
- Approved CPD credit value.
- Assessment pass status.
- Issue date.
- Verification code and QR/link.

Automatic issue rule:
- Auto-issue only when the course is live/accredited, the attempt is server-scored as passed, and no manual review is pending.
- Failed attempts store feedback and retry policy but do not create CPD credits or certificates.

## 11. Professional body and connector scope

The platform should be API-ready but honest about actual integrations.

Target South African built-environment CPD/professional bodies and pathways to model:
- SACAP: architects and architectural professionals.
- ECSA: engineers.
- SACQSP: quantity surveyors.
- SACPLAN: planners.
- SACLAP: landscape architects.
- SACPCMP: construction project managers and construction health/safety professionals where CPD applies.
- SAGC / geomatics pathway where relevant.
- Voluntary associations and recognised CPD providers/partners, including CPD Central.
- Generic “Other” connector for professional groups whose CPD requirement or submission format still needs confirmation.

Connector modes:
- API, only where official API documentation, credentials and permission exist.
- Portal-assisted submission.
- Document export.
- Email submission.
- Manual record/evidence pack.

Do not claim direct SACAP/ECSA/SACQSP/SACPLAN/SACLAP/SACPCMP/SAGC integration unless a real API or formal data-sharing route exists.

## 12. Business model options

Launch model:
- Free CPD webinar on how to use Architex.
- CPD Central launches/promotes to industry.
- Webinar creates product adoption and signups.

Partnership extension model:
- CPD Central continues to host/sell/promote its CPD content.
- Architex offers AI-assisted supplementary assessments where agreed.
- Goal is to extend value, not compete or strip CPD Central’s content.
- Could be bundled into CPD Central’s existing subscription/admin offering if agreed.

Architex-owned content model:
- Architex creates its own accredited lecture series.
- Assessments and certificates live in Architex.
- Monetization can be free, freemium, subscription-included, pay-per-course or sponsored.

Reviewed/refereed article model:
- Curated articles can have assessments attached.
- Useful for asynchronous CPD credits.
- Approved content can feed the knowledge hub after admin review.

## 13. Data architecture

Suggested collections:
- cpd_content_items/{contentItemId}
- cpd_courses/{courseId}
- cpd_assessment_drafts/{draftId}
- cpd_assessments/{assessmentId}
- cpd_accreditation_applications/{applicationId}
- users/{userId}/cpd_enrollments/{enrollmentId}
- users/{userId}/cpd_attempts/{attemptId}
- users/{userId}/cpd_records/{recordId}
- cpd_certificates/{certificateId}
- cpd_assessment_analytics/{assessmentId}
- cpd_lecturer_analytics/{lecturerUserId}
- cpd_partner_channels/{partnerId}
- cpd_professional_body_rules/{ruleSetId}

## 14. Human sign-off and compliance guardrails

- AI generates draft assessments only.
- Human review is required before accreditation submission.
- Accreditation status and credit value must come from CPD Central, a voluntary association or a recognised accreditation workflow — not from AI.
- Learners cannot self-award CPD credits.
- Attempt scoring and certificate issuance should be server/admin-controlled.
- Certificates must be verifiable and tamper-resistant.
- If no API exists for SACAP/ECSA/etc., export/manual submission support is honest and explicit.
- POPIA: store only necessary learner/professional information and define retention periods.

## 15. MVP sequence

MVP 1: Separate CPD Hub
- Add standalone CPD menu item.
- Dashboard: available courses, enrolled courses, completed CPD and certificates.
- Professional body/profile fields: registration number, category, CPD cycle dates.

MVP 2: Admin Course + Assessment Builder
- Create/upload course/article/webinar content.
- Add transcript/content extraction metadata.
- AI-generate structured draft question banks, mostly MCQ by default.
- Human edit/approve assessments.

MVP 3: Accreditation Workflow
- Accreditation application package builder.
- Provider/reference/status tracking.
- Validity/expiry and approved credit capture.

MVP 4: Learner Assessment Application + Certificates
- Enrolment, interactive assessment runner, assessment attempt, server-side scoring.
- CPD record creation.
- Certificate PDF/QR verification.

MVP 4b: Analytics Dashboards
- Assessment pass rate, average score, question performance and completion analytics.
- Lecturer/content-provider pass-rate dashboard.
- Partner/admin analytics with POPIA-aware aggregation.

MVP 5: Partner/CPD Central Launch Funnel
- CPD Central referral channel tracking.
- Free launch webinar landing page.
- Conversion analytics: attended, registered, completed assessment, joined Architex, created profile/project.

MVP 6: Article/Reading Assessments + Knowledge Hub
- Reviewed/refereed articles.
- Reading-based assessments.
- Approved content promoted to knowledge hub after admin review.

## 16. CPD Central negotiation points

- Position Architex as an extension and lead funnel, not a competitor.
- Offer a free CPD-accredited Architex launch webinar.
- Discuss whether Architex can create supplementary assessments for CPD Central/partner content.
- Clarify who owns content, assessments and learner data.
- Clarify accreditation provider name, certificate wording and issue authority.
- Clarify whether CPD Central wants assessment hosting inside Architex, white-labelled, linked externally or data-export only.
- Consider a bundled/free assessment-extension pilot to increase CPD Central subscription value.
- Track referrals and conversions transparently.


## CPD Categories and Category 1 Strategy

The CPD platform must be framed around the CPD category rules of each professional body, rather than treating CPD as one generic points system. The strategic target for Architex should be recognised learning/development CPD, especially Category 1 where the relevant professional body, CPD Central, recognised voluntary association or accredited learning site can approve it.

### SACAP / Architecture working rule

Initial official SACAP research confirms that SACAP's CPD conditions use a five-year CPD cycle and three broad categories:

- Category 1 - Developmental Activities.
- Category 2 - Work-Based Activities.
- Category 3 - Individual Activities.

For SACAP Category 1 Developmental Activities, the key working conversion is generally 10 hours = 1 credit, i.e. 0.1 credit per hour, excluding special routes such as architectural student mentoring. SACAP material also states that at least 1 Category 1 credit is compulsory annually, which means a minimum of 5 Category 1 credits over the five-year cycle. SACAP material indicates that 5 Category 1 credits may be accrued and claimed in one calendar year for the full five-year cycle.

Therefore, a one-hour SACAP Category 1 activity should be estimated as 0.1 credit, but the certificate must show the accreditor-approved credit value, not merely the platform estimate.

Important correction to the platform model: it should not assume a simple annual 5-credit Category 1 requirement for architecture. The better architecture framing is 1 Category 1 credit per annum minimum / 5 over the five-year cycle, with 10 hours = 1 credit. Leor's strategic goal remains correct: make Architex capable of hosting/facilitating Category 1 CPD activities, because Category 1 developmental learning is the most attractive and important target.

### SACPLAN / Planning working rule

Initial SACPLAN research shows a different structure: SACPLAN uses a CPD points system with Category A Professional Knowledge, Category B Mentorship and Category C Active Participation in the profession. SACPLAN's policy refers to 75 points over a three-year cycle. Some non-credit-bearing planning-related courses/modules are calculated as 1 point per hour, subject to focus-area and annual limits.

This confirms the platform must store body-specific CPD units. SACPLAN points must not be forced into SACAP credits.

### Other professional bodies

For ECSA, SACQSP, SACLAP, SACPCMP, SAGC and other built-environment bodies, Architex should include professional-body rule profiles but mark them as `preliminary_needs_body_confirmation` until current official documents or partner/accreditor instructions confirm the category names, conversion rules, annual/cycle targets and certificate wording.

### Product implication

Every CPD course/assessment should store:

- Professional body.
- Approved category.
- Whether Category 1/developmental CPD is being targeted.
- Raw duration in hours.
- Platform-estimated credits/points.
- Accreditor-approved credits/points.
- Unit label: credits or points.
- Rule confidence: official researched, partner confirmed, or needs confirmation.
- Accreditor/partner evidence and reference number.

The platform should help prepare Category 1 accreditation packs, but it must not self-classify an assessment as Category 1 without approval from CPD Central, a recognised voluntary association, accredited learning site, professional body or other recognised accreditor.

## Monetised CPD Assessment Payments

The CPD assessment platform must include a dedicated payment service around taking an assessment. This is separate from accreditation: payment unlocks access to the assessment, while accreditation controls whether a passed assessment can award recognised CPD evidence.

The system must allow lecturers/content owners/course providers to monetise assessments placed on Architex. The price should be low and configurable, for example R10, R50, free, or any admin-approved course-level amount. The content creator gets the net amount after Architex's platform fee.

Architex must be able to set its own platform fee per assessment transaction. Keep 1% as a reference for the broader platform, but CPD assessments may need a higher configurable percentage, for example 10%, because a 1% fee on a R10 or R50 assessment may be too small to justify payment processing and platform administration. The system must therefore support:

- Global default assessment price in ZAR.
- Course-level assessment price override.
- Free assessments where needed for launch/funnel purposes.
- Configurable Architex fee percentage.
- Optional minimum platform fee in rand.
- Optional fixed platform fee component.
- Gross revenue, Architex fee, payment-gateway fee placeholder, and content-owner net amount.
- Payout records for lecturers/content owners.
- Partner/lecturer revenue reporting.


### CPD pricing models

The assessment payment model must not treat every CPD assessment as the same product. Pricing depends on the commercial context:

1. Post-webinar add-on assessment

Where a learner already paid the higher-value webinar/course fee through CPD Central or another partner, Architex should charge a lower follow-on assessment fee for the additional assessed CPD evidence/credits. The learner has already paid for the main event; the assessment fee covers the extra testing, certificate and CPD record workflow.

2. Standalone article or reading-based assessment

Where an approved content owner uploads an article, reviewed/refereed article, magazine piece or reading material and the CPD value is created mainly by the Architex assessment/evidence workflow, the assessment price should carry a higher value than a simple webinar add-on. The learner is paying for the CPD assessment product attached to that content, not merely a small add-on after a separately paid event.

3. Dedicated CPD course running through Architex

Where the course itself runs through the Architex assessment platform, pricing should be a judgement call. The content owner/admin should consider expected assessment time, approved CPD category, approved credit value, content depth, review burden and partner terms. A content owner may propose a price, but the final amount should be admin/partner approved.

The platform should therefore support commercial models such as `paid_webinar_addon_assessment`, `standalone_article_based_assessment`, `dedicated_cpd_course_assessment`, `partner_bundle_included` and `free_launch_or_partner_funnel`.

Recommended learner payment flow:

1. Learner opens course/assessment landing page.
2. Platform shows CPD value, accreditation status, price, provider and certificate conditions.
3. Learner pays or uses a free entitlement.
4. Payment provider webhook confirms the paid status.
5. Assessment runner unlocks.
6. Passing attempt can issue certificate/CPD record only if the course is accredited/live and no manual review is pending.

Payment providers can start with PayFast, Yoco, Stripe where available, manual EFT/admin comp, or another South African-friendly gateway. Learners must not be able to start paid assessments, alter payment status, change platform fees, or generate certificates from client-side state alone.

## Professional-body-specific CPD engine

The CPD platform must not treat built-environment CPD as one generic credit system. Learner onboarding and admin setup must capture role, professional body and registration category before calculating or displaying CPD value.

Role routing now includes:
- Architect / architectural professional: SACAP.
- Structural, civil, electrical and mechanical engineers: ECSA.
- Quantity surveyor: SACQSP.
- Construction project manager / construction manager: SACPCMP.
- Professional planner: SACPLAN.
- Landscape architectural professional: SACLAP.
- Geomatics practitioner: SAGC.
- Property valuer: SACPVP manual-compliance mode until official category/points rules are supplied.

The learner dashboard, certificate wording and accreditation admin must use the correct unit and category language for each body: SACAP/ECSA/SACLAP/SAGC credits, SACPLAN points, SACQSP hours, SACPCMP credits, and SACPVP compliance status where the exact formula is not confirmed.

A research matrix is included in CPD_PROFESSIONAL_BODY_RESEARCH_MATRIX.md and the implementation code includes cpdCategoryRulesService.ts and cpdRoleBodyMappingService.ts.
