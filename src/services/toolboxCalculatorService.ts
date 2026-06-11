import type {
  BrickBlockworkInputs,
  CalculatorDefinition,
  CalculatorRun,
  ConcreteOrderInputs,
  DuctSizingInputs,
  FixtureUnitInputs,
  LabourProductivityInputs,
  ManningPipeFlowInputs,
  OccupantLoadInputs,
  PaintCoverageInputs,
  PipeGradientInputs,
  RationalMethodInputs,
  RValueInputs,
  TenderRateBuildUpInputs,
  ToolboxContext,
  VentilationAirChangeInputs,
  VoltageDropInputs,
  XAfenestrationInputs,
} from '../types/toolboxCalculators';

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function runId(calculatorId: string): string {
  return `${calculatorId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function baseRun<TResult extends Record<string, unknown>>(
  definition: Pick<
    CalculatorDefinition,
    'id' | 'version' | 'referenceNotes' | 'professionalSignoffRequired' | 'defaultExportTargets'
  >,
  context: ToolboxContext,
  inputs: Record<string, unknown>,
  partial: Omit<
    CalculatorRun<TResult>,
    'id' | 'calculatorId' | 'calculatorVersion' | 'context' | 'inputs' | 'referenceNotes' | 'professionalSignoffRequired' | 'exportTargets' | 'createdAt'
  >,
): CalculatorRun<TResult> {
  return {
    id: runId(definition.id),
    calculatorId: definition.id,
    calculatorVersion: definition.version,
    context,
    inputs,
    referenceNotes: definition.referenceNotes,
    professionalSignoffRequired: definition.professionalSignoffRequired,
    exportTargets: definition.defaultExportTargets,
    createdAt: new Date().toISOString(),
    ...partial,
  };
}

// ============== 1. XA Fenestration Quick Check ==============

const xaFenestrationQuickCheck: CalculatorDefinition<XAfenestrationInputs> = {
  id: 'xa_fenestration_quick_check',
  version: '0.1.0',
  familyId: 'xa_energy',
  label: 'SANS 10400-XA Fenestration Quick Check',
  description: 'Early check for glazing ratio and weighted SHGC/U-value assumptions.',
  useClass: 'compliance_support',
  applicableRoles: ['architect', 'bep', 'energy_professional'],
  defaultExportTargets: ['compliance_report', 'bim_coordination_comment', 'rfi'],
  requiredInputs: ['buildingType', 'energyZone', 'orientation', 'wallAreaM2', 'glazedAreaM2'],
  optionalInputs: ['averageUValue', 'averageSHGC', 'shadingFactor', 'maxGlazingRatio', 'maxWeightedSHGC'],
  referenceNotes: [
    'Based on Architex quick-screening logic inspired by SANSCalc/Fencalc-style workflows.',
    'Confirm final values against current SANS 10400-XA, SANS 204, supplier data and municipal requirements.',
  ],
  professionalSignoffRequired: true,
  run(context, inputs) {
    const glazingRatio = inputs.wallAreaM2 > 0 ? inputs.glazedAreaM2 / inputs.wallAreaM2 : 0;
    const maxRatio = inputs.maxGlazingRatio ?? 0.15;
    const weightedSHGC = (inputs.averageSHGC ?? 0.69) * (inputs.shadingFactor ?? 1);
    const maxWeightedSHGC = inputs.maxWeightedSHGC ?? 0.58;
    const ratioPass = glazingRatio <= maxRatio;
    const shgcPass = weightedSHGC <= maxWeightedSHGC;
    const missing = ['averageUValue', 'averageSHGC', 'shadingFactor'].filter(
      (key) => inputs[key as keyof XAfenestrationInputs] === undefined,
    );
    return baseRun(this, context, inputs as unknown as Record<string, unknown>, {
      assumptions: [
        `Default max glazing ratio: ${round(maxRatio * 100, 1)}% unless overridden.`,
        `Default max weighted SHGC: ${maxWeightedSHGC} unless overridden.`,
      ],
      results: {
        glazingRatioPercent: round(glazingRatio * 100, 2),
        maxGlazingRatioPercent: round(maxRatio * 100, 2),
        weightedSHGC: round(weightedSHGC, 3),
        maxWeightedSHGC,
        ratioPass,
        shgcPass,
        missingInputs: missing,
      },
      riskStatus: ratioPass && shgcPass ? (missing.length ? 'warning' : 'pass') : 'fail',
      nextRecommendedActions:
        ratioPass && shgcPass
          ? ['Export to XA checklist and confirm supplier U-value/SHGC data.']
          : ['Revise glazing area, orientation, shading or glass specification; request energy consultant review.'],
    });
  },
};

// ============== 2. XA R-Value Check ==============

const xaRValueCheck: CalculatorDefinition<RValueInputs> = {
  id: 'xa_rvalue_check',
  version: '0.1.0',
  familyId: 'xa_energy',
  label: 'SANS 10400-XA Roof/Wall R-Value Check',
  description: 'Composite R-value quick checker for roof/ceiling or external wall assemblies.',
  useClass: 'compliance_support',
  applicableRoles: ['architect', 'bep', 'energy_professional', 'contractor'],
  defaultExportTargets: ['compliance_report', 'supplier_rfq', 'bim_coordination_comment'],
  requiredInputs: ['assembly', 'energyZone', 'requiredRValue', 'layers'],
  referenceNotes: ['Use manufacturer-declared R-values and confirm against SANS 10400-XA:2021 requirements.'],
  professionalSignoffRequired: true,
  run(context, inputs) {
    const totalRValue = inputs.layers.reduce((sum, layer) => sum + Number(layer.rValue || 0), 0);
    const shortfall = Math.max(0, inputs.requiredRValue - totalRValue);
    return baseRun(this, context, inputs as unknown as Record<string, unknown>, {
      assumptions: ['Layer R-values are user supplied; verify against manufacturer documentation.'],
      results: {
        totalRValue: round(totalRValue, 3),
        requiredRValue: inputs.requiredRValue,
        shortfall: round(shortfall, 3),
        pass: shortfall === 0,
      },
      riskStatus: shortfall === 0 ? 'pass' : 'fail',
      nextRecommendedActions:
        shortfall === 0
          ? ['Attach R-value result to XA checklist.']
          : ['Increase insulation specification or revise assembly build-up.'],
    });
  },
};

// ============== 3. Rational Method Stormwater Runoff ==============

const rationalMethodRunoff: CalculatorDefinition<RationalMethodInputs> = {
  id: 'rational_method_runoff',
  version: '0.1.0',
  familyId: 'civil_stormwater',
  label: 'Rational Method Stormwater Runoff',
  description: 'Peak stormwater runoff estimator using Q = C i A.',
  useClass: 'coordination_check',
  applicableRoles: ['bep', 'engineer', 'contractor'],
  defaultExportTargets: ['bim_coordination_comment', 'rfi', 'tender_boq'],
  requiredInputs: ['catchments', 'rainfallIntensityMmPerHour'],
  referenceNotes: ['Use local municipal IDF data and return periods. Civil engineer sign-off required for submission.'],
  professionalSignoffRequired: true,
  run(context, inputs) {
    const areaWeightedC = inputs.catchments.reduce(
      (sum, c) => sum + c.areaM2 * c.runoffCoefficient, 0,
    );
    const totalAreaM2 = inputs.catchments.reduce((sum, c) => sum + c.areaM2, 0);
    const qM3s = (areaWeightedC * inputs.rainfallIntensityMmPerHour) / 3_600_000;
    return baseRun(this, context, inputs as unknown as Record<string, unknown>, {
      assumptions: ['Q = C i A, where i is mm/h and A is m²; result converted to m³/s.'],
      results: {
        totalAreaM2: round(totalAreaM2, 2),
        equivalentRunoffCoefficient: round(totalAreaM2 ? areaWeightedC / totalAreaM2 : 0, 3),
        peakRunoffM3s: round(qM3s, 4),
        peakRunoffLs: round(qM3s * 1000, 2),
      },
      riskStatus: 'info',
      nextRecommendedActions: [
        'Confirm rainfall intensity and return period with municipality/civil engineer.',
        'Use output to reserve pipe/attenuation zones.',
      ],
    });
  },
};

// ============== 4. Manning Pipe Flow ==============

const manningPipeFlow: CalculatorDefinition<ManningPipeFlowInputs> = {
  id: 'manning_pipe_flow',
  version: '0.1.0',
  familyId: 'civil_stormwater',
  label: 'Manning Pipe/Channel Flow Calculator',
  description: 'Computes full-bore pipe capacity using Manning formula for circular pipes.',
  useClass: 'coordination_check',
  applicableRoles: ['bep', 'engineer', 'contractor'],
  defaultExportTargets: ['bim_coordination_comment', 'rfi'],
  requiredInputs: ['pipeDiameterMm', 'slopePercent', 'manningN'],
  optionalInputs: ['flowDepthPercent'],
  referenceNotes: ['Confirm Manning n for pipe material. Municipal approval required for stormwater design.'],
  professionalSignoffRequired: true,
  run(context, inputs) {
    const radiusM = inputs.pipeDiameterMm / 2000;
    const slope = inputs.slopePercent / 100;
    const areaM2 = Math.PI * radiusM ** 2;
    const hydraulicRadius = radiusM / 2;
    const velocityMs =
      inputs.manningN > 0
        ? (1 / inputs.manningN) * Math.pow(hydraulicRadius, 2 / 3) * Math.sqrt(slope)
        : 0;
    const capacityM3s = areaM2 * velocityMs;
    return baseRun(this, context, inputs as unknown as Record<string, unknown>, {
      assumptions: [
        `Manning n = ${inputs.manningN} for pipe material.`,
        'Full-bore flow assumed unless flow depth percentage provided.',
      ],
      results: {
        pipeDiameterMm: inputs.pipeDiameterMm,
        slopePercent: inputs.slopePercent,
        velocityMs: round(velocityMs, 2),
        capacityM3s: round(capacityM3s, 4),
        capacityLs: round(capacityM3s * 1000, 1),
      },
      riskStatus: capacityM3s > 0 ? 'info' : 'warning',
      nextRecommendedActions: ['Verify pipe material Manning n and confirm with civil engineer.'],
    });
  },
};

// ============== 5. Pipe Gradient / Invert Level ==============

const pipeGradientInvert: CalculatorDefinition<PipeGradientInputs> = {
  id: 'pipe_gradient_invert',
  version: '0.1.0',
  familyId: 'civil_stormwater',
  label: 'Pipe Gradient & Invert Level Calculator',
  description: 'Computes pipe gradient, fall, and downstream invert level.',
  useClass: 'coordination_check',
  applicableRoles: ['bep', 'engineer', 'contractor'],
  defaultExportTargets: ['bim_coordination_comment', 'tender_boq', 'site_log'],
  requiredInputs: ['upstreamInvertLevel', 'downstreamInvertLevel', 'pipeLengthM', 'pipeDiameterMm'],
  referenceNotes: ['Ensure minimum self-cleansing velocity and municipal connection levels.'],
  professionalSignoffRequired: false,
  run(context, inputs) {
    const fall = inputs.upstreamInvertLevel - inputs.downstreamInvertLevel;
    const gradient = inputs.pipeLengthM > 0 ? (fall / inputs.pipeLengthM) * 100 : 0;
    const coverUpstream = inputs.upstreamInvertLevel + inputs.pipeDiameterMm / 1000;
    const coverDownstream = inputs.downstreamInvertLevel + inputs.pipeDiameterMm / 1000;
    return baseRun(this, context, inputs as unknown as Record<string, unknown>, {
      assumptions: ['Invert levels relative to project datum.', 'No allowance for benching or transition structures.'],
      results: {
        fall: round(fall, 3),
        gradientPercent: round(gradient, 3),
        upstreamInvertLevel: inputs.upstreamInvertLevel,
        downstreamInvertLevel: inputs.downstreamInvertLevel,
        coverUpstream: round(coverUpstream, 3),
        coverDownstream: round(coverDownstream, 3),
      },
      riskStatus: gradient >= 0.5 && gradient <= 5 ? 'info' : 'warning',
      nextRecommendedActions: [
        'Confirm minimum self-cleansing velocity.',
        'Check municipal connection invert levels.',
      ],
    });
  },
};

// ============== 6. Voltage Drop Calculator ==============

const voltageDrop: CalculatorDefinition<VoltageDropInputs> = {
  id: 'voltage_drop',
  version: '0.1.0',
  familyId: 'electrical',
  label: 'Voltage Drop Calculator',
  description: 'Calculates voltage drop percentage for AC cable runs per SANS 10142.',
  useClass: 'coordination_check',
  applicableRoles: ['bep', 'engineer', 'subcontractor'],
  defaultExportTargets: ['compliance_report', 'bim_coordination_comment', 'rfi'],
  requiredInputs: ['voltage', 'currentAmps', 'cableLengthM', 'conductorAreaMm2', 'conductorMaterial', 'phaseType'],
  referenceNotes: ['SANS 10142-1 recommends voltage drop not exceed 5% from point of supply to furthest point.'],
  professionalSignoffRequired: true,
  run(context, inputs) {
    const resistivity = inputs.conductorMaterial === 'copper' ? 0.0172 : 0.0282;
    const resistance = (resistivity * inputs.cableLengthM * 2) / inputs.conductorAreaMm2;
    const voltageDropV = inputs.currentAmps * resistance;
    const voltageDropPercent = (voltageDropV / inputs.voltage) * 100;
    const pass = voltageDropPercent <= 5;
    return baseRun(this, context, inputs as unknown as Record<string, unknown>, {
      assumptions: [
        `Resistivity: ${resistivity} Ω·mm²/m for ${inputs.conductorMaterial}.`,
        'Circuit length doubled for return path.',
        'SANS 10142-1 ≤5% recommended limit applied.',
      ],
      results: {
        voltage: inputs.voltage,
        currentAmps: inputs.currentAmps,
        cableLengthM: inputs.cableLengthM,
        conductorAreaMm2: inputs.conductorAreaMm2,
        resistanceOhms: round(resistance, 4),
        voltageDropV: round(voltageDropV, 2),
        voltageDropPercent: round(voltageDropPercent, 2),
        pass,
      },
      riskStatus: pass ? 'info' : 'fail',
      nextRecommendedActions: pass
        ? ['Voltage drop within acceptable range. Document for compliance records.']
        : ['Increase conductor size or reduce cable length. Consult electrical engineer.'],
    });
  },
};

// ============== 7. Duct Sizing Calculator ==============

const ductSizing: CalculatorDefinition<DuctSizingInputs> = {
  id: 'duct_sizing',
  version: '0.1.0',
  familyId: 'mechanical_hvac',
  label: 'Duct Sizing Calculator',
  description: 'Sizes rectangular duct based on airflow and target velocity.',
  useClass: 'coordination_check',
  applicableRoles: ['bep', 'engineer', 'subcontractor'],
  defaultExportTargets: ['bim_coordination_comment', 'tender_boq', 'supplier_rfq'],
  requiredInputs: ['airflowM3s'],
  optionalInputs: ['maxVelocityMs', 'aspectRatio'],
  referenceNotes: ['Typical duct velocities: main 5-8 m/s, branch 3-5 m/s. Confirm with mechanical engineer.'],
  professionalSignoffRequired: true,
  run(context, inputs) {
    const maxVelocity = inputs.maxVelocityMs ?? 6;
    const aspectRatio = inputs.aspectRatio ?? 2;
    const areaM2 = maxVelocity > 0 ? inputs.airflowM3s / maxVelocity : 0;
    const heightM = areaM2 > 0 ? Math.sqrt(areaM2 / aspectRatio) : 0;
    const widthM = heightM * aspectRatio;
    const actualVelocity = areaM2 > 0 ? inputs.airflowM3s / areaM2 : 0;
    return baseRun(this, context, inputs as unknown as Record<string, unknown>, {
      assumptions: [
        `Target max velocity: ${maxVelocity} m/s.`,
        `Aspect ratio: ${aspectRatio}:1.`,
      ],
      results: {
        airflowM3s: inputs.airflowM3s,
        airflowLs: round(inputs.airflowM3s * 1000, 1),
        ductAreaM2: round(areaM2, 4),
        ductHeightMm: round(heightM * 1000, 0),
        ductWidthMm: round(widthM * 1000, 0),
        actualVelocityMs: round(actualVelocity, 2),
      },
      riskStatus: actualVelocity <= maxVelocity ? 'info' : 'warning',
      nextRecommendedActions: [
        'Coordinate duct dimensions with ceiling void and structural openings.',
        'Confirm velocity with mechanical engineer for noise/acoustic requirements.',
      ],
    });
  },
};

// ============== 8. Ventilation / Air Change Calculator ==============

const ventilationAirChange: CalculatorDefinition<VentilationAirChangeInputs> = {
  id: 'ventilation_air_change',
  version: '0.1.0',
  familyId: 'mechanical_hvac',
  label: 'Ventilation / Air Change Calculator',
  description: 'Estimates required ventilation rate based on room type and occupancy.',
  useClass: 'coordination_check',
  applicableRoles: ['bep', 'engineer', 'subcontractor'],
  defaultExportTargets: ['compliance_report', 'bim_coordination_comment'],
  requiredInputs: ['roomVolumeM3', 'roomType'],
  optionalInputs: ['occupantCount'],
  referenceNotes: ['SANS 10400-O ventilation requirements. Confirm with mechanical engineer for final design.'],
  professionalSignoffRequired: true,
  run(context, inputs) {
    const achByRoomType: Record<string, number> = {
      office: 4, classroom: 5, retail: 6, restaurant: 10,
      bathroom: 8, kitchen: 15, factory: 6, warehouse: 3, other: 4,
    };
    const lsPerPerson: Record<string, number> = {
      office: 10, classroom: 8, retail: 10, restaurant: 12,
      bathroom: 15, kitchen: 20, factory: 10, warehouse: 8, other: 10,
    };
    const ach = achByRoomType[inputs.roomType] || 4;
    const requiredFlowByACH = (inputs.roomVolumeM3 * ach) / 3600;
    const occupantCount = inputs.occupantCount ?? Math.ceil(inputs.roomVolumeM3 / 10);
    const requiredFlowByOccupant = (occupantCount * (lsPerPerson[inputs.roomType] || 10)) / 1000;
    const requiredFlow = Math.max(requiredFlowByACH, requiredFlowByOccupant);
    return baseRun(this, context, inputs as unknown as Record<string, unknown>, {
      assumptions: [
        `Room type: ${inputs.roomType}, target ACH: ${ach}.`,
        `Occupant count: ${occupantCount} (${inputs.occupantCount ? 'provided' : 'estimated at 1 per 10m³'}).`,
      ],
      results: {
        roomVolumeM3: inputs.roomVolumeM3,
        roomType: inputs.roomType,
        targetACH: ach,
        occupantCount,
        requiredFlowByACHM3s: round(requiredFlowByACH, 4),
        requiredFlowByOccupantM3s: round(requiredFlowByOccupant, 4),
        requiredFlowM3s: round(requiredFlow, 4),
        requiredFlowLs: round(requiredFlow * 1000, 1),
      },
      riskStatus: 'info',
      nextRecommendedActions: [
        'Confirm ventilation rate with mechanical engineer.',
        'Check SANS 10400-O for specific room-use requirements.',
      ],
    });
  },
};

// ============== 9. Water Fixture Unit Demand Calculator ==============

const fixtureUnitWaterDemand: CalculatorDefinition<FixtureUnitInputs> = {
  id: 'fixture_unit_water_demand',
  version: '0.1.0',
  familyId: 'wet_services',
  label: 'Water Demand / Fixture Unit Calculator',
  description: 'Estimates peak water demand from fixture unit count using Hunter curve approximation.',
  useClass: 'coordination_check',
  applicableRoles: ['bep', 'engineer', 'subcontractor'],
  defaultExportTargets: ['bim_coordination_comment', 'compliance_report'],
  requiredInputs: ['fixtureUnits', 'buildingType', 'flushType'],
  referenceNotes: ['SANS 10252-1 water supply and drainage. Confirm with wet-services engineer.'],
  professionalSignoffRequired: true,
  run(context, inputs) {
    const flushFactor = inputs.flushType === 'flushometer' ? 1.5 : 1.0;
    const demandLs = 0.2 * Math.sqrt(inputs.fixtureUnits) * flushFactor;
    const demandM3h = demandLs * 3.6;
    return baseRun(this, context, inputs as unknown as Record<string, unknown>, {
      assumptions: [
        `Fixture units: ${inputs.fixtureUnits}, ${inputs.flushType} system.`,
        'Hunter curve approximation: Q = 0.2 × √(FU) × flush factor.',
      ],
      results: {
        fixtureUnits: inputs.fixtureUnits,
        buildingType: inputs.buildingType,
        flushType: inputs.flushType,
        peakDemandLs: round(demandLs, 2),
        peakDemandM3h: round(demandM3h, 2),
      },
      riskStatus: inputs.fixtureUnits > 0 ? 'info' : 'warning',
      nextRecommendedActions: [
        'Confirm fixture unit count from architectural schedule.',
        'Consult wet-services engineer for final pipe sizing.',
      ],
    });
  },
};

// ============== 10. Occupant Load Calculator ==============

const occupantLoad: CalculatorDefinition<OccupantLoadInputs> = {
  id: 'occupant_load',
  version: '0.1.0',
  familyId: 'fire_life_safety',
  label: 'Occupant Load Calculator',
  description: 'Determines design occupant load per SANS 10400-T occupancy classifications.',
  useClass: 'coordination_check',
  applicableRoles: ['architect', 'bep', 'fire_engineer'],
  defaultExportTargets: ['compliance_report', 'bim_coordination_comment'],
  requiredInputs: ['occupancyType', 'floorAreaM2'],
  optionalInputs: ['customFactorM2PerPerson'],
  referenceNotes: ['SANS 10400-T occupancy load factors. Fire engineer sign-off required for submission.'],
  professionalSignoffRequired: true,
  run(context, inputs) {
    const defaultFactors: Record<string, number> = {
      assembly: 0.5, business: 10, educational: 2, factory: 10,
      institutional: 5, mercantile: 3, residential: 15, storage: 30, other: 10,
    };
    const factor = inputs.customFactorM2PerPerson ?? defaultFactors[inputs.occupancyType] ?? 10;
    const occupantCount = factor > 0 ? Math.ceil(inputs.floorAreaM2 / factor) : 0;
    const exitsRequired = occupantCount > 50 ? (occupantCount > 500 ? 3 : 2) : (occupantCount > 0 ? 1 : 0);
    const minExitWidthMm = occupantCount * 7;
    return baseRun(this, context, inputs as unknown as Record<string, unknown>, {
      assumptions: [
        `Occupancy type: ${inputs.occupancyType}, factor: ${factor} m²/person.`,
        `${exitsRequired} exit(s) required.`,
      ],
      results: {
        occupancyType: inputs.occupancyType,
        floorAreaM2: inputs.floorAreaM2,
        factorM2PerPerson: factor,
        occupantCount,
        exitsRequired,
        minExitWidthMm,
      },
      riskStatus: occupantCount > 0 ? 'info' : 'warning',
      nextRecommendedActions: [
        'Confirm occupancy classification with fire engineer.',
        'Verify exit widths and travel distances per SANS 10400-T.',
      ],
    });
  },
};

// ============== 11. Concrete Order Calculator ==============

const concreteOrderCalculator: CalculatorDefinition<ConcreteOrderInputs> = {
  id: 'concrete_order',
  version: '0.1.0',
  familyId: 'contractor_trade',
  label: 'Concrete Volume / Order Calculator',
  description: 'Calculates concrete volume, waste allowance and truckloads for site ordering.',
  useClass: 'contractor_quantity',
  applicableRoles: ['contractor', 'subcontractor', 'bep'],
  defaultExportTargets: ['tender_boq', 'supplier_rfq', 'site_log', 'payment_valuation'],
  requiredInputs: ['elements'],
  optionalInputs: ['wastePercent', 'truckCapacityM3'],
  referenceNotes: ['For quantity/order planning. Structural design and reinforcement remain engineer responsibilities.'],
  professionalSignoffRequired: false,
  run(context, inputs) {
    const netVolume = inputs.elements.reduce(
      (sum, e) => sum + e.lengthM * e.widthM * e.depthM * (e.count ?? 1), 0,
    );
    const wastePercent = inputs.wastePercent ?? 5;
    const grossVolume = netVolume * (1 + wastePercent / 100);
    const truckCapacity = inputs.truckCapacityM3 ?? 6;
    return baseRun(this, context, inputs as unknown as Record<string, unknown>, {
      assumptions: [`Waste allowance: ${wastePercent}%`, `Truck capacity: ${truckCapacity}m³`],
      results: {
        netVolumeM3: round(netVolume, 3),
        grossOrderVolumeM3: round(grossVolume, 3),
        truckLoads: Math.ceil(grossVolume / truckCapacity),
        wastePercent,
      },
      riskStatus: 'info',
      nextRecommendedActions: [
        'Export gross volume to supplier RFQ or site pour log.',
        'Attach delivery tickets after pour for payment reconciliation.',
      ],
    });
  },
};

// ============== 12. Brick / Blockwork Calculator ==============

const brickBlockworkCalculator: CalculatorDefinition<BrickBlockworkInputs> = {
  id: 'brick_blockwork',
  version: '0.1.0',
  familyId: 'contractor_trade',
  label: 'Brick / Blockwork Quantity Calculator',
  description: 'Estimates masonry units from wall area, openings, joint size and waste allowance.',
  useClass: 'contractor_quantity',
  applicableRoles: ['contractor', 'subcontractor', 'supplier', 'bep'],
  defaultExportTargets: ['tender_boq', 'supplier_rfq', 'site_log', 'payment_valuation'],
  requiredInputs: ['wallAreaM2', 'unitLengthMm', 'unitHeightMm'],
  optionalInputs: ['openingsM2', 'jointMm', 'wastePercent'],
  referenceNotes: ['Use project-specific bond, wall thickness, lintels, reinforcement and mortar assumptions.'],
  professionalSignoffRequired: false,
  run(context, inputs) {
    const joint = inputs.jointMm ?? 10;
    const moduleArea = ((inputs.unitLengthMm + joint) / 1000) * ((inputs.unitHeightMm + joint) / 1000);
    const netArea = Math.max(0, inputs.wallAreaM2 - (inputs.openingsM2 ?? 0));
    const netUnits = moduleArea > 0 ? netArea / moduleArea : 0;
    const wastePercent = inputs.wastePercent ?? 7.5;
    return baseRun(this, context, inputs as unknown as Record<string, unknown>, {
      assumptions: [`Joint allowance: ${joint}mm`, `Waste allowance: ${wastePercent}%`],
      results: {
        netWallAreaM2: round(netArea, 2),
        estimatedUnits: Math.ceil(netUnits),
        orderUnits: Math.ceil(netUnits * (1 + wastePercent / 100)),
        jointMm: joint,
        wastePercent,
      },
      riskStatus: 'info',
      nextRecommendedActions: [
        'Export units to supplier RFQ and masonry subcontractor package.',
        'Confirm bond, wall thickness and special units (lintels, sills, etc.).',
      ],
    });
  },
};

// ============== 13. Paint Coverage Calculator ==============

const paintCoverageCalculator: CalculatorDefinition<PaintCoverageInputs> = {
  id: 'paint_coverage',
  version: '0.1.0',
  familyId: 'contractor_trade',
  label: 'Paint Coverage Calculator',
  description: 'Estimates paint quantity required from surface area, coats, and spread rate.',
  useClass: 'contractor_quantity',
  applicableRoles: ['contractor', 'subcontractor', 'supplier', 'bep'],
  defaultExportTargets: ['tender_boq', 'supplier_rfq', 'site_log'],
  requiredInputs: ['surfaceAreaM2'],
  optionalInputs: ['coatsCount', 'spreadRateM2PerLitre', 'surfaceType'],
  referenceNotes: ['Confirm spread rate with manufacturer data sheet for specific product.'],
  professionalSignoffRequired: false,
  run(context, inputs) {
    const coats = inputs.coatsCount ?? 2;
    const defaultSpreadRates: Record<string, number> = {
      smooth_plaster: 12, rough_plaster: 7, concrete: 8,
      metal: 10, wood: 10, existing_paint: 12,
    };
    const spreadRate = inputs.spreadRateM2PerLitre ?? defaultSpreadRates[inputs.surfaceType ?? 'smooth_plaster'] ?? 10;
    const totalLitres = spreadRate > 0 ? (inputs.surfaceAreaM2 * coats) / spreadRate : 0;
    return baseRun(this, context, inputs as unknown as Record<string, unknown>, {
      assumptions: [
        `Coats: ${coats}, spread rate: ${spreadRate} m²/L.`,
        `Surface type: ${inputs.surfaceType ?? 'smooth_plaster'}.`,
      ],
      results: {
        surfaceAreaM2: inputs.surfaceAreaM2,
        coatsCount: coats,
        spreadRateM2PerLitre: spreadRate,
        totalLitres: round(totalLitres, 1),
        cans5L: Math.ceil(totalLitres / 5),
        cans20L: Math.ceil(totalLitres / 20),
      },
      riskStatus: 'info',
      nextRecommendedActions: [
        'Confirm spread rate from paint manufacturer data sheet.',
        'Add allowance for wastage and surface porosity.',
      ],
    });
  },
};

// ============== 14. Tender Rate Build-Up Calculator ==============

const tenderRateBuildUpCalculator: CalculatorDefinition<TenderRateBuildUpInputs> = {
  id: 'tender_rate_buildup',
  version: '0.1.0',
  familyId: 'contractor_trade',
  label: 'Tender Rate Build-Up Calculator',
  description: 'Builds a tender unit rate from material, labour, plant, overhead, profit and risk components.',
  useClass: 'tender_estimate',
  applicableRoles: ['contractor', 'subcontractor', 'supplier', 'bep'],
  defaultExportTargets: ['tender_boq', 'bid_line_item', 'variation_claim'],
  requiredInputs: ['quantity', 'unit', 'materialUnitCost', 'labourUnitCost'],
  optionalInputs: ['plantUnitCost', 'subcontractUnitCost', 'overheadPercent', 'profitPercent', 'riskPercent'],
  referenceNotes: ['Keep rate build-ups audit-visible for tender comparison, variations and payment disputes.'],
  professionalSignoffRequired: false,
  run(context, inputs) {
    const directUnitRate =
      inputs.materialUnitCost + inputs.labourUnitCost +
      (inputs.plantUnitCost ?? 0) + (inputs.subcontractUnitCost ?? 0);
    const factor = 1 + ((inputs.overheadPercent ?? 0) + (inputs.profitPercent ?? 0) + (inputs.riskPercent ?? 0)) / 100;
    const unitRate = directUnitRate * factor;
    return baseRun(this, context, inputs as unknown as Record<string, unknown>, {
      assumptions: [
        `Overhead ${inputs.overheadPercent ?? 0}%, profit ${inputs.profitPercent ?? 0}%, risk ${inputs.riskPercent ?? 0}%.`,
      ],
      results: {
        directUnitRate: round(directUnitRate, 2),
        unitRate: round(unitRate, 2),
        quantity: inputs.quantity,
        unit: inputs.unit,
        totalAmount: round(unitRate * inputs.quantity, 2),
        overheadPercent: inputs.overheadPercent ?? 0,
        profitPercent: inputs.profitPercent ?? 0,
        riskPercent: inputs.riskPercent ?? 0,
      },
      riskStatus: 'info',
      nextRecommendedActions: [
        'Export to tender/bid line item.',
        'Lock rate build-up version if bid is submitted.',
      ],
    });
  },
};

// ============== 15. Labour Productivity Calculator ==============

const labourProductivityCalculator: CalculatorDefinition<LabourProductivityInputs> = {
  id: 'labour_productivity',
  version: '0.1.0',
  familyId: 'contractor_trade',
  label: 'Labour / Crew Productivity Calculator',
  description: 'Estimates crew days, duration and daily production targets.',
  useClass: 'tender_estimate',
  applicableRoles: ['contractor', 'subcontractor', 'bep'],
  defaultExportTargets: ['tender_boq', 'site_log', 'variation_claim', 'payment_valuation'],
  requiredInputs: ['quantity', 'unit', 'productivityPerCrewPerDay'],
  optionalInputs: ['crewCount', 'workingHoursPerDay'],
  referenceNotes: ['Use actual site logs to improve productivity templates over time.'],
  professionalSignoffRequired: false,
  run(context, inputs) {
    const crewCount = inputs.crewCount ?? 1;
    const crewDays = inputs.productivityPerCrewPerDay > 0
      ? inputs.quantity / inputs.productivityPerCrewPerDay : 0;
    const durationDays = crewCount > 0 ? crewDays / crewCount : 0;
    return baseRun(this, context, inputs as unknown as Record<string, unknown>, {
      assumptions: [
        `Crew count: ${crewCount}.`,
        `Working hours/day: ${inputs.workingHoursPerDay ?? 8}.`,
      ],
      results: {
        quantity: inputs.quantity,
        unit: inputs.unit,
        crewDays: round(crewDays, 2),
        durationDays: round(durationDays, 2),
        dailyTarget: round(inputs.productivityPerCrewPerDay * crewCount, 2),
        crewCount,
      },
      riskStatus: durationDays > 0 ? 'info' : 'warning',
      nextRecommendedActions: [
        'Export daily targets to programme/lookahead plan.',
        'Compare planned vs actual productivity from site logs.',
      ],
    });
  },
};

// ============== Registry ==============

export const TOOLBOX_CALCULATORS = [
  xaFenestrationQuickCheck,
  xaRValueCheck,
  rationalMethodRunoff,
  manningPipeFlow,
  pipeGradientInvert,
  voltageDrop,
  ductSizing,
  ventilationAirChange,
  fixtureUnitWaterDemand,
  occupantLoad,
  concreteOrderCalculator,
  brickBlockworkCalculator,
  paintCoverageCalculator,
  tenderRateBuildUpCalculator,
  labourProductivityCalculator,
] as const;

export type ToolboxCalculatorId = (typeof TOOLBOX_CALCULATORS)[number]['id'];

export function listCalculatorsForContext(context: ToolboxContext): CalculatorDefinition[] {
  return (TOOLBOX_CALCULATORS as unknown as CalculatorDefinition[]).filter(
    (calculator) => calculator.applicableRoles.includes(context.role),
  );
}

export function runCalculator<TInputs extends Record<string, unknown>>(
  calculatorId: string,
  context: ToolboxContext,
  inputs: TInputs,
): CalculatorRun {
  const calculator = (TOOLBOX_CALCULATORS as unknown as CalculatorDefinition<TInputs>[]).find(
    (item) => item.id === calculatorId,
  );
  if (!calculator) throw new Error(`Unknown calculator: ${calculatorId}`);
  return calculator.run(context, inputs);
}

export function getCalculatorFamily(familyId: string): CalculatorDefinition[] {
  return (TOOLBOX_CALCULATORS as unknown as CalculatorDefinition[]).filter(
    (calc) => calc.familyId === familyId,
  );
}
