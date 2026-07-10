/**
 * EditablePreview — Inline editable view for Copilot structured outputs.
 *
 * Supports RFI drafts, narratives, compliance gaps, and status summaries.
 * Field-level editing before finalisation with spine write-back.
 *
 * @requirements 6.5, 6.6, 6.7, 7.5, 8.4, 9.4
 */

import { useState } from 'react';
import { Check, X, AlertTriangle, FileText, Shield, BarChart3 } from 'lucide-react';
import type { RFIDraftOutput, NarrativeOutput, ComplianceGap, StatusSummary } from '@/services/copilotTypes';

// ─── RFI Form ──────────────────────────────────────────────────────────────

interface RFIFormProps {
  data: RFIDraftOutput;
  onFinalise: (data: RFIDraftOutput) => void;
  onDiscard: () => void;
}

function RFIForm({ data, onFinalise, onDiscard }: RFIFormProps) {
  const [form, setForm] = useState(data);
  const [error, setError] = useState<string | null>(null);

  const handleFinalise = () => {
    if (!form.addressedTo) {
      setError('An addressee is required before finalising.');
      return;
    }
    onFinalise(form);
  };

  return (
    <div className="panel" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <FileText size={16} style={{ color: 'var(--teal)' }} />
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--deep)', margin: 0 }}>RFI #{form.rfiNumber} — Draft</h3>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label style={{ fontSize: 11, color: 'var(--muted)' }}>
          Subject
          <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} style={{ display: 'block', width: '100%', marginTop: 4, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }} />
        </label>

        <label style={{ fontSize: 11, color: 'var(--muted)' }}>
          Addressed To
          <input value={form.addressedTo || ''} onChange={(e) => { setForm({ ...form, addressedTo: e.target.value }); setError(null); }} placeholder="Required — enter addressee" style={{ display: 'block', width: '100%', marginTop: 4, padding: '6px 10px', border: `1px solid ${error ? 'var(--red)' : 'var(--border)'}`, borderRadius: 6, fontSize: 13 }} />
        </label>

        <label style={{ fontSize: 11, color: 'var(--muted)' }}>
          Question Body
          <textarea value={form.questionBody} onChange={(e) => setForm({ ...form, questionBody: e.target.value })} rows={4} style={{ display: 'block', width: '100%', marginTop: 4, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, resize: 'vertical' }} />
        </label>

        <div style={{ fontSize: 11, color: 'var(--muted)' }}>
          Deadline: <span style={{ color: 'var(--ink)' }}>{form.suggestedDeadline}</span>
          &nbsp;•&nbsp;References: {form.references.length}
        </div>

        {error && <div style={{ color: 'var(--red)', fontSize: 11 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button className="btn" onClick={handleFinalise} style={{ fontSize: 12 }}><Check size={14} /> Finalise RFI</button>
          <button className="btn-secondary" onClick={onDiscard} style={{ fontSize: 12 }}><X size={14} /> Discard</button>
        </div>
      </div>
    </div>
  );
}

// ─── Narrative Preview ─────────────────────────────────────────────────────

interface NarrativePreviewProps {
  data: NarrativeOutput;
  onAccept: (data: NarrativeOutput) => void;
  onDiscard: () => void;
}

function NarrativePreview({ data, onAccept, onDiscard }: NarrativePreviewProps) {
  const [content, setContent] = useState(data.content);

  return (
    <div className="panel" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <FileText size={16} style={{ color: 'var(--teal)' }} />
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--deep)', margin: 0 }}>Narrative Draft</h3>
      </div>

      <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={8} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, lineHeight: 1.6, resize: 'vertical' }} />

      <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 11, color: 'var(--muted)' }}>
        <span>{data.wordCount} words</span>
        <span>{data.paragraphCount} paragraphs</span>
        <span>Grade {data.readabilityGrade}</span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn" onClick={() => onAccept({ ...data, content })} style={{ fontSize: 12 }}><Check size={14} /> Accept</button>
        <button className="btn-secondary" onClick={onDiscard} style={{ fontSize: 12 }}><X size={14} /> Discard</button>
      </div>
    </div>
  );
}

