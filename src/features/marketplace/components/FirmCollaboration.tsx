import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Building2,
  Plus,
  Users,
  Calendar,
  DollarSign,
  UserPlus,
  CheckCircle2,
  Star,
  Clock,
  Shield,
} from 'lucide-react';
import type { UserProfile } from '@/types';
import type {
  FirmCollaborationPosting,
  CollaborationMember,
  CollaborationInvite,
} from '../types';
import { apiFetch } from '@/lib/apiClient';

interface FirmCollaborationProps {
  user: UserProfile;
}

function formatCurrency(amount: number): string {
  return `R ${amount.toLocaleString('en-ZA')}`;
}

function getCollabStatusColor(status: string): string {
  switch (status) {
    case 'published': return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'draft': return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    case 'in_progress': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    case 'completed': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    case 'cancelled': return 'bg-red-500/20 text-red-400 border-red-500/30';
    default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
  }
}

export default function FirmCollaboration({ user }: FirmCollaborationProps) {
  const [activeTab, setActiveTab] = useState('postings');
  const [_collaborations, setCollaborations] = useState<FirmCollaborationPosting[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/marketplace/collaborations')
      .then((r) => {
        if (r.status === 501) return null;
        return r.json();
      })
      .then((d) => {
        if (d && d.collaborations) setCollaborations(d.collaborations);
      })
      .catch(() => { /* no fallback */ })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 className="h-5 w-5 text-primary-400" />
          <h2 className="text-2xl font-bold text-white">Firm Collaboration Hub</h2>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Post Collaboration
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="postings">Collaborations</TabsTrigger>
          <TabsTrigger value="invitations">Team Invitations</TabsTrigger>
          <TabsTrigger value="complete">Completion & Rating</TabsTrigger>
        </TabsList>

        {/* Collaboration Postings */}
        <TabsContent value="postings">
          {loading ? (
            <div className="flex items-center justify-center min-h-[200px]"><p className="text-surface-400 text-sm">Loading...</p></div>
          ) : _collaborations.length === 0 ? (
            <div className="flex items-center justify-center min-h-[200px]"><p className="text-surface-400 text-sm">No collaborations found</p></div>
          ) : (
          <div className="space-y-4">
            {_collaborations.map((collab) => (
              <Card key={collab.id} className="bg-surface-800/70 backdrop-blur border-surface-700/50">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-semibold text-white">{collab.title}</h3>
                        <Badge className={getCollabStatusColor(collab.status)}>
                          {collab.status.replace('_', ' ')}
                        </Badge>
                      </div>
                      <p className="text-sm text-surface-300 line-clamp-2">{collab.description}</p>

                      <div className="flex flex-wrap gap-4 text-xs text-surface-400">
                        <span className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          Team size: {collab.teamSize}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {new Date(collab.timeline.startDate).toLocaleDateString('en-ZA')} – {new Date(collab.timeline.endDate).toLocaleDateString('en-ZA')}
                        </span>
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3.5 w-3.5" />
                          {formatCurrency(Object.values(collab.budgetPerRole).reduce<number>((a, b) => a + (b as number), 0))} total budget
                        </span>
                      </div>

                      {/* Disciplines */}
                      <div className="flex flex-wrap gap-2">
                        {collab.requiredDisciplines.map((disc) => (
                          <Badge key={disc} variant="outline" className="text-xs border-surface-600 text-surface-300">
                            {disc}
                          </Badge>
                        ))}
                      </div>

                      {/* Budget breakdown */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        {Object.entries(collab.budgetPerRole).map(([role, amount]) => (
                          <div key={role} className="p-2 rounded bg-surface-900/30 border border-surface-700/20">
                            <p className="text-xs text-surface-400">{role}</p>
                            <p className="text-sm font-medium text-white">{formatCurrency(amount as number)}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <Button variant="outline" size="sm">
                      View Details
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          )}
        </TabsContent>

        {/* Team Invitations */}
        <TabsContent value="invitations">
          <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
            <CardHeader>
              <CardTitle className="text-white text-base">Team Member Invitation Panel</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Invite form */}
              <div className="p-4 rounded-lg bg-surface-900/50 border border-surface-700/30 space-y-3">
                <p className="text-xs uppercase tracking-wider text-surface-400">Invite Professional</p>
                <div className="flex gap-2">
                  <Input
                    placeholder="Search by name or registration number..."
                    className="bg-surface-900/50 border-surface-700/50 flex-1"
                  />
                  <Button size="sm" className="gap-1.5">
                    <UserPlus className="h-3.5 w-3.5" />
                    Send Invite
                  </Button>
                </div>
                <p className="text-xs text-surface-500">
                  Only professionals with Trust Score ≥ 75 and active registration can be invited.
                </p>
              </div>

              {/* Current team */}
              <div>
                <p className="text-xs uppercase tracking-wider text-surface-400 mb-2">Current Team Members</p>
                <div className="space-y-2">
                  {(_collaborations[0]?.teamMembers || []).map((member) => (
                    <div key={member.userId} className="flex items-center justify-between p-3 rounded-lg bg-surface-900/50 border border-surface-700/30">
                      <div className="flex items-center gap-3">
                        <Shield className="h-4 w-4 text-primary-400" />
                        <div>
                          <p className="text-sm font-medium text-white">{member.role}</p>
                          <p className="text-xs text-surface-400">
                            Invited {new Date(member.invitedAt).toLocaleDateString('en-ZA')}
                          </p>
                        </div>
                      </div>
                      <Badge className={member.acceptedAt
                        ? 'bg-green-500/20 text-green-400 border-green-500/30'
                        : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                      }>
                        {member.acceptedAt ? 'Accepted' : 'Pending'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Completion & Rating */}
        <TabsContent value="complete">
          <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
            <CardHeader>
              <CardTitle className="text-white text-base">Completion & Rating Panel</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-surface-400">
                When a collaboration is marked complete, Trust Scores are recalculated for all participants and you can rate each team member.
              </p>

              <div className="space-y-3">
                <div className="p-4 rounded-lg bg-surface-900/50 border border-surface-700/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-white">Lead Architect</p>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className="h-4 w-4 text-amber-400 cursor-pointer"
                          fill={star <= 4 ? 'currentColor' : 'none'}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="p-4 rounded-lg bg-surface-900/50 border border-surface-700/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-white">Structural Engineer</p>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className="h-4 w-4 text-surface-500 cursor-pointer"
                          fill="none"
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button className="gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Mark Complete & Submit Ratings
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
