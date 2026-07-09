import React, { useState, useCallback, useRef } from 'react';
import { Upload, FileText, AlertTriangle, CheckCircle } from 'lucide-react';

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 500MB
const ALLOWED_EXTENSION = '.ifc';

// ─── Types ───────────────────────────────────────────────────────────────────

type UploadState = 'idle' | 'validating' | 'uploading' | 'success' | 'error';

interface IfcUploadPanelProps {
  onUpload: (file: File) => Promise<void>;
  disabled?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Drag-and-drop IFC upload panel with progress indicator,
 * file size validation (500MB), and extension check.
 *
 * Requirements: 1.1, 1.5
 */
export default function IfcUploadPanel({ onUpload, disabled = false }: IfcUploadPanelProps) {
  const [state, setState] = useState<UploadState>('idle');
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // ─── Validation ─────────────────────────────────────────────────────────

  const validateFile = useCallback((file: File): string | null => {
    const name = file.name.toLowerCase();
    if (!name.endsWith(ALLOWED_EXTENSION)) {
      return `Invalid file type. Only .ifc files are accepted. Got "${file.name}"`;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      return `File exceeds maximum size of 500MB. File is ${sizeMB}MB.`;
    }
    return null;
  }, []);

  // ─── Upload Handler ─────────────────────────────────────────────────────

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setFileName(file.name);
    setState('validating');
    setProgress(0);

    const validationError = validateFile(file);
    if (validationError) {
      setState('error');
      setError(validationError);
      return;
    }

    setState('uploading');
    setProgress(20);

    try {
      // Simulate progress steps while actual upload is happening
      const progressInterval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 15, 85));
      }, 400);

      await onUpload(file);

      clearInterval(progressInterval);
      setProgress(100);
      setState('success');
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    }
  }, [onUpload, validateFile]);

  // ─── Drag & Drop Handlers ──────────────────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setDragOver(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    if (disabled) return;

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  }, [disabled, handleFile]);

  // ─── Click-to-upload ────────────────────────────────────────────────────

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
    // Reset input so the same file can be re-selected
    if (inputRef.current) inputRef.current.value = '';
  }, [handleFile]);

  const handleClick = useCallback(() => {
    if (!disabled && state !== 'uploading') {
      inputRef.current?.click();
    }
  }, [disabled, state]);

  // ─── Reset ─────────────────────────────────────────────────────────────

  const handleReset = useCallback(() => {
    setState('idle');
    setError(null);
    setFileName(null);
    setProgress(0);
  }, []);

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <section className="panel">
      <h2 style={{ color: 'var(--ink)', fontSize: 14, marginBottom: 12 }}>Upload IFC Model</h2>

      {/* Drop Zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Drop IFC file here or click to browse"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(); }}
        style={{
          border: `2px dashed ${dragOver ? 'var(--teal)' : 'var(--border)'}`,
          borderRadius: 16,
          padding: '32px 24px',
          textAlign: 'center',
          cursor: disabled || state === 'uploading' ? 'not-allowed' : 'pointer',
          background: dragOver ? 'var(--aqua)' : 'rgba(255,255,255,.5)',
          transition: 'all 0.2s ease',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {/* Idle state */}
        {state === 'idle' && (
          <>
            <Upload size={32} style={{ color: 'var(--teal)', marginBottom: 10 }} />
            <p style={{ color: 'var(--ink)', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
              Drag &amp; drop an IFC file here
            </p>
            <p style={{ color: 'var(--muted)', fontSize: 12 }}>
              or click to browse · Supports IFC2x3, IFC4, IFC4.3 · Max 500MB
            </p>
          </>
        )}

        {/* Validating state */}
        {state === 'validating' && (
          <>
            <FileText size={32} style={{ color: 'var(--teal)', marginBottom: 10 }} />
            <p style={{ color: 'var(--ink)', fontSize: 14, fontWeight: 500 }}>
              Validating {fileName}…
            </p>
          </>
        )}

        {/* Uploading state */}
        {state === 'uploading' && (
          <>
            <Upload size={32} style={{ color: 'var(--teal)', marginBottom: 10 }} />
            <p style={{ color: 'var(--ink)', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
              Uploading {fileName}…
            </p>
            {/* Progress bar */}
            <div style={{
              width: '100%',
              maxWidth: 320,
              height: 6,
              borderRadius: 3,
              background: 'var(--border)',
              margin: '0 auto',
              overflow: 'hidden',
            }}>
              <div style={{
                width: `${progress}%`,
                height: '100%',
                borderRadius: 3,
                background: 'var(--teal)',
                transition: 'width 0.3s ease',
              }} />
            </div>
            <p style={{ color: 'var(--muted)', fontSize: 11, marginTop: 6 }}>{progress}%</p>
          </>
        )}

        {/* Success state */}
        {state === 'success' && (
          <>
            <CheckCircle size={32} style={{ color: 'var(--green)', marginBottom: 10 }} />
            <p style={{ color: 'var(--ink)', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
              {fileName} uploaded successfully
            </p>
            <button
              className="btn"
              onClick={(e) => { e.stopPropagation(); handleReset(); }}
              style={{ marginTop: 10, fontSize: 12 }}
            >
              Upload another
            </button>
          </>
        )}

        {/* Error state */}
        {state === 'error' && (
          <>
            <AlertTriangle size={32} style={{ color: 'var(--red)', marginBottom: 10 }} />
            <p style={{ color: 'var(--red)', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
              {error}
            </p>
            <button
              className="btn"
              onClick={(e) => { e.stopPropagation(); handleReset(); }}
              style={{ marginTop: 10, fontSize: 12 }}
            >
              Try again
            </button>
          </>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept=".ifc"
        onChange={handleInputChange}
        style={{ display: 'none' }}
        aria-hidden="true"
      />
    </section>
  );
}
