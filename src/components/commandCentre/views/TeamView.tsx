'use client';

import { useState, useEffect } from 'react';
import { Shield, UserCheck, Clock } from 'lucide-react';
import { useProjectContext } from '@/components/commandCentre/ProjectContextProvider';
import { subscribeToTeam } from '@/services/teamService';
import { DISCIPLINE_REGISTRY, type ProjectTeamMember, type Discipline, type UserRole } from '@/types';

/**
 * TeamView — Command Centre subsystem view for project team management.
 *
 * Renders:
 * 1. Team member list (names, roles, contact info)
 * 2. Role assignments (who is assigned to which role)
 * 3. Responsibility matrix (which roles handle which project functions)
 *
 * Follows: Hero → Stat Row → Panels content pattern.
 * Uses platform CSS tokens (.panel, .stat-card, .pill, .table).
 * Requirement: 2.4 — render within 200ms of navigation.
 */

interface TeamViewProps {
  projectId: string;
}

// ── Responsibility Matrix — maps project functions to responsible roles ───────

interface ResponsibilityEntry {
  function: string;
  responsible: UserRole[];
  accountable: UserRole[];
  consulted: UserRole[];
}

const RESPONSIBILITY_MATRIX: ResponsibilityEntry[] = [
  {
    function: 'Design & Documentation',
    responsible: ['architect', 'bep'],
    accountable: ['architect'],
    consulted: ['engineer', 'client'],
  },
  {
    function: 'Structural Design',
    responsible: ['engineer'],
    accountable: ['engineer'],
    consulted: ['architect', 'contractor'],
  },
  {
    function: 'Cost Management',
    responsible: ['quantity_surveyor'],
    accountable: ['quantity_surveyor'],
    consulted: ['architect', 'client'],
  },
  {
    function: 'Site Management',
    responsible: ['site_manager', 'contractor'],
    accountable: ['contractor'],
    consulted: ['architect', 'engineer'],
  },
  {
    function: 'Procurement',
    responsible: ['quantity_surveyor', 'contractor'],
    accountable: ['architect'],
    consulted: ['supplier', 'subcontractor'],
  },
  {
    function: 'Quality Control',
    responsible: ['site_manager'],
    accountable: ['architect'],
    consulted: ['engineer', 'contractor'],
  },
  {
    function: 'Compliance & Submissions',
    responsible: ['architect', 'town_planner'],
    accountable: ['architect'],
    consulted: ['energy_professional', 'fire_engineer'],
  },
  {
    function: 'Payment Certification',
    responsible: ['quantity_surveyor'],
    accountable: ['architect'],
    consulted: ['client', 'contractor'],
  },
];

// ── Role label helper ────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  client: 'Client',
  architect: 'Architect',
  engineer: 'Engineer',
  quantity_surveyor: 'Quantity Surveyor',
  town_planner: 'Town Planner',
  energy_professional: 'Energy Professional',
  fire_engineer: 'Fire Engineer',
  site_manager: 'Site Manager',
  bep: 'Built Environment Professional',
  contractor: 'Contractor',
  subcontractor: 'Subcontractor',
  supplier: 'Supplier',
  freelancer: 'Freelancer',
  developer: 'Developer',
  firm_admin: 'Firm Admin',
  platform_admin: 'Platform Admin',
  admin: 'Admin',
};

function getRoleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function getDisciplineLabel(discipline?: Discipline): string {
  if (!discipline) return '—';
  const info = DISCIPLINE_REGISTRY.find((d) => d.key === discipline);
  return info?.label ?? discipline;
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'active':
      return 'var(--green)';
    case 'invited':
      return 'var(--amber)';
    case 'removed':
      return 'var(--red)';
    default:
      return 'var(--muted)';
  }
}

