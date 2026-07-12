import React, { useState, useEffect, useMemo, useRef } from 'react';
import { sendPasswordResetEmail } from "firebase/auth";
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, onSnapshot, doc, getDoc, updateDoc, collectionGroup, getDocs, addDoc, setDoc, deleteDoc, orderBy, limit, where } from 'firebase/firestore';
import { uploadAndTrackFile } from '../lib/uploadService';
import { UserProfile, Job, Submission, TraceLog, Agent, SystemLog, UserRole, LLMConfig, LLMProvider, AIReviewResult, AICategory, Dispute, ExecutionMode, DrawingReference, Project, Firm, UserVerification } from '../types';
import { apiFetch } from '../lib/apiClient';
import { paginateItems, safeFormat, safeLocale, totalPages } from '../lib/utils';
import ProfileEditor from './ProfileEditor';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { toast } from 'sonner';
import { RoleAwareSidebar } from './navigation/RoleAwareSidebar';
import { MobileMenuTrigger } from './navigation/MobileMenuTrigger';
import { Breadcrumbs } from './navigation/Breadcrumbs';
import { GlassButton } from './ui/GlassButton';
import { StatCardAnimated } from './animated/StatCardAnimated';
import { DashboardSection } from './composite/DashboardSection';
import { GlassTable } from './composite/GlassTable';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { ShieldCheck, Eye, CheckCircle2, XCircle, History, Info, Cpu, Activity, ListFilter, Settings2, Save, Trash2, Plus, RefreshCcw, AlertTriangle, FileText, Briefcase, ExternalLink, Search, Users, Upload, Loader2, ChevronDown, ChevronUp, Sparkles, Shield, Maximize2, Download, AlertCircle, ArrowRight, Star, Building2, CreditCard, Landmark } from 'lucide-react';
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
import { buildVerificationQueueProjection, getVerificationLifecycle } from '../services/userVerificationService';
import ComplianceReport from './ComplianceReport';
import AgentKnowledgeManager from './AgentKnowledgeManager';
import { pdfGenerationService } from "../services/pdfGenerationService";
import AdminKnowledgeUploader from './AdminKnowledgeUploader';
import ReviewManagement from "./ReviewManagement";
import MunicipalSettingsAdmin from './MunicipalSettingsAdmin';
import ExecutionModePicker from './ExecutionModePicker';
import FeeEstimator from './FeeEstimator';
import StageProgressTracker from './StageProgressTracker';
import { subscribeToProjectByJobId } from '../services/projectLifecycleService';
import AdvanceStageButton from './AdvanceStageButton';
import FinancialDashboard from './FinancialDashboard';
import { getSelectedProfessionalId } from '../lib/professionalRoleCompatibility';


