import type { Firestore } from 'firebase/firestore';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export type FeeEstimatorRole = 'architect' | 'client' | 'admin';
export type FeeProjectType = 'residential' | 'commercial' | 'industrial' | 'renovation' | 'interior' | 'landscape';
export type FeeComplexity = 'low' | 'medium' | 'high';
export type FeeServiceStage = 'inception' | 'concept' | 'design' | 'council' | 'documentation' | 'construction' | 'closeout';
export type FeeDeliverable = 'conceptDesign' | 'councilSubmission' | 'constructionDrawings' | '3dVisuals' | 'siteInspections' | 'tenderSupport';

export interface FeeStageSetting {
  id: FeeServiceStage;
  label: string;
  description: string;
  weighting: number;
}

export interface FeeEstimatorSettings {
  version: string;
  baseFeePercentByProjectType: Record<FeeProjectType, number>;
  complexityMultipliers: Record<FeeComplexity, number>;
  stageWeightings: FeeStageSetting[];
  deliverableFees: Record<FeeDeliverable, number>;
  municipalityMultipliers: Record<string, number>;
  urgencyMultipliers: Record<'standard' | 'urgent' | 'express', number>;
  platformFeePercent: number;
  councilAdminFee: number;
  vatRate: number;
  minimumProfessionalFee: number;
  areaRateByProjectType: Record<FeeProjectType, number>;
}

export interface FeeEstimatorInput {
  projectType: FeeProjectType;
  constructionValue: number;
  areaSqm: number;
  complexity: FeeComplexity;
  municipality: string;
  urgency: 'standard' | 'urgent' | 'express';
  serviceStages: FeeServiceStage[];
  deliverables: FeeDeliverable[];
  includeCouncilAdmin: boolean;
  includePlatformFee: boolean;
  vatApplicable: boolean;
}

export interface FeeBreakdownItem {
  label: string;
  amount: number;
  note: string;
}

export interface FeeEstimateResult {
  valueOfWorks: number;
  baseProfessionalFee: number;
  stageAdjustedFee: number;
  professionalFee: number;
  deliverableTotal: number;
  councilAdminFee: number;
  platformFee: number;
  subtotalExVat: number;
  vat: number;
  total: number;
  feePercentageOfWorks: number;
  assumptions: string[];
  breakdown: FeeBreakdownItem[];
}

export const feeProjectTypeLabels: Record<FeeProjectType, string> = {
  residential: 'Residential building',
  commercial: 'Commercial / mixed-use',
  industrial: 'Industrial / warehouse',
  renovation: 'Alterations / additions',
  interior: 'Interior fit-out',
  landscape: 'Landscape / external works',
};

export const feeComplexityLabels: Record<FeeComplexity, string> = {
  low: 'Low - simple building, standard methods',
  medium: 'Medium - typical complexity and coordination',
  high: 'High - complex design, approvals or specialist coordination',
};

export const feeDeliverableLabels: Record<FeeDeliverable, string> = {
  conceptDesign: 'Concept design package',
  councilSubmission: 'Council submission pack',
  constructionDrawings: 'Construction drawing pack',
  '3dVisuals': '3D views / presentation visuals',
  siteInspections: 'Site inspections allowance',
  tenderSupport: 'Tender / procurement support',
};

export const DEFAULT_FEE_ESTIMATOR_SETTINGS: FeeEstimatorSettings = {
  version: '2026.1-architex-default',
  baseFeePercentByProjectType: {
    residential: 8.5,
    commercial: 7.5,
    industrial: 6.5,
    renovation: 10,
    interior: 9,
    landscape: 6,
  },
  complexityMultipliers: {
    low: 0.9,
    medium: 1,
    high: 1.2,
  },
  stageWeightings: [
    { id: 'inception', label: 'Stage 1 - Inception', description: 'Brief, needs assessment and appointment setup', weighting: 2 },
    { id: 'concept', label: 'Stage 2 - Concept & viability', description: 'Concept options and feasibility checks', weighting: 15 },
    { id: 'design', label: 'Stage 3 - Design development', description: 'Developed design and coordination', weighting: 20 },
    { id: 'council', label: 'Stage 4.1 - Council documentation', description: 'Local authority submission documentation', weighting: 10 },
    { id: 'documentation', label: 'Stage 4.2 - Technical documentation', description: 'Construction / procurement documentation', weighting: 20 },
    { id: 'construction', label: 'Stage 5 - Construction administration', description: 'Site-stage architectural services', weighting: 30 },
    { id: 'closeout', label: 'Stage 6 - Close out', description: 'Completion, close-out and record information', weighting: 3 },
  ],
  deliverableFees: {
    conceptDesign: 4500,
    councilSubmission: 6500,
    constructionDrawings: 12000,
    '3dVisuals': 3500,
    siteInspections: 5000,
    tenderSupport: 4500,
  },
  municipalityMultipliers: {
    johannesburg: 1.05,
    tshwane: 1.03,
    'cape town': 1.06,
    ethekwini: 1.04,
    ekurhuleni: 1.03,
    other: 1,
  },
  urgencyMultipliers: {
    standard: 1,
    urgent: 1.1,
    express: 1.2,
  },
  platformFeePercent: 5,
  councilAdminFee: 3500,
  vatRate: 15,
  minimumProfessionalFee: 7500,
  areaRateByProjectType: {
    residential: 9500,
    commercial: 12500,
    industrial: 8500,
    renovation: 7000,
    interior: 6500,
    landscape: 2200,
  },
};

