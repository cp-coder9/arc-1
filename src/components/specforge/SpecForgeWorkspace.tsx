/**
 * SpecForge Workspace — Full specification tool UI component.
 * Implements: Overview, Pictorial Board, Sections, Products, Approvals,
 * Budget & Risk, BoM/BoQ, Issue & Distribute, Procurement Pipeline.
 */

import React, { useMemo, useState, useCallback, useEffect } from 'react';
import type { UserProfile } from '@/types';
import type {
  SpecForgeRole,
  SpecItem,
  SpecSection,
  SpecIssueRecipient,
  SpecProcurementEntry,
  SpecLibraryItem,
  SpecBoMLineItem,
  SpecForgeWorkspace as SpecForgeWorkspaceType,
} from '@/types/specforgeTypes';
import { toSpecForgeRole } from '@/types/specforgeTypes';
import {
  specRoleCan,
  getVisibleSpecItems,
  summarizeSpecBudget,
  validateIssueReadiness,
  searchSpecLibrary,
  generateBoMFromSpec,
} from '@/services/specforge/specforgeService';
import {
  fetchWorkspace,
  fetchProcurement,
  createItem,
  createSection,
  issueSpecification,
  updateProcurement,
  updateItem,
} from '@/services/specforge/specforgeApiClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

interface Props {
  user: UserProfile;
  projectId?: string;
}

