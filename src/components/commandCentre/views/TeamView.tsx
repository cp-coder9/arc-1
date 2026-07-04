'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, Users, Clock, BarChart3 } from 'lucide-react';

interface TeamViewProps {
  projectId: string;
}

interface TeamMember {
  id: string;
  name: string;
  role: string;
  firm: string;
  utilisation: number;
  hoursLogged: number;
  status: 'active' | 'part_time' | 'on_hold';
}

export default function TeamView({ projectId }: TeamViewProps) {
  const [members, setMembers] = useState<TeamMember[]>([]);

  useEffect(() => {
    void projectId;
  }, [projectId]);

  const totalMembers = members.length;
  const avgUtilisation = totalMembers > 0 ? Math.round(members.reduce((s, m) => s + m.utilisation, 0) / totalMembers) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Team & Resources</h2>
        <Button size="sm" className="gap-1">
          <Plus className="h-3.5 w-3.5" />
          Add Member
        </Button>
      </div>

      {/* Team Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary-400" />
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Total Members</p>
            </div>
            <p className="text-2xl font-bold mt-1">{totalMembers}</p>
          </CardContent>
        </Card>
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-green-400" />
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Avg Utilisation</p>
            </div>
            <p className="text-2xl font-bold mt-1">{avgUtilisation}%</p>
          </CardContent>
        </Card>
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-400" />
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Hours This Month</p>
            </div>
            <p className="text-2xl font-bold mt-1">0</p>
          </CardContent>
        </Card>
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="pt-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Pending Approvals</p>
            <p className="text-2xl font-bold mt-1">0</p>
          </CardContent>
        </Card>
      </div>

      {/* Team Register Table */}
      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
        <CardContent className="pt-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-700/50">
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Name</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Role</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Firm</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Utilisation</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Hours</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {members.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-muted-foreground">
                      No team members added
                    </td>
                  </tr>
                ) : (
                  members.map((member) => (
                    <tr key={member.id} className="border-b border-surface-700/30">
                      <td className="py-2 px-2 font-medium">{member.name}</td>
                      <td className="py-2 px-2 text-muted-foreground">{member.role}</td>
                      <td className="py-2 px-2 text-muted-foreground">{member.firm}</td>
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 rounded-full bg-surface-700/50">
                            <div
                              className={`h-full rounded-full ${member.utilisation > 90 ? 'bg-red-500' : 'bg-primary-500'}`}
                              style={{ width: `${Math.min(member.utilisation, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">{member.utilisation}%</span>
                        </div>
                      </td>
                      <td className="py-2 px-2 text-muted-foreground">{member.hoursLogged}h</td>
                      <td className="py-2 px-2">
                        <Badge variant="outline" className="text-xs capitalize">{member.status.replace(/_/g, ' ')}</Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
