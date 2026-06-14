// @ts-nocheck
import type { SubmissionStatus, SubmissionIndexItem } from '@/types';
import type { MockProject, ProjectStage } from './mockProjects';

export interface MockSubmission {
  id: string;
  projectId: string;
  title: string;
  description: string;
  stage: ProjectStage;
  status: SubmissionStatus;
  submittedBy: string;
  submittedAt: string;
  drawings: SubmissionIndexItem[];
  reviewedBy?: string;
  reviewedAt?: string;
  findingsCount: number;
  passCount: number;
  failCount: number;
  version: number;
}

const MOCK_DRAWINGS_BY_STAGE: Record<string, SubmissionIndexItem[]> = {
  concept_design: [
    { name: 'A-001_Site_Plan.pdf', url: '#', detectedType: 'Site Plan' },
    { name: 'A-002_Ground_Floor.pdf', url: '#', detectedType: 'Floor Plan' },
    { name: 'A-003_First_Floor.pdf', url: '#', detectedType: 'Floor Plan' },
    { name: 'A-004_Roof_Plan.pdf', url: '#', detectedType: 'Roof Plan' },
    { name: 'A-100_South_Elevation.pdf', url: '#', detectedType: 'Elevation' },
    { name: 'A-101_East_Elevation.pdf', url: '#', detectedType: 'Elevation' },
    { name: 'A-102_North_Elevation.pdf', url: '#', detectedType: 'Elevation' },
    { name: 'A-103_West_Elevation.pdf', url: '#', detectedType: 'Elevation' },
    { name: 'A-200_Section_AA.pdf', url: '#', detectedType: 'Section' },
    { name: 'A-201_Section_BB.pdf', url: '#', detectedType: 'Section' },
    { name: 'SANS10400-XA_Fenestration_Calc.pdf', url: '#', detectedType: 'Compliance Report' },
  ],
  design_development: [
    { name: 'A-001_Site_Plan_RevB.pdf', url: '#', detectedType: 'Site Plan' },
    { name: 'A-002_Ground_Floor_RevB.pdf', url: '#', detectedType: 'Floor Plan' },
    { name: 'A-003_First_Floor_RevB.pdf', url: '#', detectedType: 'Floor Plan' },
    { name: 'A-004_Roof_Plan_RevB.pdf', url: '#', detectedType: 'Roof Plan' },
    { name: 'A-100_Elevations_RevB.pdf', url: '#', detectedType: 'Elevation' },
    { name: 'A-200_Sections_RevB.pdf', url: '#', detectedType: 'Section' },
    { name: 'A-300_Reflected_Ceiling.pdf', url: '#', detectedType: 'Reflected Ceiling Plan' },
    { name: 'A-301_Floor_Finishes_Schedule.pdf', url: '#', detectedType: 'Schedule' },
    { name: 'A-400_Door_Window_Schedule.pdf', url: '#', detectedType: 'Schedule' },
    { name: 'S-001_Structural_Layout.pdf', url: '#', detectedType: 'Structural Drawing' },
    { name: 'S-002_Foundation_Plan.pdf', url: '#', detectedType: 'Foundation Plan' },
    { name: 'E-001_Electrical_Layout.pdf', url: '#', detectedType: 'Electrical Drawing' },
    { name: 'M-001_Mech_Ventilation.pdf', url: '#', detectedType: 'Mechanical Drawing' },
    { name: 'F-001_Fire_Plan.pdf', url: '#', detectedType: 'Fire Plan' },
    { name: 'SANS10400-XA_Fenestration_Calc_RevB.pdf', url: '#', detectedType: 'Compliance Report' },
    { name: 'SANS10400-XA_Energy_Model.pdf', url: '#', detectedType: 'Compliance Report' },
  ],
  tender_documentation: [
    { name: 'A-000_Cover_Drawing.pdf', url: '#', detectedType: 'Cover Sheet' },
    { name: 'A-001_Site_Plan_RevC.pdf', url: '#', detectedType: 'Site Plan' },
    { name: 'A-002_Ground_Floor_RevC.pdf', url: '#', detectedType: 'Floor Plan' },
    { name: 'A-003_First_Floor_RevC.pdf', url: '#', detectedType: 'Floor Plan' },
    { name: 'A-100_Elevations_RevC.pdf', url: '#', detectedType: 'Elevation' },
    { name: 'A-200_Sections_RevC.pdf', url: '#', detectedType: 'Section' },
    { name: 'A-500_Joinery_Details.pdf', url: '#', detectedType: 'Detail Drawing' },
    { name: 'A-501_Staircase_Details.pdf', url: '#', detectedType: 'Detail Drawing' },
    { name: 'A-600_Kitchen_Bathroom_Details.pdf', url: '#', detectedType: 'Detail Drawing' },
    { name: 'S-001_Structural_RevC.pdf', url: '#', detectedType: 'Structural Drawing' },
    { name: 'S-002_Foundation_RevC.pdf', url: '#', detectedType: 'Foundation Plan' },
    { name: 'S-003_Roof_Steelwork.pdf', url: '#', detectedType: 'Structural Drawing' },
    { name: 'E-001_Electrical_RevC.pdf', url: '#', detectedType: 'Electrical Drawing' },
    { name: 'M-001_Mech_RevC.pdf', url: '#', detectedType: 'Mechanical Drawing' },
    { name: 'M-002_Wet_Services.pdf', url: '#', detectedType: 'Wet Services' },
    { name: 'F-001_Fire_RevC.pdf', url: '#', detectedType: 'Fire Plan' },
    { name: 'C-001_Civil_Drainage.pdf', url: '#', detectedType: 'Civil Drawing' },
    { name: 'BOQ_Architectural_Works.pdf', url: '#', detectedType: 'Bill of Quantities' },
    { name: 'BOQ_Structural_Works.pdf', url: '#', detectedType: 'Bill of Quantities' },
    { name: 'BOQ_Electrical_Works.pdf', url: '#', detectedType: 'Bill of Quantities' },
    { name: 'BOQ_Mechanical_Works.pdf', url: '#', detectedType: 'Bill of Quantities' },
    { name: 'NBR_Form_01_Application.pdf', url: '#', detectedType: 'NBR Form' },
    { name: 'NBR_Form_02_Affidavit.pdf', url: '#', detectedType: 'NBR Form' },
    { name: 'SANS10400-XA_Final_Compliance.pdf', url: '#', detectedType: 'Compliance Report' },
  ],
  construction: [
    { name: 'A-001_Issued_For_Construction.pdf', url: '#', detectedType: 'IFC Drawing' },
    { name: 'A-002_IFC_Ground_Floor.pdf', url: '#', detectedType: 'IFC Drawing' },
    { name: 'A-003_IFC_First_Floor.pdf', url: '#', detectedType: 'IFC Drawing' },
    { name: 'RFI_001_Window_Opening.pdf', url: '#', detectedType: 'RFI' },
    { name: 'RFI_002_Steel_Beam_Connection.pdf', url: '#', detectedType: 'RFI' },
    { name: 'VO_001_Additional_Outlet.pdf', url: '#', detectedType: 'Variation Order' },
    { name: 'Site_Instruction_001.pdf', url: '#', detectedType: 'Site Instruction' },
    { name: 'Progress_Photo_We ek_12.pdf', url: '#', detectedType: 'Progress Photo' },
  ],
  close_out: [
    { name: 'A-001_As_Built.pdf', url: '#', detectedType: 'As-Built Drawing' },
    { name: 'A-002_As_Built_Floor_Plan.pdf', url: '#', detectedType: 'As-Built Drawing' },
    { name: 'COC_Foundation.pdf', url: '#', detectedType: 'Certificate of Compliance' },
    { name: 'COC_Electrical.pdf', url: '#', detectedType: 'Electrical COC' },
    { name: 'COC_Fire.pdf', url: '#', detectedType: 'Fire COC' },
    { name: 'COC_Waterproofing.pdf', url: '#', detectedType: 'Certificate of Compliance' },
    { name: 'Occupancy_Certificate.pdf', url: '#', detectedType: 'Occupancy Certificate' },
    { name: 'Snagging_List_Final.pdf', url: '#', detectedType: 'Snagging List' },
    { name: 'Handover_Checklist.pdf', url: '#', detectedType: 'Handover Document' },
    { name: 'OandM_Manuals.pdf', url: '#', detectedType: 'O&M Manual' },
  ],
};

