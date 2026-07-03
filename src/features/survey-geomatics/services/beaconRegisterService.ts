/**
 * Beacon Register Service
 *
 * Manages survey beacons: registration, condition updates,
 * replacements, boundary line definitions, and coordinate management.
 *
 * Factory function pattern with in-memory storage (Maps for beacons and
 * boundary lines), injectable clock for testability.
 *
 * Requirements: 18.1–18.8
 */

import { beaconSchema, boundaryLineSchema } from '../schemas';
import type { BeaconInput, BoundaryLineInput } from '../schemas';
import type { Beacon, BeaconCondition, BeaconReplacement, BoundaryLine } from '../types';

// ─── Callback / Event Types ───────────────────────────────────────────────────

export interface BeaconConditionNotification {
  projectId: string;
  beaconId: string;
  identifier: string;
  condition: 'damaged' | 'missing';
}

export type ConditionNotificationCallback = (notification: BeaconConditionNotification) => void;

// ─── Replacement Input Type ───────────────────────────────────────────────────

export interface BeaconReplacementInput {
  newLatitude?: number;
  newLongitude?: number;
  newY?: number;
  newX?: number;
  replacingSurveyorId: string;
  reason: string;
  evidenceRefs?: string[];
}

// ─── Service Interface ────────────────────────────────────────────────────────

export interface BeaconRegisterService {
  registerBeacon(projectId: string, input: BeaconInput, actorId: string): Beacon;
  updateCondition(projectId: string, beaconId: string, condition: BeaconCondition, actorId: string): Beacon;
  replaceBeacon(projectId: string, beaconId: string, replacement: BeaconReplacementInput, actorId: string): Beacon;
  defineBoundaryLine(projectId: string, input: BoundaryLineInput): BoundaryLine;
  getProjectBeacons(projectId: string): Beacon[];
  getDamagedOrMissing(projectId: string): Beacon[];
}

// ─── Service Options ──────────────────────────────────────────────────────────

export interface BeaconRegisterServiceOptions {
  /** Injectable clock for testability. Defaults to () => new Date(). */
  now?: () => Date;
  /** Called when a beacon condition changes to 'damaged' or 'missing'. */
  onConditionNotification?: ConditionNotificationCallback;
}

// ─── ID Generation ────────────────────────────────────────────────────────────

let beaconIdCounter = 0;
let boundaryIdCounter = 0;

function generateBeaconId(): string {
  beaconIdCounter += 1;
  const timestamp = Date.now().toString(36);
  const counter = beaconIdCounter.toString(36).padStart(4, '0');
  const random = Math.random().toString(36).slice(2, 8);
  return `bcn_${timestamp}_${counter}_${random}`;
}

