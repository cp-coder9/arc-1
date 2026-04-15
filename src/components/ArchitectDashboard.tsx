import React, { useState, useEffect, useRef } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, doc, updateDoc, getDocs, getDoc } from 'firebase/firestore';
import { put } from '@vercel/blob';
import { UserProfile, Job, Application, Submission, DelegatedTask } from '../types';
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
import { Search, Briefcase, FileUp, CheckCircle2, Clock, AlertCircle, ExternalLink, CreditCard, Landmark, Building, UploadCloud, ShieldCheck, History, Star, Send, Loader2, Sparkles, User, Cpu, Shield, ArrowRight, Users, Plus, Eye, MessageCircle } from 'lucide-react';
import { reviewDrawing, AIReviewResult, AIProgress } from '../services/geminiService';
import { notificationService } from '../services/notificationService';
import ReactMarkdown from 'react-markdown';
import { format } from 'date-fns';
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

  // Map sidebar tabs to internal dashboard tabs
  const internalTab = activeTab === 'marketplace' ? 'browse' : activeTab === 'projects' ? 'active' : 'browse';

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

    return () => {
      unsubAll();
      unsubMy();
    };
  }, [user.uid]);

  return (
    <div className="space-y-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 bg-white p-10 rounded-[2.5rem] border border-border shadow-sm">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <h1 className="text-5xl font-heading font-bold tracking-tighter text-foreground">Architect Studio</h1>
            <ProfileEditor user={user} />
          </div>
          <p className="text-muted-foreground text-lg max-w-2xl leading-relaxed">Find new opportunities and submit your SANS compliant drawings on Architex.</p>
        </div>
      </div>

      <Tabs value={internalTab} onValueChange={(val) => onTabChange?.(val === 'browse' ? 'marketplace' : 'projects')} className="w-full">
        <TabsList className="bg-secondary/50 border border-border p-1 rounded-full w-fit">
          <TabsTrigger value="browse" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full px-8">Browse Jobs</TabsTrigger>
          <TabsTrigger value="active" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full px-8">My Active Projects</TabsTrigger>
        </TabsList>

        <TabsContent value="browse" className="mt-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {availableJobs.map(job => (
              <BrowseJobItem key={job.id} job={job} user={user} />
            ))}
            {availableJobs.length === 0 && (
              <div className="col-span-full py-20 text-center border-2 border-dashed border-border rounded-3xl bg-white/50">
                <p className="text-muted-foreground italic">No new jobs available at the moment.</p>
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
      </Tabs>
    </div>
  );
}

