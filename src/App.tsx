/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy, useCallback, useMemo, useState, useEffect } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';
import { auth, db, trackEvent } from './lib/firebase';
import { trackUserActivity, type UserActivitySource } from './lib/userActivity';
import { apiFetch } from './lib/apiClient';
import { DemoModeProvider, useDemoMode } from './demo-context/DemoModeProvider';
import { DemoRoleSwitcher } from './components/DemoRoleSwitcher';
import { DemoBanner } from './components/DemoBanner';
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
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { UserProfile, UserRole, KnowledgeCitation } from './types';
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
  FileArchive,
  Users,
  LogOut,
  Plus,
  Search,
  ShieldCheck,
  Shield,
  History,
  ArrowRight,
  CheckCircle2,
  MapPin,
  AlertTriangle,
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
  Wrench,
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
  Factory,
  ChevronRight,
  BarChart3,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';

import { Logo } from './components/Logo';
import { NotificationBell } from './components/NotificationBell';
import { architexNavigation } from './navigation/architexNavigationConfig';
import { getDefaultPageForNavKey, getNavKeyForActiveTab } from './navigation/navDashboardAdapter';
import type { ArchitexNavKey } from './navigation/navTypes';

// Sub-components
import { AnimatedFloorPlan } from './components/AnimatedFloorPlan';
import BirdFlocks from './components/animations/BirdFlocks';

// Website UI redesign (liquid glass) — additive, isolated layer.
// Dark_Theme is applied app-wide via ThemeProvider; the new LandingPage is the
// unauthenticated home view (imported aliased to avoid colliding with the
// legacy in-file `LandingPage` marketing component, which is left intact).
import { ThemeProvider } from '@/design-system/theme/ThemeProvider';
import { LandingPage as LandingExperience } from '@/features/landing/LandingPage';

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
const SubcontractorDashboard = lazyWithChunkRetry(() => import('./components/SubcontractorDashboard'));
const SupplierDashboard = lazyWithChunkRetry(() => import('./components/SupplierDashboard'));
const FirmDashboard = lazyWithChunkRetry(() => import('./components/FirmDashboard'));
const UserSettings = lazyWithChunkRetry(() => import('./components/UserSettings'));
const ProfileEditor = lazyWithChunkRetry(() => import('./components/ProfileEditor'));
const InvoiceManagement = lazyWithChunkRetry(() => import('./components/InvoiceManagement'));
const FileManager = lazyWithChunkRetry(() => import('./components/FileManager'));
const OnboardingFlow = lazyWithChunkRetry(() => import('./components/OnboardingFlow'));
const MunicipalTracker = lazyWithChunkRetry(() => import('./components/MunicipalTracker'));
const SubmissionReadinessDashboard = lazyWithChunkRetry(() => import('./components/SubmissionReadinessDashboard'));
const KnowledgeSources = lazyWithChunkRetry(() => import('./components/KnowledgeSources').then((module) => ({ default: module.KnowledgeSources })));
const ProjectCommandCentre = lazyWithChunkRetry(() => import('./components/ProjectCommandCentre'));
const ProjectWorkflowPage = lazyWithChunkRetry(() => import('./components/ProjectWorkflowPage'));
const ProjectCommunicationCentrePage = lazyWithChunkRetry(() => import('./components/ProjectCommunicationCentrePage'));
const GuidedBriefWizard = lazyWithChunkRetry(() => import('./components/GuidedBriefWizard'));
const ClientProposalComparison = lazyWithChunkRetry(() => import('./components/ClientProposalComparison'));
const BEPClientMarketplacePage = lazyWithChunkRetry(() => import('./components/BEPClientMarketplacePage'));
const DesignTeamMatrixPage = lazyWithChunkRetry(() => import('./components/DesignTeamMatrixPage'));
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
const SANSComplianceFormsPage = lazyWithChunkRetry(() => import('./components/SANSComplianceFormsPage'));
const ComplianceToolboxHub = lazyWithChunkRetry(() => import('./components/ComplianceToolboxHub'));
const CPDAssessmentPage = lazyWithChunkRetry(() => import('./components/CPDAssessmentPage'));
const ToolsetReviewDashboard = lazyWithChunkRetry(() => import('./components/toolsets/ToolsetReviewDashboard'));
const DrawingRegisterPage = lazyWithChunkRetry(() => import('./components/DrawingRegisterPage'));
const AdminGovernanceConsolePage = lazyWithChunkRetry(() => import('./components/AdminGovernanceConsolePage'));
const TimesheetEntryPage = lazyWithChunkRetry(() => import('./components/TimesheetEntry'));
const PipelineKanbanPage = lazyWithChunkRetry(() => import('./components/PipelineKanban'));
const TemplateLibraryPage = lazyWithChunkRetry(() => import('./components/TemplateLibrary'));
const RegistrationTrackerPage = lazyWithChunkRetry(() => import('./components/RegistrationTracker'));
const SpecForgeWorkspacePage = lazyWithChunkRetry(() => import('./components/specforge/SpecForgeWorkspace'));
const HealthSafetyWorkspacePage = lazyWithChunkRetry(() => import('./components/healthSafety/HealthSafetyWorkspace'));
const MarketplaceShell = lazyWithChunkRetry(() => import('@/features/marketplace/components/MarketplaceShell'));
const FeeProposalBuilder = lazyWithChunkRetry(() => import('./components/tools/FeeProposalBuilder/index'));
const SACouncilDrawingComplianceNavigator = lazyWithChunkRetry(() => import('./components/SACouncilDrawingComplianceNavigator'));
const NCRManagerStandalone = lazyWithChunkRetry(() => import('./components/NCRManagerStandalone'));
const SiteInstructionManagerStandalone = lazyWithChunkRetry(() => import('./components/SiteInstructionManagerStandalone'));
const ContractAdminWorkspace = lazyWithChunkRetry(() => import('./components/ContractAdminWorkspace'));
const ContractorComplianceDashboard = lazyWithChunkRetry(() => import('./components/ContractorComplianceDashboard'));
const DisputeResolutionPage = lazyWithChunkRetry(() => import('./components/DisputeResolutionPage'));

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

