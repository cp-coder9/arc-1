import { listCalculatorsForContext } from './toolboxCalculatorService';
import type { CalculatorRun, ToolboxAgentRecommendation, ToolboxContext } from '../types/toolboxCalculators';

export function recommendToolboxCalculators(
  context: ToolboxContext,
  prompt: string,
): ToolboxAgentRecommendation[] {
  const text = prompt.toLowerCase();
  const available = listCalculatorsForContext(context);
  const recommendations: ToolboxAgentRecommendation[] = [];

  const push = (
    message: string,
    ids: string[],
    severity: ToolboxAgentRecommendation['severity'] = 'info',
  ) => {
    const allowed = ids.filter((id) => available.some((calculator) => calculator.id === id));
    if (allowed.length)
      recommendations.push({ agentId: 'toolbox_router_agent', message, severity, suggestedCalculatorIds: allowed });
  };

  if (/xa|energy|glazing|fenestration|u-value|shgc|insulation|r-value/.test(text)) {
    push(
      'Use the XA calculator set and keep the output as compliance support pending competent-person review.',
      ['xa_fenestration_quick_check', 'xa_rvalue_check'],
    );
  }
  if (/storm|runoff|drain|catchment|rain|attenuation/.test(text)) {
    push(
      'Use stormwater calculators and confirm municipal rainfall/intensity assumptions.',
      ['rational_method_runoff'],
    );
  }
  if (/pipe|manning|flow|invert|gradient/.test(text)) {
    push(
      'Use pipe flow or gradient calculators for civil drainage checks.',
      ['manning_pipe_flow', 'pipe_gradient_invert'],
    );
  }
  if (/voltage|cable|electrical|wire|conductor/.test(text)) {
    push(
      'Use voltage drop calculator and confirm SANS 10142 compliance limits.',
      ['voltage_drop'],
    );
  }
  if (/duct|airflow|hvac|ventilation|air.change/.test(text)) {
    push(
      'Use duct sizing or ventilation calculator for mechanical services.',
      ['duct_sizing', 'ventilation_air_change'],
    );
  }
  if (/water|fixture|plumbing|demand|wet/.test(text)) {
    push(
      'Use fixture unit water demand calculator for plumbing services.',
      ['fixture_unit_water_demand'],
    );
  }
  if (/occupant|escape|exit|fire|life.safety/.test(text)) {
    push(
      'Use occupant load calculator for fire/life safety compliance.',
      ['occupant_load'],
    );
  }
  if (/concrete|pour|slab|footing|cube|ready.?mix/.test(text)) {
    push(
      'Use contractor concrete quantity/order calculator and export to supplier RFQ or site log.',
      ['concrete_order'],
    );
  }
  if (/brick|block|masonry|wall/.test(text)) {
    push(
      'Use masonry calculator for order quantities and subcontractor package quantities.',
      ['brick_blockwork'],
    );
  }
  if (/paint|coat|spread/.test(text)) {
    push(
      'Use paint coverage calculator for finishing quantities.',
      ['paint_coverage'],
    );
  }
  if (/rate|tender|bid|boq|price|quote|variation/.test(text)) {
    push(
      'Use tender rate build-up calculator and lock assumptions when submitting bid/variation.',
      ['tender_rate_buildup'],
    );
  }
  if (/labour|crew|productivity|duration|programme|program/.test(text)) {
    push(
      'Use labour/productivity calculator and compare against site log actuals.',
      ['labour_productivity'],
    );
  }

  if (!recommendations.length) {
    recommendations.push({
      agentId: 'toolbox_router_agent',
      message:
        'No exact calculator detected. Show the role-specific toolbox and ask for dimensions, trade, source drawing and intended export target.',
      severity: 'info',
      suggestedCalculatorIds: available.slice(0, 5).map((item) => item.id),
    });
  }

  return recommendations;
}

export function reviewCalculatorRun(run: CalculatorRun): ToolboxAgentRecommendation[] {
  const notes: ToolboxAgentRecommendation[] = [];
  if (run.professionalSignoffRequired) {
    notes.push({
      agentId: 'compliance_caution_agent',
      message:
        'This result requires competent professional review/sign-off before being used for statutory, engineering or final design purposes.',
      severity: 'warning',
      suggestedExportTargets: ['rfi', 'bim_coordination_comment', 'compliance_report'],
    });
  }
  if (run.riskStatus === 'fail') {
    notes.push({
      agentId: 'input_completion_agent',
      message:
        'Calculator returned a fail/risk result. Create an RFI or consultant query before relying on this assumption downstream.',
      severity: 'blocker',
      suggestedExportTargets: ['rfi'],
    });
  }
  if (run.exportTargets.includes('site_log')) {
    notes.push({
      agentId: 'site_agent',
      message:
        'If this result is used on site, compare planned quantity/productivity with delivery tickets and daily site logs.',
      severity: 'info',
      suggestedExportTargets: ['site_log', 'payment_valuation'],
    });
  }
  if (run.exportTargets.includes('tender_boq') || run.exportTargets.includes('bid_line_item')) {
    notes.push({
      agentId: 'tender_agent',
      message:
        'Lock source drawings, revision, assumptions and rate build-up when exporting to tender/bid workflows.',
      severity: 'info',
      suggestedExportTargets: ['tender_boq', 'bid_line_item'],
    });
  }
  return notes;
}
