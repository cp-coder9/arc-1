/**
 * BillingRateConfig — Firm administrator billing rate management component.
 *
 * Provides:
 * - Table of billing rates per role with effective dates
 * - Create/update rate form
 * - SACAP fee schedule reference view
 *
 * Follows the Workspace Template pattern: Hero → Stat Row → Panels.
 * Uses Architex UI token system (var(--teal), var(--ink), etc.) and
 * component classes (.panel, .pill, .btn, .table, .hero).
 *
 * Requirements: 3.1, 3.2, 3.5, 15.5
 * @module practiceManagement/BillingRateConfig
 */

import React, { useState, useMemo } from 'react';
import { DollarSign, Plus, Edit2, Calendar, BookOpen } from 'lucide-react';
import type { UserProfile } from '@/types';
import type {
  BillingRate,
  BillingRateRole,
  BillingRateType,
} from '@/services/practiceManagement/types';
import {
  createRate,
  updateRate,
  getAllRates,
} from '@/services/practiceManagement/billingRateTableService';

// ─── Constants ───────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<BillingRateRole, string> = {
  architect: 'Architect',
  technologist: 'Technologist',
  technician: 'Technician',
  draughtsperson: 'Draughtsperson',
  admin: 'Admin',
};

const RATE_TYPE_LABELS: Record<BillingRateType, string> = {
  hourly: 'Hourly',
  daily: 'Daily',
  fixed: 'Fixed',
};

/**
 * SACAP recommended fee percentages per work stage (indicative reference only).
 * Based on SACAP Guideline Professional Fees for architectural services as a
 * percentage of construction cost, for reference/comparison purposes.
 */
const SACAP_FEE_SCHEDULE_REFERENCE = [
  { stage: 'Stage 1 – Inception', percentRange: '5–10%', description: 'Brief development, site appraisal, project feasibility' },
  { stage: 'Stage 2 – Concept & Viability', percentRange: '10–15%', description: 'Concept design, viability assessment, client approval' },
  { stage: 'Stage 3 – Design Development', percentRange: '20–25%', description: 'Detailed design, engineering coordination, specifications' },
  { stage: 'Stage 4 – Documentation & Procurement', percentRange: '25–35%', description: 'Working drawings, tender documentation, procurement' },
  { stage: 'Stage 5 – Construction', percentRange: '20–25%', description: 'Contract administration, site visits, progress certification' },
  { stage: 'Stage 6 – Close Out', percentRange: '5–10%', description: 'Practical completion, defects, handover, final account' },
];

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  user: UserProfile;
}

// ─── Form State ──────────────────────────────────────────────────────────────

interface RateFormState {
  role: BillingRateRole;
  rateType: BillingRateType;
  rateCents: string;
  effectiveDate: string;
}

