/**
 * Submission Readiness Dashboard
 * Unified dashboard for Pack 6: Municipal Submission Readiness
 *
 * Displays:
 *  - Complexity assessment
 *  - Professional routing table
 *  - Readiness checks by 8 categories
 *  - Readiness score
 *  - Evidence pack status
 *  - Inbox events
 *  - Agent recommendations
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  Loader2,
  ShieldCheck,
  ClipboardCheck,
  FileCheck,
  Users,
  Gauge,
  Package,
  Bell,
  Lightbulb,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ScrollArea } from './ui/scroll-area';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/apiClient';
import { auth, db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { assessMunicipalSubmissionReadiness, buildScopeFactsFromProject } from '@/services/municipalSubmissionReadinessService';
import type {
  MunicipalSubmissionReadinessResult,
  ProfessionalRoutingDecision,
  ReadinessCheck,
  ReadinessCategory,
  SubmissionInboxEvent,
  SubmissionAgentRecommendation,
  EvidencePackItem,
} from '@/types/municipalSubmissionReadiness';

// ── Helpers ─────────────────────────────────────────────────

const CATEGORY_LABELS: Record<ReadinessCategory, string> = {
  property_and_municipal_facts: 'Property & Municipal Facts',
  land_use_and_zoning: 'Land Use & Zoning',
  professional_team: 'Professional Team',
  nbr_sans_advisory_precheck: 'NBR/SANS Pre-check',
  drawing_register: 'Drawing Register',
  supporting_documents: 'Supporting Documents',
  professional_signoffs: 'Professional Signoffs',
  client_authority: 'Client Authority',
};

const CATEGORY_COLORS: Record<ReadinessCategory, string> = {
  property_and_municipal_facts: 'bg-blue-100 text-blue-700',
  land_use_and_zoning: 'bg-purple-100 text-purple-700',
  professional_team: 'bg-indigo-100 text-indigo-700',
  nbr_sans_advisory_precheck: 'bg-amber-100 text-amber-700',
  drawing_register: 'bg-teal-100 text-teal-700',
  supporting_documents: 'bg-pink-100 text-pink-700',
  professional_signoffs: 'bg-orange-100 text-orange-700',
  client_authority: 'bg-green-100 text-green-700',
};

function statusIcon(status: string) {
  switch (status) {
    case 'complete':
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    case 'missing':
      return <AlertCircle className="w-4 h-4 text-red-500" />;
    case 'requires_professional_review':
      return <AlertTriangle className="w-4 h-4 text-amber-500" />;
    case 'blocked':
      return <AlertCircle className="w-4 h-4 text-red-500" />;
    case 'placeholder':
      return <Info className="w-4 h-4 text-muted-foreground" />;
    default:
      return <CheckCircle2 className="w-4 h-4 text-muted-foreground" />;
  }
}

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    complete: 'bg-green-100 text-green-700 border-green-200',
    missing: 'bg-red-100 text-red-700 border-red-200',
    requires_professional_review: 'bg-amber-100 text-amber-700 border-amber-200',
    not_applicable: 'bg-gray-100 text-gray-500 border-gray-200',
    included: 'bg-green-100 text-green-700 border-green-200',
    placeholder: 'bg-gray-100 text-gray-500 border-gray-200',
    blocked: 'bg-red-100 text-red-700 border-red-200',
  };
  return (
    <Badge variant="outline" className={`rounded-full text-[10px] ${styles[status] || ''}`}>
      {status.replace(/_/g, ' ')}
    </Badge>
  );
}

// ── Sub-components ─────────────────────────────────────────

function ComplexityCard({
  complexity,
}: {
  complexity: MunicipalSubmissionReadinessResult['complexity'];
}) {
  const colors: Record<string, string> = {
    low: 'bg-green-50 border-green-200',
    medium: 'bg-amber-50 border-amber-200',
    high: 'bg-red-50 border-red-200',
  };
  return (
    <Card className={`${colors[complexity.complexity]} border`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
          <Gauge className="w-4 h-4" />
          Project Complexity
        </CardTitle>
        <CardDescription>
          Classified as{' '}
          <Badge
            className={
              complexity.complexity === 'high'
                ? 'bg-red-500'
                : complexity.complexity === 'medium'
                  ? 'bg-amber-500'
                  : 'bg-green-500'
            }
          >
            {complexity.complexity.toUpperCase()}
          </Badge>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-[10px] text-muted-foreground font-bold uppercase mb-2">
          Triggers ({complexity.triggers.length})
        </p>
        <ul className="space-y-1">
          {complexity.triggers.map((t, i) => (
            <li key={i} className="text-xs flex items-start gap-2">
              <span className="text-amber-500 mt-0.5">•</span>
              {t}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function RoutingTable({
  routes,
}: {
  routes: ProfessionalRoutingDecision[];
}) {
  const required = routes.filter((r) => r.status === 'required');
  const optional = routes.filter((r) => r.status === 'optional');
  const notRequired = routes.filter(
    (r) => r.status === 'not_currently_required'
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
          <Users className="w-4 h-4" />
          Professional Team Routing
        </CardTitle>
        <CardDescription>
          Trigger-based: {required.length} required, {optional.length} optional,{' '}
          {notRequired.length} not currently required
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-48">
          <div className="space-y-1.5">
            {routes.map((r) => (
              <div
                key={r.discipline}
                className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs ${
                  r.status === 'required'
                    ? 'bg-blue-50 border border-blue-100'
                    : r.status === 'optional'
                      ? 'bg-gray-50 border border-gray-100'
                      : 'bg-transparent'
                }`}
              >
                <div className="flex items-center gap-2">
                  {r.status === 'required' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                  ) : r.status === 'optional' ? (
                    <Info className="w-3.5 h-3.5 text-gray-400" />
                  ) : (
                    <span className="w-3.5 h-3.5 rounded-full border border-gray-300" />
                  )}
                  <span className="font-medium capitalize">
                    {r.discipline.replace(/_/g, ' ')}
                  </span>
                  {r.approvalRequired && (
                    <ShieldCheck className="w-3 h-3 text-amber-500" />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground hidden md:inline max-w-[200px] truncate">
                    {r.reason}
                  </span>
                  {statusBadge(r.status)}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function ReadinessScoreCard({
  readiness,
}: {
  readiness: MunicipalSubmissionReadinessResult['readiness'];
}) {
  const scoreColor =
    readiness.score >= 80
      ? 'text-green-600'
      : readiness.score >= 50
        ? 'text-amber-600'
        : 'text-red-600';
  const ringColor =
    readiness.score >= 80
      ? 'stroke-green-500'
      : readiness.score >= 50
        ? 'stroke-amber-500'
        : 'stroke-red-500';

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
          <Gauge className="w-4 h-4" />
          Readiness Score
        </CardTitle>
        <CardDescription>
          {readiness.readyForProfessionalSubmissionReview
            ? 'Ready for professional review'
            : 'Not yet ready for submission'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between mb-4">
          <div className="relative w-20 h-20">
            <svg className="w-20 h-20 -rotate-90" viewBox="0 0 64 64">
              <circle
                cx="32"
                cy="32"
                r="28"
                fill="none"
                stroke="currentColor"
                strokeWidth="6"
                className="text-secondary"
              />
              <circle
                cx="32"
                cy="32"
                r="28"
                fill="none"
                strokeWidth="6"
                strokeLinecap="round"
                className={ringColor}
                strokeDasharray={`${(readiness.score / 100) * 176} 176`}
              />
            </svg>
            <span
              className={`absolute inset-0 flex items-center justify-center text-xl font-bold ${scoreColor}`}
            >
              {readiness.score}%
            </span>
          </div>
          <div className="flex-1 ml-6 space-y-1">
            <div className="flex items-center gap-2 text-xs">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
              <span>
                {readiness.checks.filter((c) => c.status === 'complete').length}{' '}
                complete
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <AlertCircle className="w-3.5 h-3.5 text-red-500" />
              <span>
                {readiness.checks.filter((c) => c.status === 'missing').length}{' '}
                missing
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              <span>
                {
                  readiness.checks.filter(
                    (c) => c.status === 'requires_professional_review'
                  ).length
                }{' '}
                need review
              </span>
            </div>
          </div>
        </div>
        {readiness.blockers.length > 0 && (
          <div className="border-t pt-3 mt-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-red-600 mb-2">
              Blockers & Review Items
            </p>
            <ScrollArea className="h-24">
              <ul className="space-y-1">
                {readiness.blockers.map((b, i) => (
                  <li
                    key={i}
                    className="text-[10px] flex items-start gap-2 text-red-700"
                  >
                    <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    {b}
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CategoryScoresTable({
  readiness,
}: {
  readiness: MunicipalSubmissionReadinessResult['readiness'];
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4" />
          Category Breakdown
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {(Object.keys(readiness.categoryScores) as ReadinessCategory[]).map(
            (cat) => {
              const cs = readiness.categoryScores[cat];
              if (cs.total === 0) return null;
              const pct = cs.score;
              return (
                <div key={cat} className="space-y-1">
                  <div className="flex justify-between text-[10px]">
                    <span className="font-medium">{CATEGORY_LABELS[cat]}</span>
                    <span className="text-muted-foreground">
                      {cs.complete}/{cs.total} ({pct}%)
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        pct >= 80
                          ? 'bg-green-500'
                          : pct >= 50
                            ? 'bg-amber-500'
                            : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.max(pct, 4)}%` }}
                    />
                  </div>
                </div>
              );
            }
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ChecksPanel({
  checks,
  category,
}: {
  checks: ReadinessCheck[];
  category?: ReadinessCategory;
}) {
  const filtered = category
    ? checks.filter((c) => c.category === category)
    : checks;
  const applicable = filtered.filter((c) => c.status !== 'not_applicable');

  return (
    <div className="space-y-1">
      {applicable.map((check) => (
        <div
          key={check.id}
          className="flex items-center justify-between px-3 py-2 rounded-lg bg-secondary/20 text-xs"
        >
          <div className="flex items-center gap-2">
            {statusIcon(check.status)}
            <span>{check.label}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground capitalize">
              {check.owner.replace(/_/g, ' ')}
            </span>
            {statusBadge(check.status)}
          </div>
        </div>
      ))}
      {applicable.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4">
          No applicable checks in this category.
        </p>
      )}
    </div>
  );
}

function EvidencePackCard({ items }: { items: EvidencePackItem[] }) {
  const included = items.filter((i) => i.status === 'included').length;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
          <Package className="w-4 h-4" />
          Evidence Pack
        </CardTitle>
        <CardDescription>
          {included}/{items.length} items ready
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between px-3 py-2 rounded-lg bg-secondary/10 text-xs"
            >
              <div className="flex items-center gap-2">
                {statusIcon(item.status)}
                <div>
                  <p className="font-medium">{item.title}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {item.source}
                  </p>
                </div>
              </div>
              {statusBadge(item.status)}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function InboxEventsCard({
  events,
}: {
  events: SubmissionInboxEvent[];
}) {
  const severityIcon = (s: string) => {
    switch (s) {
      case 'blocked':
        return <AlertCircle className="w-3.5 h-3.5 text-red-500" />;
      case 'action_required':
        return <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />;
      default:
        return <Info className="w-3.5 h-3.5 text-blue-500" />;
    }
  };
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
          <Bell className="w-4 h-4" />
          Inbox Events
        </CardTitle>
        <CardDescription>{events.length} events generated</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-48">
          <div className="space-y-1.5">
            {events.map((evt) => (
              <div
                key={evt.id}
                className={`flex items-start gap-2 px-3 py-2 rounded-lg text-xs ${
                  evt.severity === 'blocked'
                    ? 'bg-red-50 border border-red-100'
                    : evt.severity === 'action_required'
                      ? 'bg-amber-50 border border-amber-100'
                      : 'bg-blue-50 border border-blue-100'
                }`}
              >
                <span className="mt-0.5">{severityIcon(evt.severity)}</span>
                <div className="flex-1">
                  <p className="font-medium">{evt.title}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">
                    To: {evt.recipient.replace(/_/g, ' ')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function RecommendationsCard({
  recommendations,
}: {
  recommendations: SubmissionAgentRecommendation[];
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
          <Lightbulb className="w-4 h-4" />
          Agent Recommendations
        </CardTitle>
        <CardDescription>
          {recommendations.filter((r) => r.requiresHumanApproval).length} require
          human approval
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {recommendations.map((rec) => (
            <div
              key={rec.id}
              className="px-3 py-2.5 rounded-lg bg-secondary/10 text-xs border border-border"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium">{rec.title}</span>
                {rec.requiresHumanApproval && (
                  <Badge
                    variant="outline"
                    className="rounded-full text-[10px] bg-amber-100 text-amber-700 border-amber-200"
                  >
                    Requires Approval
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground">{rec.rationale}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Dashboard Component ────────────────────────────────

interface SubmissionReadinessDashboardProps {
  user: any;
}

export default function SubmissionReadinessDashboard({
  user,
}: SubmissionReadinessDashboardProps) {
  const [result, setResult] =
    useState<MunicipalSubmissionReadinessResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [projects, setProjects] = useState<Array<{ id: string; name: string; data: Record<string, any> }>>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [projectsLoading, setProjectsLoading] = useState(true);

  // Load user's projects
  useEffect(() => {
    if (!user?.uid) {
      setProjectsLoading(false);
      return;
    }

    async function loadProjects() {
      try {
        const jobsRef = collection(db, 'jobs');
        let q;
        if (user.role === 'admin') {
          q = query(jobsRef, ...[].slice.call([] as any));
        } else if (user.role === 'client') {
          q = query(jobsRef, where('clientId', '==', user.uid));
        } else {
          // BEP/architect/contractor — match any professional field
          q = query(jobsRef, where('selectedProfessionalId', '==', user.uid));
        }

        const snap = await getDocs(q);
        const projectList = snap.docs.map((d) => {
          const docData = d.data() as Record<string, any>;
          return {
            id: d.id,
            name: docData.title || docData.name || d.id,
            data: { id: d.id, ...docData },
          };
        });
        setProjects(projectList);

        // Try to also load projects collection
        const projectsRef = collection(db, 'projects');
        let pq;
        if (user.role === 'admin') {
          // limit admin to 50
          pq = query(projectsRef);
        } else if (user.role === 'client') {
          pq = query(projectsRef, where('clientId', '==', user.uid));
        } else {
          pq = query(projectsRef, where('leadProfessionalId', '==', user.uid));
        }

        try {
          const projectSnap = await getDocs(pq);
          const projectDocs = projectSnap.docs.map((d) => {
            const docData = d.data() as Record<string, any>;
            return {
              id: d.id,
              name: docData.name || docData.projectName || d.id,
              data: { id: d.id, ...docData },
            };
          });
          // Merge, deduplicating by id
          const seen = new Set(projectList.map((p) => p.id));
          for (const pd of projectDocs) {
            if (!seen.has(pd.id)) {
              projectList.push(pd);
              seen.add(pd.id);
            }
          }
        } catch {
          // Projects collection might not exist
        }
      } catch (e) {
        console.error('Failed to load projects:', e);
      } finally {
        setProjectsLoading(false);
      }
    }

    loadProjects();
  }, [user]);

  // Assess readiness when project is selected
  useEffect(() => {
    if (!selectedProjectId) {
      setResult(null);
      setLoading(false);
      return;
    }

    async function assess() {
      setLoading(true);
      setError(null);

      const projectEntry = projects.find((p) => p.id === selectedProjectId);
      if (!projectEntry) {
        setError('Project not found');
        setLoading(false);
        return;
      }

      const projectData = projectEntry.data;

      // Try API first
      try {
        const token = await auth.currentUser?.getIdToken();
        if (token) {
          const res = await apiFetch(
            `/api/projects/${selectedProjectId}/submission-readiness`,
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );
          if (res.ok) {
            const json = await res.json();
            setResult(json);
            setLoading(false);
            return;
          }
        }
      } catch {
        // Fall through to client-side
      }

      // Client-side assessment
      try {
        const scopeFacts = buildScopeFactsFromProject({
          projectId: projectData.id || selectedProjectId,
          projectName: projectData.name || projectData.projectName || projectData.title || 'Untitled',
          municipality: projectData.municipality,
          province: projectData.province,
          propertyDescription: projectData.propertyDescription,
          erfNumber: projectData.erfNumber,
          zoningKnown: projectData.zoningKnown ?? false,
          occupancyType: projectData.occupancyType ?? 'single_residential',
          alterationToExisting: projectData.alterationToExisting ?? false,
          additions: projectData.additions ?? false,
          newBuild: projectData.newBuild ?? projectData.projectType === 'new_build',
          changesLoadBearing: projectData.changesLoadBearing ?? false,
          changesDrainageOrStormwater: projectData.changesDrainageOrStormwater ?? false,
          publicAccessOrAssembly: projectData.publicAccessOrAssembly ?? false,
          envelopeEnergyImpact: projectData.envelopeEnergyImpact ?? false,
          coverageOrParkingRisk: projectData.coverageOrParkingRisk ?? false,
          boundaryOrServitudeUnclear: projectData.boundaryOrServitudeUnclear ?? false,
          heritagePotential: projectData.heritagePotential ?? false,
          environmentalSensitivity: projectData.environmentalSensitivity ?? false,
          trafficImpact: projectData.trafficImpact ?? false,
          estimatedConstructionValueZar: projectData.estimatedConstructionValueZar ?? 0,
          drawingRegister: Array.isArray(projectData.drawingRegister) ? projectData.drawingRegister : [],
          supportingDocuments: Array.isArray(projectData.supportingDocuments) ? projectData.supportingDocuments : [],
        });
        setResult(assessMunicipalSubmissionReadiness(scopeFacts));
      } catch (e: any) {
        setError(e.message || 'Failed to assess readiness');
      }
    }

    assess();
    setLoading(false);
  }, [selectedProjectId, projects]);

  if (projectsLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Project selector + content
  return (
    <div className="space-y-6">
      {/* Header with project selector */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h2 className="text-3xl font-heading font-bold tracking-tight text-foreground">
            Submission Readiness
          </h2>
          <p className="text-muted-foreground uppercase tracking-widest text-[10px] font-bold mt-1">
            Assess municipal submission readiness for any project
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="">Select a project...</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!selectedProjectId && (
        <Card className="border-dashed border-2 border-border rounded-[2rem]">
          <CardContent className="flex flex-col items-center justify-center py-20">
            <Building2 className="w-16 h-16 text-muted-foreground/30 mb-6" />
            <h3 className="text-xl font-heading font-bold mb-2">
              Select a Project
            </h3>
            <p className="text-muted-foreground max-w-md text-center">
              Choose a project from the dropdown above to assess its municipal
              submission readiness.
            </p>
          </CardContent>
        </Card>
      )}

      {selectedProjectId && loading && (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      )}

      {selectedProjectId && error && (
        <div className="text-center py-20">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h3 className="text-lg font-bold mb-2">Could not load readiness</h3>
          <p className="text-muted-foreground text-sm mb-4">{error}</p>
          <Button
            variant="outline"
            onClick={() => window.location.reload()}
            className="rounded-full"
          >
            Retry
          </Button>
        </div>
      )}

      {selectedProjectId && result && !loading && !error && (
        <>
          {/* Status Badge */}
          <div className="flex justify-end">
            <Badge
              className={`rounded-full px-4 py-2 text-sm ${
                result.readiness.readyForProfessionalSubmissionReview
                  ? 'bg-green-100 text-green-700 border-green-200'
                  : 'bg-red-100 text-red-700 border-red-200'
              }`}
            >
              {result.readiness.readyForProfessionalSubmissionReview
                ? '✓ Ready for Professional Review'
                : '⚠ Not Ready for Submission'}
            </Badge>
          </div>

          {/* Overview Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <ComplexityCard complexity={result.complexity} />
            <ReadinessScoreCard readiness={result.readiness} />
            <CategoryScoresTable readiness={result.readiness} />
          </div>

          {/* Tabs for Detailed Views */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full justify-start rounded-full p-1 bg-secondary/50">
              <TabsTrigger value="overview" className="rounded-full text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <ClipboardCheck className="w-3.5 h-3.5 mr-1.5" /> Checks
              </TabsTrigger>
              <TabsTrigger value="routing" className="rounded-full text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <Users className="w-3.5 h-3.5 mr-1.5" /> Routing
              </TabsTrigger>
              <TabsTrigger value="evidence" className="rounded-full text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <Package className="w-3.5 h-3.5 mr-1.5" /> Evidence Pack
              </TabsTrigger>
              <TabsTrigger value="inbox" className="rounded-full text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <Bell className="w-3.5 h-3.5 mr-1.5" /> Inbox
              </TabsTrigger>
              <TabsTrigger value="recommendations" className="rounded-full text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <Lightbulb className="w-3.5 h-3.5 mr-1.5" /> Actions
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(Object.keys(CATEGORY_LABELS) as ReadinessCategory[]).map((cat) => (
                  <Card key={cat}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-xs font-bold uppercase tracking-wider">
                          {CATEGORY_LABELS[cat]}
                        </CardTitle>
                        <Badge variant="outline" className={`rounded-full text-[10px] ${CATEGORY_COLORS[cat]}`}>
                          {result.readiness.categoryScores[cat]?.score ?? 0}%
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-40">
                        <ChecksPanel checks={result.checks} category={cat} />
                      </ScrollArea>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="routing" className="mt-4">
              <RoutingTable routes={result.professionalRoutes} />
            </TabsContent>

            <TabsContent value="evidence" className="mt-4">
              <EvidencePackCard items={result.evidencePack} />
            </TabsContent>

            <TabsContent value="inbox" className="mt-4">
              <InboxEventsCard events={result.inboxEvents} />
            </TabsContent>

            <TabsContent value="recommendations" className="mt-4">
              <RecommendationsCard recommendations={result.recommendations} />
            </TabsContent>
          </Tabs>

          {/* Audit Trail Footer */}
          <Card className="border-border/50 bg-secondary/10">
            <CardContent className="py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                Audit Trail
              </p>
              <div className="space-y-1">
                {result.auditTrail.map((record) => (
                  <div key={record.id} className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    <Badge variant="outline" className="rounded-full text-[10px] capitalize">
                      {record.actor}
                    </Badge>
                    <span className="capitalize">{record.action.replace(/_/g, ' ')}</span>
                    <span className="text-muted-foreground/60">
                      {new Date(record.timestamp).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
