import React, { useState } from 'react';
import { AIReviewResult, AICategory, AIIssue, Finding, UserRole } from '@/types';
import { ShieldCheck, CheckCircle2, Printer, Download, Loader2, Search, AlertTriangle, FileText } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import { KnowledgeFeedback } from './KnowledgeFeedback';
import { KnowledgeSources } from './KnowledgeSources';
import { pdfGenerationService } from '@/services/pdfGenerationService';
import { toast } from 'sonner';

interface ComplianceReportProps {
  result: AIReviewResult & { citations?: any[]; knowledgeSources?: string[] };
  drawingUrl?: string;
  drawingName?: string;
  projectName?: string;
  onClose?: () => void;
  userRole?: UserRole;
  submissionId?: string;
  userId?: string;
}

const getAgentRoleForCategory = (categoryName: string, finding?: Finding) => {
  if (finding?.discipline) return finding.discipline;
  const lower = categoryName.toLowerCase();
  if (lower.includes('wall')) return 'wall_checker';
  if (lower.includes('window') || lower.includes('fenestration')) return 'window_checker';
  if (lower.includes('door') || lower.includes('fire')) return 'door_checker';
  if (lower.includes('area') || lower.includes('room') || lower.includes('sizing')) return 'area_checker';
  if (lower.includes('general') || lower.includes('compliance')) return 'compliance_checker';
  if (lower.includes('sans')) return 'sans_compliance';
  return 'orchestrator';
};

