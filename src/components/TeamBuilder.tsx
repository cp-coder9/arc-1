import React, { useMemo, useState } from 'react';
import { Search, Send, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Input } from './ui/input';
import { DISCIPLINE_REGISTRY, Discipline, Job, Project, ProjectTeamMember, UserProfile } from '../types';
import { inviteTeamMember, removeTeamMember } from '../services/teamService';

interface TeamBuilderProps {
  job: Job;
  project: Project | null;
  teamMembers: ProjectTeamMember[];
  professionals: UserProfile[];
  currentUser: UserProfile;
}

export default function TeamBuilder({ job, project, teamMembers, professionals, currentUser }: TeamBuilderProps) {
  const [query, setQuery] = useState('');
  const [selectedDiscipline, setSelectedDiscipline] = useState<Discipline | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const relevantDisciplines = useMemo(
    () => DISCIPLINE_REGISTRY.filter((discipline) => discipline.requiredFor.includes(job.category)),
    [job.category]
  );

  const usersById = useMemo(() => new Map(professionals.map((profile) => [profile.uid, profile])), [professionals]);
  const canManageTeam = Boolean(project?.leadArchitectId === currentUser.uid);
  const normalisedQuery = query.trim().toLowerCase();

  const filteredProfessionals = professionals.filter((professional) => {
    if (!normalisedQuery) return true;
    const searchable = [
      professional.displayName,
      professional.email,
      professional.role,
      professional.professionalLabel,
      ...(professional.professionalLabels ?? []),
    ].filter(Boolean).join(' ').toLowerCase();
    return searchable.includes(normalisedQuery);
  });

  const invite = async (userId: string) => {
    if (!project || !selectedDiscipline) return;
    setIsSubmitting(true);
    try {
      await inviteTeamMember(project.id, userId, selectedDiscipline, currentUser.uid);
      toast.success('Invitation sent');
      setSelectedDiscipline(null);
      setQuery('');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to send invitation');
    } finally {
      setIsSubmitting(false);
    }
  };

  const remove = async (userId: string) => {
    if (!project) return;
    try {
      await removeTeamMember(project.id, userId, currentUser.uid);
      toast.success('Team member removed');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to remove team member');
    }
  };

  return (
    <Card className="border-border shadow-sm bg-white rounded-3xl">
      <CardHeader className="p-6 border-b border-border">
        <CardTitle className="text-xl font-heading font-bold flex items-center gap-2">
          <Users className="text-primary" size={20} /> Team Builder
        </CardTitle>
        <CardDescription>
          Invite registered professionals and track pending coverage for {job.category} delivery.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {relevantDisciplines.map((discipline) => {
            const member = teamMembers.find((item) => item.discipline === discipline.key && item.status !== 'removed');
            const profile = member ? usersById.get(member.userId) : undefined;
            const statusBadge = member?.status === 'active'
              ? <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100">Assigned</Badge>
              : member?.status === 'invited'
                ? <Badge variant="secondary">Pending</Badge>
                : <Badge variant="outline" className="border-dashed">Open</Badge>;

            return (
              <div key={discipline.key} className="rounded-2xl border border-border p-4 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-bold">{discipline.label}</p>
                    <p className="text-xs text-muted-foreground">{discipline.sacapCategory}</p>
                  </div>
                  {statusBadge}
                </div>
                {member ? (
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-secondary/30 p-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="h-9 w-9"><AvatarFallback>{(profile?.displayName || member.userId).slice(0, 1).toUpperCase()}</AvatarFallback></Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">{profile?.displayName || member.userId}</p>
                        <p className="truncate text-xs text-muted-foreground">{profile?.email || member.role}</p>
                      </div>
                    </div>
                    {canManageTeam && member.userId !== project?.leadArchitectId && (
                      <Button variant="ghost" size="icon-sm" onClick={() => remove(member.userId)} aria-label="Remove team member">
                        <X size={14} />
                      </Button>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No professional assigned yet.</p>
                )}
                {canManageTeam && (
                  <Dialog open={selectedDiscipline === discipline.key} onOpenChange={(open) => setSelectedDiscipline(open ? discipline.key : null)}>
                    <DialogTrigger render={<Button variant={member ? 'outline' : 'default'} size="sm" className="rounded-full gap-2"><Send size={14} /> {member ? 'Invite alternate' : 'Invite'}</Button>} />
                    <DialogContent className="sm:max-w-2xl rounded-3xl">
                      <DialogHeader>
                        <DialogTitle>Invite {discipline.label}</DialogTitle>
                        <DialogDescription>Search registered professionals and send a project invitation.</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, email, or professional label" className="h-11 rounded-xl pl-9" />
                        </div>
                        <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
                          {filteredProfessionals.map((professional) => (
                            <button
                              key={professional.uid}
                              type="button"
                              disabled={isSubmitting}
                              onClick={() => invite(professional.uid)}
                              className="w-full rounded-2xl border border-border p-3 text-left hover:bg-primary/5 hover:border-primary/30 disabled:opacity-50 transition-colors"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3 min-w-0">
                                  <Avatar><AvatarFallback>{professional.displayName.slice(0, 1).toUpperCase()}</AvatarFallback></Avatar>
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-bold">{professional.displayName}</p>
                                    <p className="truncate text-xs text-muted-foreground">{professional.email}</p>
                                  </div>
                                </div>
                                <Badge variant="outline" className="uppercase text-[10px]">{professional.role}</Badge>
                              </div>
                            </button>
                          ))}
                          {filteredProfessionals.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No registered users match your search.</p>}
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