// ─── Compliance Gap List ───────────────────────────────────────────────────

interface ComplianceGapListProps {
  gaps: ComplianceGap[];
  onAccept: (gaps: ComplianceGap[]) => void;
  onDiscard: () => void;
}

function ComplianceGapList({ gaps, onAccept, onDiscard }: ComplianceGapListProps) {
  const severityColor = (s: string) => s === 'critical' ? 'var(--red)' : s === 'warning' ? 'var(--amber)' : 'var(--muted)';

  return (
    <div className="panel" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Shield size={16} style={{ color: 'var(--teal)' }} />
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--deep)', margin: 0 }}>Compliance Gaps ({gaps.length})</h3>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
        {gaps.map((gap) => (
          <div key={gap.id} style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, borderLeft: `3px solid ${severityColor(gap.severity)}` }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink)' }}>{gap.title}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{gap.category.replace(/_/g, ' ')} {gap.sansReference && `• ${gap.sansReference}`}</div>
            <div style={{ fontSize: 11, color: 'var(--deep)', marginTop: 4 }}>
              <AlertTriangle size={10} /> {gap.suggestedRemediation}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn" onClick={() => onAccept(gaps)} style={{ fontSize: 12 }}><Check size={14} /> Accept All</button>
        <button className="btn-secondary" onClick={onDiscard} style={{ fontSize: 12 }}><X size={14} /> Dismiss</button>
      </div>
    </div>
  );
}

// ─── Status Summary Cards ──────────────────────────────────────────────────

interface StatusSummaryCardsProps {
  summary: StatusSummary;
  onExport: (summary: StatusSummary) => void;
  onDiscard: () => void;
}

function StatusSummaryCards({ summary, onExport, onDiscard }: StatusSummaryCardsProps) {
  const sections = [
    { title: 'Overview', content: summary.overview, icon: BarChart3 },
    { title: 'Risks', content: summary.risks, icon: AlertTriangle },
    { title: 'Upcoming', content: summary.upcoming, icon: FileText },
    { title: 'Blockers', content: summary.blockers, icon: Shield },
  ];

  return (
    <div className="panel" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <BarChart3 size={16} style={{ color: 'var(--teal)' }} />
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--deep)', margin: 0 }}>Status Summary</h3>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {sections.map(({ title, content, icon: Icon }) => (
          <div key={title} style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 10, background: 'rgba(255,255,255,.5)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Icon size={12} style={{ color: 'var(--teal)' }} />
              <span style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--deep)', fontWeight: 600 }}>{title}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink)', lineHeight: 1.5 }}>{content || 'No data'}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn" onClick={() => onExport(summary)} style={{ fontSize: 12 }}><Check size={14} /> Export</button>
        <button className="btn-secondary" onClick={onDiscard} style={{ fontSize: 12 }}><X size={14} /> Dismiss</button>
      </div>
    </div>
  );
}

// ─── Main EditablePreview Component ────────────────────────────────────────

export type PreviewType = 'rfi' | 'narrative' | 'compliance' | 'status';

interface EditablePreviewProps {
  type: PreviewType;
  data: RFIDraftOutput | NarrativeOutput | ComplianceGap[] | StatusSummary;
  onFinalise: (data: unknown) => void;
  onDiscard: () => void;
}

export default function EditablePreview({ type, data, onFinalise, onDiscard }: EditablePreviewProps) {
  switch (type) {
    case 'rfi':
      return <RFIForm data={data as RFIDraftOutput} onFinalise={onFinalise} onDiscard={onDiscard} />;
    case 'narrative':
      return <NarrativePreview data={data as NarrativeOutput} onAccept={onFinalise} onDiscard={onDiscard} />;
    case 'compliance':
      return <ComplianceGapList gaps={data as ComplianceGap[]} onAccept={onFinalise} onDiscard={onDiscard} />;
    case 'status':
      return <StatusSummaryCards summary={data as StatusSummary} onExport={onFinalise} onDiscard={onDiscard} />;
    default:
      return null;
  }
}

export { RFIForm, NarrativePreview, ComplianceGapList, StatusSummaryCards };
