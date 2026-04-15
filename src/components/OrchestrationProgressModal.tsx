import React from 'react';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog';
import { Badge } from './ui/badge';
import { Cpu, Shield, Eye, ShieldCheck, Search, CheckCircle2, Sparkles, Users, Loader2, Clock } from 'lucide-react';
import { AIProgress } from '../services/geminiService';

export function OrchestrationProgressModal({ progress, isOpen, ...props }: { progress: AIProgress | null, isOpen: boolean, [key: string]: any }) {
  if (!progress) return null;

  const agents = [
    { name: 'Orchestrator', icon: Cpu },
    { name: 'Wall Compliance Agent', icon: Shield },
    { name: 'Fenestration Agent', icon: Eye },
    { name: 'Fire Safety Agent', icon: ShieldCheck },
    { name: 'Area Sizing Agent', icon: Search },
    { name: 'General Compliance Agent', icon: CheckCircle2 },
    { name: 'SANS Specialist', icon: Sparkles }
  ];

  return (
    <Dialog open={isOpen}>
      <DialogContent className="max-w-xl border-border bg-white p-0 overflow-hidden rounded-[2.5rem] shadow-2xl">
        <div className="bg-primary/5 p-10 border-b border-border relative overflow-hidden">
          {/* Animated Background Pulse */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent animate-pulse" />
          
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-6">
              <div>
                <Badge className="bg-primary/10 text-primary border-primary/20 mb-3 px-3 py-1 text-[10px] uppercase tracking-widest font-bold">
                  AI Orchestration in Progress
                </Badge>
                <DialogTitle className="font-heading font-bold text-4xl tracking-tighter">
                  {progress.percentage}% <span className="text-muted-foreground font-normal text-2xl">Analyzed</span>
                </DialogTitle>
              </div>
              <div className="p-4 bg-white rounded-2xl shadow-sm border border-border">
                <Cpu className="text-primary animate-spin" size={32} />
              </div>
            </div>

            <div className="w-full h-3 bg-secondary/30 rounded-full overflow-hidden mb-4">
              <div 
                className="h-full bg-primary transition-all duration-500 ease-out"
                style={{ width: `${progress.percentage}%` }}
              />
            </div>
            
            <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              <span>Scanning SANS 10400 Database</span>
              <span className="text-primary animate-pulse">{progress.activity}</span>
            </div>
          </div>
        </div>

        <div className="p-10 space-y-8">
          <div>
            <h4 className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-6 flex items-center gap-2">
              <Users size={14} className="text-primary" /> Active Workflow Agents
            </h4>
            
            <div className="grid grid-cols-1 gap-4">
              {agents.map((agent, idx) => {
                const isCompleted = progress.completedAgents.includes(agent.name);
                const isCurrent = progress.agentName === agent.name;
                
                return (
                  <div 
                    key={idx} 
                    className={`p-4 rounded-2xl border transition-all duration-300 flex items-center justify-between ${
                      isCurrent ? 'bg-primary/5 border-primary/20 shadow-sm scale-[1.02]' : 
                      isCompleted ? 'bg-secondary/10 border-border opacity-60' : 
                      'bg-white border-border opacity-40'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-xl ${isCurrent ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
                        <agent.icon size={18} className={isCurrent ? 'animate-pulse' : ''} />
                      </div>
                      <div>
                        <p className={`text-sm font-bold ${isCurrent ? 'text-primary' : 'text-foreground'}`}>
                          {agent.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {isCurrent ? progress.activity : isCompleted ? 'Compliance check finalized' : 'Awaiting orchestration...'}
                        </p>
                      </div>
                    </div>
                    {isCompleted ? (
                      <CheckCircle2 size={18} className="text-green-500" />
                    ) : isCurrent ? (
                      <Loader2 size={18} className="text-primary animate-spin" />
                    ) : (
                      <Clock size={18} className="text-muted-foreground" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="p-6 bg-secondary/10 rounded-2xl border border-border">
            <div className="flex items-start gap-4">
              <div className="p-2 bg-white rounded-lg shadow-sm">
                <Sparkles size={16} className="text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-bold mb-1">Current Task: {progress.agentName}</p>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  The {progress.agentName} is currently cross-referencing your drawing against specific SANS 10400 clauses to ensure full council readiness.
                </p>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
