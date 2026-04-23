import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, getDoc } from 'firebase/firestore';
import { UserProfile, Job, Application, Submission, JobCategory, AIReviewResult, ArchitectProfile } from '../types';
import ProfileEditor from './ProfileEditor';
import { Chat, ChatButton } from './Chat';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { ScrollArea } from './ui/scroll-area';
import { toast } from 'sonner';
import { Plus, Users, FileText, CheckCircle2, Clock, AlertCircle, CreditCard, Landmark, History as HistoryIcon, ArrowRight, ShieldCheck, MessageCircle, User, ExternalLink, UploadCloud, Loader2, Sparkles, Shield, Briefcase, X, Building2, ShieldX } from 'lucide-react';
import MunicipalTracker from './MunicipalTracker';
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
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isPosting, setIsPosting] = useState(false);

  // Map sidebar tabs to internal dashboard tabs
  const internalTab = activeTab === 'projects' ? 'active' : activeTab === 'municipal' ? 'municipal' : 'active';
  const [newJob, setNewJob] = useState({ title: '', description: '', budget: '', deadline: '', requirements: '', category: 'Residential' as JobCategory });

  useEffect(() => {
    const q = query(collection(db, 'jobs'), where('clientId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const jobsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job));
      setJobs(jobsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'jobs');
    });
    return () => unsubscribe();
  }, [user.uid]);

  const handlePostJob = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'jobs'), {
        ...newJob,
        requirements: (newJob.requirements || '').split('\n').filter(r => r.trim()),
        clientId: user.uid,
        budget: Number(newJob.budget),
        status: 'open',
        createdAt: new Date().toISOString()
      });
      setIsPosting(false);
      setNewJob({ title: '', description: '', budget: '', deadline: '', requirements: '', category: 'Residential' });
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
          <p className="text-muted-foreground text-base md:text-lg max-w-2xl leading-relaxed">Manage your architectural projects and find the right experts on Architex.</p>
        </div>
        <Dialog open={isPosting} onOpenChange={setIsPosting}>
          <DialogTrigger render={<Button className="bg-primary text-primary-foreground gap-2 h-12 px-6 rounded-full font-bold shadow-lg shadow-primary/20"><Plus size={18} />Post New Job</Button>} />
          <DialogContent className="sm:max-w-[500px] border-border bg-white/95 backdrop-blur-md p-0 overflow-hidden rounded-3xl">
            <div className="bg-primary/5 p-8 border-b border-border">
              <DialogHeader>
                <DialogTitle className="font-heading text-3xl font-bold">Post a New Job</DialogTitle>
                <DialogDescription className="text-muted-foreground">Describe your architectural needs and budget to attract top talent.</DialogDescription>
              </DialogHeader>
            </div>
            <form onSubmit={handlePostJob} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Project Title</label>
                <Input 
                  placeholder="e.g. Modern Residential Extension" 
                  value={newJob.title}
                  onChange={e => setNewJob({...newJob, title: e.target.value})}
                  required
                  className="border-border focus-visible:ring-primary h-12 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Description</label>
                <Textarea 
                  placeholder="Describe the scope of work, style preferences, and constraints..." 
                  value={newJob.description}
                  onChange={e => setNewJob({...newJob, description: e.target.value})}
                  required
                  className="border-border focus-visible:ring-primary min-h-[120px] rounded-xl"
                />
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Category</label>
                  <select 
                    value={newJob.category}
                    onChange={e => setNewJob({...newJob, category: e.target.value as JobCategory})}
                    required
                    className="w-full border-border focus:ring-primary h-12 rounded-xl bg-white px-4 text-sm appearance-none cursor-pointer"
                  >
                    <option value="Residential">Residential</option>
                    <option value="Commercial">Commercial</option>
                    <option value="Industrial">Industrial</option>
                    <option value="Renovation">Renovation</option>
                    <option value="Interior">Interior</option>
                    <option value="Landscape">Landscape</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Deadline</label>
                  <Input 
                    type="date" 
                    value={newJob.deadline}
                    onChange={e => setNewJob({...newJob, deadline: e.target.value})}
                    required
                    className="border-border focus-visible:ring-primary h-12 rounded-xl"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Budget (ZAR)</label>
                <Input 
                  type="number" 
                  placeholder="50000" 
                  value={newJob.budget}
                  onChange={e => setNewJob({...newJob, budget: e.target.value})}
                  required
                  className="border-border focus-visible:ring-primary h-12 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Requirements (One per line)</label>
                <Textarea 
                  placeholder="e.g. SANS 10400-T compliance&#10;Heritage site experience&#10;3D Rendering included" 
                  value={newJob.requirements}
                  onChange={e => setNewJob({...newJob, requirements: e.target.value})}
                  required
                  className="border-border focus-visible:ring-primary min-h-[100px] rounded-xl"
                />
              </div>
              <Button type="submit" className="w-full bg-primary text-primary-foreground h-14 rounded-xl font-bold text-lg shadow-lg shadow-primary/20">Post Job to Marketplace</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <StatCard title="Active Jobs" value={jobs.filter(j => j.status === 'open' || j.status === 'in-progress').length} icon={<Clock className="text-primary" />} />
        <StatCard title="Total Spent" value={`R ${safeLocale(jobs.reduce((acc, j) => acc + (j.status === 'completed' ? (j.budget || 0) : 0), 0))}`} icon={<CheckCircle2 className="text-primary" />} />
        <StatCard title="Pending Reviews" value={0} icon={<AlertCircle className="text-primary" />} />
      </div>

      <Tabs value={internalTab} onValueChange={(val) => onTabChange?.(val === 'active' ? 'projects' : val === 'municipal' ? 'municipal' : 'overview')} className="w-full">
        <TabsList className="bg-secondary/50 border border-border p-1 rounded-full w-fit">
          <TabsTrigger value="active" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full px-8">Active Jobs</TabsTrigger>
          <TabsTrigger value="completed" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full px-8">Completed</TabsTrigger>
          <TabsTrigger value="municipal" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full px-8">Municipal Tracker</TabsTrigger>
        </TabsList>
        <TabsContent value="municipal" className="mt-8">
          <MunicipalTracker user={user} />
        </TabsContent>

        <TabsContent value="active" className="mt-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {jobs.filter(j => j.status !== 'completed').map(job => (
              <JobItem key={job.id} job={job} user={user} />
            ))}
            {jobs.filter(j => j.status !== 'completed').length === 0 && (
              <div className="col-span-full py-20 text-center border-2 border-dashed border-border rounded-3xl bg-white/50">
                <p className="text-muted-foreground italic">No active jobs found. Post a new job to get started.</p>
              </div>
            )}
          </div>
        </TabsContent>
        <TabsContent value="completed" className="mt-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {jobs.filter(j => j.status === 'completed').map(job => (
              <JobItem key={job.id} job={job} user={user} />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({ title, value, icon }: { title: string, value: string | number, icon: React.ReactNode }) {
  return (
    <Card className="border-border shadow-sm bg-white hover:shadow-xl transition-all duration-300 rounded-[1.5rem] md:rounded-[2rem] group overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between pb-4 p-6 md:p-8">
        <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{title}</CardTitle>
        <div className="p-3 bg-primary/5 rounded-2xl group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
          {icon}
        </div>
      </CardHeader>
      <CardContent className="px-6 md:px-8 pb-6 md:pb-8">
        <div className="text-3xl md:text-4xl font-heading font-bold tracking-tighter">{value}</div>
      </CardContent>
    </Card>
  );
}

