import React, { useState, useMemo } from 'react';
import { Submission } from '../types';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Badge } from './ui/badge';
import { FileUp, CheckCircle2, AlertCircle, Loader2, Shield, Clock, Sparkles, ShieldCheck, ExternalLink, ArrowRight, History, User, Cpu, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import { KnowledgeFeedback } from './KnowledgeFeedback';

interface SubmissionItemProps {
  sub: Submission;
  userRole?: 'admin' | 'architect' | 'client';
  [key: string]: any;
}

// Plain language mappings for technical terms
const plainLanguageMap: Record<string, string> = {
  'wall': 'Wall Thickness & Materials',
  'fenestration': 'Windows & Natural Light',
  'door': 'Doors & Fire Safety',
  'area': 'Room Sizes & Space Requirements',
  'general': 'General Compliance',
  'sans': 'SANS 10400 Standards',
  'dpc': 'moisture barrier',
  'cavity': 'wall insulation',
  'thickness': 'thickness',
  'ventilation': 'air flow',
  'glazing': 'window glass',
};

const getPlainLanguageCategory = (categoryName: string): string => {
  const lower = categoryName.toLowerCase();
  for (const [key, value] of Object.entries(plainLanguageMap)) {
    if (lower.includes(key)) return value;
  }
  return categoryName;
};

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

// Helper to calculate compliance summary
const calculateComplianceSummary = (feedback?: string, categories?: any[]) => {
  if (!categories || categories.length === 0) {
    return { totalIssues: 0, criticalCount: 0, warningCount: 0, infoCount: 0, compliancePercentage: 0 };
  }

  let criticalCount = 0;
  let warningCount = 0;
  let infoCount = 0;
  let totalIssues = 0;

  categories.forEach(cat => {
    if (cat.issues && Array.isArray(cat.issues)) {
      cat.issues.forEach(issue => {
        totalIssues++;
        if (issue.severity === 'high') criticalCount++;
        else if (issue.severity === 'medium') warningCount++;
        else infoCount++;
      });
    }
  });

  const compliancePercentage = totalIssues > 0 ? Math.round(((totalIssues - criticalCount) / totalIssues) * 100) : 100;

  return { totalIssues, criticalCount, warningCount, infoCount, compliancePercentage };
};

export function SubmissionItem({ sub, userRole, ...props }: SubmissionItemProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  // Calculate compliance summary
  const complianceSummary = useMemo(
    () => calculateComplianceSummary(sub.aiFeedback, sub.aiStructuredFeedback),
    [sub.aiFeedback, sub.aiStructuredFeedback]
  );

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'approved': return { label: 'Approved', color: 'bg-green-50 text-green-700 border-green-100', icon: CheckCircle2 };
      case 'ai_failed': return { label: 'AI Failed', color: 'bg-red-50 text-red-700 border-red-100', icon: AlertCircle };
      case 'admin_rejected': return { label: 'Admin Rejected', color: 'bg-red-50 text-red-700 border-red-100', icon: AlertCircle };
      case 'ai_reviewing': return { label: 'AI Reviewing', color: 'bg-blue-50 text-blue-700 border-blue-100', icon: Loader2 };
      case 'processing': return { label: 'Processing', color: 'bg-yellow-50 text-yellow-700 border-yellow-100', icon: Clock };
      case 'admin_reviewing': return { label: 'Awaiting Admin', color: 'bg-primary/5 text-primary border-primary/10', icon: Shield };
      default: return { label: status.replace('_', ' '), color: 'bg-secondary text-muted-foreground', icon: Clock };
    }
  };

  const config = getStatusConfig(sub.status);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger render={
        <button className="w-full p-4 border border-border rounded-xl flex items-center justify-between bg-white shadow-sm hover:border-primary/30 hover:shadow-md transition-all group text-left">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-secondary/50 text-muted-foreground group-hover:text-primary transition-colors">
              <FileUp size={16} />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold truncate max-w-[150px]">{sub.drawingName}</span>
              <span className="text-[10px] text-muted-foreground">{format(new Date(sub.createdAt), 'MMM d, HH:mm')}</span>
            </div>
          </div>
          <Badge variant="outline" className={`px-3 py-0.5 rounded-full font-bold uppercase tracking-widest text-[10px] flex items-center gap-1 ${config.color}`}>
            {sub.status === 'ai_reviewing' || sub.status === 'processing' ? <config.icon size={10} className="animate-spin" /> : <config.icon size={10} />}
            {config.label}
          </Badge>
        </button>
      } />
      <DialogContent className="max-w-3xl border-border bg-white p-0 overflow-hidden rounded-[2rem] shadow-2xl">
        <div className="bg-primary/5 p-8 border-b border-border">
          <DialogHeader>
            <div className="flex justify-between items-start">
              <div>
                <DialogTitle className="font-heading font-bold text-3xl tracking-tighter">{sub.drawingName}</DialogTitle>
                <DialogDescription className="text-muted-foreground mt-1 flex items-center gap-2">
                  Submitted on {format(new Date(sub.createdAt), 'MMMM d, yyyy HH:mm')}
                </DialogDescription>
              </div>
              <Badge className={`px-4 py-1.5 rounded-full font-bold uppercase tracking-widest text-xs ${config.color}`}>
                {config.label}
              </Badge>
            </div>
          </DialogHeader>
        </div>

        <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-8 max-h-[70vh] overflow-y-auto">
          <div className="md:col-span-2 space-y-8">
              {/* Compliance Summary Card */}
              {sub.aiStructuredFeedback && sub.aiStructuredFeedback.length > 0 && (
                <section className="p-6 rounded-2xl border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-primary/2">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-3 rounded-xl bg-primary/10">
                        <TrendingUp size={20} className="text-primary" />
                      </div>
                      <div>
                        <h4 className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Compliance Summary</h4>
                        <p className="text-2xl font-bold text-foreground mt-1">{complianceSummary.compliancePercentage}% Compliant</p>
                      </div>
                    </div>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-2 mb-4 overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-primary to-primary/70 transition-all duration-500"
                      style={{ width: `${complianceSummary.compliancePercentage}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-3 bg-white rounded-lg">
                      <p className="text-lg font-bold text-red-600">{complianceSummary.criticalCount}</p>
                      <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Critical</p>
                    </div>
                    <div className="p-3 bg-white rounded-lg">
                      <p className="text-lg font-bold text-yellow-600">{complianceSummary.warningCount}</p>
                      <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Warnings</p>
                    </div>
                    <div className="p-3 bg-white rounded-lg">
                      <p className="text-lg font-bold text-blue-600">{complianceSummary.infoCount}</p>
                      <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Info</p>
                    </div>
                  </div>
                </section>
              )}

              {/* AI Compliance Feedback Section */}
              <section className="space-y-4">
                <h4 className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground flex items-center gap-2">
                  <Sparkles size={14} className="text-primary" /> Detailed Compliance Review
                </h4>
                {sub.aiStructuredFeedback && sub.aiStructuredFeedback.length > 0 ? (
                  <div className="space-y-6">
                    {/* Critical Issues Section */}
                    {complianceSummary.criticalCount > 0 && (
                      <div className="space-y-3">
                        <h5 className="text-[11px] font-bold text-red-700 uppercase tracking-widest flex items-center gap-2 px-4 py-2 bg-red-50 rounded-lg border border-red-100">
                          <AlertCircle size={14} /> Critical Issues ({complianceSummary.criticalCount})
                        </h5>
                        <div className="grid gap-4">
                          {sub.aiStructuredFeedback.flatMap((cat, catIdx) => 
                            cat.issues
                              .filter(issue => issue.severity === 'high')
                              .map((issue, issueIdx) => (
                                <div key={`${catIdx}-${issueIdx}`} className="p-5 rounded-2xl border-2 border-red-200 bg-red-50/60 hover:bg-red-50 transition-colors">
                                  <div className="flex justify-between items-start mb-3">
                                    <div className="flex-1">
                                      <p className="text-sm font-bold text-foreground leading-snug">{issue.description}</p>
                                      <p className="text-[10px] text-muted-foreground mt-1">{getPlainLanguageCategory(cat.name)}</p>
                                    </div>
                                    <Badge className="bg-red-600 text-white text-[8px] font-bold uppercase px-2 py-1 flex-shrink-0">Critical</Badge>
                                  </div>
                                  <div className="pt-3 border-t border-red-100 space-y-2">
                                    <div className="flex items-start gap-2">
                                      <CheckCircle2 size={14} className="text-red-600 flex-shrink-0 mt-0.5" />
                                      <div className="flex-1">
                                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">What to do:</p>
                                        <p className="text-sm text-foreground mt-1">{issue.actionItem}</p>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="mt-3 flex items-center justify-between">
                                    <p className="text-[9px] text-muted-foreground italic">Requires immediate attention</p>
                                    <KnowledgeFeedback agentRole={getAgentRoleForCategory(cat.name)} categoryName={cat.name} issue={issue} userRole={userRole} />
                                  </div>
                                </div>
                              ))
                          )}
                        </div>
                      </div>
                    )}

                    {/* Warning Issues Section */}
                    {complianceSummary.warningCount > 0 && (
                      <div className="space-y-3">
                        <h5 className="text-[11px] font-bold text-yellow-700 uppercase tracking-widest flex items-center gap-2 px-4 py-2 bg-yellow-50 rounded-lg border border-yellow-100">
                          <AlertCircle size={14} /> Warnings ({complianceSummary.warningCount})
                        </h5>
                        <div className="grid gap-4">
                          {sub.aiStructuredFeedback.flatMap((cat, catIdx) => 
                            cat.issues
                              .filter(issue => issue.severity === 'medium')
                              .map((issue, issueIdx) => (
                                <div key={`${catIdx}-${issueIdx}`} className="p-5 rounded-2xl border-2 border-yellow-200 bg-yellow-50/60 hover:bg-yellow-50 transition-colors">
                                  <div className="flex justify-between items-start mb-3">
                                    <div className="flex-1">
                                      <p className="text-sm font-bold text-foreground leading-snug">{issue.description}</p>
                                      <p className="text-[10px] text-muted-foreground mt-1">{getPlainLanguageCategory(cat.name)}</p>
                                    </div>
                                    <Badge className="bg-yellow-600 text-white text-[8px] font-bold uppercase px-2 py-1 flex-shrink-0">Warning</Badge>
                                  </div>
                                  <div className="pt-3 border-t border-yellow-100 space-y-2">
                                    <div className="flex items-start gap-2">
                                      <CheckCircle2 size={14} className="text-yellow-600 flex-shrink-0 mt-0.5" />
                                      <div className="flex-1">
                                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">What to do:</p>
                                        <p className="text-sm text-foreground mt-1">{issue.actionItem}</p>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="mt-3 flex items-center justify-between">
                                    <p className="text-[9px] text-muted-foreground italic">Should be reviewed and addressed</p>
                                    <KnowledgeFeedback agentRole={getAgentRoleForCategory(cat.name)} categoryName={cat.name} issue={issue} userRole={userRole} />
                                  </div>
                                </div>
                              ))
                          )}
                        </div>
                      </div>
                    )}

                    {/* Info Notes Section */}
                    {complianceSummary.infoCount > 0 && (
                      <div className="space-y-3">
                        <h5 className="text-[11px] font-bold text-blue-700 uppercase tracking-widest flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-lg border border-blue-100">
                          <Clock size={14} /> Notes & Observations ({complianceSummary.infoCount})
                        </h5>
                        <div className="grid gap-4">
                          {sub.aiStructuredFeedback.flatMap((cat, catIdx) => 
                            cat.issues
                              .filter(issue => issue.severity === 'low')
                              .map((issue, issueIdx) => (
                                <div key={`${catIdx}-${issueIdx}`} className="p-5 rounded-2xl border-2 border-blue-200 bg-blue-50/60 hover:bg-blue-50 transition-colors">
                                  <div className="flex justify-between items-start mb-3">
                                    <div className="flex-1">
                                      <p className="text-sm font-bold text-foreground leading-snug">{issue.description}</p>
                                      <p className="text-[10px] text-muted-foreground mt-1">{getPlainLanguageCategory(cat.name)}</p>
                                    </div>
                                    <Badge variant="outline" className="border-blue-200 text-blue-700 bg-blue-50 text-[8px] font-bold uppercase px-2 py-1 flex-shrink-0">Info</Badge>
                                  </div>
                                  <div className="pt-3 border-t border-blue-100 space-y-2">
                                    <div className="flex items-start gap-2">
                                      <CheckCircle2 size={14} className="text-blue-600 flex-shrink-0 mt-0.5" />
                                      <div className="flex-1">
                                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Note:</p>
                                        <p className="text-sm text-foreground mt-1">{issue.actionItem}</p>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : sub.aiFeedback ? (
                  <div className="p-6 bg-secondary/30 rounded-2xl border border-border markdown-body text-sm leading-relaxed">
                    <ReactMarkdown>{sub.aiFeedback}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="p-10 text-center border-2 border-dashed border-border rounded-2xl bg-white/50">
                    <Loader2 className="mx-auto text-primary animate-spin mb-2" size={24} />
                    <p className="text-xs text-muted-foreground italic">AI is currently analyzing your drawing for SANS 10400 compliance...</p>
                  </div>
                )}
              </section>

            {sub.adminFeedback && (
              <section className="space-y-4">
                <h4 className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground flex items-center gap-2">
                  <ShieldCheck size={14} className="text-primary" /> Administrative Review
                </h4>
                <div className="p-6 bg-primary/5 rounded-2xl border border-primary/20 text-sm leading-relaxed italic">
                  "{sub.adminFeedback}"
                </div>
              </section>
            )}

            <section className="space-y-4">
              <h4 className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground flex items-center gap-2">
                <ExternalLink size={14} className="text-primary" /> Drawing Reference
              </h4>
              <a 
                href={sub.drawingUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center justify-between p-4 bg-white border border-border rounded-xl hover:border-primary/30 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <FileUp size={20} className="text-primary" />
                  <span className="text-sm font-medium">{sub.drawingName}</span>
                </div>
                <ArrowRight size={18} className="text-muted-foreground group-hover:text-primary transition-all group-hover:translate-x-1" />
              </a>
            </section>
          </div>

          <div className="space-y-6">
            <h4 className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground flex items-center gap-2">
              <History size={14} className="text-primary" /> Traceability Log
            </h4>
            <div className="relative space-y-6 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-border">
              {sub.traceability.map((log, idx) => (
                <div key={idx} className="relative pl-8">
                  <div className={`absolute left-0 top-1 w-6 h-6 rounded-full border-4 border-white shadow-sm flex items-center justify-center ${
                    log.actor === 'Architect' ? 'bg-primary' : 
                    log.actor === 'AI Orchestrator' ? 'bg-purple-500' : 
                    log.actor === 'System' ? 'bg-blue-500' : 'bg-green-500'
                  }`}>
                    {log.actor === 'Architect' ? <User size={10} className="text-white" /> : 
                     log.actor === 'AI Orchestrator' ? <Cpu size={10} className="text-white" /> : 
                     <Shield size={10} className="text-white" />}
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <p className="text-[10px] font-bold uppercase tracking-widest">{log.actor}</p>
                      <p className="text-[9px] text-muted-foreground">{format(new Date(log.timestamp), 'HH:mm')}</p>
                    </div>
                    <p className="text-xs font-bold text-foreground">{log.action}</p>
                    <p className="text-[10px] text-muted-foreground leading-tight">{log.details}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
