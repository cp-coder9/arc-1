/**
 * AdminConfigVersioningPanel — Feature Flag & Tariff Rule Management
 *
 * Renders within the AdminGovernanceConsolePage providing:
 * - Feature flag list with toggle + version history
 * - Tariff rules with effective date enforcement (current/future only)
 * - Version records: previous value, new value, modifier UID, UTC timestamp
 * - Retains at least 50 versions per configuration item
 *
 * Uses .panel, .table, .btn CSS classes per workspace-template steering.
 *
 * @requirements 9.3, 9.4, 10.1, 10.2, 10.3
 */
import React, { useCallback, useEffect, useState } from 'react';
import type { UserProfile } from '@/types';
import {
  createConfigVersion,
  getVersionHistory,
  validateTariffEffectiveDate,
  type ConfigVersion,
} from '@/services/configVersioningService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FeatureFlag {
  key: string;
  label: string;
  enabled: boolean;
}

interface TariffRule {
  key: string;
  label: string;
  value: string;
  effectiveDate: string;
}

interface AdminConfigVersioningPanelProps {
  user: UserProfile;
  initialTab?: 'feature-flags' | 'tariff-rules';
}

// ─── Sample Data (demo feature flags + tariff rules) ──────────────────────────

const INITIAL_FEATURE_FLAGS: FeatureFlag[] = [
  { key: 'enable_escrow_v2', label: 'Escrow v2 State Machine', enabled: true },
  { key: 'enable_ai_compliance', label: 'AI Compliance Checks', enabled: true },
  { key: 'enable_fica_reporting', label: 'FICA Threshold Reporting', enabled: false },
  { key: 'enable_contract_variations', label: 'Contract Variation Workflow', enabled: true },
  { key: 'enable_payout_batching', label: 'Payout Batch Processing', enabled: false },
];

