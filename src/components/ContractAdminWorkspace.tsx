/**
 * ContractAdminWorkspace — Unified contract administration workspace.
 * Claims, variations, EoT, notices, payment schedules, and contract data.
 *
 * Layout: Header Card → Project Toggles → Disclaimer Banner → Tab Navigation → Active Tab Content
 * Follows the SpecForge workspace template pattern.
 *
 * Requirements validated: 4.3, 4.4, 4.5, 4.6, 4.9, 4.10, 4.11, 4.12, 4.13
 */

import React, { useState, useMemo, useCallback } from 'react';
import type { UserProfile } from '@/types';
import type { ContractFeature } from '@/services/contractAdmin/contractTypes';
import { canAccess } from '@/services/contractAdmin/contractRbacService';
import { getDisclaimerBannerText } from '@/services/contractAdmin/disclaimerService';
import { useContractAdminIntegration } from '@/hooks/useContractAdminIntegration';
import type { FailedSyncAlert } from '@/hooks/useContractAdminIntegration';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  Briefcase,
  AlertTriangle,
  FileText,
  Clock,
  Bell,
  CalendarDays,
  Database,
  Lock,
  X,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface Props {
  user: UserProfile;
  projectId?: string;
}

interface TabDefinition {
  id: string;
  label: string;
  feature: ContractFeature;
  icon: React.ReactNode;
}

interface ProjectOption {
  id: string;
  name: string;
  status: 'active' | 'pending' | 'complete';
}

// ── Tab Configuration ────────────────────────────────────────────────────────

