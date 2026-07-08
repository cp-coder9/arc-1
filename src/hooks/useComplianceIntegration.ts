/**
 * useComplianceIntegration — Hook for compliance early warning,
 * audit trail, and Action Centre integration.
 *
 * Provides:
 * - checkExpiryWarnings(): finds checks expiring within 30 calendar days
 * - writeComplianceAuditEvent(): writes compliance status changes to audit trail
 * - surfaceEarlyWarning(): surfaces early warning to Action Centre
 *
 * Requirements validated: 5.7, 5.10, 5.12, 5.13
 */

import { useCallback, useRef } from 'react';
import { createWorkflowEvent } from '@/services/inboxEventAdapter';
import { createAuditEntry } from '@/services/auditTrailService';
import type { ComplianceCheckStatus, ContractorComplianceCheckType } from '@/services/contractorSupplierComplianceService';
import { COMPLIANCE_CHECK_REQUIREMENTS } from '@/services/contractorSupplierComplianceService';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ComplianceEntityForWarning {
  id: string;
  name: string;
  type: 'contractor' | 'supplier';
  checks: Record<string, {
    status: string;
    expiresAt?: string;
  }>;
}

export interface ExpiryWarning {
  entityId: string;
  entityName: string;
  checkType: ContractorComplianceCheckType;
  checkLabel: string;
  expiryDate: string;
  daysUntilExpiry: number;
}

export interface ComplianceAuditEvent {
  auditId: string;
  entityId: string;
  checkType: ContractorComplianceCheckType;
  previousStatus: ComplianceCheckStatus;
  newStatus: ComplianceCheckStatus;
  actorId: string;
  timestamp: string;
}

export interface UseComplianceIntegrationParams {
  projectId: string | null;
  userId: string;
}

export interface UseComplianceIntegrationResult {
  /** Find all checks expiring within 30 calendar days */
  checkExpiryWarnings: (entities: ComplianceEntityForWarning[]) => ExpiryWarning[];
  /** Write a compliance status change to the project audit trail */
  writeComplianceAuditEvent: (
    entityId: string,
    checkType: ContractorComplianceCheckType,
    prevStatus: ComplianceCheckStatus,
    newStatus: ComplianceCheckStatus,
  ) => ComplianceAuditEvent;
  /** Surface an early warning to the Action Centre */
  surfaceEarlyWarning: (
    entityName: string,
    checkType: ContractorComplianceCheckType,
    expiryDate: string,
  ) => void;
  /** Surface all early warnings for a set of entities */
  surfaceAllWarnings: (warnings: ExpiryWarning[]) => void;
}

// ── Constants ────────────────────────────────────────────────────────────────

const EXPIRY_WARNING_DAYS = 30;

// ── Helper ───────────────────────────────────────────────────────────────────

/**
 * Calculate the number of calendar days between now and a given date.
 * Returns positive if the date is in the future.
 */
export function daysUntil(dateStr: string, now = new Date()): number {
  const target = new Date(dateStr);
  const diffMs = target.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

// ── Exported Pure Functions ───────────────────────────────────────────────────

/**
 * Scans all entities and finds compliance checks expiring within 30 calendar days.
 * Exported as a pure function for direct testing; also used internally by the hook.
 */
export function checkExpiryWarnings(
  entities: ComplianceEntityForWarning[],
  now = new Date(),
): ExpiryWarning[] {
  const warnings: ExpiryWarning[] = [];

  for (const entity of entities) {
    for (const [checkKey, check] of Object.entries(entity.checks)) {
      if (!check.expiresAt) continue;

      const days = daysUntil(check.expiresAt, now);

      // Only warn for checks expiring within 30 days and not yet expired
      if (days > 0 && days <= EXPIRY_WARNING_DAYS) {
        const checkType = checkKey as ContractorComplianceCheckType;
        const req = COMPLIANCE_CHECK_REQUIREMENTS[checkType];
        warnings.push({
          entityId: entity.id,
          entityName: entity.name,
          checkType,
          checkLabel: req?.label ?? checkKey,
          expiryDate: check.expiresAt,
          daysUntilExpiry: days,
        });
      }
    }
  }

  // Sort by urgency (fewest days first)
  return warnings.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useComplianceIntegration({
  projectId,
  userId,
}: UseComplianceIntegrationParams): UseComplianceIntegrationResult {
  // Track surfaced warnings to avoid duplicates within the same session
  const surfacedWarningsRef = useRef<Set<string>>(new Set());

  /**
   * Hook-bound wrapper around the pure checkExpiryWarnings function.
   */
  const checkExpiryWarningsHook = useCallback(
    (entities: ComplianceEntityForWarning[]): ExpiryWarning[] => {
      return checkExpiryWarnings(entities);
    },
    [],
  );

  /**
   * Writes a compliance check status change to the project audit trail.
   */
  const writeComplianceAuditEvent = useCallback(
    (
      entityId: string,
      checkType: ContractorComplianceCheckType,
      prevStatus: ComplianceCheckStatus,
      newStatus: ComplianceCheckStatus,
    ): ComplianceAuditEvent => {
      const timestamp = new Date().toISOString();
      const action = `compliance_check_update: ${checkType} changed from ${prevStatus} to ${newStatus}`;

      // Write to the project audit trail service
      const auditRecord = createAuditEntry({
        actorId: userId,
        action,
        sourceObjectId: entityId,
      });

      return {
        auditId: auditRecord.auditId,
        entityId,
        checkType,
        previousStatus: prevStatus,
        newStatus,
        actorId: userId,
        timestamp,
      };
    },
    [userId],
  );

  /**
   * Surfaces a single early warning to the Action Centre via WorkflowEvent.
   */
  const surfaceEarlyWarning = useCallback(
    (entityName: string, checkType: ContractorComplianceCheckType, expiryDate: string) => {
      if (!projectId) return;

      const warningKey = `${entityName}-${checkType}-${expiryDate}`;
      if (surfacedWarningsRef.current.has(warningKey)) return;
      surfacedWarningsRef.current.add(warningKey);

      const req = COMPLIANCE_CHECK_REQUIREMENTS[checkType];
      const label = req?.label ?? checkType;
      const formattedDate = new Date(expiryDate).toLocaleDateString('en-ZA', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });

      createWorkflowEvent({
        type: 'risk_detected',
        projectId,
        title: `Compliance expiry warning: ${label}`,
        detail: `${entityName} — ${label} expires ${formattedDate}. Renewal required to maintain compliance gate clearance.`,
        priority: 'high',
        assignedRoles: ['architect', 'site_manager'],
        sourceModule: 'projects',
      });
    },
    [projectId],
  );

  /**
   * Surfaces all early warnings for a batch of warnings.
   */
  const surfaceAllWarnings = useCallback(
    (warnings: ExpiryWarning[]) => {
      for (const warning of warnings) {
        surfaceEarlyWarning(warning.entityName, warning.checkType, warning.expiryDate);
      }
    },
    [surfaceEarlyWarning],
  );

  return {
    checkExpiryWarnings: checkExpiryWarningsHook,
    writeComplianceAuditEvent,
    surfaceEarlyWarning,
    surfaceAllWarnings,
  };
}

export default useComplianceIntegration;
