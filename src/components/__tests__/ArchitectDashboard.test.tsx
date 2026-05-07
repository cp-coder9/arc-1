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

jest.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div data-testid="tabs">{children}</div>,
  TabsList: ({ children }: { children: React.ReactNode }) => <div data-testid="tabs-list">{children}</div>,
  TabsTrigger: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <button data-testid={`tab-${value}`}>{children}</button>
  ),
  TabsContent: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <div data-testid={`tab-content-${value}`}>{children}</div>
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

jest.mock('@/lib/uploadService', () => ({
  uploadAndTrackFile: jest.fn<any>().mockResolvedValue({
    url: 'https://example.com/file.pdf',
    filename: 'test.pdf',
  }),
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

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn<any>(),
    error: jest.fn<any>(),
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
  Plus: () => <span data-testid="icon">Plus</span>,
  ExternalLink: () => <span data-testid="icon">Link</span>,
  Upload: () => <span data-testid="icon">Upload</span>,
  FileText: () => <span data-testid="icon">File</span>,
  Search: () => <span data-testid="icon">Search</span>,
  MapPin: () => <span data-testid="icon">Map</span>,
  Calendar: () => <span data-testid="icon">Date</span>,
  Building2: () => <span data-testid="icon">Build</span>,
  LayoutDashboard: () => <span data-testid="icon">Dash</span>,
  UserCircle: () => <span data-testid="icon">User</span>,
  LogOut: () => <span data-testid="icon">Exit</span>,
  Menu: () => <span data-testid="icon">Menu</span>,
  X: () => <span data-testid="icon">Close</span>,
  Loader2: () => <span data-testid="icon">Loading</span>,
  Bell: () => <span data-testid="icon">Bell</span>,
  FileSearch: () => <span data-testid="icon">SearchFile</span>,
  Clock: () => <span data-testid="icon">Clock</span>,
  Briefcase: () => <span data-testid="icon">Job</span>,
}));

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

    expect(screen.getByText('4.5/5')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  test('should render profile editor', () => {
    render(<ArchitectDashboard user={mockUser} />);

    expect(screen.getByTestId('profile-editor')).toBeInTheDocument();
  });

  test('should render search filter', () => {
    render(<ArchitectDashboard user={mockUser} />);

    expect(screen.getByTestId('search-filter')).toBeInTheDocument();
  });

  test('should display empty state when no jobs available', () => {
    render(<ArchitectDashboard user={mockUser} />);

    expect(screen.getByText(/No active projects yet/i)).toBeInTheDocument();
  });

  test('should handle tab navigation', () => {
    render(<ArchitectDashboard user={mockUser} activeTab="available" onTabChange={jest.fn()} />);

    expect(screen.getByTestId('tabs')).toBeInTheDocument();
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
