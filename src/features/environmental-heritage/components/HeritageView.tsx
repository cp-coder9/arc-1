/**
 * Environmental & Heritage — Heritage View Component
 *
 * Heritage workflow management with Section 38 trigger selection,
 * stage progression timeline, heritage authority details, HIA practitioner
 * details, permit tracking, and role-gated actions.
 *
 * Requirements: 13.1–13.7
 */

import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building,
  CheckCircle2,
  Clock,
  FileText,
  Landmark,
  MapPin,
  Plus,
  Shield,
  User,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { UserProfile } from '@/types';
import type { HeritageAssessment, HeritageStage, Section38Trigger } from '../types';
import { DisclaimerBanner } from './DisclaimerBanner';

// ─── Props ────────────────────────────────────────────────────────────────────

interface HeritageViewProps {
  user: UserProfile;
  projectId: string;
  assessments: HeritageAssessment[];
  onCreateAssessment?: (data: Partial<HeritageAssessment>) => void;
  onTransition?: (assessmentId: string, targetStage: HeritageStage) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const HERITAGE_STAGE_ORDER: HeritageStage[] = [
  'notification_submitted',
  'interim_comment_received',
  'assessment_required',
  'hia_undertaken',
  'hia_report_submitted',
  'heritage_authority_review',
  'permit_issued',
  'no_further_action_required',
];

const STAGE_LABELS: Record<HeritageStage, string> = {
  notification_submitted: 'Notification Submitted',
  interim_comment_received: 'Interim Comment',
  assessment_required: 'Assessment Required',
  hia_undertaken: 'HIA Undertaken',
  hia_report_submitted: 'HIA Report Submitted',
  heritage_authority_review: 'Authority Review',
  permit_issued: 'Permit Issued',
  no_further_action_required: 'No Further Action',
};

const STAGE_COLORS: Record<HeritageStage, string> = {
  notification_submitted: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  interim_comment_received: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  assessment_required: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  hia_undertaken: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  hia_report_submitted: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  heritage_authority_review: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  permit_issued: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  no_further_action_required: 'bg-green-500/20 text-green-400 border-green-500/30',
};

const SECTION38_TRIGGERS: { value: Section38Trigger; label: string }[] = [
  { value: 'road_wall_pipeline_300m', label: 'Road, wall, powerline, pipeline, canal >300m' },
  { value: 'development_5000sqm', label: 'Development exceeding 5 000 m²' },
  { value: 'rezoning_10000sqm', label: 'Rezoning of land >10 000 m²' },
  { value: 'character_alteration_5000sqm', label: 'Alteration of character of site >5 000 m²' },
  { value: 'other', label: 'Other Section 38 trigger' },
];

const HERITAGE_DISCLAIMER =
  'This tool assists with heritage workflow tracking only. It does not constitute legal advice or a heritage assessment. Engage a registered Heritage Impact Assessment (HIA) practitioner and comply with all NHRA Section 38 requirements.';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStageIndex(stage: HeritageStage): number {
  return HERITAGE_STAGE_ORDER.indexOf(stage);
}

function getNextStage(currentStage: HeritageStage): HeritageStage | null {
  const idx = getStageIndex(currentStage);
  if (idx < 0 || idx >= HERITAGE_STAGE_ORDER.length - 1) return null;
  return HERITAGE_STAGE_ORDER[idx + 1];
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function HeritageView({
  user,
  projectId,
  assessments,
  onCreateAssessment,
  onTransition,
}: HeritageViewProps) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedTrigger, setSelectedTrigger] = useState<Section38Trigger>('development_5000sqm');
  const [siteDescription, setSiteDescription] = useState('');
  const [heritageAuthority, setHeritageAuthority] = useState('');

  const handleCreate = () => {
    if (!onCreateAssessment) return;
    onCreateAssessment({
      projectId,
      section38Trigger: selectedTrigger,
      siteDescription,
      heritageAuthority,
    });
    setShowCreateForm(false);
    setSiteDescription('');
    setHeritageAuthority('');
  };

