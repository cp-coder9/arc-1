import React, { useState } from 'react';
import { AIReviewResult, AICategory, AIIssue, UserRole } from '@/types';
import { 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Printer, 
  FileText, 
  Search,
  Maximize2,
  Download,
  Cpu,
  Activity,
  BookOpen
} from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import { KnowledgeFeedback } from './KnowledgeFeedback';
import { KnowledgeSources } from './KnowledgeSources';

interface ComplianceReportProps {
  result: AIReviewResult & { citations?: any[]; knowledgeSources?: string[] };
  drawingUrl?: string;
  drawingName?: string;
  projectName?: string;
  onClose?: () => void;
  userRole?: UserRole;
}

const getAgentRoleForCategory = (categoryName: string) => {
  const lower = categoryName.toLowerCase();
  if (lower.includes('wall')) return 'wall_checker';
  if (lower.includes('window') || lower.includes('fenestration')) return 'window_checker';
  if (lower.includes('door') || lower.includes('fire')) return 'door_checker';
  if (lower.includes('area') || lower.includes('room') || lower.includes('sizing')) return 'area_checker';
  if (lower.includes('general') || lower.includes('compliance')) return 'compliance_checker';
  if (lower.includes('sans')) return 'sans_compliance';
  return 'orchestrator';
};

