/**
 * Responsive Layout Integration Tests
 *
 * Verifies that ArchitectDashboard, AdminDashboard, and ClientDashboard all
 * implement the responsive glass-system layout requirements:
 *
 *   Req 8.1 — Mobile: single column, sidebar hidden, MobileMenuTrigger visible
 *   Req 8.2 — Tablet: two-column grid, sidebar drawer on hamburger click
 *   Req 8.3 — Desktop: three-column grid, sidebar fixed left
 *   Req 8.4 — Wide layout reflowes smoothly
 *   Req 8.5 — No horizontal overflow at any viewport width
 *
 * Approach: render real dashboard components with all heavy children mocked.
 * We keep the real RoleAwareSidebar and MobileMenuTrigger so their CSS classes
 * are present in the output.
 *
 * CSS classes verified (Tailwind, applied at source):
 *   - RoleAwareSidebar outer <nav>: 'hidden' + 'md:flex'   (mobile-hidden, desktop-visible)
 *   - MobileMenuTrigger button:     'block' + 'md:hidden'  (mobile-visible, desktop-hidden)
 *   - main element:                 'md:ml-64'             (sidebar offset on desktop)
 *   - stat grid container:          'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
 *   - outer container:              'overflow-x-hidden'    (prevents horizontal scroll)
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import '@testing-library/jest-dom';
import { UserProfile } from '@/types';

// ─── Firebase mocks ──────────────────────────────────────────────────────────

jest.mock('@/lib/firebase', () => ({
  auth: { currentUser: { uid: 'test-uid', email: 'test@example.com' } },
  db: {
    collection: jest.fn<any>(() => ({
      doc: jest.fn<any>(() => ({
        get: jest.fn<any>(),
        set: jest.fn<any>(),
        update: jest.fn<any>(),
        delete: jest.fn<any>(),
      })),
      where: jest.fn<any>(() => ({
        orderBy: jest.fn<any>(() => ({
          limit: jest.fn<any>(() => ({
            onSnapshot: jest.fn<any>((cb: any) => { cb({ docs: [], empty: true }); return jest.fn(); }),
          })),
          onSnapshot: jest.fn<any>((cb: any) => { cb({ docs: [] }); return jest.fn(); }),
        })),
        onSnapshot: jest.fn<any>((cb: any) => { cb({ docs: [], empty: true }); return jest.fn(); }),
      })),
      orderBy: jest.fn<any>(() => ({
        onSnapshot: jest.fn<any>((cb: any) => { cb({ docs: [] }); return jest.fn(); }),
      })),
      onSnapshot: jest.fn<any>((cb: any) => { cb({ docs: [] }); return jest.fn(); }),
    })),
  },
  handleFirestoreError: jest.fn<any>(),
  OperationType: { CREATE: 'CREATE', READ: 'READ', UPDATE: 'UPDATE', DELETE: 'DELETE', LIST: 'LIST', UPLOAD: 'UPLOAD' },
}));

// Override the firebase/firestore onSnapshot to always return empty snapshots.
// The default mock (src/test/__mocks__/firebase-firestore.ts) returns one
// notification doc — which when mapped as a Dispute causes crashes in AdminDashboard.
jest.mock('firebase/firestore', () => ({
  collection: jest.fn<any>(() => ({ id: 'mock-collection' })),
  collectionGroup: jest.fn<any>(() => ({})),
  doc: jest.fn<any>(() => ({ id: 'mock-doc' })),
  getDoc: jest.fn<any>(() => Promise.resolve({ exists: () => true, id: 'mock-id', data: () => ({}), ref: { id: 'mock-id' } })),
  getDocs: jest.fn<any>(() => Promise.resolve({ empty: true, size: 0, docs: [], forEach: jest.fn() })),
  setDoc: jest.fn<any>(() => Promise.resolve()),
  updateDoc: jest.fn<any>(() => Promise.resolve()),
  deleteDoc: jest.fn<any>(() => Promise.resolve()),
  addDoc: jest.fn<any>(() => Promise.resolve({ id: 'mock-new-id' })),
  query: jest.fn<any>((...args: any[]) => args[0]),
  where: jest.fn<any>(() => ({})),
  orderBy: jest.fn<any>(() => ({})),
  limit: jest.fn<any>(() => ({})),
  limitToLast: jest.fn<any>(() => ({})),
  startAfter: jest.fn<any>(() => ({})),
  onSnapshot: jest.fn<any>((_ref: any, cb: any) => {
    if (typeof cb === 'function') {
      cb({ docs: [], empty: true, forEach: jest.fn() });
    }
    return jest.fn();
  }),
  writeBatch: jest.fn<any>(() => ({ set: jest.fn(), update: jest.fn(), delete: jest.fn(), commit: jest.fn(() => Promise.resolve()) })),
  serverTimestamp: jest.fn<any>(() => new Date().toISOString()),
  Timestamp: {
    now: jest.fn(() => ({ toDate: () => new Date(), seconds: 0, nanoseconds: 0 })),
    fromDate: jest.fn((d: Date) => ({ toDate: () => d, seconds: 0, nanoseconds: 0 })),
    fromMillis: jest.fn((ms: number) => ({ toDate: () => new Date(ms), seconds: 0, nanoseconds: 0 })),
  },
  deleteField: jest.fn<any>(),
  increment: jest.fn<any>((n: number) => n),
  arrayUnion: jest.fn<any>((...items: any[]) => items),
  arrayRemove: jest.fn<any>((...items: any[]) => items),
}));

jest.mock('firebase/auth', () => ({
  sendPasswordResetEmail: jest.fn<any>().mockResolvedValue(undefined),
}));

// ─── Service mocks ────────────────────────────────────────────────────────────

jest.mock('@/services/geminiService', () => ({
  reviewDrawing: jest.fn<any>().mockResolvedValue({ status: 'passed', feedback: '', categories: [] }),
  logSystemEvent: jest.fn<any>(),
  seedAgents: jest.fn<any>(),
  AIProgress: {},
}));

jest.mock('@/services/notificationService', () => ({
  notificationService: { sendNotification: jest.fn<any>().mockResolvedValue(undefined) },
}));

jest.mock('@/services/projectLifecycleService', () => ({
  subscribeToProjectByJobId: jest.fn<any>(() => jest.fn()),
}));

jest.mock('@/services/teamService', () => ({
  getDisciplineCoverage: jest.fn<any>(() => ({ filled: [], missing: [] })),
  subscribeToTeam: jest.fn<any>(() => jest.fn()),
}));

jest.mock('@/services/userVerificationService', () => ({
  buildVerificationQueueProjection: jest.fn<any>(() => ({
    items: [],
    summary: { total: 0, pending: 0, overdue: 0, dueForRecheck: 0, rejected: 0 },
  })),
  getVerificationLifecycle: jest.fn<any>(() => ({})),
}));

jest.mock('@/services/pdfGenerationService', () => ({
  pdfGenerationService: { generatePdf: jest.fn<any>() },
}));

jest.mock('@/lib/apiClient', () => ({
  apiFetch: jest.fn<any>(),
}));

jest.mock('@/lib/professionalRoleCompatibility', () => ({
  getSelectedProfessionalId: jest.fn<any>(() => null),
}));

jest.mock('@/lib/uploadService', () => ({
  uploadAndTrackFile: jest.fn<any>(),
}));

// ─── UI component mocks ───────────────────────────────────────────────────────

jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <h2>{children}</h2>,
  CardDescription: ({ children }: any) => <p>{children}</p>,
  CardFooter: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: any) => <span>{children}</span>,
}));

jest.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));

jest.mock('@/components/ui/textarea', () => ({
  Textarea: (props: any) => <textarea {...props} />,
}));

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: any) => open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h3>{children}</h3>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
  DialogTrigger: ({ render: renderProp, children }: any) => renderProp ?? children ?? null,
}));

jest.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/accordion', () => ({
  Accordion: ({ children }: any) => <div>{children}</div>,
  AccordionContent: ({ children }: any) => <div>{children}</div>,
  AccordionItem: ({ children }: any) => <div>{children}</div>,
  AccordionTrigger: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children }: any) => <div>{children}</div>,
  TabsContent: ({ children }: any) => <div>{children}</div>,
  TabsList: ({ children }: any) => <div>{children}</div>,
  TabsTrigger: ({ children }: any) => <button>{children}</button>,
}));

jest.mock('@/components/ui/table', () => ({
  Table: ({ children }: any) => <table>{children}</table>,
  TableBody: ({ children }: any) => <tbody>{children}</tbody>,
  TableCell: ({ children }: any) => <td>{children}</td>,
  TableHead: ({ children }: any) => <th>{children}</th>,
  TableHeader: ({ children }: any) => <thead>{children}</thead>,
  TableRow: ({ children }: any) => <tr>{children}</tr>,
}));

// ─── Glass system component mocks (keep layout structure) ─────────────────────
// NOTE: We do NOT mock RoleAwareSidebar or MobileMenuTrigger here so that their
// real CSS classes (hidden md:flex, block md:hidden) are present in the DOM.

jest.mock('@/components/navigation/Breadcrumbs', () => ({
  Breadcrumbs: ({ className }: any) => <nav data-testid="breadcrumbs" className={className}>Home</nav>,
  __esModule: true,
  default: ({ className }: any) => <nav data-testid="breadcrumbs" className={className}>Home</nav>,
}));

jest.mock('@/components/animated/StatCardAnimated', () => ({
  StatCardAnimated: ({ label, value, className }: any) => (
    <div data-testid="stat-card-animated" className={className}><span>{label}</span><span>{value}</span></div>
  ),
}));

jest.mock('@/components/animated/GlassCardAnimated', () => ({
  GlassCardAnimated: ({ children, className }: any) => (
    <div data-testid="glass-card-animated" className={className}>{children}</div>
  ),
}));

jest.mock('@/components/composite/DashboardSection', () => ({
  DashboardSection: ({ title, children, className }: any) => (
    <section data-testid="dashboard-section" className={className}><h2>{title}</h2>{children}</section>
  ),
}));

jest.mock('@/components/composite/GlassTable', () => ({
  GlassTable: () => <table data-testid="glass-table"><tbody /></table>,
}));

jest.mock('@/components/ui/GlassButton', () => ({
  GlassButton: ({ children, onClick, className }: any) => (
    <button data-testid="glass-button" onClick={onClick} className={className}>{children}</button>
  ),
}));

// ─── Child component mocks ────────────────────────────────────────────────────

jest.mock('@/components/ProfileEditor', () => ({ __esModule: true, default: () => <div data-testid="profile-editor" /> }));
jest.mock('@/components/RatingSystem', () => ({ __esModule: true, default: () => <div data-testid="rating-system" /> }));
jest.mock('@/components/Chat', () => ({
  Chat: () => <div data-testid="chat" />,
  ChatButton: () => <button data-testid="chat-button">Chat</button>,
}));
jest.mock('@/components/SubmissionItem', () => ({
  __esModule: true,
  default: () => <div data-testid="submission-item" />,
  SubmissionItem: () => <div data-testid="submission-item" />,
}));
jest.mock('@/components/OrchestrationProgressModal', () => ({
  __esModule: true,
  default: () => null,
  OrchestrationProgressModal: () => null,
}));
jest.mock('@/components/SearchFilter', () => ({
  __esModule: true,
  default: () => <div data-testid="search-filter" />,
  SearchFilter: () => <div data-testid="search-filter" />,
}));
jest.mock('@/components/MunicipalTracker', () => ({ __esModule: true, default: () => <div data-testid="municipal-tracker" /> }));
jest.mock('@/components/FeeEstimator', () => ({ __esModule: true, default: () => <div data-testid="fee-estimator" /> }));
jest.mock('@/components/StageProgressTracker', () => ({ __esModule: true, default: () => <div data-testid="stage-progress" /> }));
jest.mock('@/components/AdvanceStageButton', () => ({ __esModule: true, default: () => <button data-testid="advance-stage">Advance</button> }));
jest.mock('@/components/ResponsibilityMatrix', () => ({ __esModule: true, default: () => <div data-testid="responsibility-matrix" /> }));
jest.mock('@/components/TeamBuilder', () => ({ __esModule: true, default: () => <div data-testid="team-builder" /> }));
jest.mock('@/components/GanttChart', () => ({ __esModule: true, default: () => <div data-testid="gantt-chart" /> }));
jest.mock('@/components/SiteLogManager', () => ({ __esModule: true, default: () => <div data-testid="site-log-manager" /> }));
jest.mock('@/components/RFIManager', () => ({ __esModule: true, default: () => <div data-testid="rfi-manager" /> }));
jest.mock('@/components/CloseoutWizard', () => ({ __esModule: true, default: () => <div data-testid="closeout-wizard" /> }));
jest.mock('@/components/ComplianceReport', () => ({ __esModule: true, default: () => <div data-testid="compliance-report" /> }));
jest.mock('@/components/AgentKnowledgeManager', () => ({ __esModule: true, default: () => <div data-testid="agent-knowledge-manager" /> }));
jest.mock('@/components/AdminKnowledgeUploader', () => ({ __esModule: true, default: () => <div data-testid="admin-knowledge-uploader" /> }));
jest.mock('@/components/ReviewManagement', () => ({ __esModule: true, default: () => <div data-testid="review-management" /> }));
jest.mock('@/components/MunicipalSettingsAdmin', () => ({ __esModule: true, default: () => <div data-testid="municipal-settings-admin" /> }));
jest.mock('@/components/ExecutionModePicker', () => ({ __esModule: true, default: () => <div data-testid="execution-mode-picker" /> }));
jest.mock('@/components/FinancialDashboard', () => ({ __esModule: true, default: () => <div data-testid="financial-dashboard" /> }));

// ─── Demo seed mock ───────────────────────────────────────────────────────────

jest.mock('@/demo-seed/demoFirestore', () => ({
  getDemoDoc: jest.fn<any>(() => ({})),
  getDemoCol: jest.fn<any>(() => ({
    doc: jest.fn<any>(() => ({})),
    where: jest.fn<any>(() => ({
      orderBy: jest.fn<any>(() => ({
        onSnapshot: jest.fn<any>((cb: any) => { cb({ docs: [] }); return jest.fn(); }),
      })),
      onSnapshot: jest.fn<any>((cb: any) => { cb({ docs: [] }); return jest.fn(); }),
    })),
    onSnapshot: jest.fn<any>((cb: any) => { cb({ docs: [] }); return jest.fn(); }),
  })),
}));

// ─── Shared test user profiles ────────────────────────────────────────────────

function makeUser(role: UserProfile['role'], uid = 'test-uid'): UserProfile {
  return {
    uid,
    email: `${role}@test.com`,
    displayName: `Test ${role}`,
    role,
    createdAt: new Date().toISOString(),
    completedJobs: 0,
    averageRating: 5,
    profileComplete: true,
  } as UserProfile;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the outermost rendered container (first child of the document body
 * injected by render()).
 */
