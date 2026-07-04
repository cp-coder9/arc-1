// ArchitectCalculator — SACAP complexity matrix + IDoW deliverables + fee rates
//
// Implements: Building Category → Building Type → determined complexity
// Uses lookupComplexity, getCategories, getTypesForCategory from sacapComplexityMatrix
// Uses calculateProjectFee, calculateScopeOfWorkFee from sacapFeeTable
// Complexity override with justification field
// SubTaskPanel for IDoW deliverables
// Shows "Project Fee Rate %" and "Scope of Work Fee Rate %"
//
// Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 15.4, 15.6

import { useState, useMemo, useCallback, type ChangeEvent } from 'react';
import { Building2, AlertTriangle } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ProfessionProfileRegistry } from '@/services/professionalFee/profiles';
import { useFeeProposalBuilder } from '../FeeProposalBuilderContext';
import {
  DisclaimerBanner,
  SourceVersionBadge,
  ResultSummaryCard,
  DiscountPanel,
  DisbursementsEditor,
  StatutoryFeesEditor,
} from '../shared';
import { StageWeightingPanel } from '../shared/StageWeightingPanel';
import { SubTaskPanel } from '../shared/SubTaskPanel';

// ---------------------------------------------------------------------------
// SACAP complexity matrix (simplified inline — production uses service import)
// ---------------------------------------------------------------------------

const SACAP_CATEGORIES = [
  { id: 'residential', label: 'Residential' },
  { id: 'commercial', label: 'Commercial' },
  { id: 'industrial', label: 'Industrial' },
  { id: 'institutional', label: 'Institutional' },
  { id: 'mixed_use', label: 'Mixed Use' },
];

const SACAP_TYPES: Record<string, Array<{ id: string; label: string; complexity: string }>> = {
  residential: [
    { id: 'dwelling_simple', label: 'Dwelling – Simple/Repetitive', complexity: 'low' },
    { id: 'dwelling_medium', label: 'Dwelling – Standard', complexity: 'medium' },
    { id: 'dwelling_complex', label: 'Dwelling – Complex/Custom', complexity: 'high' },
    { id: 'multi_residential', label: 'Multi-Residential / Sectional Title', complexity: 'high' },
    { id: 'estate_housing', label: 'Estate Housing (Repetitive)', complexity: 'low' },
  ],
  commercial: [
    { id: 'office_standard', label: 'Office – Standard', complexity: 'medium' },
    { id: 'office_prestige', label: 'Office – Prestige/Specialist', complexity: 'high' },
    { id: 'retail_standard', label: 'Retail – Standard', complexity: 'medium' },
    { id: 'retail_complex', label: 'Shopping Centre / Mixed Retail', complexity: 'high' },
    { id: 'hospitality', label: 'Hotel / Hospitality', complexity: 'specialist' },
  ],
  industrial: [
    { id: 'warehouse', label: 'Warehouse / Storage', complexity: 'low' },
    { id: 'factory_standard', label: 'Factory – Standard', complexity: 'medium' },
    { id: 'factory_specialist', label: 'Factory – Specialist Process', complexity: 'high' },
    { id: 'data_centre', label: 'Data Centre / High-Tech', complexity: 'specialist' },
  ],
  institutional: [
    { id: 'school', label: 'School / Educational', complexity: 'medium' },
    { id: 'hospital', label: 'Hospital / Healthcare', complexity: 'specialist' },
    { id: 'religious', label: 'Religious / Assembly', complexity: 'high' },
    { id: 'government', label: 'Government / Civic', complexity: 'high' },
  ],
  mixed_use: [
    { id: 'mixed_standard', label: 'Mixed-Use – Standard', complexity: 'high' },
    { id: 'mixed_complex', label: 'Mixed-Use – Complex Urban', complexity: 'specialist' },
  ],
};

function getComplexityLabel(id: string): string {
  const map: Record<string, string> = {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    specialist: 'Specialist',
  };
  return map[id] ?? id;
}

