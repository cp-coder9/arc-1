/**
 * Unit tests for refuseReportService — PDF generation
 *
 * Requirements: 7.5, 7.6
 */

import { generateRefuseAreaPdf } from './refuseReportService';
import type { Refuse_Area_Result, Professional_Sign_Off_Record } from './types';

function createMockResult(): Refuse_Area_Result {
  return {
    id: 'test-result-001',
    computedAt: '2026-04-30T10:00:00Z',
    municipalityId: 'city-of-johannesburg',
    municipalityName: 'City of Johannesburg',
    profileLastUpdated: '30 Apr 2026',
    buildingType: 'residential',
    inputs: {
      type: 'residential',
      data: { unitCount: 24, averageOccupantsPerUnit: 4 },
    },
    area: {
      totalAreaSqm: 8.45,
      dimensions: { length: 3.0, width: 2.9, height: 2.4 },
      minimumApplied: false,
    },
    bins: {
      totalWasteVolumeLitres: 5760,
      generalWaste: {
        binCapacityLitres: 1100,
        binCount: 6,
        totalVolumeLitres: 6600,
        binLabel: '1100L Bulk Bin',
      },
      totalFloorSpaceSqm: 4.32,
    },
    vehicleAccess: {
      minimumRoadWidth: 6.0,
      turningCircleRadius: 12.5,
      maximumGradient: 8,
      maximumCarryDistance: 30,
      hardstandRequired: true,
      hardstandDimensions: { length: 12, width: 4 },
      missingFields: [],
    },
    ventilation: {
      type: 'natural',
      naturalOpeningArea: 0.5,
      mechanicalRate: null,
      missingFields: [],
    },
    drainage: {
      floorGradient: 1.5,
      drainDiameter: 110,
      washDownRequired: true,
      washDownType: 'hose_connection',
      washDownLocation: 'Adjacent to refuse room entrance',
      missingFields: [],
    },
    pestControl: 'Vermin-proof mesh on all openings. Self-closing doors required.',
    advisoryDisclaimer:
      'This output is advisory only. It does not constitute legal compliance certification. Results are derived from interpreted municipal guidelines and must be verified by a qualified professional against current local bylaws.',
  };
}

function createMockSignOff(): Professional_Sign_Off_Record {
  return {
    id: 'signoff-001',
    resultId: 'test-result-001',
    timestamp: '2026-04-30T10:05:00Z',
    uid: 'user-123',
    displayName: 'John Architect',
    platformRole: 'architect',
    acknowledgementStatement:
      'I acknowledge that this output is advisory only, I have reviewed the computed results, and professional verification against current local bylaws remains my responsibility.',
    projectId: 'project-abc',
  };
}

describe('generateRefuseAreaPdf', () => {
  it('should generate a valid PDF as Uint8Array', async () => {
    const result = createMockResult();
    const signOff = createMockSignOff();

    const pdfBytes = await generateRefuseAreaPdf(result, signOff);

    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(0);
  });

  it('should produce a PDF starting with the PDF header signature', async () => {
    const result = createMockResult();
    const signOff = createMockSignOff();

    const pdfBytes = await generateRefuseAreaPdf(result, signOff);

    // PDF files start with %PDF-
    const header = new TextDecoder().decode(pdfBytes.slice(0, 5));
    expect(header).toBe('%PDF-');
  });

  it('should handle results with minimum area applied', async () => {
    const result = createMockResult();
    result.area.minimumApplied = true;
    result.area.totalAreaSqm = 4.0;
    const signOff = createMockSignOff();

    const pdfBytes = await generateRefuseAreaPdf(result, signOff);

    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(0);
  });

  it('should handle results with recyclable waste stream', async () => {
    const result = createMockResult();
    result.bins.recyclableWaste = {
      binCapacityLitres: 240,
      binCount: 3,
      totalVolumeLitres: 720,
      binLabel: '240L Recyclable Bin',
    };
    const signOff = createMockSignOff();

    const pdfBytes = await generateRefuseAreaPdf(result, signOff);

    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(0);
  });

  it('should handle results with missing vehicle access fields', async () => {
    const result = createMockResult();
    result.vehicleAccess.minimumRoadWidth = null;
    result.vehicleAccess.turningCircleRadius = null;
    result.vehicleAccess.missingFields = ['minimumRoadWidth', 'turningCircleRadius'];
    const signOff = createMockSignOff();

    const pdfBytes = await generateRefuseAreaPdf(result, signOff);

    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(0);
  });

  it('should handle results with no pest control specified', async () => {
    const result = createMockResult();
    result.pestControl = null;
    const signOff = createMockSignOff();

    const pdfBytes = await generateRefuseAreaPdf(result, signOff);

    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(0);
  });

  it('should handle mixed-use results with component areas', async () => {
    const result = createMockResult();
    result.buildingType = 'mixed-use';
    result.area.componentAreas = [
      { type: 'residential', areaSqm: 5.2 },
      { type: 'commercial', areaSqm: 3.8 },
    ];
    const signOff = createMockSignOff();

    const pdfBytes = await generateRefuseAreaPdf(result, signOff);

    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(0);
  });

  it('should handle mechanical ventilation type', async () => {
    const result = createMockResult();
    result.ventilation.type = 'mechanical';
    result.ventilation.naturalOpeningArea = null;
    result.ventilation.mechanicalRate = 6;
    const signOff = createMockSignOff();

    const pdfBytes = await generateRefuseAreaPdf(result, signOff);

    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(0);
  });

  it('should handle null ventilation type', async () => {
    const result = createMockResult();
    result.ventilation.type = null;
    result.ventilation.naturalOpeningArea = null;
    result.ventilation.mechanicalRate = null;
    result.ventilation.missingFields = ['type', 'naturalOpeningArea', 'mechanicalRate'];
    const signOff = createMockSignOff();

    const pdfBytes = await generateRefuseAreaPdf(result, signOff);

    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(0);
  });

  it('should throw a descriptive error if generation fails', async () => {
    // Pass null as result to trigger an error in the generation process
    await expect(
      generateRefuseAreaPdf(null as unknown as Refuse_Area_Result, createMockSignOff())
    ).rejects.toThrow('PDF generation failed');
  });
});
