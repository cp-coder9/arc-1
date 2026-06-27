import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, doc, getDoc, updateDoc, collectionGroup, addDoc, orderBy } from 'firebase/firestore';
import { UserProfile, Job, JobCard, UserRole, Review, Project } from '../types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import {
  LayoutDashboard,
  Briefcase,
  Clock,
  CheckCircle2,
  History,
  User,
  MessageCircle,
  FileText,
  Search,
  Star,
  MapPin,
  Hammer,
  ArrowRight,
  TrendingUp,
  Award,
  ShieldCheck,
  BadgeCheck,
  Zap,
  Target,
  Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import ProfileEditor from './ProfileEditor';
import { safeFormat } from '../lib/utils';
import { Chat } from './Chat';
import { subscribeToProjectByJobId } from '../services/projectLifecycleService';
import SiteLogManager from './SiteLogManager';
import BEPToolboxPage from './BEPToolboxPage';
import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';

// ─── Glass system & design components ────────────────────────────────────────
import { RoleAwareSidebar } from '@/components/navigation/RoleAwareSidebar';
import { MobileMenuTrigger } from '@/components/navigation/MobileMenuTrigger';
import { Breadcrumbs } from '@/components/navigation/Breadcrumbs';
import { GlassButton } from '@/components/ui/GlassButton';
import { StatCardAnimated } from '@/components/animated/StatCardAnimated';
import { DashboardSection } from '@/components/composite/DashboardSection';
import { GlassTable } from '@/components/composite/GlassTable';
import { useReducedMotion } from '@/hooks/useReducedMotion';
const taskStatusStyles: Record<'pending' | 'in-progress' | 'completed', string> = {
  pending: 'bg-primary/5 text-primary border-primary/10',
  'in-progress': 'bg-accent/10 text-primary border-accent/20',
  completed: 'bg-primary-light/10 text-primary-light border-primary-light/20',
};

