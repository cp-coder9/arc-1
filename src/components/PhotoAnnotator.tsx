import React, { useState, useRef, useCallback, useEffect } from 'react';
import { auth } from '@/lib/firebase';
import { saveAnnotation, loadAnnotation } from '@/services/photoAnnotationService';
import { 
  uploadPhotoWithFastEvidence, 
  retryPhotoUpload,
  validatePhotoFile,
  formatFileSize,
  PhotoUploadError,
  MAX_PHOTO_SIZE_MB,
} from '@/services/photoUploadService';
import { enqueueIO, removeFromQueueIO, markCaptureFailedIO } from '@/services/syncEngineService';
import type { PhotoAnnotation, AnnotationShape } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { AlertCircle, Camera, Upload, Save, Type, ArrowRight, RotateCcw, Undo2, Redo2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export interface PhotoAnnotatorProps {
  projectId: string;
  linkedObjectId?: string;
  location?: string;
  gps?: { lat: number; lng: number };
  onEvidenceCreated?: (evidenceId: string) => void;
  onAnnotationSaved?: (annotation: PhotoAnnotation) => void;
  onError?: (error: string) => void;
}

interface PhotoCaptureState {
  file: File | null;
  preview: string | null;
  isUploading: boolean;
  evidenceId: string | null;
  blobUrl: string | null;
  uploadProgress: string;
  error: string | null;
  canRetry: boolean;
  evidenceCreationTime?: number;
  uploadTime?: number;
}

interface AnnotationState {
  shapes: AnnotationShape[];
  history: AnnotationShape[][];  // undo stack — each entry is a prior shapes array
  redoStack: AnnotationShape[][];  // redo stack
  selectedTool: 'arrow' | 'text_note' | null;
  isDrawing: boolean;
  currentShape: AnnotationShape | null;
}

/**
 * PhotoAnnotator Component
 * 
 * Implements Task 11.1: Photo capture functionality
 * - Accepts JPEG/PNG files ≤ 25 MB
 * - Creates FieldEvidence record within 2 seconds before blob upload completes
 * - Rejects unsupported format/size, returns error, does not create FieldEvidence
 * - Fast FieldEvidence creation ahead of blob upload (Req 2.1, 2.6)
 */
export function PhotoAnnotator({
  projectId,
  linkedObjectId,
  location = '',
  gps,
  onEvidenceCreated,
  onAnnotationSaved,
  onError,
}: PhotoAnnotatorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Tracks the Sync_Engine queue clientId for a capture whose blob upload failed,
  // so it can be removed on retry success or marked failed on retry exhaustion (Req 2.5).
  const captureClientIdRef = useRef<string | null>(null);
  const [captureState, setCaptureState] = useState<PhotoCaptureState>({
    file: null,
    preview: null,
    isUploading: false,
    evidenceId: null,
    blobUrl: null,
    uploadProgress: 'Ready to capture',
    error: null,
    canRetry: false,
  });

  const [annotationState, setAnnotationState] = useState<AnnotationState>({
    shapes: [],
    history: [],
    redoStack: [],
    selectedTool: null,
    isDrawing: false,
    currentShape: null,
  });

  /**
   * Fast FieldEvidence creation ahead of blob upload per Requirement 2.1
   * Uses the photoUploadService to handle validation, fast evidence creation, and blob upload
   */
  const handlePhotoCapture = useCallback(async (file: File) => {
    const user = auth.currentUser;
    if (!user) {
      const error = 'User must be authenticated to capture photos';
      setCaptureState(prev => ({ ...prev, error, canRetry: false }));
      onError?.(error);
      return;
    }

    // Validate file first - reject immediately if invalid (Req 2.6)
    const validation = validatePhotoFile(file);
    if (validation) {
      setCaptureState(prev => ({ ...prev, error: validation.message, canRetry: false }));
      onError?.(validation.message);
      return;
    }

    setCaptureState(prev => ({
      ...prev,
      file,
      isUploading: true,
      uploadProgress: 'Validating and creating evidence record...',
      error: null,
      canRetry: false,
    }));

    // Create preview URL immediately
    const previewUrl = URL.createObjectURL(file);
    setCaptureState(prev => ({ ...prev, preview: previewUrl }));

    try {
      // Use photoUploadService for fast evidence creation + blob upload
      const result = await uploadPhotoWithFastEvidence(file, {
        projectId,
        linkedObjectId,
        location,
        gps,
        title: file.name,
      });

      setCaptureState(prev => ({
        ...prev,
        evidenceId: result.evidenceId,
        blobUrl: result.blobUrl,
        isUploading: false,
        uploadProgress: `Success! Evidence created in ${result.evidenceCreationTime}ms, uploaded in ${result.uploadTime}ms`,
        evidenceCreationTime: result.evidenceCreationTime,
        uploadTime: result.uploadTime,
      }));

      onEvidenceCreated?.(result.evidenceId);

      // Upload succeeded — ensure no stale queue entry remains for this capture.
      if (captureClientIdRef.current) {
        removeFromQueueIO(projectId, captureClientIdRef.current);
        captureClientIdRef.current = null;
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to capture photo';
      // On blob upload failure the FieldEvidence record is preserved; recover its id
      // from the structured error so we can retry and retain the capture (Req 2.5).
      const failedEvidenceId =
        error instanceof PhotoUploadError ? error.evidenceId ?? null : null;

      // Retain the capture in the Sync_Engine queue so it survives and can be
      // retried up to 5 times before being marked failed (Req 2.5).
      if (failedEvidenceId) {
        const clientId = `photo-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
        const enqueueResult = enqueueIO(projectId, {
          clientId,
          kind: 'photo_annotation',
          payload: {
            evidenceId: failedEvidenceId,
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            projectId,
            linkedObjectId,
            location,
          },
          createdAt: new Date().toISOString(),
          attempts: 0,
          status: 'queued',
        });
        captureClientIdRef.current = enqueueResult.success ? clientId : null;
      }

      setCaptureState(prev => ({
        ...prev,
        evidenceId: failedEvidenceId ?? prev.evidenceId,
        isUploading: false,
        uploadProgress: failedEvidenceId
          ? 'Upload failed — capture retained in sync queue for retry'
          : 'Failed',
        error: errorMsg,
        // Allow retry only when the FieldEvidence record exists to retry against.
        canRetry: !!failedEvidenceId,
      }));
      onError?.(errorMsg);
    }
  }, [projectId, linkedObjectId, location, gps, onEvidenceCreated, onError]);

  /**
   * Retry photo upload for failed uploads
   */
  const handleRetryUpload = useCallback(async () => {
    if (!captureState.file || !captureState.evidenceId) {
      return;
    }

    setCaptureState(prev => ({
      ...prev,
      isUploading: true,
      uploadProgress: 'Retrying upload...',
      error: null,
      canRetry: false,
    }));

    try {
      // retryPhotoUpload retries the blob upload up to 5 times (Req 2.5).
      const blobUrl = await retryPhotoUpload(captureState.file, captureState.evidenceId);
      
      // Success — drop the capture from the Sync_Engine queue.
      if (captureClientIdRef.current) {
        removeFromQueueIO(projectId, captureClientIdRef.current);
        captureClientIdRef.current = null;
      }

      setCaptureState(prev => ({
        ...prev,
        blobUrl,
        isUploading: false,
        uploadProgress: 'Upload successful after retry',
        canRetry: false,
      }));

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Retry failed';
      // Retry attempts exhausted — mark the capture failed in the queue while
      // preserving the FieldEvidence record (Req 2.5).
      if (captureClientIdRef.current) {
        markCaptureFailedIO(projectId, captureClientIdRef.current);
      }
      setCaptureState(prev => ({
        ...prev,
        isUploading: false,
        uploadProgress: 'Retry failed — capture marked failed (FieldEvidence preserved)',
        error: errorMsg,
        canRetry: false,
      }));
      onError?.(errorMsg);
    }
  }, [captureState.file, captureState.evidenceId, projectId, onError]);
  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handlePhotoCapture(file);
    }
  }, [handlePhotoCapture]);

  /**
   * Handle drag-and-drop file upload
   */
  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) {
      handlePhotoCapture(file);
    }
  }, [handlePhotoCapture]);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
  }, []);

  /**
   * Generate a unique shape ID
   */
  const generateShapeId = useCallback(() => {
    return `shape-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  /**
   * Handle annotation tool selection
   */
  const selectTool = useCallback((tool: 'arrow' | 'text_note') => {
    setAnnotationState(prev => ({
      ...prev,
      selectedTool: prev.selectedTool === tool ? null : tool,
    }));
  }, []);

  /**
   * Clear all annotations
   */
  const clearAnnotations = useCallback(() => {
    setAnnotationState(prev => ({
      ...prev,
      shapes: [],
      history: [],
      redoStack: [],
      selectedTool: null,
      isDrawing: false,
      currentShape: null,
    }));
  }, []);

  /**
   * Undo last annotation shape (Ctrl+Z)
   */
  const undoAnnotation = useCallback(() => {
    setAnnotationState(prev => {
      if (prev.history.length === 0) return prev;
      const previousShapes = prev.history[prev.history.length - 1];
      return {
        ...prev,
        shapes: previousShapes,
        history: prev.history.slice(0, -1),
        redoStack: [prev.shapes, ...prev.redoStack],
      };
    });
  }, []);

  /**
   * Redo last undone annotation shape (Ctrl+Y / Ctrl+Shift+Z)
   */
  const redoAnnotation = useCallback(() => {
    setAnnotationState(prev => {
      if (prev.redoStack.length === 0) return prev;
      const nextShapes = prev.redoStack[0];
      return {
        ...prev,
        shapes: nextShapes,
        history: [...prev.history, prev.shapes],
        redoStack: prev.redoStack.slice(1),
      };
    });
  }, []);

  /**
   * Handle canvas mouse down - start drawing arrow or place text note
   */
  const handleCanvasMouseDown = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!annotationState.selectedTool) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;

    // Ensure coordinates are within bounds
    if (x < 0 || x > 1 || y < 0 || y > 1) return;

    if (annotationState.selectedTool === 'arrow') {
      // Start drawing arrow
      const newShape: AnnotationShape = {
        id: generateShapeId(),
        type: 'arrow',
        points: [{ x, y }],
        style: { color: '#FF0000', strokeWidth: 2 },
      };

      setAnnotationState(prev => ({
        ...prev,
        isDrawing: true,
        currentShape: newShape,
      }));
    } else if (annotationState.selectedTool === 'text_note') {
      // Place text note
      const text = prompt('Enter note text:');
      if (text && text.trim()) {
        const newShape: AnnotationShape = {
          id: generateShapeId(),
          type: 'text_note',
          points: [{ x, y }],
          style: { color: '#000000', strokeWidth: 1, fontSize: 14 },
          text: text.trim(),
        };

        setAnnotationState(prev => ({
          ...prev,
          shapes: [...prev.shapes, newShape],
          history: [...prev.history, prev.shapes],
          redoStack: [],
        }));
      }
    }
  }, [annotationState.selectedTool, generateShapeId]);

  /**
   * Handle canvas mouse move - update arrow endpoint while drawing
   */
  const handleCanvasMouseMove = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!annotationState.isDrawing || !annotationState.currentShape || annotationState.selectedTool !== 'arrow') {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));

    setAnnotationState(prev => ({
      ...prev,
      currentShape: prev.currentShape ? {
        ...prev.currentShape,
        points: [prev.currentShape.points[0], { x, y }],
      } : null,
    }));
  }, [annotationState.isDrawing, annotationState.currentShape, annotationState.selectedTool]);

  /**
   * Handle canvas mouse up - finish drawing arrow
   */
  const handleCanvasMouseUp = useCallback(() => {
    if (!annotationState.isDrawing || !annotationState.currentShape) return;

    // Only add the shape if it has at least 2 points (valid arrow)
    if (annotationState.currentShape.points.length >= 2) {
      setAnnotationState(prev => ({
        ...prev,
        shapes: [...prev.shapes, prev.currentShape!],
        history: [...prev.history, prev.shapes],
        redoStack: [],
        isDrawing: false,
        currentShape: null,
      }));
    } else {
      setAnnotationState(prev => ({
        ...prev,
        isDrawing: false,
        currentShape: null,
      }));
    }
  }, [annotationState.isDrawing, annotationState.currentShape]);

  /**
   * Generate flattened image with annotations rendered
   */
  const generateFlattenedImage = useCallback(async (): Promise<string | undefined> => {
    if (!captureState.preview || annotationState.shapes.length === 0) {
      return undefined;
    }

    return new Promise((resolve) => {
      const img = new Image();

      // Timeout to avoid hanging in test environments or on load failure
      const timeout = setTimeout(() => resolve(undefined), 500);

      img.onerror = () => {
        clearTimeout(timeout);
        resolve(undefined);
      };

      img.onload = () => {
        clearTimeout(timeout);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(undefined);
          return;
        }

        canvas.width = img.width;
        canvas.height = img.height;

        // Draw the original image
        ctx.drawImage(img, 0, 0);

        // Draw annotations
        annotationState.shapes.forEach((shape) => {
          ctx.strokeStyle = shape.style.color;
          ctx.lineWidth = shape.style.strokeWidth;
          ctx.fillStyle = shape.style.color;

          if (shape.type === 'arrow' && shape.points.length >= 2) {
            const startX = shape.points[0].x * canvas.width;
            const startY = shape.points[0].y * canvas.height;
            const endX = shape.points[1].x * canvas.width;
            const endY = shape.points[1].y * canvas.height;

            // Draw arrow line
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();

            // Draw arrowhead
            const headlen = 15;
            const angle = Math.atan2(endY - startY, endX - startX);
            ctx.beginPath();
            ctx.moveTo(endX, endY);
            ctx.lineTo(
              endX - headlen * Math.cos(angle - Math.PI / 6),
              endY - headlen * Math.sin(angle - Math.PI / 6)
            );
            ctx.moveTo(endX, endY);
            ctx.lineTo(
              endX - headlen * Math.cos(angle + Math.PI / 6),
              endY - headlen * Math.sin(angle + Math.PI / 6)
            );
            ctx.stroke();
          } else if (shape.type === 'text_note' && shape.text) {
            const x = shape.points[0].x * canvas.width;
            const y = shape.points[0].y * canvas.height;

            ctx.font = `${shape.style.fontSize || 14}px Arial`;
            ctx.fillStyle = '#FFFF00'; // Yellow background
            const metrics = ctx.measureText(shape.text);
            const padding = 4;
            ctx.fillRect(
              x - padding,
              y - (shape.style.fontSize || 14) - padding,
              metrics.width + padding * 2,
              (shape.style.fontSize || 14) + padding * 2
            );

            ctx.fillStyle = shape.style.color;
            ctx.fillText(shape.text, x, y);
          }
        });

        // Convert to blob and get URL
        canvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            resolve(url);
          } else {
            resolve(undefined);
          }
        }, 'image/png');
      };
      img.src = captureState.preview!;
    });
  }, [captureState.preview, annotationState.shapes]);

  /**
   * Save annotations with flattened image
   */
  const saveAnnotations = useCallback(async () => {
    if (!captureState.evidenceId || annotationState.shapes.length === 0) {
      return;
    }

    try {
      // Generate flattened image if we have annotations
      const flattenedUri = await generateFlattenedImage();

      const annotation: PhotoAnnotation = {
        evidenceId: captureState.evidenceId,
        shapes: annotationState.shapes,
        flattenedUri,
      };

      await saveAnnotation(projectId, annotation);
      onAnnotationSaved?.(annotation);
      
      setCaptureState(prev => ({
        ...prev,
        uploadProgress: 'Photo and annotations saved successfully',
      }));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to save annotations';
      setCaptureState(prev => ({ ...prev, error: errorMsg }));
      onError?.(errorMsg);
    }
  }, [projectId, captureState.evidenceId, annotationState.shapes, generateFlattenedImage, onAnnotationSaved, onError]);

  /**
   * Trigger file input click
   */
  const triggerFileInput = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Cleanup preview URL on unmount
  useEffect(() => {
    return () => {
      if (captureState.preview) {
        URL.revokeObjectURL(captureState.preview);
      }
    };
  }, [captureState.preview]);

  // Set up canvas dimensions to match the image when preview changes
  useEffect(() => {
    if (captureState.preview && canvasRef.current) {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        if (canvas) {
          const container = canvas.parentElement;
          if (container) {
            const containerRect = container.getBoundingClientRect();
            canvas.width = containerRect.width;
            canvas.height = containerRect.height;
          }
        }
      };
      img.src = captureState.preview;
    }
  }, [captureState.preview]);

  // Load existing annotations when evidence ID becomes available
  useEffect(() => {
    if (captureState.evidenceId && projectId) {
      loadAnnotation(projectId, captureState.evidenceId)
        .then((annotation) => {
          if (annotation) {
            setAnnotationState(prev => ({
              ...prev,
              shapes: annotation.shapes,
            }));
          }
        })
        .catch((error) => {
          console.warn('Failed to load existing annotations:', error);
          // Don't surface this error to user as it's not critical
        });
    }
  }, [captureState.evidenceId, projectId]);

  /**
   * Keyboard shortcuts for annotation tools and undo/redo (Req 9.4, 9.5)
   * 'a' → arrow tool toggle
   * 't' → text tool toggle
   * Ctrl+Z → undo last annotation
   * Ctrl+Y / Ctrl+Shift+Z → redo
   * Escape → deselect current tool
   */
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore shortcuts when user is typing in an input / textarea / contenteditable
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      const isCtrl = event.ctrlKey || event.metaKey;

      if (isCtrl && !event.shiftKey && event.key === 'z') {
        event.preventDefault();
        undoAnnotation();
        return;
      }

      if (isCtrl && (event.key === 'y' || (event.shiftKey && event.key === 'z') || (event.shiftKey && event.key === 'Z'))) {
        event.preventDefault();
        redoAnnotation();
        return;
      }

      // Tool shortcuts only active when photo is loaded
      if (!captureState.preview) return;

      if (!isCtrl) {
        if (event.key === 'a' || event.key === 'A') {
          event.preventDefault();
          selectTool('arrow');
        } else if (event.key === 't' || event.key === 'T') {
          event.preventDefault();
          selectTool('text_note');
        } else if (event.key === 'Escape') {
          setAnnotationState(prev => ({ ...prev, selectedTool: null, isDrawing: false, currentShape: null }));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [captureState.preview, selectTool, undoAnnotation, redoAnnotation]);

  return (
    <Card className="w-full max-w-4xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="h-5 w-5" />
          Photo Capture & Annotation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Photo Capture Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="photo-upload">Photo Upload</Label>
            <div className="text-sm text-muted-foreground">
              JPEG/PNG files up to {MAX_PHOTO_SIZE_MB} MB
            </div>
          </div>

          {/* Error Display */}
          {captureState.error && (
            <Alert variant="destructive" role="alert" aria-live="assertive">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              <AlertDescription>{captureState.error}</AlertDescription>
            </Alert>
          )}

          {/* Upload Status */}
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-muted-foreground" aria-live="polite" aria-atomic="true">
              Status: {captureState.uploadProgress}
            </div>
            {captureState.canRetry && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetryUpload}
                disabled={captureState.isUploading}
                aria-label="Retry photo upload"
              >
                <RotateCcw className="h-4 w-4 mr-1" aria-hidden="true" />
                Retry Upload
              </Button>
            )}
          </div>

          {/* Performance Metrics */}
          {captureState.evidenceCreationTime && (
            <div className="text-xs text-muted-foreground space-y-1">
              <div>Evidence created in {captureState.evidenceCreationTime}ms (target: &lt;2000ms)</div>
              {captureState.uploadTime && (
                <div>Blob upload in {captureState.uploadTime}ms</div>
              )}
            </div>
          )}

          {/* File Input and Drop Zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className="relative border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors cursor-pointer"
            onClick={triggerFileInput}
            role="button"
            tabIndex={captureState.isUploading ? -1 : 0}
            aria-label={`Upload photo. Accepts JPEG or PNG files up to ${MAX_PHOTO_SIZE_MB} MB. Press Enter or Space to open file picker.`}
            aria-disabled={captureState.isUploading}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (!captureState.isUploading) triggerFileInput();
              }
            }}
          >
            <input
              ref={fileInputRef}
              id="photo-upload"
              type="file"
              accept="image/jpeg,image/png"
              onChange={handleFileSelect}
              className="sr-only"
              disabled={captureState.isUploading}
              aria-label="Select photo file"
            />
            
            <div className="space-y-2">
              <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
              <div>
                <span className="font-medium">Click to upload</span> or drag and drop
              </div>
              <div className="text-sm text-muted-foreground">
                JPEG or PNG files up to {MAX_PHOTO_SIZE_MB} MB
                {captureState.file && (
                  <span className="block mt-1">
                    Selected: {captureState.file.name} ({formatFileSize(captureState.file.size)})
                  </span>
                )}
              </div>
            </div>

            {captureState.isUploading && (
              <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                  <span>Processing...</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Photo Preview and Annotation */}
        {captureState.preview && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label id="photo-preview-label">Photo Preview</Label>
              <div className="flex gap-2" role="toolbar" aria-label="Annotation tools">
                <Button
                  variant={annotationState.selectedTool === 'arrow' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => selectTool('arrow')}
                  disabled={captureState.isUploading}
                  aria-label={`Arrow annotation tool${annotationState.selectedTool === 'arrow' ? ' (active)' : ''} — keyboard shortcut: A`}
                  aria-pressed={annotationState.selectedTool === 'arrow'}
                >
                  <ArrowRight className="h-4 w-4 mr-1" aria-hidden="true" />
                  Arrow
                </Button>
                <Button
                  variant={annotationState.selectedTool === 'text_note' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => selectTool('text_note')}
                  disabled={captureState.isUploading}
                  aria-label={`Text note annotation tool${annotationState.selectedTool === 'text_note' ? ' (active)' : ''} — keyboard shortcut: T`}
                  aria-pressed={annotationState.selectedTool === 'text_note'}
                >
                  <Type className="h-4 w-4 mr-1" aria-hidden="true" />
                  Text
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={undoAnnotation}
                  disabled={captureState.isUploading || annotationState.history.length === 0}
                  aria-label="Undo last annotation — keyboard shortcut: Ctrl+Z"
                  title="Undo (Ctrl+Z)"
                >
                  <Undo2 className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only">Undo</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={redoAnnotation}
                  disabled={captureState.isUploading || annotationState.redoStack.length === 0}
                  aria-label="Redo annotation — keyboard shortcut: Ctrl+Y"
                  title="Redo (Ctrl+Y)"
                >
                  <Redo2 className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only">Redo</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearAnnotations}
                  disabled={captureState.isUploading}
                  aria-label="Clear all annotations"
                >
                  Clear
                </Button>
                <Button
                  onClick={saveAnnotations}
                  disabled={captureState.isUploading || !captureState.evidenceId}
                  size="sm"
                  aria-label="Save photo and annotations"
                >
                  <Save className="h-4 w-4 mr-1" aria-hidden="true" />
                  Save
                </Button>
              </div>
            </div>

            <div className="relative border rounded-lg overflow-hidden">
              <img
                src={captureState.preview}
                alt="Captured photo for annotation"
                className="w-full h-auto max-h-96 object-contain block"
              />
              
              {/* Annotation Canvas Overlay */}
              <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full"
                style={{ 
                  display: annotationState.selectedTool ? 'block' : 'none',
                  cursor: annotationState.selectedTool ? 'crosshair' : 'default',
                }}
                role="img"
                aria-label={
                  annotationState.selectedTool === 'arrow'
                    ? 'Drawing canvas — click and drag to draw an arrow annotation'
                    : annotationState.selectedTool === 'text_note'
                    ? 'Drawing canvas — click to place a text note annotation'
                    : 'Annotation drawing canvas'
                }
                tabIndex={annotationState.selectedTool ? 0 : -1}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onMouseLeave={handleCanvasMouseUp} // Stop drawing when leaving canvas
              />

              {/* Static Annotation Display Layer */}
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                style={{ display: annotationState.shapes.length > 0 || annotationState.currentShape ? 'block' : 'none' }}
              >
                {/* Render saved shapes */}
                {annotationState.shapes.map((shape) => {
                  if (shape.type === 'arrow' && shape.points.length >= 2) {
                    const startX = `${shape.points[0].x * 100}%`;
                    const startY = `${shape.points[0].y * 100}%`;
                    const endX = `${shape.points[1].x * 100}%`;
                    const endY = `${shape.points[1].y * 100}%`;
                    
                    return (
                      <g key={shape.id}>
                        <line
                          x1={startX}
                          y1={startY}
                          x2={endX}
                          y2={endY}
                          stroke={shape.style.color}
                          strokeWidth={shape.style.strokeWidth}
                          markerEnd="url(#arrowhead)"
                        />
                        <defs>
                          <marker
                            id="arrowhead"
                            markerWidth="10"
                            markerHeight="7"
                            refX="9"
                            refY="3.5"
                            orient="auto"
                          >
                            <polygon
                              points="0 0, 10 3.5, 0 7"
                              fill={shape.style.color}
                            />
                          </marker>
                        </defs>
                      </g>
                    );
                  }
                  return null;
                })}

                {/* Render current shape being drawn */}
                {annotationState.currentShape && annotationState.currentShape.type === 'arrow' && annotationState.currentShape.points.length >= 2 && (
                  <line
                    x1={`${annotationState.currentShape.points[0].x * 100}%`}
                    y1={`${annotationState.currentShape.points[0].y * 100}%`}
                    x2={`${annotationState.currentShape.points[1].x * 100}%`}
                    y2={`${annotationState.currentShape.points[1].y * 100}%`}
                    stroke={annotationState.currentShape.style.color}
                    strokeWidth={annotationState.currentShape.style.strokeWidth}
                    strokeDasharray="5,5" // Dashed line while drawing
                    markerEnd="url(#arrowhead-temp)"
                  />
                )}

                {annotationState.currentShape && annotationState.currentShape.type === 'arrow' && (
                  <defs>
                    <marker
                      id="arrowhead-temp"
                      markerWidth="10"
                      markerHeight="7"
                      refX="9"
                      refY="3.5"
                      orient="auto"
                    >
                      <polygon
                        points="0 0, 10 3.5, 0 7"
                        fill={annotationState.currentShape.style.color}
                      />
                    </marker>
                  </defs>
                )}
              </svg>

              {/* Text Notes Display */}
              <div className="absolute inset-0 pointer-events-none">
                {annotationState.shapes.map((shape) => {
                  if (shape.type === 'text_note' && shape.text) {
                    return (
                      <div
                        key={shape.id}
                        className="absolute bg-yellow-200 border border-yellow-400 px-2 py-1 rounded text-sm shadow-md"
                        style={{
                          left: `${shape.points[0]?.x * 100}%`,
                          top: `${shape.points[0]?.y * 100}%`,
                          color: shape.style.color,
                          fontSize: shape.style.fontSize || 14,
                          transform: 'translate(0, -100%)', // Position above the point
                        }}
                      >
                        {shape.text}
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            </div>

            {annotationState.selectedTool && (
              <div className="text-sm text-muted-foreground" role="status" aria-live="polite">
                {annotationState.selectedTool === 'arrow' && 'Arrow tool active (A) — click and drag to draw an arrow pointing from start to end. Press Escape to deselect.'}
                {annotationState.selectedTool === 'text_note' && 'Text tool active (T) — click to place a text note at that location. Press Escape to deselect.'}
              </div>
            )}
            {!annotationState.selectedTool && captureState.preview && (
              <p className="text-xs text-muted-foreground">
                Keyboard shortcuts: <kbd className="px-1 py-0.5 text-xs bg-muted rounded">A</kbd> Arrow tool ·{' '}
                <kbd className="px-1 py-0.5 text-xs bg-muted rounded">T</kbd> Text tool ·{' '}
                <kbd className="px-1 py-0.5 text-xs bg-muted rounded">Ctrl+Z</kbd> Undo ·{' '}
                <kbd className="px-1 py-0.5 text-xs bg-muted rounded">Ctrl+Y</kbd> Redo
              </p>
            )}
          </div>
        )}

        {/* Summary */}
        {captureState.evidenceId && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-green-800">
              <Camera className="h-4 w-4" />
              <span className="font-medium">Photo Captured</span>
            </div>
            <div className="text-sm text-green-700 mt-1">
              Evidence ID: {captureState.evidenceId}
              <br />
              Blob URL: {captureState.blobUrl ? 'Uploaded' : 'Pending'}
              <br />
              Annotations: {annotationState.shapes.length}
              {captureState.evidenceCreationTime && (
                <>
                  <br />
                  Performance: Evidence {captureState.evidenceCreationTime}ms
                  {captureState.uploadTime && `, Upload ${captureState.uploadTime}ms`}
                </>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default PhotoAnnotator;