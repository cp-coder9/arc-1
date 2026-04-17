import React, { useState, useEffect, useRef } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, onSnapshot, doc, getDoc, updateDoc, collectionGroup, getDocs, addDoc, setDoc, deleteDoc, orderBy, limit, where } from 'firebase/firestore';
import { uploadAndTrackFile } from '../lib/uploadService';
import { UserProfile, Job, Submission, TraceLog, Agent, SystemLog, UserRole, LLMConfig, LLMProvider, AIReviewResult, AICategory } from '@/types';
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
import { ShieldCheck, Eye, CheckCircle2, XCircle, History, Info, Cpu, Activity, ListFilter, Settings2, Save, Trash2, Plus, RefreshCcw, AlertTriangle, FileText, Briefcase, ExternalLink, Search, Users, Upload, Loader2, ChevronDown, ChevronUp, Sparkles, Shield, Maximize2, Download, AlertCircle, ArrowRight } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./ui/accordion";
import ReactMarkdown from 'react-markdown';
import { format } from 'date-fns';
import { seedAgents, reviewDrawing } from '../services/geminiService';
import { notificationService } from '../services/notificationService';
import ComplianceReport from './ComplianceReport';
import AgentKnowledgeManager from './AgentKnowledgeManager';
import { Dialog as FullScreenDialog, DialogContent as FullScreenDialogContent } from './ui/dialog';

