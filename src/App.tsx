/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy, useState, useEffect } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';
import { auth, db, trackEvent } from './lib/firebase';
import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendEmailVerification,
  setPersistence,
  browserLocalPersistence,
  type User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { UserProfile, UserRole, Job, JobCategory, KnowledgeCitation } from './types';
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './components/ui/card';
import { Badge } from './components/ui/badge';
import { ScrollArea } from './components/ui/scroll-area';
import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Input } from './components/ui/input';
import {
  LayoutDashboard,
  Briefcase,
  FileText,
  Users,
  LogOut,
  Plus,
  Search,
  ShieldCheck,
  History,
  ArrowRight,
  CheckCircle2,
  MapPin,
  Clock,
  Menu,
  X,
  Loader2,
  Mail,
  Lock,
  User as UserIcon,
  Settings2,
  CreditCard,
  Calculator,
  Landmark,
  UserCircle,
  HardDrive,
  Sparkles,
  Send,
  Building2,
  BookOpen,
  Bot,
  Workflow,
  Files,
  ClipboardCheck,
  Network,
  Hammer,
  Download,
  Lightbulb,
  Database,
  Construction,
  ArrowLeft,
  Factory
} from 'lucide-react';

import { Logo } from './components/Logo';
import { NotificationBell } from './components/NotificationBell';

import { AnimatedFloorPlan } from './components/AnimatedFloorPlan';

type LazyImport<T extends ComponentType<any>> = () => Promise<{ default: T }>;

function isDynamicImportError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk \d+ failed/i.test(message);
}

function reloadOnceForUpdatedChunk(error: unknown) {
  if (!isDynamicImportError(error) || typeof window === 'undefined') {
    throw error;
  }

  const reloadKey = 'architex:chunk-reload-attempted';
  if (window.sessionStorage.getItem(reloadKey) === 'true') {
    throw error;
  }

  window.sessionStorage.setItem(reloadKey, 'true');
  console.warn('A lazy-loaded application chunk could not be fetched. Reloading once to request the latest deployment assets.', error);
  window.location.reload();
  return new Promise<never>(() => undefined);
}

function lazyWithChunkRetry<T extends ComponentType<any>>(importer: LazyImport<T>): LazyExoticComponent<T> {
  return lazy(() => importer().catch(reloadOnceForUpdatedChunk));
}

const ClientDashboard = lazyWithChunkRetry(() => import('./components/ClientDashboard'));
const ArchitectDashboard = lazyWithChunkRetry(() => import('./components/ArchitectDashboard'));
const AdminDashboard = lazyWithChunkRetry(() => import('./components/AdminDashboard'));
const FreelancerDashboard = lazyWithChunkRetry(() => import('./components/FreelancerDashboard'));
const BEPDashboard = lazyWithChunkRetry(() => import('./components/BEPDashboard'));
const ContractorDashboard = lazyWithChunkRetry(() => import('./components/ContractorDashboard'));
const FirmDashboard = lazyWithChunkRetry(() => import('./components/FirmDashboard'));
const UserSettings = lazyWithChunkRetry(() => import('./components/UserSettings'));
const InvoiceManagement = lazyWithChunkRetry(() => import('./components/InvoiceManagement'));
const FileManager = lazyWithChunkRetry(() => import('./components/FileManager'));
const OnboardingFlow = lazyWithChunkRetry(() => import('./components/OnboardingFlow'));
const MunicipalTracker = lazyWithChunkRetry(() => import('./components/MunicipalTracker'));
const KnowledgeSources = lazyWithChunkRetry(() => import('./components/KnowledgeSources').then((module) => ({ default: module.KnowledgeSources })));
const ProjectCommandCentre = lazyWithChunkRetry(() => import('./components/ProjectCommandCentre'));
const ProjectWorkflowPage = lazyWithChunkRetry(() => import('./components/ProjectWorkflowPage'));
const GuidedBriefWizard = lazyWithChunkRetry(() => import('./components/GuidedBriefWizard'));
const ClientProposalComparison = lazyWithChunkRetry(() => import('./components/ClientProposalComparison'));
const TechnicalBriefEditor = lazyWithChunkRetry(() => import('./components/TechnicalBriefEditor'));
const DirectorySearch = lazyWithChunkRetry(() => import('./components/DirectorySearch'));
const PackageProcurementWorkspace = lazyWithChunkRetry(() => import('./components/PackageProcurementWorkspace'));
const ClientProgressReports = lazyWithChunkRetry(() => import('./components/ClientProgressReports'));
const AIDrawingChecker = lazyWithChunkRetry(() => import('./components/AIDrawingChecker'));
const TasksApprovalsPage = lazyWithChunkRetry(() => import('./components/TasksApprovalsPage'));
const ResourceCentre = lazyWithChunkRetry(() => import('./components/ResourceCentre'));
const DesignCompliancePage = lazyWithChunkRetry(() => import('./components/DesignCompliancePage'));
const ProjectToolboxPage = lazyWithChunkRetry(() => import('./components/ProjectToolboxPage'));
const FreelancerSubmissionsPage = lazyWithChunkRetry(() => import('./components/FreelancerSubmissionsPage'));
const ResourceSharingPage = lazyWithChunkRetry(() => import('./components/ResourceSharingPage'));
const AICoPilotPage = lazyWithChunkRetry(() => import('./components/AICoPilotPage'));
const ContractorStaffPlantPage = lazyWithChunkRetry(() => import('./components/ContractorStaffPlantPage'));
const BEPFreelancerJobsPage = lazyWithChunkRetry(() => import('./components/BEPFreelancerJobsPage'));

const DASHBOARD_ALIGNMENT_CITATIONS: KnowledgeCitation[] = [
  {
    knowledgeId: 'dashboard-alignment-ai-copilot',
    title: 'AI Co-Pilot canonical page requirement',
    content: 'Contextual AI explanations, routing, reminders, preparation, and approval prompts should be exposed as a first-class shared dashboard page.',
    source: 'documentation',
    tags: ['AI Co-Pilot', 'dashboard alignment', 'governance'],
  },
  {
    knowledgeId: 'dashboard-alignment-resource-centre',
    title: 'Resource Centre / Checklists canonical page requirement',
    content: 'Design-team and freelancer users need a Resource Centre / Checklists page for reusable checklists, templates, reference documents, and project resources.',
    source: 'documentation',
    tags: ['Resource Centre', 'checklists', 'templates'],
  },
  {
    knowledgeId: 'ai-governance-human-signoff',
    title: 'Human sign-off governance note',
    content: 'AI-generated project support remains advisory and should be reviewed by accountable users before approvals, submissions, or downstream actions.',
    source: 'documentation',
    tags: ['human review', 'AI governance', 'auditability'],
  },
];

type DashboardPage = {
  id: string;
  label: string;
  roles: UserRole[];
  group: 'Core workflow' | 'Client tools' | 'BEP tools' | 'Construction tools' | 'Freelancer tools' | 'Governance';
  icon: React.ReactNode;
  summary: string;
  backedBy: string[];
};

type DashboardResourceLink = {
  title: string;
  description: string;
  href: string;
  roles?: UserRole[];
};

const DESIGN_TEAM_ROLES: UserRole[] = ['bep', 'architect'];