const CONTRACT_TABS: TabDefinition[] = [
  { id: 'claims', label: 'Claims Register', feature: 'claims', icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  { id: 'variations', label: 'Variation Register', feature: 'variations', icon: <FileText className="h-3.5 w-3.5" /> },
  { id: 'eot', label: 'Extension of Time', feature: 'eot', icon: <Clock className="h-3.5 w-3.5" /> },
  { id: 'notices', label: 'Notices', feature: 'notices', icon: <Bell className="h-3.5 w-3.5" /> },
  { id: 'payment', label: 'Payment Scheduler', feature: 'payment_schedule', icon: <CalendarDays className="h-3.5 w-3.5" /> },
  { id: 'datasheet', label: 'Contract Data Sheet', feature: 'data_sheet_view', icon: <Database className="h-3.5 w-3.5" /> },
];

// ── Demo Data ────────────────────────────────────────────────────────────────

const DEMO_PROJECTS: ProjectOption[] = [
  { id: 'proj-1', name: 'Kensington Mixed-Use', status: 'active' },
  { id: 'proj-2', name: 'Sandton Office Park', status: 'active' },
  { id: 'proj-3', name: 'Melrose Arch Phase 3', status: 'pending' },
];

// ── Helper: Role Label ───────────────────────────────────────────────────────

function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    architect: 'Principal Agent',
    bep: 'Built Environment Professional',
    quantity_surveyor: 'Quantity Surveyor',
    contractor: 'Contractor',
    subcontractor: 'Subcontractor',
    site_manager: 'Site Manager',
    engineer: 'Engineer',
    admin: 'Administrator',
    platform_admin: 'Platform Admin',
  };
  return labels[role] ?? role.replace(/_/g, ' ');
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function ContractAdminWorkspace({ user, projectId: propProjectId }: Props) {
  const [activeTab, setActiveTab] = useState('claims');
  const [selectedProject, setSelectedProject] = useState<string>(propProjectId ?? DEMO_PROJECTS[0]?.id ?? '');
  const [viewMode, setViewMode] = useState<'project' | 'all'>('project');
  const [failedSyncAlerts, setFailedSyncAlerts] = useState<FailedSyncAlert[]>([]);

  // ── Integration hooks (Req 4.9, 4.10, 4.11, 4.12) ───────────────────────
  const { writeAuditTrail, surfaceToActionCentre, writeToProjectPassport } =
    useContractAdminIntegration({ projectId: selectedProject, userId: user.uid });

  /**
   * Handle integration result: if failed, add the alert to local state.
   * On 3-retry failure: create failed-sync alert in Action Centre (Req 4.12)
   */
  const handleIntegrationResult = useCallback((result: { success: boolean; failedSyncAlert?: FailedSyncAlert }) => {
    if (!result.success && result.failedSyncAlert) {
      setFailedSyncAlerts((prev) => [...prev, result.failedSyncAlert!]);
    }
  }, []);

  /**
   * Fires all integration hooks for a contract action:
   * 1. Audit trail write (Req 4.9)
   * 2. Project Passport write on status changes (Req 4.11)
   * 3. Action Centre surfacing if deadline ≤5 working days (Req 4.10)
   */
  const onContractAction = useCallback(async (params: {
    entityType: 'claim' | 'variation' | 'eot' | 'notice' | 'payment' | 'contract';
    entityId: string;
    action: string;
    clauseReference?: string;
    deadlineDate?: string;
    remainingWorkingDays?: number;
    requiredResponseType?: string;
    passportUpdate?: {
      contractStatus: 'active' | 'amended' | 'terminated';
      outstandingNoticesCount: number;
      nearestDeadlineDays?: number;
    };
  }) => {
    // 1. Write to audit trail on every contract action (Req 4.9)
    const auditResult = await writeAuditTrail({
      entityType: params.entityType === 'payment' ? 'payment_schedule' : params.entityType,
      entityId: params.entityId,
      action: params.action,
      clauseReference: params.clauseReference,
    });
    handleIntegrationResult(auditResult);

    // 2. Surface to Action Centre if deadline ≤5 working days (Req 4.10)
    if (params.remainingWorkingDays !== undefined && params.remainingWorkingDays <= 5 && params.remainingWorkingDays > 0) {
      const actionResult = await surfaceToActionCentre({
        priority: 'high',
        deadlineDate: params.deadlineDate,
        clauseReference: params.clauseReference,
        requiredResponseType: params.requiredResponseType ?? 'response',
        remainingDays: params.remainingWorkingDays,
        subject: `Deadline approaching: ${params.action}`,
        entityType: params.entityType,
        entityId: params.entityId,
      });
      handleIntegrationResult(actionResult);
    }

    // 3. Write to Project Passport on status changes (Req 4.11)
    if (params.passportUpdate) {
      const passportResult = await writeToProjectPassport({
        contractStatus: params.passportUpdate.contractStatus,
        keyDates: {
          commencementDate: '2026-01-15',
          practicalCompletionDate: '2026-12-31',
          revisedCompletionDate: '2027-02-21',
        },
        outstandingNoticesCount: params.passportUpdate.outstandingNoticesCount,
        nearestDeadlineDays: params.passportUpdate.nearestDeadlineDays,
      });
      handleIntegrationResult(passportResult);
    }
  }, [writeAuditTrail, surfaceToActionCentre, writeToProjectPassport, handleIntegrationResult]);

  /** Dismiss a failed-sync alert */
  const dismissAlert = useCallback((alertId: string) => {
    setFailedSyncAlerts((prev) => prev.filter((a) => a.id !== alertId));
  }, []);

  // Default project assignment (all flags true for demo; real implementation wires Firestore)
  const projectAssignment = useMemo(() => ({
    projectId: selectedProject,
    userId: user.uid,
    roles: [user.role],
    isAssignedTeamMember: true,
    isAssignedContractor: user.role === 'contractor' || user.role === 'subcontractor',
    isAssignedSubcontractor: user.role === 'subcontractor',
    isProjectOwner: user.role === 'client' || user.role === 'developer',
    isAssignedSiteManager: user.role === 'site_manager',
  }), [selectedProject, user.uid, user.role]);

  // Check tab access for each tab
  const tabAccess = useMemo(() => {
    const access: Record<string, boolean> = {};
    for (const tab of CONTRACT_TABS) {
      access[tab.id] = canAccess(user.role, tab.feature, 'read', projectAssignment);
    }
    return access;
  }, [user.role, projectAssignment]);

  const disclaimerText = getDisclaimerBannerText();

  // ── No project guard ──────────────────────────────────────────────────────
  if (!propProjectId && DEMO_PROJECTS.length === 0) {
    return (
      <div className="flex items-center justify-center p-12" data-testid="contract-admin-workspace">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <Briefcase className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-lg font-medium">Select a Project</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Contract Administration requires an active project context. Please select a project to continue.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="contract-admin-workspace">
      {/* ─── Header Card ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                <Briefcase className="mr-1.5 inline h-3.5 w-3.5" />
                Contract Administration
              </p>
              <CardTitle className="mt-1 text-2xl">
                {viewMode === 'all'
                  ? 'All Projects Overview'
                  : DEMO_PROJECTS.find(p => p.id === selectedProject)?.name ?? 'Project'}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {getRoleLabel(user.role)} · JBCC PBA 6.2 · Active Contract
              </p>
            </div>
            <Badge className="rounded-full border-0 bg-primary/15 text-primary">
              {getRoleLabel(user.role)}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* ─── Project Toggles ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Projects:</span>
        {DEMO_PROJECTS.map((proj) => (
          <Button
            key={proj.id}
            variant={viewMode === 'project' && selectedProject === proj.id ? 'default' : 'outline'}
            size="sm"
            className="rounded-full text-xs"
            onClick={() => { setSelectedProject(proj.id); setViewMode('project'); }}
          >
            <span className={cn(
              'mr-1.5 inline-block h-2 w-2 rounded-full',
              proj.status === 'active' ? 'bg-emerald-400' : proj.status === 'pending' ? 'bg-yellow-400' : 'bg-slate-400',
            )} />
            {proj.name}
          </Button>
        ))}
        <Button
          variant={viewMode === 'all' ? 'default' : 'outline'}
          size="sm"
          className="ml-auto rounded-full text-xs"
          onClick={() => setViewMode('all')}
        >
          All Projects
        </Button>
      </div>

      {/* ─── Disclaimer Banner (persistent, non-dismissible) ────────────── */}
      <div
        className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3"
        role="alert"
        aria-label="Advisory disclaimer"
        data-testid="disclaimer-banner"
      >
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-yellow-400" />
          <p className="text-sm text-yellow-200">{disclaimerText}</p>
        </div>
      </div>

      {/* ─── Failed Sync Alerts (Req 4.12) ──────────────────────────────── */}
      {failedSyncAlerts.length > 0 && (
        <div className="space-y-2" data-testid="failed-sync-alerts">
          {failedSyncAlerts.map((alert) => (
            <div
              key={alert.id}
              className="flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3"
              role="alert"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />
                <div>
                  <p className="text-sm font-medium text-red-300">
                    Sync Failed: {alert.targetModule}
                  </p>
                  <p className="text-xs text-red-400">
                    Event: {alert.originatingEvent} · {new Date(alert.failureTimestamp).toLocaleString()}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-red-400 hover:text-red-300"
                onClick={() => dismissAlert(alert.id)}
                aria-label="Dismiss alert"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* ─── Tab Navigation + Content ───────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={(v) => { if (tabAccess[v]) setActiveTab(v); }}>
        <TabsList className="flex-wrap">
          {CONTRACT_TABS.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              disabled={!tabAccess[tab.id]}
              className={cn(!tabAccess[tab.id] && 'opacity-50 cursor-not-allowed')}
            >
              {tab.icon}
              <span className="ml-1.5">{tab.label}</span>
              {!tabAccess[tab.id] && <Lock className="ml-1 h-3 w-3" />}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ═══ CLAIMS REGISTER TAB ═══════════════════════════════════════ */}
        <TabsContent value="claims">
          {!tabAccess.claims ? (
            <PermissionDenied feature="Claims Register" />
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Total Claims" value="7" />
                <StatCard label="Amount Claimed" value="R 2,450,000" />
                <StatCard label="Amount Assessed" value="R 1,890,000" />
                <StatCard label="Disputed" value="2" variant="destructive" />
              </div>
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Claims Register</CardTitle>
                    <Button
                      size="sm"
                      className="text-xs"
                      onClick={() => onContractAction({
                        entityType: 'claim',
                        entityId: `CLM-${Date.now()}`,
                        action: 'claim_registered',
                        clauseReference: '25.1',
                        passportUpdate: { contractStatus: 'active', outstandingNoticesCount: 5 },
                      })}
                      data-testid="register-claim-btn"
                    >
                      Register Claim
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                          <th className="pb-2 pr-4">Ref</th>
                          <th className="pb-2 pr-4">Type</th>
                          <th className="pb-2 pr-4">Date of Event</th>
                          <th className="pb-2 pr-4 text-right">Amount</th>
                          <th className="pb-2 pr-4">Time Impact</th>
                          <th className="pb-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        <ClaimRow ref_="CLM-001" type="Loss & Expense" date="2026-03-15" amount="R 850,000" days="45 days" status="assessed" />
                        <ClaimRow ref_="CLM-002" type="Prolongation" date="2026-04-02" amount="R 420,000" days="22 days" status="substantiated" />
                        <ClaimRow ref_="CLM-003" type="Disruption" date="2026-04-18" amount="R 310,000" days="15 days" status="disputed" />
                        <ClaimRow ref_="CLM-004" type="Varied Work" date="2026-05-01" amount="R 275,000" days="0 days" status="accepted" />
                        <ClaimRow ref_="CLM-005" type="Prolongation" date="2026-05-20" amount="R 595,000" days="30 days" status="notified" />
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ═══ VARIATION REGISTER TAB ════════════════════════════════════ */}
        <TabsContent value="variations">
          {!tabAccess.variations ? (
            <PermissionDenied feature="Variation Register" />
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Total Variations" value="12" />
                <StatCard label="Additions" value="R 1,850,000" />
                <StatCard label="Omissions" value="R 320,000" />
                <StatCard label="Net Delta" value="R +1,530,000" variant="warning" />
              </div>
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Variation Register</CardTitle>
                    <Button
                      size="sm"
                      className="text-xs"
                      onClick={() => onContractAction({
                        entityType: 'variation',
                        entityId: `VO-${Date.now()}`,
                        action: 'variation_approved',
                        clauseReference: '17.2',
                        passportUpdate: { contractStatus: 'amended', outstandingNoticesCount: 5 },
                      })}
                      data-testid="approve-variation-btn"
                    >
                      Approve Variation
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                          <th className="pb-2 pr-4">VO No.</th>
                          <th className="pb-2 pr-4">Description</th>
                          <th className="pb-2 pr-4">Date Instructed</th>
                          <th className="pb-2 pr-4 text-right">Cost Impact</th>
                          <th className="pb-2 pr-4">Time Impact</th>
                          <th className="pb-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        <VariationRow no="VO-001" desc="Additional waterproofing to basement" date="2026-02-20" cost="R +350,000" days="12 days" status="approved" />
                        <VariationRow no="VO-002" desc="Omit external cladding Type B" date="2026-03-05" cost="R -180,000" days="0 days" status="implemented" />
                        <VariationRow no="VO-003" desc="Revised HVAC ducting layout" date="2026-03-22" cost="R +520,000" days="18 days" status="valued" />
                        <VariationRow no="VO-004" desc="Additional fire escape stairwell" date="2026-04-10" cost="R +680,000" days="25 days" status="instructed" />
                        <VariationRow no="VO-005" desc="Omit decorative brickwork feature" date="2026-04-28" cost="R -140,000" days="0 days" status="approved" />
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ═══ EXTENSION OF TIME TAB ═════════════════════════════════════ */}
        <TabsContent value="eot">
          {!tabAccess.eot ? (
            <PermissionDenied feature="Extension of Time" />
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="EoT Claims" value="4" />
                <StatCard label="Days Claimed" value="87" />
                <StatCard label="Days Granted" value="52" />
                <StatCard label="Under Review" value="1" variant="warning" />
              </div>
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Extension of Time Register</CardTitle>
                    <Button
                      size="sm"
                      className="text-xs"
                      onClick={() => onContractAction({
                        entityType: 'eot',
                        entityId: `EOT-${Date.now()}`,
                        action: 'eot_submitted',
                        clauseReference: '29.1',
                        remainingWorkingDays: 3,
                        deadlineDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
                        requiredResponseType: 'review',
                        passportUpdate: { contractStatus: 'active', outstandingNoticesCount: 5, nearestDeadlineDays: 3 },
                      })}
                      data-testid="submit-eot-btn"
                    >
                      Submit EoT Claim
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                          <th className="pb-2 pr-4">Ref</th>
                          <th className="pb-2 pr-4">Cause</th>
                          <th className="pb-2 pr-4">Delay Event Date</th>
                          <th className="pb-2 pr-4">Days Claimed</th>
                          <th className="pb-2 pr-4">Days Approved</th>
                          <th className="pb-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        <EoTRow ref_="EOT-001" cause="Weather" date="2026-02-10" claimed="30" approved="22" status="granted" />
                        <EoTRow ref_="EOT-002" cause="Client Instruction" date="2026-03-15" claimed="15" approved="15" status="granted" />
                        <EoTRow ref_="EOT-003" cause="Unforeseen Ground" date="2026-04-22" claimed="25" approved="15" status="partially_granted" />
                        <EoTRow ref_="EOT-004" cause="Materials Delay" date="2026-05-18" claimed="17" approved="—" status="under_review" />
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ═══ NOTICES TAB ═══════════════════════════════════════════════ */}
        <TabsContent value="notices">
          {!tabAccess.notices ? (
            <PermissionDenied feature="Notices" />
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Active Notices" value="5" />
                <StatCard label="Pending Response" value="2" variant="warning" />
                <StatCard label="Expired" value="1" variant="destructive" />
                <StatCard label="Acknowledged" value="8" />
              </div>
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Notice Register</CardTitle>
                    <Button
                      size="sm"
                      className="text-xs"
                      onClick={() => onContractAction({
                        entityType: 'notice',
                        entityId: `NTC-${Date.now()}`,
                        action: 'notice_issued',
                        clauseReference: '23.1',
                        remainingWorkingDays: 4,
                        deadlineDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
                        requiredResponseType: 'acknowledgement',
                        passportUpdate: { contractStatus: 'active', outstandingNoticesCount: 6, nearestDeadlineDays: 4 },
                      })}
                      data-testid="issue-notice-btn"
                    >
                      Issue Notice
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                          <th className="pb-2 pr-4">Notice ID</th>
                          <th className="pb-2 pr-4">Type</th>
                          <th className="pb-2 pr-4">Clause</th>
                          <th className="pb-2 pr-4">Issued</th>
                          <th className="pb-2 pr-4">Deadline</th>
                          <th className="pb-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        <NoticeRow id="NTC-001" type="Penalty Warning" clause="23.1" issued="2026-05-01" deadline="2026-05-15" status="acknowledged" />
                        <NoticeRow id="NTC-002" type="Payment Claim" clause="31.2" issued="2026-05-10" deadline="2026-05-24" status="responded" />
                        <NoticeRow id="NTC-003" type="Delay Early Warning" clause="6.3" issued="2026-06-01" deadline="2026-06-08" status="issued" />
                        <NoticeRow id="NTC-004" type="Practical Completion" clause="21.1" issued="2026-06-15" deadline="2026-06-29" status="issued" />
                        <NoticeRow id="NTC-005" type="Penalty Warning" clause="23.1" issued="2026-04-01" deadline="2026-04-15" status="expired" />
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ═══ PAYMENT SCHEDULER TAB ═════════════════════════════════════ */}
        <TabsContent value="payment">
          {!tabAccess.payment ? (
            <PermissionDenied feature="Payment Scheduler" />
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Contract Sum" value="R 45,200,000" />
                <StatCard label="Certified to Date" value="R 28,750,000" />
                <StatCard label="Retention Held" value="R 2,875,000" />
                <StatCard label="Next Payment Due" value="12 Jul 2026" />
              </div>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Payment Schedule</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                          <th className="pb-2 pr-4">Cycle</th>
                          <th className="pb-2 pr-4">Valuation Date</th>
                          <th className="pb-2 pr-4">Certificate Deadline</th>
                          <th className="pb-2 pr-4">Payment Deadline</th>
                          <th className="pb-2 pr-4 text-right">Amount</th>
                          <th className="pb-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        <PaymentRow cycle={1} valuation="2026-02-25" certDeadline="2026-03-04" payDeadline="2026-03-18" amount="R 4,500,000" status="payment_confirmed" />
                        <PaymentRow cycle={2} valuation="2026-03-25" certDeadline="2026-04-01" payDeadline="2026-04-15" amount="R 5,200,000" status="payment_confirmed" />
                        <PaymentRow cycle={3} valuation="2026-04-25" certDeadline="2026-05-02" payDeadline="2026-05-16" amount="R 6,800,000" status="payment_confirmed" />
                        <PaymentRow cycle={4} valuation="2026-05-25" certDeadline="2026-06-01" payDeadline="2026-06-15" amount="R 7,100,000" status="certificate_issued" />
                        <PaymentRow cycle={5} valuation="2026-06-25" certDeadline="2026-07-02" payDeadline="2026-07-16" amount="—" status="pending" />
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ═══ CONTRACT DATA SHEET TAB ═══════════════════════════════════ */}
        <TabsContent value="datasheet">
          {!tabAccess.datasheet ? (
            <PermissionDenied feature="Contract Data Sheet" />
          ) : (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Contract Data Sheet</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <DataRow label="Contract Form" value="JBCC PBA Edition 6.2" />
                  <DataRow label="Employer" value="Kensington Properties (Pty) Ltd" />
                  <DataRow label="Contractor" value="Mabena Construction Group" />
                  <DataRow label="Principal Agent" value="Van der Berg Architects" />
                  <DataRow label="Quantity Surveyor" value="Theron & Associates QS" />
                  <DataRow label="Commencement Date" value="2026-01-15" />
                  <DataRow label="Practical Completion" value="2026-12-31" />
                  <DataRow label="Revised Completion" value="2027-02-21 (+52 days EoT)" />
                  <DataRow label="Contract Sum" value="R 45,200,000.00" />
                  <DataRow label="Revised Sum" value="R 46,730,000.00 (+R 1,530,000 variations)" />
                  <DataRow label="Retention %" value="10.00%" />
                  <DataRow label="Penalty Rate" value="R 15,000.00 per calendar day" />
                  <DataRow label="Defects Liability" value="12 months from Practical Completion" />
                  <DataRow label="Payment Period" value="30 calendar days from certificate" />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Key Dates</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                          <th className="pb-2 pr-4">Milestone</th>
                          <th className="pb-2 pr-4">Original Date</th>
                          <th className="pb-2 pr-4">Revised Date</th>
                          <th className="pb-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        <KeyDateRow milestone="Commencement" original="2026-01-15" revised="—" status="completed" />
                        <KeyDateRow milestone="Structural Complete" original="2026-06-30" revised="2026-07-22" status="in_progress" />
                        <KeyDateRow milestone="Practical Completion" original="2026-12-31" revised="2027-02-21" status="pending" />
                        <KeyDateRow milestone="Final Completion" original="2027-03-31" revised="2027-05-21" status="pending" />
                        <KeyDateRow milestone="Defects Liability End" original="2027-12-31" revised="2028-02-21" status="pending" />
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Sub-Components ───────────────────────────────────────────────────────────

function StatCard({ label, value, variant }: { label: string; value: string; variant?: 'default' | 'destructive' | 'warning' }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className={cn(
          'text-xl font-bold',
          variant === 'destructive' && 'text-red-400',
          variant === 'warning' && 'text-orange-400',
        )}>{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function PermissionDenied({ feature }: { feature: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-6">
        <Lock className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">Insufficient Permission</p>
          <p className="text-sm text-muted-foreground">
            You do not have project-level permission to access {feature}. Contact your project administrator for access.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    notified: 'bg-blue-500/20 text-blue-400',
    substantiated: 'bg-purple-500/20 text-purple-400',
    assessed: 'bg-yellow-500/20 text-yellow-400',
    accepted: 'bg-emerald-500/20 text-emerald-400',
    partially_accepted: 'bg-emerald-500/20 text-emerald-400',
    rejected: 'bg-red-500/20 text-red-400',
    disputed: 'bg-red-500/20 text-red-400',
    instructed: 'bg-blue-500/20 text-blue-400',
    valued: 'bg-yellow-500/20 text-yellow-400',
    approved: 'bg-emerald-500/20 text-emerald-400',
    implemented: 'bg-emerald-500/20 text-emerald-400',
    granted: 'bg-emerald-500/20 text-emerald-400',
    partially_granted: 'bg-yellow-500/20 text-yellow-400',
    under_review: 'bg-purple-500/20 text-purple-400',
    submitted: 'bg-blue-500/20 text-blue-400',
    issued: 'bg-blue-500/20 text-blue-400',
    acknowledged: 'bg-emerald-500/20 text-emerald-400',
    responded: 'bg-emerald-500/20 text-emerald-400',
    expired: 'bg-red-500/20 text-red-400',
    pending: 'bg-yellow-500/20 text-yellow-400',
    certificate_issued: 'bg-blue-500/20 text-blue-400',
    payment_confirmed: 'bg-emerald-500/20 text-emerald-400',
    overdue: 'bg-red-500/20 text-red-400',
    completed: 'bg-emerald-500/20 text-emerald-400',
    in_progress: 'bg-blue-500/20 text-blue-400',
  };
  return (
    <span className={cn('inline-block rounded-full px-2 py-0.5 text-xs font-medium', styles[status] ?? 'bg-slate-500/20 text-slate-400')}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function ClaimRow({ ref_, type, date, amount, days, status }: { ref_: string; type: string; date: string; amount: string; days: string; status: string }) {
  return (
    <tr className="border-b border-border/50">
      <td className="py-2 pr-4 font-mono text-xs">{ref_}</td>
      <td className="py-2 pr-4">{type}</td>
      <td className="py-2 pr-4 text-muted-foreground">{date}</td>
      <td className="py-2 pr-4 text-right">{amount}</td>
      <td className="py-2 pr-4 text-muted-foreground">{days}</td>
      <td className="py-2"><StatusBadge status={status} /></td>
    </tr>
  );
}

function VariationRow({ no, desc, date, cost, days, status }: { no: string; desc: string; date: string; cost: string; days: string; status: string }) {
  return (
    <tr className="border-b border-border/50">
      <td className="py-2 pr-4 font-mono text-xs">{no}</td>
      <td className="py-2 pr-4">{desc}</td>
      <td className="py-2 pr-4 text-muted-foreground">{date}</td>
      <td className="py-2 pr-4 text-right">{cost}</td>
      <td className="py-2 pr-4 text-muted-foreground">{days}</td>
      <td className="py-2"><StatusBadge status={status} /></td>
    </tr>
  );
}

function EoTRow({ ref_, cause, date, claimed, approved, status }: { ref_: string; cause: string; date: string; claimed: string; approved: string; status: string }) {
  return (
    <tr className="border-b border-border/50">
      <td className="py-2 pr-4 font-mono text-xs">{ref_}</td>
      <td className="py-2 pr-4">{cause}</td>
      <td className="py-2 pr-4 text-muted-foreground">{date}</td>
      <td className="py-2 pr-4">{claimed}</td>
      <td className="py-2 pr-4">{approved}</td>
      <td className="py-2"><StatusBadge status={status} /></td>
    </tr>
  );
}

function NoticeRow({ id, type, clause, issued, deadline, status }: { id: string; type: string; clause: string; issued: string; deadline: string; status: string }) {
  return (
    <tr className="border-b border-border/50">
      <td className="py-2 pr-4 font-mono text-xs">{id}</td>
      <td className="py-2 pr-4">{type}</td>
      <td className="py-2 pr-4 text-muted-foreground">{clause}</td>
      <td className="py-2 pr-4 text-muted-foreground">{issued}</td>
      <td className="py-2 pr-4 text-muted-foreground">{deadline}</td>
      <td className="py-2"><StatusBadge status={status} /></td>
    </tr>
  );
}

function PaymentRow({ cycle, valuation, certDeadline, payDeadline, amount, status }: { cycle: number; valuation: string; certDeadline: string; payDeadline: string; amount: string; status: string }) {
  return (
    <tr className="border-b border-border/50">
      <td className="py-2 pr-4 font-mono text-xs">{cycle}</td>
      <td className="py-2 pr-4 text-muted-foreground">{valuation}</td>
      <td className="py-2 pr-4 text-muted-foreground">{certDeadline}</td>
      <td className="py-2 pr-4 text-muted-foreground">{payDeadline}</td>
      <td className="py-2 pr-4 text-right">{amount}</td>
      <td className="py-2"><StatusBadge status={status} /></td>
    </tr>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/30 py-2 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

function KeyDateRow({ milestone, original, revised, status }: { milestone: string; original: string; revised: string; status: string }) {
  return (
    <tr className="border-b border-border/50">
      <td className="py-2 pr-4 font-medium">{milestone}</td>
      <td className="py-2 pr-4 text-muted-foreground">{original}</td>
      <td className="py-2 pr-4 text-muted-foreground">{revised}</td>
      <td className="py-2"><StatusBadge status={status} /></td>
    </tr>
  );
}
