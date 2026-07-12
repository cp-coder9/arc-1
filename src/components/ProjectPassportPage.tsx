import React, { useMemo } from 'react';
import { ShieldCheck, FileText, ClipboardCheck, AlertTriangle, CheckCircle2, Users, UserCheck, ArrowRight, Loader2, XCircle } from 'lucide-react';
import type { Project, ProjectStage, UserProfile } from '../types';
import { PROJECT_STAGE_ORDER, PROJECT_STAGE_LABELS, PROJECT_STAGE_ICONS } from '../types';
import { Badge } from './ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import StageProgressTracker from './StageProgressTracker';
import AdvanceStageButton from './AdvanceStageButton';
import { detectTransitionRisks, visibleStagesForRole } from '../services/projectLifecycleService';

const STAGE_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  ClipboardList: ClipboardCheck,
  Search: FileText,
  UserCheck: UserCheck,
  Users: Users,
  ShieldCheck: ShieldCheck,
  FileText: FileText,
  HardHat: ShieldCheck,
  CreditCard: FileText,
  CheckCircle2: CheckCircle2,
};

function getStageIcon(stage: ProjectStage): React.ReactNode {
  const iconName = PROJECT_STAGE_ICONS[stage] || 'ClipboardCheck';
  const Icon = STAGE_ICON_MAP[iconName] || ClipboardCheck;
  return <Icon className="h-5 w-5" />;
}

function timestampMs(value: unknown): number {
  if (!value) return 0;
  if (typeof value === 'string' || typeof value === 'number') return new Date(value).getTime() || 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value === 'object' && 'seconds' in value && typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
}

type Props = {
  user: UserProfile;
  project?: Project;
};

