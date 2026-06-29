import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collectionGroup, query, where, onSnapshot, doc, updateDoc, getDoc } from 'firebase/firestore';
import { UserProfile, JobCard, Job } from '../types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { toast } from 'sonner';
import { CheckCircle2, Clock, AlertCircle, FileText, LayoutDashboard, History, Briefcase, User, MessageCircle, Loader2 } from 'lucide-react';
import ProfileEditor from './ProfileEditor';
import { safeFormat } from '@/lib/utils';
import { Chat } from './Chat';
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

const priorityStyles: Record<'low' | 'medium' | 'high', string> = {
  low: 'border-primary/20 text-primary bg-primary/5',
  medium: 'border-accent/30 text-primary bg-accent/10',
  high: 'border-destructive/30 text-destructive bg-destructive/10',
};

export default function FreelancerDashboard({ user }: { user: UserProfile }) {
  const prefersReducedMotion = useReducedMotion() ?? false;
  const [assignedTasks, setAssignedTasks] = useState<JobCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collectionGroup(db, 'tasks'), where('assigneeId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setAssignedTasks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as JobCard)));
      setLoading(false);
    }, (error) => {
      console.error('[FreelancerDashboard] Tasks listener:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user.uid]);

  const stats = {
    total: assignedTasks.length,
    pending: assignedTasks.filter(t => t.status === 'pending').length,
    inProgress: assignedTasks.filter(t => t.status === 'in-progress').length,
    completed: assignedTasks.filter(t => t.status === 'completed').length,
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Fixed left sidebar (hidden on mobile, visible md+) */}
      <RoleAwareSidebar user={user} activeTab="overview" onNavigate={() => {}} />

      {/* Main content — shifted right on desktop for sidebar */}
      <main className="md:ml-64 p-4 md:p-6 space-y-6" id="main-content">
        {/* ── Page header ────────────────────────────────────────────────── */}
        <header className="glass-panel rounded-2xl p-5 md:p-6">
          <div className="flex items-start gap-3">
            <MobileMenuTrigger user={user} className="mt-1 shrink-0" />
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl md:text-3xl font-heading font-bold text-foreground tracking-tight">Freelancer Portal</h1>
                <ProfileEditor user={user} />
              </div>
              <p className="text-sm text-foreground-muted mt-1 max-w-xl leading-relaxed">Collaborate with architects on high-end architectural projects.</p>
              <Breadcrumbs className="mt-2" />
            </div>
          </div>
        </header>

        {/* ── Stats ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCardAnimated label="Assigned Tasks" value={stats.total} icon={<LayoutDashboard size={20} aria-hidden="true" />} delay={prefersReducedMotion ? 0 : 0 * 0.05} prefersReducedMotion={prefersReducedMotion} />
          <StatCardAnimated label="Pending" value={stats.pending} icon={<Clock size={20} aria-hidden="true" />} delay={prefersReducedMotion ? 0 : 1 * 0.05} prefersReducedMotion={prefersReducedMotion} />
          <StatCardAnimated label="In Progress" value={stats.inProgress} icon={<History size={20} aria-hidden="true" />} delay={prefersReducedMotion ? 0 : 2 * 0.05} prefersReducedMotion={prefersReducedMotion} />
          <StatCardAnimated label="Completed" value={stats.completed} icon={<CheckCircle2 size={20} aria-hidden="true" />} delay={prefersReducedMotion ? 0 : 3 * 0.05} prefersReducedMotion={prefersReducedMotion} />
        </div>

        {/* ── Job Cards ──────────────────────────────────────────────────── */}
        <DashboardSection
          title="Active Job Cards"
          icon={<Briefcase size={18} aria-hidden="true" />}
          action={<Badge variant="outline" className="rounded-full px-4">{assignedTasks.length} Assigned</Badge>}
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {assignedTasks.map(task => (
              <FreelancerJobCard key={task.id} task={task} user={user} />
            ))}
            {assignedTasks.length === 0 && !loading && (
              <div className="col-span-full text-center py-16 text-foreground-muted">
                <Briefcase className="w-10 h-10 mx-auto mb-4 opacity-50" aria-hidden="true" />
                <h3 className="text-xl font-heading font-bold mb-2">No assigned tasks yet</h3>
                <p className="text-sm max-w-sm mx-auto">
                  Once an architect assigns you to a project, your job cards will appear here.
                </p>
              </div>
            )}
          </div>
        </DashboardSection>
      </main>
    </div>
  );
}

function FreelancerJobCard({ task, user }: { task: JobCard, user: UserProfile, key?: any }) {
  const [job, setJob] = useState<Job | null>(null);
  const [architect, setArchitect] = useState<UserProfile | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);

  useEffect(() => {
    const fetchContext = async () => {
      // Fetch Job info
      const jobDoc = await getDoc(getDemoDoc( 'jobs', task.jobId));
      if (jobDoc.exists()) setJob({ id: jobDoc.id, ...jobDoc.data() } as Job);

      // Fetch Architect info
      const archDoc = await getDoc(getDemoDoc( 'users', task.architectId));
      if (archDoc.exists()) setArchitect({ uid: archDoc.id, ...archDoc.data() } as UserProfile);
    };
    fetchContext();
  }, [task.jobId, task.architectId]);

  const updateStatus = async (newStatus: 'pending' | 'in-progress' | 'completed') => {
    try {
      const taskRef = getDemoDoc( `jobs/${task.jobId}/tasks`, task.id);
      await updateDoc(taskRef, {
        status: newStatus,
        updatedAt: new Date().toISOString()
      });
      toast.success(`Task status updated to ${newStatus.replace('-', ' ')}`);
    } catch (error) {
      console.error('Update status error:', error);
      toast.error("Failed to update task status.");
    }
  };

  return (
    <Card className="beos-record-card overflow-hidden group flex flex-col">
      <div className="p-8 flex-1 space-y-6">
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <div className="flex gap-2">
              <Badge className={`text-[10px] uppercase tracking-widest ${taskStatusStyles[task.status]}`}>
                {task.status.replace('-', ' ')}
              </Badge>
              {task.priority && (
                <Badge variant="outline" className={`text-[10px] uppercase tracking-widest ${priorityStyles[task.priority]}`}>
                  {task.priority} Priority
                </Badge>
              )}
            </div>
            <h3 className="font-heading font-bold text-2xl group-hover:text-primary transition-colors tracking-tight">
              {job?.title || 'Loading Project...'}
            </h3>
          </div>
          <div className="text-right">
             <p className="text-xs font-mono font-bold text-muted-foreground">{safeFormat(task.deadline, 'MMM d, yyyy')}</p>
             <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Deadline</p>
          </div>
        </div>

        <div className="bg-secondary/30 p-6 rounded-2xl border border-border">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-2">
            <FileText size={12} /> Task Brief
          </p>
          <p className="text-sm leading-relaxed">{task.notes}</p>
          {task.estimatedHours && (
            <p className="mt-4 text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-1">
              <Clock size={12} /> Estimated Hours: {task.estimatedHours}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-border/50">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
               <User size={20} />
             </div>
             <div>
               <p className="text-xs font-bold text-foreground leading-none">{architect?.displayName || 'Loading Architect...'}</p>
               <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mt-1">Lead Architect</p>
             </div>
          </div>
          {architect && job && (
            <Button variant="ghost" size="sm" className="rounded-full gap-2" onClick={() => setIsChatOpen(true)}>
              <MessageCircle size={16} /> Chat
            </Button>
          )}
        </div>
      </div>

      <CardFooter className="bg-secondary/20 p-6 border-t border-border grid grid-cols-3 gap-3">
        <Button
          variant={task.status === 'pending' ? 'default' : 'outline'}
          size="sm"
          className="rounded-xl h-10 font-bold uppercase text-[10px] tracking-widest"
          onClick={() => updateStatus('pending')}
          disabled={task.status === 'pending'}
        >
          Pending
        </Button>
        <Button
          variant={task.status === 'in-progress' ? 'default' : 'outline'}
          size="sm"
          className="rounded-xl h-10 font-bold uppercase text-[10px] tracking-widest"
          onClick={() => updateStatus('in-progress')}
          disabled={task.status === 'in-progress'}
        >
          In Progress
        </Button>
        <Button
          variant={task.status === 'completed' ? 'default' : 'outline'}
          size="sm"
          className="rounded-xl h-10 font-bold uppercase text-[10px] tracking-widest"
          onClick={() => updateStatus('completed')}
          disabled={task.status === 'completed'}
        >
          Complete
        </Button>
      </CardFooter>

      {isChatOpen && job && architect && (
        <Chat
          job={job}
          currentUser={user}
          otherUser={architect}
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
        />
      )}
    </Card>
  );
}
