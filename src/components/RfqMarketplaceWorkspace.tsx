/**
 * RfqMarketplaceWorkspace — Module 6 (Tender/Procurement/Supplier) RFQ Marketplace UI.
 *
 * Layout: Hero → Stat Row → Content Panels (RFQ List, Supplier Discovery, Quote Comparison, Award Approval)
 * Follows the AppShell workspace-template pattern with CSS token classes.
 * Accepts `user` prop and enforces role-based visibility.
 * Wired to the service layer via useRfqMarketplace hook.
 *
 * Requirements validated: All (UI layer)
 */

import React, { useEffect } from 'react';
import { FileText, Users, Scale, Award, Search, Loader2 } from 'lucide-react';
import { useRfqMarketplace } from '@/hooks/useRfqMarketplace';
import type { RfqDocument, ScoredQuote } from '@/services/rfqMarketplace';

// ── Types ────────────────────────────────────────────────────────────────────

interface UserProfile {
  displayName?: string;
  role?: string;
  uid: string;
}

interface Props {
  user: UserProfile;
  projectId?: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_PROJECT_ID = 'demo-project-001';

// ── Helpers ──────────────────────────────────────────────────────────────────

function getStatusChipClass(status: string): string {
  switch (status) {
    case 'awarded': return 'chip chip-approved';
    case 'evaluation': return 'chip chip-needs_decision';
    case 'published': return 'chip chip-draft';
    case 'draft': return 'chip chip-draft';
    case 'cancelled': return 'chip chip-rejected';
    default: return 'chip';
  }
}

function getActionLabel(rfq: RfqDocument): string {
  switch (rfq.status) {
    case 'draft': return 'Edit';
    case 'published': return 'View';
    case 'evaluation': return 'Compare';
    case 'awarded': return 'Details';
    default: return 'View';
  }
}

function canViewRfqManagement(role?: string): boolean {
  return ['architect', 'quantity_surveyor', 'contractor', 'admin'].includes(role ?? '');
}

function canViewSupplierDiscovery(role?: string): boolean {
  return ['architect', 'quantity_surveyor', 'contractor', 'admin'].includes(role ?? '');
}

function canViewComparison(role?: string): boolean {
  return ['architect', 'quantity_surveyor', 'contractor', 'admin'].includes(role ?? '');
}

function canViewAwardApproval(role?: string): boolean {
  return ['architect', 'quantity_surveyor', 'contractor', 'admin', 'client'].includes(role ?? '');
}

/** Loading spinner inline indicator */
function LoadingIndicator({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 16, color: 'var(--muted)', fontSize: 13 }}>
      <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
      {label}
    </div>
  );
}

