import React from 'react';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog';
import { Badge } from './ui/badge';
import { Cpu, Shield, Eye, ShieldCheck, Search, CheckCircle2, Sparkles, Loader2, Clock } from 'lucide-react';
import { AIProgress } from '../services/geminiService';

export function OrchestrationProgressModal({ progress, isOpen, ...props }: { progress: AIProgress | null, isOpen: boolean, [key: string]: any }) {
  if (!progress) return null;

  const agents = [
    { name: 'Wall Compliance Agent', icon: Shield, shortName: 'Wall' },
    { name: 'Fenestration Agent', icon: Eye, shortName: 'Windows' },
    { name: 'Fire Safety Agent', icon: ShieldCheck, shortName: 'Fire' },
    { name: 'Area Sizing Agent', icon: Search, shortName: 'Area' },
    { name: 'General Compliance Agent', icon: CheckCircle2, shortName: 'General' },
    { name: 'SANS Specialist', icon: Sparkles, shortName: 'SANS' }
  ];

  // Calculate positions in a circle (6 agents around orchestrator)
  const getCirclePosition = (index: number, total: number, radius: number, centerX: number, centerY: number) => {
    const angle = (index / total) * 2 * Math.PI - Math.PI / 2; // Start from top
    return {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle)
    };
  };

  const CircularDiagram = () => {
    const svgSize = 340;
    const centerX = svgSize / 2;
    const centerY = svgSize / 2;
    const radius = 90;

    return (
      <svg width={svgSize} height={svgSize} className="w-full h-auto max-w-sm mx-auto">
        {/* Connection lines from center to agents */}
        {agents.map((agent, idx) => {
          const pos = getCirclePosition(idx, agents.length, radius, centerX, centerY);
          return (
            <line
              key={`line-${idx}`}
              x1={centerX}
              y1={centerY}
              x2={pos.x}
              y2={pos.y}
              stroke="currentColor"
              strokeWidth="2"
              className="text-border"
              opacity="0.5"
            />
          );
        })}

        {/* Center Orchestrator Node */}
        <circle cx={centerX} cy={centerY} r="32" fill="currentColor" className="text-primary" />
        <text x={centerX} y={centerY} textAnchor="middle" dy="0.3em" className="text-primary-foreground font-bold text-xs" fontSize="16">
          ⚙️
        </text>

        {/* Agent Nodes */}
        {agents.map((agent, idx) => {
          const pos = getCirclePosition(idx, agents.length, radius, centerX, centerY);
          const isCompleted = progress.completedAgents.includes(agent.name);
          const isCurrent = progress.agentName === agent.name;

          return (
            <g key={`agent-${idx}`}>
              {/* Status indicator for completed */}
              {isCompleted && (
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r="26"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-green-500"
                  opacity="0.3"
                />
              )}

              {/* Main node circle */}
              <circle
                cx={pos.x}
                cy={pos.y}
                r="22"
                fill="white"
                stroke="currentColor"
                strokeWidth="2"
                className={isCurrent ? 'text-primary' : isCompleted ? 'text-green-500' : 'text-border'}
              />

              {/* Icon background */}
              <circle
                cx={pos.x}
                cy={pos.y}
                r="18"
                fill="currentColor"
                className={isCurrent ? 'text-primary/10' : 'text-secondary'}
              />

              {/* Status indicator dot */}
              {isCurrent && (
                <circle
                  cx={pos.x + 18}
                  cy={pos.y - 18}
                  r="4"
                  fill="currentColor"
                  className="text-primary"
                />
              )}
            </g>
          );
        })}
      </svg>
    );
  };

  const LinearAgentsList = () => (
    <div className="space-y-3">
      {agents.map((agent, idx) => {
        const isCompleted = progress.completedAgents.includes(agent.name);
        const isCurrent = progress.agentName === agent.name;

        return (
          <div
            key={idx}
            className={`p-3 rounded-xl border transition-all duration-300 flex items-center justify-between ${
              isCurrent
                ? 'bg-primary/5 border-primary/20 shadow-sm'
                : isCompleted
                ? 'bg-secondary/10 border-border opacity-60'
                : 'bg-white border-border opacity-40'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`p-1.5 rounded-lg flex-shrink-0 ${
                  isCurrent ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                }`}
              >
                <agent.icon size={16} className={isCurrent ? 'animate-pulse' : ''} />
              </div>
              <div className="min-w-0">
                <p className={`text-xs font-bold truncate ${isCurrent ? 'text-primary' : 'text-foreground'}`}>
                  {agent.shortName}
                </p>
                <p className="text-[9px] text-muted-foreground truncate">
                  {isCurrent ? progress.activity : isCompleted ? 'Completed' : 'Pending'}
                </p>
              </div>
            </div>
            {isCompleted ? (
              <CheckCircle2 size={16} className="text-green-500 flex-shrink-0" />
            ) : isCurrent ? (
              <Loader2 size={16} className="text-primary animate-spin flex-shrink-0" />
            ) : (
              <Clock size={16} className="text-muted-foreground flex-shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <Dialog open={isOpen}>
      <DialogContent className="max-w-2xl border-border bg-white p-0 overflow-hidden rounded-[2.5rem] shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-primary/5 p-6 sm:p-8 border-b border-border relative overflow-hidden flex-shrink-0">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent animate-pulse" />

          <div className="relative z-10">
            <div className="flex justify-between items-start mb-4">
              <div>
                <Badge className="bg-primary/10 text-primary border-primary/20 mb-2 px-3 py-1 text-[10px] uppercase tracking-widest font-bold">
                  AI Orchestration in Progress
                </Badge>
                <DialogTitle className="font-heading font-bold text-3xl sm:text-4xl tracking-tighter">
                  {progress.percentage}% <span className="text-muted-foreground font-normal text-xl sm:text-2xl">Analyzed</span>
                </DialogTitle>
              </div>
              <div className="p-2 sm:p-4 bg-white rounded-2xl shadow-sm border border-border flex-shrink-0">
                <Cpu className="text-primary animate-spin" size={24} />
              </div>
            </div>

            <div className="w-full h-2 bg-secondary/30 rounded-full overflow-hidden mb-3">
              <div
                className="h-full bg-primary transition-all duration-500 ease-out"
                style={{ width: `${progress.percentage}%` }}
              />
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              <span>Scanning SANS 10400 Database</span>
              <span className="text-primary animate-pulse">{progress.activity}</span>
            </div>
          </div>
        </div>

        {/* Content - Responsive */}
        <div className="p-6 sm:p-8 space-y-6 sm:space-y-8">
          {/* Desktop: Circular Diagram */}
          <div className="hidden md:block">
            <h4 className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-4">
              Active Workflow Agents
            </h4>
            <CircularDiagram />
          </div>

          {/* Tablet & Mobile: Linear List */}
          <div className="md:hidden">
            <h4 className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-4">
              Active Workflow Agents
            </h4>
            <LinearAgentsList />
          </div>

          {/* Current Task Info */}
          <div className="p-4 sm:p-6 bg-secondary/10 rounded-2xl border border-border">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="p-2 bg-white rounded-lg shadow-sm flex-shrink-0">
                <Sparkles size={14} className="text-primary sm:w-4 sm:h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-bold mb-1 truncate">Current Task: {progress.agentName}</p>
                <p className="text-[9px] sm:text-[10px] text-muted-foreground leading-relaxed">
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
