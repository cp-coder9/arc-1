/**
 * Health & Safety Workspace — Full H&S module UI following SpecForge workspace template.
 *
 * Layout pattern:
 * - App shell provides left sidebar nav, top header bar with breadcrumbs
 * - This component renders inside the content area with:
 *   - Header Card (tool name, project context, role badge)
 *   - Project toggles (multi-project + standalone/all-projects view)
 *   - Tab navigation (Overview, Safety File, Permits, HIRA, Incidents, Inductions, H&S Plans, Fall Protection)
 *   - Active tab content with stat cards, tables, forms
 */

import React, { useState, useMemo, useCallback } from 'react';
import type { UserProfile } from '@/types';
import type {
  SafetyFile,
  HazardEntry,
  Permit,
  Incident,
  Induction,
  ToolboxTalk,
  HSPlan,
  FallProtectionPlan,
  RiskLevel,
} from '@/services/healthSafety/hsTypes';
import { ADVISORY_DISCLAIMER, MANDATORY_SAFETY_FILE_SECTIONS, RISK_MATRIX_THRESHOLDS } from '@/services/healthSafety/hsConstants';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import ClientSpecWizard from '@/components/healthSafety/ClientSpecWizard';
import {
  Shield,
  FileCheck,
  ClipboardList,
  AlertTriangle,
  AlertCircle,
  Users,
  FileText,
  HardHat,
  Plus,
  ChevronRight,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface Props {
  user: UserProfile;
  projectId?: string;
}

interface ProjectOption {
  id: string;
  name: string;
  status: 'active' | 'pending' | 'complete';
}

// ── Demo Data (until API wiring) ─────────────────────────────────────────────

const DEMO_PROJECTS: ProjectOption[] = [
  { id: 'proj-1', name: 'Kensington Mixed-Use', status: 'active' },
  { id: 'proj-2', name: 'Sandton Office Park', status: 'active' },
  { id: 'proj-3', name: 'Melrose Arch Phase 3', status: 'pending' },
];

const DEMO_SAFETY_FILE: SafetyFile = {
  id: 'sf-001',
  projectId: 'proj-1',
  tenantId: 'tenant-1',
  sections: MANDATORY_SAFETY_FILE_SECTIONS.map((s, i) => ({
    sectionId: s.sectionId,
    title: s.title,
    regulationRef: s.regulationRef,
    status: i < 6 ? 'complete' as const : i === 6 ? 'incomplete' as const : 'incomplete' as const,
    lastUpdated: i < 6 ? '2026-06-12' : undefined,
    updatedBy: i < 6 ? 'Thabo Mokoena' : undefined,
    version: i < 6 ? 2 : 0,
    linkedRecordIds: [],
  })),
  complianceScore: 75,
  createdAt: '2026-05-01',
  updatedAt: '2026-07-03',
};

const DEMO_PERMITS: Permit[] = [
  { id: 'PTW-0041', projectId: 'proj-1', type: 'excavation', location: 'Block C Foundation', hazards: ['Collapse', 'Underground services'], precautions: ['Shoring', 'Daily inspection'], responsiblePersons: ['James Ndlovu'], requestedBy: 'James Ndlovu', approvedBy: 'Thabo Mokoena', validFrom: '2026-07-05T06:00:00', validTo: '2026-07-05T18:00:00', state: 'active', createdAt: '2026-07-04', updatedAt: '2026-07-05' },
  { id: 'PTW-0039', projectId: 'proj-1', type: 'scaffolding', location: 'Level 4 Façade', hazards: ['Fall from height'], precautions: ['Harness', 'Fall arrest'], responsiblePersons: ['Sipho Nkosi'], requestedBy: 'Sipho Nkosi', approvedBy: 'Thabo Mokoena', validFrom: '2026-07-05T06:00:00', validTo: '2026-07-05T12:00:00', state: 'active', createdAt: '2026-07-04', updatedAt: '2026-07-05' },
  { id: 'PTW-0038', projectId: 'proj-1', type: 'hot_work', location: 'Roof Steel', hazards: ['Fire', 'Burns'], precautions: ['Fire extinguisher', 'Fire watch'], responsiblePersons: ['Bongani Zulu'], requestedBy: 'Bongani Zulu', approvedBy: 'Thabo Mokoena', validFrom: '2026-07-05T05:00:00', validTo: '2026-07-05T07:00:00', state: 'expired', createdAt: '2026-07-04', updatedAt: '2026-07-05' },
  { id: 'PTW-0037', projectId: 'proj-1', type: 'confined_space', location: 'Sewer Line', hazards: ['Oxygen depletion', 'Toxic gas'], precautions: ['Gas monitor', 'Standby person'], responsiblePersons: ['Mandla Sithole'], requestedBy: 'Mandla Sithole', approvedBy: 'Thabo Mokoena', validFrom: '2026-07-05T06:00:00', validTo: '2026-07-06T06:00:00', state: 'active', createdAt: '2026-07-04', updatedAt: '2026-07-05' },
];

const DEMO_HAZARDS: HazardEntry[] = [
  { id: 'H-001', projectId: 'proj-1', description: 'Crane near powerlines', activity: 'Lifting operations', location: 'Block C', likelihood: 4, severity: 5, riskRating: 20, residualRisk: 'critical', existingControls: ['Exclusion zones', 'Spotter assigned'], additionalControls: [], responsiblePerson: 'James Ndlovu', createdAt: '2026-06-01', updatedAt: '2026-07-03' },
  { id: 'H-002', projectId: 'proj-1', description: 'Excavation collapse', activity: 'Foundation dig', location: 'Block C', likelihood: 3, severity: 4, riskRating: 12, residualRisk: 'high', existingControls: ['Shoring', 'Daily inspection'], additionalControls: [], responsiblePerson: 'Sipho Nkosi', createdAt: '2026-06-01', updatedAt: '2026-07-02' },
  { id: 'H-003', projectId: 'proj-1', description: 'Working at height', activity: 'Façade work', location: 'Level 4', likelihood: 4, severity: 3, riskRating: 12, residualRisk: 'high', existingControls: ['Harness', 'Fall arrest system'], additionalControls: [], responsiblePerson: 'Pieter Venter', createdAt: '2026-06-02', updatedAt: '2026-07-01' },
  { id: 'H-004', projectId: 'proj-1', description: 'Confined space entry', activity: 'Sewer installation', location: 'Basement', likelihood: 3, severity: 4, riskRating: 12, residualRisk: 'high', existingControls: ['Gas monitor', 'Standby person'], additionalControls: [], responsiblePerson: 'Mandla Sithole', createdAt: '2026-06-03', updatedAt: '2026-07-01' },
  { id: 'H-005', projectId: 'proj-1', description: 'Manual handling strain', activity: 'Rebar placement', location: 'All areas', likelihood: 3, severity: 2, riskRating: 6, residualRisk: 'medium', existingControls: ['Mechanical assist', 'Rotation'], additionalControls: [], responsiblePerson: 'Johan Botha', createdAt: '2026-06-05', updatedAt: '2026-06-28' },
];

const DEMO_INCIDENTS: Incident[] = [
  { id: 'INC-004', projectId: 'proj-1', date: '2026-06-28', time: '10:30', location: 'Block C', personsInvolved: ['Themba Dlamini'], injuryClassification: 'lost_time', description: 'Worker struck by falling object', immediateActions: 'First aid, area secured', isSection24Notifiable: true, state: 'under_investigation', investigatorId: 'sipho-nkosi', correctiveActions: [], reportedBy: 'Thabo Mokoena', createdAt: '2026-06-28', updatedAt: '2026-07-03' },
  { id: 'INC-003', projectId: 'proj-2', date: '2026-06-25', time: '14:15', location: 'Sandton L4', personsInvolved: [], injuryClassification: 'first_aid', description: 'Unsecured scaffolding plank fell', immediateActions: 'Area cordoned off', isSection24Notifiable: false, state: 'closed', correctiveActions: [{ id: 'ca-1', description: 'Daily scaffold inspection added', assignedTo: 'Sipho Nkosi', dueDate: '2026-06-26', completedAt: '2026-06-26', status: 'completed' }], reportedBy: 'Pieter Venter', createdAt: '2026-06-25', updatedAt: '2026-06-26' },
  { id: 'INC-002', projectId: 'proj-3', date: '2026-06-22', time: '11:00', location: 'Melrose', personsInvolved: ['Peter van Wyk'], injuryClassification: 'first_aid', description: 'Minor cut — rebar handling', immediateActions: 'First aid administered', isSection24Notifiable: false, state: 'closed', correctiveActions: [{ id: 'ca-2', description: 'Gloves mandate reinforced', assignedTo: 'Thabo Mokoena', dueDate: '2026-06-23', completedAt: '2026-06-23', status: 'completed' }], reportedBy: 'Mandla Sithole', createdAt: '2026-06-22', updatedAt: '2026-06-23' },
];

const DEMO_HS_PLAN: HSPlan = {
  id: 'plan-001', projectId: 'proj-1', version: 2, state: 'approved',
  submittedBy: 'Thabo Mokoena', submittedAt: '2026-06-10', approvedBy: 'Client Admin', approvedAt: '2026-06-12',
};

const DEMO_FALL_PROTECTION_PLANS: FallProtectionPlan[] = [
  {
    id: 'fpp-001', projectId: 'proj-1',
    methods: ['harnesses', 'safety_nets'],
    workAreas: ['Level 4 Façade', 'Roof'],
    responsiblePersons: ['Sipho Nkosi', 'Pieter Venter'],
    inspectionSchedule: { frequency: 'daily', nextDue: '2026-07-06', lastCompleted: '2026-07-05' },
    approvedAt: '2026-06-15', approvedBy: 'Thabo Mokoena',
    expiresAt: '2026-12-31',
    linkedPermitIds: ['PTW-0039'],
    createdAt: '2026-06-10', updatedAt: '2026-07-05',
  },
  {
    id: 'fpp-002', projectId: 'proj-1',
    methods: ['guardrails', 'exclusion_zones'],
    workAreas: ['Block C Rooftop', 'Stairwell void'],
    responsiblePersons: ['James Ndlovu'],
    inspectionSchedule: { frequency: 'weekly', nextDue: '2026-07-01', lastCompleted: '2026-06-24' },
    approvedAt: '2026-06-05', approvedBy: 'Thabo Mokoena',
    expiresAt: '2026-09-30',
    linkedPermitIds: [],
    createdAt: '2026-06-01', updatedAt: '2026-07-01',
  },
  {
    id: 'fpp-003', projectId: 'proj-2',
    methods: ['harnesses'],
    workAreas: ['Level 8 Curtain Wall'],
    responsiblePersons: ['Johan Botha'],
    inspectionSchedule: { frequency: 'daily', nextDue: '2026-07-06' },
    linkedPermitIds: [],
    createdAt: '2026-07-01', updatedAt: '2026-07-01',
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function riskBadgeVariant(level: RiskLevel): string {
  switch (level) {
    case 'critical': return 'bg-red-500/20 text-red-400 border-red-500/30';
    case 'high': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    case 'medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    case 'low': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  }
}

function permitStatusBadge(state: Permit['state']): { label: string; className: string } {
  switch (state) {
    case 'active': return { label: 'Active', className: 'bg-emerald-500/20 text-emerald-400' };
    case 'expired': return { label: 'Expired', className: 'bg-red-500/20 text-red-400' };
    case 'closed': return { label: 'Closed', className: 'bg-purple-500/20 text-purple-400' };
    case 'approved': return { label: 'Approved', className: 'bg-blue-500/20 text-blue-400' };
    case 'submitted': return { label: 'Pending', className: 'bg-yellow-500/20 text-yellow-400' };
    case 'rejected': return { label: 'Rejected', className: 'bg-red-500/20 text-red-400' };
    default: return { label: state, className: 'bg-slate-500/20 text-slate-400' };
  }
}

function incidentBadge(classification: Incident['injuryClassification']): { label: string; className: string } {
  switch (classification) {
    case 'fatality': return { label: 'Fatality', className: 'bg-red-600/20 text-red-400' };
    case 'lost_time': return { label: 'Lost Time', className: 'bg-red-500/20 text-red-400' };
    case 'medical_treatment': return { label: 'Medical', className: 'bg-orange-500/20 text-orange-400' };
    case 'first_aid': return { label: 'First Aid', className: 'bg-emerald-500/20 text-emerald-400' };
  }
}

function sectionStatusDot(status: string): React.ReactNode {
  switch (status) {
    case 'complete': return <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xs">✓</span>;
    case 'expired': return <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/20 text-red-400 text-xs">!</span>;
    case 'not_applicable': return <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-500/20 text-slate-400 text-xs">—</span>;
    default: return <span className="flex h-5 w-5 items-center justify-center rounded-full bg-yellow-500/20 text-yellow-400 text-xs">⏳</span>;
  }
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function HealthSafetyWorkspace({ user, projectId: propProjectId }: Props) {
  const [activeView, setActiveView] = useState('overview');
  const [selectedProject, setSelectedProject] = useState<string>(propProjectId ?? DEMO_PROJECTS[0].id);
  const [viewMode, setViewMode] = useState<'project' | 'all'>('project');

  // Derive H&S role from user role
  const hsRole = useMemo(() => {
    if (user.role === 'health_safety' || user.role === 'admin') return 'hs_officer';
    if (user.role === 'contractor') return 'principal_contractor';
    if (user.role === 'client') return 'client';
    if (user.role === 'architect' || user.role === 'engineer') return 'designer';
    return 'viewer';
  }, [user.role]);

  const hsRoleLabel = useMemo(() => {
    switch (hsRole) {
      case 'hs_officer': return 'H&S Officer';
      case 'principal_contractor': return 'Principal Contractor';
      case 'client': return 'Client';
      case 'designer': return 'Designer';
      default: return 'Viewer';
    }
  }, [hsRole]);

  // Filter data by selected project
  const permits = useMemo(() =>
    viewMode === 'all' ? DEMO_PERMITS : DEMO_PERMITS.filter(p => p.projectId === selectedProject),
    [selectedProject, viewMode],
  );

  const hazards = useMemo(() =>
    viewMode === 'all' ? DEMO_HAZARDS : DEMO_HAZARDS.filter(h => h.projectId === selectedProject),
    [selectedProject, viewMode],
  );

  const incidents = useMemo(() =>
    viewMode === 'all' ? DEMO_INCIDENTS : DEMO_INCIDENTS.filter(i => i.projectId === selectedProject),
    [selectedProject, viewMode],
  );

  const fallProtectionPlans = useMemo(() =>
    viewMode === 'all' ? DEMO_FALL_PROTECTION_PLANS : DEMO_FALL_PROTECTION_PLANS.filter(f => f.projectId === selectedProject),
    [selectedProject, viewMode],
  );

  const safetyFile = DEMO_SAFETY_FILE;

  // Stats
  const activePermitCount = permits.filter(p => p.state === 'active').length;
  const expiredPermitCount = permits.filter(p => p.state === 'expired').length;
  const highRiskHazards = hazards.filter(h => h.residualRisk === 'high' || h.residualRisk === 'critical').length;
  const openIncidents = incidents.filter(i => i.state !== 'closed').length;

  // ── No project guard ────────────────────────────────────────────────────
  if (!propProjectId && DEMO_PROJECTS.length === 0) {
    return (
      <div className="flex items-center justify-center p-12" data-testid="hs-workspace">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <Shield className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-lg font-medium">No Projects Assigned</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Health & Safety requires an active project. Please ask your administrator to assign you to a project.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="hs-workspace">
      {/* ─── Header Card (SpecForge pattern) ────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                <Shield className="mr-1.5 inline h-3.5 w-3.5" />
                Health & Safety
              </p>
              <CardTitle className="mt-1 text-2xl">
                {viewMode === 'all'
                  ? 'All Projects Overview'
                  : DEMO_PROJECTS.find(p => p.id === selectedProject)?.name ?? 'Project'}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {hsRoleLabel} · Construction Regulations 2014 · OHS Act 85 of 1993
              </p>
            </div>
            <Badge className="rounded-full border-0 bg-primary/15 text-primary">
              {hsRoleLabel} View
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* ─── Project Toggles ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Projects:</span>
        {DEMO_PROJECTS.map((proj) => (
          <Button
            key={proj.id}
            variant={viewMode === 'project' && selectedProject === proj.id ? 'default' : 'outline'}
            size="sm"
            className="rounded-full text-xs"
            onClick={() => { setSelectedProject(proj.id); setViewMode('project'); }}
          >
            <span className={cn(
              'mr-1.5 inline-block h-2 w-2 rounded-full',
              proj.status === 'active' ? 'bg-emerald-400' : proj.status === 'pending' ? 'bg-yellow-400' : 'bg-slate-400',
            )} />
            {proj.name}
          </Button>
        ))}
        <Button
          variant={viewMode === 'all' ? 'default' : 'outline'}
          size="sm"
          className="ml-auto rounded-full text-xs"
          onClick={() => setViewMode('all')}
        >
          All Projects
        </Button>
        <Button variant="outline" size="sm" className="rounded-full text-xs">
          <Plus className="mr-1 h-3 w-3" /> Standalone
        </Button>
      </div>

      {/* ─── Tab Navigation ─────────────────────────────────────────────── */}
      <Tabs value={activeView} onValueChange={setActiveView}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="safety-file">Safety File</TabsTrigger>
          <TabsTrigger value="permits">Permits</TabsTrigger>
          <TabsTrigger value="hira">HIRA Register</TabsTrigger>
          <TabsTrigger value="incidents">Incidents</TabsTrigger>
          <TabsTrigger value="inductions">Inductions</TabsTrigger>
          <TabsTrigger value="plans">H&S Plans</TabsTrigger>
          <TabsTrigger value="client-spec">Client Spec</TabsTrigger>
          <TabsTrigger value="fall-protection">Fall Protection</TabsTrigger>
        </TabsList>

        {/* ═══ OVERVIEW TAB ═══════════════════════════════════════════════ */}
        <TabsContent value="overview">
          {/* Stat Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={<FileCheck className="h-5 w-5 text-emerald-400" />}
              label="Safety File"
              value={`${safetyFile.complianceScore}%`}
              sub={`${safetyFile.sections.filter(s => s.status === 'complete').length} of ${safetyFile.sections.length} sections`}
            />
            <StatCard
              icon={<ClipboardList className="h-5 w-5 text-blue-400" />}
              label="Active Permits"
              value={String(activePermitCount)}
              sub={expiredPermitCount > 0 ? `${expiredPermitCount} expired` : 'All current'}
              variant={expiredPermitCount > 0 ? 'warning' : 'default'}
            />
            <StatCard
              icon={<AlertCircle className="h-5 w-5 text-red-400" />}
              label="Open Incidents"
              value={String(openIncidents)}
              sub={openIncidents > 0 ? 'Investigation in progress' : 'No open incidents'}
              variant={openIncidents > 0 ? 'destructive' : 'default'}
            />
            <StatCard
              icon={<AlertTriangle className="h-5 w-5 text-orange-400" />}
              label="High/Critical Hazards"
              value={String(highRiskHazards)}
              sub="Require additional controls"
              variant={highRiskHazards > 0 ? 'warning' : 'default'}
            />
          </div>

          {/* Quick Actions */}
          <Card className="mt-4">
            <CardContent className="flex flex-wrap gap-2 p-4">
              <Button size="sm" variant="outline" className="rounded-full" onClick={() => setActiveView('permits')}>
                <ClipboardList className="mr-1.5 h-3.5 w-3.5" /> New Permit
              </Button>
              <Button size="sm" variant="outline" className="rounded-full" onClick={() => setActiveView('incidents')}>
                <AlertCircle className="mr-1.5 h-3.5 w-3.5" /> Log Incident
              </Button>
              <Button size="sm" variant="outline" className="rounded-full" onClick={() => setActiveView('inductions')}>
                <Users className="mr-1.5 h-3.5 w-3.5" /> Toolbox Talk
              </Button>
              <Button size="sm" variant="outline" className="rounded-full" onClick={() => setActiveView('hira')}>
                <AlertTriangle className="mr-1.5 h-3.5 w-3.5" /> Add Hazard
              </Button>
              <Button size="sm" variant="outline" className="rounded-full" onClick={() => setActiveView('fall-protection')}>
                <HardHat className="mr-1.5 h-3.5 w-3.5" /> Fall Protection Plan
              </Button>
            </CardContent>
          </Card>

          {/* Two-column: Safety File + Active Permits */}
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {/* Safety File Summary */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Safety File Sections</CardTitle>
                  <Badge variant="outline" className="rounded-full bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                    {safetyFile.complianceScore}%
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {safetyFile.sections.map((section) => (
                  <div key={section.sectionId} className="flex items-center gap-3 text-sm">
                    {sectionStatusDot(section.status)}
                    <span className="flex-1 font-medium">{section.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {section.status === 'complete' ? `Updated ${section.lastUpdated}` : section.status === 'incomplete' ? 'Not submitted' : section.status}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Active Permits */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Active Permits</CardTitle>
                  <Badge variant="outline" className="rounded-full bg-blue-500/10 text-blue-400 border-blue-500/30">
                    {activePermitCount} Active
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
                        <th className="pb-2 pr-3">ID</th>
                        <th className="pb-2 pr-3">Type</th>
                        <th className="pb-2 pr-3">Location</th>
                        <th className="pb-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {permits.slice(0, 5).map((permit) => {
                        const badge = permitStatusBadge(permit.state);
                        return (
                          <tr key={permit.id} className="border-b border-border/30">
                            <td className="py-2 pr-3 font-mono text-xs">{permit.id}</td>
                            <td className="py-2 pr-3 capitalize">{permit.type.replace('_', ' ')}</td>
                            <td className="py-2 pr-3 text-muted-foreground">{permit.location}</td>
                            <td className="py-2"><span className={cn('inline-block rounded-full px-2 py-0.5 text-xs font-medium', badge.className)}>{badge.label}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Two-column: HIRA Summary + Incidents */}
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {/* HIRA Summary */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">HIRA Risk Summary</CardTitle>
                  <Badge variant="outline" className="rounded-full bg-orange-500/10 text-orange-400 border-orange-500/30">
                    {highRiskHazards} High/Critical
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {hazards.filter(h => h.residualRisk === 'critical' || h.residualRisk === 'high').slice(0, 5).map((hazard) => (
                  <div key={hazard.id} className="flex items-center gap-3 text-sm">
                    <span className={cn('inline-block rounded-full px-2 py-0.5 text-xs font-medium border', riskBadgeVariant(hazard.residualRisk))}>
                      {hazard.residualRisk}
                    </span>
                    <span className="flex-1">{hazard.description}</span>
                    <span className="text-xs text-muted-foreground">{hazard.location}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Recent Incidents */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Recent Incidents</CardTitle>
                  <Badge variant="outline" className={cn('rounded-full', openIncidents > 0 ? 'bg-red-500/10 text-red-400 border-red-500/30' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30')}>
                    {openIncidents} Open
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {incidents.slice(0, 4).map((incident) => {
                  const badge = incidentBadge(incident.injuryClassification);
                  return (
                    <div key={incident.id} className="flex items-start gap-3 text-sm">
                      <span className={cn('mt-0.5 inline-block rounded-full px-2 py-0.5 text-xs font-medium', badge.className)}>
                        {badge.label}
                      </span>
                      <div className="flex-1">
                        <p className="font-medium">{incident.description}</p>
                        <p className="text-xs text-muted-foreground">{incident.location} · {incident.date}</p>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          {/* Advisory Disclaimer */}
          <p className="mt-4 text-center text-xs italic text-muted-foreground">
            {ADVISORY_DISCLAIMER}
          </p>
        </TabsContent>

        {/* ═══ SAFETY FILE TAB ════════════════════════════════════════════ */}
        <TabsContent value="safety-file">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Construction Safety File</CardTitle>
                  <p className="text-xs text-muted-foreground">Regulation 7 — Principal Contractor</p>
                </div>
                <Badge variant="outline" className="rounded-full bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                  Rev {safetyFile.sections[0]?.version ?? 0}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {safetyFile.sections.map((section) => (
                <div key={section.sectionId} className="flex items-center gap-4 rounded-lg border border-border/50 p-3">
                  <span className="w-8 text-center text-xs font-mono text-muted-foreground">{section.regulationRef}</span>
                  {sectionStatusDot(section.status)}
                  <div className="flex-1">
                    <p className="text-sm font-medium">{section.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {section.status === 'complete' && section.lastUpdated ? `Updated ${section.lastUpdated} by ${section.updatedBy}` : 'Not yet submitted'}
                    </p>
                  </div>
                  <Badge variant="outline" className={cn(
                    'rounded-full text-xs',
                    section.status === 'complete' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                    section.status === 'expired' ? 'bg-red-500/10 text-red-400 border-red-500/30' :
                    'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
                  )}>
                    {section.status === 'complete' ? 'Current' : section.status === 'expired' ? 'Expired' : 'Incomplete'}
                  </Badge>
                </div>
              ))}
              <p className="pt-3 text-center text-xs italic text-muted-foreground">{ADVISORY_DISCLAIMER}</p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ PERMITS TAB ════════════════════════════════════════════════ */}
        <TabsContent value="permits">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Permit-to-Work Register</CardTitle>
                <Button size="sm" className="rounded-full">
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Request New Permit
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="pb-2 pr-3">ID</th>
                      <th className="pb-2 pr-3">Type</th>
                      <th className="pb-2 pr-3">Location</th>
                      <th className="pb-2 pr-3">Requested By</th>
                      <th className="pb-2 pr-3">Valid From</th>
                      <th className="pb-2 pr-3">Valid To</th>
                      <th className="pb-2 pr-3">Approver</th>
                      <th className="pb-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {permits.map((permit) => {
                      const badge = permitStatusBadge(permit.state);
                      return (
                        <tr key={permit.id} className="border-b border-border/30">
                          <td className="py-2.5 pr-3 font-mono text-xs">{permit.id}</td>
                          <td className="py-2.5 pr-3 capitalize">{permit.type.replace('_', ' ')}</td>
                          <td className="py-2.5 pr-3">{permit.location}</td>
                          <td className="py-2.5 pr-3 text-muted-foreground">{permit.requestedBy}</td>
                          <td className="py-2.5 pr-3 text-xs text-muted-foreground">{permit.validFrom?.slice(5, 16).replace('T', ' ')}</td>
                          <td className="py-2.5 pr-3 text-xs text-muted-foreground">{permit.validTo?.slice(5, 16).replace('T', ' ')}</td>
                          <td className="py-2.5 pr-3 text-muted-foreground">{permit.approvedBy ?? '—'}</td>
                          <td className="py-2.5"><span className={cn('inline-block rounded-full px-2 py-0.5 text-xs font-medium', badge.className)}>{badge.label}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ HIRA TAB ═══════════════════════════════════════════════════ */}
        <TabsContent value="hira">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Hazard Identification & Risk Assessment Register</CardTitle>
                <Button size="sm" className="rounded-full">
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Hazard
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="pb-2 pr-3">ID</th>
                      <th className="pb-2 pr-3">Hazard</th>
                      <th className="pb-2 pr-3">Activity</th>
                      <th className="pb-2 pr-3">Location</th>
                      <th className="pb-2 pr-2 text-center">L</th>
                      <th className="pb-2 pr-2 text-center">S</th>
                      <th className="pb-2 pr-3 text-center">Rating</th>
                      <th className="pb-2 pr-3">Residual</th>
                      <th className="pb-2">Controls</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hazards.map((hazard) => (
                      <tr key={hazard.id} className="border-b border-border/30">
                        <td className="py-2.5 pr-3 font-mono text-xs">{hazard.id}</td>
                        <td className="py-2.5 pr-3 font-medium">{hazard.description}</td>
                        <td className="py-2.5 pr-3 text-muted-foreground">{hazard.activity}</td>
                        <td className="py-2.5 pr-3 text-muted-foreground">{hazard.location}</td>
                        <td className="py-2.5 pr-2 text-center">{hazard.likelihood}</td>
                        <td className="py-2.5 pr-2 text-center">{hazard.severity}</td>
                        <td className="py-2.5 pr-3 text-center font-bold">{hazard.riskRating}</td>
                        <td className="py-2.5 pr-3">
                          <span className={cn('inline-block rounded-full border px-2 py-0.5 text-xs font-medium capitalize', riskBadgeVariant(hazard.residualRisk))}>
                            {hazard.residualRisk}
                          </span>
                        </td>
                        <td className="py-2.5 text-xs text-muted-foreground">{hazard.existingControls.join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ INCIDENTS TAB ══════════════════════════════════════════════ */}
        <TabsContent value="incidents">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Incident & Accident Register</CardTitle>
                <Button size="sm" className="rounded-full">
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Report Incident
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="pb-2 pr-3">Ref</th>
                      <th className="pb-2 pr-3">Date</th>
                      <th className="pb-2 pr-3">Description</th>
                      <th className="pb-2 pr-3">Classification</th>
                      <th className="pb-2 pr-3">Location</th>
                      <th className="pb-2 pr-3">Sec 24</th>
                      <th className="pb-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incidents.map((incident) => {
                      const badge = incidentBadge(incident.injuryClassification);
                      return (
                        <tr key={incident.id} className="border-b border-border/30">
                          <td className="py-2.5 pr-3 font-mono text-xs">{incident.id}</td>
                          <td className="py-2.5 pr-3 text-muted-foreground">{incident.date}</td>
                          <td className="py-2.5 pr-3 font-medium">{incident.description}</td>
                          <td className="py-2.5 pr-3">
                            <span className={cn('inline-block rounded-full px-2 py-0.5 text-xs font-medium', badge.className)}>{badge.label}</span>
                          </td>
                          <td className="py-2.5 pr-3 text-muted-foreground">{incident.location}</td>
                          <td className="py-2.5 pr-3">{incident.isSection24Notifiable ? <span className="text-red-400 font-bold">Yes</span> : 'No'}</td>
                          <td className="py-2.5">
                            <span className={cn('inline-block rounded-full px-2 py-0.5 text-xs font-medium',
                              incident.state === 'closed' ? 'bg-emerald-500/20 text-emerald-400' :
                              incident.state === 'under_investigation' ? 'bg-yellow-500/20 text-yellow-400' :
                              'bg-blue-500/20 text-blue-400',
                            )}>
                              {incident.state.replace(/_/g, ' ')}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ INDUCTIONS TAB ═════════════════════════════════════════════ */}
        <TabsContent value="inductions">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Induction Status</CardTitle>
                  <Badge variant="outline" className="rounded-full bg-emerald-500/10 text-emerald-400 border-emerald-500/30">87%</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="font-medium">Site Induction Progress</span>
                  <span className="font-bold text-primary">52 / 60</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-secondary to-primary" style={{ width: '87%' }} />
                </div>
                <div className="mt-4">
                  <p className="text-xs font-semibold mb-2">Not Inducted (8):</p>
                  <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                    <span>• Themba Dlamini</span><span>• Bongani Zulu</span>
                    <span>• Peter van Wyk</span><span>• Mandla Sithole</span>
                    <span>• Johan Botha</span><span>• Sibusiso Mthembu</span>
                    <span>• David Pretorius</span><span>• Lucky Ngubane</span>
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground border-t border-border/50 pt-3">
                  ⚠️ These workers flagged in daily workforce logs
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Today's Toolbox Talk</CardTitle>
                  <Badge variant="outline" className="rounded-full bg-purple-500/10 text-purple-400 border-purple-500/30">Completed</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border border-border/50 bg-primary/5 p-4 mb-4">
                  <p className="font-bold">Working at Heights Safety</p>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>📅 5 Jul 2026, 06:30</span>
                    <span>👤 Thabo Mokoena</span>
                    <span>⏱️ 15 min</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="font-medium">Attendance</span>
                  <span className="font-bold text-primary">47 / 52 (90%)</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-purple-400 to-purple-600" style={{ width: '90%' }} />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Topics: harness inspection, anchor points, rescue procedures, exclusion zones
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══ H&S PLANS TAB ══════════════════════════════════════════════ */}
        <TabsContent value="plans">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">H&S Plan Approval Status</CardTitle>
                <Badge variant="outline" className={cn('rounded-full',
                  DEMO_HS_PLAN.state === 'approved' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                  DEMO_HS_PLAN.state === 'rejected' ? 'bg-red-500/10 text-red-400 border-red-500/30' :
                  'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
                )}>
                  {DEMO_HS_PLAN.state.replace(/_/g, ' ')}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-border/50 p-4 space-y-3">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-xs text-muted-foreground block">Version</span><span className="font-bold">{DEMO_HS_PLAN.version}</span></div>
                  <div><span className="text-xs text-muted-foreground block">State</span><span className="font-bold capitalize">{DEMO_HS_PLAN.state.replace(/_/g, ' ')}</span></div>
                  <div><span className="text-xs text-muted-foreground block">Submitted By</span><span>{DEMO_HS_PLAN.submittedBy}</span></div>
                  <div><span className="text-xs text-muted-foreground block">Submitted</span><span>{DEMO_HS_PLAN.submittedAt}</span></div>
                  {DEMO_HS_PLAN.approvedBy && <div><span className="text-xs text-muted-foreground block">Approved By</span><span>{DEMO_HS_PLAN.approvedBy}</span></div>}
                  {DEMO_HS_PLAN.approvedAt && <div><span className="text-xs text-muted-foreground block">Approved</span><span>{DEMO_HS_PLAN.approvedAt}</span></div>}
                </div>

                {/* Rejection reasons display (Requirement 2.4) */}
                {DEMO_HS_PLAN.state === 'rejected' && DEMO_HS_PLAN.rejectionReasons && DEMO_HS_PLAN.rejectionReasons.length > 0 && (
                  <div className="mt-3 rounded-md border border-red-500/30 bg-red-500/5 p-3">
                    <p className="text-xs font-semibold text-red-400 mb-1">Rejection Reasons</p>
                    <ul className="list-disc list-inside text-xs text-red-300 space-y-1">
                      {DEMO_HS_PLAN.rejectionReasons.map((reason, idx) => (
                        <li key={idx}>{reason}</li>
                      ))}
                    </ul>
                    <p className="text-xs text-muted-foreground mt-2">
                      The plan must be revised and resubmitted by the Principal Contractor.
                    </p>
                  </div>
                )}

                {/* Site operations status messaging */}
                {DEMO_HS_PLAN.state === 'approved' && (
                  <p className="text-xs text-emerald-400 mt-2">✓ Site operations unblocked — daily site diary creation permitted</p>
                )}
                {DEMO_HS_PLAN.state === 'pending_approval' && (
                  <p className="text-xs text-yellow-400 mt-2">⏳ Site operations blocked until H&S Plan is approved by Client</p>
                )}
                {DEMO_HS_PLAN.state === 'rejected' && (
                  <p className="text-xs text-red-400 mt-2">⛔ Site operations blocked — H&S Plan rejected, awaiting resubmission</p>
                )}

                {/* Client approval/reject action buttons (Requirements 2.1, 2.3, 2.4) */}
                {hsRole === 'client' && DEMO_HS_PLAN.state === 'pending_approval' && (
                  <div className="mt-4 flex items-center gap-3 border-t border-border/50 pt-4">
                    <Button size="sm" className="rounded-full bg-emerald-600 hover:bg-emerald-700 text-white">
                      <FileCheck className="mr-1.5 h-3.5 w-3.5" /> Approve Plan
                    </Button>
                    <Button size="sm" variant="outline" className="rounded-full border-red-500/30 text-red-400 hover:bg-red-500/10">
                      <AlertCircle className="mr-1.5 h-3.5 w-3.5" /> Reject Plan
                    </Button>
                    <span className="text-xs text-muted-foreground ml-auto">
                      Regulation 7(1)(a) — Client must approve before construction commences
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ CLIENT SPEC TAB ════════════════════════════════════════════ */}
        <TabsContent value="client-spec">
          <ClientSpecWizard hsRole={hsRole} />
        </TabsContent>

        {/* ═══ FALL PROTECTION TAB ════════════════════════════════════════ */}
        <TabsContent value="fall-protection">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Fall Protection Plans</CardTitle>
                <Button size="sm" className="rounded-full">
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> New Plan
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Regulation 10 — Work above 2 metres</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {fallProtectionPlans.length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">No fall protection plans for this project.</p>
              )}
              {fallProtectionPlans.map((plan) => {
                const isOverdue = new Date(plan.inspectionSchedule.nextDue) < new Date();
                const isExpired = plan.expiresAt ? new Date(plan.expiresAt) < new Date() : false;
                const isApproved = !!plan.approvedAt;
                return (
                  <div key={plan.id} className="rounded-lg border border-border/50 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm">
                        {plan.workAreas.join(', ')} — {plan.methods.map(m => m.replace(/_/g, ' ')).map(m => m.charAt(0).toUpperCase() + m.slice(1)).join(', ')}
                      </p>
                      <div className="flex items-center gap-2">
                        {isExpired && (
                          <Badge variant="outline" className="rounded-full bg-red-500/10 text-red-400 border-red-500/30">Expired</Badge>
                        )}
                        {isOverdue && !isExpired && (
                          <Badge variant="outline" className="rounded-full bg-orange-500/10 text-orange-400 border-orange-500/30">Inspection Overdue</Badge>
                        )}
                        {isApproved && !isExpired ? (
                          <Badge variant="outline" className="rounded-full bg-emerald-500/10 text-emerald-400 border-emerald-500/30">Approved</Badge>
                        ) : !isExpired && !isApproved ? (
                          <Badge variant="outline" className="rounded-full bg-yellow-500/10 text-yellow-400 border-yellow-500/30">Pending Approval</Badge>
                        ) : null}
                      </div>
                    </div>
                    {(isOverdue || isExpired) && (
                      <div className={cn(
                        'flex items-center gap-2 rounded-md px-3 py-2 text-xs',
                        isExpired ? 'bg-red-500/10 text-red-400' : 'bg-orange-500/10 text-orange-400',
                      )}>
                        <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                        {isExpired
                          ? 'This plan has expired. Height work permits linked to this plan are blocked until renewal.'
                          : `Inspection overdue since ${plan.inspectionSchedule.nextDue}. Action required before next shift.`}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
                      <div><span className="block font-semibold text-foreground">Methods</span>{plan.methods.map(m => m.replace(/_/g, ' ')).map(m => m.charAt(0).toUpperCase() + m.slice(1)).join(', ')}</div>
                      <div><span className="block font-semibold text-foreground">Work Areas</span>{plan.workAreas.join(', ')}</div>
                      <div><span className="block font-semibold text-foreground">Responsible Persons</span>{plan.responsiblePersons.join(', ')}</div>
                      <div>
                        <span className="block font-semibold text-foreground">Inspection Schedule</span>
                        {plan.inspectionSchedule.frequency.charAt(0).toUpperCase() + plan.inspectionSchedule.frequency.slice(1)} — Next due: {plan.inspectionSchedule.nextDue}
                      </div>
                      <div>
                        <span className="block font-semibold text-foreground">Linked Permits</span>
                        {plan.linkedPermitIds.length > 0 ? plan.linkedPermitIds.join(', ') : <span className="italic">None</span>}
                      </div>
                      {plan.expiresAt && (
                        <div><span className="block font-semibold text-foreground">Expires</span>{plan.expiresAt}</div>
                      )}
                    </div>
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground italic">
                Fall protection plans must be approved before permits for height work can be issued.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  sub,
  variant = 'default',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  variant?: 'default' | 'destructive' | 'warning';
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          {icon}
          <div>
            <p className={cn(
              'text-xl font-bold',
              variant === 'destructive' && 'text-red-400',
              variant === 'warning' && 'text-orange-400',
            )}>
              {value}
            </p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        </div>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
