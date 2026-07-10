import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  User,
  Edit,
  Star,
  Shield,
  Clock,
  CheckCircle2,
  AlertCircle,
  Wrench,
  Award,
  TrendingUp,
} from 'lucide-react';
import type { UserProfile } from '@/types';
import type { FreelancerProfile, FreelancerProfileView, TaskHistoryEntry } from '../types';
import { apiFetch } from '@/lib/apiClient';

interface FreelancerHubProps {
  user: UserProfile;
}

function getAvailabilityColor(availability: string): string {
  switch (availability) {
    case 'available': return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'partially_available': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    case 'unavailable': return 'bg-red-500/20 text-red-400 border-red-500/30';
    default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
  }
}

function renderStars(rating: number): string {
  return '★'.repeat(Math.round(rating)) + '☆'.repeat(5 - Math.round(rating));
}

export default function FreelancerHub({ user }: FreelancerHubProps) {
  const [activeTab, setActiveTab] = useState('profile');
  const [_profile, setProfile] = useState<FreelancerProfileView | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`/api/marketplace/freelancer-profile/${user.uid}`)
      .then((r) => r.json())
      .then((d) => {
        if (d && d.profile) setProfile(d);
      })
      .catch(() => { /* no fallback */ })
      .finally(() => setLoading(false));
  }, [user.uid]);

  if (loading) {
    return <div className="flex items-center justify-center min-h-[200px]"><p className="text-surface-400 text-sm">Loading...</p></div>;
  }

  if (!_profile) {
    return <div className="flex items-center justify-center min-h-[200px]"><p className="text-surface-400 text-sm">No profile found</p></div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <User className="h-5 w-5 text-primary-400" />
          <h2 className="text-2xl font-bold text-white">Freelancer Hub</h2>
        </div>
        <Button variant="outline" className="gap-2">
          <Edit className="h-4 w-4" />
          Edit Profile
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="profile">My Profile</TabsTrigger>
          <TabsTrigger value="edit">Edit Profile</TabsTrigger>
          <TabsTrigger value="history">Task History</TabsTrigger>
        </TabsList>

        {/* Profile View */}
        <TabsContent value="profile">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Profile Card */}
            <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50 lg:col-span-2">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-white">{user.displayName}</h3>
                    <p className="text-sm text-surface-400">{user.role} · {_profile.profile.yearsExperience} years experience</p>
                  </div>
                  <Badge className={getAvailabilityColor(_profile.profile.availability)}>
                    {_profile.profile.availability.replace('_', ' ')}
                  </Badge>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3 rounded-lg bg-surface-900/50 border border-surface-700/30 text-center">
                    <Shield className="h-4 w-4 text-primary-400 mx-auto mb-1" />
                    <p className="text-lg font-bold text-white">{_profile.profile.trustScore}</p>
                    <p className="text-xs text-surface-400">Trust Score</p>
                  </div>
                  <div className="p-3 rounded-lg bg-surface-900/50 border border-surface-700/30 text-center">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mx-auto mb-1" />
                    <p className="text-lg font-bold text-white">{_profile.profile.completedTaskCount}</p>
                    <p className="text-xs text-surface-400">Tasks Done</p>
                  </div>
                  <div className="p-3 rounded-lg bg-surface-900/50 border border-surface-700/30 text-center">
                    <Star className="h-4 w-4 text-amber-400 mx-auto mb-1" />
                    <p className="text-lg font-bold text-white">{_profile.profile.averageRating.toFixed(1)}</p>
                    <p className="text-xs text-surface-400">Avg Rating</p>
                  </div>
                  <div className="p-3 rounded-lg bg-surface-900/50 border border-surface-700/30 text-center">
                    <TrendingUp className="h-4 w-4 text-emerald-400 mx-auto mb-1" />
                    <p className="text-lg font-bold text-white">{_profile.aiAuditPassRate}%</p>
                    <p className="text-xs text-surface-400">AI Audit Pass</p>
                  </div>
                </div>

                {/* Skills */}
                <div>
                  <p className="text-xs uppercase tracking-wider text-surface-400 mb-2">Skills & Tools</p>
                  <div className="flex flex-wrap gap-2">
                    {_profile.profile.skills.map((skill) => (
                      <Badge key={skill.toolId} variant="outline" className="text-xs border-primary-700/50 text-primary-400">
                        <Wrench className="h-3 w-3 mr-1" />
                        {skill.label}
                        {_profile.toolUsageFrequency[skill.toolId] && (
                          <span className="ml-1 text-surface-500">
                            ({_profile.toolUsageFrequency[skill.toolId]} uses)
                          </span>
                        )}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Badges */}
                {_profile.profile.badges.length > 0 && (
                  <div>
                    <p className="text-xs uppercase tracking-wider text-surface-400 mb-2">Badges</p>
                    <div className="flex gap-2">
                      {_profile.profile.badges.map((badge) => (
                        <Badge key={badge} className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                          <Award className="h-3 w-3 mr-1" />
                          {badge === 'top_10_percent' ? 'Top 10%' : badge}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* CPD Status Card */}
            <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-surface-300">CPD Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  {_profile.profile.cpdStatus === 'compliant' ? (
                    <CheckCircle2 className="h-5 w-5 text-green-400" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-red-400" />
                  )}
                  <span className={`text-sm font-medium ${_profile.profile.cpdStatus === 'compliant' ? 'text-green-400' : 'text-red-400'}`}>
                    {_profile.profile.cpdStatus === 'compliant' ? 'Compliant' : 'Non-Compliant'}
                  </span>
                </div>
                {_profile.profile.cpdStatus !== 'compliant' && (
                  <p className="text-xs text-surface-400">
                    New task applications are blocked until CPD compliance is restored.
                  </p>
                )}
                <div className="pt-2 border-t border-surface-700/30">
                  <p className="text-xs text-surface-400 mb-1">Dispute History</p>
                  {_profile.disputeHistory.length === 0 ? (
                    <p className="text-xs text-surface-500">No disputes on record</p>
                  ) : (
                    <p className="text-xs text-surface-300">{_profile.disputeHistory.length} dispute(s)</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Edit Profile */}
        <TabsContent value="edit">
          <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
            <CardHeader>
              <CardTitle className="text-white text-base">Edit Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-wider text-surface-400">Availability</label>
                  <Input
                    className="bg-surface-900/50 border-surface-700/50"
                    defaultValue="Available"
                    readOnly
                    placeholder="Select availability..."
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-wider text-surface-400">Years Experience</label>
                  <Input
                    type="number"
                    className="bg-surface-900/50 border-surface-700/50"
                    defaultValue={_profile.profile.yearsExperience}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wider text-surface-400">Skills (linked to tools)</label>
                <div className="flex flex-wrap gap-2">
                  {_profile.profile.skills.map((skill) => (
                    <Badge key={skill.toolId} variant="outline" className="text-xs border-surface-600 text-surface-300">
                      {skill.label}
                    </Badge>
                  ))}
                  <Button variant="outline" size="sm" className="h-6 text-xs">
                    + Add Skill
                  </Button>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <Button>Save Changes</Button>
                <Button variant="outline">Cancel</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Task History */}
        <TabsContent value="history">
          <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
            <CardHeader>
              <CardTitle className="text-white text-base">Completed Tasks</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {_profile.profile.taskHistory.map((entry) => (
                  <div
                    key={entry.taskId}
                    className="flex items-center justify-between p-3 rounded-lg bg-surface-900/50 border border-surface-700/30"
                  >
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="h-4 w-4 text-green-400" />
                      <div>
                        <p className="text-sm font-medium text-white">{entry.title}</p>
                        <p className="text-xs text-surface-400">
                          <Clock className="h-3 w-3 inline mr-1" />
                          {new Date(entry.completedAt).toLocaleDateString('en-ZA')}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm text-amber-400">{renderStars(entry.rating)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