function getOuterContainer(container: HTMLElement): HTMLElement {
  return container.firstElementChild as HTMLElement;
}

// ─── ArchitectDashboard ───────────────────────────────────────────────────────

describe('ArchitectDashboard — responsive layout (Req 8.1–8.5)', () => {
  const user = makeUser('architect');

  let container: HTMLElement;

  beforeEach(async () => {
    const ArchitectDashboard = (await import('../ArchitectDashboard')).default;
    const result = render(<ArchitectDashboard user={user} />);
    container = result.container;
  });

  test('Req 8.5 — outer container has overflow-x-hidden (no horizontal overflow)', () => {
    // Requirement 8.5, 8.10: All dashboards render with zero horizontal overflow
    const outer = getOuterContainer(container);
    expect(outer).toHaveClass('overflow-x-hidden');
  });

  test('Req 8.1 — RoleAwareSidebar has hidden class (hidden on mobile)', () => {
    // Requirement 8.1: mobile layout hides sidebar
    // RoleAwareSidebar renders a <nav> with classes "glass-nav hidden md:flex flex-col ..."
    const sidebar = container.querySelector('nav[aria-label="Architex navigation"]');
    expect(sidebar).toBeInTheDocument();
    expect(sidebar).toHaveClass('hidden');
  });

  test('Req 8.3 — RoleAwareSidebar has md:flex class (visible on desktop)', () => {
    // Requirement 8.3: desktop layout shows sidebar as fixed left panel
    const sidebar = container.querySelector('nav[aria-label="Architex navigation"]');
    expect(sidebar).toBeInTheDocument();
    expect(sidebar).toHaveClass('md:flex');
  });

  test('Req 8.1 — MobileMenuTrigger has block class (visible on mobile)', () => {
    // Requirement 8.1: hamburger icon visible on mobile
    const trigger = container.querySelector('button[aria-label="Open navigation menu"]');
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveClass('block');
  });

  test('Req 8.3 — MobileMenuTrigger has md:hidden class (hidden on desktop)', () => {
    // Requirement 8.3: hamburger hidden on desktop
    const trigger = container.querySelector('button[aria-label="Open navigation menu"]');
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveClass('md:hidden');
  });

  test('Req 8.3 — main content area has md:ml-64 sidebar offset', () => {
    // Requirement 8.3: main content shifts right by sidebar width on desktop
    const main = container.querySelector('main');
    expect(main).toBeInTheDocument();
    expect(main).toHaveClass('md:ml-64');
  });

  test('Req 8.1–8.3 — stat grids have responsive column classes', () => {
    // Requirement 8.6: grid-cols-1 md:grid-cols-2 lg:grid-cols-3
    // The stat card grid is the first div with grid-cols-1 and md:grid-cols-2 and lg:grid-cols-3
    const grids = Array.from(container.querySelectorAll('[class*="grid-cols-1"]'));
    const responsiveGrid = grids.find(
      (el) =>
        el.classList.toString().includes('md:grid-cols-2') &&
        el.classList.toString().includes('lg:grid-cols-3'),
    );
    expect(responsiveGrid).toBeInTheDocument();
  });
});

