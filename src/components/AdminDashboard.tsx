import React, { useState, useEffect, useRef } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, onSnapshot, doc, getDoc, updateDoc, collectionGroup, getDocs, addDoc, setDoc, deleteDoc, orderBy, limit, where } from 'firebase/firestore';
import { uploadAndTrackFile } from '../lib/uploadService';
import { UserProfile, Job, Submission, TraceLog, Agent, SystemLog, UserRole, LLMConfig, LLMProvider, AIReviewResult, AICategory } from '../types';
import { safeFormat, safeLocale } from '../lib/utils';
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
import { ShieldCheck, Eye, CheckCircle2, XCircle, History, Info, Cpu, Activity, ListFilter, Settings2, Save, Trash2, Plus, RefreshCcw, AlertTriangle, FileText, Briefcase, ExternalLink, Search, Users, Upload, Loader2, ChevronDown, ChevronUp, Sparkles, Shield, Maximize2, Download, AlertCircle, ArrowRight, Building2, Star } from 'lucide-react';
import MunicipalSettingsAdmin from './MunicipalSettingsAdmin';
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
import AdminKnowledgeUploader from './AdminKnowledgeUploader';
import ReviewManagement from "./ReviewManagement";

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
  }
} as const;

export default function AdminDashboard({ user, activeTab, onTabChange }: { user: UserProfile, activeTab?: string, onTabChange?: (tab: string) => void }) {
  const [pendingKnowledgeCount, setPendingKnowledgeCount] = useState(0);

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

      <Tabs value={activeTab || 'submissions'} onValueChange={onTabChange} className="w-full">
        <ScrollArea className="w-full whitespace-nowrap mb-8" orientation="horizontal">
          <TabsList className="bg-secondary/50 border border-border p-1 rounded-full w-fit inline-flex mb-1">
            <TabsTrigger value="submissions" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full px-6 md:px-8 gap-2 font-bold text-xs uppercase tracking-widest">
              <FileText size={16} /> Submissions
            </TabsTrigger>
            <TabsTrigger value="agents" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full px-6 md:px-8 gap-2 font-bold text-xs uppercase tracking-widest">
              <Cpu size={16} /> Agents
            </TabsTrigger>
            <TabsTrigger value="reviews" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full px-6 md:px-8 gap-2 font-bold text-xs uppercase tracking-widest">
              <Star size={16} /> Moderation
            </TabsTrigger>
            <TabsTrigger value="knowledge" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full px-6 md:px-8 gap-2 font-bold text-xs uppercase tracking-widest relative">
              <Sparkles size={16} /> Brain
            </TabsTrigger>
            <TabsTrigger value="municipal" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full px-6 md:px-8 gap-2 font-bold text-xs uppercase tracking-widest">
              <Building2 size={16} /> Municipal
            </TabsTrigger>
          </TabsList>
        </ScrollArea>

        <TabsContent value="submissions">
           <div className="bg-white p-8 rounded-[2rem] border border-border">
              <h2 className="text-2xl font-bold mb-6">Review Pipeline</h2>
              <p className="text-muted-foreground italic">Pipeline management interface...</p>
           </div>
        </TabsContent>

        <TabsContent value="reviews">
           <div className="bg-white p-8 rounded-[2rem] border border-border">
              <ReviewManagement />
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
    </div>
  );
}