const INITIAL_TARIFF_RULES: TariffRule[] = [
  { key: 'standard_platform_fee', label: 'Standard Platform Fee', value: '5%', effectiveDate: '2026-07-01' },
  { key: 'premium_platform_fee', label: 'Premium Tier Fee', value: '3.5%', effectiveDate: '2026-07-01' },
  { key: 'escrow_holding_fee', label: 'Escrow Holding Fee', value: '0.25%', effectiveDate: '2026-08-01' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminConfigVersioningPanel({ user, initialTab }: AdminConfigVersioningPanelProps) {
  const [activeTab, setActiveTab] = useState<'feature-flags' | 'tariff-rules'>(initialTab ?? 'feature-flags');
  const [flags, setFlags] = useState<FeatureFlag[]>(INITIAL_FEATURE_FLAGS);
  const [tariffs, setTariffs] = useState<TariffRule[]>(INITIAL_TARIFF_RULES);
  const [historyKey, setHistoryKey] = useState<string | null>(null);
  const [history, setHistory] = useState<ConfigVersion[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Tariff form state
  const [newTariffKey, setNewTariffKey] = useState('');
  const [newTariffLabel, setNewTariffLabel] = useState('');
  const [newTariffValue, setNewTariffValue] = useState('');
  const [newTariffDate, setNewTariffDate] = useState('');

  // Clear messages after 4s
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => { setError(null); setSuccess(null); }, 4000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  // ─── Version History ──────────────────────────────────────────────────────

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

  // ─── Feature Flag Toggle ─────────────────────────────────────────────────

  const handleFlagToggle = useCallback(async (flag: FeatureFlag) => {
    setError(null);
    try {
      await createConfigVersion(
        flag.key,
        'feature_flag',
        flag.enabled,
        !flag.enabled,
        user.uid,
      );
      setFlags((prev) =>
        prev.map((f) => f.key === flag.key ? { ...f, enabled: !f.enabled } : f)
      );
      setSuccess(`Feature flag '${flag.label}' updated successfully.`);
      if (historyKey === flag.key) {
        loadHistory(flag.key);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update feature flag.');
    }
  }, [user.uid, historyKey, loadHistory]);

  // ─── Tariff Rule Add ──────────────────────────────────────────────────────

  const handleAddTariff = useCallback(async () => {
    setError(null);
    if (!newTariffKey || !newTariffLabel || !newTariffValue || !newTariffDate) {
      setError('All tariff rule fields are required.');
      return;
    }
    if (!validateTariffEffectiveDate(newTariffDate)) {
      setError('Effective date must be current or future. Past dates are rejected.');
      return;
    }
    try {
      await createConfigVersion(
        newTariffKey,
        'tariff_rule',
        null,
        newTariffValue,
        user.uid,
        undefined,
        newTariffDate,
      );
      setTariffs((prev) => [
        ...prev,
        { key: newTariffKey, label: newTariffLabel, value: newTariffValue, effectiveDate: newTariffDate },
      ]);
      setNewTariffKey('');
      setNewTariffLabel('');
      setNewTariffValue('');
      setNewTariffDate('');
      setSuccess(`Tariff rule '${newTariffLabel}' created.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create tariff rule.');
    }
  }, [newTariffKey, newTariffLabel, newTariffValue, newTariffDate, user.uid]);

  // ─── Tariff Rule Update ───────────────────────────────────────────────────

  const handleTariffUpdate = useCallback(async (tariff: TariffRule, newValue: string, newDate: string) => {
    setError(null);
    if (!validateTariffEffectiveDate(newDate)) {
      setError('Effective date must be current or future. Past dates are rejected.');
      return;
    }
    try {
      await createConfigVersion(
        tariff.key,
        'tariff_rule',
        tariff.value,
        newValue,
        user.uid,
        undefined,
        newDate,
      );
      setTariffs((prev) =>
        prev.map((t) => t.key === tariff.key ? { ...t, value: newValue, effectiveDate: newDate } : t)
      );
      setSuccess(`Tariff rule '${tariff.label}' updated.`);
      if (historyKey === tariff.key) {
        loadHistory(tariff.key);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update tariff rule.');
    }
  }, [user.uid, historyKey, loadHistory]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className={activeTab === 'feature-flags' ? 'btn' : 'btn btn-secondary'}
          onClick={() => setActiveTab('feature-flags')}
        >
          Feature Flags
        </button>
        <button
          className={activeTab === 'tariff-rules' ? 'btn' : 'btn btn-secondary'}
          onClick={() => setActiveTab('tariff-rules')}
        >
          Tariff Rules
        </button>
      </div>

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

      {/* Feature Flags Panel */}
      {activeTab === 'feature-flags' && (
        <section className="panel" data-testid="feature-flags-panel">
          <h2 style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--deep)', marginBottom: 12 }}>
            Feature Flag Management
          </h2>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
            Toggle feature flags to enable or disable platform capabilities. Each change creates a versioned record
            with the previous value, new value, modifier UID, and UTC timestamp. At least 50 versions are retained per item.
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>Flag</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {flags.map((flag) => (
                <tr key={flag.key}>
                  <td>
                    <strong style={{ fontSize: 13 }}>{flag.label}</strong>
                    <br />
                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>{flag.key}</span>
                  </td>
                  <td>
                    <span
                      className={flag.enabled ? 'pill' : 'pill pill-muted'}
                      style={flag.enabled
                        ? { color: 'var(--green)', background: 'rgba(74,222,128,.1)', border: '1px solid rgba(74,222,128,.18)' }
                        : undefined
                      }
                    >
                      <span className="dot"></span>
                      {flag.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button
                      className="btn"
                      style={{ fontSize: 11, padding: '4px 10px', height: 28 }}
                      onClick={() => handleFlagToggle(flag)}
                    >
                      {flag.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: 11, padding: '4px 10px', height: 28 }}
                      onClick={() => loadHistory(flag.key)}
                    >
                      History
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Tariff Rules Panel */}
      {activeTab === 'tariff-rules' && (
        <section className="panel" data-testid="tariff-rules-panel">
          <h2 style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--deep)', marginBottom: 12 }}>
            Tariff Rule Registry
          </h2>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
            Manage platform tariff rules. Each change is versioned with an effective date that must be current or future.
            Past-effective dates are rejected.
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>Rule</th>
                <th>Value</th>
                <th>Effective Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tariffs.map((tariff) => (
                <TariffRow
                  key={tariff.key}
                  tariff={tariff}
                  onUpdate={handleTariffUpdate}
                  onHistory={() => loadHistory(tariff.key)}
                />
              ))}
            </tbody>
          </table>

          {/* Add new tariff rule form */}
          <div style={{ marginTop: 16, padding: 14, borderRadius: 12, border: '1px solid var(--border)', background: 'rgba(255,255,255,.5)' }}>
            <h3 style={{ fontSize: 12, color: 'var(--deep)', marginBottom: 10 }}>Add New Tariff Rule</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
              <div>
                <label style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase' }}>Key</label>
                <input
                  type="text"
                  value={newTariffKey}
                  onChange={(e) => setNewTariffKey(e.target.value)}
                  placeholder="e.g. late_payment_fee"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase' }}>Label</label>
                <input
                  type="text"
                  value={newTariffLabel}
                  onChange={(e) => setNewTariffLabel(e.target.value)}
                  placeholder="e.g. Late Payment Fee"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase' }}>Value</label>
                <input
                  type="text"
                  value={newTariffValue}
                  onChange={(e) => setNewTariffValue(e.target.value)}
                  placeholder="e.g. 2%"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase' }}>Effective Date</label>
                <input
                  type="date"
                  value={newTariffDate}
                  onChange={(e) => setNewTariffDate(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <button className="btn" onClick={handleAddTariff} style={{ height: 32, fontSize: 11 }}>
                Add Rule
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Version History Panel */}
      {historyKey && (
        <section className="panel" data-testid="version-history-panel">
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
                    <td style={{ fontSize: 12 }}>{formatValue(record.previousValue)}</td>
                    <td style={{ fontSize: 12 }}>{formatValue(record.newValue)}</td>
                    <td style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {record.reason || (record.effectiveDate ? `Effective: ${record.effectiveDate}` : '—')}
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

// ─── Tariff Row Sub-component ─────────────────────────────────────────────────

function TariffRow({
  tariff,
  onUpdate,
  onHistory,
}: {
  key?: React.Key;
  tariff: TariffRule;
  onUpdate: (tariff: TariffRule, newValue: string, newDate: string) => void;
  onHistory: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(tariff.value);
  const [editDate, setEditDate] = useState(tariff.effectiveDate);

  const handleSave = () => {
    onUpdate(tariff, editValue, editDate);
    setEditing(false);
  };

  if (editing) {
    return (
      <tr>
        <td>
          <strong style={{ fontSize: 13 }}>{tariff.label}</strong>
          <br />
          <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>{tariff.key}</span>
        </td>
        <td>
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            style={{ ...inputStyle, width: 80 }}
          />
        </td>
        <td>
          <input
            type="date"
            value={editDate}
            onChange={(e) => setEditDate(e.target.value)}
            style={{ ...inputStyle, width: 140 }}
          />
        </td>
        <td style={{ display: 'flex', gap: 6 }}>
          <button className="btn" style={{ fontSize: 11, padding: '4px 10px', height: 28 }} onClick={handleSave}>
            Save
          </button>
          <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px', height: 28 }} onClick={() => setEditing(false)}>
            Cancel
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td>
        <strong style={{ fontSize: 13 }}>{tariff.label}</strong>
        <br />
        <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>{tariff.key}</span>
      </td>
      <td style={{ fontSize: 13, fontWeight: 600 }}>{tariff.value}</td>
      <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>{tariff.effectiveDate}</td>
      <td style={{ display: 'flex', gap: 6 }}>
        <button className="btn" style={{ fontSize: 11, padding: '4px 10px', height: 28 }} onClick={() => setEditing(true)}>
          Edit
        </button>
        <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px', height: 28 }} onClick={onHistory}>
          History
        </button>
      </td>
    </tr>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  fontSize: 12,
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'rgba(255,255,255,.7)',
  color: 'var(--ink)',
  outline: 'none',
};

function formatValue(value: unknown): string {
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
