/**
 * SpecForge API Client — thin client-side wrapper calling the Express
 * `/api/specforge` endpoints via the project's `apiFetch` utility.
 *
 * This module replaces direct repository calls in UI components, ensuring
 * all mutations and queries flow through the authenticated API layer with
 * proper role-based capability enforcement and project membership checks.
 */

import { apiFetch } from '@/lib/apiClient';
import type {
  SpecForgeWorkspace,
  SpecItem,
  SpecSection,
  SpecIssueRecipient,
  SpecIssueSnapshot,
  SpecAuditEvent,
  SpecApproval,
  SpecSubstitution,
  SpecProcurementEntry,
} from '@/types/specforgeTypes';

// ── Helpers ─────────────────────────────────────────────────────────────────

function buildUrl(projectId: string, ...segments: string[]): string {
  const path = [`/api/specforge/${projectId}`, ...segments].join('/');
  return path;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error || `API error: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

// ── Workspace ───────────────────────────────────────────────────────────────

/** GET /api/specforge/:projectId/workspace */
export async function fetchWorkspace(projectId: string): Promise<SpecForgeWorkspace> {
  const res = await apiFetch(buildUrl(projectId, 'workspace'));
  return handleResponse<SpecForgeWorkspace>(res);
}

// ── Items ───────────────────────────────────────────────────────────────────

/** POST /api/specforge/:projectId/items */
export async function createItem(projectId: string, item: Partial<SpecItem>): Promise<SpecItem> {
  const res = await apiFetch(buildUrl(projectId, 'items'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  });
  return handleResponse<SpecItem>(res);
}

/** PATCH /api/specforge/:projectId/items/:itemId */
export async function updateItem(
  projectId: string,
  itemId: string,
  updates: Partial<SpecItem>,
): Promise<Partial<SpecItem>> {
  const res = await apiFetch(buildUrl(projectId, 'items', itemId), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  return handleResponse<Partial<SpecItem>>(res);
}

/** DELETE /api/specforge/:projectId/items/:itemId */
export async function deleteItem(projectId: string, itemId: string): Promise<{ deleted: string }> {
  const res = await apiFetch(buildUrl(projectId, 'items', itemId), {
    method: 'DELETE',
  });
  return handleResponse<{ deleted: string }>(res);
}

// ── Sections ────────────────────────────────────────────────────────────────

/** POST /api/specforge/:projectId/sections */
export async function createSection(
  projectId: string,
  section: Partial<SpecSection>,
): Promise<SpecSection> {
  const res = await apiFetch(buildUrl(projectId, 'sections'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(section),
  });
  return handleResponse<SpecSection>(res);
}

/** PATCH /api/specforge/:projectId/sections/:sectionId */
export async function updateSection(
  projectId: string,
  sectionId: string,
  updates: Partial<SpecSection>,
): Promise<Partial<SpecSection>> {
  const res = await apiFetch(buildUrl(projectId, 'sections', sectionId), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  return handleResponse<Partial<SpecSection>>(res);
}

// ── Issue & Distribute ──────────────────────────────────────────────────────

/** POST /api/specforge/:projectId/issue */
export async function issueSpecification(
  projectId: string,
  recipients: SpecIssueRecipient[],
): Promise<{ snapshot: SpecIssueSnapshot }> {
  const res = await apiFetch(buildUrl(projectId, 'issue'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipients }),
  });
  return handleResponse<{ snapshot: SpecIssueSnapshot }>(res);
}

// ── Snapshots ───────────────────────────────────────────────────────────────

/** GET /api/specforge/:projectId/snapshots */
export async function fetchSnapshots(projectId: string): Promise<SpecIssueSnapshot[]> {
  const res = await apiFetch(buildUrl(projectId, 'snapshots'));
  return handleResponse<SpecIssueSnapshot[]>(res);
}

// ── Audit ───────────────────────────────────────────────────────────────────

/** GET /api/specforge/:projectId/audit */
export async function fetchAudit(
  projectId: string,
  limit?: number,
): Promise<SpecAuditEvent[]> {
  const url = limit
    ? `${buildUrl(projectId, 'audit')}?limit=${limit}`
    : buildUrl(projectId, 'audit');
  const res = await apiFetch(url);
  return handleResponse<SpecAuditEvent[]>(res);
}

// ── Approvals ───────────────────────────────────────────────────────────────

/** POST /api/specforge/:projectId/approvals */
export async function createApproval(
  projectId: string,
  approval: Partial<SpecApproval>,
): Promise<SpecApproval> {
  const res = await apiFetch(buildUrl(projectId, 'approvals'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(approval),
  });
  return handleResponse<SpecApproval>(res);
}

/** PATCH /api/specforge/:projectId/approvals/:approvalId */
export async function updateApproval(
  projectId: string,
  approvalId: string,
  decision: { decision: string; comments?: string },
): Promise<SpecApproval> {
  const res = await apiFetch(buildUrl(projectId, 'approvals', approvalId), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(decision),
  });
  return handleResponse<SpecApproval>(res);
}

// ── Substitutions ───────────────────────────────────────────────────────────

/** POST /api/specforge/:projectId/substitutions */
export async function createSubstitution(
  projectId: string,
  substitution: Partial<SpecSubstitution>,
): Promise<SpecSubstitution> {
  const res = await apiFetch(buildUrl(projectId, 'substitutions'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(substitution),
  });
  return handleResponse<SpecSubstitution>(res);
}

/** PATCH /api/specforge/:projectId/substitutions/:subId */
export async function updateSubstitution(
  projectId: string,
  subId: string,
  update: { status: string; reviewComments?: string },
): Promise<SpecSubstitution> {
  const res = await apiFetch(buildUrl(projectId, 'substitutions', subId), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  });
  return handleResponse<SpecSubstitution>(res);
}

// ── Procurement ─────────────────────────────────────────────────────────────

/** GET /api/specforge/:projectId/procurement */
export async function fetchProcurement(projectId: string): Promise<SpecProcurementEntry[]> {
  const res = await apiFetch(buildUrl(projectId, 'procurement'));
  return handleResponse<SpecProcurementEntry[]>(res);
}

/** PATCH /api/specforge/:projectId/procurement/:entryId */
export async function updateProcurement(
  projectId: string,
  entryId: string,
  update: Partial<SpecProcurementEntry>,
): Promise<Partial<SpecProcurementEntry>> {
  const res = await apiFetch(buildUrl(projectId, 'procurement', entryId), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  });
  return handleResponse<Partial<SpecProcurementEntry>>(res);
}
