import type { ExtractedQuantityCandidate, TakeoffSource } from './types';

export const revitSource: TakeoffSource = {
  id: 'src-revit-001', sourceType: 'revit_bim_export', fileName: 'office-block-structural-schedule.ifc.json', documentRevisionId: 'doc-A101-rev2', projectRef: 'ATX-DEMO-05', uploadedBy: 'Contractor QS', receivedAt: new Date().toISOString(), extractionProvider: 'Architex BIM adapter port', notes: 'Structured BIM/Revit-derived export; production adapter can consume IFC/APS/Speckle/Revit add-in outputs.',
};

export const pdfSource: TakeoffSource = {
  id: 'src-pdf-001', sourceType: 'pdf_vector', fileName: 'A101-ground-floor-plan-rev2.pdf', documentRevisionId: 'doc-A101-rev2', projectRef: 'ATX-DEMO-05', uploadedBy: 'Architect', receivedAt: new Date().toISOString(), extractionProvider: 'Architex PDF drawing adapter port', notes: 'Vector PDF demo; production adapter must capture scale/calibration and page/zone locators.',
};

export const revitCandidates: ExtractedQuantityCandidate[] = [
  { id: 'q-revit-001', source: { sourceId: revitSource.id, level: 'Level 00', elementId: 'WALL-200-01' }, description: '200mm concrete block wall', material: 'Concrete block', tradePackage: 'masonry', unit: 'm2', quantity: 184.2, confidence: 0.93, status: 'extracted', assumptions: ['Wall area from BIM element net face area'] },
  { id: 'q-revit-002', source: { sourceId: revitSource.id, level: 'Level 00', elementId: 'SLAB-100-01' }, description: 'Ground floor concrete slab 100mm', material: 'Concrete 25MPa', tradePackage: 'concrete', unit: 'm3', quantity: 32.6, confidence: 0.91, status: 'extracted', assumptions: ['Volume from structured slab schedule'] },
  { id: 'q-revit-003', source: { sourceId: revitSource.id, level: 'Level 01', elementId: 'WINDOW-TYPE-A' }, description: 'Aluminium window Type A', material: 'Aluminium/glazing', tradePackage: 'doors-windows', unit: 'nr', quantity: 18, confidence: 0.86, status: 'extracted', assumptions: ['Window family count; glazing spec requires confirmation'] },
];

export const pdfCandidates: ExtractedQuantityCandidate[] = [
  { id: 'q-pdf-001', source: { sourceId: pdfSource.id, page: 1, zone: 'Grid A-C/1-4', drawingRef: 'A101' }, description: 'Internal paint to plastered walls', material: 'Paint system', tradePackage: 'finishes', unit: 'm2', quantity: 256.4, confidence: 0.74, status: 'extracted', assumptions: ['Wall lengths detected from vector drawing; height assumed 2.7m'] },
  { id: 'q-pdf-002', source: { sourceId: pdfSource.id, page: 1, zone: 'Rooms 01-04', drawingRef: 'A101' }, description: 'Ceramic floor tile', material: 'Floor tile', tradePackage: 'finishes', unit: 'm2', quantity: 118.9, confidence: 0.68, status: 'extracted', assumptions: ['Room labels detected; tile specification not found'] },
  { id: 'q-pdf-003', source: { sourceId: pdfSource.id, page: 1, zone: 'Door schedule callouts', drawingRef: 'A101' }, description: 'Timber internal door', material: 'Door leaf and ironmongery', tradePackage: 'doors-windows', unit: 'nr', quantity: 12, confidence: 0.82, status: 'extracted', assumptions: ['Door symbols counted from plan; schedule cross-check recommended'] },
];
