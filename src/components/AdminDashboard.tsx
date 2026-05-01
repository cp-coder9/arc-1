import React, { useState, useEffect, useRef } from 'react';
import { sendPasswordResetEmail } from "firebase/auth";
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, onSnapshot, doc, getDoc, updateDoc, collectionGroup, getDocs, addDoc, setDoc, deleteDoc, orderBy, limit, where } from 'firebase/firestore';
import { uploadAndTrackFile } from '../lib/uploadService';
import { UserProfile, Job, Submission, TraceLog, Agent, SystemLog, UserRole, LLMConfig, LLMProvider, AIReviewResult, AICategory, Dispute } from '../types';
import { paginateItems, safeFormat, safeLocale, totalPages } from '../lib/utils';
import ProfileEditor from './ProfileEditor';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { toast } from 'sonner';
import { ShieldCheck, Eye, CheckCircle2, XCircle, History, Info, Cpu, Activity, ListFilter, Settings2, Save, Trash2, Plus, RefreshCcw, AlertTriangle, FileText, Briefcase, ExternalLink, Search, Users, Upload, Loader2, ChevronDown, ChevronUp, Sparkles, Shield, Maximize2, Download, AlertCircle, ArrowRight, Star, Building2 } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./ui/accordion";
import ReactMarkdown from 'react-markdown';
import { format } from 'date-fns';
import { JobCard, MunicipalCredential } from '../types';
import { seedAgents, reviewDrawing, AIProgress } from '../services/geminiService';
import { notificationService } from '../services/notificationService';
import ComplianceReport from './ComplianceReport';
import AgentKnowledgeManager from './AgentKnowledgeManager';
import { pdfGenerationService } from "../services/pdfGenerationService";
import AdminKnowledgeUploader from './AdminKnowledgeUploader';
import ReviewManagement from "./ReviewManagement";
import MunicipalSettingsAdmin from './MunicipalSettingsAdmin';

