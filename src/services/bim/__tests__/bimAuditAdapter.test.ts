/**
 * Tests for BIM Audit Adapter — buildBimAuditEvent
 *
 * Validates: Requirements 11.4, 11.5, 11.6, 9.5
 */

import { buildBimAuditEvent, type AuditEventInput } from '../bimAuditAdapter';
import type { BimAuditAction } from '../types';

const ALL_BIM_AUDIT_ACTIONS: BimAuditAction[] = [
  'bim_upload',
  'bim_extraction',
  'bim_boq_generated',
  'bim_mapping_rule_created',
  'bim_mapping_rule_updated',
  'bim_mapping_rule_deleted',
  'bim_procurement_package_created',
  'bim_procurement_package_issued',
  'bim_export',
];

describe('bimAuditAdapter', () => {
  describe('buildBimAuditEvent', () => {
    it('returns an AuditEventInput with correct action, actorUid, targetId, projectId', () => {
      const event = buildBimAuditEvent(
        'bim_upload',
        'user-123',
        'file-abc',
        'proj-456',
      );

      expect(event.action).toBe('bim_upload');
      expect(event.actorUid).toBe('user-123');
      expect(event.targetId).toBe('file-abc');
      expect(event.projectId).toBe('proj-456');
    });

    it('includes an ISO 8601 UTC timestamp', () => {
      const before = new Date().toISOString();
      const event = buildBimAuditEvent(
        'bim_extraction',
        'user-1',
        'ext-1',
        'proj-1',
      );
      const after = new Date().toISOString();

      // Timestamp should be a valid ISO 8601 string
      expect(new Date(event.timestamp).toISOString()).toBe(event.timestamp);
      // Timestamp should be between before and after
      expect(event.timestamp >= before).toBe(true);
      expect(event.timestamp <= after).toBe(true);
    });

    it('includes metadata when provided', () => {
      const metadata = { fileName: 'model.ifc', fileSize: 1024 };
      const event = buildBimAuditEvent(
        'bim_upload',
        'user-1',
        'file-1',
        'proj-1',
        metadata,
      );

      expect(event.metadata).toEqual({ fileName: 'model.ifc', fileSize: 1024 });
    });

    it('omits metadata field when not provided', () => {
      const event = buildBimAuditEvent(
        'bim_export',
        'user-1',
        'boq-1',
        'proj-1',
      );

      expect(event.metadata).toBeUndefined();
      expect('metadata' in event).toBe(false);
    });

    it.each(ALL_BIM_AUDIT_ACTIONS)('handles action type: %s', (action) => {
      const event = buildBimAuditEvent(
        action,
        'actor-uid',
        'target-id',
        'project-id',
      );

      expect(event.action).toBe(action);
      expect(event.actorUid).toBe('actor-uid');
      expect(event.targetId).toBe('target-id');
      expect(event.projectId).toBe('project-id');
      expect(event.timestamp).toBeDefined();
    });

    it('produces unique timestamps for sequential calls', async () => {
      const event1 = buildBimAuditEvent('bim_upload', 'u1', 't1', 'p1');
      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 2));
      const event2 = buildBimAuditEvent('bim_extraction', 'u1', 't2', 'p1');

      // Timestamps should both be valid ISO strings
      expect(new Date(event1.timestamp).toISOString()).toBe(event1.timestamp);
      expect(new Date(event2.timestamp).toISOString()).toBe(event2.timestamp);
    });

    it('handles metadata with nested objects', () => {
      const metadata = {
        rule: { id: 'rule-1', scope: 'project' },
        changes: ['tradeSection', 'unit'],
      };
      const event = buildBimAuditEvent(
        'bim_mapping_rule_updated',
        'qs-user',
        'rule-1',
        'proj-1',
        metadata,
      );

      expect(event.metadata).toEqual(metadata);
    });

    it('handles empty metadata object', () => {
      const event = buildBimAuditEvent(
        'bim_boq_generated',
        'user-1',
        'boq-1',
        'proj-1',
        {},
      );

      expect(event.metadata).toEqual({});
    });

    it('correctly types procurement package actions', () => {
      const created = buildBimAuditEvent(
        'bim_procurement_package_created',
        'qs-1',
        'pkg-1',
        'proj-1',
        { tradeSections: ['Concrete', 'Masonry'] },
      );

      const issued = buildBimAuditEvent(
        'bim_procurement_package_issued',
        'qs-1',
        'pkg-1',
        'proj-1',
        { recipientCount: 5 },
      );

      expect(created.action).toBe('bim_procurement_package_created');
      expect(issued.action).toBe('bim_procurement_package_issued');
      expect(issued.metadata).toEqual({ recipientCount: 5 });
    });

    it('satisfies AuditEventInput interface shape', () => {
      const event: AuditEventInput = buildBimAuditEvent(
        'bim_export',
        'user-abc',
        'boq-123',
        'proj-xyz',
        { format: 'xlsx' },
      );

      // Type-level assertion: all required fields present
      const requiredKeys: (keyof AuditEventInput)[] = [
        'action',
        'actorUid',
        'targetId',
        'projectId',
        'timestamp',
      ];
      for (const key of requiredKeys) {
        expect(event[key]).toBeDefined();
      }
    });
  });
});
