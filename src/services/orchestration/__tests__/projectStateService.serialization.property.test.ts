// Feature: unified-project-workflow-orchestration, Property 34: Project record serialization round-trip
//
// Property-based test for `projectStateService.serializeRecord` /
// `projectStateService.deserializeRecord` (Task 3.10).
//
// Property 34 (design.md): For any ProjectRecord (including one with an empty
// linked-reference set and one with two or more linked references),
// deserializing the serialized form reproduces the original record with
// identical field values, identical status, and an identical set of linked
// record references.
//
// Validates: Requirements 10.2

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { deserializeRecord, serializeRecord } from '../projectStateService';
import type { ProjectRecord } from '../orchestrationTypes';
import {
  arbProjectRecord,
  arbProjectRecordEmptyLinks,
  arbProjectRecordMultiLinks,
  assertProperty,
} from './generators';

/**
 * Assert that a record survives a serialize → deserialize round-trip with
 * identical field values, identical status, and an identical (same elements,
 * same length) set of linked record references (R10.2).
 */
function expectRoundTrip(record: ProjectRecord): void {
  const restored = deserializeRecord(serializeRecord(record));

  // Every field value is reproduced (deep structural equality).
  expect(restored).toEqual(record);

  // Status is reproduced identically.
  expect(restored.status).toBe(record.status);

  // The linked-reference array matches exactly: same length and same elements
  // in the same positions.
  expect(restored.linkedRecordIds).toEqual(record.linkedRecordIds);
  expect(restored.linkedRecordIds).toHaveLength(record.linkedRecordIds.length);
  expect([...restored.linkedRecordIds].sort()).toEqual([...record.linkedRecordIds].sort());

  // The restored linked-reference set is an independent array (defensive copy),
  // not an alias of the original.
  expect(restored.linkedRecordIds).not.toBe(record.linkedRecordIds);
}

describe('projectStateService — Property 34: project record serialization round-trip', () => {
  it('reproduces any record (mixed linked-reference sets) with identical fields, status, and links', () => {
    assertProperty(
      fc.property(arbProjectRecord(), (record) => {
        expectRoundTrip(record);
      }),
    );
  });

  it('reproduces a record with an empty linked-reference set (R10.2)', () => {
    assertProperty(
      fc.property(arbProjectRecordEmptyLinks(), (record) => {
        expect(record.linkedRecordIds).toHaveLength(0);
        expectRoundTrip(record);
        const restored = deserializeRecord(serializeRecord(record));
        expect(restored.linkedRecordIds).toEqual([]);
      }),
    );
  });

  it('reproduces a record with two or more linked references (R10.2)', () => {
    assertProperty(
      fc.property(arbProjectRecordMultiLinks(), (record) => {
        expect(record.linkedRecordIds.length).toBeGreaterThanOrEqual(2);
        expectRoundTrip(record);
      }),
    );
  });
});