export default function ComplianceReport({ 
  result, 
  drawingUrl, 
  drawingName,
  projectName = "Architectural Submission",
  onClose,
  userRole
}: ComplianceReportProps) {
  const [selectedIssue, setSelectedIssue] = useState<AIIssue | null>(null);

  const handlePrint = () => {
    window.print();
  };

  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'high': return 'text-destructive bg-destructive/10 border-destructive/20';
      case 'medium': return 'text-amber-600 bg-amber-50 border-amber-200';
      case 'low': return 'text-blue-600 bg-blue-50 border-blue-200';
      default: return 'text-muted-foreground bg-secondary/50 border-border';
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden print:bg-white print:h-auto">
      {/* Header - Hidden in Print */}
      <header className="flex items-center justify-between p-6 bg-white border-b border-border print:hidden">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <ShieldCheck size={24} />
          </div>
          <div>
            <h2 className="text-lg font-bold">AI Compliance Report</h2>
            <p className="text-xs text-muted-foreground">{drawingName || 'Drawing Analysis'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint} className="rounded-full gap-2">
            <Printer size={14} /> Print Report
          </Button>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose} className="rounded-full">
              Close
            </Button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-8 print:p-0">
        <div className="max-w-5xl mx-auto space-y-8">
          
          {/* Executive Summary Card */}
          <div className="bg-white border border-border rounded-[2rem] p-10 shadow-sm overflow-hidden relative">
            <div className={cn(
              "absolute top-0 right-0 px-12 py-2 text-[10px] font-bold uppercase tracking-widest text-white rotate-45 translate-x-10 translate-y-4",
              result.status === 'passed' ? "bg-green-500" : "bg-destructive"
            )}>
              {result.status.toUpperCase()}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
              <div className="md:col-span-2 space-y-6">
                <div>
                  <h1 className="text-3xl font-heading font-bold mb-2">{projectName}</h1>
                  <p className="text-muted-foreground">Compliance Review Summary</p>
                </div>

                <div className="prose prose-sm max-w-none text-slate-600 leading-relaxed">
                  <ReactMarkdown>{result.feedback}</ReactMarkdown>
                </div>
              </div>

              <div className="space-y-6">
                <div className="p-6 rounded-2xl bg-slate-50 border border-border">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-4">Quick Stats</h4>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Status</span>
                      <Badge className={result.status === 'passed' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                        {result.status === 'passed' ? 'COMPLIANT' : 'NON-COMPLIANT'}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Total Issues</span>
                      <span className="font-bold text-lg">{result.categories.reduce((acc, cat) => acc + cat.issues.length, 0)}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-border pt-4">
                      <span className="text-sm text-muted-foreground">Review Time</span>
                      <span className="text-xs font-mono">~45s</span>
                    </div>
                  </div>
                </div>

                {result.status === 'passed' && (
                  <div className="p-4 rounded-2xl bg-green-50 border border-green-200 flex items-start gap-3">
                    <CheckCircle2 size={18} className="text-green-600 mt-0.5" />
                    <p className="text-xs text-green-700 leading-tight">
                      This drawing is ready for municipal handover based on automated checks.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Visual Annotations (Spatial View) */}
          {drawingUrl && (
            <div className="bg-white border border-border rounded-[2rem] p-10 shadow-sm space-y-6 print:break-inside-avoid">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <Search size={20} className="text-primary" /> Visual Spatial Analysis
                </h3>
                <p className="text-xs text-muted-foreground">Interactive Bounding Boxes</p>
              </div>

              <div className="relative border border-border rounded-xl bg-slate-100 overflow-hidden flex items-center justify-center min-h-[400px]">
                <div className="relative inline-block shadow-2xl">
                  <img 
                    src={drawingUrl} 
                    alt="Review Result" 
                    className="block max-w-full h-auto"
                  />
                  
                  {/* SVG Overlay for Bounding Boxes */}
                  <svg 
                    className="absolute inset-0 w-full h-full pointer-events-none" 
                    viewBox="0 0 1 1" 
                    preserveAspectRatio="xMidYMid meet"
                  >
                    {result.categories.flatMap(cat => 
                      cat.issues.map((issue, i) => {
                        if (!issue.boundingBox) return null;
                        const { x, y, width, height } = issue.boundingBox;
                        const isSelected = selectedIssue === issue;
                        
                        return (
                          <rect
                            key={`${cat.name}-${i}`}
                            x={x}
                            y={y}
                            width={width}
                            height={height}
                            fill={isSelected ? "rgba(239, 68, 68, 0.2)" : "rgba(239, 68, 68, 0.1)"}
                            stroke="rgb(239, 68, 68)"
                            strokeWidth={isSelected ? "0.01" : "0.005"}
                            className="transition-all duration-300 pointer-events-auto cursor-pointer"
                            onClick={() => setSelectedIssue(issue)}
                          >
                            <title>{issue.description}</title>
                          </rect>
                        );
                      })
                    )}
                  </svg>
                </div>
              </div>
              <p className="text-center text-[10px] text-muted-foreground italic">
                *Normalized coordinates shown as SVG overlays. Click a box to highlight details.
              </p>
            </div>
          )}

          {/* Categories Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {result.categories.map((category, idx) => (
              <div key={idx} className="bg-white border border-border rounded-[2rem] p-8 shadow-sm space-y-6 print:break-inside-avoid">
                <div className="flex items-center justify-between border-b border-border pb-4">
                  <h3 className="font-bold text-lg flex items-center gap-3">
                    <FileText size={18} className="text-primary" /> {category.name}
                  </h3>
                  <Badge variant="outline" className="rounded-full">
                    {category.issues.length} Issues
                  </Badge>
                </div>

                <div className="space-y-4">
                  {category.issues.map((issue, i) => (
                    <div 
                      key={i} 
                      className={cn(
                        "p-6 rounded-2xl border transition-all duration-300",
                        selectedIssue === issue ? "ring-2 ring-primary border-primary/20 bg-primary/5" : "border-border",
                        "hover:shadow-md cursor-pointer"
                      )}
                      onClick={() => setSelectedIssue(issue)}
                    >
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className={cn("px-2 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider border", getSeverityColor(issue.severity))}>
                          {issue.severity}
                        </div>
                        {issue.boundingBox && <Maximize2 size={12} className="text-muted-foreground" />}
                      </div>
                      <p className="text-sm font-bold mb-2 leading-snug">{issue.description}</p>
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-start gap-3 mt-4">
                        <AlertTriangle size={14} className="text-amber-500 mt-1 shrink-0" />
                        <div className="flex-1 space-y-1 text-left">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex justify-between items-center w-full">
                            <span>Action Required</span>
                            <KnowledgeFeedback agentRole={getAgentRoleForCategory(category.name)} categoryName={category.name} issue={issue} userRole={userRole} />
                          </p>
                          <p className="text-xs text-slate-600 italic">"{issue.actionItem}"</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Knowledge Sources */}
          {result.citations && result.citations.length > 0 && (
            <div className="print:break-inside-avoid">
              <KnowledgeSources citations={result.citations} />
            </div>
          )}

          {/* Traceability Footer */}
          <div className="bg-slate-900 text-slate-100 rounded-[2rem] p-10 shadow-xl overflow-hidden relative">
            <div className="absolute top-0 right-0 p-10 opacity-10">
              <Cpu size={120} />
            </div>
            <div className="relative z-10 space-y-6">
              <h3 className="text-xl font-bold flex items-center gap-3">
                <Activity size={20} className="text-primary" /> Orchestration Traceability
              </h3>
              <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
                <ScrollArea className="h-40 pr-4">
                  <p className="text-xs font-mono text-slate-400 leading-relaxed">
                    {result.traceLog}
                  </p>
                </ScrollArea>
              </div>
              <div className="flex items-center justify-between pt-4 border-t border-white/10">
                <p className="text-[10px] text-slate-500 uppercase tracking-widest">
                  Compliance Certification ID: ARC-{Math.random().toString(36).substring(7).toUpperCase()}
                </p>
                <p className="text-[10px] text-slate-500">
                  {new Date().toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
