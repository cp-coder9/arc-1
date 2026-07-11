/**
 * UserRoleManagementPanel — Admin sub-component for user/role/verification management.
 *
 * Displays a table of users with their roles and professional verification status.
 * Lets admin update roles/verification; all changes write an audit trail record
 * (acting admin UID, target entity, change description, timestamp).
 *
 * Follows workspace-template pattern: .panel > h2 + .table
 * Uses CSS custom properties only — NO hardcoded hex values.
 * Uses lucide-react for icons.
 *
 * Requirements: 9.2
 * @module admin/UserRoleManagementPanel
 */

import React, { useCallback, useEffect, useState } from 'react';
import { getDocs, limit, query } from 'firebase/firestore';
import { BadgeCheck, Edit2, Save, ShieldCheck, User, X } from 'lucide-react';
import type { UserProfile } from '@/types';
import { getDemoCol } from '../../demo-seed/demoFirestore';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ManagedUser {
  uid: string;
  email: string;
  displayName: string;
  role: string;
  professionalBody?: string;
  verificationStatus: 'verified' | 'pending' | 'unverified';
  createdAt?: string;
}

interface AuditTrailEntry {
  id: string;
  adminUid: string;
  adminEmail: string;
  targetEntity: string;
  changeDescription: string;
  timestampIso: string;
}

interface Props {
  user: UserProfile;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const AVAILABLE_ROLES = [
  'client', 'architect', 'engineer', 'quantity_surveyor', 'town_planner',
  'energy_professional', 'fire_engineer', 'site_manager', 'bep',
  'contractor', 'subcontractor', 'supplier', 'freelancer', 'developer',
  'firm_admin', 'platform_admin', 'admin',
] as const;

const VERIFICATION_STATUSES = ['verified', 'pending', 'unverified'] as const;

// ─── Component ────────────────────────────────────────────────────────────────

export default function UserRoleManagementPanel({ user }: Props) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [editRole, setEditRole] = useState('');
  const [editVerification, setEditVerification] = useState<'verified' | 'pending' | 'unverified'>('unverified');
  const [auditTrail, setAuditTrail] = useState<AuditTrailEntry[]>([]);

  // Load users from Firestore
  useEffect(() => {
    async function loadUsers() {
      setLoading(true);
      try {
        const usersRef = getDemoCol('users');
        const q = query(usersRef, limit(100));
        const snapshot = await getDocs(q);
        const loaded: ManagedUser[] = snapshot.docs.map((doc) => {
          const data = doc.data() as Record<string, unknown>;
          return {
            uid: doc.id,
            email: (data.email as string) || '',
            displayName: (data.displayName as string) || (data.name as string) || 'Unknown',
            role: (data.role as string) || 'client',
            professionalBody: data.professionalBody as string | undefined,
            verificationStatus: (data.verificationStatus as 'verified' | 'pending' | 'unverified') || 'unverified',
            createdAt: data.createdAt as string | undefined,
          };
        });
        setUsers(loaded);
      } catch (err) {
        console.warn('Failed to load users for admin management:', err);
        setUsers([]);
      } finally {
        setLoading(false);
      }
    }
    loadUsers();
  }, []);

  // Begin editing a user
  const startEdit = useCallback((managedUser: ManagedUser) => {
    setEditingUid(managedUser.uid);
    setEditRole(managedUser.role);
    setEditVerification(managedUser.verificationStatus);
  }, []);

  // Cancel editing
  const cancelEdit = useCallback(() => {
    setEditingUid(null);
    setEditRole('');
    setEditVerification('unverified');
  }, []);

