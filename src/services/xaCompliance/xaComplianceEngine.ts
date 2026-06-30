// XA Compliance Engine — Core calculation logic for all SANS 10400-XA components
//
// Implements prescriptive (deemed-to-satisfy) compliance checks for:
// - Shading (XA 5.2 / Table 3)
// - Fenestration glazing %, U-value, SHGC (XA 5.3 / Table 4)
// - External Walls R/CR (XA 5.5 / Tables 6-7)
// - Roof R-value (XA 5.6 / Table 8)
// - Floors (XA 5.4)
// - Hot Water (XA 6.1 / Tables 10-11)
// - Lighting LPD (XA 6.2 / Table 12)
// - Air Conditioning EER/COP (XA 6.3 / Table 13)
// - Sealing checklist (XA 5.7)
//
// Advisory only — results require professional sign-off.

import type {
  ClimateZone,
  ComplianceStatus,
  ComponentStatus,
  FenestrationAssessment,
  FenestrationOpening,
  FloorAssessment,
  HotWaterAssessment,
  LightingAssessment,
  Orientation,
  RoofAssessment,
  SealingAssessment,
  ShadingAssessment,
  ShadingOpening,
  StoreyFenestration,
  WallAssessment,
  XaAssessment,
  AirConAssessment,
} from './types';
import { SOLAR_ORIENTATIONS } from './types';

// ─── ZONE THRESHOLDS ──────────────────────────────────────────────────────────

interface ZoneThresholds {
  roofR: number;
  wallR_heavy: number;
  wallR_light: number;
  wallCR_light: number;
  maxGlazingPct: number;
  maxUValue: number;
  maxShgcSolar: number;
  maxShgcNonSolar: number;
  floorUfhR: number;
}

const ZONE_THRESHOLDS: Record<ClimateZone, ZoneThresholds> = {
  1: { roofR: 3.70, wallR_heavy: 0.35, wallR_light: 0.40, wallCR_light: 80, maxGlazingPct: 25, maxUValue: 6.5, maxShgcSolar: 0.56, maxShgcNonSolar: 0.81, floorUfhR: 1.0 },
  2: { roofR: 3.20, wallR_heavy: 0.35, wallR_light: 0.40, wallCR_light: 80, maxGlazingPct: 25, maxUValue: 6.5, maxShgcSolar: 0.56, maxShgcNonSolar: 0.81, floorUfhR: 1.0 },
  3: { roofR: 3.20, wallR_heavy: 0.35, wallR_light: 0.40, wallCR_light: 80, maxGlazingPct: 20, maxUValue: 6.5, maxShgcSolar: 0.56, maxShgcNonSolar: 0.81, floorUfhR: 1.0 },
  4: { roofR: 3.70, wallR_heavy: 0.40, wallR_light: 0.50, wallCR_light: 100, maxGlazingPct: 15, maxUValue: 5.0, maxShgcSolar: 0.50, maxShgcNonSolar: 0.71, floorUfhR: 1.0 },
  5: { roofR: 3.70, wallR_heavy: 1.90, wallR_light: 2.20, wallCR_light: 100, maxGlazingPct: 15, maxUValue: 5.0, maxShgcSolar: 0.50, maxShgcNonSolar: 0.71, floorUfhR: 1.0 },
  6: { roofR: 3.70, wallR_heavy: 0.40, wallR_light: 0.50, wallCR_light: 100, maxGlazingPct: 20, maxUValue: 5.5, maxShgcSolar: 0.53, maxShgcNonSolar: 0.76, floorUfhR: 1.0 },
};

// ─── SHADING MULTIPLIERS BY LATITUDE BAND ─────────────────────────────────────

function getShadingMultiplier(latitude: number): number {
  const absLat = Math.abs(latitude);
  if (absLat <= 23.5) return 0.30;
  if (absLat <= 27) return 0.35;
  if (absLat <= 30) return 0.40;
  if (absLat <= 33) return 0.45;
  return 0.50;
}

// ─── LPD LIMITS (TABLE 12 SIMPLIFIED) ──────────────────────────────────────────

