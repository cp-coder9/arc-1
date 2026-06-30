// XA Assessment Factory
//
// Creates blank and sample assessments for new projects and demo mode.

import { XaDrawingIntelligenceService } from './xaDrawingIntelligence';
import type { XaAssessment, ClimateZone, StoreyDefinition } from './types';

const AI = XaDrawingIntelligenceService;

/** Create a blank assessment for a new project or standalone use */
export function createBlankAssessment(projectId: string | null, projectName: string, userId: string): XaAssessment {
  return {
    id: `xa-${Date.now()}`,
    projectId,
    projectName,
    revision: 'P01',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: userId,
    basics: {
      city: AI.createManualField('', userId),
      climateZone: AI.createManualField(5 as ClimateZone, userId),
      occupancyClass: AI.createManualField('H4', userId),
      primaryOrientation: AI.createManualField('N', userId),
      storeys: [],
      totalNfa: 0,
    },
    shading: { latitude: -26.2, multiplier: 0.35, openings: [], overallStatus: 'pending' },
    fenestration: { storeys: [], totalGlazedArea: 0, overallGlazingPct: 0, overallStatus: 'pending' },
    walls: {
      layers: [], includeRsiRse: true, metalFraming: false, thermalBreakR: 0,
      category1SingleLeaf: true, nominalThicknessMm: 220,
      totalR: 0, surfaceDensity: 0, arealHeatCapacity: 0, crValue: 0,
      classification: 'heavy', requiredR: 0, overallStatus: 'pending',
      metalBreakStatus: 'na', cat1Status: 'na',
    },
    roof: { layers: [], totalR: 0, requiredR: 0, margin: 0, overallStatus: 'pending' },
    floors: {
      ufhInstalled: false, suspendedFloorEnvelope: false,
      ufhInsulationR: AI.createManualField(0, userId), ufhRequiredR: 1.0,
      ufhStatus: 'na', suspendedStatus: 'na', overallStatus: 'pending',
    },
    hotWater: {
      buildingType: 'Residential', occupants: AI.createManualField(4, userId),
      litresPerOccupantDay: 115, deltaT: 44,
      technology: AI.createManualField('heat_pump', userId),
      supplementaryElectricPct: AI.createManualField(50, userId),
      eer: AI.createManualField(0.5, userId),
      dailyVolume: 0, dailyThermalKwh: 0, annualThermalKwh: 0, gridKwhYear: 0,
      electricSupplStatus: 'pending', storageStatus: 'pending', pipeRStatus: 'pending',
      technologyStatus: 'pending', eerStatus: 'pending', overallStatus: 'pending',
    },
    lighting: {
      occupancyCode: 'H4', lpdLimit: 6, nfa: 0,
      sensorCount: AI.createManualField(0, userId),
      internalFixtures: [], externalW: 0, totalW: 0, lpd: 0, areaPerSensor: 0,
      lpdStatus: 'pending', sensorStatus: 'pending', overallStatus: 'pending',
    },
    airCon: { systemInstalled: false, units: [], overallStatus: 'na' },
    sealing: {
      items: [
        { id: 's1', label: 'All external wall/roof junctions sealed', checked: false },
        { id: 's2', label: 'Window/door frames sealed to walls', checked: false },
        { id: 's3', label: 'Service penetrations sealed', checked: false },
        { id: 's4', label: 'Ceiling/wall junctions sealed', checked: false },
        { id: 's5', label: 'Expansion joints sealed', checked: false },
      ],
      completePct: 0,
      overallStatus: 'pending',
    },
    drawingSources: [],
    verificationSummary: { totalFields: 0, aiPopulated: 0, verified: 0, unverified: 0, manual: 0, avgConfidence: 0 },
    overallStatus: 'pending',
    componentStatuses: [],
  };
}

