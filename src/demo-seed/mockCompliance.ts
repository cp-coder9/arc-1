import type { MockProject } from './mockProjects';

export interface MockComplianceCheck {
  id: string;
  projectId: string;
  submissionRef: string;
  checkType: 'fenestration' | 'wall_thickness' | 'fire_safety' | 'ventilation' | 'ceiling_height' | 'accessibility' | 'structure' | 'energy';
  ruleSet: string;
  findings: MockFinding[];
  overallStatus: 'pass' | 'warn' | 'fail';
  reviewedBy: string;
  reviewedAt: string;
}

export interface MockFinding {
  title: string;
  description: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  status: 'pass' | 'warn' | 'fail';
  responsibleParty: string;
}

function randFindings(statusBase: 'pass' | 'warn' | 'fail', count: number): MockFinding[] {
  const sevs: Array<'info' | 'low' | 'medium' | 'high' | 'critical'> = ['info', 'low', 'medium', 'high', 'critical'];
  const checks = ['SANS 10400-N', 'SANS 10400-K', 'SANS 10400-T', 'SANS 10400-C', 'SANS 10400-D', 'SANS 10400-XA', 'SANS 10160', 'SANS 10100'];
  const parties = ['architect', 'structural_engineer', 'fire_engineer', 'electrical_engineer', 'mechanical_engineer', 'energy_professional'];
  const findDescriptions = [
    'Glazing percentage below minimum 10% for habitable rooms',
    'Window opening area does not meet 5% ventilation requirement',
    'Fire door width insufficient for occupancy load',
    'Ceiling height below 2.4m minimum',
    'Wall thickness does not meet SANS 10400-K minimum',
    'U-value exceeds SANS 10400-XA zone limit for fenestration',
    'SHGC exceeds orientation-specific limit',
    'Structural beam span exceeds code limit without deflection check',
    'Accessibility route gradient exceeds 1:12',
    'Fire escape travel distance exceeds 45m limit',
  ];

  return Array.from({ length: count }, (_, i) => {
    const isFail = statusBase === 'fail' && i === 0;
    const isWarn = statusBase === 'warn' && i < 2;
    return {
      title: findDescriptions[i % findDescriptions.length],
      description: `Detailed check reveals ${isFail ? 'non-compliance' : isWarn ? 'potential issue' : 'compliance'} with ${checks[i % checks.length]}. ${isFail ? 'Requires professional sign-off.' : isWarn ? 'Recommended review before submission.' : 'Meets deemed-to-satisfy requirements.'}`,
      severity: isFail ? 'high' : isWarn ? 'medium' : 'low',
      status: isFail ? 'fail' : isWarn ? 'warn' : 'pass',
      responsibleParty: parties[i % parties.length],
    };
  });
}

export function getComplianceForProject(project: MockProject): MockComplianceCheck[] {
  const checks: MockComplianceCheck[] = [];

  const stages = ['concept_design', 'design_development', 'tender_documentation'];
  const startIdx = stages.indexOf(project.stage);
  const visibleStages = startIdx < 0 ? [] : stages.slice(0, startIdx + 1);
  if (visibleStages.length === 0) return [];

  let checkIdx = 0;

  // Concept: basic compliance scan
  if (visibleStages.includes('concept_design')) {
    checkIdx++;
    checks.push({
      id: `comp_${project.id}_${String(checkIdx).padStart(3, '0')}`,
      projectId: project.id,
      submissionRef: `Concept Design — v${checkIdx}`,
      checkType: 'fenestration',
      ruleSet: 'SANS 10400-XA',
      findings: randFindings(
        project.stage === 'concept_design' ? 'warn' : 'pass',
        4
      ),
      overallStatus: project.stage === 'concept_design' ? 'warn' : 'pass',
      reviewedBy: 'demo_bep_01',
      reviewedAt: new Date(new Date(project.createdAt).getTime() + 5 * 86400000).toISOString(),
    });
  }

  // Design development: full compliance
  if (visibleStages.includes('design_development')) {
    checkIdx++;
    const status = project.stage === 'design_development' ?
      (project.id === 'project_fourways_01' ? 'warn' : 'pass') :
      'pass';
    checks.push({
      id: `comp_${project.id}_${String(checkIdx).padStart(3, '0')}`,
      projectId: project.id,
      submissionRef: `Design Development — v${checkIdx}`,
      checkType: 'energy',
      ruleSet: 'SANS 10400-XA',
      findings: randFindings(status as 'pass' | 'warn', 6),
      overallStatus: status as 'pass' | 'warn' | 'fail',
      reviewedBy: 'demo_bep_01',
      reviewedAt: new Date(new Date(project.createdAt).getTime() + 12 * 86400000).toISOString(),
    });

    checkIdx++;
    checks.push({
      id: `comp_${project.id}_${String(checkIdx).padStart(3, '0')}`,
      projectId: project.id,
      submissionRef: `Engineering Coordination — v${checkIdx}`,
      checkType: 'structure',
      ruleSet: 'SANS 10160',
      findings: randFindings('pass', 5),
      overallStatus: 'pass',
      reviewedBy: 'demo_engineer_struct_01',
      reviewedAt: new Date(new Date(project.createdAt).getTime() + 15 * 86400000).toISOString(),
    });
  }

  // Tender stage: final compliance
  if (visibleStages.includes('tender_documentation')) {
    checkIdx++;
    checks.push({
      id: `comp_${project.id}_${String(checkIdx).padStart(3, '0')}`,
      projectId: project.id,
      submissionRef: `Final Compliance Check — v${checkIdx}`,
      checkType: 'fire_safety',
      ruleSet: 'SANS 10400-T',
      findings: randFindings(project.stage === 'tender_documentation' ? 'warn' : 'pass', 8),
      overallStatus: project.stage === 'tender_documentation' ? 'warn' : 'pass',
      reviewedBy: 'demo_engineer_fire_01',
      reviewedAt: new Date(new Date(project.createdAt).getTime() + 22 * 86400000).toISOString(),
    });
  }

  return checks;
}