import { Star, Send } from 'lucide-react';

function JobItem({ job, user, ...props }: { job: Job, user: UserProfile, [key: string]: any }) {
  const [applications, setApplications] = useState<Application[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [isRating, setIsRating] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isManageDialogOpen, setIsManageDialogOpen] = useState(false);
  const [selectedArchitect, setSelectedArchitect] = useState<UserProfile | null>(null);
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null);
  
  // Upload and AI review state
  const [drawingUrl, setDrawingUrl] = useState('');
  const [drawingName, setDrawingName] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isPreChecking, setIsPreChecking] = useState(false);
  const [preCheckResult, setPreCheckResult] = useState<AIReviewResult | null>(null);
  const [aiProgress, setAiProgress] = useState<AIProgress | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isImage, setIsImage] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    const qApps = query(collection(db, `jobs/${job.id}/applications`));
    const unsubApps = onSnapshot(qApps, (snapshot) => {
      setApplications(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Application)));
    });

    const qSubs = query(collection(db, `jobs/${job.id}/submissions`));
    const unsubSubs = onSnapshot(qSubs, (snapshot) => {
      setSubmissions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Submission)));
    });

    return () => {
      unsubApps();
      unsubSubs();
    };
  }, [job.id]);

  const handleAcceptApplication = async (app: Application) => {
    try {
      await updateDoc(doc(db, 'jobs', job.id), {
        status: 'in-progress',
        selectedArchitectId: app.architectId
      });
      await updateDoc(doc(db, `jobs/${job.id}/applications`, app.id), {
        status: 'accepted'
      });
      
      // Notify architect
      await notificationService.notifyApplicationAccepted(app.architectId, job.title, job.id);
      
      toast.success(`Accepted ${app.architectName}'s proposal. Escrow payment initialized.`);
    } catch (error) {
      toast.error("Failed to accept application");
    }
  };

  const handleCouncilSubmission = async (job: Job) => {
    try {
      toast.info("Submitting approved drawings to local municipality portal...");
      
      // Real logic: Update job status and log system event
      await updateDoc(doc(db, 'jobs', job.id), {
        status: 'completed', // Or a new status like 'council-submitted'
        councilReference: "SA-ARCH-" + Math.floor(Math.random() * 1000000).toString().padStart(6, '0')
      });

      // Log system event for audit trail
      await logSystemEvent('info', 'Council Integration', `Job ${job.id} submitted to municipality portal.`, {
        clientId: user.uid,
        jobTitle: job.title
      });

      toast.success("Successfully submitted to Council!");
    } catch (error) {
      console.error("Council submission error:", error);
      toast.error("Failed to submit to Council portal.");
    }
  };

  const handleCompleteJob = async () => {
    try {
      await updateDoc(doc(db, 'jobs', job.id), {
        status: 'completed'
      });
      setIsRating(true);
      toast.success("Job marked as completed!");
    } catch (error) {
      toast.error("Failed to complete job");
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'reviews'), {
        jobId: job.id,
        fromId: job.clientId,
        toId: job.selectedArchitectId,
        rating,
        comment,
        type: 'client_to_architect',
        createdAt: new Date().toISOString()
      });
      setIsRating(false);
      toast.success("Review submitted! Thank you.");
    } catch (error) {
      toast.error("Failed to submit review");
    }
  };

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
    
    // Validate file type (PDF, CAD-like extensions, or images)
    const validTypes = ['application/pdf', 'image/vnd.dwg', 'application/acad', 'application/x-acad', 'application/autocad_dwg', 'image/x-dwg', 'application/dwg'];
    const isPdf = file.type === 'application/pdf';
    const isDwg = file.name.toLowerCase().endsWith('.dwg');
    const isImg = file.type.startsWith('image/');
    
    if (!isPdf && !isDwg && !isImg) {
      toast.error("Please upload a PDF, DWG, or Image file.");
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      toast.error("File size exceeds 20MB limit.");
      return;
    }

    setIsImage(isImg);
    setIsUploading(true);
    setDrawingName(file.name?.split('.')[0] || 'Drawing');

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
      
      // Verification: Automatically trigger AI analysis and create submission
      // as requested in the comment (Step 3).
      await handleSubmitDrawingAction(url, file.name?.split('.')[0] || 'Drawing');
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Upload failed.");
      setIsUploading(false);
    }
  };

  const handleSubmitDrawingAction = async (url: string, name: string) => {
    try {
      toast.info("Starting AI Compliance Review...");
      
      const newSub = {
        jobId: job.id,
        architectId: user.uid, // In this case, the client is submitting
        drawingUrl: url,
        drawingName: name,
        status: 'processing' as const,
        traceability: [{
          timestamp: new Date().toISOString(),
          actor: 'Client',
          action: 'Submission Initiated',
          details: `Drawing "${name}" uploaded by client for AI analysis.`
        }],
        createdAt: new Date().toISOString()
      };

      const docRef = await addDoc(collection(db, `jobs/${job.id}/submissions`), newSub);
      
      // Notify Client (self notification is okay, or could be architect if supported)
      await notificationService.notifyDrawingSubmitted(job.clientId, name, job.id, docRef.id);
      
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
      const aiResult = await reviewDrawing(url, name, (progress) => {
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
        name,
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
      setAiProgress(null);
    } catch (error) {
      console.error("Submission error:", error);
      toast.error("Submission and review failed");
      setAiProgress(null);
    }
  };

  const handlePreCheck = async () => {
    if (!drawingUrl || !drawingName) {
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
      const result = await reviewDrawing(drawingUrl, drawingName, (progress) => {
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
      setTimeout(() => setAiProgress(null), 1000);
    }
  };

  const isApproved = submissions.some(s => s.status === 'approved');

  const getLatestSubmissionStatus = () => {
    if (submissions.length === 0) return null;
    const latest = [...submissions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    
    switch (latest.status) {
      case 'approved': return { label: 'Approved', color: 'bg-green-50 text-green-700 border-green-100' };
      case 'ai_failed': return { label: 'AI Review Failed', color: 'bg-red-50 text-red-700 border-red-100' };
      case 'admin_rejected': return { label: 'Admin Rejected', color: 'bg-red-50 text-red-700 border-red-100' };
      case 'ai_reviewing': return { label: 'AI Reviewing', color: 'bg-blue-50 text-blue-700 border-blue-100' };
      case 'processing': return { label: 'Processing', color: 'bg-yellow-50 text-yellow-700 border-yellow-100' };
      case 'admin_reviewing': return { label: 'Awaiting Admin Approval', color: 'bg-primary/5 text-primary border-primary/10' };
      default: return { label: latest.status.replace('_', ' '), color: 'bg-secondary text-muted-foreground' };
    }
  };

  const statusConfig = getLatestSubmissionStatus();

  return (
    <Card className="border-border shadow-sm bg-white overflow-hidden group hover:border-primary/30 transition-all flex flex-col rounded-3xl hover:shadow-xl">
      <div className="p-8 flex-1">
        <div className="flex justify-between items-start mb-6">
          <div className="space-y-2">
            <div className="flex gap-2">
              <Badge variant="secondary" className={`text-[10px] uppercase tracking-widest px-3 py-1 ${
                job.status === 'open' ? 'bg-blue-50 text-blue-700 border-blue-100' : 
                job.status === 'in-progress' ? 'bg-primary/10 text-primary border-primary/20' : 
                'bg-green-50 text-green-700 border-green-100'
              }`}>
                {job.status.replace('-', ' ')}
              </Badge>
              <Badge variant="outline" className="border-primary/20 text-primary uppercase text-[10px] tracking-widest px-3 py-1 bg-white">
                {job.category}
              </Badge>
            </div>
            <h3 className="font-heading font-bold text-2xl group-hover:text-primary transition-colors tracking-tight">{job.title}</h3>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold text-primary font-mono">R {safeLocale(job.budget)}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Budget</p>
          </div>
        </div>
        
        <p className="text-sm text-muted-foreground line-clamp-2 mb-8 leading-relaxed">
          {job.description}
        </p>

        <div className="grid grid-cols-1 gap-4">
          <div className="flex items-center justify-between p-4 rounded-2xl bg-secondary/30 border border-border">
            <div className="flex items-center gap-4">
              <div className="p-2.5 rounded-xl bg-white text-primary shadow-sm">
                <Users size={18} />
              </div>
              <div>
                <p className="text-lg font-heading font-bold leading-none">{applications.length}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Applications</p>
              </div>
            </div>
            {job.status === 'open' && applications.length > 0 && (
              <Badge className="bg-primary text-primary-foreground animate-pulse">New</Badge>
            )}
          </div>

          {job.status === 'in-progress' && (
            <div className="flex items-center justify-between p-4 rounded-2xl bg-secondary/30 border border-border">
              <div className="flex items-center gap-4">
                <div className="p-2.5 rounded-xl bg-white text-primary shadow-sm">
                  <FileText size={18} />
                </div>
                <div>
                  <p className="text-sm font-bold">Drawing Status</p>
                  {statusConfig ? (
                    <Badge variant="outline" className={`mt-1 px-3 py-0.5 rounded-full font-bold uppercase tracking-widest text-[9px] ${statusConfig.color}`}>
                      {statusConfig.label}
                    </Badge>
                  ) : (
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">No Submissions Yet</p>
                  )}
                </div>
              </div>
              {isApproved && <CheckCircle2 size={18} className="text-primary" />}
            </div>
          )}
        </div>
      </div>

<CardFooter className="bg-secondary/20 p-6 border-t border-border flex flex-col gap-3">
      {job.status === 'in-progress' && job.selectedArchitectId && (
        <div className="flex gap-3">
          <ChatButton
            jobId={job.id}
            userId={user.uid}
            onClick={async () => {
              const archDoc = await getDoc(doc(db, 'users', job.selectedArchitectId!));
              if (archDoc.exists()) {
                setSelectedArchitect(archDoc.data() as UserProfile);
                setIsChatOpen(true);
              }
            }}
          />
          <Button
            variant="outline"
            className="flex-1 h-12 rounded-xl text-xs uppercase tracking-widest font-bold border-primary/20 hover:bg-primary hover:text-primary-foreground transition-all"
            onClick={async () => {
              const archDoc = await getDoc(doc(db, 'users', job.selectedArchitectId!));
              if (archDoc.exists()) {
                setSelectedArchitect(archDoc.data() as UserProfile);
                setIsChatOpen(true);
              }
            }}
          >
            <MessageCircle size={16} className="mr-2" />
            Message Architect
          </Button>
        </div>
      )}
<Dialog open={isManageDialogOpen} onOpenChange={setIsManageDialogOpen}>
      <DialogTrigger 
        render={
          <Button 
            variant="outline" 
            className="w-full h-12 rounded-xl text-xs uppercase tracking-widest font-bold border-primary/20 hover:bg-primary hover:text-primary-foreground transition-all"
          >
            Manage Project & Payments
          </Button>
        }
      />
          <DialogContent className="sm:max-w-[1100px] w-[95vw] border-border bg-white/95 backdrop-blur-md h-[90vh] max-h-[850px] flex flex-col p-0 overflow-hidden rounded-[2rem] shadow-2xl">
            <div className="p-10 border-b border-border bg-primary/5">
              <DialogHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <DialogTitle className="font-heading font-bold text-4xl mb-2 tracking-tighter">{job.title}</DialogTitle>
                    <DialogDescription className="text-muted-foreground flex items-center gap-4">
                      <span className="bg-white px-3 py-1 rounded-full border border-border text-[10px] font-mono uppercase tracking-widest">ID: {job.id.substring(0, 8)}</span>
                      <span className="flex items-center gap-1 text-xs"><Clock size={14} /> Posted {new Date(job.createdAt).toLocaleDateString()}</span>
                    </DialogDescription>
                  </div>
                  <Badge className="bg-primary text-primary-foreground uppercase tracking-widest text-[10px] px-4 py-1.5 rounded-full font-bold">
                    {job.status}
                  </Badge>
                </div>
              </DialogHeader>
            </div>

            <Tabs defaultValue="overview" className="flex-1 flex flex-col overflow-hidden">
              <ScrollArea orientation="horizontal" className="border-b border-border bg-white h-16 w-full">
                <TabsList className="px-6 md:px-10 bg-transparent rounded-none h-16 gap-6 md:gap-10 w-max min-w-full">
                  <TabsTrigger value="overview" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-4 data-[state=active]:border-primary rounded-none px-0 h-full text-[10px] md:text-xs uppercase tracking-widest font-bold">Overview</TabsTrigger>
                  <TabsTrigger value="applications" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-4 data-[state=active]:border-primary rounded-none px-0 h-full text-[10px] md:text-xs uppercase tracking-widest font-bold">Applications ({applications.length})</TabsTrigger>
                  <TabsTrigger value="submissions" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-4 data-[state=active]:border-primary rounded-none px-0 h-full text-[10px] md:text-xs uppercase tracking-widest font-bold">Submissions ({submissions.length})</TabsTrigger>
                  <TabsTrigger value="payments" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-4 data-[state=active]:border-primary rounded-none px-0 h-full text-[10px] md:text-xs uppercase tracking-widest font-bold">Escrow & Payments</TabsTrigger>
                </TabsList>
              </ScrollArea>

              <ScrollArea className="flex-1 p-10 bg-secondary/10">
                <TabsContent value="overview" className="mt-0 space-y-10">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                    <section className="lg:col-span-2 space-y-4">
                      <h4 className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground flex items-center gap-2">
                        <FileText size={14} className="text-primary" /> Project Brief
                      </h4>
                      <div className="bg-white p-8 rounded-[2rem] border border-border shadow-sm space-y-6">
                      <div className="text-base leading-relaxed text-foreground">
                        {job.description}
                      </div>
                      <div className="grid md:grid-cols-2 gap-8 pt-6 border-t border-border">
                        <div className="space-y-3">
                          <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Requirements</p>
                          <ul className="space-y-2">
                            {job.requirements?.map((req, i) => (
                              <li key={i} className="text-sm flex items-start gap-2">
                                <CheckCircle2 size={14} className="text-primary mt-0.5 shrink-0" />
                                {req}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div className="space-y-3">
                          <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Deadline</p>
                          <p className="text-sm font-bold flex items-center gap-2">
                            <Clock size={14} className="text-primary" /> {new Date(job.deadline).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </div>
                    </section>

                    {job.status === 'open' && (
                      <section className="space-y-4">
                        <ArchitectRecommendations job={job} />
                      </section>
                    )}
                  </div>

                  {isApproved && (
                    <section 
                      className="p-8 bg-primary/5 border border-primary/20 rounded-[2rem] flex items-center justify-between"
                    >
                      <div className="flex items-center gap-6">
                        <div className="p-4 bg-primary text-primary-foreground rounded-2xl shadow-lg shadow-primary/20">
                          <Logo iconClassName="w-10 h-10 text-primary-foreground" />
                        </div>
                        <div>
                          <h5 className="font-heading font-bold text-2xl tracking-tight">Council Ready</h5>
                          <p className="text-sm text-muted-foreground">All drawings have passed AI and Admin review. Ready for municipality submission.</p>
                        </div>
                      </div>
                      <Button onClick={() => handleCouncilSubmission(job)} className="bg-primary text-primary-foreground h-14 px-8 rounded-full font-bold shadow-xl shadow-primary/20 gap-2 group">
                        <Landmark size={20} /> Submit to Council <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                      </Button>
                    </section>
                  )}
                </TabsContent>

<TabsContent value="applications" className="mt-0 space-y-4 pb-20">
                {applications.map(app => (
                  <Card 
                    key={app.id} 
                    className="border-border shadow-sm bg-white rounded-3xl hover:shadow-xl transition-all border-l-4 border-l-primary overflow-hidden"
                  >
                    <CardContent className="p-0">
                      <div className="flex flex-col md:flex-row h-full">
                        {/* Portfolio Thumbnail */}
                        <div className="md:w-48 bg-secondary/30 relative overflow-hidden group">
                          {app.portfolioThumbnail ? (
                            <img 
                              src={app.portfolioThumbnail} 
                              alt="Portfolio Preview" 
                              className="w-full h-full object-cover transition-transform group-hover:scale-110"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
                              <Briefcase size={32} />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                            <span className="text-[10px] text-white font-bold uppercase tracking-widest">View Portfolio</span>
                          </div>
                        </div>

                        <div className="flex-1 p-8 flex flex-col md:flex-row justify-between gap-8">
                          <div className="space-y-4 flex-1">
                            <div className="flex flex-col space-y-1">
                              <div className="flex items-center gap-3">
                                <p className="font-heading font-bold text-2xl tracking-tight text-foreground">{app.architectName}</p>
                                {app.sacapNumber && (
                                  <div className="flex gap-2">
                                    <Badge variant="outline" className="text-[9px] px-2 py-0">SACAP: {app.sacapNumber}</Badge>
                                    <SACAPStatusBadge architectId={app.architectId} initialStatus={(app as any).sacapStatus} />
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                <ArchitectRating architectId={app.architectId} />
                                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest border-l border-border pl-3">
                                  {app.completedJobs || 0} Jobs Completed
                                </span>
                              </div>
                            </div>

                            <p className="text-sm text-muted-foreground leading-relaxed max-w-xl line-clamp-2 italic">
                              "{app.proposal}"
                            </p>

                            <div className="flex flex-wrap gap-2">
                              {app.specializations?.map((spec, i) => (
                                <Badge key={i} variant="secondary" className="text-[9px] bg-primary/5 text-primary border-primary/10 px-2 py-0">
                                  {spec}
                                </Badge>
                              ))}
                              {(!app.specializations || app.specializations.length === 0) && (
                                <Badge variant="secondary" className="text-[9px] bg-secondary text-muted-foreground px-2 py-0">
                                  General Architect
                                </Badge>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-col justify-between items-end gap-4 min-w-[140px]">
                            <div className="text-right">
                              <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold">Applied On</p>
                              <p className="text-xs font-bold">{new Date(app.createdAt).toLocaleDateString()}</p>
                            </div>
                            
                            <div className="flex flex-col gap-2 w-full">
                              <Button 
                                variant="outline"
                                className="w-full h-10 rounded-xl text-[10px] uppercase tracking-widest font-bold border-primary/20 hover:bg-primary hover:text-primary-foreground"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedApplication(app);
                                }}
                              >
                                View Full Profile
                              </Button>
                              {job.status === 'open' && app.status === 'pending' && (
                                <Button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAcceptApplication(app);
                                  }} 
                                  className="w-full bg-primary text-primary-foreground h-10 rounded-xl font-bold gap-2 shadow-lg shadow-primary/20 text-[10px] uppercase tracking-widest"
                                >
                                  Hire
                                </Button>
                              )}
                              {app.status === 'accepted' && (
                                <div className="bg-primary/10 text-primary rounded-xl px-4 py-2 flex items-center justify-center gap-2">
                                  <CheckCircle2 size={14} />
                                  <span className="text-[10px] font-bold uppercase tracking-widest">Hired</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                  {applications.length === 0 && (
                    <div className="py-20 text-center border-2 border-dashed border-border rounded-[2rem] bg-white/50">
                      <p className="text-muted-foreground italic">No applications received yet.</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="submissions" className="mt-0 space-y-6 pb-20">
                  {/* Step 1 & 2: Client upload capability */}
                  {job.status === 'in-progress' && (
                    <section className="space-y-4">
                      <h4 className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground flex items-center gap-2">
                        <UploadCloud size={14} className="text-primary" /> Upload New Drawing for AI Review
                      </h4>
                      <div 
                        className={`p-10 border-2 border-dashed rounded-[2rem] transition-all flex flex-col items-center justify-center text-center gap-4 ${
                          isDragging ? 'border-primary bg-primary/5 scale-[1.01]' : 'border-border bg-white hover:border-primary/30'
                        }`}
                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={handleDrop}
                      >
                        <div className="p-4 bg-primary/10 text-primary rounded-2xl">
                          {isUploading ? <Loader2 size={32} className="animate-spin" /> : <Plus size={32} />}
                        </div>
                        <div>
                          <p className="text-sm font-bold">Drag and drop your architectural plan</p>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mt-1">PDF, DWG, or High-Res Image (Max 20MB)</p>
                        </div>
                        <input 
                          type="file" 
                          ref={fileInputRef}
                          className="hidden" 
                          accept=".pdf,.dwg,image/*"
                          onChange={handleFileSelect}
                        />
                        <Button 
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isUploading}
                          variant="outline"
                          className="rounded-xl border-primary/20 text-xs font-bold uppercase tracking-widest px-8"
                        >
                          {isUploading ? 'Uploading...' : 'Select File'}
                        </Button>
                      </div>
                    </section>
                  )}

                  <div className="space-y-4">
                    <h4 className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground flex items-center gap-2">
                      <HistoryIcon size={14} className="text-primary" /> Submission History
                    </h4>
                    <div className="grid grid-cols-1 gap-3">
                      {submissions.map(sub => (
                        <SubmissionItem key={sub.id} sub={sub} userRole={user.role} />
                      ))}
                      {submissions.length === 0 && (
                        <div className="py-20 text-center border-2 border-dashed border-border rounded-[2rem] bg-white/50">
                          <p className="text-muted-foreground italic">No drawings submitted yet.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>

                <OrchestrationProgressModal progress={aiProgress} isOpen={!!aiProgress} />

                <TabsContent value="payments" className="mt-0 space-y-10">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <Card className="border-border shadow-sm bg-white rounded-[2rem] p-4">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Escrow Balance</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-4xl font-heading font-bold tracking-tighter">R {job.status === 'open' ? '0' : safeLocale(job.budget)}</div>
                        <p className="text-[10px] text-primary font-bold uppercase tracking-widest mt-2 flex items-center gap-1">
                          <ShieldCheck size={12} /> {job.status === 'open' ? 'Awaiting Hire' : 'Funds Secured in Escrow'}
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="border-border shadow-sm bg-white rounded-[2rem] p-4">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Payment Status</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-4xl font-heading font-bold tracking-tighter">{job.status === 'completed' ? '100%' : '0%'} Released</div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mt-2">
                          {job.status === 'completed' ? 'Project Finalized' : 'Awaiting Milestone Completion'}
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  {job.status === 'in-progress' && isApproved && (
                    <Button onClick={handleCompleteJob} className="w-full bg-primary text-primary-foreground h-16 rounded-2xl font-bold text-xl shadow-xl shadow-primary/20">
                      Release Final Payment & Complete Job
                    </Button>
                  )}

                  {job.status === 'completed' && (
                    <Dialog open={isRating} onOpenChange={setIsRating}>
                      <DialogTrigger render={<Button className="w-full bg-primary text-primary-foreground h-16 rounded-2xl font-bold text-xl shadow-xl shadow-primary/20">Rate Architect</Button>} />
                      <DialogContent className="sm:max-w-[500px] border-border bg-white rounded-3xl p-0 overflow-hidden">
                        <div className="bg-primary/5 p-8 border-b border-border">
                          <DialogHeader>
                            <DialogTitle className="font-heading text-3xl font-bold">Rate Architect</DialogTitle>
                            <DialogDescription>Share your experience working with this architect.</DialogDescription>
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
                              placeholder="How was the communication, quality of work, and SANS compliance knowledge?" 
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
                  )}

                  <section className="space-y-6">
                    <h4 className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground flex items-center gap-2">
                      <CreditCard size={14} className="text-primary" /> Payment Milestones
                    </h4>
                    <div className="space-y-4">
                      <MilestoneItem title="Initial Deposit" percentage={20} status="secured" />
                      <MilestoneItem title="Draft Approval" percentage={40} status="pending" />
                      <MilestoneItem title="Final Council Approval" percentage={40} status="pending" />
                    </div>
                  </section>
                </TabsContent>
              </ScrollArea>
            </Tabs>
          </DialogContent>
        </Dialog>
</CardFooter>
      
      {/* Application Details Dialog */}
      <Dialog open={!!selectedApplication} onOpenChange={() => setSelectedApplication(null)}>
        <DialogContent className="sm:max-w-[900px] max-w-4xl border-border bg-white rounded-3xl p-0 overflow-hidden flex flex-col h-[90vh]">
          <div className="bg-primary/5 p-8 border-b border-border shrink-0">
            <DialogHeader>
              <div className="flex justify-between items-center">
                <div>
                  <DialogTitle className="font-heading text-3xl font-bold">Application Details</DialogTitle>
                  <DialogDescription>Review architect proposal and portfolio gallery</DialogDescription>
                </div>
                <div className="flex gap-3">
                  {selectedApplication && job.status === 'open' && selectedApplication.status === 'pending' && (
                    <Button 
                      onClick={() => {
                        handleAcceptApplication(selectedApplication);
                        setSelectedApplication(null);
                      }}
                      className="bg-primary text-primary-foreground h-12 px-6 rounded-xl font-bold gap-2 shadow-lg shadow-primary/20"
                    >
                      <CheckCircle2 size={18} /> Hire Architect
                    </Button>
                  )}
                  <Button 
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedApplication(null)}
                    className="rounded-full"
                  >
                    <X size={20} />
                  </Button>
                </div>
              </div>
            </DialogHeader>
          </div>
          
          <ScrollArea className="flex-1">
            {selectedApplication && (
              <div className="p-8 space-y-10 pb-20">
                {/* Proposal Section */}
                <section className="space-y-4">
                  <h4 className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground flex items-center gap-2">
                    <FileText size={14} className="text-primary" /> Proposal from {selectedApplication.architectName}
                  </h4>
                  <div className="bg-secondary/30 p-8 rounded-[2rem] border border-border">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{selectedApplication.proposal}</p>
                  </div>
                </section>

                <div className="border-t border-border pt-10">
                  <h4 className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground flex items-center gap-2 mb-6">
                    <User size={14} className="text-primary" /> Full Architect Profile & Portfolio
                  </h4>
                  <ArchitectPortfolio architectId={selectedApplication.architectId} />
                </div>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
      
      {isChatOpen && selectedArchitect && (
        <Chat
          job={job}
          currentUser={user}
          otherUser={selectedArchitect}
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
        />
      )}
    </Card>
  );
}

function MilestoneItem({ title, percentage, status }: { title: string, percentage: number, status: 'secured' | 'pending' | 'released' }) {
  return (
    <div className="flex items-center justify-between p-6 bg-white border border-border rounded-2xl shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-6">
        <div className={`w-3 h-3 rounded-full ${status === 'secured' ? 'bg-primary animate-pulse' : 'bg-secondary'}`} />
        <div>
          <p className="text-lg font-bold tracking-tight">{title}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">{percentage}% of Budget</p>
        </div>
      </div>
      <Badge variant="outline" className={`px-4 py-1 rounded-full font-bold uppercase tracking-widest text-[10px] ${status === 'secured' ? 'bg-primary/5 text-primary border-primary/10' : ''}`}>
        {status}
      </Badge>
    </div>
  );
}

function SACAPStatusBadge({ architectId, initialStatus }: { architectId: string, initialStatus?: string }) {
  const [status, setStatus] = useState<string | undefined>(initialStatus);

  useEffect(() => {
    if (status) return; // Use initial status if provided

    const fetchProfile = async () => {
      const snap = await getDoc(doc(db, 'architect_profiles', architectId));
      if (snap.exists()) {
        setStatus((snap.data() as ArchitectProfile).sacapStatus);
      }
    };
    fetchProfile();
  }, [architectId, status]);

  if (!status) return null;

  if (status === 'verified') {
    return (
      <Badge className="bg-green-50 text-green-700 border-green-100 gap-1 text-[9px] px-2 py-0 border">
        <ShieldCheck size={10} /> SACAP Verified
      </Badge>
    );
  }

  if (status === 'failed') {
    return (
      <Badge variant="destructive" className="gap-1 text-[9px] px-2 py-0 border">
        <ShieldX size={10} /> Unverified
      </Badge>
    );
  }

  return null;
}

function ArchitectRating({ architectId }: { architectId: string }) {
  const [stats, setStats] = useState<{ avg: number, count: number }>({ avg: 0, count: 0 });

  useEffect(() => {
    const q = query(collection(db, 'reviews'), where('toId', '==', architectId));
    const unsub = onSnapshot(q, (snapshot) => {
      const reviews = snapshot.docs.map(doc => doc.data());
      if (reviews.length > 0) {
        const sum = reviews.reduce((acc, r) => acc + (r.rating || 0), 0);
        setStats({
          avg: Number((sum / reviews.length).toFixed(1)),
          count: reviews.length
        });
      }
    });
    return () => unsub();
  }, [architectId]);

  if (stats.count === 0) return <Badge variant="outline" className="text-[10px] uppercase tracking-widest opacity-50">No reviews</Badge>;

  return (
    <div className="flex items-center gap-2 bg-primary/5 px-3 py-1 rounded-full border border-primary/10">
      <div className="flex items-center gap-0.5 text-primary">
        <Star size={12} fill="currentColor" />
        <span className="text-xs font-bold">{stats.avg}</span>
      </div>
      <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">({stats.count} {stats.count === 1 ? 'review' : 'reviews'})</span>
    </div>
  );
}