export type DashboardPage = {
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

export const CANONICAL_DASHBOARD_PAGES: DashboardPage[] = [
  { id: 'command', label: 'Command Centre', roles: ['client', 'bep', 'architect', 'contractor', 'subcontractor', 'supplier', 'freelancer', 'admin'], group: 'Core workflow', icon: <LayoutDashboard size={18} />, summary: 'Role-aware dashboard landing page for priorities, project state, and next decisions.', backedBy: ['role dashboards', 'active project data'] },
  { id: 'profile', label: 'Profile Editor', roles: ['client', 'bep', 'architect', 'contractor', 'subcontractor', 'supplier', 'freelancer', 'admin'], group: 'Core workflow', icon: <UserCircle size={18} />, summary: 'Canonical profile surface reused for verification, contracts, invoices, procurement, matching, and governance.', backedBy: ['UserSettings', 'ProfileEditor'] },
  { id: 'toolbox', label: 'Project Toolbox', roles: ['client', 'bep', 'architect', 'contractor', 'subcontractor', 'supplier', 'freelancer', 'admin'], group: 'Core workflow', icon: <Files size={18} />, summary: 'Guided, role-aware project tools and checklists from the backend.html reference.', backedBy: ['FileManager', 'current project metadata'] },
  { id: 'toolset-review', label: 'Toolset Review', roles: ['client', 'bep', 'architect', 'contractor', 'subcontractor', 'supplier', 'freelancer', 'admin'], group: 'Core workflow', icon: <Wrench size={18} />, summary: 'Amy/Greg role-aware toolset registry, calculator toolbox, guarded recommendations, and implementation coverage.', backedBy: ['toolset registry', 'calculator service', 'implementation manifests'] },
  { id: 'journey', label: 'Project Journey', roles: ['client', 'bep', 'architect', 'contractor', 'subcontractor', 'supplier', 'freelancer', 'admin'], group: 'Core workflow', icon: <Workflow size={18} />, summary: 'Lifecycle navigation shell for stage progress, decisions, and next actions.', backedBy: ['StageProgressTracker', 'AdvanceStageButton'] },
  { id: 'tasks', label: 'Tasks & Approvals', roles: ['client', 'bep', 'architect', 'contractor', 'subcontractor', 'supplier', 'freelancer', 'admin'], group: 'Core workflow', icon: <ClipboardCheck size={18} />, summary: 'Role-filtered task and approval command surface.', backedBy: ['delegatedTasks', 'job status workflows'] },
  { id: 'messages', label: 'Project Messenger', roles: ['client', 'bep', 'architect', 'contractor', 'subcontractor', 'supplier', 'freelancer', 'admin'], group: 'Core workflow', icon: <Mail size={18} />, summary: 'Native project chat applet and desktop message centre for phase-aware capture, AI draft suggestions, conversions, approvals, and audit links.', backedBy: ['ProjectChatApplet', 'ProjectMessageCentre', 'projectCommunicationCentreService'] },
  { id: 'programme', label: 'Programme / Gantt', roles: ['client', 'bep', 'architect', 'contractor', 'subcontractor', 'supplier', 'freelancer', 'admin'], group: 'Core workflow', icon: <Workflow size={18} />, summary: 'Shared programme/Gantt surface with role-specific views.', backedBy: ['GanttChart'] },
  { id: 'disputes', label: 'Dispute Resolution', roles: ['client', 'bep', 'architect', 'contractor', 'subcontractor', 'supplier', 'freelancer', 'admin'], group: 'Core workflow', icon: <ShieldCheck size={18} />, summary: 'Dispute centre shell linked to project/job dispute records.', backedBy: ['jobDisputes', 'AdminDashboard disputes'] },
  { id: 'payments', label: 'Payments & Governance', roles: ['client', 'bep', 'architect', 'contractor', 'subcontractor', 'supplier', 'freelancer', 'admin'], group: 'Core workflow', icon: <CreditCard size={18} />, summary: 'Payment governance shell. Invoice handling is available separately while escrow/payment APIs mature.', backedBy: ['InvoiceManagement'] },
  { id: 'invoicing', label: 'Invoicing', roles: [...DESIGN_TEAM_ROLES, 'contractor', 'freelancer', 'admin'], group: 'Core workflow', icon: <Calculator size={18} />, summary: 'Role-gated invoice workspace for professional fees, contractor claims, and freelancer deliverables.', backedBy: ['InvoiceManagement'] },
  { id: 'contracts', label: 'Contracts & Signing', roles: ['client', 'bep', 'architect', 'contractor', 'subcontractor', 'supplier', 'freelancer', 'admin'], group: 'Core workflow', icon: <FileText size={18} />, summary: 'Contract/signing shell for scopes, proposals, packages, and work orders.', backedBy: ['project/job records'] },
  { id: 'escrow', label: 'Escrow Service', roles: ['client', 'bep', 'architect', 'contractor', 'subcontractor', 'supplier', 'freelancer', 'admin'], group: 'Core workflow', icon: <Landmark size={18} />, summary: 'Escrow allocation shell for milestone and package payments.', backedBy: ['FinancialDashboard'] },
  { id: 'ai', label: 'AI Co-Pilot', roles: ['client', 'bep', 'architect', 'contractor', 'subcontractor', 'supplier', 'freelancer', 'admin'], group: 'Core workflow', icon: <Bot size={18} />, summary: 'Contextual AI workflow shell connected to existing governance/audit concepts.', backedBy: ['AgentKnowledgeManager', 'AdminDashboard agents'] },
  { id: 'client-intake', label: 'Guided Brief Wizard', roles: ['client'], group: 'Client tools', icon: <ClipboardCheck size={18} />, summary: 'Client-friendly intake shell aligned with backend.html guided brief requirements.', backedBy: ['ClientDashboard post job flow'] },
  { id: 'client-proposals', label: 'BEP Proposals', roles: ['client'], group: 'Client tools', icon: <Users size={18} />, summary: 'Proposal comparison shell for fit, fee, timeline, risk notes, and appointment decisions.', backedBy: ['job applications'] },
  { id: 'directory-search', label: 'Directory Search', roles: ['client', 'bep', 'architect', 'contractor'], group: 'Client tools', icon: <Search size={18} />, summary: 'Manual verified directory search/invite shell.', backedBy: ['marketplace user profiles'] },
  { id: 'municipal-tracker', label: 'Municipal Status', roles: ['client', 'bep', 'architect', 'contractor'], group: 'Client tools', icon: <MapPin size={18} />, summary: 'Municipal status shell backed by the existing tracker component/domain.', backedBy: ['MunicipalTracker'] },
  { id: 'submission-readiness', label: 'Submission Readiness', roles: ['client', 'bep', 'architect', 'contractor', 'admin'], group: 'Client tools', icon: <ClipboardCheck size={18} />, summary: 'Municipal submission readiness assessment — complexity, routing, evidence pack, and score.', backedBy: ['SubmissionReadinessDashboard'] },
  { id: 'client-progress', label: 'Progress Reports', roles: ['client'], group: 'Client tools', icon: <Clock size={18} />, summary: 'Plain-language progress report shell for client decisions and risks.', backedBy: ['StageProgressTracker', 'GanttChart'] },
  { id: 'design', label: 'Design & Compliance', roles: [...DESIGN_TEAM_ROLES, 'freelancer', 'admin'], group: 'BEP tools', icon: <Network size={18} />, summary: 'Design-team deliverables, registers, responsibility matrix, and compliance shell.', backedBy: ['ResponsibilityMatrix', 'TeamBuilder'] },
  { id: 'drawing-register', label: 'Drawing Register', roles: ['client', ...DESIGN_TEAM_ROLES, 'admin'], group: 'BEP tools', icon: <FileArchive size={18} />, summary: 'Formal drawing numbers, revisions, issue status, superseded records, and transmittal logs.', backedBy: ['projects.documents', 'projects.transmittals', 'coordination_items'] },
  { id: 'drawing-checker', label: 'AI Drawing Checker', roles: [...DESIGN_TEAM_ROLES, 'freelancer'], group: 'BEP tools', icon: <CheckCircle2 size={18} />, summary: 'Drawing compliance checker backed by upload/review records and FileManager quick scans.', backedBy: ['FileManager'] },
  { id: 'sans-forms', label: 'SANS / Compliance Forms', roles: [...DESIGN_TEAM_ROLES, 'admin'], group: 'BEP tools', icon: <FileText size={18} />, summary: 'Compliance form autofill shell using project/profile/team data.', backedBy: ['ComplianceReport'] },
  { id: 'compliance', label: 'SANS Codified Compliance', roles: ['client', 'bep', 'architect', 'contractor', 'subcontractor', 'supplier', 'freelancer', 'admin'], group: 'BEP tools', icon: <ShieldCheck size={18} />, summary: 'SANS/NBR Compliance Intelligence Engine: clause search, part browser, boundary wall checker, AI drawing compliance bridge.', backedBy: ['complianceEngineService', 'AI Drawing Checker'] },
  { id: 'technical-brief', label: 'Technical Brief Editor', roles: [...DESIGN_TEAM_ROLES, 'admin'], group: 'BEP tools', icon: <Briefcase size={18} />, summary: 'BEP technical brief refinement shell after client intake.', backedBy: ['job brief data'] },
  { id: 'bep-marketplace', label: 'Client Marketplace', roles: DESIGN_TEAM_ROLES, group: 'BEP tools', icon: <Search size={18} />, summary: 'Live client opportunity marketplace for design-team proposal submissions.', backedBy: ['jobs', 'applications'] },
  { id: 'bep-team', label: 'Design Team Matrix', roles: DESIGN_TEAM_ROLES, group: 'BEP tools', icon: <Users size={18} />, summary: 'Discipline responsibility matrix and consultant invitation workspace.', backedBy: ['projects.teamMembers', 'teamService'] },
  { id: 'bep-freelancers', label: 'Freelancer Jobs', roles: DESIGN_TEAM_ROLES, group: 'BEP tools', icon: <Plus size={18} />, summary: 'Controlled BEP-to-freelancer work package shell.', backedBy: ['delegatedTasks'] },
  { id: 'specforge', label: 'SpecForge Specifications', roles: ['client', 'developer', 'bep', 'architect', 'engineer', 'quantity_surveyor', 'energy_professional', 'fire_engineer', 'contractor', 'subcontractor', 'supplier', 'freelancer', 'admin'], group: 'BEP tools', icon: <FileText size={18} />, summary: 'Interactive pictorial specifications, product schedules, approvals, RFQs, planning and closeout.', backedBy: ['SpecForgeWorkspace', 'specforgeService'] },
  { id: 'council-navigator', label: 'Council Drawing Navigator', roles: ['architect', 'bep', 'engineer', 'energy_professional', 'fire_engineer', 'town_planner', 'admin'], group: 'BEP tools', icon: <MapPin size={18} />, summary: 'Municipality-specific drawing submission requirements for South African local authorities.', backedBy: ['SACouncilDrawingComplianceNavigator', 'saCouncilDrawingComplianceData'] },
  { id: 'health-safety', label: 'Health & Safety', roles: ['health_safety', 'site_manager', 'contractor', 'subcontractor', 'client', 'admin', 'architect', 'engineer'], group: 'Construction tools', icon: <Shield size={18} />, summary: 'Construction Regulations 2014 safety file, permits, HIRA, incidents, inductions and fall protection plans.', backedBy: ['HealthSafetyWorkspace', 'healthSafetyServices'] },
  { id: 'snagging', label: 'Snagging / Close-Out', roles: [...DESIGN_TEAM_ROLES, 'contractor', 'subcontractor', 'supplier', 'admin'], group: 'Construction tools', icon: <CheckCircle2 size={18} />, summary: 'Project and package close-out shell backed by existing closeout workflows and package evidence records.', backedBy: ['CloseoutWizard', 'PackageCloseoutPage'] },
  { id: 'construction', label: 'Construction OS', roles: ['contractor', 'subcontractor', 'supplier', 'admin'], group: 'Construction tools', icon: <Construction size={18} />, summary: 'Construction operations shell for site logs, RFIs, programme, and delivery controls.', backedBy: ['SiteLogManager', 'RFIManager'] },
  { id: 'contractor-staff', label: 'Staff, Wages & Plant', roles: ['contractor'], group: 'Construction tools', icon: <Hammer size={18} />, summary: 'Contractor resource-management workspace for staff, wage evidence, and plant records.', backedBy: ['contractor profile/compliance records'] },
  { id: 'procurement', label: 'BoQ / BoM Procurement', roles: ['contractor', 'subcontractor', 'supplier', ...DESIGN_TEAM_ROLES, 'admin'], group: 'Construction tools', icon: <Factory size={18} />, summary: 'BoQ/BoM procurement shell for contractor, package, and supplier workflows.', backedBy: ['package readiness services'] },
  { id: 'packages', label: 'Subcontractor Packages', roles: ['contractor', 'subcontractor', 'supplier', 'admin'], group: 'Construction tools', icon: <Building2 size={18} />, summary: 'Package-layer shell for subcontractor/supplier scopes and progress.', backedBy: ['package readiness services'] },
  { id: 'ncr-manager', label: 'NCR Manager', roles: ['architect', 'bep', 'contractor', 'subcontractor', 'site_manager', 'engineer', 'admin'], group: 'Construction tools', icon: <AlertTriangle size={18} />, summary: 'Non-conformance report management — defect identification, tracking, and resolution workflows.', backedBy: ['NCRManager', 'ncrService'] },
  { id: 'site-instructions', label: 'Site Instructions', roles: ['architect', 'bep', 'contractor', 'subcontractor', 'site_manager', 'engineer', 'admin'], group: 'Construction tools', icon: <FileText size={18} />, summary: 'Formal site instruction issuance, acknowledgement, and tracking workflows.', backedBy: ['SiteInstructionManager', 'siteInstructionService'] },
  { id: 'contract-admin', label: 'Contract Administration', roles: ['architect', 'bep', 'quantity_surveyor', 'contractor', 'subcontractor', 'site_manager', 'engineer', 'admin'], group: 'Construction tools', icon: <Briefcase size={18} />, summary: 'Unified contract administration — claims, variations, EoT, notices, payment schedules, and contract data.', backedBy: ['ContractAdminWorkspace', 'contractAdmin services'] },
  { id: 'contractor-compliance', label: 'Contractor Compliance', roles: ['architect', 'bep', 'contractor', 'subcontractor', 'supplier', 'site_manager', 'quantity_surveyor', 'admin'], group: 'Construction tools', icon: <ShieldCheck size={18} />, summary: 'Contractor and supplier compliance gate — check statuses, expired certifications, and access control.', backedBy: ['ContractorComplianceDashboard', 'contractorSupplierComplianceService'] },
  { id: 'freelancer-work', label: 'Assigned Work', roles: ['freelancer'], group: 'Freelancer tools', icon: <Briefcase size={18} />, summary: 'Assigned freelancer work surface backed by current freelancer task cards.', backedBy: ['FreelancerDashboard'] },
  { id: 'freelancer-submissions', label: 'Submissions & Feedback', roles: ['freelancer'], group: 'Freelancer tools', icon: <Send size={18} />, summary: 'Submission/revision/feedback shell for freelancer deliverables.', backedBy: ['delegatedTasks', 'FileManager'] },
  { id: 'knowledge', label: 'Knowledge / CPD', roles: ['bep', 'architect', 'contractor', 'subcontractor', 'supplier', 'freelancer', 'admin'], group: 'Governance', icon: <BookOpen size={18} />, summary: 'Knowledge and CPD shell backed by knowledge-source tooling.', backedBy: ['KnowledgeSources', 'AdminKnowledgeUploader'] },
  { id: 'resource-sharing', label: 'Remote Desktop / Resources', roles: [...DESIGN_TEAM_ROLES, 'freelancer'], group: 'Governance', icon: <HardDrive size={18} />, summary: 'Remote workstation/resource sharing workspace backed by booking, usage, and resource listing records.', backedBy: ['Resource library workflow'] },
  { id: 'resource-centre', label: 'Resource Centre / Checklists', roles: [...DESIGN_TEAM_ROLES, 'freelancer'], group: 'Governance', icon: <Database size={18} />, summary: 'Role-based resource centre and checklist shell.', backedBy: ['KnowledgeSources'] },
  { id: 'cpd-assessment', label: 'CPD Assessment', roles: DESIGN_TEAM_ROLES, group: 'Governance', icon: <BookOpen size={18} />, summary: 'CPD assessment workflow backed by live assessment and attempt records with human-reviewed certificates.', backedBy: ['cpdService'] },
  { id: 'admin-console', label: 'Admin Console', roles: ['admin'], group: 'Governance', icon: <Settings2 size={18} />, summary: 'Whole-system governance console backed by current admin dashboard tabs.', backedBy: ['AdminDashboard'] },
  { id: 'timesheets', label: 'Timesheets', roles: ['architect', 'bep', 'freelancer', 'contractor', 'subcontractor', 'admin'], group: 'Governance', icon: <Clock size={18} />, summary: 'Time capture with billable/non-billable tracking and fee reconciliation.', backedBy: ['timesheetService'] },
  { id: 'pipeline', label: 'Pipeline', roles: ['architect', 'bep', 'admin'], group: 'Governance', icon: <BarChart3 size={18} />, summary: 'Visual pipeline kanban with win/loss tracking and value forecasting.', backedBy: ['pipelineService'] },
  { id: 'templates', label: 'Templates', roles: ['architect', 'bep', 'freelancer', 'admin'], group: 'Governance', icon: <FileText size={18} />, summary: 'Practice document template library with versioning and role-based access.', backedBy: ['templateLibraryService'] },
  { id: 'registrations', label: 'Registrations', roles: ['architect', 'bep', 'freelancer', 'admin'], group: 'Governance', icon: <ShieldCheck size={18} />, summary: 'Professional registration renewal tracker with CPD monitoring.', backedBy: ['registrationRenewalService'] },
];

const SHELL_PAGE_IDS = new Set(CANONICAL_DASHBOARD_PAGES.map((page) => page.id));
export const DIRECT_WORKFLOW_PAGE_IDS = new Set([
  'profile',
  'command',
  'client-intake',
  'client-proposals',
  'technical-brief',
  'directory-search',
  'packages',
  'procurement',
  'client-progress',
  'drawing-register',
  'drawing-checker',
  'tasks',
  'resource-centre',
  'knowledge',
  'admin-console',
  'design',
  'toolbox',
  'toolset-review',
  'freelancer-work',
  'freelancer-submissions',
  'resource-sharing',
  'ai',
  'contractor-staff',
  'bep-marketplace',
  'bep-team',
  'bep-freelancers',
  'sans-forms',
  'compliance',
  'cpd-assessment',
  'messages',
  'timesheets',
  'pipeline',
  'templates',
  'registrations',
  'specforge',
  'health-safety',
  'marketplace',
  'council-navigator',
  'ncr-manager',
  'site-instructions',
  'contract-admin',
  'contractor-compliance',
  'disputes',
]);
export const PROJECT_WORKFLOW_PAGE_IDS = new Set(['journey', 'programme', 'disputes', 'payments', 'invoicing', 'contracts', 'escrow', 'municipal-tracker', 'construction', 'snagging', 'passport']);
const REAL_WORKFLOW_PAGE_IDS = new Set([...DIRECT_WORKFLOW_PAGE_IDS, ...PROJECT_WORKFLOW_PAGE_IDS]);

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

export function pagesForRole(role: UserRole) {
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

const ROLE_VISUALS: Record<UserRole, { label: string; viewLabel: string; accent: string; accentSoft: string; description: string }> = {
  client: { label: 'Client', viewLabel: 'Client View', accent: '#005b4e', accentSoft: 'rgba(0, 91, 78, 0.12)', description: 'Brief, approve, track progress, and govern payments.' },
  architect: { label: 'Architect', viewLabel: 'Architect View', accent: '#006b5c', accentSoft: 'rgba(0, 107, 92, 0.12)', description: 'Lead design delivery, compliance, and project coordination.' },
  bep: { label: 'BEP / Design Team', viewLabel: 'BEP View', accent: '#7046a8', accentSoft: 'rgba(112, 70, 168, 0.12)', description: 'Coordinate professional deliverables and technical governance.' },
  contractor: { label: 'Main Contractor', viewLabel: 'Contractor View', accent: '#2f72a7', accentSoft: 'rgba(47, 114, 167, 0.12)', description: 'Drive construction programme, packages, RFIs, and site evidence.' },
  subcontractor: { label: 'Subcontractor', viewLabel: 'Subcontractor View', accent: '#d26a38', accentSoft: 'rgba(210, 106, 56, 0.14)', description: 'Manage package scope, evidence, claims, and close-out records.' },
  supplier: { label: 'Supplier', viewLabel: 'Supplier View', accent: '#1d8d6f', accentSoft: 'rgba(29, 141, 111, 0.13)', description: 'Track procurement, deliveries, warranties, and product evidence.' },
  freelancer: { label: 'Freelancer', viewLabel: 'Freelancer View', accent: '#165a4c', accentSoft: 'rgba(22, 90, 76, 0.12)', description: 'Complete assigned deliverables, submissions, and resource bookings.' },
  admin: { label: 'Platform Admin', viewLabel: 'Admin View', accent: '#ba1a1a', accentSoft: 'rgba(186, 26, 26, 0.11)', description: 'Oversee governance, system health, disputes, and platform controls.' },
  engineer: { label: 'Engineer', viewLabel: 'Engineer View', accent: '#1565c0', accentSoft: 'rgba(21, 101, 192, 0.12)', description: 'Lead engineering design, calculations, and compliance sign-off.' },
  quantity_surveyor: { label: 'Quantity Surveyor', viewLabel: 'QS View', accent: '#00838f', accentSoft: 'rgba(0, 131, 143, 0.12)', description: 'Manage cost control, bills of quantities, and commercial governance.' },
  town_planner: { label: 'Town Planner', viewLabel: 'Planner View', accent: '#6a1b9a', accentSoft: 'rgba(106, 27, 154, 0.12)', description: 'Manage zoning, land use, and statutory planning approvals.' },
  energy_professional: { label: 'Energy Professional', viewLabel: 'Energy View', accent: '#2e7d32', accentSoft: 'rgba(46, 125, 50, 0.12)', description: 'Lead energy modelling, SANS 10400-XA compliance, and sustainability.' },
  fire_engineer: { label: 'Fire Engineer', viewLabel: 'Fire View', accent: '#c62828', accentSoft: 'rgba(198, 40, 40, 0.12)', description: 'Lead fire safety design, rational designs, and SANS 10400-T compliance.' },
  site_manager: { label: 'Site Manager', viewLabel: 'Site View', accent: '#e65100', accentSoft: 'rgba(230, 81, 0, 0.12)', description: 'Manage site operations, health & safety, and daily programme delivery.' },
  developer: { label: 'Developer', viewLabel: 'Developer View', accent: '#37474f', accentSoft: 'rgba(55, 71, 79, 0.12)', description: 'Oversee project portfolio, investment governance, and programme strategy.' },
  firm_admin: { label: 'Firm Admin', viewLabel: 'Firm View', accent: '#4e342e', accentSoft: 'rgba(78, 52, 46, 0.12)', description: 'Manage practice operations, staff, CPD, and professional registrations.' },
  platform_admin: { label: 'Platform Admin', viewLabel: 'Platform View', accent: '#ba1a1a', accentSoft: 'rgba(186, 26, 26, 0.11)', description: 'Full platform governance, system configuration, and compliance oversight.' },
  land_surveyor: { label: 'Land Surveyor', viewLabel: 'Surveyor View', accent: '#5d4037', accentSoft: 'rgba(93, 64, 55, 0.12)', description: 'Manage land surveys, boundary pegging, and topographic data.' },
  health_safety: { label: 'H&S Officer', viewLabel: 'H&S View', accent: '#f57c00', accentSoft: 'rgba(245, 124, 0, 0.12)', description: 'Manage safety files, permits, inductions, incidents, and HIRA registers.' },
};

function roleVisualFor(role: UserRole) {
  return ROLE_VISUALS[role];
}

function pageLabelFor(activeTab: string) {
  return pageById(activeTab)?.label ?? activeTab.replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function normalizeAuthPath(pathname: string) {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return normalized.toLowerCase();
}

function isAdminAuthRoute(pathname: string) {
  const path = normalizeAuthPath(pathname);
  return path === '/admin' || path.endsWith('/admin') || path === '/admin/login' || path.endsWith('/admin/login');
}

function isPublicLoginRoute(pathname: string) {
  const path = normalizeAuthPath(pathname);
  return path === '/login' || path.endsWith('/login');
}

function isPublicSignupRoute(pathname: string) {
  const path = normalizeAuthPath(pathname);
  return path === '/signup' || path.endsWith('/signup') || path === '/register' || path.endsWith('/register');
}

function AppContent() {
  const prefersReducedMotion = useReducedMotion();
  const isAdminRoute = isAdminAuthRoute(window.location.pathname);
  const isLoginRoute = isPublicLoginRoute(window.location.pathname) && !isAdminRoute;
  const isSignupRoute = isPublicSignupRoute(window.location.pathname);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [roleSelection, setRoleSelection] = useState<UserRole | null>(isAdminRoute ? 'admin' : null);
  const [showLogin, setShowLogin] = useState(isAdminRoute || isLoginRoute || isSignupRoute);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [formData, setFormData] = useState<any>({});
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('architex.sidebarCollapsed') === 'true';
  });
  const toggleSidebarCollapsed = useCallback(() => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('architex.sidebarCollapsed', String(next));
      }
      return next;
    });
  }, []);
  const [activeTab, setActiveTab] = useState('command');
  const activeNavKey = user ? getNavKeyForActiveTab(activeTab) : null;

  const visibleNavItems = useMemo(() => {
    if (!user) return [];
    return architexNavigation.filter((item) => {
      if (!item.roles || item.roles.length === 0) return true;
      return item.roles.includes(user.role);
    });
  }, [user]);

  const navigateDashboard = useCallback((targetPage: string, source: UserActivitySource = 'component') => {
    setActiveTab(targetPage);
    setIsSidebarOpen(false);
    if (user) {
      trackUserActivity({
        action: 'navigate',
        role: user.role,
        feature: targetPage,
        source,
        target: targetPage,
        label: pageLabelFor(targetPage),
      });
    }
  }, [user]);

  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authMode, setAuthMode] = useState<'selection' | 'email-login' | 'email-signup'>(isSignupRoute ? 'email-signup' : 'selection');
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
      return;
    }

    if (isLoginRoute || isSignupRoute) {
      setShowLogin(true);
      setShowOnboarding(false);
      if (isSignupRoute) setAuthMode('email-signup');
    }
  }, [isAdminRoute, isLoginRoute, isSignupRoute]);

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
    trackUserActivity({
      action: 'feature_view',
      role: user.role,
      feature: activeTab,
      source: 'dashboard_tab',
      target: activeTab,
      label: pageLabelFor(activeTab),
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

  const readJsonResponse = async (res: Response) => {
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const preview = (await res.text()).slice(0, 120).replace(/\s+/g, ' ');
      throw new Error(`Expected JSON from auth API, received ${contentType || 'unknown content type'} (${res.status}). ${preview}`);
    }
    return res.json();
  };

  const createClientProfileFallback = async (selectedRole: UserRole | null, firebaseUser: FirebaseUser) => {
    const userRef = doc(db, 'users', firebaseUser.uid);
    const userDoc = await getDoc(userRef);
    if (userDoc.exists()) return { existing: true, role: (userDoc.data() as UserProfile).role };

    const fallbackRole: UserRole = selectedRole && selectedRole !== 'admin' ? selectedRole : 'client';
    if (isAdminRoute || selectedRole === 'admin') {
      throw new Error('Admin profile sync requires the secured API route. Please use the admin deployment with API support.');
    }

    const now = new Date().toISOString();
    const fallbackProfile: UserProfile = {
      uid: firebaseUser.uid,
      email: firebaseUser.email || '',
      displayName: displayName || firebaseUser.displayName || 'Architex User',
      role: fallbackRole,
      createdAt: now,
      updatedAt: now,
    };

    await setDoc(userRef, fallbackProfile);
    console.warn('Auth API unavailable; created minimal client-side profile fallback for static hosting.');
    return { role: fallbackRole, created: true, fallback: true };
  };

  const syncServerProfile = async (selectedRole: UserRole | null, firebaseUser: FirebaseUser = auth.currentUser!) => {
    const token = await firebaseUser?.getIdToken();
    if (!token) return null;

    try {
      const res = await apiFetch('/api/auth/check-admin', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ role: selectedRole || 'client', displayName, profileData: formData }),
      });

      if (!res.ok) {
        const details = await readJsonResponse(res).catch(() => null);
        throw new Error(details?.details || details?.error || 'Failed to sync Firebase profile');
      }

      return readJsonResponse(res);
    } catch (error) {
      // Always attempt the client-side Firestore fallback when the secured
      // API gateway is unavailable or rejects the token (e.g. 401 because
      // the PHP gateway's Firebase token verification is misconfigured).
      // createClientProfileFallback itself rejects admin sign-ins, so this
      // remains safe — only non-admin users get a client-side profile.
      try {
        return await createClientProfileFallback(selectedRole, firebaseUser);
      } catch (fallbackError) {
        console.warn('Auth API failed and client-side fallback was rejected:', { apiError: error, fallbackError });
        throw fallbackError;
      }
    }
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

  const completeEmailAuth = async (firebaseUser: FirebaseUser, successMessage: string) => {
    await syncServerProfile(roleSelection, firebaseUser);
    const profile = await ensureAdminAccess(firebaseUser) || await refetchServerProfile(firebaseUser);
    if (isAdminRoute && !profile) return;
    setUser(profile);
    toast.success(successMessage);
  };

  const isFirebaseAuthCode = (error: unknown, code: string) => (
    typeof error === 'object' && error !== null && 'code' in error && String((error as { code?: unknown }).code) === code
  );

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoggingIn || profileLoading) return;
    setIsLoggingIn(true);
    setProfileLoading(true);

    try {
      if (authMode === 'email-signup') {
        try {
          const result = await createUserWithEmailAndPassword(auth, email, password);
          const firebaseUser = result.user;
          if (displayName) await updateProfile(firebaseUser, { displayName });
          await sendEmailVerification(firebaseUser);
          await completeEmailAuth(firebaseUser, "Account created. Verification email sent.");
          return;
        } catch (signupError) {
          if (!isFirebaseAuthCode(signupError, 'auth/email-already-in-use')) throw signupError;

          const result = await signInWithEmailAndPassword(auth, email, password);
          await completeEmailAuth(result.user, "This email already has an account. Signed you in with the existing account.");
          return;
        }
      }

      const result = await signInWithEmailAndPassword(auth, email, password);
      await completeEmailAuth(result.user, "Welcome back!");
    } catch (error: any) {
      console.error("Auth error:", error);
      toast.error(getAuthErrorMessage(error));
    } finally {
      setIsLoggingIn(false);
      setProfileLoading(false);
    }
  };

  // Landing page inline sign-in: authenticates directly from the glass card.
  // On success, onAuthStateChanged will fire → load profile → render workspace.
  // On failure, stay on the landing — do NOT open the role-select screen.
  const handleLandingSignIn = async (signInEmail: string, signInPassword: string) => {
    if (isLoggingIn || profileLoading) return;
    setIsLoggingIn(true);
    try {
      await signInWithEmailAndPassword(auth, signInEmail, signInPassword);
      // Success: onAuthStateChanged handles profile load + setUser -> workspace.
    } catch (error: unknown) {
      console.error("Landing sign-in error:", error);
      toast.error(getAuthErrorMessage(error));
    } finally {
      setIsLoggingIn(false);
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

  useEffect(() => {
    if (!user) return;

    const handleDashboardShortcut = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.repeat) return;
      if (isEditableShortcutTarget(event.target)) return;

      const visiblePages = pagesForRole(user.role);
      const numericShortcut = Number(event.key);
      const numericTarget = Number.isInteger(numericShortcut) && numericShortcut >= 1 && numericShortcut <= 9
        ? visiblePages[numericShortcut - 1]?.id
        : undefined;
      const quickTargetByKey: Record<string, string | undefined> = {
        k: "command",
        a: pageById("ai")?.roles.includes(user.role) ? "ai" : undefined,
        p: pageById("profile")?.roles.includes(user.role) ? "profile" : undefined,
        f: "files",
        i: ["bep", "architect", "contractor", "freelancer", "admin"].includes(user.role) ? "invoicing" : undefined,
      };
      const targetPage = numericTarget ?? quickTargetByKey[event.key.toLowerCase()];

      if (!targetPage) return;
      event.preventDefault();
      navigateDashboard(targetPage, 'keyboard_shortcut');
    };

    window.addEventListener("keydown", handleDashboardShortcut);
    return () => window.removeEventListener("keydown", handleDashboardShortcut);
  }, [navigateDashboard, user]);

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
    return (
      <>
        <LandingExperience
          onSignUp={() => { setShowLogin(true); setAuthMode('selection'); }}
          onSignIn={handleLandingSignIn}
          onNavigate={(route) => {
            // QuickNav routes require authentication — open login with context
            setShowLogin(true);
            setAuthMode('selection');
          }}
        />
        <Toaster />
      </>
    );
  }

  if (!user && showLogin) {
    return (
      <div className="fixed inset-0 z-50 flex min-h-dvh items-start justify-center overflow-y-auto overscroll-contain bg-[#04302c]/92 px-3 py-3 text-[#04302c] backdrop-blur-xl sm:px-4 sm:py-6">
        <AnimatedFloorPlan />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.09] bg-[linear-gradient(rgba(248,250,252,0.8)_1px,transparent_1px),linear-gradient(90deg,rgba(248,250,252,0.8)_1px,transparent_1px)] bg-[size:36px_36px]" />
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`${authMode === 'selection' ? 'max-w-6xl' : 'max-w-4xl'} relative z-10 w-full pb-[max(env(safe-area-inset-bottom),0px)]`}
        >
          <Card className="overflow-hidden rounded-[1.6rem] border border-white/15 bg-[#F8FAFC]/96 shadow-[0_32px_120px_rgba(0,0,0,0.42)] backdrop-blur-2xl sm:rounded-[2.2rem]">
            <CardHeader className="relative overflow-hidden bg-[#04302c] px-5 pb-5 pt-16 text-[#F8FAFC] sm:px-7 sm:pb-6 sm:pt-12">
              <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_14%_18%,rgba(15,107,98,0.48),transparent_28%),radial-gradient(circle_at_86%_0%,rgba(248,250,252,0.12),transparent_28%)]" />
              <div className="absolute left-4 right-4 top-4 flex items-center justify-between sm:left-6 sm:right-6 sm:top-6">
                {authMode !== 'selection' ? (
                  <Button variant="ghost" size="sm" onClick={() => setAuthMode('selection')} className="rounded-full bg-white/10 px-3 text-[#F8FAFC] hover:bg-white hover:text-[#04302c]">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back
                  </Button>
                ) : (
                  <div />
                )}
                <Button variant="ghost" size="sm" onClick={() => { setShowLogin(false); setAuthMode('selection'); }} className="rounded-full bg-white/10 px-3 text-[#F8FAFC] hover:bg-white hover:text-[#04302c]">
                  Cancel
                </Button>
              </div>
              <div className="relative grid gap-5 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
                <div className="text-left">
                  <div className="mb-5 flex items-center gap-3">
                    <Logo iconClassName="h-16 w-16 object-contain text-[#0f6b62] sm:h-20 sm:w-20" textClassName="hidden" />
                    <div>
                      <p className="font-heading text-2xl font-black tracking-[-0.055em]">Architex OS</p>
                      <p className="text-[10px] font-black uppercase tracking-[0.32em] text-[#F8FAFC]/45">Built Environment Access</p>
                    </div>
                  </div>
                  <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-[#F8FAFC]/65">
                    <span className="h-2 w-2 rounded-full bg-[#0f6b62] shadow-[0_0_16px_#0f6b62]" /> Secure workspace boot
                  </div>
                  <CardTitle className="font-heading text-3xl font-black tracking-[-0.055em] text-[#F8FAFC] sm:text-4xl">
                    {authMode === 'selection' ? 'Join Architex' : authMode === 'email-login' ? 'Welcome Back' : 'Create your account'}
                  </CardTitle>
                  <CardDescription className="mt-2 max-w-2xl text-sm font-medium text-[#F8FAFC]/62 sm:text-base">
                    {authMode === 'selection' ? 'Select a role profile to mount the correct command centre, evidence stream, and project controls.' : 'Authenticate into the selected Architex OS workspace.'}
                  </CardDescription>
                </div>
                <div className="grid grid-cols-3 gap-2 text-left text-[10px] font-black uppercase tracking-[0.16em] text-[#F8FAFC]/55">
                  {['Role kernel', 'Audit layer', 'AI co-pilot'].map((label) => (
                    <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.055] p-3">
                      <span className="mb-4 block h-1.5 w-8 rounded-full bg-[#0f6b62]" />
                      {label}
                    </div>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 lg:p-8">
              <AnimatePresence mode="wait">
                {authMode === 'selection' ? (
                  <motion.div
                    key="auth-selection"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-4 sm:space-y-6"
                  >
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
                      <AuthRoleCard data-testid="role-select-client" icon={<Users className="w-8 h-8" />} title="Client" description="I want to hire professionals for my building project" active={roleSelection === 'client'} onClick={() => setRoleSelection('client')} />
                      <AuthRoleCard data-testid="role-select-freelancer" icon={<Sparkles className="w-8 h-8" />} title="Freelancer" description="I am a specialist or consultant (Engineer, etc.)" active={roleSelection === 'freelancer'} onClick={() => setRoleSelection('freelancer')} />
                      <AuthRoleCard data-testid="role-select-bep" icon={<Briefcase className="w-8 h-8" />} title="BEP / Design Team" description="Architects, engineers, QSs, technologists, and design-team leads" active={roleSelection === 'bep'} onClick={() => setRoleSelection('bep')} />
                      <AuthRoleCard data-testid="role-select-contractor" icon={<Factory className="w-8 h-8" />} title="Contractor" description="I manage construction delivery, tendering, and site work" active={roleSelection === 'contractor'} onClick={() => setRoleSelection('contractor')} />
                      <AuthRoleCard data-testid="role-select-subcontractor" icon={<Hammer className="w-8 h-8" />} title="Subcontractor" description="I deliver a trade package, evidence, and close-out items" active={roleSelection === 'subcontractor'} onClick={() => setRoleSelection('subcontractor')} />
                      <AuthRoleCard data-testid="role-select-supplier" icon={<Factory className="w-8 h-8" />} title="Supplier" description="I supply materials, products, deliveries, or warranties" active={roleSelection === 'supplier'} onClick={() => setRoleSelection('supplier')} />
                    </div>
                    <div className="rounded-[1.25rem] border border-[#04302c]/10 bg-[#04302c]/[0.035] p-3 sm:p-4">
                      <Button onClick={handleGoogleLogin} className="h-14 w-full rounded-2xl bg-[#04302c] text-base font-black text-[#F8FAFC] shadow-lg hover:bg-[#0f6b62]" disabled={!roleSelection || isLoggingIn}>
                        {isLoggingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sign in with Google'}
                      </Button>
                      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                    <Button type="submit" className="mt-6 h-14 w-full rounded-2xl bg-[#04302c] text-lg font-black text-[#F8FAFC] shadow-lg hover:bg-[#0f6b62]" disabled={isLoggingIn}>
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

  const currentPage = pageById(activeTab);
  const currentPageLabel = pageLabelFor(activeTab);
  const currentSectionLabel = currentPage ? dashboardSectionLabel(currentPage.group) : 'Workspace';
  const roleVisual = roleVisualFor(user.role);
  const visibleShortcutPages = pagesForRole(user.role).slice(0, 9);

  return (
    <DemoModeProvider>
    <div className="relative flex h-dvh min-h-0 flex-col overflow-hidden bg-background text-foreground beos-grid-canvas md:flex-row">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_76%_8%,rgba(124,215,195,0.20),transparent_26rem)]" />
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-[min(86vw,288px)] flex-col border-r border-border/70 beos-glass transform transition-all duration-300 ease-in-out md:sticky md:top-0 md:h-dvh md:shrink-0 md:translate-x-0 ${isSidebarCollapsed ? 'md:w-[84px]' : 'md:w-[288px]'} ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className={`h-full flex flex-col gap-y-4 overflow-y-auto overflow-x-hidden p-7 ${isSidebarCollapsed ? 'md:px-3' : ''}`}>
          <div className={`flex items-center justify-between shrink-0 ${isSidebarCollapsed ? 'md:justify-center' : ''}`}>
            <div className="flex items-center gap-3">
              <Logo iconClassName="h-14 w-14 object-contain sm:h-16 sm:w-16" textClassName="hidden" />
              <div className={isSidebarCollapsed ? 'md:hidden' : ''}>
                <p className="font-sans text-[1.35rem] font-black tracking-[-0.055em] text-primary">Architex OS</p>
                <p className="beos-label-caps text-muted-foreground">Project Coordination</p>
              </div>
            </div>
            <div className={isSidebarCollapsed ? 'md:hidden' : ''}>
              <DemoRoleSwitcher />
            </div>
            <Button variant="ghost" size="icon" className="md:hidden rounded-full hover:bg-primary/10" onClick={() => setIsSidebarOpen(false)} aria-label="Close navigation menu" aria-expanded={isSidebarOpen}><X size={20} /></Button>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className={`hidden md:inline-flex rounded-full hover:bg-primary/10 self-end shrink-0 ${isSidebarCollapsed ? 'md:self-center' : ''}`}
            onClick={toggleSidebarCollapsed}
            aria-label={isSidebarCollapsed ? 'Expand navigation menu' : 'Collapse navigation menu'}
            aria-expanded={!isSidebarCollapsed}
            title={isSidebarCollapsed ? 'Expand menu' : 'Collapse menu'}
          >
            {isSidebarCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
          </Button>

          <div className={`rounded-[1.25rem] border border-border/70 bg-muted/70 p-4 shadow-[0_10px_26px_rgba(20,71,63,0.06)] ${isSidebarCollapsed ? 'md:hidden' : ''}`} style={{ borderTop: `4px solid ${roleVisual.accent}` }}>
            <div className="flex items-center justify-between gap-3">
              <span className="beos-label-caps text-muted-foreground">Current Role</span>
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: roleVisual.accent, boxShadow: `0 0 18px ${roleVisual.accent}` }} />
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black text-primary">{roleVisual.label}</p>
                <p className="mt-1 text-[0.72rem] leading-snug text-muted-foreground">{roleVisual.description}</p>
              </div>
            </div>
          </div>

          <nav className="flex-1 space-y-1.5" aria-label="Architex navigation">
            {visibleNavItems.map((item) => (
              <NavItem
                key={item.key}
                icon={navKeyIcon(item.key)}
                label={item.label}
                active={activeNavKey === item.key}
                collapsed={isSidebarCollapsed}
                onClick={() => navigateDashboard(getDefaultPageForNavKey(item.key), 'sidebar')}
              />
            ))}
          </nav>

            <div className={`mt-4 rounded-[1rem] border border-border/70 bg-card/70 p-3 text-xs text-muted-foreground ${isSidebarCollapsed ? 'md:hidden' : ''}`} data-testid="dashboard-keyboard-shortcuts">
              <p className="font-bold text-foreground">Keyboard shortcuts</p>
              <p className="mt-1">Alt+1–9 opens your first visible pages. Alt+K Command, Alt+A AI, Alt+P Profile, Alt+F Files, Alt+I Invoicing.</p>
              <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Visible page shortcut map">
                {visibleShortcutPages.slice(0, 5).map((page, index) => <Badge key={page.id} variant="outline" className="rounded-full bg-background/70">Alt+{index + 1}: {page.label}</Badge>)}
              </div>
            </div>

          <div className="pt-5 mt-auto border-t border-border/70 shrink-0">
            <Button
              variant="ghost"
              className={`w-full justify-start gap-3 text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-full h-12 font-bold ${isSidebarCollapsed ? 'md:justify-center md:gap-0 md:px-0' : ''}`}
              onClick={handleLogout}
              title={isSidebarCollapsed ? 'Logout' : undefined}
            >
              <LogOut size={20} /> <span className={`font-bold ${isSidebarCollapsed ? 'md:hidden' : ''}`}>Logout</span>
            </Button>
          </div>
        </div>
      </aside>
      <main className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex min-h-16 items-center justify-between border-b border-border/70 px-3 beos-glass sm:min-h-20 sm:px-8">
          <div className="flex items-center gap-4 min-w-0">
            <Button variant="ghost" size="icon" className="md:hidden rounded-full" onClick={() => setIsSidebarOpen(true)} aria-label="Open navigation menu" aria-expanded={isSidebarOpen}><Menu size={24} /></Button>
            <div className="min-w-0 py-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-bold text-primary">Architex</span>
                <ChevronRight className="h-3.5 w-3.5" />
                <span>{currentSectionLabel}</span>
                <ChevronRight className="h-3.5 w-3.5" />
                <span className="font-bold text-foreground">{currentPageLabel}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <h1 className="font-sans text-xl sm:text-2xl font-black tracking-[-0.045em] text-foreground">{currentPageLabel}</h1>
                <Badge className="rounded-full border-0 text-white" style={{ backgroundColor: roleVisual.accent }}>{roleVisual.viewLabel}</Badge>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            {activeTab !== 'ai' && pageById('ai')?.roles.includes(user.role) && (
              <Button variant="outline" size="sm" className="hidden rounded-full border-[#7046a8]/25 bg-[#7046a8]/10 font-black text-[#7046a8] hover:bg-[#7046a8] hover:text-white sm:inline-flex" onClick={() => navigateDashboard('ai', 'header_cta')}>
                <Bot className="mr-2 h-4 w-4" /> Ask AI
              </Button>
            )}
            <NotificationBell userId={user.uid} />
            <div className="h-10 w-10 rounded-full bg-card flex items-center justify-center text-primary border border-border beos-soft-shadow">
              <UserIcon size={20} />
            </div>
          </div>
        </header>
        <ScrollArea className="min-h-0 flex-1">
          <motion.div
            key={`${user.role}-${activeTab}`}
            initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="mx-auto w-full max-w-[1500px] p-3 sm:p-6 lg:p-7"
          >
            <Suspense fallback={<DashboardFallback />}>
              {activeTab === 'invoices' && <InvoiceManagement user={user} />}
              {activeTab === 'files' && <FileManager user={user} />}
              {activeTab === 'profile-settings' && <UserSettings user={user} />}
              {activeTab === 'profile' && <ProfileWorkspacePage user={user} />}
              {activeTab === 'firm' && <FirmDashboard user={user} />}
              {activeTab === 'command' && <ProjectCommandCentre user={user} onNavigate={setActiveTab} />}
              {activeTab === 'client-intake' && <GuidedBriefWizard user={user} />}
              {activeTab === 'client-proposals' && <ClientProposalComparison user={user} />}
              {activeTab === 'bep-marketplace' && <BEPClientMarketplacePage user={user} />}
              {activeTab === 'bep-team' && <DesignTeamMatrixPage user={user} />}
              {activeTab === 'technical-brief' && <TechnicalBriefEditor user={user} />}
              {activeTab === 'directory-search' && <DirectorySearch user={user} />}
              {(activeTab === 'packages' || activeTab === 'procurement') && <PackageProcurementWorkspace user={user} mode={activeTab as 'packages' | 'procurement'} />}
              {activeTab === 'client-progress' && <ClientProgressReports user={user} />}
              {activeTab === 'drawing-register' && <DrawingRegisterPage user={user} />}
              {activeTab === 'drawing-checker' && <AIDrawingChecker user={user} />}
              {activeTab === 'tasks' && <TasksApprovalsPage user={user} />}
              {activeTab === 'resource-centre' && <ResourceCentre user={user} />}
              {activeTab === 'knowledge' && <ResourceCentre user={user} />}
              {activeTab === 'admin-console' && <AdminGovernanceConsolePage user={user} />}
              {activeTab === 'design' && <DesignCompliancePage user={user} />}
              {activeTab === 'toolbox' && <ProjectToolboxPage user={user} onNavigate={setActiveTab} />}
              {activeTab === 'toolset-review' && <ToolsetReviewDashboard user={user} />}
              {activeTab === 'freelancer-work' && <FreelancerDashboard user={user} />}
              {activeTab === 'freelancer-submissions' && <FreelancerSubmissionsPage user={user} />}
              {activeTab === 'resource-sharing' && <ResourceSharingPage user={user} />}
              {activeTab === 'ai' && <AICoPilotPage user={user} onNavigate={setActiveTab} />}
              {activeTab === 'contractor-staff' && <ContractorStaffPlantPage user={user} />}
              {activeTab === 'bep-freelancers' && <BEPFreelancerJobsPage user={user} />}
              {activeTab === 'sans-forms' && <SANSComplianceFormsPage user={user} />}
              {activeTab === 'compliance' && <ComplianceToolboxHub />}
              {activeTab === 'cpd-assessment' && <CPDAssessmentPage user={user} />}
              {activeTab === 'timesheets' && <TimesheetEntryPage user={user} />}
              {activeTab === 'pipeline' && <PipelineKanbanPage user={user} />}
              {activeTab === 'templates' && <TemplateLibraryPage user={user} />}
              {activeTab === 'registrations' && <RegistrationTrackerPage user={user} />}
              {activeTab === 'specforge' && <SpecForgeWorkspacePage user={user} />}
              {activeTab === 'health-safety' && <HealthSafetyWorkspacePage user={user} />}
              {activeTab === 'council-navigator' && <SACouncilDrawingComplianceNavigator />}
              {activeTab === 'ncr-manager' && <NCRManagerStandalone user={user} />}
              {activeTab === 'site-instructions' && <SiteInstructionManagerStandalone user={user} />}
              {activeTab === 'contract-admin' && <ContractAdminWorkspace user={user} />}
              {activeTab === 'contractor-compliance' && <ContractorComplianceDashboard user={user} />}
              {activeTab === 'disputes' && <DisputeResolutionPage user={user} />}
              {activeTab === 'fee-proposal-builder' && <FeeProposalBuilder user={user} />}
              {activeTab === 'marketplace' && <MarketplaceShell user={user} />}
              {activeTab === 'messages' && <ProjectCommunicationCentrePage user={user} />}
              {PROJECT_WORKFLOW_PAGE_IDS.has(activeTab) && activeTab !== 'disputes' && <ProjectWorkflowPage pageId={activeTab} user={user} />}
              {SHELL_PAGE_IDS.has(activeTab) && !REAL_WORKFLOW_PAGE_IDS.has(activeTab) && <DashboardPageShell pageId={activeTab} user={user} />}
              {(activeTab !== 'command' && activeTab !== 'invoices' && activeTab !== 'files' && activeTab !== 'profile-settings' && activeTab !== 'profile' && activeTab !== 'firm' && activeTab !== 'compliance' && activeTab !== 'cpd-assessment' && activeTab !== 'timesheets' && activeTab !== 'pipeline' && activeTab !== 'templates' && activeTab !== 'registrations' && activeTab !== 'specforge' && activeTab !== 'health-safety' && activeTab !== 'council-navigator' && activeTab !== 'ncr-manager' && activeTab !== 'site-instructions' && activeTab !== 'contract-admin' && activeTab !== 'contractor-compliance' && activeTab !== 'fee-proposal-builder' && activeTab !== 'marketplace' && activeTab !== 'messages' && !SHELL_PAGE_IDS.has(activeTab) && !PROJECT_WORKFLOW_PAGE_IDS.has(activeTab)) && (
                <>
                  {user.role === 'client' && <ClientDashboard user={user} activeTab={activeTab === 'command' ? 'overview' : activeTab} onTabChange={(page) => navigateDashboard(page, 'legacy_dashboard')} />}
                  {user.role === 'architect' && <ArchitectDashboard user={user} activeTab={activeTab === 'command' ? 'overview' : activeTab} onTabChange={(page) => navigateDashboard(page, 'legacy_dashboard')} />}
                  {user.role === 'admin' && <AdminDashboard user={user} activeTab={activeTab === 'command' ? 'overview' : activeTab} onTabChange={(page) => navigateDashboard(page, 'legacy_dashboard')} />}
                  {user.role === 'freelancer' && <FreelancerDashboard user={user} />}
                  {user.role === 'bep' && <BEPDashboard user={user} />}
                  {user.role === 'contractor' && <ContractorDashboard user={user} />}
                  {user.role === 'subcontractor' && <SubcontractorDashboard user={user} />}
                  {user.role === 'supplier' && <SupplierDashboard user={user} />}
                </>
              )}
            </Suspense>
          </motion.div>
        </ScrollArea>
      </main>
      <DemoBanner />
      <Toaster />
    </div>
    </DemoModeProvider>
  );
}

// Wrap the entire app tree so Dark_Theme (the redesign default) applies app-wide
// across both the unauthenticated Landing experience and the authenticated shell.
export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
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
    <div className="space-y-5 animate-pulse">
      <div className="h-44 rounded-[1.25rem] bg-[#dff1fa] beos-soft-shadow" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 h-96 rounded-[1.25rem] bg-white/75 border border-border" />
        <div className="h-96 rounded-[1.25rem] bg-[#edf7f3] border border-border" />
      </div>
    </div>
  );
}

