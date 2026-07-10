// ProfessionSidebar — Left navigation for the Fee Proposal Builder workspace
//
// Lists all 12 professions with icons + display names, tool sections
// (Proposal Builder, Terms Library, Run History), and a Client Estimation section.
// Highlights active profession, handles switching via context.
// Collapses to icon-only mode below 900px viewport width.
//
// Requirements: 12.3, 12.6

import {
  Building2,
  Cog,
  Zap,
  Flame,
  Calculator,
  Map,
  Compass,
  TreePine,
  PenTool,
  Briefcase,
  Ruler,
  HardHat,
  FileText,
  BookOpen,
  History,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { ProfessionProfileRegistry } from '@/services/professionalFee/profiles';
import type { Profession } from '@/services/professionalFee/types';
import { useFeeProposalBuilder, type ToolView } from './FeeProposalBuilderContext';

// ---------------------------------------------------------------------------
// Icon mapping for each profession
// ---------------------------------------------------------------------------

const professionIcons: Record<Profession, LucideIcon> = {
  architect: Building2,
  civilEngineer: Compass,
  structuralEngineer: Ruler,
  electricalEngineer: Zap,
  mechanicalEngineer: Cog,
  fireEngineer: Flame,
  quantitySurveyor: Calculator,
  townPlanner: Map,
  landSurveyor: Briefcase,
  landscapeArchitect: TreePine,
  interiorDesigner: PenTool,
  constructionProjectManager: HardHat,
};

// ---------------------------------------------------------------------------
// Tool sections
// ---------------------------------------------------------------------------

interface ToolSection {
  id: ToolView;
  label: string;
  icon: LucideIcon;
}

const toolSections: ToolSection[] = [
  { id: 'calculator', label: 'Proposal Builder', icon: FileText },
  { id: 'terms', label: 'Terms Library', icon: BookOpen },
  { id: 'history', label: 'Run History', icon: History },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const registry = new ProfessionProfileRegistry();
const professionList = registry.list();

export default function ProfessionSidebar() {
  const {
    activeProfession,
    setActiveProfession,
    activeView,
    setActiveView,
  } = useFeeProposalBuilder();

  return (
    <aside
      className="
        flex flex-col h-full w-64
        glass-panel rounded-xl
        overflow-y-auto
        max-[900px]:w-14 max-[900px]:items-center
      "
      aria-label="Profession sidebar navigation"
    >
      {/* Tool sections header */}
      <div className="p-3 border-b border-border/40">
        <h3 className="font-heading text-xs uppercase tracking-wider text-muted-foreground mb-2 max-[900px]:sr-only">
          Tools
        </h3>
        <nav aria-label="Tool sections" className="flex flex-col gap-1">
          {toolSections.map((section) => {
            const Icon = section.icon;
            const isActive = activeView === section.id;
            return (
              <button
                key={section.id}
                onClick={() => setActiveView(section.id)}
                className={`
                  flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium
                  transition-colors duration-150
                  max-[900px]:justify-center max-[900px]:px-2
                  ${isActive
                    ? 'bg-primary/15 text-primary border border-primary/25'
                    : 'text-foreground/70 hover:bg-muted/60 hover:text-foreground border border-transparent'
                  }
                `}
                aria-current={isActive ? 'page' : undefined}
                title={section.label}
              >
                <Icon size={16} className="shrink-0" />
                <span className="max-[900px]:sr-only">{section.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Professions list */}
      <div className="p-3 flex-1 overflow-y-auto">
        <h3 className="font-heading text-xs uppercase tracking-wider text-muted-foreground mb-2 max-[900px]:sr-only">
          Professions
        </h3>
        <nav aria-label="Profession selection" className="flex flex-col gap-0.5">
          {professionList.map((profile) => {
            const Icon = professionIcons[profile.profession];
            const isActive = activeProfession === profile.profession;
            return (
              <button
                key={profile.profession}
                onClick={() => {
                  setActiveProfession(profile.profession);
                  setActiveView('calculator');
                }}
                className={`
                  flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm
                  transition-colors duration-150
                  max-[900px]:justify-center max-[900px]:px-2
                  ${isActive
                    ? 'bg-primary/15 text-primary font-semibold border border-primary/25'
                    : 'text-foreground/70 hover:bg-muted/60 hover:text-foreground border border-transparent'
                  }
                `}
                aria-current={isActive ? 'true' : undefined}
                title={profile.displayName}
              >
                <Icon size={16} className="shrink-0" />
                <span className="truncate max-[900px]:sr-only">{profile.displayName}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Client Estimation section */}
      <div className="p-3 border-t border-border/40">
        <h3 className="font-heading text-xs uppercase tracking-wider text-muted-foreground mb-2 max-[900px]:sr-only">
          Client Estimation
        </h3>
        <button
          onClick={() => setActiveView('client')}
          className={`
            flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium w-full
            transition-colors duration-150
            max-[900px]:justify-center max-[900px]:px-2
            ${activeView === 'client'
              ? 'bg-primary/15 text-primary border border-primary/25'
              : 'text-foreground/70 hover:bg-muted/60 hover:text-foreground border border-transparent'
            }
          `}
          aria-current={activeView === 'client' ? 'page' : undefined}
          title="Client / Developer Estimation"
        >
          <Users size={16} className="shrink-0" />
          <span className="max-[900px]:sr-only">What Will It Cost?</span>
        </button>
      </div>
    </aside>
  );
}
