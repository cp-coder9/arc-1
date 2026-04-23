import React, { useState, useEffect, useRef } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, doc, updateDoc, getDocs, getDoc, collectionGroup } from 'firebase/firestore';
import { uploadAndTrackFile } from '../lib/uploadService';
import { UserProfile, Job, Application, Submission, DelegatedTask, AIReviewResult, JobCard, MunicipalCredential } from '../types';
import ProfileEditor from './ProfileEditor';
import { Chat, ChatButton } from './Chat';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { toast } from 'sonner';
import { Search, Briefcase, FileUp, CheckCircle2, Clock, AlertCircle, ExternalLink, CreditCard, Landmark, Building, UploadCloud, ShieldCheck, History, Star, Send, Loader2, Sparkles, User, Cpu, Shield, ArrowRight, Users, Plus, Eye, MessageCircle, RefreshCcw } from 'lucide-react';
import { reviewDrawing, logSystemEvent, AIProgress } from '../services/geminiService';
import { SubmissionItem } from './SubmissionItem';
import { OrchestrationProgressModal } from './OrchestrationProgressModal';
import { notificationService } from '../services/notificationService';
import ReactMarkdown from 'react-markdown';
import { format } from 'date-fns';
import { SearchFilter, SearchFilters } from './SearchFilter';
import { formatDistanceToNow, differenceInDays, parseISO } from 'date-fns';
import { ScrollArea } from './ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import MunicipalTracker from './MunicipalTracker';
// import { motion } from 'framer-motion';

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

  // Map sidebar tabs to internal dashboard tabs
  const internalTab = 
    activeTab === 'marketplace' ? 'browse' : 
    activeTab === 'applications' ? 'applications' :
    activeTab === 'projects' ? 'active' : 
    activeTab === 'team' ? 'team' :
    activeTab === 'municipal' ? 'municipal' :
    'browse';

  useEffect(() => {
    // Available jobs
    const qAll = query(collection(db, 'jobs'), where('status', '==', 'open'));
    const unsubAll = onSnapshot(qAll, (snapshot) => {
      setAvailableJobs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'jobs');
    });

    // My jobs (where I'm hired)
    const qMy = query(collection(db, 'jobs'), where('selectedArchitectId', '==', user.uid));
    const unsubMy = onSnapshot(qMy, (snapshot) => {
      setMyJobs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'jobs (my)');
    });

    // My applications
    const qApps = query(collectionGroup(db, 'applications'), where('architectId', '==', user.uid));
    const unsubApps = onSnapshot(qApps, (snapshot) => {
      setMyApplications(snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) } as Application)));
    }, (error) => {
      console.warn('[ArchitectDashboard] Applications listener:', error);
    });

    return () => {
      unsubAll();
      unsubMy();
      unsubApps();
    };
  }, [user.uid]);

  const filteredJobs = availableJobs
    .filter(job => {
      const matchesSearch = !filters.query || 
        job.title.toLowerCase().includes(filters.query.toLowerCase()) || 
        job.description.toLowerCase().includes(filters.query.toLowerCase());
      
      const matchesCategory = !filters.category || job.category === filters.category;
      
      const matchesBudget = job.budget >= filters.minBudget && job.budget <= filters.maxBudget;
      
      // matchesLocation could be added if job has location field
      
      let matchesDeadline = true;
      if (filters.deadlineWithin > 0) {
        const daysToDeadline = differenceInDays(parseISO(job.deadline), new Date());
        matchesDeadline = daysToDeadline >= 0 && daysToDeadline <= filters.deadlineWithin;
      }

      let matchesPosted = true;
      if (filters.postedWithin > 0) {
        const daysSincePosted = differenceInDays(new Date(), parseISO(job.createdAt));
        matchesPosted = daysSincePosted <= filters.postedWithin;
      }

      return matchesSearch && matchesCategory && matchesBudget && matchesDeadline && matchesPosted;
    })
    .sort((a, b) => {
      if (filters.sortBy === 'budget_desc') return b.budget - a.budget;
      if (filters.sortBy === 'budget_asc') return a.budget - b.budget;
      if (filters.sortBy === 'deadline') return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); // default: posted (newest)
    });


  return (
    <div className="space-y-12">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 bg-white p-6 md:p-10 rounded-[2rem] md:rounded-[2.5rem] border border-border shadow-sm">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <h1 className="text-3xl md:text-5xl font-heading font-bold tracking-tighter text-foreground">Architect Studio</h1>
            <ProfileEditor user={user} />
          </div>
          <p className="text-muted-foreground text-base md:text-lg max-w-2xl leading-relaxed">Find new opportunities and submit your SANS compliant drawings on Architex.</p>
        </div>
      </div>

      <Tabs 
        value={internalTab} 
        onValueChange={(val) => {
          const tabMap: Record<string, string> = {
            'browse': 'marketplace',
            'applications': 'applications',
            'active': 'projects'
          };
          onTabChange?.(tabMap[val] || 'marketplace');
        }} 
        className="w-full"
      >
        <div className="border-b border-border bg-white h-14 md:h-16 w-full flex items-center px-4 md:px-0 bg-transparent rounded-full overflow-hidden mb-8">
          <TabsList className="bg-secondary/50 border border-border p-1 rounded-full w-fit overflow-x-auto">
            <TabsTrigger value="browse" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full px-6 md:px-8 text-xs font-bold">Browse Jobs</TabsTrigger>
            <TabsTrigger value="applications" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full px-6 md:px-8 text-xs font-bold">My Applications ({myApplications.length})</TabsTrigger>
            <TabsTrigger value="active" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full px-6 md:px-8 text-xs font-bold">Active Projects ({myJobs.length})</TabsTrigger>
            <TabsTrigger value="team" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full px-6 md:px-8 text-xs font-bold">Team & Freelancers</TabsTrigger>
            <TabsTrigger value="municipal" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full px-6 md:px-8 text-xs font-bold">Municipal Tracker</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="browse" className="mt-8 space-y-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-3xl font-heading font-bold tracking-tight">Find Your Next Project</h2>
              <p className="text-muted-foreground">{filteredJobs.length} open jobs matching your criteria</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="px-4 py-2 bg-primary/5 rounded-2xl border border-primary/10">
                <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Total Open Jobs</p>
                <p className="text-xl font-bold text-primary">{availableJobs.length}</p>
              </div>
            </div>
          </div>

          <SearchFilter 
            filters={filters} 
            onFiltersChange={setFilters} 
            totalResults={filteredJobs.length} 
          />

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
            {filteredJobs.map(job => (
              <BrowseJobItem key={job.id} job={job} user={user} />
            ))}
            {filteredJobs.length === 0 && (
              <div className="col-span-full py-20 text-center border-2 border-dashed border-border rounded-3xl bg-white/50">
                <p className="text-muted-foreground italic">No jobs match your current filters. Try adjusting your search.</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="applications" className="mt-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {myApplications.map(app => (
              <Card key={app.id} className="border-border shadow-sm bg-white rounded-2xl overflow-hidden hover:shadow-md transition-all">
                <CardHeader className="p-5 pb-2">
                  <div className="flex justify-between items-start mb-2">
                    <Badge variant="outline" className={`text-[9px] uppercase tracking-widest ${
                      app.status === 'accepted' ? 'bg-green-50 text-green-700 border-green-100' :
                      app.status === 'rejected' ? 'bg-red-50 text-red-700 border-red-100' :
                      'bg-blue-50 text-blue-700 border-blue-100'
                    }`}>
                      {app.status}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground font-mono">{new Date(app.createdAt).toLocaleDateString()}</span>
                  </div>
                  <CardTitle className="text-lg font-bold tracking-tight">Project {app.jobId.slice(0, 8)}</CardTitle>
                </CardHeader>
                <CardContent className="p-5 pt-0">
                  <p className="text-xs text-muted-foreground line-clamp-3 italic mb-4">"{app.proposal}"</p>
                  <div className="flex items-center gap-2 pt-4 border-t border-border/50">
                    <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                      <Briefcase size={14} className="text-muted-foreground" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-foreground leading-none">Job Application</span>
                      <span className="text-[9px] text-muted-foreground">Status: {app.status}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {myApplications.length === 0 && (
              <div className="col-span-full py-20 text-center border-2 border-dashed border-border rounded-3xl bg-white/50">
                <p className="text-muted-foreground italic">You haven't applied for any jobs yet.</p>
                <Button variant="link" onClick={() => onTabChange?.('marketplace')} className="mt-2 text-primary">Browse Marketplace</Button>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="active" className="mt-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {myJobs.map(job => (
              <ActiveProjectItem key={job.id} job={job} user={user} />
            ))}
            {myJobs.length === 0 && (
              <div className="col-span-full py-20 text-center border-2 border-dashed border-border rounded-3xl bg-white/50">
                <p className="text-muted-foreground italic">You don't have any active projects yet. Apply for jobs to get started.</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="team" className="mt-8">
          <FreelancerMarketplace architect={user} jobs={myJobs} />
        </TabsContent>

        <TabsContent value="municipal" className="mt-8">
          <MunicipalTracker architect={user} jobs={myJobs} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function BrowseJobItem({ job, user }: { job: Job, user: UserProfile, key?: React.Key }) {
  const [proposal, setProposal] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [hasApplied, setHasApplied] = useState(false);
  const [appCount, setAppCount] = useState(0);
  const [clientProfile, setClientProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    const checkApplied = async () => {
      const q = query(collection(db, `jobs/${job.id}/applications`), where('architectId', '==', user.uid));
      const snap = await getDocs(q);
      setHasApplied(!snap.empty);
    };
    
    const fetchAppCount = async () => {
      const q = query(collection(db, `jobs/${job.id}/applications`));
      const snap = await getDocs(q);
      setAppCount(snap.size);
    };

    const fetchClient = async () => {
      const snap = await getDoc(doc(db, 'users', job.clientId));
      if (snap.exists()) {
        setClientProfile(snap.data() as UserProfile);
      }
    };

    checkApplied();
    fetchAppCount();
    fetchClient();
  }, [job.id, user.uid, job.clientId]);

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Fetch architect profile for denormalization
      const profileDoc = await getDoc(doc(db, 'architect_profiles', user.uid));
      const profileData = profileDoc.exists() ? profileDoc.data() : null;

      await addDoc(collection(db, `jobs/${job.id}/applications`), {
        jobId: job.id,
        architectId: user.uid,
        architectName: user.displayName,
        proposal,
        portfolioUrl,
        status: 'pending',
        createdAt: new Date().toISOString(),
        // Denormalized fields
        sacapNumber: profileData?.sacapNumber || '',
        specializations: (profileData?.specializations || []).slice(0, 3),
        completedJobs: profileData?.completedJobs || 0,
        averageRating: profileData?.averageRating || 0,
        portfolioThumbnail: profileData?.portfolioImages?.[0]?.url || ''
      });
      
      // Notify the client of new application
      await notificationService.notifyNewApplication(
        job.clientId,
        user.displayName,
        job.title,
        job.id
      );
      
      setHasApplied(true);
      setIsApplying(false);
      setAppCount(prev => prev + 1);
      toast.success("Application submitted");
    } catch (error) {
      toast.error("Failed to submit application");
    }
  };

  const daysLeft = differenceInDays(parseISO(job.deadline), new Date());
  
  const categoryColors: Record<string, string> = {
    'Residential': 'bg-blue-500',
    'Commercial': 'bg-purple-500',
    'Industrial': 'bg-orange-500',
    'Renovation': 'bg-emerald-500',
    'Interior': 'bg-rose-500',
    'Landscape': 'bg-green-500'
  };

  return (
    <Card className="border-border shadow-sm bg-white hover:shadow-xl transition-all duration-300 rounded-2xl overflow-hidden group border-t-0">
      <div className={`h-1.5 w-full ${categoryColors[job.category] || 'bg-primary'}`} />
      <CardHeader className="p-6 pb-4">
        <div className="flex justify-between items-start mb-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="bg-primary/5 text-primary border-primary/10 uppercase text-[9px] tracking-widest px-2 py-0.5">Open</Badge>
            <Badge variant="outline" className="border-primary/20 text-primary uppercase text-[9px] tracking-widest px-2 py-0.5">{job.category}</Badge>
            {daysLeft >= 0 && (
              <Badge className={`${daysLeft <= 3 ? 'bg-red-50 text-red-600 border-red-100' : 'bg-green-50 text-green-600 border-green-100'} uppercase text-[9px] tracking-widest px-2 py-0.5`}>
                <Clock size={10} className="mr-1" /> {daysLeft === 0 ? 'Due Today' : `${daysLeft} days left`}
              </Badge>
            )}
          </div>
          <span className="text-base font-bold text-primary font-mono whitespace-nowrap">R {job.budget.toLocaleString()}</span>
        </div>
        <CardTitle className="font-heading font-bold text-xl group-hover:text-primary transition-colors tracking-tight line-clamp-1">{job.title}</CardTitle>
        <CardDescription className="line-clamp-2 text-xs leading-relaxed mt-2 h-8">{job.description}</CardDescription>
      </CardHeader>
      
      <CardContent className="p-6 pt-0 space-y-4">
        {/* Requirements Tags */}
        <div className="flex flex-wrap gap-1.5">
          {job.requirements.slice(0, 3).map((req, i) => (
            <Badge key={i} variant="secondary" className="text-[10px] bg-secondary/50 text-muted-foreground font-medium px-2 py-0 max-w-[120px] truncate">
              {req}
            </Badge>
          ))}
          {job.requirements.length > 3 && (
            <Badge variant="secondary" className="text-[10px] bg-secondary/50 text-muted-foreground font-medium px-2 py-0">
              +{job.requirements.length - 3} more
            </Badge>
          )}
        </div>

        {/* Client Info & Application Count */}
        <div className="flex items-center justify-between pt-4 border-t border-border/50">
          <div className="flex items-center gap-2">
            <Avatar className="h-6 w-6">
              <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                {clientProfile?.displayName?.[0] || 'C'}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-foreground leading-none">{clientProfile?.displayName || 'Architex Client'}</span>
              <span className="text-[9px] text-muted-foreground">Client</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Users size={12} />
            <span className="text-[10px] font-bold">{appCount} applications</span>
          </div>
        </div>
      </CardContent>

      <CardFooter className="bg-secondary/10 p-4 border-t border-border mt-auto">
        <Dialog open={isApplying} onOpenChange={setIsApplying}>
          <DialogTrigger render={
            <Button disabled={hasApplied} variant={hasApplied ? "secondary" : "outline"} className="w-full h-10 rounded-xl text-[10px] uppercase tracking-widest font-bold border-primary/20 hover:bg-primary hover:text-primary-foreground transition-all">
              {hasApplied ? 'Already Applied' : 'Apply for Job'}
            </Button>
          } />
          <DialogContent className="sm:max-w-[600px] border-border bg-white/95 backdrop-blur-md p-0 overflow-hidden rounded-3xl">
            <div className="bg-primary/5 p-8 border-b border-border">
              <DialogHeader>
                <DialogTitle className="font-heading text-3xl font-bold">Submit Proposal</DialogTitle>
                <DialogDescription className="text-muted-foreground">Tell the client why you are the best fit for this project.</DialogDescription>
              </DialogHeader>
            </div>
            <form onSubmit={handleApply} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Your Proposal</label>
                <Textarea 
                  placeholder="Describe your approach, timeline, and experience with similar SANS 10400 projects..." 
                  value={proposal}
                  onChange={e => setProposal(e.target.value)}
                  required
                  className="min-h-[150px] border-border focus-visible:ring-primary rounded-xl leading-relaxed"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Portfolio URL</label>
                <Input 
                  placeholder="https://behance.net/your-portfolio" 
                  value={portfolioUrl}
                  onChange={e => setPortfolioUrl(e.target.value)}
                  className="border-border focus-visible:ring-primary h-12 rounded-xl"
                />
              </div>
              <Button type="submit" className="w-full bg-primary text-primary-foreground h-14 rounded-xl font-bold text-lg shadow-lg shadow-primary/20">Submit Application</Button>
            </form>
          </DialogContent>
        </Dialog>
      </CardFooter>
    </Card>
  );
}

function ActiveProjectItem({ job, user }: { job: Job, user: UserProfile, key?: React.Key }) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [drawingUrl, setDrawingUrl] = useState('');
  const [drawingName, setDrawingName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isRating, setIsRating] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [isPreChecking, setIsPreChecking] = useState(false);
  const [preCheckResult, setPreCheckResult] = useState<AIReviewResult | null>(null);
  const [aiProgress, setAiProgress] = useState<AIProgress | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isImage, setIsImage] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [clientProfile, setClientProfile] = useState<UserProfile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load client profile for chat
  useEffect(() => {
    if (job.clientId) {
      const loadClient = async () => {
        const clientDoc = await getDoc(doc(db, 'users', job.clientId));
        if (clientDoc.exists()) {
          setClientProfile(clientDoc.data() as UserProfile);
        }
      };
      loadClient();
    }
  }, [job.clientId]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  };

  const handleUpload = async (file: File) => {
    if (!file) return;
    
    // Validate file type (PDF, CAD, or images)
    const fileName = file.name.toLowerCase();
    const isPdf = file.type === 'application/pdf' || fileName.endsWith('.pdf');
    const isDwg = fileName.endsWith('.dwg');
    const isDxf = fileName.endsWith('.dxf');
    const isCad = isDwg || isDxf;
    const isImg = file.type.startsWith('image/');
    
    if (!isPdf && !isCad && !isImg) {
      toast.error("Please upload a PDF, DXF, DWG, or Image file.");
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      toast.error("File size exceeds 20MB limit.");
      return;
    }

    setIsImage(isImg);
    setIsUploading(true);
    setUploadProgress(0);
    setDrawingName(file.name.replace(/\.[^/.]+$/, ""));

    try {
      const url = await uploadAndTrackFile(file, {
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        uploadedBy: user.uid,
        context: 'submission',
        jobId: job.id,
      });
      setDrawingUrl(url);
      setIsUploading(false);
      toast.success("File uploaded successfully!");
      
      // Automatically run AI pre-check
      handlePreCheck(url, (file.name || "").split('.')[0] || 'Drawing');
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Upload failed.");
      setIsUploading(false);
    }
  };

  useEffect(() => {
    const q = query(collection(db, `jobs/${job.id}/submissions`), where('architectId', '==', user.uid));
    const unsub = onSnapshot(q, (snapshot) => {
      setSubmissions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Submission)));
    });
    return () => unsub();
  }, [job.id, user.uid]);

  useEffect(() => {
    setPreCheckResult(null);
  }, [drawingUrl, drawingName]);

  const handlePreCheck = async (url?: string, name?: string) => {
    const targetUrl = url || drawingUrl;
    const targetName = name || drawingName;

    if (!targetUrl || !targetName) {
      toast.error("Please upload a drawing first.");
      return;
    }
    
    setIsPreChecking(true);
    setPreCheckResult(null);
    setAiProgress({
      percentage: 0,
      agentName: 'Orchestrator',
      activity: 'Initializing AI Orchestration Engine...',
      completedAgents: []
    });
    
    try {
      // Log start of pre-check
      await logSystemEvent('info', 'Architect Studio', `Architect ${user.displayName} initiated AI Pre-check for ${targetName}`);

      const result = await reviewDrawing(targetUrl, targetName, (progress) => {
        setAiProgress(progress);
      });
      
      setPreCheckResult(result);
      if (result.status === 'passed') {
        toast.success("AI Pre-check Passed!");
      } else {
        toast.warning("AI Pre-check identified issues.");
      }
    } catch (error) {
      console.error("Pre-check error:", error);
      toast.error("AI Pre-check failed.");
    } finally {
      setIsPreChecking(false);
      // Keep progress visible for a moment if successful, or clear it
      setTimeout(() => setAiProgress(null), 1000);
    }
  };

  const handleSubmitDrawing = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(false);
      toast.info("Starting AI Compliance Review...");
      
      const newSub = {
        jobId: job.id,
        architectId: user.uid,
        drawingUrl,
        drawingName,
        status: 'processing' as const,
        traceability: [{
          timestamp: new Date().toISOString(),
          actor: 'Architect',
          action: 'Submission Initiated',
          details: `Drawing "${drawingName}" uploaded to secure vault.`
        }],
        createdAt: new Date().toISOString()
      };

      const docRef = await addDoc(collection(db, `jobs/${job.id}/submissions`), newSub);

      // Notify Client
      await notificationService.notifyDrawingSubmitted(job.clientId, drawingName, job.id, docRef.id);

      // Update to AI Reviewing
      await updateDoc(doc(db, `jobs/${job.id}/submissions`, docRef.id), {
        status: 'ai_reviewing',
        traceability: [
          ...newSub.traceability,
          {
            timestamp: new Date().toISOString(),
            actor: 'System',
            action: 'Status Change',
            details: 'Routing to AI Compliance Orchestrator.'
          }
        ]
      });

      // Trigger AI Review
      const aiResult = await reviewDrawing(drawingUrl, drawingName, (progress) => {
        setAiProgress(progress);
      });
      
      const finalStatus = aiResult.status === 'passed' ? 'admin_reviewing' : 'ai_failed';
      const statusLabel = aiResult.status === 'passed' ? 'Awaiting Admin Approval' : 'AI Review Failed';

      await updateDoc(doc(db, `jobs/${job.id}/submissions`, docRef.id), {
        status: finalStatus,
        aiFeedback: aiResult.feedback,
        aiStructuredFeedback: aiResult.categories,
        traceability: [
          ...newSub.traceability,
          {
            timestamp: new Date().toISOString(),
            actor: 'System',
            action: 'Status Change',
            details: 'Routing to AI Compliance Orchestrator.'
          },
          {
            timestamp: new Date().toISOString(),
            actor: 'AI Orchestrator',
            action: 'Compliance Check Completed',
            details: aiResult.traceLog
          },
          {
            timestamp: new Date().toISOString(),
            actor: 'System',
            action: 'Status Change',
            details: `Submission moved to: ${statusLabel}`
          }
        ]
      });

      // Notify parties of AI completion
      await notificationService.notifyAIReviewComplete(
        job.clientId,
        user.uid,
        drawingName,
        aiResult.status === 'passed' ? 'passed' : 'failed',
        job.id,
        docRef.id
      );

      if (aiResult.status === 'passed') {
        toast.success("AI Review Passed! Sent to Admin for final approval.");
      } else {
        toast.error("AI Review Failed. Please check feedback.");
      }
      setDrawingName('');
      setDrawingUrl('');
    } catch (error) {
      toast.error("Submission failed");
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'reviews'), {
        jobId: job.id,
        fromId: user.uid,
        toId: job.clientId,
        rating,
        comment,
        type: 'architect_to_client',
        createdAt: new Date().toISOString()
      });
      setIsRating(false);
      toast.success("Review submitted! Thank you.");
    } catch (error) {
      toast.error("Failed to submit review");
    }
  };

  const isApproved = submissions.some(s => s.status === 'approved');

  return (
    <Card className="border-border shadow-sm bg-white overflow-hidden group hover:border-primary/30 transition-all flex flex-col rounded-3xl hover:shadow-xl">
      <div className="p-8 flex-1">
        <div className="flex justify-between items-start mb-6">
          <div className="space-y-2">
            <Badge className="bg-primary/10 text-primary border-primary/20 uppercase tracking-widest text-[10px] px-3 py-1">Active Project</Badge>
            <h3 className="font-heading font-bold text-2xl group-hover:text-primary transition-colors tracking-tight">{job.title}</h3>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold text-primary font-mono">R {job.budget.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Budget</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 mb-8">
          <div className="flex items-center justify-between p-5 rounded-2xl bg-secondary/30 border border-border">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-white text-primary shadow-sm">
                <CreditCard size={20} />
              </div>
              <div>
                <p className="text-sm font-bold">Escrow Status</p>
                <p className="text-[10px] text-primary font-bold uppercase tracking-widest flex items-center gap-1">
                  <ShieldCheck size={12} /> Funds Secured
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs font-mono font-bold">20% Released</p>
            </div>
          </div>

          <div className="flex items-center justify-between p-5 rounded-2xl bg-secondary/30 border border-border">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-white text-primary shadow-sm">
                <Landmark size={20} />
              </div>
              <div>
                <p className="text-sm font-bold">Council Readiness</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
                  {isApproved ? 'Ready for Submission' : 'Awaiting Final Approval'}
                </p>
              </div>
            </div>
            {isApproved && <CheckCircle2 size={20} className="text-primary" />}
          </div>
        </div>

        <div className="space-y-4 mb-8">
          <h4 className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground flex items-center gap-2">
            <Users size={14} className="text-primary" /> Team Delegation
          </h4>
          <DelegatedTasksList job={job} user={user} />
        </div>

        <div className="space-y-4">
          <h4 className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground flex items-center gap-2">
            <History size={14} className="text-primary" /> Recent Submissions
          </h4>
          <div className="space-y-3">
            {submissions.slice(0, 3).map(sub => (
              <SubmissionItem key={sub.id} sub={sub} userRole={user.role} />
            ))}
            {submissions.length === 0 && <p className="text-xs text-muted-foreground italic">No drawings submitted yet.</p>}
          </div>
        </div>
      </div>

      <CardFooter className="bg-secondary/20 p-6 border-t border-border flex flex-col gap-3">
        <div className="flex gap-3 w-full">
          {job.status === 'completed' ? (
            <Dialog open={isRating} onOpenChange={setIsRating}>
              <DialogTrigger render={<Button variant="outline" className="flex-1 h-12 rounded-xl text-xs uppercase tracking-widest font-bold border-primary/20 hover:bg-primary hover:text-primary-foreground transition-all">Rate Client</Button>} />
              <DialogContent className="sm:max-w-[500px] border-border bg-white rounded-3xl p-0 overflow-hidden">
                <div className="bg-primary/5 p-8 border-b border-border">
                  <DialogHeader>
                    <DialogTitle className="font-heading text-3xl font-bold">Rate Client</DialogTitle>
                    <DialogDescription>Share your experience working with this client.</DialogDescription>
                  </DialogHeader>
                </div>
                <form onSubmit={handleSubmitReview} className="p-8 space-y-6">
                  <div className="space-y-4">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Rating</label>
                    <div className="flex gap-2">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setRating(star)}
                          className={`p-2 rounded-xl transition-all ${rating >= star ? 'text-primary bg-primary/10' : 'text-muted-foreground bg-secondary/50'}`}
                        >
                          <Star size={24} fill={rating >= star ? 'currentColor' : 'none'} />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Your Feedback</label>
                    <Textarea 
                      placeholder="How was the communication, clarity of brief, and payment timeliness?" 
                      value={comment}
                      onChange={e => setComment(e.target.value)}
                      required
                      className="min-h-[120px] border-border rounded-xl"
                    />
                  </div>
                  <Button type="submit" className="w-full bg-primary text-primary-foreground h-14 rounded-xl font-bold gap-2">
                    <Send size={18} /> Submit Review
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          ) : (
            <Dialog open={isSubmitting} onOpenChange={setIsSubmitting}>
              <DialogTrigger render={<Button variant="outline" className="flex-1 h-12 rounded-xl text-xs uppercase tracking-widest font-bold border-primary/20 hover:bg-primary hover:text-primary-foreground transition-all">Submit New Drawing</Button>} />
              <DialogContent className="max-w-2xl border-border bg-white/95 backdrop-blur-md p-0 overflow-hidden rounded-[2rem] shadow-2xl">
                <div className="bg-primary/5 p-8 md:p-10 border-b border-border">
                  <DialogHeader>
                    <DialogTitle className="font-heading font-bold text-3xl md:text-4xl tracking-tighter">Submit Drawing</DialogTitle>
                    <DialogDescription className="text-muted-foreground text-sm md:text-base mt-2">Upload technical drawings for AI SANS 10400 compliance check.</DialogDescription>
                  </DialogHeader>
                </div>
                <form onSubmit={handleSubmitDrawing} className="p-6 md:p-10 space-y-6 md:space-y-8">
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    onChange={handleFileSelect}
                    accept=".pdf,.dwg,.dxf,image/*"
                  />
                  <div 
                    className={`border-2 border-dashed rounded-[1.5rem] md:rounded-[2rem] p-8 md:p-16 text-center transition-all relative overflow-hidden ${
                      isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30 bg-secondary/20'
                    }`}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                  >
                    {isUploading && (
                      <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center p-8 z-10">
                        <div className="w-full max-w-xs space-y-4 text-center">
                          <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto" />
                          <p className="text-sm font-bold text-primary">Uploading drawing...</p>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col items-center gap-4">
                      {drawingUrl && isImage ? (
                         <div className="relative w-full max-w-md aspect-video rounded-xl overflow-hidden border border-border shadow-sm mb-2">
                           <img src={drawingUrl} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                         </div>
                       ) : drawingUrl ? (
                         <div className="p-4 md:p-6 bg-primary/10 rounded-full text-primary shadow-xl shadow-primary/10">
                           <Sparkles size={32} />
                         </div>
                       ) : (
                         <div className="p-4 md:p-6 bg-white rounded-full text-primary shadow-xl shadow-primary/10">
                           <UploadCloud size={32} />
                         </div>
                       )}
                       <div>
                         <p className="text-base md:text-lg font-bold tracking-tight">
                           {drawingUrl ? 'File Ready' : 'Drop your DXF, DWG or PDF'}
                         </p>
                         <p className="text-xs text-muted-foreground mt-1">
                           {drawingUrl ? drawingName : 'Technical plans (Max 20MB)'}
                         </p>
                       </div>
                      <Button 
                        type="button" 
                        variant="outline" 
                        className="mt-2 rounded-full px-6 border-primary/20 font-bold text-xs h-9"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {drawingUrl ? 'Change' : 'Browse'}
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Drawing Name</label>
                      <Input 
                        placeholder="e.g. Ground Floor Plan"
                        value={drawingName}
                        onChange={e => setDrawingName(e.target.value)}
                        required
                        className="h-12 rounded-xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Project Category</label>
                      <Badge variant="outline" className="h-12 w-full justify-center rounded-xl text-xs">{job.category}</Badge>
                    </div>
                  </div>

                  <div className="p-4 md:p-6 bg-primary/5 border border-primary/20 rounded-2xl flex flex-col gap-4">
                    <div className="flex gap-4">
                      <Sparkles className="text-primary shrink-0" size={24} />
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-foreground">AI Compliance Pre-check</p>
                        <p className="text-[10px] text-muted-foreground leading-relaxed">
                          Autonomous scan for **SANS 10400** compliance.
                        </p>
                      </div>
                    </div>
                    
                    {preCheckResult ? (
                      <div className={`p-4 rounded-2xl border ${preCheckResult.status === 'passed' ? 'bg-green-50/50 border-green-100' : 'bg-red-50/50 border-red-100'}`}>
                        <div className="flex items-center gap-2 mb-4">
                          {preCheckResult.status === 'passed' ? (
                            <CheckCircle2 className="text-green-600" size={16} />
                          ) : (
                            <AlertCircle className="text-red-600" size={16} />
                          )}
                          <span className={`text-[10px] font-bold uppercase tracking-widest ${preCheckResult.status === 'passed' ? 'text-green-700' : 'text-red-700'}`}>
                            AI Pre-check: {preCheckResult.status}
                          </span>
                        </div>
                        
                        <ScrollArea className="h-[200px] overflow-y-auto pr-2">
                          {preCheckResult.categories && preCheckResult.categories.length > 0 ? (
                            <div className="space-y-4">
                              {preCheckResult.categories.map((cat, i) => (
                                <div key={i} className="space-y-2">
                                  <p className="text-[10px] font-bold text-muted-foreground uppercase">{cat.name}</p>
                                  <div className="space-y-2">
                                    {cat.issues.map((issue, j) => (
                                      <div key={j} className="text-xs bg-white/50 p-3 rounded-xl border border-black/5">
                                        <p className="font-bold">{issue.description}</p>
                                        <p className="text-[10px] text-muted-foreground mt-1">Action: {issue.actionItem}</p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-xs text-foreground/80 markdown-body">
                              <ReactMarkdown>{preCheckResult.feedback}</ReactMarkdown>
                            </div>
                          )}
                        </ScrollArea>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {isPreChecking && (
                          <div className="space-y-2">
                            <div className="flex justify-between items-center px-1">
                              <p className="text-[9px] font-bold uppercase tracking-widest text-primary animate-pulse">Analyzing...</p>
                              <p className="text-[9px] font-mono font-bold text-muted-foreground">{aiProgress?.percentage || 0}%</p>
                            </div>
                            <div className="h-1 w-full bg-secondary rounded-full overflow-hidden">
                              <div className="h-full bg-primary transition-all duration-300" style={{ width: `${aiProgress?.percentage || 0}%` }} />
                            </div>
                          </div>
                        )}
                        <Button 
                          type="button" 
                          onClick={() => handlePreCheck()} 
                          disabled={isPreChecking || !drawingUrl}
                          className="w-full bg-white text-primary border border-primary/20 hover:bg-primary/5 h-10 rounded-xl font-bold gap-2 text-[10px] uppercase tracking-widest"
                        >
                          {isPreChecking ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                          Run AI Pre-check
                        </Button>
                      </div>
                    )}
                  </div>
                  <Button 
                    type="submit" 
                    disabled={isPreChecking || !drawingUrl}
                    className="w-full bg-primary text-primary-foreground h-14 rounded-2xl font-bold text-base shadow-xl shadow-primary/20"
                  >
                    Submit for AI Review
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}

          {clientProfile && (
            <Button
              variant="outline"
              className="flex-1 h-12 rounded-xl text-xs uppercase tracking-widest font-bold border-primary/20 hover:bg-primary hover:text-primary-foreground transition-all"
              onClick={() => setIsChatOpen(true)}
            >
              <MessageCircle size={16} className="mr-2" />
              Chat
            </Button>
          )}
        </div>

        {clientProfile && (
          <Chat
            job={job}
            currentUser={user}
            otherUser={clientProfile}
            isOpen={isChatOpen}
            onClose={() => setIsChatOpen(false)}
          />
        )}
      </CardFooter>
      <OrchestrationProgressModal progress={aiProgress} isOpen={!!aiProgress} />
    </Card>
  );
}

function DelegatedTasksList({ job, user }: { job: Job, user: UserProfile }) {
  const [tasks, setTasks] = useState<JobCard[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [assigneeName, setAssigneeName] = useState('');
  const [assigneeRole, setAssigneeRole] = useState('');
  const [deadline, setDeadline] = useState('');
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [requirements, setRequirements] = useState('');

  useEffect(() => {
    const q = query(collection(db, `jobs/${job.id}/tasks`), where('architectId', '==', user.uid));
    const unsub = onSnapshot(q, (snapshot) => {
      setTasks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as JobCard)));
    });
    return () => unsub();
  }, [job.id, user.uid]);

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, `jobs/${job.id}/tasks`), {
        jobId: job.id,
        architectId: user.uid,
        assigneeName,
        assigneeRole,
        deadline,
        notes,
        priority,
        requirements: (requirements || "").split('\n').filter(r => r.trim()),
        status: 'pending',
        createdAt: new Date().toISOString()
      });
      setIsAdding(false);
      setAssigneeName('');
      setAssigneeRole('');
      setDeadline('');
      setNotes('');
      setPriority('medium');
      setRequirements('');
      toast.success("Job Card created successfully");
    } catch (error) {
      toast.error("Failed to create job card");
    }
  };

  const handleUpdateStatus = async (taskId: string, newStatus: string) => {
    try {
      await updateDoc(doc(db, `jobs/${job.id}/tasks`, taskId), {
        status: newStatus,
        completedAt: newStatus === 'completed' ? new Date().toISOString() : null
      });
      toast.success("Job card status updated");
    } catch (error) {
      toast.error("Failed to update status");
    }
  };

  const priorityColors = {
    low: 'bg-slate-100 text-slate-700 border-slate-200',
    medium: 'bg-blue-100 text-blue-700 border-blue-200',
    high: 'bg-orange-100 text-orange-700 border-orange-200',
    urgent: 'bg-red-100 text-red-700 border-red-200'
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-xs text-muted-foreground">Manage job cards for your team members.</p>
        <Dialog open={isAdding} onOpenChange={setIsAdding}>
          <DialogTrigger render={
            <Button variant="outline" size="sm" className="h-8 text-xs rounded-full gap-1 border-primary/20 text-primary">
              <Plus size={14} /> Create Job Card
            </Button>
          } />
          <DialogContent className="sm:max-w-[600px] border-border bg-white rounded-3xl p-0 overflow-hidden">
            <div className="bg-primary/5 p-6 border-b border-border">
              <DialogHeader>
                <DialogTitle className="font-heading text-2xl font-bold">Create Job Card</DialogTitle>
                <DialogDescription>Assign detailed tasks to a team member or freelancer.</DialogDescription>
              </DialogHeader>
            </div>
            <form onSubmit={handleAddTask} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Assignee Name</label>
                  <Input required value={assigneeName} onChange={e => setAssigneeName(e.target.value)} placeholder="e.g. Jane Doe" className="rounded-xl" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Role / Title</label>
                  <Input required value={assigneeRole} onChange={e => setAssigneeRole(e.target.value)} placeholder="e.g. Structural Engineer" className="rounded-xl" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Deadline</label>
                  <Input required type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className="rounded-xl" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Priority</label>
                  <select
                    value={priority}
                    onChange={e => setPriority(e.target.value as any)}
                    className="w-full h-10 px-3 rounded-xl border border-border bg-white text-sm focus:ring-2 focus:ring-primary"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Task Notes</label>
                <Textarea required value={notes} onChange={e => setNotes(e.target.value)} placeholder="Describe the task scope..." className="rounded-xl min-h-[80px]" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Specific Requirements (One per line)</label>
                <Textarea value={requirements} onChange={e => setRequirements(e.target.value)} placeholder="e.g. SANS 10400-K compliance check&#10;Verify foundation depth" className="rounded-xl min-h-[80px]" />
              </div>
              <Button type="submit" className="w-full rounded-xl h-12 font-bold">Assign Job Card</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {tasks.length > 0 ? (
        <div className="space-y-3">
          {tasks.map(task => (
            <div key={task.id} className="p-4 rounded-2xl border border-border bg-white flex flex-col gap-3 hover:shadow-md transition-all">
              <div className="flex justify-between items-start">
                <div className="flex gap-3">
                   <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                     {task.assigneeName ? task.assigneeName[0] : "?"}
                   </div>
                   <div>
                     <p className="font-bold text-sm">{task.assigneeName} <span className="text-muted-foreground font-normal">({task.assigneeRole})</span></p>
                     <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className={`text-[8px] uppercase tracking-widest ${priorityColors[task.priority]}`}>
                          {task.priority}
                        </Badge>
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Clock size={10} /> Due: {new Date(task.deadline).toLocaleDateString()}</p>
                     </div>
                   </div>
                </div>
                <select 
                  value={task.status}
                  onChange={(e) => handleUpdateStatus(task.id, e.target.value)}
                  className={`text-[10px] uppercase tracking-widest font-bold px-3 py-1 rounded-full border outline-none ${
                    task.status === 'completed' ? 'bg-green-50 text-green-700 border-green-200' :
                    task.status === 'in-progress' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                    'bg-yellow-50 text-yellow-700 border-yellow-200'
                  }`}
                >
                  <option value="pending">Pending</option>
                  <option value="in-progress">In Progress</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div className="bg-secondary/20 p-3 rounded-xl">
                 <p className="text-xs font-medium text-foreground">{task.notes}</p>
                 {task.requirements && task.requirements.length > 0 && (
                   <ul className="mt-2 space-y-1">
                     {task.requirements.map((req, i) => (
                       <li key={i} className="text-[10px] text-muted-foreground flex items-center gap-1">
                         <CheckCircle2 size={10} className="text-primary" /> {req}
                       </li>
                     ))}
                   </ul>
                 )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-6 text-center border border-dashed border-border rounded-2xl bg-secondary/5">
          <p className="text-xs text-muted-foreground italic">No job cards assigned yet.</p>
        </div>
      )}
    </div>
  );
}

function FreelancerMarketplace({ architect, jobs }: { architect: UserProfile, jobs: Job[] }) {
  const [freelancers, setFreelancers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'users'), where('role', '==', 'freelancer'));
    const unsub = onSnapshot(q, (snapshot) => {
      setFreelancers(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile)));
      setLoading(false);
    });
    return unsub;
  }, []);

  const handleAssignFreelancer = async (freelancer: UserProfile, job: Job) => {
    try {
      await addDoc(collection(db, `jobs/${job.id}/tasks`), {
        jobId: job.id,
        architectId: architect.uid,
        assigneeId: freelancer.uid,
        assigneeName: freelancer.displayName,
        assigneeRole: (freelancer.professionalLabels && freelancer.professionalLabels.length > 0) ? freelancer.professionalLabels[0] : 'Specialist',
        deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        notes: `Assigned to project: ${job.title}`,
        priority: 'medium',
        status: 'pending',
        createdAt: new Date().toISOString()
      });
      toast.success(`Assigned ${freelancer.displayName} to ${job.title}`);
    } catch (error) {
      toast.error("Failed to assign freelancer");
    }
  };

  const filteredFreelancers = freelancers.filter(f =>
    f.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.professionalLabels?.some(l => l.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between gap-4">
        <div>
           <h2 className="text-3xl font-heading font-bold tracking-tight">Freelancer Marketplace</h2>
           <p className="text-muted-foreground">Find and assign professionals to your projects.</p>
        </div>
        <div className="relative w-full md:w-80">
           <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
           <Input
             placeholder="Search by name or skill (e.g. Engineer)..."
             className="pl-10 rounded-full"
             value={searchTerm}
             onChange={e => setSearchTerm(e.target.value)}
           />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full py-20 flex justify-center"><Loader2 className="animate-spin text-primary" /></div>
        ) : filteredFreelancers.map(f => (
          <Card key={f.uid} className="overflow-hidden border-border bg-white rounded-3xl hover:shadow-xl transition-all">
            <CardHeader className="p-6 pb-2">
               <div className="flex justify-between items-start">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">{f.displayName ? f.displayName[0] : "?"}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-wrap gap-1 justify-end max-w-[150px]">
                     {f.professionalLabels?.map(l => (
                       <Badge key={l} variant="secondary" className="text-[9px] uppercase tracking-widest">{l}</Badge>
                     ))}
                  </div>
               </div>
               <CardTitle className="mt-4 font-bold text-xl">{f.displayName}</CardTitle>
               <CardDescription className="line-clamp-2 text-xs italic">{f.bio || "No bio available."}</CardDescription>
            </CardHeader>
            <CardContent className="p-6 pt-2">
               <div className="mt-4 pt-4 border-t border-border flex flex-col gap-3">
                  <Dialog>
                    <DialogTrigger render={
                      <Button className="w-full h-10 rounded-xl font-bold text-xs uppercase tracking-widest">Assign to Project</Button>
                    } />
                    <DialogContent className="rounded-3xl border-border bg-white p-6">
                       <DialogHeader>
                          <DialogTitle className="font-heading text-2xl font-bold">Assign {f.displayName}</DialogTitle>
                          <DialogDescription>Select a project to assign this professional to.</DialogDescription>
                       </DialogHeader>
                       <div className="mt-6 space-y-2">
                          {jobs.length > 0 ? jobs.map(job => (
                            <Button
                              key={job.id}
                              variant="outline"
                              className="w-full justify-between h-12 rounded-xl group hover:bg-primary hover:text-primary-foreground"
                              onClick={() => handleAssignFreelancer(f, job)}
                            >
                              <span>{job.title}</span>
                              <Plus size={16} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                            </Button>
                          )) : (
                            <p className="text-center text-sm text-muted-foreground italic py-4">No active projects available.</p>
                          )}
                       </div>
                    </DialogContent>
                  </Dialog>
                  <Button variant="ghost" className="w-full h-10 rounded-xl font-bold text-xs uppercase tracking-widest gap-2">
                    <MessageCircle size={14} /> Message
                  </Button>
               </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function MunicipalTracker({ architect, jobs }: { architect: UserProfile, jobs: Job[] }) {
  const [credentials, setCredentials] = useState<MunicipalCredential[]>([]);
  const [isAddingCreds, setIsAddingCreds] = useState(false);
  const [selectedMunicipality, setSelectedMunicipality] = useState('city_of_johannesburg');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [trackingResults, setTrackingResults] = useState<Record<string, any>>({});
  const [isTracking, setIsTracking] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'municipal_credentials'), where('userId', '==', architect.uid));
    const unsub = onSnapshot(q, (snapshot) => {
      setCredentials(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MunicipalCredential)));
    });
    return unsub;
  }, [architect.uid]);

  const handleSaveCreds = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // NOTE: In a production app, passwords should be encrypted client-side
      // with a public key or handled via a secure vault.
      // For this demo, we're storing a base64 encoded string as a minimal obfuscation.
      const obfuscatedPassword = btoa(password);

      await addDoc(collection(db, 'municipal_credentials'), {
        userId: architect.uid,
        municipality: selectedMunicipality,
        username,
        password: obfuscatedPassword,
        updatedAt: new Date().toISOString()
      });
      setIsAddingCreds(false);
      setUsername('');
      setPassword('');
      toast.success("Credentials saved successfully");
    } catch (error) {
      toast.error("Failed to save credentials");
    }
  };

  const handleTrackStatus = async (cred: MunicipalCredential) => {
    setIsTracking(cred.id);
    try {
      // Browser automation placeholder
      // In reality, this would call our service
      const response = await fetch('/api/track-municipality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentialId: cred.id })
      });
      const data = await response.json();
      setTrackingResults(prev => ({ ...prev, [cred.id]: data }));
      toast.success(`Tracked status for ${cred.municipality}`);
    } catch (error) {
      // Mock result for demo
      setTrackingResults(prev => ({
        ...prev,
        [cred.id]: {
          status: 'Under Review',
          lastUpdated: new Date().toLocaleDateString(),
          applications: [
            { ref: 'BP-2024-001', status: 'Pending Review' },
            { ref: 'BP-2023-998', status: 'Approved' }
          ]
        }
      }));
      toast.info("Municipal tracking simulated.");
    } finally {
      setIsTracking(null);
    }
  };

  const municipalities = [
    { value: 'city_of_johannesburg', label: 'City of Johannesburg' },
    { value: 'city_of_cape_town', label: 'City of Cape Town' },
    { value: 'ethekwini', label: 'eThekwini' },
    { value: 'nels_mandela_bay', label: 'Nelson Mandela Bay' }
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between gap-4">
        <div>
           <h2 className="text-3xl font-heading font-bold tracking-tight">Municipal Portal Tracker</h2>
           <p className="text-muted-foreground">Automated tracking for your council submissions.</p>
        </div>
        <Dialog open={isAddingCreds} onOpenChange={setIsAddingCreds}>
          <DialogTrigger render={
            <Button className="rounded-full h-12 px-6 font-bold shadow-lg shadow-primary/20 gap-2">
              <Plus size={18} /> Add Portal Access
            </Button>
          } />
          <DialogContent className="rounded-3xl border-border bg-white p-8">
             <DialogHeader>
                <DialogTitle className="font-heading text-2xl font-bold">Portal Credentials</DialogTitle>
                <DialogDescription>Add your municipal portal login details for automated tracking.</DialogDescription>
             </DialogHeader>
             <form onSubmit={handleSaveCreds} className="mt-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Municipality</label>
                  <select
                    value={selectedMunicipality}
                    onChange={e => setSelectedMunicipality(e.target.value)}
                    className="w-full h-12 px-4 rounded-xl border border-border bg-white text-sm focus:ring-2 focus:ring-primary"
                  >
                    {municipalities.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Username / Email</label>
                  <Input required value={username} onChange={e => setUsername(e.target.value)} className="rounded-xl h-12" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Password</label>
                  <Input required type="password" value={password} onChange={e => setPassword(e.target.value)} className="rounded-xl h-12" />
                </div>
                <Button type="submit" className="w-full h-14 rounded-xl font-bold mt-4">Save Credentials</Button>
             </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {credentials.map(cred => (
          <Card key={cred.id} className="border-border bg-white rounded-3xl overflow-hidden shadow-sm">
            <CardHeader className="bg-primary/5 p-6 border-b border-border flex flex-row items-center justify-between">
               <div>
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <Landmark size={18} className="text-primary" /> {municipalities.find(m => m.value === cred.municipality)?.label}
                  </CardTitle>
                  <CardDescription className="text-xs">Account: {cred.username}</CardDescription>
               </div>
               <Button
                 onClick={() => handleTrackStatus(cred)}
                 disabled={isTracking === cred.id}
                 variant="outline"
                 size="sm"
                 className="rounded-full h-9 gap-2 border-primary/20 text-primary hover:bg-primary hover:text-white"
               >
                 {isTracking === cred.id ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
                 Sync Status
               </Button>
            </CardHeader>
            <CardContent className="p-6">
               {trackingResults[cred.id] ? (
                 <div className="space-y-4">
                    <div className="flex justify-between items-end">
                       <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Live Application Status</p>
                       <p className="text-[10px] text-muted-foreground italic">Last synced: {trackingResults[cred.id].lastUpdated}</p>
                    </div>
                    <div className="space-y-2">
                       {trackingResults[cred.id].applications.map((app: any, i: number) => (
                         <div key={i} className="flex justify-between items-center p-3 bg-secondary/20 rounded-xl border border-border">
                            <span className="text-sm font-mono font-bold">{app.ref}</span>
                            <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] uppercase tracking-widest">{app.status}</Badge>
                         </div>
                       ))}
                    </div>
                 </div>
               ) : (
                 <div className="py-10 text-center flex flex-col items-center gap-3">
                    <History className="text-muted-foreground/30 w-10 h-10" />
                    <p className="text-xs text-muted-foreground italic">No sync data available. Click "Sync Status" to retrieve information.</p>
                 </div>
               )}
            </CardContent>
          </Card>
        ))}
        {credentials.length === 0 && (
          <div className="col-span-full py-20 text-center border-2 border-dashed border-border rounded-3xl bg-white/50">
             <p className="text-muted-foreground italic">Add your municipal portal credentials to enable automated status tracking.</p>
          </div>
        )}
      </div>
    </div>
  );
}
