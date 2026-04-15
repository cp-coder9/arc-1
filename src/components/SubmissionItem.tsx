import React, { useState } from 'react';
import { Submission } from '../types';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Badge } from './ui/badge';
import { FileUp, CheckCircle2, AlertCircle, Loader2, Shield, Clock, Sparkles, ShieldCheck, ExternalLink, ArrowRight, History, User, Cpu } from 'lucide-react';
import { format } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import { KnowledgeFeedback } from './KnowledgeFeedback';

interface SubmissionItemProps {
  sub: Submission;
  userRole?: 'admin' | 'architect' | 'client';
  [key: string]: any;
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

export function SubmissionItem({ sub, userRole, ...props }: SubmissionItemProps) {
  const [isOpen, setIsOpen] = useState(false);

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
              <section className="space-y-4">
                <h4 className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground flex items-center gap-2">
                  <Sparkles size={14} className="text-primary" /> AI Compliance Feedback
                </h4>
                {sub.aiStructuredFeedback && sub.aiStructuredFeedback.length > 0 ? (
                  <div className="space-y-6">
                    {sub.aiStructuredFeedback.map((cat, i) => (
                      <div key={i} className="space-y-3">
                        <h5 className="text-[10px] font-bold text-primary uppercase tracking-widest flex items-center gap-2">
                          <div className="w-1 h-1 rounded-full bg-primary" /> {cat.name}
                        </h5>
                        <div className="grid gap-3">
                          {cat.issues.map((issue, j) => (
                            <div key={j} className={`p-4 rounded-2xl border ${
                              issue.severity === 'high' ? 'bg-red-50/50 border-red-100' :
                              issue.severity === 'medium' ? 'bg-yellow-50/50 border-yellow-100' :
                              'bg-blue-50/50 border-blue-100'
                            }`}>
                              <div className="flex justify-between items-start mb-2">
                                <p className="text-sm font-bold leading-tight">{issue.description}</p>
                                <Badge variant="outline" className={`text-[8px] font-bold uppercase px-2 py-0 h-4 ${
                                  issue.severity === 'high' ? 'border-red-200 text-red-700 bg-red-50' :
                                  issue.severity === 'medium' ? 'border-yellow-200 text-yellow-700 bg-yellow-50' :
                                  'border-blue-200 text-blue-700 bg-blue-50'
                                }`}>
                                  {issue.severity}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-black/5">
                                <div className="p-1 rounded-full bg-white shadow-sm">
                                  <CheckCircle2 size={10} className="text-primary" />
                                </div>
                                <div className="flex-1 flex justify-between items-start gap-4">
                                  <p className="text-[10px] font-bold text-muted-foreground"><span className="text-primary">ACTION:</span> {issue.actionItem}</p>
                                  <KnowledgeFeedback agentRole={getAgentRoleForCategory(cat.name)} categoryName={cat.name} issue={issue} userRole={userRole} />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
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
