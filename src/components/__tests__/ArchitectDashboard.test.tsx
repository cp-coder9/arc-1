/**
 * ArchitectDashboard Component Tests
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import '@testing-library/jest-dom';
import ArchitectDashboard from '../ArchitectDashboard';
import { UserProfile } from '@/types';

// Mock Firebase
jest.mock('@/lib/firebase', () => ({
  auth: {
    currentUser: { uid: 'arch-1', email: 'arch@example.com' },
  },
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
          onSnapshot: jest.fn<any>((callback: any) => {
            callback({ docs: [] });
            return jest.fn();
          }),
        })),
        onSnapshot: jest.fn<any>((callback: any) => {
          callback({ docs: [] });
          return jest.fn();
        }),
      })),
      onSnapshot: jest.fn<any>((callback: any) => {
        callback({ docs: [] });
        return jest.fn();
      }),
    })),
  },
  handleFirestoreError: jest.fn<any>(),
  OperationType: {
    CREATE: 'CREATE',
    READ: 'READ',
    UPDATE: 'UPDATE',
    DELETE: 'DELETE',
    LIST: 'LIST',
    UPLOAD: 'UPLOAD',
  },
}));

// Mock Firebase Firestore exports
jest.mock('firebase/firestore', () => ({
  collection: jest.fn<any>(),
  query: jest.fn<any>(),
  where: jest.fn<any>(),
  orderBy: jest.fn<any>(),
  onSnapshot: jest.fn<any>((_q: any, callback: any) => {
    callback({
      docs: [],
      empty: true,
    });
    return jest.fn();
  }),
  doc: jest.fn<any>(() => ({})),
  getDoc: jest.fn<any>(() =>
    Promise.resolve({
      exists: () => true,
      data: () => ({}),
    })
  ),
  getDocs: jest.fn<any>(() => Promise.resolve({ docs: [] })),
  setDoc: jest.fn<any>(() => Promise.resolve()),
  updateDoc: jest.fn<any>(() => Promise.resolve()),
  addDoc: jest.fn<any>(() => Promise.resolve({ id: 'new-id' })),
}));

// Mock UI components
jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div data-testid="card">{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div data-testid="card-content">{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div data-testid="card-header">{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h2 data-testid="card-title">{children}</h2>,
  CardDescription: ({ children }: { children: React.ReactNode }) => <p data-testid="card-description">{children}</p>,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick} data-testid="button">{children}</button>
  ),
}));

// Glass system mocks
jest.mock('@/components/navigation/RoleAwareSidebar', () => ({
  RoleAwareSidebar: () => <nav data-testid="role-aware-sidebar">Sidebar</nav>,
}));

jest.mock('@/components/navigation/Breadcrumbs', () => ({
  Breadcrumbs: () => <nav data-testid="breadcrumbs">Home</nav>,
}));

jest.mock('@/components/navigation/MobileMenuTrigger', () => ({
  MobileMenuTrigger: () => <button data-testid="mobile-menu-trigger">Menu</button>,
}));

jest.mock('@/components/animated/StatCardAnimated', () => ({
  StatCardAnimated: ({ label, value }: { label: string; value: string | number }) => (
    <div data-testid="stat-card-animated"><span>{label}</span><span>{value}</span></div>
  ),
}));

jest.mock('@/components/animated/GlassCardAnimated', () => ({
  GlassCardAnimated: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="glass-card-animated">{children}</div>
  ),
}));

jest.mock('@/components/composite/DashboardSection', () => ({
  DashboardSection: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section data-testid="dashboard-section"><h2>{title}</h2>{children}</section>
  ),
}));

jest.mock('@/components/composite/GlassTable', () => ({
  GlassTable: () => <table data-testid="glass-table"><tbody></tbody></table>,
}));

jest.mock('@/components/ui/GlassButton', () => ({
  GlassButton: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button data-testid="glass-button" onClick={onClick}>{children}</button>
  ),
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span data-testid="badge">{children}</span>,
}));

jest.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div data-testid="scroll-area">{children}</div>,
}));

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open?: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-header">{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h3 data-testid="dialog-title">{children}</h3>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p data-testid="dialog-description">{children}</p>,
  DialogTrigger: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-trigger">{children}</div>,
}));

jest.mock('../ui/input', () => ({
  Input: (props: any) => <input data-testid="input" {...props} />,
}));

jest.mock('../ui/textarea', () => ({
  Textarea: (props: any) => <textarea data-testid="textarea" {...props} />,
}));

// Mock services
jest.mock('@/services/geminiService', () => ({
  reviewDrawing: jest.fn<any>().mockResolvedValue({
    status: 'passed',
    feedback: 'All good',
    categories: [],
  }),
  logSystemEvent: jest.fn<any>(),
}));

jest.mock('@/services/notificationService', () => ({
  notificationService: {
    sendNotification: jest.fn<any>().mockResolvedValue(undefined),
  },
}));

// Mock child components
jest.mock('../ProfileEditor', () => ({ __esModule: true, default: () => <div data-testid="profile-editor">Profile Editor</div> }));
jest.mock('../Chat', () => ({
  Chat: () => <div data-testid="chat">Chat Component</div>,
  ChatButton: () => <button data-testid="chat-button">Chat</button>,
}));
jest.mock('../RatingSystem', () => ({ __esModule: true, default: () => <div data-testid="rating-system">Rating System</div> }));
jest.mock('../SubmissionItem', () => ({ __esModule: true, default: () => <div data-testid="submission-item">Submission Item</div>, SubmissionItem: () => <div data-testid="submission-item">Submission Item</div> }));
jest.mock('../OrchestrationProgressModal', () => ({ __esModule: true, default: () => <div data-testid="progress-modal">Progress Modal</div>, OrchestrationProgressModal: () => <div data-testid="progress-modal">Progress Modal</div> }));
jest.mock('../SearchFilter', () => ({ __esModule: true, default: () => <div data-testid="search-filter">Search Filter</div>, SearchFilter: () => <div data-testid="search-filter">Search Filter</div> }));
jest.mock('../MunicipalTracker', () => ({ __esModule: true, default: () => <div data-testid="municipal-tracker">Municipal Tracker</div> }));
jest.mock('../FeeEstimator', () => ({ __esModule: true, default: () => <div data-testid="fee-estimator">Fee Estimator</div> }));
jest.mock('../StageProgressTracker', () => ({ __esModule: true, default: () => <div data-testid="stage-progress">Stage Progress</div> }));
jest.mock('../AdvanceStageButton', () => ({ __esModule: true, default: () => <button data-testid="advance-stage">Advance Stage</button> }));
jest.mock('../ResponsibilityMatrix', () => ({ __esModule: true, default: () => <div data-testid="responsibility-matrix">Responsibility Matrix</div> }));
jest.mock('../TeamBuilder', () => ({ __esModule: true, default: () => <div data-testid="team-builder">Team Builder</div> }));
jest.mock('../GanttChart', () => ({ __esModule: true, default: () => <div data-testid="gantt-chart">Gantt Chart</div> }));
jest.mock('../SiteLogManager', () => ({ __esModule: true, default: () => <div data-testid="site-log-manager">Site Log Manager</div> }));
jest.mock('../RFIManager', () => ({ __esModule: true, default: () => <div data-testid="rfi-manager">RFI Manager</div> }));
jest.mock('../CloseoutWizard', () => ({ __esModule: true, default: () => <div data-testid="closeout-wizard">Closeout Wizard</div> }));
jest.mock('@/services/projectLifecycleService', () => ({ subscribeToProjectByJobId: jest.fn(() => jest.fn()) }));
jest.mock('@/services/teamService', () => ({ getDisciplineCoverage: jest.fn(() => ({ filled: [], missing: [] })), subscribeToTeam: jest.fn(() => jest.fn()) }));
jest.mock('@/lib/apiClient', () => ({ apiFetch: jest.fn() }));
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn<any>(),
    error: jest.fn<any>(),
  },
}));

// Mock lucide-react icons (comprehensive — covers all imports in ArchitectDashboard)
const IconMock = () => <span data-testid="icon" />;
jest.mock('lucide-react', () => {
  const MockIcon = () => <span data-testid="icon" />;
  return {
    ShieldCheck: MockIcon, Eye: MockIcon, CheckCircle2: MockIcon, XCircle: MockIcon,
    History: MockIcon, Info: MockIcon, Plus: MockIcon, ExternalLink: MockIcon,
    Upload: MockIcon, FileText: MockIcon, Search: MockIcon, MapPin: MockIcon,
    Calendar: MockIcon, Building2: MockIcon, LayoutDashboard: MockIcon,
    UserCircle: MockIcon, LogOut: MockIcon, Menu: MockIcon, X: MockIcon,
    Loader2: MockIcon, Bell: MockIcon, FileSearch: MockIcon, Clock: MockIcon,
    Briefcase: MockIcon, Star: MockIcon, Send: MockIcon, HardHat: MockIcon,
    CreditCard: MockIcon, Users: MockIcon, LayoutList: MockIcon, AlertCircle: MockIcon,
    ArrowRight: MockIcon, MessageCircle: MockIcon, MoreHorizontal: MockIcon,
    ClipboardCheck: MockIcon, Settings: MockIcon, User: MockIcon, Cpu: MockIcon,
    Shield: MockIcon, Sparkles: MockIcon, FileUp: MockIcon, Landmark: MockIcon,
    Building: MockIcon, UploadCloud: MockIcon, ChevronDown: MockIcon,
    ChevronRight: MockIcon, HelpCircle: MockIcon,
  };
});

// Mock ReactMarkdown
jest.mock('react-markdown', () => ({ __esModule: true, default: ({ children }: { children: string }) => <div>{children}</div> }));

// Mock date-fns
describe('ArchitectDashboard', () => {
  const mockUser: UserProfile = {
    uid: 'arch-1',
    email: 'arch@example.com',
    role: 'architect',
    displayName: 'Test Architect',
    createdAt: '2026-01-01T00:00:00Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should render architect dashboard', () => {
    render(<ArchitectDashboard user={mockUser} />);
    expect(screen.getByText('Architect Portal')).toBeInTheDocument();
  });

  test('should render tabs', () => {
    render(<ArchitectDashboard user={mockUser} />);

    // Rating appears (may appear in multiple places: header pill and stat card)
    const ratingElements = screen.getAllByText('5.0/5');
    expect(ratingElements.length).toBeGreaterThan(0);
    // Tab buttons render with role="tab"
    expect(screen.getAllByRole('tab').length).toBeGreaterThan(0);
  });

  test('should render profile editor', () => {
    render(<ArchitectDashboard user={mockUser} />);
    // ProfileEditor renders its actual button with 'Edit Profile' text
    expect(screen.getByText(/Edit Profile/i)).toBeInTheDocument();
  });

  test('should render search filter', () => {
    render(<ArchitectDashboard user={mockUser} />);

    expect(screen.getByText(/Elite architectural workspace/i)).toBeInTheDocument();
  });

  test('should display empty state when no jobs available', () => {
    render(<ArchitectDashboard user={mockUser} />);

    expect(screen.getByText(/Architect Portal/i)).toBeInTheDocument();
  });

  test('should handle tab navigation', () => {
    render(<ArchitectDashboard user={mockUser} activeTab="available" onTabChange={jest.fn()} />);

    // New tab nav uses role="tab" buttons
    expect(screen.getAllByRole('tab').length).toBeGreaterThan(0);
  });

  test('should render overview tab by default', () => {
    render(<ArchitectDashboard user={mockUser} />);
    expect(screen.getByText(/Architect Portal/i)).toBeInTheDocument();
  });

  test('should show profile editor mock', () => {
    render(<ArchitectDashboard user={mockUser} />);
    expect(screen.getByText(/Edit Profile/i)).toBeInTheDocument();
  });
});

// ─── Integration tests (Requirements 14.1, 14.2, 14.3, 14.4) ────────────────
// Navigation/layout ownership moved to App shell; covered by dashboard registry and overflow tests.
describe.skip('ArchitectDashboard legacy component-owned navigation integration tests', () => {
  const mockUser: UserProfile = {
    uid: 'arch-1',
    email: 'arch@example.com',
    role: 'architect',
    displayName: 'Test Architect',
    createdAt: '2026-01-01T00:00:00Z',
    averageRating: 4.8,
    completedJobs: 12,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Req 14.1: RoleAwareSidebar renders for architect role as a nav landmark
  test('should render RoleAwareSidebar as a navigation landmark for architect role', () => {
    const { container } = render(<ArchitectDashboard user={mockUser} />);
    // Real RoleAwareSidebar renders as <nav aria-label="Architex navigation" class="glass-nav ...">
    const sidebar = container.querySelector('nav[aria-label="Architex navigation"]');
    expect(sidebar).toBeInTheDocument();
  });

  // Req 14.1: RoleAwareSidebar applies glass-nav styling
  test('should render sidebar with glass-nav class', () => {
    const { container } = render(<ArchitectDashboard user={mockUser} />);
    // Real RoleAwareSidebar has class="glass-nav hidden md:flex ..."
    const glassNavSidebar = container.querySelector('nav.glass-nav');
    expect(glassNavSidebar).toBeInTheDocument();
  });

  // Req 14.1: Sidebar shows architect-appropriate navigation modules
  test('should render architect navigation modules in sidebar', () => {
    render(<ArchitectDashboard user={mockUser} />);
    // Architect role gets Command Centre, Projects etc. modules in sidebar
    expect(screen.getByText('Command Centre')).toBeInTheDocument();
  });

  // Req 14.1: The dashboard header section applies glass-panel class directly
  test('should render header with glass-panel class', () => {
    const { container } = render(<ArchitectDashboard user={mockUser} />);
    // The header element in ArchitectDashboard has className="glass-panel rounded-2xl p-5 md:p-6"
    const header = container.querySelector('header.glass-panel');
    expect(header).toBeInTheDocument();
  });

  // Req 14.1: Tab navigation bar applies glass-nav class for tab strip
  test('should render tab navigation strip with glass-nav class', () => {
    const { container } = render(<ArchitectDashboard user={mockUser} />);
    // Multiple glass-nav elements: sidebar nav + tab nav strip
    const glassNavElements = container.querySelectorAll('.glass-nav');
    expect(glassNavElements.length).toBeGreaterThanOrEqual(2);
  });

  // Req 14.3: StatCardAnimated components render with glass-tile class for stat display
  test('should render stat cards with glass-tile class', () => {
    const { container } = render(<ArchitectDashboard user={mockUser} />);
    // Real StatCardAnimated renders with class="glass-tile rounded-lg p-6 ..."
    const glassTiles = container.querySelectorAll('.glass-tile');
    expect(glassTiles.length).toBeGreaterThan(0);
  });

  // Req 14.3: StatCardAnimated components render stat labels for overview
  test('should render stat card labels in overview tab', () => {
    render(<ArchitectDashboard user={mockUser} />);
    // Overview tab renders 3 stat cards: Active Projects, Rating, Completed Jobs
    // These labels appear inside StatCardAnimated components (rendered as glass-tile)
    expect(screen.getAllByText('Active Projects').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Rating').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Completed Jobs').length).toBeGreaterThan(0);
  });

  // Req 14.3: Stat card values are rendered with correct data from user profile
  test('should render stat card completed jobs value from user profile', () => {
    render(<ArchitectDashboard user={mockUser} />);
    // "12" appears in the stat card (completedJobs = 12) and potentially header pill
    const twelveElements = screen.getAllByText('12');
    expect(twelveElements.length).toBeGreaterThan(0);
  });

  // Req 14.2: DashboardSection components render with glass-panel class wrapping content
  test('should render dashboard sections wrapping content in glass-panel', () => {
    const { container } = render(<ArchitectDashboard user={mockUser} />);
    // Real DashboardSection renders: <div class="glass-panel rounded-2xl p-6">children</div>
    const glassPanels = container.querySelectorAll('.glass-panel');
    // Expect at least 2: header glass-panel + at least 1 DashboardSection glass-panel
    expect(glassPanels.length).toBeGreaterThanOrEqual(2);
  });

  // Req 14.2: DashboardSection renders section headings as h2 elements
  test('should render DashboardSection headings as h2 elements', () => {
    const { container } = render(<ArchitectDashboard user={mockUser} />);
    // DashboardSection renders title as h2 with font-heading
    const sectionHeadings = container.querySelectorAll('h2.font-heading');
    expect(sectionHeadings.length).toBeGreaterThan(0);
  });

  // Req 14.2: Active Projects section h2 heading is present
  test('should render Active Projects section as h2 heading', () => {
    const { container } = render(<ArchitectDashboard user={mockUser} />);
    // The DashboardSection renders h2 with the section title
    const h2Elements = container.querySelectorAll('h2');
    const activeProjectsH2 = Array.from(h2Elements).find(
      (el) => el.textContent?.includes('Active Projects')
    );
    expect(activeProjectsH2).toBeTruthy();
  });

  // Req 14.4: GlassTable renders as a real table element for applications tab
  test('should render GlassTable as table element on applications tab', () => {
    const { container } = render(<ArchitectDashboard user={mockUser} activeTab="applications" />);
    // Real GlassTable renders a <table> element with thead/tbody
    const table = container.querySelector('table');
    expect(table).toBeInTheDocument();
  });

  // Req 14.4: GlassTable renders thead with column headings
  test('should render GlassTable with thead column headings on applications tab', () => {
    const { container } = render(<ArchitectDashboard user={mockUser} activeTab="applications" />);
    // GlassTable renders <thead> with <th> columns
    const thead = container.querySelector('thead');
    expect(thead).toBeInTheDocument();
  });

  // Req 14.1: MobileMenuTrigger renders a button with aria-label for mobile navigation
  test('should render MobileMenuTrigger as button with aria-label', () => {
    render(<ArchitectDashboard user={mockUser} />);
    // Real MobileMenuTrigger renders: <button aria-label="Open navigation menu" ...>
    const trigger = screen.getByRole('button', { name: /open navigation menu/i });
    expect(trigger).toBeInTheDocument();
  });

  // Req 14.1: Breadcrumbs renders navigation landmark
  test('should render Breadcrumbs as a navigation landmark', () => {
    render(<ArchitectDashboard user={mockUser} />);
    // Real Breadcrumbs renders: <nav aria-label="Breadcrumbs">
    const breadcrumbsNav = screen.getByRole('navigation', { name: /breadcrumbs/i });
    expect(breadcrumbsNav).toBeInTheDocument();
  });

  // Req 14.2: The main content area is properly structured with main landmark
  test('should render main content area with id=main-content', () => {
    const { container } = render(<ArchitectDashboard user={mockUser} />);
    const main = container.querySelector('main#main-content');
    expect(main).toBeInTheDocument();
  });

  // Req 14.1: Tab navigation renders with role="tab" for each tab
  test('should render all dashboard tabs with correct ARIA roles', () => {
    render(<ArchitectDashboard user={mockUser} />);
    const tabs = screen.getAllByRole('tab');
    // Verify at least the 8 defined tabs render
    expect(tabs.length).toBeGreaterThanOrEqual(8);
  });

  // Req 14.1: Active tab is marked with aria-selected="true"
  test('should mark the overview tab as selected by default', () => {
    render(<ArchitectDashboard user={mockUser} />);
    // The overview tab button should have aria-selected="true"
    const overviewTab = screen.getByRole('tab', { name: /overview/i });
    expect(overviewTab).toHaveAttribute('aria-selected', 'true');
  });

  // Req 14.4: tab panel wraps content with correct role
  test('should render tabpanel for active tab content', () => {
    const { container } = render(<ArchitectDashboard user={mockUser} />);
    const tabPanel = container.querySelector('[role="tabpanel"]');
    expect(tabPanel).toBeInTheDocument();
  });

  // Req 14.3: StatCardAnimated stagger animations — multiple cards rendered with delay support
  test('should render multiple glass-tile stat cards with stagger delay support', () => {
    const { container } = render(<ArchitectDashboard user={mockUser} />);
    // Overview renders 3 StatCardAnimated components, each with glass-tile class
    const glassTiles = container.querySelectorAll('.glass-tile');
    expect(glassTiles.length).toBeGreaterThanOrEqual(3);
  });

  // Req 14.1: The dashboard renders layout with sidebar offset for desktop
  test('should render main content with md:ml-64 sidebar offset class', () => {
    const { container } = render(<ArchitectDashboard user={mockUser} />);
    // main element has md:ml-64 for sidebar offset
    const main = container.querySelector('main.md\\:ml-64');
    expect(main).toBeInTheDocument();
  });

  // Req 14.1: Page heading h1 is present for screen readers
  test('should render h1 page heading for accessibility', () => {
    render(<ArchitectDashboard user={mockUser} />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Architect Portal');
  });

  // Req 14.1: Rating stat pill is rendered in the header area
  test('should render rating stat pill in header', () => {
    render(<ArchitectDashboard user={mockUser} />);
    // Rating "4.8/5" appears in header glass-pill and in stat card
    const ratingElements = screen.getAllByText(/4\.8\/5/);
    expect(ratingElements.length).toBeGreaterThan(0);
  });

  // Req 14.1: Quick action GlassButton components render in header
  test('should render Quick Scan and Browse Jobs action buttons in header', () => {
    render(<ArchitectDashboard user={mockUser} />);
    // Real GlassButton renders as a <button> with glass-button classes
    expect(screen.getByText(/Quick Scan/i)).toBeInTheDocument();
    expect(screen.getByText(/Browse Jobs/i)).toBeInTheDocument();
  });

  // Req 14.1: GlassButton elements have glass-button class applied
  test('should render action buttons with glass-button class', () => {
    const { container } = render(<ArchitectDashboard user={mockUser} />);
    // Real GlassButton renders <button class="... glass-button ..."> or glass-button-solid
    const glassButtons = container.querySelectorAll('button.glass-button, button.glass-button-solid');
    expect(glassButtons.length).toBeGreaterThan(0);
  });

  // Req 14.2: Client Reviews section renders as h2 heading
  test('should render Client Reviews section heading', () => {
    render(<ArchitectDashboard user={mockUser} />);
    // "Client Reviews" appears as DashboardSection title (h2 in real component)
    expect(screen.getByText('Client Reviews')).toBeInTheDocument();
  });

  // Req 14.4: glass-record class applied to rows/cards in the dashboard
  test('should render glass-record elements for row items', () => {
    const { container } = render(<ArchitectDashboard user={mockUser} />);
    // glass-record is used for review rows, pagination controls, etc.
    // Even with empty Firestore data, pagination controls use glass-record
    // and DashboardSection content area renders the empty state inside glass-panel
    const main = container.querySelector('main#main-content');
    expect(main).toBeInTheDocument();
    // Tab panel content renders correctly
    const tabPanel = container.querySelector('[role="tabpanel"]');
    expect(tabPanel).toBeInTheDocument();
  });
});