export default function BEPDashboard({ user }: { user: UserProfile }) {
  const prefersReducedMotion = useReducedMotion() ?? false;
  const [assignedTasks, setAssignedTasks] = useState<JobCard[]>([]);
  const [availableJobs, setAvailableJobs] = useState<Job[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<'overview' | 'marketplace' | 'toolbox'>('overview');

  useEffect(() => {
    const qTasks = query(collectionGroup(db, 'tasks'), where('assigneeId', '==', user.uid));
    const unsubscribeTasks = onSnapshot(qTasks, (snapshot) => {
      setAssignedTasks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as JobCard)));
    });

    const qJobs = query(getDemoCol( 'jobs'), where('status', '==', 'open'));
    const unsubscribeJobs = onSnapshot(qJobs, (snapshot) => {
      setAvailableJobs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job)));
      setLoading(false);
    });

    const qReviews = query(
      getDemoCol( 'reviews'),
      where('toId', '==', user.uid),
      where('status', '==', 'approved'),
      orderBy('createdAt', 'desc')
    );
    const unsubscribeReviews = onSnapshot(qReviews, (snapshot) => {
      setReviews(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Review)));
    });

    return () => {
      unsubscribeTasks();
      unsubscribeJobs();
      unsubscribeReviews();
    };
  }, [user.uid]);

  const stats = {
    totalTasks: assignedTasks.length,
    completed: assignedTasks.filter(t => t.status === 'completed').length,
    inProgress: assignedTasks.filter(t => t.status === 'in-progress').length,
    rating: user.averageRating || 5.0,
  };

  // Enhanced Matching Logic
  const recommendedJobs = availableJobs.map(job => {
    let score = 0;
    const trade = user.professionalLabel?.toLowerCase() || '';
    const region = user.region?.toLowerCase() || '';

    if (job.category?.toLowerCase().includes(trade)) score += 50;
    if (job.description?.toLowerCase().includes(trade)) score += 30;
    if (job.location?.toLowerCase().includes(region)) score += 20;

    return { ...job, matchScore: score };
  }).filter(j => j.matchScore > 0).sort((a, b) => b.matchScore - a.matchScore);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Fixed left sidebar (hidden on mobile, visible md+) */}
      <RoleAwareSidebar user={user} activeTab={activeView} onNavigate={(id) => setActiveView(id as typeof activeView)} />

      {/* Main content — shifted right on desktop for sidebar */}
      <main className="md:ml-64 p-4 md:p-6 space-y-6" id="main-content">
        {/* ── Page header ────────────────────────────────────────────────── */}
        <header className="glass-panel rounded-2xl p-5 md:p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              <MobileMenuTrigger user={user} className="mt-1 shrink-0" />
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-2xl md:text-3xl font-heading font-bold text-foreground tracking-tight">
                    Professional Portal
                  </h1>
                  <ProfileEditor user={user} />
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Badge variant="outline" className="rounded-full px-3 py-1 bg-primary/5 text-primary border-primary/10 font-bold uppercase tracking-widest text-[10px]">
                    {user.professionalLabel || 'BEP'}
                  </Badge>
                  {user.nhbrcNumber && (
                    <Badge variant="outline" className="rounded-full px-3 py-1 bg-primary-light/10 text-primary-light border-primary-light/20 font-bold uppercase tracking-widest text-[10px] flex items-center gap-1">
                      <ShieldCheck size={10} /> NHBRC: {user.nhbrcNumber}
                    </Badge>
                  )}
                  {user.cidbGrading && (
                    <Badge variant="outline" className="rounded-full px-3 py-1 bg-accent/10 text-primary border-accent/20 font-bold uppercase tracking-widest text-[10px] flex items-center gap-1">
                      <BadgeCheck size={10} /> CIDB: {user.cidbGrading}
                    </Badge>
                  )}
                  {user.region && (
                    <Badge variant="outline" className="rounded-full px-3 py-1 bg-secondary/50 text-muted-foreground border-border font-bold uppercase tracking-widest text-[10px] flex items-center gap-1">
                      <MapPin size={10} /> {user.region}
                    </Badge>
                  )}
                </div>
                <Breadcrumbs className="mt-2" />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <GlassButton
                variant={activeView === 'overview' ? 'solid' : 'outline'}
                size="sm"
                onClick={() => setActiveView('overview')}
              >
                Overview
              </GlassButton>
              <GlassButton
                variant={activeView === 'marketplace' ? 'solid' : 'outline'}
                size="sm"
                onClick={() => setActiveView('marketplace')}
              >
                Marketplace
              </GlassButton>
              <GlassButton
                variant={activeView === 'toolbox' ? 'solid' : 'outline'}
                size="sm"
                onClick={() => setActiveView('toolbox')}
              >
                <Wrench size={14} className="mr-1.5" aria-hidden="true" /> Toolbox
              </GlassButton>
            </div>
          </div>
        </header>

        {/* ── View content ───────────────────────────────────────────────── */}
        {activeView === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCardAnimated label="My Tasks" value={stats.totalTasks} icon={<LayoutDashboard size={20} aria-hidden="true" />} delay={prefersReducedMotion ? 0 : 0 * 0.05} prefersReducedMotion={prefersReducedMotion} />
                <StatCardAnimated label="In Progress" value={stats.inProgress} icon={<History size={20} aria-hidden="true" />} delay={prefersReducedMotion ? 0 : 1 * 0.05} prefersReducedMotion={prefersReducedMotion} />
                <StatCardAnimated label="Rating" value={`${Number(stats.rating).toFixed(1)}/5`} icon={<Star size={20} aria-hidden="true" />} delay={prefersReducedMotion ? 0 : 2 * 0.05} prefersReducedMotion={prefersReducedMotion} />
              </div>

              {recommendedJobs.length > 0 && (
                <DashboardSection
                  title="Recommended Projects"
                  icon={<Zap size={18} aria-hidden="true" />}
                  action={
                    <GlassButton variant="outline" size="sm" onClick={() => setActiveView('marketplace')}>
                      View All <ArrowRight size={14} className="ml-1" />
                    </GlassButton>
                  }
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {recommendedJobs.slice(0, 2).map(job => (
                      <div key={job.id} className="glass-record p-5 rounded-2xl group relative">
                        <div className="absolute top-3 right-3">
                          <Badge className="bg-primary/10 text-primary border-primary/20 uppercase text-[8px] font-black tracking-tighter">
                            {job.matchScore}% Match
                          </Badge>
                        </div>
                        <Badge variant="secondary" className="w-fit mb-3 uppercase text-[10px] tracking-widest">{job.category}</Badge>
                        <h3 className="font-heading font-bold text-lg group-hover:text-[var(--landing-accent)] transition-colors">{job.title}</h3>
                        <p className="text-xs text-foreground-muted line-clamp-2 mt-2 mb-4">{job.description}</p>
                        <div className="flex justify-between items-center pt-3 border-t border-white/10">
                          <span className="text-sm font-bold text-[var(--landing-accent)] font-mono">R {job.budget.toLocaleString()}</span>
                          <GlassButton size="sm" variant="solid">Apply Now</GlassButton>
                        </div>
                      </div>
                    ))}
                  </div>
                </DashboardSection>
              )}

              <BEPConstructionSection user={user} tasks={assignedTasks} />

              <DashboardSection title="Active Job Cards" icon={<Clock size={18} aria-hidden="true" />}>
                <div className="grid grid-cols-1 gap-4">
                  {assignedTasks.map(task => (
                    <BEPJobCard key={task.id} {...({task, user} as any)} task={task} user={user} />
                  ))}
                  {assignedTasks.length === 0 && !loading && (
                    <div className="text-center py-16 text-foreground-muted">
                      <Briefcase className="w-8 h-8 mx-auto mb-3 opacity-50" />
                      <p className="italic">No tasks currently assigned to you.</p>
                    </div>
                  )}
                </div>
              </DashboardSection>
            </div>

            <div className="space-y-4">
              <DashboardSection title="Feedback" icon={<Star size={18} aria-hidden="true" />}>
                <div className="space-y-4">
                  {reviews.map(review => (
                    <div key={review.id} className="space-y-2 pb-4 border-b border-white/10 last:border-0 last:pb-0">
                      <div className="flex justify-between items-center">
                        <div className="flex text-yellow-400">
                          {[...Array(5)].map((_, i) => (
                            <Star key={i} size={10} fill={i < review.rating ? "currentColor" : "none"} />
                          ))}
                        </div>
                        <span className="text-[10px] uppercase font-bold text-foreground-muted">{new Date(review.createdAt).toLocaleDateString()}</span>
                      </div>
                      <p className="text-xs text-foreground italic leading-relaxed">"{review.comment}"</p>
                    </div>
                  ))}
                  {reviews.length === 0 && (
                    <p className="text-xs text-center text-foreground-muted py-6 italic">No approved reviews yet.</p>
                  )}
                </div>
              </DashboardSection>

              <div className="glass-panel rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="glass-icon-box p-2 rounded-xl">
                    <Target size={20} aria-hidden="true" />
                  </div>
                  <h3 className="text-lg font-heading font-bold">Profile Visibility</h3>
                </div>
                <p className="text-sm text-foreground-muted leading-relaxed mb-4">
                  Your profile is visible to architects looking for <strong>{user.professionalLabel || 'skilled professionals'}</strong> in <strong>{user.region || 'South Africa'}</strong>.
                </p>
                <ProfileEditor user={user} trigger={<GlassButton variant="solid" className="w-full">Update Profile</GlassButton>} />
              </div>
            </div>
          </div>
        )}

        {activeView === 'marketplace' && (
          <DashboardSection title="Marketplace" description="Find projects that match your trade and region.">
            <div className="relative w-full md:w-72 mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
              <input
                type="text"
                placeholder="Search trades or locations..."
                className="w-full h-10 pl-10 pr-4 rounded-xl border border-white/10 bg-white/5 text-sm focus:ring-2 focus:ring-[var(--landing-accent)] outline-none transition-all"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {availableJobs.map(job => (
                <MarketplaceJobCard key={job.id} {...({job, user} as any)} job={job} user={user} />
              ))}
            </div>
          </DashboardSection>
        )}

        {activeView === 'toolbox' && (
          <BEPToolboxPage user={user} />
        )}
      </main>
    </div>
  );
}

