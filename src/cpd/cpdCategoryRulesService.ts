import type {
  CPDApprovedCategory,
  CPDBodyRuleStatus,
  CPDCreditCalculation,
  CPDCreditCalculationInput,
  CPDProfessionalBody,
  CPDProfessionalBodyRuleSet,
} from './cpdTypes';

const roundCredits = (value: number) => Math.round(value * 100) / 100;

const ruleSets: Record<CPDProfessionalBody, CPDProfessionalBodyRuleSet> = {
  SACAP: {
    professionalBody: 'SACAP',
    status: 'researched_official',
    sourceSummary:
      'SACAP CPD Conditions / Board Notice material: Category 1 is Developmental Activities; generally 10 hours = 1 credit, i.e. 0.1 credit/hour, except mentoring at accredited architectural learning sites. At least 1 Category 1 credit is compulsory per annum, meaning 5 credits over the 5-year cycle; up to 5 Category 1 credits can be accrued in one calendar year and claimed for the cycle. Category 2 covers work-based activities, and Category 3 covers individual activities such as VA membership and other individual professional contributions.',
    cycleYears: 5,
    annualTotalTargetCredits: undefined,
    cycleTotalTargetCredits: undefined,
    category1AnnualMinimumCredits: 1,
    category1CycleMinimumCredits: 5,
    category1MaxCreditsClaimableInOneYear: 5,
    categories: [
      {
        id: 'sacap_category_1_developmental_activities',
        label: 'Category 1 - Developmental Activities',
        approvedCategory: 'category_1_developmental_activity',
        required: true,
        calculationMethod: 'hours_to_credits',
        hoursPerCredit: 10,
        creditsPerHour: 0.1,
        annualMinimumCredits: 1,
        cycleMinimumCredits: 5,
        maxCreditsClaimableInOneYear: 5,
        examples: ['Validated CPD workshops', 'Conferences', 'Congresses', 'Lectures', 'Seminars', 'Refresher courses', 'Self-study through e-learning', 'Approved CPD programmes from accredited schools of architecture / ALSs'],
        notes: 'This is the strategic target for Architex: position assessments/courses so CPD Central, a VA, ALS or relevant accrediting authority can approve them as Category 1 where possible.',
      },
      {
        id: 'sacap_category_2_work_based_activities',
        label: 'Category 2 - Work-Based Activities',
        approvedCategory: 'category_2_work_based_activity',
        required: false,
        calculationMethod: 'body_specific_formula',
        examples: ['Architectural work', 'Full-time lecturing at an accredited ALS', 'Mentoring candidates'],
        notes: 'SACAP material indicates examples such as 400 hours = 1 credit for architectural work/lecturing and 50 hours = 1 credit for some mentoring routes, subject to limits.',
      },
      {
        id: 'sacap_category_3_individual_activities',
        label: 'Category 3 - Individual Activities',
        approvedCategory: 'category_3_individual_activity',
        required: false,
        calculationMethod: 'body_specific_formula',
        examples: ['Voluntary Association membership', 'Individual professional activities listed by SACAP'],
        notes: 'Often valuable supporting CPD, but not the main Architex platform target if the goal is Category 1 learning/assessment.',
      },
    ],
  },
  ECSA: {
    professionalBody: 'ECSA',
    status: 'researched_official',
    sourceSummary:
      'ECSA CPD is statutory for professional/specified categories, excluding candidate categories. Cycle is 5 years; minimum 25 credits per cycle; 1 credit = 10 notional hours; at least 5 credits per cycle must be from validated Category 1a educational/developmental activities; minimum 3 credits/year across any two of the three categories; no carry-over to next cycle. Category 1 activities must be validated under ECSA CPD Standard by verified CPD service providers/licensed bodies.',
    cycleYears: 5,
    cycleTotalTargetCredits: 25,
    category1CycleMinimumCredits: 5,
    categories: [
      {
        id: 'ecsa_category_1a_validated_developmental_activities',
        label: 'Category 1a - Validated Educational / Developmental Activities',
        approvedCategory: 'engineering_category_1_developmental_activity',
        required: true,
        calculationMethod: 'hours_to_credits',
        hoursPerCredit: 10,
        creditsPerHour: 0.1,
        cycleMinimumCredits: 5,
        examples: ['Validated engineering conferences', 'Congresses', 'Workshops', 'Lectures', 'Seminars', 'Courses', 'Colloquiums', 'Relevant HEI coursework'],
        notes: 'Highest-value Architex target for engineers. Store validation body, verified service provider, ECSA/licensed-body reference and proof of attendance.',
      },
      {
        id: 'ecsa_category_2_work_based_activities',
        label: 'Category 2 - Work-Based Activities',
        approvedCategory: 'engineering_category_2_work_based_activity',
        required: false,
        calculationMethod: 'body_specific_formula',
        annualMaximumCredits: 3,
        examples: ['Engineering work: 300 notional hours = 1 credit, max 2/year', 'Mentoring candidate engineering practitioners: 50 notional hours, max 1/year'],
      },
      {
        id: 'ecsa_category_3_individual_activities',
        label: 'Category 3 - Engineering Community / Individual Activities',
        approvedCategory: 'engineering_category_3_individual_activity',
        required: false,
        calculationMethod: 'body_specific_formula',
        examples: ['Recognised VA membership', 'Engineering community contributions', 'Publications', 'Presentations', 'Committee/task group participation', 'Programme/course development'],
      },
    ],
  },
  SACPLAN: {
    professionalBody: 'SACPLAN',
    status: 'researched_official',
    sourceSummary:
      'SACPLAN CPD Policy describes a 3-year cycle requiring 75 points, with Category A Professional Knowledge, Category B Mentorship and Category C Active Participation in the profession. In Table 1, non-credit-bearing planning-related courses/modules can earn 1 point per hour with a max of 5 points p.a. for that sub-area, while other activities have their own point rules.',
    cycleYears: 3,
    cycleTotalTargetCredits: 75,
    categories: [
      {
        id: 'sacplan_category_a_professional_knowledge',
        label: 'Category A - Professional Knowledge',
        approvedCategory: 'planning_category_a_professional_knowledge',
        required: true,
        calculationMethod: 'points_per_hour',
        creditsPerHour: 1,
        examples: ['Planning-related courses', 'Training programmes', 'Conference/reading/research outputs depending on focus area'],
        notes: 'Not the same numeric system as SACAP; use points, not architectural CPD credits, and store the body-specific unit label.',
      },
      {
        id: 'sacplan_category_b_mentorship',
        label: 'Category B - Mentorship',
        approvedCategory: 'planning_category_b_mentorship',
        required: false,
        calculationMethod: 'body_specific_formula',
        examples: ['Mentoring activities recognised by SACPLAN'],
      },
      {
        id: 'sacplan_category_c_active_participation',
        label: 'Category C - Active Participation in Profession',
        approvedCategory: 'planning_category_c_active_participation',
        required: false,
        calculationMethod: 'body_specific_formula',
        examples: ['Professional participation activities recognised by SACPLAN'],
      },
    ],
  },
  SACQSP: {
    professionalBody: 'SACQSP',
    status: 'researched_official',
    sourceSummary: 'SACQSP CPD is required for professional quantity surveyors. Official SACQSP policy uses CPD hours, not credits: 125 hours over a 5-year cycle, minimum 25 hours per annum, Category 1 minimum 10 hours/year, Category 2 maximum 15 hours/year, annual cycle 1 Jan-31 Dec with records due within 30 days. Candidates are generally exempt for first 5 years unless APC not completed. Annual Code of Professional Conduct online assessment has 72% pass mark.',
    cycleYears: 5,
    annualTotalTargetCredits: 25,
    cycleTotalTargetCredits: 125,
    categories: [
      {
        id: 'sacqsp_category_1',
        label: 'Category 1 - Structured / Validated Quantity Surveying CPD',
        approvedCategory: 'quantity_surveying_category_1',
        required: true,
        calculationMethod: 'partner_approved_value_only',
        annualMinimumCredits: 10,
        examples: ['Conferences', 'Congresses', 'Formal workshops', 'Lectures', 'Seminars', 'Distance-learning seminars', 'Formal tertiary studies', 'Peer-reviewed publications', 'Accredited papers/posters'],
        notes: 'Use hours as unit label in UI where possible. Recognised VAs such as ASAQS may validate activities; external bodies may need SACQSP CPD Committee approval.',
      },
      {
        id: 'sacqsp_category_2',
        label: 'Category 2 - Other Professional Development Activities',
        approvedCategory: 'quantity_surveying_category_2',
        required: false,
        calculationMethod: 'partner_approved_value_only',
        annualMaximumCredits: 15,
        examples: ['In-house skills training', 'Small-group discussions', 'Professional administration with built-environment presentations', 'Non-formally evaluated self-study', 'Teaching', 'Postgraduate supervision/evaluation'],
      },
    ],
  },
  SACLAP: {
    professionalBody: 'SACLAP',
    status: 'researched_official',
    sourceSummary: 'SACLAP CPD applies to landscape architectural professionals. 5-year cycle starting 1 April after registration; annual submissions due end March. Full professionals/senior technologists/technologists require 25 credits per 5-year cycle; technicians/technical assistants require 20. Minimum 3 prerequisite credits annually, including minimum 1 Category 1 credit annually. Category 1: 1 hour = 0.1 credits, with 10 hours = 1 credit. Six CPD categories are used.',
    cycleYears: 5,
    category1AnnualMinimumCredits: 1,
    categories: [
      { id: 'saclap_cat_1', label: 'Category 1 - Personal Professional Development', approvedCategory: 'landscape_category_1_personal_professional_development', required: true, calculationMethod: 'hours_to_credits', hoursPerCredit: 10, creditsPerHour: 0.1, annualMinimumCredits: 1, examples: ['Seminars', 'Workshops', 'Conferences', 'Colloquiums', 'Educational short courses', 'E-based activities'], notes: 'Core Architex target for landscape professionals; VA/SACLAP accreditation/endorsement required.' },
      { id: 'saclap_cat_2', label: 'Category 2 - Further Studies', approvedCategory: 'landscape_category_2_further_studies', required: false, calculationMethod: 'body_specific_formula', annualMaximumCredits: 2, examples: ['Postgraduate diplomas', 'Masters/doctoral studies', 'SACLAP/CHE/SAQA accredited e-based activities'] },
      { id: 'saclap_cat_3', label: 'Category 3 - Research and Publications', approvedCategory: 'landscape_category_3_research_publications', required: false, calculationMethod: 'body_specific_formula', annualMaximumCredits: 2, examples: ['Refereed/non-refereed conference and journal papers', 'Research reports', 'Books'] },
      { id: 'saclap_cat_4', label: 'Category 4 - Teaching and Training', approvedCategory: 'landscape_category_4_teaching_training', required: false, calculationMethod: 'body_specific_formula', annualMaximumCredits: 3, examples: ['Teaching/lecturing/training', 'Mentoring candidates', 'Work-integrated learning supervision'] },
      { id: 'saclap_cat_5', label: 'Category 5 - Professional Practice', approvedCategory: 'landscape_category_5_professional_practice', required: false, calculationMethod: 'body_specific_formula', annualMaximumCredits: 2, examples: ['Full-time engagement in landscape professional practice; 400 hours = 1 credit'] },
      { id: 'saclap_cat_6', label: 'Category 6 - Professional Administration and Community Engagement', approvedCategory: 'landscape_category_6_professional_community_engagement', required: false, calculationMethod: 'body_specific_formula', annualMaximumCredits: 2, examples: ['Council/association committee work', 'VA membership', 'Community engagement', 'Competition submissions'] },
    ],
  },
  SACPCMP: {
    professionalBody: 'SACPCMP',
    status: 'researched_official',
    sourceSummary: 'SACPCMP CPD is required for registered construction management/project management professionals, excluding candidates under the cited policy. Gazetted Board Notice 381 of 2022 is effective 1 Apr 2023 to 31 Mar 2028. Cycle is 3 financial years; total 300 CPD credits. Categories and totals: Professional Practice 100, Personal Development 50, Mentorship 100, PPPI 50, with year-by-year targets 50/25/50/25 in year 1, 30/15/30/15 in year 2, 20/10/20/10 in year 3.',
    cycleYears: 3,
    cycleTotalTargetCredits: 300,
    categories: [
      { id: 'sacpcmp_professional_practice', label: 'Professional Practice Credits', approvedCategory: 'sacpcmp_professional_practice', required: true, calculationMethod: 'partner_approved_value_only', cycleMinimumCredits: 100, examples: ['Professional practice activities recognised by SACPCMP'] },
      { id: 'sacpcmp_personal_development', label: 'Personal Development Credits', approvedCategory: 'sacpcmp_personal_development', required: true, calculationMethod: 'partner_approved_value_only', cycleMinimumCredits: 50, examples: ['Personal development activities recognised by SACPCMP'] },
      { id: 'sacpcmp_mentorship', label: 'Mentorship Credits', approvedCategory: 'sacpcmp_mentorship', required: true, calculationMethod: 'partner_approved_value_only', cycleMinimumCredits: 100, examples: ['Mentorship activities recognised by SACPCMP'] },
      { id: 'sacpcmp_pppi', label: 'PPPI Credits', approvedCategory: 'sacpcmp_pppi', required: true, calculationMethod: 'partner_approved_value_only', cycleMinimumCredits: 50, examples: ['Professional participation / practice improvement activities recognised by SACPCMP'] },
    ],
  },
  SAGC: {
    professionalBody: 'SAGC',
    status: 'researched_official',
    sourceSummary: 'SAGC CPD is compulsory for professional, technologist and technician geomatics categories, excluding candidates and some exempt categories. 5-year cycle starts 1 June after registration. Professionals/technologists require 20 credits per 5-year cycle and at least 3 credits/year in at least two categories; technicians require 13 credits/cycle and at least 2 credits/year. At least 5 credits per cycle must come from Category 1, and every practitioner must obtain at least 1 ethics-related credit per 5-year cycle. Category 1 uses 10 hours = 1 credit; approved providers include recognised VAs and accredited educational institutions.',
    cycleYears: 5,
    cycleTotalTargetCredits: 20,
    category1CycleMinimumCredits: 5,
    categories: [
      { id: 'sagc_cat_1', label: 'Category 1 - Developmental Activities', approvedCategory: 'geomatics_category_1_developmental_activity', required: true, calculationMethod: 'hours_to_credits', hoursPerCredit: 10, creditsPerHour: 0.1, cycleMinimumCredits: 5, annualMaximumCredits: 5, examples: ['Conferences', 'Seminars', 'Courses/refresher courses', 'Vendor training', 'Accredited educational institution activities'] },
      { id: 'sagc_cat_2', label: 'Category 2 - Work-Based Activities', approvedCategory: 'geomatics_category_2_work_based_activity', required: false, calculationMethod: 'body_specific_formula', annualMaximumCredits: 4, examples: ['Mentoring candidates: 40 contact hours = 1 credit, max 2/year', 'In-house lecturing/skills training: 10 hours = 1 credit, max 2/year', 'R&D/technology/knowledge sharing'] },
      { id: 'sagc_cat_3', label: 'Category 3 - Individual Activities', approvedCategory: 'geomatics_category_3_individual_activity', required: false, calculationMethod: 'body_specific_formula', annualMaximumCredits: 5, examples: ['Recognised VA membership', 'Lecturing', 'Moderator/external examiner work', 'Other individual professional activities'] },
    ],
  },
  SACPVP: {
    professionalBody: 'SACPVP',
    status: 'preliminary_needs_body_confirmation',
    sourceSummary: 'SACPVP official pages/notices confirm CPD compliance is mandatory for Professional Valuers, Professional Associated Valuers and SRPAs, and affects certificate validity: compliant professionals receive 5-year certificate validity, non-compliant may receive 1-year validity. Detailed current points/hours/categories/provider-accreditation rules were not found in official sources during this research, so Architex must use manual verification until official policy is supplied.',
    cycleYears: 5,
    categories: [
      { id: 'sacpvp_compliance_status', label: 'CPD Compliance Status / Certificate Validity', approvedCategory: 'valuation_compliance_status_only', required: true, calculationMethod: 'partner_approved_value_only', examples: ['Manual CPD compliance confirmation', 'SACPVP certificate validity evidence'], notes: 'Do not guess hours/categories. Track compliant/non-compliant, certificate validity and uploaded official evidence.' },
    ],
  },
  'Voluntary Association': {
    professionalBody: 'Voluntary Association',
    status: 'partner_confirmed_required',
    sourceSummary: 'Use the specific recognised VA/accrediting partner rules. Do not assume SACAP/SACPLAN/ECSA formulas unless that VA confirms the professional body, category and credit value.',
    categories: [],
  },
  Other: {
    professionalBody: 'Other',
    status: 'partner_confirmed_required',
    sourceSummary: 'Create a body-specific rule set before publishing or certifying CPD claims.',
    categories: [],
  },
};

