import React, { useEffect, useState } from 'react';
import { Firm, FirmMember, FirmInvite, FirmRole, Project, UserProfile } from '@/types';
import { inviteFirmMember, subscribeToFirm, subscribeToFirmInvites, subscribeToFirmMembers, subscribeToFirmProjects } from '@/services/firmService';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Building2, FolderKanban, Mail, ShieldCheck, UserPlus, Users } from 'lucide-react';

const INVITABLE_FIRM_ROLES: FirmRole[] = ['admin', 'coordinator', 'staff', 'billing_viewer'];

export default function FirmDashboard({ user }: { user: UserProfile }) {
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
      <div className="space-y-8">
        <Card className="border-border shadow-sm bg-card rounded-[2.5rem] overflow-hidden">
          <CardHeader className="p-10 bg-primary/5 border-b border-border">
            <CardTitle className="font-heading text-3xl flex items-center gap-3"><Building2 className="text-primary" /> Firm Workspace</CardTitle>
            <CardDescription>Firm workspace access is available after an owner creates a firm or invites you.</CardDescription>
          </CardHeader>
          <CardContent className="p-10">
            <div className="rounded-3xl border border-dashed border-border bg-secondary/30 p-10 text-center">
              <Users className="mx-auto h-12 w-12 text-primary mb-4" />
              <p className="text-muted-foreground">No active firm membership is linked to this profile yet.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      <div className="dashboard-header flex flex-col lg:flex-row lg:items-end justify-between gap-8">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <div className="h-14 w-14 rounded-3xl bg-primary/10 text-primary flex items-center justify-center shadow-sm">
              <Building2 className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-3xl md:text-5xl font-heading font-bold tracking-tighter text-foreground">{firm?.name || 'Firm Workspace'}</h1>
              <p className="text-muted-foreground text-base md:text-lg max-w-2xl mt-2 leading-relaxed">Members, invitations, and explicitly linked project access.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 mt-5">
            <Badge variant="outline" className="rounded-full px-4 py-1.5 bg-primary/5 text-primary border-primary/10 font-bold uppercase tracking-widest text-[10px]">
              {user.firmRole || 'member'}
            </Badge>
            <Badge variant="outline" className="rounded-full px-4 py-1.5 bg-secondary/50 text-muted-foreground border-border font-bold uppercase tracking-widest text-[10px]">
              Access: {user.firmStatus || 'active'}
            </Badge>
          </div>
        </div>
        <Button className="rounded-full h-12 px-6 font-bold" disabled={!canManageFirm} title={canManageFirm ? 'Use the invite panel to add verified firm members' : 'Only firm owners and admins can invite members'}>
          <UserPlus className="mr-2 h-4 w-4" /> Invite member
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard label="Active Members" value={members.filter((member) => member.status === 'active').length} icon={<Users size={20} />} />
        <StatCard label="Pending Invites" value={invites.length} icon={<Mail size={20} />} tone="accent" />
        <StatCard label="Linked Projects" value={projects.length} icon={<FolderKanban size={20} />} tone="success" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8">
        <Card className="border-border shadow-sm bg-card rounded-[2.5rem] overflow-hidden">
          <CardHeader className="p-8 border-b border-border bg-primary/5">
            <CardTitle className="font-heading text-2xl flex items-center gap-2"><Users className="text-primary" /> Members</CardTitle>
            <CardDescription>Verified active firm memberships and role-scoped access.</CardDescription>
          </CardHeader>
          <CardContent className="p-8 space-y-4">
            {loading && <p className="text-muted-foreground italic">Loading firm workspace...</p>}
            {!loading && members.map((member) => (
              <div key={member.userId} className="rounded-3xl border border-border bg-white p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                    {(member.displayName || member.email || 'U')[0]}
                  </div>
                  <div>
                    <p className="font-bold">{member.displayName || member.email}</p>
                    <p className="text-xs text-muted-foreground">{member.email}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Badge variant="outline" className="uppercase text-[10px] tracking-widest">{member.role}</Badge>
                  <Badge variant={member.status === 'active' ? 'secondary' : 'outline'} className="uppercase text-[10px] tracking-widest">{member.status}</Badge>
                </div>
              </div>
            ))}
            {!loading && members.length === 0 && <p className="text-muted-foreground italic">No active firm members found.</p>}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-border shadow-sm bg-card rounded-3xl overflow-hidden">
            <CardHeader className="p-6 border-b border-border bg-secondary/30">
              <CardTitle className="text-sm font-bold uppercase tracking-widest flex items-center gap-2"><Mail size={16} /> Pending Invites</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-3">
              {canManageFirm && (
                <form onSubmit={handleInviteMember} className="rounded-2xl border border-border bg-white p-4 space-y-3">
                  <Input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="team.member@example.com" required disabled={inviting} />
                  <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as FirmRole)} disabled={inviting} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm">
                    {INVITABLE_FIRM_ROLES.map((role) => <option key={role} value={role}>{role.replace('_', ' ')}</option>)}
                  </select>
                  <Button type="submit" size="sm" className="w-full rounded-full" disabled={inviting}>{inviting ? 'Creating invite...' : 'Create invite'}</Button>
                </form>
              )}
              {loading && <p className="text-xs text-muted-foreground italic py-6 text-center">Loading invitations...</p>}
              {!loading && invites.map((invite) => (
                <div key={invite.id} className="rounded-2xl border border-border p-4 bg-white">
                  <p className="text-sm font-bold">{invite.email}</p>
                  <p className="text-xs text-muted-foreground mt-1">Role: {invite.role}</p>
                </div>
              ))}
              {!loading && invites.length === 0 && <p className="text-xs text-muted-foreground italic py-6 text-center">No pending invitations.</p>}
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm bg-primary text-primary-foreground rounded-3xl overflow-hidden">
            <CardHeader className="p-8">
              <CardTitle className="font-heading text-2xl flex items-center gap-2"><ShieldCheck /> Secure sharing</CardTitle>
              <CardDescription className="text-primary-foreground/75">Firm membership never grants blanket project access. Projects must be explicitly linked and enabled.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, tone = 'default' }: { label: string; value: string | number; icon: React.ReactNode; tone?: 'default' | 'accent' | 'success' }) {
  const toneClass = {
    default: 'bg-primary/10 text-primary',
    accent: 'bg-accent/10 text-primary',
    success: 'bg-primary-light/10 text-primary-light',
  }[tone];

  return (
    <Card className="interactive-card border-border shadow-sm bg-card rounded-[2rem] overflow-hidden">
      <CardContent className="p-8 flex items-center gap-6">
        <div className={`p-4 rounded-2xl ${toneClass}`}>{icon}</div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
          <p className="text-3xl font-heading font-bold tracking-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