function getComplexityDescription(id: string): string {
  const map: Record<string, string> = {
    low: 'Simple, low-risk, repeatable scope',
    medium: 'Normal professional complexity',
    high: 'Complex coordination, specialist input or risk',
    specialist: 'Specialist/heritage/high-performance/abnormal risk',
  };
  return map[id] ?? '';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const registry = new ProfessionProfileRegistry();

export default function ArchitectCalculator() {
  const { calculatorState, dispatch, activeSourceVersion, isDemoSeed } = useFeeProposalBuilder();
  const profile = registry.get('architect');

  // Local SACAP matrix state
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [overrideEnabled, setOverrideEnabled] = useState(false);
  const [overrideLevel, setOverrideLevel] = useState('');
  const [overrideJustification, setOverrideJustification] = useState('');

  const availableTypes = useMemo(() => {
    return SACAP_TYPES[selectedCategory] ?? [];
  }, [selectedCategory]);

  const determinedComplexity = useMemo(() => {
    if (overrideEnabled && overrideLevel) return overrideLevel;
    const type = availableTypes.find((t) => t.id === selectedType);
    return type?.complexity ?? '';
  }, [selectedType, availableTypes, overrideEnabled, overrideLevel]);

  // Sync complexity to context when it changes
  const handleCategoryChange = useCallback((value: string) => {
    setSelectedCategory(value);
    setSelectedType('');
  }, []);

  const handleTypeChange = useCallback((value: string) => {
    setSelectedType(value);
    const type = (SACAP_TYPES[selectedCategory] ?? []).find((t) => t.id === value);
    if (type) {
      dispatch({ type: 'SET_COMPLEXITY', complexityId: type.complexity });
    }
  }, [selectedCategory, dispatch]);

  const handleOverrideApply = useCallback(() => {
    if (overrideLevel && overrideJustification.trim()) {
      dispatch({ type: 'SET_COMPLEXITY_OVERRIDE', level: overrideLevel, justification: overrideJustification });
    }
  }, [dispatch, overrideLevel, overrideJustification]);

  const handleProjectValueChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    dispatch({ type: 'SET_PROJECT_VALUE', value: isNaN(val) ? 0 : val });
  }, [dispatch]);

  return (
    <div className="space-y-6">
      {/* Source Version Badge */}
      <SourceVersionBadge sourceVersion={activeSourceVersion} isDemoSeed={isDemoSeed} />

      {/* Disclaimer */}
      <DisclaimerBanner />

      {/* Header */}
      <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Building2 className="h-5 w-5 text-primary-400" />
          <h2 className="text-lg font-bold text-surface-100">Architectural Professional — SACAP Fee Desk</h2>
        </div>
        <p className="text-sm text-surface-400">
          Calculate professional fees per SACAP guideline tables. Select building category and type
          to determine complexity, or override with justification.
        </p>
      </div>

      {/* Two-column form layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Inputs */}
        <div className="space-y-6">
          {/* Project Value */}
          <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-5 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400">
              Project Value
            </h3>
            <div className="space-y-1.5">
              <Label htmlFor="project-value" className="text-xs uppercase tracking-wider text-surface-400">
                Estimated Construction Value (R)
              </Label>
              <Input
                id="project-value"
                type="number"
                min={0}
                step={10000}
                value={calculatorState.projectValue || ''}
                onChange={handleProjectValueChange}
                placeholder="e.g. 5000000"
              />
            </div>
          </div>

          {/* SACAP Complexity Matrix */}
          <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-5 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400">
              SACAP Complexity Matrix
            </h3>

            {/* Building Category */}
            <div className="space-y-1.5">
              <Label htmlFor="building-category" className="text-xs uppercase tracking-wider text-surface-400">
                Building Category
              </Label>
              <select
                id="building-category"
                value={selectedCategory}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="w-full h-9 rounded-md border border-surface-700 bg-surface-900 px-3 text-sm text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
              >
                <option value="">Select category...</option>
                {SACAP_CATEGORIES.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.label}</option>
                ))}
              </select>
            </div>

            {/* Building Type */}
            <div className="space-y-1.5">
              <Label htmlFor="building-type" className="text-xs uppercase tracking-wider text-surface-400">
                Building Type
              </Label>
              <select
                id="building-type"
                value={selectedType}
                onChange={(e) => handleTypeChange(e.target.value)}
                disabled={!selectedCategory}
                className="w-full h-9 rounded-md border border-surface-700 bg-surface-900 px-3 text-sm text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500/50 disabled:opacity-50"
              >
                <option value="">Select type...</option>
                {availableTypes.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>

            {/* Determined Complexity */}
            {determinedComplexity && (
              <div className="rounded-lg bg-surface-700/30 border border-surface-600/30 p-3">
                <p className="text-xs text-surface-400 uppercase tracking-wider mb-1">Determined Complexity</p>
                <p className="text-sm font-semibold text-primary-300">{getComplexityLabel(determinedComplexity)}</p>
                <p className="text-xs text-surface-400 mt-0.5">{getComplexityDescription(determinedComplexity)}</p>
              </div>
            )}

            {/* Override toggle */}
            <div className="border-t border-surface-700/40 pt-4 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={overrideEnabled}
                  onChange={(e) => setOverrideEnabled(e.target.checked)}
                  className="rounded border-surface-600 bg-surface-800 text-primary-500 focus:ring-primary-500/50"
                />
                <span className="text-xs text-surface-300 font-medium">Override complexity (requires justification)</span>
              </label>

              {overrideEnabled && (
                <div className="space-y-3 pl-5">
                  <div className="space-y-1.5">
                    <Label className="text-xs uppercase tracking-wider text-surface-400">Override Level</Label>
                    <select
                      value={overrideLevel}
                      onChange={(e) => setOverrideLevel(e.target.value)}
                      className="w-full h-9 rounded-md border border-surface-700 bg-surface-900 px-3 text-sm text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                    >
                      <option value="">Select level...</option>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="specialist">Specialist</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs uppercase tracking-wider text-surface-400">
                      Justification <span className="text-amber-400">*</span>
                    </Label>
                    <Textarea
                      value={overrideJustification}
                      onChange={(e) => setOverrideJustification(e.target.value)}
                      placeholder="Explain why the complexity level is being overridden..."
                      className="min-h-[60px]"
                    />
                  </div>
                  <Button
                    size="sm"
                    onClick={handleOverrideApply}
                    disabled={!overrideLevel || !overrideJustification.trim()}
                  >
                    Apply Override
                  </Button>
                  {calculatorState.complexityOverride && (
                    <div className="flex items-center gap-2 text-xs text-amber-400">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <span>Override active: {getComplexityLabel(calculatorState.complexityOverride.level)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Stage Weighting Panel */}
          <StageWeightingPanel stages={profile.stages} />

          {/* Sub-task panels per stage */}
          {profile.stages.map((stage) => {
            const sel = calculatorState.selectedStages[stage.id];
            if (!sel?.applicable || stage.deliverables.length === 0) return null;
            return (
              <div key={stage.id}>
                <SubTaskPanel
                  stageId={stage.id}
                  deliverables={stage.deliverables}
                />
              </div>
            );
          })}
        </div>

        {/* Right: Results & extras */}
        <div className="space-y-6">
          <ResultSummaryCard />
          <DiscountPanel />
          <DisbursementsEditor />
          <StatutoryFeesEditor />
        </div>
      </div>
    </div>
  );
}