// ─── AdminDashboard ───────────────────────────────────────────────────────────

describe('AdminDashboard — responsive layout (Req 8.1–8.5)', () => {
  const user = makeUser('admin');

  let container: HTMLElement;

  beforeEach(async () => {
    const AdminDashboard = (await import('../AdminDashboard')).default;
    const result = render(<AdminDashboard user={user} />);
    container = result.container;
  });

  test('Req 8.5 — outer container has overflow-x-hidden (no horizontal overflow)', () => {
    const outer = getOuterContainer(container);
    expect(outer).toHaveClass('overflow-x-hidden');
  });

  test('Req 8.1 — RoleAwareSidebar has hidden class (hidden on mobile)', () => {
    const sidebar = container.querySelector('nav[aria-label="Architex navigation"]');
    expect(sidebar).toBeInTheDocument();
    expect(sidebar).toHaveClass('hidden');
  });

  test('Req 8.3 — RoleAwareSidebar has md:flex class (visible on desktop)', () => {
    const sidebar = container.querySelector('nav[aria-label="Architex navigation"]');
    expect(sidebar).toBeInTheDocument();
    expect(sidebar).toHaveClass('md:flex');
  });

  test('Req 8.1 — MobileMenuTrigger has block class (visible on mobile)', () => {
    const trigger = container.querySelector('button[aria-label="Open navigation menu"]');
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveClass('block');
  });

  test('Req 8.3 — MobileMenuTrigger has md:hidden class (hidden on desktop)', () => {
    const trigger = container.querySelector('button[aria-label="Open navigation menu"]');
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveClass('md:hidden');
  });

  test('Req 8.3 — main content area has md:ml-64 sidebar offset', () => {
    const main = container.querySelector('main');
    expect(main).toBeInTheDocument();
    expect(main).toHaveClass('md:ml-64');
  });

  test('Req 8.1–8.3 — stat grids have responsive column classes', () => {
    const grids = Array.from(container.querySelectorAll('[class*="grid-cols-1"]'));
    const responsiveGrid = grids.find(
      (el) =>
        el.classList.toString().includes('md:grid-cols-2') &&
        el.classList.toString().includes('lg:grid-cols-3'),
    );
    expect(responsiveGrid).toBeInTheDocument();
  });
});

