import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UserProfile } from '@/types';

// Mock apiFetch
vi.mock('@/lib/apiClient', () => ({
  apiFetch: vi.fn(),
  getApiBaseUrl: vi.fn(() => ''),
  buildApiUrl: vi.fn((url: string) => url),
}));

// Mock useReducedMotion to avoid matchMedia issues in tests
vi.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: () => true,
  default: () => true,
}));

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({
      children,
      initial,
      animate,
      exit,
      transition,
      ...props
    }: any) => <div {...props}>{children}</div>,
  },
}));

import { apiFetch } from '@/lib/apiClient';
import { FeedbackWidget } from '../FeedbackWidget';

const mockApiFetch = vi.mocked(apiFetch);

const mockUser: UserProfile = {
  uid: 'test-user-1',
  email: 'test@example.com',
  role: 'architect' as const,
  displayName: 'Test User',
  createdAt: '2024-01-01T00:00:00.000Z',
};

// Mock window.location.pathname
const originalLocation = window.location;

beforeEach(() => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...originalLocation, pathname: '/projects/proj-123/design' },
  });

  // Default: My Feedback tab fetches empty submissions
  mockApiFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ submissions: [], rateLimit: { remaining: 10, resetAt: null } }),
  } as any);
});

afterEach(() => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: originalLocation,
  });
  vi.clearAllMocks();
});

