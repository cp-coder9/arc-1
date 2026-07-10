/**
 * Dispute Resolution View — Main Module Entry Point
 *
 * Top-level view for the Dispute Resolution module with tab navigation
 * across Claims, Timeline, Quantum, Evidence, and Adjudication sub-views.
 * Includes a legal-type DisclaimerBanner per requirement 22.2.
 *
 * Requirements: 5.3, 22.2, 22.6
 */

import React, { useState } from 'react';
import { Scale } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DisclaimerBanner } from '@/features/p1-shared/components/DisclaimerBanner';
import type { DisclaimerConfig } from '@/features/p1-shared/types';
import { ClaimsRegisterPanel } from './ClaimsRegisterPanel';
import { NoticeTimelineVisualisation } from './NoticeTimelineVisualisation';
import { QuantumAnalyserPanel } from './QuantumAnalyserPanel';
import { EvidenceSchedulePanel } from './EvidenceSchedulePanel';
import { AdjudicationWorkflowView } from './AdjudicationWorkflowView';
import type { FormalClaim, NoticeDeadline, QuantumAssessment, DelayAnalysis, EvidenceLink, Adjudication } from '../types';

const DISCLAIMER_CONFIG: DisclaimerConfig = {
  module: 'dispute',
  text: 'This module provides workflow tools for dispute management. It does not constitute legal advice. All claim submissions, notices, and adjudication decisions must be prepared and reviewed by qualified legal professionals.',
  type: 'legal',
};

export interface DisputeResolutionViewProps {
  claims: FormalClaim[];
  deadlines: NoticeDeadline[];
  quantumAssessments: QuantumAssessment[];
  delayAnalyses: DelayAnalysis[];
  evidenceItems: EvidenceLink[];
  adjudications: Adjudication[];
  onClaimSelect?: (claimId: string) => void;
  onStageTransition?: (claimId: string, targetStage: string) => void;
  onLinkEvidence?: (claimId: string, evidenceId: string) => void;
  onUnlinkEvidence?: (claimId: string, evidenceId: string) => void;
}

export function DisputeResolutionView({
  claims,
  deadlines,
  quantumAssessments,
  delayAnalyses,
  evidenceItems,
  adjudications,
  onClaimSelect,
  onStageTransition,
  onLinkEvidence,
  onUnlinkEvidence,
}: DisputeResolutionViewProps) {
  const [activeTab, setActiveTab] = useState('claims');

  return (
    <div className="flex flex-col gap-6">
      <DisclaimerBanner config={DISCLAIMER_CONFIG} />

      <Card className="bg-slate-900/70 backdrop-blur border-slate-700/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Scale className="h-6 w-6 text-blue-400" aria-hidden="true" />
            <div>
              <CardTitle className="text-xl font-bold text-slate-100">
                Dispute Resolution
              </CardTitle>
              <CardDescription className="text-slate-400">
                Formal claims management, quantum analysis, evidence linkage & adjudication
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="claims">Claims</TabsTrigger>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
              <TabsTrigger value="quantum">Quantum</TabsTrigger>
              <TabsTrigger value="evidence">Evidence</TabsTrigger>
              <TabsTrigger value="adjudication">Adjudication</TabsTrigger>
            </TabsList>

            <TabsContent value="claims">
              <ClaimsRegisterPanel
                claims={claims}
                onClaimSelect={onClaimSelect}
              />
            </TabsContent>

            <TabsContent value="timeline">
              <NoticeTimelineVisualisation
                claims={claims}
                deadlines={deadlines}
              />
            </TabsContent>

            <TabsContent value="quantum">
              <QuantumAnalyserPanel
                assessments={quantumAssessments}
                delayAnalyses={delayAnalyses}
              />
            </TabsContent>

            <TabsContent value="evidence">
              <EvidenceSchedulePanel
                evidenceItems={evidenceItems}
                claims={claims}
                onLinkEvidence={onLinkEvidence}
                onUnlinkEvidence={onUnlinkEvidence}
              />
            </TabsContent>

            <TabsContent value="adjudication">
              <AdjudicationWorkflowView
                adjudications={adjudications}
                claims={claims}
                onStageTransition={onStageTransition}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
