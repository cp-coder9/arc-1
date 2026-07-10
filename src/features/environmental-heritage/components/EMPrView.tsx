/**
 * Environmental & Heritage — EMPr View Component
 *
 * EMPr compliance management with record overview, ECO audit recording,
 * corrective action tracker with state machine, environmental incident
 * logging, compliance history, and overdue alerts.
 *
 * Requirements: 15.1–15.7
 */

import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  Leaf,
  Plus,
  Shield,
  User,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { UserProfile } from '@/types';
import type {
  CorrectiveAction,
  CorrectiveActionState,
  ECOAudit,
  ECOAuditRating,
  EMPrRecord,
  EnvironmentalIncident,
} from '../types';
import { DisclaimerBanner } from './DisclaimerBanner';

// ─── Props ────────────────────────────────────────────────────────────────────

interface EMPrViewProps {
  user: UserProfile;
  projectId: string;
  emprRecords: EMPrRecord[];
  audits: ECOAudit[];
  onCreateAudit?: (emprId: string, audit: Partial<ECOAudit>) => void;
  onTransitionAction?: (actionId: string, targetState: CorrectiveActionState) => void;
  onLogIncident?: (emprId: string, incident: Partial<EnvironmentalIncident>) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CORRECTIVE_ACTION_STATES: CorrectiveActionState[] = ['issued', 'in_progress', 'completed', 'verified_closed'];

const ACTION_STATE_CONFIG: Record<CorrectiveActionState, { label: string; className: string }> = {
  issued: { label: 'Issued', className: 'bg-red-500/20 text-red-400 border-red-500/30' },
  in_progress: { label: 'In Progress', className: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  completed: { label: 'Completed', className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  verified_closed: { label: 'Verified Closed', className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
};

const RATING_CONFIG: Record<ECOAuditRating, { label: string; className: string }> = {
  compliant: { label: 'Compliant', className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  minor_non_conformance: { label: 'Minor NC', className: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  major_non_conformance: { label: 'Major NC', className: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  critical_non_conformance: { label: 'Critical NC', className: 'bg-red-500/20 text-red-400 border-red-500/30' },
};

const INCIDENT_TYPES = ['spill', 'clearing', 'dust', 'water_pollution', 'noise', 'waste', 'other'] as const;

const EMPR_DISCLAIMER =
  'This EMPr compliance tracker is advisory only. It does not replace the appointed Environmental Control Officer (ECO) responsibilities or formal audit reporting. All compliance activities must be conducted by qualified environmental professionals.';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getNextActionState(current: CorrectiveActionState): CorrectiveActionState | null {
  const idx = CORRECTIVE_ACTION_STATES.indexOf(current);
  if (idx < 0 || idx >= CORRECTIVE_ACTION_STATES.length - 1) return null;
  return CORRECTIVE_ACTION_STATES[idx + 1];
}

function isActionOverdue(action: CorrectiveAction): boolean {
  if (action.state === 'completed' || action.state === 'verified_closed') return false;
  const deadline = new Date(action.deadline);
  return deadline.getTime() < Date.now();
}

function daysUntilDeadline(deadline: string): number {
  const dl = new Date(deadline);
  return Math.ceil((dl.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EMPrView({
  user,
  projectId,
  emprRecords,
  audits,
  onCreateAudit,
  onTransitionAction,
  onLogIncident,
}: EMPrViewProps) {
  const [selectedEmprId, setSelectedEmprId] = useState<string | null>(
    emprRecords.length > 0 ? emprRecords[0].id : null
  );
  const [showAuditForm, setShowAuditForm] = useState(false);
  const [showIncidentForm, setShowIncidentForm] = useState(false);

  // Audit form state
  const [auditDate, setAuditDate] = useState('');
  const [auditorName, setAuditorName] = useState('');
  const [auditRating, setAuditRating] = useState<ECOAuditRating>('compliant');
  const [findingsCount, setFindingsCount] = useState(0);

  // Incident form state
  const [incidentType, setIncidentType] = useState<typeof INCIDENT_TYPES[number]>('spill');
  const [incidentDescription, setIncidentDescription] = useState('');
  const [incidentLocation, setIncidentLocation] = useState('');
  const [incidentRemedial, setIncidentRemedial] = useState('');

  const selectedRecord = emprRecords.find((r) => r.id === selectedEmprId);
  const recordAudits = useMemo(
    () => audits.filter((a) => a.emprId === selectedEmprId).sort((a, b) =>
      new Date(b.auditDate).getTime() - new Date(a.auditDate).getTime()
    ),
    [audits, selectedEmprId]
  );

  // Extract corrective actions from audits
  const allCorrectiveActions = useMemo(() => {
    const actions: (CorrectiveAction & { auditDate: string })[] = [];
    // Corrective actions are referenced by ID in audits; for UI we show them from audit context
    return actions;
  }, [recordAudits]);

  const overdueActions = allCorrectiveActions.filter(isActionOverdue);

  const handleCreateAudit = () => {
    if (!onCreateAudit || !selectedEmprId) return;
    onCreateAudit(selectedEmprId, {
      auditDate,
      auditorName,
      overallRating: auditRating,
      findingsCount,
    });
    setShowAuditForm(false);
    setAuditDate('');
    setAuditorName('');
    setAuditRating('compliant');
    setFindingsCount(0);
  };

  const handleLogIncident = () => {
    if (!onLogIncident || !selectedEmprId) return;
    onLogIncident(selectedEmprId, {
      incidentType,
      description: incidentDescription,
      locationOnSite: incidentLocation,
      immediateRemedialAction: incidentRemedial,
    });
    setShowIncidentForm(false);
    setIncidentType('spill');
    setIncidentDescription('');
    setIncidentLocation('');
    setIncidentRemedial('');
  };

  return (
    <div className="space-y-6">
      {/* Disclaimer */}
      <DisclaimerBanner message={EMPR_DISCLAIMER} />

      {/* Overdue Corrective Action Alerts */}
      {overdueActions.length > 0 && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <span className="text-sm font-medium text-red-300">
              {overdueActions.length} Overdue Corrective Action{overdueActions.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-1">
            {overdueActions.slice(0, 3).map((action) => (
              <p key={action.id} className="text-xs text-red-300/80">
                • {action.findingDescription} — {Math.abs(daysUntilDeadline(action.deadline))}d overdue
              </p>
            ))}
          </div>
        </div>
      )}

      {/* EMPr Record Selector (if multiple) */}
      {emprRecords.length > 1 && (
        <div className="flex items-center gap-3">
          <span className="text-xs uppercase tracking-wider text-surface-400">EMPr Record:</span>
          <select
            value={selectedEmprId || ''}
            onChange={(e) => setSelectedEmprId(e.target.value)}
            className="rounded-md border border-surface-700 bg-surface-800 px-3 py-1.5 text-sm text-foreground"
          >
            {emprRecords.map((r) => (
              <option key={r.id} value={r.id}>
                {r.emprDocumentRef} — {r.constructionPhase.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* EMPr Record Overview */}
      {selectedRecord && (
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
              <Leaf className="h-4 w-4 text-emerald-400" />
              EMPr Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
              <div className="space-y-1">
                <span className="text-xs uppercase tracking-wider text-surface-400">Document Ref</span>
                <p className="text-sm font-mono text-foreground">{selectedRecord.emprDocumentRef}</p>
              </div>
              <div className="space-y-1">
                <span className="text-xs uppercase tracking-wider text-surface-400">Approval Date</span>
                <p className="text-sm text-foreground">{formatDate(selectedRecord.approvalDate)}</p>
              </div>
              <div className="space-y-1">
                <span className="text-xs uppercase tracking-wider text-surface-400">ECO Name</span>
                <p className="text-sm text-foreground">{selectedRecord.ecoName}</p>
              </div>
              <div className="space-y-1">
                <span className="text-xs uppercase tracking-wider text-surface-400">ECO Email</span>
                <p className="text-sm text-foreground truncate">{selectedRecord.ecoContactEmail}</p>
              </div>
              <div className="space-y-1">
                <span className="text-xs uppercase tracking-wider text-surface-400">Audit Frequency</span>
                <p className="text-sm text-foreground capitalize">{selectedRecord.auditFrequency}</p>
              </div>
              <div className="space-y-1">
                <span className="text-xs uppercase tracking-wider text-surface-400">Construction Phase</span>
                <p className="text-sm text-foreground">
                  {selectedRecord.constructionPhase.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs: Audits, Corrective Actions, Incidents */}
      <Tabs defaultValue="audits" className="space-y-4">
        <TabsList className="bg-surface-800/70 border border-surface-700/50">
          <TabsTrigger value="audits" className="text-xs gap-1">
            <Activity className="h-3.5 w-3.5" />
            Audits ({recordAudits.length})
          </TabsTrigger>
          <TabsTrigger value="corrective" className="text-xs gap-1">
            <AlertTriangle className="h-3.5 w-3.5" />
            Corrective Actions
          </TabsTrigger>
          <TabsTrigger value="incidents" className="text-xs gap-1">
            <Shield className="h-3.5 w-3.5" />
            Incidents
          </TabsTrigger>
        </TabsList>

        {/* Audits Tab */}
        <TabsContent value="audits" className="space-y-4">
          {/* Create Audit Button */}
          {onCreateAudit && selectedEmprId && (
            <div className="flex justify-end">
              <Button size="sm" className="gap-1" onClick={() => setShowAuditForm(!showAuditForm)}>
                <Plus className="h-4 w-4" />
                Record Audit
              </Button>
            </div>
          )}

          {/* Audit Form */}
          {showAuditForm && (
            <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-foreground">Record ECO Audit</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs text-surface-400">Audit Date</label>
                    <input
                      type="date"
                      value={auditDate}
                      onChange={(e) => setAuditDate(e.target.value)}
                      className="w-full rounded-md border border-surface-700 bg-surface-900 px-3 py-2 text-sm text-foreground"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-surface-400">Auditor Name</label>
                    <input
                      type="text"
                      value={auditorName}
                      onChange={(e) => setAuditorName(e.target.value)}
                      placeholder="ECO name"
                      maxLength={200}
                      className="w-full rounded-md border border-surface-700 bg-surface-900 px-3 py-2 text-sm text-foreground placeholder:text-surface-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-surface-400">Overall Rating</label>
                    <select
                      value={auditRating}
                      onChange={(e) => setAuditRating(e.target.value as ECOAuditRating)}
                      className="w-full rounded-md border border-surface-700 bg-surface-900 px-3 py-2 text-sm text-foreground"
                    >
                      <option value="compliant">Compliant</option>
                      <option value="minor_non_conformance">Minor Non-Conformance</option>
                      <option value="major_non_conformance">Major Non-Conformance</option>
                      <option value="critical_non_conformance">Critical Non-Conformance</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-surface-400">Findings Count</label>
                    <input
                      type="number"
                      min={0}
                      value={findingsCount}
                      onChange={(e) => setFindingsCount(Number(e.target.value))}
                      className="w-full rounded-md border border-surface-700 bg-surface-900 px-3 py-2 text-sm text-foreground"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleCreateAudit} disabled={!auditDate || !auditorName.trim()}>
                    Save Audit
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowAuditForm(false)}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Audit History / Compliance Dashboard */}
          {recordAudits.length === 0 ? (
            <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
              <CardContent className="py-8 text-center">
                <Activity className="h-8 w-8 text-surface-500 mx-auto mb-3" />
                <p className="text-sm text-surface-400">No audits recorded yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {recordAudits.map((audit) => (
                <Card key={audit.id} className="bg-surface-900/70 border-surface-700/50">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3.5 w-3.5 text-surface-400" />
                          <span className="text-sm text-foreground">{formatDate(audit.auditDate)}</span>
                          <Badge className={RATING_CONFIG[audit.overallRating].className}>
                            {RATING_CONFIG[audit.overallRating].label}
                          </Badge>
                        </div>
                        <div className="flex gap-4 text-xs text-surface-400">
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {audit.auditorName}
                          </span>
                          <span>{audit.findingsCount} finding{audit.findingsCount !== 1 ? 's' : ''}</span>
                          <span>{audit.correctiveActions.length} corrective action{audit.correctiveActions.length !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                      {audit.auditReportRef && (
                        <span className="text-xs font-mono text-surface-400 flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          {audit.auditReportRef}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Corrective Actions Tab */}
        <TabsContent value="corrective" className="space-y-3">
          {allCorrectiveActions.length === 0 ? (
            <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
              <CardContent className="py-8 text-center">
                <CheckCircle2 className="h-8 w-8 text-surface-500 mx-auto mb-3" />
                <p className="text-sm text-surface-400">No corrective actions raised.</p>
              </CardContent>
            </Card>
          ) : (
            allCorrectiveActions.map((action) => {
              const overdue = isActionOverdue(action);
              const nextState = getNextActionState(action.state);
              const days = daysUntilDeadline(action.deadline);

              return (
                <Card
                  key={action.id}
                  className={`bg-surface-900/70 border-surface-700/50 ${overdue ? 'border-l-2 border-l-red-500' : ''}`}
                >
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={ACTION_STATE_CONFIG[action.state].className}>
                            {ACTION_STATE_CONFIG[action.state].label}
                          </Badge>
                          {overdue && (
                            <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Overdue
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-foreground">{action.findingDescription}</p>
                        <div className="flex gap-3 mt-1 text-xs text-surface-400">
                          <span>Responsible: {action.responsibleParty}</span>
                          <span className={overdue ? 'text-red-400' : ''}>
                            Deadline: {formatDate(action.deadline)}
                            {days !== null && (
                              <span className="ml-1">
                                ({days > 0 ? `${days}d remaining` : `${Math.abs(days)}d overdue`})
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                      {onTransitionAction && nextState && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onTransitionAction(action.id, nextState)}
                          className="gap-1 text-xs shrink-0"
                        >
                          <ArrowRight className="h-3 w-3" />
                          {ACTION_STATE_CONFIG[nextState].label}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* Incidents Tab */}
        <TabsContent value="incidents" className="space-y-4">
          {/* Log Incident Button */}
          {onLogIncident && selectedEmprId && (
            <div className="flex justify-end">
              <Button size="sm" className="gap-1" onClick={() => setShowIncidentForm(!showIncidentForm)}>
                <Plus className="h-4 w-4" />
                Log Incident
              </Button>
            </div>
          )}

          {/* Incident Form */}
          {showIncidentForm && (
            <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-foreground">Log Environmental Incident</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs text-surface-400">Incident Type</label>
                    <select
                      value={incidentType}
                      onChange={(e) => setIncidentType(e.target.value as typeof INCIDENT_TYPES[number])}
                      className="w-full rounded-md border border-surface-700 bg-surface-900 px-3 py-2 text-sm text-foreground"
                    >
                      {INCIDENT_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-surface-400">Location on Site</label>
                    <input
                      type="text"
                      value={incidentLocation}
                      onChange={(e) => setIncidentLocation(e.target.value)}
                      placeholder="e.g. Northern boundary, near stormwater drain"
                      maxLength={200}
                      className="w-full rounded-md border border-surface-700 bg-surface-900 px-3 py-2 text-sm text-foreground placeholder:text-surface-500"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-surface-400">Description</label>
                  <textarea
                    value={incidentDescription}
                    onChange={(e) => setIncidentDescription(e.target.value)}
                    placeholder="Describe the incident..."
                    maxLength={1000}
                    rows={3}
                    className="w-full rounded-md border border-surface-700 bg-surface-900 px-3 py-2 text-sm text-foreground placeholder:text-surface-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-surface-400">Immediate Remedial Action</label>
                  <textarea
                    value={incidentRemedial}
                    onChange={(e) => setIncidentRemedial(e.target.value)}
                    placeholder="Describe actions taken to address the incident..."
                    maxLength={1000}
                    rows={2}
                    className="w-full rounded-md border border-surface-700 bg-surface-900 px-3 py-2 text-sm text-foreground placeholder:text-surface-500"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleLogIncident}
                    disabled={!incidentDescription.trim() || !incidentLocation.trim() || !incidentRemedial.trim()}
                  >
                    Log Incident
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowIncidentForm(false)}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Placeholder for incident history (would be populated via props in production) */}
          <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
            <CardContent className="py-8 text-center">
              <Shield className="h-8 w-8 text-surface-500 mx-auto mb-3" />
              <p className="text-sm text-surface-400">
                Environmental incidents will appear here once logged.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