export const DEFAULT_FEE_ESTIMATOR_INPUT: FeeEstimatorInput = {
  projectType: 'residential',
  constructionValue: 1500000,
  areaSqm: 160,
  complexity: 'medium',
  municipality: 'Johannesburg',
  urgency: 'standard',
  serviceStages: ['inception', 'concept', 'design', 'council', 'documentation'],
  deliverables: ['conceptDesign', 'councilSubmission', 'constructionDrawings'],
  includeCouncilAdmin: true,
  includePlatformFee: true,
  vatApplicable: false,
};

const SETTINGS_DOC_PATH = ['system_settings', 'feeEstimator'] as const;

function cleanNumber(value: number, fallback = 0) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function sanitizeNonNegativeNumber(value: unknown, fallback = 0) {
  const numericValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numericValue) ? Math.max(numericValue, 0) : fallback;
}

function sanitizeNumberRecord<T extends string>(values: Record<T, number>, defaults: Record<T, number>) {
  return (Object.keys(defaults) as T[]).reduce((sanitized, key) => {
    sanitized[key] = sanitizeNonNegativeNumber(values[key], defaults[key]);
    return sanitized;
  }, {} as Record<T, number>);
}

export function mergeFeeEstimatorSettings(settings?: Partial<FeeEstimatorSettings> | null): FeeEstimatorSettings {
  if (!settings) return DEFAULT_FEE_ESTIMATOR_SETTINGS;
  return {
    ...DEFAULT_FEE_ESTIMATOR_SETTINGS,
    ...settings,
    baseFeePercentByProjectType: {
      ...DEFAULT_FEE_ESTIMATOR_SETTINGS.baseFeePercentByProjectType,
      ...(settings.baseFeePercentByProjectType || {}),
    },
    complexityMultipliers: {
      ...DEFAULT_FEE_ESTIMATOR_SETTINGS.complexityMultipliers,
      ...(settings.complexityMultipliers || {}),
    },
    stageWeightings: settings.stageWeightings?.length ? settings.stageWeightings : DEFAULT_FEE_ESTIMATOR_SETTINGS.stageWeightings,
    deliverableFees: {
      ...DEFAULT_FEE_ESTIMATOR_SETTINGS.deliverableFees,
      ...(settings.deliverableFees || {}),
    },
    municipalityMultipliers: {
      ...DEFAULT_FEE_ESTIMATOR_SETTINGS.municipalityMultipliers,
      ...(settings.municipalityMultipliers || {}),
    },
    urgencyMultipliers: {
      ...DEFAULT_FEE_ESTIMATOR_SETTINGS.urgencyMultipliers,
      ...(settings.urgencyMultipliers || {}),
    },
    areaRateByProjectType: {
      ...DEFAULT_FEE_ESTIMATOR_SETTINGS.areaRateByProjectType,
      ...(settings.areaRateByProjectType || {}),
    },
  };
}

export function sanitizeFeeEstimatorSettings(settings?: Partial<FeeEstimatorSettings> | null): FeeEstimatorSettings {
  const merged = mergeFeeEstimatorSettings(settings);
  return {
    ...merged,
    baseFeePercentByProjectType: sanitizeNumberRecord(merged.baseFeePercentByProjectType, DEFAULT_FEE_ESTIMATOR_SETTINGS.baseFeePercentByProjectType),
    stageWeightings: merged.stageWeightings.map((stage) => {
      const defaultStage = DEFAULT_FEE_ESTIMATOR_SETTINGS.stageWeightings.find(item => item.id === stage.id);
      return {
        ...stage,
        weighting: sanitizeNonNegativeNumber(stage.weighting, defaultStage?.weighting || 0),
      };
    }),
    deliverableFees: sanitizeNumberRecord(merged.deliverableFees, DEFAULT_FEE_ESTIMATOR_SETTINGS.deliverableFees),
    platformFeePercent: sanitizeNonNegativeNumber(merged.platformFeePercent, DEFAULT_FEE_ESTIMATOR_SETTINGS.platformFeePercent),
    councilAdminFee: sanitizeNonNegativeNumber(merged.councilAdminFee, DEFAULT_FEE_ESTIMATOR_SETTINGS.councilAdminFee),
    vatRate: sanitizeNonNegativeNumber(merged.vatRate, DEFAULT_FEE_ESTIMATOR_SETTINGS.vatRate),
    minimumProfessionalFee: sanitizeNonNegativeNumber(merged.minimumProfessionalFee, DEFAULT_FEE_ESTIMATOR_SETTINGS.minimumProfessionalFee),
  };
}