function BEPConstructionSection({ user, tasks }: { user: UserProfile; tasks: JobCard[] }) {
  const [selectedJobId, setSelectedJobId] = useState(tasks[0]?.jobId || '');
  const [project, setProject] = useState<Project | null>(null);
  const jobIds = Array.from(new Set(tasks.map((task) => task.jobId).filter(Boolean)));

  useEffect(() => {
    if (!selectedJobId && jobIds[0]) setSelectedJobId(jobIds[0]);
  }, [jobIds, selectedJobId]);

  useEffect(() => {
    if (!selectedJobId) {
      setProject(null);
      return;
    }
    return subscribeToProjectByJobId(selectedJobId, setProject);
  }, [selectedJobId]);

  if (jobIds.length === 0) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h2 className="text-2xl font-heading font-bold tracking-tight flex items-center gap-2">
          <Hammer className="text-primary" /> Site Logs
        </h2>
        <select value={selectedJobId} onChange={(event) => setSelectedJobId(event.target.value)} className="h-11 rounded-xl border border-border bg-white px-4 text-sm font-bold outline-none" aria-label="Select site log project">
          {jobIds.map((jobId) => <option key={jobId} value={jobId}>{jobId}</option>)}
        </select>
      </div>
      {project ? (
        <SiteLogManager projectId={project.id} jobId={selectedJobId} currentUserId={user.uid} compact />
      ) : (
        <Card className="rounded-3xl border-amber-200 bg-amber-50 text-amber-900"><CardContent className="p-6 text-sm">Site logs become available once this job is linked to a lifecycle project record.</CardContent></Card>
      )}
    </div>
  );
}

