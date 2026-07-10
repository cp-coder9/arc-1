import { apiFetch } from '../lib/apiClient';
import { getSelectedProfessionalId } from '../lib/professionalRoleCompatibility';
import React, { useState, useEffect } from 'react';
import { auth } from '../lib/firebase';
import { query, where, onSnapshot, getDoc, updateDoc, addDoc, orderBy, deleteField } from 'firebase/firestore';
import { UserProfile, Job, Application, Review, Project } from '../types';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { GlassButton } from './ui/GlassButton';
import { StatCardAnimated } from './animated/StatCardAnimated';
import { DashboardSection } from './composite/DashboardSection';
import { GlassTable } from './composite/GlassTable';
import RoleAwareSidebar from './navigation/RoleAwareSidebar';
import Breadcrumbs from './navigation/Breadcrumbs';
import MobileMenuTrigger from './navigation/MobileMenuTrigger';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import {
  Briefcase,
  CheckCircle2,
  Star,
  MessageCircle,
  Plus,
  Users,
  Loader2,
  CreditCard,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import ProfileEditor from './ProfileEditor';
import RatingSystem from './RatingSystem';
import { Chat } from './Chat';
import { paginateItems, totalPages } from '@/lib/utils';
import FeeEstimator from './FeeEstimator';
import StageProgressTracker from './StageProgressTracker';
import { subscribeToProjectByJobId } from '../services/projectLifecycleService';
import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';

/**
 * ClientDashboard — Property owner / developer workspace.
 *
 * Preconditions:
 *   - user is authenticated with role 'client'
 *   - Firebase is initialized and readable
 *
 * Postconditions:
 *   - renders full glass design system layout
 *   - all glass components are interactive and keyboard navigable
 *   - animations respect prefers-reduced-motion
 *   - all text meets WCAG AA contrast minimum 4.5:1
 *
 * Layout:
 *   z1: RoleAwareSidebar (fixed left, hidden mobile)
 *   z2: MobileMenuTrigger (visible mobile only)
 *   z3: Header (glass-panel with title + Breadcrumbs + actions)
 *   z4: Stat cards grid (StatCard components)
 *   z5: Content sections (DashboardSection + GlassTable)
 *
 * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6
 */
export default function ClientDashboard({
  user,
  activeTab,
  onTabChange,
}: {
  user: UserProfile;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}) {
  const [myJobs, setJobs] = useState<Job[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPosting, setIsPosting] = useState(false);
  const prefersReducedMotion = useReducedMotion() ?? false;

  useEffect(() => {
    if (activeTab === 'post-job') {
      setIsPosting(true);
    }
  }, [activeTab]);

  const [newJob, setNewJob] = useState<Partial<Job>>({
    title: '',
    description: '',
    budget: 0,
    deadline: '',
    requirements: [],
    category: 'Residential',
  });

  const [jobPage, setJobPage] = useState(1);
  const pageSize = 5;
  const pagedJobs = paginateItems<Job>(myJobs, jobPage, pageSize);
  const jobPages = totalPages(myJobs.length, pageSize);

  useEffect(() => {
    const q = query(getDemoCol('jobs'), where('clientId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setJobs(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Job)));
      setLoading(false);
    });

    const qReviews = query(
      getDemoCol('reviews'),
      where('toId', '==', user.uid),
      where('status', '==', 'approved'),
      orderBy('createdAt', 'desc'),
    );
    const unsubReviews = onSnapshot(qReviews, (snap) => {
      setReviews(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Review)));
    });

    return () => {
      unsubscribe();
      unsubReviews();
    };
  }, [user.uid]);

  const handlePostJob = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(getDemoCol('jobs'), {
        ...newJob,
        clientId: user.uid,
        status: 'open',
        createdAt: new Date().toISOString(),
      });
      setIsPosting(false);
      setNewJob({
        title: '',
        description: '',
        budget: 0,
        deadline: '',
        requirements: [],
        category: 'Residential',
      });
      toast.success('Job posted successfully');
    } catch (error) {
      toast.error('Failed to post job');
    }
  };

  const activeJobsCount = myJobs.filter((j) => j.status !== 'completed' && j.status !== 'cancelled').length;
  const completedJobsCount = myJobs.filter((j) => j.status === 'completed').length;
  const avgRating = reviews.length
    ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
    : '—';

  const showOverview = !activeTab || activeTab === 'overview' || activeTab === 'post-job';
  const showProjects = activeTab === 'projects';
  const showFees = activeTab === 'fees';

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <RoleAwareSidebar user={user} />
      <main className="md:ml-64 p-4 md:p-6 space-y-6">
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header className="glass-panel rounded-2xl p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              {/* Mobile hamburger */}
              <MobileMenuTrigger user={user} className="mt-1" />
              <div>
                <h1 className="text-2xl md:text-3xl font-heading font-bold text-foreground">
                  Welcome, {user.displayName}
                </h1>
                <Breadcrumbs />
                <p className="text-sm text-foreground/60 mt-1 max-w-xl">
                  Manage your projects and connect with elite architectural experts.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <ProfileEditor user={user} />
              <Dialog open={isPosting} onOpenChange={setIsPosting}>
                <DialogTrigger render={
                  <GlassButton variant="solid" size="sm">
                    <Plus className="w-4 h-4 mr-1" /> Post New Job
                  </GlassButton>
                } />
                <DialogContent className="sm:max-w-[500px] rounded-3xl">
                  <DialogHeader>
                    <DialogTitle>Post a New Job</DialogTitle>
                    <DialogDescription>
                      Use the fee estimator first if you want a professional-fee budget guide before posting.
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handlePostJob} className="space-y-4">
                    <Input placeholder="Job Title" value={newJob.title} onChange={(e) => setNewJob({ ...newJob, title: e.target.value })} required />
                    <Textarea placeholder="Job Description" value={newJob.description} onChange={(e) => setNewJob({ ...newJob, description: e.target.value })} required />
                    <Input type="number" placeholder="Budget" value={newJob.budget} onChange={(e) => setNewJob({ ...newJob, budget: Number(e.target.value) })} required />
                    <Input type="date" value={newJob.deadline} onChange={(e) => setNewJob({ ...newJob, deadline: e.target.value })} required />
                    <GlassButton type="submit" variant="solid" className="w-full">
                      Post Job
                    </GlassButton>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </header>

        {/* ── Stat cards grid ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCardAnimated
            label="Active Jobs"
            value={activeJobsCount}
            icon={<Briefcase className="w-5 h-5" />}
            delay={prefersReducedMotion ? 0 : 0 * 0.05}
            prefersReducedMotion={prefersReducedMotion}
          />
          <StatCardAnimated
            label="Completed Projects"
            value={completedJobsCount}
            icon={<CheckCircle2 className="w-5 h-5" />}
            trend={completedJobsCount > 0 ? { direction: 'up', value: `${completedJobsCount}` } : undefined}
            delay={prefersReducedMotion ? 0 : 1 * 0.05}
            prefersReducedMotion={prefersReducedMotion}
          />
          <StatCardAnimated
            label="Avg Feedback Rating"
            value={avgRating === '—' ? '—' : `${avgRating}/5`}
            icon={<Star className="w-5 h-5" />}
            delay={prefersReducedMotion ? 0 : 2 * 0.05}
            prefersReducedMotion={prefersReducedMotion}
          />
        </div>

        {/* ── Overview tab ────────────────────────────────────────────────── */}
        {showOverview && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Fee Estimator + Active Jobs */}
            <div className="lg:col-span-2 space-y-6">
              <DashboardSection
                title="Fee Estimator"
                description="Get a budget estimate before posting your job"
                icon={<CreditCard className="w-5 h-5" />}
              >
                <FeeEstimator
                  role="client"
                  compact
                  onEstimateBudget={(amount) =>
                    setNewJob((current) => ({ ...current, budget: amount }))
                  }
                />
              </DashboardSection>

              <DashboardSection
                title="Your Active Jobs"
                description="Jobs you've posted on the platform"
                icon={<Briefcase className="w-5 h-5" />}
                action={
                  <GlassButton variant="outline" size="sm" onClick={() => setIsPosting(true)}>
                    <Plus className="w-4 h-4 mr-1" /> New Job
                  </GlassButton>
                }
              >
                {pagedJobs.length > 0 ? (
                  <div className="grid grid-cols-1 gap-4">
                    {pagedJobs.map((job) => (
                      <div key={job.id}>
                        <ClientJobCard job={job} user={user} />
                      </div>
                    ))}
                    {myJobs.length > pageSize && (
                      <PaginationControls
                        page={jobPage}
                        totalPages={jobPages}
                        onPageChange={setJobPage}
                      />
                    )}
                  </div>
                ) : !loading ? (
                  <p className="text-sm text-foreground/60 italic py-8 text-center">
                    You haven't posted any jobs yet.
                  </p>
                ) : (
                  <p className="text-sm text-foreground/60 py-8 text-center">Loading...</p>
                )}
              </DashboardSection>
            </div>

            {/* Right: Professional Feedback */}
            <div>
              <DashboardSection
                title="Professional Feedback"
                description="Reviews from professionals you've worked with"
                icon={<Star className="w-5 h-5" />}
              >
                {reviews.length > 0 ? (
                  <div className="space-y-3">
                    {reviews.map((review) => (
                      <div
                        key={review.id}
                        className="glass-tile rounded-xl p-4 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex text-yellow-400">
                            {[...Array(5)].map((_, i) => (
                              <Star
                                key={i}
                                size={12}
                                fill={i < review.rating ? 'currentColor' : 'none'}
                                className={i < review.rating ? 'scale-110' : 'opacity-30'}
                              />
                            ))}
                          </div>
                          <span className="text-[10px] font-bold uppercase tracking-widest text-foreground/60">
                            {new Date(review.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-xs italic text-foreground leading-relaxed">
                          "{review.comment}"
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-center text-foreground/60 py-8 italic">
                    No reviews yet.
                  </p>
                )}
              </DashboardSection>
            </div>
          </div>
        )}

        {/* ── Projects tab ────────────────────────────────────────────────── */}
        {showProjects && (
          <DashboardSection
            title="Project Portfolio"
            description="All your jobs and projects"
            icon={<FileText className="w-5 h-5" />}
          >
            {myJobs.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {myJobs.map((job) => (
                  <div key={job.id}>
                    <ClientJobCard job={job} user={user} />
                  </div>
                ))}
              </div>
            ) : !loading ? (
              <p className="text-sm text-foreground/60 italic py-8 text-center">
                No projects found.
              </p>
            ) : (
              <p className="text-sm text-foreground/60 py-8 text-center">Loading...</p>
            )}
          </DashboardSection>
        )}

        {/* ── Fees tab ────────────────────────────────────────────────────── */}
        {showFees && (
          <DashboardSection
            title="Fee Estimator"
            description="Professional fee calculation tool"
            icon={<CreditCard className="w-5 h-5" />}
          >
            <FeeEstimator
              role="client"
              onEstimateBudget={(amount) =>
                setNewJob((current) => ({ ...current, budget: amount }))
              }
            />
          </DashboardSection>
        )}
      </main>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * ClientJobCard — Individual job card with all management actions
 * --------------------------------------------------------------------------- */
function ClientJobCard({ job, user }: { job: Job; user: UserProfile }) {
  const [architect, setArchitect] = useState<UserProfile | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isDisputing, setIsDisputing] = useState(false);
  const [acceptingApplicationId, setAcceptingApplicationId] = useState<string | null>(null);
  const [editJob, setEditJob] = useState<Partial<Job>>(job);
  const [disputeReason, setDisputeReason] = useState('');
  const [requestedResolution, setRequestedResolution] = useState('');
  const selectedProfessionalId = getSelectedProfessionalId(job);

  useEffect(() => {
    if (selectedProfessionalId) {
      const fetchArchitect = async () => {
        const archDoc = await getDoc(getDemoDoc('users', selectedProfessionalId));
        if (archDoc.exists()) setArchitect({ uid: archDoc.id, ...archDoc.data() } as UserProfile);
      };
      fetchArchitect();
    } else {
      setArchitect(null);
    }
  }, [selectedProfessionalId]);

  useEffect(() => {
    const q = query(
      getDemoCol(`jobs/${job.id}/applications`),
      where('status', '==', 'pending'),
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setApplications(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Application)));
    });
    return () => unsubscribe();
  }, [job.id]);

  useEffect(() => {
    const unsubscribe = subscribeToProjectByJobId(job.id, setProject);
    return () => unsubscribe();
  }, [job.id]);

  const appendHistory = (status: Job['status'], note?: string) => [
    ...(job.statusHistory || []),
    { status, timestamp: new Date().toISOString(), actorId: user.uid, note },
  ];

  const handleSaveJob = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateDoc(getDemoDoc('jobs', job.id), {
        title: editJob.title,
        description: editJob.description,
        budget: Number(editJob.budget || 0),
        deadline: editJob.deadline,
        location: editJob.location || '',
        updatedAt: new Date().toISOString(),
      });
      setIsEditing(false);
      toast.success('Job updated');
    } catch {
      toast.error('Failed to update job');
    }
  };

  const handleCancelJob = async () => {
    const reason = prompt('Reason for cancelling this job?') || 'Cancelled by client';
    try {
      await updateDoc(getDemoDoc('jobs', job.id), {
        status: 'cancelled',
        cancellationReason: reason,
        cancelledAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        statusHistory: appendHistory('cancelled', reason),
      });
      toast.success('Job cancelled');
    } catch {
      toast.error('Failed to cancel job');
    }
  };

  const handleUnassignArchitect = async () => {
    try {
      await updateDoc(getDemoDoc('jobs', job.id), {
        selectedProfessionalId: deleteField(),
        selectedBepId: deleteField(),
        selectedArchitectId: deleteField(),
        status: 'open',
        updatedAt: new Date().toISOString(),
        statusHistory: appendHistory('open', 'Architect unassigned by client'),
      });
      toast.success('Architect unassigned');
    } catch {
      toast.error('Failed to unassign architect');
    }
  };

  const handleAcceptApplication = async (application: Application) => {
    setAcceptingApplicationId(application.id);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('You must be logged in to accept an application');

      const response = await apiFetch(
        `/api/jobs/${job.id}/applications/${application.id}/accept`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to accept application');
      }

      toast.success(`${application.architectName} accepted for this job`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to accept application');
    } finally {
      setAcceptingApplicationId(null);
    }
  };

  const handleFileDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(getDemoCol('disputes'), {
        jobId: job.id,
        filedBy: user.uid,
        filedAgainst: selectedProfessionalId,
        reason: disputeReason,
        requestedResolution,
        status: 'open',
        createdAt: new Date().toISOString(),
      });
      setIsDisputing(false);
      setDisputeReason('');
      setRequestedResolution('');
      toast.success('Dispute filed for admin mediation');
    } catch {
      toast.error('Failed to file dispute');
    }
  };

  const statusColorClass =
    job.status === 'completed'
      ? 'bg-green-100 text-green-700'
      : job.status === 'in-progress'
        ? 'bg-blue-100 text-blue-700'
        : 'bg-yellow-100 text-yellow-700';

  return (
    <div className="glass-record rounded-2xl p-6 space-y-5 group">
      {/* Status badges */}
      <div className="flex justify-between items-start">
        <Badge variant="secondary" className="bg-primary/5 text-primary border-primary/10 uppercase text-[10px] tracking-widest font-bold">
          {job.category}
        </Badge>
        <Badge className={`text-[10px] uppercase tracking-widest ${statusColorClass}`}>
          {(job.status || 'open').replace('-', ' ')}
        </Badge>
      </div>

      {/* Title */}
      <h3 className="font-heading font-bold text-xl group-hover:text-primary transition-colors tracking-tight">
        {job.title}
      </h3>
      <p className="text-sm text-foreground/60 line-clamp-2">{job.description}</p>

      {/* Stage tracker */}
      {project && (
        <StageProgressTracker
          currentStage={project.currentStage}
          stageHistory={project.stageHistory}
        />
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <Dialog open={isEditing} onOpenChange={setIsEditing}>
          <DialogTrigger render={
            <GlassButton size="sm" variant="outline">Edit</GlassButton>
          } />
          <DialogContent className="sm:max-w-lg rounded-3xl">
            <DialogHeader><DialogTitle>Edit Job</DialogTitle></DialogHeader>
            <form onSubmit={handleSaveJob} className="space-y-4">
              <Input value={editJob.title || ''} onChange={(e) => setEditJob({ ...editJob, title: e.target.value })} required />
              <Textarea value={editJob.description || ''} onChange={(e) => setEditJob({ ...editJob, description: e.target.value })} required />
              <Input type="number" value={editJob.budget || 0} onChange={(e) => setEditJob({ ...editJob, budget: Number(e.target.value) })} required />
              <Input type="date" value={editJob.deadline || ''} onChange={(e) => setEditJob({ ...editJob, deadline: e.target.value })} required />
              <Input placeholder="Location" value={editJob.location || ''} onChange={(e) => setEditJob({ ...editJob, location: e.target.value })} />
              <GlassButton type="submit" variant="solid" className="w-full">Save changes</GlassButton>
            </form>
          </DialogContent>
        </Dialog>

        {job.status !== 'cancelled' && job.status !== 'completed' && (
          <GlassButton size="sm" variant="outline" onClick={handleCancelJob}>
            Cancel Job
          </GlassButton>
        )}

        <Dialog open={isDisputing} onOpenChange={setIsDisputing}>
          <DialogTrigger render={
            <GlassButton size="sm" variant="outline">File Dispute</GlassButton>
          } />
          <DialogContent className="sm:max-w-lg rounded-3xl">
            <DialogHeader>
              <DialogTitle>File Dispute</DialogTitle>
              <DialogDescription>Send this project to admin mediation.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleFileDispute} className="space-y-4">
              <Textarea placeholder="What happened?" value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)} required />
              <Textarea placeholder="Requested resolution" value={requestedResolution} onChange={(e) => setRequestedResolution(e.target.value)} required />
              <GlassButton type="submit" variant="solid" className="w-full">Submit dispute</GlassButton>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Status history */}
      {!!job.statusHistory?.length && (
        <div className="glass-tile rounded-xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/60 mb-2">
            Status History
          </p>
          {job.statusHistory.slice(-3).map((entry, index) => (
            <p key={`${entry.timestamp}-${index}`} className="text-xs text-foreground/60">
              {entry.status.replace('-', ' ')} · {new Date(entry.timestamp).toLocaleDateString()}
              {entry.note ? ` · ${entry.note}` : ''}
            </p>
          ))}
        </div>
      )}

      {/* Architect applications */}
      {job.status === 'open' && applications.length > 0 && (
        <div className="glass-tile rounded-xl p-4 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-2">
            <Users size={12} /> Architect Applications
          </p>
          {applications.map((application) => (
            <div key={application.id} className="glass-record rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-foreground">{application.architectName}</p>
                  <p className="text-[10px] text-foreground/60 uppercase tracking-widest">
                    Applied {new Date(application.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <Badge variant="outline" className="uppercase text-[10px] tracking-widest">
                  {application.status}
                </Badge>
              </div>
              <p className="text-xs text-foreground/60 leading-relaxed">{application.proposal}</p>
              {application.notes && (
                <p className="text-[10px] text-foreground/60 italic">Notes: {application.notes}</p>
              )}
              <GlassButton
                size="sm"
                variant="solid"
                disabled={acceptingApplicationId === application.id}
                onClick={() => handleAcceptApplication(application)}
              >
                {acceptingApplicationId === application.id ? (
                  <Loader2 size={14} className="mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 size={14} className="mr-2" />
                )}
                Accept Architect
              </GlassButton>
            </div>
          ))}
        </div>
      )}

      {/* Assigned architect */}
      {architect && (
        <div className="flex items-center justify-between pt-4 border-t border-border/40">
          <div className="flex items-center gap-3">
            <div className="glass-icon-box w-10 h-10 rounded-full flex items-center justify-center text-primary font-bold">
              {architect.displayName[0]}
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">{architect.displayName}</p>
              <p className="text-[10px] text-foreground/60 uppercase tracking-widest font-bold">
                Assigned Architect
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <GlassButton variant="outline" size="sm" onClick={() => setIsChatOpen(true)}>
              <MessageCircle size={16} className="mr-1" /> Chat
            </GlassButton>
            <GlassButton variant="outline" size="sm" onClick={handleUnassignArchitect}>
              Unassign
            </GlassButton>
            {job.status === 'completed' && (
              <Dialog>
                <DialogTrigger render={
                  <GlassButton size="sm" variant="outline">
                    <Star size={16} className="mr-1" /> Rate
                  </GlassButton>
                } />
                <DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-3xl border-none">
                  <RatingSystem
                    fromId={user.uid}
                    toId={architect.uid}
                    toName={architect.displayName}
                    jobId={job.id}
                    type="client_to_architect"
                  />
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>
      )}

      {/* Chat overlay */}
      {isChatOpen && architect && (
        <Chat
          job={job}
          currentUser={user}
          otherUser={architect}
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * PaginationControls — prev/next navigation for paginated lists
 * --------------------------------------------------------------------------- */
function PaginationControls({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="glass-tile rounded-xl flex items-center justify-between p-3">
      <GlassButton
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        Previous
      </GlassButton>
      <span className="text-xs font-bold text-foreground/60">
        Page {page} of {totalPages}
      </span>
      <GlassButton
        variant="outline"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        Next
      </GlassButton>
    </div>
  );
}
