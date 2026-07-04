/**
 * Environmental & Heritage Module — EA Tracker View Component
 *
 * Displays EA application list, stage progression timeline, regulatory
 * timeframe display with countdown, and role-gated create/advance actions.
 *
 * Requirements: 16.1, 16.2, 16.4
 */

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Plus,
  Scale,
  Timer,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DisclaimerBanner } from '@/features/p1-shared/components/DisclaimerBanner';
import type { UserProfile } from '@/types';
import type { EAApplication, EAStage, AssessmentType, SelectedActivity } from '../types';
import {
  getPermittedTransitions,
  calculateRegulatoryTimeframes,
  type RegulatoryTimeframeStatus,
} from '../services/eaTracker';

// ─── Props ────────────────────────────────────────────────────────────────────

interface EATrackerViewProps {
  user: UserProfile;
  projectId: string;
  applications?: EAApplication[];
  onCreateApplication?: (input: CreateEAApplicationInput) => void;
  onAdvanceStage?: (applicationId: string, targetStage: EAStage) => void;
}

export interface CreateEAApplicationInput {
  applicationReferenceNumber: string;
  applicantName: string;
  eapName: string;
  eapRegistrationNumber: string;
  assessmentType: 'basic_assessment' | 'scoping_and_eir';
  competentAuthority: string;
  applicationSubmissionDate: string;
}

// ─── Role-Gating ──────────────────────────────────────────────────────────────

const PERMITTED_ROLES = [
  'town_planner', 'developer', 'architect', 'bep', 'energy_professional', 'platform_admin',
] as const;

type PermittedRole = (typeof PERMITTED_ROLES)[number];

function hasPermission(role: string): boolean {
  return (PERMITTED_ROLES as readonly string[]).includes(role);
}

// ─── Stage Display Config ─────────────────────────────────────────────────────

const STAGE_LABELS: Record<EAStage, string> = {
  pre_application: 'Pre-Application',
  application_submitted: 'Application Submitted',
  acknowledgement_received: 'Acknowledgement Received',
  public_participation: 'Public Participation',
  comments_period_closed: 'Comments Period Closed',
  specialist_studies: 'Specialist Studies',
  bar_submitted: 'BAR Submitted',
  authority_review: 'Authority Review',
  decision_issued: 'Decision Issued',
  appeal_period: 'Appeal Period',
  ea_granted: 'EA Granted',
  ea_refused: 'EA Refused',
  appeal_lodged: 'Appeal Lodged',
  appeal_decision: 'Appeal Decision',
  scoping_report_submitted: 'Scoping Report Submitted',
  authority_acceptance_scoping: 'Authority Acceptance (Scoping)',
  eir_submitted: 'EIR Submitted',
};

const BASIC_ASSESSMENT_STAGES: EAStage[] = [
  'pre_application', 'application_submitted', 'acknowledgement_received',
  'public_participation', 'comments_period_closed', 'specialist_studies',
  'bar_submitted', 'authority_review', 'decision_issued',
];