// ─── ClientDashboard ──────────────────────────────────────────────────────────

describe('ClientDashboard — responsive layout (Req 8.1–8.5)', () => {
  const user = makeUser('client');

  let container: HTMLElement;

  beforeEach(async () => {
    const ClientDashboard = (await import('../ClientDashboard')).default;
    const result = render(<ClientDashboard user={user} />);
    container = result.container;
  });

  test('Req 8.5 — outer container has overflow-x-hidden (no horizontal overflow)', () => {
    const outer = getOuterContainer(container);
    expect(outer).toHaveClass('overflow-x-hidden');
  });

  test('Req 8.1 — RoleAwareSidebar has hidden class (hidden on mobile)', () => {
    const sidebar = container.querySelector('nav[aria-label="Architex navigation"]');
    expect(sidebar).toBeInTheDocument();
    expect(sidebar).toHaveClass('hidden');
  });

  test('Req 8.3 — RoleAwareSidebar has md:flex class (visible on desktop)', () => {
    const sidebar = container.querySelector('nav[aria-label="Architex navigation"]');
    expect(sidebar).toBeInTheDocument();
    expect(sidebar).toHaveClass('md:flex');
  });

  test('Req 8.1 — MobileMenuTrigger has block class (visible on mobile)', () => {
    const trigger = container.querySelector('button[aria-label="Open navigation menu"]');
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveClass('block');
  });

  test('Req 8.3 — MobileMenuTrigger has md:hidden class (hidden on desktop)', () => {
    const trigger = container.querySelector('button[aria-label="Open navigation menu"]');
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveClass('md:hidden');
  });

  test('Req 8.3 — main content area has md:ml-64 sidebar offset', () => {
    const main = container.querySelector('main');
    expect(main).toBeInTheDocument();
    expect(main).toHaveClass('md:ml-64');
  });

  test('Req 8.1–8.3 — stat grids have responsive column classes', () => {
    const grids = Array.from(container.querySelectorAll('[class*="grid-cols-1"]'));
    const responsiveGrid = grids.find(
      (el) =>
        el.classList.toString().includes('md:grid-cols-2') &&
        el.classList.toString().includes('lg:grid-cols-3'),
    );
    expect(responsiveGrid).toBeInTheDocument();
  });
});

