'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, MessageSquare } from 'lucide-react';
import { useDemoMode } from '@/demo-context/DemoModeProvider';

interface RFIViewProps {
  projectId: string;
}

interface RFIItem {
  id: string;
  rfiNumber: string;
  subject: string;
  from: string;
  to: string;
  dateRaised: string;
  status: 'pending' | 'critical' | 'closed';
}

interface SiteInstruction {
  id: string;
  number: string;
  subject: string;
  issuer: string;
  recipient: string;
  date: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-500/20 text-amber-400 border-amber-500/50',
  critical: 'bg-red-500/20 text-red-400 border-red-500/50',
  closed: 'bg-green-500/20 text-green-400 border-green-500/50',
};

export default function RFIView({ projectId }: RFIViewProps) {
  const { isDemoMode } = useDemoMode();
  const [rfis, setRfis] = useState<RFIItem[]>([]);
  const [siteInstructions, setSiteInstructions] = useState<SiteInstruction[]>([]);

  if (!isDemoMode) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <p className="text-lg text-muted-foreground">No live data connected yet</p>
        <p className="text-sm text-muted-foreground mt-2">
          Data integration pending for project {projectId}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">RFIs & Site Instructions</h2>
        <Button size="sm" className="gap-1">
          <Plus className="h-3.5 w-3.5" />
          Raise RFI
        </Button>
      </div>

      {/* RFI Table */}
      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Active RFIs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-700/50">
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">RFI #</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Subject</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">From</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">To</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Date Raised</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rfis.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <MessageSquare className="h-8 w-8 opacity-40" />
                        <p>No RFIs raised</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  rfis.map((rfi) => (
                    <tr key={rfi.id} className="border-b border-surface-700/30">
                      <td className="py-2 px-2 font-mono text-xs">{rfi.rfiNumber}</td>
                      <td className="py-2 px-2 font-medium">{rfi.subject}</td>
                      <td className="py-2 px-2 text-muted-foreground">{rfi.from}</td>
                      <td className="py-2 px-2 text-muted-foreground">{rfi.to}</td>
                      <td className="py-2 px-2 text-muted-foreground">{rfi.dateRaised}</td>
                      <td className="py-2 px-2">
                        <Badge variant="outline" className={`text-xs ${STATUS_COLORS[rfi.status] ?? ''}`}>
                          {rfi.status}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Site Instructions Table */}
      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Site Instructions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-700/50">
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">SI #</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Subject</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Issuer</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Recipient</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {siteInstructions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-6 text-muted-foreground">
                      No site instructions issued
                    </td>
                  </tr>
                ) : (
                  siteInstructions.map((si) => (
                    <tr key={si.id} className="border-b border-surface-700/30">
                      <td className="py-2 px-2 font-mono text-xs">{si.number}</td>
                      <td className="py-2 px-2 font-medium">{si.subject}</td>
                      <td className="py-2 px-2 text-muted-foreground">{si.issuer}</td>
                      <td className="py-2 px-2 text-muted-foreground">{si.recipient}</td>
                      <td className="py-2 px-2 text-muted-foreground">{si.date}</td>
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
