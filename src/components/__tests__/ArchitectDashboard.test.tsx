/**
 * ArchitectDashboard Component Tests
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import ArchitectDashboard from '../ArchitectDashboard';
import { UserProfile } from '../../types';

// Mock Firebase
jest.mock('../../lib/firebase', () => ({
  auth: {
    currentUser: { uid: 'arch-1', email: 'arch@example.com' },
  },
  db: {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(),
        set: jest.fn(),
        update: jest.fn(),
      })),
      where: jest.fn(() => ({
        orderBy: jest.fn(() => ({
          onSnapshot: jest.fn((callback) => {
            callback({
              docs: [],
              empty: true,
            });
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

// Mock Firebase Firestore
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  collectionGroup: jest.fn(() => ({
    where: jest.fn(() => ({
      onSnapshot: jest.fn((callback) => {
        callback({ docs: [] });
        return jest.fn();
      }),
    })),
  })),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
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
  addDoc: jest.fn(() => Promise.resolve({ id: 'new-id' })),
  updateDoc: jest.fn(() => Promise.resolve()),
}));

// Mock UI components
jest.mock('../ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div data-testid="card">{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div data-testid="card-content">{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div data-testid="card-header">{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h2 data-testid="card-title">{children}</h2>,
  CardDescription: ({ children }: { children: React.ReactNode }) => <p data-testid="card-description">{children}</p>,
  CardFooter: ({ children }: { children: React.ReactNode }) => <div data-testid="card-footer">{children}</div>,
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

jest.mock('../ui/avatar', () => ({
  Avatar: ({ children }: { children: React.ReactNode }) => <div data-testid="avatar">{children}</div>,
  AvatarImage: () => <img data-testid="avatar-image" alt="avatar" />,
  AvatarFallback: ({ children }: { children: React.ReactNode }) => <span data-testid="avatar-fallback">{children}</span>,
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

// Mock services
jest.mock('../../services/geminiService', () => ({
  reviewDrawing: jest.fn().mockResolvedValue({
    status: 'passed',
    feedback: 'All good',
    categories: [],
  }),
  logSystemEvent: jest.fn(),
}));

jest.mock('../../services/notificationService', () => ({
  notificationService: {
    sendNotification: jest.fn().mockResolvedValue(undefined),
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
jest.mock('../Chat', () => ({
  Chat: () => <div data-testid="chat">Chat Component</div>,
  ChatButton: () => <button data-testid="chat-button">Chat</button>,
}));
jest.mock('../RatingSystem', () => () => <div data-testid="rating-system">Rating System</div>);
jest.mock('../SubmissionItem', () => () => <div data-testid="submission-item">Submission Item</div>);
jest.mock('../OrchestrationProgressModal', () => () => <div data-testid="progress-modal">Progress Modal</div>);
jest.mock('../SearchFilter', () => () => <div data-testid="search-filter">Search Filter</div>);
jest.mock('../MunicipalTracker', () => () => <div data-testid="municipal-tracker">Municipal Tracker</div>);

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
  Search: () => <span data-testid="icon">Search</span>,
  Briefcase: () => <span data-testid="icon">Jobs</span>,
  FileUp: () => <span data-testid="icon">Upload</span>,
  CheckCircle2: () => <span data-testid="icon">Check</span>,
  Clock: () => <span data-testid="icon">Clock</span>,
  AlertCircle: () => <span data-testid="icon">Alert</span>,
  ExternalLink: () => <span data-testid="icon">External</span>,
  CreditCard: () => <span data-testid="icon">Payments</span>,
  Landmark: () => <span data-testid="icon">Council</span>,
  Building: () => <span data-testid="icon">Building</span>,
  UploadCloud: () => <span data-testid="icon">Upload Cloud</span>,
  ShieldCheck: () => <span data-testid="icon">Shield</span>,
  History: () => <span data-testid="icon">History</span>,
  Star: () => <span data-testid="icon">Star</span>,
  Send: () => <span data-testid="icon">Send</span>,
  Loader2: () => <span data-testid="icon">Loading</span>,
  Sparkles: () => <span data-testid="icon">AI</span>,
  User: () => <span data-testid="icon">User</span>,
  Cpu: () => <span data-testid="icon">CPU</span>,
  Shield: () => <span data-testid="icon">Security</span>,
  ArrowRight: () => <span data-testid="icon">Arrow</span>,
  Users: () => <span data-testid="icon">Users</span>,
  Plus: () => <span data-testid="icon">Plus</span>,
  Eye: () => <span data-testid="icon">Eye</span>,
  MessageCircle: () => <span data-testid="icon">Message</span>,
  UserCircle: () => <span data-testid="icon">User Circle</span>,
  LayoutList: () => <span data-testid="icon">Layout</span>,
  MoreHorizontal: () => <span data-testid="icon">More</span>,
  MapPin: () => <span data-testid="icon">Location</span>,
  Upload: () => <span data-testid="icon">Upload</span>,
}));

// Mock ReactMarkdown
jest.mock('react-markdown', () => ({ children }: { children: string }) => <div>{children}</div>);

// Mock date-fns
describe('ArchitectDashboard', () => {
  const mockUser: UserProfile = {
    uid: 'arch-1',
    email: 'architect@example.com',
    role: 'architect',
    displayName: 'Test Architect',
    createdAt: '2026-01-01T00:00:00Z',
    averageRating: 4.5,
    completedJobs: 10,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should render dashboard with user name', () => {
    render(<ArchitectDashboard user={mockUser} />);

    expect(screen.getByText('Architect Portal')).toBeInTheDocument();
  });

  test('should display user stats', () => {
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

    expect(screen.getByText(/No available jobs/i)).toBeInTheDocument();
  });

  test('should handle tab navigation', () => {
    render(<ArchitectDashboard user={mockUser} activeTab="available" onTabChange={jest.fn()} />);

    expect(screen.getByTestId('tabs')).toBeInTheDocument();
  });
});
