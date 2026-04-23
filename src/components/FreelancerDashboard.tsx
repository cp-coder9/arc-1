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

export default function FreelancerDashboard({ user }: { user: UserProfile }) {
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
    <div className="space-y-12">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 bg-white p-6 md:p-10 rounded-[2rem] md:rounded-[2.5rem] border border-border shadow-sm">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <h1 className="text-3xl md:text-5xl font-heading font-bold tracking-tighter text-foreground">Freelancer Portal</h1>
            <ProfileEditor user={user} />
          </div>
          <p className="text-muted-foreground text-base md:text-lg max-w-2xl leading-relaxed">Collaborate with architects on high-end architectural projects.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard label="Assigned Tasks" value={stats.total} icon={<LayoutDashboard size={20} />} />
        <StatCard label="Pending" value={stats.pending} icon={<Clock size={20} />} color="text-yellow-600" />
        <StatCard label="In Progress" value={stats.inProgress} icon={<History size={20} />} color="text-blue-600" />
        <StatCard label="Completed" value={stats.completed} icon={<CheckCircle2 size={20} />} color="text-green-600" />
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-heading font-bold tracking-tight">Active Job Cards</h2>
          <Badge variant="outline" className="rounded-full px-4">{assignedTasks.length} Assigned</Badge>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {assignedTasks.map(task => (
            <FreelancerJobCard key={task.id} task={task} user={user} />
          ))}
          {assignedTasks.length === 0 && !loading && (
            <div className="col-span-full py-20 text-center border-2 border-dashed border-border rounded-[2rem] bg-white/50">
              <div className="w-20 h-20 bg-secondary rounded-full flex items-center justify-center mx-auto mb-6">
                <Briefcase className="w-10 h-10 text-muted-foreground" />
              </div>
              <h3 className="text-2xl font-heading font-bold mb-2">No assigned tasks yet</h3>
              <p className="text-muted-foreground max-w-sm mx-auto">
                Once an architect assigns you to a project, your job cards will appear here.
              </p>
            </div>
          )}
        </div>
      </div>
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
      const jobDoc = await getDoc(doc(db, 'jobs', task.jobId));
      if (jobDoc.exists()) setJob({ id: jobDoc.id, ...jobDoc.data() } as Job);

      // Fetch Architect info
      const archDoc = await getDoc(doc(db, 'users', task.architectId));
      if (archDoc.exists()) setArchitect({ uid: archDoc.id, ...archDoc.data() } as UserProfile);
    };
    fetchContext();
  }, [task.jobId, task.architectId]);

  const updateStatus = async (newStatus: 'pending' | 'in-progress' | 'completed') => {
    try {
      const taskRef = doc(db, `jobs/${task.jobId}/tasks`, task.id);
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
    <Card className="border-border shadow-sm bg-white overflow-hidden group hover:border-primary/30 transition-all flex flex-col rounded-3xl hover:shadow-xl">
      <div className="p-8 flex-1 space-y-6">
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <div className="flex gap-2">
              <Badge className={`text-[10px] uppercase tracking-widest ${
                task.status === 'completed' ? 'bg-green-100 text-green-700' :
                task.status === 'in-progress' ? 'bg-blue-100 text-blue-700' :
                'bg-yellow-100 text-yellow-700'
              }`}>
                {task.status.replace('-', ' ')}
              </Badge>
              {task.priority && (
                <Badge variant="outline" className={`text-[10px] uppercase tracking-widest ${
                  task.priority === 'high' ? 'border-red-200 text-red-700' :
                  task.priority === 'medium' ? 'border-yellow-200 text-yellow-700' :
                  'border-blue-200 text-blue-700'
                }`}>
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

function StatCard({ label, value, icon, color = "text-primary" }: { label: string, value: string | number, icon: React.ReactNode, color?: string }) {
  return (
    <Card className="border-border shadow-sm bg-white rounded-3xl overflow-hidden group">
      <CardContent className="p-6 flex items-center gap-4">
        <div className={`p-3 rounded-2xl bg-secondary/50 ${color}`}>
          {icon}
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
          <p className="text-2xl font-heading font-bold tracking-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
