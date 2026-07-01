import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Briefcase,
  Plus,
  MapPin,
  Calendar,
  DollarSign,
  Wrench,
  FileText,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import type { UserProfile } from '@/types';
import type {
  ProjectPosting,
  ProjectProposal,
  ProjectPostingStatus,
} from '../types';

interface ProjectMarketplaceProps {
  user: UserProfile;
}

const mockPostings: ProjectPosting[] = [
  {
    id: 'proj-1',
    clientId: 'client-1',
    tenantId: 'client-1',
    title: 'Residential Development — Sandton Phase 2',
    description: 'Full architectural services for a 24-unit residential complex including structural, MEP, and compliance.',
    location: 'Sandton, Johannesburg',
    municipality: 'City of Johannesburg',
    budgetRange: { min: 2500000, max: 4800000 },
    sansReferences: ['SANS 10400-K', 'SANS 10400-N', 'SANS 10400-XA'],
    requiredTools: ['wall-compliance-checker', 'fenestration-analyser'],
    expiryDate: '2026-08-15T00:00:00.000Z',
    status: 'published',
    createdAt: '2026-06-01T09:00:00.000Z',
    updatedAt: '2026-06-01T09:00:00.000Z',
  },
  {
    id: 'proj-2',
    clientId: 'client-2',
    tenantId: 'client-2',
    title: 'Commercial Office Fit-Out — Cape Town CBD',
    description: 'Interior architecture and compliance sign-off for a 3-floor office conversion.',
    location: 'Cape Town CBD',
    municipality: 'City of Cape Town',
    budgetRange: { min: 800000, max: 1500000 },
    sansReferences: ['SANS 10400-T', 'SANS 10400-S'],
    requiredTools: ['fire-safety-analyser'],
    expiryDate: '2026-07-30T00:00:00.000Z',
    status: 'published',
    createdAt: '2026-06-10T09:00:00.000Z',
    updatedAt: '2026-06-10T09:00:00.000Z',
  },
];

const mockProposal: ProjectProposal = {
  id: 'prop-1',
  postingId: 'proj-1',
  professionalId: 'prof-1',
  registrationNumber: 'SACAP-2024-1234',
  cpdPointsEarned: 42,
  cpdPointsRequired: 25,
  trustScore: 88,
  toolUsageHistory: { 'wall-compliance-checker': 15, 'fenestration-analyser': 8 },
  recentProjects: [
    { projectId: 'rp-1', title: 'Rosebank Mixed-Use', completedAt: '2026-03-15', rating: 4.8 },
    { projectId: 'rp-2', title: 'Pretoria Office Park', completedAt: '2026-01-20', rating: 4.5 },
  ],
  feeAmount: 3200000,
  milestonePlan: [
    { title: 'Concept Design', targetDate: '2026-07-01T00:00:00.000Z', amount: 640000 },
    { title: 'Developed Design', targetDate: '2026-08-15T00:00:00.000Z', amount: 960000 },
    { title: 'Technical Documentation', targetDate: '2026-10-01T00:00:00.000Z', amount: 960000 },
    { title: 'Construction Monitoring', targetDate: '2027-01-15T00:00:00.000Z', amount: 640000 },
  ],
  status: 'submitted',
  createdAt: '2026-06-05T10:30:00.000Z',
};

function formatCurrency(amount: number): string {
  return `R ${amount.toLocaleString('en-ZA')}`;
}

function getStatusColor(status: ProjectPostingStatus): string {
  switch (status) {
    case 'published': return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'draft': return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    case 'accepted': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    case 'expired': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    case 'withdrawn': return 'bg-red-500/20 text-red-400 border-red-500/30';
  }
}

