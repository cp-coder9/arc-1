import { describe, it, expect } from 'vitest';
import {
  TOOLBOX_CALCULATORS,
  listCalculatorsForContext,
  runCalculator,
  getCalculatorFamily,
} from '../toolboxCalculatorService';
import type { ToolboxContext } from '../../types/toolboxCalculators';

const contractorContext: ToolboxContext = {
  userId: 'test_user',
  role: 'contractor',
  projectId: 'project_001',
  phase: 'tender',
};

const bepContext: ToolboxContext = {
  userId: 'test_bep',
  role: 'bep',
  projectId: 'project_001',
  phase: 'design_coordination',
};

describe('toolboxCalculatorService', () => {
  describe('TOOLBOX_CALCULATORS registry', () => {
    it('contains exactly 15 calculators', () => {
      expect(TOOLBOX_CALCULATORS.length).toBe(15);
    });

    it('all calculators have unique IDs', () => {
      const ids = TOOLBOX_CALCULATORS.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('all calculators have required fields', () => {
      for (const calc of TOOLBOX_CALCULATORS) {
        expect(calc.id).toBeTruthy();
        expect(calc.version).toBeTruthy();
        expect(calc.label).toBeTruthy();
        expect(calc.description).toBeTruthy();
        expect(calc.familyId).toBeTruthy();
        expect(calc.requiredInputs.length).toBeGreaterThan(0);
        expect(calc.applicableRoles.length).toBeGreaterThan(0);
        expect(typeof calc.professionalSignoffRequired).toBe('boolean');
      }
    });
  });

  describe('listCalculatorsForContext', () => {
    it('filters calculators by role', () => {
      const contractorCalcs = listCalculatorsForContext(contractorContext);
      for (const calc of contractorCalcs) {
        expect(calc.applicableRoles).toContain('contractor');
      }
    });

    it('returns BEP calculators for BEP context', () => {
      const bepCalcs = listCalculatorsForContext(bepContext);
      const ids = bepCalcs.map((c) => c.id);
      expect(ids).toContain('xa_fenestration_quick_check');
      expect(ids).toContain('rational_method_runoff');
    });
  });

  describe('runCalculator', () => {
    it('runs concrete_order calculator and returns valid result', () => {
      const run = runCalculator('concrete_order', contractorContext, {
        elements: [{ label: 'Slab', lengthM: 10, widthM: 8, depthM: 0.15 }],
        wastePercent: 5,
      });
      expect(run.calculatorId).toBe('concrete_order');
      expect(run.calculatorVersion).toBe('0.1.0');
      expect(run.results.netVolumeM3).toBe(12);
      expect(run.results.grossOrderVolumeM3).toBe(12.6);
      expect(run.results.truckLoads).toBe(3);
      expect(run.riskStatus).toBe('info');
      expect(run.professionalSignoffRequired).toBe(false);
      expect(run.exportTargets).toContain('tender_boq');
    });

    it('runs brick_blockwork calculator', () => {
      const run = runCalculator('brick_blockwork', contractorContext, {
        wallAreaM2: 100,
        unitLengthMm: 222,
        unitHeightMm: 106,
        jointMm: 10,
        wastePercent: 7.5,
      });
      expect(run.results.estimatedUnits).toBeGreaterThan(0);
      expect(run.results.orderUnits).toBeGreaterThan(run.results.estimatedUnits);
    });

    it('runs tender_rate_buildup calculator', () => {
      const run = runCalculator('tender_rate_buildup', contractorContext, {
        quantity: 50,
        unit: 'm3',
        materialUnitCost: 1450,
        labourUnitCost: 280,
        plantUnitCost: 120,
        overheadPercent: 8,
        profitPercent: 10,
        riskPercent: 3,
      });
      expect(run.results.unitRate).toBeGreaterThan(0);
      expect(run.results.totalAmount).toBeGreaterThan(0);
    });

    it('runs labour_productivity calculator', () => {
      const run = runCalculator('labour_productivity', contractorContext, {
        quantity: 200,
        unit: 'm2',
        productivityPerCrewPerDay: 40,
        crewCount: 2,
      });
      expect(run.results.durationDays).toBe(2.5);
      expect(run.results.dailyTarget).toBe(80);
    });

    it('runs xa_fenestration_quick_check and returns fail for high glazing ratio', () => {
      const run = runCalculator('xa_fenestration_quick_check', bepContext, {
        buildingType: 'residential',
        energyZone: 2,
        orientation: 'W',
        wallAreaM2: 80,
        glazedAreaM2: 30,
        averageSHGC: 0.72,
        shadingFactor: 0.95,
      });
      expect(run.riskStatus).toBe('fail');
      expect(run.professionalSignoffRequired).toBe(true);
    });

    it('runs rational_method_runoff', () => {
      const run = runCalculator('rational_method_runoff', bepContext, {
        catchments: [
          { label: 'Roof', areaM2: 500, runoffCoefficient: 0.9 },
          { label: 'Paving', areaM2: 200, runoffCoefficient: 0.7 },
        ],
        rainfallIntensityMmPerHour: 50,
      });
      expect(run.results.totalAreaM2).toBe(700);
      expect(run.results.peakRunoffLs).toBeGreaterThan(0);
    });

    it('runs voltage_drop calculator', () => {
      const run = runCalculator('voltage_drop', bepContext, {
        voltage: 230,
        currentAmps: 20,
        cableLengthM: 50,
        conductorAreaMm2: 4,
        conductorMaterial: 'copper',
        phaseType: 'single',
      });
      expect(run.results.voltageDropPercent).toBeGreaterThan(0);
      expect(typeof run.results.pass).toBe('boolean');
    });

    it('runs occupant_load calculator', () => {
      const run = runCalculator('occupant_load', bepContext, {
        occupancyType: 'assembly',
        floorAreaM2: 300,
      });
      expect(run.results.occupantCount).toBe(600);
      expect(run.results.exitsRequired).toBe(3);
    });

    it('runs paint_coverage calculator', () => {
      const run = runCalculator('paint_coverage', contractorContext, {
        surfaceAreaM2: 150,
        coatsCount: 2,
        surfaceType: 'smooth_plaster',
      });
      expect(run.results.totalLitres).toBe(25);
      expect(run.results.cans20L).toBe(2);
    });

    it('throws on unknown calculator ID', () => {
      expect(() => runCalculator('nonexistent', contractorContext, {})).toThrow(
        'Unknown calculator',
      );
    });
  });

  describe('getCalculatorFamily', () => {
    it('returns calculators for a specific family', () => {
      const xa = getCalculatorFamily('xa_energy');
      expect(xa.length).toBeGreaterThan(0);
      for (const calc of xa) {
        expect(calc.familyId).toBe('xa_energy');
      }
    });

    it('returns empty array for unknown family', () => {
      expect(getCalculatorFamily('nonexistent')).toEqual([]);
    });
  });
});