const SCOPING_EIR_STAGES: EAStage[] = [
  'pre_application', 'scoping_report_submitted', 'authority_acceptance_scoping',
  'specialist_studies', 'eir_submitted', 'authority_review', 'decision_issued',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getDecisionBadge(outcome?: 'ea_granted' | 'ea_refused') {
  if (outcome === 'ea_granted') {
    return (
      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
        <CheckCircle2 className="mr-1 h-3 w-3" />
        Granted
      </Badge>
    );
  }
  if (outcome === 'ea_refused') {
    return (
      <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
        <XCircle className="mr-1 h-3 w-3" />
        Refused
      </Badge>
    );
  }
  return null;
}

// ─── Disclaimer Config ────────────────────────────────────────────────────────

const EA_DISCLAIMER = {
  module: 'survey' as const,
  type: 'advisory' as const,
  text: 'Environmental Authorisation tracking is advisory. Actual regulatory timeframes and requirements must be confirmed with the competent authority. This tool does not constitute legal advice regarding NEMA compliance.',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function EATrackerView({
  user,
  projectId,
  applications = [],
  onCreateApplication,
  onAdvanceStage,
}: EATrackerViewProps) {
  const canModify = hasPermission(user.role);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Form state
  const [formRef, setFormRef] = useState('');
  const [formApplicant, setFormApplicant] = useState('');
  const [formEapName, setFormEapName] = useState('');
  const [formEapReg, setFormEapReg] = useState('');
  const [formAssessmentType, setFormAssessmentType] = useState<'basic_assessment' | 'scoping_and_eir'>('basic_assessment');
  const [formAuthority, setFormAuthority] = useState('');
  const [formSubmissionDate, setFormSubmissionDate] = useState('');

  const handleCreate = () => {
    if (!onCreateApplication) return;
    onCreateApplication({
      applicationReferenceNumber: formRef,
      applicantName: formApplicant,
      eapName: formEapName,
      eapRegistrationNumber: formEapReg,
      assessmentType: formAssessmentType,
      competentAuthority: formAuthority,
      applicationSubmissionDate: formSubmissionDate,
    });
    resetForm();
    setCreateDialogOpen(false);
  };

  const resetForm = () => {
    setFormRef('');
    setFormApplicant('');
    setFormEapName('');
    setFormEapReg('');
    setFormAssessmentType('basic_assessment');
    setFormAuthority('');
    setFormSubmissionDate('');
  };

  return (
    <div className="space-y-6">
      {/* Disclaimer Banner — Req 16.7 */}
      <DisclaimerBanner config={EA_DISCLAIMER} />

      {/* Header with Create action */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">EA Applications</h2>
        {canModify && (
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1">
                <Plus className="h-4 w-4" />
                New Application
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-surface-900 border-surface-700 max-w-lg">
              <DialogHeader>
                <DialogTitle>Create EA Application</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleCreate();
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="ea-ref">Application Reference Number</Label>
                  <Input
                    id="ea-ref"
                    value={formRef}
                    onChange={(e) => setFormRef(e.target.value)}
                    placeholder="DEA/EIA/0001234/2025"
                    maxLength={100}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ea-applicant">Applicant Name</Label>
                  <Input
                    id="ea-applicant"
                    value={formApplicant}
                    onChange={(e) => setFormApplicant(e.target.value)}
                    maxLength={200}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="ea-eap-name">EAP Name</Label>
                    <Input
                      id="ea-eap-name"
                      value={formEapName}
                      onChange={(e) => setFormEapName(e.target.value)}
                      maxLength={200}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ea-eap-reg">EAP Registration No.</Label>
                    <Input
                      id="ea-eap-reg"
                      value={formEapReg}
                      onChange={(e) => setFormEapReg(e.target.value)}
                      maxLength={200}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ea-type">Assessment Type</Label>
                  <select
                    id="ea-type"
                    value={formAssessmentType}
                    onChange={(e) => setFormAssessmentType(e.target.value as 'basic_assessment' | 'scoping_and_eir')}
                    className="w-full rounded-md border border-surface-700 bg-surface-800 px-3 py-2 text-sm text-foreground"
                  >
                    <option value="basic_assessment">Basic Assessment</option>
                    <option value="scoping_and_eir">Scoping &amp; EIR</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ea-authority">Competent Authority</Label>
                  <Input
                    id="ea-authority"
                    value={formAuthority}
                    onChange={(e) => setFormAuthority(e.target.value)}
                    placeholder="DFFE or provincial department"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ea-date">Application Submission Date</Label>
                  <Input
                    id="ea-date"
                    type="date"
                    value={formSubmissionDate}
                    onChange={(e) => setFormSubmissionDate(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full">
                  Create Application
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Application List */}
      {applications.length === 0 ? (
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="p-6 text-center">
            <FileText className="mx-auto h-8 w-8 text-surface-500" />
            <p className="mt-2 text-sm text-surface-400">
              No EA applications tracked for this project.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {applications.map((app) => (
            <EAApplicationCard
              key={app.id}
              application={app}
              canModify={canModify}
              onAdvanceStage={onAdvanceStage}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── EA Application Card ──────────────────────────────────────────────────────

interface EAApplicationCardProps {
  application: EAApplication;
  canModify: boolean;
  onAdvanceStage?: (applicationId: string, targetStage: EAStage) => void;
}

function EAApplicationCard({ application, canModify, onAdvanceStage }: EAApplicationCardProps) {
  const assessmentLabel =
    application.assessmentType === 'basic_assessment' ? 'Basic Assessment' : 'Scoping & EIR';

  // Compute regulatory timeframes
  const timeframes = useMemo(() => {
    const result = calculateRegulatoryTimeframes(application, new Date());
    return result.success ? result.data : [];
  }, [application]);

  // Get permitted next stages
  const permittedNext = useMemo(() => {
    if (!application.assessmentType || application.assessmentType === 'none') return [];
    const result = getPermittedTransitions(
      application.assessmentType as 'basic_assessment' | 'scoping_and_eir',
      application.currentStage,
    );
    return result.success ? result.data : [];
  }, [application]);

  // Stage sequence for the timeline
  const stageSequence =
    application.assessmentType === 'basic_assessment' ? BASIC_ASSESSMENT_STAGES : SCOPING_EIR_STAGES;

  const currentIdx = stageSequence.indexOf(application.currentStage);

  return (
    <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base font-semibold text-foreground">
              {application.applicationReferenceNumber}
            </CardTitle>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-surface-400">
              <span>{assessmentLabel}</span>
              <span>{application.competentAuthority}</span>
              <span>EAP: {application.eapName}</span>
              <span>Submitted: {formatDate(application.applicationSubmissionDate)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {getDecisionBadge(application.decisionOutcome)}
            <Badge variant="outline" className="text-xs">
              {STAGE_LABELS[application.currentStage] || application.currentStage}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stage Progression Timeline */}
        <div className="space-y-2">
          <span className="text-xs font-medium uppercase tracking-wider text-surface-400">
            Stage Progression
          </span>
          <div className="flex items-center gap-1 overflow-x-auto pb-2">
            {stageSequence.map((stage, idx) => {
              const isCompleted = idx < currentIdx;
              const isCurrent = idx === currentIdx;
              return (
                <div key={stage} className="flex items-center">
                  <div
                    className={`flex items-center justify-center rounded-full text-[10px] font-medium h-6 min-w-6 px-1.5 ${
                      isCompleted
                        ? 'bg-emerald-500/30 text-emerald-400 border border-emerald-500/50'
                        : isCurrent
                          ? 'bg-primary/30 text-primary border border-primary/50'
                          : 'bg-surface-700/30 text-surface-500 border border-surface-600/30'
                    }`}
                    title={STAGE_LABELS[stage]}
                  >
                    {idx + 1}
                  </div>
                  {idx < stageSequence.length - 1 && (
                    <div
                      className={`h-px w-3 ${
                        isCompleted ? 'bg-emerald-500/50' : 'bg-surface-600/30'
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-surface-400">
            Current: <span className="text-foreground">{STAGE_LABELS[application.currentStage]}</span>
          </p>
        </div>

        {/* Regulatory Timeframe Display — Req 16.4 */}
        {timeframes.length > 0 && (
          <div className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-wider text-surface-400">
              Regulatory Timeframes
            </span>
            <div className="grid gap-2 md:grid-cols-2">
              {timeframes.map((tf) => (
                <TimeframeIndicator key={tf.stage} timeframe={tf} />
              ))}
            </div>
          </div>
        )}

        {/* Advance Actions — role-gated */}
        {canModify && permittedNext.length > 0 && onAdvanceStage && (
          <div className="flex flex-wrap gap-2 border-t border-surface-700/50 pt-3">
            <span className="mr-2 text-xs text-surface-400 self-center">Advance to:</span>
            {permittedNext.map((stage) => (
              <Button
                key={stage}
                size="sm"
                variant="outline"
                onClick={() => onAdvanceStage(application.id, stage)}
                className="text-xs"
              >
                {STAGE_LABELS[stage] || stage}
              </Button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Timeframe Indicator ──────────────────────────────────────────────────────

interface TimeframeIndicatorProps {
  timeframe: RegulatoryTimeframeStatus;
}

function TimeframeIndicator({ timeframe }: TimeframeIndicatorProps) {
  const { stage, prescribedDays, elapsedDays, daysRemaining, isOverdue, warningActive } = timeframe;

  const stageLabel = stage === 'authority_decision'
    ? 'Authority Decision'
    : stage === 'scoping_acceptance'
      ? 'Scoping Acceptance'
      : 'EIR Decision';

  const progressPercent = Math.min((elapsedDays / prescribedDays) * 100, 100);

  return (
    <div
      className={`rounded-lg border px-3 py-2 ${
        isOverdue
          ? 'border-red-500/50 bg-red-950/20'
          : warningActive
            ? 'border-amber-500/50 bg-amber-950/20'
            : 'border-surface-700/50 bg-surface-900/50'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">{stageLabel}</span>
        {isOverdue ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-red-400">
            <AlertTriangle className="h-3 w-3" />
            Overdue
          </span>
        ) : warningActive ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-400">
            <Timer className="h-3 w-3" />
            {daysRemaining}d left
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-surface-400">
            <Clock className="h-3 w-3" />
            {daysRemaining}d left
          </span>
        )}
      </div>
      <div className="mt-1.5">
        <div className="flex justify-between text-[10px] text-surface-400 mb-1">
          <span>{elapsedDays} / {prescribedDays} days</span>
        </div>
        <div className="h-1.5 rounded-full bg-surface-700/50 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              isOverdue
                ? 'bg-red-500'
                : warningActive
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}