function BrowseJobItem({ job, user }: { job: Job, user: UserProfile }) {
  const [proposal, setProposal] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [hasApplied, setHasApplied] = useState(false);

  useEffect(() => {
    const checkApplied = async () => {
      const q = query(collection(db, `jobs/${job.id}/applications`), where('architectId', '==', user.uid));
      const snap = await getDocs(q);
      setHasApplied(!snap.empty);
    };
    checkApplied();
  }, [job.id, user.uid]);

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, `jobs/${job.id}/applications`), {
        jobId: job.id,
        architectId: user.uid,
        architectName: user.displayName,
        proposal,
        portfolioUrl,
        status: 'pending',
        createdAt: new Date().toISOString()
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
      toast.success("Application submitted");
    } catch (error) {
      toast.error("Failed to submit application");
    }
  };

  return (
    <Card className="border-border shadow-sm bg-white hover:shadow-md transition-shadow rounded-2xl overflow-hidden group">
      <CardHeader className="p-8">
        <div className="flex justify-between items-start mb-4">
          <div className="flex gap-2">
            <Badge variant="secondary" className="bg-primary/5 text-primary border-primary/10 uppercase text-[10px] tracking-widest px-3 py-1">Open</Badge>
            <Badge variant="outline" className="border-primary/20 text-primary uppercase text-[10px] tracking-widest px-3 py-1">{job.category}</Badge>
          </div>
          <span className="text-lg font-bold text-primary font-mono">R {job.budget.toLocaleString()}</span>
        </div>
        <CardTitle className="font-heading font-bold text-2xl group-hover:text-primary transition-colors tracking-tight">{job.title}</CardTitle>
        <CardDescription className="line-clamp-2 leading-relaxed mt-2">{job.description}</CardDescription>
      </CardHeader>
      <CardFooter className="bg-secondary/20 p-6 border-t border-border">
        <Dialog open={isApplying} onOpenChange={setIsApplying}>
          <DialogTrigger render={<Button disabled={hasApplied} variant="outline" className="w-full h-12 rounded-xl text-xs uppercase tracking-widest font-bold border-primary/20 hover:bg-primary hover:text-primary-foreground transition-all">{hasApplied ? 'Already Applied' : 'Apply for Job'}</Button>} />
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

function ActiveProjectItem({ job, user }: { job: Job, user: UserProfile }) {
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
    setUploadProgress(0);
    setDrawingName(file.name.split('.')[0]);

    try {
      const blob = await put(file.name, file, {
        access: 'public',
        token: import.meta.env.VITE_BLOB_READ_WRITE_TOKEN,
        addRandomSuffix: true,
      });
      setDrawingUrl(blob.url);
      setIsUploading(false);
      toast.success("File uploaded successfully!");
      
      // Automatically run AI pre-check
      handlePreCheck(blob.url, file.name.split('.')[0]);
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
      const { logSystemEvent } = await import('../services/geminiService');
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
              <SubmissionItem key={sub.id} sub={sub} />
            ))}
            {submissions.length === 0 && <p className="text-xs text-muted-foreground italic">No drawings submitted yet.</p>}
          </div>
        </div>
      </div>

      <CardFooter className="bg-secondary/20 p-6 border-t border-border gap-3">
        {job.status === 'completed' ? (
          <Dialog open={isRating} onOpenChange={setIsRating}>
            <DialogTrigger render={<Button variant="outline" className="w-full h-12 rounded-xl text-xs uppercase tracking-widest font-bold border-primary/20 hover:bg-primary hover:text-primary-foreground transition-all">Rate Client</Button>} />
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
            <DialogTrigger render={<Button variant="outline" className="w-full h-12 rounded-xl text-xs uppercase tracking-widest font-bold border-primary/20 hover:bg-primary hover:text-primary-foreground transition-all">Submit New Drawing</Button>} />
            <DialogContent className="max-w-2xl border-border bg-white/95 backdrop-blur-md p-0 overflow-hidden rounded-[2rem] shadow-2xl">
              <div className="bg-primary/5 p-10 border-b border-border">
                <DialogHeader>
                  <DialogTitle className="font-heading font-bold text-4xl tracking-tighter">Submit Drawing</DialogTitle>
                  <DialogDescription className="text-muted-foreground text-base mt-2">Upload technical drawings for AI SANS 10400 compliance check.</DialogDescription>
                </DialogHeader>
              </div>
              <form onSubmit={handleSubmitDrawing} className="p-10 space-y-8">
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  onChange={handleFileSelect}
                  accept=".pdf,.dwg,image/*"
                />
                <div 
                  className={`border-2 border-dashed rounded-[2rem] p-16 text-center transition-all relative overflow-hidden ${
                    isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30 bg-secondary/20'
                  }`}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                >
                  {isUploading && (
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center p-8 z-10">
                      <div className="w-full max-w-xs space-y-4">
                        <div className="flex justify-between items-end">
                          <p className="text-sm font-bold text-primary">Uploading Drawing...</p>
                          <p className="text-xs font-mono font-bold">{uploadProgress}%</p>
                        </div>
                        <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary transition-all duration-300"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col items-center gap-4">
                    {drawingUrl && isImage ? (
                      <div className="relative w-full max-w-md aspect-video rounded-xl overflow-hidden border border-border shadow-sm mb-2">
                        <img src={drawingUrl} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </div>
                    ) : (
                      <div className="p-6 bg-white rounded-full text-primary shadow-xl shadow-primary/10">
                        <UploadCloud size={48} />
                      </div>
                    )}
                    <div>
                      <p className="text-lg font-bold tracking-tight">
                        {drawingUrl ? 'File Ready' : 'Drag and drop your PDF/CAD/Image file'}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {drawingUrl ? drawingName : 'Maximum file size: 20MB'}
                      </p>
                    </div>
                    <Button 
                      type="button" 
                      variant="outline" 
                      className="mt-4 rounded-full px-8 border-primary/20 font-bold"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {drawingUrl ? 'Change File' : 'Browse Files'}
                    </Button>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Drawing Name</label>
                    <Input 
                      placeholder="e.g. Ground Floor Plan - Rev A" 
                      value={drawingName}
                      onChange={e => setDrawingName(e.target.value)}
                      required
                      className="border-border focus-visible:ring-primary h-12 rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Drawing URL</label>
                    <Input 
                      placeholder="Upload a file to get URL" 
                      value={drawingUrl}
                      readOnly
                      required
                      className="border-border focus-visible:ring-primary h-12 rounded-xl bg-secondary/20 cursor-not-allowed"
                    />
                  </div>
                </div>

                <div className="p-6 bg-primary/5 border border-primary/20 rounded-2xl flex flex-col gap-4">
                  <div className="flex gap-4">
                    <Sparkles className="text-primary shrink-0" size={24} />
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-foreground">AI Compliance Pre-check</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Run an autonomous scan for **SANS 10400** compliance before final submission.
                      </p>
                    </div>
                  </div>
                  
                  {preCheckResult ? (
                    <div className={`p-6 rounded-2xl border ${preCheckResult.status === 'passed' ? 'bg-green-50/50 border-green-100' : 'bg-red-50/50 border-red-100'}`}>
                      <div className="flex items-center gap-2 mb-4">
                        {preCheckResult.status === 'passed' ? (
                          <CheckCircle2 className="text-green-600" size={20} />
                        ) : (
                          <AlertCircle className="text-red-600" size={20} />
                        )}
                        <span className={`text-sm font-bold uppercase tracking-widest ${preCheckResult.status === 'passed' ? 'text-green-700' : 'text-red-700'}`}>
                          AI Pre-check: {preCheckResult.status}
                        </span>
                      </div>
                      
                      {preCheckResult.categories && preCheckResult.categories.length > 0 ? (
                        <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
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
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {isPreChecking && (
                        <div className="space-y-3">
                          <div className="flex justify-between items-center px-1">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-primary animate-pulse">
                              AI Orchestration in Progress...
                            </p>
                            <p className="text-[10px] font-mono font-bold text-muted-foreground">{aiProgress?.percentage || 0}%</p>
                          </div>
                          <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-primary transition-all duration-300"
                              style={{ width: `${aiProgress?.percentage || 0}%` }}
                            />
                          </div>
                        </div>
                      )}
                      <Button 
                        type="button" 
                        onClick={() => handlePreCheck()} 
                        disabled={isPreChecking || !drawingUrl}
                        className="w-full bg-white text-primary border border-primary/20 hover:bg-primary/5 h-12 rounded-xl font-bold gap-2"
                      >
                        {isPreChecking ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                        {isPreChecking ? 'Analyzing SANS Compliance...' : 'Run AI Pre-compliance Check'}
                      </Button>
                    </div>
                  )}
                </div>
                <Button 
                  type="submit" 
                  disabled={isPreChecking}
                  className="w-full bg-primary text-primary-foreground h-16 rounded-2xl font-bold text-xl shadow-xl shadow-primary/20"
                >
                  Submit for AI Review
                </Button>
              </form>
            </DialogContent>
</Dialog>
      )}
      {clientProfile && (
        <>
          <Button
            variant="outline"
            className="w-full h-12 rounded-xl text-xs uppercase tracking-widest font-bold border-primary/20 hover:bg-primary hover:text-primary-foreground transition-all"
            onClick={() => setIsChatOpen(true)}
          >
            <MessageCircle size={16} className="mr-2" />
            Message Client
          </Button>
          <Chat
            job={job}
            currentUser={user}
            otherUser={clientProfile}
            isOpen={isChatOpen}
            onClose={() => setIsChatOpen(false)}
          />
        </>
      )}
    </CardFooter>
    <OrchestrationProgressModal progress={aiProgress} isOpen={!!aiProgress} />
  </Card>
);
}

function DelegatedTasksList({ job, user }: { job: Job, user: UserProfile }) {
  const [tasks, setTasks] = useState<DelegatedTask[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [assigneeName, setAssigneeName] = useState('');
  const [assigneeRole, setAssigneeRole] = useState('');
  const [deadline, setDeadline] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const q = query(collection(db, `jobs/${job.id}/tasks`), where('architectId', '==', user.uid));
    const unsub = onSnapshot(q, (snapshot) => {
      setTasks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DelegatedTask)));
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
        status: 'pending',
        createdAt: new Date().toISOString()
      });
      setIsAdding(false);
      setAssigneeName('');
      setAssigneeRole('');
      setDeadline('');
      setNotes('');
      toast.success("Task delegated successfully");
    } catch (error) {
      toast.error("Failed to delegate task");
    }
  };

  const handleUpdateStatus = async (taskId: string, newStatus: string) => {
    try {
      await updateDoc(doc(db, `jobs/${job.id}/tasks`, taskId), {
        status: newStatus
      });
      toast.success("Task status updated");
    } catch (error) {
      toast.error("Failed to update status");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-xs text-muted-foreground">Manage tasks for your team members.</p>
        <Dialog open={isAdding} onOpenChange={setIsAdding}>
          <DialogTrigger render={
            <Button variant="outline" size="sm" className="h-8 text-xs rounded-full gap-1 border-primary/20 text-primary">
              <Plus size={14} /> Delegate Task
            </Button>
          } />
          <DialogContent className="sm:max-w-[500px] border-border bg-white rounded-3xl p-0 overflow-hidden">
            <div className="bg-primary/5 p-6 border-b border-border">
              <DialogHeader>
                <DialogTitle className="font-heading text-2xl font-bold">Delegate Task</DialogTitle>
                <DialogDescription>Assign a task to a team member for this project.</DialogDescription>
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
                  <Input required value={assigneeRole} onChange={e => setAssigneeRole(e.target.value)} placeholder="e.g. Draftsman" className="rounded-xl" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Deadline</label>
                <Input required type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className="rounded-xl" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Task Notes</label>
                <Textarea required value={notes} onChange={e => setNotes(e.target.value)} placeholder="Describe the task..." className="rounded-xl min-h-[100px]" />
              </div>
              <Button type="submit" className="w-full rounded-xl h-12 font-bold">Assign Task</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {tasks.length > 0 ? (
        <div className="space-y-3">
          {tasks.map(task => (
            <div key={task.id} className="p-4 rounded-2xl border border-border bg-secondary/10 flex flex-col gap-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-bold text-sm">{task.assigneeName} <span className="text-muted-foreground font-normal">({task.assigneeRole})</span></p>
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><Clock size={12} /> Due: {new Date(task.deadline).toLocaleDateString()}</p>
                </div>
                <select 
                  value={task.status}
                  onChange={(e) => handleUpdateStatus(task.id, e.target.value)}
                  className={`text-[10px] uppercase tracking-widest font-bold px-2 py-1 rounded-full border outline-none ${
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
              <p className="text-sm bg-white p-3 rounded-xl border border-black/5">{task.notes}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-6 text-center border border-dashed border-border rounded-2xl bg-secondary/5">
          <p className="text-xs text-muted-foreground italic">No tasks delegated yet.</p>
        </div>
      )}
    </div>
  );
}

function SubmissionItem({ sub }: { sub: Submission }) {
  const [isOpen, setIsOpen] = useState(false);

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'approved': return { label: 'Approved', color: 'bg-green-50 text-green-700 border-green-100', icon: CheckCircle2 };
      case 'ai_failed': return { label: 'AI Failed', color: 'bg-red-50 text-red-700 border-red-100', icon: AlertCircle };
      case 'admin_rejected': return { label: 'Admin Rejected', color: 'bg-red-50 text-red-700 border-red-100', icon: AlertCircle };
      case 'ai_reviewing': return { label: 'AI Reviewing', color: 'bg-blue-50 text-blue-700 border-blue-100', icon: Loader2 };
      case 'processing': return { label: 'Processing', color: 'bg-yellow-50 text-yellow-700 border-yellow-100', icon: Clock };
      case 'admin_reviewing': return { label: 'Awaiting Admin', color: 'bg-primary/5 text-primary border-primary/10', icon: Shield };
      default: return { label: status.replace('_', ' '), color: 'bg-secondary text-muted-foreground', icon: Clock };
    }
  };

  const config = getStatusConfig(sub.status);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger render={
        <button className="w-full p-4 border border-border rounded-xl flex items-center justify-between bg-white shadow-sm hover:border-primary/30 hover:shadow-md transition-all group text-left">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-secondary/50 text-muted-foreground group-hover:text-primary transition-colors">
              <FileUp size={16} />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold truncate max-w-[150px]">{sub.drawingName}</span>
              <span className="text-[10px] text-muted-foreground">{format(new Date(sub.createdAt), 'MMM d, HH:mm')}</span>
            </div>
          </div>
          <Badge variant="outline" className={`px-3 py-0.5 rounded-full font-bold uppercase tracking-widest text-[10px] flex items-center gap-1 ${config.color}`}>
            {sub.status === 'ai_reviewing' || sub.status === 'processing' ? <config.icon size={10} className="animate-spin" /> : <config.icon size={10} />}
            {config.label}
          </Badge>
        </button>
      } />
      <DialogContent className="max-w-3xl border-border bg-white p-0 overflow-hidden rounded-[2rem] shadow-2xl">
        <div className="bg-primary/5 p-8 border-b border-border">
          <DialogHeader>
            <div className="flex justify-between items-start">
              <div>
                <DialogTitle className="font-heading font-bold text-3xl tracking-tighter">{sub.drawingName}</DialogTitle>
                <DialogDescription className="text-muted-foreground mt-1 flex items-center gap-2">
                  Submitted on {format(new Date(sub.createdAt), 'MMMM d, yyyy HH:mm')}
                </DialogDescription>
              </div>
              <Badge className={`px-4 py-1.5 rounded-full font-bold uppercase tracking-widest text-xs ${config.color}`}>
                {config.label}
              </Badge>
            </div>
          </DialogHeader>
        </div>

        <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-8 max-h-[70vh] overflow-y-auto">
          <div className="md:col-span-2 space-y-8">
              <section className="space-y-4">
                <h4 className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground flex items-center gap-2">
                  <Sparkles size={14} className="text-primary" /> AI Compliance Feedback
                </h4>
                {sub.aiStructuredFeedback && sub.aiStructuredFeedback.length > 0 ? (
                  <div className="space-y-6">
                    {sub.aiStructuredFeedback.map((cat, i) => (
                      <div key={i} className="space-y-3">
                        <h5 className="text-[10px] font-bold text-primary uppercase tracking-widest flex items-center gap-2">
                          <div className="w-1 h-1 rounded-full bg-primary" /> {cat.name}
                        </h5>
                        <div className="grid gap-3">
                          {cat.issues.map((issue, j) => (
                            <div key={j} className={`p-4 rounded-2xl border ${
                              issue.severity === 'high' ? 'bg-red-50/50 border-red-100' :
                              issue.severity === 'medium' ? 'bg-yellow-50/50 border-yellow-100' :
                              'bg-blue-50/50 border-blue-100'
                            }`}>
                              <div className="flex justify-between items-start mb-2">
                                <p className="text-sm font-bold leading-tight">{issue.description}</p>
                                <Badge variant="outline" className={`text-[8px] font-bold uppercase px-2 py-0 h-4 ${
                                  issue.severity === 'high' ? 'border-red-200 text-red-700 bg-red-50' :
                                  issue.severity === 'medium' ? 'border-yellow-200 text-yellow-700 bg-yellow-50' :
                                  'border-blue-200 text-blue-700 bg-blue-50'
                                }`}>
                                  {issue.severity}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-black/5">
                                <div className="p-1 rounded-full bg-white shadow-sm">
                                  <CheckCircle2 size={10} className="text-primary" />
                                </div>
                                <p className="text-[10px] font-bold text-muted-foreground"><span className="text-primary">ACTION:</span> {issue.actionItem}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : sub.aiFeedback ? (
                  <div className="p-6 bg-secondary/30 rounded-2xl border border-border markdown-body text-sm leading-relaxed">
                    <ReactMarkdown>{sub.aiFeedback}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="p-10 text-center border-2 border-dashed border-border rounded-2xl bg-white/50">
                    <Loader2 className="mx-auto text-primary animate-spin mb-2" size={24} />
                    <p className="text-xs text-muted-foreground italic">AI is currently analyzing your drawing for SANS 10400 compliance...</p>
                  </div>
                )}
              </section>

            {sub.adminFeedback && (
              <section className="space-y-4">
                <h4 className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground flex items-center gap-2">
                  <ShieldCheck size={14} className="text-primary" /> Administrative Review
                </h4>
                <div className="p-6 bg-primary/5 rounded-2xl border border-primary/20 text-sm leading-relaxed italic">
                  "{sub.adminFeedback}"
                </div>
              </section>
            )}

            <section className="space-y-4">
              <h4 className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground flex items-center gap-2">
                <ExternalLink size={14} className="text-primary" /> Drawing Reference
              </h4>
              <a 
                href={sub.drawingUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center justify-between p-4 bg-white border border-border rounded-xl hover:border-primary/30 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <FileUp size={20} className="text-primary" />
                  <span className="text-sm font-medium">{sub.drawingName}</span>
                </div>
                <ArrowRight size={18} className="text-muted-foreground group-hover:text-primary transition-all group-hover:translate-x-1" />
              </a>
            </section>
          </div>

          <div className="space-y-6">
            <h4 className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground flex items-center gap-2">
              <History size={14} className="text-primary" /> Traceability Log
            </h4>
            <div className="relative space-y-6 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-border">
              {sub.traceability.map((log, idx) => (
                <div key={idx} className="relative pl-8">
                  <div className={`absolute left-0 top-1 w-6 h-6 rounded-full border-4 border-white shadow-sm flex items-center justify-center ${
                    log.actor === 'Architect' ? 'bg-primary' : 
                    log.actor === 'AI Orchestrator' ? 'bg-purple-500' : 
                    log.actor === 'System' ? 'bg-blue-500' : 'bg-green-500'
                  }`}>
                    {log.actor === 'Architect' ? <User size={10} className="text-white" /> : 
                     log.actor === 'AI Orchestrator' ? <Cpu size={10} className="text-white" /> : 
                     <Shield size={10} className="text-white" />}
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <p className="text-[10px] font-bold uppercase tracking-widest">{log.actor}</p>
                      <p className="text-[9px] text-muted-foreground">{format(new Date(log.timestamp), 'HH:mm')}</p>
                    </div>
                    <p className="text-xs font-bold text-foreground">{log.action}</p>
                    <p className="text-[10px] text-muted-foreground leading-tight">{log.details}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function OrchestrationProgressModal({ progress, isOpen }: { progress: AIProgress | null, isOpen: boolean }) {
  if (!progress) return null;

  const agents = [
    { name: 'Orchestrator', icon: Cpu },
    { name: 'Wall Compliance Agent', icon: Shield },
    { name: 'Fenestration Agent', icon: Eye },
    { name: 'Fire Safety Agent', icon: ShieldCheck },
    { name: 'Area Sizing Agent', icon: Search },
    { name: 'General Compliance Agent', icon: CheckCircle2 },
    { name: 'SANS Specialist', icon: Sparkles }
  ];

  return (
    <Dialog open={isOpen}>
      <DialogContent className="max-w-xl border-border bg-white p-0 overflow-hidden rounded-[2.5rem] shadow-2xl">
        <div className="bg-primary/5 p-10 border-b border-border relative overflow-hidden">
          {/* Animated Background Pulse */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent animate-pulse" />
          
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-6">
              <div>
                <Badge className="bg-primary/10 text-primary border-primary/20 mb-3 px-3 py-1 text-[10px] uppercase tracking-widest font-bold">
                  AI Orchestration in Progress
                </Badge>
                <DialogTitle className="font-heading font-bold text-4xl tracking-tighter">
                  {progress.percentage}% <span className="text-muted-foreground font-normal text-2xl">Analyzed</span>
                </DialogTitle>
              </div>
              <div className="p-4 bg-white rounded-2xl shadow-sm border border-border">
                <Cpu className="text-primary animate-spin" size={32} />
              </div>
            </div>

            <div className="w-full h-3 bg-secondary/30 rounded-full overflow-hidden mb-4">
              <div 
                className="h-full bg-primary transition-all duration-500 ease-out"
                style={{ width: `${progress.percentage}%` }}
              />
            </div>
            
            <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              <span>Scanning SANS 10400 Database</span>
              <span className="text-primary animate-pulse">{progress.activity}</span>
            </div>
          </div>
        </div>

        <div className="p-10 space-y-8">
          <div>
            <h4 className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-6 flex items-center gap-2">
              <Users size={14} className="text-primary" /> Active Workflow Agents
            </h4>
            
            <div className="grid grid-cols-1 gap-4">
              {agents.map((agent, idx) => {
                const isCompleted = progress.completedAgents.includes(agent.name);
                const isCurrent = progress.agentName === agent.name;
                
                return (
                  <div 
                    key={idx} 
                    className={`p-4 rounded-2xl border transition-all duration-300 flex items-center justify-between ${
                      isCurrent ? 'bg-primary/5 border-primary/20 shadow-sm scale-[1.02]' : 
                      isCompleted ? 'bg-secondary/10 border-border opacity-60' : 
                      'bg-white border-border opacity-40'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-xl ${isCurrent ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
                        <agent.icon size={18} className={isCurrent ? 'animate-pulse' : ''} />
                      </div>
                      <div>
                        <p className={`text-sm font-bold ${isCurrent ? 'text-primary' : 'text-foreground'}`}>
                          {agent.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {isCurrent ? progress.activity : isCompleted ? 'Compliance check finalized' : 'Awaiting orchestration...'}
                        </p>
                      </div>
                    </div>
                    {isCompleted ? (
                      <CheckCircle2 size={18} className="text-green-500" />
                    ) : isCurrent ? (
                      <Loader2 size={18} className="text-primary animate-spin" />
                    ) : (
                      <Clock size={18} className="text-muted-foreground" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="p-6 bg-secondary/10 rounded-2xl border border-border">
            <div className="flex items-start gap-4">
              <div className="p-2 bg-white rounded-lg shadow-sm">
                <Sparkles size={16} className="text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-bold mb-1">Current Task: {progress.agentName}</p>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  The {progress.agentName} is currently cross-referencing your drawing against specific SANS 10400 clauses to ensure full council readiness.
                </p>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
