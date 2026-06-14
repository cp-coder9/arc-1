import type { ArchitexBuiltEnvironmentRole, CPDRoleBodyMapping } from './cpdTypes';

const roleMappings: Record<ArchitexBuiltEnvironmentRole, CPDRoleBodyMapping> = {
  architectural_professional: {
    role: 'architectural_professional',
    professionalBody: 'SACAP',
    registrationCategoryExamples: ['Professional Architect', 'Professional Senior Architectural Technologist', 'Professional Architectural Technologist', 'Professional Architectural Draughtsperson'],
    defaultApprovedCategory: 'category_1_developmental_activity',
    cpdRequired: true,
    workflowImplication: 'Use SACAP 5-year CPD cycle, Category 1/2/3 architecture credit rules and Category 1 developmental accreditation targeting.',
    confidence: 'researched_official',
  },
  structural_engineer: {
    role: 'structural_engineer',
    professionalBody: 'ECSA',
    registrationCategoryExamples: ['Professional Engineer', 'Professional Engineering Technologist', 'Professional Certificated Engineer', 'Professional Engineering Technician'],
    defaultApprovedCategory: 'engineering_category_1_developmental_activity',
    cpdRequired: true,
    workflowImplication: 'Use ECSA 5-year CPD cycle, 25-credit requirement, Category 1/2/3 engineering rules, validated Category 1a workflow, verified provider/licensed-body evidence.',
    confidence: 'researched_official',
  },
  civil_engineer: {
    role: 'civil_engineer',
    professionalBody: 'ECSA',
    registrationCategoryExamples: ['Professional Engineer', 'Professional Engineering Technologist', 'Professional Engineering Technician'],
    defaultApprovedCategory: 'engineering_category_1_developmental_activity',
    cpdRequired: true,
    workflowImplication: 'Use ECSA engineering CPD workflow and category distribution checks.',
    confidence: 'researched_official',
  },
  electrical_engineer: {
    role: 'electrical_engineer',
    professionalBody: 'ECSA',
    registrationCategoryExamples: ['Professional Engineer', 'Professional Engineering Technologist', 'Professional Engineering Technician'],
    defaultApprovedCategory: 'engineering_category_1_developmental_activity',
    cpdRequired: true,
    workflowImplication: 'Use ECSA engineering CPD workflow and category distribution checks.',
    confidence: 'researched_official',
  },
  mechanical_engineer: {
    role: 'mechanical_engineer',
    professionalBody: 'ECSA',
    registrationCategoryExamples: ['Professional Engineer', 'Professional Engineering Technologist', 'Professional Engineering Technician'],
    defaultApprovedCategory: 'engineering_category_1_developmental_activity',
    cpdRequired: true,
    workflowImplication: 'Use ECSA engineering CPD workflow and category distribution checks.',
    confidence: 'researched_official',
  },
  quantity_surveyor: {
    role: 'quantity_surveyor',
    professionalBody: 'SACQSP',
    registrationCategoryExamples: ['Professional Quantity Surveyor', 'Candidate Quantity Surveyor'],
    defaultApprovedCategory: 'quantity_surveying_category_1',
    cpdRequired: true,
    workflowImplication: 'Use SACQSP CPD hours model: 125 hours over 5 years, 25 hours/year, Category 1 minimum and Category 2 maximum, plus evidence uploads and Code of Conduct assessment tracking.',
    confidence: 'researched_official',
  },
  construction_project_manager: {
    role: 'construction_project_manager',
    professionalBody: 'SACPCMP',
    registrationCategoryExamples: ['Professional Construction Project Manager', 'Professional Construction Manager', 'Candidate Construction Project Manager'],
    defaultApprovedCategory: 'sacpcmp_professional_practice',
    cpdRequired: true,
    workflowImplication: 'Use SACPCMP 3-financial-year cycle, 300-credit four-category model, year-by-year category targets and provider/activity validation workflow.',
    confidence: 'researched_official',
  },
  construction_manager: {
    role: 'construction_manager',
    professionalBody: 'SACPCMP',
    registrationCategoryExamples: ['Professional Construction Manager', 'Candidate Construction Manager'],
    defaultApprovedCategory: 'sacpcmp_professional_practice',
    cpdRequired: true,
    workflowImplication: 'Use SACPCMP 3-financial-year cycle and four-category construction management CPD model.',
    confidence: 'researched_official',
  },
  professional_planner: {
    role: 'professional_planner',
    professionalBody: 'SACPLAN',
    registrationCategoryExamples: ['Professional Planner', 'Technical Planner'],
    defaultApprovedCategory: 'planning_category_a_professional_knowledge',
    cpdRequired: true,
    workflowImplication: 'Use SACPLAN 3-year, 75-point model with Category A/B/C planning CPD structure; store points rather than credits.',
    confidence: 'researched_official',
  },
  landscape_architectural_professional: {
    role: 'landscape_architectural_professional',
    professionalBody: 'SACLAP',
    registrationCategoryExamples: ['Landscape Architect', 'Landscape Technologist', 'Landscape Technician', 'Landscape Technical Assistant', 'Landscape Manager'],
    defaultApprovedCategory: 'landscape_category_1_personal_professional_development',
    cpdRequired: true,
    workflowImplication: 'Use SACLAP 5-year cycle, annual prerequisite credits, Category 1-6 landscape CPD structure and VA/SACLAP accreditation workflow.',
    confidence: 'researched_official',
  },
  geomatics_practitioner: {
    role: 'geomatics_practitioner',
    professionalBody: 'SAGC',
    registrationCategoryExamples: ['Professional Geomatics Practitioner', 'Geomatics Technologist', 'Geomatics Technician'],
    defaultApprovedCategory: 'geomatics_category_1_developmental_activity',
    cpdRequired: true,
    workflowImplication: 'Use SAGC 5-year cycle, 20 credits for professionals/technologists or 13 for technicians, Category 1-3 geomatics structure and ethics-credit requirement.',
    confidence: 'researched_official',
  },
  property_valuer: {
    role: 'property_valuer',
    professionalBody: 'SACPVP',
    registrationCategoryExamples: ['Professional Valuer', 'Professional Associated Valuer', 'Single Residential Property Assessor'],
    defaultApprovedCategory: 'valuation_compliance_status_only',
    cpdRequired: true,
    workflowImplication: 'SACPVP confirms CPD compliance is mandatory and affects 5-year vs 1-year certificate validity, but exact points/categories were not found; use manual verification until official rules are obtained.',
    confidence: 'preliminary_needs_body_confirmation',
  },
  other_built_environment_professional: {
    role: 'other_built_environment_professional',
    professionalBody: 'Other',
    registrationCategoryExamples: [],
    defaultApprovedCategory: 'body_specific_category_to_be_confirmed',
    cpdRequired: false,
    workflowImplication: 'Require manual selection and rule-profile setup before CPD claims are issued.',
    confidence: 'manual_confirmation_required',
  },
};

export function getRoleBodyMapping(role: ArchitexBuiltEnvironmentRole): CPDRoleBodyMapping {
  return roleMappings[role];
}

export function listRoleBodyMappings(): CPDRoleBodyMapping[] {
  return Object.values(roleMappings);
}