function BEPJobCard({ task, user }: { task: JobCard, user: UserProfile }) {
  const [job, setJob] = useState<Job | null>(null);
  const [architect, setArchitect] = useState<UserProfile | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);

  useEffect(() => {
    const fetchContext = async () => {
      const jobDoc = await getDoc(getDemoDoc( 'jobs', task.jobId));
      if (jobDoc.exists()) setJob({ id: jobDoc.id, ...jobDoc.data() } as Job);

      const archDoc = await getDoc(getDemoDoc( 'users', task.architectId));
      if (archDoc.exists()) setArchitect({ uid: archDoc.id, ...archDoc.data() } as UserProfile);
    };
    fetchContext();
  }, [task.jobId, task.architectId]);

  const updateStatus = async (newStatus: 'pending' | 'in-progress' | 'completed') => {
    try {
      const taskRef = getDemoDoc( `jobs/${task.jobId}/tasks`, task.id);
      await updateDoc(taskRef, { status: newStatus, updatedAt: new Date().toISOString() });
      toast.success(`Status updated to ${newStatus}`);
    } catch (error) {
      toast.error("Failed to update status.");
    }
  };

  return (
    <Card className="beos-record-card overflow-hidden group flex flex-col">
      <div className="p-8 flex-1 space-y-6">
        <div className="flex justify-between items-start">
          <Badge className={`text-[10px] uppercase tracking-widest ${taskStatusStyles[task.status]}`}>
            {task.status.replace('-', ' ')}
          </Badge>
          <div className="text-right">
             <p className="text-xs font-mono font-bold text-muted-foreground">{safeFormat(task.deadline, 'MMM d, yyyy')}</p>
             <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Deadline</p>
          </div>
        </div>

        <div>
          <h3 className="font-heading font-bold text-2xl group-hover:text-primary transition-colors tracking-tight">
            {job?.title || 'Loading Project...'}
          </h3>
        </div>

        <div className="bg-secondary/30 p-6 rounded-2xl border border-border">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-2">
            <FileText size={12} /> Task Brief
          </p>
          <p className="text-sm leading-relaxed">{task.notes}</p>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-border/50">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs uppercase">
               {architect?.displayName[0]}
             </div>
             <div>
               <p className="text-xs font-bold text-foreground leading-none">{architect?.displayName || 'Loading...'}</p>
               <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mt-1">Lead Architect</p>
             </div>
          </div>
          <Button variant="ghost" size="sm" className="rounded-full gap-2 hover:bg-primary/5" onClick={() => setIsChatOpen(true)}>
            <MessageCircle size={16} /> Chat
          </Button>
        </div>
      </div>

      <CardFooter className="bg-secondary/20 p-6 border-t border-border grid grid-cols-3 gap-3">
        <Button variant={task.status === 'pending' ? 'default' : 'outline'} size="sm" className="rounded-xl h-10 font-bold uppercase text-[10px] tracking-widest" onClick={() => updateStatus('pending')}>Pending</Button>
        <Button variant={task.status === 'in-progress' ? 'default' : 'outline'} size="sm" className="rounded-xl h-10 font-bold uppercase text-[10px] tracking-widest" onClick={() => updateStatus('in-progress')}>Working</Button>
        <Button variant={task.status === 'completed' ? 'default' : 'outline'} size="sm" className="rounded-xl h-10 font-bold uppercase text-[10px] tracking-widest" onClick={() => updateStatus('completed')}>Complete</Button>
      </CardFooter>

      {isChatOpen && job && architect && (
        <Chat job={job} currentUser={user} otherUser={architect} isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
      )}
    </Card>
  );
}

function MarketplaceJobCard({ job, user }: { job: Job, user: UserProfile }) {
  const applyForJob = async () => {
    try {
      await addDoc(getDemoCol( `jobs/${job.id}/applications`), {
        applicantId: user.uid,
        applicantName: user.displayName,
        applicantRole: user.role,
        status: 'pending',
        createdAt: new Date().toISOString()
      });
      toast.success("Application submitted successfully!");
    } catch (error) {
      toast.error("Failed to submit application.");
    }
  };

  return (
    <Card className="beos-record-card overflow-hidden flex flex-col group">
      <CardHeader className="p-8">
        <Badge variant="secondary" className="w-fit bg-primary/5 text-primary border-primary/10 uppercase text-[10px] tracking-widest mb-4 font-bold">
          {job.category}
        </Badge>
        <CardTitle className="font-heading font-bold text-2xl group-hover:text-primary transition-colors">{job.title}</CardTitle>
        <CardDescription className="line-clamp-2 text-sm mt-2">{job.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 p-8 pt-0">
        <div className="flex justify-between items-center pb-6 border-b border-border/50">
          <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
            <MapPin size={12} className="text-primary" /> {job.location || 'South Africa'}
          </span>
          <span className="text-lg font-bold text-primary font-mono">R {job.budget.toLocaleString()}</span>
        </div>
      </CardContent>
      <CardFooter className="p-8 pt-0">
        <Button onClick={applyForJob} className="w-full rounded-2xl h-14 font-bold group text-base">
          Apply Now <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
        </Button>
      </CardFooter>
    </Card>
  );
}
