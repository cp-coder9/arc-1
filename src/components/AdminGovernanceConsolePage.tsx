/**
 * AdminGovernanceConsolePage — Platform governance console for admin/platform_admin users.
 *
 * Layout: Hero → Stat Row → View-routed Panels
 * Follows the AppShell workspace-template pattern with CSS token classes.
 * Accepts `user: UserProfile` prop and restricts access to platform_admin and admin roles only.
 *
 * Views: project-search, user-management, feature-flags, tariff-registry, payment-rates,
 *        escrow-oversight, ai-governance, flagged-messages, audit-viewer, override-log
 *
 * Requirements validated: 9.1
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, query, where, orderBy, getDocs, type DocumentData, type Query } from 'firebase/firestore';
import {
  Search, Users, Flag, BookOpen, CreditCard, Landmark, Bot,
  MessageSquareWarning, ShieldCheck, FileText, ClipboardList,
  AlertTriangle, CheckCircle2, Loader2, Settings
} from 'lucide-react';
import { db } from '@/lib/firebase';
import type { UserProfile } from '@/types';
import UserRoleManagementPanel from './admin/UserRoleManagementPanel';
import OverrideAuditPanel from './admin/OverrideAuditPanel';
import AdminConfigVersioningPanel from './AdminConfigVersioningPanel';
import {
  createConfigVersion,
  getVersionHistory,
  type ConfigVersion,
} from '@/services/configVersioningService';

import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';

// ── Types ────────────────────────────────────────────────────────────────────

type AdminGovernanceConsolePageProps = { user: UserProfile };

type AdminView =
  | 'project-search'
  | 'user-management'
  | 'feature-flags'
  | 'tariff-registry'
  | 'payment-rates'
  | 'escrow-oversight'
  | 'ai-governance'
  | 'flagged-messages'
  | 'audit-viewer'
  | 'override-log';

type GovernanceSignal = { id: string; title: string; description: string; collectionName: string; status?: string; actor?: string; createdAt?: string };
type GovernanceDataset = { id: string; label: string; description: string; collectionName: string; icon: React.ReactNode; query: Query<DocumentData>; riskStatuses?: string[] };

// ── Constants ────────────────────────────────────────────────────────────────

const RISK_STATUSES = ['blocked', 'disputed', 'failed', 'flagged', 'held', 'overdue', 'pending_review', 'rejected', 'requires_review'];

const VIEW_LABELS: Record<AdminView, string> = {
  'project-search': 'Project Search',
  'user-management': 'User Management',
  'feature-flags': 'Feature Flags',
  'tariff-registry': 'Tariff Registry',
  'payment-rates': 'Payment Rates',
  'escrow-oversight': 'Escrow Oversight',
  'ai-governance': 'AI Governance',
  'flagged-messages': 'Flagged Messages',
  'audit-viewer': 'Audit Viewer',
  'override-log': 'Override Log',
};


// ── Helpers ──────────────────────────────────────────────────────────────────

function datasetQuery(collectionName: string) { return query(getDemoCol(collectionName), limit(50)); }

function valueAsString(value: unknown) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') return value.toDate().toISOString();
  return undefined;
}

function statusVariant(status?: string): 'success' | 'warning' | 'danger' | 'muted' {
  const normalized = status?.toLowerCase();
  if (!normalized) return 'muted';
  if (['approved', 'completed', 'released', 'resolved', 'active'].includes(normalized)) return 'success';
  if (['pending', 'pending_review', 'requires_review', 'held'].includes(normalized)) return 'warning';
  if (RISK_STATUSES.includes(normalized)) return 'danger';
  return 'muted';
}

function pillStyleForVariant(variant: 'success' | 'warning' | 'danger' | 'muted'): React.CSSProperties {
  switch (variant) {
    case 'success': return { color: 'var(--green)', background: 'rgba(74,222,128,.1)', borderColor: 'rgba(74,222,128,.18)' };
    case 'warning': return { color: 'var(--amber)', background: 'rgba(245,166,35,.08)', borderColor: 'rgba(245,166,35,.18)' };
    case 'danger': return { color: 'var(--red)', background: 'rgba(217,87,71,.06)', borderColor: 'rgba(217,87,71,.18)' };
    default: return { color: 'var(--muted)', background: 'rgba(16,32,51,.04)', borderColor: 'var(--border)' };
  }
}

function signalFromDoc(collectionName: string, id: string, data: Record<string, unknown>): GovernanceSignal {
  const status = valueAsString(data.status ?? data.state ?? data.reviewStatus ?? data.paymentStatus ?? data.escalationStatus);
  return {
    id: collectionName + '-' + id,
    collectionName,
    status,
    title: valueAsString(data.title ?? data.subject ?? data.name ?? data.description ?? data.type) ?? collectionName + ' record',
    description: valueAsString(data.summary ?? data.description ?? data.note ?? data.reason ?? data.message) ?? 'No summary recorded',
    actor: valueAsString(data.userId ?? data.actorId ?? data.requestedBy ?? data.createdBy ?? data.clientId),
    createdAt: valueAsString(data.createdAt ?? data.updatedAt ?? data.submittedAt),
  };
}

// ── Component ────────────────────────────────────────────────────────────────

export default function AdminGovernanceConsolePage({ user }: AdminGovernanceConsolePageProps) {
  const [activeView, setActiveView] = useState<AdminView>('project-search');

  const datasets = useMemo<GovernanceDataset[]>(() => [
    { id: 'projects', label: 'All projects', description: 'Platform-wide project records across client, BEP, contractor, and package workflows.', collectionName: 'projects', icon: <ClipboardList size={16} />, query: datasetQuery('projects') },
    { id: 'disputes', label: 'Disputes', description: 'Open dispute and evidence-hold records requiring governance attention.', collectionName: 'disputes', icon: <MessageSquareWarning size={16} />, query: datasetQuery('disputes'), riskStatuses: ['open', 'held', 'disputed', 'pending_review'] },
    { id: 'escrow', label: 'Escrow wallets', description: 'Funded, held, partially released, and released escrow records.', collectionName: 'escrow', icon: <Landmark size={16} />, query: datasetQuery('escrow'), riskStatuses: ['held', 'partially_released', 'disputed'] },
    { id: 'payments', label: 'Payments / claims', description: 'Gateway payments, professional invoices, construction claims, and package payments.', collectionName: 'payments', icon: <CreditCard size={16} />, query: datasetQuery('payments'), riskStatuses: ['failed', 'held', 'pending_review', 'rejected'] },
    { id: 'messages', label: 'Messaging', description: 'Project messages and instruction threads that may need moderation or escalation.', collectionName: 'messages', icon: <MessageSquareWarning size={16} />, query: datasetQuery('messages'), riskStatuses: ['flagged', 'escalated'] },
    { id: 'ai', label: 'AI review queue', description: 'Human-review gates for AI-assisted drawing checks, recommendations, and automation.', collectionName: 'ai_review_queue', icon: <Bot size={16} />, query: datasetQuery('ai_review_queue'), riskStatuses: ['pending_review', 'requires_review', 'rejected'] },
    { id: 'users', label: 'User roles', description: 'Client, BEP, contractor, subcontractor, supplier, freelancer, and admin user records.', collectionName: 'users', icon: <Users size={16} />, query: datasetQuery('users') },
    { id: 'logs', label: 'System audit logs', description: 'Audit trail entries for approvals, access changes, AI actions, and governance events.', collectionName: 'system_logs', icon: <ShieldCheck size={16} />, query: datasetQuery('system_logs'), riskStatuses: ['failed', 'blocked'] },
  ], []);

  const [counts, setCounts] = useState<Record<string, number>>({});
  const [risks, setRisks] = useState<Record<string, number>>({});
  const [signals, setSignals] = useState<GovernanceSignal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const signalMap = new Map<string, GovernanceSignal>();
    const unsubscribes = datasets.map((dataset) => onSnapshot(dataset.query, (snapshot) => {
      const docs = snapshot.docs.map((docSnap) => ({ id: docSnap.id, data: docSnap.data() as Record<string, unknown> }));
      setCounts((current) => ({ ...current, [dataset.id]: docs.length }));
      setRisks((current) => ({
        ...current,
        [dataset.id]: docs.filter(({ data }) => {
          const normalizedStatus = String(data.status ?? data.state ?? data.reviewStatus ?? data.paymentStatus ?? '').toLowerCase();
          return (dataset.riskStatuses ?? RISK_STATUSES).includes(normalizedStatus);
        }).length,
      }));
      docs.slice(0, 3).forEach(({ id, data }) => signalMap.set(dataset.id + '-' + id, signalFromDoc(dataset.collectionName, id, data)));
      setSignals(Array.from(signalMap.values()).slice(0, 12));
      setLoading(false);
    }, (error) => {
      console.warn('Admin governance dataset ' + dataset.collectionName + ' unavailable; continuing with remaining datasets:', error);
      setCounts((current) => ({ ...current, [dataset.id]: 0 }));
      setRisks((current) => ({ ...current, [dataset.id]: 0 }));
      setLoading(false);
    }));
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [datasets]);

  const riskCounts: number[] = Object.values(risks).map((count) => Number(count));
  const totalRisks = riskCounts.reduce((total, count) => total + count, 0);
  const toolHealth = datasets.length === 0 ? 100 : Math.max(0, Math.round(((datasets.length - riskCounts.filter((count) => count > 0).length) / datasets.length) * 100));

  // ── Access restriction: platform_admin and admin only ───────────────────
  if (user.role !== 'platform_admin' && user.role !== 'admin') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="panel" style={{ textAlign: 'center', padding: 40 }}>
          <h2 style={{ color: 'var(--red)', marginBottom: 8 }}>Access Denied</h2>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            This governance console is restricted to platform_admin and admin users only.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} data-testid="admin-governance-console">
      {/* 1. Hero */}
      <div className="hero">
        <div className="hero-header">
          <div>
            <div className="eyebrow">ADMIN / GOVERNANCE</div>
            <h1>Whole-system governance console</h1>
            <p className="sub">
              Platform-wide command view · {user.displayName ?? user.email} · It is observational by default: holds, releases, signatures, and payment changes remain in dedicated human-approved workflows.
            </p>
          </div>
        </div>
        <div className="hero-pills" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span className="pill"><span className="dot"></span> {user.role}</span>
          {totalRisks > 0 && (
            <span className="pill" style={{ color: 'var(--amber)', background: 'rgba(245,166,35,.08)', borderColor: 'rgba(245,166,35,.18)' }}>
              <span className="dot" style={{ background: 'var(--amber)' }}></span> {totalRisks} Risk Signals
            </span>
          )}
          {!loading && totalRisks === 0 && (
            <span className="pill" style={{ color: 'var(--green)', background: 'rgba(74,222,128,.1)', borderColor: 'rgba(74,222,128,.18)' }}>
              <span className="dot" style={{ background: 'var(--green)' }}></span> All Clear
            </span>
          )}
        </div>
      </div>

      {/* 2. Stat Row */}
      <div className="stat-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--deep)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <ClipboardList size={18} style={{ color: 'var(--teal)' }} />
            {datasets.length}
          </div>
          <div className="stat-label">Datasets Mounted</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: totalRisks > 0 ? 'var(--red)' : 'var(--green)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={18} style={{ color: totalRisks > 0 ? 'var(--red)' : 'var(--green)' }} />
            {totalRisks}
          </div>
          <div className="stat-label">Risk Signals</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--deep)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={18} style={{ color: 'var(--teal)' }} />
            {toolHealth}%
          </div>
          <div className="stat-label">Tool Health</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--deep)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Loader2 size={18} style={{ color: 'var(--teal)', animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            {loading ? 'Loading' : 'Ready'}
          </div>
          <div className="stat-label">Live State</div>
        </div>
      </div>

      {/* 3. View Navigation */}
      <div className="panel" style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(Object.keys(VIEW_LABELS) as AdminView[]).map((view) => (
            <button
              key={view}
              className={activeView === view ? 'btn' : 'btn btn-secondary'}
              style={{ fontSize: 11, padding: '6px 12px', height: 30 }}
              onClick={() => setActiveView(view)}
            >
              {VIEW_LABELS[view]}
            </button>
          ))}
        </div>
      </div>

      {/* 4. Active View Content */}
      {activeView === 'project-search' && <ProjectSearchView signals={signals} datasets={datasets} counts={counts} risks={risks} />}
      {activeView === 'user-management' && <UserManagementView user={user} />}
      {activeView === 'feature-flags' && <FeatureFlagsView user={user} />}
      {activeView === 'tariff-registry' && <TariffRegistryView user={user} />}
      {activeView === 'payment-rates' && <PaymentRatesView user={user} />}
      {activeView === 'escrow-oversight' && <EscrowOversightView datasets={datasets} counts={counts} risks={risks} />}
      {activeView === 'ai-governance' && <AIGovernanceView user={user} />}
      {activeView === 'flagged-messages' && <FlaggedMessagesView />}
      {activeView === 'audit-viewer' && <AuditViewerView signals={signals} />}
      {activeView === 'override-log' && <OverrideLogView user={user} />}
    </div>
  );
}