function RoleLegacyFallbackPage({ activeTab, user, onNavigate }: { activeTab: string; user: UserProfile; onNavigate: (pageId: string) => void }) {
  const roleVisual = roleVisualFor(user.role);
  const isAudit = activeTab === 'audit';

  return (
    <div className="space-y-6" data-testid={`role-legacy-fallback-${activeTab}`}>
      <Card className="rounded-[1.5rem] border-border bg-card/95 beos-soft-shadow overflow-hidden" style={{ borderTop: `5px solid ${roleVisual.accent}` }}>
        <CardHeader className="bg-[#f4faff]/80 border-b border-border/70">
          <Badge variant="secondary" className="w-fit rounded-full beos-label-caps">{roleVisual.label}</Badge>
          <CardTitle className="font-sans text-3xl font-black tracking-[-0.045em] flex items-center gap-3">
            <span className="rounded-[0.95rem] bg-white text-primary p-3 shadow-[0_10px_24px_rgba(20,71,63,0.08)]">{isAudit ? <History size={18} /> : <Briefcase size={18} />}</span>
            {isAudit ? 'Audit trail entry points' : 'Active package projects'}
          </CardTitle>
          <CardDescription className="max-w-3xl text-base leading-relaxed">
            {isAudit
              ? 'Audit-sensitive supplier and subcontractor actions are kept inside the governed package, procurement, invoice, file, and command-centre records they belong to.'
              : 'Supplier and subcontractor project access is package-led. Use the live package/procurement workspace for visible tenders, commitments, RFIs, evidence, snags, and close-out readiness.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Button className="rounded-xl justify-start gap-2" onClick={() => onNavigate(user.role === 'supplier' ? 'procurement' : 'packages')}><Factory className="h-4 w-4" /> Open package workspace</Button>
          <Button variant="outline" className="rounded-xl justify-start gap-2" onClick={() => onNavigate('command')}><LayoutDashboard className="h-4 w-4" /> Command Centre</Button>
          <Button variant="outline" className="rounded-xl justify-start gap-2" onClick={() => onNavigate('files')}><Files className="h-4 w-4" /> Project files</Button>
        </CardContent>
      </Card>
    </div>
  );
}


function ProfileWorkspacePage({ user }: { user: UserProfile }) {
  const roleVisual = roleVisualFor(user.role);
  const roleLabel = user.role === 'bep' || user.role === 'architect' ? 'design team' : user.role;
  const profileSignals = [
    { label: 'Identity and account', detail: 'Email, password reset, notification preferences, and digital-signature status remain managed in account settings.' },
    { label: 'Matching profile', detail: 'Display name, bio, expertise, SACAP data, and portfolio media are edited through the production profile editor.' },
    { label: 'Governed reuse', detail: 'Profile data feeds directory search, proposals, contracts, invoices, procurement records, and verification workflows without role escalation.' },
  ];

  return (
    <div className="space-y-6" data-testid="profile-workspace-page">
      <Card className="rounded-[1.25rem] border-border bg-card/95 beos-soft-shadow overflow-hidden" style={{ borderTop: `5px solid ${roleVisual.accent}` }}>
        <CardHeader className="bg-[#f4faff]/80 border-b border-border/70">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <Badge variant="secondary" className="w-fit rounded-full beos-label-caps">Core workflow</Badge>
              <div>
                <CardTitle className="font-sans text-3xl font-black tracking-[-0.045em] flex items-center gap-3">
                  <span className="rounded-[0.95rem] bg-white text-primary p-3 shadow-[0_10px_24px_rgba(20,71,63,0.08)]"><UserCircle size={22} /></span>
                  Profile Editor
                </CardTitle>
                <CardDescription className="mt-3 max-w-3xl text-base leading-relaxed">
                  A dedicated production profile workspace for {roleLabel} users, aligning backend.html role workflows with the real UserSettings and ProfileEditor components.
                </CardDescription>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Badge className="capitalize shrink-0 rounded-full border-0 text-white" style={{ backgroundColor: roleVisual.accent }}>{roleLabel}</Badge>
              <ProfileEditor user={user} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          {profileSignals.map((signal) => (
            <div key={signal.label} className="rounded-[1.25rem] border border-border bg-background/70 p-5">
              <p className="font-sans text-sm font-black uppercase tracking-[0.16em] text-primary">{signal.label}</p>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{signal.detail}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <UserSettings user={user} />
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
  const roleVisual = roleVisualFor(user.role);
  const shellFocus = getDashboardShellFocus(pageId, roleLabel);
  const resourceLinks = resourcesForShell(pageId, user.role);

  return (
    <div className="space-y-6">
      <Card className="rounded-[1.25rem] border-border bg-card/95 beos-soft-shadow overflow-hidden" style={{ borderTop: `5px solid ${roleVisual.accent}` }}>
        <CardHeader className="bg-[#f4faff]/80 border-b border-border/70">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-3">
              <Badge variant="secondary" className="w-fit rounded-full beos-label-caps">{page.group}</Badge>
              <div>
                <CardTitle className="font-sans text-3xl font-black tracking-[-0.045em] flex items-center gap-3">
                  <span className="rounded-[0.95rem] bg-white text-primary p-3 shadow-[0_10px_24px_rgba(20,71,63,0.08)]">{page.icon}</span>
                  {page.label}
                </CardTitle>
                <CardDescription className="mt-3 max-w-3xl text-base leading-relaxed">{page.summary}</CardDescription>
              </div>
            </div>
            <Badge className="capitalize shrink-0 rounded-full border-0 text-white" style={{ backgroundColor: roleVisual.accent }}>{roleLabel}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 rounded-[1.25rem] border border-border bg-background/70 p-5 space-y-3">
            <h3 className="font-sans text-xl font-black tracking-[-0.03em]">Role-aware workflow shell</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              This page is now surfaced from the backend.html role/page matrix while preserving existing APIs.
              It gives {roleLabel} users a first-class navigation target backed by existing services, documents, and role permissions while new write workflows are added incrementally.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Unsafe payment, escrow, signature, provider, and approval decisions remain routed through dedicated workflows with human confirmation before anything is submitted.
            </p>
          </div>
          <div className="rounded-[1.25rem] border border-border bg-background/70 p-5 space-y-3">
            <h3 className="font-sans text-lg font-black tracking-[-0.03em]">Backed by</h3>
            <div className="flex flex-wrap gap-2">
              {page.backedBy.map((item) => <Badge key={item} variant="outline" className="rounded-full">{item}</Badge>)}
            </div>
          </div>
          {resourceLinks.length > 0 && (
            <div className="lg:col-span-3 rounded-[1.25rem] border border-primary/20 bg-primary/5 p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-sans text-lg font-black tracking-[-0.03em]">Relevant implementation resources</h3>
                  <p className="text-sm text-muted-foreground">Links to existing project documentation behind this shell, opened without new backend APIs.</p>
                </div>
                <Badge variant="outline" className="rounded-full">real docs</Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {resourceLinks.map((resource) => (
                  <a
                    key={resource.href}
                    href={resource.href}
                    target="_blank"
                    rel="noreferrer"
                    className="group rounded-[1rem] border border-border bg-background/80 p-4 transition-colors hover:border-primary/50 hover:bg-background"
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
            <Card key={item.title} className="rounded-[1.25rem] border-border bg-card/90 beos-soft-shadow">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <span className="rounded-[0.8rem] bg-primary/10 text-primary p-2">{item.icon}</span>
                  <CardTitle className="font-sans text-lg font-black tracking-[-0.03em]">{item.title}</CardTitle>
                </div>
                <CardDescription className="leading-relaxed">{item.description}</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-wrap gap-2">
                  {item.badges.map((badge) => <Badge key={badge} variant="secondary" className="rounded-full">{badge}</Badge>)}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {(pageId === 'payments' || pageId === 'invoicing') && <InvoiceManagement user={user} />}
      {(pageId === 'toolbox' || pageId === 'drawing-checker' || pageId === 'freelancer-submissions') && <FileManager user={user} />}
      {pageId === 'municipal-tracker' && <MunicipalTracker user={user} />}
      {pageId === 'submission-readiness' && <SubmissionReadinessDashboard user={user} />}
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
    <div className="relative flex min-h-dvh items-start justify-center overflow-y-auto bg-[#0F172A] px-4 py-6 text-white sm:items-center sm:py-8">
      <div className="absolute inset-0 opacity-20">
        <AnimatedFloorPlan />
      </div>
      <div className="relative z-10 w-full max-w-md pb-[max(env(safe-area-inset-bottom),0px)]">
        <div className="mb-5 text-center sm:mb-8">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl border border-white/20 bg-white/10 shadow-2xl sm:mb-5 sm:h-20 sm:w-20">
            <ShieldCheck className="h-8 w-8 text-primary sm:h-10 sm:w-10" />
          </div>
          <h1 className="mb-2 font-heading text-3xl font-bold sm:text-4xl">Admin Portal</h1>
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
              <a href="./">Return to Marketplace</a>
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
      className={`group flex min-h-[118px] gap-4 rounded-3xl border p-4 text-left shadow-sm transition-all duration-300 hover:shadow-xl sm:min-h-[176px] sm:flex-col sm:gap-5 sm:p-5 ${active ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : 'border-border bg-white hover:border-primary hover:bg-primary/5'}`}
      {...props}
    >
      <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl transition-all group-hover:scale-105 sm:h-14 sm:w-14 ${active ? 'bg-primary text-primary-foreground' : 'bg-secondary group-hover:bg-primary/10 group-hover:text-primary'}`}>
        {icon}
      </div>
      <div className="min-w-0 space-y-1.5 sm:space-y-2">
        <h3 className="font-heading text-xl font-bold sm:text-2xl">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
      </div>
      <div className="mt-auto hidden w-full border-t border-border/50 pt-3 sm:block">
        <span className="text-[10px] uppercase tracking-widest font-black text-primary flex items-center gap-2 group-hover:gap-4 transition-all">
          {active ? 'Selected' : 'Select Role'} <ArrowRight className="w-4 h-4" />
        </span>
      </div>
    </button>
  );
}

function NavSectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-3 pt-4 pb-1 beos-label-caps text-muted-foreground/80">{children}</div>;
}

function NavItem({ icon, label, active, onClick, collapsed, ...props }: any) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      title={collapsed ? label : undefined}
      className={`group w-full flex items-center gap-3 rounded-[1.05rem] px-3 py-2.5 text-left text-sm transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${collapsed ? 'md:justify-center md:gap-0 md:px-0' : ''} ${active ? 'bg-[#dff1fa] text-primary shadow-[0_12px_30px_rgba(20,71,63,0.10)]' : 'text-muted-foreground hover:bg-muted hover:text-primary'}`}
      {...props}
    >
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-[0.7rem] border transition-all ${active ? 'border-primary/15 bg-white text-primary' : 'border-transparent bg-white/70 text-muted-foreground group-hover:border-primary/15 group-hover:text-primary'}`}>{icon}</span>
      <span className={`min-w-0 flex-1 truncate font-bold tracking-[0.01em] ${collapsed ? 'md:hidden' : ''}`}>{label}</span>
      {active && <span aria-hidden="true" className={`h-2 w-2 rounded-full bg-primary ${collapsed ? 'md:hidden' : ''}`} />}
    </button>
  );
}

/** Icon resolver for architex navigation config keys */
function navKeyIcon(key: ArchitexNavKey, size = 18) {
  switch (key) {
    case 'command_centre': return <LayoutDashboard size={size} />;
    case 'inbox': return <ClipboardCheck size={size} />;
    case 'projects': return <FileText size={size} />;
    case 'toolboxes': return <Files size={size} />;
    case 'cpd_learning': return <BookOpen size={size} />;
    case 'documents': return <Database size={size} />;
    case 'marketplace': return <Search size={size} />;
    case 'finance': return <CreditCard size={size} />;
    case 'messages': return <Mail size={size} />;
    case 'settings': return <Settings2 size={size} />;
  }
}

function LandingPage({ onGetStarted, onLogin }: { onGetStarted: () => void; onLogin: () => void }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [landingTab, setLandingTab] = useState<'home' | 'resources'>('home');
  const [activationTriggered, setActivationTriggered] = useState(false);
  const [transitionComplete, setTransitionComplete] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  const goToTab = (tab: 'home' | 'resources') => {
    setLandingTab(tab);
    setIsMobileMenuOpen(false);
  };

  const activateSequence = useCallback(() => {
    if (activationTriggered) return;
    setActivationTriggered(true);
  }, [activationTriggered]);

  const handleTransitionComplete = useCallback(() => {
    setTransitionComplete(true);
    // Show login after animation
    onLogin?.();
  }, [onLogin]);

  const navItems = [
    { label: 'Signal', tab: 'home' as const },
    { label: 'Resources', tab: 'resources' as const },
  ];

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#04302c] text-[#F8FAFC] selection:bg-[#0f6b62] selection:text-[#04302c]">
      {/* ── BIRD FLOCKS OVERLAY (full-page takeover on activation) ── */}
      {activationTriggered && (
        <BirdFlocks onTransitionComplete={handleTransitionComplete} />
      )}

      <div aria-hidden="true" className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(15,107,98,0.22),transparent_28%),radial-gradient(circle_at_82%_8%,rgba(120,166,154,0.18),transparent_25%),linear-gradient(180deg,#04302c_0%,#0f6b62_58%,#04302c_100%)]" />
        <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(rgba(247,242,232,0.55)_1px,transparent_1px),linear-gradient(90deg,rgba(247,242,232,0.55)_1px,transparent_1px)] bg-[size:44px_44px]" />
      </div>

      <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#04302c]/80 px-4 py-4 backdrop-blur-2xl sm:px-8 lg:px-16">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <button onClick={() => goToTab('home')} className="group flex items-center gap-3 text-left" aria-label="Architex home">
            <Logo iconClassName="h-16 w-16 object-contain text-[#0f6b62] sm:h-[4.5rem] sm:w-[4.5rem]" textClassName="hidden" />
            <div>
              <p className="font-heading text-xl font-black tracking-[-0.04em] text-[#F8FAFC]">Architex</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-[#F8FAFC]/45">built environment OS</p>
            </div>
          </button>

          <div className="hidden items-center gap-2 lg:flex">
            {navItems.map((item) => (
              <button
                key={item.label}
                onClick={() => goToTab(item.tab)}
                className={`rounded-full px-5 py-2 text-sm font-bold transition-colors ${landingTab === item.tab ? 'bg-[#F8FAFC] text-[#04302c]' : 'text-[#F8FAFC]/70 hover:bg-white/10 hover:text-[#F8FAFC]'}`}
              >
                {item.label}
              </button>
            ))}
            <button onClick={onLogin} className="rounded-full px-5 py-2 text-sm font-bold text-[#F8FAFC]/70 transition-colors hover:bg-white/10 hover:text-[#F8FAFC]">Login</button>
            <Button onClick={onGetStarted} className="ml-2 rounded-full bg-[#F8FAFC] px-6 font-black text-[#04302c] shadow-[0_0_30px_rgba(248,250,252,0.22)] hover:bg-white">
              Join the network <span className="sr-only">Get Started</span>
            </Button>
          </div>

          <Button variant="ghost" size="icon" className="text-[#F8FAFC] hover:bg-white/10 hover:text-[#F8FAFC] lg:hidden" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} aria-label="Toggle navigation menu" aria-expanded={isMobileMenuOpen}>
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </Button>
        </div>
        {isMobileMenuOpen && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mx-auto mt-4 flex max-w-7xl flex-col gap-3 rounded-[2rem] border border-white/10 bg-[#04302c]/95 p-4 shadow-2xl lg:hidden">
            {navItems.map((item) => <button key={item.label} onClick={() => goToTab(item.tab)} className="rounded-2xl px-4 py-3 text-left font-bold hover:bg-white/10">{item.label}</button>)}
            <button onClick={() => { onLogin(); setIsMobileMenuOpen(false); }} className="rounded-2xl px-4 py-3 text-left font-bold hover:bg-white/10">Login</button>
            <Button onClick={() => { onGetStarted(); setIsMobileMenuOpen(false); }} className="h-12 rounded-2xl bg-[#F8FAFC] font-black text-[#04302c] hover:bg-white">Join the network <span className="sr-only">Get Started</span></Button>
          </motion.div>
        )}
      </nav>

      <AnimatePresence mode="wait">
        {landingTab === 'resources' ? (
          <motion.div key="resources" initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -18 }} transition={{ duration: 0.35 }}>
            <ResourcesLanding onGetStarted={onGetStarted} />
          </motion.div>
        ) : (
          <motion.main key="home" initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -18 }} transition={{ duration: 0.35 }} className="relative z-10">
            <section className="px-4 pb-12 pt-8 sm:px-8 sm:pb-20 sm:pt-14 lg:px-16">
              <div className="mx-auto grid max-w-7xl items-center gap-12 lg:min-h-[calc(100vh-96px)] lg:grid-cols-[1.04fr_0.96fr]">
                {/* Hero Text Column */}
                <motion.div
                  className={activationTriggered ? 'opacity-0 transition-opacity duration-700' : ''}
                >
                  <motion.div initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mb-8 inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-black uppercase tracking-[0.22em] text-[#F8FAFC]/70 backdrop-blur">
                    <span className="h-2 w-2 rounded-full bg-[#0f6b62] shadow-[0_0_18px_#0f6b62]" />
                    South Africa's project coordination layer
                  </motion.div>
                  <p className="mb-4 text-sm font-black uppercase tracking-[0.22em] text-[#F8FAFC]/55">Smarter projects. Stronger built environments.</p>
                  <motion.h1 initial={prefersReducedMotion ? false : { opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.75, delay: 0.08 }} className="font-heading text-4xl font-black leading-[0.92] tracking-[-0.075em] text-[#F8FAFC] min-[420px]:text-5xl sm:text-7xl lg:text-[7.6rem]">
                    Where projects stop leaking time.
                  </motion.h1>
                  <motion.p initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65, delay: 0.22 }} className="mt-6 max-w-2xl text-base font-medium leading-relaxed text-[#F8FAFC]/68 sm:mt-8 sm:text-xl">
                    Architex turns the messy path from brief, team selection, compliance, tenders, site evidence, municipal tracking, payments, and close-out into one governed workspace for clients, architects, BEPs, contractors, suppliers, subcontractors, and freelancers.
                  </motion.p>
                  <motion.div initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65, delay: 0.34 }} className="mt-10 flex flex-col gap-3 sm:flex-row">
                    <Button onClick={() => { if (!activationTriggered) activateSequence(); else onGetStarted(); }} size="lg" className="h-14 rounded-full bg-[#F8FAFC] px-8 text-base font-black text-[#04302c] shadow-[0_22px_70px_rgba(248,250,252,0.24)] hover:bg-white">
                      {activationTriggered ? 'Enter workspace' : 'Request Access'} <span className="sr-only">{activationTriggered ? 'Enter' : 'Request'}</span><ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                    <Button onClick={onLogin} size="lg" variant="outline" className="h-14 rounded-full border-white/15 bg-white/5 px-8 text-base font-black text-[#F8FAFC] hover:bg-[#F8FAFC] hover:text-[#04302c]">
                      Enter workspace
                    </Button>
                  </motion.div>
                  <div className="mt-8 grid max-w-2xl grid-cols-1 gap-3 min-[420px]:grid-cols-3 sm:mt-10">
                    {[
                      ['7 roles', 'one project truth'],
                      ['AI + audit', 'human sign-off'],
                      ['SA ready', 'SACAP & SANS aware'],
                    ].map(([value, label], index) => <SignalMetric key={value} value={value} label={label} index={index} />)}
                  </div>
                </motion.div>
              </div>
            </section>

            {/* Sections below hero — hidden during transition */}
            <motion.div
              animate={{
                opacity: activationTriggered ? 0 : 1,
                height: activationTriggered ? 0 : 'auto',
                overflow: 'hidden',
              }}
              transition={{ duration: 0.5, ease: [0.25, 0.4, 0.25, 1] }}
            >
              <ProfessionOrbit onGetStarted={onGetStarted} />
              <ProcessRail />
              <section className="bg-[#04302c] px-4 py-16 text-[#F8FAFC] sm:px-8 lg:px-16">
              <div className="mx-auto max-w-7xl rounded-[2.4rem] border border-white/10 bg-white/[0.04] p-8 shadow-2xl backdrop-blur md:p-12">
                <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div>
                    <p className="mb-4 text-xs font-black uppercase tracking-[0.28em] text-[#0f6b62]">No more fragmented delivery</p>
                    <h2 className="font-heading text-4xl font-black tracking-[-0.06em] sm:text-6xl">A workspace that remembers every promise.</h2>
                    <p className="mt-5 max-w-3xl text-lg leading-relaxed text-[#F8FAFC]/65">Every drawing check, appointment, package, site record, invoice, municipal submission, and AI recommendation is designed to sit beside its evidence and approval trail.</p>
                  </div>
                  <Button onClick={onGetStarted} className="h-14 rounded-full bg-[#F8FAFC] px-8 font-black text-[#04302c] hover:bg-white">Start with your role</Button>
                </div>
              </div>
            </section>
            </motion.div>
          </motion.main>
        )}
      </AnimatePresence>

      <footer className="relative z-10 border-t border-[#04302c]/10 bg-[#F8FAFC] px-4 py-10 text-[#04302c] sm:px-8 lg:px-16">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 text-center md:flex-row md:items-center md:justify-between md:text-left">
          <Logo showText iconClassName="h-16 w-16 object-contain text-[#04302c] sm:h-[4.5rem] sm:w-[4.5rem]" textClassName="font-heading text-2xl font-black tracking-[-0.04em]" />
          <p className="text-sm font-medium text-[#04302c]/60">© 2026 Architex. Minimal interface, governed project intelligence.</p>
        </div>
      </footer>
    </div>
  );
}

