/**
 * Insurance Register — Main View
 *
 * Top-level view with tab navigation between Policies, Compliance, and Claims.
 * Includes the advisory DisclaimerBanner and uses the Architex OS shell pattern.
 *
 * Requirements: 1.2, 2.2, 3.8, 22.1
 */

import React, { useState } from 'react';
import { Shield } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DisclaimerBanner } from '@/features/p1-shared';
import type { DisclaimerConfig } from '@/features/p1-shared';
import { PolicyForm } from './PolicyForm';
import { PolicyCompliancePanel } from './PolicyCompliancePanel';
import { ClaimsNotificationForm } from './ClaimsNotificationForm';
import { ClaimsSummaryPanel } from './ClaimsSummaryPanel';
import type { InsurancePolicy, InsuranceComplianceSummary, ClaimsSummary, InsurancePolicyType } from '../types';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface InsuranceRegisterViewProps {
  projectId: string;
  policies?: InsurancePolicy[];
  complianceSummary?: InsuranceComplianceSummary;
  claimsSummary?: ClaimsSummary;
  onPolicySubmit?: (data: Record<string, unknown>) => void;
  onClaimSubmit?: (data: Record<string, unknown>) => void;
  editingPolicy?: InsurancePolicy | null;
}

// ─── Disclaimer Config ────────────────────────────────────────────────────────

const INSURANCE_DISCLAIMER: DisclaimerConfig = {
  module: 'insurance',
  type: 'advisory',
  text: 'This insurance register is provided as an administrative tracking tool only. It does not constitute insurance advice. Always consult a qualified insurance broker or underwriter for professional guidance on cover adequacy and policy selection.',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function InsuranceRegisterView({
  projectId,
  policies = [],
  complianceSummary,
  claimsSummary,
  onPolicySubmit,
  onClaimSubmit,
  editingPolicy,
}: InsuranceRegisterViewProps) {
  const [activeTab, setActiveTab] = useState('policies');

  return (
    <div className="space-y-6">
      {/* Advisory Disclaimer */}
      <DisclaimerBanner config={INSURANCE_DISCLAIMER} />

      {/* Module Header Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Shield className="h-5 w-5 text-blue-400" aria-hidden="true" />
            Insurance Register
          </CardTitle>
          <CardDescription>
            Project insurance policy tracking, compliance checking, and claims notification.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="policies">Policies</TabsTrigger>
              <TabsTrigger value="compliance">Compliance</TabsTrigger>
              <TabsTrigger value="claims">Claims</TabsTrigger>
            </TabsList>

            {/* Policies Tab */}
            <TabsContent value="policies">
              <div className="space-y-6 pt-4">
                <PolicyForm
                  onSubmit={onPolicySubmit}
                  editingPolicy={editingPolicy}
                />
                {policies.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Registered Policies ({policies.length})</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {policies.map((policy) => (
                          <div key={policy.id}>
                            <PolicyRow policy={policy} />
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>

            {/* Compliance Tab */}
            <TabsContent value="compliance">
              <div className="pt-4">
                <PolicyCompliancePanel
                  complianceSummary={complianceSummary}
                />
              </div>
            </TabsContent>

            {/* Claims Tab */}
            <TabsContent value="claims">
              <div className="space-y-6 pt-4">
                <ClaimsNotificationForm
                  policies={policies}
                  onSubmit={onClaimSubmit}
                />
                {claimsSummary && (
                  <ClaimsSummaryPanel claimsSummary={claimsSummary} />
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Inline Sub-component ─────────────────────────────────────────────────────

const POLICY_TYPE_LABELS: Record<InsurancePolicyType, string> = {
  CAR: 'Contractors All Risk',
  PI: 'Professional Indemnity',
  public_liability: 'Public Liability',
  SASRIA: 'SASRIA',
  LDI: 'Latent Defects Insurance',
};

function PolicyRow({ policy }: { policy: InsurancePolicy }) {
  const statusColors: Record<string, string> = {
    active: 'bg-green-950/40 text-green-300 border-green-700/50',
    expired: 'bg-red-950/40 text-red-300 border-red-700/50',
    cancelled: 'bg-slate-800/60 text-slate-300 border-slate-600/50',
    pending_renewal: 'bg-amber-950/40 text-amber-300 border-amber-700/50',
  };

  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-700/50 bg-slate-800/30 px-4 py-3">
      <div className="space-y-1">
        <p className="text-sm font-medium text-slate-100">
          {POLICY_TYPE_LABELS[policy.policyType]} — {policy.insurerName}
        </p>
        <p className="text-xs text-slate-400">
          {policy.policyNumber} · Expires {policy.expiryDate}
        </p>
      </div>
      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${statusColors[policy.status] || statusColors.active}`}>
        {policy.status.replace('_', ' ')}
      </span>
    </div>
  );
}