export default function SpecForgeWorkspace({ user, projectId: propProjectId }: Props) {
  const role: SpecForgeRole = toSpecForgeRole(user.role) ?? 'client';
  const [workspace, setWorkspace] = useState<SpecForgeWorkspaceType | null>(null);
  const [activeView, setActiveView] = useState('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [roomFilter, setRoomFilter] = useState('all');
  const [pkgFilter, setPkgFilter] = useState('all');
  const [procurement, setProcurement] = useState<SpecProcurementEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Resolve project ID from prop or user context
  const projectId = propProjectId ?? (user as unknown as { activeProjectId?: string }).activeProjectId;

  // Load workspace from API
  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    Promise.all([
      fetchWorkspace(projectId),
      fetchProcurement(projectId),
    ]).then(([ws, entries]) => {
      setWorkspace(ws);
      setProcurement(entries);
    }).catch((err) => {
      setError(err instanceof Error ? err.message : 'Failed to load workspace');
    }).finally(() => {
      setLoading(false);
    });
  }, [projectId]);
  const [issuedSnapshot, setIssuedSnapshot] = useState<string | null>(null);
  const [issueError, setIssueError] = useState<string | null>(null);

  // Derived state
  const visibleItems = useMemo((): SpecItem[] => {
    if (!workspace) return [];
    let items = getVisibleSpecItems(workspace, role, user.uid);
    if (roomFilter !== 'all') items = items.filter((i) => i.room === roomFilter);
    if (pkgFilter !== 'all') items = items.filter((i) => i.package === pkgFilter);
    return items;
  }, [workspace, role, roomFilter, pkgFilter]);

  const budget = useMemo(() => summarizeSpecBudget(visibleItems), [visibleItems]);
  const readiness = useMemo(() => workspace ? validateIssueReadiness(workspace) : [], [workspace]);
  const bomItems = useMemo(() => generateBoMFromSpec(visibleItems), [visibleItems]);
  const rooms = useMemo(() => workspace ? [...new Set(workspace.items.map((i) => i.room))] : [], [workspace]);
  const packages = useMemo(() => workspace ? [...new Set(workspace.items.map((i) => i.package))] : [], [workspace]);

  // Library search
  const libraryResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return searchSpecLibrary(searchQuery);
  }, [searchQuery]);

  // Section add form
  const [showAddSection, setShowAddSection] = useState(false);
  const [newSection, setNewSection] = useState({ code: '', title: '', discipline: '' });

  const handleAddSection = useCallback(async () => {
    if (!newSection.code || !newSection.title || !projectId) return;
    const section: SpecSection = {
      id: `sec-${Date.now()}`,
      code: newSection.code,
      title: newSection.title,
      discipline: newSection.discipline || 'general',
      ownerRole: role,
      reviewerRole: undefined,
      status: 'draft',
    };
    try {
      const created = await createSection(projectId, section);
      setWorkspace((ws) => ws ? { ...ws, sections: [...ws.sections, created] } : ws);
      setNewSection({ code: '', title: '', discipline: '' });
      setShowAddSection(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add section');
    }
  }, [newSection, role, projectId]);

  // Item add form
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItem, setNewItem] = useState({
    sectionId: '', code: '', title: '', room: '', package: '',
    supplier: '', model: '', finish: '', dimensions: '',
    budgetAllowance: '', estimatedCost: '', leadTimeDays: '',
    clientDecision: false,
  });

  const handleAddItem = useCallback(async () => {
    if (!newItem.code || !newItem.title || !newItem.sectionId || !projectId || !workspace) return;
    const item: SpecItem = {
      id: `item-${Date.now()}`,
      sectionId: newItem.sectionId,
      code: newItem.code,
      title: newItem.title,
      room: newItem.room || 'Unassigned',
      package: newItem.package || 'General',
      supplier: newItem.supplier || undefined,
      model: newItem.model || undefined,
      finish: newItem.finish || undefined,
      dimensions: newItem.dimensions || undefined,
      drawingRefs: [],
      clauseRefs: [],
      budgetAllowance: Number(newItem.budgetAllowance) || 0,
      estimatedCost: Number(newItem.estimatedCost) || 0,
      leadTimeDays: Number(newItem.leadTimeDays) || 0,
      clientDecision: newItem.clientDecision,
      ownerRole: role,
      status: 'draft',
      sourceRevision: workspace.revision,
      supersededBy: null,
    };
    try {
      const created = await createItem(projectId, item);
      setWorkspace((ws) => ws ? { ...ws, items: [...ws.items, created] } : ws);
      setNewItem({
        sectionId: '', code: '', title: '', room: '', package: '',
        supplier: '', model: '', finish: '', dimensions: '',
        budgetAllowance: '', estimatedCost: '', leadTimeDays: '',
        clientDecision: false,
      });
      setShowAddItem(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add item');
    }
  }, [newItem, role, workspace, projectId]);

  // Issue workflow
  const handleIssue = useCallback(async () => {
    if (!projectId || !workspace) return;
    try {
      setIssueError(null);
      const recipients: SpecIssueRecipient[] = (workspace.team ?? []).map((m) => ({
        userId: m.userId,
        name: m.name,
        role: m.role,
        scope: m.responsibility,
      }));
      const result = await issueSpecification(projectId, recipients);
      setIssuedSnapshot(result.snapshot.snapshotId);
    } catch (err: unknown) {
      setIssueError(err instanceof Error ? err.message : 'Issue failed');
    }
  }, [workspace, projectId]);

  // Procurement status advance
  const PROCUREMENT_STATUS_ORDER: SpecProcurementEntry['status'][] = [
    'not_started', 'rfq_sent', 'quoted', 'ordered', 'dispatched', 'delivered', 'installed', 'closed',
  ];

  const handleAdvanceProcurement = useCallback(async (entryId: string) => {
    if (!projectId) return;
    const entry = procurement.find((e) => e.id === entryId);
    if (!entry) return;
    const currentIdx = PROCUREMENT_STATUS_ORDER.indexOf(entry.status);
    if (currentIdx < 0 || currentIdx >= PROCUREMENT_STATUS_ORDER.length - 1) return;
    const nextStatus = PROCUREMENT_STATUS_ORDER[currentIdx + 1];

    // Optimistic update
    setProcurement((entries) =>
      entries.map((e) => (e.id === entryId ? { ...e, status: nextStatus } : e)),
    );
    try {
      await updateProcurement(projectId, entryId, { status: nextStatus });
    } catch (err: unknown) {
      // Revert optimistic update on failure
      setProcurement((entries) =>
        entries.map((e) => (e.id === entryId ? { ...e, status: entry.status } : e)),
      );
      setError(err instanceof Error ? err.message : 'Failed to advance procurement');
    }
  }, [projectId, procurement]);

  // Populate item from library
  const handleLibrarySelect = useCallback((libItem: SpecLibraryItem) => {
    setNewItem((prev) => ({
      ...prev,
      title: libItem.title,
      package: libItem.category,
      supplier: libItem.typicalSupplier ?? '',
      estimatedCost: libItem.typicalCostRange ? String(libItem.typicalCostRange.max) : '',
      leadTimeDays: libItem.leadTimeRange ? String(libItem.leadTimeRange.max) : '',
    }));
    setSearchQuery('');
    setShowAddItem(true);
  }, []);

  const canEdit = specRoleCan(role, 'edit_spec');
  const canIssue = specRoleCan(role, 'issue_spec');

  // ── Render ──────────────────────────────────────────────────────────────

  if (!projectId) {
    return (
      <div className="flex items-center justify-center p-12" data-testid="specforge-workspace">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <p className="text-lg font-medium">Select a project</p>
            <p className="mt-2 text-sm text-muted-foreground">
              SpecForge requires an active project context. Please select a project to continue.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12" data-testid="specforge-workspace">
        <p className="text-sm text-muted-foreground">Loading workspace…</p>
      </div>
    );
  }

  if (error || !workspace) {
    return (
      <div className="flex items-center justify-center p-12" data-testid="specforge-workspace">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <p className="text-lg font-medium text-red-400">Failed to load workspace</p>
            <p className="mt-2 text-sm text-muted-foreground">{error ?? 'Workspace data unavailable.'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="specforge-workspace">
      {/* Header */}
      <Card>
        <CardHeader className="pb-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">SpecForge</p>
          <CardTitle className="text-2xl">{workspace.projectName}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {workspace.profile} · Rev {workspace.revision} · {workspace.stage}
          </p>
        </CardHeader>
      </Card>

      {/* Navigation Tabs */}
      <Tabs value={activeView} onValueChange={setActiveView}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="pictorial">Pictorial Board</TabsTrigger>
          <TabsTrigger value="sections">Sections</TabsTrigger>
          <TabsTrigger value="approvals">Approvals</TabsTrigger>
          <TabsTrigger value="budget">Budget & Risk</TabsTrigger>
          <TabsTrigger value="bom">BoM / BoQ</TabsTrigger>
          <TabsTrigger value="issue">Issue & Distribute</TabsTrigger>
          <TabsTrigger value="procurement">Procurement</TabsTrigger>
        </TabsList>

        {/* ── Overview ─────────────────────────────────────────────────── */}
        <TabsContent value="overview">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Allowance" value={formatZAR(budget.allowance)} />
            <StatCard label="Estimate" value={formatZAR(budget.estimate)} />
            <StatCard
              label="Delta"
              value={formatZAR(budget.delta)}
              variant={budget.delta > 0 ? 'destructive' : 'default'}
            />
            <StatCard label="Long-lead items" value={String(budget.longLeadItems.length)} />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label="Sections" value={String(workspace.sections.length)} />
            <StatCard label="Items visible" value={String(visibleItems.length)} />
            <StatCard label="Readiness findings" value={String(readiness.length)} />
          </div>
          {readiness.length > 0 && (
            <Card className="mt-4">
              <CardHeader><CardTitle className="text-base">Readiness Findings</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm">
                  {readiness.slice(0, 8).map((f, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <SeverityBadge severity={f.severity} />
                      <span className="text-muted-foreground">{f.message}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Pictorial Board ──────────────────────────────────────────── */}
        <TabsContent value="pictorial">
          {/* Smart Search Bar */}
          <div className="mb-4 space-y-2">
            <Input
              placeholder="Search library: type a product name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-lg"
            />
            {libraryResults.length > 0 && (
              <Card className="max-w-lg">
                <CardContent className="p-2">
                  <ul className="divide-y divide-border">
                    {libraryResults.map((lib) => (
                      <li key={lib.id} className="flex items-center justify-between py-2 px-1">
                        <div>
                          <p className="text-sm font-medium">{lib.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {lib.category} · {lib.scope} · Used {lib.usageCount}×
                          </p>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => handleLibrarySelect(lib)}>
                          Use
                        </Button>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Filters */}
          <div className="mb-4 flex flex-wrap gap-3">
            <select
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
              value={roomFilter}
              onChange={(e) => setRoomFilter(e.target.value)}
              aria-label="Filter by room"
            >
              <option value="all">All rooms</option>
              {rooms.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <select
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
              value={pkgFilter}
              onChange={(e) => setPkgFilter(e.target.value)}
              aria-label="Filter by package"
            >
              <option value="all">All packages</option>
              {packages.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {/* Item Grid */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleItems.map((item) => (
              <Card key={item.id} className="overflow-hidden">
                {item.image && (
                  <img src={item.image} alt={item.title} className="aspect-video w-full object-cover" />
                )}
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-muted-foreground">{item.code}</span>
                    <Badge variant="outline">{item.status.replace(/_/g, ' ')}</Badge>
                  </div>
                  <h3 className="text-sm font-semibold">{item.title}</h3>
                  <p className="text-xs text-muted-foreground">{item.room} · {item.package}</p>
                  {item.supplier && (
                    <p className="text-xs text-muted-foreground">Supplier: {item.supplier}</p>
                  )}
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>Budget: {formatZAR(item.budgetAllowance)}</span>
                    <span>Est: {formatZAR(item.estimatedCost)}</span>
                    <span>Lead: {item.leadTimeDays}d</span>
                  </div>
                  {item.supersededBy && (
                    <Badge variant="destructive" className="text-xs">Superseded</Badge>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {canEdit && (
            <Button className="mt-4" onClick={() => setShowAddItem(true)} variant="outline">
              + Add Spec Item
            </Button>
          )}
        </TabsContent>

        {/* ── Sections ─────────────────────────────────────────────────── */}
        <TabsContent value="sections">
          <div className="space-y-3">
            {workspace.sections.map((section) => {
              const sectionItems = visibleItems.filter((i) => i.sectionId === section.id);
              return (
                <Card key={section.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">
                        {section.code} — {section.title}
                      </CardTitle>
                      <Badge variant="outline">{section.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {section.discipline} · Owner: {section.ownerRole}
                      {section.reviewerRole && ` · Reviewer: ${section.reviewerRole}`}
                    </p>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{sectionItems.length} item(s)</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          {canEdit && (
            <Button className="mt-4" onClick={() => setShowAddSection(true)} variant="outline">
              + Add Section
            </Button>
          )}
        </TabsContent>

        {/* ── Approvals ────────────────────────────────────────────────── */}
        <TabsContent value="approvals">
          <Card>
            <CardHeader><CardTitle className="text-base">Pending Approvals</CardTitle></CardHeader>
            <CardContent>
              {visibleItems.filter((i) => i.status === 'needs_decision').length === 0 ? (
                <p className="text-sm text-muted-foreground">No pending approvals.</p>
              ) : (
                <ul className="space-y-3">
                  {visibleItems.filter((i) => i.status === 'needs_decision').map((item) => (
                    <li key={item.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                      <div>
                        <p className="text-sm font-medium">{item.code} — {item.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.room} · Approver: {item.approverRole ?? 'unassigned'}
                        </p>
                      </div>
                      {specRoleCan(role, 'approve_client_decision') && item.clientDecision && (
                        <Button
                          size="sm"
                          onClick={async () => {
                            if (!projectId) return;
                            // Optimistic update
                            setWorkspace((ws) => ws ? {
                              ...ws,
                              items: ws.items.map((i) =>
                                i.id === item.id ? { ...i, status: 'approved' } : i,
                              ),
                            } : ws);
                            try {
                              await updateItem(projectId, item.id, { status: 'approved' });
                            } catch (err: unknown) {
                              // Revert optimistic update
                              setWorkspace((ws) => ws ? {
                                ...ws,
                                items: ws.items.map((i) =>
                                  i.id === item.id ? { ...i, status: 'needs_decision' } : i,
                                ),
                              } : ws);
                              setError(err instanceof Error ? err.message : 'Failed to approve item');
                            }
                          }}
                        >
                          Approve
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Budget & Risk ────────────────────────────────────────────── */}
        <TabsContent value="budget">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total Allowance" value={formatZAR(budget.allowance)} />
            <StatCard label="Total Estimate" value={formatZAR(budget.estimate)} />
            <StatCard
              label="Variance"
              value={`${formatZAR(budget.delta)} (${budget.deltaPct ?? 0}%)`}
              variant={budget.delta > 0 ? 'destructive' : 'default'}
            />
            <StatCard label="Over-budget items" value={String(budget.overBudgetItems.length)} />
          </div>
          {budget.overBudgetItems.length > 0 && (
            <Card className="mt-4">
              <CardHeader><CardTitle className="text-base">Over-Budget Items</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm">
                  {workspace.items
                    .filter((i) => budget.overBudgetItems.includes(i.id))
                    .map((i) => (
                      <li key={i.id} className="text-muted-foreground">
                        {i.code} — {i.title}: est. {formatZAR(i.estimatedCost)} vs allowance {formatZAR(i.budgetAllowance)}
                      </li>
                    ))}
                </ul>
              </CardContent>
            </Card>
          )}
          {budget.longLeadItems.length > 0 && (
            <Card className="mt-4">
              <CardHeader><CardTitle className="text-base">Long-Lead Items (≥56 days)</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm">
                  {workspace.items
                    .filter((i) => budget.longLeadItems.includes(i.id))
                    .map((i) => (
                      <li key={i.id} className="text-muted-foreground">
                        {i.code} — {i.title}: {i.leadTimeDays} days
                      </li>
                    ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── BoM / BoQ ────────────────────────────────────────────────── */}
        <TabsContent value="bom">
          <Card>
            <CardHeader><CardTitle className="text-base">Bill of Materials</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                      <th className="pb-2 pr-4">Code</th>
                      <th className="pb-2 pr-4">Title</th>
                      <th className="pb-2 pr-4">Room</th>
                      <th className="pb-2 pr-4">Supplier</th>
                      <th className="pb-2 pr-4 text-right">Rate</th>
                      <th className="pb-2 pr-4 text-right">Lead</th>
                      <th className="pb-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bomItems.map((line) => (
                      <tr key={line.id} className="border-b border-border/50">
                        <td className="py-2 pr-4 font-mono text-xs">{line.itemCode}</td>
                        <td className="py-2 pr-4">{line.title}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{line.room}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{line.supplier ?? '—'}</td>
                        <td className="py-2 pr-4 text-right">{formatZAR(line.rate)}</td>
                        <td className="py-2 pr-4 text-right">{line.leadTimeDays}d</td>
                        <td className="py-2"><Badge variant="outline">{line.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Total: {formatZAR(bomItems.reduce((s, l) => s + l.total, 0))} · {bomItems.length} line items
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Issue & Distribute ───────────────────────────────────────── */}
        <TabsContent value="issue">
          <Card>
            <CardHeader><CardTitle className="text-base">Issue Specification</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {/* Readiness gate */}
              <div>
                <h3 className="mb-2 text-sm font-semibold">Readiness Gate</h3>
                {readiness.length === 0 ? (
                  <p className="text-sm text-green-500">All items pass readiness checks.</p>
                ) : (
                  <ul className="space-y-1">
                    {readiness.map((f, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        <SeverityBadge severity={f.severity} />
                        <span className="text-muted-foreground">{f.message}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Recipients */}
              {workspace.team && workspace.team.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold">Recipients</h3>
                  <ul className="space-y-1">
                    {workspace.team.map((m) => (
                      <li key={m.userId} className="text-sm text-muted-foreground">
                        {m.name} ({m.role}) — {m.responsibility}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Issue button */}
              {canIssue && !issuedSnapshot && (
                <Button onClick={handleIssue} disabled={readiness.some((f) => f.severity === 'blocker' || f.severity === 'high' || f.severity === 'medium')}>
                  Issue Specification
                </Button>
              )}
              {issueError && (
                <p className="text-sm font-medium text-red-400">{issueError}</p>
              )}
              {issuedSnapshot && (
                <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3">
                  <p className="text-sm font-medium text-green-400">
                    Specification issued successfully.
                  </p>
                  <p className="text-xs text-muted-foreground">Snapshot: {issuedSnapshot}</p>
                </div>
              )}
              {!canIssue && (
                <p className="text-sm text-muted-foreground">
                  Only architects and BEPs can issue specifications.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Procurement Pipeline ─────────────────────────────────────── */}
        <TabsContent value="procurement">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(['not_started', 'rfq_sent', 'quoted', 'ordered', 'dispatched', 'delivered', 'installed', 'closed'] as const).map((status) => {
              const entries = procurement.filter((e) => e.status === status);
              if (entries.length === 0) return null;
              return (
                <Card key={status}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs uppercase tracking-wide">
                      {status.replace(/_/g, ' ')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {entries.map((entry) => (
                      <div key={entry.id} className="rounded-md border border-border/50 p-2">
                        <p className="text-xs font-medium">{entry.itemCode}</p>
                        <p className="text-xs text-muted-foreground">{entry.itemTitle}</p>
                        {entry.supplier && (
                          <p className="text-xs text-muted-foreground">{entry.supplier}</p>
                        )}
                        {specRoleCan(role, 'update_procurement_status') && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="mt-1 h-6 text-xs"
                            onClick={() => handleAdvanceProcurement(entry.id)}
                          >
                            Advance →
                          </Button>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Add Section Modal ────────────────────────────────────────── */}
      {showAddSection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Add Section</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="sec-code">Section Code</Label>
                <Input id="sec-code" value={newSection.code} onChange={(e) => setNewSection((s) => ({ ...s, code: e.target.value }))} placeholder="e.g. 09" />
              </div>
              <div>
                <Label htmlFor="sec-title">Title</Label>
                <Input id="sec-title" value={newSection.title} onChange={(e) => setNewSection((s) => ({ ...s, title: e.target.value }))} placeholder="e.g. Internal Finishes" />
              </div>
              <div>
                <Label htmlFor="sec-disc">Discipline</Label>
                <Input id="sec-disc" value={newSection.discipline} onChange={(e) => setNewSection((s) => ({ ...s, discipline: e.target.value }))} placeholder="e.g. architecture" />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleAddSection}>Add</Button>
                <Button variant="outline" onClick={() => setShowAddSection(false)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Add Item Modal ──────────────────────────────────────────── */}
      {showAddItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle>Add Spec Item</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="item-section">Section</Label>
                <select
                  id="item-section"
                  className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                  value={newItem.sectionId}
                  onChange={(e) => setNewItem((s) => ({ ...s, sectionId: e.target.value }))}
                >
                  <option value="">Select section...</option>
                  {workspace.sections.map((sec) => (
                    <option key={sec.id} value={sec.id}>{sec.code} — {sec.title}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="item-code">Item Code</Label>
                  <Input id="item-code" value={newItem.code} onChange={(e) => setNewItem((s) => ({ ...s, code: e.target.value }))} placeholder="FIN-XX-001" />
                </div>
                <div>
                  <Label htmlFor="item-title">Title</Label>
                  <Input id="item-title" value={newItem.title} onChange={(e) => setNewItem((s) => ({ ...s, title: e.target.value }))} placeholder="Product name" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="item-room">Room</Label>
                  <Input id="item-room" value={newItem.room} onChange={(e) => setNewItem((s) => ({ ...s, room: e.target.value }))} placeholder="Main Lobby" />
                </div>
                <div>
                  <Label htmlFor="item-pkg">Package</Label>
                  <Input id="item-pkg" value={newItem.package} onChange={(e) => setNewItem((s) => ({ ...s, package: e.target.value }))} placeholder="Finishes" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="item-supplier">Supplier</Label>
                  <Input id="item-supplier" value={newItem.supplier} onChange={(e) => setNewItem((s) => ({ ...s, supplier: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="item-model">Model</Label>
                  <Input id="item-model" value={newItem.model} onChange={(e) => setNewItem((s) => ({ ...s, model: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="item-finish">Finish</Label>
                  <Input id="item-finish" value={newItem.finish} onChange={(e) => setNewItem((s) => ({ ...s, finish: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="item-dims">Dimensions</Label>
                  <Input id="item-dims" value={newItem.dimensions} onChange={(e) => setNewItem((s) => ({ ...s, dimensions: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label htmlFor="item-budget">Budget (R)</Label>
                  <Input id="item-budget" type="number" value={newItem.budgetAllowance} onChange={(e) => setNewItem((s) => ({ ...s, budgetAllowance: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="item-est">Estimate (R)</Label>
                  <Input id="item-est" type="number" value={newItem.estimatedCost} onChange={(e) => setNewItem((s) => ({ ...s, estimatedCost: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="item-lead">Lead (days)</Label>
                  <Input id="item-lead" type="number" value={newItem.leadTimeDays} onChange={(e) => setNewItem((s) => ({ ...s, leadTimeDays: e.target.value }))} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="item-client-dec"
                  type="checkbox"
                  checked={newItem.clientDecision}
                  onChange={(e) => setNewItem((s) => ({ ...s, clientDecision: e.target.checked }))}
                  className="h-4 w-4 rounded border-border"
                />
                <Label htmlFor="item-client-dec">Requires client decision</Label>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleAddItem}>Add Item</Button>
                <Button variant="outline" onClick={() => setShowAddItem(false)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function StatCard({ label, value, variant }: { label: string; value: string; variant?: 'default' | 'destructive' }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className={cn('text-xl font-bold', variant === 'destructive' && 'text-red-400')}>{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    blocker: 'bg-red-500/20 text-red-400',
    high: 'bg-orange-500/20 text-orange-400',
    medium: 'bg-yellow-500/20 text-yellow-400',
    low: 'bg-blue-500/20 text-blue-400',
  };
  return (
    <span className={cn('inline-block rounded px-1.5 py-0.5 text-xs font-medium', colors[severity] ?? colors.low)}>
      {severity}
    </span>
  );
}

function formatZAR(amount: number): string {
  return `R${amount.toLocaleString('en-ZA')}`;
}