const CANONICAL_DASHBOARD_PAGES: DashboardPage[] = [
  { id: 'command', label: 'Command Centre', roles: ['client', 'bep', 'architect', 'contractor', 'subcontractor', 'supplier', 'freelancer', 'admin'], group: 'Core workflow', icon: <LayoutDashboard size={18} />, summary: 'Role-aware dashboard landing page for priorities, project state, and next decisions.', backedBy: ['role dashboards', 'active project data'] },
  { id: 'profile', label: 'Profile Editor', roles: ['client', 'bep', 'architect', 'contractor', 'subcontractor', 'supplier', 'freelancer', 'admin'], group: 'Core workflow', icon: <UserCircle size={18} />, summary: 'Canonical profile surface reused for verification, contracts, invoices, procurement, matching, and governance.', backedBy: ['UserSettings', 'ProfileEditor'] },
  { id: 'toolbox', label: 'Project Toolbox', roles: ['client', 'bep', 'architect', 'contractor', 'subcontractor', 'supplier', 'freelancer', 'admin'], group: 'Core workflow', icon: <Files size={18} />, summary: 'Guided, role-aware project tools and checklists from the backend.html reference.', backedBy: ['FileManager', 'current project metadata'] },
  { id: 'journey', label: 'Project Journey', roles: ['client', 'bep', 'architect', 'contractor', 'subcontractor', 'supplier', 'freelancer', 'admin'], group: 'Core workflow', icon: <Workflow size={18} />, summary: 'Lifecycle navigation shell for stage progress, decisions, and next actions.', backedBy: ['StageProgressTracker', 'AdvanceStageButton'] },
  { id: 'tasks', label: 'Tasks & Approvals', roles: ['client', 'bep', 'architect', 'contractor', 'subcontractor', 'supplier', 'freelancer', 'admin'], group: 'Core workflow', icon: <ClipboardCheck size={18} />, summary: 'Role-filtered task and approval command surface.', backedBy: ['delegatedTasks', 'job status workflows'] },
  { id: 'messages', label: 'Project Messenger', roles: ['client', 'bep', 'architect', 'contractor', 'subcontractor', 'supplier', 'freelancer', 'admin'], group: 'Core workflow', icon: <Mail size={18} />, summary: 'Job-linked communication shell using existing chat capabilities.', backedBy: ['Chat'] },
  { id: 'programme', label: 'Programme / Gantt', roles: ['client', 'bep', 'architect', 'contractor', 'subcontractor', 'supplier', 'freelancer', 'admin'], group: 'Core workflow', icon: <Workflow size={18} />, summary: 'Shared programme/Gantt surface with role-specific views.', backedBy: ['GanttChart'] },
  { id: 'disputes', label: 'Dispute Resolution', roles: ['client', 'bep', 'architect', 'contractor', 'subcontractor', 'supplier', 'freelancer', 'admin'], group: 'Core workflow', icon: <ShieldCheck size={18} />, summary: 'Dispute centre shell linked to project/job dispute records.', backedBy: ['jobDisputes', 'AdminDashboard disputes'] },
  { id: 'payments', label: 'Payments & Governance', roles: ['client', 'bep', 'architect', 'contractor', 'subcontractor', 'supplier', 'freelancer', 'admin'], group: 'Core workflow', icon: <CreditCard size={18} />, summary: 'Payment governance shell. Invoice handling is available separately while escrow/payment APIs mature.', backedBy: ['InvoiceManagement'] },
  { id: 'contracts', label: 'Contracts & Signing', roles: ['client', 'bep', 'architect', 'contractor', 'subcontractor', 'supplier', 'freelancer', 'admin'], group: 'Core workflow', icon: <FileText size={18} />, summary: 'Contract/signing shell for scopes, proposals, packages, and work orders.', backedBy: ['project/job records'] },
  { id: 'escrow', label: 'Escrow Service', roles: ['client', 'bep', 'architect', 'contractor', 'subcontractor', 'supplier', 'freelancer', 'admin'], group: 'Core workflow', icon: <Landmark size={18} />, summary: 'Escrow allocation shell for milestone and package payments.', backedBy: ['FinancialDashboard'] },
  { id: 'ai', label: 'AI Co-Pilot', roles: ['client', 'bep', 'architect', 'contractor', 'subcontractor', 'supplier', 'freelancer', 'admin'], group: 'Core workflow', icon: <Bot size={18} />, summary: 'Contextual AI workflow shell connected to existing governance/audit concepts.', backedBy: ['AgentKnowledgeManager', 'AdminDashboard agents'] },
  { id: 'client-intake', label: 'Guided Brief Wizard', roles: ['client'], group: 'Client tools', icon: <ClipboardCheck size={18} />, summary: 'Client-friendly intake shell aligned with backend.html guided brief requirements.', backedBy: ['ClientDashboard post job flow'] },
  { id: 'client-proposals', label: 'BEP Proposals', roles: ['client'], group: 'Client tools', icon: <Users size={18} />, summary: 'Proposal comparison shell for fit, fee, timeline, risk notes, and appointment decisions.', backedBy: ['job applications'] },
  { id: 'directory-search', label: 'Directory Search', roles: ['client', 'bep', 'architect', 'contractor'], group: 'Client tools', icon: <Search size={18} />, summary: 'Manual verified directory search/invite shell.', backedBy: ['marketplace user profiles'] },
  { id: 'municipal-tracker', label: 'Municipal Status', roles: ['client', 'bep', 'architect', 'contractor'], group: 'Client tools', icon: <MapPin size={18} />, summary: 'Municipal status shell backed by the existing tracker component/domain.', backedBy: ['MunicipalTracker'] },
  { id: 'client-progress', label: 'Progress Reports', roles: ['client'], group: 'Client tools', icon: <Clock size={18} />, summary: 'Plain-language progress report shell for client decisions and risks.', backedBy: ['StageProgressTracker', 'GanttChart'] },
  { id: 'design', label: 'Design & Compliance', roles: [...DESIGN_TEAM_ROLES, 'freelancer', 'admin'], group: 'BEP tools', icon: <Network size={18} />, summary: 'Design-team deliverables, registers, responsibility matrix, and compliance shell.', backedBy: ['ResponsibilityMatrix', 'TeamBuilder'] },
  { id: 'drawing-checker', label: 'AI Drawing Checker', roles: [...DESIGN_TEAM_ROLES, 'freelancer'], group: 'BEP tools', icon: <CheckCircle2 size={18} />, summary: 'Drawing quality/compliance checker placeholder pending upload/review API wiring.', backedBy: ['FileManager'] },
  { id: 'sans-forms', label: 'SANS / Compliance Forms', roles: [...DESIGN_TEAM_ROLES, 'admin'], group: 'BEP tools', icon: <FileText size={18} />, summary: 'Compliance form autofill shell using project/profile/team data.', backedBy: ['ComplianceReport'] },
  { id: 'technical-brief', label: 'Technical Brief Editor', roles: [...DESIGN_TEAM_ROLES, 'admin'], group: 'BEP tools', icon: <Briefcase size={18} />, summary: 'BEP technical brief refinement shell after client intake.', backedBy: ['job brief data'] },
  { id: 'bep-freelancers', label: 'Freelancer Jobs', roles: DESIGN_TEAM_ROLES, group: 'BEP tools', icon: <Plus size={18} />, summary: 'Controlled BEP-to-freelancer work package shell.', backedBy: ['delegatedTasks'] },
  { id: 'snagging', label: 'Snagging / Close-Out', roles: [...DESIGN_TEAM_ROLES, 'contractor', 'admin'], group: 'Construction tools', icon: <CheckCircle2 size={18} />, summary: 'Snagging and close-out shell backed by existing closeout workflows.', backedBy: ['CloseoutWizard'] },
  { id: 'construction', label: 'Construction OS', roles: ['contractor', 'admin'], group: 'Construction tools', icon: <Construction size={18} />, summary: 'Construction operations shell for site logs, RFIs, programme, and delivery controls.', backedBy: ['SiteLogManager', 'RFIManager'] },
  { id: 'contractor-staff', label: 'Staff, Wages & Plant', roles: ['contractor'], group: 'Construction tools', icon: <Hammer size={18} />, summary: 'Contractor resource-management shell pending staff/wage/plant APIs.', backedBy: ['contractor profile/compliance records'] },
  { id: 'procurement', label: 'BoQ / BoM Procurement', roles: ['contractor', 'subcontractor', 'supplier', ...DESIGN_TEAM_ROLES, 'admin'], group: 'Construction tools', icon: <Factory size={18} />, summary: 'BoQ/BoM procurement shell for contractor, package, and supplier workflows.', backedBy: ['package readiness services'] },
  { id: 'packages', label: 'Subcontractor Packages', roles: ['contractor', 'subcontractor', 'supplier', 'admin'], group: 'Construction tools', icon: <Building2 size={18} />, summary: 'Package-layer shell for subcontractor/supplier scopes and progress.', backedBy: ['package readiness services'] },
  { id: 'freelancer-work', label: 'Assigned Work', roles: ['freelancer'], group: 'Freelancer tools', icon: <Briefcase size={18} />, summary: 'Assigned freelancer work surface backed by current freelancer task cards.', backedBy: ['FreelancerDashboard'] },
  { id: 'freelancer-submissions', label: 'Submissions & Feedback', roles: ['freelancer'], group: 'Freelancer tools', icon: <Send size={18} />, summary: 'Submission/revision/feedback shell for freelancer deliverables.', backedBy: ['delegatedTasks', 'FileManager'] },
  { id: 'knowledge', label: 'Knowledge / CPD', roles: ['bep', 'architect', 'contractor', 'subcontractor', 'supplier', 'freelancer', 'admin'], group: 'Governance', icon: <BookOpen size={18} />, summary: 'Knowledge and CPD shell backed by knowledge-source tooling.', backedBy: ['KnowledgeSources', 'AdminKnowledgeUploader'] },
  { id: 'resource-sharing', label: 'Remote Desktop / Resources', roles: [...DESIGN_TEAM_ROLES, 'freelancer'], group: 'Governance', icon: <HardDrive size={18} />, summary: 'Remote workstation/resource sharing shell pending booking/resource APIs.', backedBy: ['Resource library workflow'] },
  { id: 'resource-centre', label: 'Resource Centre / Checklists', roles: [...DESIGN_TEAM_ROLES, 'freelancer'], group: 'Governance', icon: <Database size={18} />, summary: 'Role-based resource centre and checklist shell.', backedBy: ['KnowledgeSources'] },
  { id: 'cpd-assessment', label: 'CPD Assessment', roles: DESIGN_TEAM_ROLES, group: 'Governance', icon: <BookOpen size={18} />, summary: 'CPD assessment shell pending assessment workflow APIs.', backedBy: ['cpdService'] },
  { id: 'admin-console', label: 'Admin Console', roles: ['admin'], group: 'Governance', icon: <Settings2 size={18} />, summary: 'Whole-system governance console backed by current admin dashboard tabs.', backedBy: ['AdminDashboard'] },
];

const SHELL_PAGE_IDS = new Set(CANONICAL_DASHBOARD_PAGES.map((page) => page.id));
const REAL_WORKFLOW_PAGE_IDS = new Set(['journey', 'messages', 'programme', 'disputes', 'payments', 'contracts', 'escrow', 'municipal-tracker', 'construction', 'snagging', 'procurement', 'packages', 'client-progress', 'drawing-checker', 'tasks', 'resource-centre', 'admin-console', 'design', 'knowledge', 'toolbox', 'freelancer-submissions', 'resource-sharing', 'freelancer-work', 'ai', 'contractor-staff', 'bep-freelancers']);