export default function ProjectPassportPage({ user, project }: Props) {
  const visibleStages = useMemo(() => visibleStagesForRole(user.role), [user.role]);

  const riskFindings = useMemo(() => {
    if (!project) return [];
    return detectTransitionRisks(project, project.currentStage);
  }, [project]);

  const highRisks = useMemo(() => riskFindings.filter((r) => r.priority === 'critical' || r.priority === 'high'), [riskFindings]);
  const mediumRisks = useMemo(() => riskFindings.filter((r) => r.priority === 'medium'), [riskFindings]);

  const riskLevel = useMemo<'none' | 'low' | 'medium' | 'high'>(() => {
    if (highRisks.length > 0) return 'high';
    if (mediumRisks.length > 0) return 'medium';
    return riskFindings.length > 0 ? 'low' : 'none';
  }, [highRisks, mediumRisks, riskFindings]);

  const blockerCount = highRisks.length;

  if (!project) {
    return (
      <div className="space-y-6">
        <Card className="rounded-2xl border-border bg-card/90">
          <CardContent className="p-8 flex items-start gap-4">
            <div className="rounded-2xl bg-primary/10 text-primary p-3">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-heading text-xl font-bold">No active project</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Create or appoint a project first to view its passport — the single source of truth for health, risks, and stage progress.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero: Project Health Card */}
      <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm overflow-hidden">
        <CardHeader className="bg-primary/5 border-b border-border">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-primary/10 text-primary p-3">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <Badge variant="secondary" className="uppercase tracking-widest">Project Passport</Badge>
                <CardTitle className="font-heading text-3xl mt-3">{project.id}</CardTitle>
                <CardDescription className="mt-2 max-w-3xl text-base">
                  Single project truth record — health, stage progress, risks, and next actions.
                </CardDescription>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="capitalize">{user.role}</Badge>
              <Badge
                variant={
                  riskLevel === 'high' ? 'destructive' :
                  riskLevel === 'medium' ? 'secondary' :
                  riskLevel === 'low' ? 'secondary' :
                  'outline'
                }
                className="gap-1"
              >
                <AlertTriangle className="h-3 w-3" />
                {riskLevel === 'none' ? 'Healthy' : `${riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1)} Risk`}
              </Badge>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Stage Progress Tracker */}
      <StageProgressTracker
        currentStage={project.currentStage}
        stageHistory={project.stageHistory}
        riskLevel={riskLevel === 'high' ? 'high' : riskLevel === 'medium' ? 'medium' : undefined}
      />

      {/* Risk Findings */}
      <Card className="rounded-2xl border-border bg-card/90">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <CardTitle className="font-heading text-lg">Risk Findings</CardTitle>
          </div>
          <Badge variant="outline">{riskFindings.length} total</Badge>
        </CardHeader>
        <CardContent>
          {riskFindings.length === 0 ? (
            <div className="flex items-center gap-3 text-muted-foreground py-4">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <span>No risks detected for current stage.</span>
            </div>
          ) : (
            <div className="space-y-3">
              {riskFindings.map((finding, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-accent/30">
                  {finding.priority === 'critical' ? (
                    <XCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
                  ) : finding.priority === 'high' ? (
                    <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{finding.message}</span>
                      <Badge
                        variant={
                          finding.priority === 'critical' ? 'destructive' :
                          finding.priority === 'high' ? 'destructive' : 'secondary'
                        }
                        className="capitalize text-[10px]"
                      >
                        {finding.priority}
                      </Badge>
                    </div>
                    {finding.assignedRoles && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {finding.assignedRoles.map((role) => (
                          <Badge key={role} variant="outline" className="text-[10px] capitalize">{role}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stage Gate Evidence */}
      <Card className="rounded-2xl border-border bg-card/90">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-primary" />
            <CardTitle className="font-heading text-lg">Stage Gate Evidence</CardTitle>
          </div>
          <Badge variant="outline">
            {Object.keys(project.stageGateEvidence || {}).length} items
          </Badge>
        </CardHeader>
        <CardContent>
          {!project.stageGateEvidence || Object.keys(project.stageGateEvidence).length === 0 ? (
            <div className="text-sm text-muted-foreground py-2">No stage gate evidence recorded yet.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {Object.entries(project.stageGateEvidence).map(([key, value]) => (
                <div key={key} className="flex items-center gap-2 p-2 rounded-lg bg-accent/20">
                  {value ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <span className="text-sm capitalize">{key.replace(/_/g, ' ')}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stage History */}
      <Card className="rounded-2xl border-border bg-card/90">
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <CardTitle className="font-heading text-lg">Stage History</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {project.stageHistory.length === 0 ? (
            <div className="text-sm text-muted-foreground py-2">No stage transitions recorded yet.</div>
          ) : (
            <div className="space-y-2">
              {[...project.stageHistory].reverse().map((entry, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-accent/30">
                  <div className="rounded-full bg-primary/10 text-primary p-2">
                    {getStageIcon(entry.stage)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{PROJECT_STAGE_LABELS[entry.stage] || entry.stage}</span>
                      <Badge variant="outline" className="text-[10px]">{entry.stage}</Badge>
                    </div>
                    <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                      <span>Entered: {new Date(timestampMs(entry.enteredAt)).toLocaleDateString()}</span>
                      {entry.exitedAt && <span>Exited: {new Date(timestampMs(entry.exitedAt)).toLocaleDateString()}</span>}
                      {entry.actorId && <span>Actor: {entry.actorId}</span>}
                    </div>
                    {entry.note && <p className="text-xs text-muted-foreground mt-1 italic">{entry.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Next Actions — Passport Summary */}
      <Card className="rounded-2xl border-border bg-card/90">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ArrowRight className="h-5 w-5 text-primary" />
            <CardTitle className="font-heading text-lg">Next Actions</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {riskFindings.length > 0 && (
            <div className="space-y-2 mb-4">
              <p className="text-sm font-medium text-muted-foreground">Resolve these risks before progressing:</p>
              {highRisks.slice(0, 3).map((risk, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                  <span>{risk.message}</span>
                </div>
              ))}
            </div>
          )}

          {blockerCount === 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span>No blockers — ready for next stage transition.</span>
            </div>
          )}

          <div className="flex items-center gap-3">
            <AdvanceStageButton
              project={project}
              actorId={user.uid}
              variant="default"
              size="default"
              riskLevel={riskLevel === 'none' ? 'low' : riskLevel}
              blockerCount={blockerCount}
            />
            <Badge variant="outline" className="text-xs">
              Current: {PROJECT_STAGE_LABELS[project.currentStage] || project.currentStage}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