import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';
const PROVIDER_CONFIGS = {
  gemini: {
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    envApiKey: 'GEMINI_API_KEY',
    authorizationType: 'bearer',
    authorizationHeader: '',
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
    envApiKey: 'OPENAI_API_KEY',
    authorizationType: 'bearer',
    authorizationHeader: '',
    models: [
      { value: 'gpt-4o', label: 'GPT-4o' },
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
      { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' }
    ]
  },
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    envApiKey: 'OPENROUTER_API_KEY',
    authorizationType: 'bearer',
    authorizationHeader: '',
    models: [
      { value: 'anthropic/claude-3-5-sonnet', label: 'Claude 3.5 Sonnet' },
      { value: 'anthropic/claude-3-opus', label: 'Claude 3 Opus' }
    ]
  },
  nvidia: {
    label: 'NVIDIA NIM',
    // NVIDIA Build / NIM OpenAI-compatible endpoint.
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    envApiKey: 'NVIDIA_API_KEY',
    authorizationType: 'bearer',
    authorizationHeader: '',
    models: [
      { value: 'mistralai/mistral-large-3-675b-instruct-2512', label: 'Mistral Large 3 675B Instruct' },
      { value: 'meta/llama-3.3-70b-instruct', label: 'Llama 3.3 70B Instruct' },
      { value: 'meta/llama-3.2-90b-vision-instruct', label: 'Llama 3.2 90B Vision Instruct' },
      { value: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B' },
      { value: 'qwen/qwen3-next-80b-a3b-instruct', label: 'Qwen3 Next 80B Instruct' }
    ]
  }
} as const;

const providerKeys = Object.keys(PROVIDER_CONFIGS) as LLMProvider[];

function applyProviderDefaults(agent: Agent, provider: LLMProvider | 'global', model?: string): Agent {
  if (provider === 'global') {
    return {
      ...agent,
      llmProvider: 'global',
      llmModel: '',
      llmApiKey: '',
      llmBaseUrl: '',
      authorizationType: undefined,
      authorizationValue: '',
      authorizationHeader: '',
    };
  }

  const config = PROVIDER_CONFIGS[provider];
  const selectedModel = model || agent.llmModel || config.models[0]?.value || '';
  return {
    ...agent,
    llmProvider: provider,
    llmModel: selectedModel,
    llmBaseUrl: config.baseUrl,
    llmApiKey: `env:${config.envApiKey}`,
    authorizationType: config.authorizationType as 'bearer',
    authorizationValue: `env:${config.envApiKey}`,
    authorizationHeader: config.authorizationHeader,
  };
}

function createBlankAgent(): Agent {
  return applyProviderDefaults({
    id: '',
    name: 'New Compliance Agent',
    role: 'custom_agent',
    description: 'Describe this agent\'s compliance responsibility.',
    systemPrompt: 'You are an architectural compliance specialist. Review drawings and return concise, regulation-grounded findings.',
    temperature: 0.1,
    status: 'online',
    lastActive: new Date().toISOString(),
    llmProvider: 'nvidia',
  }, 'nvidia');
}

function AdminGovernanceToolsPanel({ agents, logs, users, jobs, onNavigate }: { agents: Agent[]; logs: SystemLog[]; users: UserProfile[]; jobs: Job[]; onNavigate?: (tab: string) => void }) {
  const aiNotifications = logs.filter((log) => /ai|agent|llm|review|signoff|governance/i.test(`${log.source} ${log.message}`));
  const toolSetRows = [
    { label: 'Agent tool set', value: agents.length, detail: `${agents.filter((agent) => agent.status === 'online').length} online agents`, action: 'compliance' },
    { label: 'Audit trail viewer', value: logs.length, detail: `${logs.filter((log) => log.level === 'error' || log.level === 'critical').length} errors or critical records`, action: 'audit' },
    { label: 'Payment rate settings', value: 'Live', detail: 'Configured through admin FeeEstimator settings', action: 'fees' },
    { label: 'AI notification feed', value: aiNotifications.length, detail: 'Filtered from live system log events', action: 'audit' },
  ];
  const roleCounts = users.reduce<Record<string, number>>((acc, profile) => {
    acc[profile.role] = (acc[profile.role] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6" data-testid="admin-governance-tools-panel">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        {toolSetRows.map((row) => (
          <Card key={row.label} className="rounded-2xl border-border bg-white shadow-sm">
            <CardContent className="p-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{row.label}</p>
              <p className="mt-2 font-heading text-3xl font-black text-primary">{row.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{row.detail}</p>
              <Button type="button" variant="outline" size="sm" className="mt-4 rounded-xl" onClick={() => onNavigate?.(row.action)}>Open source tool</Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="rounded-[2rem] border-border bg-white shadow-sm overflow-hidden">
          <CardHeader className="border-b border-border bg-primary/5">
            <CardTitle className="font-heading text-2xl flex items-center gap-2"><History className="h-5 w-5 text-primary" /> Audit Trail Viewer</CardTitle>
            <CardDescription>Live `system_logs` stream for administrators. Records are read-only from the browser and remain append-only in governance rules.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-secondary/30">
                <TableRow><TableHead>Level</TableHead><TableHead>Source</TableHead><TableHead>Message</TableHead><TableHead>Time</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {logs.slice(0, 8).map((log) => (
                  <TableRow key={log.id}>
                    <TableCell><Badge variant={log.level === 'error' || log.level === 'critical' ? 'destructive' : 'outline'} className="uppercase text-[10px]">{log.level}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">{log.source}</TableCell>
                    <TableCell className="text-xs">{log.message}</TableCell>
                    <TableCell className="text-[10px] text-muted-foreground">{safeFormat(log.timestamp, 'MMM d, HH:mm')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {logs.length === 0 && <p className="p-6 text-sm text-muted-foreground">No system log records are currently visible.</p>}
          </CardContent>
        </Card>

        <Card className="rounded-[2rem] border-border bg-white shadow-sm">
          <CardHeader className="border-b border-border bg-primary/5">
            <CardTitle className="font-heading text-2xl flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> AI Notification Feed</CardTitle>
            <CardDescription>AI, agent, review, and governance notifications filtered from live system logs. No synthetic alerts are generated.</CardDescription>
          </CardHeader>
          <CardContent className="p-5 space-y-3">
            {aiNotifications.length === 0 ? <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">No AI notification events are currently visible.</p> : aiNotifications.slice(0, 10).map((log) => (
              <div key={log.id} className="rounded-xl border border-border bg-secondary/20 p-4 text-sm">
                <div className="flex items-center justify-between gap-3"><Badge variant="outline" className="uppercase text-[10px]">{log.source}</Badge><span className="text-[10px] text-muted-foreground">{safeFormat(log.timestamp, 'MMM d, HH:mm')}</span></div>
                <p className="mt-2 text-xs text-muted-foreground">{log.message}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="rounded-[2rem] border-border bg-white shadow-sm">
          <CardHeader><CardTitle className="font-heading text-xl flex items-center gap-2"><Settings2 className="h-5 w-5 text-primary" /> Tool Set Management</CardTitle><CardDescription>Production coverage map from live agents, users, and jobs. Configuration actions stay in their dedicated admin tabs.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {agents.slice(0, 8).map((agent) => <div key={agent.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm"><div><p className="font-semibold">{agent.name}</p><p className="text-xs text-muted-foreground">{agent.role} · {(agent.executionModes ?? []).join(', ') || 'No modes'}</p></div><Badge variant={agent.status === 'online' ? 'default' : 'outline'}>{agent.status}</Badge></div>)}
            {agents.length === 0 && <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">No agent tool set records are currently visible.</p>}
          </CardContent>
        </Card>
        <Card className="rounded-[2rem] border-border bg-white shadow-sm">
          <CardHeader><CardTitle className="font-heading text-xl flex items-center gap-2"><CreditCard className="h-5 w-5 text-primary" /> Payment Rate Settings</CardTitle><CardDescription>Admin fee and payment settings are managed by the production FeeEstimator. This panel surfaces platform scale and links to the live editor.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border p-4"><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Users</p><p className="text-2xl font-heading font-black">{users.length}</p></div>
              <div className="rounded-xl border border-border p-4"><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Jobs</p><p className="text-2xl font-heading font-black">{jobs.length}</p></div>
            </div>
            <div className="flex flex-wrap gap-2">{Object.entries(roleCounts).map(([role, count]) => <Badge key={role} variant="outline" className="capitalize">{role}: {count}</Badge>)}</div>
            <Button type="button" className="rounded-xl" onClick={() => onNavigate?.('fees')}>Open payment rate settings</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Agent Card Component
function AgentCard({ agent, isNew = false, onCreated, onCancel }: { agent: Agent; key?: React.Key; isNew?: boolean; onCreated?: () => void; onCancel?: () => void }) {
  const [editing, setEditing] = useState(isNew);
  const [tempAgent, setTempAgent] = useState<Agent>(agent);
  const [isTesting, setIsTesting] = useState(false);
  const [settingsTested, setSettingsTested] = useState(false);

  const updateTempAgent = (next: Agent) => {
    setTempAgent(next);
    setSettingsTested(false);
  };

  const handleProviderChange = (provider: LLMProvider | 'global') => {
    updateTempAgent(applyProviderDefaults(tempAgent, provider));
  };

  const handleModelChange = (model: string) => {
    if (tempAgent.llmProvider && tempAgent.llmProvider !== 'global') {
      updateTempAgent(applyProviderDefaults(tempAgent, tempAgent.llmProvider as LLMProvider, model));
    } else {
      updateTempAgent({ ...tempAgent, llmModel: model });
    }
  };

  const handleTestSettings = async () => {
    if (!tempAgent.llmProvider || tempAgent.llmProvider === 'global') {
      toast.error('Select a concrete LLM provider before testing');
      return;
    }
    setIsTesting(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await apiFetch('/api/agent/test-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          provider: tempAgent.llmProvider,
          model: tempAgent.llmModel,
          apiKey: tempAgent.llmApiKey,
          baseUrl: tempAgent.llmBaseUrl,
          authorizationType: tempAgent.authorizationType,
          authorizationValue: tempAgent.authorizationValue,
          authorizationHeader: tempAgent.authorizationHeader,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        const details = typeof data.details === 'string'
          ? data.details
          : data.details
            ? JSON.stringify(data.details)
            : '';
        const target = data.targetUrl ? ` (${data.targetUrl})` : '';
        throw new Error([data.error || 'Agent settings test failed', details].filter(Boolean).join(': ') + target);
      }
      setSettingsTested(true);
      toast.success(data.message || 'Agent settings test passed');
    } catch (error: any) {
      setSettingsTested(false);
      toast.error(error.message || 'Agent settings test failed');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    if (isNew && !settingsTested) {
      toast.error('Test the agent settings successfully before creating this agent');
      return;
    }
    try {
      const payload = {
        ...tempAgent,
        id: undefined,
        updatedAt: new Date().toISOString(),
        ...(isNew ? { createdAt: new Date().toISOString() } : {}),
      };
      if (isNew) {
        await addDoc(getDemoCol( 'agents'), payload);
        onCreated?.();
        toast.success("Agent created");
        return;
      }
      await updateDoc(getDemoDoc( 'agents', agent.id), payload);
      setEditing(false);
      toast.success("Agent configuration saved");
    } catch (error) {
      toast.error("Failed to save agent configuration");
    }
  };

  const handleReset = () => {
    setTempAgent(agent);
    setSettingsTested(false);
    setEditing(false);
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this agent? This cannot be undone.")) return;
    try {
      await deleteDoc(getDemoDoc( 'agents', agent.id));
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
              <Cpu size={14} /> {isNew ? 'New Agent' : `${agent.name} (Editing)`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-8 space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Name</label>
              <Input 
                value={tempAgent.name} 
                onChange={e => updateTempAgent({...tempAgent, name: e.target.value})}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Role</label>
              <Input 
                value={tempAgent.role} 
                onChange={e => updateTempAgent({...tempAgent, role: e.target.value})}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Description</label>
              <Textarea 
                value={tempAgent.description} 
                onChange={e => updateTempAgent({...tempAgent, description: e.target.value})}
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
                      handleModelChange(val === 'custom' ? '' : val);
                    }}
                    className="w-full h-12 px-4 rounded-xl border border-border bg-white text-sm focus:ring-2 focus:ring-primary outline-none"
                  >
                    <option value="">Select a model</option>
                    {tempAgent.llmProvider && 
                     (tempAgent.llmProvider as string) !== 'global' && 
                     PROVIDER_CONFIGS[tempAgent.llmProvider as LLMProvider]?.models?.map(m => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                    <option value="custom">Enter custom model name...</option>
                  </select>
                  <Input 
                    value={tempAgent.llmModel || ''}
                    onChange={e => handleModelChange(e.target.value)}
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
                onChange={e => handleProviderChange(e.target.value as LLMProvider | 'global')}
                className="w-full h-12 px-4 rounded-xl border border-border bg-white text-sm focus:ring-2 focus:ring-primary outline-none"
              >
                <option value="global">Global (Use System Config)</option>
                {providerKeys.map((key) => (
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
                    onChange={e => handleModelChange(e.target.value)}
                    className="w-full h-12 px-4 rounded-xl border border-border bg-white text-sm focus:ring-2 focus:ring-primary outline-none"
                  >
                    <option value="">Select a model</option>
                    {tempAgent.llmProvider && 
                     (tempAgent.llmProvider as string) !== 'global' && 
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
                    onChange={e => updateTempAgent({...tempAgent, llmApiKey: e.target.value, authorizationValue: e.target.value})}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Base URL</label>
                  <Input 
                    value={tempAgent.llmBaseUrl || ''} 
                    onChange={e => updateTempAgent({...tempAgent, llmBaseUrl: e.target.value})}
                    className="rounded-xl"
                  />
                </div>
              </>
            )}
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Authorization Type</label>
              <select 
                value={tempAgent.authorizationType || ''} 
                onChange={e => updateTempAgent({...tempAgent, authorizationType: e.target.value as 'bearer' | 'api_key' | 'custom'})}
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
                    onChange={e => updateTempAgent({...tempAgent, authorizationValue: e.target.value, llmApiKey: e.target.value})}
                    className="rounded-xl"
                  />
                </div>
                {tempAgent.authorizationType === 'custom' && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Header Name</label>
                    <Input 
                      value={tempAgent.authorizationHeader || ''} 
                      onChange={e => updateTempAgent({...tempAgent, authorizationHeader: e.target.value})}
                      className="rounded-xl"
                    />
                  </div>
                )}
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button onClick={handleTestSettings} variant={settingsTested ? 'default' : 'outline'} className="h-12 rounded-xl font-bold gap-2" disabled={isTesting || tempAgent.llmProvider === 'global'}>
              {isTesting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} {settingsTested ? 'Test Passed' : 'Test Settings'}
            </Button>
            <Button onClick={handleSave} className="bg-primary text-primary-foreground h-12 rounded-xl font-bold gap-2 shadow-lg shadow-primary/20">
              <Save size={16} /> {isNew ? 'Create Agent' : 'Save Changes'}
            </Button>
            <Button onClick={handleReset} variant="outline" className="h-12 rounded-xl font-bold gap-2 border-primary/20 hover:bg-primary/5 text-primary">
              <RefreshCcw size={16} /> Reset
            </Button>
            <Button onClick={() => isNew ? onCancel?.() : setEditing(false)} variant="ghost" className="h-12 rounded-xl font-bold gap-2">
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
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isAddingAgent, setIsAddingAgent] = useState(false);
  const [newAgent, setNewAgent] = useState<Partial<Agent>>({
    name: '',
    role: '',
    description: '',
    systemPrompt: '',
    temperature: 0.1,
    status: 'online',
    riskLevel: 'medium',
    standardsCoverage: [],
    executionModes: ['basic_ai_screen', 'full_professional_review'],
    requiresHumanReview: true,
    llmProvider: 'global',
    version: '1.0.0'
  });

  // Map sidebar tabs to internal dashboard tabs
  const internalTab = 
    activeTab === 'compliance' ? 'agents' : 
    activeTab === 'audit' ? 'logs' : 
    activeTab === 'users' ? 'users' : 
    activeTab === 'settings' ? 'settings' : 
    activeTab === 'fees' ? 'fees' :
    activeTab === 'financial' ? 'financial' :
    activeTab === 'firms' ? 'firms' :
    activeTab === 'verifications' ? 'verifications' :
    activeTab === 'governance-tools' ? 'governance-tools' :
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
  const [projectsByJobId, setProjectsByJobId] = useState<Record<string, Project>>({});
  const [firms, setFirms] = useState<Firm[]>([]);
  const [userVerifications, setUserVerifications] = useState<UserVerification[]>([]);
  const [isCreatingAgent, setIsCreatingAgent] = useState(false);
  const [submissionPage, setSubmissionPage] = useState(1);
  const [disputePage, setDisputePage] = useState(1);
  const [userPage, setUserPage] = useState(1);
  const [submissionModes, setSubmissionModes] = useState<Record<string, ExecutionMode | ''>>({});
  const [reviewingSubmissionId, setReviewingSubmissionId] = useState<string | null>(null);
  const pageSize = 8;

  useEffect(() => {
    const handleListenerError = (label: string) => (error: unknown) => {
      console.error(`[AdminDashboard] ${label} listener failed`, error);
      toast.error(`Could not load admin ${label}. Check admin role and Firestore rules.`);
    };

    const unsubSubmissions = onSnapshot(
      query(collectionGroup(db, 'submissions'), orderBy('createdAt', 'desc'), limit(100)),
      (snapshot) => {
        setSubmissions(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Submission)));
      },
      handleListenerError('submissions')
    );
    const unsubAgents = onSnapshot(
      query(getDemoCol( 'agents'), orderBy('name')),
      (snapshot) => {
        setAgents(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Agent)));
      },
      handleListenerError('agents')
    );
    const unsubJobs = onSnapshot(
      query(getDemoCol( 'jobs'), orderBy('createdAt', 'desc'), limit(100)),
      (snapshot) => {
        const jobs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Job));
        setAllJobs(jobs);
        setStats(current => ({ ...current, totalJobs: jobs.length }));
      },
      handleListenerError('jobs')
    );
    const unsubLogs = onSnapshot(
      query(getDemoCol( 'system_logs'), orderBy('timestamp', 'desc'), limit(50)),
      (snapshot) => {
        const nextLogs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as SystemLog));
        setLogs(nextLogs);
        setStats(current => ({ ...current, errorCount: nextLogs.filter(log => log.level === 'error' || log.level === 'critical').length }));
      },
      handleListenerError('system logs')
    );
    const unsubDisputes = onSnapshot(
      query(getDemoCol( 'disputes'), orderBy('createdAt', 'desc'), limit(100)),
      (snapshot) => {
        setDisputes(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Dispute)));
      },
      handleListenerError('disputes')
    );
    const unsubUsers = onSnapshot(
      query(getDemoCol( 'users'), orderBy('createdAt', 'desc'), limit(200)),
      (snapshot) => {
        setAllUsers(snapshot.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)));
      },
      handleListenerError('users')
    );
    const unsubProjects = onSnapshot(
      query(getDemoCol( 'projects'), limit(200)),
      (snapshot) => {
        const nextProjects: Record<string, Project> = {};
        snapshot.docs.forEach(d => {
          const project = { id: d.id, ...d.data() } as Project;
          nextProjects[project.jobId] = project;
        });
        setProjectsByJobId(nextProjects);
      },
      handleListenerError('projects')
    );
    const unsubFirms = onSnapshot(
      query(getDemoCol( 'firms'), limit(200)),
      (snapshot) => {
        setFirms(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Firm)));
      },
      handleListenerError('firms')
    );
    const unsubVerifications = onSnapshot(
      query(getDemoCol( 'user_verifications'), limit(250)),
      (snapshot) => {
        setUserVerifications(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as UserVerification)));
      },
      handleListenerError('verifications')
    );
    return () => {
      unsubSubmissions();
      unsubAgents();
      unsubJobs();
      unsubLogs();
      unsubDisputes();
      unsubUsers();
      unsubProjects();
      unsubFirms();
      unsubVerifications();
    };
  }, []);

  useEffect(() => {
    setStats(current => ({
      ...current,
      approvedDrawings: submissions.filter(submission => submission.status === 'approved').length,
      activeAgents: agents.filter(agent => agent.status === 'online').length
    }));
  }, [agents, submissions]);

  useEffect(() => {
    if (!selectedJob) {
      setSelectedProject(null);
      return;
    }

    const unsubscribe = subscribeToProjectByJobId(selectedJob.id, setSelectedProject);
    return () => unsubscribe();
  }, [selectedJob?.id]);

  const pagedSubmissions = paginateItems<Submission>(submissions, submissionPage, pageSize);
  const pagedDisputes = paginateItems<Dispute>(disputes, disputePage, pageSize);
  const filteredUsers = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return allUsers.filter(u =>
      (u.displayName || '').toLowerCase().includes(term) ||
      (u.email || '').toLowerCase().includes(term)
    );
  }, [allUsers, searchTerm]);
  const pagedUsers = paginateItems<UserProfile>(filteredUsers, userPage, pageSize);
  const verificationQueue = useMemo(() => buildVerificationQueueProjection(userVerifications), [userVerifications]);
  const verificationsById = useMemo(() => new Map(userVerifications.map(verification => [verification.id, verification])), [userVerifications]);
  const pendingSubmissionCount = submissions.filter(submission => ['ai_passed', 'admin_reviewing'].includes(submission.status)).length;
  const failedSubmissionCount = submissions.filter(submission => ['ai_failed', 'admin_rejected'].includes(submission.status)).length;
  const tabTriggerClass = "min-h-11 w-full rounded-2xl px-3 py-2 gap-2 font-bold text-[10px] sm:text-xs uppercase tracking-widest data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm";

  const updateSubmissionStatus = async (submission: Submission, status: Submission['status']) => {
    try {
      await updateDoc(getDemoDoc( `jobs/${submission.jobId}/submissions`, submission.id), {
        status,
        adminFeedback: status === 'approved' ? 'Approved by admin review.' : 'Rejected by admin review.',
        updatedAt: new Date().toISOString()
      });
      toast.success(status === 'approved' ? 'Submission approved' : 'Submission rejected');
    } catch {
      toast.error('Failed to update submission');
    }
  };

  const rerunAIReview = async (submission: Submission) => {
    setReviewingSubmissionId(submission.id);
    try {
      const selectedMode = submissionModes[submission.id] || undefined;
      const files: DrawingReference[] = [{ url: submission.drawingUrl, name: submission.drawingName }];
      const result = await reviewDrawing(
        submission.drawingUrl,
        submission.drawingName,
        undefined,
        submission.id,
        selectedMode || undefined,
        files,
        submission.findings || []
      );
      await updateDoc(getDemoDoc( `jobs/${submission.jobId}/submissions`, submission.id), {
        status: result.status === 'passed' ? 'ai_passed' : 'ai_failed',
        aiFeedback: result.feedback,
        aiStructuredFeedback: result.categories,
        findings: result.findings || [],
        signOffChecklist: result.signOffChecklist || [],
        riskStatus: result.riskStatus || 'ai_review_failed',
        executionMode: result.mode || selectedMode || null,
        updatedAt: new Date().toISOString()
      });
      toast.success('AI review completed and persisted');
    } catch (error) {
      console.error(error);
      toast.error('Failed to run AI review');
    } finally {
      setReviewingSubmissionId(null);
    }
  };

  const handleCreateAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    const role = (newAgent.role || '').trim().toLowerCase().replace(/\s+/g, '_');
    const name = (newAgent.name || '').trim();
    const systemPrompt = (newAgent.systemPrompt || '').trim();

    if (!name || !role || !systemPrompt) {
      toast.error('Agent name, role, and system prompt are required');
      return;
    }

    if (agents.some(agent => agent.role === role)) {
      toast.error('An agent with this role already exists');
      return;
    }

    try {
      await addDoc(getDemoCol( 'agents'), {
        ...newAgent,
        name,
        role,
        description: newAgent.description || 'Custom admin-created agent.',
        systemPrompt,
        temperature: Number(newAgent.temperature ?? 0.1),
        status: newAgent.status || 'online',
        standardsCoverage: Array.isArray(newAgent.standardsCoverage) ? newAgent.standardsCoverage : [],
        executionModes: Array.isArray(newAgent.executionModes) ? newAgent.executionModes : ['basic_ai_screen'],
        requiresHumanReview: newAgent.requiresHumanReview ?? true,
        llmProvider: newAgent.llmProvider || 'global',
        lastActive: new Date().toISOString(),
        version: newAgent.version || '1.0.0'
      });

      toast.success('Agent created');
      setIsAddingAgent(false);
      setNewAgent({
        name: '',
        role: '',
        description: '',
        systemPrompt: '',
        temperature: 0.1,
        status: 'online',
        riskLevel: 'medium',
        standardsCoverage: [],
        executionModes: ['basic_ai_screen', 'full_professional_review'],
        requiresHumanReview: true,
        llmProvider: 'global',
        version: '1.0.0'
      });
    } catch (error) {
      console.error(error);
      toast.error('Failed to create agent');
    }
  };

  const reviewUserVerification = async (verification: UserVerification, status: 'verified' | 'rejected') => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Admin session expired');
      const rejectionReason = status === 'rejected'
        ? window.prompt('Enter rejection reason for audit log') || ''
        : undefined;
      if (status === 'rejected' && rejectionReason.trim().length < 5) {
        toast.error('A clear rejection reason is required');
        return;
      }
      const response = await apiFetch(`/api/admin/verifications/${encodeURIComponent(verification.id)}/review`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status,
          rejectionReason,
          adminReviewNote: status === 'verified' ? 'Admin confirmed automated browser verification evidence.' : rejectionReason,
        }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Verification review failed');
      }
      toast.success(status === 'verified' ? 'Verification approved' : 'Verification rejected');
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Failed to review verification');
    }
  };
  const recheckUserVerification = async (verification: UserVerification) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Admin session expired');
      const response = await apiFetch(`/api/admin/verifications/${encodeURIComponent(verification.id)}/recheck`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: 'Admin queued official register recheck from verification console' }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Verification recheck failed');
      }
      toast.success('Verification recheck queued');
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Failed to queue verification recheck');
    }
  };


  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <RoleAwareSidebar user={user} />
      <MobileMenuTrigger user={user} className="fixed left-4 top-4 z-50" />
      <main className="md:ml-64 p-4 md:p-6 space-y-6">
        {/* Header: glass-panel with title, breadcrumbs, action buttons */}
        <header className="glass-panel rounded-2xl p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <Shield className="text-primary w-7 h-7" aria-hidden="true" />
                <h1 className="text-2xl md:text-3xl font-heading font-black tracking-tight text-foreground">
                  Admin Command Center
                </h1>
              </div>
              <p className="text-foreground/60 text-sm max-w-xl">Platform orchestration and agent supervision.</p>
              <Breadcrumbs className="mt-2" onNavigate={onTabChange} />
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <GlassButton
                size="sm"
                variant="solid"
                onClick={() => onTabChange?.('compliance')}
                aria-label="Manage AI agents"
              >
                <Cpu size={14} className="mr-1" /> Agents
              </GlassButton>
              <GlassButton
                size="sm"
                onClick={() => onTabChange?.('users')}
                aria-label="View users"
              >
                <Users size={14} className="mr-1" /> Users
              </GlassButton>
            </div>
          </div>
        </header>

        {/* Stats overview row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCardAnimated
            label="Total Jobs"
            value={stats.totalJobs}
            icon={<Briefcase size={18} />}
            delay={prefersReducedMotion ? 0 : 0 * 0.05}
            prefersReducedMotion={prefersReducedMotion ?? false}
          />
          <StatCardAnimated
            label="Approved Drawings"
            value={stats.approvedDrawings}
            icon={<CheckCircle2 size={18} />}
            trend={{ direction: 'up', value: `${stats.approvedDrawings}` }}
            delay={prefersReducedMotion ? 0 : 1 * 0.05}
            prefersReducedMotion={prefersReducedMotion ?? false}
          />
          <StatCardAnimated
            label="Active Agents"
            value={stats.activeAgents}
            icon={<Cpu size={18} />}
            delay={prefersReducedMotion ? 0 : 2 * 0.05}
            prefersReducedMotion={prefersReducedMotion ?? false}
          />
          <StatCardAnimated
            label="System Errors"
            value={stats.errorCount}
            icon={<AlertTriangle size={18} />}
            trend={stats.errorCount > 0 ? { direction: 'down', value: `${stats.errorCount}` } : undefined}
            delay={prefersReducedMotion ? 0 : 3 * 0.05}
            prefersReducedMotion={prefersReducedMotion ?? false}
          />
        </div>

        <Tabs value={internalTab} onValueChange={(val) => {
          const reverseMapping: Record<string, string> = {
            agents: 'compliance',
            logs: 'audit',
            users: 'users',
            settings: 'settings',
            knowledge: 'knowledge',
            jobs: 'projects',
            fees: 'fees',
            financial: 'financial',
            firms: 'firms',
            verifications: 'verifications',
            'governance-tools': 'governance-tools',
            submissions: 'overview'
          };
          onTabChange?.(reverseMapping[val] || val);
        }} className="w-full">
        <div className="mb-6 glass-panel rounded-2xl p-3">
          <TabsList className="grid w-full grid-cols-2 items-stretch gap-2 rounded-xl bg-transparent p-1 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            <TabsTrigger value="submissions" className={tabTriggerClass}>
              <FileText size={16} /> Submissions
            </TabsTrigger>
            <TabsTrigger value="agents" className={tabTriggerClass}>
              <Cpu size={16} /> Agents
            </TabsTrigger>
            <TabsTrigger value="users" className={tabTriggerClass}>
              <Users size={16} /> Users
            </TabsTrigger>
            <TabsTrigger value="jobs" className={tabTriggerClass}>
              <Briefcase size={16} /> Jobs
            </TabsTrigger>
            <TabsTrigger value="reviews" className={tabTriggerClass}>
              <Star size={16} /> Moderation
            </TabsTrigger>
            <TabsTrigger value="knowledge" className={`${tabTriggerClass} relative`}>
              <Sparkles size={16} /> Brain
            </TabsTrigger>
            <TabsTrigger value="disputes" className={tabTriggerClass}>
              <AlertTriangle size={16} /> Disputes
            </TabsTrigger>
            <TabsTrigger value="logs" className={tabTriggerClass}>
              <History size={16} /> Audit Logs
            </TabsTrigger>
            <TabsTrigger value="municipal" className={tabTriggerClass}>
              <Building2 size={16} /> Municipal
            </TabsTrigger>
            <TabsTrigger value="fees" className={tabTriggerClass}>
              <CreditCard size={16} /> Fees
            </TabsTrigger>
            <TabsTrigger value="financial" className={tabTriggerClass}>
              <Landmark size={16} /> Financial
            </TabsTrigger>
            <TabsTrigger value="firms" className={tabTriggerClass}>
              <Building2 size={16} /> Firms
            </TabsTrigger>
            <TabsTrigger value="verifications" className={tabTriggerClass}>
              <ShieldCheck size={16} /> Verify
            </TabsTrigger>
            <TabsTrigger value="governance-tools" className={tabTriggerClass}>
              <Settings2 size={16} /> Tool Sets
            </TabsTrigger>
            <TabsTrigger value="settings" className={tabTriggerClass}>
              <Settings2 size={16} /> LLM Settings
            </TabsTrigger>
            <TabsTrigger value="analytics" className={tabTriggerClass}>
              <Activity size={16} /> Analytics
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="submissions">
           <DashboardSection
             title="Submissions Review Pipeline"
             description="Review, approve, or reject uploaded drawings from one clear queue."
             icon={<FileText size={18} />}
             action={
               <div className="flex flex-wrap gap-2 text-center">
                 <div className="glass-tile rounded-xl px-4 py-2 text-center min-w-[70px]">
                   <p className="text-xl font-bold">{submissions.length}</p>
                   <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/60">Total</p>
                 </div>
                 <div className="glass-tile rounded-xl px-4 py-2 text-center min-w-[70px]">
                   <p className="text-xl font-bold text-primary">{pendingSubmissionCount}</p>
                   <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/60">Pending</p>
                 </div>
                 <div className="glass-tile rounded-xl px-4 py-2 text-center min-w-[70px]">
                   <p className="text-xl font-bold text-red-400">{failedSubmissionCount}</p>
                   <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/60">Issues</p>
                 </div>
               </div>
             }
           >
              <div className="space-y-3">
                {pagedSubmissions.map(submission => (
                  <div key={submission.id} className="glass-record rounded-xl p-4 transition-all hover:-translate-y-0.5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-foreground">{submission.drawingName}</p>
                      <p className="text-xs text-foreground/60">Job {submission.jobId} · {new Date(submission.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                      <Badge variant="outline" className="uppercase text-[10px] tracking-widest">{(submission.status || 'processing').replace('_', ' ')}</Badge>
                      <Button size="sm" variant="outline" onClick={() => setReportSubmission(submission)}>View Report</Button>
                      <Button size="sm" onClick={() => updateSubmissionStatus(submission, 'approved')}>Approve</Button>
                      <Button size="sm" variant="destructive" onClick={() => updateSubmissionStatus(submission, 'admin_rejected')}>Reject</Button>
                    </div>
                  </div>
                ))}
                {submissions.length === 0 && <p className="text-foreground/50 italic py-8 text-center">No submissions awaiting review.</p>}
              </div>
              {submissions.length > pageSize && <PaginationControls page={submissionPage} totalPages={totalPages(submissions.length, pageSize)} onPageChange={setSubmissionPage} />}
           </DashboardSection>
        </TabsContent>

        <TabsContent value="disputes">
          <DashboardSection
            title="Dispute Mediation"
            description="Review and resolve platform disputes."
            icon={<AlertTriangle size={18} />}
          >
            <div className="space-y-3">
              {pagedDisputes.map(dispute => <div key={dispute.id}><DisputeRow dispute={dispute} /></div>)}
              {disputes.length === 0 && <p className="text-foreground/50 italic py-8 text-center">No open disputes.</p>}
            </div>
            {disputes.length > pageSize && <PaginationControls page={disputePage} totalPages={totalPages(disputes.length, pageSize)} onPageChange={setDisputePage} />}
          </DashboardSection>
        </TabsContent>

        <TabsContent value="analytics">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCardAnimated label="Jobs" value={stats.totalJobs} icon={<Briefcase size={18} />} delay={0 * 0.05} prefersReducedMotion={prefersReducedMotion ?? false} />
            <StatCardAnimated label="Approved Drawings" value={stats.approvedDrawings} icon={<CheckCircle2 size={18} />} delay={1 * 0.05} prefersReducedMotion={prefersReducedMotion ?? false} />
            <StatCardAnimated label="Active Agents" value={stats.activeAgents} icon={<Cpu size={18} />} delay={2 * 0.05} prefersReducedMotion={prefersReducedMotion ?? false} />
            <StatCardAnimated label="Errors" value={stats.errorCount} icon={<AlertTriangle size={18} />} delay={3 * 0.05} prefersReducedMotion={prefersReducedMotion ?? false} />
          </div>
        </TabsContent>

        <TabsContent value="logs">
          <DashboardSection
            title="System Activity Logs"
            description="Live read-only stream of system events and audit records."
            icon={<History size={18} />}
          >
            <GlassTable
              columns={[
                { key: 'level', label: 'Level', render: (val) => (
                  <Badge variant={(val === 'error' || val === 'critical') ? 'destructive' : 'outline'} className="uppercase text-[10px]">
                    {String(val)}
                  </Badge>
                )},
                { key: 'source', label: 'Source', render: (val) => <span className="font-mono text-xs">{String(val)}</span> },
                { key: 'message', label: 'Message', render: (val) => <span className="text-xs">{String(val)}</span> },
                { key: 'timestamp', label: 'Time', render: (val) => <span className="text-[10px] text-foreground/60">{safeFormat(String(val), 'MMM d, HH:mm:ss')}</span> },
              ]}
              rows={logs}
              rowKey="id"
              emptyState={<span className="text-foreground/50 italic">No system log records are currently visible.</span>}
            />
          </DashboardSection>
        </TabsContent>

        <TabsContent value="jobs">
          <DashboardSection
            title="Platform Jobs"
            description="All jobs on the platform."
            icon={<Briefcase size={18} />}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {allJobs.map(job => (
                <div key={job.id} className="glass-card rounded-xl p-5 transition-all hover:-translate-y-0.5">
                  <div className="flex justify-between items-start mb-3">
                    <Badge className="bg-primary/10 text-primary uppercase text-[10px] tracking-widest">{job.category}</Badge>
                    <Badge variant="outline" className="uppercase text-[10px] tracking-widest">{job.status}</Badge>
                  </div>
                  <h3 className="font-bold mb-2 text-foreground">{job.title}</h3>
                  <p className="text-xs text-foreground/60 line-clamp-2 mb-4">{job.description}</p>
                  <div className="flex justify-between items-center text-[10px] font-bold text-foreground/60 uppercase">
                    <span>Budget: R {(job.budget ?? 0).toLocaleString()}</span>
                    <span>Created: {safeFormat(job.createdAt, 'MMM d, yyyy')}</span>
                  </div>
                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => setSelectedJob(job)}>View Details</Button>
                    {projectsByJobId[job.id] && (
                      <AdvanceStageButton project={projectsByJobId[job.id]} actorId={user.uid} size="sm" />
                    )}
                  </div>
                </div>
              ))}
              {allJobs.length === 0 && <p className="text-foreground/50 italic py-8 text-center col-span-full">No jobs found on the platform.</p>}
            </div>
          </DashboardSection>
        </TabsContent>

        <TabsContent value="settings">
          <DashboardSection
            title="System Configuration"
            description="Global LLM strategy and system health."
            icon={<Settings2 size={18} />}
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-6">
                <h3 className="text-sm font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                  <Cpu size={16} /> Global LLM Strategy
                </h3>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-foreground/60 uppercase tracking-widest">Active Provider</label>
                    <select className="w-full h-12 px-4 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary">
                      <option value="gemini">Google Gemini (Recommended)</option>
                      <option value="openai">OpenAI</option>
                      <option value="openrouter">OpenRouter</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-foreground/60 uppercase tracking-widest">Default Model</label>
                    <Input placeholder="gemini-2.0-flash" className="h-12 rounded-xl" />
                  </div>
                  <GlassButton variant="solid" size="md" className="w-full">Save Global Settings</GlassButton>
                </div>
              </div>

              <div className="space-y-6 glass-panel rounded-2xl p-6">
                <h3 className="text-sm font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                  <Activity size={16} /> System Health
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between text-xs py-2 border-b border-border/50">
                    <span className="text-foreground/60">API Latency</span>
                    <span className="font-bold text-primary">142ms</span>
                  </div>
                  <div className="flex justify-between text-xs py-2 border-b border-border/50">
                    <span className="text-foreground/60">Database Connectivity</span>
                    <span className="font-bold text-primary">Stable</span>
                  </div>
                  <div className="flex justify-between text-xs py-2 border-b border-border/50">
                    <span className="text-foreground/60">Agent Response Rate</span>
                    <span className="font-bold">98.4%</span>
                  </div>
                </div>
              </div>
            </div>
          </DashboardSection>
        </TabsContent>

        <TabsContent value="reviews">
           <DashboardSection
             title="Content Moderation"
             description="Review and moderate platform reviews and reports."
             icon={<Star size={18} />}
           >
              <ReviewManagement />
           </DashboardSection>
        </TabsContent>

        <TabsContent value="agents">
          <DashboardSection
            title="Agent Configuration"
            description="Create, test, and tune specialist agents with provider defaults filled automatically."
            icon={<Cpu size={18} />}
            action={
              <GlassButton
                variant="solid"
                size="sm"
                onClick={() => setIsCreatingAgent(true)}
                disabled={isCreatingAgent}
                aria-label="Create new agent"
              >
                <Plus size={16} className="mr-1" /> New Agent
              </GlassButton>
            }
          >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {isCreatingAgent && (
              <AgentCard
                agent={createBlankAgent()}
                isNew
                onCreated={() => setIsCreatingAgent(false)}
                onCancel={() => setIsCreatingAgent(false)}
              />
            )}
            {agents.map(agent => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
            {agents.length === 0 && !isCreatingAgent && (
              <div className="col-span-full py-20 text-center border-2 border-dashed border-border rounded-2xl">
                <p className="text-foreground/50 italic">No agents found in the system.</p>
              </div>
            )}
          </div>
          </DashboardSection>
        </TabsContent>

        <TabsContent value="users">
          <DashboardSection
            title="User Management"
            description="View and manage all registered platform users."
            icon={<Users size={18} />}
            action={
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/40 w-4 h-4" />
                <Input
                  placeholder="Search users..."
                  className="pl-10 rounded-full w-[260px]"
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setUserPage(1); }}
                />
              </div>
            }
          >
            <GlassTable
              columns={[
                { key: 'uid', label: 'User', render: (_val, row) => (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                      {((row as UserProfile).displayName || (row as UserProfile).email || 'U')[0]}
                    </div>
                    <span className="font-medium">{(row as UserProfile).displayName || (row as UserProfile).email || 'Unknown User'}</span>
                  </div>
                )},
                { key: 'role', label: 'Role', render: (val) => (
                  <Badge variant="outline" className="uppercase text-[10px] tracking-widest">{String(val)}</Badge>
                )},
                { key: 'email', label: 'Email', render: (val) => <span className="text-foreground/60 text-xs">{String(val || '')}</span> },
                { key: 'createdAt', label: 'Joined', render: (val) => <span className="text-foreground/60 text-xs">{safeFormat(String(val || ''), 'MMM d, yyyy')}</span> },
                { key: 'uid', label: 'Actions', render: (_val, row) => (
                  <Button variant="ghost" size="sm" onClick={() => toast.info(`Managing user ${(row as UserProfile).displayName || (row as UserProfile).email || (row as UserProfile).uid}`)}>
                    <Settings2 size={16} />
                  </Button>
                )},
              ]}
              rows={pagedUsers}
              rowKey="uid"
              emptyState={<span className="text-foreground/50 italic">No users found matching your search.</span>}
            />
            {filteredUsers.length > pageSize && <PaginationControls page={userPage} totalPages={totalPages(filteredUsers.length, pageSize)} onPageChange={setUserPage} />}
          </DashboardSection>
        </TabsContent>

        <TabsContent value="knowledge">
           <DashboardSection
             title="Knowledge Base"
             description="Upload and manage agent knowledge and training materials."
             icon={<Sparkles size={18} />}
           >
              <div className="space-y-6">
                <AdminKnowledgeUploader user={user} />
                <AgentKnowledgeManager user={user} />
              </div>
           </DashboardSection>
        </TabsContent>

        <TabsContent value="municipal">
           <DashboardSection
             title="Municipal Settings"
             description="Configure municipal submission credentials and tracking."
             icon={<Building2 size={18} />}
           >
              <MunicipalSettingsAdmin />
           </DashboardSection>
        </TabsContent>

        <TabsContent value="fees">
          <FeeEstimator role="admin" />
        </TabsContent>

        <TabsContent value="financial">
          <FinancialDashboard />
        </TabsContent>

        <TabsContent value="verifications">
          <DashboardSection
            title="Verification Agent Queue"
            description="Review records created by the Architex browser verification agent against official registers."
            icon={<ShieldCheck size={18} />}
            action={
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="uppercase text-[10px] tracking-widest">{verificationQueue.summary.total} records</Badge>
                <Badge variant="outline" className="uppercase text-[10px] tracking-widest">{verificationQueue.summary.pending} pending</Badge>
                <Badge variant={verificationQueue.summary.overdue > 0 ? 'destructive' : 'outline'} className="uppercase text-[10px] tracking-widest">{verificationQueue.summary.overdue} SLA overdue</Badge>
                <Badge variant="outline" className="uppercase text-[10px] tracking-widest">{verificationQueue.summary.dueForRecheck} rechecks</Badge>
              </div>
            }
          >
            <GlassTable
              columns={[
                { key: 'userId', label: 'User', render: (val) => <span className="font-mono text-xs">{String(val)}</span> },
                { key: 'subjectType', label: 'Subject', render: (val) => <Badge variant="outline" className="uppercase text-[10px] tracking-widest">{String(val)}</Badge> },
                { key: 'id', label: 'Register', render: (_val, row) => {
                  const v = row as UserVerification;
                  return (
                    <div className="text-xs text-foreground/60">
                      {v.statutoryBody || 'Unspecified'} · {v.registrationNumber || 'No number'}
                      {v.expiresAt && <p className="mt-1">Expires {safeFormat(v.expiresAt, 'MMM d, yyyy')}</p>}
                    </div>
                  );
                }},
                { key: 'status', label: 'Status', render: (val, row) => {
                  const v = row as UserVerification;
                  const queueItem = verificationQueue.items.find(i => i.id === v.id);
                  const lifecycle = getVerificationLifecycle(v);
                  const agentStatus = v.metadata?.verificationAgentStatus as string | undefined;
                  return (
                    <div className="flex flex-col items-start gap-1">
                      <Badge variant={val === 'verified' ? 'secondary' : val === 'rejected' ? 'destructive' : 'outline'} className="uppercase text-[10px] tracking-widest">{String(val)}</Badge>
                      {queueItem && <Badge variant={queueItem.priority === 'urgent' ? 'destructive' : 'outline'} className="uppercase text-[10px] tracking-widest">{queueItem.priority} priority</Badge>}
                      {(lifecycle.isDueForRecheck || agentStatus) && (
                        <Badge variant={lifecycle.isExpired ? 'destructive' : 'outline'} className="uppercase text-[10px] tracking-widest">
                          {agentStatus === 'queued' ? 'Agent queued' : lifecycle.lifecycleStatus.replace(/_/g, ' ')}
                        </Badge>
                      )}
                    </div>
                  );
                }},
                { key: 'id', label: 'Actions', render: (_val, row) => {
                  const v = row as UserVerification;
                  return (
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => recheckUserVerification(v)} disabled={v.status === 'pending'}>Recheck</Button>
                      <Button size="sm" onClick={() => reviewUserVerification(v, 'verified')} disabled={v.status === 'verified'}>Approve</Button>
                      <Button size="sm" variant="destructive" onClick={() => reviewUserVerification(v, 'rejected')} disabled={v.status === 'rejected'}>Reject</Button>
                    </div>
                  );
                }},
              ]}
              rows={userVerifications}
              rowKey="id"
              emptyState={<span className="text-foreground/50 italic">No verification records have been submitted yet.</span>}
            />
          </DashboardSection>
        </TabsContent>

        <TabsContent value="governance-tools">
          <AdminGovernanceToolsPanel agents={agents} logs={logs} users={allUsers} jobs={allJobs} onNavigate={onTabChange} />
        </TabsContent>

        <TabsContent value="firms">
          <DashboardSection
            title="Firm Oversight"
            description="Review firm workspace records and subscription/access status without replacing user management."
            icon={<Building2 size={18} />}
            action={<Badge variant="outline" className="uppercase text-[10px] tracking-widest">{firms.length} firms</Badge>}
          >
            <GlassTable
              columns={[
                { key: 'name', label: 'Firm', render: (val) => <span className="font-bold">{String(val)}</span> },
                { key: 'ownerId', label: 'Owner', render: (val) => <span className="font-mono text-xs">{String(val)}</span> },
                { key: 'subscriptionStatus', label: 'Subscription', render: (val) => (
                  <Badge variant="outline" className="uppercase text-[10px] tracking-widest">{String(val)}</Badge>
                )},
                { key: 'primaryContactEmail', label: 'Contact', render: (_val, row) => {
                  const f = row as Firm;
                  return <span className="text-xs text-foreground/60">{f.primaryContactEmail || f.billingEmail || 'Not set'}</span>;
                }},
                { key: 'createdAt', label: 'Created', render: (val) => <span className="text-xs text-foreground/60">{safeFormat(String(val || ''), 'MMM d, yyyy')}</span> },
              ]}
              rows={firms}
              rowKey="id"
              emptyState={<span className="text-foreground/50 italic">No firm workspaces have been created yet.</span>}
            />
          </DashboardSection>
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
                  traceLog: reportSubmission.traceability?.[0]?.details || 'Review trace not found.',
                  findings: reportSubmission.findings || [],
                  signOffChecklist: reportSubmission.signOffChecklist || [],
                  riskStatus: reportSubmission.riskStatus,
                  mode: reportSubmission.executionMode,
                  submissionIndex: reportSubmission.drawingUrl ? [{ url: reportSubmission.drawingUrl, name: reportSubmission.drawingName, detectedType: 'architectural_drawing' }] : undefined
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

      <Dialog open={!!selectedJob} onOpenChange={(open) => !open && setSelectedJob(null)}>
        <DialogContent className="max-w-[95vw] w-[1100px] max-h-[90vh] overflow-y-auto rounded-[2rem] p-0">
          {selectedJob && (() => {
            const client = allUsers.find(u => u.uid === selectedJob.clientId);
            const selectedProfessionalId = getSelectedProfessionalId(selectedJob);
            const architect = selectedProfessionalId ? allUsers.find(u => u.uid === selectedProfessionalId) : null;
            const jobSubmissions = submissions.filter(submission => submission.jobId === selectedJob.id);
            const jobDisputes = disputes.filter(dispute => dispute.jobId === selectedJob.id);

            return (
              <div className="glass-panel rounded-[2rem]">
                <DialogHeader className="p-8 border-b border-border/50 text-left">
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap gap-2 mb-4">
                        <Badge className="bg-primary text-primary-foreground uppercase text-[10px] tracking-widest">{selectedJob.category}</Badge>
                        <Badge variant="outline" className="uppercase text-[10px] tracking-widest">{selectedJob.status || 'open'}</Badge>
                      </div>
                      <DialogTitle className="text-3xl md:text-4xl font-heading font-black tracking-tight">{selectedJob.title}</DialogTitle>
                      <DialogDescription className="mt-2 text-sm font-mono">Project ID: {selectedJob.id}</DialogDescription>
                    </div>
                    <div className="grid grid-cols-2 gap-3 min-w-[260px]">
                      <ProjectMetric label="Budget" value={`R ${(selectedJob.budget || 0).toLocaleString()}`} />
                      <ProjectMetric label="Submissions" value={jobSubmissions.length} />
                      <ProjectMetric label="Disputes" value={jobDisputes.length} />
                      <ProjectMetric label="Requirements" value={selectedJob.requirements?.length || 0} />
                    </div>
                  </div>
                </DialogHeader>

                <div className="p-8 space-y-8">
                  {selectedProject && (
                    <div className="space-y-3">
                      <StageProgressTracker currentStage={selectedProject.currentStage} stageHistory={selectedProject.stageHistory} />
                      <div className="flex justify-end">
                        <AdvanceStageButton project={selectedProject} actorId={user.uid} />
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <DetailPanel title="Project Brief" className="lg:col-span-2">
                      <p className="text-sm text-foreground/60 leading-relaxed whitespace-pre-wrap">{selectedJob.description || 'No description provided.'}</p>
                    </DetailPanel>
                    <DetailPanel title="Project Metadata">
                      <DetailRow label="Location" value={selectedJob.location || 'Not specified'} />
                      <DetailRow label="Created" value={safeFormat(selectedJob.createdAt, 'MMM d, yyyy HH:mm')} />
                      <DetailRow label="Updated" value={selectedJob.updatedAt ? safeFormat(selectedJob.updatedAt, 'MMM d, yyyy HH:mm') : 'No updates recorded'} />
                      <DetailRow label="Deadline" value={safeFormat(selectedJob.deadline, 'MMM d, yyyy')} />
                      {selectedJob.cancelledAt && <DetailRow label="Cancelled" value={safeFormat(selectedJob.cancelledAt, 'MMM d, yyyy HH:mm')} />}
                      {selectedJob.cancellationReason && <DetailRow label="Cancellation reason" value={selectedJob.cancellationReason} />}
                    </DetailPanel>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <DetailPanel title="Stakeholders">
                      <StakeholderBlock label="Client" user={client} fallbackId={selectedJob.clientId} />
                      <div className="mt-4 pt-4 border-t border-border/50">
                        <StakeholderBlock label="Selected BEP / Design Professional" user={architect} fallbackId={selectedProfessionalId} empty="No design professional selected yet" />
                      </div>
                    </DetailPanel>

                    <DetailPanel title="Requirements">
                      {selectedJob.requirements?.length ? (
                        <ul className="space-y-2">
                          {selectedJob.requirements.map((requirement, index) => (
                            <li key={`${requirement}-${index}`} className="flex gap-3 glass-record rounded-xl p-3 text-sm">
                              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-primary" />
                              <span>{requirement}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-foreground/50 italic">No requirements captured for this project.</p>
                      )}
                    </DetailPanel>
                  </div>

                  <DetailPanel title="Compliance & Submission Activity">
                    {jobSubmissions.length ? (
                      <div className="space-y-3">
                        {jobSubmissions.map(submission => (
                          <div key={submission.id} className="glass-record rounded-xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                            <div>
                              <p className="font-bold text-sm">{submission.drawingName}</p>
                              <p className="text-xs text-foreground/60">Submitted {safeFormat(submission.createdAt, 'MMM d, yyyy HH:mm')} · Architect {submission.architectId}</p>
                              {submission.riskStatus && <p className="text-xs text-primary mt-1">Risk: {submission.riskStatus.replaceAll('_', ' ')}</p>}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className="uppercase text-[10px] tracking-widest">{(submission.status || 'processing').replaceAll('_', ' ')}</Badge>
                              <Button size="sm" variant="outline" onClick={() => setReportSubmission(submission)}>View Report</Button>
                              {submission.drawingUrl && (
                                <Button size="sm" variant="ghost" onClick={() => window.open(submission.drawingUrl, '_blank', 'noopener,noreferrer')}>
                                  <ExternalLink size={14} /> Drawing
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-foreground/50 italic">No drawing submissions or compliance activity recorded yet.</p>
                    )}
                  </DetailPanel>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <DetailPanel title="Status History">
                      {selectedJob.statusHistory?.length ? (
                        <div className="space-y-3">
                          {selectedJob.statusHistory.map((item, index) => (
                            <div key={`${item.status}-${item.timestamp}-${index}`} className="border-l-2 border-primary/30 pl-4 py-1">
                              <p className="text-sm font-bold capitalize">{item.status.replace('-', ' ')}</p>
                              <p className="text-xs text-foreground/60">{safeFormat(item.timestamp, 'MMM d, yyyy HH:mm')} · Actor {item.actorId}</p>
                              {item.note && <p className="text-xs mt-1">{item.note}</p>}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-foreground/50 italic">No status history has been recorded.</p>
                      )}
                    </DetailPanel>

                    <DetailPanel title="Disputes & Admin Attention">
                      {jobDisputes.length ? (
                        <div className="space-y-3">
                          {jobDisputes.map(dispute => (
                            <div key={dispute.id} className="glass-record rounded-xl p-4">
                              <div className="flex items-center justify-between gap-3 mb-2">
                                <p className="text-sm font-bold">{dispute.reason}</p>
                                <Badge variant="outline" className="uppercase text-[10px] tracking-widest">{dispute.status.replaceAll('_', ' ')}</Badge>
                              </div>
                              <p className="text-xs text-foreground/60">Requested: {dispute.requestedResolution}</p>
                              {dispute.adminNotes && <p className="text-xs mt-2">Admin notes: {dispute.adminNotes}</p>}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-foreground/50 italic">No disputes linked to this project.</p>
                      )}
                    </DetailPanel>
                  </div>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
      </main>
    </div>
  );
}

function ProjectMetric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="glass-tile rounded-xl p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-foreground/60">{label}</p>
      <p className="mt-1 text-lg font-heading font-black text-foreground">{value}</p>
    </div>
  );
}

function DetailPanel({ title, className = '', children }: React.PropsWithChildren<{ title: string; className?: string }>) {
  return (
    <section className={`glass-card rounded-2xl p-6 ${className}`}>
      <h3 className="text-[10px] font-black uppercase tracking-widest text-primary mb-4">{title}</h3>
      {children}
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="py-3 border-b border-border/40 last:border-b-0">
      <p className="text-[10px] font-black uppercase tracking-widest text-foreground/60">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground break-words">{value}</p>
    </div>
  );
}

function StakeholderBlock({ label, user, fallbackId, empty = 'Not assigned' }: { label: string; user?: UserProfile | null; fallbackId?: string; empty?: string }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">{label}</p>
      {user ? (
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
            {(user.displayName || user.email || 'U')[0]}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm">{user.displayName || 'Unnamed user'}</p>
            <p className="text-xs text-muted-foreground break-all">{user.email}</p>
            <Badge variant="outline" className="mt-2 uppercase text-[10px] tracking-widest">{user.role}</Badge>
          </div>
        </div>
      ) : fallbackId ? (
        <p className="text-sm text-muted-foreground">User ID: <span className="font-mono">{fallbackId}</span></p>
      ) : (
        <p className="text-sm text-muted-foreground italic">{empty}</p>
      )}
    </div>
  );
}

function DisputeRow({ dispute }: { dispute: Dispute }) {
  const [adminNotes, setAdminNotes] = useState(dispute.adminNotes || '');
  const [resolution, setResolution] = useState(dispute.resolution || '');

  const updateDispute = async (status: Dispute['status']) => {
    try {
      await updateDoc(getDemoDoc( 'disputes', dispute.id), {
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
    <div className="glass-tile rounded-xl p-5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/60">{title}</p>
      <p className="mt-2 text-3xl font-heading font-black text-foreground">{value}</p>
    </div>
  );
}

function PaginationControls({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (page: number) => void }) {
  return (
    <div className="flex items-center justify-between glass-panel rounded-xl p-3 mt-4">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</Button>
      <span className="text-xs font-bold text-foreground/60">Page {page} of {totalPages}</span>
      <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Next</Button>
    </div>
  );
}
