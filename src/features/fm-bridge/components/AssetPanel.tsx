/**
 * FM Bridge — Asset Panel Component
 *
 * Displays the asset register with metrics summary cards, filterable table,
 * CSV import functionality, and per-row condition updates.
 * Role-gated: only building_owner and facility_manager can create/edit.
 *
 * Requirements: 2.1–2.6
 */

import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  Filter,
  Package,
  Plus,
  Upload,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { UserProfile } from '@/types';
import type { AssetCategory, AssetCondition, AssetItem, FMBuildingRole } from '../types';

// ─── Props ────────────────────────────────────────────────────────────────────

interface AssetPanelProps {
  user: UserProfile;
  buildingId: string;
  userRole: FMBuildingRole;
  assets: AssetItem[];
  onCreateAsset?: (asset: Partial<AssetItem>) => void;
  onUpdateAsset?: (assetId: string, updates: Partial<AssetItem>) => void;
  onImportCSV?: (file: File) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MODIFIABLE_ROLES: FMBuildingRole[] = ['building_owner', 'facility_manager'];

const ASSET_CATEGORIES: AssetCategory[] = [
  'structural', 'mechanical', 'electrical', 'plumbing', 'fire_protection',
  'lifts', 'security', 'finishes', 'landscaping', 'other',
];

const ASSET_CONDITIONS: AssetCondition[] = ['excellent', 'good', 'fair', 'poor', 'failed'];

const CONDITION_CONFIG: Record<AssetCondition, { label: string; className: string }> = {
  excellent: { label: 'Excellent', className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  good: { label: 'Good', className: 'bg-green-500/20 text-green-400 border-green-500/30' },
  fair: { label: 'Fair', className: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  poor: { label: 'Poor', className: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  failed: { label: 'Failed', className: 'bg-red-500/20 text-red-400 border-red-500/30' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(value: number | undefined): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(value);
}

function isApproachingEndOfLife(asset: AssetItem): boolean {
  if (!asset.installationDate || !asset.expectedUsefulLifeYears) return false;
  const installed = new Date(asset.installationDate);
  const endOfLife = new Date(installed);
  endOfLife.setFullYear(endOfLife.getFullYear() + asset.expectedUsefulLifeYears);
  const now = new Date();
  const remainingDays = (endOfLife.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return remainingDays > 0 && remainingDays <= 365;
}

function isInspectionOverdue(asset: AssetItem): boolean {
  if (!asset.lastInspectionDate) return true;
  const lastInspection = new Date(asset.lastInspectionDate);
  const now = new Date();
  const daysSince = (now.getTime() - lastInspection.getTime()) / (1000 * 60 * 60 * 24);
  return daysSince > 365; // overdue if last inspection was more than a year ago
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AssetPanel({
  user,
  buildingId,
  userRole,
  assets,
  onCreateAsset,
  onUpdateAsset,
  onImportCSV,
}: AssetPanelProps) {
  const canModify = MODIFIABLE_ROLES.includes(userRole);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [categoryFilter, setCategoryFilter] = useState<AssetCategory | 'all'>('all');
  const [conditionFilter, setConditionFilter] = useState<AssetCondition | 'all'>('all');

  // Computed metrics
  const metrics = useMemo(() => {
    const byCategory: Partial<Record<AssetCategory, number>> = {};
    let totalReplacementValue = 0;
    let approachingEOL = 0;
    let poorOrFailed = 0;
    let overdueInspections = 0;

    for (const asset of assets) {
      byCategory[asset.category] = (byCategory[asset.category] || 0) + 1;
      if (asset.replacementCostZAR) totalReplacementValue += asset.replacementCostZAR;
      if (isApproachingEndOfLife(asset)) approachingEOL++;
      if (asset.condition === 'poor' || asset.condition === 'failed') poorOrFailed++;
      if (isInspectionOverdue(asset)) overdueInspections++;
    }

    return { byCategory, totalReplacementValue, approachingEOL, poorOrFailed, overdueInspections };
  }, [assets]);

  // Filtered assets
  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      if (categoryFilter !== 'all' && asset.category !== categoryFilter) return false;
      if (conditionFilter !== 'all' && asset.condition !== conditionFilter) return false;
      return true;
    });
  }, [assets, categoryFilter, conditionFilter]);

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onImportCSV) {
      onImportCSV(file);
    }
    // Reset input to allow re-uploading the same file
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleConditionChange = (assetId: string, newCondition: AssetCondition) => {
    if (onUpdateAsset) {
      onUpdateAsset(assetId, { condition: newCondition });
    }
  };

  return (
    <div className="space-y-6">
      {/* Metrics Summary Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-blue-400" />
              <span className="text-xs uppercase tracking-wider text-surface-400">Total Assets</span>
            </div>
            <p className="mt-1 text-2xl font-bold text-foreground">{assets.length}</p>
            <p className="text-xs text-surface-400 mt-1">
              {Object.keys(metrics.byCategory).length} categories
            </p>
          </CardContent>
        </Card>

        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Download className="h-4 w-4 text-emerald-400" />
              <span className="text-xs uppercase tracking-wider text-surface-400">Replacement Value</span>
            </div>
            <p className="mt-1 text-2xl font-bold text-foreground">
              {formatCurrency(metrics.totalReplacementValue)}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-400" />
              <span className="text-xs uppercase tracking-wider text-surface-400">End of Life</span>
            </div>
            <p className="mt-1 text-2xl font-bold text-foreground">{metrics.approachingEOL}</p>
            <p className="text-xs text-surface-400 mt-1">within 12 months</p>
          </CardContent>
        </Card>

        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              <span className="text-xs uppercase tracking-wider text-surface-400">Poor/Failed</span>
            </div>
            <p className="mt-1 text-2xl font-bold text-foreground">{metrics.poorOrFailed}</p>
          </CardContent>
        </Card>

        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-orange-400" />
              <span className="text-xs uppercase tracking-wider text-surface-400">Overdue Inspections</span>
            </div>
            <p className="mt-1 text-2xl font-bold text-foreground">{metrics.overdueInspections}</p>
          </CardContent>
        </Card>
      </div>

      {/* Asset Register Table */}
      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-4">
          <CardTitle className="text-lg font-semibold text-foreground">Asset Register</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Filter controls */}
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-surface-400" />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as AssetCategory | 'all')}
                className="rounded-md border border-surface-700 bg-surface-800 px-2 py-1 text-xs text-foreground"
                aria-label="Filter by category"
              >
                <option value="all">All Categories</option>
                {ASSET_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  </option>
                ))}
              </select>
              <select
                value={conditionFilter}
                onChange={(e) => setConditionFilter(e.target.value as AssetCondition | 'all')}
                className="rounded-md border border-surface-700 bg-surface-800 px-2 py-1 text-xs text-foreground"
                aria-label="Filter by condition"
              >
                <option value="all">All Conditions</option>
                {ASSET_CONDITIONS.map((cond) => (
                  <option key={cond} value={cond}>
                    {cond.charAt(0).toUpperCase() + cond.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            {/* CSV Import */}
            {canModify && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleCSVUpload}
                  aria-label="Import CSV file"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="gap-1"
                >
                  <Upload className="h-4 w-4" />
                  Import CSV
                </Button>
              </>
            )}

            {/* Create Asset */}
            {canModify && onCreateAsset && (
              <Button
                size="sm"
                className="gap-1"
                onClick={() => onCreateAsset({ buildingId })}
              >
                <Plus className="h-4 w-4" />
                Add Asset
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {filteredAssets.length === 0 ? (
            <p className="text-sm text-surface-400 py-8 text-center">
              {assets.length === 0
                ? 'No assets registered. Add assets manually or import via CSV.'
                : 'No assets match the current filters.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-surface-700/50">
                    <TableHead className="text-xs uppercase tracking-wider text-surface-400">ID</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-surface-400">Description</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-surface-400">Category</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-surface-400">Location</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-surface-400">Condition</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-surface-400 text-right">Replacement Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAssets.map((asset) => (
                    <TableRow key={asset.id} className="border-surface-700/30 hover:bg-surface-700/20">
                      <TableCell className="text-xs font-mono text-surface-300">
                        {asset.assetIdentifier}
                      </TableCell>
                      <TableCell className="text-sm text-foreground max-w-[200px] truncate">
                        {asset.description}
                      </TableCell>
                      <TableCell className="text-xs text-surface-300">
                        {asset.category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                      </TableCell>
                      <TableCell className="text-xs text-surface-300 max-w-[150px] truncate">
                        {asset.locationInBuilding}
                      </TableCell>
                      <TableCell>
                        {canModify ? (
                          <select
                            value={asset.condition}
                            onChange={(e) => handleConditionChange(asset.id, e.target.value as AssetCondition)}
                            className="rounded border border-surface-700 bg-surface-800 px-2 py-0.5 text-xs text-foreground"
                            aria-label={`Update condition for ${asset.assetIdentifier}`}
                          >
                            {ASSET_CONDITIONS.map((cond) => (
                              <option key={cond} value={cond}>
                                {cond.charAt(0).toUpperCase() + cond.slice(1)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <Badge className={CONDITION_CONFIG[asset.condition].className}>
                            {CONDITION_CONFIG[asset.condition].label}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-surface-300 text-right font-mono">
                        {formatCurrency(asset.replacementCostZAR)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
