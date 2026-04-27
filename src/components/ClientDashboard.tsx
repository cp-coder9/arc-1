import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, doc, getDoc, updateDoc, addDoc, orderBy } from 'firebase/firestore';
import { UserProfile, Job, Submission, Application, JobCategory, Review } from '../types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import {
  LayoutDashboard,
  Briefcase,
  Clock,
  CheckCircle2,
  History,
  MapPin,
  Plus,
  Search,
  Star,
  MessageCircle,
  FileText,
  AlertCircle,
  ArrowRight,
  TrendingUp,
  Award,
  User as UserIcon,
  MessageSquare
} from 'lucide-react';
import { toast } from 'sonner';
import { Users, CreditCard, Landmark, History as HistoryIcon, ShieldCheck, User, ExternalLink, UploadCloud, Loader2, Sparkles, Shield, X, Building2, ShieldX } from 'lucide-react';
import ProfileEditor from './ProfileEditor';
import RatingSystem from './RatingSystem';
import { Chat } from './Chat';
import { ArchitectPortfolio } from './ArchitectPortfolio';
import { ArchitectRecommendations } from './ArchitectRecommendations';
import { Logo } from './Logo';
import { uploadAndTrackFile } from '../lib/uploadService';
import { reviewDrawing, logSystemEvent, AIProgress } from '../services/geminiService';
import { notificationService } from '../services/notificationService';
import { SubmissionItem } from './SubmissionItem';
import { OrchestrationProgressModal } from './OrchestrationProgressModal';
import { safeLocale } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import MunicipalTracker from './MunicipalTracker';
// import { motion } from 'framer-motion';

export default function ClientDashboard({ 
  user, 
  activeTab, 
  onTabChange 
}: { 
  user: UserProfile, 
  activeTab?: string, 
  onTabChange?: (tab: string) => void 
}) {
  const [myJobs, setJobs] = useState<Job[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPosting, setIsPosting] = useState(false);
  const [newJob, setNewJob] = useState<Partial<Job>>({
    title: '',
    description: '',
    budget: 0,
    deadline: '',
    requirements: [],
    category: 'Residential'
  });

  useEffect(() => {
    const q = query(collection(db, 'jobs'), where('clientId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setJobs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job)));
      setLoading(false);
    });

    const qReviews = query(collection(db, 'reviews'), where('toId', '==', user.uid), where('status', '==', 'approved'), orderBy('createdAt', 'desc'));
    const unsubReviews = onSnapshot(qReviews, (snap) => {
      setReviews(snap.docs.map(d => ({ id: d.id, ...d.data() } as Review)));
    });

    return () => {
      unsubscribe();
      unsubReviews();
    };
  }, [user.uid]);

  const handlePostJob = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'jobs'), {
        ...newJob,
        clientId: user.uid,
        status: 'open',
        createdAt: new Date().toISOString()
      });
      setIsPosting(false);
      setNewJob({ title: '', description: '', budget: 0, deadline: '', requirements: [], category: 'Residential' });
      toast.success("Job posted successfully");
    } catch (error) {
      toast.error("Failed to post job");
    }
  };

  return (
    <div className="space-y-12">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 bg-white p-6 md:p-10 rounded-[2rem] md:rounded-[2.5rem] border border-border shadow-sm">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <h1 className="text-3xl md:text-5xl font-heading font-bold tracking-tighter text-foreground">Welcome, {user.displayName}</h1>
            <ProfileEditor user={user} />
          </div>
          <p className="text-muted-foreground text-base md:text-lg max-w-2xl leading-relaxed">Manage your projects and connect with top architectural experts.</p>
        </div>
        <Dialog open={isPosting} onOpenChange={setIsPosting}>
          <DialogTrigger render={<Button className="rounded-full h-14 px-8 font-bold text-lg shadow-lg shadow-primary/20"><Plus className="mr-2" /> Post New Job</Button>} />
          <DialogContent className="sm:max-w-[500px] rounded-3xl">
             <DialogHeader>
                <DialogTitle>Post a New Job</DialogTitle>
             </DialogHeader>
             <form onSubmit={handlePostJob} className="space-y-4">
                <Input placeholder="Job Title" value={newJob.title} onChange={e => setNewJob({...newJob, title: e.target.value})} required />
                <Textarea placeholder="Job Description" value={newJob.description} onChange={e => setNewJob({...newJob, description: e.target.value})} required />
                <Input type="number" placeholder="Budget" value={newJob.budget} onChange={e => setNewJob({...newJob, budget: Number(e.target.value)})} required />
                <Input type="date" value={newJob.deadline} onChange={e => setNewJob({...newJob, deadline: e.target.value})} required />
                <Button type="submit" className="w-full">Post Job</Button>
             </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
           <h2 className="text-2xl font-heading font-bold">Your Active Jobs</h2>
           <div className="grid grid-cols-1 gap-6">
              {myJobs.map(job => (
                <ClientJobCard key={job.id} />
              ))}
              {myJobs.length === 0 && !loading && (
                <div className="py-20 text-center border-2 border-dashed border-border rounded-3xl bg-white/50">
                  <p className="text-muted-foreground italic">You haven't posted any jobs yet.</p>
                </div>
              )}
           </div>
        </div>
        <div className="space-y-8">
           <Card className="border-border shadow-sm bg-white rounded-3xl overflow-hidden">
              <CardHeader className="bg-primary/5 p-6 border-b border-border">
                <CardTitle className="text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                  <Star size={16} className="text-yellow-500" /> Professional Feedback
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
                {reviews.length === 0 && <p className="text-xs text-center text-muted-foreground py-10 italic">No reviews yet.</p>}
              </CardContent>
           </Card>
        </div>
      </div>
    </div>
  );
}