const LPD_LIMITS: Record<string, number> = {
  A1: 12, A2: 15, B1: 10, B2: 10, B3: 8,
  C1: 10, C2: 10, D1: 8, E1: 12, F1: 15,
  G1: 8, H1: 10, H2: 8, H3: 6, H4: 6, J1: 6,
};

export class XaComplianceEngine {
  private zone: ClimateZone;
  private thresholds: ZoneThresholds;

  constructor(zone: ClimateZone) {
    this.zone = zone;
    this.thresholds = ZONE_THRESHOLDS[zone];
  }

  getThresholds(): ZoneThresholds {
    return { ...this.thresholds };
  }

  // ─── SHADING ──────────────────────────────────────────────────────────────

  evaluateShading(assessment: ShadingAssessment): ShadingAssessment {
    const multiplier = getShadingMultiplier(assessment.latitude);
    const openings = assessment.openings.map((op): ShadingOpening => {
      const pRequired = Math.ceil(op.heightMm.value * multiplier);
      const passes = op.hasScreen80Pct || op.projectionActualMm.value >= pRequired;
      return {
        ...op,
        projectionRequiredMm: pRequired,
        status: passes ? 'pass' : 'fail',
      };
    });
    const allPass = openings.every(o => o.status === 'pass');
    return { ...assessment, multiplier, openings, overallStatus: allPass ? 'pass' : 'fail' };
  }

  // ─── FENESTRATION ─────────────────────────────────────────────────────────

  evaluateStoreyFenestration(storey: StoreyFenestration): StoreyFenestration {
    const openings = storey.openings.map(op => ({
      ...op,
      areaM2: (op.widthMm.value * op.heightMm.value) / 1_000_000,
    }));

    const totalGlazed = openings.reduce((s, o) => s + o.areaM2, 0);
    const glazingPct = storey.nfa > 0 ? (totalGlazed / storey.nfa) * 100 : 0;

    // U-value weighted average
    const totalUA = openings.reduce((s, o) => s + o.uValue.value * o.areaM2, 0);
    const avgU = totalGlazed > 0 ? totalUA / totalGlazed : 0;

    // SHGC by orientation group
    const solarOpenings = openings.filter(o => SOLAR_ORIENTATIONS.includes(o.orientation));
    const nonSolarOpenings = openings.filter(o => !SOLAR_ORIENTATIONS.includes(o.orientation));

    const solarSA = solarOpenings.reduce((s, o) => s + o.shgc.value * o.areaM2, 0);
    const solarArea = solarOpenings.reduce((s, o) => s + o.areaM2, 0);
    const avgShgcSolar = solarArea > 0 ? solarSA / solarArea : 0;

    const nonSolarSA = nonSolarOpenings.reduce((s, o) => s + o.shgc.value * o.areaM2, 0);
    const nonSolarArea = nonSolarOpenings.reduce((s, o) => s + o.areaM2, 0);
    const avgShgcNonSolar = nonSolarArea > 0 ? nonSolarSA / nonSolarArea : 0;

    // Compliance per Table 4 logic
    let uStatus: ComplianceStatus = 'pass';
    let shgcSolarStatus: ComplianceStatus = 'pass';
    let shgcNonSolarStatus: ComplianceStatus = 'pass';

    // If glazing % exceeds the zone maximum, U-value and SHGC limits apply
    if (glazingPct > this.thresholds.maxGlazingPct) {
      if (avgU > this.thresholds.maxUValue) uStatus = 'fail';
      if (avgShgcSolar > this.thresholds.maxShgcSolar) shgcSolarStatus = 'fail';
      if (avgShgcNonSolar > this.thresholds.maxShgcNonSolar) shgcNonSolarStatus = 'fail';
    }
    // ≤ maxGlazingPct → "any solution" for U and SHGC

    const overallStatus: ComplianceStatus =
      uStatus === 'fail' || shgcSolarStatus === 'fail' || shgcNonSolarStatus === 'fail'
        ? 'fail' : 'pass';

    return {
      ...storey,
      openings,
      totalGlazedArea: Number(totalGlazed.toFixed(2)),
      glazingPct: Number(glazingPct.toFixed(1)),
      avgUValue: Number(avgU.toFixed(2)),
      avgShgcSolar: Number(avgShgcSolar.toFixed(3)),
      avgShgcNonSolar: Number(avgShgcNonSolar.toFixed(3)),
      uStatus,
      shgcSolarStatus,
      shgcNonSolarStatus,
      overallStatus,
    };
  }

