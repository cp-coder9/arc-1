// ─── Imports ─────────────────────────────────────────────────────────────────
import { apiFetch } from '../lib/apiClient';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, doc, updateDoc, getDocs, getDoc, orderBy } from 'firebase/firestore';
import { uploadAndTrackFile } from '../lib/uploadService';
import {
  UserProfile, Job, Application, Submission, DelegatedTask, AIReviewResult,
  ArchitectProfile, JobCard, Review, Project, ProjectTeamMember, DISCIPLINE_REGISTRY,
} from '../types';
import ProfileEditor from './ProfileEditor';
import RatingSystem from './RatingSystem';
import { Chat, ChatButton } from './Chat';
// shadcn primitives still used in sub-components
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { ScrollArea } from './ui/scroll-area';
import { toast } from 'sonner';
import {
  Search, Briefcase, FileUp, CheckCircle2, Clock, AlertCircle, ExternalLink,
  CreditCard, Landmark, Building, UploadCloud, ShieldCheck, History, Star,
  Send, Loader2, Sparkles, User, Cpu, Shield, ArrowRight, Users, Plus, Eye,
  MessageCircle, UserCircle, LayoutList, MoreHorizontal, MapPin, Upload,
  HardHat, ClipboardCheck, Settings,
} from 'lucide-react';
import { reviewDrawing, logSystemEvent, AIProgress } from '../services/geminiService';
import { SubmissionItem } from './SubmissionItem';
import { OrchestrationProgressModal } from './OrchestrationProgressModal';
import { notificationService } from '../services/notificationService';
import ReactMarkdown from 'react-markdown';
import { safeLocale } from '@/lib/utils';
import { paginateItems, totalPages } from '@/lib/utils';
import { SearchFilter, SearchFilters } from './SearchFilter';
import { formatDistanceToNow, differenceInDays, parseISO } from 'date-fns';
import MunicipalTracker from './MunicipalTracker';
import FeeEstimator from './FeeEstimator';
import StageProgressTracker from './StageProgressTracker';
import { subscribeToProjectByJobId } from '../services/projectLifecycleService';
import AdvanceStageButton from './AdvanceStageButton';
import ResponsibilityMatrix from './ResponsibilityMatrix';
import TeamBuilder from './TeamBuilder';
import { getDisciplineCoverage, subscribeToTeam } from '../services/teamService';
import GanttChart from './GanttChart';
import SiteLogManager from './SiteLogManager';
import RFIManager from './RFIManager';
import CloseoutWizard from './CloseoutWizard';
import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';

// ─── Glass system & design components ────────────────────────────────────────
import { RoleAwareSidebar } from '@/components/navigation/RoleAwareSidebar';
import { Breadcrumbs } from '@/components/navigation/Breadcrumbs';
import { MobileMenuTrigger } from '@/components/navigation/MobileMenuTrigger';
import { StatCardAnimated } from '@/components/animated/StatCardAnimated';
import { GlassCardAnimated } from '@/components/animated/GlassCardAnimated';
import { DashboardSection } from '@/components/composite/DashboardSection';
import { GlassTable } from '@/components/composite/GlassTable';
import { GlassButton } from '@/components/ui/GlassButton';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/useReducedMotion';

// ─── Types ────────────────────────────────────────────────────────────────────
interface ArchitectDashboardProps {
  user: UserProfile;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

type TabKey = 'overview' | 'marketplace' | 'team' | 'coordination' | 'construction' | 'closeout' | 'fees' | 'applications' | 'municipal';

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'overview', label: 'Overview', icon: <LayoutList size={15} aria-hidden="true" /> },
  { key: 'marketplace', label: 'Marketplace', icon: <Briefcase size={15} aria-hidden="true" /> },
  { key: 'team', label: 'Team & Match', icon: <Users size={15} aria-hidden="true" /> },
  { key: 'coordination', label: 'Coordination', icon: <Users size={15} aria-hidden="true" /> },
  { key: 'construction', label: 'Construction', icon: <HardHat size={15} aria-hidden="true" /> },
  { key: 'closeout', label: 'Close-out', icon: <CheckCircle2 size={15} aria-hidden="true" /> },
  { key: 'fees', label: 'Fee Estimator', icon: <CreditCard size={15} aria-hidden="true" /> },
  { key: 'applications', label: 'Applications', icon: <Send size={15} aria-hidden="true" /> },
];