const INITIAL_FORM: RateFormState = {
  role: 'architect',
  rateType: 'hourly',
  rateCents: '',
  effectiveDate: new Date().toISOString().split('T')[0],
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function BillingRateConfig({ user }: Props) {
  const [rates, setRates] = useState<BillingRate[]>([]);
  const [formState, setFormState] = useState<RateFormState>(INITIAL_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [activeView, setActiveView] = useState<'rates' | 'sacap'>('rates');

  const firmId = user.primaryFirmId || 'default-firm';

  // Get rates sorted by role then effective date
  const sortedRates = useMemo(() => getAllRates(rates, firmId), [rates, firmId]);

  // Stat calculations
  const totalRoles = useMemo(() => {
    const roles = new Set(sortedRates.map((r) => r.role));
    return roles.size;
  }, [sortedRates]);

  const latestRate = useMemo(() => {
    if (sortedRates.length === 0) return null;
    return sortedRates.reduce((latest, r) =>
      r.updatedAt > latest.updatedAt ? r : latest
    );
  }, [sortedRates]);

  // ─── Handlers ────────────────────────────────────────────────────────────

  const handleFormChange = (field: keyof RateFormState, value: string) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const rateCents = Math.round(parseFloat(formState.rateCents) * 100);
    if (isNaN(rateCents) || rateCents <= 0) return;

    if (editingId) {
      // Update existing rate
      const updated = updateRate(rates, editingId, {
        rateCents,
        rateType: formState.rateType,
        effectiveDate: formState.effectiveDate,
      });
      if (updated) {
        setRates((prev) => prev.map((r) => (r.id === editingId ? updated : r)));
      }
    } else {
      // Create new rate
      const newRate = createRate(
        {
          firmId,
          role: formState.role,
          rateType: formState.rateType,
          rateCents,
          effectiveDate: formState.effectiveDate,
        },
        user.uid,
      );
      setRates((prev) => [...prev, newRate]);
    }

    // Reset form
    setFormState(INITIAL_FORM);
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (rate: BillingRate) => {
    setFormState({
      role: rate.role,
      rateType: rate.rateType,
      rateCents: (rate.rateCents / 100).toFixed(2),
      effectiveDate: rate.effectiveDate,
    });
    setEditingId(rate.id);
    setShowForm(true);
  };

  const handleCancel = () => {
    setFormState(INITIAL_FORM);
    setEditingId(null);
    setShowForm(false);
  };

  // ─── Format Helpers ──────────────────────────────────────────────────────

  const formatCurrency = (cents: number) => {
    return `R ${(cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
  };

  const formatDate = (isoDate: string) => {
    return new Date(isoDate).toLocaleDateString('en-ZA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Hero */}
      <div className="hero">
        <div className="hero-header">
          <div>
            <div className="eyebrow">BILLING RATE CONFIGURATION</div>
            <h1>Rate Table Management</h1>
            <p className="sub">
              Configure per-role billing rates · Effective date versioning · SACAP fee schedule reference
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span className="pill">
            <span className="dot"></span> Firm Admin
          </span>
          <span className="pill">
            <span className="dot"></span> {sortedRates.length} Rate{sortedRates.length !== 1 ? 's' : ''} Configured
          </span>
        </div>
      </div>

      {/* Stat Row */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-value">{sortedRates.length}</div>
          <div className="stat-label">Total Rates</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{totalRoles}</div>
          <div className="stat-label">Roles Configured</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">5</div>
          <div className="stat-label">Available Roles</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ fontSize: 14 }}>
            {latestRate ? formatDate(latestRate.updatedAt) : '—'}
          </div>
          <div className="stat-label">Last Updated</div>
        </div>
      </div>

      {/* View Toggle */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          className={`btn ${activeView === 'rates' ? '' : 'btn-secondary'}`}
          onClick={() => setActiveView('rates')}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <DollarSign size={14} /> Rate Table
        </button>
        <button
          className={`btn ${activeView === 'sacap' ? '' : 'btn-secondary'}`}
          onClick={() => setActiveView('sacap')}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <BookOpen size={14} /> SACAP Fee Schedule
        </button>
      </div>

      {/* Rate Table View */}
      {activeView === 'rates' && (
        <>
          {/* Action Bar */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            {!showForm && (
              <button
                className="btn"
                onClick={() => setShowForm(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Plus size={14} /> Add Rate
              </button>
            )}
          </div>

          {/* Create/Update Form */}
          {showForm && (
            <div className="panel">
              <h2>{editingId ? 'Update Billing Rate' : 'Create New Billing Rate'}</h2>
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                  {/* Role */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600 }}>
                      Role
                    </label>
                    <select
                      value={formState.role}
                      onChange={(e) => handleFormChange('role', e.target.value)}
                      disabled={!!editingId}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        fontSize: 13,
                        color: 'var(--ink)',
                        background: 'var(--white)',
                      }}
                    >
                      {(Object.keys(ROLE_LABELS) as BillingRateRole[]).map((role) => (
                        <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                      ))}
                    </select>
                  </div>

                  {/* Rate Type */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600 }}>
                      Rate Type
                    </label>
                    <select
                      value={formState.rateType}
                      onChange={(e) => handleFormChange('rateType', e.target.value)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        fontSize: 13,
                        color: 'var(--ink)',
                        background: 'var(--white)',
                      }}
                    >
                      {(Object.keys(RATE_TYPE_LABELS) as BillingRateType[]).map((type) => (
                        <option key={type} value={type}>{RATE_TYPE_LABELS[type]}</option>
                      ))}
                    </select>
                  </div>

                  {/* Rate Amount (ZAR) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600 }}>
                      Rate (ZAR)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="e.g. 850.00"
                      value={formState.rateCents}
                      onChange={(e) => handleFormChange('rateCents', e.target.value)}
                      required
                      style={{
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        fontSize: 13,
                        color: 'var(--ink)',
                        background: 'var(--white)',
                      }}
                    />
                  </div>

                  {/* Effective Date */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600 }}>
                      Effective Date
                    </label>
                    <input
                      type="date"
                      value={formState.effectiveDate}
                      onChange={(e) => handleFormChange('effectiveDate', e.target.value)}
                      required
                      style={{
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        fontSize: 13,
                        color: 'var(--ink)',
                        background: 'var(--white)',
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                  <button type="button" className="btn btn-secondary" onClick={handleCancel}>
                    Cancel
                  </button>
                  <button type="submit" className="btn">
                    {editingId ? 'Update Rate' : 'Create Rate'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Rates Table */}
          <div className="panel">
            <h2>Billing Rates</h2>
            {sortedRates.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 8 }}>
                No billing rates configured yet. Click "Add Rate" to define your first rate.
              </p>
            ) : (
              <table className="table" style={{ marginTop: 12 }}>
                <thead>
                  <tr>
                    <th>Role</th>
                    <th>Rate Type</th>
                    <th>Rate (ZAR)</th>
                    <th>Effective Date</th>
                    <th>Updated</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRates.map((rate) => (
                    <tr key={rate.id}>
                      <td>
                        <span style={{ fontWeight: 500 }}>{ROLE_LABELS[rate.role]}</span>
                      </td>
                      <td>
                        <span className="chip chip-draft">{RATE_TYPE_LABELS[rate.rateType]}</span>
                      </td>
                      <td style={{ fontWeight: 600, color: 'var(--deep)' }}>
                        {formatCurrency(rate.rateCents)}
                      </td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Calendar size={12} style={{ color: 'var(--muted)' }} />
                          {formatDate(rate.effectiveDate)}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
                        {formatDate(rate.updatedAt)}
                      </td>
                      <td>
                        <button
                          className="btn btn-secondary"
                          onClick={() => handleEdit(rate)}
                          style={{ padding: '4px 10px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          <Edit2 size={12} /> Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* SACAP Fee Schedule Reference View */}
      {activeView === 'sacap' && (
        <div className="panel">
          <h2>SACAP Fee Schedule Reference</h2>
          <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4, marginBottom: 12 }}>
            Indicative percentage-based fee allocation per SACAP work stage. For reference and benchmarking only — 
            actual fees are agreed per project appointment.
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>Work Stage</th>
                <th>% of Total Fee</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {SACAP_FEE_SCHEDULE_REFERENCE.map((entry) => (
                <tr key={entry.stage}>
                  <td style={{ fontWeight: 500 }}>{entry.stage}</td>
                  <td>
                    <span style={{ color: 'var(--deep)', fontWeight: 600 }}>{entry.percentRange}</span>
                  </td>
                  <td style={{ color: 'var(--muted)', fontSize: 12 }}>{entry.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: 'var(--aqua)', border: '1px solid var(--border)' }}>
            <p style={{ fontSize: 11, color: 'var(--deep)', margin: 0 }}>
              <strong>Advisory only:</strong> These percentages are indicative ranges from SACAP guidelines. 
              Actual fee allocations per stage should be agreed in the professional appointment letter and 
              configured per project in the Fee Tracker.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
