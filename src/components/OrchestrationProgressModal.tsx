import React from 'react';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog';
import { Badge } from './ui/badge';
import { Cpu, Shield, ShieldCheck, Search, CheckCircle2, Sparkles, Loader2, Clock, Building2, Flame, Accessibility, Zap, Droplets, FileCheck2 } from 'lucide-react';
import { AIProgress } from '../services/geminiService';

const iconFor = (name: string, discipline?: string) => {
  const key = `${discipline || ''} ${name}`.toLowerCase();
  if (key.includes('fire')) return Flame;
  if (key.includes('access')) return Accessibility;
  if (key.includes('energy') || key.includes('electric')) return Zap;
  if (key.includes('drain') || key.includes('storm')) return Droplets;
  if (key.includes('council') || key.includes('submission')) return FileCheck2;
  if (key.includes('struct') || key.includes('foundation')) return Shield;
  if (key.includes('scope') || key.includes('planning')) return Search;
  if (key.includes('orchestrator')) return Cpu;
  return Building2;
};

export function OrchestrationProgressModal({ progress, isOpen }: { progress: AIProgress | null, isOpen: boolean, [key: string]: any }) {
  if (!progress) return null;

  const agentNames = Array.from(new Set([...(progress.plannedAgents || []), ...progress.completedAgents, progress.agentName].filter(Boolean)));
  const agents = agentNames.map(name => ({ name, icon: iconFor(name, progress.agentName === name ? progress.discipline : undefined), shortName: name.replace(/ Agent$/i, '').slice(0, 18) }));

  const LinearAgentsList = () => (
    <div className="space-y-3">
      {agents.map((agent, idx) => {
        const isCompleted = progress.completedAgents.includes(agent.name);
        const isCurrent = progress.agentName === agent.name;
        const Icon = agent.icon;

        return (
          <div key={idx} className={`p-3 rounded-xl border transition-all duration-300 flex items-center justify-between ${isCurrent ? 'bg-primary/5 border-primary/20 shadow-sm' : isCompleted ? 'bg-secondary/10 border-border opacity-80' : 'bg-white border-border opacity-50'}`}>
            <div className="flex items-center gap-3 min-w-0">
              <div className={`p-1.5 rounded-lg flex-shrink-0 transition-transform duration-500 ${isCurrent ? 'bg-primary text-primary-foreground scale-110 shadow-lg shadow-primary/20' : 'bg-secondary text-muted-foreground'}`}>
                <Icon size={16} className={isCurrent ? 'animate-bounce' : ''} />
              </div>
              <div className="min-w-0">
                <p className={`text-xs font-bold truncate ${isCurrent ? 'text-primary' : 'text-foreground'}`}>{agent.shortName}</p>
                <p className="text-[9px] text-muted-foreground truncate">{isCurrent ? progress.activity : isCompleted ? 'Completed' : 'Pending'}</p>
              </div>
            </div>
            {isCompleted ? <CheckCircle2 size={16} className="text-green-500 flex-shrink-0" /> : isCurrent ? <Loader2 size={16} className="text-primary animate-spin flex-shrink-0" /> : <Clock size={16} className="text-muted-foreground flex-shrink-0" />}
          </div>
        );
      })}
    </div>
  );

  return (
    <Dialog open={isOpen}>
      <DialogContent className="max-w-2xl border-border bg-white p-0 overflow-hidden rounded-[2.5rem] shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="bg-primary/5 p-6 sm:p-8 border-b border-border relative overflow-hidden flex-shrink-0">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent animate-pulse" />
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-4">
              <div>
                <Badge className="bg-primary/10 text-primary border-primary/20 mb-2 px-3 py-1 text-[10px] uppercase tracking-widest font-bold">
                  {(progress.mode || 'basic_ai_screen').replace(/_/g, ' ')}
                </Badge>
                <DialogTitle className="font-heading font-bold text-3xl sm:text-4xl tracking-tighter">
                  {progress.percentage}% <span className="text-muted-foreground font-normal text-xl sm:text-2xl">Analyzed</span>
                </DialogTitle>
              </div>
              <div className="p-2 sm:p-4 bg-white rounded-2xl shadow-xl shadow-primary/5 border border-primary/20 flex-shrink-0 relative overflow-hidden group">
                <div className="absolute inset-0 bg-primary/5 animate-pulse rounded-2xl" />
                <Cpu className="text-primary animate-spin-slow relative z-10" size={28} />
              </div>
            </div>
            <div className="w-full h-2 bg-secondary/30 rounded-full overflow-hidden mb-3">
              <div className="h-full bg-primary transition-all duration-500 ease-out" style={{ width: `${progress.percentage}%` }} />
            </div>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              <span>Scanning SA Built-Environment Standards</span>
              <span className="text-primary animate-pulse">{progress.activity}</span>
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-8 space-y-6 sm:space-y-8">
          <div>
            <h4 className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-4">Active Workflow Agents</h4>
            <LinearAgentsList />
          </div>
          <div className="p-4 sm:p-6 bg-secondary/10 rounded-2xl border border-border">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="p-2 bg-white rounded-lg shadow-sm flex-shrink-0">
                <Sparkles size={14} className="text-primary sm:w-4 sm:h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-bold mb-1 truncate">Current Task: {progress.agentName}</p>
                <p className="text-[9px] sm:text-[10px] text-muted-foreground leading-relaxed">
                  This preliminary AI review checks South African built-environment standards, submission readiness, and professional sign-off triggers without certifying compliance.
                </p>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
