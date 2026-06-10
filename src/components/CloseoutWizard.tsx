import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Loader2,
  AlertTriangle,
  ShieldCheck,
  PackageCheck,
  Key,
  FileCheck2,
  Building2,
  Wrench,
  CalendarClock,
  Banknote,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import {
  generateCompletionCertificate,
  generateFinalReport,
  archiveProject,
  getProjectSummary,
  ProjectSummary,
  summaryHasPersistedCloseoutArtifacts,
  CLOSEOUT_ARTIFACTS_REQUIRED_ERROR,
  evaluateCloseoutGate,
  buildSnagRectificationPlan,
  buildHandoverPackManifest,
  CloseoutSnagRecord,
  HandoverPackDocumentInput,
} from '@/services/closeoutService';
import {
  PracticalCompletionResult,
  certifyPracticalCompletion,
  evaluatePracticalCompletionPreconditions,
  evaluateOccupationReadinessGate,
} from '@/services/practicalCompletionService';
import {
  DefectsRegisterSummary,
  buildDefectsRegisterSummary,
  categorizeDefect,
  DefectItem,
} from '@/services/defectsCloseoutService';
import {
  evaluateOccupationReadiness as evaluateOccReadiness,
  OccupationReadinessRecord,
} from '@/services/occupationReadinessService';
import {
  evaluateHandoverPackReadiness,
  HandoverPackRecord,
} from '@/services/handoverPackService';
import {
  evaluateFinalAccountReadiness,
  FinalAccountReadinessRecord,
  reconcileRetention,
} from '@/services/finalAccountReadinessService';
import {
  buildDefectsLiabilitySummary,
  DefectsLiabilityPeriod,
  LiabilityDefectReport,
} from '@/services/defectsLiabilityService';
import { toast } from 'sonner';

type CloseoutTab = 'practical-completion' | 'defects-closeout' | 'occupation-readiness' | 'handover-pack' | 'final-account' | 'defects-liability' | 'archive';