function SignalMetric({ value, label, index }: React.PropsWithChildren<{ value: string; label: string; index: number }>) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.45 + index * 0.08 }}
      className="rounded-3xl border border-white/10 bg-white/[0.045] p-4 backdrop-blur"
    >
      <p className="font-heading text-2xl font-black tracking-[-0.04em] text-[#F8FAFC]">{value}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-[0.14em] text-[#F8FAFC]/45">{label}</p>
    </motion.div>
  );
}

function ProjectSignal({ prefersReducedMotion }: { prefersReducedMotion: boolean }) {
  const nodes = [
    { label: 'Brief', x: '12%', y: '24%', icon: <FileText size={18} /> },
    { label: 'Team', x: '72%', y: '14%', icon: <Users size={18} /> },
    { label: 'SANS', x: '80%', y: '56%', icon: <ShieldCheck size={18} /> },
    { label: 'Site', x: '18%', y: '70%', icon: <Hammer size={18} /> },
    { label: 'AI', x: '48%', y: '42%', icon: <Bot size={18} /> },
  ];

  return (
    <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, delay: 0.18 }} className="relative mx-auto h-[24rem] w-full max-w-[34rem] sm:h-[30rem] lg:h-[34rem]">
      <div className="absolute inset-0 rounded-[3rem] border border-white/10 bg-[#F8FAFC]/[0.035] shadow-[0_40px_120px_rgba(0,0,0,0.35)] backdrop-blur-xl" />
      <div className="absolute inset-5 rounded-[2.4rem] border border-[#0f6b62]/20 bg-[radial-gradient(circle_at_center,rgba(15,107,98,0.14),transparent_55%)]" />
      <svg className="absolute inset-0 h-full w-full" aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path d="M18 28 C38 12 58 14 74 18" stroke="rgba(247,242,232,0.20)" strokeWidth="0.35" fill="none" />
        <path d="M75 20 C86 34 85 48 82 58" stroke="rgba(247,242,232,0.20)" strokeWidth="0.35" fill="none" />
        <path d="M80 60 C60 76 40 80 20 72" stroke="rgba(247,242,232,0.20)" strokeWidth="0.35" fill="none" />
        <path d="M18 70 C8 50 8 38 16 26" stroke="rgba(247,242,232,0.20)" strokeWidth="0.35" fill="none" />
        {!prefersReducedMotion && <motion.circle r="1.2" fill="#0f6b62" initial={{ offsetDistance: '0%' }} animate={{ offsetDistance: '100%' }} transition={{ duration: 8, repeat: Infinity, ease: 'linear' }} style={{ offsetPath: 'path("M18 28 C38 12 58 14 74 18 C86 34 85 48 82 58 C60 76 40 80 20 72 C8 50 8 38 16 26")' }} />}
      </svg>
      {nodes.map((node, index) => <SignalNode key={node.label} {...node} index={index} prefersReducedMotion={prefersReducedMotion} />)}
      <div className="absolute left-1/2 top-1/2 w-44 -translate-x-1/2 -translate-y-1/2 rounded-[1.5rem] border border-white/10 bg-[#04302c]/80 p-4 text-center shadow-2xl backdrop-blur sm:w-52 sm:rounded-[2rem] sm:p-5">
        <Workflow className="mx-auto mb-3 h-8 w-8 text-[#0f6b62]" />
        <p className="font-heading text-2xl font-black tracking-[-0.05em]">Project signal</p>
        <p className="mt-2 text-xs font-medium leading-relaxed text-[#F8FAFC]/55">Live roles, evidence, AI checks, approvals, and next actions moving as one.</p>
      </div>
    </motion.div>
  );
}