// ── View Components ──────────────────────────────────────────────────────────

function ProjectSearchView({ signals, datasets, counts, risks }: { signals: GovernanceSignal[]; datasets: GovernanceDataset[]; counts: Record<string, number>; risks: Record<string, number> }) {
  return (
    <>
      {/* Dataset grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
        {datasets.map((dataset) => (
          <div key={dataset.id} className="panel" style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ color: 'var(--teal)' }}>{dataset.icon}</span>
              <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>{dataset.label}</h2>
              <span className="pill" style={Number(risks[dataset.id] ?? 0) > 0 ? pillStyleForVariant('danger') : pillStyleForVariant('muted')}>
                {counts[dataset.id] ?? 0}
              </span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>{dataset.description}</p>
            <p style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6, fontFamily: 'monospace' }}>
              {dataset.collectionName} · risk: {risks[dataset.id] ?? 0}
            </p>
          </div>
        ))}
      </div>

      {/* Global queue preview */}
      <div className="panel">
        <h2 style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--deep)', letterSpacing: '0.05em', marginBottom: 12 }}>
          Global Queue Preview
        </h2>
        {signals.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: 12, textAlign: 'center', padding: 24, border: '1px dashed var(--border)', borderRadius: 12 }}>
            No governance records are visible with current Firestore permissions.
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Collection</th>
                <th>Actor</th>
                <th>Status</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {signals.map((signal) => {
                const variant = statusVariant(signal.status);
                return (
                  <tr key={signal.id}>
                    <td style={{ fontWeight: 600 }}>{signal.title}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>{signal.collectionName}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>{signal.actor ?? '—'}</td>
                    <td><span className="pill" style={pillStyleForVariant(variant)}>{signal.status ?? 'recorded'}</span></td>
                    <td style={{ fontSize: 11, color: 'var(--muted)' }}>{signal.createdAt ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function UserManagementView({ user }: { user: UserProfile }) {
  return <UserRoleManagementPanel user={user} />;
}

function FeatureFlagsView({ user }: { user: UserProfile }) {
  return <AdminConfigVersioningPanel user={user} initialTab="feature-flags" />;
}

function TariffRegistryView({ user }: { user: UserProfile }) {
  return <AdminConfigVersioningPanel user={user} initialTab="tariff-rules" />;
}

function PaymentRatesView({ user }: { user: UserProfile }) {
  const [rates, setRates] = useState<Array<{ key: string; label: string; value: string }>>([
    { key: 'milestone_release_rate', label: 'Milestone Release Rate', value: '95%' },
    { key: 'retention_default', label: 'Default Retention Percentage', value: '5%' },
    { key: 'late_payment_penalty', label: 'Late Payment Penalty', value: '2% per month' },
    { key: 'partial_release_min', label: 'Minimum Partial Release', value: 'R5,000' },
    { key: 'escrow_funding_fee', label: 'Escrow Funding Fee', value: '0.5%' },
  ]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState<string | null>(null);
  const [history, setHistory] = useState<ConfigVersion[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => { setError(null); setSuccess(null); }, 4000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  const loadHistory = useCallback(async (configKey: string) => {
    setHistoryKey(configKey);
    setHistoryLoading(true);
    try {
      const records = await getVersionHistory(configKey, 50);
      setHistory(records);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const handleEdit = (rate: { key: string; value: string }) => {
    setEditingKey(rate.key);
    setEditValue(rate.value);
    setReason('');
    setError(null);
  };

  const handleCancel = () => {
    setEditingKey(null);
    setEditValue('');
    setReason('');
    setError(null);
  };

  const handleSave = useCallback(async (rateKey: string, previousValue: string) => {
    setError(null);
    if (reason.length < 10) {
      setError('A documented reason of at least 10 characters is required before saving payment rate changes.');
      return;
    }
    if (!editValue.trim()) {
      setError('New value cannot be empty.');
      return;
    }
    setSaving(true);
    try {
      await createConfigVersion(
        rateKey,
        'payment_rate',
        previousValue,
        editValue,
        user.uid,
        reason,
      );
      setRates((prev) =>
        prev.map((r) => r.key === rateKey ? { ...r, value: editValue } : r)
      );
      setEditingKey(null);
      setEditValue('');
      setReason('');
      setSuccess(`Payment rate '${rateKey}' updated successfully.`);
      if (historyKey === rateKey) {
        loadHistory(rateKey);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save payment rate change.');
    } finally {
      setSaving(false);
    }
  }, [editValue, reason, user.uid, historyKey, loadHistory]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Status messages */}
      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(217,87,71,.08)', border: '1px solid rgba(217,87,71,.18)', color: 'var(--red)', fontSize: 13 }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(74,222,128,.08)', border: '1px solid rgba(74,222,128,.18)', color: 'var(--green)', fontSize: 13 }}>
          {success}
        </div>
      )}

      <section className="panel" data-testid="payment-rates-panel">
        <h2 style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--deep)', letterSpacing: '0.05em', marginBottom: 12 }}>
          Payment Rate Settings
        </h2>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
          Manage payment rate configurations. Each change requires a documented reason (≥10 chars) and creates
          a versioned record. Version history is append-only and cannot be deleted.
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>Rate Setting</th>
              <th>Current Value</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rates.map((rate) => (
              <tr key={rate.key}>
                <td>
                  <strong style={{ fontSize: 13 }}>{rate.label}</strong>
                  <br />
                  <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>{rate.key}</span>
                </td>
                <td style={{ fontSize: 13, fontWeight: 600 }}>
                  {editingKey === rate.key ? (
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      style={{ width: 120, padding: '6px 10px', fontSize: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'rgba(255,255,255,.7)', color: 'var(--ink)', outline: 'none' }}
                    />
                  ) : (
                    rate.value
                  )}
                </td>
                <td>
                  {editingKey === rate.key ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <button
                          className="btn"
                          style={{ fontSize: 11, padding: '4px 10px', height: 28 }}
                          onClick={() => handleSave(rate.key, rate.value)}
                          disabled={saving}
                        >
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: 11, padding: '4px 10px', height: 28 }}
                          onClick={handleCancel}
                        >
                          Cancel
                        </button>
                      </div>
                      <div>
                        <input
                          type="text"
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="Reason for change (min 10 chars)"
                          style={{ width: '100%', padding: '6px 10px', fontSize: 11, borderRadius: 8, border: `1px solid ${reason.length > 0 && reason.length < 10 ? 'var(--red)' : 'var(--border)'}`, background: 'rgba(255,255,255,.7)', color: 'var(--ink)', outline: 'none' }}
                        />
                        <span style={{ fontSize: 10, color: reason.length >= 10 ? 'var(--green)' : 'var(--muted)', marginTop: 2, display: 'block' }}>
                          {reason.length}/10 characters
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="btn"
                        style={{ fontSize: 11, padding: '4px 10px', height: 28 }}
                        onClick={() => handleEdit(rate)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: 11, padding: '4px 10px', height: 28 }}
                        onClick={() => loadHistory(rate.key)}
                      >
                        History
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Version History Panel (reverse-chronological) */}
      {historyKey && (
        <section className="panel" data-testid="payment-rates-history-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--deep)' }}>
              Version History — <span style={{ fontFamily: 'monospace' }}>{historyKey}</span>
            </h2>
            <button
              className="btn btn-secondary"
              style={{ fontSize: 11, padding: '4px 10px', height: 28 }}
              onClick={() => { setHistoryKey(null); setHistory([]); }}
            >
              Close
            </button>
          </div>
          <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>
            Append-only change trail displayed in reverse-chronological order. Records cannot be deleted.
          </p>
          {historyLoading ? (
            <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: 20 }}>Loading version history…</p>
          ) : history.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: 20 }}>No version records found for this configuration item.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Timestamp (UTC)</th>
                  <th>Modifier</th>
                  <th>Previous</th>
                  <th>New</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {history.map((record) => (
                  <tr key={record.versionId}>
                    <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
                      {record.timestampIso}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
                      {record.modifierUid}
                    </td>
                    <td style={{ fontSize: 12 }}>{formatConfigValue(record.previousValue)}</td>
                    <td style={{ fontSize: 12 }}>{formatConfigValue(record.newValue)}</td>
                    <td style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {record.reason || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}

function EscrowOversightView({ datasets, counts, risks }: { datasets: GovernanceDataset[]; counts: Record<string, number>; risks: Record<string, number> }) {
  type EscrowRecord = { walletId: string; projectId: string; state: string; fundedAmount?: { currency: string; amount: number }; lastTransitionAtIso?: string };
  type DisputeRecord = { disputeId: string; projectId: string; state: string; amount?: { currency: string; amount: number }; updatedAtIso?: string; reason?: string };

  const [escrowWallets, setEscrowWallets] = useState<EscrowRecord[]>([]);
  const [disputes, setDisputes] = useState<DisputeRecord[]>([]);
  const [loadingEscrow, setLoadingEscrow] = useState(true);
  const [loadingDisputes, setLoadingDisputes] = useState(true);

  useEffect(() => {
    const escrowQuery = query(getDemoCol('escrow_wallets'), limit(50));
    const unsubEscrow = onSnapshot(escrowQuery, (snapshot) => {
      const wallets: EscrowRecord[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          walletId: docSnap.id,
          projectId: data.projectId ?? '—',
          state: data.state ?? 'Unknown',
          fundedAmount: data.fundedAmount,
          lastTransitionAtIso: valueAsString(data.lastTransitionAtIso ?? data.updatedAt ?? data.createdAtIso),
        };
      });
      setEscrowWallets(wallets);
      setLoadingEscrow(false);
    }, () => {
      // Fall back to 'escrow' collection if 'escrow_wallets' doesn't exist
      const fallbackQuery = query(getDemoCol('escrow'), limit(50));
      const unsubFallback = onSnapshot(fallbackQuery, (snap) => {
        const wallets: EscrowRecord[] = snap.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            walletId: docSnap.id,
            projectId: data.projectId ?? '—',
            state: data.state ?? data.status ?? 'Unknown',
            fundedAmount: data.fundedAmount ?? data.amount,
            lastTransitionAtIso: valueAsString(data.lastTransitionAtIso ?? data.updatedAt ?? data.createdAt),
          };
        });
        setEscrowWallets(wallets);
        setLoadingEscrow(false);
      }, () => { setLoadingEscrow(false); });
      return () => unsubFallback();
    });

    const disputeQuery = query(getDemoCol('disputes'), limit(50));
    const unsubDisputes = onSnapshot(disputeQuery, (snapshot) => {
      const items: DisputeRecord[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          disputeId: docSnap.id,
          projectId: data.projectId ?? '—',
          state: data.state ?? data.status ?? 'Open',
          amount: data.amount ?? data.disputedAmount,
          updatedAtIso: valueAsString(data.updatedAtIso ?? data.updatedAt ?? data.createdAt),
          reason: valueAsString(data.reason ?? data.description),
        };
      });
      setDisputes(items);
      setLoadingDisputes(false);
    }, () => { setLoadingDisputes(false); });

    return () => { unsubEscrow(); unsubDisputes(); };
  }, []);

  function escrowStateChip(state: string) {
    const normalized = state.toLowerCase();
    if (normalized === 'fundedheld' || normalized === 'funded_held' || normalized === 'funded') return 'chip-approved';
    if (normalized === 'released') return 'chip-approved';
    if (normalized === 'disputed') return 'chip-rejected';
    if (normalized === 'unfunded') return 'chip-draft';
    return 'chip-pending';
  }

  function formatAmount(money?: { currency?: string; amount?: number }): string {
    if (!money || money.amount == null) return '—';
    const currency = money.currency ?? 'ZAR';
    return `${currency} ${money.amount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
  }

  function formatTimestamp(iso?: string): string {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  }

  return (
    <>
      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--deep)' }}>{loadingEscrow ? '…' : escrowWallets.length}</div>
          <div className="stat-label">Escrow Wallets</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: disputes.length > 0 ? 'var(--red)' : 'var(--green)' }}>{loadingDisputes ? '…' : disputes.length}</div>
          <div className="stat-label">Active Disputes</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--amber)' }}>
            {loadingEscrow ? '…' : escrowWallets.filter(w => w.state.toLowerCase() === 'disputed').length}
          </div>
          <div className="stat-label">Disputed Wallets</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--green)' }}>
            {loadingEscrow ? '…' : escrowWallets.filter(w => w.state.toLowerCase() === 'fundedheld' || w.state.toLowerCase() === 'funded_held').length}
          </div>
          <div className="stat-label">Funded & Held</div>
        </div>
      </div>

      {/* Escrow Wallets Table */}
      <div className="panel">
        <h2 style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--deep)', letterSpacing: '0.05em', marginBottom: 12 }}>
          Active Escrow Wallets
        </h2>
        {loadingEscrow ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 }}>
            <Loader2 size={16} style={{ color: 'var(--teal)', animation: 'spin 1s linear infinite' }} />
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>Loading escrow wallets…</span>
          </div>
        ) : escrowWallets.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: 12, textAlign: 'center', padding: 24, border: '1px dashed var(--border)', borderRadius: 12 }}>
            No active escrow wallets found.
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Wallet ID</th>
                <th>Project ID</th>
                <th>State</th>
                <th>Funded Amount</th>
                <th>Last Updated</th>
              </tr>
            </thead>
            <tbody>
              {escrowWallets.map((wallet) => (
                <tr key={wallet.walletId}>
                  <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>{wallet.walletId.slice(0, 12)}…</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>{wallet.projectId.slice(0, 12)}…</td>
                  <td><span className={`chip ${escrowStateChip(wallet.state)}`}>{wallet.state}</span></td>
                  <td style={{ fontWeight: 600 }}>{formatAmount(wallet.fundedAmount)}</td>
                  <td style={{ fontSize: 11, color: 'var(--muted)' }}>{formatTimestamp(wallet.lastTransitionAtIso)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Disputes Table */}
      <div className="panel">
        <h2 style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--deep)', letterSpacing: '0.05em', marginBottom: 12 }}>
          Disputed Items
        </h2>
        {loadingDisputes ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 }}>
            <Loader2 size={16} style={{ color: 'var(--teal)', animation: 'spin 1s linear infinite' }} />
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>Loading disputes…</span>
          </div>
        ) : disputes.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: 12, textAlign: 'center', padding: 24, border: '1px dashed var(--border)', borderRadius: 12 }}>
            No active disputes found.
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Dispute ID</th>
                <th>Project ID</th>
                <th>State</th>
                <th>Amount</th>
                <th>Last Updated</th>
              </tr>
            </thead>
            <tbody>
              {disputes.map((dispute) => (
                <tr key={dispute.disputeId}>
                  <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>{dispute.disputeId.slice(0, 12)}…</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>{dispute.projectId.slice(0, 12)}…</td>
                  <td><span className={`chip ${dispute.state.toLowerCase() === 'resolved' ? 'chip-approved' : 'chip-rejected'}`}>{dispute.state}</span></td>
                  <td style={{ fontWeight: 600 }}>{formatAmount(dispute.amount)}</td>
                  <td style={{ fontSize: 11, color: 'var(--muted)' }}>{formatTimestamp(dispute.updatedAtIso)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function AIGovernanceView({ user }: { user: UserProfile }) {
  const [prompts, setPrompts] = useState<Array<{ key: string; label: string; text: string }>>([
    { key: 'ai_compliance_system_prompt', label: 'Compliance Check System Prompt', text: 'You are an AI assistant that checks architectural drawings against South African SANS 10400 building regulations.' },
    { key: 'ai_matching_prompt', label: 'Professional Matching Prompt', text: 'Analyze the project requirements and recommend qualified built environment professionals from the platform directory.' },
    { key: 'ai_tender_evaluation_prompt', label: 'Tender Evaluation Prompt', text: 'Evaluate submitted tenders against the scope of work, compare pricing, and highlight any compliance gaps or risks.' },
    { key: 'ai_review_gate_prompt', label: 'Human Review Gate Prompt', text: 'Flag items that require human professional review before automated approval. Include any items where confidence is below 85%.' },
  ]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState<string | null>(null);
  const [history, setHistory] = useState<ConfigVersion[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => { setError(null); setSuccess(null); }, 4000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  const loadHistory = useCallback(async (configKey: string) => {
    setHistoryKey(configKey);
    setHistoryLoading(true);
    try {
      const records = await getVersionHistory(configKey, 50);
      setHistory(records);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const handleEdit = (prompt: { key: string; text: string }) => {
    setEditingKey(prompt.key);
    setEditText(prompt.text);
    setReason('');
    setError(null);
  };

  const handleCancel = () => {
    setEditingKey(null);
    setEditText('');
    setReason('');
    setError(null);
  };

  const handleSave = useCallback(async (promptKey: string, previousText: string) => {
    setError(null);
    if (reason.length < 10) {
      setError('A documented reason of at least 10 characters is required before saving AI prompt changes.');
      return;
    }
    if (!editText.trim()) {
      setError('New prompt text cannot be empty.');
      return;
    }
    setSaving(true);
    try {
      await createConfigVersion(
        promptKey,
        'ai_prompt',
        previousText,
        editText,
        user.uid,
        reason,
      );
      setPrompts((prev) =>
        prev.map((p) => p.key === promptKey ? { ...p, text: editText } : p)
      );
      setEditingKey(null);
      setEditText('');
      setReason('');
      setSuccess(`AI prompt '${promptKey}' updated successfully.`);
      if (historyKey === promptKey) {
        loadHistory(promptKey);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save AI prompt change.');
    } finally {
      setSaving(false);
    }
  }, [editText, reason, user.uid, historyKey, loadHistory]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Status messages */}
      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(217,87,71,.08)', border: '1px solid rgba(217,87,71,.18)', color: 'var(--red)', fontSize: 13 }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(74,222,128,.08)', border: '1px solid rgba(74,222,128,.18)', color: 'var(--green)', fontSize: 13 }}>
          {success}
        </div>
      )}

      <section className="panel" data-testid="ai-governance-panel">
        <h2 style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--deep)', letterSpacing: '0.05em', marginBottom: 12 }}>
          AI Prompt & Review Governance
        </h2>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
          Manage AI prompts and review configurations. All changes require a documented reason (≥10 chars),
          record previous prompt text, new text, reason, modifier UID, and timestamp. Version history is append-only.
        </p>

        {prompts.map((prompt) => (
          <div
            key={prompt.key}
            style={{
              padding: 14,
              marginBottom: 12,
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'rgba(255,255,255,.5)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div>
                <strong style={{ fontSize: 13, color: 'var(--ink)' }}>{prompt.label}</strong>
                <br />
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>{prompt.key}</span>
              </div>
              {editingKey !== prompt.key && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="btn"
                    style={{ fontSize: 11, padding: '4px 10px', height: 28 }}
                    onClick={() => handleEdit(prompt)}
                  >
                    Edit
                  </button>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: 11, padding: '4px 10px', height: 28 }}
                    onClick={() => loadHistory(prompt.key)}
                  >
                    History
                  </button>
                </div>
              )}
            </div>

            {editingKey === prompt.key ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: 12,
                    lineHeight: 1.5,
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'rgba(255,255,255,.7)',
                    color: 'var(--ink)',
                    outline: 'none',
                    resize: 'vertical',
                    fontFamily: 'var(--font)',
                  }}
                />
                <div>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Reason for change (min 10 chars)"
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      fontSize: 11,
                      borderRadius: 8,
                      border: `1px solid ${reason.length > 0 && reason.length < 10 ? 'var(--red)' : 'var(--border)'}`,
                      background: 'rgba(255,255,255,.7)',
                      color: 'var(--ink)',
                      outline: 'none',
                    }}
                  />
                  <span style={{ fontSize: 10, color: reason.length >= 10 ? 'var(--green)' : 'var(--muted)', marginTop: 2, display: 'block' }}>
                    {reason.length}/10 characters
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="btn"
                    style={{ fontSize: 11, padding: '4px 10px', height: 28 }}
                    onClick={() => handleSave(prompt.key, prompt.text)}
                    disabled={saving}
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: 11, padding: '4px 10px', height: 28 }}
                    onClick={handleCancel}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--ink)', lineHeight: 1.5, margin: 0, padding: '8px 0 0 0' }}>
                {prompt.text}
              </p>
            )}
          </div>
        ))}
      </section>

      {/* Version History Panel (reverse-chronological, append-only) */}
      {historyKey && (
        <section className="panel" data-testid="ai-governance-history-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--deep)' }}>
              Version History — <span style={{ fontFamily: 'monospace' }}>{historyKey}</span>
            </h2>
            <button
              className="btn btn-secondary"
              style={{ fontSize: 11, padding: '4px 10px', height: 28 }}
              onClick={() => { setHistoryKey(null); setHistory([]); }}
            >
              Close
            </button>
          </div>
          <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>
            Append-only change trail displayed in reverse-chronological order. Records cannot be deleted.
          </p>
          {historyLoading ? (
            <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: 20 }}>Loading version history…</p>
          ) : history.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: 20 }}>No version records found for this AI prompt configuration.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Timestamp (UTC)</th>
                  <th>Modifier</th>
                  <th>Previous Text</th>
                  <th>New Text</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {history.map((record) => (
                  <tr key={record.versionId}>
                    <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
                      {record.timestampIso}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
                      {record.modifierUid}
                    </td>
                    <td style={{ fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {formatConfigValue(record.previousValue)}
                    </td>
                    <td style={{ fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {formatConfigValue(record.newValue)}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {record.reason || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}

function FlaggedMessagesView() {
  type FlaggedMessage = { messageId: string; content: string; reporterUid: string; reporterName?: string; flagReason: string; timestamp?: string; projectId?: string };

  const [messages, setMessages] = useState<FlaggedMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);

  useEffect(() => {
    // Try loading from 'flagged_messages' first, fall back to 'messages' filtered client-side
    const flaggedQuery = query(getDemoCol('flagged_messages'), limit(50));
    const unsub = onSnapshot(flaggedQuery, (snapshot) => {
      const items: FlaggedMessage[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          messageId: docSnap.id,
          content: valueAsString(data.content ?? data.body ?? data.text ?? data.message) ?? '(No content)',
          reporterUid: valueAsString(data.reporterUid ?? data.reportedBy ?? data.flaggedBy) ?? '—',
          reporterName: valueAsString(data.reporterName ?? data.reporterDisplayName),
          flagReason: valueAsString(data.flagReason ?? data.reason ?? data.category) ?? 'Unspecified',
          timestamp: valueAsString(data.timestamp ?? data.flaggedAt ?? data.createdAt),
          projectId: valueAsString(data.projectId),
        };
      });
      setMessages(items);
      setLoadingMessages(false);
    }, () => {
      // Fall back: load from 'messages' and filter for flagged status
      const messagesQuery = query(getDemoCol('messages'), limit(100));
      const unsubFallback = onSnapshot(messagesQuery, (snap) => {
        const items: FlaggedMessage[] = snap.docs
          .filter((docSnap) => {
            const data = docSnap.data();
            const status = String(data.status ?? data.state ?? '').toLowerCase();
            return status === 'flagged';
          })
          .map((docSnap) => {
            const data = docSnap.data();
            return {
              messageId: docSnap.id,
              content: valueAsString(data.content ?? data.body ?? data.text ?? data.message) ?? '(No content)',
              reporterUid: valueAsString(data.reporterUid ?? data.reportedBy ?? data.flaggedBy) ?? '—',
              reporterName: valueAsString(data.reporterName ?? data.reporterDisplayName),
              flagReason: valueAsString(data.flagReason ?? data.reason ?? data.category) ?? 'Unspecified',
              timestamp: valueAsString(data.timestamp ?? data.flaggedAt ?? data.createdAt),
              projectId: valueAsString(data.projectId),
            };
          });
        setMessages(items);
        setLoadingMessages(false);
      }, () => { setLoadingMessages(false); });
      return () => unsubFallback();
    });

    return () => unsub();
  }, []);

  function truncateContent(content: string, maxLen = 200): string {
    if (content.length <= maxLen) return content;
    return content.slice(0, maxLen) + '…';
  }

  function formatTimestamp(iso?: string): string {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  }

  return (
    <>
      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
        <div className="stat-card">
          <div className="stat-value" style={{ color: messages.length > 0 ? 'var(--red)' : 'var(--green)' }}>
            {loadingMessages ? '…' : messages.length}
          </div>
          <div className="stat-label">Flagged Messages</div>
        </div>
      </div>

      {/* Flagged Messages Table */}
      <div className="panel">
        <h2 style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--deep)', letterSpacing: '0.05em', marginBottom: 12 }}>
          Flagged Messages — Content Moderation
        </h2>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
          Messages flagged for review — message content, reporter identity, flag reason, and timestamp.
        </p>
        {loadingMessages ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 }}>
            <Loader2 size={16} style={{ color: 'var(--teal)', animation: 'spin 1s linear infinite' }} />
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>Loading flagged messages…</span>
          </div>
        ) : messages.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: 12, textAlign: 'center', padding: 24, border: '1px dashed var(--border)', borderRadius: 12 }}>
            No flagged messages found. The moderation queue is clear.
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Message Content</th>
                <th>Reporter</th>
                <th>Flag Reason</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((msg) => (
                <tr key={msg.messageId}>
                  <td style={{ maxWidth: 340, fontSize: 12, lineHeight: 1.5, color: 'var(--ink)' }}>
                    {truncateContent(msg.content)}
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
                    {msg.reporterName ?? msg.reporterUid}
                  </td>
                  <td>
                    <span className="chip chip-rejected" style={{ fontSize: 10 }}>{msg.flagReason}</span>
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{formatTimestamp(msg.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function AuditViewerView({ signals }: { signals: GovernanceSignal[] }) {
  // ── Audit action types for the filter dropdown ──
  const AUDIT_ACTION_TYPES = [
    'claim_submitted', 'claim_rejected', 'claim_certified',
    'payment_released', 'payment_failed', 'refund_initiated',
    'escrow_funded', 'escrow_released', 'escrow_disputed', 'escrow_timeout',
    'contract_generated', 'contract_signed', 'contract_locked', 'contract_varied',
    'provider_webhook_received', 'tamper_attempt',
  ] as const;

  // ── Filter state ──
  const [actorFilter, setActorFilter] = useState('');
  const [actionTypeFilter, setActionTypeFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // ── Data state ──
  const [records, setRecords] = useState<Array<{
    auditId: string;
    actorUid: string;
    actorRole?: string;
    action: string;
    timestampIso: string;
    targetResourceId: string;
    monetaryAmount?: { currency: string; amount: number };
    evidenceReferences?: Array<{ type: string; referenceId: string }>;
    projectId?: string;
  }>>([]);
  const [loading, setLoading] = useState(false);
  const [hasQueried, setHasQueried] = useState(false);

  // ── Fetch audit records from Firestore ──
  const fetchRecords = async () => {
    setLoading(true);
    setHasQueried(true);
    try {
      const auditCol = getDemoCol('audit_logs');
      const constraints: Parameters<typeof query>[1][] = [
        orderBy('timestampIso', 'desc'),
        limit(500),
      ];

      if (actorFilter.trim()) {
        constraints.push(where('actorUid', '==', actorFilter.trim()));
      }
      if (actionTypeFilter) {
        constraints.push(where('action', '==', actionTypeFilter));
      }
      if (projectFilter.trim()) {
        constraints.push(where('targetResourceId', '==', projectFilter.trim()));
      }
      if (dateFrom) {
        constraints.push(where('timestampIso', '>=', dateFrom + 'T00:00:00.000Z'));
      }
      if (dateTo) {
        constraints.push(where('timestampIso', '<=', dateTo + 'T23:59:59.999Z'));
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q = query(auditCol, ...(constraints as any[]));
      const snapshot = await getDocs(q);
      const results = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          auditId: d.id,
          actorUid: data.actorUid ?? '',
          actorRole: data.actorRole,
          action: data.action ?? '',
          timestampIso: data.timestampIso ?? '',
          targetResourceId: data.targetResourceId ?? '',
          monetaryAmount: data.monetaryAmount,
          evidenceReferences: data.evidenceReferences,
          projectId: data.projectId,
        };
      });
      setRecords(results);
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  // ── Formatting helpers ──
  const formatTimestamp = (iso: string) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'medium' });
    } catch {
      return iso;
    }
  };

  const formatAmount = (amt?: { currency: string; amount: number }) => {
    if (!amt) return '—';
    return `${amt.currency} ${amt.amount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
  };

  const formatEvidence = (refs?: Array<{ type: string; referenceId: string }>) => {
    if (!refs || refs.length === 0) return '—';
    return refs.map((r) => `${r.type}: ${r.referenceId}`).join(', ');
  };

  const inputStyle: React.CSSProperties = {
    padding: '6px 10px',
    fontSize: 12,
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: 'rgba(255,255,255,.7)',
    color: 'var(--ink)',
    outline: 'none',
    minWidth: 0,
    flex: 1,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    textTransform: 'uppercase',
    color: 'var(--muted)',
    letterSpacing: '0.04em',
    marginBottom: 4,
    display: 'block',
  };

  return (
    <div className="panel">
      <h2 style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--deep)', letterSpacing: '0.05em', marginBottom: 12 }}>
        Immutable Audit Viewer
      </h2>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
        All platform actions — filtered by actor, action type, project, and date range. Maximum 500 records per query. Records are immutable: no edit, delete, or overwrite permitted.
      </p>

      {/* ── Filter Controls ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 16 }}>
        <div>
          <label style={labelStyle}>Actor UID</label>
          <input
            type="text"
            placeholder="Filter by actor UID"
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Action Type</label>
          <select
            value={actionTypeFilter}
            onChange={(e) => setActionTypeFilter(e.target.value)}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            <option value="">All actions</option>
            {AUDIT_ACTION_TYPES.map((a) => (
              <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Project / Resource ID</label>
          <input
            type="text"
            placeholder="Filter by project"
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Date From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Date To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={inputStyle}
          />
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <button className="btn" onClick={fetchRecords} disabled={loading}>
          {loading ? 'Loading…' : 'Query Audit Logs'}
        </button>
      </div>

      {/* ── Results ── */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <Loader2 size={20} style={{ color: 'var(--teal)', animation: 'spin 1s linear infinite' }} />
        </div>
      )}

      {!loading && hasQueried && records.length === 0 && (
        <p style={{ color: 'var(--muted)', fontSize: 12, textAlign: 'center', padding: 24, border: '1px dashed var(--border)', borderRadius: 12 }}>
          No audit records match your query filters.
        </p>
      )}

      {!loading && records.length > 0 && (
        <>
          <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
            Showing {records.length} record{records.length !== 1 ? 's' : ''} (max 500)
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Target Resource</th>
                  <th>Amount</th>
                  <th>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {records.map((rec) => (
                  <tr key={rec.auditId}>
                    <td style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{formatTimestamp(rec.timestampIso)}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
                      {rec.actorUid || '—'}
                      {rec.actorRole && <span style={{ display: 'block', fontSize: 10, color: 'var(--muted)' }}>{rec.actorRole}</span>}
                    </td>
                    <td>
                      <span className="pill" style={pillStyleForVariant(statusVariant(rec.action))}>
                        {rec.action.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {rec.targetResourceId || '—'}
                    </td>
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{formatAmount(rec.monetaryAmount)}</td>
                    <td style={{ fontSize: 11, color: 'var(--muted)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {formatEvidence(rec.evidenceReferences)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Immutability Notice ── */}
      <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 10, background: 'rgba(16,32,51,.03)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <ShieldCheck size={14} style={{ color: 'var(--deep)', flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
          Audit records are immutable. No record can be edited, deleted, or overwritten after creation. 5-year retention enforced.
        </span>
      </div>
    </div>
  );
}

function OverrideLogView({ user }: { user: UserProfile }) {
  return <OverrideAuditPanel user={user} />;
}

// ─── Shared Helpers ──────────────────────────────────────────────────────────

function formatConfigValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