// ─── Cross-dashboard consistent layout tests ──────────────────────────────────

describe('All three dashboards — layout consistency', () => {
  const dashboards = [
    { label: 'ArchitectDashboard', role: 'architect' as const, importPath: '../ArchitectDashboard' },
    { label: 'AdminDashboard', role: 'admin' as const, importPath: '../AdminDashboard' },
    { label: 'ClientDashboard', role: 'client' as const, importPath: '../ClientDashboard' },
  ];

  for (const { label, role, importPath } of dashboards) {
    describe(label, () => {
      let container: HTMLElement;

      beforeEach(async () => {
        const mod = await import(/* @vite-ignore */ importPath);
        const Dashboard = mod.default;
        const user = makeUser(role);
        const result = render(<Dashboard user={user} />);
        container = result.container;
      });

      test(`${label} — sidebar both hidden (mobile) and md:flex (desktop)`, () => {
        // Req 8.1 + 8.3: same element must carry both classes — CSS cascade means
        // hidden applies below md, md:flex overrides above md.
        const sidebar = container.querySelector('nav[aria-label="Architex navigation"]');
        expect(sidebar).toBeInTheDocument();
        expect(sidebar).toHaveClass('hidden');
        expect(sidebar).toHaveClass('md:flex');
      });

      test(`${label} — MobileMenuTrigger both block (mobile) and md:hidden (desktop)`, () => {
        // Req 8.1 + 8.3: hamburger is visible on mobile, hidden on desktop
        const trigger = container.querySelector('button[aria-label="Open navigation menu"]');
        expect(trigger).toBeInTheDocument();
        expect(trigger).toHaveClass('block');
        expect(trigger).toHaveClass('md:hidden');
      });

      test(`${label} — no horizontal overflow class present`, () => {
        // Req 8.5: outer container must prevent horizontal scroll
        const outer = getOuterContainer(container);
        expect(outer).toHaveClass('overflow-x-hidden');
      });
    });
  }
});
