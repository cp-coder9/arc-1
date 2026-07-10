/**
 * FM Bridge Dashboard — Main Entry Point
 *
 * Top-level view for the Post-Occupancy & Facility Management Bridge (P2.8).
 * Provides tab navigation across: Passport, Warranties, Assets, DLP,
 * Maintenance, and Subscription management views.
 *
 * Requirements: 2.1, 2.2, 2.6
 */

import React, { useState, useMemo } from 'react';
import { Building2, Shield, Package, AlertTriangle, Wrench, CreditCard } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import type { UserProfile } from '@/types';
import type { BuildingPassport, BuildingAccessRecord, FMBuildingRole } from '../types';
import { BuildingPassportView } from './BuildingPassportView';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface FMBridgeDashboardProps {
  user: UserProfile;
  buildingId: string;
}

// ─── Permission Helpers ───────────────────────────────────────────────────────

/** Derive user's FM role from building access records */
function deriveUserRole(
  userId: string,
  accessRecords: BuildingAccessRecord[]
): FMBuildingRole | null {
  const record = accessRecords.find(
    (r) => r.userId === userId && !r.revokedAt
  );
  return record?.role ?? null;
}

/** Check if user can modify building data */
function canModifyBuilding(role: FMBuildingRole | null): boolean {
  return role === 'building_owner' || role === 'facility_manager';
}

// ─── Subscription Status Badge ────────────────────────────────────────────────

function SubscriptionBadge({ status }: { status: BuildingPassport['subscriptionStatus'] }) {
  const variants: Record<string, { label: string; className: string }> = {
    premium: { label: 'Premium', className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
    standard: { label: 'Standard', className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
    basic: { label: 'Basic', className: 'bg-slate-500/20 text-slate-400 border-slate-500/30' },
    trial: { label: 'Trial', className: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
    lapsed: { label: 'Lapsed', className: 'bg-red-500/20 text-red-400 border-red-500/30' },
  };

  const variant = variants[status] ?? variants.basic;

  return (
    <Badge className={variant.className}>
      {variant.label}
    </Badge>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FMBridgeDashboard({ user, buildingId }: FMBridgeDashboardProps) {
  const [activeTab, setActiveTab] = useState('passport');

  // TODO: Fetch building passport from API
  const passport: BuildingPassport | null = null;

  // TODO: Fetch building access records from API
  const accessRecords: BuildingAccessRecord[] = [];

  // Derive permissions from user role + building access record
  const userRole = useMemo(
    () => deriveUserRole(user.uid, accessRecords),
    [user.uid, accessRecords]
  );
  const canModify = canModifyBuilding(userRole);
  const isReadOnly = userRole === 'read_only' || passport?.subscriptionStatus === 'lapsed';

  return (
    <div className="flex flex-col gap-6">
      {/* Tool Header Card */}
      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Building2 className="h-6 w-6 text-blue-400" aria-hidden="true" />
              <div>
                <CardTitle className="text-2xl font-bold">FM Bridge</CardTitle>
                <CardDescription>
                  Post-Occupancy & Facility Management — Building {buildingId}
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {passport && <SubscriptionBadge status={passport.subscriptionStatus} />}
              {userRole && (
                <Badge variant="outline" className="text-xs uppercase tracking-wider">
                  {userRole.replace(/_/g, ' ')}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="passport">
                <Building2 className="h-4 w-4 mr-1.5" aria-hidden="true" />
                Passport
              </TabsTrigger>
              <TabsTrigger value="warranties">
                <Shield className="h-4 w-4 mr-1.5" aria-hidden="true" />
                Warranties
              </TabsTrigger>
              <TabsTrigger value="assets">
                <Package className="h-4 w-4 mr-1.5" aria-hidden="true" />
                Assets
              </TabsTrigger>
              <TabsTrigger value="dlp">
                <AlertTriangle className="h-4 w-4 mr-1.5" aria-hidden="true" />
                DLP
              </TabsTrigger>
              <TabsTrigger value="maintenance">
                <Wrench className="h-4 w-4 mr-1.5" aria-hidden="true" />
                Maintenance
              </TabsTrigger>
              <TabsTrigger value="subscription">
                <CreditCard className="h-4 w-4 mr-1.5" aria-hidden="true" />
                Subscription
              </TabsTrigger>
            </TabsList>

            <TabsContent value="passport">
              <BuildingPassportView
                user={user}
                buildingId={buildingId}
                passport={passport}
                userRole={userRole}
                canModify={canModify}
                isReadOnly={isReadOnly}
              />
            </TabsContent>

            <TabsContent value="warranties">
              {/* TODO: Wire WarrantyPanel component */}
              <PlaceholderPanel
                title="Warranty Register"
                description="Track warranties, expiry alerts, and warranty claims."
              />
            </TabsContent>

            <TabsContent value="assets">
              {/* TODO: Wire AssetPanel component */}
              <PlaceholderPanel
                title="Asset Register"
                description="Comprehensive building asset register with condition tracking."
              />
            </TabsContent>

            <TabsContent value="dlp">
              {/* TODO: Wire DLPPanel component */}
              <PlaceholderPanel
                title="Defects Liability Period"
                description="Manage DLP countdown, defect logging, and contractor notifications."
              />
            </TabsContent>

            <TabsContent value="maintenance">
              {/* TODO: Wire MaintenancePanel component */}
              <PlaceholderPanel
                title="Planned Preventive Maintenance"
                description="Scheduled maintenance calendar, task tracking, and history."
              />
            </TabsContent>

            <TabsContent value="subscription">
              {/* TODO: Wire SubscriptionPanel component */}
              <PlaceholderPanel
                title="Subscription Management"
                description="Manage your FM Bridge subscription tier and billing."
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Placeholder Panel ────────────────────────────────────────────────────────

function PlaceholderPanel({ title, description }: { title: string; description: string }) {
  return (
    <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50 mt-4">
      <CardContent className="py-12 text-center">
        <p className="text-lg font-medium text-surface-300">{title}</p>
        <p className="text-sm text-surface-500 mt-1">{description}</p>
      </CardContent>
    </Card>
  );
}
