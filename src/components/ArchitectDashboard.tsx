import React, { useState, useEffect, useRef } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, doc, updateDoc, getDocs, getDoc, collectionGroup, orderBy } from 'firebase/firestore';
import { uploadAndTrackFile } from '../lib/uploadService';
import { UserProfile, Job, Application, Submission, DelegatedTask, AIReviewResult, ArchitectProfile, JobCard, Review } from '../types';
import ProfileEditor from './ProfileEditor';
import RatingSystem from './RatingSystem';
import { Chat, ChatButton } from './Chat';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { toast } from 'sonner';
import { Search, Briefcase, FileUp, CheckCircle2, Clock, AlertCircle, ExternalLink, CreditCard, Landmark, Building, UploadCloud, ShieldCheck, History, Star, Send, Loader2, Sparkles, User, Cpu, Shield, ArrowRight, Users, Plus, Eye, MessageCircle, UserCircle, LayoutList, MoreHorizontal, MapPin, Upload } from 'lucide-react';
import { reviewDrawing, logSystemEvent, AIProgress } from '../services/geminiService';
import { SubmissionItem } from './SubmissionItem';
import { OrchestrationProgressModal } from './OrchestrationProgressModal';
import { notificationService } from '../services/notificationService';
import ReactMarkdown from 'react-markdown';
import { safeLocale } from '@/lib/utils';
import { SearchFilter, SearchFilters } from './SearchFilter';
import { formatDistanceToNow, differenceInDays, parseISO } from 'date-fns';
import { ScrollArea } from './ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
// import { motion } from 'framer-motion';
import MunicipalTracker from './MunicipalTracker';

