import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appSource = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
const backendSource = readFileSync(resolve(process.cwd(), 'backend.html'), 'utf8');
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
    expectPage('packages', 'Subcontractor Packages', ['contractor', 'subcontractor', 'supplier', 'admin']);
    expectPage('freelancer-work', 'Assigned Work', ['freelancer']);
    expectPage('knowledge', 'Knowledge / CPD', ['bep', 'architect', 'contractor', 'subcontractor', 'supplier', 'freelancer', 'admin']);
    expectPage('admin-console', 'Admin Console', ['admin']);
  });

  it('keeps registry ids unique and every shell-backed page statically routable', () => {
    const pageIds = extractPageIds();
    expect(pageIds.length, 'Expected dashboard page ids to be statically discoverable').toBeGreaterThan(20);
    expect(new Set(pageIds).size, 'Dashboard page ids must be unique').toBe(pageIds.length);

    expect(appSource).toContain('const SHELL_PAGE_IDS = new Set(CANONICAL_DASHBOARD_PAGES.map((page) => page.id));');
    expect(appSource).toContain('function pagesForRole(role: UserRole)');
    expect(appSource).toContain('function pageById(pageId: string)');
    expect(appSource).toContain('SHELL_PAGE_IDS.has(activeTab)');
  });

  it('exposes backend role navigation sections and deterministic page test ids', () => {
    for (const heading of ['Account', 'Project', 'Client Tools', 'BEP Tools', 'Contractor Tools', 'Freelancer Tools', 'System']) {
      expect(appSource).toContain(heading);
    }
    expect(appSource).toContain('function dashboardSectionLabel');
    expect(appSource).toContain('data-testid="nav-page-command"');
    expect(appSource).toContain('data-testid={`nav-page-${page.id}`}');
  });

  it('routes the shared command page to the real project command centre projection', () => {
    expect(appSource).toContain("const ProjectCommandCentre = lazyWithChunkRetry(() => import('./components/ProjectCommandCentre'));"
    );
    expect(appSource).toContain(`activeTab === 'command' && <ProjectCommandCentre user={user} onNavigate={setActiveTab} />`);
    expect(appSource).not.toContain(`(user.role === 'subcontractor' || user.role === 'supplier') && <DashboardPageShell pageId="command" user={user} />`);
  });

  it('routes implemented shared workflow pages to production composed workflow modules', () => {
    expect(appSource).toContain("const ProjectWorkflowPage = lazyWithChunkRetry(() => import('./components/ProjectWorkflowPage'));"
    );
    expect(appSource).toContain('const REAL_WORKFLOW_PAGE_IDS = new Set');
    for (const pageId of ['journey', 'messages', 'programme', 'disputes', 'payments', 'contracts', 'escrow', 'municipal-tracker', 'construction', 'snagging']) {
      expect(appSource).toContain(`'${pageId}'`);
    }
    expect(appSource).toContain(`REAL_WORKFLOW_PAGE_IDS.has(activeTab) && activeTab !== 'packages' && activeTab !== 'procurement' && activeTab !== 'client-progress' && activeTab !== 'drawing-checker' && activeTab !== 'tasks' && activeTab !== 'resource-centre' && activeTab !== 'knowledge' && activeTab !== 'admin-console' && activeTab !== 'design' && activeTab !== 'toolbox' && activeTab !== 'freelancer-work' && activeTab !== 'freelancer-submissions' && activeTab !== 'resource-sharing' && activeTab !== 'ai' && activeTab !== 'contractor-staff' && activeTab !== 'bep-freelancers' && <ProjectWorkflowPage pageId={activeTab} user={user} />`);
  });

  it('routes AI co-pilot to the production grounded AI governance page', () => {
    expect(appSource).toContain("const AICoPilotPage = lazyWithChunkRetry(() => import('./components/AICoPilotPage'));"
    );
    expect(appSource).toContain(`activeTab === 'ai' && <AICoPilotPage user={user} onNavigate={setActiveTab} />`);
    expect(appSource).toContain(`activeTab !== 'ai'`);
  });

  it('routes contractor staff wages and plant to the production resource-control workspace', () => {
    expect(appSource).toContain("const ContractorStaffPlantPage = lazyWithChunkRetry(() => import('./components/ContractorStaffPlantPage'));"
    );
    expect(appSource).toContain(`activeTab === 'contractor-staff' && <ContractorStaffPlantPage user={user} />`);
    expect(appSource).toContain(`activeTab !== 'contractor-staff'`);
  });

  it('routes BEP freelancer work packages to the production delegation workspace', () => {
    expect(appSource).toContain("const BEPFreelancerJobsPage = lazyWithChunkRetry(() => import('./components/BEPFreelancerJobsPage'));"
    );
    expect(appSource).toContain(`activeTab === 'bep-freelancers' && <BEPFreelancerJobsPage user={user} />`);
    expect(appSource).toContain(`activeTab !== 'bep-freelancers'`);
  });

  it('routes package and procurement pages to the production package workspace', () => {
    expect(appSource).toContain("const PackageProcurementWorkspace = lazyWithChunkRetry(() => import('./components/PackageProcurementWorkspace'));"
    );
    expect(appSource).toContain(`(activeTab === 'packages' || activeTab === 'procurement') && <PackageProcurementWorkspace user={user} mode={activeTab as 'packages' | 'procurement'} />`);
    expect(appSource).toContain(`'procurement'`);
    expect(appSource).toContain(`'packages'`);
  });

  it('routes design to the production design compliance workflow', () => {
    expect(appSource).toContain("const DesignCompliancePage = lazyWithChunkRetry(() => import('./components/DesignCompliancePage'));"
    );
    expect(appSource).toContain(`activeTab === 'design' && <DesignCompliancePage user={user} />`);
    expect(appSource).toContain(`activeTab !== 'design'`);
  });

  it('routes admin console to the production admin governance dashboard', () => {
    expect(appSource).toContain(`activeTab === 'admin-console' && <AdminDashboard user={user} activeTab="overview" onTabChange={setActiveTab} />`);
    expect(appSource).toContain(`activeTab !== 'admin-console'`);
  });

  it('routes freelancer submissions to the production submissions workflow', () => {
    expect(appSource).toContain("const FreelancerSubmissionsPage = lazyWithChunkRetry(() => import('./components/FreelancerSubmissionsPage'));"
    );
    expect(appSource).toContain(`activeTab === 'freelancer-submissions' && <FreelancerSubmissionsPage user={user} />`);
    expect(appSource).toContain(`activeTab !== 'freelancer-submissions'`);
  });

  it('routes freelancer assigned work to the production freelancer dashboard', () => {
    expect(appSource).toContain(`activeTab === 'freelancer-work' && <FreelancerDashboard user={user} />`);
    expect(appSource).toContain(`activeTab !== 'freelancer-work'`);
  });

  it('routes resource sharing to the production resource booking workspace', () => {
    expect(appSource).toContain("const ResourceSharingPage = lazyWithChunkRetry(() => import('./components/ResourceSharingPage'));"
    );
    expect(appSource).toContain(`activeTab === 'resource-sharing' && <ResourceSharingPage user={user} />`);
    expect(appSource).toContain(`activeTab !== 'resource-sharing'`);
  });

  it('routes toolbox to the production project file toolbox', () => {
    expect(appSource).toContain("const ProjectToolboxPage = lazyWithChunkRetry(() => import('./components/ProjectToolboxPage'));"
    );
    expect(appSource).toContain(`activeTab === 'toolbox' && <ProjectToolboxPage user={user} />`);
    expect(appSource).toContain(`activeTab !== 'toolbox'`);
  });

  it('routes knowledge to the production resource/knowledge workflow', () => {
    expect(appSource).toContain(`activeTab === 'knowledge' && <ResourceCentre user={user} />`);
    expect(appSource).toContain(`activeTab !== 'knowledge'`);
  });

  it('routes resource centre to the production resource/checklist workflow', () => {
    expect(appSource).toContain("const ResourceCentre = lazyWithChunkRetry(() => import('./components/ResourceCentre'));"
    );
    expect(appSource).toContain(`activeTab === 'resource-centre' && <ResourceCentre user={user} />`);
    expect(appSource).toContain(`activeTab !== 'resource-centre'`);
  });

  it('routes tasks to the production tasks and approvals workflow', () => {
    expect(appSource).toContain("const TasksApprovalsPage = lazyWithChunkRetry(() => import('./components/TasksApprovalsPage'));"
    );
    expect(appSource).toContain(`activeTab === 'tasks' && <TasksApprovalsPage user={user} />`);
    expect(appSource).toContain(`activeTab !== 'tasks'`);
  });

  it('routes drawing checker to the production AI drawing checker workflow', () => {
    expect(appSource).toContain("const AIDrawingChecker = lazyWithChunkRetry(() => import('./components/AIDrawingChecker'));"
    );
    expect(appSource).toContain(`activeTab === 'drawing-checker' && <AIDrawingChecker user={user} />`);
    expect(appSource).toContain(`activeTab !== 'drawing-checker'`);
  });

  it('routes client progress to the production progress reports workflow', () => {
    expect(appSource).toContain("const ClientProgressReports = lazyWithChunkRetry(() => import('./components/ClientProgressReports'));"
    );
    expect(appSource).toContain(`activeTab === 'client-progress' && <ClientProgressReports user={user} />`);
    expect(appSource).toContain(`activeTab !== 'client-progress'`);
  });

  it('routes client intake to the production guided brief wizard', () => {
    expect(appSource).toContain("const GuidedBriefWizard = lazyWithChunkRetry(() => import('./components/GuidedBriefWizard'));"
    );
    expect(appSource).toContain(`activeTab === 'client-intake' && <GuidedBriefWizard user={user} />`);
    expect(appSource).toContain(`activeTab !== 'client-intake'`);
  });

  it('routes client proposals to the production comparison workflow', () => {
    expect(appSource).toContain("const ClientProposalComparison = lazyWithChunkRetry(() => import('./components/ClientProposalComparison'));"
    );
    expect(appSource).toContain(`activeTab === 'client-proposals' && <ClientProposalComparison user={user} />`);
    expect(appSource).toContain(`activeTab !== 'client-proposals'`);
  });

  it('routes BEP technical briefs to the production technical brief editor', () => {
    expect(appSource).toContain("const TechnicalBriefEditor = lazyWithChunkRetry(() => import('./components/TechnicalBriefEditor'));"
    );
    expect(appSource).toContain(`activeTab === 'technical-brief' && <TechnicalBriefEditor user={user} />`);
    expect(appSource).toContain(`activeTab !== 'technical-brief'`);
  });

  it('routes directory search to the production directory workflow', () => {
    expect(appSource).toContain("const DirectorySearch = lazyWithChunkRetry(() => import('./components/DirectorySearch'));"
    );
    expect(appSource).toContain(`activeTab === 'directory-search' && <DirectorySearch user={user} />`);
    expect(appSource).toContain(`activeTab !== 'directory-search'`);
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
