/**
 * FM Bridge — Warranty Panel Component
 *
 * Displays the warranty register with status badges, expiry countdown,
 * claim workflow UI, and add warranty form.
 *
 * Requirements: 3.1, 3.5, 3.7
 */

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileWarning,
  Plus,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type {
  FMBuildingRole,
  WarrantyCategory,
  WarrantyClaim,
  WarrantyClaimStage,
  WarrantyItem,
  WarrantyStatus,
} from '../types';

// ─── Props ────────────────────────────────────────────────────────────────────

interface WarrantyPanelProps {
  buildingId: string;
  userRole: FMBuildingRole;
  warranties?: WarrantyItem[];
  claims?: WarrantyClaim[];
  onAddWarranty?: (input: AddWarrantyInput) => void;
  onLodgeClaim?: (warrantyId: string, input: LodgeClaimInput) => void;
  onTransitionClaim?: (claimId: string, nextStage: WarrantyClaimStage) => void;
}

interface AddWarrantyInput {
  description: string;
  category: WarrantyCategory;
  supplierName: string;
  warrantyPeriodMonths: number;
  startDate: string;
}

interface LodgeClaimInput {
  defectDescription: string;
  locationInBuilding: string;
  urgency: 'routine' | 'urgent' | 'emergency';
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MODIFIABLE_ROLES: FMBuildingRole[] = ['building_owner', 'facility_manager'];

const WARRANTY_CATEGORIES: WarrantyCategory[] = [
  'structural', 'mechanical', 'electrical', 'plumbing', 'finishes', 'equipment', 'other',
];

const STATUS_CONFIG: Record<WarrantyStatus, { label: string; className: string; icon: React.ReactNode }> = {
  active: {
    label: 'Active',
    className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    icon: <ShieldCheck className="h-3 w-3" />,
  },
  expired: {
    label: 'Expired',
    className: 'bg-red-500/20 text-red-400 border-red-500/30',
    icon: <ShieldX className="h-3 w-3" />,
  },
  claimed: {
    label: 'Claimed',
    className: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    icon: <ShieldAlert className="h-3 w-3" />,
  },
  voided: {
    label: 'Voided',
    className: 'bg-surface-500/20 text-surface-400 border-surface-500/30',
    icon: <Shield className="h-3 w-3" />,
  },
};

const CLAIM_STAGE_LABELS: Record<WarrantyClaimStage, string> = {
  lodged: 'Lodged',
  acknowledged: 'Acknowledged',
  inspection_scheduled: 'Inspection Scheduled',
  rectification_in_progress: 'Rectification In Progress',
  rectified: 'Rectified',
  closed: 'Closed',
};

const CLAIM_STAGE_ORDER: WarrantyClaimStage[] = [
  'lodged', 'acknowledged', 'inspection_scheduled',
  'rectification_in_progress', 'rectified', 'closed',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calculateRemainingDays(expiryDate: string): number {
  const now = new Date();
  const expiry = new Date(expiryDate);
  const diff = expiry.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function WarrantyPanel({
  buildingId,
  userRole,
  warranties = [],
  claims = [],
  onAddWarranty,
  onLodgeClaim,
  onTransitionClaim,
}: WarrantyPanelProps) {
  const canModify = MODIFIABLE_ROLES.includes(userRole);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [claimDialogOpen, setClaimDialogOpen] = useState(false);
  const [selectedWarrantyId, setSelectedWarrantyId] = useState<string | null>(null);

  // Form state — add warranty
  const [newDescription, setNewDescription] = useState('');
  const [newCategory, setNewCategory] = useState<WarrantyCategory>('other');
  const [newSupplier, setNewSupplier] = useState('');
  const [newPeriodMonths, setNewPeriodMonths] = useState(12);
  const [newStartDate, setNewStartDate] = useState('');

  // Form state — lodge claim
  const [claimDefect, setClaimDefect] = useState('');
  const [claimLocation, setClaimLocation] = useState('');
  const [claimUrgency, setClaimUrgency] = useState<'routine' | 'urgent' | 'emergency'>('routine');

  // Summary metrics
  const metrics = useMemo(() => {
    const active = warranties.filter((w) => w.status === 'active').length;
    const expired = warranties.filter((w) => w.status === 'expired').length;
    const claimed = warranties.filter((w) => w.status === 'claimed').length;
    const expiringSoon = warranties.filter(
      (w) => w.status === 'active' && calculateRemainingDays(w.expiryDate) <= 90
    ).length;
    return { active, expired, claimed, expiringSoon };
  }, [warranties]);

  const handleAddWarranty = () => {
    if (!onAddWarranty) return;
    onAddWarranty({
      description: newDescription,
      category: newCategory,
      supplierName: newSupplier,
      warrantyPeriodMonths: newPeriodMonths,
      startDate: newStartDate,
    });
    resetAddForm();
    setAddDialogOpen(false);
  };

  const handleLodgeClaim = () => {
    if (!onLodgeClaim || !selectedWarrantyId) return;
    onLodgeClaim(selectedWarrantyId, {
      defectDescription: claimDefect,
      locationInBuilding: claimLocation,
      urgency: claimUrgency,
    });
    resetClaimForm();
    setClaimDialogOpen(false);
  };

  const resetAddForm = () => {
    setNewDescription('');
    setNewCategory('other');
    setNewSupplier('');
    setNewPeriodMonths(12);
    setNewStartDate('');
  };

  const resetClaimForm = () => {
    setClaimDefect('');
    setClaimLocation('');
    setClaimUrgency('routine');
    setSelectedWarrantyId(null);
  };

  const getNextClaimStage = (current: WarrantyClaimStage): WarrantyClaimStage | null => {
    const idx = CLAIM_STAGE_ORDER.indexOf(current);
    if (idx < 0 || idx >= CLAIM_STAGE_ORDER.length - 1) return null;
    return CLAIM_STAGE_ORDER[idx + 1];
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span className="text-xs uppercase tracking-wider text-surface-400">Active</span>
            </div>
            <p className="mt-1 text-2xl font-bold text-foreground">{metrics.active}</p>
          </CardContent>
        </Card>
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <ShieldX className="h-4 w-4 text-red-400" />
              <span className="text-xs uppercase tracking-wider text-surface-400">Expired</span>
            </div>
            <p className="mt-1 text-2xl font-bold text-foreground">{metrics.expired}</p>
          </CardContent>
        </Card>
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-400" />
              <span className="text-xs uppercase tracking-wider text-surface-400">Claimed</span>
            </div>
            <p className="mt-1 text-2xl font-bold text-foreground">{metrics.claimed}</p>
          </CardContent>
        </Card>
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-orange-400" />
              <span className="text-xs uppercase tracking-wider text-surface-400">Expiring Soon</span>
            </div>
            <p className="mt-1 text-2xl font-bold text-foreground">{metrics.expiringSoon}</p>
          </CardContent>
        </Card>
      </div>

      {/* Warranty List Header */}
      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-semibold text-foreground">Warranty Register</CardTitle>
          {canModify && (
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger render={
                <Button size="sm" className="gap-1">
                  <Plus className="h-4 w-4" />
                  Add Warranty
                </Button>
              } />
              <DialogContent className="bg-surface-900 border-surface-700">
                <DialogHeader>
                  <DialogTitle>Add Warranty Item</DialogTitle>
                </DialogHeader>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleAddWarranty();
                  }}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label htmlFor="warranty-description">Description</Label>
                    <Input
                      id="warranty-description"
                      value={newDescription}
                      onChange={(e) => setNewDescription(e.target.value)}
                      placeholder="e.g. Roof waterproofing membrane"
                      maxLength={500}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="warranty-category">Category</Label>
                    <select
                      id="warranty-category"
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value as WarrantyCategory)}
                      className="w-full rounded-md border border-surface-700 bg-surface-800 px-3 py-2 text-sm text-foreground"
                    >
                      {WARRANTY_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat.charAt(0).toUpperCase() + cat.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="warranty-supplier">Supplier / Manufacturer</Label>
                    <Input
                      id="warranty-supplier"
                      value={newSupplier}
                      onChange={(e) => setNewSupplier(e.target.value)}
                      placeholder="Supplier name"
                      maxLength={200}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="warranty-period">Period (months)</Label>
                      <Input
                        id="warranty-period"
                        type="number"
                        min={1}
                        max={240}
                        value={newPeriodMonths}
                        onChange={(e) => setNewPeriodMonths(Number(e.target.value))}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="warranty-start">Start Date</Label>
                      <Input
                        id="warranty-start"
                        type="date"
                        value={newStartDate}
                        onChange={(e) => setNewStartDate(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full">
                    Add Warranty
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          {warranties.length === 0 ? (
            <p className="text-sm text-surface-400">No warranty items registered.</p>
          ) : (
            <div className="space-y-3">
              {warranties.map((warranty) => {
                const remaining = calculateRemainingDays(warranty.expiryDate);
                const statusConfig = STATUS_CONFIG[warranty.status];
                const warrantyClaims = claims.filter((c) => c.warrantyId === warranty.id);

                return (
                  <div
                    key={warranty.id}
                    className="rounded-lg border border-surface-700/50 bg-surface-900/50 p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="truncate text-sm font-medium text-foreground">
                            {warranty.description}
                          </h4>
                          <Badge className={statusConfig.className}>
                            <span className="mr-1">{statusConfig.icon}</span>
                            {statusConfig.label}
                          </Badge>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-surface-400">
                          <span>{warranty.category}</span>
                          <span>{warranty.supplierName}</span>
                          <span>Start: {formatDate(warranty.startDate)}</span>
                          <span>Expiry: {formatDate(warranty.expiryDate)}</span>
                        </div>
                        {/* Expiry countdown for active warranties */}
                        {warranty.status === 'active' && (
                          <div className="mt-2">
                            {remaining <= 30 ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-red-400">
                                <AlertTriangle className="h-3 w-3" />
                                {remaining} days remaining — urgent
                              </span>
                            ) : remaining <= 90 ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-400">
                                <Clock className="h-3 w-3" />
                                {remaining} days remaining
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs text-surface-400">
                                <Clock className="h-3 w-3" />
                                {remaining} days remaining
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      {/* Claim action button */}
                      {canModify && warranty.status === 'active' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedWarrantyId(warranty.id);
                            setClaimDialogOpen(true);
                          }}
                          className="shrink-0"
                        >
                          <FileWarning className="mr-1 h-3 w-3" />
                          Claim
                        </Button>
                      )}
                    </div>

                    {/* Claims for this warranty */}
                    {warrantyClaims.length > 0 && (
                      <div className="mt-3 space-y-2 border-t border-surface-700/50 pt-3">
                        <span className="text-xs font-medium uppercase tracking-wider text-surface-400">
                          Claims
                        </span>
                        {warrantyClaims.map((claim) => {
                          const nextStage = getNextClaimStage(claim.stage);
                          return (
                            <div
                              key={claim.id}
                              className="flex items-center justify-between rounded border border-surface-700/30 bg-surface-800/50 px-3 py-2"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs text-foreground">
                                  {claim.defectDescription}
                                </p>
                                <div className="mt-0.5 flex gap-2 text-xs text-surface-400">
                                  <Badge variant="outline" className="text-xs">
                                    {CLAIM_STAGE_LABELS[claim.stage]}
                                  </Badge>
                                  <span>{claim.urgency}</span>
                                  <span>{formatDate(claim.claimDate)}</span>
                                </div>
                              </div>
                              {canModify && nextStage && onTransitionClaim && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => onTransitionClaim(claim.id, nextStage)}
                                  className="ml-2 shrink-0 text-xs"
                                >
                                  → {CLAIM_STAGE_LABELS[nextStage]}
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lodge Claim Dialog */}
      <Dialog open={claimDialogOpen} onOpenChange={setClaimDialogOpen}>
        <DialogContent className="bg-surface-900 border-surface-700">
          <DialogHeader>
            <DialogTitle>Lodge Warranty Claim</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleLodgeClaim();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="claim-defect">Defect Description</Label>
              <Textarea
                id="claim-defect"
                value={claimDefect}
                onChange={(e) => setClaimDefect(e.target.value)}
                placeholder="Describe the defect..."
                maxLength={2000}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="claim-location">Location in Building</Label>
              <Input
                id="claim-location"
                value={claimLocation}
                onChange={(e) => setClaimLocation(e.target.value)}
                placeholder="e.g. Level 3, Unit 301, main bathroom"
                maxLength={500}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="claim-urgency">Urgency</Label>
              <select
                id="claim-urgency"
                value={claimUrgency}
                onChange={(e) => setClaimUrgency(e.target.value as 'routine' | 'urgent' | 'emergency')}
                className="w-full rounded-md border border-surface-700 bg-surface-800 px-3 py-2 text-sm text-foreground"
              >
                <option value="routine">Routine</option>
                <option value="urgent">Urgent</option>
                <option value="emergency">Emergency</option>
              </select>
            </div>
            <Button type="submit" className="w-full">
              Lodge Claim
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
