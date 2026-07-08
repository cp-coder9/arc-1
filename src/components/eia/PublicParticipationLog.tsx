// PublicParticipationLog — I&AP register, notification tracking, and comment management.
// Requirements: 7.1–7.7

import React, { useState } from 'react';
import { Users, Bell, MessageSquare, Plus, AlertTriangle, Lock } from 'lucide-react';
import {
  calculateCompletenessIndicator,
  isCommentPeriodClosed,
  calculateCommentDeadline,
} from '@/services/eia/publicParticipationService';
import type {
  IAPRecord,
  NotificationEvent,
  CommentRecord,
  RegistrationMethod,
  InterestCategory,
  NotificationType,
} from '@/services/eia/eiaTypes';

export interface PublicParticipationLogProps {
  projectId: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

let idSeq = 0;
function genId(prefix: string): string {
  idSeq += 1;
  return `${prefix}_${Date.now()}_${idSeq}`;
}

function formatMethod(method: RegistrationMethod): string {
  return method.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function formatCategory(cat: InterestCategory): string {
  return cat.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function formatNotificationType(type: NotificationType): string {
  return type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function daysRemaining(deadline: string): number {
  const now = new Date();
  const dl = new Date(deadline);
  return Math.ceil((dl.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * PublicParticipationLog tracks I&AP registration, notification events,
 * comment submissions, and completeness indicators for the EIA public
 * participation process.
 */
export function PublicParticipationLog({ projectId }: PublicParticipationLogProps) {
  const [iaps, setIaps] = useState<IAPRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationEvent[]>([]);
  const [comments, setComments] = useState<CommentRecord[]>([]);

  // Form visibility toggles
  const [showAddIAP, setShowAddIAP] = useState(false);
  const [showAddNotification, setShowAddNotification] = useState(false);
  const [showAddComment, setShowAddComment] = useState(false);

  // Comment form state
  const [commentNotifId, setCommentNotifId] = useState('');
  const [commentPartyId, setCommentPartyId] = useState('');
  const [commentSummary, setCommentSummary] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);

  // Completeness indicator
  const completeness = calculateCompletenessIndicator(iaps, notifications, comments);

  // ─── I&AP Add Handler ────────────────────────────────────────────────────
  function handleAddIAP(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const record: IAPRecord = {
      id: genId('iap'),
      projectId,
      partyName: fd.get('partyName') as string,
      organisation: (fd.get('organisation') as string) || undefined,
      email: fd.get('email') as string,
      phone: fd.get('phone') as string,
      postalAddress: fd.get('postalAddress') as string,
      dateRegistered: new Date().toISOString().split('T')[0],
      registrationMethod: fd.get('registrationMethod') as RegistrationMethod,
      interestCategory: fd.get('interestCategory') as InterestCategory,
    };
    setIaps((prev) => [...prev, record]);
    setShowAddIAP(false);
    form.reset();
  }

  // ─── Notification Add Handler ────────────────────────────────────────────
  function handleAddNotification(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const dateIssued = fd.get('dateIssued') as string;
    const recipientIdsRaw = fd.get('recipientIds') as string;
    const recipientIds = recipientIdsRaw
      ? recipientIdsRaw.split(',').map((s) => s.trim()).filter(Boolean)
      : [];

    const notification: NotificationEvent = {
      id: genId('notif'),
      projectId,
      notificationType: fd.get('notificationType') as NotificationType,
      dateIssued,
      recipientIds,
      proofReference: fd.get('proofReference') as string,
      commentDeadline: calculateCommentDeadline(dateIssued),
      isClosed: false,
      totalComments: 0,
      commentsWithResponse: 0,
    };
    setNotifications((prev) => [...prev, notification]);
    setShowAddNotification(false);
    form.reset();
  }

  // ─── Comment Submission Handler ──────────────────────────────────────────
  function handleSubmitComment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCommentError(null);

    const notification = notifications.find((n) => n.id === commentNotifId);
    if (!notification) {
      setCommentError('Please select a valid notification.');
      return;
    }

    // Check if comment period is closed
    if (isCommentPeriodClosed(notification)) {
      setCommentError(
        `Comment period closed on ${notification.commentDeadline}. No new comments can be submitted for this notification.`
      );
      return;
    }

    const newComment: CommentRecord = {
      id: genId('comment'),
      projectId,
      notificationId: commentNotifId,
      commentingPartyId: commentPartyId,
      dateReceived: new Date().toISOString().split('T')[0],
      commentSummary,
    };

    setComments((prev) => [...prev, newComment]);
    // Update notification counters
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === commentNotifId
          ? { ...n, totalComments: n.totalComments + 1 }
          : n
      )
    );

    setCommentNotifId('');
    setCommentPartyId('');
    setCommentSummary('');
    setShowAddComment(false);
  }

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Completeness Indicator (Stat Row) */}
      <div className="stat-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        <div className="stat-card">
          <div className="stat-value" style={{ color: completeness.totalIAPs === 0 ? 'var(--red)' : 'var(--ink)' }}>
            {completeness.totalIAPs}
          </div>
          <div className="stat-label">I&APs Registered</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: completeness.notifiedIAPs === 0 ? 'var(--red)' : 'var(--ink)' }}>
            {completeness.notifiedIAPs}
          </div>
          <div className="stat-label">I&APs Notified</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: completeness.totalComments === 0 ? 'var(--red)' : 'var(--ink)' }}>
            {completeness.totalComments}
          </div>
          <div className="stat-label">Comments Received</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: completeness.commentsWithResponse === 0 ? 'var(--red)' : 'var(--green)' }}>
            {completeness.commentsWithResponse}
          </div>
          <div className="stat-label">Responded</div>
        </div>
      </div>

      {/* I&AP Register Panel */}
      <section className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--deep)', margin: 0, fontFamily: 'var(--font)' }}>
            <Users size={14} style={{ color: 'var(--teal)', marginRight: 6, verticalAlign: 'middle' }} aria-hidden="true" />
            I&AP Register
          </h2>
          <button className="btn" onClick={() => setShowAddIAP(!showAddIAP)} type="button">
            <Plus size={14} style={{ marginRight: 4 }} aria-hidden="true" />
            Add I&AP
          </button>
        </div>

        {showAddIAP && (
          <form onSubmit={handleAddIAP} style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input name="partyName" placeholder="Party Name *" required maxLength={200}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'var(--font)' }} />
              <input name="organisation" placeholder="Organisation" maxLength={200}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'var(--font)' }} />
              <input name="email" type="email" placeholder="Email *" required
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'var(--font)' }} />
              <input name="phone" placeholder="Phone *" required
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'var(--font)' }} />
            </div>
            <input name="postalAddress" placeholder="Postal Address *" required
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'var(--font)' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <select name="registrationMethod" required
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'var(--font)', background: 'var(--white)' }}>
                <option value="">Registration Method *</option>
                <option value="written_request">Written Request</option>
                <option value="site_notice">Site Notice</option>
                <option value="advertisement_response">Advertisement Response</option>
                <option value="organ_of_state">Organ of State</option>
              </select>
              <select name="interestCategory" required
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'var(--font)', background: 'var(--white)' }}>
                <option value="">Interest Category *</option>
                <option value="adjacent_owner">Adjacent Owner</option>
                <option value="community_member">Community Member</option>
                <option value="organ_of_state">Organ of State</option>
                <option value="ngo">NGO</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" type="submit">Register I&AP</button>
              <button className="btn" type="button" onClick={() => setShowAddIAP(false)}
                style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,.7)', color: 'var(--ink)' }}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {iaps.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
            No Interested &amp; Affected Parties registered yet. Click "Add I&AP" to begin.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Party Name</th>
                  <th>Organisation</th>
                  <th>Email</th>
                  <th>Method</th>
                  <th>Category</th>
                  <th>Registered</th>
                </tr>
              </thead>
              <tbody>
                {iaps.map((iap) => (
                  <tr key={iap.id}>
                    <td style={{ fontWeight: 500 }}>{iap.partyName}</td>
                    <td>{iap.organisation || '—'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>{iap.email}</td>
                    <td>{formatMethod(iap.registrationMethod)}</td>
                    <td>{formatCategory(iap.interestCategory)}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>{iap.dateRegistered}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Notification Events Panel */}
      <section className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--deep)', margin: 0, fontFamily: 'var(--font)' }}>
            <Bell size={14} style={{ color: 'var(--teal)', marginRight: 6, verticalAlign: 'middle' }} aria-hidden="true" />
            Notification Events
          </h2>
          <button className="btn" onClick={() => setShowAddNotification(!showAddNotification)} type="button">
            <Plus size={14} style={{ marginRight: 4 }} aria-hidden="true" />
            Add Notification
          </button>
        </div>

        {showAddNotification && (
          <form onSubmit={handleAddNotification} style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <select name="notificationType" required
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'var(--font)', background: 'var(--white)' }}>
                <option value="">Notification Type *</option>
                <option value="site_notice">Site Notice</option>
                <option value="newspaper_advertisement">Newspaper Advertisement</option>
                <option value="written_notice">Written Notice</option>
                <option value="bid_distribution">BID Distribution</option>
              </select>
              <input name="dateIssued" type="date" required
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'var(--font)' }} />
            </div>
            <input name="recipientIds" placeholder="Recipient I&AP IDs (comma-separated)"
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'var(--font)' }} />
            <input name="proofReference" placeholder="Proof of Notification Reference *" required maxLength={500}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'var(--font)' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" type="submit">Record Notification</button>
              <button className="btn" type="button" onClick={() => setShowAddNotification(false)}
                style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,.7)', color: 'var(--ink)' }}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {notifications.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
            No notification events recorded yet. Click "Add Notification" to log a notification.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {notifications.map((notif) => {
              const closed = isCommentPeriodClosed(notif);
              const remaining = daysRemaining(notif.commentDeadline);
              return (
                <div
                  key={notif.id}
                  style={{
                    padding: 14,
                    borderRadius: 12,
                    border: '1px solid var(--border)',
                    background: closed ? 'rgba(16,32,51,.02)' : 'rgba(255,255,255,.6)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                        {formatNotificationType(notif.notificationType)}
                      </span>
                      {closed ? (
                        <span className="pill" style={{ color: 'var(--red)', background: 'rgba(217,87,71,.06)', borderColor: 'rgba(217,87,71,.18)', fontSize: 10, fontWeight: 600 }}>
                          <Lock size={10} style={{ marginRight: 3 }} aria-hidden="true" />
                          Closed
                        </span>
                      ) : (
                        <span className="pill" style={{ color: 'var(--green)', background: 'rgba(74,222,128,.1)', borderColor: 'rgba(74,222,128,.18)', fontSize: 10, fontWeight: 600 }}>
                          <span className="dot" style={{ background: 'var(--green)' }}></span>
                          Open
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--muted)' }}>
                      {notif.dateIssued}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--muted)' }}>
                    <span>
                      Deadline: <strong style={{ color: closed ? 'var(--red)' : remaining <= 7 ? 'var(--amber)' : 'var(--ink)' }}>
                        {notif.commentDeadline}
                      </strong>
                    </span>
                    {!closed && (
                      <span>
                        <strong style={{ color: remaining <= 7 ? 'var(--amber)' : 'var(--teal)' }}>
                          {remaining} days remaining
                        </strong>
                      </span>
                    )}
                    <span>Comments: <strong>{notif.totalComments}</strong></span>
                    <span>Responded: <strong>{notif.commentsWithResponse}</strong></span>
                    <span>Recipients: <strong>{notif.recipientIds.length}</strong></span>
                  </div>
                  {notif.proofReference && (
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                      Proof: {notif.proofReference}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Comment Submission Panel */}
      <section className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--deep)', margin: 0, fontFamily: 'var(--font)' }}>
            <MessageSquare size={14} style={{ color: 'var(--teal)', marginRight: 6, verticalAlign: 'middle' }} aria-hidden="true" />
            Comments Received
          </h2>
          <button className="btn" onClick={() => setShowAddComment(!showAddComment)} type="button">
            <Plus size={14} style={{ marginRight: 4 }} aria-hidden="true" />
            Submit Comment
          </button>
        </div>

        {showAddComment && (
          <form onSubmit={handleSubmitComment} style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {commentError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 8, background: 'rgba(217,87,71,.06)', border: '1px solid rgba(217,87,71,.18)' }}>
                <AlertTriangle size={14} style={{ color: 'var(--red)', flexShrink: 0 }} aria-hidden="true" />
                <span style={{ fontSize: 12, color: 'var(--red)' }}>{commentError}</span>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <select value={commentNotifId} onChange={(e) => setCommentNotifId(e.target.value)} required
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'var(--font)', background: 'var(--white)' }}>
                <option value="">Select Notification *</option>
                {notifications.map((n) => (
                  <option key={n.id} value={n.id}>
                    {formatNotificationType(n.notificationType)} — {n.dateIssued}
                  </option>
                ))}
              </select>
              <select value={commentPartyId} onChange={(e) => setCommentPartyId(e.target.value)} required
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'var(--font)', background: 'var(--white)' }}>
                <option value="">Commenting Party *</option>
                {iaps.map((iap) => (
                  <option key={iap.id} value={iap.id}>{iap.partyName}</option>
                ))}
              </select>
            </div>
            <textarea
              value={commentSummary}
              onChange={(e) => setCommentSummary(e.target.value)}
              placeholder="Comment summary (max 2000 characters) *"
              required
              maxLength={2000}
              rows={3}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'var(--font)', resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" type="submit">Submit Comment</button>
              <button className="btn" type="button" onClick={() => { setShowAddComment(false); setCommentError(null); }}
                style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,.7)', color: 'var(--ink)' }}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {comments.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
            No comments received yet. Use "Submit Comment" to record a comment linked to a notification.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Party</th>
                  <th>Notification</th>
                  <th>Date Received</th>
                  <th>Summary</th>
                  <th>Response</th>
                </tr>
              </thead>
              <tbody>
                {comments.map((comment) => {
                  const party = iaps.find((i) => i.id === comment.commentingPartyId);
                  const notif = notifications.find((n) => n.id === comment.notificationId);
                  return (
                    <tr key={comment.id}>
                      <td style={{ fontWeight: 500 }}>{party?.partyName ?? comment.commentingPartyId}</td>
                      <td style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {notif ? formatNotificationType(notif.notificationType) : comment.notificationId}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>{comment.dateReceived}</td>
                      <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {comment.commentSummary}
                      </td>
                      <td>
                        {comment.eapResponse ? (
                          <span className="pill" style={{ color: 'var(--green)', background: 'rgba(74,222,128,.1)', borderColor: 'rgba(74,222,128,.18)', fontSize: 10, fontWeight: 600 }}>
                            <span className="dot" style={{ background: 'var(--green)' }}></span>
                            Responded
                          </span>
                        ) : (
                          <span className="pill" style={{ color: 'var(--amber)', background: 'rgba(245,166,35,.08)', borderColor: 'rgba(245,166,35,.18)', fontSize: 10, fontWeight: 600 }}>
                            <span className="dot" style={{ background: 'var(--amber)' }}></span>
                            Pending
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default PublicParticipationLog;