const SUBMISSION_NAMES: Record<string, string[]> = {
  concept_design: ['Concept Design Submission', 'Revised Concept Sketch'],
  design_development: ['Design Development Stage', 'Design Development Rev B', 'Design Development Rev C'],
  tender_documentation: ['Tender Documentation Pack', 'Tender Addendum 1'],
  construction: ['Construction Issue', 'Site Instruction Response', 'Variation Order Submission'],
  close_out: ['As-Built Drawings & COCs', 'Practical Completion Submission'],
};

export function getSubmissionsForProject(project: MockProject): MockSubmission[] {
  const subs: MockSubmission[] = [];

  const allStages = ['brief_enquiry', 'concept_design', 'design_development', 'tender_documentation', 'construction', 'close_out'];

  let subIndex = 0;
  const maxVersion = allStages.indexOf(project.stage);

  for (let i = 0; i <= maxVersion; i++) {
    const stage = allStages[i] as ProjectStage;
    const names = SUBMISSION_NAMES[stage] || [`${stage.replace(/_/g, ' ')} Submission`];
    const drawings = MOCK_DRAWINGS_BY_STAGE[stage] || [];

    const status: SubmissionStatus = i < maxVersion ? 'ai_passed' : i === maxVersion ? 'ai_reviewing' : 'ai_passed';

    const findings = Math.floor(Math.random() * 6) + 1;
    const pass = Math.floor(findings * (0.6 + Math.random() * 0.3));
    const fail = findings - pass;

    names.forEach((name, nameIdx) => {
      subIndex++;
      subs.push({
        id: `sub_${project.id}_${String(subIndex).padStart(3, '0')}`,
        projectId: project.id,
        title: name,
        description: `${name} for ${project.title}`,
        stage,
        status: nameIdx === 0 ? status : 'ai_passed',
        submittedBy: project.assignedArchitect || 'demo_architect_01',
        submittedAt: new Date(
          new Date(project.createdAt).getTime() + subIndex * 7 * 86400000
        ).toISOString(),
        drawings: drawings.slice(0, Math.min(drawings.length, nameIdx === 0 ? drawings.length : 5)),
        reviewedBy: i < maxVersion ? 'demo_admin_01' : undefined,
        reviewedAt: i < maxVersion
          ? new Date(new Date(project.createdAt).getTime() + (subIndex * 7 + 2) * 86400000).toISOString()
          : undefined,
        findingsCount: findings,
        passCount: pass,
        failCount: fail,
        version: subIndex,
      });
    });
  }

  return subs;
}