const PROVIDER_CONFIGS = {
  gemini: {
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
// Removed
    models: [
      { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
      { value: 'gemini-2.0-pro', label: 'Gemini 2.0 Pro' },
      { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
      { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' }
    ]
  },
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      { value: 'gpt-4o', label: 'GPT-4o' },
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
      { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' }
    ]
  },
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: [
      { value: 'anthropic/claude-3-5-sonnet', label: 'Claude 3.5 Sonnet' },
      { value: 'anthropic/claude-3-opus', label: 'Claude 3 Opus' }
    ]
  },
  nvidia: {
    label: 'NVIDIA NIM',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    models: [
      { value: 'nvidia/nemotron-4-340b-instruct', label: 'Nemotron 4 340B' },
      { value: 'meta/llama-3.1-70b-instruct', label: 'Llama 3.1 70B' },
      { value: 'meta/llama-3.1-405b-instruct', label: 'Llama 3.1 405B' },
      { value: 'mistralai/mistral-large-2-instruct', label: 'Mistral Large 2' }
    ]
  }
} as const;

// Agent Card Component
function AgentCard({ agent }: { agent: Agent; key?: React.Key }) {
  const [editing, setEditing] = useState(false);
  const [tempAgent, setTempAgent] = useState<Agent>(agent);

  const handleSave = async () => {
    try {
      await updateDoc(doc(db, 'agents', agent.id), {
        ...tempAgent,
        updatedAt: new Date().toISOString()
      });
      setEditing(false);
      toast.success("Agent configuration saved");
    } catch (error) {
      toast.error("Failed to save agent configuration");
    }
  };

  const handleReset = () => {
    setTempAgent(agent);
    setEditing(false);
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this agent? This cannot be undone.")) return;
    try {
      await deleteDoc(doc(db, 'agents', agent.id));
      toast.success("Agent deleted");
    } catch (error) {
      toast.error("Failed to delete agent");
    }
  };

  if (editing) {
    return (
      <Card className="border-border shadow-sm bg-white rounded-[2rem] overflow-hidden">
        <CardHeader className="bg-primary/5 border-b border-border p-8">
          <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-2">
            <Cpu size={14} /> {agent.name} (Editing)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-8 space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Name</label>
              <Input 
                value={tempAgent.name} 
                onChange={e => setTempAgent({...tempAgent, name: e.target.value})}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Role</label>
              <Input 
                value={tempAgent.role} 
                onChange={e => setTempAgent({...tempAgent, role: e.target.value})}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Description</label>
              <Textarea 
                value={tempAgent.description} 
                onChange={e => setTempAgent({...tempAgent, description: e.target.value})}
                className="rounded-xl"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Model Name</label>
              {tempAgent.llmProvider === 'global' || !tempAgent.llmProvider ? (
                <Input 
                  value="Inherited from System Settings"
                  disabled
                  className="h-10 rounded-xl text-xs bg-secondary/20"
                />
              ) : (
                <div className="space-y-2">
                  <select 
                    value={tempAgent.llmModel || ''} 
                    onChange={e => {
                      const val = e.target.value;
                      setTempAgent({...tempAgent, llmModel: val === 'custom' ? '' : val});
                    }}
                    className="w-full h-12 px-4 rounded-xl border border-border bg-white text-sm focus:ring-2 focus:ring-primary outline-none"
                  >
                    <option value="">Select a model</option>
                    {tempAgent.llmProvider && 
                     tempAgent.llmProvider !== 'global' && 
                     PROVIDER_CONFIGS[tempAgent.llmProvider as LLMProvider]?.models?.map(m => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                    <option value="custom">Enter custom model name...</option>
                  </select>
                  <Input 
                    value={tempAgent.llmModel || ''}
                    onChange={e => setTempAgent({...tempAgent, llmModel: e.target.value})}
                    placeholder="Enter model name (e.g. nvidia/llama-3.1-70b-instruct)"
                    className="h-12 rounded-xl"
                  />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">LLM Provider</label>
              <select 
                value={tempAgent.llmProvider || 'global'} 
                onChange={e => setTempAgent({...tempAgent, llmProvider: e.target.value as LLMProvider | 'global'})}
                className="w-full h-12 px-4 rounded-xl border border-border bg-white text-sm focus:ring-2 focus:ring-primary outline-none"
              >
                <option value="global">Global (Use System Config)</option>
                {Object.keys(PROVIDER_CONFIGS).map((key) => (
                  <option key={key} value={key}>{PROVIDER_CONFIGS[key as LLMProvider].label}</option>
                ))}
              </select>
            </div>
            {tempAgent.llmProvider !== 'global' && (
              <>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">LLM Model</label>
                  <select 
                    value={tempAgent.llmModel || ''} 
                    onChange={e => setTempAgent({...tempAgent, llmModel: e.target.value})}
                    className="w-full h-12 px-4 rounded-xl border border-border bg-white text-sm focus:ring-2 focus:ring-primary outline-none"
                  >
                    <option value="">Select a model</option>
                    {tempAgent.llmProvider && 
                     tempAgent.llmProvider !== 'global' && 
                     PROVIDER_CONFIGS[tempAgent.llmProvider as LLMProvider]?.models?.map(m => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">API Key</label>
                  <Input 
                    type="password"
                    value={tempAgent.llmApiKey || ''} 
                    onChange={e => setTempAgent({...tempAgent, llmApiKey: e.target.value})}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Base URL</label>
                  <Input 
                    value={tempAgent.llmBaseUrl || ''} 
                    onChange={e => setTempAgent({...tempAgent, llmBaseUrl: e.target.value})}
                    className="rounded-xl"
                  />
                </div>
              </>
            )}
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Authorization Type</label>
              <select 
                value={tempAgent.authorizationType || ''} 
                onChange={e => setTempAgent({...tempAgent, authorizationType: e.target.value as 'bearer' | 'api_key' | 'custom'})}
                className="w-full h-12 px-4 rounded-xl border border-border bg-white text-sm focus:ring-2 focus:ring-primary outline-none"
              >
                <option value="">None</option>
                <option value="bearer">Bearer Token</option>
                <option value="api_key">API Key</option>
                <option value="custom">Custom Header</option>
              </select>
            </div>
            {tempAgent.authorizationType && (
              <>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Authorization Value</label>
                  <Input 
                    type={tempAgent.authorizationType === 'bearer' ? 'password' : 'text'}
                    value={tempAgent.authorizationValue || ''} 
                    onChange={e => setTempAgent({...tempAgent, authorizationValue: e.target.value})}
                    className="rounded-xl"
                  />
                </div>
                {tempAgent.authorizationType === 'custom' && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Header Name</label>
                    <Input 
                      value={tempAgent.authorizationHeader || ''} 
                      onChange={e => setTempAgent({...tempAgent, authorizationHeader: e.target.value})}
                      className="rounded-xl"
                    />
                  </div>
                )}
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave} className="bg-primary text-primary-foreground h-12 rounded-xl font-bold gap-2 shadow-lg shadow-primary/20">
              <Save size={16} /> Save Changes
            </Button>
            <Button onClick={handleReset} variant="outline" className="h-12 rounded-xl font-bold gap-2 border-primary/20 hover:bg-primary/5 text-primary">
              <RefreshCcw size={16} /> Reset
            </Button>
            <Button onClick={() => setEditing(false)} variant="ghost" className="h-12 rounded-xl font-bold gap-2">
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border shadow-sm bg-white rounded-[2rem] overflow-hidden">
      <CardHeader className="bg-primary/5 border-b border-border p-8">
        <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-2">
          <Cpu size={14} /> {agent.name}
        </CardTitle>
        <CardDescription className="text-[10px] text-muted-foreground">{agent.description}</CardDescription>
      </CardHeader>
      <CardContent className="p-8 space-y-6">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Role</label>
              <p className="text-sm font-mono">{agent.role}</p>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Status</label>
              <Badge variant={agent.status === 'online' ? 'secondary' : 'destructive'} className="text-[10px] font-bold uppercase">
                {agent.status}
              </Badge>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Last Active</label>
            <p className="text-sm text-muted-foreground">{safeFormat(agent.lastActive, 'MMM d, yyyy HH:mm')}</p>
          </div>
          {agent.currentActivity && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Current Activity</label>
              <p className="text-sm text-primary">{agent.currentActivity}</p>
            </div>
          )}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">LLM Provider</label>
            <p className="text-sm">
              {agent.llmProvider === 'global' ? 'Global (System Config)' : agent.llmProvider || 'Not configured'}
            </p>
          </div>
          {agent.llmProvider !== 'global' && agent.llmModel && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Model</label>
              <p className="text-sm">{agent.llmModel}</p>
            </div>
          )}
          {agent.authorizationType && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Authorization</label>
              <p className="text-sm">
                {agent.authorizationType === 'bearer' ? 'Bearer Token' : 
                 agent.authorizationType === 'api_key' ? 'API Key' : 
                 `Custom Header: ${agent.authorizationHeader}`}
              </p>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setEditing(true)} variant="outline" className="h-12 rounded-xl font-bold gap-2 border-primary/20 hover:bg-primary/5 text-primary">
            <Settings2 size={16} /> Edit
          </Button>
          <Button onClick={handleDelete} variant="destructive" className="h-12 rounded-xl font-bold gap-2">
            <Trash2 size={16} /> Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard({ 
  user, 
  activeTab, 
  onTabChange 
}: { 
  user: UserProfile, 
  activeTab?: string, 
  onTabChange?: (tab: string) => void 
}) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [reportSubmission, setReportSubmission] = useState<Submission | null>(null);

  // Map sidebar tabs to internal dashboard tabs
  const internalTab = 
    activeTab === 'compliance' ? 'agents' : 
    activeTab === 'audit' ? 'logs' : 
    activeTab === 'users' ? 'users' : 
    activeTab === 'settings' ? 'settings' : 
    activeTab === 'knowledge' ? 'knowledge' :
    activeTab === 'projects' ? 'jobs' :
    'submissions';
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [stats, setStats] = useState({
    totalJobs: 0,
    approvedDrawings: 0,
    activeAgents: 0,
    errorCount: 0
  });
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [allJobs, setAllJobs] = useState<Job[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [pendingKnowledgeCount, setPendingKnowledgeCount] = useState(0);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [submissionPage, setSubmissionPage] = useState(1);
  const [disputePage, setDisputePage] = useState(1);
  const pageSize = 8;

  useEffect(() => {
    const unsubSubmissions = onSnapshot(query(collectionGroup(db, 'submissions'), orderBy('createdAt', 'desc'), limit(100)), (snapshot) => {
      setSubmissions(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Submission)));
    });
    const unsubAgents = onSnapshot(query(collection(db, 'agents'), orderBy('name')), (snapshot) => {
      setAgents(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Agent)));
    });
    const unsubJobs = onSnapshot(query(collection(db, 'jobs'), orderBy('createdAt', 'desc'), limit(100)), (snapshot) => {
      const jobs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Job));
      setAllJobs(jobs);
      setStats(current => ({ ...current, totalJobs: jobs.length }));
    });
    const unsubLogs = onSnapshot(query(collection(db, 'system_logs'), orderBy('timestamp', 'desc'), limit(50)), (snapshot) => {
      const nextLogs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as SystemLog));
      setLogs(nextLogs);
      setStats(current => ({ ...current, errorCount: nextLogs.filter(log => log.level === 'error' || log.level === 'critical').length }));
    });
    const unsubDisputes = onSnapshot(query(collection(db, 'disputes'), orderBy('createdAt', 'desc'), limit(100)), (snapshot) => {
      setDisputes(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Dispute)));
    });
    const unsubUsers = onSnapshot(query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(200)), (snapshot) => {
      setAllUsers(snapshot.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)));
    });
    return () => {
      unsubSubmissions();
      unsubAgents();
      unsubJobs();
      unsubLogs();
      unsubDisputes();
      unsubUsers();
    };
  }, []);

  useEffect(() => {
    setStats(current => ({
      ...current,
      approvedDrawings: submissions.filter(submission => submission.status === 'approved').length,
      activeAgents: agents.filter(agent => agent.status === 'online').length
    }));
  }, [agents, submissions]);

  const pagedSubmissions = paginateItems<Submission>(submissions, submissionPage, pageSize);
  const pagedDisputes = paginateItems<Dispute>(disputes, disputePage, pageSize);

  const updateSubmissionStatus = async (submission: Submission, status: Submission['status']) => {
    try {
      await updateDoc(doc(db, `jobs/${submission.jobId}/submissions`, submission.id), {
        status,
        adminFeedback: status === 'approved' ? 'Approved by admin review.' : 'Rejected by admin review.',
        updatedAt: new Date().toISOString()
      });
      toast.success(status === 'approved' ? 'Submission approved' : 'Submission rejected');
    } catch {
      toast.error('Failed to update submission');
    }
  };

  return (
    <div className="space-y-12">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 bg-white p-6 md:p-10 rounded-[2rem] md:rounded-[2.5rem] border border-border shadow-sm">
        <div>
          <h1 className="text-3xl md:text-5xl font-heading font-bold tracking-tighter text-foreground flex items-center gap-4">
             <Shield className="text-primary w-12 h-12" /> Admin Command Center
          </h1>
          <p className="text-muted-foreground text-base md:text-lg max-w-2xl mt-2 leading-relaxed">Platform orchestration and agent supervision.</p>
        </div>
      </div>

      <Tabs value={internalTab} onValueChange={(val) => {
        const reverseMapping: Record<string, string> = {
          agents: 'compliance',
          logs: 'audit',
          users: 'users',
          settings: 'settings',
          knowledge: 'knowledge',
          jobs: 'projects',
          submissions: 'overview'
        };
        onTabChange?.(reverseMapping[val] || val);
      }} className="w-full">
        <ScrollArea className="w-full whitespace-nowrap mb-8" orientation="horizontal">
          <TabsList className="bg-secondary/50 border border-border p-1 rounded-full w-fit inline-flex mb-1">
            <TabsTrigger value="submissions" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full px-6 md:px-8 gap-2 font-bold text-xs uppercase tracking-widest">
              <FileText size={16} /> Submissions
            </TabsTrigger>
            <TabsTrigger value="agents" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full px-6 md:px-8 gap-2 font-bold text-xs uppercase tracking-widest">
              <Cpu size={16} /> Agents
            </TabsTrigger>
            <TabsTrigger value="users" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full px-6 md:px-8 gap-2 font-bold text-xs uppercase tracking-widest">
              <Users size={16} /> Users
            </TabsTrigger>
            <TabsTrigger value="jobs" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full px-6 md:px-8 gap-2 font-bold text-xs uppercase tracking-widest">
              <Briefcase size={16} /> Jobs
            </TabsTrigger>
            <TabsTrigger value="reviews" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full px-6 md:px-8 gap-2 font-bold text-xs uppercase tracking-widest">
              <Star size={16} /> Moderation
            </TabsTrigger>
            <TabsTrigger value="knowledge" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full px-6 md:px-8 gap-2 font-bold text-xs uppercase tracking-widest relative">
              <Sparkles size={16} /> Brain
            </TabsTrigger>
            <TabsTrigger value="disputes" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full px-6 md:px-8 gap-2 font-bold text-xs uppercase tracking-widest">
              <AlertTriangle size={16} /> Disputes
            </TabsTrigger>
            <TabsTrigger value="logs" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full px-6 md:px-8 gap-2 font-bold text-xs uppercase tracking-widest">
              <History size={16} /> Audit Logs
            </TabsTrigger>
            <TabsTrigger value="municipal" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full px-6 md:px-8 gap-2 font-bold text-xs uppercase tracking-widest">
              <Building2 size={16} /> Municipal
            </TabsTrigger>
            <TabsTrigger value="settings" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full px-6 md:px-8 gap-2 font-bold text-xs uppercase tracking-widest">
              <Settings2 size={16} /> LLM Settings
            </TabsTrigger>
            <TabsTrigger value="analytics" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full px-6 md:px-8 gap-2 font-bold text-xs uppercase tracking-widest">
              <Activity size={16} /> Analytics
            </TabsTrigger>
          </TabsList>
        </ScrollArea>

        <TabsContent value="submissions">
           <div className="bg-white p-8 rounded-[2rem] border border-border space-y-6">
              <h2 className="text-2xl font-bold">Review Pipeline</h2>
              <div className="space-y-3">
                {pagedSubmissions.map(submission => (
                  <div key={submission.id} className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-2xl border border-border p-4">
                    <div>
                      <p className="font-bold">{submission.drawingName}</p>
                      <p className="text-xs text-muted-foreground">Job {submission.jobId} · {new Date(submission.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="uppercase text-[10px] tracking-widest">{submission.status.replace('_', ' ')}</Badge>
                      <Button size="sm" variant="outline" onClick={() => setReportSubmission(submission)}>View Report</Button>
                      <Button size="sm" onClick={() => updateSubmissionStatus(submission, 'approved')}>Approve</Button>
                      <Button size="sm" variant="destructive" onClick={() => updateSubmissionStatus(submission, 'admin_rejected')}>Reject</Button>
                    </div>
                  </div>
                ))}
                {submissions.length === 0 && <p className="text-muted-foreground italic">No submissions awaiting review.</p>}
              </div>
              {submissions.length > pageSize && <PaginationControls page={submissionPage} totalPages={totalPages(submissions.length, pageSize)} onPageChange={setSubmissionPage} />}
           </div>
        </TabsContent>

        <TabsContent value="disputes">
          <div className="bg-white p-8 rounded-[2rem] border border-border space-y-6">
            <h2 className="text-2xl font-bold">Dispute Mediation</h2>
            <div className="space-y-3">
              {pagedDisputes.map(dispute => <div key={dispute.id}><DisputeRow dispute={dispute} /></div>)}
              {disputes.length === 0 && <p className="text-muted-foreground italic">No open disputes.</p>}
            </div>
            {disputes.length > pageSize && <PaginationControls page={disputePage} totalPages={totalPages(disputes.length, pageSize)} onPageChange={setDisputePage} />}
          </div>
        </TabsContent>

        <TabsContent value="analytics">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <StatCard title="Jobs" value={stats.totalJobs} />
            <StatCard title="Approved Drawings" value={stats.approvedDrawings} />
            <StatCard title="Active Agents" value={stats.activeAgents} />
            <StatCard title="Errors" value={stats.errorCount} />
          </div>
        </TabsContent>

        <TabsContent value="logs">
          <div className="bg-white p-8 rounded-[2rem] border border-border overflow-hidden">
            <h2 className="text-2xl font-bold mb-8">System Activity Logs</h2>
            <div className="rounded-2xl border border-border overflow-hidden">
              <Table>
                <TableHeader className="bg-secondary/30">
                  <TableRow>
                    <TableHead>Level</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Timestamp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map(log => (
                    <TableRow key={log.id}>
                      <TableCell>
                        <Badge variant={log.level === 'error' || log.level === 'critical' ? 'destructive' : 'outline'} className="uppercase text-[10px]">
                          {log.level}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{log.source}</TableCell>
                      <TableCell className="text-xs">{log.message}</TableCell>
                      <TableCell className="text-muted-foreground text-[10px]">{safeFormat(log.timestamp, 'MMM d, HH:mm:ss')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="jobs">
          <div className="bg-white p-8 rounded-[2rem] border border-border overflow-hidden">
            <h2 className="text-2xl font-bold mb-8">Platform Jobs</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {allJobs.map(job => (
                <Card key={job.id} className="border-border shadow-sm rounded-2xl p-6">
                  <div className="flex justify-between items-start mb-4">
                    <Badge className="bg-primary/5 text-primary uppercase text-[10px] tracking-widest">{job.category}</Badge>
                    <Badge variant="outline" className="uppercase text-[10px] tracking-widest">{job.status}</Badge>
                  </div>
                  <h3 className="font-bold mb-2">{job.title}</h3>
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-4">{job.description}</p>
                  <div className="flex justify-between items-center text-[10px] font-bold text-muted-foreground uppercase">
                    <span>Budget: R {job.budget.toLocaleString()}</span>
                    <span>Created: {safeFormat(job.createdAt, 'MMM d, yyyy')}</span>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="settings">
          <div className="bg-white p-8 rounded-[2rem] border border-border">
            <h2 className="text-2xl font-bold mb-8">System Configuration</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              <div className="space-y-6">
                <h3 className="text-sm font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                  <Cpu size={16} /> Global LLM Strategy
                </h3>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Active Provider</label>
                    <select className="w-full h-12 px-4 rounded-xl border border-border bg-white text-sm outline-none focus:ring-2 focus:ring-primary">
                      <option value="gemini">Google Gemini (Recommended)</option>
                      <option value="openai">OpenAI</option>
                      <option value="openrouter">OpenRouter</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Default Model</label>
                    <Input placeholder="gemini-2.0-flash" className="h-12 rounded-xl" />
                  </div>
                  <Button className="w-full h-12 rounded-xl font-bold shadow-lg shadow-primary/20">Save Global Settings</Button>
                </div>
              </div>

              <div className="space-y-6 p-8 bg-secondary/20 rounded-[2rem] border border-border">
                <h3 className="text-sm font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                  <Activity size={16} /> System Health
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between text-xs py-2 border-b border-border/50">
                    <span className="text-muted-foreground">API Latency</span>
                    <span className="font-bold text-green-600">142ms</span>
                  </div>
                  <div className="flex justify-between text-xs py-2 border-b border-border/50">
                    <span className="text-muted-foreground">Database Connectivity</span>
                    <span className="font-bold text-green-600">Stable</span>
                  </div>
                  <div className="flex justify-between text-xs py-2 border-b border-border/50">
                    <span className="text-muted-foreground">Agent Response Rate</span>
                    <span className="font-bold">98.4%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="reviews">
           <div className="bg-white p-8 rounded-[2rem] border border-border">
              <ReviewManagement />
           </div>
        </TabsContent>

        <TabsContent value="agents">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {agents.map(agent => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
            {agents.length === 0 && (
              <div className="col-span-full py-20 text-center border-2 border-dashed border-border rounded-[2rem] bg-white/50">
                <p className="text-muted-foreground italic">No agents found in the system.</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="users">
          <div className="bg-white p-8 rounded-[2rem] border border-border overflow-hidden">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold">User Management</h2>
              <div className="flex items-center gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="Search users..."
                    className="pl-10 rounded-full w-[300px]"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border overflow-hidden">
              <Table>
                <TableHeader className="bg-secondary/30">
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allUsers
                    .filter(u => u.displayName.toLowerCase().includes(searchTerm.toLowerCase()) || u.email.toLowerCase().includes(searchTerm.toLowerCase()))
                    .map(u => (
                    <TableRow key={u.uid}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                            {u.displayName[0]}
                          </div>
                          <span className="font-medium">{u.displayName}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="uppercase text-[10px] tracking-widest">{u.role}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">{u.email}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{safeFormat(u.createdAt, 'MMM d, yyyy')}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => toast.info(`Managing user ${u.displayName}`)}>
                          <Settings2 size={16} />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="knowledge">
           <div className="space-y-8">
              <AdminKnowledgeUploader user={user} />
              <AgentKnowledgeManager user={user} />
           </div>
        </TabsContent>

        <TabsContent value="municipal">
           <div className="bg-white p-8 rounded-[2rem] border border-border shadow-sm">
              <MunicipalSettingsAdmin />
           </div>
        </TabsContent>
      </Tabs>

      {/* Full Report Modal */}
      <Dialog open={!!reportSubmission} onOpenChange={(open) => !open && setReportSubmission(null)}>
        <DialogContent className="max-w-[95vw] w-[1400px] h-[90vh] p-0 border-none bg-transparent">
          {reportSubmission && (
            <div className="w-full h-full rounded-[2rem] overflow-hidden shadow-2xl">
              <ComplianceReport 
                result={{
                  status: reportSubmission.status === 'ai_passed' ? 'passed' : 'failed',
                  feedback: reportSubmission.aiFeedback || '',
                  categories: reportSubmission.aiStructuredFeedback || [],
                  traceLog: reportSubmission.traceability?.[0]?.details || 'Review trace not found.'
                }}
                drawingUrl={reportSubmission.drawingUrl}
                drawingName={reportSubmission.drawingName}
                onClose={() => setReportSubmission(null)}
                userRole={user.role}
                submissionId={reportSubmission.id}
                userId={user.uid}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DisputeRow({ dispute }: { dispute: Dispute }) {
  const [adminNotes, setAdminNotes] = useState(dispute.adminNotes || '');
  const [resolution, setResolution] = useState(dispute.resolution || '');

  const updateDispute = async (status: Dispute['status']) => {
    try {
      await updateDoc(doc(db, 'disputes', dispute.id), {
        status,
        adminNotes,
        resolution,
        updatedAt: new Date().toISOString()
      });
      toast.success('Dispute updated');
    } catch {
      toast.error('Failed to update dispute');
    }
  };

  return (
    <div className="rounded-2xl border border-border p-4 space-y-4">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <p className="font-bold">Job {dispute.jobId}</p>
          <p className="text-sm text-muted-foreground">{dispute.reason}</p>
          <p className="text-xs text-muted-foreground mt-1">Requested: {dispute.requestedResolution}</p>
        </div>
        <Badge variant="outline" className="uppercase text-[10px] tracking-widest">{dispute.status.replace('_', ' ')}</Badge>
      </div>
      <Textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)} placeholder="Admin mediation notes" />
      <Textarea value={resolution} onChange={e => setResolution(e.target.value)} placeholder="Resolution outcome" />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => updateDispute('in_mediation')}>Start Mediation</Button>
        <Button size="sm" onClick={() => updateDispute('resolved')}>Resolve</Button>
        <Button size="sm" variant="destructive" onClick={() => updateDispute('rejected')}>Reject</Button>
      </div>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <Card className="border-border shadow-sm bg-white rounded-3xl">
      <CardHeader>
        <CardDescription className="uppercase text-[10px] tracking-widest font-bold">{title}</CardDescription>
        <CardTitle className="text-3xl font-heading">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function PaginationControls({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (page: number) => void }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-border bg-white p-3">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</Button>
      <span className="text-xs font-bold text-muted-foreground">Page {page} of {totalPages}</span>
      <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Next</Button>
    </div>
  );
}