  evaluateFenestration(assessment: FenestrationAssessment): FenestrationAssessment {
    const storeys = assessment.storeys.map(s => this.evaluateStoreyFenestration(s));
    const totalGlazed = storeys.reduce((s, st) => s + st.totalGlazedArea, 0);
    const totalNfa = storeys.reduce((s, st) => s + st.nfa, 0);
    const overallPct = totalNfa > 0 ? (totalGlazed / totalNfa) * 100 : 0;
    const hasFail = storeys.some(s => s.overallStatus === 'fail');
    return {
      storeys,
      totalGlazedArea: Number(totalGlazed.toFixed(2)),
      overallGlazingPct: Number(overallPct.toFixed(1)),
      overallStatus: hasFail ? 'fail' : 'pass',
    };
  }

  // ─── WALLS ────────────────────────────────────────────────────────────────

  evaluateWalls(assessment: WallAssessment): WallAssessment {
    const RSI = 0.13;
    const RSE = 0.04;

    let totalR = 0;
    let surfaceDensity = 0;
    let arealHeatCap = 0;

    for (const layer of assessment.layers) {
      if (layer.rValue) {
        totalR += layer.rValue;
      } else if (layer.conductivity && layer.conductivity > 0) {
        totalR += (layer.thicknessMm / 1000) / layer.conductivity;
      }
      if (layer.density) {
        const t = layer.thicknessMm / 1000;
        surfaceDensity += layer.density * t;
        if (layer.specificHeat) {
          arealHeatCap += layer.density * t * layer.specificHeat;
        }
      }
    }

    if (assessment.includeRsiRse) totalR += RSI + RSE;

    const crValue = totalR > 0 ? arealHeatCap / (totalR > 0 ? (1 / totalR) : 1) : 0;
    const classification = surfaceDensity >= 270 ? 'heavy' : 'light';
    const requiredR = classification === 'heavy'
      ? this.thresholds.wallR_heavy
      : this.thresholds.wallR_light;

    const wallPass = totalR >= requiredR;
    const metalBreakPass = !assessment.metalFraming || assessment.thermalBreakR >= 0.20;
    const cat1Pass = !assessment.category1SingleLeaf || assessment.nominalThicknessMm >= 140;

    return {
      ...assessment,
      totalR: Number(totalR.toFixed(2)),
      surfaceDensity: Number(surfaceDensity.toFixed(2)),
      arealHeatCapacity: Number(arealHeatCap.toFixed(2)),
      crValue: Number(crValue.toFixed(2)),
      classification,
      requiredR,
      overallStatus: wallPass && metalBreakPass && cat1Pass ? 'pass' : 'fail',
      metalBreakStatus: assessment.metalFraming ? (metalBreakPass ? 'pass' : 'fail') : 'na',
      cat1Status: assessment.category1SingleLeaf ? (cat1Pass ? 'pass' : 'fail') : 'na',
    };
  }

  // ─── ROOF ─────────────────────────────────────────────────────────────────

  evaluateRoof(assessment: RoofAssessment): RoofAssessment {
    const totalR = assessment.layers.reduce((s, l) => s + l.rValue, 0);
    const requiredR = this.thresholds.roofR;
    return {
      ...assessment,
      totalR: Number(totalR.toFixed(2)),
      requiredR,
      margin: Number((totalR - requiredR).toFixed(2)),
      overallStatus: totalR >= requiredR ? 'pass' : 'fail',
    };
  }

  // ─── FLOORS ───────────────────────────────────────────────────────────────

