/**
 * Unit tests for staleWarningService
 */
import {
  generateStaleWarning,
  acknowledgeWarning,
  shouldGenerateNewWarning,
  processSupersessionEvent,
  processAcknowledgement,
  getActiveWarnings,
  getActiveWarningCount,
  type StaleSourceWarning,
  type SupersessionEvent,
  type WarningStore,
} from './staleWarningService';

describe('staleWarningService', () => {
  const baseEvent: SupersessionEvent = {
    entityId: 'entity-001',
    entityType: 'procurement_order',
    referencedRevision: 'A',
    newRevision: 'B',
    supersededAt: '2025-01-15T10:00:00.000Z',
    latestDocumentLink: '/documents/doc-001/rev-B',
  };

  describe('generateStaleWarning', () => {
    it('creates an unacknowledged warning from a supersession event', () => {
      const warning = generateStaleWarning(baseEvent);

      expect(warning.entityId).toBe('entity-001');
      expect(warning.entityType).toBe('procurement_order');
      expect(warning.referencedRevision).toBe('A');
      expect(warning.currentRevision).toBe('B');
      expect(warning.supersededAt).toBe('2025-01-15T10:00:00.000Z');
      expect(warning.latestDocumentLink).toBe('/documents/doc-001/rev-B');
      expect(warning.acknowledged).toBe(false);
      expect(warning.acknowledgedAt).toBeUndefined();
      expect(warning.acknowledgedBy).toBeUndefined();
    });
  });

  describe('acknowledgeWarning', () => {
    it('marks a warning as acknowledged with timestamp and userId', () => {
      const warning = generateStaleWarning(baseEvent);
      const acknowledged = acknowledgeWarning(warning, {
        entityId: 'entity-001',
        userId: 'user-001',
        timestamp: '2025-01-16T08:00:00.000Z',
      });

      expect(acknowledged.acknowledged).toBe(true);
      expect(acknowledged.acknowledgedAt).toBe('2025-01-16T08:00:00.000Z');
      expect(acknowledged.acknowledgedBy).toBe('user-001');
    });
  });

  describe('shouldGenerateNewWarning', () => {
    it('returns true when no existing warning', () => {
      expect(shouldGenerateNewWarning(undefined, baseEvent)).toBe(true);
    });

    it('returns false when existing warning is not acknowledged', () => {
      const existing = generateStaleWarning(baseEvent);
      const newEvent: SupersessionEvent = {
        ...baseEvent,
        newRevision: 'C',
        supersededAt: '2025-01-20T10:00:00.000Z',
      };

      expect(shouldGenerateNewWarning(existing, newEvent)).toBe(false);
    });

    it('returns true when acknowledged warning is superseded again after acknowledgement', () => {
      const existing: StaleSourceWarning = {
        ...generateStaleWarning(baseEvent),
        acknowledged: true,
        acknowledgedAt: '2025-01-16T08:00:00.000Z',
        acknowledgedBy: 'user-001',
      };

      const newEvent: SupersessionEvent = {
        ...baseEvent,
        referencedRevision: 'B',
        newRevision: 'C',
        supersededAt: '2025-01-18T10:00:00.000Z', // After acknowledgement
      };

      expect(shouldGenerateNewWarning(existing, newEvent)).toBe(true);
    });

    it('returns false when supersession is before acknowledgement', () => {
      const existing: StaleSourceWarning = {
        ...generateStaleWarning(baseEvent),
        acknowledged: true,
        acknowledgedAt: '2025-01-20T08:00:00.000Z',
        acknowledgedBy: 'user-001',
      };

      const newEvent: SupersessionEvent = {
        ...baseEvent,
        referencedRevision: 'B',
        newRevision: 'C',
        supersededAt: '2025-01-18T10:00:00.000Z', // Before acknowledgement
      };

      expect(shouldGenerateNewWarning(existing, newEvent)).toBe(false);
    });
  });

  describe('processSupersessionEvent', () => {
    it('generates a new warning for unknown entity', () => {
      const store: WarningStore = new Map();
      const result = processSupersessionEvent(store, baseEvent);

      expect(result).not.toBeNull();
      expect(result!.entityId).toBe('entity-001');
      expect(store.has('entity-001')).toBe(true);
    });

    it('skips when entity already has active (unacknowledged) warning', () => {
      const store: WarningStore = new Map();
      store.set('entity-001', generateStaleWarning(baseEvent));

      const newEvent: SupersessionEvent = {
        ...baseEvent,
        newRevision: 'C',
        supersededAt: '2025-01-20T10:00:00.000Z',
      };

      const result = processSupersessionEvent(store, newEvent);
      expect(result).toBeNull();
    });

    it('generates new warning after previous was acknowledged', () => {
      const store: WarningStore = new Map();
      const acknowledged: StaleSourceWarning = {
        ...generateStaleWarning(baseEvent),
        acknowledged: true,
        acknowledgedAt: '2025-01-16T08:00:00.000Z',
        acknowledgedBy: 'user-001',
      };
      store.set('entity-001', acknowledged);

      const newEvent: SupersessionEvent = {
        ...baseEvent,
        referencedRevision: 'B',
        newRevision: 'C',
        supersededAt: '2025-01-18T10:00:00.000Z',
      };

      const result = processSupersessionEvent(store, newEvent);
      expect(result).not.toBeNull();
      expect(result!.currentRevision).toBe('C');
      expect(result!.acknowledged).toBe(false);
    });
  });

  describe('processAcknowledgement', () => {
    it('acknowledges an active warning', () => {
      const store: WarningStore = new Map();
      store.set('entity-001', generateStaleWarning(baseEvent));

      const result = processAcknowledgement(store, {
        entityId: 'entity-001',
        userId: 'user-001',
        timestamp: '2025-01-16T08:00:00.000Z',
      });

      expect(result).not.toBeNull();
      expect(result!.acknowledged).toBe(true);
    });

    it('returns null for unknown entity', () => {
      const store: WarningStore = new Map();
      const result = processAcknowledgement(store, {
        entityId: 'unknown',
        userId: 'user-001',
      });
      expect(result).toBeNull();
    });

    it('returns null for already-acknowledged warning', () => {
      const store: WarningStore = new Map();
      const acknowledged: StaleSourceWarning = {
        ...generateStaleWarning(baseEvent),
        acknowledged: true,
        acknowledgedAt: '2025-01-16T08:00:00.000Z',
        acknowledgedBy: 'user-001',
      };
      store.set('entity-001', acknowledged);

      const result = processAcknowledgement(store, {
        entityId: 'entity-001',
        userId: 'user-002',
      });
      expect(result).toBeNull();
    });
  });

  describe('getActiveWarnings / getActiveWarningCount', () => {
    it('returns only unacknowledged warnings', () => {
      const store: WarningStore = new Map();
      store.set('entity-001', generateStaleWarning(baseEvent));
      store.set('entity-002', {
        ...generateStaleWarning({ ...baseEvent, entityId: 'entity-002' }),
        acknowledged: true,
        acknowledgedAt: '2025-01-16T08:00:00.000Z',
        acknowledgedBy: 'user-001',
      });
      store.set('entity-003', generateStaleWarning({ ...baseEvent, entityId: 'entity-003' }));

      expect(getActiveWarnings(store)).toHaveLength(2);
      expect(getActiveWarningCount(store)).toBe(2);
    });
  });
});