function generateBoundaryId(): string {
  boundaryIdCounter += 1;
  const timestamp = Date.now().toString(36);
  const counter = boundaryIdCounter.toString(36).padStart(4, '0');
  const random = Math.random().toString(36).slice(2, 8);
  return `bln_${timestamp}_${counter}_${random}`;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createBeaconRegisterService(
  options: BeaconRegisterServiceOptions = {}
): BeaconRegisterService {
  const now = options.now ?? (() => new Date());
  const onConditionNotification = options.onConditionNotification;

  // In-memory stores keyed by projectId
  const beaconStore = new Map<string, Beacon[]>();
  const boundaryStore = new Map<string, BoundaryLine[]>();

  function getProjectBeaconStore(projectId: string): Beacon[] {
    if (!beaconStore.has(projectId)) {
      beaconStore.set(projectId, []);
    }
    return beaconStore.get(projectId)!;
  }

  function getProjectBoundaryStore(projectId: string): BoundaryLine[] {
    if (!boundaryStore.has(projectId)) {
      boundaryStore.set(projectId, []);
    }
    return boundaryStore.get(projectId)!;
  }

  function findBeacon(projectId: string, beaconId: string): { beacon: Beacon; index: number; store: Beacon[] } {
    const store = getProjectBeaconStore(projectId);
    const index = store.findIndex((b) => b.id === beaconId);
    if (index === -1) {
      throw new Error(`Beacon not found: projectId=${projectId}, beaconId=${beaconId}`);
    }
    return { beacon: store[index], index, store };
  }

  // ─── Service Implementation ─────────────────────────────────────────────────

  const service: BeaconRegisterService = {
    registerBeacon(projectId, input, actorId) {
      // Validate with beaconSchema
      const parseResult = beaconSchema.safeParse(input);
      if (!parseResult.success) {
        const fieldErrors = parseResult.error.issues.map(
          (issue) => `${issue.path.join('.')}: ${issue.message}`
        );
        throw new Error(`Validation failed: ${fieldErrors.join('; ')}`);
      }

      const validated = parseResult.data;

      // Check unique identifier per project (Requirement 18.8)
      const beacons = getProjectBeaconStore(projectId);
      const duplicate = beacons.find(
        (b) => b.identifier === validated.identifier
      );
      if (duplicate) {
        throw new Error(
          `Beacon identifier "${validated.identifier}" already exists in project ${projectId}`
        );
      }

      const timestamp = now().toISOString();

      const beacon: Beacon = {
        id: generateBeaconId(),
        projectId,
        identifier: validated.identifier,
        beaconType: validated.beaconType,
        latitude: validated.latitude,
        longitude: validated.longitude,
        yCoordinate: validated.yCoordinate,
        xCoordinate: validated.xCoordinate,
        coordinateSystem: validated.coordinateSystem,
        condition: validated.condition,
        dateLastInspected: validated.dateLastInspected,
        linkedDiagramRef: validated.linkedDiagramRef,
        notes: validated.notes,
        replacementHistory: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      beacons.push(beacon);

      // If initially damaged or missing, trigger notification
      if (validated.condition === 'damaged' || validated.condition === 'missing') {
        if (onConditionNotification) {
          onConditionNotification({
            projectId,
            beaconId: beacon.id,
            identifier: beacon.identifier,
            condition: validated.condition,
          });
        }
      }

      return beacon;
    },

    updateCondition(projectId, beaconId, condition, _actorId) {
      const { beacon, index, store } = findBeacon(projectId, beaconId);
      const timestamp = now().toISOString();

      const updated: Beacon = {
        ...beacon,
        condition,
        updatedAt: timestamp,
      };

      store[index] = updated;

      // Trigger Action Centre notification for damaged/missing (Requirement 18.3)
      if (condition === 'damaged' || condition === 'missing') {
        if (onConditionNotification) {
          onConditionNotification({
            projectId,
            beaconId: updated.id,
            identifier: updated.identifier,
            condition,
          });
        }
      }

      return updated;
    },

    replaceBeacon(projectId, beaconId, replacement, _actorId) {
      const { beacon, index, store } = findBeacon(projectId, beaconId);
      const timestamp = now().toISOString();

      // Build replacement history entry (Requirement 18.4)
      const replacementEntry: BeaconReplacement = {
        date: timestamp,
        newLatitude: replacement.newLatitude,
        newLongitude: replacement.newLongitude,
        newY: replacement.newY,
        newX: replacement.newX,
        replacingSurveyorId: replacement.replacingSurveyorId,
        reason: replacement.reason,
        evidenceRefs: replacement.evidenceRefs ?? [],
      };

      // Update beacon: add to history, set condition to 'replaced',
      // optionally update coordinates if provided
      const updated: Beacon = {
        ...beacon,
        condition: 'replaced' as const,
        replacementHistory: [...beacon.replacementHistory, replacementEntry],
        updatedAt: timestamp,
        // Update coordinates if new ones are provided
        ...(replacement.newLatitude !== undefined && { latitude: replacement.newLatitude }),
        ...(replacement.newLongitude !== undefined && { longitude: replacement.newLongitude }),
        ...(replacement.newY !== undefined && { yCoordinate: replacement.newY }),
        ...(replacement.newX !== undefined && { xCoordinate: replacement.newX }),
      };

      store[index] = updated;
      return updated;
    },

    defineBoundaryLine(projectId, input) {
      // Validate with boundaryLineSchema (min 2 beacons)
      const parseResult = boundaryLineSchema.safeParse(input);
      if (!parseResult.success) {
        const fieldErrors = parseResult.error.issues.map(
          (issue) => `${issue.path.join('.')}: ${issue.message}`
        );
        throw new Error(`Validation failed: ${fieldErrors.join('; ')}`);
      }

      const validated = parseResult.data;

      // Verify all beacon IDs exist in the project (Requirement 18.5)
      const beacons = getProjectBeaconStore(projectId);
      for (const beaconIdentifier of validated.beaconSequence) {
        const exists = beacons.find((b) => b.identifier === beaconIdentifier);
        if (!exists) {
          throw new Error(
            `Beacon identifier "${beaconIdentifier}" not found in project ${projectId}`
          );
        }
      }

      const timestamp = now().toISOString();

      const boundaryLine: BoundaryLine = {
        id: generateBoundaryId(),
        projectId,
        parcelIdentifier: validated.parcelIdentifier,
        beaconSequence: validated.beaconSequence,
        createdAt: timestamp,
      };

      const boundaries = getProjectBoundaryStore(projectId);
      boundaries.push(boundaryLine);

      return boundaryLine;
    },

    getProjectBeacons(projectId) {
      return [...getProjectBeaconStore(projectId)];
    },

    getDamagedOrMissing(projectId) {
      const beacons = getProjectBeaconStore(projectId);
      return beacons.filter(
        (b) => b.condition === 'damaged' || b.condition === 'missing'
      );
    },
  };

  return service;
}