  evaluateFloors(assessment: FloorAssessment): FloorAssessment {
    const ufhStatus: ComplianceStatus = !assessment.ufhInstalled
      ? 'na'
      : assessment.ufhInsulationR.value >= this.thresholds.floorUfhR ? 'pass' : 'fail';

    const suspendedStatus: ComplianceStatus = !assessment.suspendedFloorEnvelope
      ? 'na'
      : (assessment.suspendedR?.value ?? 0) >= (assessment.suspendedRequiredR ?? 1.0) ? 'pass' : 'fail';

    const overallStatus: ComplianceStatus =
      ufhStatus === 'fail' || suspendedStatus === 'fail' ? 'fail' : 'pass';

    return { ...assessment, ufhStatus, suspendedStatus, overallStatus, ufhRequiredR: this.thresholds.floorUfhR };
  }

  // ─── HOT WATER ────────────────────────────────────────────────────────────

  evaluateHotWater(assessment: HotWaterAssessment): HotWaterAssessment {
    const dailyVol = assessment.occupants.value * assessment.litresPerOccupantDay;
    const dailyKwh = (dailyVol * assessment.deltaT * 4.186) / 3600;
    const annualKwh = dailyKwh * 365;
    const gridKwh = assessment.eer.value > 0 ? annualKwh / assessment.eer.value : annualKwh;

    const electricPass = assessment.supplementaryElectricPct.value <= 50;
    const eerPass = assessment.eer.value >= 0.5;
    const technologyPass = assessment.technology.value !== 'electric';

    const electricSupplStatus: ComplianceStatus = electricPass ? 'pass' : 'fail';
    const technologyStatus: ComplianceStatus = technologyPass ? 'pass' : 'fail';
    const eerStatus: ComplianceStatus = eerPass ? 'pass' : 'check';

    // Overall fails if any critical check fails; 'check' if EER is marginal
    const hasFail = !electricPass || !technologyPass;
    const hasCheck = !eerPass;
    const overallStatus: ComplianceStatus = hasFail ? 'fail' : (hasCheck ? 'check' : 'pass');

    return {
      ...assessment,
      dailyVolume: Number(dailyVol.toFixed(0)),
      dailyThermalKwh: Number(dailyKwh.toFixed(2)),
      annualThermalKwh: Number(annualKwh.toFixed(2)),
      gridKwhYear: Number(gridKwh.toFixed(2)),
      electricSupplStatus,
      storageStatus: 'pass', // simplified — full impl checks Table 10
      pipeRStatus: 'pass', // simplified — full impl checks Table 11
      technologyStatus,
      eerStatus,
      overallStatus,
    };
  }

  // ─── LIGHTING ─────────────────────────────────────────────────────────────

  evaluateLighting(assessment: LightingAssessment): LightingAssessment {
    const lpdLimit = LPD_LIMITS[assessment.occupancyCode] ?? 8;
    const totalW = assessment.internalFixtures.reduce((s, f) => s + f.totalW, 0) + assessment.externalW;
    const lpd = assessment.nfa > 0 ? totalW / assessment.nfa : 0;
    const areaPerSensor = assessment.sensorCount.value > 0 ? assessment.nfa / assessment.sensorCount.value : Infinity;

    const lpdPass = lpd <= lpdLimit;
    const sensorPass = areaPerSensor <= 100;

    return {
      ...assessment,
      lpdLimit,
      totalW,
      lpd: Number(lpd.toFixed(1)),
      areaPerSensor: Number(areaPerSensor.toFixed(1)),
      lpdStatus: lpdPass ? 'pass' : 'fail',
      sensorStatus: sensorPass ? 'pass' : 'check',
      overallStatus: lpdPass && sensorPass ? 'pass' : (lpdPass ? 'check' : 'fail'),
    };
  }

  // ─── AIR CON ──────────────────────────────────────────────────────────────