function ClientJobCard({ job, user }: { job: Job, user: UserProfile }) {
  const [architect, setArchitect] = useState<UserProfile | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);

  useEffect(() => {
    if (job.selectedArchitectId) {
      const fetchArchitect = async () => {
        const archDoc = await getDoc(doc(db, 'users', job.selectedArchitectId!));
        if (archDoc.exists()) setArchitect({ uid: archDoc.id, ...archDoc.data() } as UserProfile);
      };
      fetchArchitect();
    }
  }, [job.selectedArchitectId]);

  return (
    <Card className="border-border shadow-sm bg-white overflow-hidden rounded-3xl hover:border-primary/30 transition-all group">
      <div className="p-8 space-y-6">
        <div className="flex justify-between items-start">
          <Badge variant="secondary" className="bg-primary/5 text-primary border-primary/10 uppercase text-[10px] tracking-widest font-bold">
            {job.category}
          </Badge>
          <Badge className={`text-[10px] uppercase tracking-widest ${
            job.status === 'completed' ? 'bg-green-100 text-green-700' :
            job.status === 'in-progress' ? 'bg-blue-100 text-blue-700' :
            'bg-yellow-100 text-yellow-700'
          }`}>
            {job.status.replace('-', ' ')}
          </Badge>
        </div>
        <h3 className="font-heading font-bold text-2xl group-hover:text-primary transition-colors tracking-tight">{job.title}</h3>
        {architect && (
          <div className="flex items-center justify-between pt-6 border-t border-border/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">{architect.displayName[0]}</div>
              <div>
                <p className="text-sm font-bold text-foreground">{architect.displayName}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Assigned Architect</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="rounded-full gap-2" onClick={() => setIsChatOpen(true)}>
                <MessageCircle size={16} /> Chat
              </Button>
              {job.status === 'completed' && (
                <Dialog>
                  <DialogTrigger render={<Button size="sm" variant="outline" className="rounded-full gap-2"><Star size={16} /> Rate</Button>} />
                  <DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-3xl border-none">
                    <RatingSystem fromId={user.uid} toId={architect.uid} toName={architect.displayName} jobId={job.id} type="client_to_architect" />
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>
        )}
      </div>
      {isChatOpen && architect && (
        <Chat job={job} currentUser={user} otherUser={architect} isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
      )}
    </Card>
  );
}