const DASHBOARD_RESOURCE_LINKS: Record<string, DashboardResourceLink[]> = {
  toolbox: [
    { title: 'Guided brief to appointment', description: 'Workflow map for turning intake data into appointment-ready project records.', href: '/docs/workflows/guided-brief-to-appointment.md' },
    { title: 'Project command centre workflow', description: 'Canonical project coordination flow for files, decisions, and status updates.', href: '/docs/workflows/project-command-centre.md' },
  ],
  journey: [
    { title: 'Project command centre workflow', description: 'Stage-by-stage reference for lifecycle navigation and next actions.', href: '/docs/workflows/project-command-centre.md' },
    { title: 'Phase 3 workflow APIs', description: 'Implementation report for project workflow write APIs and stage operations.', href: '/docs/phase-reports/phase-3-project-workflow-write-apis.md' },
  ],
  tasks: [
    { title: 'Command centre projection', description: 'Explains how role-filtered project activity is projected into dashboards.', href: '/docs/phase-reports/phase-3-command-centre-projection.md' },
    { title: 'Audit log taxonomy', description: 'Governance reference for review, approval, and handoff audit trails.', href: '/docs/backend/audit-log-taxonomy.md' },
  ],
  'directory-search': [
    { title: 'Directory and invitations', description: 'Real implementation notes for verified directory search and invitation flows.', href: '/docs/phase-reports/phase-3-directory-and-invitations.md' },
    { title: 'Role profile projection', description: 'How role-specific profile fields support matching and directory views.', href: '/docs/phase-reports/phase-4-role-profile-projection.md' },
  ],
  ai: [
    { title: 'AI governance and human sign-off', description: 'Required review model for AI-assisted project support.', href: '/docs/backend/ai-governance-human-signoff.md' },
    { title: 'Guided technical briefs', description: 'Phase report for AI-assisted brief drafting and review surfaces.', href: '/docs/phase-reports/phase-5-guided-technical-briefs.md' },
  ],
  knowledge: [
    { title: 'CPD service slice', description: 'Backend service notes for CPD and knowledge workflows.', href: '/docs/phase-reports/phase-7-cpd-service-slice.md' },
    { title: 'Service domain models', description: 'Domain reference for knowledge, CPD, and project service boundaries.', href: '/docs/backend/service-domain-models.md' },
  ],
  'resource-centre': [
    { title: 'Resource booking service slice', description: 'Current service notes for resource-centre and booking workflows.', href: '/docs/phase-reports/phase-7-resource-booking-service-slice.md' },
    { title: 'Dashboard alignment report', description: 'Reference for linking dashboard shells to real documentation and components.', href: '/docs/phase-reports/backend-html-dashboard-alignment.md' },
  ],
  procurement: [
    { title: 'Package readiness service', description: 'Implementation notes for package readiness, procurement, and supplier handoffs.', href: '/docs/phase-reports/phase-6-package-readiness-service.md' },
  ],
  packages: [
    { title: 'Package readiness service', description: 'Implementation notes for subcontractor package readiness and supplier scope.', href: '/docs/phase-reports/phase-6-package-readiness-service.md' },
  ],
};

function pagesForRole(role: UserRole) {
  return CANONICAL_DASHBOARD_PAGES.filter((page) => page.roles.includes(role));
}

function pageById(pageId: string) {
  return CANONICAL_DASHBOARD_PAGES.find((page) => page.id === pageId);
}

function resourcesForShell(pageId: string, role: UserRole) {
  return (DASHBOARD_RESOURCE_LINKS[pageId] ?? []).filter((resource) => !resource.roles || resource.roles.includes(role));
}

function dashboardSectionLabel(group: DashboardPage['group']) {
  switch (group) {
    case 'Core workflow': return 'Project';
    case 'Client tools': return 'Client Tools';
    case 'BEP tools': return 'BEP Tools';
    case 'Construction tools': return 'Contractor Tools';
    case 'Freelancer tools': return 'Freelancer Tools';
    case 'Governance': return 'System';
    default: return group;
  }
}

