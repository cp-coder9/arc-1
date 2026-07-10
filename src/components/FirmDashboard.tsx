import React, { useEffect, useState } from 'react';
import { Firm, FirmMember, FirmInvite, FirmRole, Project, UserProfile } from '@/types';
import { inviteFirmMember, subscribeToFirm, subscribeToFirmInvites, subscribeToFirmMembers, subscribeToFirmProjects } from '@/services/firmService';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Building2, FolderKanban, Mail, ShieldCheck, UserPlus, Users } from 'lucide-react';

// ─── Glass system & design components ────────────────────────────────────────
import { RoleAwareSidebar } from '@/components/navigation/RoleAwareSidebar';
import { MobileMenuTrigger } from '@/components/navigation/MobileMenuTrigger';
import { Breadcrumbs } from '@/components/navigation/Breadcrumbs';
import { GlassButton } from '@/components/ui/GlassButton';
import { StatCardAnimated } from '@/components/animated/StatCardAnimated';
import { DashboardSection } from '@/components/composite/DashboardSection';
import { GlassTable } from '@/components/composite/GlassTable';
import { useReducedMotion } from '@/hooks/useReducedMotion';

const INVITABLE_FIRM_ROLES: FirmRole[] = ['admin', 'coordinator', 'staff', 'billing_viewer'];