export default function ProjectMarketplace({ user }: ProjectMarketplaceProps) {
  const [activeTab, setActiveTab] = useState('listings');
  const [_postings] = useState<ProjectPosting[]>(mockPostings);
  const [_selectedProposal] = useState<ProjectProposal | null>(mockProposal);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Briefcase className="h-5 w-5 text-primary-400" />
          <h2 className="text-2xl font-bold text-white">Project Marketplace</h2>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Post Project
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="listings">Active Listings</TabsTrigger>
          <TabsTrigger value="proposals">Proposals</TabsTrigger>
          <TabsTrigger value="my-projects">My Projects</TabsTrigger>
        </TabsList>

        {/* Active Listings */}
        <TabsContent value="listings">
          <div className="space-y-4">
            {_postings.map((posting) => (
              <Card key={posting.id} className="bg-surface-800/70 backdrop-blur border-surface-700/50">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-semibold text-white">{posting.title}</h3>
                        <Badge className={getStatusColor(posting.status)}>
                          {posting.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-surface-300 line-clamp-2">{posting.description}</p>

                      <div className="flex flex-wrap gap-4 text-xs text-surface-400">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {posting.location}
                        </span>
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3.5 w-3.5" />
                          {formatCurrency(posting.budgetRange.min)} – {formatCurrency(posting.budgetRange.max)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          Expires {new Date(posting.expiryDate).toLocaleDateString('en-ZA')}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {posting.sansReferences.map((ref) => (
                          <Badge key={ref} variant="outline" className="text-xs border-surface-600 text-surface-300">
                            {ref}
                          </Badge>
                        ))}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {posting.requiredTools.map((tool) => (
                          <Badge key={tool} variant="outline" className="text-xs border-primary-700/50 text-primary-400">
                            <Wrench className="h-3 w-3 mr-1" />
                            {tool}
                          </Badge>
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
        </TabsContent>

        {/* Proposals */}
        <TabsContent value="proposals">
          {_selectedProposal && (
            <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary-400" />
                  Proposal — Pre-filled Compliance Data
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Compliance summary */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-3 rounded-lg bg-surface-900/50 border border-surface-700/30">
                    <p className="text-xs uppercase tracking-wider text-surface-400 mb-1">Registration</p>
                    <p className="text-sm font-medium text-white">{_selectedProposal.registrationNumber}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-surface-900/50 border border-surface-700/30">
                    <p className="text-xs uppercase tracking-wider text-surface-400 mb-1">Trust Score</p>
                    <p className="text-sm font-medium text-white">{_selectedProposal.trustScore}/100</p>
                  </div>
                  <div className="p-3 rounded-lg bg-surface-900/50 border border-surface-700/30">
                    <p className="text-xs uppercase tracking-wider text-surface-400 mb-1">CPD Status</p>
                    <p className="text-sm font-medium text-green-400">
                      <CheckCircle2 className="h-3.5 w-3.5 inline mr-1" />
                      {_selectedProposal.cpdPointsEarned}/{_selectedProposal.cpdPointsRequired} points
                    </p>
                  </div>
                </div>

                {/* Tool usage */}
                <div>
                  <p className="text-xs uppercase tracking-wider text-surface-400 mb-2">Tool Usage History</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(_selectedProposal.toolUsageHistory).map(([tool, count]) => (
                      <Badge key={tool} variant="outline" className="text-xs border-surface-600 text-surface-300">
                        <Wrench className="h-3 w-3 mr-1" />
                        {tool}: {count} uses
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Milestone plan */}
                <div>
                  <p className="text-xs uppercase tracking-wider text-surface-400 mb-2">Milestone Plan</p>
                  <div className="space-y-2">
                    {_selectedProposal.milestonePlan.map((milestone, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 rounded bg-surface-900/30 border border-surface-700/20">
                        <div className="flex items-center gap-2">
                          <Clock className="h-3.5 w-3.5 text-surface-400" />
                          <span className="text-sm text-white">{milestone.title}</span>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-surface-400">
                          <span>{new Date(milestone.targetDate).toLocaleDateString('en-ZA')}</span>
                          <span className="font-medium text-primary-400">{formatCurrency(milestone.amount)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <Button className="gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    Accept Proposal
                  </Button>
                  <Button variant="outline">Reject</Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* My Projects */}
        <TabsContent value="my-projects">
          <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
            <CardContent className="p-8 text-center">
              <Briefcase className="h-10 w-10 text-surface-500 mx-auto mb-3" />
              <p className="text-surface-400">
                {user.role === 'client'
                  ? 'Your posted projects will appear here.'
                  : 'Projects you have applied to will appear here.'}
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
