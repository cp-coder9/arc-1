import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CalendarDays, Camera, CheckCircle2, ClipboardCheck,
  Clock, FileWarning, Loader2, MessageSquarePlus, Plus, ShieldAlert,
  Wrench, Hammer, Lightbulb, Activity,
} from 'lucide-react';
import { toast } from 'sonner';
import type { UserProfile } from '@/types';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import SiteLogManager from './SiteLogManager';
import RFIManager from './RFIManager';
import { subscribeToNcrs } from '@/services/ncrService';
import { subscribeToSnags } from '@/services/snagService';
import { subscribeToDelayWarnings } from '@/services/delayWarningService';
import { subscribeToSiteInstructions } from '@/services/siteInstructionService';
import { subscribeToEvidence } from '@/services/fieldEvidenceService';
import { subscribeToPaymentBlockers } from '@/services/paymentBlockerService';
import { subscribeToRecommendations } from '@/services/agentRecommendationService';
import { subscribeToProjectRecords } from '@/services/projectRecordAdapter';
import { subscribeToInboxEvents } from '@/services/inboxEventAdapter';
import { subscribeToAuditTrail } from '@/services/siteAuditTrailService';
import type {
  NonConformanceReport, SnagItem, DelayEarlyWarning, SiteInstruction,
  FieldEvidence, PaymentBlocker, SiteAgentRecommendation, SiteProjectRecord,
  SiteInboxEvent, SiteAuditRecord, Severity,
} from '@/types';

type Props = {
  projectId: string;
  jobId?: string;
  user: UserProfile;
};

function MetricCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color?: string }) {
  return (
    <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
      <CardContent className="p-4 flex items-center gap-3">
        <div className="rounded-xl p-2" style={color ? { backgroundColor: `${color}20`, color } : { backgroundColor: 'var(--primary-10)', color: 'var(--primary)' }}>
          {icon}
        </div>
        <div>
          <div className="text-2xl font-bold">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant = (() => {
    if (['closed', 'verified_closed', 'completed', 'cleared', 'applied'].includes(status)) return 'default' as const;
    if (['open', 'active', 'notice_required', 'requires_follow_up'].includes(status)) return 'destructive' as const;
    if (['draft', 'recorded', 'suggested'].includes(status)) return 'secondary' as const;
    return 'outline' as const;
  })();
  return <Badge variant={variant} className="text-xs">{status.replace(/_/g, ' ')}</Badge>;
}

function SeverityBadge({ severity }: { severity: Severity }) {
  const variant = severity === 'critical' ? 'destructive' as const : severity === 'high' ? 'destructive' as const : severity === 'medium' ? 'default' as const : 'secondary' as const;
  return <Badge variant={variant} className="text-xs">{severity}</Badge>;
}

export default function SiteExecutionDashboard({ projectId, jobId, user }: Props) {
  const [activeTab, setActiveTab] = useState('ncrs');
  const [ncrs, setNcrs] = useState<NonConformanceReport[]>([]);
  const [snags, setSnags] = useState<SnagItem[]>([]);
  const [warnings, setWarnings] = useState<DelayEarlyWarning[]>([]);
  const [instructions, setInstructions] = useState<SiteInstruction[]>([]);
  const [evidence, setEvidence] = useState<FieldEvidence[]>([]);
  const [blockers, setBlockers] = useState<PaymentBlocker[]>([]);
  const [recommendations, setRecommendations] = useState<SiteAgentRecommendation[]>([]);
  const [records, setRecords] = useState<SiteProjectRecord[]>([]);
  const [inboxEvents, setInboxEvents] = useState<SiteInboxEvent[]>([]);
  const [auditTrail, setAuditTrail] = useState<SiteAuditRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) return;

    setLoading(true);
    const unsubs = [
      subscribeToNcrs(projectId, setNcrs),
      subscribeToSnags(projectId, setSnags),
      subscribeToDelayWarnings(projectId, setWarnings),
      subscribeToSiteInstructions(projectId, setInstructions),
      subscribeToEvidence(projectId, setEvidence),
      subscribeToPaymentBlockers(projectId, setBlockers),
      subscribeToRecommendations(projectId, setRecommendations),
      subscribeToProjectRecords(projectId, setRecords),
      subscribeToInboxEvents(projectId, setInboxEvents),
      subscribeToAuditTrail(projectId, setAuditTrail),
    ];

    // Set loading false after a short delay to allow initial data
    const timer = setTimeout(() => setLoading(false), 800);
    return () => {
      unsubs.forEach((unsub) => unsub());
      clearTimeout(timer);
    };
  }, [projectId]);

  const activeBlockers = useMemo(() => blockers.filter((b) => b.status === 'active'), [blockers]);
  const activeRecommendations = useMemo(() => recommendations.filter((r) => r.status === 'suggested'), [recommendations]);
  const unreadInbox = useMemo(() => inboxEvents.filter((e) => !e.isRead), [inboxEvents]);

  const tabs = [
    { id: 'ncrs', label: 'NCRs', icon: <AlertTriangle size={16} />, count: ncrs.length },
    { id: 'snags', label: 'Snags', icon: <Hammer size={16} />, count: snags.length },
    { id: 'instructions', label: 'Instructions', icon: <FileWarning size={16} />, count: instructions.length },
    { id: 'warnings', label: 'Delay Warnings', icon: <Clock size={16} />, count: warnings.length },
    { id: 'evidence', label: 'Field Evidence', icon: <Camera size={16} />, count: evidence.length },
    { id: 'blockers', label: 'Payment Blockers', icon: <ShieldAlert size={16} />, count: activeBlockers.length },
    { id: 'recommendations', label: 'AI Recs', icon: <Lightbulb size={16} />, count: activeRecommendations.length },
    { id: 'inbox', label: 'Inbox', icon: <MessageSquarePlus size={16} />, count: unreadInbox.length },
    { id: 'daily-log', label: 'Site Logs', icon: <ClipboardCheck size={16} />, count: 0 },
    { id: 'rfis', label: 'RFIs', icon: <MessageSquarePlus size={16} />, count: 0 },
    { id: 'records', label: 'Records', icon: <Activity size={16} />, count: records.length },
    { id: 'audit', label: 'Audit Trail', icon: <CheckCircle2 size={16} />, count: auditTrail.length },
  ];

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-muted-foreground p-6">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading site execution data...
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="site-execution-dashboard">
      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard icon={<AlertTriangle size={18} />} label="NCRs" value={ncrs.length} color="#ef4444" />
        <MetricCard icon={<Hammer size={18} />} label="Snags" value={snags.length} color="#f59e0b" />
        <MetricCard icon={<FileWarning size={18} />} label="Instructions" value={instructions.length} color="#3b82f6" />
        <MetricCard icon={<Clock size={18} />} label="Warnings" value={warnings.filter((w) => w.status !== 'closed').length} color="#8b5cf6" />
        <MetricCard icon={<ShieldAlert size={18} />} label="Blockers" value={activeBlockers.length} color="#dc2626" />
        <MetricCard icon={<Lightbulb size={18} />} label="AI Recs" value={activeRecommendations.length} color="#10b981" />
      </div>

      {/* Tabbed Content */}
      <Card className="rounded-2xl border-border bg-card/95 shadow-sm">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <CardHeader className="pb-0">
            <TabsList className="flex flex-wrap gap-1 h-auto p-1 bg-muted/50 rounded-xl">
              {tabs.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id} className="rounded-lg text-xs gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                  {tab.icon}
                  {tab.label}
                  {tab.count > 0 && <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">{tab.count}</Badge>}
                </TabsTrigger>
              ))}
            </TabsList>
          </CardHeader>

          <CardContent className="p-4 pt-4">
            {/* NCRs Tab */}
            <TabsContent value="ncrs" className="mt-0 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-heading text-lg font-bold">Non-Conformance Reports</h3>
              </div>
              {ncrs.length === 0 ? (
                <EmptyState message="No NCRs recorded for this project." />
              ) : (
                ncrs.map((ncr) => (
                  <div key={ncr.id} className="rounded-xl border border-border p-4 text-sm space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-semibold">{ncr.title}</div>
                      <div className="flex gap-2">
                        <SeverityBadge severity={ncr.severity} />
                        <StatusBadge status={ncr.status} />
                        {ncr.blocksPayment && <Badge variant="destructive" className="text-xs">Blocks Payment</Badge>}
                      </div>
                    </div>
                    {ncr.description && <p className="text-muted-foreground text-xs">{ncr.description}</p>}
                    {ncr.correctiveAction && <p className="text-xs"><span className="font-medium">Corrective action:</span> {ncr.correctiveAction}</p>}
                    {ncr.evidenceIds.length > 0 && <p className="text-xs text-muted-foreground">{ncr.evidenceIds.length} evidence item(s) attached</p>}
                    <p className="text-[10px] text-muted-foreground">Created {new Date(ncr.createdAt).toLocaleDateString()}</p>
                  </div>
                ))
              )}
            </TabsContent>

            {/* Snags Tab */}
            <TabsContent value="snags" className="mt-0 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-heading text-lg font-bold">Snags / Defects</h3>
              </div>
              {snags.length === 0 ? (
                <EmptyState message="No snags recorded for this project." />
              ) : (
                snags.map((snag) => (
                  <div key={snag.id} className="rounded-xl border border-border p-4 text-sm space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="font-semibold">{snag.location}</span>
                        <span className="text-muted-foreground ml-2">— {snag.description}</span>
                      </div>
                      <div className="flex gap-2">
                        <SeverityBadge severity={snag.priority} />
                        <StatusBadge status={snag.status} />
                        {snag.blocksPayment && <Badge variant="destructive" className="text-xs">Blocks Payment</Badge>}
                      </div>
                    </div>
                    {snag.dueDate && <p className="text-xs"><span className="font-medium">Due:</span> {new Date(snag.dueDate).toLocaleDateString()}</p>}
                    <p className="text-[10px] text-muted-foreground">Created {new Date(snag.createdAt).toLocaleDateString()}</p>
                  </div>
                ))
              )}
            </TabsContent>

            {/* Site Instructions Tab */}
            <TabsContent value="instructions" className="mt-0 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-heading text-lg font-bold">Site Instructions</h3>
              </div>
              {instructions.length === 0 ? (
                <EmptyState message="No site instructions recorded." />
              ) : (
                instructions.map((si) => (
                  <div key={si.id} className="rounded-xl border border-border p-4 text-sm space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-semibold">{si.title}</div>
                      <div className="flex gap-2">
                        {si.authorised ? <Badge variant="default" className="text-xs">Authorised</Badge> : <Badge variant="secondary" className="text-xs">Draft</Badge>}
                        <StatusBadge status={si.status} />
                      </div>
                    </div>
                    <p className="text-muted-foreground text-xs">{si.instruction}</p>
                    <div className="flex gap-4 text-xs">
                      <span>Cost impact: <Badge variant="secondary" className="text-[10px]">{si.costImpact}</Badge></span>
                      <span>Time impact: <Badge variant="secondary" className="text-[10px]">{si.timeImpact}</Badge></span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Issued by {si.issuedByRole} · {new Date(si.createdAt).toLocaleDateString()}</p>
                  </div>
                ))
              )}
            </TabsContent>

            {/* Delay Warnings Tab */}
            <TabsContent value="warnings" className="mt-0 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-heading text-lg font-bold">Delay / EOT Early Warnings</h3>
              </div>
              {warnings.length === 0 ? (
                <EmptyState message="No delay warnings recorded." />
              ) : (
                warnings.map((dw) => (
                  <div key={dw.id} className="rounded-xl border border-border p-4 text-sm space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Badge variant="outline" className="text-xs mr-2">{dw.cause}</Badge>
                        <span className="text-muted-foreground">{dw.description}</span>
                      </div>
                      <StatusBadge status={dw.status} />
                    </div>
                    <div className="flex gap-4 text-xs">
                      <span>Impact: {dw.likelyProgrammeImpactDays} days</span>
                      <span>Notice deadline: {new Date(dw.noticeDeadline).toLocaleDateString()}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Created {new Date(dw.createdAt).toLocaleDateString()}</p>
                  </div>
                ))
              )}
            </TabsContent>

            {/* Field Evidence Tab */}
            <TabsContent value="evidence" className="mt-0 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-heading text-lg font-bold">Field Evidence</h3>
              </div>
              {evidence.length === 0 ? (
                <EmptyState message="No field evidence captured." />
              ) : (
                evidence.map((ev) => (
                  <div key={ev.id} className="rounded-xl border border-border p-4 text-sm space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Badge variant="outline" className="text-xs mr-2">{ev.type}</Badge>
                        <span className="font-semibold">{ev.title}</span>
                      </div>
                      {ev.gps && <span className="text-xs text-muted-foreground">📍 {ev.gps.lat.toFixed(4)}, {ev.gps.lng.toFixed(4)}</span>}
                    </div>
                    {ev.location && <p className="text-xs text-muted-foreground">Location: {ev.location}</p>}
                    <p className="text-xs text-muted-foreground truncate">{ev.uri}</p>
                    <p className="text-[10px] text-muted-foreground">Captured {new Date(ev.capturedAt).toLocaleDateString()}</p>
                  </div>
                ))
              )}
            </TabsContent>

            {/* Payment Blockers Tab */}
            <TabsContent value="blockers" className="mt-0 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-heading text-lg font-bold">Payment Blockers</h3>
              </div>
              {blockers.length === 0 ? (
                <EmptyState message="No payment blockers active." />
              ) : (
                blockers.map((bl) => (
                  <div key={bl.id} className="rounded-xl border border-border p-4 text-sm space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Badge variant="outline" className="text-xs mr-2">{bl.sourceType}</Badge>
                        <span className="text-muted-foreground">{bl.reason}</span>
                      </div>
                      <div className="flex gap-2">
                        <SeverityBadge severity={bl.severity} />
                        <StatusBadge status={bl.status} />
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Created {new Date(bl.createdAt).toLocaleDateString()}</p>
                  </div>
                ))
              )}
            </TabsContent>

            {/* Agent Recommendations Tab */}
            <TabsContent value="recommendations" className="mt-0 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-heading text-lg font-bold">AI Agent Recommendations</h3>
              </div>
              {recommendations.length === 0 ? (
                <EmptyState message="No AI recommendations yet." />
              ) : (
                recommendations.map((rec) => (
                  <div key={rec.id} className="rounded-xl border border-border p-4 text-sm space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-semibold">{rec.title}</div>
                      <div className="flex gap-2">
                        <Badge variant="outline" className="text-xs">{rec.agentKey}</Badge>
                        <SeverityBadge severity={rec.severity} />
                        <StatusBadge status={rec.status} />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">{rec.rationale}</p>
                    <p className="text-[10px] text-muted-foreground">Created {new Date(rec.createdAt).toLocaleDateString()}</p>
                  </div>
                ))
              )}
            </TabsContent>

            {/* Inbox Events Tab */}
            <TabsContent value="inbox" className="mt-0 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-heading text-lg font-bold">Inbox Events</h3>
                <Badge variant="secondary">{unreadInbox.length} unread</Badge>
              </div>
              {inboxEvents.length === 0 ? (
                <EmptyState message="No inbox events." />
              ) : (
                inboxEvents.map((evt) => (
                  <div key={evt.id} className={`rounded-xl border p-4 text-sm space-y-2 ${!evt.isRead ? 'border-primary/50 bg-primary/5' : 'border-border'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        {!evt.isRead && <Badge variant="default" className="text-xs mr-2">New</Badge>}
                        <span className="font-semibold">{evt.title}</span>
                      </div>
                      <SeverityBadge severity={evt.priority} />
                    </div>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>For: {evt.recipientRole}</span>
                      {evt.dueDate && <span>Due: {new Date(evt.dueDate).toLocaleDateString()}</span>}
                    </div>
                    <p className="text-[10px] text-muted-foreground">Created {new Date(evt.createdAt).toLocaleDateString()}</p>
                  </div>
                ))
              )}
            </TabsContent>

            {/* Daily Log Tab (uses existing SiteLogManager) */}
            <TabsContent value="daily-log" className="mt-0 space-y-3">
              <h3 className="font-heading text-lg font-bold">Daily Site Logs</h3>
              <SiteLogManager projectId={projectId} jobId={jobId} currentUserId={user.uid} compact />
            </TabsContent>

            {/* RFIs Tab (uses existing RFIManager) */}
            <TabsContent value="rfis" className="mt-0 space-y-3">
              <h3 className="font-heading text-lg font-bold">RFIs</h3>
              <RFIManager projectId={projectId} jobId={jobId} currentUser={user} teamMembers={[]} compact />
            </TabsContent>

            {/* Project Records Tab */}
            <TabsContent value="records" className="mt-0 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-heading text-lg font-bold">Project Records</h3>
              </div>
              {records.length === 0 ? (
                <EmptyState message="No project records emitted yet." />
              ) : (
                records.map((rec) => (
                  <div key={rec.id} className="rounded-xl border border-border p-4 text-sm space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Badge variant="outline" className="text-xs mr-2">{rec.recordType}</Badge>
                        <span className="font-semibold">{rec.title}</span>
                      </div>
                      <Badge variant="secondary" className="text-xs">{rec.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Phase: {rec.phase} · Module: {rec.moduleKey}</p>
                    {rec.linkedRecordIds.length > 0 && <p className="text-xs text-muted-foreground">{rec.linkedRecordIds.length} linked records</p>}
                    <p className="text-[10px] text-muted-foreground">{new Date(rec.createdAt).toLocaleDateString()}</p>
                  </div>
                ))
              )}
            </TabsContent>

            {/* Audit Trail Tab */}
            <TabsContent value="audit" className="mt-0 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-heading text-lg font-bold">Audit Trail</h3>
              </div>
              {auditTrail.length === 0 ? (
                <EmptyState message="No audit records yet." />
              ) : (
                auditTrail.map((entry) => (
                  <div key={entry.id} className="rounded-xl border border-border p-4 text-sm space-y-1">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="font-semibold">{entry.action.replace(/_/g, ' ')}</span>
                        <span className="text-muted-foreground ml-2">on {entry.sourceObjectType} {entry.sourceObjectId}</span>
                      </div>
                      <Badge variant="outline" className="text-xs">{entry.actorRole}</Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground">By {entry.actorId} · {new Date(entry.createdAt).toLocaleString()}</p>
                  </div>
                ))
              )}
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
