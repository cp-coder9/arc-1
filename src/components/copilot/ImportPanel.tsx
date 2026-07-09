/**
 * ImportPanel — BYOAI import form for external AI content.
 *
 * Button labelled for external AI import (Wingman branding).
 * Import form with: content paste area, source model name, content type dropdown,
 * optional metadata fields (prompt, external tool URL).
 *
 * @requirements 11.3, 11.5, 11.6
 */

import { useState } from 'react';
import { Upload, Check, AlertCircle } from 'lucide-react';
import type { BYOAIContentType } from '@/services/copilotTypes';

interface ImportPanelProps {
  onImport: (data: {
    content: string;
    externalModelName: string;
    contentType: BYOAIContentType;
    metadata?: { prompt?: string; externalToolUrl?: string };
  }) => Promise<{ documentId: string; provenanceRecordId: string }>;
}

const CONTENT_TYPES: { value: BYOAIContentType; label: string }[] = [
  { value: 'rfi_draft', label: 'RFI Draft' },
  { value: 'narrative', label: 'Narrative' },
  { value: 'specification', label: 'Specification' },
  { value: 'analysis', label: 'Analysis' },
  { value: 'general', label: 'General' },
];

export default function ImportPanel({ onImport }: ImportPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [content, setContent] = useState('');
  const [modelName, setModelName] = useState('');
  const [contentType, setContentType] = useState<BYOAIContentType>('general');
  const [prompt, setPrompt] = useState('');
  const [toolUrl, setToolUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ documentId: string; provenanceRecordId: string } | null>(null);

  const reset = () => {
    setContent('');
    setModelName('');
    setContentType('general');
    setPrompt('');
    setToolUrl('');
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async () => {
    setError(null);
    if (!content.trim()) { setError('Content is required.'); return; }
    if (!modelName.trim()) { setError('Source model name is required.'); return; }

    setIsSubmitting(true);
    try {
      const metadata: { prompt?: string; externalToolUrl?: string } = {};
      if (prompt.trim()) metadata.prompt = prompt.trim();
      if (toolUrl.trim()) metadata.externalToolUrl = toolUrl.trim();

      const result = await onImport({
        content: content.trim(),
        externalModelName: modelName.trim(),
        contentType,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      });
      setSuccess(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) {
    return (
      <button className="btn-secondary" onClick={() => setIsOpen(true)} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Upload size={14} /> Import External AI Content
      </button>
    );
  }

  return (
    <div className="panel" style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--deep)', margin: 0 }}>
          <Upload size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          Import External AI Content
        </h3>
        <button onClick={() => { setIsOpen(false); reset(); }} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18 }}>×</button>
      </div>

      {success ? (
        <div style={{ padding: 16, background: 'rgba(74,222,128,.06)', borderRadius: 8, border: '1px solid rgba(74,222,128,.18)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--green)', fontWeight: 500, fontSize: 13 }}>
            <Check size={16} /> Import Successful
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
            Document ID: <code style={{ fontFamily: 'monospace' }}>{success.documentId}</code>
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
            Provenance ID: <code style={{ fontFamily: 'monospace' }}>{success.provenanceRecordId}</code>
          </div>
          <button className="btn-secondary" onClick={reset} style={{ marginTop: 12, fontSize: 11 }}>Import Another</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ fontSize: 11, color: 'var(--muted)' }}>
            Content *
            <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={5} placeholder="Paste AI-generated content here..." style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, resize: 'vertical' }} />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={{ fontSize: 11, color: 'var(--muted)' }}>
              Source Model *
              <input value={modelName} onChange={(e) => setModelName(e.target.value)} placeholder="e.g. gpt-4, claude-3.5" style={{ display: 'block', width: '100%', marginTop: 4, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }} />
            </label>

            <label style={{ fontSize: 11, color: 'var(--muted)' }}>
              Content Type *
              <select value={contentType} onChange={(e) => setContentType(e.target.value as BYOAIContentType)} style={{ display: 'block', width: '100%', marginTop: 4, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}>
                {CONTENT_TYPES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>

          <label style={{ fontSize: 11, color: 'var(--muted)' }}>
            Prompt Used (optional)
            <input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="The prompt used to generate this content" style={{ display: 'block', width: '100%', marginTop: 4, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }} />
          </label>

          <label style={{ fontSize: 11, color: 'var(--muted)' }}>
            External Tool URL (optional)
            <input value={toolUrl} onChange={(e) => setToolUrl(e.target.value)} placeholder="https://chat.openai.com/..." style={{ display: 'block', width: '100%', marginTop: 4, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }} />
          </label>

          {error && (
            <div style={{ color: 'var(--red)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
              <AlertCircle size={12} /> {error}
            </div>
          )}

          <button className="btn" onClick={handleSubmit} disabled={isSubmitting} style={{ fontSize: 12, marginTop: 4 }}>
            {isSubmitting ? 'Importing...' : 'Import with Provenance'}
          </button>
        </div>
      )}
    </div>
  );
}
