/**
 * NHBRC Enrolment View — Main Module View
 *
 * Top-level view providing tab navigation between
 * Enrolment, Inspections, Warranty, and Builder sub-views.
 * Includes a compliance DisclaimerBanner.
 *
 * Requirements: 11.1, 22.3, 22.7
 */

import React, { useState } from 'react';
import { ClipboardCheck, HardHat, Shield, UserCheck } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DisclaimerBanner } from '@/features/p1-shared/components/DisclaimerBanner';
import type { DisclaimerConfig } from '@/features/p1-shared/types';
import { EnrolmentChecklist } from './EnrolmentChecklist';
import { FeeCalculator } from './FeeCalculator';
import { InspectionTrackerView } from './InspectionTrackerView';
import { WarrantyClaimForm } from './WarrantyClaimForm';
import { WarrantyClaimsList } from './WarrantyClaimsList';
import { BuilderVerificationPanel } from './BuilderVerificationPanel';

const NHBRC_DISCLAIMER: DisclaimerConfig = {
  module: 'nhbrc',
  text: 'This module provides workflow support for NHBRC enrolment, inspections, and warranty claims. It does not replace formal NHBRC processes. All enrolments, inspection outcomes, and claims must be confirmed with the NHBRC directly.',
  type: 'compliance',
};

export interface NHBRCEnrolmentViewProps {
  projectId?: string;
}

export function NHBRCEnrolmentView({ projectId }: NHBRCEnrolmentViewProps) {
  const [activeTab, setActiveTab] = useState('enrolment');

  return (
    <div className="space-y-6">
      <DisclaimerBanner config={NHBRC_DISCLAIMER} />

      <Card className="bg-slate-900/70 border-slate-700/50">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-slate-100">
            NHBRC Enrolment & Compliance
          </CardTitle>
          <CardDescription className="text-slate-400">
            Manage project enrolment readiness, inspections, warranty claims, and builder verification.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="bg-slate-800/60 border border-slate-700/50">
              <TabsTrigger value="enrolment" className="gap-1.5">
                <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                Enrolment
              </TabsTrigger>
              <TabsTrigger value="inspections" className="gap-1.5">
                <HardHat className="h-4 w-4" aria-hidden="true" />
                Inspections
              </TabsTrigger>
              <TabsTrigger value="warranty" className="gap-1.5">
                <Shield className="h-4 w-4" aria-hidden="true" />
                Warranty
              </TabsTrigger>
              <TabsTrigger value="builder" className="gap-1.5">
                <UserCheck className="h-4 w-4" aria-hidden="true" />
                Builder
              </TabsTrigger>
            </TabsList>

            <TabsContent value="enrolment">
              <div className="space-y-6 pt-4">
                <EnrolmentChecklist projectId={projectId} />
                <FeeCalculator />
              </div>
            </TabsContent>

            <TabsContent value="inspections">
              <div className="pt-4">
                <InspectionTrackerView projectId={projectId} />
              </div>
            </TabsContent>

            <TabsContent value="warranty">
              <div className="space-y-6 pt-4">
                <WarrantyClaimForm projectId={projectId} />
                <WarrantyClaimsList projectId={projectId} />
              </div>
            </TabsContent>

            <TabsContent value="builder">
              <div className="pt-4">
                <BuilderVerificationPanel projectId={projectId} />
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
