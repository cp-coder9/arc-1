import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import FileManager from '../FileManager';
import { UserProfile } from '../../types';

const mockFile = {
  id: 'file-floor-plan-1',
  url: 'https://example.com/job-177847582-floor-plan.pdf',
  fileName: 'job-177847582-floor-plan.pdf',
  fileType: 'application/pdf',
  fileSize: 2048,
  uploadedBy: 'arch-177847582',
  uploadedAt: '2026-05-04T00:00:00.000Z',
  context: 'submission',
  jobId: '177847582',
};

const mockAddDoc = jest.fn(() => Promise.resolve({ id: 'submission-177847582' }));
const mockUpdateDoc = jest.fn(() => Promise.resolve());
const mockGetDoc = jest.fn(() => Promise.resolve({
  exists: () => true,
  id: '177847582',
  data: () => ({
    clientId: 'client-177847582',
    selectedArchitectId: 'arch-177847582',
    title: 'Full test flow work job 177847582',
    status: 'in-progress',
    category: 'Residential',
  }),
}));

jest.mock('../../lib/firebase', () => ({
  db: {},
  auth: {
    currentUser: { getIdToken: jest.fn(() => Promise.resolve('token')) },
  },
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn((db, path) => ({ path })),
  query: jest.fn((...args) => args),
  where: jest.fn(),
  orderBy: jest.fn(),
  doc: jest.fn((db, path, id) => ({ path, id })),
  getDocs: jest.fn(() => Promise.resolve({ docs: [] })),
  getDoc: (...args: any[]) => mockGetDoc(...args),
  addDoc: (...args: any[]) => mockAddDoc(...args),
  updateDoc: (...args: any[]) => mockUpdateDoc(...args),
  onSnapshot: jest.fn((q, next) => {
    next({ docs: [{ id: mockFile.id, data: () => mockFile }] });
    return jest.fn();
  }),
}));

const mockReviewDrawing = jest.fn(() => Promise.resolve({
  status: 'passed',
  feedback: 'AI agents confirm the floor plan is ready with minor notes.',
  categories: [{ name: 'General', issues: [] }],
  traceLog: 'Orchestrator, wall, fenestration, fire, area, presentation and SANS agents completed.',
}));

jest.mock('../../services/geminiService', () => ({
  reviewDrawing: (...args: any[]) => mockReviewDrawing(...args),
}));

const mockNotifyDrawingSubmitted = jest.fn(() => Promise.resolve());
const mockNotifyAIReviewComplete = jest.fn(() => Promise.resolve());
const mockUploadAndTrackFile = jest.fn(() => Promise.resolve('https://example.com/uploaded-new-plan.pdf'));

jest.mock('../../services/notificationService', () => ({
  notificationService: {
    notifyDrawingSubmitted: (...args: any[]) => mockNotifyDrawingSubmitted(...args),
    notifyAIReviewComplete: (...args: any[]) => mockNotifyAIReviewComplete(...args),
  },
}));

jest.mock('../../lib/uploadService', () => ({
  uploadAndTrackFile: (...args: any[]) => mockUploadAndTrackFile(...args),
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

jest.mock('../ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

jest.mock('../ui/button', () => ({
  Button: ({ children, onClick, disabled }: any) => <button onClick={onClick} disabled={disabled}>{children}</button>,
}));

jest.mock('../ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));

jest.mock('../ui/badge', () => ({
  badgeVariants: () => 'badge',
}));

jest.mock('lucide-react', () => new Proxy({}, {
  get: () => () => <span />,
}));

describe('FileManager quick scan workflow', () => {
  const architect: UserProfile = {
    uid: 'arch-177847582',
    email: 'architect@example.com',
    displayName: 'Workflow Architect',
    role: 'architect',
    createdAt: '2026-05-04T00:00:00.000Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(window, 'prompt').mockReturnValue('Reviewed AI feedback and sent annotated comments to the client.');
  });

  test('scans job 177847582 floor plan, saves architect comment, and notifies client', async () => {
    render(<FileManager user={architect} />);

    fireEvent.click(await screen.findByText('Scan'));

    await waitFor(() => expect(mockReviewDrawing).toHaveBeenCalledWith(
      mockFile.url,
      mockFile.fileName,
      expect.any(Function),
      'submission-177847582'
    ));

    expect(mockAddDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'jobs/177847582/submissions' }),
      expect.objectContaining({
        jobId: '177847582',
        architectId: 'arch-177847582',
        drawingUrl: mockFile.url,
        status: 'ai_reviewing',
      })
    );

    await waitFor(() => expect(mockUpdateDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: 'ai_passed',
        architectComment: 'Reviewed AI feedback and sent annotated comments to the client.',
        aiFeedback: 'AI agents confirm the floor plan is ready with minor notes.',
      })
    ));

    expect(mockNotifyDrawingSubmitted).toHaveBeenCalledWith(
      'client-177847582',
      mockFile.fileName,
      '177847582',
      'submission-177847582'
    );
    expect(mockNotifyAIReviewComplete).toHaveBeenCalledWith(
      'client-177847582',
      'arch-177847582',
      mockFile.fileName,
      'passed',
      '177847582',
      'submission-177847582'
    );
  });

  test('allows architect to upload a new floor plan for job 177847582 before scanning', async () => {
    render(<FileManager user={architect} />);

    const plan = new File(['floor-plan'], 'new-floor-plan.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Job ID for plan upload'), { target: { value: '177847582' } });
    fireEvent.change(screen.getByLabelText('New plan file'), { target: { files: [plan] } });
    fireEvent.click(screen.getByText('Upload Plan'));

    await waitFor(() => expect(mockUploadAndTrackFile).toHaveBeenCalledWith(plan, {
      fileName: 'new-floor-plan.pdf',
      fileType: 'application/pdf',
      fileSize: plan.size,
      uploadedBy: 'arch-177847582',
      context: 'submission',
      jobId: '177847582',
    }));
  });
});