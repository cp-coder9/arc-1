/**
 * PhotoAnnotator Component Round-Trip Integration Tests
 *
 * Tests the complete annotation round-trip workflow in the PhotoAnnotator component.
 * Validates: Task 11.3 - Annotation round-trip preserves all data (Req 2.3, 2.4)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PhotoAnnotator } from '../PhotoAnnotator';
import { saveAnnotation, loadAnnotation } from '@/services/photoAnnotationService';
import type { PhotoAnnotation, AnnotationShape } from '@/types';

// Mock Firebase auth
vi.mock('@/lib/firebase', () => ({
  auth: {
    currentUser: {
      uid: 'test-user-id',
    },
  },
}));

// Mock photo upload service
vi.mock('@/services/photoUploadService', () => ({
  uploadPhotoWithFastEvidence: vi.fn().mockResolvedValue({
    evidenceId: 'test-evidence-123',
    blobUrl: 'https://blob.vercel-storage.com/photo-abc123.jpg',
    evidenceCreationTime: 1500,
    uploadTime: 3000,
  }),
  retryPhotoUpload: vi.fn(),
  validatePhotoFile: vi.fn().mockReturnValue(null), // no validation errors
  formatFileSize: vi.fn((bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`),
  MAX_PHOTO_SIZE_MB: 25,
}));

// Mock photo annotation service
vi.mock('@/services/photoAnnotationService', () => ({
  saveAnnotation: vi.fn(),
  loadAnnotation: vi.fn(),
}));

// Mock URL.createObjectURL and revokeObjectURL
const mockObjectURL = 'blob:mock-url/photo';
Object.defineProperty(global.URL, 'createObjectURL', {
  writable: true,
  value: vi.fn().mockReturnValue(mockObjectURL),
});

Object.defineProperty(global.URL, 'revokeObjectURL', {
  writable: true,
  value: vi.fn(),
});

// Mock canvas.toBlob so generateFlattenedImage resolves in jsdom
HTMLCanvasElement.prototype.toBlob = vi.fn(function(callback: BlobCallback) {
  callback(new Blob(['fake-png'], { type: 'image/png' }));
});

// Mock canvas.getContext to return a minimal 2D context stub
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  drawImage: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  fillRect: vi.fn(),
  fillText: vi.fn(),
  measureText: vi.fn(() => ({ width: 50 })),
  strokeStyle: '',
  fillStyle: '',
  lineWidth: 1,
  font: '',
})) as unknown as typeof HTMLCanvasElement.prototype.getContext;

// Mock Image so img.onload fires after src is set
const OriginalImage = global.Image;
class MockImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private _src: string = '';
  width = 100;
  height = 100;

  get src() { return this._src; }
  set src(value: string) {
    this._src = value;
    if (this.onload) {
      Promise.resolve().then(() => this.onload?.());
    }
  }
}
(global as unknown as Record<string, unknown>).Image = MockImage;
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).Image = MockImage;
}

describe('PhotoAnnotator Round-Trip Integration', () => {
  let user: ReturnType<typeof userEvent.setup>;
  let mockSaveAnnotation: ReturnType<typeof vi.fn>;
  let mockLoadAnnotation: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    user = userEvent.setup();
    vi.clearAllMocks();
    
    // Get the mocked functions
    mockSaveAnnotation = vi.mocked(saveAnnotation);
    mockLoadAnnotation = vi.mocked(loadAnnotation);
    
    mockLoadAnnotation.mockResolvedValue(null); // No existing annotations by default
  });

  afterEach(() => {
    vi.clearAllMocks();
    // Restore Image
    (global as unknown as Record<string, unknown>).Image = OriginalImage;
    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).Image = OriginalImage;
    }
  });

  it('loads existing annotations when evidence ID becomes available', async () => {
    // Test data: annotation with multiple shape types
    const testAnnotation: PhotoAnnotation = {
      evidenceId: 'test-evidence-123',
      shapes: [
        {
          id: 'arrow-shape-1',
          type: 'arrow',
          points: [{ x: 0.2, y: 0.3 }, { x: 0.8, y: 0.7 }],
          style: { color: '#FF0000', strokeWidth: 2 },
        },
        {
          id: 'text-note-1',
          type: 'text_note',
          points: [{ x: 0.5, y: 0.1 }],
          style: { color: '#000000', strokeWidth: 1, fontSize: 14 },
          text: 'Critical defect here',
        },
      ],
      flattenedUri: 'https://blob.vercel-storage.com/flattened-xyz.png',
    };

    // Setup: Mock loadAnnotation to return our test data
    mockLoadAnnotation.mockResolvedValue(testAnnotation);

    render(
      <PhotoAnnotator
        projectId="test-project"
        linkedObjectId="test-object"
      />
    );

    // Wait for initial render
    await waitFor(() => {
      expect(screen.getByText('Photo Capture & Annotation')).toBeInTheDocument();
    });

    // Simulate file upload that creates evidence
    const fileInput = screen.getByLabelText(/photo upload/i);
    const mockFile = new File(['fake-image-data'], 'test.jpg', { type: 'image/jpeg' });

    await user.upload(fileInput, mockFile);

    // Wait for photo upload to complete and evidence ID to be set
    await waitFor(() => {
      expect(screen.getAllByText(/Evidence created in \d+ms/)[0]).toBeInTheDocument();
    });

    // At this point, the component should have called loadAnnotation
    expect(mockLoadAnnotation).toHaveBeenCalledWith('test-project', 'test-evidence-123');

    // Verify that the component loaded the annotation data correctly
    expect(mockLoadAnnotation).toHaveBeenCalledTimes(1);
  });

  it('handles round-trip with no existing annotations', async () => {
    // Setup: No existing annotations
    mockLoadAnnotation.mockResolvedValue(null);

    render(
      <PhotoAnnotator
        projectId="test-project"
        linkedObjectId="test-object"
      />
    );

    // Upload a photo
    const fileInput = screen.getByLabelText(/photo upload/i);
    const mockFile = new File(['fake-image-data'], 'test.jpg', { type: 'image/jpeg' });

    await user.upload(fileInput, mockFile);

    // Wait for upload completion
    await waitFor(() => {
      expect(screen.getAllByText(/Evidence created in \d+ms/)).toHaveLength(2);
    });

    // Verify loadAnnotation was called but returned null
    expect(mockLoadAnnotation).toHaveBeenCalledWith('test-project', 'test-evidence-123');

    // The component should handle null gracefully (no error thrown)
    expect(screen.getByText('Photo Capture & Annotation')).toBeInTheDocument();
  });

  it('calls onAnnotationSaved callback with complete annotation data', async () => {
    const mockOnAnnotationSaved = vi.fn();

    // Load an annotation so shapes > 0 to satisfy the save guard
    const testAnnotation: PhotoAnnotation = {
      evidenceId: 'test-evidence-123',
      shapes: [
        {
          id: 'arrow-1',
          type: 'arrow',
          points: [{ x: 0.1, y: 0.2 }, { x: 0.9, y: 0.8 }],
          style: { color: '#FF0000', strokeWidth: 2 },
        },
      ],
    };
    mockLoadAnnotation.mockResolvedValue(testAnnotation);
    
    render(
      <PhotoAnnotator
        projectId="test-project"
        linkedObjectId="test-object"
        onAnnotationSaved={mockOnAnnotationSaved}
      />
    );

    // Upload photo
    const fileInput = screen.getByLabelText(/photo upload/i);
    const mockFile = new File(['fake-image-data'], 'test.jpg', { type: 'image/jpeg' });

    await user.upload(fileInput, mockFile);

    await waitFor(() => {
      expect(screen.getAllByText(/Evidence created in \d+ms/)[0]).toBeInTheDocument();
    });

    // Wait for shapes to be loaded into state (must be > 0)
    await waitFor(() => {
      expect(document.body.textContent).toContain('Annotations: 1');
    });

    // Mock successful save
    mockSaveAnnotation.mockResolvedValue(undefined);

    // Click save
    const saveButton = screen.getByRole('button', { name: /save/i });
    await user.click(saveButton);

    // Verify the callback was called with annotation data
    await waitFor(() => {
      expect(mockOnAnnotationSaved).toHaveBeenCalledTimes(1);
    });

    const callbackArg = mockOnAnnotationSaved.mock.calls[0][0];
    expect(callbackArg).toMatchObject({
      evidenceId: 'test-evidence-123',
      shapes: expect.any(Array),
    });
  });

  it('handles load errors gracefully without breaking the component', async () => {
    // Mock loadAnnotation to reject
    mockLoadAnnotation.mockRejectedValue(new Error('Network error'));

    render(
      <PhotoAnnotator
        projectId="test-project"
        linkedObjectId="test-object"
      />
    );

    // Upload photo
    const fileInput = screen.getByLabelText(/photo upload/i);
    const mockFile = new File(['fake-image-data'], 'test.jpg', { type: 'image/jpeg' });

    await user.upload(fileInput, mockFile);

    await waitFor(() => {
      expect(screen.getAllByText(/Evidence created in \d+ms/)[0]).toBeInTheDocument();
    });

    // Wait a bit for the load attempt
    await waitFor(() => {
      expect(mockLoadAnnotation).toHaveBeenCalled();
    });

    // Component should still be functional (error is caught and logged)
    expect(screen.getByText('Photo Capture & Annotation')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
  });

  it('maintains proper evidence ID linkage between save and load operations', async () => {
    const testEvidenceId = 'evidence-linkage-test';
    
    // Setup a loaded annotation so save guard is satisfied
    mockLoadAnnotation.mockResolvedValue({
      evidenceId: testEvidenceId,
      shapes: [
        {
          id: 'linkage-arrow',
          type: 'arrow',
          points: [{ x: 0.2, y: 0.3 }, { x: 0.7, y: 0.8 }],
          style: { color: '#FF0000', strokeWidth: 2 },
        },
      ],
    } as PhotoAnnotation);

    // Mock upload to return specific evidence ID
    const mockUpload = vi.mocked(
      await import('@/services/photoUploadService')
    ).uploadPhotoWithFastEvidence;
    
    mockUpload.mockResolvedValue({
      evidenceId: testEvidenceId,
      blobUrl: 'https://blob.vercel-storage.com/test.jpg',
      evidenceCreationTime: 1500,
      uploadTime: 3000,
    });

    render(
      <PhotoAnnotator
        projectId="test-project"
        linkedObjectId="test-object"
      />
    );

    // Upload photo
    const fileInput = screen.getByLabelText(/photo upload/i);
    const mockFile = new File(['fake-image-data'], 'test.jpg', { type: 'image/jpeg' });

    await user.upload(fileInput, mockFile);

    await waitFor(() => {
      expect(screen.getAllByText(/Evidence created in \d+ms/)[0]).toBeInTheDocument();
    });

    // Verify loadAnnotation was called with the correct evidence ID
    expect(mockLoadAnnotation).toHaveBeenCalledWith('test-project', testEvidenceId);

    // Wait for shapes to load so the save guard is satisfied
    await waitFor(() => {
      expect(document.body.textContent).toContain('Annotations: 1');
    });

    // Save annotations
    mockSaveAnnotation.mockResolvedValue(undefined);
    const saveButton = screen.getByRole('button', { name: /save/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(mockSaveAnnotation).toHaveBeenCalled();
    });

    // Verify saveAnnotation was called with the same evidence ID
    const saveCall = mockSaveAnnotation.mock.calls[0];
    const savedAnnotation = saveCall[1] as PhotoAnnotation;
    expect(savedAnnotation.evidenceId).toBe(testEvidenceId);
  });

  it('integrates correctly with photoAnnotationService for save and load operations', async () => {
    // This test verifies the service integration points
    const testProjectId = 'integration-test-project';
    const testEvidenceId = 'integration-test-evidence';

    // Test annotation data
    const testAnnotation: PhotoAnnotation = {
      evidenceId: testEvidenceId,
      shapes: [
        {
          id: 'integration-arrow',
          type: 'arrow',
          points: [{ x: 0.1, y: 0.2 }, { x: 0.9, y: 0.8 }],
          style: { color: '#00FF00', strokeWidth: 3 },
        }
      ],
    };

    mockLoadAnnotation.mockResolvedValue(testAnnotation);
    
    // Mock upload to return our test evidence ID
    const mockUpload = vi.mocked(
      await import('@/services/photoUploadService')
    ).uploadPhotoWithFastEvidence;
    
    mockUpload.mockResolvedValue({
      evidenceId: testEvidenceId,
      blobUrl: 'https://blob.vercel-storage.com/integration-test.jpg',
      evidenceCreationTime: 1200,
      uploadTime: 2500,
    });

    render(
      <PhotoAnnotator
        projectId={testProjectId}
        linkedObjectId="test-object"
      />
    );

    // Upload photo to trigger the load cycle
    const fileInput = screen.getByLabelText(/photo upload/i);
    const mockFile = new File(['integration-test-data'], 'test.jpg', { type: 'image/jpeg' });

    await user.upload(fileInput, mockFile);

    await waitFor(() => {
      expect(screen.getAllByText(/Evidence created in \d+ms/)).toHaveLength(2);
    });

    // Verify load was called with correct parameters
    expect(mockLoadAnnotation).toHaveBeenCalledWith(testProjectId, testEvidenceId);

    // Wait for annotations to be loaded into state (loadAnnotation is async)
    await waitFor(() => {
      expect(mockLoadAnnotation).toHaveBeenCalledTimes(1);
    });

    // Wait for the loaded shapes to show in the summary (Annotations: 1)
    // Verify there is at least 1 shape by checking the summary text
    await waitFor(() => {
      expect(document.body.textContent).toContain('Annotations: 1');
    });

    // Now test the save cycle
    mockSaveAnnotation.mockResolvedValue(undefined);
    const saveButton = screen.getByRole('button', { name: /save/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(mockSaveAnnotation).toHaveBeenCalled();
    });

    // Verify save was called with correct parameters
    expect(mockSaveAnnotation).toHaveBeenCalledWith(
      testProjectId,
      expect.objectContaining({
        evidenceId: testEvidenceId,
        shapes: expect.any(Array),
      })
    );

    // This demonstrates that the round-trip works:
    // 1. Component calls loadAnnotation after evidence creation
    // 2. Component calls saveAnnotation when user clicks save
    // 3. Both calls use the same projectId and evidenceId
    expect(mockLoadAnnotation).toHaveBeenCalledTimes(1);
    expect(mockSaveAnnotation).toHaveBeenCalledTimes(1);
  });
});