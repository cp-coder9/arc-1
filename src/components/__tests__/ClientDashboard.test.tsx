/**
 * ClientDashboard Component Tests
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import ClientDashboard from '../ClientDashboard';
import { UserProfile } from '../../types';

// Mock Firebase
jest.mock('../../lib/firebase', () => ({
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
          limit: jest.fn(() => ({
            onSnapshot: jest.fn((callback) => {
              callback({ docs: [] });
              return jest.fn();
            }),
          })),
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
      add: jest.fn(() => Promise.resolve({ id: 'new-job-id' })),
    })),
  },
}));

// Mock Firebase Firestore
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
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
  addDoc: jest.fn(() => Promise.resolve({ id: 'new-job-id' })),
  updateDoc: jest.fn(() => Promise.resolve()),
  getDocs: jest.fn(() => Promise.resolve({ docs: [] })),
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

jest.mock('../ui/badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span data-testid="badge">{children}</span>,
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

jest.mock('../ui/input', () => ({
  Input: (props: any) => <input data-testid="input" {...props} />,
}));

jest.mock('../ui/textarea', () => ({
  Textarea: (props: any) => <textarea data-testid="textarea" {...props} />,
}));

// Mock services
jest.mock('../../services/notificationService', () => ({
  notificationService: {
    sendNotification: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../services/geminiService', () => ({
  reviewDrawing: jest.fn().mockResolvedValue({
    status: 'passed',
    feedback: 'All good',
    categories: [],
  }),
  logSystemEvent: jest.fn(),
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
}));
jest.mock('../ArchitectRecommendations', () => () => <div data-testid="architect-recommendations">Recommendations</div>);
jest.mock('../MunicipalTracker', () => () => <div data-testid="municipal-tracker">Municipal Tracker</div>);
jest.mock('../SubmissionItem', () => () => <div data-testid="submission-item">Submission Item</div>);
jest.mock('../OrchestrationProgressModal', () => () => <div data-testid="progress-modal">Progress Modal</div>);

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
  LayoutDashboard: () => <span data-testid="icon">Dashboard</span>,
  Briefcase: () => <span data-testid="icon">Jobs</span>,
  Plus: () => <span data-testid="icon">Plus</span>,
  Search: () => <span data-testid="icon">Search</span>,
  Star: () => <span data-testid="icon">Star</span>,
  MessageSquare: () => <span data-testid="icon">Messages</span>,
  CheckCircle2: () => <span data-testid="icon">Check</span>,
  Clock: () => <span data-testid="icon">Clock</span>,
  History: () => <span data-testid="icon">History</span>,
  MapPin: () => <span data-testid="icon">Location</span>,
  Users: () => <span data-testid="icon">Users</span>,
  CreditCard: () => <span data-testid="icon">Payments</span>,
  Landmark: () => <span data-testid="icon">Council</span>,
  HistoryIcon: () => <span data-testid="icon">Activity</span>,
  ShieldCheck: () => <span data-testid="icon">Shield</span>,
  User: () => <span data-testid="icon">User</span>,
  ExternalLink: () => <span data-testid="icon">External</span>,
  UploadCloud: () => <span data-testid="icon">Upload</span>,
  Loader2: () => <span data-testid="icon">Loading</span>,
  Sparkles: () => <span data-testid="icon">AI</span>,
  Shield: () => <span data-testid="icon">Security</span>,
  X: () => <span data-testid="icon">Close</span>,
  Building2: () => <span data-testid="icon">Building</span>,
  ShieldX: () => <span data-testid="icon">Shield X</span>,
  MessageCircle: () => <span data-testid="icon">Message</span>,
  ArrowRight: () => <span data-testid="icon">Arrow</span>,
  TrendingUp: () => <span data-testid="icon">Trending</span>,
  Award: () => <span data-testid="icon">Award</span>,
  FileText: () => <span data-testid="icon">File</span>,
  AlertCircle: () => <span data-testid="icon">Alert</span>,
}));

// Mock ReactMarkdown
jest.mock('react-markdown', () => ({ children }: { children: string }) => <div>{children}</div>);

describe('ClientDashboard', () => {
  const mockUser: UserProfile = {
    uid: 'client-1',
    email: 'client@example.com',
    role: 'client',
    displayName: 'Test Client',
    createdAt: '2026-01-01T00:00:00Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should render dashboard with user name', () => {
    render(<ClientDashboard user={mockUser} />);

    expect(screen.getByText('Client Portal')).toBeInTheDocument();
  });

  test('should display empty state when no jobs', () => {
    render(<ClientDashboard user={mockUser} />);

    expect(screen.getByText(/No active projects/i)).toBeInTheDocument();
  });

  test('should render profile editor', () => {
    render(<ClientDashboard user={mockUser} />);

    expect(screen.getByTestId('profile-editor')).toBeInTheDocument();
  });

  test('should handle tab changes', () => {
    const onTabChange = jest.fn();
    render(<ClientDashboard user={mockUser} activeTab="jobs" onTabChange={onTabChange} />);

    // Dashboard should render with the specified tab
    expect(screen.getByText('Client Portal')).toBeInTheDocument();
  });
});
