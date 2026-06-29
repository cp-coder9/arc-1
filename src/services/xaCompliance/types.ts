// SANS 10400-XA:2021 Full Compliance Assessment Types
// Comprehensive types for the AI-guided XA Energy Compliance Tool

/** SANS 10400-XA Climate Zones (1-6) */
export type ClimateZone = 1 | 2 | 3 | 4 | 5 | 6;

/** Building orientation for primary façade */
export type Orientation = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

/** Solar-facing orientations per SANS 10400-XA */
export const SOLAR_ORIENTATIONS: Orientation[] = ['N', 'NE', 'E', 'NW', 'W'];
export const NON_SOLAR_ORIENTATIONS: Orientation[] = ['SE', 'S', 'SW'];

/** Occupancy class per SANS 10400-A */
export type OccupancyClass =
  | 'A1' | 'A2' | 'B1' | 'B2' | 'B3' | 'C1' | 'C2'
  | 'D1' | 'E1' | 'F1' | 'G1' | 'H1' | 'H2' | 'H3' | 'H4' | 'J1';

/** Data source for a field value */
export type DataSource =
  | { type: 'ai'; drawingRef: string; confidence: number; verified: boolean; verifiedBy?: string; verifiedAt?: string }
  | { type: 'manual'; enteredBy: string; enteredAt: string }
  | { type: 'passport'; field: string }
  | { type: 'derived'; from: string };

/** Component compliance status */
export type ComplianceStatus = 'pass' | 'fail' | 'check' | 'na' | 'pending';

/** A field with provenance tracking */
export interface TrackedField<T> {
  value: T;
  source: DataSource;
}

// ─── PROJECT BASICS ───────────────────────────────────────────────────────────

export interface StoreyDefinition {
  id: string;
  label: string;
  nfa: TrackedField<number>;
  use: string;
}

export interface ProjectBasics {
  city: TrackedField<string>;
  climateZone: TrackedField<ClimateZone>;
  occupancyClass: TrackedField<OccupancyClass>;
  primaryOrientation: TrackedField<Orientation>;
  storeys: StoreyDefinition[];
  totalNfa: number;
}

// ─── SHADING (XA 5.2 / Table 3) ──────────────────────────────────────────────

export interface ShadingOpening {
  id: string;
  ref: string;
  orientation: Orientation;
  heightMm: TrackedField<number>;
  projectionRequiredMm: number; // calculated
  projectionActualMm: TrackedField<number>;
  hasScreen80Pct: boolean;
  status: ComplianceStatus;
  source: DataSource;
}

export interface ShadingAssessment {
  latitude: number;
  multiplier: number;
  openings: ShadingOpening[];
  overallStatus: ComplianceStatus;
}

// ─── FENESTRATION (XA 5.3 / Table 4) ─────────────────────────────────────────

export interface FenestrationOpening {
  id: string;
  ref: string;
  storeyId: string;
  orientation: Orientation;
  widthMm: TrackedField<number>;
  heightMm: TrackedField<number>;
  areaM2: number; // calculated
  uValue: TrackedField<number>;
  shgc: TrackedField<number>;
}

export interface StoreyFenestration {
  storeyId: string;
  storeyLabel: string;
  nfa: number;
  openings: FenestrationOpening[];
  totalGlazedArea: number;
  glazingPct: number;
  avgUValue: number;
  avgShgcSolar: number;
  avgShgcNonSolar: number;
  uStatus: ComplianceStatus;
  shgcSolarStatus: ComplianceStatus;
  shgcNonSolarStatus: ComplianceStatus;
  overallStatus: ComplianceStatus;
}

export interface FenestrationAssessment {
  storeys: StoreyFenestration[];
  totalGlazedArea: number;
  overallGlazingPct: number;
  overallStatus: ComplianceStatus;
}

// ─── WALLS (XA 5.5 / Tables 6-7) ─────────────────────────────────────────────

export interface WallLayer {
  id: string;
  name: string;
  thicknessMm: number;
  conductivity?: number; // k (W/m·K)
  density?: number; // ρ (kg/m³)
  specificHeat?: number; // c (kJ/kg·K)
  rValue?: number; // direct R override (for cavities, etc.)
  source: DataSource;
}

export interface WallAssessment {
  layers: WallLayer[];
  includeRsiRse: boolean;
  metalFraming: boolean;
  thermalBreakR: number;
  category1SingleLeaf: boolean;
  nominalThicknessMm: number;
  // Calculated results
  totalR: number;
  surfaceDensity: number;
  arealHeatCapacity: number;
  crValue: number;
  classification: 'heavy' | 'light';
  requiredR: number;
  overallStatus: ComplianceStatus;
  metalBreakStatus: ComplianceStatus;
  cat1Status: ComplianceStatus;
}