/** Create a sample assessment with AI-populated data (for demo/review) */
export function createSampleAssessment(): XaAssessment {
  const storeys: StoreyDefinition[] = [
    { id: 'gf', label: 'Ground Floor', nfa: AI.createAiField(950, 'A-001', 94), use: 'Retail / Entertainment' },
    { id: 'f1', label: 'First Floor', nfa: AI.createAiField(800, 'A-001', 94), use: 'Offices' },
    { id: 'f2', label: 'Second Floor', nfa: AI.createAiField(700, 'A-001', 94), use: 'Offices' },
  ];

  return {
    id: 'xa-sample-001',
    projectId: 'proj-sandton-mixed',
    projectName: 'Sandton Mixed-Use Complex',
    revision: 'P01',
    createdAt: '2026-06-25T10:00:00Z',
    updatedAt: '2026-06-29T18:30:00Z',
    createdBy: 'user-gt',
    basics: {
      city: AI.createAiField('Johannesburg', 'A-001', 96),
      climateZone: AI.createAiField(5 as ClimateZone, 'A-001', 99),
      occupancyClass: AI.createAiField('A1', 'A-001', 92),
      primaryOrientation: AI.createAiField('N', 'A-001', 96),
      storeys,
      totalNfa: 2450,
    },
    shading: {
      latitude: -26.2,
      multiplier: 0.35,
      openings: [
        { id: 'sh1', ref: 'W-GF-01', orientation: 'N', heightMm: AI.createAiField(2400, 'A-420', 89), projectionRequiredMm: 840, projectionActualMm: AI.createAiField(900, 'A-420', 85), hasScreen80Pct: false, status: 'pass', source: { type: 'ai', drawingRef: 'A-420', confidence: 89, verified: true, verifiedBy: 'user-gt', verifiedAt: '2026-06-28T14:00:00Z' } },
        { id: 'sh2', ref: 'W-GF-02', orientation: 'E', heightMm: AI.createAiField(2100, 'A-420', 87), projectionRequiredMm: 735, projectionActualMm: AI.createAiField(800, 'A-420', 83), hasScreen80Pct: false, status: 'pass', source: { type: 'ai', drawingRef: 'A-420', confidence: 87, verified: true } },
        { id: 'sh3', ref: 'W-F1-01', orientation: 'NW', heightMm: AI.createAiField(1800, 'A-420', 90), projectionRequiredMm: 630, projectionActualMm: AI.createAiField(450, 'A-420', 80), hasScreen80Pct: true, status: 'pass', source: { type: 'ai', drawingRef: 'A-420', confidence: 80, verified: true } },
      ],
      overallStatus: 'pass',
    },
    fenestration: {
      storeys: [
        {
          storeyId: 'gf', storeyLabel: 'Ground Floor', nfa: 950,
          openings: [
            { id: 'wgf1', ref: 'W-GF-01', storeyId: 'gf', orientation: 'N', widthMm: AI.createAiField(6000, 'A-420', 89), heightMm: AI.createAiField(2400, 'A-420', 89), areaM2: 14.4, uValue: AI.createAiField(5.7, 'A-420', 85), shgc: AI.createAiField(0.42, 'A-420', 82) },
            { id: 'wgf2', ref: 'W-GF-02', storeyId: 'gf', orientation: 'E', widthMm: AI.createAiField(1800, 'A-420', 88), heightMm: AI.createAiField(2100, 'A-420', 88), areaM2: 3.78, uValue: AI.createAiField(5.7, 'A-420', 85), shgc: AI.createAiField(0.42, 'A-420', 82) },
          ],
          totalGlazedArea: 18.18, glazingPct: 1.9, avgUValue: 5.7, avgShgcSolar: 0.42, avgShgcNonSolar: 0,
          uStatus: 'pass', shgcSolarStatus: 'pass', shgcNonSolarStatus: 'pass', overallStatus: 'pass',
        },
        {
          storeyId: 'f1', storeyLabel: 'First Floor', nfa: 150,
          openings: [
            { id: 'wf11', ref: 'W-F1-01', storeyId: 'f1', orientation: 'N', widthMm: AI.createAiField(12000, 'A-420', 86), heightMm: AI.createAiField(1800, 'A-420', 86), areaM2: 21.6, uValue: AI.createAiField(5.0, 'A-420', 80), shgc: AI.createAiField(0.58, 'A-420', 72) },
            { id: 'wf12', ref: 'W-F1-02', storeyId: 'f1', orientation: 'NW', widthMm: AI.createAiField(6000, 'A-420', 84), heightMm: AI.createAiField(1800, 'A-420', 84), areaM2: 10.8, uValue: AI.createAiField(5.0, 'A-420', 80), shgc: AI.createAiField(0.55, 'A-420', 75) },
            { id: 'wf13', ref: 'W-F1-03', storeyId: 'f1', orientation: 'S', widthMm: AI.createAiField(4000, 'A-420', 88), heightMm: AI.createAiField(1800, 'A-420', 88), areaM2: 7.2, uValue: AI.createAiField(4.5, 'A-420', 89), shgc: AI.createAiField(0.42, 'A-420', 89) },
          ],
          totalGlazedArea: 39.6, glazingPct: 26.4, avgUValue: 4.8, avgShgcSolar: 0.56, avgShgcNonSolar: 0.42,
          uStatus: 'pass', shgcSolarStatus: 'fail', shgcNonSolarStatus: 'pass', overallStatus: 'fail',
        },
      ],
      totalGlazedArea: 57.78,
      overallGlazingPct: 15.8,
      overallStatus: 'fail',
    },
    walls: {
      layers: [
        { id: 'wl1', name: 'Plaster (internal)', thicknessMm: 15, conductivity: 0.72, density: 1800, specificHeat: 0.84, source: { type: 'manual', enteredBy: 'user-gt', enteredAt: '2026-06-27T10:00:00Z' } },
        { id: 'wl2', name: 'Concrete block (inner)', thicknessMm: 140, conductivity: 1.13, density: 2000, specificHeat: 0.84, source: { type: 'manual', enteredBy: 'user-gt', enteredAt: '2026-06-27T10:00:00Z' } },
        { id: 'wl3', name: 'Cavity (unventilated)', thicknessMm: 50, rValue: 0.18, source: { type: 'manual', enteredBy: 'user-gt', enteredAt: '2026-06-27T10:00:00Z' } },
        { id: 'wl4', name: 'Concrete block (outer)', thicknessMm: 90, conductivity: 1.13, density: 2000, specificHeat: 0.84, source: { type: 'manual', enteredBy: 'user-gt', enteredAt: '2026-06-27T10:00:00Z' } },
        { id: 'wl5', name: 'Plaster (external)', thicknessMm: 15, conductivity: 0.72, density: 1800, specificHeat: 0.84, source: { type: 'manual', enteredBy: 'user-gt', enteredAt: '2026-06-27T10:00:00Z' } },
      ],
      includeRsiRse: true, metalFraming: false, thermalBreakR: 0,
      category1SingleLeaf: true, nominalThicknessMm: 220,
      totalR: 2.20, surfaceDensity: 532, arealHeatCapacity: 447, crValue: 94.4,
      classification: 'heavy', requiredR: 1.90, overallStatus: 'pass',
      metalBreakStatus: 'na', cat1Status: 'pass',
    },
    roof: {
      layers: [
        { id: 'rl1', name: 'IBR Sheeting', rValue: 0.00, source: { type: 'ai', drawingRef: 'A-001', confidence: 90, verified: true } },
        { id: 'rl2', name: 'Air space (pitched)', rValue: 0.16, source: { type: 'ai', drawingRef: 'A-001', confidence: 88, verified: true } },
        { id: 'rl3', name: 'Gypsum ceiling (6.4mm)', rValue: 0.04, source: { type: 'ai', drawingRef: 'A-001', confidence: 85, verified: true } },
        { id: 'rl4', name: 'Aerolite 135mm', rValue: 3.50, source: { type: 'ai', drawingRef: 'A-001', confidence: 81, verified: false } },
      ],
      totalR: 3.85, requiredR: 3.70, margin: 0.15, overallStatus: 'pass',
    },
    floors: {
      ufhInstalled: true, suspendedFloorEnvelope: false,
      ufhInsulationR: AI.createAiField(1.20, 'A-001', 88),
      ufhRequiredR: 1.0,
      ufhStatus: 'pass', suspendedStatus: 'na', overallStatus: 'pass',
    },
    hotWater: {
      buildingType: 'Mixed-use', occupants: AI.createAiField(120, 'M-100', 91),
      litresPerOccupantDay: 80, deltaT: 44,
      technology: AI.createAiField('heat_pump', 'M-100', 91),
      supplementaryElectricPct: AI.createAiField(30, 'M-100', 88),
      eer: AI.createAiField(0.6, 'M-100', 85),
      dailyVolume: 9600, dailyThermalKwh: 491, annualThermalKwh: 179345, gridKwhYear: 107607,
      electricSupplStatus: 'pass', storageStatus: 'pass', pipeRStatus: 'pass',
      technologyStatus: 'pass', eerStatus: 'pass', overallStatus: 'pass',
    },
    lighting: {
      occupancyCode: 'G1', lpdLimit: 8, nfa: 2450,
      sensorCount: AI.createAiField(20, 'E-210', 68),
      internalFixtures: [
        { id: 'lf1', zone: 'Open plan offices', wattage: 40, qty: 180, totalW: 7200 },
        { id: 'lf2', zone: 'Meeting rooms', wattage: 36, qty: 48, totalW: 1728 },
        { id: 'lf3', zone: 'Corridors/lobbies', wattage: 18, qty: 120, totalW: 2160 },
        { id: 'lf4', zone: 'Restrooms', wattage: 18, qty: 36, totalW: 648 },
      ],
      externalW: 960, totalW: 18600, lpd: 7.2, areaPerSensor: 122.5,
      lpdStatus: 'pass', sensorStatus: 'check', overallStatus: 'check',
    },
    airCon: { systemInstalled: false, units: [], overallStatus: 'na' },
    sealing: {
      items: [
        { id: 's1', label: 'All external wall/roof junctions sealed', checked: true },
        { id: 's2', label: 'Window/door frames sealed to walls', checked: true },
        { id: 's3', label: 'Service penetrations sealed', checked: true },
        { id: 's4', label: 'Ceiling/wall junctions sealed', checked: true },
        { id: 's5', label: 'Expansion joints sealed', checked: true },
      ],
      completePct: 100,
      overallStatus: 'pass',
    },
    drawingSources: [
      { id: 'ds1', name: 'A-001 Site Plan Rev P02', drawingRegisterId: 'DR-014', uploadedAt: '2026-06-25T10:00:00Z', scannedAt: '2026-06-25T10:05:00Z', fieldsExtracted: ['zone', 'orientation', 'nfa', 'roof insulation'] },
      { id: 'ds2', name: 'A-420 Building Elevations Rev P01', drawingRegisterId: 'DR-028', uploadedAt: '2026-06-22T10:00:00Z', scannedAt: '2026-06-22T10:03:00Z', fieldsExtracted: ['window schedule', 'shading dims'] },
      { id: 'ds3', name: 'M-100 Mechanical Layout Rev P01', drawingRegisterId: 'DR-035', uploadedAt: '2026-06-20T10:00:00Z', scannedAt: '2026-06-20T10:04:00Z', fieldsExtracted: ['hot water system', 'occupants'] },
      { id: 'ds4', name: 'E-210 Reflected Ceiling Plan Rev P02', drawingRegisterId: 'DR-041', uploadedAt: '2026-06-26T10:00:00Z', scannedAt: '2026-06-26T10:02:00Z', fieldsExtracted: ['lighting fixtures', 'sensor count'] },
    ],
    verificationSummary: { totalFields: 17, aiPopulated: 12, verified: 9, unverified: 3, manual: 5, avgConfidence: 87 },
    overallStatus: 'fail',
    componentStatuses: [],
  };
}