export function estimateArchitecturalFee(input: FeeEstimatorInput, settings = DEFAULT_FEE_ESTIMATOR_SETTINGS): FeeEstimateResult {
  const merged = mergeFeeEstimatorSettings(settings);
  const derivedValue = cleanNumber(input.constructionValue) || cleanNumber(input.areaSqm) * merged.areaRateByProjectType[input.projectType];
  const valueOfWorks = Math.max(derivedValue, 0);
  const basePercent = merged.baseFeePercentByProjectType[input.projectType];
  const complexityMultiplier = merged.complexityMultipliers[input.complexity];
  const municipalityKey = input.municipality.trim().toLowerCase();
  const municipalityMultiplier = merged.municipalityMultipliers[municipalityKey] || merged.municipalityMultipliers.other || 1;
  const urgencyMultiplier = merged.urgencyMultipliers[input.urgency];
  const selectedWeighting = merged.stageWeightings
    .filter(stage => input.serviceStages.includes(stage.id))
    .reduce((sum, stage) => sum + stage.weighting, 0) / 100;
  const stageFactor = selectedWeighting > 0 ? selectedWeighting : 1;
  const baseProfessionalFee = valueOfWorks * (basePercent / 100) * complexityMultiplier * municipalityMultiplier * urgencyMultiplier;
  const stageAdjustedFee = baseProfessionalFee * stageFactor;
  const professionalFee = Math.max(stageAdjustedFee, merged.minimumProfessionalFee);
  const deliverableTotal = input.deliverables.reduce((sum, deliverable) => sum + (merged.deliverableFees[deliverable] || 0), 0);
  const councilAdminFee = input.includeCouncilAdmin ? merged.councilAdminFee : 0;
  const prePlatformSubtotal = professionalFee + deliverableTotal + councilAdminFee;
  const platformFee = input.includePlatformFee ? prePlatformSubtotal * (merged.platformFeePercent / 100) : 0;
  const subtotalExVat = prePlatformSubtotal + platformFee;
  const vat = input.vatApplicable ? subtotalExVat * (merged.vatRate / 100) : 0;
  const total = subtotalExVat + vat;

  return {
    valueOfWorks,
    baseProfessionalFee,
    stageAdjustedFee,
    professionalFee,
    deliverableTotal,
    councilAdminFee,
    platformFee,
    subtotalExVat,
    vat,
    total,
    feePercentageOfWorks: valueOfWorks > 0 ? (professionalFee / valueOfWorks) * 100 : 0,
    assumptions: [
      `Base guideline percentage: ${basePercent.toFixed(2)}% for ${feeProjectTypeLabels[input.projectType]}.`,
      `Complexity multiplier: ${complexityMultiplier.toFixed(2)} (${feeComplexityLabels[input.complexity]}).`,
      `Service-stage weighting applied: ${(stageFactor * 100).toFixed(0)}% of full service.` ,
      `Municipality factor: ${municipalityMultiplier.toFixed(2)} for ${input.municipality || 'Other'}.`,
      `Urgency factor: ${urgencyMultiplier.toFixed(2)}.`,
      'This is a planning estimate only and is not a binding professional quotation.',
    ],
    breakdown: [
      { label: 'Professional architectural fee', amount: professionalFee, note: 'Value-of-works fee adjusted for complexity, municipality, urgency and selected stages.' },
      { label: 'Optional deliverables', amount: deliverableTotal, note: 'Fixed-fee allowances for selected Architex outputs.' },
      { label: 'Council submission / admin allowance', amount: councilAdminFee, note: input.includeCouncilAdmin ? 'Indicative allowance for submission administration.' : 'Not included.' },
      { label: 'Architex platform fee', amount: platformFee, note: input.includePlatformFee ? `${merged.platformFeePercent}% of professional fee, deliverables and admin allowance.` : 'Not included.' },
      { label: 'VAT', amount: vat, note: input.vatApplicable ? `${merged.vatRate}% VAT applied.` : 'VAT excluded unless the professional is VAT registered.' },
    ],
  };
}

async function getFeeEstimatorDb(): Promise<Firestore> {
  const { db } = await import('../lib/firebase');
  return db;
}

export async function loadFeeEstimatorSettings(): Promise<FeeEstimatorSettings> {
  try {
    const db = await getFeeEstimatorDb();
    const snapshot = await getDoc(doc(db, ...SETTINGS_DOC_PATH));
    if (!snapshot.exists()) return DEFAULT_FEE_ESTIMATOR_SETTINGS;
    return sanitizeFeeEstimatorSettings(snapshot.data() as Partial<FeeEstimatorSettings>);
  } catch (error) {
    console.warn('Falling back to default fee estimator settings', error);
    return DEFAULT_FEE_ESTIMATOR_SETTINGS;
  }
}

export async function saveFeeEstimatorSettings(settings: FeeEstimatorSettings): Promise<void> {
  const db = await getFeeEstimatorDb();
  await setDoc(doc(db, ...SETTINGS_DOC_PATH), {
    ...sanitizeFeeEstimatorSettings(settings),
    updatedAt: new Date().toISOString(),
  }, { merge: true });
}