export default function ComplianceReport({ result, drawingUrl, drawingName, projectName = "Architectural Submission", onClose, userRole, submissionId, userId }: ComplianceReportProps) {
  const [selectedIssue, setSelectedIssue] = useState<AIIssue | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const findings = result.findings || [];
  const issueCount = findings.length || result.categories.reduce((acc, cat) => acc + cat.issues.length, 0);

  const handleDownloadPDF = async () => {
    if (!submissionId || !userId) {
      toast.error("Required information missing to generate PDF");
      return;
    }
    setIsGenerating(true);
    try {
      const { url, fileName } = await pdfGenerationService.generateComplianceCertificate(submissionId, userId);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Certificate generated successfully");
    } catch (error) {
      console.error("PDF generation error:", error);
      toast.error("Failed to generate PDF certificate");
    } finally {
      setIsGenerating(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical': return 'text-red-900 bg-red-100 border-red-300';
      case 'high': return 'text-destructive bg-destructive/10 border-destructive/20';
      case 'medium': return 'text-amber-600 bg-amber-50 border-amber-200';
      case 'low': return 'text-blue-600 bg-blue-50 border-blue-200';
      default: return 'text-muted-foreground bg-secondary/50 border-border';
    }
  };

  const groupedFindings = findings.reduce<Record<string, Finding[]>>((acc, finding) => {
    acc[finding.discipline] = acc[finding.discipline] || [];
    acc[finding.discipline].push(finding);
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden print:bg-white print:h-auto">
      <header className="flex items-center justify-between p-6 bg-white border-b border-border print:hidden">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary"><ShieldCheck size={24} /></div>
          <div>
            <h2 className="text-lg font-bold">AI Built-Environment Report</h2>
            <p className="text-xs text-muted-foreground">{drawingName || 'Drawing Analysis'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()} className="rounded-full gap-2"><Printer size={14} /> Print Report</Button>
          {submissionId && userId && <Button variant="outline" size="sm" onClick={handleDownloadPDF} disabled={isGenerating} className="rounded-full gap-2 border-primary/20 hover:bg-primary/5 text-primary">{isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Download Certificate</Button>}
          {onClose && <Button variant="ghost" size="sm" onClick={onClose} className="rounded-full">Close</Button>}
        </div>
      </header>

      <div className="flex-1 overflow-auto p-8 print:p-0">
        <div className="max-w-5xl mx-auto space-y-8">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex gap-3">
            <AlertTriangle className="text-amber-600 mt-0.5" size={18} />
            <div className="text-sm text-amber-900 space-y-1">
              <p className="font-semibold">Preliminary AI review only</p>
              {(result.disclaimers || ['This report does not certify, approve, or guarantee compliance. Professional and municipal review remains required where applicable.']).map((text, idx) => <p key={idx}>{text}</p>)}
            </div>
          </div>

          <div className="bg-white border border-border rounded-[2rem] p-10 shadow-sm overflow-hidden relative">
            <div className={cn("absolute top-0 right-0 px-12 py-2 text-[10px] font-bold uppercase tracking-widest text-white rotate-45 translate-x-10 translate-y-4", result.status === 'passed' ? "bg-green-500" : "bg-destructive")}>{(result.riskStatus || result.status).replace(/_/g, ' ').toUpperCase()}</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
              <div className="md:col-span-2 space-y-6">
                <div>
                  <h1 className="text-3xl font-heading font-bold mb-2">{projectName}</h1>
                  <p className="text-muted-foreground">South African Built-Environment Review Summary</p>
                </div>
                <div className="prose prose-sm max-w-none text-slate-600 leading-relaxed"><ReactMarkdown>{result.feedback}</ReactMarkdown></div>
              </div>
              <div className="space-y-6">
                <div className="p-6 rounded-2xl bg-slate-50 border border-border">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-4">Risk Status</h4>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between"><span className="text-sm">Status</span><Badge className={result.status === 'passed' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>{(result.riskStatus || result.status).replace(/_/g, ' ')}</Badge></div>
                    <div className="flex items-center justify-between"><span className="text-sm">Total Findings</span><span className="font-bold text-lg">{issueCount}</span></div>
                    {result.mode && <div className="flex items-center justify-between"><span className="text-sm">Mode</span><span className="text-xs font-mono">{result.mode.replace(/_/g, ' ')}</span></div>}
                  </div>
                </div>
                {result.status === 'passed' && <div className="p-4 rounded-2xl bg-green-50 border border-green-200 flex items-start gap-3"><CheckCircle2 size={18} className="text-green-600 mt-0.5" /><p className="text-xs text-green-700 leading-tight">This package is ready for the next human review step based on preliminary AI checks.</p></div>}
              </div>
            </div>
          </div>

          {result.submissionIndex?.length ? <div className="bg-white border border-border rounded-[2rem] p-8 shadow-sm space-y-4"><h3 className="text-xl font-bold flex items-center gap-2"><FileText size={20} className="text-primary" /> Submission Index</h3><div className="grid gap-3">{result.submissionIndex.map((item, idx) => <div key={idx} className="p-3 rounded-xl border bg-slate-50 flex justify-between gap-3"><span className="text-sm font-medium truncate">{item.name}</span><Badge variant="outline">{item.detectedType}</Badge></div>)}</div></div> : null}

          {result.signOffChecklist?.length ? <div className="bg-white border border-border rounded-[2rem] p-8 shadow-sm space-y-4"><h3 className="text-xl font-bold">Professional Sign-Off Checklist</h3><div className="space-y-3">{result.signOffChecklist.map((item, idx) => <div key={idx} className="p-4 rounded-xl border bg-slate-50"><div className="flex flex-wrap gap-2 mb-2"><Badge>{item.discipline}</Badge><Badge variant="outline">{item.responsibleParty}</Badge><Badge className={getSeverityColor(item.priority)}>{item.priority}</Badge></div><p className="font-semibold text-sm">{item.requirement}</p><p className="text-xs text-muted-foreground mt-1">{item.reason}</p></div>)}</div></div> : null}

          {findings.length ? <FindingsView groupedFindings={groupedFindings} getSeverityColor={getSeverityColor} userRole={userRole} /> : <LegacyCategories categories={result.categories} selectedIssue={selectedIssue} setSelectedIssue={setSelectedIssue} getSeverityColor={getSeverityColor} userRole={userRole} />}

          {result.citations && result.citations.length > 0 && <KnowledgeSources citations={result.citations} />}
        </div>
      </div>
    </div>
  );
}

function FindingsView({ groupedFindings, getSeverityColor, userRole }: { groupedFindings: Record<string, Finding[]>; getSeverityColor: (severity: string) => string; userRole?: ComplianceReportProps['userRole'] }) {
  return <div className="space-y-8">{Object.entries(groupedFindings).map(([discipline, items]) => <div key={discipline} className="bg-white border border-border rounded-[2rem] p-8 shadow-sm space-y-5"><h3 className="text-xl font-bold capitalize">{discipline.replace(/_/g, ' ')}</h3>{items.map((finding, idx) => <div key={idx} className="p-5 rounded-xl border bg-slate-50 space-y-3"><div className="flex flex-wrap gap-2"><Badge className={getSeverityColor(finding.severity)}>{finding.severity}</Badge><Badge variant="outline">{finding.standardFamily}</Badge><Badge variant="outline">{finding.autonomyLabel.replace(/_/g, ' ')}</Badge><Badge variant="outline">{finding.responsibleParty.replace(/_/g, ' ')}</Badge><Badge variant="outline">confidence: {finding.confidence}</Badge></div><div><h4 className="font-bold">{finding.title}</h4><p className="text-sm text-slate-700 mt-1">{finding.description}</p></div><p className="text-xs text-muted-foreground"><strong>Reference:</strong> {finding.reference}</p><p className="text-sm"><strong>Action:</strong> {finding.actionItem}</p><p className="text-xs text-muted-foreground"><strong>Evidence:</strong> {finding.evidence}</p>{userRole && <KnowledgeFeedback issue={finding as any} agentRole={getAgentRoleForCategory(discipline, finding)} categoryName={discipline} userRole={userRole} />}</div>)}</div>)}</div>;
}

function LegacyCategories({ categories, selectedIssue, setSelectedIssue, getSeverityColor, userRole }: { categories: AICategory[]; selectedIssue: AIIssue | null; setSelectedIssue: (issue: AIIssue) => void; getSeverityColor: (severity: string) => string; userRole?: ComplianceReportProps['userRole'] }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-8">{categories.map((category, idx) => <div key={idx} className="bg-white border border-border rounded-[2rem] p-8 shadow-sm space-y-6 print:break-inside-avoid"><div className="flex items-center justify-between border-b border-border pb-4"><h3 className="font-bold text-lg flex items-center gap-2"><Search size={18} className="text-primary" />{category.name}</h3><Badge variant="outline">{category.issues.length} Issues</Badge></div><div className="space-y-4">{category.issues.map((issue, i) => <div key={i} onClick={() => setSelectedIssue(issue)} className={cn("p-4 rounded-xl border cursor-pointer transition-all", selectedIssue === issue ? "ring-2 ring-primary" : "hover:bg-slate-50")}><div className="flex items-center gap-2 mb-2"><Badge className={getSeverityColor(issue.severity)}>{issue.severity}</Badge>{issue.standardFamily && <Badge variant="outline">{issue.standardFamily}</Badge>}</div><p className="text-sm font-medium mb-2">{issue.description}</p><p className="text-xs text-muted-foreground"><strong>Action:</strong> {issue.actionItem}</p>{userRole && <KnowledgeFeedback issue={issue} agentRole={getAgentRoleForCategory(category.name)} categoryName={category.name} userRole={userRole} />}</div>)}</div></div>)}</div>;
}
