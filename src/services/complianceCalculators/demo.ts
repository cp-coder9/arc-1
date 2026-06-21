import { FenestrationXaService } from './fenestrationXaService';
import { RValueAssemblyService } from './rValueAssemblyService';
import { SansFormsRegistry } from './sansFormsRegistry';
import { DrawingCompliancePrecheckService } from './drawingCompliancePrecheckService';
import { ComplianceReportService } from './complianceReportService';
import { toInboxTasks, toMunicipalReadiness, toProjectRecord } from './adapters';

export function runDemo() {
  const project = { projectName: 'Architex Demo House', reference: 'XA-001', climateZone: 4, buildingType: 'residential' as const, storeys: 2, floorArea: 220 };
  const fen = new FenestrationXaService().evaluate(project, [
    { id: 'W-01', storey: 1, room: 'Living', orientation: 'N' as const, frameType: 'thermal' as const, glassArea: 8.4, wallArea: 60, uValue: 2.1, shgc: 0.45, shadingFactor: 0.35, description: 'north sliding doors' },
    { id: 'W-02', storey: 1, room: 'Kitchen', orientation: 'W' as const, frameType: 'alu' as const, glassArea: 6.2, wallArea: 28, uValue: 3.6, shgc: 0.55, shadingFactor: 0.1, description: 'west kitchen window' },
    { id: 'W-03', storey: 2, room: 'Bedroom', orientation: 'S' as const, frameType: 'timber' as const, glassArea: 2.5, wallArea: 24, uValue: 2.8, shgc: 0.5, shadingFactor: 0, description: 'south bedroom window' },
  ]);
  const rval = new RValueAssemblyService().evaluate(project, [
    { id: 'R-01', type: 'roof' as const, climateZone: 4, area: 110, description: 'tile roof with ceiling and glasswool', layers: [{ material: 'roof-tile', thicknessMm: 12 }, { material: 'air-cavity', thicknessMm: 40 }, { material: 'glasswool', thicknessMm: 145 }, { material: 'ceiling-board', thicknessMm: 9 }] },
    { id: 'WALL-01', type: 'wall' as const, climateZone: 4, area: 180, description: 'plastered brick wall no insulation', layers: [{ material: 'plaster', thicknessMm: 15 }, { material: 'brick', thicknessMm: 220 }, { material: 'plaster', thicknessMm: 15 }] },
  ]);
  const forms = new SansFormsRegistry().build({ project, occupancyClass: 'H4', includesCompetentPersons: true, parts: ['A', 'XA', 'T', 'S'] });
  const drawing = new DrawingCompliancePrecheckService().evaluate([
    { number: 'A100', title: 'Site Plan', scale: '1:200', revision: 'A', hasNorthPoint: true, hasProfessionalBlock: true, hasDimensions: true, hasRoomLabels: false, referencedSheets: ['A101'], textExtract: 'NBR SANS 10400 notes and zoning schedule' },
    { number: 'A101', title: 'Floor Plan', scale: '1:100', revision: 'A', hasProfessionalBlock: false, hasDimensions: true, hasRoomLabels: true, referencedSheets: ['A300'], textExtract: 'floor areas and room names' },
  ]);
  const consolidated = new ComplianceReportService().consolidate(project, [
    fen,
    rval,
    { ...forms, title: 'SANS Forms Checklist', sourceVersion: 'forms-registry-v0.1', id: 'forms-demo', results: [forms], createdAt: new Date().toISOString(), auditHash: 'demo', summary: [`${forms.forms.length} forms/checklists selected`, `${forms.requiredEvidence.length} evidence items required`], actionCards: forms.warnings },
    { ...drawing, title: 'Drawing Pre-check', sourceVersion: 'drawing-precheck-v0.1', id: 'drawing-demo', results: [drawing], createdAt: new Date().toISOString(), auditHash: 'demo', project, summary: [`${drawing.sheets.length} sheets checked`], actionCards: drawing.actionCards },
  ]);

  return {
    fenestrationVerdict: fen.verdict,
    fenestrationActions: fen.actionCards.length,
    rValueVerdict: rval.verdict,
    formsSelected: forms.forms.length,
    drawingVerdict: drawing.verdict,
    consolidatedVerdict: consolidated.verdict,
    totalActions: consolidated.actionCards.length,
    projectRecord: toProjectRecord(consolidated),
    inboxTasks: toInboxTasks(consolidated).length,
    municipalReadiness: toMunicipalReadiness(consolidated),
  };
}
