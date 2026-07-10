/**
 * Municipal Refuse Area Calculator — Type Definitions
 *
 * Data models for municipality profiles, building inputs, calculation results,
 * vehicle access, ventilation/drainage, and professional sign-off records.
 *
 * Requirements: 1.1, 1.2, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 4.1, 4.4, 5.1, 6.1, 8.3
 */

// --- Municipality Profile ---

export interface BinSize {
  capacityLitres: number; // e.g. 240, 660, 1100
  footprint: { length: number; width: number }; // metres
  label: string; // '240L Wheelie Bin'
}

export interface Municipality_Profile {
  id: string; // e.g. 'city-of-johannesburg'
  name: string; // 'City of Johannesburg'
  isFallback: boolean; // true for generic profile
  lastUpdated: string; // ISO 8601 date

  // Waste generation rates
  wasteRates: {
    residential: {
      litresPerUnitPerCycle: number; // e.g. 240
      collectionCycleDays: number; // e.g. 7
    };
    commercial: {
      litresPerSqmPerCycle: number; // e.g. 0.8
      collectionCycleDays: number;
    };
    industrial: {
      light: { litresPerSqmPerCycle: number };
      medium: { litresPerSqmPerCycle: number };
      heavy: { litresPerSqmPerCycle: number };
      collectionCycleDays: number;
    };
  };

  // Bin standards
  binStandards: {
    availableSizes: BinSize[]; // ordered smallest to largest
    maxBinsPerCollectionPoint: number; // e.g. 20
    separateWasteStreams: boolean; // if true, separate recyclable/general
    recyclableBinSizes?: BinSize[];
    generalBinSizes?: BinSize[];
  };

  // Area requirements
  areaRequirements: {
    minimumFloorArea: number; // default 4.0 m²
    minimumClearanceHeight: number | null; // null = use default 2.4m
    perBinFootprint: { length: number; width: number }; // metres
  };

  // Vehicle access
  vehicleAccess: {
    minimumRoadWidth: number | null; // metres
    turningCircleRadius: number | null; // metres
    maximumGradient: number | null; // percentage
    maximumCarryDistance: number | null; // metres
    hardstandRequired: boolean | null;
    hardstandDimensions: { length: number; width: number } | null;
  };

  // Ventilation
  ventilation: {
    type: 'natural' | 'mechanical' | null;
    naturalOpeningArea: number | null; // m² (for natural)
    mechanicalRate: number | null; // air changes per hour
  };

  // Drainage
  drainage: {
    floorGradient: number | null; // percentage
    drainDiameter: number | null; // mm
    washDownProvision: {
      required: boolean | null;
      type: string | null; // 'hose_connection' | 'tap'
      location: string | null; // relative to refuse room
    };
  };

  // Pest control
  pestControl: {
    requirements: string | null; // null = not specified
  };
}

// --- Building Inputs ---

export type BuildingType = 'residential' | 'commercial' | 'industrial' | 'mixed-use';

export type WasteCategory = 'light' | 'medium' | 'heavy';

export interface ResidentialInputs {
  unitCount: number; // 1–10,000
  averageOccupantsPerUnit: number; // 1–20
}

export interface CommercialInputs {
  grossFloorArea: number; // 1–500,000 m²
  estimatedOccupantCount: number; // 1–100,000
}

export interface IndustrialInputs {
  grossFloorArea: number; // 1–500,000 m²
  numberOfEmployees: number; // 1–50,000
  wasteGenerationCategory: WasteCategory;
}

export interface MixedUseComponent {
  type: 'residential' | 'commercial' | 'industrial';
  inputs: ResidentialInputs | CommercialInputs | IndustrialInputs;
}

export interface MixedUseInputs {
  components: MixedUseComponent[]; // at least 2
}

export type BuildingInputs =
  | { type: 'residential'; data: ResidentialInputs }
  | { type: 'commercial'; data: CommercialInputs }
  | { type: 'industrial'; data: IndustrialInputs }
  | { type: 'mixed-use'; data: MixedUseInputs };

// --- Calculation Result ---

export interface ComponentArea {
  type: 'residential' | 'commercial' | 'industrial';
  areaSqm: number;
}

export interface BinAllocation {
  binCapacityLitres: number;
  binCount: number;
  totalVolumeLitres: number;
  binLabel: string;
}

export interface VehicleAccessResult {
  minimumRoadWidth: number | null;
  turningCircleRadius: number | null;
  maximumGradient: number | null;
  maximumCarryDistance: number | null;
  hardstandRequired: boolean | null;
  hardstandDimensions: { length: number; width: number } | null;
  missingFields: string[]; // fields not specified by municipality
}

export interface VentilationResult {
  type: 'natural' | 'mechanical' | null;
  naturalOpeningArea: number | null;
  mechanicalRate: number | null;
  missingFields: string[];
}

export interface DrainageResult {
  floorGradient: number | null;
  drainDiameter: number | null;
  washDownRequired: boolean | null;
  washDownType: string | null;
  washDownLocation: string | null;
  missingFields: string[];
}

export interface Refuse_Area_Result {
  id: string; // UUID
  computedAt: string; // ISO 8601
  municipalityId: string;
  municipalityName: string;
  profileLastUpdated: string; // DD MMM YYYY formatted
  buildingType: BuildingType;
  inputs: BuildingInputs;

  // Area computation
  area: {
    totalAreaSqm: number; // rounded to 2 decimal places
    dimensions: {
      length: number; // rounded to 0.1m
      width: number;
      height: number;
    };
    minimumApplied: boolean; // true if 4.0m² minimum was enforced
    componentAreas?: ComponentArea[]; // for mixed-use
  };

  // Bin computation
  bins: {
    totalWasteVolumeLitres: number;
    generalWaste: BinAllocation;
    recyclableWaste?: BinAllocation; // only if profile separates streams
    totalFloorSpaceSqm: number; // floor space occupied by bins
  };

  // Vehicle access
  vehicleAccess: VehicleAccessResult;

  // Ventilation & drainage
  ventilation: VentilationResult;
  drainage: DrainageResult;
  pestControl: string | null;

  // Advisory
  advisoryDisclaimer: string;
}

// --- Professional Sign-Off ---

export interface Professional_Sign_Off_Record {
  id: string; // UUID
  resultId: string; // FK to Refuse_Area_Result
  timestamp: string; // ISO 8601
  uid: string; // user's unique identifier
  displayName: string;
  platformRole: string; // UserRole
  acknowledgementStatement: string; // full text confirmed
  projectId?: string;
}
