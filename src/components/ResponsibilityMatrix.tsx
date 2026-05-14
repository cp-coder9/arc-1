import React, { useMemo, useState } from 'react';
import { CheckCircle2, Clock, UserPlus, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { DISCIPLINE_REGISTRY, Discipline, Job, Project, ProjectTeamMember, UserProfile } from '../types';
import { inviteTeamMember } from '../services/teamService';

interface ResponsibilityMatrixProps {
  job: Job;
  project: Project | null;
  teamMembers: ProjectTeamMember[];
  professionals: UserProfile[];
  currentUser: UserProfile;
}

export default function ResponsibilityMatrix({ job, project, teamMembers, professionals, currentUser }: ResponsibilityMatrixProps) {
  const [savingDiscipline, setSavingDiscipline] = useState<Discipline | null>(null);
  const relevantDisciplines = useMemo(
    () => DISCIPLINE_REGISTRY.filter((discipline) => discipline.requiredFor.includes(job.category)),
    [job.category]
  );

  const usersById = useMemo(() => new Map(professionals.map((profile) => [profile.uid, profile])), [professionals]);
  const canAssign = Boolean(project?.leadArchitectId === currentUser.uid);

  const handleAssign = async (discipline: Discipline, userId: string) => {
    if (!project || !userId) return;
    setSavingDiscipline(discipline);
    try {
      await inviteTeamMember(project.id, userId, discipline, currentUser.uid);
      toast.success('Team invitation sent');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to assign discipline');
    } finally {
      setSavingDiscipline(null);
    }
  };

  return (
    <Card className="border-border shadow-sm bg-white rounded-3xl">
      <CardHeader className="p-6 border-b border-border bg-primary/5">
        <CardTitle className="text-xl font-heading font-bold flex items-center gap-2">
          <CheckCircle2 className="text-primary" size={20} /> Responsibility Matrix
        </CardTitle>
        <CardDescription>
          Discipline responsibilities for {job.title} ({job.category}).
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-6 py-4">Discipline</TableHead>
              <TableHead className="px-6 py-4">Responsible party</TableHead>
              <TableHead className="px-6 py-4">Sign-off</TableHead>
              <TableHead className="px-6 py-4 text-right">Assignment</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {relevantDisciplines.map((discipline) => {
              const member = teamMembers.find((item) => item.discipline === discipline.key && item.status !== 'removed');
              const profile = member ? usersById.get(member.userId) : undefined;
              const isActive = member?.status === 'active';
              const isInvited = member?.status === 'invited';

              return (
                <TableRow key={discipline.key}>
                  <TableCell className="px-6 py-4">
                    <div>
                      <p className="font-bold">{discipline.label}</p>
                      <p className="text-xs text-muted-foreground">{discipline.sacapCategory}</p>
                    </div>
                  </TableCell>
                  <TableCell className="px-6 py-4">
                    {member ? (
                      <div>
                        <p className="text-sm font-semibold">{profile?.displayName || member.userId}</p>
                        <p className="text-xs text-muted-foreground">{profile?.email || member.role}</p>
                      </div>
                    ) : (
                      <Badge variant="outline" className="border-dashed text-muted-foreground">Unassigned</Badge>
                    )}
                  </TableCell>
                  <TableCell className="px-6 py-4">
                    {isActive ? (
                      <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100"><CheckCircle2 size={12} className="mr-1" /> Ready</Badge>
                    ) : isInvited ? (
                      <Badge variant="secondary"><Clock size={12} className="mr-1" /> Pending</Badge>
                    ) : (
                      <Badge variant="destructive"><AlertCircle size={12} className="mr-1" /> Required</Badge>
                    )}
                  </TableCell>
                  <TableCell className="px-6 py-4 text-right">
                    {canAssign ? (
                      <select
                        value=""
                        disabled={!project || savingDiscipline === discipline.key}
                        onChange={(event) => handleAssign(discipline.key, event.target.value)}
                        className="h-9 rounded-xl border border-border bg-white px-3 text-xs font-bold uppercase tracking-widest outline-none"
                        aria-label={`Assign ${discipline.label}`}
                      >
                        <option value="">{member ? 'Reassign' : 'Assign'}</option>
                        {professionals.map((professional) => (
                          <option key={professional.uid} value={professional.uid}>{professional.displayName} — {professional.role}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs text-muted-foreground">Lead architect only</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {relevantDisciplines.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <UserPlus className="mx-auto mb-3 text-muted-foreground" /> No discipline requirements configured for this project category.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