function SignalNode({ label, x, y, icon, index, prefersReducedMotion }: React.PropsWithChildren<{ label: string; x: string; y: string; icon: React.ReactNode; index: number; prefersReducedMotion: boolean }>) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.75 }}
      animate={prefersReducedMotion ? { opacity: 1, scale: 1 } : { opacity: 1, scale: [1, 1.06, 1] }}
      transition={{ duration: prefersReducedMotion ? 0.4 : 3.2, repeat: prefersReducedMotion ? 0 : Infinity, delay: index * 0.18 }}
      className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full border border-white/10 bg-[#F8FAFC] px-3 py-2 text-[#04302c] shadow-xl"
      style={{ left: x, top: y }}
    >
      <span className="rounded-full bg-[#04302c] p-2 text-[#0f6b62]">{icon}</span>
      <span className="text-xs font-black uppercase tracking-[0.18em]">{label}</span>
    </motion.div>
  );
}

function ProfessionOrbit({ onGetStarted }: { onGetStarted: () => void }) {
  const professions = [
    { title: 'Clients', copy: 'Post a guided brief, compare verified proposals, and see the project without technical fog.', icon: <Users size={22} /> },
    { title: 'Architects & BEPs', copy: 'Turn opportunity, design responsibility, compliance, teams, and evidence into one command centre.', icon: <Building2 size={22} /> },
    { title: 'Contractors', copy: 'Tender packages, site logs, staff, plant, RFIs, snags, and payment evidence stay connected.', icon: <Construction size={22} /> },
    { title: 'Freelancers', copy: 'Receive delegated work, submit deliverables, and build a traceable professional record.', icon: <Sparkles size={22} /> },
    { title: 'Suppliers', copy: 'Connect products, deliveries, warranties, and procurement commitments to real project demand.', icon: <Factory size={22} /> },
    { title: 'Subcontractors', copy: 'Manage trade packages, close-out proof, and on-site accountability in the same workspace.', icon: <Hammer size={22} /> },
  ];

  return (
    <section className="bg-[#F8FAFC] px-4 py-16 text-[#04302c] sm:px-8 lg:px-16">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-3 text-xs font-black uppercase tracking-[0.28em] text-[#0f6b62]">Who feels the difference</p>
            <h2 className="font-heading text-4xl font-black tracking-[-0.06em] sm:text-6xl">Every profession gets a reason to stay.</h2>
          </div>
          <Button onClick={onGetStarted} variant="outline" className="rounded-full border-[#04302c]/20 bg-transparent font-black hover:bg-[#04302c] hover:text-[#F8FAFC]">Find my role <ArrowRight className="ml-2 h-4 w-4" /></Button>
        </div>
        <div className="mb-6 rounded-[2.5rem] border border-[#04302c]/10 bg-[#04302c] p-6 text-[#F8FAFC] shadow-[0_30px_100px_rgba(4,48,44,0.18)] sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-[#7cd7c3]">Hallmark behaviour</p>
          <h3 className="mt-4 max-w-4xl font-heading text-4xl font-black tracking-[-0.06em] sm:text-5xl">The bird is not a mascot. It is the operating symbol.</h3>
          <p className="mt-5 max-w-4xl text-base font-medium leading-relaxed text-[#F8FAFC]/64">On the homepage it behaves like a living project compass: roles form around it, unresolved gates stay visible, and the next action is always pulled back to one verified project truth.</p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[["Roles", "orbit the project"], ["Gates", "protect sign-off"], ["Evidence", "feeds every claim"]].map(([value, label]) => (
              <div key={value} className="rounded-3xl border border-white/10 bg-white/[0.055] p-4">
                <p className="font-heading text-2xl font-black tracking-[-0.04em]">{value}</p>
                <p className="mt-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#F8FAFC]/45">{label}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {professions.map((profession, index) => <ProfessionCard key={profession.title} profession={profession} index={index} />)}
        </div>
      </div>
    </section>
  );
}

function ProfessionCard({ profession, index }: React.PropsWithChildren<{ profession: { title: string; copy: string; icon: React.ReactNode }; index: number }>) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.05 }}
      viewport={{ once: true, margin: '-80px' }}
      className="group relative overflow-hidden rounded-[2rem] border border-[#04302c]/10 bg-white/55 p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-[#0f6b62]/50 hover:shadow-2xl"
    >
      <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-[#0f6b62]/10 transition-transform group-hover:scale-150" />
      <div className="relative z-10 mb-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#04302c] text-[#0f6b62] shadow-lg">{profession.icon}</div>
      <h3 className="relative z-10 font-heading text-2xl font-black tracking-[-0.04em]">{profession.title}</h3>
      <p className="relative z-10 mt-3 text-sm font-medium leading-relaxed text-[#04302c]/62">{profession.copy}</p>
    </motion.article>
  );
}

