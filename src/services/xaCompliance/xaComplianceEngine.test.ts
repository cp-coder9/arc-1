import { describe, it, expect } from 'vitest';
import { XaComplianceEngine } from './xaComplianceEngine';
import { createSampleAssessment } from './xaAssessmentFactory';
import type {
  FloorAssessment,
  HotWaterAssessment,
  LightingAssessment,
  RoofAssessment,
  ShadingAssessment,
  StoreyFenestration,
  WallAssessment,
} from './types';
import { XaDrawingIntelligenceService } from './xaDrawingIntelligence';

const AI = XaDrawingIntelligenceService;

describe('XaComplianceEngine', () => {
  const engine = new XaComplianceEngine(5);

  describe('getThresholds', () => {
    it('returns zone 5 thresholds', () => {
      const t = engine.getThresholds();
      expect(t.roofR).toBe(3.70);
      expect(t.wallR_heavy).toBe(1.90);
      expect(t.maxShgcSolar).toBe(0.50);
    });
  });

  describe('evaluateShading', () => {
    it('passes when projection exceeds requirement', () => {
      const assessment: ShadingAssessment = {
        latitude: -26.2,
        multiplier: 0.35,
        openings: [
          { id: '1', ref: 'W1', orientation: 'N', heightMm: AI.createAiField(2400, 'A-420', 90), projectionRequiredMm: 0, projectionActualMm: AI.createAiField(900, 'A-420', 85), hasScreen80Pct: false, status: 'pending', source: { type: 'ai', drawingRef: 'A-420', confidence: 90, verified: true } },
        ],
        overallStatus: 'pending',
      };
      const result = engine.evaluateShading(assessment);
      expect(result.openings[0].projectionRequiredMm).toBe(840);
      expect(result.openings[0].status).toBe('pass');
      expect(result.overallStatus).toBe('pass');
    });

    it('fails when projection is insufficient', () => {
      const assessment: ShadingAssessment = {
        latitude: -26.2,
        multiplier: 0.35,
        openings: [
          { id: '1', ref: 'W1', orientation: 'N', heightMm: AI.createAiField(2400, 'A-420', 90), projectionRequiredMm: 0, projectionActualMm: AI.createAiField(600, 'A-420', 85), hasScreen80Pct: false, status: 'pending', source: { type: 'ai', drawingRef: 'A-420', confidence: 90, verified: true } },
        ],
        overallStatus: 'pending',
      };
      const result = engine.evaluateShading(assessment);
      expect(result.openings[0].status).toBe('fail');
      expect(result.overallStatus).toBe('fail');
    });

    it('passes with screen ≥80% even if projection is short', () => {
      const assessment: ShadingAssessment = {
        latitude: -26.2,
        multiplier: 0.35,
        openings: [
          { id: '1', ref: 'W1', orientation: 'NW', heightMm: AI.createAiField(1800, 'A-420', 90), projectionRequiredMm: 0, projectionActualMm: AI.createAiField(100, 'A-420', 85), hasScreen80Pct: true, status: 'pending', source: { type: 'ai', drawingRef: 'A-420', confidence: 90, verified: true } },
        ],
        overallStatus: 'pending',
      };
      const result = engine.evaluateShading(assessment);
      expect(result.openings[0].status).toBe('pass');
    });
  });

  describe('evaluateStoreyFenestration', () => {
    it('passes when glazing ≤ zone maxGlazingPct (any solution)', () => {
      const storey: StoreyFenestration = {
        storeyId: 'gf', storeyLabel: 'Ground', nfa: 950,
        openings: [
          { id: '1', ref: 'W1', storeyId: 'gf', orientation: 'N', widthMm: AI.createAiField(6000, 'A-420', 90), heightMm: AI.createAiField(2400, 'A-420', 90), areaM2: 0, uValue: AI.createAiField(6.0, 'A-420', 85), shgc: AI.createAiField(0.70, 'A-420', 80) },
        ],
        totalGlazedArea: 0, glazingPct: 0, avgUValue: 0, avgShgcSolar: 0, avgShgcNonSolar: 0,
        uStatus: 'pending', shgcSolarStatus: 'pending', shgcNonSolarStatus: 'pending', overallStatus: 'pending',
      };
      const result = engine.evaluateStoreyFenestration(storey);
      // 14.4 m² / 950 = 1.5% < 15% (zone 5 maxGlazingPct) → any solution allowed
      expect(result.glazingPct).toBeCloseTo(1.5, 0);
      expect(result.overallStatus).toBe('pass');
    });

    it('fails when glazing > zone maxGlazingPct and SHGC exceeds limit', () => {
      const storey: StoreyFenestration = {
        storeyId: 'f1', storeyLabel: 'First', nfa: 100,
        openings: [
          { id: '1', ref: 'W1', storeyId: 'f1', orientation: 'N', widthMm: AI.createAiField(5000, 'A-420', 90), heightMm: AI.createAiField(5000, 'A-420', 90), areaM2: 0, uValue: AI.createAiField(4.0, 'A-420', 85), shgc: AI.createAiField(0.60, 'A-420', 80) },
        ],
        totalGlazedArea: 0, glazingPct: 0, avgUValue: 0, avgShgcSolar: 0, avgShgcNonSolar: 0,
        uStatus: 'pending', shgcSolarStatus: 'pending', shgcNonSolarStatus: 'pending', overallStatus: 'pending',
      };
      const result = engine.evaluateStoreyFenestration(storey);
      // 25 m² / 100 = 25% > 15% (zone 5 maxGlazingPct), SHGC 0.60 > 0.50 limit
      expect(result.glazingPct).toBe(25);
      expect(result.shgcSolarStatus).toBe('fail');
      expect(result.overallStatus).toBe('fail');
    });
  });

  describe('evaluateWalls', () => {
    it('passes heavy wall with R ≥ 1.90 in zone 5', () => {
      const assessment: WallAssessment = {
        layers: [
          { id: '1', name: 'Plaster', thicknessMm: 15, conductivity: 0.72, density: 1800, specificHeat: 0.84, source: { type: 'manual', enteredBy: 'u', enteredAt: '' } },
          { id: '2', name: 'Block', thicknessMm: 200, conductivity: 0.5, density: 2000, specificHeat: 0.84, source: { type: 'manual', enteredBy: 'u', enteredAt: '' } },
          { id: '3', name: 'Plaster', thicknessMm: 15, conductivity: 0.72, density: 1800, specificHeat: 0.84, source: { type: 'manual', enteredBy: 'u', enteredAt: '' } },
          { id: '4', name: 'Insulation', thicknessMm: 50, conductivity: 0.035, density: 30, specificHeat: 1.0, source: { type: 'manual', enteredBy: 'u', enteredAt: '' } },
        ],
        includeRsiRse: true, metalFraming: false, thermalBreakR: 0,
        category1SingleLeaf: true, nominalThicknessMm: 230,
        totalR: 0, surfaceDensity: 0, arealHeatCapacity: 0, crValue: 0,
        classification: 'heavy', requiredR: 0, overallStatus: 'pending',
        metalBreakStatus: 'na', cat1Status: 'na',
      };
      const result = engine.evaluateWalls(assessment);
      expect(result.totalR).toBeGreaterThanOrEqual(1.90);
      expect(result.classification).toBe('heavy');
      expect(result.overallStatus).toBe('pass');
    });
  });

  describe('evaluateRoof', () => {
    it('passes when total R ≥ 3.70', () => {
      const assessment: RoofAssessment = {
        layers: [
          { id: '1', name: 'Sheeting', rValue: 0.0, source: { type: 'ai', drawingRef: 'A-001', confidence: 90, verified: true } },
          { id: '2', name: 'Air', rValue: 0.16, source: { type: 'ai', drawingRef: 'A-001', confidence: 88, verified: true } },
          { id: '3', name: 'Gypsum', rValue: 0.04, source: { type: 'ai', drawingRef: 'A-001', confidence: 85, verified: true } },
          { id: '4', name: 'Aerolite 135', rValue: 3.50, source: { type: 'ai', drawingRef: 'A-001', confidence: 81, verified: false } },
        ],
        totalR: 0, requiredR: 0, margin: 0, overallStatus: 'pending',
      };
      const result = engine.evaluateRoof(assessment);
      expect(result.totalR).toBe(3.70);
      expect(result.requiredR).toBe(3.70);
      expect(result.overallStatus).toBe('pass');
    });

    it('fails when total R < required', () => {
      const assessment: RoofAssessment = {
        layers: [{ id: '1', name: 'Basic', rValue: 2.0, source: { type: 'manual', enteredBy: 'u', enteredAt: '' } }],
        totalR: 0, requiredR: 0, margin: 0, overallStatus: 'pending',
      };
      const result = engine.evaluateRoof(assessment);
      expect(result.overallStatus).toBe('fail');
    });
  });

  describe('evaluateHotWater', () => {
    it('passes with ≤50% electric supplementary', () => {
      const assessment: HotWaterAssessment = {
        buildingType: 'Mixed-use', occupants: AI.createAiField(120, 'M-100', 91),
        litresPerOccupantDay: 80, deltaT: 44,
        technology: AI.createAiField('heat_pump', 'M-100', 91),
        supplementaryElectricPct: AI.createAiField(30, 'M-100', 88),
        eer: AI.createAiField(0.6, 'M-100', 85),
        dailyVolume: 0, dailyThermalKwh: 0, annualThermalKwh: 0, gridKwhYear: 0,
        electricSupplStatus: 'pending', storageStatus: 'pending', pipeRStatus: 'pending',
        technologyStatus: 'pending', eerStatus: 'pending', overallStatus: 'pending',
      };
      const result = engine.evaluateHotWater(assessment);
      expect(result.electricSupplStatus).toBe('pass');
      expect(result.dailyVolume).toBe(9600);
      expect(result.overallStatus).toBe('pass');
    });
  });

  describe('evaluateLighting', () => {
    it('checks sensor density when area/sensor > 100', () => {
      const assessment: LightingAssessment = {
        occupancyCode: 'G1', lpdLimit: 8, nfa: 2450,
        sensorCount: AI.createAiField(20, 'E-210', 68),
        internalFixtures: [{ id: '1', zone: 'Office', wattage: 40, qty: 180, totalW: 7200 }],
        externalW: 0, totalW: 0, lpd: 0, areaPerSensor: 0,
        lpdStatus: 'pending', sensorStatus: 'pending', overallStatus: 'pending',
      };
      const result = engine.evaluateLighting(assessment);
      expect(result.lpd).toBeCloseTo(2.9, 1);
      expect(result.lpdStatus).toBe('pass');
      expect(result.areaPerSensor).toBe(122.5);
      expect(result.sensorStatus).toBe('check');
    });
  });

  describe('evaluateAll', () => {
    it('evaluates sample assessment and identifies fenestration failure', () => {
      const sample = createSampleAssessment();
      const result = engine.evaluateAll(sample);
      expect(result.overallStatus).toBe('fail');
      const fenComp = result.componentStatuses.find(c => c.component === 'Fenestration');
      expect(fenComp?.status).toBe('fail');
      const roofComp = result.componentStatuses.find(c => c.component === 'Roof');
      expect(roofComp?.status).toBe('pass');
    });
  });
});
