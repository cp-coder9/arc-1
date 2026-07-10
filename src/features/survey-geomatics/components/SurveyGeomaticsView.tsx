/**
 * Survey & Geomatics View — Main Module View
 *
 * Top-level view with tab navigation for Survey Instructions,
 * SG Diagrams, Beacon Register, and As-Built comparisons.
 * Includes persistent DisclaimerBanner (compliance type).
 *
 * Requirements: 16.1, 17.1, 18.2, 19.2, 22.4, 22.8
 */

import React, { useState } from 'react';
import { Compass } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DisclaimerBanner } from '../../p1-shared/components/DisclaimerBanner';
import type { DisclaimerConfig } from '../../p1-shared/types';
import { SurveyInstructionForm } from './SurveyInstructionForm';
import { SGDiagramTracker } from './SGDiagramTracker';
import { BeaconRegisterPanel } from './BeaconRegisterPanel';
import { AsBuiltComparisonView } from './AsBuiltComparisonView';

const DISCLAIMER_CONFIG: DisclaimerConfig = {
  module: 'survey',
  type: 'compliance',
  text: 'This module provides workflow tracking for survey instructions, SG diagram processing, and as-built comparisons. All survey work must be performed by a Professional Land Surveyor registered with PLATO. Outputs are advisory only and do not replace professional survey reports or SG-issued documents.',
};

export function SurveyGeomaticsView() {
  const [activeTab, setActiveTab] = useState('instructions');

  return (
    <div className="flex flex-col gap-6">
      <DisclaimerBanner config={DISCLAIMER_CONFIG} />

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Compass className="h-6 w-6 text-blue-400" aria-hidden="true" />
            <div>
              <CardTitle>Survey &amp; Geomatics</CardTitle>
              <CardDescription>
                Manage survey instructions, SG diagram approvals, beacon registers, and as-built comparisons
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="instructions">Instructions</TabsTrigger>
              <TabsTrigger value="sg-diagrams">SG Diagrams</TabsTrigger>
              <TabsTrigger value="beacons">Beacons</TabsTrigger>
              <TabsTrigger value="as-built">As-Built</TabsTrigger>
            </TabsList>

            <TabsContent value="instructions">
              <SurveyInstructionForm />
            </TabsContent>

            <TabsContent value="sg-diagrams">
              <SGDiagramTracker />
            </TabsContent>

            <TabsContent value="beacons">
              <BeaconRegisterPanel />
            </TabsContent>

            <TabsContent value="as-built">
              <AsBuiltComparisonView />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