export default function CloseoutWizard({ projectId }: { projectId: string }) {
  const [activeTab, setActiveTab] = useState<CloseoutTab>('practical-completion');
  const [summary, setSummary] = useState<ProjectSummary | null>(null);
  const [certificateUrl, setCertificateUrl] = useState('');
  const [report, setReport] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(true);

  const artifactsReady = summaryHasPersistedCloseoutArtifacts(summary);

  const loadSummary = useCallback(async () => {
    setLoadingSummary(true);
    try {
      const s = await getProjectSummary(projectId);
      setSummary(s);
    } catch {
      toast.error('Failed to load project summary');
    } finally {
      setLoadingSummary(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  // Evaluate practical completion on load
  const practicalCompletionEval = useMemo(() => {
    if (!summary) return null;
    return certifyPracticalCompletion({
      projectId,
      issuedBy: summary.project.leadArchitectId || summary.project.clientId,
      signatoryRole: 'principal_agent',
      snags: (summary.project as any)?.snags ?? [],
      certificates: (summary.project as any)?.complianceCertificates ?? [],
      insuranceActive: (summary.project as any)?.insuranceActive ?? false,
      utilitiesTransferred: false,
    });
  }, [summary, projectId]);

  // Evaluate defects
  const defectsEval = useMemo(() => {
    const defects: DefectItem[] = (summary?.project as any)?.defects ?? [];
    return buildDefectsRegisterSummary(defects);
  }, [summary]);

  // Evaluate occupation readiness
  const occupationEval = useMemo(() => {
    if (!summary) return null;
    const pcReady = practicalCompletionEval?.ready ?? false;
    return {
      ready: pcReady,
      blockers: practicalCompletionEval?.blockers ?? [],
      gate: evaluateOccupationReadinessGate({
        practicalCompletionCertified: pcReady,
        clientAcceptanceRecorded: (summary.project as any)?.practicalCompletion?.clientAcceptedBy != null,
        occupancyCertificateObtained: (summary.project as any)?.occupationReadiness?.occupancyCertificateStatus === 'obtained',
        insuranceTransitioned: (summary.project as any)?.occupationReadiness?.insuranceTransitioned ?? false,
        utilitiesHandoverComplete: (summary.project as any)?.occupationReadiness?.utilitiesHandoverComplete ?? false,
      }),
    };
  }, [summary, practicalCompletionEval]);

  // Evaluate handover pack
  const handoverEval = useMemo(() => {
    if (!summary) return null;
    const docs: HandoverPackDocumentInput[] = (summary.project as any)?.handoverDocuments ?? [];
    return buildHandoverPackManifest(docs);
  }, [summary]);

  // Evaluate final account
  const finalAccountEval = useMemo(() => {
    if (!summary) return null;
    const variations = (summary.project as any)?.variations ?? [];
    const claims = (summary.project as any)?.claims ?? [];
    const retention = reconcileRetention({
      totalContractSum: summary.budget.planned,
      retentionPercentage: 5,
      variationsTotal: variations.filter((v: any) => v.status === 'agreed' || v.status === 'approved').reduce((s: number, v: any) => s + v.amount, 0),
      previouslyReleased: 0,
      releaseTriggersMet: [],
    });
    return evaluateFinalAccountReadiness({ variations, claims, retention });
  }, [summary]);

  // Evaluate defects liability
  const liabilityEval = useMemo(() => {
    if (!summary) return null;
    const period = (summary.project as any)?.defectsLiability as DefectsLiabilityPeriod | undefined;
    const defects = ((summary.project as any)?.liabilityDefects ?? []) as LiabilityDefectReport[];
    if (!period) return null;
    return buildDefectsLiabilitySummary(period, defects);
  }, [summary]);

  const generateArtifacts = async () => {
    setLoading(true);
    try {
      const [certificate, finalReport] = await Promise.all([
        generateCompletionCertificate(projectId),
        generateFinalReport(projectId),
      ]);
      setCertificateUrl(certificate);
      setReport(finalReport);
      await loadSummary();
      toast.success('Close-out artifacts generated');
    } catch (error) {
      toast.error('Failed to generate close-out artifacts');
    } finally {
      setLoading(false);
    }
  };

  const archive = async () => {
    if (!artifactsReady) {
      toast.error(CLOSEOUT_ARTIFACTS_REQUIRED_ERROR);
      return;
    }
    setLoading(true);
    try {
      await archiveProject(projectId);
      toast.success('Project archived');
      await loadSummary();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to archive project');
    } finally {
      setLoading(false);
    }
  };

  const tabItems: Array<{ id: CloseoutTab; label: string; icon: React.ReactNode; status?: 'ready' | 'blocked' | 'pending' }> = [
    { id: 'practical-completion', label: 'Practical Completion', icon: <CheckCircle2 className="h-4 w-4" />, status: practicalCompletionEval?.ready ? 'ready' : 'blocked' },
    { id: 'defects-closeout', label: 'Defects Closeout', icon: <Wrench className="h-4 w-4" />, status: defectsEval?.openDefects.length === 0 ? 'ready' : 'blocked' },
    { id: 'occupation-readiness', label: 'Occupation', icon: <Building2 className="h-4 w-4" />, status: occupationEval?.gate.ready ? 'ready' : 'blocked' },
    { id: 'handover-pack', label: 'Handover Pack', icon: <PackageCheck className="h-4 w-4" />, status: handoverEval?.ready ? 'ready' : 'blocked' },
    { id: 'final-account', label: 'Final Account', icon: <Banknote className="h-4 w-4" />, status: finalAccountEval?.ready ? 'ready' : 'blocked' },
    { id: 'defects-liability', label: 'Defects Liability', icon: <CalendarClock className="h-4 w-4" />, status: liabilityEval ? (liabilityEval.requiresAttention ? 'blocked' : 'ready') : 'pending' },
    { id: 'archive', label: 'Archive', icon: <Archive className="h-4 w-4" />, status: artifactsReady ? 'ready' : 'blocked' },
  ];

  if (loadingSummary) {
    return (
      <Card className="rounded-3xl border-border bg-white shadow-sm">
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-3 text-sm text-muted-foreground">Loading close-out data...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-3xl border-border bg-white shadow-sm" data-testid="closeout-wizard">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Archive className="text-primary" /> Close-out & Handover
        </CardTitle>
        <CardDescription>
          Project: {summary?.job?.title || projectId} · Stage: {summary?.timeline.currentStage || 'unknown'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary bar */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <SummaryChip label="PC Status" value={practicalCompletionEval?.ready ? 'Ready' : 'Blocked'} tone={practicalCompletionEval?.ready ? 'ready' : 'blocked'} />
          <SummaryChip label="Defects Open" value={`${defectsEval?.openDefects.length ?? '?'}`} tone={defectsEval && defectsEval.openDefects.length === 0 ? 'ready' : 'blocked'} />
          <SummaryChip label="Occupation" value={occupationEval?.gate.ready ? 'Ready' : 'Blocked'} tone={occupationEval?.gate.ready ? 'ready' : 'blocked'} />
          <SummaryChip label="Handover" value={handoverEval?.ready ? 'Complete' : `${handoverEval?.blockers.length ?? '?'} items`} tone={handoverEval?.ready ? 'ready' : 'blocked'} />
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as CloseoutTab)}>
          <TabsList className="flex flex-wrap gap-1 h-auto bg-muted/50 p-1 rounded-2xl">
            {tabItems.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id} className="rounded-xl gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                {tab.icon}
                <span className="hidden sm:inline">{tab.label}</span>
                {tab.status && <StatusDot status={tab.status} />}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* 1. Practical Completion */}
          <TabsContent value="practical-completion" className="space-y-4 mt-4">
            <StageHeader title="Practical Completion Readiness" description="Verify all preconditions for practical completion certification." icon={<CheckCircle2 className="h-6 w-6 text-primary" />} />
            {practicalCompletionEval && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {practicalCompletionEval.preconditions.map((pc) => (
                    <PreconditionCard key={pc.key} precondition={pc} />
                  ))}
                </div>
                {practicalCompletionEval.ready ? (
                  <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                    <CheckCircle2 className="inline h-4 w-4 mr-1" /> Practical completion is ready for certification.
                    {practicalCompletionEval.certificate && (
                      <p className="mt-1 text-xs">Certificate ID: {practicalCompletionEval.certificate.certificateId}</p>
                    )}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
                    <h4 className="font-semibold text-sm text-destructive mb-2">Blockers ({practicalCompletionEval.blockers.length})</h4>
                    <ul className="space-y-1">
                      {practicalCompletionEval.blockers.map((b, i) => (
                        <li key={i} className="text-sm text-destructive flex items-start gap-1">
                          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> {b}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* 2. Defects Closeout */}
          <TabsContent value="defects-closeout" className="space-y-4 mt-4">
            <StageHeader title="Defects Closeout" description="Track and verify closeout of patent and latent defects from the snag register." icon={<Wrench className="h-6 w-6 text-primary" />} />
            {defectsEval && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <MetricBadge label="Total" value={defectsEval.total} />
                  <MetricBadge label="Patent Open" value={defectsEval.patent.open} tone={defectsEval.patent.open > 0 ? 'blocked' : 'ready'} />
                  <MetricBadge label="Latent Open" value={defectsEval.latent.open} tone={defectsEval.latent.open > 0 ? 'blocked' : 'ready'} />
                  <MetricBadge label="Need Attention" value={defectsEval.requiresAttention.length} tone={defectsEval.requiresAttention.length > 0 ? 'blocked' : 'ready'} />
                </div>
                {defectsEval.requiresAttention.length > 0 && (
                  <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
                    <h4 className="font-semibold text-sm text-destructive mb-2">Requires Immediate Attention</h4>
                    <ul className="space-y-2">
                      {defectsEval.requiresAttention.map((d) => (
                        <li key={d.id} className="flex items-start gap-2 text-sm">
                          <Badge variant={d.severity === 'critical' ? 'destructive' : 'secondary'} className="shrink-0">{d.severity}</Badge>
                          <span>{d.title} <span className="text-muted-foreground">({d.category})</span></span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {defectsEval.openDefects.length === 0 && (
                  <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                    <CheckCircle2 className="inline h-4 w-4 mr-1" /> All defects are closed or verified.
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* 3. Occupation Readiness */}
          <TabsContent value="occupation-readiness" className="space-y-4 mt-4">
            <StageHeader title="Occupation Readiness" description="Verify occupancy certificate, insurance transition, and utility handovers." icon={<Building2 className="h-6 w-6 text-primary" />} />
            {occupationEval && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {[
                    { label: 'Practical Completion Certified', met: practicalCompletionEval?.ready === true, detail: practicalCompletionEval?.ready ? 'Certified' : 'Not certified' },
                    { label: 'Client Acceptance', met: (summary?.project as any)?.practicalCompletion?.clientAcceptedBy != null, detail: (summary?.project as any)?.practicalCompletion?.clientAcceptedBy ? 'Accepted' : 'Pending' },
                    { label: 'Occupancy Certificate', met: (summary?.project as any)?.occupationReadiness?.occupancyCertificateStatus === 'obtained', detail: (summary?.project as any)?.occupationReadiness?.occupancyCertificateStatus ?? 'Not obtained' },
                    { label: 'Insurance Transition', met: (summary?.project as any)?.occupationReadiness?.insuranceTransitioned === true, detail: (summary?.project as any)?.occupationReadiness?.insuranceTransitioned ? 'Transitioned' : 'Not transitioned' },
                    { label: 'Utilities Handover', met: (summary?.project as any)?.occupationReadiness?.utilitiesHandoverComplete === true, detail: (summary?.project as any)?.occupationReadiness?.utilitiesHandoverComplete ? 'Complete' : 'Pending' },
                  ].map((item, i) => (
                    <div key={i} className={`rounded-xl border p-3 ${item.met ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
                      <p className="text-sm font-semibold">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.detail}</p>
                    </div>
                  ))}
                </div>
                {occupationEval.gate.ready ? (
                  <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                    <CheckCircle2 className="inline h-4 w-4 mr-1" /> Project is ready for occupation.
                  </div>
                ) : (
                  <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
                    <h4 className="font-semibold text-sm text-destructive mb-2">Occupation Blockers</h4>
                    <ul className="space-y-1">
                      {occupationEval.gate.blockers.map((b, i) => (
                        <li key={i} className="text-sm text-destructive flex items-start gap-1">
                          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> {b}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* 4. Handover Pack */}
          <TabsContent value="handover-pack" className="space-y-4 mt-4">
            <StageHeader title="Handover Pack Assembly" description="As-built drawings, warranties, O&M manuals, keys, and compliance certificates." icon={<PackageCheck className="h-6 w-6 text-primary" />} />
            {handoverEval && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <MetricBadge label="Documents" value={handoverEval.documentCount} />
                  <MetricBadge label="Ready" value={handoverEval.items.filter(i => i.ready).length} tone="ready" />
                  <MetricBadge label="Missing Categories" value={handoverEval.missingCategories.length} tone={handoverEval.missingCategories.length > 0 ? 'blocked' : 'ready'} />
                  <MetricBadge label="Blockers" value={handoverEval.blockers.length} tone={handoverEval.blockers.length > 0 ? 'blocked' : 'ready'} />
                </div>
                {handoverEval.missingCategories.length > 0 && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <h4 className="font-semibold text-sm text-amber-800 mb-2">Missing Required Document Categories</h4>
                    <ul className="space-y-1">
                      {handoverEval.missingCategories.map((cat, i) => (
                        <li key={i} className="text-sm text-amber-700">• {cat.replaceAll('_', ' ')}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {handoverEval.ready && (
                  <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                    <CheckCircle2 className="inline h-4 w-4 mr-1" /> Handover pack is complete and ready for review.
                  </div>
                )}
                {handoverEval.items.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm">Document Manifest</h4>
                    {handoverEval.items.map((item) => (
                      <div key={item.id} className={`flex items-center justify-between rounded-xl border p-3 text-sm ${item.ready ? 'border-green-200 bg-green-50/50' : 'border-border'}`}>
                        <div>
                          <p className="font-medium">{item.title}</p>
                          <p className="text-xs text-muted-foreground">{item.category.replaceAll('_', ' ')}</p>
                        </div>
                        <Badge variant={item.ready ? 'default' : 'secondary'}>{item.ready ? 'Ready' : 'Incomplete'}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* 5. Final Account */}
          <TabsContent value="final-account" className="space-y-4 mt-4">
            <StageHeader title="Final Account Readiness" description="Variations, claims, retention reconciliation, and final payment certificate." icon={<Banknote className="h-6 w-6 text-primary" />} />
            {finalAccountEval && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <MetricBadge label="Status" value={finalAccountEval.status.replaceAll('_', ' ')} tone={finalAccountEval.ready ? 'ready' : 'blocked'} />
                  <MetricBadge label="Variations Pending" value={finalAccountEval.variations.filter((v: any) => v.status === 'pending').length} tone="blocked" />
                  <MetricBadge label="Claims Pending" value={finalAccountEval.claims.filter((c: any) => c.status === 'submitted' || c.status === 'under_review').length} tone="blocked" />
                  <MetricBadge label="Retention" value={(summary?.budget.planned ?? 0) > 0 ? 'Held' : 'N/A'} tone="blocked" />
                </div>
                {!finalAccountEval.ready && (
                  <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
                    <h4 className="font-semibold text-sm text-destructive mb-2">Final Account Blockers</h4>
                    <ul className="space-y-1">
                      {finalAccountEval.blockers.map((b: string, i: number) => (
                        <li key={i} className="text-sm text-destructive flex items-start gap-1">
                          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> {b}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* 6. Defects Liability */}
          <TabsContent value="defects-liability" className="space-y-4 mt-4">
            <StageHeader title="Defects Liability Period" description="Track the defects liability period, defect reports, and contractor recalls." icon={<CalendarClock className="h-6 w-6 text-primary" />} />
            {liabilityEval ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <MetricBadge label="Status" value={liabilityEval.period.status.replaceAll('_', ' ')} tone={liabilityEval.period.status === 'expired' ? 'blocked' : 'ready'} />
                  <MetricBadge label="Days Remaining" value={liabilityEval.daysRemaining} tone={liabilityEval.daysRemaining <= 0 ? 'blocked' : liabilityEval.daysRemaining <= 90 ? 'pending' : 'ready'} />
                  <MetricBadge label="Open Defects" value={liabilityEval.openDefectCount} tone={liabilityEval.openDefectCount > 0 ? 'blocked' : 'ready'} />
                  <MetricBadge label="Recall Status" value={liabilityEval.recalls.length > 0 ? `${liabilityEval.recalls.length} active` : 'None'} tone={liabilityEval.recalls.some((r: any) => r.status === 'no_response') ? 'blocked' : 'ready'} />
                </div>
                {liabilityEval.retentionReleaseEligible && (
                  <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                    <CheckCircle2 className="inline h-4 w-4 mr-1" /> Retention release is eligible — all defects resolved and liability period has concluded.
                  </div>
                )}
                {liabilityEval.requiresAttention && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <h4 className="font-semibold text-sm text-amber-800 mb-2">Attention Required</h4>
                    {liabilityEval.overdueDefectCount > 0 && <p className="text-sm text-amber-700">• {liabilityEval.overdueDefectCount} defect(s) are overdue for rectification.</p>}
                    {liabilityEval.period.status === 'expiring_soon' && <p className="text-sm text-amber-700">• Liability period expires in {liabilityEval.daysRemaining} days.</p>}
                    {liabilityEval.recalls.some((r: any) => r.status === 'no_response' || r.status === 'escalated') && <p className="text-sm text-amber-700">• Contractor recall requires escalation.</p>}
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                <CalendarClock className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                <p>No active defects liability period for this project.</p>
                <p className="mt-1">The liability period typically starts after practical completion handover.</p>
              </div>
            )}
          </TabsContent>

          {/* 7. Archive */}
          <TabsContent value="archive" className="space-y-4 mt-4">
            <StageHeader title="Project Archive" description="Generate close-out artifacts and archive the project." icon={<Archive className="h-6 w-6 text-primary" />} />
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                    className="h-4 w-4 rounded border-border"
                  />
                  I confirm all milestone and statutory close-out records have been reviewed.
                </label>
              </div>

              <Button
                onClick={generateArtifacts}
                disabled={loading || !confirmed}
                className="w-full rounded-xl gap-2"
              >
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                Generate Completion Certificate & Final Report
              </Button>

              {summary?.artifacts?.completionCertificateUrl && (
                <a
                  className="block text-sm text-primary underline"
                  href={summary.artifacts.completionCertificateUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  View Completion Certificate
                </a>
              )}

              {summary?.artifacts?.finalReport && (
                <div className="rounded-2xl border p-4 text-sm max-h-64 overflow-y-auto">
                  <ReactMarkdown>{summary.artifacts.finalReport}</ReactMarkdown>
                </div>
              )}

              {!artifactsReady && (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  Persisted completion certificate and final report artifacts are required before archive.
                </div>
              )}

              <Button
                onClick={archive}
                disabled={loading || !artifactsReady || !!summary?.artifacts?.archivedAt}
                variant="destructive"
                className="w-full rounded-xl gap-2"
              >
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Archive className="mr-2 h-4 w-4" />}
                Archive Project
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// ─── Helper sub-components ─────────────────────────────────────────────────

function StageHeader({ title, description, icon }: { title: string; description: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5">{icon}</div>
      <div>
        <h3 className="font-heading text-xl font-bold">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function PreconditionCard({ precondition }: { precondition: { key: string; label: string; met: boolean; detail: string } }) {
  return (
    <div className={`rounded-xl border p-3 ${precondition.met ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
      <div className="flex items-center gap-2">
        {precondition.met ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
        <p className="text-sm font-semibold">{precondition.label}</p>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{precondition.detail}</p>
    </div>
  );
}

function SummaryChip({ label, value, tone }: { label: string; value: string; tone?: 'ready' | 'blocked' | 'pending' }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 text-center">
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${tone === 'blocked' ? 'text-destructive' : tone === 'ready' ? 'text-green-600' : 'text-muted-foreground'}`}>
        {value}
      </p>
    </div>
  );
}

function MetricBadge({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  const toneClass = tone === 'blocked' ? 'text-destructive' : tone === 'ready' ? 'text-green-600' : '';
  return (
    <div className="rounded-xl border border-border bg-card p-3 text-center">
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`mt-1 font-heading text-xl font-black ${toneClass}`}>{value}</p>
    </div>
  );
}

function StatusDot({ status }: { status: 'ready' | 'blocked' | 'pending' }) {
  const colors = { ready: 'bg-green-500', blocked: 'bg-destructive', pending: 'bg-muted-foreground' };
  return <span className={`inline-block h-2 w-2 rounded-full ${colors[status]}`} />;
}
