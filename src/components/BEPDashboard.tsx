import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, doc, getDoc, updateDoc, collectionGroup, addDoc, orderBy } from 'firebase/firestore';
import { UserProfile, Job, JobCard, UserRole, Review } from '../types';
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
  Target
} from 'lucide-react';
import { toast } from 'sonner';
import ProfileEditor from './ProfileEditor';
import { safeFormat } from '../lib/utils';
import { Chat } from './Chat';

export default function BEPDashboard({ user }: { user: UserProfile }) {
  const [assignedTasks, setAssignedTasks] = useState<JobCard[]>([]);
  const [availableJobs, setAvailableJobs] = useState<Job[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<'overview' | 'marketplace'>('overview');

  useEffect(() => {
    const qTasks = query(collectionGroup(db, 'tasks'), where('assigneeId', '==', user.uid));
    const unsubscribeTasks = onSnapshot(qTasks, (snapshot) => {
      setAssignedTasks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as JobCard)));
    });

    const qJobs = query(collection(db, 'jobs'), where('status', '==', 'open'));
    const unsubscribeJobs = onSnapshot(qJobs, (snapshot) => {
      setAvailableJobs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job)));
      setLoading(false);
    });

    const qReviews = query(
      collection(db, 'reviews'),
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

    if (job.category.toLowerCase().includes(trade)) score += 50;
    if (job.description.toLowerCase().includes(trade)) score += 30;
    if (job.location?.toLowerCase().includes(region)) score += 20;

    return { ...job, matchScore: score };
  }).filter(j => j.matchScore > 0).sort((a, b) => b.matchScore - a.matchScore);

  return (
    <div className="space-y-12">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 bg-white p-6 md:p-10 rounded-[2rem] md:rounded-[2.5rem] border border-border shadow-sm">
        <div className="flex-1">
          <div className="flex items-center gap-4 mb-2">
            <h1 className="text-3xl md:text-5xl font-heading font-bold tracking-tighter text-foreground">
              Professional Portal
            </h1>
            <ProfileEditor user={user} />
          </div>
          <div className="flex flex-wrap gap-3 mt-4">
            <Badge variant="outline" className="rounded-full px-4 py-1.5 bg-primary/5 text-primary border-primary/10 font-bold uppercase tracking-widest text-[10px]">
              {user.professionalLabel || 'BEP'}
            </Badge>
            {user.nhbrcNumber && (
              <Badge variant="outline" className="rounded-full px-4 py-1.5 bg-green-50 text-green-700 border-green-200 font-bold uppercase tracking-widest text-[10px] flex items-center gap-1">
                <ShieldCheck size={12} /> NHBRC: {user.nhbrcNumber}
              </Badge>
            )}
            {user.cidbGrading && (
              <Badge variant="outline" className="rounded-full px-4 py-1.5 bg-blue-50 text-blue-700 border-blue-200 font-bold uppercase tracking-widest text-[10px] flex items-center gap-1">
                <BadgeCheck size={12} /> CIDB: {user.cidbGrading}
              </Badge>
            )}
            {user.region && (
              <Badge variant="outline" className="rounded-full px-4 py-1.5 bg-secondary/50 text-muted-foreground border-border font-bold uppercase tracking-widest text-[10px] flex items-center gap-1">
                <MapPin size={12} /> {user.region}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant={activeView === 'overview' ? 'default' : 'outline'}
            className="rounded-full px-6 h-12 font-bold shadow-sm"
            onClick={() => setActiveView('overview')}
          >
            Overview
          </Button>
          <Button
            variant={activeView === 'marketplace' ? 'default' : 'outline'}
            className="rounded-full px-6 h-12 font-bold shadow-sm"
            onClick={() => setActiveView('marketplace')}
          >
            Marketplace
          </Button>
        </div>
      </div>

      {activeView === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <StatCard label="My Tasks" value={stats.totalTasks} icon={<LayoutDashboard size={20} />} />
              <StatCard label="In Progress" value={stats.inProgress} icon={<History size={20} />} color="text-blue-600" />
              <StatCard label="Rating" value={`${Number(stats.rating).toFixed(1)}/5`} icon={<Star size={20} />} color="text-yellow-500" />
            </div>

            {recommendedJobs.length > 0 && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-heading font-bold tracking-tight flex items-center gap-2">
                    <Zap className="text-yellow-500 fill-yellow-500" size={24} /> Recommended Projects
                  </h2>
                  <Button variant="ghost" size="sm" className="text-primary font-bold" onClick={() => setActiveView('marketplace')}>
                    View All <ArrowRight size={16} className="ml-1" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {recommendedJobs.slice(0, 2).map(job => (
                    <Card key={job.id} {...({job, user} as any)} className="border-primary/20 bg-primary/5 rounded-[2rem] overflow-hidden hover:border-primary transition-all group relative">
                      <div className="absolute top-4 right-4">
                        <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 uppercase text-[8px] font-black tracking-tighter">
                          {job.matchScore}% Match
                        </Badge>
                      </div>
                      <CardHeader className="p-8 pb-4">
                        <Badge variant="secondary" className="w-fit mb-3 bg-white text-primary uppercase text-[10px] tracking-widest">{job.category}</Badge>
                        <CardTitle className="font-heading font-bold text-xl group-hover:text-primary transition-colors">{job.title}</CardTitle>
                      </CardHeader>
                      <CardContent className="p-8 pt-0">
                        <p className="text-xs text-muted-foreground line-clamp-2 mb-6">{job.description}</p>
                        <div className="flex justify-between items-center pt-4 border-t border-primary/10">
                          <span className="text-sm font-bold text-primary font-mono">R {job.budget.toLocaleString()}</span>
                          <Button size="sm" className="rounded-full px-6 font-bold uppercase text-[10px] tracking-widest">Apply Now</Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-6">
              <h2 className="text-2xl font-heading font-bold tracking-tight flex items-center gap-2">
                <Clock className="text-primary" /> Active Job Cards
              </h2>
              <div className="grid grid-cols-1 gap-6">
                {assignedTasks.map(task => (
                  <BEPJobCard key={task.id} {...({task, user} as any)} task={task} user={user} />
                ))}
                {assignedTasks.length === 0 && !loading && (
                  <div className="py-20 text-center border-2 border-dashed border-border rounded-3xl bg-white/50">
                    <p className="text-muted-foreground italic">No tasks currently assigned to you.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-8">
            <Card className="border-border shadow-sm bg-white rounded-3xl overflow-hidden">
              <CardHeader className="bg-primary/5 p-6 border-b border-border flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                  <Star size={16} className="text-yellow-500" /> Feedback
                </CardTitle>
                <Badge variant="outline" className="text-[10px]">{reviews.length}</Badge>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                {reviews.map(review => (
                  <div key={review.id} className="space-y-2 pb-4 border-b border-border last:border-0 last:pb-0">
                    <div className="flex justify-between items-center">
                      <div className="flex text-yellow-400">
                        {[...Array(5)].map((_, i) => (
                          <Star key={i} size={10} fill={i < review.rating ? "currentColor" : "none"} />
                        ))}
                      </div>
                      <span className="text-[8px] uppercase font-bold text-muted-foreground">{new Date(review.createdAt).toLocaleDateString()}</span>
                    </div>
                    <p className="text-xs text-foreground italic leading-relaxed">"{review.comment}"</p>
                  </div>
                ))}
                {reviews.length === 0 && (
                  <p className="text-xs text-center text-muted-foreground py-10 italic">No approved reviews yet.</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-border shadow-sm bg-primary text-primary-foreground rounded-3xl overflow-hidden p-8">
               <div className="flex items-center gap-4 mb-4">
                 <div className="p-3 bg-white/20 rounded-2xl">
                   <Target size={24} />
                 </div>
                 <h3 className="text-xl font-heading font-bold">Profile Visibility</h3>
               </div>
               <p className="text-sm text-primary-foreground/80 leading-relaxed mb-6">
                 Your profile is visible to architects looking for <strong>{user.professionalLabel || 'skilled professionals'}</strong> in <strong>{user.region || 'South Africa'}</strong>.
               </p>
               <ProfileEditor user={user} trigger={<Button className="w-full bg-white text-primary hover:bg-white/90 rounded-2xl font-bold">Update Profile</Button>} />
            </Card>
          </div>
        </div>
      )}

      {activeView === 'marketplace' && (
        <div className="space-y-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-heading font-bold tracking-tight">Marketplace</h2>
              <p className="text-muted-foreground">Find projects that match your trade and region.</p>
            </div>
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search trades or locations..."
                className="w-full h-12 pl-10 pr-4 rounded-xl border border-border bg-white text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {availableJobs.map(job => (
              <MarketplaceJobCard key={job.id} {...({job, user} as any)} job={job} user={user} />
            ))}
          </div>
        </div>
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
      const jobDoc = await getDoc(doc(db, 'jobs', task.jobId));
      if (jobDoc.exists()) setJob({ id: jobDoc.id, ...jobDoc.data() } as Job);

      const archDoc = await getDoc(doc(db, 'users', task.architectId));
      if (archDoc.exists()) setArchitect({ uid: archDoc.id, ...archDoc.data() } as UserProfile);
    };
    fetchContext();
  }, [task.jobId, task.architectId]);

  const updateStatus = async (newStatus: 'pending' | 'in-progress' | 'completed') => {
    try {
      const taskRef = doc(db, `jobs/${task.jobId}/tasks`, task.id);
      await updateDoc(taskRef, { status: newStatus, updatedAt: new Date().toISOString() });
      toast.success(`Status updated to ${newStatus}`);
    } catch (error) {
      toast.error("Failed to update status.");
    }
  };

  return (
    <Card className="border-border shadow-sm bg-white overflow-hidden group hover:border-primary/30 transition-all flex flex-col rounded-3xl hover:shadow-xl">
      <div className="p-8 flex-1 space-y-6">
        <div className="flex justify-between items-start">
          <Badge className={`text-[10px] uppercase tracking-widest ${
            task.status === 'completed' ? 'bg-green-100 text-green-700' :
            task.status === 'in-progress' ? 'bg-blue-100 text-blue-700' :
            'bg-yellow-100 text-yellow-700'
          }`}>
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
      await addDoc(collection(db, `jobs/${job.id}/applications`), {
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
    <Card className="border-border shadow-sm bg-white hover:border-primary/50 transition-all rounded-[2.5rem] overflow-hidden flex flex-col group shadow-sm hover:shadow-2xl">
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

function StatCard({ label, value, icon, color = "text-primary" }: { label: string, value: string | number, icon: React.ReactNode, color?: string }) {
  return (
    <Card className="border-border shadow-sm bg-white rounded-[2rem] overflow-hidden">
      <CardContent className="p-8 flex items-center gap-6">
        <div className={`p-4 rounded-2xl bg-secondary/50 ${color}`}>
          {icon}
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
          <p className="text-3xl font-heading font-bold tracking-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