describe('FeedbackWidget', () => {
  describe('Render', () => {
    it('renders the trigger button', () => {
      render(<FeedbackWidget user={mockUser} />);
      const button = screen.getByRole('button', { name: /open feedback/i });
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute('aria-expanded', 'false');
      expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    });
  });

  describe('Focus trap', () => {
    it('traps focus within the panel when open — Tab key cycles focus within panel', async () => {
      const user = userEvent.setup();
      render(<FeedbackWidget user={mockUser} />);

      // Open the panel
      const trigger = screen.getByRole('button', { name: /open feedback/i });
      await user.click(trigger);

      // Panel should be visible
      const panel = screen.getByRole('dialog', { name: /feedback panel/i });
      expect(panel).toBeInTheDocument();

      // The widget's focus trap handler intercepts Tab on the last focusable element
      // and wraps to the first. In jsdom, offsetParent is null for all elements so
      // the trap uses all querySelectorAll results. Focus the submit button (last
      // visible interactive element), then Tab should wrap.
      const submitButton = screen.getByRole('button', { name: /submit feedback/i });
      submitButton.focus();
      expect(document.activeElement).toBe(submitButton);

      // Press Tab — the focus trap should prevent focus from leaving the panel
      fireEvent.keyDown(document, { key: 'Tab', code: 'Tab' });

      // Focus should remain inside the panel (not on the outer trigger)
      expect(panel.contains(document.activeElement)).toBe(true);
    });
  });

  describe('Keyboard navigation', () => {
    it('closes the panel when Escape key is pressed', async () => {
      const user = userEvent.setup();
      render(<FeedbackWidget user={mockUser} />);

      // Open the panel
      const trigger = screen.getByRole('button', { name: /open feedback/i });
      await user.click(trigger);

      // Panel should be open
      expect(screen.getByRole('dialog', { name: /feedback panel/i })).toBeInTheDocument();

      // Press Escape
      fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });

      // Panel should close
      expect(screen.queryByRole('dialog', { name: /feedback panel/i })).not.toBeInTheDocument();

      // Focus should return to trigger
      expect(document.activeElement).toBe(trigger);
    });
  });

  describe('Form validation display', () => {
    it('shows error when category is not selected', async () => {
      const user = userEvent.setup();
      render(<FeedbackWidget user={mockUser} />);

      // Open widget
      await user.click(screen.getByRole('button', { name: /open feedback/i }));

      // Type a valid description (10+ non-whitespace chars)
      const textarea = screen.getByPlaceholderText(/tell us what's on your mind/i);
      await user.type(textarea, 'This is a valid description for feedback');

      // Submit without selecting category
      const submitButton = screen.getByRole('button', { name: /submit feedback/i });
      await user.click(submitButton);

      // Should show category error
      expect(screen.getByText(/please select a category/i)).toBeInTheDocument();
    });

    it('shows error when description has fewer than 10 non-whitespace characters', async () => {
      const user = userEvent.setup();
      render(<FeedbackWidget user={mockUser} />);

      // Open widget
      await user.click(screen.getByRole('button', { name: /open feedback/i }));

      // Select a category
      const bugButton = screen.getByRole('button', { name: /bug/i });
      await user.click(bugButton);

      // Type short description (less than 10 non-whitespace)
      const textarea = screen.getByPlaceholderText(/tell us what's on your mind/i);
      await user.type(textarea, 'short');

      // Submit
      const submitButton = screen.getByRole('button', { name: /submit feedback/i });
      await user.click(submitButton);

      // Should show description error
      expect(screen.getByText(/at least 10 non-whitespace/i)).toBeInTheDocument();
    });
  });

  describe('File validation', () => {
    it('shows error when an oversized file is attached', async () => {
      const user = userEvent.setup();
      render(<FeedbackWidget user={mockUser} />);

      // Open widget
      await user.click(screen.getByRole('button', { name: /open feedback/i }));

      // Create a file that exceeds 5MB
      const oversizedFile = new File(
        [new ArrayBuffer(6 * 1024 * 1024)], // 6MB
        'large-screenshot.png',
        { type: 'image/png' }
      );

      // Find the hidden file input and upload
      const fileInput = screen.getByLabelText(/attach screenshot/i);
      await user.upload(fileInput, oversizedFile);

      // Should show size error
      expect(screen.getByText(/must not exceed 5MB/i)).toBeInTheDocument();
    });
  });

  describe('Success state', () => {
    it('shows success message after successful submission', async () => {
      // Mock successful submit
      mockApiFetch.mockImplementation(async (url: string) => {
        if (typeof url === 'string' && url.includes('/api/feedback/submit')) {
          return { ok: true, json: async () => ({ id: 'fb-001' }) } as any;
        }
        // Default for submissions fetch
        return {
          ok: true,
          json: async () => ({ submissions: [], rateLimit: { remaining: 10, resetAt: null } }),
        } as any;
      });

      const user = userEvent.setup();
      render(<FeedbackWidget user={mockUser} />);

      // Open widget
      await user.click(screen.getByRole('button', { name: /open feedback/i }));

      // Select category
      const bugButton = screen.getByRole('button', { name: /bug/i });
      await user.click(bugButton);

      // Type valid description
      const textarea = screen.getByPlaceholderText(/tell us what's on your mind/i);
      await user.type(textarea, 'This is a valid bug report with enough characters');

      // Submit
      const submitButton = screen.getByRole('button', { name: /submit feedback/i });
      await user.click(submitButton);

      // Wait for success message
      await waitFor(() => {
        expect(screen.getByText(/thank you/i)).toBeInTheDocument();
      });
    });
  });

  describe('Error state', () => {
    it('shows network error when submission fails', async () => {
      // Mock failed submit
      mockApiFetch.mockImplementation(async (url: string) => {
        if (typeof url === 'string' && url.includes('/api/feedback/submit')) {
          return { ok: false, status: 500, json: async () => ({ error: 'Internal Server Error' }) } as any;
        }
        return {
          ok: true,
          json: async () => ({ submissions: [], rateLimit: { remaining: 10, resetAt: null } }),
        } as any;
      });

      const user = userEvent.setup();
      render(<FeedbackWidget user={mockUser} />);

      // Open widget
      await user.click(screen.getByRole('button', { name: /open feedback/i }));

      // Select category
      const featureButton = screen.getByRole('button', { name: /feature/i });
      await user.click(featureButton);

      // Type valid description
      const textarea = screen.getByPlaceholderText(/tell us what's on your mind/i);
      await user.type(textarea, 'Please add a dark mode toggle to the settings page');

      // Submit
      const submitButton = screen.getByRole('button', { name: /submit feedback/i });
      await user.click(submitButton);

      // Wait for error message
      await waitFor(() => {
        expect(screen.getByText(/internal server error/i)).toBeInTheDocument();
      });
    });
  });
});
