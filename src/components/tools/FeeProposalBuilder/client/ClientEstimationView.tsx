// ClientEstimationView — Simplified inputs for client/developer fee estimation
//
// Inputs: construction value, project type, area (m²), municipality
// Displays aggregated fee ranges per profession as summary table
// Shows "indicative planning estimates only" disclaimer
//
// Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7

import { useState, useCallback, useMemo } from 'react';
import { Users, Calculator, AlertTriangle } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FeeComparisonTable } from './FeeComparisonTable';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProjectType = 'residential' | 'commercial' | 'industrial' | 'mixed_use';

interface EstimationResult {
  profession: string;
  displayName: string;
  lowEstimate: number;
  highEstimate: number;
  midEstimate: number;
}

// ---------------------------------------------------------------------------
// Simple estimator logic (delegates to feeEstimatorService patterns)
// ---------------------------------------------------------------------------

const PROFESSION_RANGES: Array<{ profession: string; displayName: string; lowPct: number; highPct: number }> = [
  { profession: 'architect', displayName: 'Architectural Professional', lowPct: 5.5, highPct: 9.0 },
  { profession: 'structuralEngineer', displayName: 'Structural Engineer', lowPct: 2.0, highPct: 4.0 },
  { profession: 'civilEngineer', displayName: 'Civil Engineer', lowPct: 1.5, highPct: 3.5 },
  { profession: 'electricalEngineer', displayName: 'Electrical Engineer', lowPct: 1.5, highPct: 3.0 },
  { profession: 'mechanicalEngineer', displayName: 'Mechanical Engineer', lowPct: 1.5, highPct: 3.0 },
  { profession: 'quantitySurveyor', displayName: 'Quantity Surveyor', lowPct: 2.0, highPct: 4.0 },
  { profession: 'constructionProjectManager', displayName: 'Project Manager / PA', lowPct: 2.5, highPct: 5.0 },
  { profession: 'townPlanner', displayName: 'Town Planner', lowPct: 0.5, highPct: 2.0 },
  { profession: 'landscapeArchitect', displayName: 'Landscape Architect', lowPct: 2.0, highPct: 4.0 },
];

function calculateEstimates(constructionValue: number): EstimationResult[] {
  return PROFESSION_RANGES.map((p) => ({
    profession: p.profession,
    displayName: p.displayName,
    lowEstimate: (constructionValue * p.lowPct) / 100,
    highEstimate: (constructionValue * p.highPct) / 100,
    midEstimate: (constructionValue * (p.lowPct + p.highPct) / 2) / 100,
  }));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ClientEstimationView() {
  const [constructionValue, setConstructionValue] = useState(0);
  const [projectType, setProjectType] = useState<ProjectType>('residential');
  const [areaSqm, setAreaSqm] = useState(0);
  const [municipality, setMunicipality] = useState('');
  const [showResults, setShowResults] = useState(false);

  const estimates = useMemo(() => {
    if (constructionValue <= 0) return [];
    return calculateEstimates(constructionValue);
  }, [constructionValue]);

  const totalLow = estimates.reduce((sum, e) => sum + e.lowEstimate, 0);
  const totalHigh = estimates.reduce((sum, e) => sum + e.highEstimate, 0);

  const handleCalculate = useCallback(() => {
    setShowResults(true);
  }, []);

  return (
    <div className="space-y-6">
      {/* Disclaimer */}
      <div
        role="alert"
        className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 backdrop-blur"
      >
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
        <p className="font-medium">
          These are <strong>indicative planning estimates only</strong>. Actual professional fees will
          vary based on scope, complexity, and negotiated terms. Always obtain formal proposals.
        </p>
      </div>

      {/* Header */}
      <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Users className="h-5 w-5 text-primary-400" />
          <h2 className="text-lg font-bold text-surface-100">What Will It Cost? — Client Fee Estimator</h2>
        </div>
        <p className="text-sm text-surface-400">
          Get a quick overview of expected professional fees for your project. Enter basic project
          details below to see estimated fee ranges for each discipline.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Inputs */}
        <div className="space-y-6">
          <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-5 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400">
              Project Details
            </h3>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-surface-400">
                Estimated Construction Value (R)
              </Label>
              <Input
                type="number"
                min={0}
                step={100000}
                value={constructionValue || ''}
                onChange={(e) => setConstructionValue(parseFloat(e.target.value) || 0)}
                placeholder="e.g. 10000000"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-surface-400">
                Project Type
              </Label>
              <select
                value={projectType}
                onChange={(e) => setProjectType(e.target.value as ProjectType)}
                className="w-full h-9 rounded-md border border-surface-700 bg-surface-900 px-3 text-sm text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
              >
                <option value="residential">Residential</option>
                <option value="commercial">Commercial</option>
                <option value="industrial">Industrial</option>
                <option value="mixed_use">Mixed Use</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-surface-400">
                Estimated Area (m²)
              </Label>
              <Input
                type="number"
                min={0}
                step={10}
                value={areaSqm || ''}
                onChange={(e) => setAreaSqm(parseFloat(e.target.value) || 0)}
                placeholder="e.g. 350"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-surface-400">
                Municipality
              </Label>
              <Input
                value={municipality}
                onChange={(e) => setMunicipality(e.target.value)}
                placeholder="e.g. City of Johannesburg"
              />
            </div>

            <Button onClick={handleCalculate} disabled={constructionValue <= 0} className="w-full mt-2">
              <Calculator className="h-4 w-4 mr-2" /> Estimate Fees
            </Button>
          </div>
        </div>

        {/* Results */}
        <div className="space-y-6">
          {showResults && estimates.length > 0 ? (
            <>
              {/* Summary */}
              <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-3">
                  Estimated Total Professional Fees
                </h3>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-white">
                    R{totalLow.toLocaleString()} — R{totalHigh.toLocaleString()}
                  </span>
                </div>
                <p className="text-xs text-surface-400 mt-2">
                  Combined fees for all disciplines based on a R{constructionValue.toLocaleString()} construction value.
                </p>
              </div>

              {/* Per-profession breakdown */}
              <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-5 space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400">
                  Per-Discipline Breakdown
                </h3>
                <div className="space-y-2">
                  {estimates.map((est) => (
                    <div key={est.profession} className="flex items-center justify-between py-2 border-b border-surface-700/30 last:border-0">
                      <span className="text-sm text-surface-200">{est.displayName}</span>
                      <span className="text-sm font-mono text-surface-300">
                        R{est.lowEstimate.toLocaleString()} — R{est.highEstimate.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Comparison */}
              <FeeComparisonTable estimates={estimates} />
            </>
          ) : (
            <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-8 text-center">
              <Calculator className="h-8 w-8 text-surface-500 mx-auto mb-2" />
              <p className="text-sm text-surface-400">
                Enter project details and click "Estimate Fees" to see results.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