  return (
    <div className="space-y-6">
      {/* Disclaimer Banner */}
      <DisclaimerBanner message={HERITAGE_DISCLAIMER} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Landmark className="h-5 w-5 text-amber-400" />
            Heritage Assessments
          </h2>
          <p className="text-xs text-surface-400 mt-1">NHRA Section 38 heritage workflow management</p>
        </div>
        {onCreateAssessment && (
          <Button size="sm" className="gap-1" onClick={() => setShowCreateForm(!showCreateForm)}>
            <Plus className="h-4 w-4" />
            New Assessment
          </Button>
        )}
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-foreground">New Heritage Assessment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Section 38 Trigger Selection */}
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wider text-surface-400 font-medium">
                Section 38 Trigger
              </label>
              <div className="space-y-2">
                {SECTION38_TRIGGERS.map((trigger) => (
                  <label
                    key={trigger.value}
                    className="flex items-center gap-3 rounded-lg border border-surface-700/50 bg-surface-900/50 px-3 py-2 cursor-pointer hover:border-surface-600/70 transition-colors"
                  >
                    <input
                      type="radio"
                      name="section38trigger"
                      value={trigger.value}
                      checked={selectedTrigger === trigger.value}
                      onChange={() => setSelectedTrigger(trigger.value)}
                      className="accent-primary-500"
                    />
                    <span className="text-sm text-foreground">{trigger.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Site Description */}
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wider text-surface-400 font-medium">
                Site Description
              </label>
              <textarea
                value={siteDescription}
                onChange={(e) => setSiteDescription(e.target.value)}
                placeholder="Describe the site and proposed development..."
                maxLength={2000}
                rows={3}
                className="w-full rounded-md border border-surface-700 bg-surface-900 px-3 py-2 text-sm text-foreground placeholder:text-surface-500"
              />
            </div>

            {/* Heritage Authority */}
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wider text-surface-400 font-medium">
                Heritage Authority
              </label>
              <input
                type="text"
                value={heritageAuthority}
                onChange={(e) => setHeritageAuthority(e.target.value)}
                placeholder="e.g. SAHRA, PHRAG, Amafa"
                maxLength={200}
                className="w-full rounded-md border border-surface-700 bg-surface-900 px-3 py-2 text-sm text-foreground placeholder:text-surface-500"
              />
            </div>

            <div className="flex gap-2">
              <Button size="sm" onClick={handleCreate} disabled={!siteDescription.trim() || !heritageAuthority.trim()}>
                Submit Notification
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowCreateForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Assessment List */}
      {assessments.length === 0 ? (
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="py-12 text-center">
            <Landmark className="h-8 w-8 text-surface-500 mx-auto mb-3" />
            <p className="text-sm text-surface-400">No heritage assessments initiated for this project.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {assessments.map((assessment) => {
            const currentStageIdx = getStageIndex(assessment.currentStage);
            const nextStage = getNextStage(assessment.currentStage);
            const isTerminal = assessment.currentStage === 'permit_issued' || assessment.currentStage === 'no_further_action_required';
            const showHIADetails = currentStageIdx >= getStageIndex('assessment_required');

            return (
              <Card key={assessment.id} className="bg-surface-800/70 backdrop-blur border-surface-700/50">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
                        <FileText className="h-4 w-4 text-amber-400" />
                        {assessment.siteDescription.length > 80
                          ? assessment.siteDescription.slice(0, 80) + '…'
                          : assessment.siteDescription}
                      </CardTitle>
                      <div className="flex flex-wrap gap-3 text-xs text-surface-400">
                        <span className="flex items-center gap-1">
                          <Shield className="h-3 w-3" />
                          {SECTION38_TRIGGERS.find((t) => t.value === assessment.section38Trigger)?.label || assessment.section38Trigger}
                        </span>
                        <span className="flex items-center gap-1">
                          <Building className="h-3 w-3" />
                          {assessment.heritageAuthority}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Notified: {formatDate(assessment.notificationDate)}
                        </span>
                      </div>
                    </div>
                    <Badge className={STAGE_COLORS[assessment.currentStage]}>
                      {STAGE_LABELS[assessment.currentStage]}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Stage Progression Timeline */}
                  <div className="space-y-2">
                    <span className="text-xs uppercase tracking-wider text-surface-400 font-medium">
                      Stage Progression
                    </span>
                    <div className="flex items-center gap-1 overflow-x-auto pb-2">
                      {HERITAGE_STAGE_ORDER.map((stage, idx) => {
                        const isCurrent = stage === assessment.currentStage;
                        const isCompleted = idx < currentStageIdx;
                        const isFuture = idx > currentStageIdx;

                        return (
                          <React.Fragment key={stage}>
                            <div
                              className={`flex items-center gap-1 rounded-full px-2 py-1 text-[10px] whitespace-nowrap border transition-colors ${
                                isCurrent
                                  ? 'bg-primary-600/30 text-primary-300 border-primary-500/50'
                                  : isCompleted
                                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                  : 'bg-surface-700/30 text-surface-500 border-surface-700/30'
                              }`}
                            >
                              {isCompleted && <CheckCircle2 className="h-3 w-3" />}
                              {isCurrent && <Clock className="h-3 w-3" />}
                              {STAGE_LABELS[stage]}
                            </div>
                            {idx < HERITAGE_STAGE_ORDER.length - 1 && (
                              <ArrowRight className={`h-3 w-3 shrink-0 ${isCompleted ? 'text-emerald-500' : 'text-surface-600'}`} />
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </div>

                  {/* HIA Practitioner Details (shown when assessment_required or later) */}
                  {showHIADetails && assessment.assessmentPractitioner && (
                    <div className="rounded-lg border border-surface-700/50 bg-surface-900/50 p-3 space-y-1">
                      <span className="text-xs uppercase tracking-wider text-surface-400 font-medium flex items-center gap-1">
                        <User className="h-3 w-3" />
                        HIA Practitioner
                      </span>
                      <p className="text-sm text-foreground">{assessment.assessmentPractitioner}</p>
                    </div>
                  )}

                  {/* Permit Details */}
                  {assessment.permitReferenceNumber && (
                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-1">
                      <span className="text-xs uppercase tracking-wider text-emerald-400 font-medium flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Permit Reference
                      </span>
                      <p className="text-sm font-mono text-emerald-300">{assessment.permitReferenceNumber}</p>
                      {assessment.determinationDate && (
                        <p className="text-xs text-emerald-400/70">
                          Issued: {formatDate(assessment.determinationDate)}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Transition Action */}
                  {onTransition && !isTerminal && nextStage && (
                    <div className="flex items-center gap-2 pt-2 border-t border-surface-700/30">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onTransition(assessment.id, nextStage)}
                        className="gap-1"
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                        Advance to {STAGE_LABELS[nextStage]}
                      </Button>
                      {/* Terminal shortcuts */}
                      {assessment.currentStage === 'heritage_authority_review' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onTransition(assessment.id, 'no_further_action_required')}
                          className="gap-1 text-green-400 border-green-500/30"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          No Further Action
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