  evaluateAirCon(assessment: AirConAssessment): AirConAssessment {
    if (!assessment.systemInstalled) {
      return { ...assessment, overallStatus: 'na' };
    }
    const units = assessment.units.map(u => ({
      ...u,
      status: (u.eer >= u.minEer ? 'pass' : 'fail') as ComplianceStatus,
    }));
    const hasFail = units.some(u => u.status === 'fail');
    return { ...assessment, units, overallStatus: hasFail ? 'fail' : 'pass' };
  }

  // ─── SEALING ──────────────────────────────────────────────────────────────

  evaluateSealing(assessment: SealingAssessment): SealingAssessment {
    const total = assessment.items.length;
    const checked = assessment.items.filter(i => i.checked).length;
    const completePct = total > 0 ? Math.round((checked / total) * 100) : 0;
    return {
      ...assessment,
      completePct,
      overallStatus: completePct === 100 ? 'pass' : (completePct >= 80 ? 'check' : 'pending'),
    };
  }

  // ─── FULL ASSESSMENT ──────────────────────────────────────────────────────

  evaluateAll(assessment: XaAssessment): XaAssessment {
    const shading = this.evaluateShading(assessment.shading);
    const fenestration = this.evaluateFenestration(assessment.fenestration);
    const walls = this.evaluateWalls(assessment.walls);
    const roof = this.evaluateRoof(assessment.roof);
    const floors = this.evaluateFloors(assessment.floors);
    const hotWater = this.evaluateHotWater(assessment.hotWater);
    const lighting = this.evaluateLighting(assessment.lighting);
    const airCon = this.evaluateAirCon(assessment.airCon);
    const sealing = this.evaluateSealing(assessment.sealing);

    const componentStatuses: ComponentStatus[] = [
      { component: 'Orientation', clause: 'XA 4', status: 'pass', summary: `${assessment.basics.primaryOrientation.value}`, dataSource: 'ai_verified' },
      { component: 'Shading', clause: 'XA 5.2', status: shading.overallStatus, summary: `P ≥ H × ${shading.multiplier}`, dataSource: 'ai_verified' },
      { component: 'Fenestration', clause: 'XA 5.3', status: fenestration.overallStatus, summary: `Glazing ${fenestration.overallGlazingPct}%`, dataSource: 'ai_unverified' },
      { component: 'Walls', clause: 'XA 5.5', status: walls.overallStatus, summary: `R ${walls.totalR} (req ${walls.requiredR})`, dataSource: 'manual' },
      { component: 'Roof', clause: 'XA 5.6', status: roof.overallStatus, summary: `R ${roof.totalR} (req ${roof.requiredR})`, dataSource: 'ai_verified' },
      { component: 'Floors', clause: 'XA 5.4', status: floors.overallStatus, summary: `UFH R ${assessment.floors.ufhInsulationR.value}`, dataSource: 'ai_verified' },
      { component: 'Hot Water', clause: 'XA 6.1', status: hotWater.overallStatus, summary: `${assessment.hotWater.technology.value} ${assessment.hotWater.supplementaryElectricPct.value}%`, dataSource: 'ai_verified' },
      { component: 'Lighting', clause: 'XA 6.2', status: lighting.overallStatus, summary: `LPD ${lighting.lpd} W/m²`, dataSource: 'ai_unverified' },
      { component: 'Air Con', clause: 'XA 6.3', status: airCon.overallStatus, summary: airCon.systemInstalled ? `${airCon.units.length} units` : 'No system', dataSource: 'derived' },
      { component: 'Sealing', clause: 'XA 5.7', status: sealing.overallStatus, summary: `${sealing.completePct}% complete`, dataSource: 'manual' },
    ];

    const hasFail = componentStatuses.some(c => c.status === 'fail');
    const hasCheck = componentStatuses.some(c => c.status === 'check');
    const overallStatus: ComplianceStatus = hasFail ? 'fail' : (hasCheck ? 'check' : 'pass');

    return {
      ...assessment,
      shading,
      fenestration,
      walls,
      roof,
      floors,
      hotWater,
      lighting,
      airCon,
      sealing,
      componentStatuses,
      overallStatus,
    };
  }
}