export default function ArchitectDashboard({ 
  user, 
  activeTab, 
  onTabChange 
}: { 
  user: UserProfile, 
  activeTab?: string, 
  onTabChange?: (tab: string) => void 
}) {
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

  useEffect(() => {
    const qJobs = query(collection(db, 'jobs'), where('status', '==', 'open'));
    const unsubJobs = onSnapshot(qJobs, (snap) => {
      setAvailableJobs(snap.docs.map(d => ({ id: d.id, ...d.data() } as Job)));
      setLoading(false);
    });

    const qMyJobs = query(collection(db, 'jobs'), where('selectedArchitectId', '==', user.uid));
    const unsubMyJobs = onSnapshot(qMyJobs, (snap) => {
      setMyJobs(snap.docs.map(d => ({ id: d.id, ...d.data() } as Job)));
    });

    const qApps = query(collectionGroup(db, 'applications'), where('architectId', '==', user.uid));
    const unsubApps = onSnapshot(qApps, (snap) => {
      setMyApplications(snap.docs.map(d => ({ id: d.id, ...d.data() } as Application)));
    });

    const qReviews = query(collection(db, 'reviews'), where('toId', '==', user.uid), where('status', '==', 'approved'), orderBy('createdAt', 'desc'));
    const unsubReviews = onSnapshot(qReviews, (snap) => {
      setReviews(snap.docs.map(d => ({ id: d.id, ...d.data() } as Review)));
    });

    return () => {
      unsubJobs();
      unsubMyJobs();
      unsubApps();
      unsubReviews();
    };
  }, [user.uid]);

  return (
    <div className="space-y-12">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 bg-white p-6 md:p-10 rounded-[2rem] md:rounded-[2.5rem] border border-border shadow-sm">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <h1 className="text-3xl md:text-5xl font-heading font-bold tracking-tighter text-foreground">Architect Portal</h1>
            <ProfileEditor user={user} />
          </div>
          <p className="text-muted-foreground text-base md:text-lg max-w-2xl leading-relaxed">Elite architectural workspace with SANS-powered compliance verification.</p>
        </div>
        <div className="flex flex-wrap gap-2">
           <StatPill icon={<Star size={14} className="text-yellow-500" />} label="Rating" value={`${Number(user.averageRating || 5.0).toFixed(1)}/5`} />
           <StatPill icon={<CheckCircle2 size={14} className="text-green-500" />} label="Jobs" value={user.completedJobs || 0} />
        </div>
        <div className="flex gap-4">
          <Button
            onClick={() => onTabChange?.('files')}
            variant="outline"
            className="rounded-full h-14 px-8 font-bold border-primary/20 hover:bg-primary/5"
          >
            <Upload className="mr-2 w-5 h-5" /> Quick Scan
          </Button>
          <Button
            onClick={() => onTabChange?.('marketplace')}
            className="rounded-full h-14 px-8 font-bold shadow-xl shadow-primary/20"
          >
            <Search className="mr-2 w-5 h-5" /> Browse Jobs
          </Button>
        </div>
      </div>

      <Tabs value={activeTab || 'overview'} onValueChange={onTabChange} className="w-full">
        <ScrollArea className="w-full whitespace-nowrap mb-8" orientation="horizontal">
          <TabsList className="bg-secondary/50 border border-border p-1 rounded-full w-fit inline-flex mb-1">
            <TabsTrigger value="overview" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full px-6 md:px-8 gap-2 font-bold text-xs uppercase tracking-widest">
              <LayoutList size={16} /> Overview
            </TabsTrigger>
            <TabsTrigger value="marketplace" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full px-6 md:px-8 gap-2 font-bold text-xs uppercase tracking-widest">
              <Briefcase size={16} /> Marketplace
            </TabsTrigger>
            <TabsTrigger value="team" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full px-6 md:px-8 gap-2 font-bold text-xs uppercase tracking-widest">
              <Users size={16} /> Team & Match
            </TabsTrigger>
          </TabsList>
        </ScrollArea>

        <TabsContent value="overview">
           <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
             <div className="lg:col-span-2 space-y-8">
                <h2 className="text-2xl font-heading font-bold flex items-center gap-2"><Briefcase className="text-primary" /> Active Projects</h2>
                <div className="grid grid-cols-1 gap-6">
                  {myJobs.map(job => (
                    <ActiveProjectCard key={job.id} {...({job, user} as any)} job={job} user={user} />
                  ))}
                  {myJobs.length === 0 && (
                    <div className="py-20 text-center border-2 border-dashed border-border rounded-[2rem] bg-white/50">
                      <p className="text-muted-foreground italic">No active projects yet. Browse the marketplace to apply!</p>
                    </div>
                  )}
                </div>
             </div>
             <div className="space-y-8">
                <Card className="border-border shadow-sm bg-white rounded-3xl overflow-hidden">
                  <CardHeader className="bg-primary/5 p-6 border-b border-border">
                    <CardTitle className="text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                      <Star size={16} className="text-yellow-500" /> Client Reviews
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 space-y-4">
                    {reviews.map(review => (
                      <div key={review.id} className="pb-4 border-b border-border last:border-0 last:pb-0">
                        <div className="flex justify-between items-center mb-1">
                           <div className="flex text-yellow-400">
                             {[...Array(5)].map((_, i) => <Star key={i} size={10} fill={i < review.rating ? "currentColor" : "none"} />)}
                           </div>
                           <span className="text-[10px] text-muted-foreground">{new Date(review.createdAt).toLocaleDateString()}</span>
                        </div>
                        <p className="text-xs italic text-foreground leading-relaxed">"{review.comment}"</p>
                      </div>
                    ))}
                    {reviews.length === 0 && <p className="text-xs text-center text-muted-foreground py-10">No reviews yet.</p>}
                  </CardContent>
                </Card>
             </div>
           </div>
        </TabsContent>

        <TabsContent value="marketplace">
           <div className="space-y-8">
              <SearchFilter filters={filters} onFiltersChange={setFilters} totalResults={availableJobs.length} />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {availableJobs.map(job => (
                  <JobCardUI key={job.id} {...({job, user} as any)} job={job} user={user} />
                ))}
              </div>
           </div>
        </TabsContent>

        <TabsContent value="active" className="mt-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {myJobs.map(job => (
              <ActiveProjectCard key={job.id} job={job} user={user} />
            ))}
            {myJobs.length === 0 && (
              <div className="col-span-full py-20 text-center border-2 border-dashed border-border rounded-3xl bg-white/50">
                <p className="text-muted-foreground italic">You don't have any active projects yet. Apply for jobs to get started.</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="team" className="mt-8">
          <TeamManager user={user} myJobs={myJobs} />
        </TabsContent>

        <TabsContent value="municipal" className="mt-8">
          <MunicipalTracker architect={user} jobs={myJobs} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ActiveProjectCard({ job, user }: { job: Job, user: UserProfile }) {
  return (
    <Card className="border-border shadow-sm bg-white overflow-hidden rounded-3xl hover:border-primary/30 transition-all group">
      <div className="p-8 space-y-6">
        <div className="flex justify-between items-start">
           <Badge variant="secondary" className="bg-primary/5 text-primary border-primary/10 uppercase text-[10px] tracking-widest font-bold">
             {job.category}
           </Badge>
           <Badge variant="outline" className="rounded-full px-3 uppercase text-[10px] font-bold tracking-widest">In Progress</Badge>
        </div>
        <h3 className="font-heading font-bold text-2xl group-hover:text-primary transition-colors tracking-tight">{job.title}</h3>
        <DelegatedTasksList job={job} user={user} />
      </div>
    </Card>
  );
}

function DelegatedTasksList({ job, user }: { job: Job, user: UserProfile }) {
  const [tasks, setTasks] = useState<(DelegatedTask | JobCard)[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [assigneeName, setAssigneeName] = useState('');
  const [assigneeRole, setAssigneeRole] = useState('');
  const [deadline, setDeadline] = useState('');
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [estimatedHours, setEstimatedHours] = useState<string>('');
  const [requirements, setRequirements] = useState('');

  useEffect(() => {
    const q = query(collection(db, `jobs/${job.id}/tasks`), where('architectId', '==', user.uid));
    const unsub = onSnapshot(q, (snapshot) => {
      setTasks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as JobCard)));
    });
    return () => unsub();
  }, [job.id, user.uid]);

  const handleUpdateStatus = async (taskId: string, newStatus: string) => {
    try {
      await updateDoc(doc(db, `jobs/${job.id}/tasks`, taskId), {
        status: newStatus,
        completedAt: newStatus === 'completed' ? new Date().toISOString() : null
      });
      toast.success("Status updated");
    } catch (error) {
      toast.error("Failed to update status");
    }
  };

  return (
    <div className="space-y-4 mt-6">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
        <Users size={12} /> Team Deliverables
      </p>
      <div className="grid grid-cols-1 gap-3">
        {tasks.map(task => (
          <div key={task.id} className="p-4 rounded-2xl bg-secondary/20 border border-border flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <div>
                 <p className="text-sm font-bold">{task.assigneeName} <span className="text-[10px] text-muted-foreground font-normal">({task.assigneeRole})</span></p>
                 <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1"><Clock size={12} /> Due: {new Date(task.deadline).toLocaleDateString()}</p>
              </div>
              <div className="flex items-center gap-2">
                <select 
                  value={task.status}
                  onChange={(e) => handleUpdateStatus(task.id, e.target.value)}
                  className="text-[10px] uppercase font-bold tracking-widest px-3 py-1 rounded-full border bg-white outline-none"
                >
                  <option value="pending">Pending</option>
                  <option value="in-progress">In Progress</option>
                  <option value="completed">Completed</option>
                </select>
                {task.status === 'completed' && task.assigneeId && (
                  <Dialog>
                    <DialogTrigger render={<Button size="sm" variant="outline" className="h-7 px-2 rounded-lg text-[8px] uppercase font-black tracking-tighter gap-1"><Star size={10} /> Rate</Button>} />
                    <DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-3xl border-none">
                      <RatingSystem fromId={user.uid} toId={task.assigneeId} toName={task.assigneeName} jobId={job.id} />
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-1 italic">"{task.notes}"</p>
          </div>
        ))}
        {tasks.length === 0 && <p className="text-[10px] text-muted-foreground italic">No job cards assigned yet.</p>}
      </div>
    </div>
  );
}

function TeamManager({ user, myJobs }: { user: UserProfile, myJobs: Job[] }) {
  const [pros, setPros] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'users'), where('role', 'in', ['freelancer', 'bep']));
    const unsub = onSnapshot(q, (snapshot) => {
      setPros(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile)));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
       <div className="lg:col-span-2 space-y-6">
          <h2 className="text-2xl font-heading font-bold">Team Assignment</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {myJobs.map(job => (
              <Card key={job.id} {...({job, user} as any)} className="border-border shadow-sm bg-white rounded-3xl p-6">
                <Badge variant="secondary" className="mb-2 uppercase text-[10px] tracking-widest">{job.category}</Badge>
                <h3 className="font-bold text-lg mb-4">{job.title}</h3>
                <Button className="w-full rounded-xl gap-2 font-bold" variant="outline">
                   <Plus size={16} /> Manage Team
                </Button>
              </Card>
            ))}
          </div>
       </div>
       <div className="space-y-6">
          <Card className="border-border shadow-sm bg-white rounded-3xl overflow-hidden">
            <CardHeader className="bg-primary/5 p-6 border-b border-border">
              <CardTitle className="text-sm font-bold uppercase tracking-widest">Available Professionals</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="space-y-4">
                {pros.map(pro => (
                  <div key={pro.uid} className="flex items-center justify-between p-3 rounded-2xl border border-border hover:bg-secondary/10 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">{pro.displayName[0]}</div>
                      <div>
                        <p className="text-xs font-bold">{pro.displayName}</p>
                        <p className="text-[10px] text-muted-foreground uppercase font-medium">{pro.role}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-yellow-500 font-bold text-xs">
                      <Star size={12} fill="currentColor" /> {Number(pro.averageRating || 5.0).toFixed(1)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
       </div>
    </div>
  );
}

function StatPill({ icon, label, value }: { icon: React.ReactNode, label: string, value: string | number }) {
  return (
    <div className="bg-secondary/50 border border-border px-4 py-2 rounded-full flex items-center gap-2">
      {icon}
      <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">{label}:</span>
      <span className="text-xs font-bold">{value}</span>
    </div>
  );
}

function JobCardUI({ job, user }: { job: Job, user: UserProfile }) {
  return (
    <Card className="border-border shadow-sm bg-white rounded-3xl p-8 hover:border-primary/50 transition-all flex flex-col group">
       <div className="flex justify-between items-start mb-4">
          <Badge className="bg-primary/5 text-primary border-primary/10 uppercase text-[10px] tracking-widest">{job.category}</Badge>
          <span className="text-sm font-bold text-primary font-mono">R {job.budget.toLocaleString()}</span>
       </div>
       <h3 className="font-heading font-bold text-xl mb-3 group-hover:text-primary transition-colors">{job.title}</h3>
       <p className="text-xs text-muted-foreground line-clamp-3 mb-6 leading-relaxed">{job.description}</p>
       <div className="mt-auto flex items-center justify-between pt-4 border-t border-border/50">
          <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1"><MapPin size={12} /> {job.location || 'RSA'}</span>
          <Button size="sm" className="rounded-full px-6 font-bold uppercase text-[10px] tracking-widest">Apply</Button>
       </div>
    </Card>
  );
}