export default function App() {
  const prefersReducedMotion = useReducedMotion();
  const isAdminRoute = window.location.pathname === '/admin';
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [roleSelection, setRoleSelection] = useState<UserRole | null>(isAdminRoute ? 'admin' : null);
  const [showLogin, setShowLogin] = useState(isAdminRoute);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [formData, setFormData] = useState<any>({});
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('command');

  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authMode, setAuthMode] = useState<'selection' | 'email-login' | 'email-signup'>('selection');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [professionalLabel, setProfessionalLabel] = useState('');

  useEffect(() => {
    setPersistence(auth, browserLocalPersistence).catch((error) => {
      console.warn('Unable to enable persistent Firebase auth session:', error);
    });
  }, []);

  useEffect(() => {
    if (isAdminRoute) {
      setRoleSelection('admin');
      setShowLogin(true);
      setShowOnboarding(false);
    }
  }, [isAdminRoute]);

  const getAuthErrorMessage = (error: unknown) => {
    const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code) : '';

    switch (code) {
      case 'auth/email-already-in-use':
        return 'An account with this email already exists. Please log in instead.';
      case 'auth/invalid-credential':
      case 'auth/user-not-found':
      case 'auth/wrong-password':
        return 'Invalid email or password. Please check your details and try again.';
      case 'auth/weak-password':
        return 'Please choose a stronger password with at least 6 characters.';
      case 'auth/popup-closed-by-user':
        return 'Google sign-in was cancelled before it completed.';
      case 'auth/popup-blocked':
        return 'Your browser blocked the Google sign-in popup. Please allow popups and try again.';
      case 'auth/unauthorized-domain':
        return 'Google sign-in is not enabled for this domain. Add localhost and your production domain in Firebase Console → Authentication → Settings → Authorized domains.';
      default:
        return 'Authentication failed. Please try again.';
    }
  };

  useEffect(() => {
    if (!user) return;
    void trackEvent('dashboard_tab_view', {
      tab: activeTab,
      role: user.role,
    });
  }, [activeTab, user]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setProfileLoading(true);
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            const profile = userDoc.data() as UserProfile;
            if (isAdminRoute && profile.role !== 'admin') {
              await signOut(auth);
              setUser(null);
              toast.error('Admin access only. Please use an authorized admin account.');
            } else {
              setUser(profile);
            }
          }
        } catch (error) {
          console.error("Error fetching user profile:", error);
        } finally {
          setProfileLoading(false);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [isAdminRoute]);

  const syncServerProfile = async (selectedRole: UserRole | null, firebaseUser: FirebaseUser = auth.currentUser!) => {
    const token = await firebaseUser?.getIdToken();
    if (!token) return null;

    const res = await fetch('/api/auth/check-admin', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: selectedRole || 'client', displayName, profileData: formData }),
    });

    if (!res.ok) {
      const details = await res.json().catch(() => null);
      throw new Error(details?.details || details?.error || 'Failed to sync Firebase profile');
    }

    return res.json();
  };

  const ensureAdminAccess = async (firebaseUser: any) => {
    const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
    const profile = userDoc.exists() ? userDoc.data() as UserProfile : null;

    if (isAdminRoute && profile?.role !== 'admin') {
      await signOut(auth);
      setUser(null);
      toast.error('Admin access only. Please use an authorized admin account.');
      return null;
    }

    return profile;
  };

  const refetchServerProfile = async (firebaseUser: FirebaseUser) => {
    const refreshedDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
    if (!refreshedDoc.exists()) {
      throw new Error('Server profile was not available after sync. Please try signing in again.');
    }
    return refreshedDoc.data() as UserProfile;
  };

  const handleGoogleLogin = async () => {
    if (!roleSelection) {
      toast.error("Please select a role first");
      return;
    }

    setIsLoggingIn(true);
    setProfileLoading(true);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      const result = await signInWithPopup(auth, provider);
      const firebaseUser = result.user;
      await syncServerProfile(roleSelection || 'client', firebaseUser);
      const profile = await ensureAdminAccess(firebaseUser) || await refetchServerProfile(firebaseUser);
      if (isAdminRoute && !profile) return;
      setUser(profile);
    } catch (error: any) {
      console.error("Login error:", error);
      toast.error(getAuthErrorMessage(error));
    } finally {
      setIsLoggingIn(false);
      setProfileLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoggingIn || profileLoading) return;
    setIsLoggingIn(true);
    setProfileLoading(true);

    try {
      let firebaseUser;
      if (authMode === 'email-signup') {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        firebaseUser = result.user;
        if (displayName) await updateProfile(firebaseUser, { displayName });
        await sendEmailVerification(firebaseUser);
      } else {
        const result = await signInWithEmailAndPassword(auth, email, password);
        firebaseUser = result.user;
      }

      await syncServerProfile(roleSelection, firebaseUser);
      const profile = await ensureAdminAccess(firebaseUser) || await refetchServerProfile(firebaseUser);
      if (isAdminRoute && !profile) return;
      setUser(profile);
      toast.success(authMode === 'email-signup' ? "Account created. Verification email sent." : "Welcome back!");
    } catch (error: any) {
      console.error("Auth error:", error);
      toast.error(getAuthErrorMessage(error));
    } finally {
      setIsLoggingIn(false);
      setProfileLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setShowLogin(isAdminRoute);
      setAuthMode('selection');
      setRoleSelection(isAdminRoute ? 'admin' : null);
      setActiveTab('command');
      toast.success("Logged out successfully");
    } catch (error) {
      toast.error("Failed to logout");
    }
  };

  if (loading || profileLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="rounded-full h-12 w-12 border-b-2 border-primary animate-spin"></div>
          <p className="text-sm text-muted-foreground animate-pulse font-medium">Securing session...</p>
        </div>
      </div>
    );
  }

  if (!user && showOnboarding) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <OnboardingFlow
          onComplete={(data) => {
            setRoleSelection(data.role);
            setFormData(data);
            setShowOnboarding(false);
            setShowLogin(true);
            setAuthMode("email-signup");
          }}
          onCancel={() => setShowOnboarding(false)}
        />
      </Suspense>
    );
  }

  if (!user && isAdminRoute) {
    return (
      <AdminLoginPage
        authMode={authMode}
        email={email}
        password={password}
        isLoggingIn={isLoggingIn}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onEmailSubmit={handleEmailAuth}
        onGoogleLogin={handleGoogleLogin}
        onAuthModeChange={setAuthMode}
      />
    );
  }

  if (!user && !showLogin) {
    return <LandingPage onGetStarted={() => setShowOnboarding(true)} onLogin={() => setShowLogin(true)} />;
  }

  if (!user && showLogin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-secondary/30 backdrop-blur-sm fixed inset-0 z-50 overflow-y-auto">
        <AnimatedFloorPlan />
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-2xl w-full my-8 relative z-10"
        >
          <Card className="border-border shadow-2xl bg-white/95 backdrop-blur-md rounded-[2.5rem] overflow-hidden">
            <CardHeader className="text-center bg-primary/5 pb-10 pt-12 relative">
              <div className="flex justify-between items-center mb-6 absolute top-6 left-6 right-6">
                {authMode !== 'selection' ? (
                  <Button variant="ghost" size="sm" onClick={() => setAuthMode('selection')} className="rounded-full hover:bg-white">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back
                  </Button>
                ) : (
                  <div />
                )}
                <Button variant="ghost" size="sm" onClick={() => { setShowLogin(false); setAuthMode('selection'); }} className="rounded-full hover:bg-white">
                  Cancel
                </Button>
              </div>
              <div className="flex justify-center mb-5">
                <Logo iconClassName="w-16 h-16 text-primary" />
              </div>
              <CardTitle className="text-4xl font-heading font-bold tracking-tight">
                {authMode === 'selection' ? 'Join Architex' : authMode === 'email-login' ? 'Welcome Back' : 'Create your account'}
              </CardTitle>
              <CardDescription className="text-base mt-2">
                {authMode === 'selection' ? 'Select your role to access the marketplace' : 'Enter your details to continue'}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 sm:p-10">
              <AnimatePresence mode="wait">
                {authMode === 'selection' ? (
                  <motion.div
                    key="auth-selection"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-6"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <AuthRoleCard data-testid="role-select-client" icon={<Users className="w-8 h-8" />} title="Client" description="I want to hire professionals for my building project" active={roleSelection === 'client'} onClick={() => setRoleSelection('client')} />
                      <AuthRoleCard data-testid="role-select-architect" icon={<Briefcase className="w-8 h-8" />} title="Architect" description="I am a SACAP registered architect looking for work" active={roleSelection === 'architect'} onClick={() => setRoleSelection('architect')} />
                      <AuthRoleCard data-testid="role-select-freelancer" icon={<Sparkles className="w-8 h-8" />} title="Freelancer" description="I am a specialist or consultant (Engineer, etc.)" active={roleSelection === 'freelancer'} onClick={() => setRoleSelection('freelancer')} />
                      <AuthRoleCard data-testid="role-select-bep" icon={<Construction className="w-8 h-8" />} title="BEP / Design Team" description="I am a built-environment professional or design-team lead" active={roleSelection === 'bep'} onClick={() => setRoleSelection('bep')} />
                      <AuthRoleCard data-testid="role-select-contractor" icon={<Factory className="w-8 h-8" />} title="Contractor" description="I manage construction delivery, tendering, and site work" active={roleSelection === 'contractor'} onClick={() => setRoleSelection('contractor')} />
                      <AuthRoleCard data-testid="role-select-subcontractor" icon={<Hammer className="w-8 h-8" />} title="Subcontractor" description="I deliver a trade package, evidence, and close-out items" active={roleSelection === 'subcontractor'} onClick={() => setRoleSelection('subcontractor')} />
                      <AuthRoleCard data-testid="role-select-supplier" icon={<Factory className="w-8 h-8" />} title="Supplier" description="I supply materials, products, deliveries, or warranties" active={roleSelection === 'supplier'} onClick={() => setRoleSelection('supplier')} />
                    </div>
                    <div className="space-y-3">
                      <Button onClick={handleGoogleLogin} className="w-full h-14 rounded-2xl text-lg font-bold shadow-lg" disabled={!roleSelection || isLoggingIn}>
                        {isLoggingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sign in with Google'}
                      </Button>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Button variant="outline" className="h-12 rounded-2xl font-bold" onClick={() => setAuthMode('email-login')} disabled={!roleSelection}>Login with Email</Button>
                        <Button variant="outline" className="h-12 rounded-2xl font-bold" onClick={() => setAuthMode('email-signup')} disabled={!roleSelection}>Sign Up with Email</Button>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.form
                    key={authMode}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                    onSubmit={handleEmailAuth}
                    className="space-y-4"
                  >
                    {authMode === 'email-signup' && (
                      <div className="space-y-2">
                        <label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Full Name</label>
                        <Input placeholder="John Doe" value={displayName} onChange={e => setDisplayName(e.target.value)} required className="h-12 rounded-xl" />
                      </div>
                    )}
                    <div className="space-y-2">
                      <label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Email Address</label>
                      <Input type="email" placeholder="name@example.com" value={email} onChange={e => setEmail(e.target.value)} required className="h-12 rounded-xl" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Password</label>
                      <Input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required className="h-12 rounded-xl" />
                    </div>
                    <Button type="submit" className="w-full h-14 rounded-2xl text-lg font-bold shadow-lg mt-6" disabled={isLoggingIn}>
                      {isLoggingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : (authMode === 'email-login' ? 'Login' : 'Create Account')}
                    </Button>
                    <Button type="button" variant="outline" className="w-full h-12 rounded-2xl font-bold" onClick={handleGoogleLogin} disabled={!roleSelection || isLoggingIn}>
                      {isLoggingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sign in with Google'}
                    </Button>
                    <Button type="button" variant="ghost" className="w-full text-muted-foreground rounded-full" onClick={() => setAuthMode('selection')}>Back to Options</Button>
                  </motion.form>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>
        </motion.div>
        <Toaster />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row relative overflow-hidden">
      <AnimatedFloorPlan />
      <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-white/90 backdrop-blur-md border-r border-border transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 flex flex-col ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-full flex flex-col p-6 overflow-y-auto">
          <div className="flex items-center justify-between mb-10 shrink-0">
            <Logo showText iconClassName="w-10 h-10 text-primary" textClassName="font-heading font-bold text-2xl tracking-tighter" />
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setIsSidebarOpen(false)} aria-label="Close navigation menu" aria-expanded={isSidebarOpen}><X size={20} /></Button>
          </div>

          <nav className="flex-1 space-y-2" aria-label="Role workspace navigation">
            <NavSectionLabel>Project</NavSectionLabel>
            <NavItem
              icon={<LayoutDashboard size={18} />}
              label="Command Centre"
              active={activeTab === 'command'}
              onClick={() => { setActiveTab('command'); setIsSidebarOpen(false); }}
              data-testid="nav-page-command"
            />
            {Object.entries(
              pagesForRole(user!.role)
                .filter((page) => page.id !== 'command')
                .reduce<Record<string, DashboardPage[]>>((sections, page) => {
                  const section = page.id === 'profile' ? 'Account' : dashboardSectionLabel(page.group);
                  sections[section] = [...(sections[section] ?? []), page];
                  return sections;
                }, {})
            ).map(([section, pages]) => (
              <React.Fragment key={section}>
                {section !== 'Project' && <NavSectionLabel>{section}</NavSectionLabel>}
                {pages.map((page) => (
                  <NavItem
                    key={page.id}
                    icon={page.icon}
                    label={page.label}
                    active={activeTab === page.id}
                    onClick={() => { setActiveTab(page.id); setIsSidebarOpen(false); }}
                    data-testid={`nav-page-${page.id}`}
                  />
                ))}
              </React.Fragment>
            ))}
            {user!.role === 'client' && (
              <NavItem
                icon={<Plus size={18} />}
                label="Post a Job (legacy)"
                active={activeTab === 'post-job'}
                onClick={() => { setActiveTab('post-job'); setIsSidebarOpen(false); }}
              />
            )}
            {(user!.role === 'architect' || user!.primaryFirmId) && (
              <NavItem
                icon={<Building2 size={18} />}
                label="Firm Workspace"
                active={activeTab === 'firm'}
                onClick={() => { setActiveTab('firm'); setIsSidebarOpen(false); }}
              />
            )}
            {user!.role === 'contractor' && (
              <NavItem
                icon={<Search size={18} />}
                label="Tender Marketplace"
                active={activeTab === 'marketplace'}
                onClick={() => { setActiveTab('marketplace'); setIsSidebarOpen(false); }}
              />
            )}
            {user!.role === 'architect' && (
              <NavItem
                icon={<Search size={18} />}
                label="Marketplace"
                active={activeTab === 'marketplace'}
                onClick={() => { setActiveTab('marketplace'); setIsSidebarOpen(false); }}
              />
            )}
            {user!.role === 'architect' && (
              <NavItem
                icon={<Send size={18} />}
                label="My Applications"
                active={activeTab === 'applications'}
                onClick={() => { setActiveTab('applications'); setIsSidebarOpen(false); }}
              />
            )}
            {user!.role === 'architect' && (
              <NavItem
                icon={<Users size={18} />}
                label="Team & Freelancers"
                active={activeTab === 'team'}
                onClick={() => { setActiveTab('team'); setIsSidebarOpen(false); }}
              />
            )}
            {user!.role === 'architect' && (
              <NavItem
                icon={<Users size={18} />}
                label="Coordination"
                active={activeTab === 'coordination'}
                onClick={() => { setActiveTab('coordination'); setIsSidebarOpen(false); }}
              />
            )}
            {(user!.role === 'client' || user!.role === 'architect') && (
              <NavItem
                icon={<Calculator size={18} />}
                label="Fee Estimator"
                active={activeTab === 'fees'}
                onClick={() => { setActiveTab('fees'); setIsSidebarOpen(false); }}
              />
            )}
            <NavItem
              icon={<FileText size={18} />}
              label="Active Projects"
              active={activeTab === 'projects'}
              onClick={() => { setActiveTab('projects'); setIsSidebarOpen(false); }}
            />
            {user!.role === 'admin' && (
              <>
                <NavItem
                  icon={<ShieldCheck size={18} />}
                  label="Compliance Hub"
                  active={activeTab === 'compliance'}
                  onClick={() => { setActiveTab('compliance'); setIsSidebarOpen(false); }}
                />
                <NavItem
                  icon={<Users size={18} />}
                  label="User Management"
                  active={activeTab === 'users'}
                  onClick={() => { setActiveTab('users'); setIsSidebarOpen(false); }}
                />
                <NavItem
                  icon={<Settings2 size={18} />}
                  label="LLM Settings"
                  active={activeTab === 'settings'}
                  onClick={() => { setActiveTab('settings'); setIsSidebarOpen(false); }}
                />
                <NavItem
                  icon={<Sparkles size={18} />}
                  label="Knowledge Base"
                  active={activeTab === 'knowledge'}
                  onClick={() => { setActiveTab('knowledge'); setIsSidebarOpen(false); }}
                />
                <NavItem
                  icon={<Calculator size={18} />}
                  label="Fees"
                  active={activeTab === 'fees'}
                  onClick={() => { setActiveTab('fees'); setIsSidebarOpen(false); }}
                />
                <NavItem
                  icon={<Landmark size={18} />}
                  label="Financial"
                  active={activeTab === 'financial'}
                  onClick={() => { setActiveTab('financial'); setIsSidebarOpen(false); }}
                />
                <NavItem
                  icon={<Building2 size={18} />}
                  label="Firms"
                  active={activeTab === 'firms'}
                  onClick={() => { setActiveTab('firms'); setIsSidebarOpen(false); }}
                />
              </>
            )}
            <NavItem
              icon={<History size={18} />}
              label="Audit Logs"
              active={activeTab === 'audit'}
              onClick={() => { setActiveTab('audit'); setIsSidebarOpen(false); }}
            />
            <div className="pt-4 mt-4 border-t border-border">
              <NavItem
                icon={<CreditCard size={18} />}
                label="Invoices"
                active={activeTab === 'invoices'}
                onClick={() => { setActiveTab('invoices'); setIsSidebarOpen(false); }}
              />
              <NavItem
                icon={<HardDrive size={18} />}
                label="Files"
                active={activeTab === 'files'}
                onClick={() => { setActiveTab('files'); setIsSidebarOpen(false); }}
              />
              <NavItem
                icon={<UserCircle size={18} />}
                label="My Settings"
                active={activeTab === 'profile-settings'}
                onClick={() => { setActiveTab('profile-settings'); setIsSidebarOpen(false); }}
              />
            </div>
          </nav>

          <div className="pt-6 mt-auto border-t border-border shrink-0">
            <Button variant="ghost" className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-xl h-12" onClick={handleLogout}>
              <LogOut size={20} /> <span className="font-bold">Logout</span>
            </Button>
          </div>
        </div>
      </aside>
      <main className="flex-1 flex flex-col min-w-0 relative z-10">
        <header className="h-20 bg-card/80 backdrop-blur-md border-b border-border px-4 sm:px-8 flex items-center justify-between sticky top-0 z-40">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setIsSidebarOpen(true)} aria-label="Open navigation menu" aria-expanded={isSidebarOpen}><Menu size={24} /></Button>
          <div className="flex-1" />
          <div className="flex items-center gap-4">
            <NotificationBell userId={user.uid} />
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shadow-sm">
              <UserIcon size={20} />
            </div>
          </div>
        </header>
        <ScrollArea className="flex-1">
          <motion.div
            key={`${user.role}-${activeTab}`}
            initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="p-6 md:p-8 max-w-7xl mx-auto w-full"
          >
            <Suspense fallback={<DashboardFallback />}>
              {activeTab === 'invoices' && <InvoiceManagement user={user} />}
              {activeTab === 'files' && <FileManager user={user} />}
              {(activeTab === 'profile-settings' || activeTab === 'profile') && <UserSettings user={user} />}
              {activeTab === 'firm' && <FirmDashboard user={user} />}
              {activeTab === 'command' && <ProjectCommandCentre user={user} onNavigate={setActiveTab} />}
              {activeTab === 'client-intake' && <GuidedBriefWizard user={user} />}
              {activeTab === 'client-proposals' && <ClientProposalComparison user={user} />}
              {activeTab === 'technical-brief' && <TechnicalBriefEditor user={user} />}
              {activeTab === 'directory-search' && <DirectorySearch user={user} />}
              {(activeTab === 'packages' || activeTab === 'procurement') && <PackageProcurementWorkspace user={user} mode={activeTab as 'packages' | 'procurement'} />}
              {activeTab === 'client-progress' && <ClientProgressReports user={user} />}
              {activeTab === 'drawing-checker' && <AIDrawingChecker user={user} />}
              {activeTab === 'tasks' && <TasksApprovalsPage user={user} />}
              {activeTab === 'resource-centre' && <ResourceCentre user={user} />}
              {activeTab === 'knowledge' && <ResourceCentre user={user} />}
              {activeTab === 'admin-console' && <AdminDashboard user={user} activeTab="overview" onTabChange={setActiveTab} />}
              {activeTab === 'design' && <DesignCompliancePage user={user} />}
              {activeTab === 'toolbox' && <ProjectToolboxPage user={user} />}
              {activeTab === 'freelancer-work' && <FreelancerDashboard user={user} />}
              {activeTab === 'freelancer-submissions' && <FreelancerSubmissionsPage user={user} />}
              {activeTab === 'resource-sharing' && <ResourceSharingPage user={user} />}
              {activeTab === 'ai' && <AICoPilotPage user={user} onNavigate={setActiveTab} />}
              {activeTab === 'contractor-staff' && <ContractorStaffPlantPage user={user} />}
              {activeTab === 'bep-freelancers' && <BEPFreelancerJobsPage user={user} />}
              {REAL_WORKFLOW_PAGE_IDS.has(activeTab) && activeTab !== 'packages' && activeTab !== 'procurement' && activeTab !== 'client-progress' && activeTab !== 'drawing-checker' && activeTab !== 'tasks' && activeTab !== 'resource-centre' && activeTab !== 'knowledge' && activeTab !== 'admin-console' && activeTab !== 'design' && activeTab !== 'toolbox' && activeTab !== 'freelancer-work' && activeTab !== 'freelancer-submissions' && activeTab !== 'resource-sharing' && activeTab !== 'ai' && activeTab !== 'contractor-staff' && activeTab !== 'bep-freelancers' && <ProjectWorkflowPage pageId={activeTab} user={user} />}
              {SHELL_PAGE_IDS.has(activeTab) && activeTab !== 'profile' && activeTab !== 'command' && activeTab !== 'client-intake' && activeTab !== 'client-proposals' && activeTab !== 'technical-brief' && activeTab !== 'directory-search' && !REAL_WORKFLOW_PAGE_IDS.has(activeTab) && <DashboardPageShell pageId={activeTab} user={user} />}
              {(activeTab !== 'command' && activeTab !== 'invoices' && activeTab !== 'files' && activeTab !== 'profile-settings' && activeTab !== 'profile' && activeTab !== 'firm' && !SHELL_PAGE_IDS.has(activeTab)) && (
                <>
                  {user.role === 'client' && <ClientDashboard user={user} activeTab={activeTab === 'command' ? 'overview' : activeTab} onTabChange={setActiveTab} />}
                  {user.role === 'architect' && <ArchitectDashboard user={user} activeTab={activeTab === 'command' ? 'overview' : activeTab} onTabChange={setActiveTab} />}
                  {user.role === 'admin' && <AdminDashboard user={user} activeTab={activeTab === 'command' ? 'overview' : activeTab} onTabChange={setActiveTab} />}
                  {user.role === 'freelancer' && <FreelancerDashboard user={user} />}
                  {user.role === 'bep' && <BEPDashboard user={user} />}
                  {user.role === 'contractor' && <ContractorDashboard user={user} />}
                </>
              )}
            </Suspense>
          </motion.div>
        </ScrollArea>
      </main>
      <Toaster />
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="rounded-full h-12 w-12 border-b-2 border-primary animate-spin" />
        <p className="text-sm text-muted-foreground animate-pulse font-medium">Loading workspace...</p>
      </div>
    </div>
  );
}

function DashboardFallback() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="h-40 rounded-[2.5rem] bg-secondary" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 h-96 rounded-[2rem] bg-secondary/70" />
        <div className="h-96 rounded-[2rem] bg-secondary/50" />
      </div>
    </div>
  );
}

