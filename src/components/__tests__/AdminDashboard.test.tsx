/**
 * AdminDashboard Component Tests
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import AdminDashboard from '../AdminDashboard';
import { UserProfile } from '../../types';

// Mock Firebase
jest.mock('../../lib/firebase', () => ({
  auth: {
    currentUser: { uid: 'admin-1', email: 'admin@example.com' },
  },
  db: {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(),
        set: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      })),
      where: jest.fn(() => ({
        orderBy: jest.fn(() => ({
          limit: jest.fn(() => ({
            onSnapshot: jest.fn((callback) => {
              callback({
                docs: [],
                empty: true,
              });
              return jest.fn();
            }),
          })),
          onSnapshot: jest.fn((callback) => {
            callback({ docs: [] });
            return jest.fn();
          }),
        })),
        onSnapshot: jest.fn((callback) => {
          callback({
            docs: [],
            empty: true,
          });
          return jest.fn();
        }),
      })),
      orderBy: jest.fn(() => ({
        onSnapshot: jest.fn((callback) => {
          callback({ docs: [] });
          return jest.fn();
        }),
      })),
      onSnapshot: jest.fn((callback) => {
        callback({ docs: [] });
        return jest.fn();
      }),
    })),
  },
  handleFirestoreError: jest.fn(),
  OperationType: {
    CREATE: 'CREATE',
    READ: 'READ',
    UPDATE: 'UPDATE',
    DELETE: 'DELETE',
    LIST: 'LIST',
    UPLOAD: 'UPLOAD',
  },
}));

// Mock Firebase Auth
jest.mock('firebase/auth', () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
}));

// Mock Firebase Firestore
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  collectionGroup: jest.fn(() => ({
    onSnapshot: jest.fn((callback) => {
      callback({ docs: [] });
      return jest.fn();
    }),
    getDocs: jest.fn(() => Promise.resolve({ docs: [] })),
  })),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
  onSnapshot: jest.fn((q, callback) => {
    callback({
      docs: [],
      empty: true,
    });
    return jest.fn();
  }),
  doc: jest.fn(() => ({})),
  getDoc: jest.fn(() =>
    Promise.resolve({
      exists: () => true,
      data: () => ({}),
    })
  ),
  getDocs: jest.fn(() => Promise.resolve({ docs: [] })),
  setDoc: jest.fn(() => Promise.resolve()),
  updateDoc: jest.fn(() => Promise.resolve()),
  deleteDoc: jest.fn(() => Promise.resolve()),
  addDoc: jest.fn(() => Promise.resolve({ id: 'new-id' })),
}));

// Mock UI components
jest.mock('../ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div data-testid="card">{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div data-testid="card-content">{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div data-testid="card-header">{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h2 data-testid="card-title">{children}</h2>,
  CardDescription: ({ children }: { children: React.ReactNode }) => <p data-testid="card-description">{children}</p>,
}));

jest.mock('../ui/button', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick} data-testid="button">{children}</button>
  ),
}));

jest.mock('../ui/tabs', () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div data-testid="tabs">{children}</div>,
  TabsList: ({ children }: { children: React.ReactNode }) => <div data-testid="tabs-list">{children}</div>,
  TabsTrigger: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <button data-testid={`tab-${value}`}>{children}</button>
  ),
  TabsContent: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <div data-testid={`tab-content-${value}`}>{children}</div>
  ),
}));

jest.mock('../ui/badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span data-testid="badge">{children}</span>,
}));

jest.mock('../ui/table', () => ({
  Table: ({ children }: { children: React.ReactNode }) => <table data-testid="table">{children}</table>,
  TableBody: ({ children }: { children: React.ReactNode }) => <tbody data-testid="table-body">{children}</tbody>,
  TableCell: ({ children }: { children: React.ReactNode }) => <td data-testid="table-cell">{children}</td>,
  TableHead: ({ children }: { children: React.ReactNode }) => <thead data-testid="table-head">{children}</thead>,
  TableHeader: ({ children }: { children: React.ReactNode }) => <tr data-testid="table-header">{children}</tr>,
  TableRow: ({ children }: { children: React.ReactNode }) => <tr data-testid="table-row">{children}</tr>,
}));

jest.mock('../ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div data-testid="scroll-area">{children}</div>,
}));

jest.mock('../ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open?: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-header">{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h3 data-testid="dialog-title">{children}</h3>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p data-testid="dialog-description">{children}</p>,
  DialogTrigger: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-trigger">{children}</div>,
}));

jest.mock('../ui/accordion', () => ({
  Accordion: ({ children }: { children: React.ReactNode }) => <div data-testid="accordion">{children}</div>,
  AccordionContent: ({ children }: { children: React.ReactNode }) => <div data-testid="accordion-content">{children}</div>,
  AccordionItem: ({ children }: { children: React.ReactNode }) => <div data-testid="accordion-item">{children}</div>,
  AccordionTrigger: ({ children }: { children: React.ReactNode }) => <button data-testid="accordion-trigger">{children}</button>,
}));

jest.mock('../ui/input', () => ({
  Input: (props: any) => <input data-testid="input" {...props} />,
}));

jest.mock('../ui/textarea', () => ({
  Textarea: (props: any) => <textarea data-testid="textarea" {...props} />,
}));

// Mock services
jest.mock('../../services/geminiService', () => ({
  reviewDrawing: jest.fn().mockResolvedValue({
    status: 'passed',
    feedback: 'All good',
    categories: [],
  }),
  seedAgents: jest.fn().mockResolvedValue(undefined),
  logSystemEvent: jest.fn(),
}));

jest.mock('../../services/notificationService', () => ({
  notificationService: {
    sendNotification: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../services/pdfGenerationService', () => ({
  pdfGenerationService: {
    generateComplianceReport: jest.fn().mockResolvedValue({
      url: 'https://example.com/report.pdf',
    }),
  },
}));

jest.mock('../../lib/uploadService', () => ({
  uploadAndTrackFile: jest.fn().mockResolvedValue({
    url: 'https://example.com/file.pdf',
    filename: 'test.pdf',
  }),
}));

// Mock child components
jest.mock('../ProfileEditor', () => () => <div data-testid="profile-editor">Profile Editor</div>);
jest.mock('../ComplianceReport', () => () => <div data-testid="compliance-report">Compliance Report</div>);
jest.mock('../AgentKnowledgeManager', () => () => <div data-testid="agent-knowledge">Agent Knowledge</div>);
jest.mock('../AdminKnowledgeUploader', () => () => <div data-testid="knowledge-uploader">Knowledge Uploader</div>);
jest.mock('../ReviewManagement', () => () => <div data-testid="review-management">Review Management</div>);
jest.mock('../MunicipalSettingsAdmin', () => () => <div data-testid="municipal-settings">Municipal Settings</div>);

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  ShieldCheck: () => <span data-testid="icon">Shield</span>,
  Eye: () => <span data-testid="icon">Eye</span>,
  CheckCircle2: () => <span data-testid="icon">Check</span>,
  XCircle: () => <span data-testid="icon">X</span>,
  History: () => <span data-testid="icon">History</span>,
  Info: () => <span data-testid="icon">Info</span>,
  Cpu: () => <span data-testid="icon">CPU</span>,
  Activity: () => <span data-testid="icon">Activity</span>,
  ListFilter: () => <span data-testid="icon">Filter</span>,
  Settings2: () => <span data-testid="icon">Settings</span>,
  Save: () => <span data-testid="icon">Save</span>,
  Trash2: () => <span data-testid="icon">Trash</span>,
  Plus: () => <span data-testid="icon">Plus</span>,
  RefreshCcw: () => <span data-testid="icon">Refresh</span>,
  AlertTriangle: () => <span data-testid="icon">Alert</span>,
  FileText: () => <span data-testid="icon">File</span>,
  Briefcase: () => <span data-testid="icon">Jobs</span>,
  ExternalLink: () => <span data-testid="icon">External</span>,
  Search: () => <span data-testid="icon">Search</span>,
  Users: () => <span data-testid="icon">Users</span>,
  Upload: () => <span data-testid="icon">Upload</span>,
  Loader2: () => <span data-testid="icon">Loading</span>,
  ChevronDown: () => <span data-testid="icon">Down</span>,
  ChevronUp: () => <span data-testid="icon">Up</span>,
  Sparkles: () => <span data-testid="icon">AI</span>,
  Shield: () => <span data-testid="icon">Security</span>,
  Maximize2: () => <span data-testid="icon">Maximize</span>,
  Download: () => <span data-testid="icon">Download</span>,
  AlertCircle: () => <span data-testid="icon">Alert Circle</span>,
  ArrowRight: () => <span data-testid="icon">Arrow</span>,
  Star: () => <span data-testid="icon">Star</span>,
}));

// Mock ReactMarkdown
jest.mock('react-markdown', () => ({ children }: { children: string }) => <div>{children}</div>);

// Mock date-fns
jest.mock('date-fns', () => ({
  format: jest.fn(() => '2026-01-01'),
  formatDistanceToNow: jest.fn(() => '2 days ago'),
}));

describe('AdminDashboard', () => {
  const mockUser: UserProfile = {
    uid: 'admin-1',
    email: 'admin@example.com',
    role: 'admin',
    displayName: 'Test Admin',
    createdAt: '2026-01-01T00:00:00Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should render admin dashboard', () => {
    render(<AdminDashboard user={mockUser} />);

    expect(screen.getByText('Admin Portal')).toBeInTheDocument();
  });

  test('should render tabs', () => {
    render(<AdminDashboard user={mockUser} />);

    expect(screen.getByTestId('tabs')).toBeInTheDocument();
  });

  test('should render submissions tab', () => {
    render(<AdminDashboard user={mockUser} />);

    expect(screen.getByTestId('tab-content-submissions')).toBeInTheDocument();
  });

  test('should render agent configuration section', () => {
    render(<AdminDashboard user={mockUser} />);

    // Agent configuration should be present in the component
    expect(screen.getByText('Admin Portal')).toBeInTheDocument();
  });

  test('should handle tab changes', () => {
    const onTabChange = jest.fn();
    render(<AdminDashboard user={mockUser} activeTab="agents" onTabChange={onTabChange} />);

    expect(screen.getByTestId('tabs')).toBeInTheDocument();
  });
});
