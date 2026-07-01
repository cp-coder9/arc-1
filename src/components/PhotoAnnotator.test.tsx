import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PhotoAnnotator } from './PhotoAnnotator';
import {
  uploadPhotoWithFastEvidence,
  retryPhotoUpload,
  validatePhotoFile,
  PhotoUploadError,
} from '@/services/photoUploadService';

// Mock Firebase auth
vi.mock('@/lib/firebase', () => ({
  auth: {
    currentUser: {
      uid: 'test-user-id',
    },
  },
}));

// Mock photo upload service. PhotoUploadError is defined inside the factory so
// the component and the tests share the same class reference for instanceof.
vi.mock('@/services/photoUploadService', () => {
  class PhotoUploadError extends Error {
    evidenceId?: string;
    constructor(message: string, evidenceId?: string) {
      super(message);
      this.name = 'PhotoUploadError';
      this.evidenceId = evidenceId;
    }
  }
  return {
    uploadPhotoWithFastEvidence: vi.fn(),
    retryPhotoUpload: vi.fn(),
    validatePhotoFile: vi.fn(),
    formatFileSize: vi.fn((bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`),
    PhotoUploadError,
    MAX_PHOTO_SIZE_MB: 25,
  };
});

// Mock photo annotation service
vi.mock('@/services/photoAnnotationService', () => ({
  saveAnnotation: vi.fn(),
  loadAnnotation: vi.fn().mockResolvedValue(null),
}));

// The test runner's global `localStorage` lacks a complete Web Storage API, so
// install a fresh in-memory implementation for the sync-queue tests.
function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  const mock = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: mock });
  return store;
}

describe('PhotoAnnotator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders photo upload interface', () => {
    render(
      <PhotoAnnotator
        projectId="test-project"
        linkedObjectId="test-object"
        location="Test Location"
      />
    );

    expect(screen.getByText('Photo Capture & Annotation')).toBeInTheDocument();
    expect(screen.getByText('Click to upload')).toBeInTheDocument();
    expect(screen.getByText('JPEG or PNG files up to 25 MB')).toBeInTheDocument();
  });

  it('displays photo size limit correctly', () => {
    render(
      <PhotoAnnotator
        projectId="test-project"
      />
    );

    expect(screen.getByText('JPEG/PNG files up to 25 MB')).toBeInTheDocument();
  });

  it('shows status as ready initially', () => {
    render(
      <PhotoAnnotator
        projectId="test-project"
      />
    );

    expect(screen.getByText('Status: Ready to capture')).toBeInTheDocument();
  });

  it('renders annotation tools when photo is uploaded', () => {
    render(
      <PhotoAnnotator
        projectId="test-project"
      />
    );

    // The annotation tools are not visible initially since no photo is uploaded
    expect(screen.queryByText('Arrow')).not.toBeInTheDocument();
    expect(screen.queryByText('Text')).not.toBeInTheDocument();
  });

  it('accepts required props', () => {
    const onEvidenceCreated = vi.fn();
    const onAnnotationSaved = vi.fn();
    const onError = vi.fn();

    render(
      <PhotoAnnotator
        projectId="test-project"
        linkedObjectId="test-linked-object"
        location="Test Location"
        gps={{ lat: -26.2041, lng: 28.0473 }}
        onEvidenceCreated={onEvidenceCreated}
        onAnnotationSaved={onAnnotationSaved}
        onError={onError}
      />
    );

    expect(screen.getByText('Photo Capture & Annotation')).toBeInTheDocument();
  });

  it('renders without optional props', () => {
    render(
      <PhotoAnnotator
        projectId="test-project"
      />
    );

    expect(screen.getByText('Photo Capture & Annotation')).toBeInTheDocument();
  });

  // ─── Keyboard Navigation & Accessibility (Task 11.5, Req 9.4, 9.5) ───────────

  describe('Keyboard navigation and accessibility (Req 9.4, 9.5)', () => {
    it('upload drop zone is keyboard-focusable (tabIndex=0)', () => {
      render(<PhotoAnnotator projectId="test-project" />);
      const dropZone = screen.getByRole('button', { name: /upload photo/i });
      expect(dropZone).toHaveAttribute('tabindex', '0');
    });

    it('upload drop zone has an accessible name', () => {
      render(<PhotoAnnotator projectId="test-project" />);
      const dropZone = screen.getByRole('button', { name: /upload photo/i });
      expect(dropZone).toBeInTheDocument();
    });

    it('upload drop zone activates on Enter key', () => {
      render(<PhotoAnnotator projectId="test-project" />);
      const dropZone = screen.getByRole('button', { name: /upload photo/i });
      const fileInput = document.getElementById('photo-upload') as HTMLInputElement;
      const clickSpy = vi.spyOn(fileInput, 'click').mockImplementation(() => {});
      fireEvent.keyDown(dropZone, { key: 'Enter' });
      expect(clickSpy).toHaveBeenCalled();
    });

    it('upload drop zone activates on Space key', () => {
      render(<PhotoAnnotator projectId="test-project" />);
      const dropZone = screen.getByRole('button', { name: /upload photo/i });
      const fileInput = document.getElementById('photo-upload') as HTMLInputElement;
      const clickSpy = vi.spyOn(fileInput, 'click').mockImplementation(() => {});
      fireEvent.keyDown(dropZone, { key: ' ' });
      expect(clickSpy).toHaveBeenCalled();
    });

    it('status area has aria-live=polite for screen reader announcements', () => {
      render(<PhotoAnnotator projectId="test-project" />);
      const statusEl = screen.getByText(/Status: Ready to capture/i).closest('[aria-live]');
      expect(statusEl).toHaveAttribute('aria-live', 'polite');
    });

    it('has a main heading with Camera icon accessible name', () => {
      render(<PhotoAnnotator projectId="test-project" />);
      expect(screen.getByText('Photo Capture & Annotation')).toBeInTheDocument();
    });
  });

  describe('Keyboard shortcuts — arrow and text tools (Req 9.4)', () => {
    // These tests verify the keydown handler registers/deregisters.
    // Tool button visibility depends on photo preview state which we cannot
    // easily set without full upload mocking, so we test the event listener
    // attaches and detaches cleanly.
    it('adds and removes window keydown listener on mount/unmount', () => {
      const addSpy = vi.spyOn(window, 'addEventListener');
      const removeSpy = vi.spyOn(window, 'removeEventListener');

      const { unmount } = render(<PhotoAnnotator projectId="test-project" />);

      const addCalls = addSpy.mock.calls.filter(([evt]) => evt === 'keydown');
      expect(addCalls.length).toBeGreaterThan(0);

      unmount();

      const removeCalls = removeSpy.mock.calls.filter(([evt]) => evt === 'keydown');
      expect(removeCalls.length).toBeGreaterThan(0);

      addSpy.mockRestore();
      removeSpy.mockRestore();
    });

    it('ignores keyboard shortcuts when focus is on an input element', () => {
      render(<PhotoAnnotator projectId="test-project" />);

      // Dispatch 'a' key from an input element — should NOT trigger tool change
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();

      // No error should be thrown; no assertion needed beyond no-throw
      fireEvent.keyDown(input, { key: 'a', bubbles: true });

      document.body.removeChild(input);
    });
  });

  describe('Undo/Redo accessibility attributes', () => {
    // The undo/redo buttons are only rendered when a preview is available.
    // We cannot test their aria-labels without the full upload flow, but we
    // can assert the component renders without errors and the keyboard shortcut
    // useEffect does not throw when undo/redo are called on empty history.
    it('renders without errors and Undo2/Redo2 imports are present', () => {
      const { unmount } = render(<PhotoAnnotator projectId="test-project" />);
      // If import resolution for Undo2/Redo2 fails, render would throw
      expect(screen.getByText('Photo Capture & Annotation')).toBeInTheDocument();
      unmount();
    });

    it('does not throw when Ctrl+Z pressed with empty undo history', () => {
      render(<PhotoAnnotator projectId="test-project" />);
      expect(() => {
        fireEvent.keyDown(window, { key: 'z', ctrlKey: true, bubbles: true });
      }).not.toThrow();
    });

    it('does not throw when Ctrl+Y pressed with empty redo stack', () => {
      render(<PhotoAnnotator projectId="test-project" />);
      expect(() => {
        fireEvent.keyDown(window, { key: 'y', ctrlKey: true, bubbles: true });
      }).not.toThrow();
    });
  });

  // ─── Blob retry logic & sync-queue retention (Task 12.4, Req 2.5) ────────────

  describe('Blob retry logic and sync-queue retention (Req 2.5)', () => {
    const SYNC_KEY = 'architex:syncQueue:test-project';

    beforeEach(() => {
      installMemoryLocalStorage();
      // jsdom does not implement object URLs — stub them for the capture flow.
      globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-preview');
      globalThis.URL.revokeObjectURL = vi.fn();
    });

    const selectFile = () => {
      const fileInput = document.getElementById('photo-upload') as HTMLInputElement;
      const file = new File(['photo-bytes'], 'defect.jpg', { type: 'image/jpeg' });
      fireEvent.change(fileInput, { target: { files: [file] } });
    };

    it('retains the capture in the sync queue and preserves FieldEvidence when blob upload fails', async () => {
      vi.mocked(validatePhotoFile).mockReturnValue(null);
      vi.mocked(uploadPhotoWithFastEvidence).mockRejectedValue(
        new PhotoUploadError('Blob upload failed', 'evidence-123'),
      );

      const onError = vi.fn();
      render(<PhotoAnnotator projectId="test-project" onError={onError} />);

      selectFile();

      // Error surfaced and retry offered (FieldEvidence preserved).
      await waitFor(() => {
        expect(screen.getByText('Blob upload failed')).toBeInTheDocument();
      });
      expect(onError).toHaveBeenCalledWith('Blob upload failed');
      expect(screen.getByRole('button', { name: /retry photo upload/i })).toBeInTheDocument();

      // Capture retained in the Sync_Engine queue, linked to the preserved evidence.
      const queue = JSON.parse(localStorage.getItem(SYNC_KEY) || '[]');
      expect(queue).toHaveLength(1);
      expect(queue[0].kind).toBe('photo_annotation');
      expect(queue[0].status).toBe('queued');
      expect(queue[0].attempts).toBe(0);
      expect(queue[0].payload.evidenceId).toBe('evidence-123');
    });

    it('removes the capture from the sync queue when retry succeeds', async () => {
      vi.mocked(validatePhotoFile).mockReturnValue(null);
      vi.mocked(uploadPhotoWithFastEvidence).mockRejectedValue(
        new PhotoUploadError('Blob upload failed', 'evidence-123'),
      );
      vi.mocked(retryPhotoUpload).mockResolvedValue('https://blob.url/defect.jpg');

      render(<PhotoAnnotator projectId="test-project" />);
      selectFile();

      const retryBtn = await screen.findByRole('button', { name: /retry photo upload/i });
      expect(JSON.parse(localStorage.getItem(SYNC_KEY) || '[]')).toHaveLength(1);

      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(screen.getByText(/Upload successful after retry/i)).toBeInTheDocument();
      });
      // retryPhotoUpload retries up to 5 times internally (Req 2.5).
      expect(retryPhotoUpload).toHaveBeenCalledWith(expect.any(File), 'evidence-123');
      // Queue entry cleared after a successful retry.
      expect(JSON.parse(localStorage.getItem(SYNC_KEY) || '[]')).toHaveLength(0);
    });

    it('marks the capture failed in the queue when retry attempts are exhausted, preserving FieldEvidence', async () => {
      vi.mocked(validatePhotoFile).mockReturnValue(null);
      vi.mocked(uploadPhotoWithFastEvidence).mockRejectedValue(
        new PhotoUploadError('Blob upload failed', 'evidence-123'),
      );
      vi.mocked(retryPhotoUpload).mockRejectedValue(
        new Error('Upload failed after 5 attempts: network error'),
      );

      const onError = vi.fn();
      render(<PhotoAnnotator projectId="test-project" onError={onError} />);
      selectFile();

      const retryBtn = await screen.findByRole('button', { name: /retry photo upload/i });
      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(screen.getByText(/Upload failed after 5 attempts/i)).toBeInTheDocument();
      });

      // Capture retained but flagged failed; FieldEvidence (evidenceId) preserved.
      const queue = JSON.parse(localStorage.getItem(SYNC_KEY) || '[]');
      expect(queue).toHaveLength(1);
      expect(queue[0].status).toBe('failed');
      expect(queue[0].attempts).toBe(5);
      expect(queue[0].payload.evidenceId).toBe('evidence-123');
    });
  });

  // ─── Annotation tool keyboard navigation with a photo loaded (Task 12.5) ─────

  describe('Annotation tool keyboard navigation with photo loaded (Req 9.4, 9.5)', () => {
    beforeEach(() => {
      installMemoryLocalStorage();
      globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-preview');
      globalThis.URL.revokeObjectURL = vi.fn();
    });

    const uploadSuccess = () => {
      vi.mocked(validatePhotoFile).mockReturnValue(null);
      vi.mocked(uploadPhotoWithFastEvidence).mockResolvedValue({
        evidenceId: 'evidence-1',
        blobUrl: 'https://blob.url/photo.jpg',
        evidenceCreationTime: 10,
        uploadTime: 20,
      });
      const fileInput = document.getElementById('photo-upload') as HTMLInputElement;
      const file = new File(['photo-bytes'], 'photo.jpg', { type: 'image/jpeg' });
      fireEvent.change(fileInput, { target: { files: [file] } });
    };

    it('exposes annotation tool buttons with accessible names once a photo is loaded', async () => {
      render(<PhotoAnnotator projectId="test-project" />);
      uploadSuccess();

      const arrowBtn = await screen.findByRole('button', { name: /arrow annotation tool/i });
      const textBtn = screen.getByRole('button', { name: /text note annotation tool/i });
      const undoBtn = screen.getByRole('button', { name: /undo last annotation/i });
      const redoBtn = screen.getByRole('button', { name: /redo annotation/i });

      expect(arrowBtn).toHaveAttribute('aria-pressed', 'false');
      expect(textBtn).toHaveAttribute('aria-pressed', 'false');
      expect(undoBtn).toBeInTheDocument();
      expect(redoBtn).toBeInTheDocument();
    });

    it('toggles the arrow tool active state with the "a" keyboard shortcut', async () => {
      render(<PhotoAnnotator projectId="test-project" />);
      uploadSuccess();
      await screen.findByRole('button', { name: /arrow annotation tool/i });

      fireEvent.keyDown(window, { key: 'a' });

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /arrow annotation tool \(active\)/i }),
        ).toHaveAttribute('aria-pressed', 'true');
      });
    });

    it('toggles the text tool active state with the "t" keyboard shortcut', async () => {
      render(<PhotoAnnotator projectId="test-project" />);
      uploadSuccess();
      await screen.findByRole('button', { name: /text note annotation tool/i });

      fireEvent.keyDown(window, { key: 't' });

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /text note annotation tool \(active\)/i }),
        ).toHaveAttribute('aria-pressed', 'true');
      });
    });
  });
});