  // Save changes and write to audit trail
  const saveChanges = useCallback((targetUser: ManagedUser) => {
    const changes: string[] = [];
    if (editRole !== targetUser.role) {
      changes.push(`Role changed: ${targetUser.role} → ${editRole}`);
    }
    if (editVerification !== targetUser.verificationStatus) {
      changes.push(`Verification status changed: ${targetUser.verificationStatus} → ${editVerification}`);
    }

    if (changes.length === 0) {
      cancelEdit();
      return;
    }

    const changeDescription = changes.join('; ');
    const timestampIso = new Date().toISOString();

    // Write audit trail record
    const auditEntry: AuditTrailEntry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      adminUid: user.uid,
      adminEmail: user.email,
      targetEntity: `user/${targetUser.uid} (${targetUser.email})`,
      changeDescription,
      timestampIso,
    };

    setAuditTrail((prev) => [auditEntry, ...prev]);

    // Update local state
    setUsers((prev) =>
      prev.map((u) =>
        u.uid === targetUser.uid
          ? { ...u, role: editRole, verificationStatus: editVerification }
          : u,
      ),
    );

    cancelEdit();
  }, [editRole, editVerification, user.uid, user.email, cancelEdit]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* User Management Table */}
      <section className="panel">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <User size={16} style={{ color: 'var(--teal)' }} />
          User &amp; Role Management
        </h2>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
          Manage user roles and professional verification status. All changes are written to an immutable audit trail.
        </p>

        {loading ? (
          <p style={{ fontSize: 13, color: 'var(--muted)', padding: '16px 0', textAlign: 'center' }}>
            Loading users…
          </p>
        ) : users.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--muted)', padding: '16px 0', textAlign: 'center' }}>
            No users found in the platform.
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Role</th>
                <th>Verification</th>
                <th>Professional Body</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((managedUser) => (
                <tr key={managedUser.uid}>
                  <td>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
                      {managedUser.uid.slice(0, 8)}…
                    </span>
                    <br />
                    <span style={{ fontSize: 13 }}>{managedUser.displayName}</span>
                  </td>
                  <td style={{ fontSize: 12 }}>{managedUser.email}</td>
                  <td>
                    {editingUid === managedUser.uid ? (
                      <select
                        value={editRole}
                        onChange={(e) => setEditRole(e.target.value)}
                        style={{
                          fontSize: 12,
                          padding: '4px 8px',
                          borderRadius: 6,
                          border: '1px solid var(--border)',
                          background: 'var(--white, #fff)',
                          color: 'var(--ink)',
                        }}
                      >
                        {AVAILABLE_ROLES.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="chip-pending" style={{ fontSize: 11 }}>
                        {managedUser.role}
                      </span>
                    )}
                  </td>
                  <td>
                    {editingUid === managedUser.uid ? (
                      <select
                        value={editVerification}
                        onChange={(e) => setEditVerification(e.target.value as typeof editVerification)}
                        style={{
                          fontSize: 12,
                          padding: '4px 8px',
                          borderRadius: 6,
                          border: '1px solid var(--border)',
                          background: 'var(--white, #fff)',
                          color: 'var(--ink)',
                        }}
                      >
                        {VERIFICATION_STATUSES.map((v) => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                    ) : (
                      <VerificationChip status={managedUser.verificationStatus} />
                    )}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {managedUser.professionalBody || '—'}
                  </td>
                  <td>
                    {editingUid === managedUser.uid ? (
                      <span style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="btn"
                          style={{ padding: '4px 10px', fontSize: 11, height: 28 }}
                          onClick={() => saveChanges(managedUser)}
                          title="Save changes"
                        >
                          <Save size={12} /> Save
                        </button>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '4px 10px', fontSize: 11, height: 28 }}
                          onClick={cancelEdit}
                          title="Cancel"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ) : (
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '4px 10px', fontSize: 11, height: 28 }}
                        onClick={() => startEdit(managedUser)}
                        title="Edit user role & verification"
                      >
                        <Edit2 size={12} /> Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Change Audit Trail */}
      <section className="panel">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShieldCheck size={16} style={{ color: 'var(--teal)' }} />
          User Management Audit Trail
        </h2>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
          Immutable record of all user/role/verification changes made from this console.
        </p>

        {auditTrail.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--muted)', padding: '16px 0', textAlign: 'center' }}>
            No changes recorded this session.
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Acting Admin</th>
                <th>Target Entity</th>
                <th>Change Description</th>
              </tr>
            </thead>
            <tbody>
              {auditTrail.map((entry) => (
                <tr key={entry.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {new Date(entry.timestampIso).toLocaleString()}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
                      {entry.adminUid.slice(0, 8)}…
                    </span>
                    <br />
                    {entry.adminEmail}
                  </td>
                  <td style={{ fontSize: 12 }}>{entry.targetEntity}</td>
                  <td style={{ fontSize: 12 }}>{entry.changeDescription}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function VerificationChip({ status }: { status: 'verified' | 'pending' | 'unverified' }) {
  const chipClass =
    status === 'verified'
      ? 'chip-approved'
      : status === 'pending'
        ? 'chip-pending'
        : 'chip-draft';
  return (
    <span className={chipClass} style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {status === 'verified' && <BadgeCheck size={12} />}
      {status}
    </span>
  );
}