export default function FirmDashboard({ user }: { user: UserProfile }) {
  const prefersReducedMotion = useReducedMotion() ?? false;
  const [firm, setFirm] = useState<Firm | null>(null);
  const [members, setMembers] = useState<FirmMember[]>([]);
  const [invites, setInvites] = useState<FirmInvite[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<FirmRole>('staff');
  const [inviting, setInviting] = useState(false);
  const firmId = user.primaryFirmId;
  const canManageFirm = user.firmRole === 'owner' || user.firmRole === 'admin';

  const handleInviteMember = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!firmId || !canManageFirm) return;
    setInviting(true);
    try {
      await inviteFirmMember({ firmId, email: inviteEmail, role: inviteRole, invitedBy: user.uid });
      setInviteEmail('');
      setInviteRole('staff');
      toast.success('Firm invite created');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create firm invite');
    } finally {
      setInviting(false);
    }
  };

  useEffect(() => {
    if (!firmId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const loaded = { firm: false, members: false, invites: false, projects: false };
    const markLoaded = (key: keyof typeof loaded) => {
      loaded[key] = true;
      if (Object.values(loaded).every(Boolean)) setLoading(false);
    };
    const unsubscribeFirm = subscribeToFirm(firmId, (value) => { setFirm(value); markLoaded('firm'); });
    const unsubscribeMembers = subscribeToFirmMembers(firmId, (value) => { setMembers(value); markLoaded('members'); });
    const unsubscribeInvites = subscribeToFirmInvites(firmId, (value) => { setInvites(value); markLoaded('invites'); });
    const unsubscribeProjects = subscribeToFirmProjects(firmId, (value) => { setProjects(value); markLoaded('projects'); });

    return () => {
      unsubscribeFirm();
      unsubscribeMembers();
      unsubscribeInvites();
      unsubscribeProjects();
    };
  }, [firmId]);

  if (!firmId) {
    return (
      <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
        <main className="md:ml-64 p-4 md:p-6 space-y-6" id="main-content">
          <header className="glass-panel rounded-2xl p-5 md:p-6">
            <div className="flex items-start gap-3">
              <MobileMenuTrigger user={user} className="mt-1 shrink-0" />
              <div>
                <div className="flex items-center gap-3">
                  <Building2 className="h-6 w-6 text-primary" aria-hidden="true" />
                  <h1 className="text-2xl md:text-3xl font-heading font-bold text-foreground tracking-tight">Firm Workspace</h1>
                </div>
                <Breadcrumbs className="mt-2" />
              </div>
            </div>
          </header>
          <DashboardSection title="Firm Workspace">
            <p className="text-foreground-muted">Firm workspace access is available after an owner creates a firm or invites you.</p>
            <div className="rounded-2xl border border-dashed border-white/20 p-10 text-center mt-4">
              <Users className="mx-auto h-10 w-10 opacity-40 mb-3" aria-hidden="true" />
              <p className="text-sm text-foreground-muted">No active firm membership is linked to this profile yet.</p>
            </div>
          </DashboardSection>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <main className="p-4 md:p-6 space-y-6" id="main-content">
        {/* ── Page header ────────────────────────────────────────────────── */}
        <header className="glass-panel rounded-2xl p-5 md:p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              <MobileMenuTrigger user={user} className="mt-1 shrink-0" />
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="h-10 w-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                    <Building2 className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h1 className="text-2xl md:text-3xl font-heading font-bold text-foreground tracking-tight">{firm?.name || 'Firm Workspace'}</h1>
                </div>
                <p className="text-sm text-foreground-muted mt-1 max-w-xl leading-relaxed">Members, invitations, and explicitly linked project access.</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Badge variant="outline" className="rounded-full px-3 py-1 bg-primary/5 text-primary border-primary/10 font-bold uppercase tracking-widest text-[10px]">
                    {user.firmRole || 'member'}
                  </Badge>
                  <Badge variant="outline" className="rounded-full px-3 py-1 bg-secondary/50 text-muted-foreground border-border font-bold uppercase tracking-widest text-[10px]">
                    Access: {user.firmStatus || 'active'}
                  </Badge>
                </div>
                <Breadcrumbs className="mt-2" />
              </div>
            </div>
            <GlassButton variant="solid" size="sm" disabled={!canManageFirm} title={canManageFirm ? 'Use the invite panel to add verified firm members' : 'Only firm owners and admins can invite members'}>
              <UserPlus className="mr-1.5 h-4 w-4" aria-hidden="true" /> Invite member
            </GlassButton>
          </div>
        </header>

        {/* ── Stats ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCardAnimated label="Active Members" value={members.filter((member) => member.status === 'active').length} icon={<Users size={20} aria-hidden="true" />} delay={prefersReducedMotion ? 0 : 0 * 0.05} prefersReducedMotion={prefersReducedMotion} />
          <StatCardAnimated label="Pending Invites" value={invites.length} icon={<Mail size={20} aria-hidden="true" />} delay={prefersReducedMotion ? 0 : 1 * 0.05} prefersReducedMotion={prefersReducedMotion} />
          <StatCardAnimated label="Linked Projects" value={projects.length} icon={<FolderKanban size={20} aria-hidden="true" />} delay={prefersReducedMotion ? 0 : 2 * 0.05} prefersReducedMotion={prefersReducedMotion} />
        </div>

        {/* ── Members + Sidebar ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
          <DashboardSection title="Members" description="Verified active firm memberships and role-scoped access." icon={<Users size={18} aria-hidden="true" />}>
            {loading && <p className="text-foreground-muted italic">Loading firm workspace...</p>}
            {!loading && members.map((member) => (
              <div key={member.userId} className="glass-record rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                    {(member.displayName || member.email || 'U')[0]}
                  </div>
                  <div>
                    <p className="font-bold text-sm">{member.displayName || member.email}</p>
                    <p className="text-xs text-foreground-muted">{member.email}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Badge variant="outline" className="uppercase text-[10px] tracking-widest">{member.role}</Badge>
                  <Badge variant={member.status === 'active' ? 'secondary' : 'outline'} className="uppercase text-[10px] tracking-widest">{member.status}</Badge>
                </div>
              </div>
            ))}
            {!loading && members.length === 0 && <p className="text-foreground-muted italic">No active firm members found.</p>}
          </DashboardSection>

          <div className="space-y-4">
            <DashboardSection title="Pending Invites" icon={<Mail size={18} aria-hidden="true" />}>
              {canManageFirm && (
                <form onSubmit={handleInviteMember} className="glass-record rounded-xl p-4 space-y-3 mb-3">
                  <Input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="team.member@example.com" required disabled={inviting} />
                  <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as FirmRole)} disabled={inviting} className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm">
                    {INVITABLE_FIRM_ROLES.map((role) => <option key={role} value={role}>{role.replace('_', ' ')}</option>)}
                  </select>
                  <GlassButton type="submit" variant="solid" size="sm" className="w-full" disabled={inviting}>{inviting ? 'Creating invite...' : 'Create invite'}</GlassButton>
                </form>
              )}
              {loading && <p className="text-xs text-foreground-muted italic py-4 text-center">Loading invitations...</p>}
              {!loading && invites.map((invite) => (
                <div key={invite.id} className="glass-record rounded-xl p-3 mb-2">
                  <p className="text-sm font-bold">{invite.email}</p>
                  <p className="text-xs text-foreground-muted mt-1">Role: {invite.role}</p>
                </div>
              ))}
              {!loading && invites.length === 0 && <p className="text-xs text-foreground-muted italic py-4 text-center">No pending invitations.</p>}
            </DashboardSection>

            <DashboardSection title="Secure Sharing" icon={<ShieldCheck size={18} aria-hidden="true" />}>
              <p className="text-sm text-foreground-muted leading-relaxed">Firm membership never grants blanket project access. Projects must be explicitly linked and enabled.</p>
            </DashboardSection>
          </div>
        </div>
      </main>
    </div>
  );
}

