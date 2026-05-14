import React, { useEffect, useState } from 'react';
import { Archive, CheckCircle2, FileText, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { generateCompletionCertificate, generateFinalReport, archiveProject, getProjectSummary, ProjectSummary, summaryHasPersistedCloseoutArtifacts, CLOSEOUT_ARTIFACTS_REQUIRED_ERROR } from '@/services/closeoutService';
import { toast } from 'sonner';

export default function CloseoutWizard({ projectId }: { projectId: string }) {
  const [step, setStep] = useState(1);
  const [summary, setSummary] = useState<ProjectSummary | null>(null);
  const [certificateUrl, setCertificateUrl] = useState('');
  const [report, setReport] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const artifactsReady = summaryHasPersistedCloseoutArtifacts(summary);

  useEffect(() => {
    getProjectSummary(projectId).then(setSummary).catch(() => toast.error('Failed to load project summary'));
  }, [projectId]);

  const generateArtifacts = async () => {
    setLoading(true);
    try {
      const [certificate, finalReport] = await Promise.all([generateCompletionCertificate(projectId), generateFinalReport(projectId)]);
      setCertificateUrl(certificate);
      setReport(finalReport);
      const refreshedSummary = await getProjectSummary(projectId);
      setSummary(refreshedSummary);
      setStep(4);
      toast.success('Close-out artifacts generated');
    } catch (error) { toast.error('Failed to generate close-out artifacts'); }
    finally { setLoading(false); }
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
      setSummary(await getProjectSummary(projectId));
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Failed to archive project'); }
    finally { setLoading(false); }
  };

  return (
    <Card className="rounded-3xl border-border bg-white shadow-sm">
      <CardHeader><CardTitle className="flex items-center gap-2"><Archive className="text-primary" /> Close-out Wizard</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap gap-2">{[1, 2, 3, 4].map((item) => <Badge key={item} variant={step === item ? 'default' : 'outline'}>Step {item}</Badge>)}</div>
        {step === 1 && <div className="space-y-3"><h3 className="font-bold">Review summary</h3><p className="text-sm text-muted-foreground">{summary?.job?.title || projectId}</p><p className="text-sm">Team: {summary?.teamMembers.length ?? 0} · Tenders: {summary?.tenders.length ?? 0} · Released: ZAR {(summary?.budget.actualReleased ?? 0).toLocaleString('en-ZA')}</p><Button onClick={() => setStep(2)}>Continue</Button></div>}
        {step === 2 && <div className="space-y-3"><h3 className="font-bold">Confirm milestones</h3><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> I confirm milestone and statutory close-out records have been reviewed.</label><Button disabled={!confirmed} onClick={() => setStep(3)}>Confirm</Button></div>}
        {step === 3 && <div className="space-y-3"><h3 className="font-bold">Generate certificate and report</h3><Button onClick={generateArtifacts} disabled={loading}>{loading ? <Loader2 className="mr-2 animate-spin" /> : <FileText className="mr-2" />} Generate Artifacts</Button></div>}
        {step === 4 && <div className="space-y-4"><h3 className="font-bold">Archive project</h3>{summary?.artifacts?.completionCertificateUrl && <a className="text-sm text-primary underline" href={summary.artifacts.completionCertificateUrl} target="_blank" rel="noreferrer">Completion certificate</a>}{summary?.artifacts?.finalReport && <div className="rounded-2xl border p-4 text-sm"><ReactMarkdown>{summary.artifacts.finalReport}</ReactMarkdown></div>}{!artifactsReady && <p className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">Persisted completion certificate and final report artifacts are required before archive.</p>}<Button onClick={archive} disabled={loading || !artifactsReady || !!summary?.artifacts?.archivedAt}>{loading ? <Loader2 className="mr-2 animate-spin" /> : <CheckCircle2 className="mr-2" />} Archive Project</Button></div>}
      </CardContent>
    </Card>
  );
}
