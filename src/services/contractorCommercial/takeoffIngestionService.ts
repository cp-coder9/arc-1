import type { ExtractedQuantityCandidate, TakeoffSource } from './types';
import { pdfCandidates, pdfSource, revitCandidates, revitSource } from './sampleData';

export class TakeoffIngestionService {
  ingestDemoSources(): TakeoffSource[] { return [revitSource, pdfSource]; }

  extract(source: TakeoffSource): ExtractedQuantityCandidate[] {
    if (source.sourceType === 'revit_bim_export' || source.sourceType === 'ifc_model') return revitCandidates.map((c) => ({ ...c }));
    if (source.sourceType === 'pdf_vector' || source.sourceType === 'pdf_raster_scan') return pdfCandidates.map((c) => ({ ...c, confidence: source.sourceType === 'pdf_raster_scan' ? Math.min(c.confidence, 0.55) : c.confidence }));
    return [];
  }
}