// ─── ROOF (XA 5.6 / Table 8) ─────────────────────────────────────────────────

export interface RoofLayer {
  id: string;
  name: string;
  rValue: number;
  source: DataSource;
}

export interface RoofAssessment {
  layers: RoofLayer[];
  totalR: number;
  requiredR: number;
  margin: number;
  overallStatus: ComplianceStatus;
}

// ─── FLOORS (XA 5.4) ─────────────────────────────────────────────────────────

export interface FloorAssessment {
  ufhInstalled: boolean;
  suspendedFloorEnvelope: boolean;
  ufhInsulationR: TrackedField<number>;
  ufhRequiredR: number;
  suspendedR?: TrackedField<number>;
  suspendedRequiredR?: number;
  ufhStatus: ComplianceStatus;
  suspendedStatus: ComplianceStatus;
  overallStatus: ComplianceStatus;
}

// ─── HOT WATER (XA 6.1 / Tables 10-11) ───────────────────────────────────────

export type HotWaterTechnology = 'heat_pump' | 'solar_water_heater' | 'gas_instant' | 'gas_storage' | 'electric';

export interface HotWaterAssessment {
  buildingType: string;
  occupants: TrackedField<number>;
  litresPerOccupantDay: number;
  deltaT: number;
  technology: TrackedField<HotWaterTechnology>;
  supplementaryElectricPct: TrackedField<number>;
  eer: TrackedField<number>;
  // Calculated
  dailyVolume: number;
  dailyThermalKwh: number;
  annualThermalKwh: number;
  gridKwhYear: number;
  // Compliance
  electricSupplStatus: ComplianceStatus;
  storageStatus: ComplianceStatus;
  pipeRStatus: ComplianceStatus;
  technologyStatus: ComplianceStatus;
  eerStatus: ComplianceStatus;
  overallStatus: ComplianceStatus;
}

// ─── LIGHTING (XA 6.2 / Table 12) ────────────────────────────────────────────

export interface LightingFixtureZone {
  id: string;
  zone: string;
  wattage: number;
  qty: number;
  totalW: number;
}

export interface LightingAssessment {
  occupancyCode: OccupancyClass;
  lpdLimit: number;
  nfa: number;
  sensorCount: TrackedField<number>;
  internalFixtures: LightingFixtureZone[];
  externalW: number;
  totalW: number;
  lpd: number;
  areaPerSensor: number;
  lpdStatus: ComplianceStatus;
  sensorStatus: ComplianceStatus;
  overallStatus: ComplianceStatus;
}

// ─── AIR CONDITIONING (XA 6.3 / Table 13) ────────────────────────────────────

export interface AcUnit {
  id: string;
  name: string;
  type: string;
  coolingKw: number;
  heatingKw: number;
  eer: number;
  cop: number;
  minEer: number;
  status: ComplianceStatus;
}

export interface AirConAssessment {
  systemInstalled: boolean;
  units: AcUnit[];
  overallStatus: ComplianceStatus;
}

// ─── SEALING (XA 5.7) ────────────────────────────────────────────────────────

export interface SealingCheckItem {
  id: string;
  label: string;
  checked: boolean;
}

export interface SealingAssessment {
  items: SealingCheckItem[];
  completePct: number;
  overallStatus: ComplianceStatus;
}

// ─── FULL ASSESSMENT ──────────────────────────────────────────────────────────

export interface XaAssessment {
  id: string;
  projectId: string | null; // null = standalone
  projectName: string;
  revision: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  // Data
  basics: ProjectBasics;
  shading: ShadingAssessment;
  fenestration: FenestrationAssessment;
  walls: WallAssessment;
  roof: RoofAssessment;
  floors: FloorAssessment;
  hotWater: HotWaterAssessment;
  lighting: LightingAssessment;
  airCon: AirConAssessment;
  sealing: SealingAssessment;
  // AI tracking
  drawingSources: DrawingSource[];
  verificationSummary: VerificationSummary;
  // Overall
  overallStatus: ComplianceStatus;
  componentStatuses: ComponentStatus[];
}

export interface DrawingSource {
  id: string;
  name: string;
  drawingRegisterId?: string;
  uploadedAt: string;
  scannedAt?: string;
  fieldsExtracted: string[];
}

export interface VerificationSummary {
  totalFields: number;
  aiPopulated: number;
  verified: number;
  unverified: number;
  manual: number;
  avgConfidence: number;
}

export interface ComponentStatus {
  component: string;
  clause: string;
  status: ComplianceStatus;
  summary: string;
  dataSource: 'ai_verified' | 'ai_unverified' | 'manual' | 'derived';
}
