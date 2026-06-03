import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appSource = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
const navConfigSource = readFileSync(resolve(process.cwd(), 'src/navigation/architexNavigationConfig.ts'), 'utf8');
const onboardingSource = readFileSync(resolve(process.cwd(), 'src/components/OnboardingFlow.tsx'), 'utf8');
const backendSource = readFileSync(resolve(process.cwd(), 'backend.html'), 'utf8');
const workflowSource = readFileSync(resolve(process.cwd(), 'src/components/ProjectWorkflowPage.tsx'), 'utf8');
const commandCentreSource = readFileSync(resolve(process.cwd(), 'src/components/ProjectCommandCentre.tsx'), 'utf8');
const commandCentreServiceSource = readFileSync(resolve(process.cwd(), 'src/services/projectCommandCentreService.ts'), 'utf8');
const designComplianceSource = readFileSync(resolve(process.cwd(), 'src/components/DesignCompliancePage.tsx'), 'utf8');
const bepMarketplaceSource = readFileSync(resolve(process.cwd(), 'src/components/BEPClientMarketplacePage.tsx'), 'utf8');
const designTeamMatrixSource = readFileSync(resolve(process.cwd(), 'src/components/DesignTeamMatrixPage.tsx'), 'utf8');
const tasksApprovalsSource = readFileSync(resolve(process.cwd(), 'src/components/TasksApprovalsPage.tsx'), 'utf8');
const projectMessengerSource = readFileSync(resolve(process.cwd(), 'src/components/ProjectMessengerPage.tsx'), 'utf8');
const messagingServiceSource = readFileSync(resolve(process.cwd(), 'src/services/messagingService.ts'), 'utf8');
const contractSigningSource = readFileSync(resolve(process.cwd(), 'src/components/ContractSigningPage.tsx'), 'utf8');
const financialDashboardSource = readFileSync(resolve(process.cwd(), 'src/components/FinancialDashboard.tsx'), 'utf8');
const disputeResolutionSource = readFileSync(resolve(process.cwd(), 'src/components/DisputeResolutionPage.tsx'), 'utf8');
const packageWorkspaceSource = readFileSync(resolve(process.cwd(), 'src/components/PackageProcurementWorkspace.tsx'), 'utf8');
const projectToolboxSource = readFileSync(resolve(process.cwd(), 'src/components/ProjectToolboxPage.tsx'), 'utf8');
const externalApiMockSource = readFileSync(resolve(process.cwd(), 'src/data/mockExternalApiIntegrations.ts'), 'utf8');
const packageConstructionSource = readFileSync(resolve(process.cwd(), 'src/components/PackageConstructionOpsPage.tsx'), 'utf8');
const packageCloseoutSource = readFileSync(resolve(process.cwd(), 'src/components/PackageCloseoutPage.tsx'), 'utf8');
const ganttChartSource = readFileSync(resolve(process.cwd(), 'src/components/GanttChart.tsx'), 'utf8');
const aiCoPilotSource = readFileSync(resolve(process.cwd(), 'src/components/AICoPilotPage.tsx'), 'utf8');
const adminAIReviewQueueSource = readFileSync(resolve(process.cwd(), 'src/components/AdminAIReviewQueue.tsx'), 'utf8');
const adminDashboardSource = readFileSync(resolve(process.cwd(), 'src/components/AdminDashboard.tsx'), 'utf8');
const adminGovernanceConsoleSource = readFileSync(resolve(process.cwd(), 'src/components/AdminGovernanceConsolePage.tsx'), 'utf8');
const bidSubmissionSource = readFileSync(resolve(process.cwd(), 'src/components/BidSubmission.tsx'), 'utf8');
const bepFreelancerJobsSource = readFileSync(resolve(process.cwd(), 'src/components/BEPFreelancerJobsPage.tsx'), 'utf8');
const freelancerSubmissionsSource = readFileSync(resolve(process.cwd(), 'src/components/FreelancerSubmissionsPage.tsx'), 'utf8');
const drawingChecklistServiceSource = readFileSync(resolve(process.cwd(), 'src/services/drawingChecklistService.ts'), 'utf8');
const drawingRegisterSource = readFileSync(resolve(process.cwd(), 'src/components/DrawingRegisterPage.tsx'), 'utf8');
const coordinationRegisterServiceSource = readFileSync(resolve(process.cwd(), 'src/services/coordinationRegisterService.ts'), 'utf8');
const registryMatch = appSource.match(/const CANONICAL_DASHBOARD_PAGES: DashboardPage\[\] = \[([\s\S]*?)\n\];/);
const registrySource = registryMatch?.[1] ?? '';
const resourceLinksMatch = appSource.match(/const DASHBOARD_RESOURCE_LINKS: Record<string, DashboardResourceLink\[]> = \{([\s\S]*?)\n\};/);
const resourceLinksSource = resourceLinksMatch?.[1] ?? '';

const canonicalRoles = ['client', 'bep', 'architect', 'contractor', 'subcontractor', 'supplier', 'freelancer', 'admin'];
const designTeamRoles = ['bep', 'architect'];

const findPageEntry = (id: string) => {
  const entry = registrySource
    .split('\n')
    .find((line) => line.includes(`{ id: '${id}',`));
  expect(entry, `Expected dashboard registry entry for ${id}`).toBeTruthy();
  return entry ?? '';
};

const entryIncludesRole = (entry: string, role: string) => {
  return entry.includes(`'${role}'`) || (designTeamRoles.includes(role) && entry.includes('DESIGN_TEAM_ROLES'));
};

const expectPage = (id: string, label: string, roles: string[]) => {
  const entry = findPageEntry(id);

  expect(entry).toContain(`label: '${label}'`);
  for (const role of roles) {
    expect(entryIncludesRole(entry, role), `Expected ${id} to include role ${role}`).toBe(true);
  }
};

