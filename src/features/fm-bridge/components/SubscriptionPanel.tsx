/**
 * SubscriptionPanel — FM Bridge Subscription Management
 *
 * Displays current subscription status (tier, renewal date, holder),
 * tier selection cards with feature lists, upgrade/downgrade/cancel actions
 * (building_owner only), trial countdown, and renewal/reactivation prompts.
 *
 * Requirements: 7.1, 7.2, 7.5
 */

import React, { useState, useMemo } from 'react';
import {
  CreditCard,
  Crown,
  Shield,
  Star,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ArrowUpCircle,
  ArrowDownCircle,
  XCircle,
  RefreshCw,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { FMBuildingRole, FMSubscriptionTier } from '../types';
import type { SubscriptionState } from '../../p2-shared/types';

// ─── Props ────────────────────────────────────────────────────────────────────

interface SubscriptionPanelProps {
  buildingId: string;
  userRole: FMBuildingRole;
}

// ─── Tier Feature Definitions ─────────────────────────────────────────────────

interface TierDefinition {
  tier: FMSubscriptionTier;
  label: string;
  icon: React.ReactNode;
  features: string[];
  price: string;
  description: string;
}

const TIER_DEFINITIONS: TierDefinition[] = [
  {
    tier: 'basic',
    label: 'Basic',
    icon: <Shield className="h-5 w-5 text-blue-400" />,
    description: 'Essential building passport and warranty alerts',
    price: 'R 299/mo',
    features: [
      'Building Passport view-only access',
      'Warranty expiry alerts',
      'DLP tracking & countdown',
      'Read-only document archive',
    ],
  },
  {
    tier: 'standard',
    label: 'Standard',
    icon: <Star className="h-5 w-5 text-amber-400" />,
    description: 'Full asset and warranty management',
    price: 'R 599/mo',
    features: [
      'Everything in Basic',
      'Asset Register with condition tracking',
      'Warranty Register with claim lodging',
      'DLP management & defect logging',
      'Contractor notification workflow',
    ],
  },
  {
    tier: 'premium',
    label: 'Premium',
    icon: <Crown className="h-5 w-5 text-purple-400" />,
    description: 'Complete facility management suite',
    price: 'R 999/mo',
    features: [
      'Everything in Standard',
      'Planned Preventive Maintenance scheduler',
      'Maintenance history & calendar view',
      'Full reporting & analytics',
      'Bulk asset import (CSV)',
      'Priority support',
    ],
  },
];

// ─── Demo State ───────────────────────────────────────────────────────────────

function createDemoSubscription(buildingId: string): SubscriptionState {
  const now = new Date();
  const trialStart = new Date(now);
  trialStart.setDate(trialStart.getDate() - 60);
  const trialEnd = new Date(trialStart);
  trialEnd.setDate(trialEnd.getDate() + 90);

  return {
    id: `sub_${buildingId}_001`,
    entityType: 'building',
    entityId: buildingId,
    tier: 'premium',
    status: 'trial',
    trialStartDate: trialStart.toISOString(),
    trialEndDate: trialEnd.toISOString(),
    currentPeriodStart: trialStart.toISOString(),
    currentPeriodEnd: trialEnd.toISOString(),
    billingCycle: 'monthly',
    holderId: 'user_owner_001',
    createdAt: trialStart.toISOString(),
    updatedAt: now.toISOString(),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calculateDaysRemaining(endDate: string): number {
  const end = new Date(endDate);
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function getStatusBadge(status: SubscriptionState['status']): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } {
  switch (status) {
    case 'trial':
      return { label: 'Trial', variant: 'secondary' };
    case 'active':
      return { label: 'Active', variant: 'default' };
    case 'past_due':
      return { label: 'Past Due', variant: 'destructive' };
    case 'cancelled':
      return { label: 'Cancelled', variant: 'destructive' };
    case 'archived':
      return { label: 'Archived', variant: 'outline' };
  }
}

function getTierIndex(tier: string): number {
  const tiers: string[] = ['basic', 'standard', 'premium'];
  return tiers.indexOf(tier);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SubscriptionPanel({ buildingId, userRole }: SubscriptionPanelProps) {
  const [subscription] = useState<SubscriptionState>(() => createDemoSubscription(buildingId));
  const [selectedTier, setSelectedTier] = useState<FMSubscriptionTier | null>(null);

  const isOwner = userRole === 'building_owner';
  const statusBadge = getStatusBadge(subscription.status);
  const currentTierDef = TIER_DEFINITIONS.find((t) => t.tier === subscription.tier);

  const daysRemaining = useMemo(() => {
    if (subscription.status === 'trial' && subscription.trialEndDate) {
      return calculateDaysRemaining(subscription.trialEndDate);
    }
    return calculateDaysRemaining(subscription.currentPeriodEnd);
  }, [subscription]);

  const isLapsed = subscription.status === 'past_due' || subscription.status === 'cancelled';

  // ─── Handlers ─────────────────────────────────────────────────────────────

  function handleUpgrade(tier: FMSubscriptionTier) {
    setSelectedTier(tier);
    // In production, this would trigger the subscription engine
  }

  function handleDowngrade(tier: FMSubscriptionTier) {
    setSelectedTier(tier);
    // In production, downgrade effective at next billing cycle
  }

  function handleCancel() {
    // In production, cancel effective at current billing cycle end
  }

  function handleReactivate() {
    // In production, reactivation restores full access on payment
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Current Subscription Status */}
      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-lg font-semibold text-surface-100 flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary-400" />
            Subscription
          </CardTitle>
          <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Current Tier */}
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wider text-surface-400">Current Tier</p>
              <div className="flex items-center gap-2">
                {currentTierDef?.icon}
                <span className="text-sm font-medium text-surface-100">
                  {currentTierDef?.label ?? subscription.tier}
                </span>
              </div>
            </div>

            {/* Renewal / Trial End Date */}
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wider text-surface-400">
                {subscription.status === 'trial' ? 'Trial Ends' : 'Renewal Date'}
              </p>
              <p className="text-sm text-surface-200">
                {new Date(subscription.status === 'trial' && subscription.trialEndDate
                  ? subscription.trialEndDate
                  : subscription.currentPeriodEnd
                ).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>

            {/* Subscription Holder */}
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wider text-surface-400">Holder</p>
              <p className="text-sm text-surface-200">{subscription.holderId}</p>
            </div>
          </div>

          {/* Trial Countdown */}
          {subscription.status === 'trial' && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <Clock className="h-4 w-4 text-amber-400 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-300">
                  {daysRemaining} days remaining in trial
                </p>
                <p className="text-xs text-amber-400/70">
                  Activate a subscription before your trial expires to retain full access.
                </p>
              </div>
            </div>
          )}

          {/* Lapsed / Renewal Prompt */}
          {isLapsed && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-300">
                  {subscription.status === 'past_due'
                    ? 'Payment overdue — access restricted to read-only'
                    : 'Subscription cancelled — data preserved in read-only mode'}
                </p>
                <p className="text-xs text-red-400/70">
                  Reactivate your subscription to restore full building management access.
                </p>
              </div>
              {isOwner && (
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 border-red-500/50 text-red-300 hover:bg-red-500/20"
                  onClick={handleReactivate}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Reactivate
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tier Selection Cards */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-surface-300 uppercase tracking-wider">
          Available Plans
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {TIER_DEFINITIONS.map((tierDef) => {
            const isCurrentTier = tierDef.tier === subscription.tier;
            const tierIdx = getTierIndex(tierDef.tier);
            const currentIdx = getTierIndex(subscription.tier);
            const isUpgrade = tierIdx > currentIdx;
            const isDowngrade = tierIdx < currentIdx;
            const isSelected = selectedTier === tierDef.tier;

            return (
              <Card
                key={tierDef.tier}
                className={`relative transition-all ${
                  isCurrentTier
                    ? 'bg-primary-900/30 border-primary-500/50 ring-1 ring-primary-500/30'
                    : isSelected
                      ? 'bg-surface-800/70 border-primary-400/40'
                      : 'bg-surface-800/70 border-surface-700/50 hover:border-surface-600/70'
                }`}
              >
                {isCurrentTier && (
                  <div className="absolute -top-2.5 left-4">
                    <Badge variant="default" className="text-xs">Current Plan</Badge>
                  </div>
                )}
                <CardHeader className="pb-2 pt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {tierDef.icon}
                      <CardTitle className="text-base font-semibold text-surface-100">
                        {tierDef.label}
                      </CardTitle>
                    </div>
                    <span className="text-sm font-bold text-primary-300">{tierDef.price}</span>
                  </div>
                  <p className="text-xs text-surface-400 mt-1">{tierDef.description}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="space-y-1.5">
                    {tierDef.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-xs text-surface-300">
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Action buttons (building_owner only) */}
                  {isOwner && !isCurrentTier && (
                    <div className="pt-2">
                      {isUpgrade && (
                        <Button
                          size="sm"
                          className="w-full"
                          onClick={() => handleUpgrade(tierDef.tier)}
                        >
                          <ArrowUpCircle className="h-3.5 w-3.5 mr-1.5" />
                          Upgrade
                        </Button>
                      )}
                      {isDowngrade && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full"
                          onClick={() => handleDowngrade(tierDef.tier)}
                        >
                          <ArrowDownCircle className="h-3.5 w-3.5 mr-1.5" />
                          Downgrade
                        </Button>
                      )}
                    </div>
                  )}

                  {isCurrentTier && isOwner && (
                    <div className="pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full border-red-500/40 text-red-400 hover:bg-red-500/10"
                        onClick={handleCancel}
                      >
                        <XCircle className="h-3.5 w-3.5 mr-1.5" />
                        Cancel Subscription
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Non-owner info notice */}
      {!isOwner && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-800/50 border border-surface-700/50">
          <Shield className="h-4 w-4 text-surface-400 shrink-0" />
          <p className="text-xs text-surface-400">
            Only the building owner can manage subscription settings. Contact the building owner to make changes.
          </p>
        </div>
      )}
    </div>
  );
}