export function getProfessionalBodyRuleSet(body: CPDProfessionalBody): CPDProfessionalBodyRuleSet {
  return ruleSets[body];
}

function creditUnitLabelFor(body: CPDProfessionalBody): 'credits' | 'points' | 'hours' {
  if (body === 'SACPLAN') return 'points';
  if (body === 'SACQSP') return 'hours';
  return 'credits';
}

export function calculateCPDCredits(input: CPDCreditCalculationInput): CPDCreditCalculation {
  const ruleSet = getProfessionalBodyRuleSet(input.professionalBody);
  const rule = ruleSet.categories.find((category) => category.approvedCategory === input.approvedCategory);

  if (!rule) {
    return {
      professionalBody: input.professionalBody,
      approvedCategory: input.approvedCategory,
      creditUnitLabel: creditUnitLabelFor(input.professionalBody),
      calculatedCredits: input.approvedCreditsOverride ?? 0,
      calculationConfidence: 'needs_partner_confirmation',
      notes: ['No body-specific rule exists yet for this category. Use partner/accreditor-confirmed credits only.'],
    };
  }

  if (input.approvedCreditsOverride !== undefined) {
    return {
      professionalBody: input.professionalBody,
      approvedCategory: input.approvedCategory,
      creditUnitLabel: creditUnitLabelFor(input.professionalBody),
      calculatedCredits: roundCredits(input.approvedCreditsOverride),
      calculationConfidence: ruleSet.status === 'researched_official' ? 'confirmed_from_accreditor' : 'needs_partner_confirmation',
      notes: ['Using accreditor/partner-approved credit value override.'],
    };
  }

  if (rule.calculationMethod === 'hours_to_credits' && rule.creditsPerHour !== undefined) {
    return {
      professionalBody: input.professionalBody,
      approvedCategory: input.approvedCategory,
      creditUnitLabel: 'credits',
      calculatedCredits: roundCredits(input.durationHours * rule.creditsPerHour),
      calculationConfidence: ruleSet.status === 'researched_official' ? 'rule_based_estimate' : 'needs_partner_confirmation',
      notes: [`Rule estimate: ${rule.creditsPerHour} credit per hour / ${rule.hoursPerCredit} hours per credit. Final certificate value must match the accreditor-approved value.`],
    };
  }

  if (rule.calculationMethod === 'points_per_hour' && rule.creditsPerHour !== undefined) {
    return {
      professionalBody: input.professionalBody,
      approvedCategory: input.approvedCategory,
      creditUnitLabel: 'points',
      calculatedCredits: roundCredits(input.durationHours * rule.creditsPerHour),
      calculationConfidence: ruleSet.status === 'researched_official' ? 'rule_based_estimate' : 'needs_partner_confirmation',
      notes: ['Rule estimate uses body-specific points per hour. Final value must match SACPLAN/accreditor approval.'],
    };
  }

  return {
    professionalBody: input.professionalBody,
    approvedCategory: input.approvedCategory,
    creditUnitLabel: creditUnitLabelFor(input.professionalBody),
    calculatedCredits: 0,
    calculationConfidence: 'needs_partner_confirmation',
    notes: ['Body-specific formula applies; store the accreditor-approved category and credit value rather than guessing.'],
  };
}

export function isCategoryOneStrategicTarget(category: CPDApprovedCategory): boolean {
  return [
    'category_1_developmental_activity',
    'engineering_category_1_developmental_activity',
    'quantity_surveying_category_1',
    'landscape_category_1_personal_professional_development',
    'geomatics_category_1_developmental_activity',
    'planning_category_a_professional_knowledge',
  ].includes(category);
}

export function getRuleSetResearchStatus(body: CPDProfessionalBody): CPDBodyRuleStatus {
  return getProfessionalBodyRuleSet(body).status;
}