// ─── Main component ───────────────────────────────────────────────────────────
export default function ArchitectDashboard({
  user,
  activeTab,
  onTabChange,
}: ArchitectDashboardProps) {
  const currentTab = (activeTab || 'overview') as TabKey;
  const prefersReducedMotion = useReducedMotion() ?? false;

  const [availableJobs, setAvailableJobs] = useState<Job[]>([]);
  const [myJobs, setMyJobs] = useState<Job[]>([]);
  const [myApplications, setMyApplications] = useState<Application[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<SearchFilters>({
    query: '',
    category: '',
    minBudget: 0,
    maxBudget: 10000000,
    location: '',
    deadlineWithin: 0,
    postedWithin: 0,
    sortBy: 'posted',
  });
  const [marketplacePage, setMarketplacePage] = useState(1);
  const [projectsPage, setProjectsPage] = useState(1);
  const [applicationsPage, setApplicationsPage] = useState(1);
  const pageSize = 6;

  const uniqueApplications = Array.from(
    new Map<string, Application>(
      myApplications.map((a) => [`${a.jobId}:${a.id}`, a])
    ).values()
  );
  const pagedMarketplaceJobs = paginateItems<Job>(availableJobs, marketplacePage, pageSize);
  const pagedMyJobs = paginateItems<Job>(myJobs, projectsPage, pageSize);
  const pagedApplications = paginateItems<Application>(uniqueApplications, applicationsPage, pageSize);

  useEffect(() => {
    const qJobs = query(getDemoCol('jobs'), where('status', '==', 'open'));
    const unsubJobs = onSnapshot(qJobs, (snap) => {
      setAvailableJobs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Job)));
      setLoading(false);
    });

    const qMyJobs = query(getDemoCol('jobs'), where('selectedArchitectId', '==', user.uid));
    const unsubMyJobs = onSnapshot(qMyJobs, (snap) => {
      setMyJobs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Job)));
    });

    const qReviews = query(
      getDemoCol('reviews'),
      where('toId', '==', user.uid),
      where('status', '==', 'approved'),
      orderBy('createdAt', 'desc')
    );
    const unsubReviews = onSnapshot(qReviews, (snap) => {
      setReviews(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Review)));
    });

    return () => { unsubJobs(); unsubMyJobs(); unsubReviews(); };
  }, [user.uid]);

  useEffect(() => {
    const trackedJobs = Array.from(
      new Map([...availableJobs, ...myJobs].map((job) => [job.id, job])).values()
    );
    if (trackedJobs.length === 0) {
      setMyApplications([]);
      return;
    }

    const applicationMap = new Map<string, Application>();
    const unsubscribes = trackedJobs.map((job) => {
      const q = query(getDemoCol(`jobs/${job.id}/applications`), where('architectId', '==', user.uid));
      return onSnapshot(q, (snap) => {
        [...applicationMap.keys()]
          .filter((key) => applicationMap.get(key)?.jobId === job.id)
          .forEach((key) => applicationMap.delete(key));
        snap.docs.forEach((d) =>
          applicationMap.set(`${job.id}:${d.id}`, { id: d.id, ...d.data() } as Application)
        );
        setMyApplications(
          Array.from(applicationMap.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        );
      });
    });

    return () => unsubscribes.forEach((u) => u());
  }, [availableJobs, myJobs, user.uid]);

  // ── Tab content renderer ────────────────────────────────────────────────────
  function renderTabContent() {
    switch (currentTab) {
      case 'overview':
        return <OverviewTab
          user={user}
          myJobs={myJobs}
          pagedMyJobs={pagedMyJobs}
          projectsPage={projectsPage}
          setProjectsPage={setProjectsPage}
          pageSize={pageSize}
          reviews={reviews}
          prefersReducedMotion={prefersReducedMotion}
          onTabChange={onTabChange}
        />;
      case 'marketplace':
        return <MarketplaceTab
          user={user}
          availableJobs={availableJobs}
          pagedMarketplaceJobs={pagedMarketplaceJobs}
          filters={filters}
          setFilters={setFilters}
          marketplacePage={marketplacePage}
          setMarketplacePage={setMarketplacePage}
          pageSize={pageSize}
        />;
      case 'applications':
        return <ApplicationsTab
          pagedApplications={pagedApplications}
          uniqueApplications={uniqueApplications}
          applicationsPage={applicationsPage}
          setApplicationsPage={setApplicationsPage}
          pageSize={pageSize}
        />;
      case 'team':
        return <TeamManager user={user} myJobs={myJobs} />;
      case 'coordination':
        return <CoordinationDashboard user={user} myJobs={myJobs} />;
      case 'construction':
        return <ConstructionDashboard user={user} myJobs={myJobs} />;
      case 'closeout':
        return <CloseoutDashboard myJobs={myJobs} />;
      case 'fees':
        return <FeeEstimator role="architect" />;
      case 'municipal':
        return <MunicipalTracker user={user} />;
      default:
        return null;
    }
  }

  // ── Layout ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <RoleAwareSidebar user={user} />
      <main className="md:ml-64 p-4 md:p-6 space-y-6" id="main-content">
        {/* ── Page header ────────────────────────────────────────────────── */}
        <header className="glass-panel rounded-2xl p-5 md:p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            {/* Title + breadcrumbs + profile */}
            <div className="flex items-start gap-3">
              {/* Mobile hamburger — visible only below md */}
              <MobileMenuTrigger user={user} className="mt-1 shrink-0" />
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-2xl md:text-3xl font-heading font-bold text-foreground tracking-tight">
                    Architect Portal
                  </h1>
                  <ProfileEditor user={user} />
                </div>
                <p className="text-sm text-foreground-muted mt-1 max-w-xl leading-relaxed">
                  Elite architectural workspace with SANS-powered compliance verification.
                </p>
                <Breadcrumbs className="mt-2" />
              </div>
            </div>

            {/* Stat pills + quick actions */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <div className="glass-pill px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5">
                <Star size={12} className="text-yellow-400" aria-hidden="true" />
                <span className="text-foreground-muted">Rating:</span>
                <span className="font-bold">{Number(user.averageRating || 5.0).toFixed(1)}/5</span>
              </div>
              <div className="glass-pill px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5">
                <CheckCircle2 size={12} className="text-green-400" aria-hidden="true" />
                <span className="text-foreground-muted">Jobs:</span>
                <span className="font-bold">{user.completedJobs || 0}</span>
              </div>
              <GlassButton
                variant="outline"
                size="sm"
                onClick={() => onTabChange?.('files')}
                aria-label="Quick scan — upload drawings"
              >
                <Upload size={14} className="mr-1.5" aria-hidden="true" /> Quick Scan
              </GlassButton>
              <GlassButton
                variant="solid"
                size="sm"
                onClick={() => onTabChange?.('marketplace')}
                aria-label="Browse job marketplace"
              >
                <Search size={14} className="mr-1.5" aria-hidden="true" /> Browse Jobs
              </GlassButton>
            </div>
          </div>
        </header>

        {/* ── Tab navigation ─────────────────────────────────────────────── */}
        <nav aria-label="Dashboard sections" className="w-full overflow-x-auto pb-1">
          <div role="tablist" aria-label="Dashboard sections" className="glass-nav rounded-2xl p-1 flex gap-1 w-fit min-w-full sm:min-w-0">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={currentTab === tab.key}
                aria-controls={`tabpanel-${tab.key}`}
                id={`tab-${tab.key}`}
                onClick={() => onTabChange?.(tab.key)}
                className={cn(
                  'flex items-center gap-1.5 px-3 md:px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wide whitespace-nowrap transition-all duration-200',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--landing-accent)]',
                  currentTab === tab.key
                    ? 'glass-button-solid text-primary-foreground'
                    : 'text-foreground-muted hover:text-foreground hover:bg-muted/30'
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </nav>

        {/* ── Tab content ────────────────────────────────────────────────── */}
        {/* Page entrance: fade in on tab mount (0.3s), sections cascade via
            stagger delay on child StatCardAnimated / GlassCardAnimated.
            Requirements: 7.3, 7.4 */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentTab}
            role="tabpanel"
            id={`tabpanel-${currentTab}`}
            aria-labelledby={`tab-${currentTab}`}
            tabIndex={0}
            className="focus-visible-ring focus-visible:outline-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.3 }}
          >
            {renderTabContent()}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────
function OverviewTab({
  user,
  myJobs,
  pagedMyJobs,
  projectsPage,
  setProjectsPage,
  pageSize,
  reviews,
  prefersReducedMotion,
  onTabChange,
}: {
  user: UserProfile;
  myJobs: Job[];
  pagedMyJobs: Job[];
  projectsPage: number;
  setProjectsPage: (p: number) => void;
  pageSize: number;
  reviews: Review[];
  prefersReducedMotion: boolean;
  onTabChange?: (tab: string) => void;
}) {
  const statCards: Array<{ label: string; value: string | number; icon: React.ReactNode }> = [
    {
      label: 'Active Projects',
      value: myJobs.length,
      icon: <Briefcase className="w-5 h-5" />,
    },
    {
      label: 'Rating',
      value: `${Number(user.averageRating || 5.0).toFixed(1)}/5`,
      icon: <Star className="w-5 h-5" />,
    },
    {
      label: 'Completed Jobs',
      value: user.completedJobs || 0,
      icon: <CheckCircle2 className="w-5 h-5" />,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stat cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {statCards.map((card, i) => (
          <div key={card.label}>
            <StatCardAnimated
              label={card.label}
              value={card.value}
              icon={card.icon}
              delay={prefersReducedMotion ? 0 : i * 0.05}
              prefersReducedMotion={prefersReducedMotion}
            />
          </div>
        ))}
      </div>

      {/* Two-column layout: projects + reviews */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active projects column */}
        <div className="lg:col-span-2">
          <DashboardSection
            title="Active Projects"
            icon={<Briefcase className="w-5 h-5" />}
            description="Projects currently assigned to you"
            action={
              <GlassButton variant="outline" size="sm" onClick={() => onTabChange?.('marketplace')}>
                <Search size={13} className="mr-1" aria-hidden="true" /> Find More
              </GlassButton>
            }
          >
            <div className="space-y-4">
              {pagedMyJobs.map((job, i) => (
                <GlassCardAnimated key={job.id} delay={prefersReducedMotion ? 0 : i * 0.05} prefersReducedMotion={prefersReducedMotion} className="p-0">
                  <ActiveProjectCard job={job} user={user} />
                </GlassCardAnimated>
              ))}
              {myJobs.length > pageSize && (
                <PaginationControls
                  page={projectsPage}
                  totalPages={totalPages(myJobs.length, pageSize)}
                  onPageChange={setProjectsPage}
                />
              )}
              {myJobs.length === 0 && (
                <div className="py-12 text-center text-foreground-muted italic">
                  No active projects yet. Browse the marketplace to apply!
                </div>
              )}
            </div>
          </DashboardSection>
        </div>

        {/* Client reviews column */}
        <div>
          <DashboardSection
            title="Client Reviews"
            icon={<Star className="w-5 h-5" />}
          >
            <div className="space-y-3">
              {reviews.map((review) => (
                <div
                  key={review.id}
                  className="glass-record rounded-xl p-4 hover:-translate-y-0.5 transition-transform"
                >
                  <div className="flex justify-between items-center mb-1.5">
                    <div className="flex text-yellow-400 gap-0.5">
                      {[...Array(5)].map((_, idx) => (
                        <Star
                          key={idx}
                          size={11}
                          fill={idx < review.rating ? 'currentColor' : 'none'}
                          className={idx < review.rating ? '' : 'opacity-30'}
                          aria-hidden="true"
                        />
                      ))}
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-foreground-muted">
                      {new Date(review.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-xs italic text-foreground leading-relaxed">
                    "{review.comment}"
                  </p>
                </div>
              ))}
              {reviews.length === 0 && (
                <p className="text-xs text-center text-foreground-muted py-8 italic">
                  No reviews yet.
                </p>
              )}
            </div>
          </DashboardSection>
        </div>
      </div>
    </div>
  );
}

// ─── Marketplace Tab ──────────────────────────────────────────────────────────
function MarketplaceTab({
  user,
  availableJobs,
  pagedMarketplaceJobs,
  filters,
  setFilters,
  marketplacePage,
  setMarketplacePage,
  pageSize,
}: {
  user: UserProfile;
  availableJobs: Job[];
  pagedMarketplaceJobs: Job[];
  filters: SearchFilters;
  setFilters: (f: SearchFilters) => void;
  marketplacePage: number;
  setMarketplacePage: (p: number) => void;
  pageSize: number;
}) {
  return (
    <DashboardSection
      title="Job Marketplace"
      icon={<Briefcase className="w-5 h-5" />}
      description="Available projects matching your discipline"
    >
      <div className="space-y-6">
        <SearchFilter filters={filters} onFiltersChange={setFilters} totalResults={availableJobs.length} />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {pagedMarketplaceJobs.map((job) => (
            <div key={job.id}>
              <JobCardUI job={job} user={user} />
            </div>
          ))}
          {pagedMarketplaceJobs.length === 0 && (
            <div className="col-span-full py-12 text-center text-foreground-muted italic">
              No jobs match your current filters.
            </div>
          )}
        </div>
        {availableJobs.length > pageSize && (
          <PaginationControls
            page={marketplacePage}
            totalPages={totalPages(availableJobs.length, pageSize)}
            onPageChange={setMarketplacePage}
          />
        )}
      </div>
    </DashboardSection>
  );
}

// ─── Applications Tab ─────────────────────────────────────────────────────────
function ApplicationsTab({
  pagedApplications,
  uniqueApplications,
  applicationsPage,
  setApplicationsPage,
  pageSize,
}: {
  pagedApplications: Application[];
  uniqueApplications: Application[];
  applicationsPage: number;
  setApplicationsPage: (p: number) => void;
  pageSize: number;
}) {
  // GlassTable columns for applications
  type AppRow = { id: string; jobId: string; status: string; proposal: string; submittedAt: string; notes: string };
  const columns = [
    { key: 'submittedAt' as keyof AppRow, label: 'Submitted' },
    { key: 'status' as keyof AppRow, label: 'Status', render: (val: AppRow[keyof AppRow]) => (
      <span className={cn('glass-pill text-xs px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide', {
        'text-green-400': val === 'accepted',
        'text-yellow-400': val === 'pending',
        'text-red-400': val === 'withdrawn' || val === 'rejected',
      })}>{String(val)}</span>
    )},
    { key: 'proposal' as keyof AppRow, label: 'Proposal', render: (val: AppRow[keyof AppRow]) => (
      <span className="line-clamp-1 text-xs text-foreground-muted">{String(val)}</span>
    )},
  ];

  const rows: AppRow[] = pagedApplications.map((a) => ({
    id: `${a.jobId}:${a.id}`,
    jobId: a.jobId,
    status: a.status,
    proposal: a.proposal,
    submittedAt: new Date(a.createdAt).toLocaleDateString(),
    notes: a.notes || '',
  }));

  return (
    <DashboardSection
      title="My Applications"
      icon={<Send className="w-5 h-5" />}
      description="Track your submitted proposals"
    >
      <div className="space-y-4">
        <GlassTable columns={columns} rows={rows} rowKey="id" />
        {uniqueApplications.length === 0 && (
          <div className="py-10 text-center text-foreground-muted italic">
            No applications submitted yet.
          </div>
        )}
        {uniqueApplications.length > pageSize && (
          <PaginationControls
            page={applicationsPage}
            totalPages={totalPages(uniqueApplications.length, pageSize)}
            onPageChange={setApplicationsPage}
          />
        )}
      </div>
    </DashboardSection>
  );
}

// ─── ActiveProjectCard ────────────────────────────────────────────────────────
function ActiveProjectCard({ job, user }: { job: Job; user: UserProfile }) {
  const [client, setClient] = useState<UserProfile | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);

  useEffect(() => {
    if (job.clientId) {
      getDoc(getDemoDoc('users', job.clientId)).then((clientDoc) => {
        if (clientDoc.exists()) setClient({ uid: clientDoc.id, ...clientDoc.data() } as UserProfile);
      });
    }
  }, [job.clientId]);

  useEffect(() => {
    const unsubscribe = subscribeToProjectByJobId(job.id, setProject);
    return () => unsubscribe();
  }, [job.id]);

  return (
    <div className="p-6 space-y-5">
      <div className="flex justify-between items-start gap-3 flex-wrap">
        <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/10 uppercase text-[10px] tracking-widest font-bold">
          {job.category}
        </Badge>
        <Badge variant="outline" className="rounded-full px-3 uppercase text-[10px] font-bold tracking-widest">
          In Progress
        </Badge>
      </div>
      <h3 className="font-heading font-bold text-xl text-foreground">{job.title}</h3>
      {project && (
        <div className="space-y-3">
          <StageProgressTracker currentStage={project.currentStage} stageHistory={project.stageHistory} />
          {project.leadArchitectId === user.uid && (
            <div className="flex justify-end">
              <AdvanceStageButton project={project} actorId={user.uid} />
            </div>
          )}
        </div>
      )}
      {client && (
        <div className="flex items-center justify-between pt-4 border-t border-border/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
              {client.displayName[0]}
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">{client.displayName}</p>
              <p className="text-[10px] text-foreground-muted uppercase tracking-widest font-semibold">Client</p>
            </div>
          </div>
          <GlassButton variant="outline" size="sm" onClick={() => setIsChatOpen(true)} aria-label={`Chat with ${client.displayName}`}>
            <MessageCircle size={14} className="mr-1" aria-hidden="true" /> Chat
          </GlassButton>
        </div>
      )}
      <DelegatedTasksList job={job} user={user} />
      {isChatOpen && client && (
        <Chat job={job} currentUser={user} otherUser={client} isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
      )}
    </div>
  );
}

// ─── DelegatedTasksList ───────────────────────────────────────────────────────
function DelegatedTasksList({ job, user }: { job: Job; user: UserProfile }) {
  const [tasks, setTasks] = useState<(DelegatedTask | JobCard)[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [assigneeName, setAssigneeName] = useState('');
  const [assigneeRole, setAssigneeRole] = useState('');
  const [deadline, setDeadline] = useState('');
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [estimatedHours, setEstimatedHours] = useState('');
  const [requirements, setRequirements] = useState('');

  useEffect(() => {
    const q = query(getDemoCol(`jobs/${job.id}/tasks`), where('architectId', '==', user.uid));
    return onSnapshot(q, (snap) => {
      setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() } as JobCard)));
    });
  }, [job.id, user.uid]);

  const handleUpdateStatus = async (taskId: string, newStatus: string) => {
    try {
      await updateDoc(getDemoDoc(`jobs/${job.id}/tasks`, taskId), {
        status: newStatus,
        completedAt: newStatus === 'completed' ? new Date().toISOString() : null,
      });
      toast.success('Status updated');
    } catch {
      toast.error('Failed to update status');
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(getDemoCol(`jobs/${job.id}/tasks`), {
        jobId: job.id,
        architectId: user.uid,
        assigneeName,
        assigneeRole,
        deadline,
        notes,
        priority,
        estimatedHours: estimatedHours ? Number(estimatedHours) : null,
        requirements: requirements.split('\n').map((item) => item.trim()).filter(Boolean),
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
      setAssigneeName(''); setAssigneeRole(''); setDeadline('');
      setNotes(''); setEstimatedHours(''); setRequirements('');
      setIsAdding(false);
      toast.success('Team task assigned');
    } catch {
      toast.error('Failed to assign task');
    }
  };

  return (
    <div className="space-y-3 mt-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted flex items-center gap-2">
        <Users size={12} aria-hidden="true" /> Team Deliverables
      </p>
      <div className="space-y-2">
        {tasks.map((task) => (
          <div key={task.id} className="glass-record rounded-xl p-4 space-y-3">
            <div className="flex justify-between items-center gap-3 flex-wrap">
              <div>
                <p className="text-sm font-bold text-foreground">
                  {task.assigneeName}{' '}
                  <span className="text-[10px] text-foreground-muted font-normal">({task.assigneeRole})</span>
                </p>
                <p className="text-[10px] text-foreground-muted flex items-center gap-1 mt-0.5">
                  <Clock size={11} aria-hidden="true" /> Due: {new Date(task.deadline).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={task.status}
                  onChange={(e) => handleUpdateStatus(task.id, e.target.value)}
                  aria-label="Task status"
                  className="text-[10px] uppercase font-bold tracking-widest px-3 py-1 rounded-full border border-border bg-background outline-none glass-input"
                >
                  <option value="pending">Pending</option>
                  <option value="in-progress">In Progress</option>
                  <option value="completed">Completed</option>
                </select>
                {task.status === 'completed' && task.assigneeId && (
                  <Dialog>
                    <DialogTrigger render={
                      <Button size="sm" variant="outline" className="h-7 px-2 rounded-lg text-[8px] uppercase font-black tracking-tighter gap-1">
                        <Star size={10} aria-hidden="true" /> Rate
                      </Button>
                    } />
                    <DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-3xl border-none">
                      <RatingSystem fromId={user.uid} toId={task.assigneeId} toName={task.assigneeName} jobId={job.id} type={task.assigneeRole === 'bep' ? 'to_bep' : 'to_freelancer'} />
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </div>
            <p className="text-xs text-foreground-muted line-clamp-1 italic">"{task.notes}"</p>
          </div>
        ))}
        {tasks.length === 0 && <p className="text-[10px] text-foreground-muted italic">No job cards assigned yet.</p>}
      </div>
      <Dialog open={isAdding} onOpenChange={setIsAdding}>
        <DialogTrigger render={
          <GlassButton variant="outline" size="sm">
            <Plus size={13} className="mr-1" aria-hidden="true" /> Add Team Task
          </GlassButton>
        } />
        <DialogContent className="sm:max-w-lg rounded-3xl">
          <DialogHeader><DialogTitle>Assign Team Deliverable</DialogTitle></DialogHeader>
          <form onSubmit={handleAddTask} className="space-y-4">
            <Input placeholder="Assignee name" aria-label="Assignee name" value={assigneeName} onChange={(e) => setAssigneeName(e.target.value)} required />
            <Input placeholder="Role, e.g. Structural Engineer" aria-label="Role or discipline" value={assigneeRole} onChange={(e) => setAssigneeRole(e.target.value)} required />
            <Input type="date" aria-label="Deadline date" value={deadline} onChange={(e) => setDeadline(e.target.value)} required />
            <Input type="number" placeholder="Estimated hours" aria-label="Estimated hours" value={estimatedHours} onChange={(e) => setEstimatedHours(e.target.value)} />
            <select value={priority} onChange={(e) => setPriority(e.target.value as 'low' | 'medium' | 'high')} aria-label="Priority" className="w-full h-12 px-4 rounded-xl border border-border bg-background text-sm glass-input">
              <option value="low">Low priority</option>
              <option value="medium">Medium priority</option>
              <option value="high">High priority</option>
            </select>
            <Textarea placeholder="Notes" aria-label="Task notes" value={notes} onChange={(e) => setNotes(e.target.value)} required />
            <Textarea placeholder="Requirements, one per line" aria-label="Task requirements, one per line" value={requirements} onChange={(e) => setRequirements(e.target.value)} />
            <Button type="submit" className="w-full">Assign task</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── TeamManager Tab ──────────────────────────────────────────────────────────
function TeamManager({ user, myJobs }: { user: UserProfile; myJobs: Job[] }) {
  const [pros, setPros] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(getDemoCol('users'), where('role', 'in', ['freelancer', 'bep']));
    return onSnapshot(q, (snap) => {
      setPros(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as UserProfile)));
      setLoading(false);
    });
  }, []);

  type ProRow = { uid: string; displayName: string; role: string; rating: string };
  const proRows: ProRow[] = pros.map((p) => ({
    uid: p.uid,
    displayName: p.displayName,
    role: p.role,
    rating: `${Number(p.averageRating || 5.0).toFixed(1)} / 5`,
  }));

  const proColumns = [
    { key: 'displayName' as keyof ProRow, label: 'Name' },
    { key: 'role' as keyof ProRow, label: 'Role' },
    { key: 'rating' as keyof ProRow, label: 'Rating', render: (val: ProRow[keyof ProRow]) => (
      <span className="flex items-center gap-1 text-yellow-400 font-bold text-xs">
        <Star size={12} fill="currentColor" aria-hidden="true" /> {String(val)}
      </span>
    )},
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Job cards with task assignment */}
        <div className="lg:col-span-2">
          <DashboardSection
            title="Team Assignment"
            icon={<Users className="w-5 h-5" />}
            description="Assign deliverables to team members per project"
          >
            <div className="space-y-4">
              {myJobs.map((job) => (
                <div key={job.id} className="glass-record rounded-xl p-5 space-y-3">
                  <Badge variant="secondary" className="uppercase text-[10px] tracking-widest">{job.category}</Badge>
                  <h3 className="font-bold text-lg text-foreground">{job.title}</h3>
                  <DelegatedTasksList job={job} user={user} />
                </div>
              ))}
              {myJobs.length === 0 && !loading && (
                <div className="py-12 text-center text-foreground-muted italic">
                  No active projects available for team assignment.
                </div>
              )}
            </div>
          </DashboardSection>
        </div>

        {/* Available professionals */}
        <div>
          <DashboardSection
            title="Available Professionals"
            icon={<UserCircle className="w-5 h-5" />}
          >
            <GlassTable columns={proColumns} rows={proRows} rowKey="uid" isLoading={loading} />
          </DashboardSection>
        </div>
      </div>
    </div>
  );
}

// ─── CoordinationDashboard Tab ────────────────────────────────────────────────
function CoordinationDashboard({ user, myJobs }: { user: UserProfile; myJobs: Job[] }) {
  const [selectedJobId, setSelectedJobId] = useState(myJobs[0]?.id || '');
  const [project, setProject] = useState<Project | null>(null);
  const [teamMembers, setTeamMembers] = useState<ProjectTeamMember[]>([]);
  const [professionals, setProfessionals] = useState<UserProfile[]>([]);
  const selectedJob = myJobs.find((job) => job.id === selectedJobId) || myJobs[0];

  useEffect(() => {
    if (!selectedJobId && myJobs[0]?.id) setSelectedJobId(myJobs[0].id);
  }, [myJobs, selectedJobId]);

  useEffect(() => {
    const q = query(getDemoCol('users'), where('role', 'in', ['architect', 'freelancer', 'bep']));
    return onSnapshot(q, (snap) => {
      setProfessionals(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as UserProfile)));
    });
  }, []);

  useEffect(() => {
    if (!selectedJob?.id) { setProject(null); return; }
    return subscribeToProjectByJobId(selectedJob.id, setProject);
  }, [selectedJob?.id]);

  useEffect(() => {
    if (!project?.id) { setTeamMembers([]); return; }
    return subscribeToTeam(project.id, setTeamMembers);
  }, [project?.id]);

  if (myJobs.length === 0 || !selectedJob) {
    return (
      <DashboardSection title="Coordination" icon={<Users className="w-5 h-5" />}>
        <div className="py-12 text-center text-foreground-muted italic">
          No active projects available for coordination.
        </div>
      </DashboardSection>
    );
  }

  const coverageProject = project ? { ...project, category: selectedJob.category, teamMembers } : null;
  const coverage = coverageProject
    ? getDisciplineCoverage(coverageProject)
    : { filled: [], missing: DISCIPLINE_REGISTRY.filter((d) => d.requiredFor.includes(selectedJob.category)).map((d) => d.key) };
  const labelFor = (key: string) => DISCIPLINE_REGISTRY.find((d) => d.key === key)?.label || key;

  const coverageStats = [
    { label: 'Filled Disciplines', value: coverage.filled.length, icon: <CheckCircle2 className="w-5 h-5" /> },
    { label: 'Missing Disciplines', value: coverage.missing.length, icon: <AlertCircle className="w-5 h-5" /> },
  ];

  return (
    <div className="space-y-6">
      <DashboardSection
        title="Coordination"
        icon={<Users className="w-5 h-5" />}
        description="Manage discipline coverage, responsibility, and project team invitations."
        action={
          <select
            value={selectedJob.id}
            onChange={(e) => setSelectedJobId(e.target.value)}
            aria-label="Select project for coordination"
            className="h-10 rounded-xl border border-border bg-background px-4 text-sm font-bold outline-none glass-input"
          >
            {myJobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
          </select>
        }
      >
        <div className="space-y-6">
          {/* Coverage stat cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {coverageStats.map((s) => (
              <div key={s.label} className="glass-tile rounded-xl p-5">
                <div className="flex items-center gap-3 mb-2">
                  <div className="glass-icon-box text-primary">{s.icon}</div>
                  <p className="text-xs text-foreground-muted font-semibold uppercase tracking-wide">{s.label}</p>
                </div>
                <p className={cn('text-3xl font-heading font-black', s.label.includes('Missing') ? 'text-destructive' : 'text-primary')}>
                  {s.value}
                </p>
              </div>
            ))}
            {/* Outstanding disciplines */}
            <div className="glass-tile rounded-xl p-5">
              <p className="text-xs text-foreground-muted font-semibold uppercase tracking-wide mb-2">Outstanding</p>
              <div className="flex flex-wrap gap-1.5">
                {coverage.missing.map((d) => (
                  <Badge key={d} variant="outline" className="border-dashed text-xs">{labelFor(d)}</Badge>
                ))}
                {coverage.missing.length === 0 && (
                  <Badge className="bg-green-100 text-green-700 border-green-200">Complete</Badge>
                )}
              </div>
            </div>
          </div>

          {!project && (
            <div className="glass-record rounded-xl p-5 border-amber-500/30 text-amber-400">
              <p className="font-bold text-sm">Project lifecycle record not found.</p>
              <p className="text-xs mt-1 text-foreground-muted">Coordination tools become active once this job has an associated project record.</p>
            </div>
          )}

          <ResponsibilityMatrix job={selectedJob} project={project} teamMembers={teamMembers} professionals={professionals} currentUser={user} />
          <TeamBuilder job={selectedJob} project={project} teamMembers={teamMembers} professionals={professionals} currentUser={user} />
        </div>
      </DashboardSection>
    </div>
  );
}

// ─── ConstructionDashboard Tab ────────────────────────────────────────────────
function ConstructionDashboard({ user, myJobs }: { user: UserProfile; myJobs: Job[] }) {
  const [selectedJobId, setSelectedJobId] = useState(myJobs[0]?.id || '');
  const [project, setProject] = useState<Project | null>(null);
  const [teamMembers, setTeamMembers] = useState<ProjectTeamMember[]>([]);
  const selectedJob = myJobs.find((job) => job.id === selectedJobId) || myJobs[0];

  useEffect(() => {
    if (!selectedJobId && myJobs[0]?.id) setSelectedJobId(myJobs[0].id);
  }, [myJobs, selectedJobId]);

  useEffect(() => {
    if (!selectedJob?.id) { setProject(null); return; }
    return subscribeToProjectByJobId(selectedJob.id, setProject);
  }, [selectedJob?.id]);

  useEffect(() => {
    if (!project?.id) { setTeamMembers([]); return; }
    return subscribeToTeam(project.id, setTeamMembers);
  }, [project?.id]);

  if (myJobs.length === 0 || !selectedJob) {
    return (
      <DashboardSection title="Construction Delivery" icon={<HardHat className="w-5 h-5" />}>
        <div className="py-12 text-center text-foreground-muted italic">No active projects available for construction delivery.</div>
      </DashboardSection>
    );
  }

  if (!project) {
    return (
      <DashboardSection title="Construction Delivery" icon={<HardHat className="w-5 h-5" />}>
        <div className="glass-record rounded-xl p-6 border-amber-500/30 text-amber-400">
          <p className="font-heading text-xl font-bold text-foreground mb-1">Construction tools unavailable</p>
          <p className="text-sm text-foreground-muted">This job does not yet have a lifecycle project record. Construction delivery activates once the project record exists.</p>
        </div>
      </DashboardSection>
    );
  }

  return (
    <DashboardSection
      title="Construction Delivery"
      icon={<HardHat className="w-5 h-5" />}
      description={`Programme, site records, RFIs, and inspection summary for ${selectedJob.title}.`}
      action={
        <select
          value={selectedJob.id}
          onChange={(e) => setSelectedJobId(e.target.value)}
          aria-label="Select construction project"
          className="h-10 rounded-xl border border-border bg-background px-4 text-sm font-bold outline-none glass-input"
        >
          {myJobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
        </select>
      }
    >
      <div className="space-y-6">
        <GanttChart projectId={project.id} teamMembers={teamMembers} />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <SiteLogManager projectId={project.id} jobId={selectedJob.id} currentUserId={user.uid} compact />
          <RFIManager projectId={project.id} jobId={selectedJob.id} currentUser={user} teamMembers={teamMembers} compact />
        </div>
        <div className="glass-record rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="glass-icon-box text-primary"><ClipboardCheck aria-hidden="true" /></div>
            <div>
              <h3 className="font-heading text-lg font-bold text-foreground">Site Inspections</h3>
              <p className="text-sm text-foreground-muted mt-0.5">Inspection data model and Firestore service are available. Dedicated checklist UI is reserved for a later requested component scope.</p>
            </div>
          </div>
          <Badge variant="outline" className="rounded-full px-4 py-2 shrink-0">Phase 4 summary</Badge>
        </div>
      </div>
    </DashboardSection>
  );
}

// ─── CloseoutDashboard Tab ────────────────────────────────────────────────────
function CloseoutDashboard({ myJobs }: { myJobs: Job[] }) {
  const [selectedJobId, setSelectedJobId] = useState(myJobs[0]?.id || '');
  const [project, setProject] = useState<Project | null>(null);
  const selectedJob = myJobs.find((job) => job.id === selectedJobId) || myJobs[0];

  useEffect(() => {
    if (!selectedJobId && myJobs[0]?.id) setSelectedJobId(myJobs[0].id);
  }, [myJobs, selectedJobId]);

  useEffect(() => {
    if (!selectedJob?.id) { setProject(null); return; }
    return subscribeToProjectByJobId(selectedJob.id, setProject);
  }, [selectedJob?.id]);

  if (myJobs.length === 0 || !selectedJob) {
    return (
      <DashboardSection title="Project Close-out" icon={<CheckCircle2 className="w-5 h-5" />}>
        <div className="py-12 text-center text-foreground-muted italic">No projects available for close-out.</div>
      </DashboardSection>
    );
  }

  return (
    <DashboardSection
      title="Project Close-out"
      icon={<CheckCircle2 className="w-5 h-5" />}
      description="Generate completion artifacts and archive lifecycle records."
      action={
        <select
          value={selectedJob.id}
          onChange={(e) => setSelectedJobId(e.target.value)}
          aria-label="Select close-out project"
          className="h-10 rounded-xl border border-border bg-background px-4 text-sm font-bold outline-none glass-input"
        >
          {myJobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
        </select>
      }
    >
      {project
        ? <CloseoutWizard projectId={project.id} />
        : (
          <div className="glass-record rounded-xl p-6 border-amber-500/30 text-amber-400">
            <p className="font-bold text-sm">Project lifecycle record not found.</p>
            <p className="text-xs mt-1 text-foreground-muted">Close-out tools will activate once this job has an associated project record.</p>
          </div>
        )
      }
    </DashboardSection>
  );
}

// ─── JobCardUI ────────────────────────────────────────────────────────────────
function JobCardUI({ job, user }: { job: Job; user: UserProfile }) {
  const [isApplying, setIsApplying] = useState(false);
  const [proposal, setProposal] = useState('');
  const [notes, setNotes] = useState('');

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('You must be logged in to apply');

      const response = await apiFetch(`/api/jobs/${job.id}/applications`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ proposal, notes }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to submit application');
      }

      setIsApplying(false);
      setProposal('');
      setNotes('');
      toast.success('Application submitted');
    } catch (error: any) {
      toast.error(error.message || 'Failed to submit application');
    }
  };

  return (
    <div className="glass-record rounded-2xl p-6 flex flex-col gap-4 hover:-translate-y-0.5 transition-transform">
      <div className="flex justify-between items-start gap-3">
        <Badge className="bg-primary/10 text-primary border-primary/10 uppercase text-[10px] tracking-widest">{job.category}</Badge>
        <span className="text-sm font-bold text-primary font-mono">R {job.budget.toLocaleString()}</span>
      </div>
      <h3 className="font-heading font-bold text-lg text-foreground">{job.title}</h3>
      <p className="text-xs text-foreground-muted line-clamp-3 leading-relaxed">{job.description}</p>
      <div className="mt-auto flex items-center justify-between pt-3 border-t border-border/40">
        <span className="text-[10px] uppercase font-bold text-foreground-muted flex items-center gap-1">
          <MapPin size={11} aria-hidden="true" /> {job.location || 'RSA'}
        </span>
        <Dialog open={isApplying} onOpenChange={setIsApplying}>
          <DialogTrigger render={
            <GlassButton variant="solid" size="sm">Apply</GlassButton>
          } />
          <DialogContent className="sm:max-w-lg rounded-3xl">
            <DialogHeader><DialogTitle>Apply for {job.title}</DialogTitle></DialogHeader>
            <form onSubmit={handleApply} className="space-y-4">
              <Textarea placeholder="Proposal" value={proposal} onChange={(e) => setProposal(e.target.value)} required />
              <Textarea placeholder="Private notes/comments" value={notes} onChange={(e) => setNotes(e.target.value)} />
              <Button type="submit" className="w-full">Submit application</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

// ─── PaginationControls ───────────────────────────────────────────────────────
function PaginationControls({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}) {
  return (
    <div className="flex items-center justify-between glass-record rounded-xl p-3">
      <GlassButton variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        Previous
      </GlassButton>
      <span className="text-xs font-bold text-foreground-muted">Page {page} of {totalPages}</span>
      <GlassButton variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
        Next
      </GlassButton>
    </div>
  );
}