const extractPageIds = () => [...registrySource.matchAll(/id: '([^']+)'/g)].map((match) => match[1]);
const extractResourceLinkPageIds = () => [...resourceLinksSource.matchAll(/^\s{2}'?([a-z0-9-]+)'?: \[/gm)].map((match) => match[1]);
const extractResourceHrefs = () => [...resourceLinksSource.matchAll(/href: '([^']+)'/g)].map((match) => match[1]);

describe('canonical dashboard page registry', () => {
  it('keeps backend.html shared workflow pages exposed for every canonical role', () => {
    expect(registryMatch, 'CANONICAL_DASHBOARD_PAGES should remain statically discoverable').toBeTruthy();

    const sharedPages = [
      ['command', 'Command Centre'],
      ['profile', 'Profile Editor'],
      ['toolbox', 'Project Toolbox'],
      ['journey', 'Project Journey'],
      ['tasks', 'Tasks & Approvals'],
      ['messages', 'Project Messenger'],
      ['programme', 'Programme / Gantt'],
      ['disputes', 'Dispute Resolution'],
      ['payments', 'Payments & Governance'],
      ['contracts', 'Contracts & Signing'],
      ['escrow', 'Escrow Service'],
      ['ai', 'AI Co-Pilot'],
    ] as const;

    for (const [id, label] of sharedPages) {
      expectPage(id, label, canonicalRoles);
    }
  });

  it('keeps role-specific canonical dashboard pages labelled and role-gated', () => {
    expectPage('client-intake', 'Guided Brief Wizard', ['client']);
    expectPage('client-proposals', 'BEP Proposals', ['client']);
    expectPage('directory-search', 'Directory Search', ['client', 'bep', 'architect', 'contractor']);
    expectPage('municipal-tracker', 'Municipal Status', ['client', 'bep', 'architect', 'contractor']);
    expectPage('design', 'Design & Compliance', ['bep', 'architect', 'freelancer', 'admin']);
    expectPage('drawing-checker', 'AI Drawing Checker', ['bep', 'architect', 'freelancer']);
    expectPage('procurement', 'BoQ / BoM Procurement', ['bep', 'architect', 'contractor', 'subcontractor', 'supplier', 'admin']);
    expectPage('bep-marketplace', 'Client Marketplace', ['bep', 'architect']);
    expectPage('bep-team', 'Design Team Matrix', ['bep', 'architect']);
    expectPage('invoicing', 'Invoicing', ['bep', 'architect', 'contractor', 'freelancer', 'admin']);
    expectPage('snagging', 'Snagging / Close-Out', ['bep', 'architect', 'contractor', 'subcontractor', 'supplier', 'admin']);
    expectPage('construction', 'Construction OS', ['contractor', 'subcontractor', 'supplier', 'admin']);
    expectPage('packages', 'Subcontractor Packages', ['contractor', 'subcontractor', 'supplier', 'admin']);
    expectPage('freelancer-work', 'Assigned Work', ['freelancer']);
    expectPage('knowledge', 'Knowledge / CPD', ['bep', 'architect', 'contractor', 'subcontractor', 'supplier', 'freelancer', 'admin']);
    expectPage('admin-console', 'Admin Console', ['admin']);
  });
  it('maps direct login and admin login routes to the correct auth entry state', () => {
    expect(appSource).toContain("isAdminAuthRoute(window.location.pathname)");
    expect(appSource).toContain("isPublicLoginRoute(window.location.pathname)");
    expect(appSource).toContain("isPublicSignupRoute(window.location.pathname)");
    expect(appSource).toContain("isAdminRoute || isLoginRoute || isSignupRoute");
    expect(appSource).toContain("isSignupRoute ? 'email-signup'");
    expect(appSource).toContain("/admin/login");
    expect(appSource).toContain("/login");
    expect(appSource).toContain("/signup");
  });

  it('keeps non-admin login options explicit while architects enter through BEP / Design Team', () => {
    for (const role of ['client', 'freelancer', 'bep', 'contractor', 'subcontractor', 'supplier']) {
      expect(appSource).toContain(`data-testid="role-select-${role}"`);
      expect(onboardingSource).toContain(`data-testid="role-select-${role}"`);
    }

    expect(appSource).not.toContain('data-testid="role-select-architect"');
    expect(onboardingSource).not.toContain('data-testid="role-select-architect"');
    expect(onboardingSource).not.toContain("role === 'architect' && renderArchitectOnboarding()");
    expect(appSource).toContain('Architects, engineers, QSs, technologists, and design-team leads');
    expect(onboardingSource).toContain('Architects, engineers, QSs, technologists, and design-team leads');
    expect(onboardingSource).toContain("role === 'subcontractor' || role === 'supplier'");
    expect(appSource).toContain('Authorized Architex administrators only');
  });


  it('pins the full role navigation matrix for every canonical role and page', () => {
    const sharedPageIds = ['command', 'profile', 'toolbox', 'journey', 'tasks', 'messages', 'programme', 'disputes', 'payments', 'contracts', 'escrow', 'ai'];
    const expectedPagesByRole: Record<string, string[]> = {
      client: [...sharedPageIds, 'client-intake', 'client-proposals', 'directory-search', 'municipal-tracker', 'client-progress', 'drawing-register'],
      bep: [...sharedPageIds, 'invoicing', 'directory-search', 'municipal-tracker', 'design', 'drawing-register', 'drawing-checker', 'sans-forms', 'technical-brief', 'bep-marketplace', 'bep-team', 'bep-freelancers', 'snagging', 'procurement', 'knowledge', 'resource-sharing', 'resource-centre', 'cpd-assessment'],
      architect: [...sharedPageIds, 'invoicing', 'directory-search', 'municipal-tracker', 'design', 'drawing-register', 'drawing-checker', 'sans-forms', 'technical-brief', 'bep-marketplace', 'bep-team', 'bep-freelancers', 'snagging', 'procurement', 'knowledge', 'resource-sharing', 'resource-centre', 'cpd-assessment'],
      contractor: [...sharedPageIds, 'invoicing', 'directory-search', 'municipal-tracker', 'snagging', 'construction', 'contractor-staff', 'procurement', 'packages', 'knowledge'],
      subcontractor: [...sharedPageIds, 'snagging', 'construction', 'procurement', 'packages', 'knowledge'],
      supplier: [...sharedPageIds, 'snagging', 'construction', 'procurement', 'packages', 'knowledge'],
      freelancer: [...sharedPageIds, 'invoicing', 'design', 'drawing-checker', 'freelancer-work', 'freelancer-submissions', 'knowledge', 'resource-sharing', 'resource-centre'],
      admin: [...sharedPageIds, 'invoicing', 'design', 'drawing-register', 'sans-forms', 'technical-brief', 'snagging', 'construction', 'procurement', 'packages', 'knowledge', 'admin-console'],
    };

    const allPageIds = extractPageIds();
    expect(allPageIds).toHaveLength(38);

    for (const role of canonicalRoles) {
      const actualPagesForRole = allPageIds.filter((pageId) => entryIncludesRole(findPageEntry(pageId), role));
      expect(actualPagesForRole, `Unexpected dashboard navigation matrix for ${role}`).toHaveLength(expectedPagesByRole[role].length);
      expect(actualPagesForRole, `Unexpected dashboard navigation matrix for ${role}`).toEqual(expect.arrayContaining(expectedPagesByRole[role]));
    }
  });

  it('keeps package procurement commitment and evidence options role-specific for suppliers and subcontractors', () => {
    expect(packageWorkspaceSource).toContain('const ROLE_COMMITMENT_TYPES: Partial<Record<UserProfile[\'role\'], CommitmentType[]>>');
    expect(packageWorkspaceSource).toContain("supplier: ['supplier_quote', 'delivery_note', 'payment_claim']");
    expect(packageWorkspaceSource).toContain("subcontractor: ['subcontract_order', 'payment_claim']");
    expect(packageWorkspaceSource).toContain('const ROLE_DEFAULT_COMMITMENT_TYPE: Partial<Record<UserProfile[\'role\'], CommitmentType>>');
    expect(packageWorkspaceSource).toContain("supplier: 'supplier_quote'");
    expect(packageWorkspaceSource).toContain("subcontractor: 'subcontract_order'");
    expect(packageWorkspaceSource).toContain('const roleCommitmentTypes = useMemo(() => allowedCommitmentTypesForRole(user.role), [user.role]);');
    expect(packageWorkspaceSource).toContain('setDraftType(defaultCommitmentTypeForRole(user.role));');
    expect(packageWorkspaceSource).toContain('if (!roleCommitmentTypes.includes(draftType)) return;');
    expect(packageWorkspaceSource).toContain("{roleCommitmentTypes.map((type) => <option key={type} value={type}>{type.replaceAll('_', ' ')}</option>)}");

    const globalOptionMatch = packageWorkspaceSource.match(/<select value=\{draftType\}[\s\S]*?<\/select>/);
    expect(globalOptionMatch?.[0] ?? '').not.toContain('COMMITMENT_TYPES.map');
  });

  it('keeps package procurement evidence prompts aligned to supplier delivery and subcontractor package workflows', () => {
    expect(packageWorkspaceSource).toContain('const ROLE_EVIDENCE_TYPES: Partial<Record<UserProfile[\'role\'], DeliveryEvidenceType[]>>');
    expect(packageWorkspaceSource).toContain("supplier: ['delivery_note', 'supplier_quote', 'warranty', 'manual', 'certificate', 'payment_claim_evidence']");
    expect(packageWorkspaceSource).toContain("subcontractor: ['shop_drawing', 'sample_approval', 'rfi', 'payment_claim_evidence', 'closeout_document']");
    expect(packageWorkspaceSource).toContain('const roleEvidenceTypes = useMemo(() => allowedEvidenceTypesForRole(user.role), [user.role]);');
    expect(packageWorkspaceSource).toContain('{roleEvidenceOptions.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}');
    expect(packageWorkspaceSource).toContain('Product data / lead times');
    expect(packageWorkspaceSource).toContain('Assigned package scope');
    expect(packageWorkspaceSource).toContain('RFIs / site instructions');
  });

  it('implements backend.html role-specific toolbox content instead of one shared generic toolbox', () => {
    expect(projectToolboxSource).toContain('const TOOLBOX_CONFIG: Record<UserRole, RoleToolboxConfig>');
    expect(projectToolboxSource).toContain('toolGroups: ToolboxGroup[]');
    expect(projectToolboxSource).toContain('primaryResponsibilities: string[]');
    expect(projectToolboxSource).toContain('handoffBoundaries: string[]');
    expect(projectToolboxSource).toContain('config.toolGroups.map((group)');
    expect(projectToolboxSource).toContain('data-testid={`toolbox-responsibilities-${user.role}`}');
    expect(projectToolboxSource).toContain('Subcontractor Package Toolbox');
    expect(projectToolboxSource).toContain('Supplier Delivery Toolbox');
    expect(projectToolboxSource).toContain('Assigned Package Scope');
    expect(projectToolboxSource).toContain('Shop Drawings & Samples');
    expect(projectToolboxSource).toContain('Supplier API Catalogue');
    expect(projectToolboxSource).toContain('Supplier Quote Path');
    expect(projectToolboxSource).toContain('Delivery Notes & Warranties');
    expect(projectToolboxSource).toContain('Payment Tracker');
    expect(projectToolboxSource).toContain('Supplier access is delivery/procurement scoped');
    expect(projectToolboxSource).toContain('Subcontractor access is package-scoped');
    expect(projectToolboxSource).toContain('Cannot approve own payment claim or completion status');
    expect(projectToolboxSource).toContain('Cannot mark deliveries accepted without contractor/client evidence');
    expect(projectToolboxSource).toContain('Cannot execute payments or statutory actions without recorded authorization');
    expect(projectToolboxSource).toContain('data-testid={`toolbox-group-${user.role}-${group.id}`}');
    expect(appSource).toContain("activeTab === 'toolbox' && <ProjectToolboxPage user={user} onNavigate={setActiveTab} />");
  });

  it('keeps external API integrations explicit about live/provider-gated/mock status', () => {
    expect(externalApiMockSource).toContain('export const MOCK_EXTERNAL_API_INTEGRATIONS');
    for (const integration of ['payfast-sandbox', 'cpd-statutory-sync', 'supplier-catalogue', 'municipal-portal']) {
      expect(externalApiMockSource).toContain(`id: '${integration}'`);
    }
    expect(externalApiMockSource).toContain("mode: 'live_gateway'");
    expect(externalApiMockSource).toContain("mode: 'provider_gated'");
    expect(externalApiMockSource).toContain("mode: 'local_mock'");
    expect(externalApiMockSource).toContain('Provider status is explicit');
    expect(projectToolboxSource).toContain("import { MOCK_EXTERNAL_API_INTEGRATIONS, MOCK_EXTERNAL_API_NOTICE } from '@/data/mockExternalApiIntegrations';");
    expect(projectToolboxSource).toContain('Provider integration status');
  });

  it('keeps registry ids unique and every shell-backed page statically routable', () => {
    const pageIds = extractPageIds();
    expect(pageIds.length, 'Expected dashboard page ids to be statically discoverable').toBeGreaterThan(20);
    expect(new Set(pageIds).size, 'Dashboard page ids must be unique').toBe(pageIds.length);

    expect(appSource).toContain('const SHELL_PAGE_IDS = new Set(CANONICAL_DASHBOARD_PAGES.map((page) => page.id));');
    expect(appSource).toContain('const DIRECT_WORKFLOW_PAGE_IDS = new Set([');
    expect(appSource).toContain('const PROJECT_WORKFLOW_PAGE_IDS = new Set([');
    expect(appSource).toContain('const REAL_WORKFLOW_PAGE_IDS = new Set([...DIRECT_WORKFLOW_PAGE_IDS, ...PROJECT_WORKFLOW_PAGE_IDS]);');
    expect(appSource).toContain('function pagesForRole(role: UserRole)');
    expect(appSource).toContain('function pageById(pageId: string)');
    expect(appSource).toContain('PROJECT_WORKFLOW_PAGE_IDS.has(activeTab) && <ProjectWorkflowPage pageId={activeTab} user={user} />');
    expect(appSource).toContain('SHELL_PAGE_IDS.has(activeTab) && !REAL_WORKFLOW_PAGE_IDS.has(activeTab)');
  });

  it('exposes backend role navigation sections and deterministic page test ids', () => {
    // Navigation labels are now in architexNavigationConfig (single source of truth)
    for (const heading of ['Command Centre', 'Inbox / Action Centre', 'Projects', 'Toolboxes', 'CPD & Learning', 'Documents / Knowledge Hub', 'Marketplace / Resource Centre', 'Finance & Commercial', 'Messages', 'Settings']) {
      expect(navConfigSource).toContain(heading);
    }
    // App.tsx integrates the navigation config for rendering
    expect(appSource).toContain('architexNavigation');
    expect(appSource).toContain('visibleNavItems');
    expect(appSource).toContain('activeNavKey');
    expect(appSource).toContain('navKeyIcon');
    expect(appSource).toContain('getDefaultPageForNavKey');
    expect(appSource).toContain('getNavKeyForActiveTab');
  });

  it('keeps role-aware dashboard keyboard shortcuts discoverable and input-safe', () => {
    expect(appSource).toContain('function isEditableShortcutTarget');
    expect(appSource).toContain('handleDashboardShortcut');
    expect(appSource).toContain('event.altKey');
    expect(appSource).toContain('visiblePages[numericShortcut - 1]?.id');
    expect(appSource).toContain('data-testid="dashboard-keyboard-shortcuts"');
    expect(appSource).toContain('Alt+1–9 opens your first visible pages');
    expect(appSource).toContain('setIsSidebarOpen(false);');
  });

  it('routes the shared command page to the real project command centre projection', () => {
    expect(appSource).toContain("const ProjectCommandCentre = lazyWithChunkRetry(() => import('./components/ProjectCommandCentre'));"
    );
    expect(appSource).toContain(`activeTab === 'command' && <ProjectCommandCentre user={user} onNavigate={setActiveTab} />`);
    expect(appSource).not.toContain(`(user.role === 'subcontractor' || user.role === 'supplier') && <DashboardPageShell pageId="command" user={user} />`);
  });


  it('links command centre next actions to role-profile completion blockers', () => {
    expect(commandCentreSource).toContain("import { getRoleProfileCompletion }");
    expect(commandCentreSource).toContain('const profileCompletion = useMemo(() => getRoleProfileCompletion(user.role, user as unknown as Record<string, unknown>), [user]);');
    expect(commandCentreSource).toContain('getProjectCommandCentreGuidance');
    expect(commandCentreServiceSource).toContain('profileCompletion && !profileCompletion.isComplete');
    expect(commandCentreServiceSource).toContain("target: 'profile'");
    expect(commandCentreSource).toContain('Profile readiness');
  });

  it('keeps shared workflow projections compatible with deployed Firestore rules and default indexes', () => {
    for (const source of [workflowSource, commandCentreSource]) {
      expect(source).not.toContain('Workflow unavailable');
      expect(source).not.toContain("orderBy('createdAt'");
      expect(source).not.toContain("where('status', 'in'");
      expect(source).toContain('sortByRecent');
    }

    expect(workflowSource).toContain("where('status', '==', 'open')");
    expect(commandCentreSource).toContain("where('status', '==', 'published')");

    expect(workflowSource).toContain('return [];');
    expect(commandCentreSource).toContain('return null;');
  });

  it('routes implemented shared workflow pages to production composed workflow modules', () => {
    expect(appSource).toContain("const ProjectWorkflowPage = lazyWithChunkRetry(() => import('./components/ProjectWorkflowPage'));"
    );
    expect(appSource).toContain('const REAL_WORKFLOW_PAGE_IDS = new Set');
    for (const pageId of ['journey', 'messages', 'programme', 'disputes', 'payments', 'invoicing', 'contracts', 'escrow', 'municipal-tracker', 'construction', 'snagging']) {
      expect(appSource).toContain(`'${pageId}'`);
    }
    expect(workflowSource).toContain("import ProjectMessengerPage from './ProjectMessengerPage';");
    expect(workflowSource).toContain("import ContractSigningPage from './ContractSigningPage';");
    expect(workflowSource).toContain("import DisputeResolutionPage from './DisputeResolutionPage';");
    expect(workflowSource).toContain("return <ProjectMessengerPage user={user} />;");
    expect(workflowSource).toContain("return <ContractSigningPage user={user} />;");
    expect(workflowSource).toContain("return <DisputeResolutionPage user={user} />;");
    expect(appSource).toContain('const PROJECT_WORKFLOW_PAGE_IDS = new Set([');
    expect(appSource).toContain('PROJECT_WORKFLOW_PAGE_IDS.has(activeTab) && <ProjectWorkflowPage pageId={activeTab} user={user} />');
  });

  it('routes backend.html BEP marketplace and design team matrix to live production tools', () => {
    expect(appSource).toContain("const BEPClientMarketplacePage = lazyWithChunkRetry(() => import('./components/BEPClientMarketplacePage'));");
    expect(appSource).toContain("const DesignTeamMatrixPage = lazyWithChunkRetry(() => import('./components/DesignTeamMatrixPage'));");
    expect(appSource).toContain(`activeTab === 'bep-marketplace' && <BEPClientMarketplacePage user={user} />`);
    expect(appSource).toContain(`activeTab === 'bep-team' && <DesignTeamMatrixPage user={user} />`);
    expect(appSource).toContain(`'bep-marketplace'`);
    expect(appSource).toContain(`'bep-team'`);

    expect(bepMarketplaceSource).toContain("collection(db, 'jobs')");
    expect(bepMarketplaceSource).toContain("where('status', '==', 'open')");
    expect(bepMarketplaceSource).toContain("collection(db, `jobs/${selected.job.id}/applications`)");
    expect(bepMarketplaceSource).toContain('architectId: user.uid');
    expect(bepMarketplaceSource).not.toContain('orderBy(');

    expect(designTeamMatrixSource).toContain("collection(db, 'projects')");
    expect(designTeamMatrixSource).toContain("where('leadArchitectId', '==', user.uid)");
    expect(designTeamMatrixSource).toContain("collection(db, 'users')");
    expect(designTeamMatrixSource).toContain('<ResponsibilityMatrix');
    expect(designTeamMatrixSource).toContain('<TeamBuilder');
    expect(designTeamMatrixSource).not.toContain('orderBy(');
  });

  it('backs shared messenger, contract, and dispute tools with live Firestore records only', () => {
    expect(projectMessengerSource).toContain("collection(db, 'messages')");
    expect(projectMessengerSource).toContain('where(\'jobId\'');
    expect(projectMessengerSource).toContain('messagingService.sendMessage');
    expect(messagingServiceSource).toContain('addDoc(collection(db, \'messages\')');
    expect(projectMessengerSource).not.toContain('orderBy(');

    expect(contractSigningSource).toContain("collection(db, 'appointment_contracts')");
    expect(contractSigningSource).toContain("doc(db, 'escrow'");
    expect(contractSigningSource).toContain('This page does not execute signatures or payments');
    expect(contractSigningSource).toContain('Human signing guard');
    expect(contractSigningSource).toContain('Request signature disabled');
    expect(contractSigningSource).toContain('Accept / bind disabled');
    expect(contractSigningSource).not.toContain('addDoc(');

    expect(financialDashboardSource).toContain('Payment and escrow execution guard');
    expect(financialDashboardSource).toContain('Initiate payment disabled');
    expect(financialDashboardSource).toContain('Release escrow disabled');
    expect(financialDashboardSource).toContain('Provider submission disabled');
    expect(financialDashboardSource).not.toContain('addDoc(');

    expect(disputeResolutionSource).toContain("collection(db, 'disputes')");
    expect(disputeResolutionSource).toContain('filedBy');
    expect(disputeResolutionSource).toContain('filedAgainst');
    expect(disputeResolutionSource).toContain('status: \'open\'');
    expect(disputeResolutionSource).not.toContain('orderBy(');
  });

  it('backs package construction OS with package-linked live operations for contractor, package delivery, and admin roles', () => {
    expect(workflowSource).toContain("import PackageConstructionOpsPage from './PackageConstructionOpsPage';");
    expect(workflowSource).toContain("pageId === 'construction' && ['contractor', 'subcontractor', 'supplier', 'admin'].includes(user.role)");
    expect(workflowSource).toContain('return <PackageConstructionOpsPage user={user} />;');
    for (const collection of ["'rfis'", "'site_instructions'", "'site_logs'", "'gantt_tasks'", "'site_inspections'", "'package_snags'"]) {
      expect(packageConstructionSource).toContain(`collection(db, ${collection})`);
    }
    expect(packageConstructionSource).toContain("where('packageId', 'in', packageIds)");
    expect(packageConstructionSource).toContain('addDoc(collection(db, \'rfis\')');
    expect(packageConstructionSource).toContain('addDoc(collection(db, \'site_instructions\')');
    expect(packageConstructionSource).toContain('addDoc(collection(db, \'site_inspections\')');
    expect(packageConstructionSource).toContain('humanReviewRequired: true');
    expect(packageConstructionSource).toContain('costImpactStatus');
    expect(packageConstructionSource).toContain('programmeImpactStatus');
    expect(packageConstructionSource).toContain('Site instructions and inspections remain human-reviewed and do not auto-certify work.');
    expect(packageConstructionSource).toContain("captureType === 'site_instruction'");
    expect(packageConstructionSource).toContain("captureType === 'inspection'");
    expect(packageConstructionSource).toContain('Inspection / sign-off');
    expect(packageConstructionSource).toContain('do not auto-certify work');
    expect(packageConstructionSource).toContain('addDoc(collection(db, \'site_logs\')');
    expect(packageConstructionSource).toContain('addDoc(collection(db, \'gantt_tasks\')');
  });

  it('upgrades programme builder with baseline, forecast, dependency, and human-review controls', () => {
    expect(workflowSource).toContain("pageId === 'programme' && activeProject");
    expect(workflowSource).toContain('<GanttChart projectId={activeProject.id} teamMembers={activeProject.teamMembers} />');
    expect(ganttChartSource).toContain('Programme Builder');
    expect(ganttChartSource).toContain('baselineStartDate');
    expect(ganttChartSource).toContain('forecastEndDate');
    expect(ganttChartSource).toContain('Critical path');
    expect(ganttChartSource).toContain('Look-ahead');
    expect(ganttChartSource).toContain('Recovery programme');
    expect(ganttChartSource).toContain('humanApprovalRequired');
    expect(ganttChartSource).toContain('This tool does not approve extensions of time, payment claims, or contract changes.');
  });

  it('routes backend.html invoicing and package close-out/snags to live production tools', () => {
    expect(workflowSource).toContain("import PackageCloseoutPage from './PackageCloseoutPage';");
    expect(workflowSource).toContain("pageId === 'snagging' && ['contractor', 'subcontractor', 'supplier', 'admin'].includes(user.role)");
    expect(workflowSource).toContain('return <PackageCloseoutPage user={user} />;');
    expect(workflowSource).toContain("pageId === 'invoicing' && <InvoiceManagement user={user} />");

    expect(packageCloseoutSource).toContain("collection(db, 'package_snags')");
    expect(packageCloseoutSource).toContain("collection(db, 'package_delivery_evidence')");
    expect(packageCloseoutSource).toContain('evaluatePackageReadiness');
    expect(packageCloseoutSource).toContain("status: 'submitted'");
    expect(packageCloseoutSource).toContain('humanReviewRequired: true');
    expect(packageCloseoutSource).not.toContain('orderBy(');
  });

  it('routes admin AI co-pilot to the production AI output review queue', () => {
    expect(aiCoPilotSource).toContain("import AdminAIReviewQueue from './AdminAIReviewQueue';");
    expect(aiCoPilotSource).toContain('<AdminAIReviewQueue />');
    expect(adminAIReviewQueueSource).toContain("collection(db, 'ai_review_queue')");
    expect(adminAIReviewQueueSource).toContain("where('status', '==', 'open')");
    expect(adminAIReviewQueueSource).toContain("doc(db, 'ai_action_logs'");
    expect(adminAIReviewQueueSource).toContain('/api/admin/ai-review/${selectedItem.id}/resolve');
    expect(adminAIReviewQueueSource).toContain('humanSignOff');
    expect(adminAIReviewQueueSource).not.toContain('orderBy(');
  });

  it('routes AI co-pilot to the production grounded AI governance page', () => {
    expect(appSource).toContain("const AICoPilotPage = lazyWithChunkRetry(() => import('./components/AICoPilotPage'));"
    );
    expect(appSource).toContain(`activeTab === 'ai' && <AICoPilotPage user={user} onNavigate={setActiveTab} />`);
    expect(appSource).toContain(`'ai'`);
  });

  it('routes drawing register and transmittals to live document-control records', () => {
    expect(appSource).toContain("const DrawingRegisterPage = lazyWithChunkRetry(() => import('./components/DrawingRegisterPage'));"
    );
    expect(appSource).toContain(`{ id: 'drawing-register', label: 'Drawing Register'`);
    expect(appSource).toContain(`activeTab === 'drawing-register' && <DrawingRegisterPage user={user} />`);
    expect(appSource).toContain(`'drawing-register'`);
    expect(drawingRegisterSource).toContain("where('leadProfessionalId', '==', user.uid)");
    expect(drawingRegisterSource).toContain("where('leadBepId', '==', user.uid)");
    expect(drawingRegisterSource).toContain("where('leadArchitectId', '==', user.uid)");
    expect(drawingRegisterSource).toContain('mergeProjectSnapshots');
    expect(drawingRegisterSource).toContain("collection(db, 'projects', selectedProject.id, 'documents')");
    expect(drawingRegisterSource).toContain("collection(documentRef, 'versions')");
    expect(drawingRegisterSource).toContain("collection(db, 'projects', selectedProject.id, 'transmittals')");
    expect(drawingRegisterSource).toContain("collection(db, 'projects', selectedProject.id, 'coordination_items')");
    expect(drawingRegisterSource).toContain('External delivery, statutory approval, and legal sign-off remain human-confirmed');
    expect(drawingRegisterSource).not.toContain('orderBy(');
  });

  it('routes contractor staff wages and plant to the production resource-control workspace', () => {
    expect(appSource).toContain("const ContractorStaffPlantPage = lazyWithChunkRetry(() => import('./components/ContractorStaffPlantPage'));"
    );
    expect(appSource).toContain(`activeTab === 'contractor-staff' && <ContractorStaffPlantPage user={user} />`);
    expect(appSource).toContain(`'contractor-staff'`);
  });

  it('routes BEP freelancer work packages to the production delegation workspace', () => {
    expect(appSource).toContain("const BEPFreelancerJobsPage = lazyWithChunkRetry(() => import('./components/BEPFreelancerJobsPage'));"
    );
    expect(appSource).toContain(`activeTab === 'bep-freelancers' && <BEPFreelancerJobsPage user={user} />`);
    expect(appSource).toContain(`'bep-freelancers'`);
    expect(bepFreelancerJobsSource).toContain("const delegatedTaskRef = doc(db, 'delegatedTasks', taskRef.id)");
    expect(bepFreelancerJobsSource).toContain('batch.set(delegatedTaskRef, taskData)');
    expect(bepFreelancerJobsSource).toContain('jobTaskId: taskRef.id');
    expect(bepFreelancerJobsSource).toContain('Approve for invoice readiness');
    expect(bepFreelancerJobsSource).toContain("task.submissionStatus !== 'submitted'");
    expect(bepFreelancerJobsSource).toContain("paymentStatus: decision === 'approved' ? 'ready_for_invoice' : 'not_ready'");
  });

  it('routes SANS compliance forms to the production stored-report register', () => {
    expect(appSource).toContain("const SANSComplianceFormsPage = lazyWithChunkRetry(() => import('./components/SANSComplianceFormsPage'));"
    );
    expect(appSource).toContain(`activeTab === 'sans-forms' && <SANSComplianceFormsPage user={user} />`);
    expect(appSource).toContain(`'sans-forms'`);
  });

  it('routes CPD assessment to the production browser-safe CPD workflow', () => {
    expect(appSource).toContain("const CPDAssessmentPage = lazyWithChunkRetry(() => import('./components/CPDAssessmentPage'));"
    );
    expect(appSource).toContain(`activeTab === 'cpd-assessment' && <CPDAssessmentPage user={user} />`);
    expect(appSource).toContain(`'cpd-assessment'`);
  });

  it('routes package and procurement pages to the production package workspace', () => {
    expect(appSource).toContain("const PackageProcurementWorkspace = lazyWithChunkRetry(() => import('./components/PackageProcurementWorkspace'));"
    );
    expect(appSource).toContain(`(activeTab === 'packages' || activeTab === 'procurement') && <PackageProcurementWorkspace user={user} mode={activeTab as 'packages' | 'procurement'} />`);
    expect(appSource).toContain(`'procurement'`);
    expect(appSource).toContain(`'packages'`);
    expect(packageWorkspaceSource).toContain("import BidSubmission from './BidSubmission';");
    expect(packageWorkspaceSource).toContain('<BidSubmission tenders={tendersAvailableForBid} contractorId={user.uid} contractorName={user.displayName || user.email} onSubmitted={setSelectedTenderId} />');
    expect(packageWorkspaceSource).toContain('Supplier quote path');
    expect(packageWorkspaceSource).toContain('Package claims, delivery and warranties');
    expect(packageWorkspaceSource).toContain('Drawing-to-BoM Extractor');
    expect(packageWorkspaceSource).toContain('Supplier API Catalogue');
    expect(packageWorkspaceSource).toContain("query(collection(db, 'directoryProfiles'), where('role', '==', 'supplier')");
    expect(packageWorkspaceSource).toContain("source: 'package-procurement-workspace'");
    expect(packageWorkspaceSource).toContain('roleEvidenceOptions');
    expect(packageWorkspaceSource).toContain('payment_claim');
    expect(packageWorkspaceSource).toContain('warranty');
    expect(packageWorkspaceSource).toContain('payment_claim_evidence');
    expect(packageWorkspaceSource).toContain("addDoc(collection(db, 'package_delivery_evidence')");
    expect(packageWorkspaceSource).toContain('humanReviewRequired: true');
    expect(bidSubmissionSource).toContain('submitBid(selectedTenderId');
    expect(bidSubmissionSource).toContain('Upload bid attachments');
  });

  it('routes design to the production design compliance workflow with project drawing checklist tracking', () => {
    expect(appSource).toContain("const DesignCompliancePage = lazyWithChunkRetry(() => import('./components/DesignCompliancePage'));"
    );
    expect(appSource).toContain(`activeTab === 'design' && <DesignCompliancePage user={user} />`);
    expect(appSource).toContain(`'design'`);
    expect(designComplianceSource).toContain("import DrawingChecklistTracker from './DrawingChecklistTracker';");
    expect(designComplianceSource).toContain('<DrawingChecklistTracker project={project} job={selectedJob} user={user} />');
    expect(drawingChecklistServiceSource).toContain("'drawing_checklists'");
    expect(drawingChecklistServiceSource).not.toContain('orderBy(');
  });

  it('routes admin console to a whole-system governance console with backend.html datasets', () => {
    expect(appSource).toContain(`activeTab === 'admin-console' && <AdminGovernanceConsolePage user={user} />`);
    expect(appSource).toContain(`'admin-console'`);
    expect(adminGovernanceConsoleSource).toContain('data-testid="admin-governance-console"');
    expect(adminGovernanceConsoleSource).toContain('Whole-system governance console');
    expect(adminGovernanceConsoleSource).toContain("collectionName: 'projects'");
    expect(adminGovernanceConsoleSource).toContain("collectionName: 'disputes'");
    expect(adminGovernanceConsoleSource).toContain("collectionName: 'escrow'");
    expect(adminGovernanceConsoleSource).toContain("collectionName: 'payments'");
    expect(adminGovernanceConsoleSource).toContain("collectionName: 'messages'");
    expect(adminGovernanceConsoleSource).toContain("collectionName: 'ai_review_queue'");
    expect(adminGovernanceConsoleSource).toContain("collectionName: 'system_logs'");
    expect(adminGovernanceConsoleSource).toContain('observational by default');
  });

  it('routes freelancer submissions to the production submissions workflow', () => {
    expect(appSource).toContain("const FreelancerSubmissionsPage = lazyWithChunkRetry(() => import('./components/FreelancerSubmissionsPage'));"
    );
    expect(appSource).toContain(`activeTab === 'freelancer-submissions' && <FreelancerSubmissionsPage user={user} />`);
    expect(appSource).toContain(`'freelancer-submissions'`);
    expect(freelancerSubmissionsSource).toContain('Submit for BEP review');
    expect(freelancerSubmissionsSource).toContain("submissionStatus: 'submitted'");
    expect(freelancerSubmissionsSource).toContain("paymentStatus: 'review_pending'");
    expect(freelancerSubmissionsSource).toContain("updateDoc(doc(db, 'delegatedTasks'");
  });

  it('routes freelancer assigned work to the production freelancer dashboard', () => {
    expect(appSource).toContain(`activeTab === 'freelancer-work' && <FreelancerDashboard user={user} />`);
    expect(appSource).toContain(`'freelancer-work'`);
  });

  it('routes resource sharing to the production resource booking workspace', () => {
    expect(appSource).toContain("const ResourceSharingPage = lazyWithChunkRetry(() => import('./components/ResourceSharingPage'));"
    );
    expect(appSource).toContain(`activeTab === 'resource-sharing' && <ResourceSharingPage user={user} />`);
    expect(appSource).toContain(`'resource-sharing'`);
  });

  it('routes toolbox to the production project file toolbox', () => {
    expect(appSource).toContain("const ProjectToolboxPage = lazyWithChunkRetry(() => import('./components/ProjectToolboxPage'));"
    );
    expect(appSource).toContain(`activeTab === 'toolbox' && <ProjectToolboxPage user={user} onNavigate={setActiveTab} />`);
    expect(appSource).toContain(`'toolbox'`);
  });

  it('routes knowledge to the production resource/knowledge workflow', () => {
    expect(appSource).toContain(`activeTab === 'knowledge' && <ResourceCentre user={user} />`);
    expect(appSource).toContain(`'knowledge'`);
  });

  it('routes resource centre to the production resource/checklist workflow', () => {
    expect(appSource).toContain("const ResourceCentre = lazyWithChunkRetry(() => import('./components/ResourceCentre'));"
    );
    expect(appSource).toContain(`activeTab === 'resource-centre' && <ResourceCentre user={user} />`);
    expect(appSource).toContain(`'resource-centre'`);
  });

  it('routes tasks to the production tasks and approvals workflow with project coordination register', () => {
    expect(appSource).toContain("const TasksApprovalsPage = lazyWithChunkRetry(() => import('./components/TasksApprovalsPage'));"
    );
    expect(appSource).toContain(`activeTab === 'tasks' && <TasksApprovalsPage user={user} />`);
    expect(appSource).toContain(`'tasks'`);
    expect(tasksApprovalsSource).toContain("import ProjectCoordinationRegister from './ProjectCoordinationRegister';");
    expect(tasksApprovalsSource).toContain('<ProjectCoordinationRegister project={selectedProject} job={selectedJob} user={user} />');
    expect(coordinationRegisterServiceSource).toContain("'coordination_items'");
    expect(coordinationRegisterServiceSource).not.toContain('orderBy(');
  });

  it('routes drawing checker to the production AI drawing checker workflow', () => {
    expect(appSource).toContain("const AIDrawingChecker = lazyWithChunkRetry(() => import('./components/AIDrawingChecker'));"
    );
    expect(appSource).toContain(`activeTab === 'drawing-checker' && <AIDrawingChecker user={user} />`);
    expect(appSource).toContain(`'drawing-checker'`);
  });

  it('routes client progress to the production progress reports workflow', () => {
    expect(appSource).toContain("const ClientProgressReports = lazyWithChunkRetry(() => import('./components/ClientProgressReports'));"
    );
    expect(appSource).toContain(`activeTab === 'client-progress' && <ClientProgressReports user={user} />`);
    expect(appSource).toContain(`'client-progress'`);
  });

  it('routes client intake to the production guided brief wizard', () => {
    expect(appSource).toContain("const GuidedBriefWizard = lazyWithChunkRetry(() => import('./components/GuidedBriefWizard'));"
    );
    expect(appSource).toContain(`activeTab === 'client-intake' && <GuidedBriefWizard user={user} />`);
    expect(appSource).toContain(`'client-intake'`);
  });

  it('routes client proposals to the production comparison workflow', () => {
    expect(appSource).toContain("const ClientProposalComparison = lazyWithChunkRetry(() => import('./components/ClientProposalComparison'));"
    );
    expect(appSource).toContain(`activeTab === 'client-proposals' && <ClientProposalComparison user={user} />`);
    expect(appSource).toContain(`'client-proposals'`);
  });

  it('routes BEP technical briefs to the production technical brief editor', () => {
    expect(appSource).toContain("const TechnicalBriefEditor = lazyWithChunkRetry(() => import('./components/TechnicalBriefEditor'));"
    );
    expect(appSource).toContain(`activeTab === 'technical-brief' && <TechnicalBriefEditor user={user} />`);
    expect(appSource).toContain(`'technical-brief'`);
  });

  it('routes directory search to the production directory workflow', () => {
    expect(appSource).toContain("const DirectorySearch = lazyWithChunkRetry(() => import('./components/DirectorySearch'));"
    );
    expect(appSource).toContain(`activeTab === 'directory-search' && <DirectorySearch user={user} />`);
    expect(appSource).toContain(`'directory-search'`);
  });

  it('routes the canonical profile page to the production profile workspace', () => {
    expect(appSource).toContain("const ProfileEditor = lazyWithChunkRetry(() => import('./components/ProfileEditor'));");
    expect(appSource).toContain(`activeTab === 'profile' && <ProfileWorkspacePage user={user} />`);
    expect(appSource).toContain('data-testid="profile-workspace-page"');
    expect(appSource).toContain('<ProfileEditor user={user} />');
  });

  it('keeps command centre projections compatible with BEP professional aliases', () => {
    expect(commandCentreSource).toContain('subscribeToMergedQuerySnapshots');
    expect(commandCentreSource).toContain("where('selectedProfessionalId', '==', user.uid)");
    expect(commandCentreSource).toContain("where('selectedBepId', '==', user.uid)");
    expect(commandCentreSource).toContain("where('selectedArchitectId', '==', user.uid)");
    expect(commandCentreSource).toContain("where('leadProfessionalId', '==', user.uid)");
    expect(commandCentreSource).toContain("where('leadBepId', '==', user.uid)");
    expect(commandCentreSource).toContain("where('leadArchitectId', '==', user.uid)");
  });

  it('keeps project workflow pages compatible with BEP professional aliases', () => {
    expect(workflowSource).toContain('subscribeToMergedQuerySnapshots');
    expect(workflowSource).toContain("function projectQueriesForUser(user: UserProfile)");
    expect(workflowSource).toContain("function jobQueriesForUser(user: UserProfile)");
    expect(workflowSource).toContain("where('selectedProfessionalId', '==', user.uid)");
    expect(workflowSource).toContain("where('selectedBepId', '==', user.uid)");
    expect(workflowSource).toContain("where('selectedArchitectId', '==', user.uid)");
    expect(workflowSource).toContain("where('leadProfessionalId', '==', user.uid)");
    expect(workflowSource).toContain("where('leadBepId', '==', user.uid)");
    expect(workflowSource).toContain("where('leadArchitectId', '==', user.uid)");
  });

  it('keeps dashboard shell unsafe actions human-confirmed while production pages are integrated', () => {
    expect(appSource).toContain('Unsafe payment, escrow, signature, provider, and approval decisions');
    expect(appSource).toContain('human confirmation before anything is submitted');
    expect(appSource).toContain('backed by existing services, documents, and role permissions');
  });
});

describe('dashboard resource links', () => {
  it('keeps resource links statically discoverable and attached to registered pages', () => {
    expect(resourceLinksMatch, 'DASHBOARD_RESOURCE_LINKS should remain statically discoverable').toBeTruthy();

    const pageIds = new Set(extractPageIds());
    const linkedPageIds = extractResourceLinkPageIds();

    expect(linkedPageIds).toEqual(expect.arrayContaining([
      'toolbox',
      'journey',
      'tasks',
      'directory-search',
      'ai',
      'knowledge',
      'resource-centre',
      'procurement',
      'packages',
    ]));

    for (const pageId of linkedPageIds) {
      expect(pageIds.has(pageId), `Resource links must point at registered dashboard page ${pageId}`).toBe(true);
    }
  });

  it('points every dashboard resource link at a committed local documentation file', () => {
    const hrefs = extractResourceHrefs();
    expect(hrefs.length, 'Expected dashboard resource hrefs to be statically discoverable').toBeGreaterThan(10);

    for (const href of hrefs) {
      expect(href.startsWith('/docs/'), `Dashboard resource href ${href} should stay under /docs`).toBe(true);
      expect(existsSync(resolve(process.cwd(), href.slice(1))), `Dashboard resource href ${href} should resolve to a repo file`).toBe(true);
    }
  });

  it('keeps the dashboard shell rendering resource links with safe external-tab attributes', () => {
    expect(appSource).toContain('resourcesForShell(pageId, user.role)');
    expect(appSource).toContain('target="_blank"');
    expect(appSource).toContain('rel="noreferrer"');
  });
});

describe('backend.html dashboard alignment invariants', () => {
  it('keeps App.tsx labels aligned with the backend.html canonical role/page matrix terms', () => {
    const backendTermsByPage = [
      ['command', 'Command Centre'],
      ['toolbox', 'Project Toolbox'],
      ['journey', 'Project Journey'],
      ['tasks', 'Tasks & Approvals'],
      ['messages', 'Project Messenger'],
      ['programme', 'Programme'],
      ['disputes', 'Dispute Resolution'],
      ['payments', 'Payments'],
      ['contracts', 'Contracts'],
      ['escrow', 'Escrow Service'],
      ['ai', 'AI Co-Pilot'],
      ['client-intake', 'Guided Brief Wizard'],
      ['technical-brief', 'Technical Brief Editor'],
      ['resource-centre', 'Resource Centre'],
    ] as const;

    for (const [pageId, backendTerm] of backendTermsByPage) {
      findPageEntry(pageId);
      expect(backendSource, `backend.html should still contain canonical term ${backendTerm}`).toContain(backendTerm);
    }
  });

  it('preserves explicit backend.html alignment copy in dashboard shell and citations', () => {
    expect(appSource).toContain('DASHBOARD_ALIGNMENT_CITATIONS');
    expect(appSource).toContain('backend.html role/page matrix');
    expect(appSource).toContain('AI Co-Pilot canonical page requirement');
    expect(appSource).toContain('Resource Centre / Checklists canonical page requirement');
  });
});