/** Inline error banner */
function ErrorBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div style={{ padding: '10px 14px', borderRadius: 12, border: '1px solid rgba(217,87,71,.18)', background: 'rgba(217,87,71,.06)', fontSize: 12, color: 'var(--red)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span>⚠️ {message}</span>
      {onDismiss && <button onClick={onDismiss} className="btn" style={{ padding: '2px 8px', fontSize: 10 }}>Dismiss</button>}
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function RfqMarketplaceWorkspace({ user, projectId }: Props) {
  const resolvedProjectId = projectId ?? DEFAULT_PROJECT_ID;
  const isSupplier = user.role === 'supplier';

  // ── Hook: wire service layer ────────────────────────────────────────────
  const {
    rfqList,
    currentRfq,
    comparison,
    award,
    supplierProfiles,
    rfqListState,
    currentRfqState,
    comparisonState,
    awardState,
    supplierProfilesState,
    loadRfqs,
    loadCurrentRfq,
    loadComparison,
    loadAward,
    loadSupplierProfiles,
    publishCurrentRfq,
    cancelCurrentRfq,
    generateQuoteComparison,
    approveAsClient,
    approveAsProfessional,
    rejectAward,
    clearError,
  } = useRfqMarketplace({ projectId: resolvedProjectId, userId: user.uid });

  // ── Load RFQs on mount ──────────────────────────────────────────────────
  useEffect(() => {
    void loadRfqs();
  }, [loadRfqs]);

  // ── Derived stats ───────────────────────────────────────────────────────
  const activeRfqs = rfqList.filter(r => r.status !== 'cancelled');
  const publishedCount = rfqList.filter(r => r.status === 'published').length;
  const evaluationCount = rfqList.filter(r => r.status === 'evaluation').length;
  const awardedCount = rfqList.filter(r => r.status === 'awarded').length;
  const draftCount = rfqList.filter(r => r.status === 'draft').length;
  const totalValue = rfqList.reduce((sum, r) => sum + (r.estimatedValue ?? 0), 0);
  const pendingQuotes = rfqList.filter(r => r.status === 'published').reduce((sum, r) => sum + r.invitationList.length, 0);
  const projectName = currentRfq?.title ?? 'RFQ Marketplace';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 1. Hero */}
      <div className="hero">
        <div className="hero-header">
          <div>
            <div className="eyebrow">RFQ MARKETPLACE</div>
            <h1>{projectName}</h1>
            <p className="sub">
              Module 6 · Tender / Procurement / Supplier · {user.displayName ?? 'Team Member'} · {user.role ?? 'member'}
            </p>
          </div>
        </div>
        <div className="hero-pills" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {publishedCount > 0 && (
            <span className="pill"><span className="dot"></span> {publishedCount} Published</span>
          )}
          {evaluationCount > 0 && (
            <span className="pill" style={{ color: 'var(--amber)', background: 'rgba(245,166,35,.08)', borderColor: 'rgba(245,166,35,.18)' }}>
              <span className="dot" style={{ background: 'var(--amber)' }}></span> {evaluationCount} Evaluation
            </span>
          )}
          {awardedCount > 0 && (
            <span className="pill" style={{ color: 'var(--green)', background: 'rgba(74,222,128,.1)', borderColor: 'rgba(74,222,128,.18)' }}>
              <span className="dot" style={{ background: 'var(--green)' }}></span> {awardedCount} Awarded
            </span>
          )}
          {draftCount > 0 && (
            <span className="pill" style={{ color: 'var(--muted)', background: 'rgba(16,32,51,.04)', borderColor: 'var(--border)' }}>
              <span className="dot" style={{ background: 'var(--muted)' }}></span> {draftCount} Draft
            </span>
          )}
        </div>
      </div>

      {/* 2. Stat Row */}
      <div className="stat-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--deep)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={18} style={{ color: 'var(--teal)' }} />
            {activeRfqs.length}
          </div>
          <div className="stat-label">Active RFQs</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--amber)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Scale size={18} style={{ color: 'var(--amber)' }} />
            {pendingQuotes}
          </div>
          <div className="stat-label">Pending Quotes</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Award size={18} style={{ color: 'var(--green)' }} />
            {awardedCount}
          </div>
          <div className="stat-label">Awarded</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--deep)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={18} style={{ color: 'var(--teal)' }} />
            R {totalValue >= 1_000_000 ? `${(totalValue / 1_000_000).toFixed(1)}M` : totalValue.toLocaleString()}
          </div>
          <div className="stat-label">Total Value</div>
        </div>
      </div>

      {/* 3. RFQ List Panel */}
      {canViewRfqManagement(user.role) && (
        <section className="panel">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={16} style={{ color: 'var(--teal)' }} />
            RFQ Register
          </h2>
          {rfqListState.error && (
            <ErrorBanner message={rfqListState.error} onDismiss={() => clearError('rfqListState')} />
          )}
          {rfqListState.loading && <LoadingIndicator label="Loading RFQs..." />}
          {!rfqListState.loading && rfqList.length === 0 && !rfqListState.error && (
            <p style={{ fontSize: 13, color: 'var(--muted)', padding: 16 }}>No RFQs found for this project.</p>
          )}
          {!rfqListState.loading && rfqList.length > 0 && (
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Deadline</th>
                  <th>Suppliers</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rfqList.map((rfq) => (
                  <tr key={rfq.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>{rfq.id.slice(0, 8)}</td>
                    <td>{rfq.title}</td>
                    <td><span className={getStatusChipClass(rfq.status)}>{rfq.status}</span></td>
                    <td style={{ fontSize: 12, color: 'var(--muted)' }}>{rfq.quoteDeadline.slice(0, 10)}</td>
                    <td>{rfq.invitationList.length}</td>
                    <td>
                      <button
                        className="btn"
                        style={{ padding: '4px 12px', fontSize: 11 }}
                        onClick={() => void loadCurrentRfq(rfq.id)}
                      >
                        {getActionLabel(rfq)}
                      </button>
                      {rfq.status === 'draft' && (
                        <button
                          className="btn"
                          style={{ padding: '4px 12px', fontSize: 11, marginLeft: 4 }}
                          onClick={() => void publishCurrentRfq(rfq.id)}
                        >
                          Publish
                        </button>
                      )}
                      {(rfq.status === 'draft' || rfq.status === 'published') && (
                        <button
                          className="btn"
                          style={{ padding: '4px 12px', fontSize: 11, marginLeft: 4, borderColor: 'rgba(217,87,71,.18)', background: 'rgba(217,87,71,.06)', color: 'var(--red)' }}
                          onClick={() => void cancelCurrentRfq(rfq.id)}
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {currentRfqState.loading && <LoadingIndicator label="Processing..." />}
          {currentRfqState.error && (
            <ErrorBanner message={currentRfqState.error} onDismiss={() => clearError('currentRfqState')} />
          )}
        </section>
      )}

      {/* Supplier-specific: My Invitations view */}
      {isSupplier && (
        <section className="panel">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={16} style={{ color: 'var(--teal)' }} />
            My RFQ Invitations
          </h2>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
            Showing only RFQs where you are on the invitation list.
          </p>
          {rfqListState.loading && <LoadingIndicator label="Loading invitations..." />}
          {rfqListState.error && (
            <ErrorBanner message={rfqListState.error} onDismiss={() => clearError('rfqListState')} />
          )}
          {!rfqListState.loading && rfqList.length === 0 && !rfqListState.error && (
            <p style={{ fontSize: 13, color: 'var(--muted)', padding: 16 }}>No RFQ invitations found.</p>
          )}
          {!rfqListState.loading && rfqList.length > 0 && (
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Deadline</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rfqList.filter(r => r.status === 'published').map((rfq) => (
                  <tr key={rfq.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>{rfq.id.slice(0, 8)}</td>
                    <td>{rfq.title}</td>
                    <td><span className="chip chip-draft">{rfq.status}</span></td>
                    <td style={{ fontSize: 12, color: 'var(--muted)' }}>{rfq.quoteDeadline.slice(0, 10)}</td>
                    <td><button className="btn" style={{ padding: '4px 12px', fontSize: 11 }}>Submit Quote</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {/* 4. Supplier Discovery Panel */}
      {canViewSupplierDiscovery(user.role) && (
        <section className="panel">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Search size={16} style={{ color: 'var(--teal)' }} />
            Supplier Discovery
          </h2>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Search suppliers by name or trade..."
              style={{
                flex: 1,
                minWidth: 200,
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                fontSize: 13,
                background: 'rgba(255,255,255,.7)',
                outline: 'none',
              }}
            />
            <select
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                fontSize: 13,
                background: 'rgba(255,255,255,.7)',
              }}
            >
              <option value="">All Regions</option>
              <option value="gauteng">Gauteng</option>
              <option value="western-cape">Western Cape</option>
              <option value="kwazulu-natal">KwaZulu-Natal</option>
              <option value="eastern-cape">Eastern Cape</option>
              <option value="free-state">Free State</option>
              <option value="limpopo">Limpopo</option>
              <option value="mpumalanga">Mpumalanga</option>
              <option value="north-west">North West</option>
              <option value="northern-cape">Northern Cape</option>
            </select>
            <select
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                fontSize: 13,
                background: 'rgba(255,255,255,.7)',
              }}
            >
              <option value="">All B-BBEE Levels</option>
              <option value="1">Level 1</option>
              <option value="2">Level 2</option>
              <option value="3">Level 3</option>
              <option value="4">Level 4</option>
            </select>
            <button
              className="btn"
              onClick={() => void loadSupplierProfiles({ tradeCategories: [], deliveryRegions: [] })}
            >
              <Search size={14} /> Filter
            </button>
          </div>
          {supplierProfilesState.loading && <LoadingIndicator label="Searching suppliers..." />}
          {supplierProfilesState.error && (
            <ErrorBanner message={supplierProfilesState.error} onDismiss={() => clearError('supplierProfilesState')} />
          )}
          {!supplierProfilesState.loading && supplierProfiles.length === 0 && !supplierProfilesState.error && (
            <p style={{ fontSize: 13, color: 'var(--muted)', padding: 16 }}>
              No matching suppliers found. Try broadening your filter criteria.
            </p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {supplierProfiles.map((supplier) => (
              <div
                key={supplier.supplierId}
                style={{
                  padding: 14,
                  borderRadius: 16,
                  border: '1px solid var(--border)',
                  background: 'rgba(255,255,255,.8)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <strong style={{ fontSize: 13, color: 'var(--ink)' }}>{supplier.firmName}</strong>
                  {supplier.verificationStatus === 'verified' ? (
                    <span className="pill" style={{ fontSize: 10 }}><span className="dot"></span> Verified</span>
                  ) : (
                    <span className="pill" style={{ fontSize: 10, color: 'var(--amber)', background: 'rgba(245,166,35,.08)', borderColor: 'rgba(245,166,35,.18)' }}>
                      <span className="dot" style={{ background: 'var(--amber)' }}></span> {supplier.verificationStatus}
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                  {supplier.tradeCategories.join(' · ')} · {supplier.deliveryRegions.join(', ')}
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                  <span style={{ fontSize: 11, color: 'var(--deep)', fontWeight: 600 }}>
                    {supplier.bbeeLevelNumber ? `B-BBEE Level ${supplier.bbeeLevelNumber}` : 'No B-BBEE'}
                  </span>
                  <button className="btn" style={{ padding: '4px 10px', fontSize: 11 }}>+ Invite</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 5. Quote Comparison Panel */}
      {canViewComparison(user.role) && (
        <section className="panel">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Scale size={16} style={{ color: 'var(--teal)' }} />
            Quote Comparison{currentRfq ? ` — ${currentRfq.title}` : ''}
          </h2>
          {currentRfq && currentRfq.status === 'evaluation' && !comparison && (
            <div style={{ marginBottom: 12 }}>
              <button
                className="btn"
                onClick={() => void generateQuoteComparison(currentRfq.id)}
                disabled={comparisonState.loading}
              >
                Generate Comparison
              </button>
            </div>
          )}
          {comparisonState.loading && <LoadingIndicator label="Generating comparison..." />}
          {comparisonState.error && (
            <ErrorBanner message={comparisonState.error} onDismiss={() => clearError('comparisonState')} />
          )}
          {comparison && comparison.scoredQuotes.length > 0 && (
            <>
              {currentRfq && (
                <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
                  Weighted scoring: Price {currentRfq.evaluationCriteria.priceWeight}% · Lead Time {currentRfq.evaluationCriteria.leadTimeWeight}% · B-BBEE {currentRfq.evaluationCriteria.bbeeWeight}% · Warranty {currentRfq.evaluationCriteria.warrantyWeight}% · Performance {currentRfq.evaluationCriteria.performanceWeight}%
                </p>
              )}
              <table className="table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Supplier</th>
                    <th>Price</th>
                    <th>Lead Time</th>
                    <th>B-BBEE</th>
                    <th>Warranty</th>
                    <th>Total Score</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.scoredQuotes.map((score: ScoredQuote) => (
                    <tr key={score.quoteId}>
                      <td style={{ fontWeight: 700, color: score.rank === 1 ? 'var(--green)' : 'var(--ink)' }}>#{score.rank}</td>
                      <td>{score.supplierName}</td>
                      <td>{score.normalizedScores.price.toFixed(1)}</td>
                      <td>{score.normalizedScores.leadTime.toFixed(1)}</td>
                      <td>{score.normalizedScores.bbee.toFixed(1)}</td>
                      <td>{score.normalizedScores.warranty.toFixed(1)}</td>
                      <td style={{ fontWeight: 700, color: score.rank === 1 ? 'var(--green)' : 'var(--ink)' }}>
                        {score.weightedScore.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {!comparisonState.loading && !comparison && !comparisonState.error && (
            <p style={{ fontSize: 13, color: 'var(--muted)', padding: 16 }}>
              Select an RFQ in evaluation status to generate a comparison.
            </p>
          )}
        </section>
      )}

      {/* 6. Award Approval Panel */}
      {canViewAwardApproval(user.role) && (
        <section className="panel">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Award size={16} style={{ color: 'var(--teal)' }} />
            Award Approval Gate
          </h2>
          {awardState.loading && <LoadingIndicator label="Processing award..." />}
          {awardState.error && (
            <ErrorBanner message={awardState.error} onDismiss={() => clearError('awardState')} />
          )}
          {currentRfq && !award && !awardState.loading && (
            <div style={{ marginBottom: 12 }}>
              <button
                className="btn"
                onClick={() => void loadAward(currentRfq.id)}
              >
                Load Award
              </button>
            </div>
          )}
          {award && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Recommendation card */}
              <div
                style={{
                  padding: 16,
                  borderRadius: 16,
                  border: '1px solid var(--border)',
                  background: 'rgba(255,255,255,.8)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <strong style={{ fontSize: 14, color: 'var(--ink)' }}>Recommended: {award.recommendedSupplierId}</strong>
                    <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                      {currentRfq?.title ?? award.rfqId} · Quoted: R {award.quotedPrice.toLocaleString()}
                    </p>
                  </div>
                  <span className={`chip ${award.status === 'approved' ? 'chip-approved' : 'chip-needs_decision'}`}>
                    {award.status.replace('_', ' ')}
                  </span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--ink)', lineHeight: 1.5 }}>
                  <strong>Justification:</strong> {award.justification}
                </p>
                {award.riskNotes && (
                  <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
                    <strong>Risk Notes:</strong> {award.riskNotes}
                  </p>
                )}
              </div>

              {/* Approval actions */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>Sequential approval required:</span>
                <span className="pill" style={{
                  color: award.clientApproval ? 'var(--green)' : 'var(--amber)',
                  background: award.clientApproval ? 'rgba(74,222,128,.1)' : 'rgba(245,166,35,.08)',
                  borderColor: award.clientApproval ? 'rgba(74,222,128,.18)' : 'rgba(245,166,35,.18)',
                }}>
                  ① Client Approval — {award.clientApproval ? 'Done' : 'Pending'}
                </span>
                <span className="pill" style={{
                  color: award.professionalApproval ? 'var(--green)' : 'var(--muted)',
                  background: award.professionalApproval ? 'rgba(74,222,128,.1)' : 'rgba(16,32,51,.04)',
                  borderColor: award.professionalApproval ? 'rgba(74,222,128,.18)' : 'var(--border)',
                }}>
                  ② Professional Approval — {award.professionalApproval ? 'Done' : award.clientApproval ? 'Pending' : 'Awaiting Client'}
                </span>
              </div>

              {/* Conflict of interest */}
              <div
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: `1px solid ${award.conflictOfInterestFlags.length > 0 ? 'rgba(245,166,35,.18)' : 'rgba(74,222,128,.18)'}`,
                  background: award.conflictOfInterestFlags.length > 0 ? 'rgba(245,166,35,.04)' : 'rgba(74,222,128,.04)',
                  fontSize: 12,
                }}
              >
                <strong style={{ color: award.conflictOfInterestFlags.length > 0 ? 'var(--amber)' : 'var(--green)' }}>
                  {award.conflictOfInterestFlags.length > 0 ? '⚠️ Conflict of Interest Detected' : '✓ Conflict of Interest Check'}
                </strong>
                <p style={{ color: 'var(--muted)', marginTop: 4 }}>
                  {award.conflictOfInterestFlags.length > 0
                    ? `${award.conflictOfInterestFlags.length} conflict(s) detected. All must be acknowledged before approval.`
                    : 'No conflicts detected between recommended supplier and project team members.'}
                </p>
              </div>

              {/* Action buttons */}
              {(user.role === 'client' || user.role === 'admin') && award.status === 'pending_client' && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn"
                    onClick={() => void approveAsClient(award.rfqId, user.uid, user.displayName ?? 'Client')}
                  >
                    Approve Award
                  </button>
                  <button
                    className="btn"
                    style={{ borderColor: 'rgba(217,87,71,.18)', background: 'rgba(217,87,71,.06)', color: 'var(--red)' }}
                    onClick={() => void rejectAward(award.rfqId, user.uid, user.displayName ?? 'Client', 'Rejected by client')}
                  >
                    Reject
                  </button>
                </div>
              )}
              {(['architect', 'quantity_surveyor', 'contractor'].includes(user.role ?? '')) && award.status === 'pending_professional' && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn"
                    onClick={() => void approveAsProfessional(award.rfqId, user.uid, user.displayName ?? 'Professional')}
                  >
                    Approve (Professional)
                  </button>
                  <button
                    className="btn"
                    style={{ borderColor: 'rgba(217,87,71,.18)', background: 'rgba(217,87,71,.06)', color: 'var(--red)' }}
                    onClick={() => void rejectAward(award.rfqId, user.uid, user.displayName ?? 'Professional', 'Rejected by professional')}
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          )}
          {!award && !awardState.loading && !awardState.error && !currentRfq && (
            <p style={{ fontSize: 13, color: 'var(--muted)', padding: 16 }}>
              Select an RFQ to view award details.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
