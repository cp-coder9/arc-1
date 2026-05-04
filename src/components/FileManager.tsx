import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, where, onSnapshot, doc, orderBy, getDoc, addDoc, updateDoc, getDocs } from 'firebase/firestore';

import { UserProfile, UploadedFile, Job, AIProgress } from '../types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { badgeVariants } from './ui/badge';
import { Input } from './ui/input';
import { toast } from 'sonner';
import { reviewDrawing } from '../services/geminiService';
import { notificationService } from '../services/notificationService';
import { MAX_UPLOAD_SIZE_LABEL, uploadAndTrackFile } from '../lib/uploadService';
import { 
  File, 
  FileText, 
  Image as ImageIcon, 
  FileCode, 
  Download, 
  Trash2, 
  Search, 
  Filter, 
  Clock, 
  User, 
  ExternalLink,
  Loader2,
  FileArchive,
  HardDrive
} from 'lucide-react';
import { safeFormat, cn } from '@/lib/utils';

interface FileManagerProps {
  user: UserProfile;
}

export default function FileManager({ user }: FileManagerProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [scanningId, setScanningId] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState<AIProgress | null>(null);
  const [uploadJobId, setUploadJobId] = useState('');
  const [newPlanFile, setNewPlanFile] = useState<File | null>(null);
  const [isUploadingPlan, setIsUploadingPlan] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fileMap = new Map<string, UploadedFile>();
    const unsubscribes: Array<() => void> = [];

    const publish = () => {
      if (cancelled) return;
      setFiles(
        Array.from(fileMap.values()).sort((a, b) =>
          String(b.uploadedAt || '').localeCompare(String(a.uploadedAt || ''))
        )
      );
      setLoading(false);
    };

    const applySnapshot = (snapshot: any) => {
      if (typeof snapshot.docChanges === 'function') {
        snapshot.docChanges().forEach((change: any) => {
          if (change.type === 'removed') {
            fileMap.delete(change.doc.id);
          } else {
            fileMap.set(change.doc.id, { id: change.doc.id, ...change.doc.data() } as UploadedFile);
          }
        });
      } else {
        snapshot.docs.forEach((fileDoc: any) => {
          fileMap.set(fileDoc.id, { id: fileDoc.id, ...fileDoc.data() } as UploadedFile);
        });
      }
      publish();
    };

    const subscribeToFiles = (fileQuery: ReturnType<typeof query>) => {
      const unsubscribe = onSnapshot(fileQuery, applySnapshot, (error) => {
        console.error("Error fetching files:", error);
        toast.error(
          error.code === 'permission-denied'
            ? "You don't have permission to view one or more project file lists. Ask an admin to deploy the latest Firestore rules."
            : "Failed to load files"
        );
        setLoading(false);
      });
      unsubscribes.push(unsubscribe);
    };

    const subscribe = async () => {
      if (user.role === 'admin') {
        subscribeToFiles(query(collection(db, 'uploaded_files'), orderBy('uploadedAt', 'desc')));
        return;
      }

      // Always show files uploaded by this user.
      subscribeToFiles(query(collection(db, 'uploaded_files'), where('uploadedBy', '==', user.uid), orderBy('uploadedAt', 'desc')));

      // Also show files linked to projects this user participates in. This fixes
      // the File Manager hiding project files uploaded by a client, architect, or
      // admin when the current user did not personally upload the file.
      const jobIds = new Set<string>();
      const jobQueries = user.role === 'client'
        ? [query(collection(db, 'jobs'), where('clientId', '==', user.uid))]
        : user.role === 'architect'
          ? [query(collection(db, 'jobs'), where('selectedArchitectId', '==', user.uid))]
          : [];

      for (const jobQuery of jobQueries) {
        const snapshot = await getDocs(jobQuery);
        snapshot.docs.forEach(jobDoc => jobIds.add(jobDoc.id));
      }

      const ids = Array.from(jobIds);
      for (let i = 0; i < ids.length; i += 10) {
        subscribeToFiles(query(collection(db, 'uploaded_files'), where('jobId', 'in', ids.slice(i, i + 10))));
      }

      if (ids.length === 0) publish();
    };

    subscribe().catch((error) => {
      console.error("Error preparing file subscriptions:", error);
      toast.error("Failed to load project files");
      setLoading(false);
    });

    return () => {
      cancelled = true;
      unsubscribes.forEach(unsubscribe => unsubscribe());
    };
  }, [user.uid, user.role]);

  const handleDelete = async (file: UploadedFile) => {
    if (!confirm(`Are you sure you want to delete ${file.fileName}?`)) return;
    
    setDeletingId(file.id);
    try {
      // 1. Get Firebase ID token for authorization
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error("Not authenticated");

      // 2. Call secure server-side delete endpoint
      const response = await fetch('/api/files/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          fileId: file.id,
          fileUrl: file.url
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete file");
      }
      
      toast.success("File deleted successfully");
    } catch (error: any) {
      console.error("Error deleting file:", error);
      toast.error(error.message || "Failed to delete file");
    } finally {
      setDeletingId(null);
    }
  };

  const handleQuickScan = async (file: UploadedFile) => {
    if (!file.jobId) {
      toast.error('This file is not linked to a job. Upload or choose a project-linked plan before scanning.');
      return;
    }

    setScanningId(file.id);
    setScanProgress({
      percentage: 0,
      agentName: 'Orchestrator',
      activity: 'Preparing quick scan...',
      completedAgents: [],
    });

    let submissionRef: Awaited<ReturnType<typeof addDoc>> | null = null;

    try {
      const jobSnap = await getDoc(doc(db, 'jobs', file.jobId));
      if (!jobSnap.exists()) throw new Error(`Job ${file.jobId} could not be found.`);

      const job = { id: jobSnap.id, ...jobSnap.data() } as Job;
      const architectId = job.selectedArchitectId || user.uid;

      submissionRef = await addDoc(collection(db, `jobs/${file.jobId}/submissions`), {
        jobId: file.jobId,
        architectId,
        drawingUrl: file.url,
        drawingName: file.fileName,
        status: 'ai_reviewing',
        traceability: [{
          timestamp: new Date().toISOString(),
          actor: user.uid,
          action: 'quickscan_started',
          details: `Architect started AR orchestration quick scan for ${file.fileName}`,
        }],
        sourceFileId: file.id,
        createdAt: new Date().toISOString(),
      });

      await notificationService.notifyDrawingSubmitted(job.clientId, file.fileName, file.jobId, submissionRef.id);

      const aiReview = await reviewDrawing(
        file.url,
        file.fileName,
        (progress) => setScanProgress(progress),
        submissionRef.id
      );

      const architectComment = window.prompt(
        `AI quick scan ${aiReview.status}. Add your comment for the client before sending the notification:`,
        aiReview.feedback
      )?.trim();

      if (!architectComment) {
        throw new Error('Architect comment is required before notifying the client.');
      }

      await updateDoc(doc(db, `jobs/${file.jobId}/submissions`, submissionRef.id), {
        status: aiReview.status === 'passed' ? 'ai_passed' : 'ai_failed',
        aiFeedback: aiReview.feedback,
        aiStructuredFeedback: aiReview.categories,
        visualReportUrl: aiReview.visualReportUrl || null,
        architectComment,
        traceability: [
          {
            timestamp: new Date().toISOString(),
            actor: user.uid,
            action: 'quickscan_started',
            details: `Architect started AR orchestration quick scan for ${file.fileName}`,
          },
          {
            timestamp: new Date().toISOString(),
            actor: 'ai_orchestrator',
            action: `ai_${aiReview.status}`,
            details: aiReview.traceLog || aiReview.feedback,
          },
          {
            timestamp: new Date().toISOString(),
            actor: user.uid,
            action: 'architect_comment_added',
            details: architectComment,
          },
        ],
      });

      await notificationService.notifyAIReviewComplete(
        job.clientId,
        architectId,
        file.fileName,
        aiReview.status,
        file.jobId,
        submissionRef.id
      );

      toast.success('Quick scan complete. Client notification sent.');
    } catch (error: any) {
      if (submissionRef && file.jobId) {
        await updateDoc(doc(db, `jobs/${file.jobId}/submissions`, submissionRef.id), {
          status: 'ai_failed',
          aiFeedback: error.message || 'Quick scan failed',
        }).catch(() => undefined);
      }
      toast.error(error.message || 'Quick scan failed');
    } finally {
      setScanningId(null);
      setScanProgress(null);
    }
  };

  const handleUploadNewPlan = async () => {
    if (!newPlanFile) {
      toast.error('Choose a PDF or image plan to upload.');
      return;
    }

    if (!uploadJobId.trim()) {
      toast.error('Enter the job ID before uploading the plan.');
      return;
    }

    if (newPlanFile.type !== 'application/pdf' && !newPlanFile.type.startsWith('image/')) {
      toast.error('Only PDF or image floor plans can be quickscanned.');
      return;
    }

    if (newPlanFile.size > 20 * 1024 * 1024) {
      toast.error(`Plan is too large. Maximum upload size is ${MAX_UPLOAD_SIZE_LABEL}.`);
      return;
    }

    setIsUploadingPlan(true);
    try {
      await uploadAndTrackFile(newPlanFile, {
        fileName: newPlanFile.name,
        fileType: newPlanFile.type,
        fileSize: newPlanFile.size,
        uploadedBy: user.uid,
        context: 'submission',
        jobId: uploadJobId.trim(),
      });

      setNewPlanFile(null);
      toast.success('Plan uploaded. Use Scan on the file card to start AR orchestration.');
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload plan');
    } finally {
      setIsUploadingPlan(false);
    }
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <ImageIcon className="w-6 h-6 text-blue-500" />;
    if (type === 'application/pdf') return <FileText className="w-6 h-6 text-red-500" />;
    if (type === 'application/dwg' || type === 'application/dxf') return <FileCode className="w-6 h-6 text-green-500" />;
    if (type.includes('zip') || type.includes('rar')) return <FileArchive className="w-6 h-6 text-orange-500" />;
    if (type.includes('json') || type.includes('javascript') || type.includes('typescript')) return <FileCode className="w-6 h-6 text-purple-500" />;
    return <File className="w-6 h-6 text-slate-500" />;
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const filteredFiles = files.filter(f => 
    f.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.context.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-8 rounded-[2rem] border border-border shadow-sm">
        <div>
          <h2 className="text-3xl font-heading font-bold tracking-tight flex items-center gap-3">
            <HardDrive className="text-primary w-8 h-8" />
            File Management
          </h2>
          <p className="text-muted-foreground mt-1">
            {user.role === 'admin' 
              ? 'Oversee all architectural assets across the platform.' 
              : 'Digital archive of all your project uploads and documents.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search files..." 
              className="pl-10 h-10 rounded-full border-border bg-secondary/20"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {user.role === 'architect' && (
        <Card className="rounded-[2rem] border-border bg-white shadow-sm">
          <CardHeader>
            <CardTitle>Upload New Plan for Quick Scan</CardTitle>
            <CardDescription>Attach a completed floor plan to an active job, then scan it with the AR orchestration agents.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1.4fr_auto] md:items-center">
            <Input
              aria-label="Job ID for plan upload"
              placeholder="Job ID, e.g. 177847582"
              value={uploadJobId}
              onChange={(event) => setUploadJobId(event.target.value)}
            />
            <Input
              aria-label="New plan file"
              type="file"
              accept="application/pdf,image/*"
              onChange={(event) => setNewPlanFile(event.target.files?.[0] || null)}
            />
            <Button onClick={handleUploadNewPlan} disabled={isUploadingPlan} className="rounded-full font-bold">
              {isUploadingPlan ? 'Uploading...' : 'Upload Plan'}
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredFiles.map((file) => (
          <Card key={file.id} className="group overflow-hidden rounded-[1.5rem] border-border hover:border-primary/50 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 bg-white">
            <div className="aspect-video bg-secondary/30 flex items-center justify-center relative group-hover:bg-secondary/10 transition-colors">
              {file.fileType.startsWith('image/') ? (
                <img 
                  src={file.url} 
                  alt={file.fileName} 
                  className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="p-6 bg-white rounded-2xl shadow-sm border border-border">
                  {getFileIcon(file.fileType)}
                </div>
              )}
              <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                <Button 
                  variant="secondary" 
                  size="icon" 
                  className="w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm shadow-sm"
                  onClick={() => window.open(file.url, '_blank')}
                >
                  <Download className="w-4 h-4" />
                </Button>
                {(user.role === 'admin' || file.uploadedBy === user.uid) && (
                  <Button 
                    variant="destructive" 
                    size="icon" 
                    className="w-8 h-8 rounded-full shadow-sm"
                    onClick={() => handleDelete(file)}
                    disabled={deletingId === file.id}
                  >
                    {deletingId === file.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </Button>
                )}
              </div>
              <div className="absolute bottom-3 left-3">
                <div className={cn(
                  badgeVariants({ variant: 'outline' }),
                  "bg-white/90 backdrop-blur-sm border-none shadow-sm text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
                )}>
                  {file.context}
                </div>
              </div>
            </div>
            <CardContent className="p-5">
              <div className="flex flex-col gap-1 mb-3">
                <h4 className="font-bold text-sm truncate" title={file.fileName}>{file.fileName}</h4>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span className="font-medium">{formatSize(file.fileSize)}</span>
                  <span>•</span>
                  <span>{file.fileType?.split('/')[1]?.toUpperCase() || 'FILE'}</span>
                </div>
              </div>
              
              <div className="pt-3 border-t border-border flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  {safeFormat(file.uploadedAt, 'MMM d, yyyy')}
                </div>
                <div className="flex items-center gap-2">
                  {user.role === 'architect' && (file.fileType === 'application/pdf' || file.fileType.startsWith('image/')) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-[9px] font-bold uppercase tracking-widest text-primary hover:bg-primary/5"
                      onClick={() => handleQuickScan(file)}
                      disabled={scanningId === file.id}
                    >
                      {scanningId === file.id ? 'Scanning...' : 'Scan'}
                    </Button>
                  )}
                  {user.role === 'admin' && (
                    <div className="flex items-center gap-1 text-[8px] font-bold text-primary uppercase tracking-tighter">
                      <User className="w-2.5 h-2.5" />
                      {(file.uploadedBy || '').substring(0, 6)}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {filteredFiles.length === 0 && (
          <div className="col-span-full py-20 bg-secondary/10 rounded-[2rem] border-2 border-dashed border-border flex flex-col items-center justify-center gap-4 text-center">
            <div className="p-4 bg-white rounded-full shadow-sm">
              <HardDrive className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <p className="text-lg font-bold text-foreground">No files found</p>
              <p className="text-sm text-muted-foreground">Try adjusting your search or upload new documents.</p>
            </div>
          </div>
        )}
      </div>
      {scanProgress && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm rounded-2xl border border-border bg-white p-4 shadow-xl">
          <p className="text-xs font-black uppercase tracking-widest text-primary">AR Orchestration Automated Process</p>
          <p className="mt-2 text-sm font-bold text-foreground">{scanProgress.agentName}</p>
          <p className="text-xs text-muted-foreground">{scanProgress.activity}</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
            <div className="h-full bg-primary transition-all" style={{ width: `${scanProgress.percentage}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}