function ProcessRail() {
  const steps = [
    ['Discover', 'A client story becomes structured scope, budget, files, and intent.'],
    ['Verify', 'Credentials, compliance, AI checks, and human approvals stay visible before commitment.'],
    ['Collaborate', 'Verified professionals, contractors, suppliers, and freelancers form the delivery network.'],
    ['Deliver', 'Programme, RFIs, site logs, packages, payments, snags, and close-out stay traceable.'],
  ];

  return (
    <section className="bg-[#F8FAFC] px-4 pb-16 text-[#04302c] sm:px-8 lg:px-16">
      <div className="mx-auto max-w-7xl rounded-[2.5rem] bg-[#04302c] p-6 text-[#F8FAFC] sm:p-8 lg:p-10">
        <div className="mb-8 max-w-4xl">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-[#0f6b62]">The line of control</p>
          <h2 className="mt-2 font-heading text-3xl font-black tracking-[-0.055em] sm:text-5xl">From first idea to accountable handover.</h2>
          <p className="mt-4 text-sm font-medium leading-relaxed text-[#F8FAFC]/56">Architex prevents the next phase from moving until role, evidence, approval, funding, and compliance are aligned.</p>
        </div>
        <div className="grid gap-3 lg:grid-cols-4">
          {steps.map(([title, copy], index) => (
            <motion.div key={title} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.08 }} viewport={{ once: true }} className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
              <span className="font-mono text-xs font-black text-[#0f6b62]">0{index + 1}</span>
              <h3 className="mt-8 font-heading text-2xl font-black">{title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-[#F8FAFC]/58">{copy}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}


function ResourcesLanding({ onGetStarted }: { onGetStarted: () => void }) {
  const resources = [
    { title: 'SANS 10400 Readiness Guide', copy: 'Understand the checks Architex AI performs across walls, fire, fenestration, area sizing, and documentation.', icon: <BookOpen size={24} />, tag: 'Compliance' },
    { title: 'Client Briefing Template', copy: 'Prepare scope, site details, inspiration, budget, and timeline before posting your project.', icon: <FileText size={24} />, tag: 'Clients' },
    { title: 'AI Review Checklist', copy: 'A practical list for title blocks, north points, scale bars, room schedules, and municipal submission basics.', icon: <ClipboardCheck size={24} />, tag: 'AI Automation' },
    { title: 'Professional Onboarding', copy: 'Guidance for architects and freelancers setting up verified professional profiles.', icon: <Users size={24} />, tag: 'Professionals' },
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
              <Button onClick={onGetStarted} size="lg" className="w-full sm:w-auto h-14 px-8 rounded-full bg-primary text-primary-foreground font-bold">Enter workspace <ArrowRight className="ml-2 h-4 w-4" /></Button>
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