function DashboardPageShell({ pageId, user }: { pageId: string; user: UserProfile }) {
  const page = pageById(pageId);

  if (!page || !page.roles.includes(user.role)) {
    return (
      <Card className="rounded-[2rem] border-border bg-card/90 shadow-sm">
        <CardHeader>
          <CardTitle className="font-heading text-2xl">Page unavailable</CardTitle>
          <CardDescription>This dashboard page is not enabled for your current role.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const roleLabel = user.role === 'bep' || user.role === 'architect' ? 'design team' : user.role;
  const shellFocus = getDashboardShellFocus(pageId, roleLabel);
  const resourceLinks = resourcesForShell(pageId, user.role);

  return (
    <div className="space-y-6">
      <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm overflow-hidden">
        <CardHeader className="bg-primary/5 border-b border-border">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-3">
              <Badge variant="secondary" className="w-fit uppercase tracking-widest">{page.group}</Badge>
              <div>
                <CardTitle className="font-heading text-3xl flex items-center gap-3">
                  <span className="rounded-2xl bg-primary/10 text-primary p-3">{page.icon}</span>
                  {page.label}
                </CardTitle>
                <CardDescription className="mt-3 max-w-3xl text-base leading-relaxed">{page.summary}</CardDescription>
              </div>
            </div>
            <Badge className="capitalize shrink-0">{roleLabel}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 rounded-2xl border border-border bg-background/70 p-5 space-y-3">
            <h3 className="font-heading text-xl font-bold">Role-aware workflow shell</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              This page is now surfaced from the backend.html role/page matrix while preserving existing APIs.
              It gives {roleLabel} users a first-class navigation target backed by existing services, documents, and role permissions while new write workflows are added incrementally.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Unsafe payment, escrow, signature, provider, and approval decisions remain routed through dedicated workflows with human confirmation before anything is submitted.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-background/70 p-5 space-y-3">
            <h3 className="font-heading text-lg font-bold">Backed by</h3>
            <div className="flex flex-wrap gap-2">
              {page.backedBy.map((item) => <Badge key={item} variant="outline">{item}</Badge>)}
            </div>
          </div>
          {resourceLinks.length > 0 && (
            <div className="lg:col-span-3 rounded-2xl border border-primary/20 bg-primary/5 p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-heading text-lg font-bold">Relevant implementation resources</h3>
                  <p className="text-sm text-muted-foreground">Links to existing project documentation behind this shell, opened without new backend APIs.</p>
                </div>
                <Badge variant="outline">real docs</Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {resourceLinks.map((resource) => (
                  <a
                    key={resource.href}
                    href={resource.href}
                    target="_blank"
                    rel="noreferrer"
                    className="group rounded-xl border border-border bg-background/80 p-4 transition-colors hover:border-primary/50 hover:bg-background"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-sm group-hover:text-primary">{resource.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{resource.description}</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0" />
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {shellFocus && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {shellFocus.map((item) => (
            <Card key={item.title} className="rounded-2xl border-border bg-card/90 shadow-sm">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <span className="rounded-xl bg-primary/10 text-primary p-2">{item.icon}</span>
                  <CardTitle className="font-heading text-lg">{item.title}</CardTitle>
                </div>
                <CardDescription className="leading-relaxed">{item.description}</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-wrap gap-2">
                  {item.badges.map((badge) => <Badge key={badge} variant="secondary">{badge}</Badge>)}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {(pageId === 'payments' || pageId === 'invoicing') && <InvoiceManagement user={user} />}
      {(pageId === 'toolbox' || pageId === 'drawing-checker' || pageId === 'freelancer-submissions') && <FileManager user={user} />}
      {pageId === 'municipal-tracker' && <MunicipalTracker user={user} />}
      {(pageId === 'ai' || pageId === 'resource-centre') && (
        <KnowledgeSources
          citations={DASHBOARD_ALIGNMENT_CITATIONS.filter((citation) => (
            pageId === 'ai'
              ? citation.tags.some((tag) => tag.includes('AI') || tag.includes('governance'))
              : citation.tags.some((tag) => tag.includes('Resource Centre') || tag.includes('checklists') || tag.includes('templates'))
          ))}
          className="rounded-2xl"
        />
      )}
    </div>
  );
}

function getDashboardShellFocus(pageId: string, roleLabel: string) {
  if (pageId === 'tasks') {
    return [
      {
        icon: <ClipboardCheck size={18} />,
        title: 'Role-filtered action queue',
        description: `Surfaces ${roleLabel} task ownership, review handoffs, and approval checkpoints without adding new backend dependencies.`,
        badges: ['delegated tasks', 'status workflows'],
      },
      {
        icon: <CheckCircle2 size={18} />,
        title: 'Approval decisions',
        description: 'Frames approve, request changes, and waiting-on-party states for the canonical backend.html Tasks & Approvals page.',
        badges: ['client sign-off', 'BEP review', 'contractor handoff'],
      },
      {
        icon: <History size={18} />,
        title: 'Audit-ready timeline',
        description: 'Keeps the shell aligned to existing audit logs and job history until richer approval APIs are available.',
        badges: ['audit logs', 'job history'],
      },
    ];
  }

  if (pageId === 'ai') {
    return [
      {
        icon: <Bot size={18} />,
        title: 'Governed assistant entry point',
        description: `Introduces a clear ${roleLabel} AI co-pilot surface for brief, compliance, procurement, and delivery support.`,
        badges: ['AI co-pilot', 'role context'],
      },
      {
        icon: <ShieldCheck size={18} />,
        title: 'Human sign-off required',
        description: 'Makes governance expectations visible: AI output is advisory, reviewed by accountable project users, and traceable.',
        badges: ['human review', 'governance'],
      },
      {
        icon: <BookOpen size={18} />,
        title: 'Knowledge-backed answers',
        description: 'Points users toward current knowledge and admin agent tooling while avoiding new API-router or rules changes.',
        badges: ['knowledge base', 'agent settings'],
      },
    ];
  }

  if (pageId === 'resource-centre') {
    return [
      {
        icon: <Database size={18} />,
        title: 'Checklist library shell',
        description: 'Groups reusable checklists, templates, and project resources under the canonical Resource Centre navigation item.',
        badges: ['checklists', 'templates'],
      },
      {
        icon: <BookOpen size={18} />,
        title: 'CPD and knowledge bridge',
        description: 'Connects design-team and freelancer users to knowledge-source workflows already present in the application.',
        badges: ['KnowledgeSources', 'CPD'],
      },
      {
        icon: <HardDrive size={18} />,
        title: 'Resource-ready navigation',
        description: 'Keeps the page available as existing resource booking and sharing services mature.',
        badges: ['resource sharing', 'future APIs'],
      },
    ];
  }

  return null;
}

function AdminLoginPage({
  authMode,
  email,
  password,
  isLoggingIn,
  onEmailChange,
  onPasswordChange,
  onEmailSubmit,
  onGoogleLogin,
  onAuthModeChange,
}: {
  authMode: 'selection' | 'email-login' | 'email-signup';
  email: string;
  password: string;
  isLoggingIn: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onEmailSubmit: (event: React.FormEvent) => void;
  onGoogleLogin: () => void;
  onAuthModeChange: (mode: 'selection' | 'email-login' | 'email-signup') => void;
}) {
  const isEmailLogin = authMode === 'email-login';

  return (
    <div className="min-h-screen bg-[#0F172A] text-white flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 opacity-20">
        <AnimatedFloorPlan />
      </div>
      <div className="max-w-md w-full relative z-10">
        <div className="text-center mb-8">
          <div className="mx-auto mb-5 h-20 w-20 rounded-3xl bg-white/10 border border-white/20 flex items-center justify-center shadow-2xl">
            <ShieldCheck className="h-10 w-10 text-primary" />
          </div>
          <h1 className="text-4xl font-heading font-bold mb-2">Admin Portal</h1>
          <p className="text-sm text-white/60 uppercase tracking-widest">Authorized Architex administrators only</p>
        </div>

        <Card className="border-white/10 shadow-2xl bg-white/95 text-foreground backdrop-blur-md">
          <CardHeader>
            <CardTitle className="font-heading text-2xl">Secure Admin Login</CardTitle>
            <CardDescription>
              Sign in with an approved administrator account to continue.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {isEmailLogin ? (
              <form onSubmit={onEmailSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Admin Email</label>
                  <Input type="email" placeholder="admin@example.com" value={email} onChange={e => onEmailChange(e.target.value)} required className="h-12 rounded-xl" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Password</label>
                  <Input type="password" placeholder="••••••••" value={password} onChange={e => onPasswordChange(e.target.value)} required className="h-12 rounded-xl" />
                </div>
                <Button type="submit" className="w-full bg-primary text-primary-foreground h-14 text-lg font-medium rounded-xl shadow-lg" disabled={isLoggingIn}>
                  {isLoggingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Login to Admin Portal'}
                </Button>
                <Button type="button" variant="ghost" className="w-full text-muted-foreground" onClick={() => onAuthModeChange('selection')}>
                  Back to admin sign-in options
                </Button>
              </form>
            ) : (
              <div className="space-y-3">
                <Button onClick={onGoogleLogin} className="w-full bg-primary text-primary-foreground h-14 text-lg font-medium shadow-lg rounded-xl" disabled={isLoggingIn}>
                  {isLoggingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sign in with Google'}
                </Button>
                <Button variant="outline" className="w-full h-12 rounded-xl" onClick={() => onAuthModeChange('email-login')} disabled={isLoggingIn}>
                  Login with Email
                </Button>
              </div>
            )}
            <Button variant="link" asChild className="w-full text-muted-foreground">
              <a href="/">Return to Marketplace</a>
            </Button>
          </CardContent>
        </Card>
      </div>
      <Toaster />
    </div>
  );
}

function RoleSelectButton({ role, label, sub, icon, active, onClick, ...props }: any) {
  return (
    <Button
      variant={active ? 'default' : 'outline'}
      className={`h-24 sm:h-32 flex flex-col gap-2 sm:gap-3 rounded-3xl transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&>svg]:h-6 [&>svg]:w-6 sm:[&>svg]:h-8 sm:[&>svg]:w-8 ${active ? 'bg-primary text-primary-foreground border-primary sm:scale-105 shadow-lg' : 'bg-white hover:bg-primary/5 hover:border-primary/50'}`}
      onClick={onClick}
      aria-pressed={active}
      aria-label={`Select ${label} role: ${sub}`}
      {...props}
    >
      {icon}
      <div className="text-center leading-tight">
        <p className="font-bold text-sm sm:text-base">{label}</p>
        <p className="text-[10px] opacity-70">{sub}</p>
      </div>
    </Button>
  );
}

function AuthRoleCard({ icon, title, description, active, onClick, ...props }: { icon: React.ReactNode; title: string; description: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`group p-6 sm:p-8 text-left border rounded-3xl transition-all duration-300 flex flex-col gap-6 shadow-sm hover:shadow-xl ${active ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : 'border-border bg-white hover:border-primary hover:bg-primary/5'}`}
      {...props}
    >
      <div className={`p-4 rounded-2xl transition-all group-hover:scale-110 ${active ? 'bg-primary text-primary-foreground' : 'bg-secondary group-hover:bg-primary/10 group-hover:text-primary'}`}>
        {icon}
      </div>
      <div className="space-y-2">
        <h3 className="font-heading font-bold text-2xl">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
      </div>
      <div className="mt-auto pt-4 border-t border-border/50 w-full">
        <span className="text-[10px] uppercase tracking-widest font-black text-primary flex items-center gap-2 group-hover:gap-4 transition-all">
          {active ? 'Selected' : 'Select Role'} <ArrowRight className="w-4 h-4" />
        </span>
      </div>
    </button>
  );
}

function NavSectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-4 pt-4 pb-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground/70">{children}</div>;
}

function NavItem({ icon, label, active, onClick, ...props }: any) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${active ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'text-muted-foreground hover:bg-primary/5 hover:text-primary'}`}
      {...props}
    >
      {icon} <span className="font-bold">{label}</span>
    </button>
  );
}

function LandingPage({ onGetStarted, onLogin }: { onGetStarted: () => void; onLogin: () => void }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [landingTab, setLandingTab] = useState<'home' | 'resources'>('home');
  const [liveJobs, setLiveJobs] = useState<Job[]>([]);
  const prefersReducedMotion = useReducedMotion();
  const fadeUp = prefersReducedMotion ? {} : { opacity: 0, y: 24 };
  const visible = { opacity: 1, y: 0 };

  const goToTab = (tab: 'home' | 'resources') => {
    setLandingTab(tab);
    setIsMobileMenuOpen(false);
  };

  useEffect(() => {
    const q = query(
      collection(db, 'jobs'),
      where('status', '==', 'open'),
      orderBy('createdAt', 'desc'),
      limit(3)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setLiveJobs(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Job)));
    }, (error) => {
      console.error('Error loading live marketplace preview:', error);
      setLiveJobs([]);
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-background overflow-x-hidden relative text-foreground">
      <AnimatedFloorPlan />
      <nav className="h-20 sm:h-24 lg:h-28 border-b border-border px-4 sm:px-8 lg:px-20 flex items-center justify-between sticky top-0 bg-card/95 backdrop-blur-md z-50 shadow-sm">
        <Logo showText iconClassName="w-16 h-16 sm:w-20 sm:h-20 lg:w-28 lg:h-28 object-contain" textClassName="font-heading font-bold text-2xl sm:text-3xl lg:text-5xl tracking-tighter text-foreground" />
        <div className="hidden lg:flex items-center gap-6">
          <button onClick={() => goToTab('home')} className={`text-sm font-bold underline-offset-4 hover:underline ${landingTab === 'home' ? 'text-primary' : 'text-foreground/80 hover:text-primary'}`}>Home</button>
          <button onClick={() => goToTab('resources')} className={`text-sm font-bold underline-offset-4 hover:underline ${landingTab === 'resources' ? 'text-primary' : 'text-foreground/80 hover:text-primary'}`}>Resources</button>
          <button onClick={onGetStarted} className="text-sm font-bold text-foreground/80 hover:text-primary underline-offset-4 hover:underline">Marketplace</button>
          <button onClick={onLogin} className="text-sm font-bold text-foreground/80 hover:text-primary underline-offset-4 hover:underline">Login</button>
          <Button onClick={onGetStarted} className="bg-primary text-primary-foreground px-6 rounded-full font-bold">Get Started</Button>
        </div>
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} aria-label="Toggle navigation menu" aria-expanded={isMobileMenuOpen}>{isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}</Button>
        {isMobileMenuOpen && (
          <div className="absolute top-20 left-3 right-3 bg-card border border-border rounded-[1.5rem] shadow-2xl p-5 sm:p-8 flex flex-col gap-5 sm:gap-6 lg:hidden">
            <button onClick={() => goToTab('home')} className="text-lg font-bold hover:text-primary underline-offset-4 hover:underline">Home</button>
            <button onClick={() => goToTab('resources')} className="text-lg font-bold hover:text-primary underline-offset-4 hover:underline">Resources</button>
            <button onClick={() => { onGetStarted(); setIsMobileMenuOpen(false); }} className="text-lg font-bold hover:text-primary underline-offset-4 hover:underline">Marketplace</button>
            <button onClick={() => { onLogin(); setIsMobileMenuOpen(false); }} className="text-lg font-bold hover:text-primary underline-offset-4 hover:underline">Login</button>
            <Button onClick={() => { onGetStarted(); setIsMobileMenuOpen(false); }} className="bg-primary text-primary-foreground h-14 rounded-full font-bold">Get Started</Button>
          </div>
        )}
      </nav>

      <AnimatePresence mode="wait">
        {landingTab === 'resources' ? (
          <motion.div
            key="resources"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -18 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            <ResourcesLanding onGetStarted={onGetStarted} />
          </motion.div>
        ) : (
          <motion.div
            key="home"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -18 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >

      {/* Hero Section */}
      <section className="pt-16 sm:pt-24 lg:pt-32 pb-14 sm:pb-20 px-4 sm:px-6 lg:px-20 relative z-10 overflow-hidden bg-card">
        <div className="max-w-7xl mx-auto min-h-[auto] lg:min-h-[680px] relative">
          <motion.div
            initial={fadeUp}
            animate={visible}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            className="pb-16 relative z-20 max-w-4xl"
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
            >
              <Badge className="bg-primary/10 text-primary border-primary/20 mb-6 sm:mb-8 px-3 sm:px-4 py-1 text-[10px] sm:text-xs uppercase tracking-widest">Smarter projects. Stronger built environments.</Badge>
            </motion.div>
            <div className="space-y-2 sm:space-y-3 mb-8 sm:mb-10">
              {[
                { word: 'Discover', icon: <Search size={42} /> },
                { word: 'Verify', icon: <ShieldCheck size={42} /> },
                { word: 'Collaborate', icon: <Users size={42} /> }
              ].map((item, index) => (
                <motion.div
                  key={item.word}
                  initial={{ opacity: 0, x: -40 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.6, delay: index * 0.15 }}
                  viewport={{ once: true }}
                  className="hero-word-row flex items-center gap-3 sm:gap-5 border-b border-border pb-3 last:border-b-0 overflow-visible"
                >
                  <motion.div
                    whileHover={{ scale: 1.1 }}
                    className="h-12 w-12 sm:h-16 sm:w-16 lg:h-20 lg:w-20 shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-xl shadow-primary/20 [&>svg]:h-6 [&>svg]:w-6 sm:[&>svg]:h-8 sm:[&>svg]:w-8 lg:[&>svg]:h-[42px] lg:[&>svg]:w-[42px]"
                  >
                    {item.icon}
                  </motion.div>
                  <h1 className={`relative text-4xl min-[380px]:text-5xl md:text-7xl lg:text-8xl font-heading font-black leading-none tracking-[-0.07em] drop-shadow-sm break-words ${item.word === 'Collaborate' ? 'text-primary' : 'text-foreground'}`}>
                    <span className="relative z-10">{item.word}</span>
                  </h1>
                </motion.div>
              ))}
            </div>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              viewport={{ once: true }}
              className="text-base sm:text-xl lg:text-2xl text-muted-foreground mb-8 sm:mb-10 max-w-2xl leading-relaxed font-medium"
            >
              Architex connects clients with elite professionals and contractors through an AI-powered marketplace for the built environment. Providing tailored management and resource sharing tools to deliver projects end-to-end.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.45 }}
              viewport={{ once: true }}
              className="flex flex-wrap gap-3 sm:gap-4"
            >
              <Button onClick={onGetStarted} size="lg" className="w-full sm:w-auto bg-primary text-primary-foreground h-14 sm:h-16 px-8 sm:px-10 rounded-full text-base sm:text-lg font-bold shadow-xl hover:bg-primary-dark transition-colors">Post a Job <ArrowRight className="ml-2" /></Button>
              <Button onClick={onGetStarted} variant="outline" size="lg" className="w-full sm:w-auto h-14 sm:h-16 px-8 sm:px-10 rounded-full text-base sm:text-lg font-bold bg-card text-foreground border-border hover:bg-accent transition-colors">Browse Talent</Button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      <ServicesInfographic prefersReducedMotion={Boolean(prefersReducedMotion)} onGetStarted={onGetStarted} />

      {/* Marketplace Preview */}
      <section className="py-12 bg-secondary px-4 sm:px-8 lg:px-20 relative z-10 border-y border-border">
        <div className="max-w-7xl mx-auto">
          <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <Badge className="mb-4 bg-primary/10 text-primary border-primary/20 uppercase tracking-widest">Live Marketplace</Badge>
              <h2 className="text-3xl md:text-5xl font-heading font-black tracking-tight text-foreground">Current open projects</h2>
              <p className="mt-3 max-w-2xl text-muted-foreground font-medium">Browse live opportunities from clients looking for built-environment professionals.</p>
            </div>
            <Button onClick={onGetStarted} variant="outline" className="rounded-full font-bold">View Marketplace <ArrowRight className="ml-2 h-4 w-4" /></Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            {liveJobs.length === 0 && (
              <div className="md:col-span-3 rounded-3xl border border-dashed border-border bg-card p-8 text-center text-muted-foreground">
                No open marketplace projects are currently published. New client opportunities will appear here once persisted in the marketplace.
              </div>
            )}
            {liveJobs.map((job) => (
              <motion.div
                key={job.id}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                viewport={{ once: true }}
                className="rounded-3xl border border-border bg-card p-6 shadow-sm hover:shadow-lg transition-shadow flex flex-col min-h-[260px]"
              >
                <div className="flex items-center justify-between gap-3 mb-5">
                  <Badge variant="secondary" className="uppercase text-[10px] tracking-widest">{job.category || 'Project'}</Badge>
                  <span className="text-sm font-bold text-primary font-mono">R {(job.budget || 0).toLocaleString()}</span>
                </div>
                <h3 className="text-xl font-heading font-black text-foreground mb-3">{job.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3 mb-6">{job.description}</p>
                <div className="mt-auto flex items-center justify-between border-t border-border pt-4 text-[10px] uppercase font-bold text-muted-foreground">
                  <span className="flex items-center gap-1"><MapPin size={12} /> {job.location || 'South Africa'}</span>
                  <span className="flex items-center gap-1"><Clock size={12} /> {job.deadline || 'Open'}</span>
                </div>
              </motion.div>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              ['AI-Powered Intelligence', 'SANS 10400 compliance checks for drawings and collaborative design workflows.'],
              ['Built for the Built Environment', 'Purpose-built tools for every project stage.'],
              ['Connected Ecosystem', 'Clients, professionals, and contractors working as one.']
            ].map(([title, copy], idx) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: idx * 0.1 }}
                viewport={{ once: true }}
                className="rounded-3xl border border-border bg-card p-8 shadow-sm hover:shadow-md transition-shadow"
              >
                <h2 className="text-lg font-black uppercase tracking-wide mb-3 text-foreground">{title}</h2>
                <p className="text-muted-foreground leading-relaxed max-w-sm font-medium">{copy}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

          </motion.div>
        )}
      </AnimatePresence>

      <footer className="bg-card py-12 sm:py-16 lg:py-20 px-4 sm:px-8 lg:px-20 border-t border-border relative z-10 text-foreground">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center text-center md:text-left gap-6 sm:gap-8">
          <Logo showText iconClassName="w-14 h-14 sm:w-16 sm:h-16 object-contain" textClassName="font-heading font-bold text-xl sm:text-2xl lg:text-3xl" />
          <p className="text-xs sm:text-sm text-muted-foreground">© 2026 Architex. South Africa's Premier Architectural Marketplace.</p>
        </div>
      </footer>
    </div>
  );
}

function ServicesInfographic({ prefersReducedMotion, onGetStarted }: { prefersReducedMotion: boolean; onGetStarted: () => void }) {
  const services = [
    { title: 'Client Brief', copy: 'Capture scope, budget, site context, and project goals.', icon: <FileText size={22} /> },
    { title: 'Smart Matching', copy: 'Connect with architects, freelancers, and contractors.', icon: <Network size={22} /> },
    { title: 'AI Automation', copy: 'Orchestrated agents review drawings, risks, and next actions.', icon: <Bot size={22} /> },
    { title: 'SANS Compliance', copy: 'Automated checks for walls, fenestration, fire, and area rules.', icon: <ClipboardCheck size={22} /> },
    { title: 'Resource Sharing', copy: 'Centralise documents, knowledge, files, and project evidence.', icon: <Files size={22} /> },
    { title: 'Delivery', copy: 'Move from concept to municipal-ready submission workflows.', icon: <Hammer size={22} /> },
  ];

  return (
    <section className="py-16 sm:py-20 lg:py-24 px-4 sm:px-6 lg:px-20 relative z-10 bg-[linear-gradient(135deg,#021817_0%,#04302c_54%,#0f6b62_100%)] text-primary-foreground overflow-hidden">
      <div aria-hidden="true" className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_20%_20%,white,transparent_24%),radial-gradient(circle_at_80%_70%,white,transparent_20%)]" />
      <div className="max-w-7xl mx-auto relative z-10">
        <div className="mb-10 sm:mb-14 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge className="mb-5 bg-white/10 text-white border-white/20 uppercase tracking-widest text-[10px] sm:text-xs">Animated platform map</Badge>
            <h2 className="text-3xl sm:text-4xl md:text-6xl font-heading font-black tracking-tight max-w-3xl">All services, AI automation, and delivery workflows in one connected hub.</h2>
          </div>
          <Button onClick={onGetStarted} variant="outline" className="w-full sm:w-auto rounded-full h-14 px-8 bg-white/10 border-white/25 text-white hover:bg-white hover:text-primary font-bold">
            Start a project <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px_1fr] gap-5 sm:gap-6 items-center">
          <div className="grid gap-5">
            {services.slice(0, 3).map((service, index) => <ServiceNode key={service.title} service={service} index={index} />)}
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            whileInView={{ opacity: 1, scale: 1 }}
            animate={prefersReducedMotion ? undefined : { boxShadow: ['0 0 0 rgba(255,255,255,0.10)', '0 0 70px rgba(255,255,255,0.28)', '0 0 0 rgba(255,255,255,0.10)'] }}
            transition={{ duration: 2.8, repeat: prefersReducedMotion ? 0 : Infinity, ease: 'easeInOut' }}
            viewport={{ once: true }}
            className="relative mx-auto my-4 sm:my-6 lg:my-0 h-64 w-64 sm:h-80 sm:w-80 rounded-full border border-white/20 bg-white/10 backdrop-blur-md flex items-center justify-center shadow-2xl"
          >
            <div className="absolute inset-8 rounded-full border border-dashed border-white/30 animate-spin-slow" />
            <div className="absolute inset-16 rounded-full bg-primary-dark/80 border border-white/20" />
            <div className="relative z-10 text-center px-10">
              <div className="mx-auto mb-4 h-14 w-14 sm:h-16 sm:w-16 rounded-2xl bg-white text-primary flex items-center justify-center shadow-xl">
                <Workflow className="h-8 w-8 sm:h-[34px] sm:w-[34px]" />
              </div>
              <h3 className="font-heading text-2xl sm:text-3xl font-black">Architex AI</h3>
              <p className="mt-2 text-xs sm:text-sm text-white/75 font-medium">Multi-agent automation coordinates compliance, marketplace, files, teams, and project intelligence.</p>
            </div>
          </motion.div>

          <div className="grid gap-5">
            {services.slice(3).map((service, index) => <ServiceNode key={service.title} service={service} index={index + 3} />)}
          </div>
        </div>
      </div>
    </section>
  );
}

type ServiceNodeProps = {
  service: { title: string; copy: string; icon: React.ReactNode };
  index: number;
};

function ServiceNode({ service, index }: React.PropsWithChildren<ServiceNodeProps>) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: index * 0.08 }}
      viewport={{ once: true }}
      className="group rounded-[1.5rem] sm:rounded-[2rem] border border-white/15 bg-white/10 p-4 sm:p-5 backdrop-blur-md hover:bg-white/15 transition-colors"
    >
      <div className="flex gap-3 sm:gap-4">
        <div className="h-11 w-11 sm:h-12 sm:w-12 shrink-0 rounded-2xl bg-white text-primary flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
          {service.icon}
        </div>
        <div>
          <h3 className="font-heading text-lg sm:text-xl font-black">{service.title}</h3>
          <p className="mt-1 text-xs sm:text-sm text-white/75 leading-relaxed font-medium">{service.copy}</p>
        </div>
      </div>
    </motion.div>
  );
}

function ResourcesLanding({ onGetStarted }: { onGetStarted: () => void }) {
  const resources = [
    { title: 'SANS 10400 Readiness Guide', copy: 'Understand the checks Architex AI performs across walls, fire, fenestration, area sizing, and documentation.', icon: <BookOpen size={24} />, tag: 'Compliance' },
    { title: 'Client Briefing Template', copy: 'Prepare scope, site details, inspiration, budget, and timeline before posting your project.', icon: <FileText size={24} />, tag: 'Clients' },
    { title: 'AI Review Checklist', copy: 'A practical list for title blocks, north points, scale bars, room schedules, and municipal submission basics.', icon: <ClipboardCheck size={24} />, tag: 'AI Automation' },
    { title: 'Professional Onboarding', copy: 'Guidance for architects and freelancers setting up verified marketplace profiles.', icon: <Users size={24} />, tag: 'Professionals' },
    { title: 'Resource Library Workflow', copy: 'Learn how shared files, knowledge sources, and project evidence support faster decisions.', icon: <Database size={24} />, tag: 'Knowledge' },
    { title: 'Project Delivery Playbook', copy: 'Coordinate teams from concept to approval using payments, files, reviews, and audit trails.', icon: <Lightbulb size={24} />, tag: 'Delivery' },
  ];

  return (
    <main className="relative z-10 bg-background">
      <section className="px-4 sm:px-6 lg:px-20 py-16 sm:py-20 lg:py-24 bg-card border-b border-border overflow-hidden relative">
        <div aria-hidden="true" className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="max-w-7xl mx-auto relative z-10 grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-12 items-center">
          <div>
            <Badge className="mb-5 sm:mb-6 bg-primary/10 text-primary border-primary/20 uppercase tracking-widest text-[10px] sm:text-xs">Resources</Badge>
            <h1 className="text-4xl sm:text-5xl md:text-7xl font-heading font-black tracking-[-0.06em] leading-none">Practical tools for smarter built-environment projects.</h1>
            <p className="mt-6 sm:mt-8 text-base sm:text-xl text-muted-foreground leading-relaxed font-medium max-w-2xl">Use these guides and templates to brief clearly, prepare compliant drawings, understand AI automation, and move faster from idea to approved project.</p>
            <div className="mt-8 sm:mt-10 flex flex-wrap gap-3 sm:gap-4">
              <Button onClick={onGetStarted} size="lg" className="w-full sm:w-auto h-14 px-8 rounded-full bg-primary text-primary-foreground font-bold">Use the marketplace <ArrowRight className="ml-2 h-4 w-4" /></Button>
              <Button variant="outline" size="lg" className="w-full sm:w-auto h-14 px-8 rounded-full font-bold">Browse guides</Button>
            </div>
          </div>
          <div className="rounded-[2rem] sm:rounded-[2.5rem] border border-primary/15 bg-primary/5 p-4 sm:p-8 shadow-xl">
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              {['Brief', 'Match', 'Review', 'Submit'].map((step, index) => (
                <motion.div key={step} initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} transition={{ delay: index * 0.08 }} viewport={{ once: true }} className="rounded-2xl sm:rounded-3xl bg-card border border-border p-4 sm:p-6">
                  <span className="text-xs font-black text-primary font-mono">0{index + 1}</span>
                  <p className="mt-6 sm:mt-8 font-heading text-xl sm:text-2xl font-black">{step}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 sm:px-6 lg:px-20 py-14 sm:py-20 bg-secondary border-b border-border">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {resources.map((resource, index) => (
            <motion.article key={resource.title} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: index * 0.06 }} viewport={{ once: true }} className="rounded-[1.5rem] sm:rounded-[2rem] border border-border bg-card p-5 sm:p-7 shadow-sm hover:shadow-lg hover:border-primary/25 transition-all">
              <div className="mb-6 flex items-center justify-between gap-4">
                <div className="h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">{resource.icon}</div>
                <Badge variant="secondary" className="uppercase text-[10px] tracking-widest">{resource.tag}</Badge>
              </div>
              <h2 className="text-2xl font-heading font-black mb-3">{resource.title}</h2>
              <p className="text-muted-foreground leading-relaxed font-medium mb-6">{resource.copy}</p>
              <button className="inline-flex items-center gap-2 text-sm font-black text-primary hover:underline underline-offset-4">
                View resource <Download size={14} />
              </button>
            </motion.article>
          ))}
        </div>
      </section>
    </main>
  );
}
