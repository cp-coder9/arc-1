/**
 * Terms Template Service — Bridge for the ProposalBuilderPanel
 *
 * Wraps termsService.ts with the interface the frontend component expects.
 */

import {
  availableTermsForRole,
  defaultTermsForRole,
  snapshotTerms,
  calculateExpiryDate,
  isProposalExpired,
  termsRequireApproval as checkTermsRequireApproval,
  type TermsTemplate,
} from './termsService';
import type { ProposalTermsSnapshot } from '../types/proposalBuilder';

export type { TermsTemplate };

export interface TemplateOption {
  templateId: string;
  label: string;
  description: string;
  scope: string;
  version: string;
  requiresProfessionalApproval: boolean;
  clauses: string[];
}

/** Convert internal TermsTemplate to the component's expected format */
function toTemplateOption(t: TermsTemplate): TemplateOption {
  return {
    templateId: t.termsId,
    label: t.label,
    description: t.clauses.slice(0, 2).join(' '),
    scope: t.scope,
    version: t.version,
    requiresProfessionalApproval: t.requiresApproval,
    clauses: t.clauses,
  };
}

/** List available templates for a role */
export function listAvailableTemplates(role: string, userId?: string): TemplateOption[] {
  return availableTermsForRole(role, userId).map(toTemplateOption);
}

/** Create a terms snapshot from selected template IDs */
export function createTermsSnapshot(
  templateIds: string[],
  overrides?: Partial<ProposalTermsSnapshot>,
): ProposalTermsSnapshot {
  const allTemplates = [...availableTermsForRole('architect'), ...availableTermsForRole('engineer')];
  const selected = allTemplates.filter((t) => templateIds.includes(t.termsId));
  if (selected.length === 0) {
    selected.push(...defaultTermsForRole('architect'));
  }
  return snapshotTerms(selected, overrides);
}

/** Check if terms require approval */
export function termsRequireApproval(templateIds: string[]): boolean {
  const allTemplates = [...availableTermsForRole('architect'), ...availableTermsForRole('engineer')];
  const selected = allTemplates.filter((t) => templateIds.includes(t.termsId));
  return checkTermsRequireApproval(selected);
}

/** Calculate expiry date from issued timestamp */
export function calculateValidityExpiry(issuedAt: string, validityDays: number): string {
  return calculateExpiryDate(validityDays, new Date(issuedAt));
}

/** Days until expiry */
export function daysUntilExpiry(expiryDate: string): number {
  const now = new Date();
  const expiry = new Date(expiryDate);
  const diff = expiry.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

/** Check if proposal has expired */
export function isProposalExpiredFn(issuedAt: string, validityDays: number): boolean {
  return isProposalExpired(issuedAt, validityDays);
}