const PROVIDER_CONFIGS = {
  gemini: {
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
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
  },
  local: {
    label: 'Local LLM (OpenAI Compatible)',
    baseUrl: 'http://localhost:11434/v1',
    models: [
      { value: 'llama3', label: 'Llama 3' },
      { value: 'mistral', label: 'Mistral' },
      { value: 'gemma', label: 'Gemma' }
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
                    {tempAgent.llmProvider && PROVIDER_CONFIGS[tempAgent.llmProvider as LLMProvider].models.map(m => (
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
                    {tempAgent.llmProvider && PROVIDER_CONFIGS[tempAgent.llmProvider as LLMProvider].models.map(m => (
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
            <p className="text-sm text-muted-foreground">{format(new Date(agent.lastActive), 'MMM d, yyyy HH:mm')}</p>
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
  const internalTab = activeTab === 'compliance' ? 'agents' : activeTab === 'audit' ? 'logs' : activeTab === 'users' ? 'users' : activeTab === 'settings' ? 'settings' : 'submissions';
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

  useEffect(() => {
    seedAgents();
    
    // Submissions
    const qSub = query(collectionGroup(db, 'submissions'));
    const unsubSub = onSnapshot(qSub, (snapshot) => {
      setSubmissions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Submission)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'submissions (collectionGroup)');
    });

    // Agents
    const qAgents = query(collection(db, 'agents'));
    const unsubAgents = onSnapshot(qAgents, (snapshot) => {
      setAgents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Agent)));
    });

    // Logs
    const qLogs = query(collection(db, 'system_logs'), orderBy('timestamp', 'desc'), limit(50));
    const unsubLogs = onSnapshot(qLogs, (snapshot) => {
      setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SystemLog)));
    });

    // Stats
    const unsubStats = onSnapshot(collection(db, 'jobs'), (snap) => {
      setAllJobs(snap.docs.map(d => ({ id: d.id, ...d.data() } as Job)));
      setStats(prev => ({
        ...prev,
        totalJobs: snap.size
      }));
    });

    // Users
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      setAllUsers(snap.docs.map(d => {
        const data = d.data();
        return {
          uid: d.id,
          email: data.email || '',
          displayName: data.displayName || 'Unnamed User',
          role: data.role || 'client',
          createdAt: data.createdAt || new Date().toISOString(),
          ...data
        } as UserProfile;
      }));
    });

    // Knowledge — may fire a transient permission-denied before auth resolves; suppress that silently.
    const unsubKnowledge = onSnapshot(
      query(collection(db, 'agent_knowledge'), where('status', '==', 'pending_review')),
      (snap) => { setPendingKnowledgeCount(snap.size); },
      (err) => { if (err.code !== 'permission-denied') console.error('[AdminDashboard] knowledge listener:', err); }
    );

    return () => {
      unsubSub();
      unsubAgents();
      unsubLogs();
      unsubStats();
      unsubUsers();
      unsubKnowledge();
    };
  }, []);

  useEffect(() => {
    const approved = submissions.filter(s => s.status === 'approved').length;
    const activeAgents = agents.filter(a => a.status === 'online').length;
    const errors = logs.filter(l => l.level === 'error' || l.level === 'critical').length;
    setStats(prev => ({
      ...prev,
      approvedDrawings: approved,
      activeAgents,
      errorCount: errors
    }));
  }, [submissions, agents, logs]);

  const handleApprove = async (sub: Submission) => {
    try {
      const subRef = doc(db, `jobs/${sub.jobId}/submissions`, sub.id);
      await updateDoc(subRef, {
        status: 'approved',
        traceability: [
          ...sub.traceability,
          {
            timestamp: new Date().toISOString(),
            actor: 'Admin',
            action: 'Final Approval',
            details: 'Drawing verified and approved for council submission.'
          }
        ]
      });
      
      // Notify architect
      await notificationService.notifyAdminApproval(sub.architectId, sub.drawingName, sub.jobId, sub.id);
      
      toast.success("Submission approved");
    } catch (error) {
      toast.error("Failed to approve");
    }
  };

  const handleReject = async (sub: Submission, feedback: string) => {
    try {
      const subRef = doc(db, `jobs/${sub.jobId}/submissions`, sub.id);
      await updateDoc(subRef, {
        status: 'admin_rejected',
        adminFeedback: feedback,
        traceability: [
          ...sub.traceability,
          {
            timestamp: new Date().toISOString(),
            actor: 'Admin',
            action: 'Rejection',
            details: `Rejected with feedback: ${feedback}`
          }
        ]
      });
      
      // Notify architect
      await notificationService.notifyAdminRejection(sub.architectId, sub.drawingName, sub.jobId, sub.id);
      
      toast.success("Submission rejected and sent back");
    } catch (error) {
      toast.error("Failed to reject");
    }
  };

  const handleToggleUserStatus = async (userId: string, currentStatus?: string) => {
    try {
      const isSuspended = currentStatus === 'suspended';
      await updateDoc(doc(db, 'users', userId), {
        status: isSuspended ? 'active' : 'suspended',
        updatedAt: new Date().toISOString()
      });
      toast.success(`User ${isSuspended ? 'activated' : 'suspended'}`);
    } catch (error) {
      toast.error("Failed to update user status");
    }
  };

  const handleUpdateJobStatus = async (jobId: string, status: Job['status']) => {
    try {
      await updateDoc(doc(db, 'jobs', jobId), {
        status,
        updatedAt: new Date().toISOString()
      });
      toast.success(`Job status updated to ${status}`);
    } catch (error) {
      toast.error("Failed to update job status");
    }
  };

  const handleForceApprove = async (sub: Submission) => {
    if (!confirm("FORCE APPROVE: This will bypass automated compliance checks. Continue?")) return;
    await handleApprove(sub);
  };

  return (
    <div className="space-y-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 bg-white p-10 rounded-[2.5rem] border border-border shadow-sm">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <h1 className="text-5xl font-heading font-bold tracking-tighter text-foreground">Admin Control</h1>
            <ProfileEditor user={user} />
          </div>
          <p className="text-muted-foreground text-lg max-w-2xl leading-relaxed">Enterprise compliance orchestration and agent management hub.</p>
        </div>
        <div className="flex gap-4">
          <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10">
            <p className="text-[10px] font-bold uppercase tracking-widest text-primary mb-1">System Status</p>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm font-bold">ALL SYSTEMS OPERATIONAL</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard label="Total Projects" value={stats.totalJobs.toString()} icon={<Briefcase size={20} />} />
        <StatCard label="Approved Plans" value={stats.approvedDrawings.toString()} icon={<CheckCircle2 size={20} />} />
        <StatCard label="Active Agents" value={stats.activeAgents.toString()} icon={<Cpu size={20} />} />
        <StatCard label="System Alerts" value={stats.errorCount.toString()} icon={<AlertTriangle size={20} />} color={stats.errorCount > 0 ? 'text-destructive' : 'text-primary'} />
      </div>

      <Tabs value={internalTab} onValueChange={(val) => onTabChange?.(val === 'agents' ? 'compliance' : val === 'logs' ? 'audit' : val === 'users' ? 'users' : 'overview')} className="w-full">
        <TabsList className="bg-secondary/50 border border-border p-1 rounded-full w-fit mb-8">
          <TabsTrigger value="submissions" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full px-8 gap-2">
            <FileText size={16} /> Recompliance Hub
          </TabsTrigger>
          <TabsTrigger value="jobs" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full px-8 gap-2">
            <Briefcase size={16} /> Projects
          </TabsTrigger>
          <TabsTrigger value="agents" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full px-8 gap-2">
            <Cpu size={16} /> Agent Management
          </TabsTrigger>
          <TabsTrigger value="logs" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full px-8 gap-2">
            <History size={16} /> Audited Logs
          </TabsTrigger>
          <TabsTrigger value="users" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full px-8 gap-2">
            <Users size={16} /> User Management
          </TabsTrigger>
          <TabsTrigger value="settings" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full px-8 gap-2">
            <Settings2 size={16} /> LLM Settings
          </TabsTrigger>
          <TabsTrigger value="knowledge" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full px-8 gap-2 relative">
            <Sparkles size={16} /> Brain
            {pendingKnowledgeCount > 0 && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse border-2 border-white"></span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="submissions">
          <Card className="border-border shadow-sm bg-white overflow-hidden rounded-[2rem]">
            <CardHeader className="bg-primary/5 border-b border-border p-8">
              <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                <ShieldCheck size={14} /> Pending Admin Review
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-border">
                    <TableHead className="font-bold text-[10px] uppercase tracking-widest px-8">Drawing</TableHead>
                    <TableHead className="font-bold text-[10px] uppercase tracking-widest">Architect</TableHead>
                    <TableHead className="font-bold text-[10px] uppercase tracking-widest">AI Status</TableHead>
                    <TableHead className="font-bold text-[10px] uppercase tracking-widest">Date</TableHead>
                    <TableHead className="text-right font-bold text-[10px] uppercase tracking-widest px-8">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {submissions.filter(s => s.status === 'admin_reviewing').map(sub => (
                    <TableRow key={sub.id} className="border-border hover:bg-secondary/20 transition-colors">
                      <TableCell className="font-heading font-bold px-8">{sub.drawingName}</TableCell>
                      <TableCell className="text-xs font-mono">{sub.architectId.substring(0, 8)}...</TableCell>
                      <TableCell>
                        <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] font-bold uppercase tracking-widest">AI PASSED</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{format(new Date(sub.createdAt), 'MMM d, yyyy')}</TableCell>
                      <TableCell className="text-right px-8">
                        <Dialog>
                          <DialogTrigger render={<Button variant="ghost" size="sm" className="gap-2 hover:bg-primary hover:text-primary-foreground rounded-full px-4"><Eye size={14} />Review</Button>} />
                          <DialogContent className="max-w-6xl border-border bg-white/95 backdrop-blur-md h-[90vh] flex flex-col p-0 overflow-hidden rounded-[2rem] shadow-2xl">
                            <div className="p-10 border-b border-border bg-primary/5">
                              <DialogHeader>
                                <DialogTitle className="font-heading font-bold text-3xl tracking-tighter">Review Submission: {sub.drawingName}</DialogTitle>
                                <DialogDescription className="text-muted-foreground mt-2">Verify AI findings and provide final council-ready approval.</DialogDescription>
                              </DialogHeader>
                            </div>
                            
                            <div className="flex-1 overflow-hidden flex gap-8 p-10 bg-secondary/10">
                              <div className="flex-1 flex flex-col gap-6">
                                <div className="flex-1 border border-border rounded-[2rem] bg-white shadow-sm flex flex-col overflow-hidden">
                                  <div className="bg-secondary/20 p-4 border-b border-border flex justify-between items-center">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Technical Drawing View</span>
                                    <Button variant="outline" size="sm" className="rounded-full h-8 text-[10px] font-bold uppercase tracking-widest">
                                      <a href={sub.drawingUrl} target="_blank" rel="noopener noreferrer" className="flex items-center">Open Original <ExternalLink size={10} className="ml-1" /></a>
                                    </Button>
                                  </div>
                                  <div className="flex-1 flex items-center justify-center p-8 bg-slate-900 relative">
                                    {sub.drawingUrl.endsWith('.pdf') ? (
                                      <iframe src={sub.drawingUrl} className="w-full h-full rounded-lg" />
                                    ) : (
                                      <img src={sub.drawingUrl} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" referrerPolicy="no-referrer" />
                                    )}
                                  </div>
                                </div>
                                
                                <div className="border border-border rounded-[2rem] p-8 bg-white shadow-sm flex flex-col">
                                  <h4 className="text-[10px] font-bold uppercase tracking-widest mb-4 text-muted-foreground flex items-center gap-2">
                                    <Sparkles size={12} className="text-primary" /> AI Compliance Orchestrator Feedback
                                  </h4>
                                  <div className="mb-4 flex gap-2">
                                    <Button 
                                      variant="outline" 
                                      size="sm" 
                                      className="rounded-full text-[10px] font-bold uppercase tracking-widest gap-2 bg-primary/5 border-primary/20"
                                      onClick={() => setReportSubmission(sub)}
                                    >
                                      <FileText size={12} /> View Full Report
                                    </Button>
                                  </div>
                                  <ScrollArea className="flex-1 pr-4">
                                    {sub.aiStructuredFeedback && sub.aiStructuredFeedback.length > 0 ? (
                                      <Accordion multiple className="w-full space-y-2">
                                        {sub.aiStructuredFeedback.map((cat, i) => (
                                          <AccordionItem key={i} value={`cat-${i}`} className="border border-border rounded-xl overflow-hidden bg-secondary/5 px-4">
                                            <AccordionTrigger className="hover:no-underline py-4">
                                              <div className="flex items-center gap-3">
                                                <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                                                  <Shield size={14} />
                                                </div>
                                                <div className="text-left">
                                                  <p className="text-sm font-bold tracking-tight">{cat.name}</p>
                                                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
                                                    {cat.issues.length} {cat.issues.length === 1 ? 'Issue' : 'Issues'} Identified
                                                  </p>
                                                </div>
                                              </div>
                                            </AccordionTrigger>
                                            <AccordionContent className="pb-4">
                                              <div className="space-y-3 pt-2">
                                                {cat.issues.map((issue, j) => (
                                                  <div key={j} className={`p-4 rounded-xl border ${
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
                                                      <p className="text-[10px] font-bold text-muted-foreground">
                                                        <span className="text-primary">RECOMMENDED ACTION:</span> {issue.actionItem}
                                                      </p>
                                                    </div>
                                                  </div>
                                                ))}
                                              </div>
                                            </AccordionContent>
                                          </AccordionItem>
                                        ))}
                                      </Accordion>
                                    ) : (
                                      <div className="text-sm prose prose-sm max-w-none leading-relaxed markdown-body">
                                        <ReactMarkdown>{sub.aiFeedback || 'No AI feedback available.'}</ReactMarkdown>
                                      </div>
                                    )}
                                  </ScrollArea>
                                </div>
                              </div>

                              <div className="w-96 flex flex-col gap-6">
                                <div className="flex-1 border border-border rounded-[2rem] p-8 bg-white shadow-sm flex flex-col">
                                  <h4 className="text-[10px] font-bold uppercase tracking-widest mb-6 text-muted-foreground flex items-center gap-2">
                                    <History size={12} className="text-primary" /> Audited Traceability
                                  </h4>
                                  <ScrollArea className="flex-1">
                                    <div className="space-y-6">
                                      {sub.traceability.map((log, i) => (
                                        <div key={i} className="relative pl-6 border-l-2 border-primary/10 pb-6 last:pb-0">
                                          <div className="absolute left-[-7px] top-0 w-3 h-3 rounded-full bg-primary shadow-sm" />
                                          <p className="text-[10px] font-mono text-muted-foreground font-bold">{format(new Date(log.timestamp), 'HH:mm:ss')}</p>
                                          <p className="text-sm font-bold mt-1">{log.actor}: {log.action}</p>
                                          <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{log.details}</p>
                                        </div>
                                      ))}
                                    </div>
                                  </ScrollArea>
                                </div>

                                <div className="space-y-3">
                                  <Button onClick={() => handleApprove(sub)} className="w-full bg-primary text-primary-foreground h-14 rounded-xl font-bold gap-2 shadow-lg shadow-primary/20">
                                    <CheckCircle2 size={18} /> Approve for Council
                                  </Button>
                                  <Button onClick={() => handleForceApprove(sub)} variant="outline" className="w-full h-12 rounded-xl font-bold gap-2 border-primary/20 hover:bg-primary/5 text-primary">
                                    <Sparkles size={16} /> AI Override (Force Approve)
                                  </Button>
                                  <RejectDialog sub={sub} onReject={handleReject} />
                                </div>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  ))}
                  {submissions.filter(s => s.status === 'admin_reviewing').length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="h-40 text-center text-muted-foreground italic bg-secondary/10">
                        No submissions pending review.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="jobs">
          <Card className="border-border shadow-sm bg-white overflow-hidden rounded-[2rem]">
            <CardHeader className="bg-secondary/10 border-b border-border p-8 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xl font-heading font-bold tracking-tight">Project Governance</CardTitle>
                <CardDescription>Monitor project lifecycles and intervention status.</CardDescription>
              </div>
              <div className="flex gap-2">
                <Badge variant="outline" className="rounded-full px-4">{allJobs.length} Total</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                     <TableHead className="px-8 font-bold text-[10px] uppercase tracking-widest">Title</TableHead>
                     <TableHead className="font-bold text-[10px] uppercase tracking-widest">Client</TableHead>
                     <TableHead className="font-bold text-[10px] uppercase tracking-widest">Status</TableHead>
                     <TableHead className="font-bold text-[10px] uppercase tracking-widest">Budget</TableHead>
                     <TableHead className="text-right px-8 font-bold text-[10px] uppercase tracking-widest">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allJobs.map(job => (
                    <TableRow key={job.id} className="hover:bg-secondary/10">
                      <TableCell className="px-8 font-bold">{job.title}</TableCell>
                      <TableCell className="text-sm">{job.clientId.slice(0, 8)}...</TableCell>
                      <TableCell>
                        <Badge className={`${
                          job.status === 'open' ? 'bg-blue-100 text-blue-700' :
                          job.status === 'in-progress' ? 'bg-orange-100 text-orange-700' :
                          job.status === 'completed' ? 'bg-green-100 text-green-700' :
                          'bg-zinc-100 text-zinc-700'
                        } rounded-full text-[10px] font-bold uppercase`}>
                          {job.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm font-bold">R {job.budget.toLocaleString()}</TableCell>
                      <TableCell className="text-right px-8">
                        <div className="flex justify-end gap-2">
                          <select 
                            className="bg-secondary/50 rounded-lg text-xs p-1 border border-border"
                            value={job.status}
                            onChange={(e) => handleUpdateJobStatus(job.id, e.target.value as any)}
                          >
                            <option value="open">Open</option>
                            <option value="in-progress">In Progress</option>
                            <option value="completed">Completed</option>
                            <option value="cancelled">Cancelled</option>
                          </select>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>


        <TabsContent value="agents">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              {agents.map(agent => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
              {agents.length === 0 && (
                <div className="p-20 text-center border-2 border-dashed border-border rounded-[2rem] bg-white/50">
                  <p className="text-muted-foreground italic">No agents configured. Add your first agent to start compliance checks.</p>
                  <AddAgentDialog />
                </div>
              )}
            </div>
            <div className="space-y-6">
              <Card className="border-border shadow-sm bg-white rounded-[2rem] overflow-hidden">
                <CardHeader className="p-8 border-b border-border bg-primary/5">
                  <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-primary">Agent Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="p-8 space-y-4">
                  <AddAgentDialog />
                  <TestAgentDialog user={user} />
                  <Button variant="outline" className="w-full h-12 rounded-xl font-bold gap-2 border-primary/20 hover:bg-primary/5">
                    <RefreshCcw size={16} /> Restart All Agents
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="logs">
          <Card className="border-border shadow-sm bg-white overflow-hidden rounded-[2rem]">
            <CardHeader className="bg-primary/5 border-b border-border p-8 flex flex-row items-center justify-between">
              <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                <History size={14} /> Audited System Logs
              </CardTitle>
              <Button variant="ghost" size="sm" className="rounded-full h-8 text-[10px] font-bold uppercase tracking-widest gap-2">
                <ListFilter size={12} /> Filter Logs
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-border">
                    <TableHead className="font-bold text-[10px] uppercase tracking-widest px-8">Timestamp</TableHead>
                    <TableHead className="font-bold text-[10px] uppercase tracking-widest">Level</TableHead>
                    <TableHead className="font-bold text-[10px] uppercase tracking-widest">Source</TableHead>
                    <TableHead className="font-bold text-[10px] uppercase tracking-widest">Message</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map(log => (
                    <TableRow key={log.id} className="border-border hover:bg-secondary/20 transition-colors">
                      <TableCell className="text-xs font-mono px-8">{format(new Date(log.timestamp), 'HH:mm:ss.SSS')}</TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] font-bold uppercase tracking-widest ${
                          log.level === 'error' || log.level === 'critical' ? 'bg-destructive/10 text-destructive border-destructive/20' :
                          log.level === 'warning' ? 'bg-yellow-50 text-yellow-700 border-yellow-100' :
                          'bg-blue-50 text-blue-700 border-blue-100'
                        }`}>
                          {log.level}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-bold">{log.source}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{log.message}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <UserManagement onToggleStatus={handleToggleUserStatus} searchTerm={searchTerm} setSearchTerm={setSearchTerm} />
        </TabsContent>

        <TabsContent value="settings">
          <LLMSettings />
        </TabsContent>

        <TabsContent value="knowledge">
          <div className="bg-white p-8 rounded-[2rem] border border-border shadow-sm">
            <AgentKnowledgeManager user={user} />
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
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UserManagement({ 
  onToggleStatus, 
  searchTerm, 
  setSearchTerm 
}: { 
  onToggleStatus?: (uid: string, status?: string) => void,
  searchTerm?: string,
  setSearchTerm?: (val: string) => void
}) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', displayName: '', role: 'client' as UserRole });

  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      setUsers(snapshot.docs.map(d => {
        const data = d.data();
        return {
          uid: d.id,
          email: data.email || '',
          displayName: data.displayName || 'Unnamed User',
          role: data.role || 'client',
          createdAt: data.createdAt || new Date().toISOString(),
          ...data
        } as UserProfile;
      }));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const newUserRef = doc(collection(db, 'users'));
      await setDoc(newUserRef, {
        uid: newUserRef.id,
        email: newUser.email,
        displayName: newUser.displayName,
        role: newUser.role,
        createdAt: new Date().toISOString()
      });
      setIsAddingUser(false);
      setNewUser({ email: '', displayName: '', role: 'client' });
      toast.success("User added successfully");
    } catch (error) {
      toast.error("Failed to add user");
    }
  };

  const handleUpdateRole = async (userId: string, newRole: UserRole) => {
    try {
      await updateDoc(doc(db, 'users', userId), { role: newRole });
      toast.success(`User role updated to ${newRole}`);
    } catch (error) {
      toast.error("Failed to update user role");
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm("Are you sure you want to delete this user? This will not delete their Firebase Auth account, only their profile.")) return;
    try {
      await deleteDoc(doc(db, 'users', userId));
      toast.success("User profile deleted");
    } catch (error) {
      toast.error("Failed to delete user profile");
    }
  };

  return (
    <Card className="border-border shadow-sm bg-white overflow-hidden rounded-[2rem]">
      <CardHeader className="bg-primary/5 border-b border-border p-8 flex flex-row items-center justify-between">
        <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-2">
          <Users size={14} /> Platform User Directory
        </CardTitle>
        <div className="flex items-center gap-4">
          <div className="relative w-64">
             <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
             <Input 
                placeholder="Search users..." 
                className="pl-9 h-10 rounded-full bg-white border-border"
                value={searchTerm}
                onChange={(e) => setSearchTerm?.(e.target.value)}
             />
          </div>
          <Dialog open={isAddingUser} onOpenChange={setIsAddingUser}>
            <DialogTrigger render={
              <Button size="sm" className="rounded-full h-10 px-6 font-bold uppercase tracking-widest bg-primary shadow-lg shadow-primary/20">
                <Plus size={16} className="mr-2" /> Add User
              </Button>
            } />
            <DialogContent className="sm:max-w-[425px] border-border bg-white rounded-[2rem] p-0 overflow-hidden">
              <div className="bg-primary/5 p-8 border-b border-border">
                <DialogHeader>
                  <DialogTitle className="font-heading text-2xl font-bold">Add New User</DialogTitle>
                  <DialogDescription>Create a new user profile manually.</DialogDescription>
                </DialogHeader>
              </div>
              <form onSubmit={handleAddUser} className="p-8 space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Display Name</label>
                  <Input required value={newUser.displayName} onChange={e => setNewUser({...newUser, displayName: e.target.value})} placeholder="e.g. John Doe" className="rounded-xl" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Email</label>
                  <Input required type="email" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} placeholder="john@example.com" className="rounded-xl" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Role</label>
                  <select 
                    value={newUser.role} 
                    onChange={e => setNewUser({...newUser, role: e.target.value as UserRole})}
                    className="w-full h-10 px-3 rounded-xl border border-border bg-white text-sm focus:ring-2 focus:ring-primary"
                  >
                    <option value="client">Client</option>
                    <option value="architect">Architect</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <Button type="submit" className="w-full h-12 rounded-xl font-bold">Create User</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border">
              <TableHead className="font-bold text-[10px] uppercase tracking-widest px-8">User</TableHead>
              <TableHead className="font-bold text-[10px] uppercase tracking-widest">Email</TableHead>
              <TableHead className="font-bold text-[10px] uppercase tracking-widest">Role</TableHead>
              <TableHead className="font-bold text-[10px] uppercase tracking-widest text-center">Status</TableHead>
              <TableHead className="font-bold text-[10px] uppercase tracking-widest">Joined</TableHead>
              <TableHead className="text-right font-bold text-[10px] uppercase tracking-widest px-8">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.filter(u => 
              u.displayName?.toLowerCase().includes((searchTerm || '').toLowerCase()) || 
              u.email.toLowerCase().includes((searchTerm || '').toLowerCase())
            ).map(u => (
              <TableRow key={u.uid} className="border-border hover:bg-secondary/20 transition-colors">
                <TableCell className="font-bold px-8">
                  <div className="flex flex-col">
                    <span>{u.displayName}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">{u.uid.slice(0, 8)}</span>
                  </div>
                </TableCell>
                <TableCell className="text-xs font-mono">{u.email}</TableCell>
                <TableCell>
                  <select 
                    value={u.role} 
                    onChange={(e) => handleUpdateRole(u.uid, e.target.value as UserRole)}
                    className="bg-secondary/50 border border-border rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest focus:ring-1 focus:ring-primary outline-none"
                  >
                    <option value="client">Client</option>
                    <option value="architect">Architect</option>
                    <option value="admin">Admin</option>
                  </select>
                </TableCell>
                <TableCell className="text-center">
                   {(u as any).status === 'suspended' ? (
                      <Badge variant="destructive" className="rounded-full uppercase text-[10px]">Suspended</Badge>
                   ) : (
                      <Badge variant="secondary" className="bg-green-100 text-green-700 rounded-full uppercase text-[10px]">Active</Badge>
                   )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{format(new Date(u.createdAt), 'MMM d, yyyy')}</TableCell>
                <TableCell className="text-right px-8">
                  <div className="flex justify-end gap-2">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className={`rounded-full h-8 text-[10px] font-bold uppercase tracking-widest ${
                        (u as any).status === 'suspended' ? 'text-green-500 hover:bg-green-50' : 'text-red-500 hover:bg-red-50'
                      }`}
                      onClick={() => onToggleStatus?.(u.uid, (u as any).status)}
                    >
                      {(u as any).status === 'suspended' ? 'Activate' : 'Suspend'}
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDeleteUser(u.uid)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {users.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={6} className="h-40 text-center text-muted-foreground italic bg-secondary/10">
                  No users found matching your criteria.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function LLMSettings() {
  const [config, setConfig] = useState<LLMConfig>({
    provider: 'gemini',
    apiKey: '',
    model: 'gemini-2.0-flash',
    baseUrl: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const docRef = doc(db, 'system_settings', 'llm_config');
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          setConfig(snap.data() as LLMConfig);
        }
      } catch (error) {
        console.error("Failed to fetch LLM config:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'system_settings', 'llm_config'), {
        ...config,
        id: 'llm_config',
        updatedAt: new Date().toISOString()
      });
      toast.success("LLM Configuration saved successfully");
    } catch (error) {
      toast.error("Failed to save LLM configuration");
      console.error(error);
    } finally {
      setSaving(false);
    }
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <Card className="border-border shadow-sm bg-white overflow-hidden rounded-[2rem]">
      <CardHeader className="bg-primary/5 border-b border-border p-8">
        <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-2">
          <Cpu size={14} /> Orchestration LLM Configuration
        </CardTitle>
        <CardDescription>Configure the primary model used for architectural compliance reviews.</CardDescription>
      </CardHeader>
      <CardContent className="p-8 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Provider</label>
              <select 
                value={config.provider} 
                onChange={(e) => {
                  const provider = e.target.value as LLMProvider;
                  const pConfig = PROVIDER_CONFIGS[provider];
                  setConfig({
                    ...config,
                    provider,
                    baseUrl: pConfig.baseUrl,
                    model: pConfig.models[0].value
                  });
                }}
                className="w-full h-12 px-4 rounded-xl border border-border bg-white text-sm focus:ring-2 focus:ring-primary outline-none"
              >
                {Object.entries(PROVIDER_CONFIGS).map(([key, p]) => (
                  <option key={key} value={key}>{p.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">API Key</label>
              <Input 
                type="password" 
                value={config.apiKey} 
                onChange={e => setConfig({...config, apiKey: e.target.value})}
                placeholder={config.provider === 'gemini' ? 'Leave empty to use environment key' : 'Enter your API key'}
                className="rounded-xl h-12"
              />
              {config.provider === 'gemini' && !config.apiKey && (
                <p className="text-[10px] text-muted-foreground italic">Using GEMINI_API_KEY from environment secrets.</p>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Model Name</label>
              <select 
                value={config.model} 
                onChange={e => setConfig({...config, model: e.target.value})}
                className="w-full h-12 px-4 rounded-xl border border-border bg-white text-sm focus:ring-2 focus:ring-primary outline-none"
              >
                {PROVIDER_CONFIGS[config.provider].models.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Base URL</label>
              <Input 
                value={config.baseUrl} 
                onChange={e => setConfig({...config, baseUrl: e.target.value})}
                placeholder="https://api.example.com/v1"
                className="rounded-xl h-12 bg-secondary/20"
                readOnly={config.provider === 'gemini'}
              />
              {config.provider !== 'gemini' && (
                <p className="text-[10px] text-muted-foreground italic">Base URL is prefilled for {config.provider}.</p>
              )}
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-border flex justify-end">
          <Button 
            onClick={handleSave} 
            disabled={saving}
            className="rounded-xl h-12 px-8 font-bold gap-2 shadow-lg shadow-primary/20"
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            Save Configuration
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StatCard({ label, value, icon, color = 'text-primary' }: { label: string, value: string, icon: React.ReactNode, color?: string }) {
  return (
    <Card className="border-border shadow-sm bg-white rounded-3xl overflow-hidden">
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


function AddAgentDialog() {
  const [name, setName] = useState('');
  const [role, setRole] = useState('sans_compliance');
  const [prompt, setPrompt] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  
  // LLM Config state
  const [llmProvider, setLlmProvider] = useState<LLMProvider | 'global'>('global');
  const [llmModel, setLlmModel] = useState('');
  const [llmApiKey, setLlmApiKey] = useState('');
  const [llmBaseUrl, setLlmBaseUrl] = useState('');

  const handleAdd = async () => {
    if (!name || !prompt) {
      toast.error("Please fill in all fields");
      return;
    }
    try {
      await addDoc(collection(db, 'agents'), {
        name,
        role,
        systemPrompt: prompt,
        description: `Specialized agent for ${role.replace('_', ' ')} tasks.`,
        temperature: 0.7,
        status: 'online',
        llmProvider,
        llmModel,
        llmApiKey,
        llmBaseUrl,
        lastActive: new Date().toISOString(),
        currentActivity: 'Idle'
      });
      setIsOpen(false);
      setName('');
      setPrompt('');
      toast.success("Agent added successfully");
    } catch (error) {
      toast.error("Failed to add agent");
    }
  };

  const PRESETS = [
    { name: "Wall Checker", role: "wall_checker", prompt: "You are a Wall Compliance Specialist. Focus on SANS 10400-K. Check for correct wall thicknesses (e.g., 230mm external, 110mm internal), damp-proof courses (DPC), and structural integrity of masonry." },
    { name: "Window Checker", role: "window_checker", prompt: "You are a Fenestration Specialist. Focus on SANS 10400-N. Check for natural ventilation requirements (5% of floor area) and natural lighting (10% of floor area). Verify safety glazing where required." },
    { name: "Door Checker", role: "door_checker", prompt: "You are a Door and Fire Safety Specialist. Focus on SANS 10400-T. Check for fire door ratings, escape route widths, and travel distances to exits." },
    { name: "Area Checker", role: "area_checker", prompt: "You are an Area and Room Sizing Specialist. Focus on SANS 10400-C. Check for minimum habitable room sizes (6m²), minimum ceiling heights (2.4m), and kitchen/bathroom dimensions." },
    { name: "Compliance Checker", role: "compliance_checker", prompt: "You are a General Compliance Specialist. Verify overall council readiness, including title blocks, north points, scale bars, and general SANS 10400-A compliance." },
    { name: "SANS Compliance Specialist", role: "sans_compliance", prompt: "You are a SANS Compliance Specialist. Your primary focus is verifying compliance with SANS 10400 regulations. You must check for basic requirements like minimum room sizes (SANS 10400-C) and fire safety aspects (SANS 10400-T). Ensure all findings are cross-referenced with the relevant SANS 10400 parts." }
  ];

  const applyPreset = (preset: typeof PRESETS[0]) => {
    setName(preset.name);
    setRole(preset.role);
    setPrompt(preset.prompt);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger render={<Button className="w-full h-12 rounded-xl font-bold gap-2 shadow-lg shadow-primary/20"><Plus size={18} /> Provision New Agent</Button>} />
      <DialogContent className="max-w-2xl border-border bg-white rounded-[2rem] p-0 overflow-hidden">
        <div className="bg-primary/5 p-8 border-b border-border">
          <DialogHeader>
            <DialogTitle className="font-heading text-3xl font-bold">Provision AI Agent</DialogTitle>
            <DialogDescription>Configure a new specialized agent for the compliance pipeline.</DialogDescription>
          </DialogHeader>
        </div>
        <div className="p-8 space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Quick Presets</label>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map(p => (
                <Button key={p.role} variant="outline" size="xs" onClick={() => applyPreset(p)} className="rounded-full text-[10px] h-7">
                  {p.name}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Agent Name</label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Fire Safety Expert" className="rounded-xl" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Role</label>
              <select 
                value={role} 
                onChange={e => setRole(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-border bg-white text-sm focus:ring-2 focus:ring-primary"
              >
                <option value="orchestrator">Orchestrator</option>
                <option value="wall_checker">Wall Checker (K)</option>
                <option value="window_checker">Window Checker (N)</option>
                <option value="door_checker">Door Checker (T)</option>
                <option value="area_checker">Area Checker (C)</option>
                <option value="compliance_checker">Compliance Checker (A)</option>
                <option value="sans_compliance">SANS Compliance</option>
              </select>
            </div>
          </div>

          <div className="space-y-4 border-t border-border pt-4">
            <h6 className="text-[10px] font-bold uppercase tracking-widest text-primary">LLM Configuration</h6>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Provider</label>
                <select 
                  value={llmProvider} 
                  onChange={e => {
                    const provider = e.target.value as LLMProvider | 'global';
                    setLlmProvider(provider);
                    if (provider !== 'global') {
                      const pConfig = PROVIDER_CONFIGS[provider];
                      setLlmBaseUrl(pConfig.baseUrl);
                      setLlmModel(pConfig.models[0].value);
                    } else {
                      setLlmBaseUrl('');
                      setLlmModel('');
                    }
                  }}
                  className="w-full h-10 px-3 rounded-xl border border-border bg-white text-xs focus:ring-2 focus:ring-primary outline-none"
                >
                  <option value="global">System Default (Global)</option>
                  {Object.entries(PROVIDER_CONFIGS).map(([key, p]) => (
                    <option key={key} value={key}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Model Name</label>
                {llmProvider === 'global' ? (
                  <Input 
                    value="Inherited from System Settings"
                    disabled
                    className="h-10 rounded-xl text-xs bg-secondary/20"
                  />
                ) : (
                  <div className="space-y-2">
                    <select 
                      value={llmModel} 
                      onChange={e => {
                        setLlmModel(e.target.value);
                        if (e.target.value === 'custom') {
                          setLlmModel('');
                        }
                      }}
                      className="w-full h-10 px-3 rounded-xl border border-border bg-white text-xs focus:ring-2 focus:ring-primary outline-none"
                    >
                      {PROVIDER_CONFIGS[llmProvider as LLMProvider].models.map(m => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                      <option value="custom">Enter custom model name...</option>
                    </select>
                    <Input 
                      value={llmModel}
                      onChange={e => setLlmModel(e.target.value)}
                      placeholder="Enter model name (e.g. nvidia/llama-3.1-70b-instruct)"
                      className="h-10 rounded-xl text-xs"
                    />
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">API Key (Optional)</label>
                <Input 
                  type="password"
                  value={llmApiKey} 
                  onChange={e => setLlmApiKey(e.target.value)}
                  className="h-10 rounded-xl text-xs"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Base URL</label>
                <Input 
                  value={llmBaseUrl} 
                  onChange={e => setLlmBaseUrl(e.target.value)}
                  className="h-10 rounded-xl text-xs"
                />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">System Prompt</label>
            <Textarea 
              value={prompt} 
              onChange={e => setPrompt(e.target.value)} 
              placeholder="Define the agent's behavior and constraints..." 
              className="min-h-[150px] rounded-xl font-mono text-xs"
            />
          </div>
          <Button onClick={handleAdd} className="w-full h-14 rounded-xl font-bold text-lg">Initialize Agent</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({ sub, onReject }: { sub: Submission, onReject: (sub: Submission, feedback: string) => void }) {
  const [feedback, setFeedback] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger render={<Button variant="outline" className="w-full h-14 rounded-xl border-destructive/20 text-destructive hover:bg-destructive/5 gap-2 font-bold"><XCircle size={18} /> Reject & Send Back</Button>} />
      <DialogContent className="max-w-md border-border bg-white rounded-[2rem] p-0 overflow-hidden">
        <div className="bg-destructive/5 p-8 border-b border-border">
          <DialogHeader>
            <DialogTitle className="font-heading text-2xl font-bold text-destructive">Reject Submission</DialogTitle>
            <DialogDescription>Provide detailed feedback for the architect to correct.</DialogDescription>
          </DialogHeader>
        </div>
        <div className="p-8 space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Rejection Feedback</label>
            <Textarea 
              value={feedback} 
              onChange={e => setFeedback(e.target.value)} 
              placeholder="e.g. Missing Part T fire safety annotations on the ground floor plan..." 
              className="min-h-[120px] rounded-xl"
            />
          </div>
          <Button 
            onClick={() => { onReject(sub, feedback); setIsOpen(false); }} 
            className="w-full h-14 bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl font-bold"
          >
            Confirm Rejection
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TestAgentDialog({ user }: { user: UserProfile }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<AIReviewResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSaveReport = async () => {
    if (!testResult) return;
    setIsSaving(true);
    try {
      await addDoc(collection(db, 'system_reports'), {
        title: `AI Agent Test Report - ${new Date().toLocaleString()}`,
        status: testResult.status,
        result: testResult,
        createdAt: new Date().toISOString(),
        createdBy: user.uid
      });
      toast.success("Report saved to system");
    } catch (error) {
      console.error("Save report error:", error);
      toast.error("Failed to save report");
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isPdf = file.type === 'application/pdf';
    const isDwg = file.name.toLowerCase().endsWith('.dwg');
    const isImg = file.type.startsWith('image/');

    if (!isPdf && !isDwg && !isImg) {
      toast.error("Please upload a PDF, DWG, or Image file.");
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setTestResult(null);

    const progressInterval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 90) return prev;
        return prev + 5;
      });
    }, 200);

    try {
      const url = await uploadAndTrackFile(file, {
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        uploadedBy: user.uid,
        context: 'test'
      });
      
      clearInterval(progressInterval);
      setUploadProgress(100);
      await new Promise(resolve => setTimeout(resolve, 500));
      
      setIsUploading(false);
      setIsTesting(true);
      
      try {
        const result = await reviewDrawing(url, file.name);
        setTestResult(result);
        toast.success("AI Test completed successfully.");
      } catch (error) {
        console.error("AI Test error:", error);
        toast.error("AI Test failed.");
      } finally {
        setIsTesting(false);
      }
    } catch (error) {
      clearInterval(progressInterval);
      console.error("Upload error:", error);
      toast.error("Failed to upload drawing.");
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger render={<Button variant="outline" className="w-full h-12 rounded-xl font-bold gap-2 border-primary/20 hover:bg-primary/5"><Upload size={16} /> Test Agents (Upload Plan)</Button>} />
      <DialogContent className="sm:max-w-[800px] border-border bg-white/95 backdrop-blur-md p-0 overflow-hidden rounded-[2rem] max-h-[90vh] flex flex-col">
        <div className="bg-primary/5 p-8 border-b border-border shrink-0">
          <DialogHeader>
            <DialogTitle className="font-heading text-2xl font-bold">Test AI Agents</DialogTitle>
            <DialogDescription>Upload a plan to run a live test of the AI compliance orchestrator.</DialogDescription>
          </DialogHeader>
        </div>
        <div className="p-8 overflow-y-auto flex-1 space-y-6">
          {!isUploading && !isTesting && !testResult && (
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-primary/20 rounded-[2rem] p-12 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-primary/5 transition-colors"
            >
              <Upload className="w-12 h-12 text-primary/40 mb-4" />
              <h3 className="font-heading font-bold text-lg mb-2">Upload Plan for Testing</h3>
              <p className="text-sm text-muted-foreground mb-6">Drag and drop or click to browse (PDF, DWG, Image)</p>
              <Button variant="outline" className="rounded-full px-8">Select File</Button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileSelect} 
                className="hidden" 
                accept=".pdf,.dwg,image/*"
              />
            </div>
          )}

          {isUploading && (
            <div className="text-center py-12">
              <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
              <h3 className="font-bold text-lg mb-2">Uploading Plan...</h3>
              <div className="w-full max-w-md mx-auto bg-secondary rounded-full h-2 overflow-hidden">
                <div className="bg-primary h-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
              </div>
              <p className="text-sm text-muted-foreground mt-2">{uploadProgress}%</p>
            </div>
          )}

          {isTesting && (
            <div className="py-16 relative flex flex-col items-center justify-center min-h-[400px]">
              <div className="relative w-64 h-64 flex items-center justify-center">
                <div className="absolute inset-0 border-2 border-primary/10 rounded-full animate-[spin_12s_linear_infinite]" />
                <div className="absolute inset-8 border border-dashed border-primary/20 rounded-full animate-[spin_15s_linear_infinite_reverse]" />
                
                {/* Radial lines */}
                <div className="absolute top-1/2 left-1/2 w-full h-[1px] bg-primary/10 -translate-x-1/2 -translate-y-1/2"></div>
                <div className="absolute top-1/2 left-1/2 w-full h-[1px] bg-primary/10 -translate-x-1/2 -translate-y-1/2 rotate-90"></div>
                <div className="absolute top-1/2 left-1/2 w-full h-[1px] bg-primary/10 -translate-x-1/2 -translate-y-1/2 rotate-45"></div>
                <div className="absolute top-1/2 left-1/2 w-full h-[1px] bg-primary/10 -translate-x-1/2 -translate-y-1/2 -rotate-45"></div>

                <div className="relative z-10 w-24 h-24 bg-white border-4 border-primary rounded-full flex flex-col items-center justify-center shadow-[0_0_30px_rgba(var(--primary),0.3)] animate-pulse">
                  <Cpu className="w-10 h-10 text-primary" />
                </div>
                
                {/* Orbiting Agents */}
                <div className="absolute top-0 left-1/2 -ml-6 -mt-6 w-12 h-12 bg-white border-2 border-primary/50 text-primary rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-110">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div className="absolute bottom-0 left-1/2 -ml-6 -mb-6 w-12 h-12 bg-white border-2 border-primary/50 text-primary rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-110">
                  <Eye className="w-5 h-5" />
                </div>
                <div className="absolute top-1/2 left-0 -mt-6 -ml-6 w-12 h-12 bg-white border-2 border-primary/50 text-primary rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-110">
                  <Activity className="w-5 h-5" />
                </div>
                <div className="absolute top-1/2 right-0 -mt-6 -mr-6 w-12 h-12 bg-white border-2 border-primary/50 text-primary rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-110">
                  <Briefcase className="w-5 h-5" />
                </div>
                <div className="absolute top-[14%] left-[14%] -ml-6 -mt-6 w-12 h-12 bg-white border-2 border-primary/50 text-primary rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-110">
                  <Settings2 className="w-5 h-5" />
                </div>
                <div className="absolute bottom-[14%] right-[14%] -ml-6 -mt-6 w-12 h-12 bg-white border-2 border-primary/50 text-primary rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-110">
                  <Search className="w-5 h-5" />
                </div>
              </div>

              <h3 className="font-bold text-xl mt-12 mb-2 animate-pulse">AI Orchestrator Running...</h3>
              <p className="text-sm text-muted-foreground">The specialized agents are actively evaluating compliance clauses.</p>
            </div>
          )}

          {testResult && (
            <div className="space-y-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-xl">System Testing Report</h3>
                <div className="flex gap-2">
                  <Badge className={testResult.status === 'passed' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                    {testResult.status === 'passed' ? 'PASSED' : 'FAILED'}
                  </Badge>
                  <Button variant="outline" size="sm" onClick={handleSaveReport} disabled={isSaving} className="gap-2">
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Report
                  </Button>
                </div>
              </div>
              
              <ScrollArea className="h-[500px] pr-4">
                <div className="space-y-6">
                  {/* Summary Box */}
                  <div className="p-6 bg-primary/5 border border-primary/20 rounded-2xl">
                    <h4 className="font-bold text-lg mb-2 flex items-center gap-2"><Sparkles className="w-5 h-5 text-primary"/> AI Orchestrator Summary</h4>
                    <div className="prose prose-sm max-w-none text-foreground">
                      <ReactMarkdown>{testResult.feedback}</ReactMarkdown>
                    </div>
                  </div>

                  {/* Agent Categories */}
                  <div className="space-y-4">
                    <h4 className="font-bold text-lg border-b pb-2">Agent Findings</h4>
                    {testResult.categories && testResult.categories.length > 0 ? testResult.categories.map((cat, idx) => (
                      <div key={idx} className="border border-border bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                         <div className="flex items-center justify-between mb-4">
                           <div className="flex items-center gap-2">
                             <Cpu className="text-primary w-5 h-5" />
                             <h5 className="font-bold text-md tracking-tight">{cat.name}</h5>
                           </div>
                           <Badge variant="outline" className="bg-secondary/50 font-mono">
                             {cat.issues.length} {cat.issues.length === 1 ? 'finding' : 'findings'}
                           </Badge>
                         </div>
                         
                         {cat.issues.length > 0 ? (
                           <div className="grid gap-3">
                             {cat.issues.map((issue, i) => (
                               <div key={i} className="flex gap-3 p-3 rounded-xl bg-secondary/20 border border-secondary/50">
                                 <div className="shrink-0 pt-0.5">
                                   {issue.severity === 'high' ? <AlertCircle className="w-4 h-4 text-red-500" /> : 
                                    issue.severity === 'medium' ? <AlertCircle className="w-4 h-4 text-orange-500" /> : 
                                    <CheckCircle2 className="w-4 h-4 text-blue-500" />}
                                 </div>
                                 <div className="space-y-1">
                                   <p className="text-sm font-medium">{issue.description}</p>
                                   {issue.actionItem && (
                                     <p className="text-xs text-muted-foreground flex items-center gap-1">
                                       <ArrowRight className="w-3 h-3" /> {issue.actionItem}
                                     </p>
                                   )}
                                 </div>
                               </div>
                             ))}
                           </div>
                         ) : (
                           <div className="p-4 bg-green-50 text-green-700 rounded-xl flex items-center gap-2 text-sm font-medium border border-green-100">
                             <CheckCircle2 className="w-5 h-5" /> No compliance issues found by this agent.
                           </div>
                         )}
                      </div>
                    )) : (
                      <div className="p-6 text-center border-2 border-dashed rounded-2xl text-muted-foreground">
                        No categorized agent findings available.
                      </div>
                    )}
                  </div>
                  
                  {/* Trace Log */}
                  <div className="p-5 bg-secondary/30 border border-border rounded-2xl">
                    <h4 className="font-bold text-sm text-muted-foreground mb-2 flex items-center gap-2 uppercase tracking-widest"><History className="w-4 h-4" /> Trace Log</h4>
                    <p className="text-xs font-mono text-muted-foreground leading-relaxed whitespace-pre-wrap flex-1 min-w-0 break-words">{testResult.traceLog}</p>
                  </div>
                </div>
              </ScrollArea>
              
              <Button onClick={() => setTestResult(null)} className="w-full h-14 rounded-xl font-bold bg-primary/10 text-primary hover:bg-primary hover:text-white transition-colors">Test Another Plan</Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