function getStatusBg(status: string): string {
  switch (status) {
    case 'active':
      return 'rgba(74,222,128,.1)';
    case 'invited':
      return 'rgba(245,166,35,.08)';
    case 'removed':
      return 'rgba(217,87,71,.06)';
    default:
      return 'rgba(16,32,51,.04)';
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function TeamView({ projectId }: TeamViewProps) {
  const { context } = useProjectContext();
  const [members, setMembers] = useState<ProjectTeamMember[]>([]);

  // Subscribe to live team data from Firestore
  useEffect(() => {
    if (!projectId) return;
    const unsubscribe = subscribeToTeam(projectId, (teamMembers) => {
      setMembers(teamMembers);
    });
    return unsubscribe;
  }, [projectId]);

  // Derive stats synchronously — keeps initial render < 200ms
  const activeMembers = members.filter((m) => m.status === 'active');
  const invitedMembers = members.filter((m) => m.status === 'invited');
  const totalMembers = members.length;
  const uniqueRoles = [...new Set(members.map((m) => m.role))] as string[];
  const uniqueDisciplines = [...new Set(members.filter((m) => m.discipline).map((m) => m.discipline!))] as Discipline[];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ─── 1. Hero ─────────────────────────────────────────────────────── */}
      <div className="hero">
        <div className="hero-header">
          <div>
            <div className="eyebrow">PROJECT TEAM</div>
            <h1>{context?.projectName ?? 'Team & Resources'}</h1>
            <p className="sub">
              Team composition · Role assignments · Responsibility matrix
            </p>
          </div>
        </div>
        <div className="hero-pills" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span className="pill">
            <span className="dot"></span> {activeMembers.length} Active
          </span>
          {invitedMembers.length > 0 && (
            <span className="pill" style={{ color: 'var(--amber)', background: 'rgba(245,166,35,.08)', borderColor: 'rgba(245,166,35,.18)' }}>
              <span className="dot" style={{ background: 'var(--amber)' }}></span> {invitedMembers.length} Pending
            </span>
          )}
          <span className="pill" style={{ color: 'var(--muted)', background: 'rgba(16,32,51,.04)', borderColor: 'var(--border)' }}>
            <span className="dot" style={{ background: 'var(--muted)' }}></span> {uniqueRoles.length} Roles
          </span>
        </div>
      </div>

      {/* ─── 2. Stat Row ─────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--deep)' }}>{totalMembers}</div>
          <div className="stat-label">Total Members</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--green)' }}>{activeMembers.length}</div>
          <div className="stat-label">Active</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--amber)' }}>{invitedMembers.length}</div>
          <div className="stat-label">Invited</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--teal)' }}>{uniqueDisciplines.length}</div>
          <div className="stat-label">Disciplines</div>
        </div>
      </div>

      {/* ─── 3. Team Member List Panel ───────────────────────────────────── */}
      <section className="panel">
        <h2>Team Members</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Name / ID</th>
              <th>Role</th>
              <th>Discipline</th>
              <th>Joined</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {members.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--muted)' }}>
                  No team members assigned to this project
                </td>
              </tr>
            ) : (
              members.map((member, idx) => (
                <tr key={`${member.userId}-${idx}`}>
                  <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
                    {member.userId}
                  </td>
                  <td>{getRoleLabel(member.role)}</td>
                  <td>{getDisciplineLabel(member.discipline)}</td>
                  <td style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {member.joinedAt ? new Date(member.joinedAt).toLocaleDateString() : '—'}
                  </td>
                  <td>
                    <span
                      className="chip"
                      style={{
                        color: getStatusColor(member.status),
                        background: getStatusBg(member.status),
                        border: `1px solid ${getStatusColor(member.status)}22`,
                        borderRadius: 4,
                        padding: '2px 8px',
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: 'capitalize',
                      }}
                    >
                      {member.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {/* ─── 4. Role Assignments Panel ───────────────────────────────────── */}
      <section className="panel">
        <h2>Role Assignments</h2>
        {uniqueRoles.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--muted)', padding: '14px 0' }}>
            No roles assigned yet
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {uniqueRoles.map((role) => {
              const roleMembers = members.filter((m) => m.role === role && m.status === 'active');
              const invited = members.filter((m) => m.role === role && m.status === 'invited');
              return (
                <div
                  key={role}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: '12px 14px',
                    background: 'rgba(255,255,255,.5)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <Shield style={{ width: 14, height: 14, color: 'var(--teal)' }} />
                    <strong style={{ fontSize: 12, color: 'var(--deep)' }}>{getRoleLabel(role)}</strong>
                    <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto' }}>
                      {roleMembers.length} active
                    </span>
                  </div>
                  {roleMembers.length === 0 && invited.length === 0 && (
                    <p style={{ fontSize: 12, color: 'var(--muted)' }}>No members assigned</p>
                  )}
                  {roleMembers.map((m, i) => (
                    <div key={`${m.userId}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <UserCheck style={{ width: 12, height: 12, color: 'var(--green)' }} />
                      <span style={{ fontSize: 12 }}>{m.userId}</span>
                      {m.discipline && (
                        <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 'auto' }}>
                          {getDisciplineLabel(m.discipline)}
                        </span>
                      )}
                    </div>
                  ))}
                  {invited.map((m, i) => (
                    <div key={`inv-${m.userId}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <Clock style={{ width: 12, height: 12, color: 'var(--amber)' }} />
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{m.userId} (invited)</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ─── 5. Responsibility Matrix Panel ──────────────────────────────── */}
      <section className="panel">
        <h2>Responsibility Matrix</h2>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
          RACI assignments — Responsible · Accountable · Consulted
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>Project Function</th>
              <th>Responsible</th>
              <th>Accountable</th>
              <th>Consulted</th>
            </tr>
          </thead>
          <tbody>
            {RESPONSIBILITY_MATRIX.map((entry) => (
              <tr key={entry.function}>
                <td style={{ fontWeight: 500 }}>{entry.function}</td>
                <td>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {entry.responsible.map((r) => (
                      <span
                        key={r}
                        className="pill"
                        style={{ fontSize: 10, padding: '2px 8px' }}
                      >
                        {getRoleLabel(r)}
                      </span>
                    ))}
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {entry.accountable.map((r) => (
                      <span
                        key={r}
                        className="pill"
                        style={{
                          fontSize: 10,
                          padding: '2px 8px',
                          color: 'var(--deep)',
                          background: 'rgba(25,183,176,.08)',
                          borderColor: 'rgba(25,183,176,.18)',
                        }}
                      >
                        {getRoleLabel(r)}
                      </span>
                    ))}
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {entry.consulted.map((r) => (
                      <span
                        key={r}
                        className="pill"
                        style={{
                          fontSize: 10,
                          padding: '2px 8px',
                          color: 'var(--muted)',
                          background: 'rgba(16,32,51,.04)',
                          borderColor: 'var(--border)',
                        }}
                      >
                        {getRoleLabel(r)}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
