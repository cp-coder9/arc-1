/**
 * Allowlist Service — Unit Tests
 *
 * Tests CRUD operations, validation constraints, entry limits,
 * session snapshot isolation, and unavailable marking.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7
 *
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  addAllowlistEntry,
  removeAllowlistEntry,
  updateAllowlistEntry,
  getAllowlist,
  validateExecutablePath,
  validateSoftwareCategory,
  validateEntry,
  markEntryUnavailable,
  snapshotAllowlistForSession,
  getActiveSessionAllowlist,
  clearSessionSnapshot,
  _clearAllData,
  MAX_ALLOWLIST_ENTRIES,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_EXECUTABLE_PATH_LENGTH,
  SOFTWARE_CATEGORIES,
  type AllowlistEntryInput,
} from '../allowlistService';

// ─── Test Helpers ───────────────────────────────────────────────────────────────

function createValidEntry(overrides?: Partial<AllowlistEntryInput>): AllowlistEntryInput {
  return {
    displayName: 'AutoCAD 2024',
    executablePath: 'C:\\Program Files\\Autodesk\\AutoCAD 2024\\acad.exe',
    softwareCategory: 'cad',
    ...overrides,
  };
}

const TEST_HOST_ID = 'host-test-001';

// ─── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  _clearAllData();
});

// ─── Executable Path Validation ─────────────────────────────────────────────────

describe('validateExecutablePath', () => {
  it('should accept a valid drive-letter .exe path', () => {
    expect(validateExecutablePath('C:\\Program Files\\App\\app.exe')).toBe(true);
  });

  it('should accept a UNC path ending in .exe', () => {
    expect(validateExecutablePath('\\\\server\\share\\app.exe')).toBe(true);
  });

  it('should accept case-insensitive .exe extension', () => {
    expect(validateExecutablePath('C:\\Apps\\MyApp.EXE')).toBe(true);
    expect(validateExecutablePath('D:\\Tools\\tool.Exe')).toBe(true);
  });

  it('should reject empty path', () => {
    expect(validateExecutablePath('')).toBe(false);
  });

  it('should reject path not ending in .exe', () => {
    expect(validateExecutablePath('C:\\Program Files\\App\\app.dll')).toBe(false);
    expect(validateExecutablePath('C:\\Program Files\\App\\app.bat')).toBe(false);
    expect(validateExecutablePath('C:\\Program Files\\App\\app')).toBe(false);
  });

  it('should reject path without valid Windows prefix', () => {
    expect(validateExecutablePath('/usr/bin/app.exe')).toBe(false);
    expect(validateExecutablePath('app.exe')).toBe(false);
    expect(validateExecutablePath('./relative/path.exe')).toBe(false);
  });

  it('should reject path exceeding 260 characters', () => {
    const longPath = 'C:\\' + 'a'.repeat(254) + '.exe'; // 3 + 254 + 4 = 261
    expect(longPath.length).toBeGreaterThan(MAX_EXECUTABLE_PATH_LENGTH);
    expect(validateExecutablePath(longPath)).toBe(false);
  });

  it('should accept path at exactly 260 characters', () => {
    // C:\ = 3, .exe = 4, so middle = 260 - 3 - 4 = 253
    const path = 'C:\\' + 'a'.repeat(253) + '.exe';
    expect(path.length).toBe(260);
    expect(validateExecutablePath(path)).toBe(true);
  });
});

// ─── Software Category Validation ───────────────────────────────────────────────

describe('validateSoftwareCategory', () => {
  it('should accept all platform-defined categories', () => {
    for (const cat of SOFTWARE_CATEGORIES) {
      expect(validateSoftwareCategory(cat)).toBe(true);
    }
  });

  it('should reject invalid categories', () => {
    expect(validateSoftwareCategory('gaming')).toBe(false);
    expect(validateSoftwareCategory('')).toBe(false);
    expect(validateSoftwareCategory('CAD')).toBe(false); // case-sensitive
  });
});

// ─── Entry Validation ───────────────────────────────────────────────────────────

describe('validateEntry', () => {
  it('should return null for a fully valid entry', () => {
    const result = validateEntry(createValidEntry());
    expect(result).toBeNull();
  });

  it('should reject empty display name', () => {
    const result = validateEntry(createValidEntry({ displayName: '' }));
    expect(result).not.toBeNull();
    expect(result!.message).toContain('Display name');
  });

  it('should reject whitespace-only display name', () => {
    const result = validateEntry(createValidEntry({ displayName: '   ' }));
    expect(result).not.toBeNull();
  });

  it('should reject display name exceeding 100 characters', () => {
    const longName = 'A'.repeat(101);
    const result = validateEntry(createValidEntry({ displayName: longName }));
    expect(result).not.toBeNull();
    expect(result!.details?.max).toBe(MAX_DISPLAY_NAME_LENGTH);
  });

  it('should accept display name at exactly 100 characters', () => {
    const name = 'A'.repeat(100);
    const result = validateEntry(createValidEntry({ displayName: name }));
    expect(result).toBeNull();
  });

  it('should reject invalid executable path', () => {
    const result = validateEntry(createValidEntry({ executablePath: '/invalid/path.txt' }));
    expect(result).not.toBeNull();
    expect(result!.message).toContain('.exe');
  });

  it('should reject invalid software category', () => {
    const result = validateEntry(createValidEntry({ softwareCategory: 'gaming' }));
    expect(result).not.toBeNull();
    expect(result!.message).toContain('category');
  });
});

// ─── addAllowlistEntry ──────────────────────────────────────────────────────────

describe('addAllowlistEntry', () => {
  it('should add a valid entry and return it with generated fields', () => {
    const entry = createValidEntry();
    const result = addAllowlistEntry(TEST_HOST_ID, entry);

    expect(result.appId).toBeDefined();
    expect(result.appId.length).toBeGreaterThan(0);
    expect(result.hostId).toBe(TEST_HOST_ID);
    expect(result.displayName).toBe(entry.displayName);
    expect(result.executablePath).toBe(entry.executablePath);
    expect(result.softwareCategory).toBe(entry.softwareCategory);
    expect(result.validationStatus).toBe('valid');
    expect(result.lastValidatedTimestamp).toBeDefined();
  });

  it('should trim display name and path whitespace', () => {
    const entry = createValidEntry({
      displayName: '  Revit 2024  ',
      executablePath: 'C:\\Program Files\\Autodesk\\Revit.exe',
    });
    const result = addAllowlistEntry(TEST_HOST_ID, entry);

    expect(result.displayName).toBe('Revit 2024');
  });

  it('should reject when host ID is empty', () => {
    expect(() => addAllowlistEntry('', createValidEntry())).toThrow();
  });

  it('should reject when max entries (20) would be exceeded', () => {
    // Add 20 entries
    for (let i = 0; i < MAX_ALLOWLIST_ENTRIES; i++) {
      addAllowlistEntry(TEST_HOST_ID, createValidEntry({
        displayName: `App ${i}`,
        executablePath: `C:\\Apps\\app${i}.exe`,
      }));
    }

    // 21st should fail
    expect(() => addAllowlistEntry(TEST_HOST_ID, createValidEntry({
      displayName: 'App 21',
      executablePath: 'C:\\Apps\\app21.exe',
    }))).toThrow();

    try {
      addAllowlistEntry(TEST_HOST_ID, createValidEntry({
        displayName: 'App 21',
        executablePath: 'C:\\Apps\\app21.exe',
      }));
    } catch (error: any) {
      expect(error.message).toContain('Maximum allowlist size');
      expect(error.details?.max).toBe(20);
    }
  });

  it('should reject invalid entries (display name too long)', () => {
    expect(() => addAllowlistEntry(TEST_HOST_ID, createValidEntry({
      displayName: 'A'.repeat(101),
    }))).toThrow();
  });

  it('should reject invalid entries (bad exe path)', () => {
    expect(() => addAllowlistEntry(TEST_HOST_ID, createValidEntry({
      executablePath: '/not/windows/path.txt',
    }))).toThrow();
  });

  it('should reject invalid entries (bad category)', () => {
    expect(() => addAllowlistEntry(TEST_HOST_ID, createValidEntry({
      softwareCategory: 'invalid_category',
    }))).toThrow();
  });

  it('should allow entries for different hosts independently', () => {
    addAllowlistEntry('host-A', createValidEntry({ displayName: 'App A' }));
    addAllowlistEntry('host-B', createValidEntry({ displayName: 'App B' }));

    expect(getAllowlist('host-A')).toHaveLength(1);
    expect(getAllowlist('host-B')).toHaveLength(1);
  });
});

// ─── removeAllowlistEntry ───────────────────────────────────────────────────────

describe('removeAllowlistEntry', () => {
  it('should remove an existing entry', () => {
    const app = addAllowlistEntry(TEST_HOST_ID, createValidEntry());
    expect(getAllowlist(TEST_HOST_ID)).toHaveLength(1);

    removeAllowlistEntry(TEST_HOST_ID, app.appId);
    expect(getAllowlist(TEST_HOST_ID)).toHaveLength(0);
  });

  it('should throw when entry does not exist', () => {
    expect(() => removeAllowlistEntry(TEST_HOST_ID, 'nonexistent-id')).toThrow();

    try {
      removeAllowlistEntry(TEST_HOST_ID, 'nonexistent-id');
    } catch (error: any) {
      expect(error.message).toContain('not found');
    }
  });

  it('should throw when host ID is empty', () => {
    expect(() => removeAllowlistEntry('', 'some-id')).toThrow();
  });

  it('should throw when app ID is empty', () => {
    expect(() => removeAllowlistEntry(TEST_HOST_ID, '')).toThrow();
  });

  it('should not affect other entries when removing one', () => {
    const app1 = addAllowlistEntry(TEST_HOST_ID, createValidEntry({ displayName: 'App 1' }));
    const app2 = addAllowlistEntry(TEST_HOST_ID, createValidEntry({ displayName: 'App 2' }));

    removeAllowlistEntry(TEST_HOST_ID, app1.appId);

    const remaining = getAllowlist(TEST_HOST_ID);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].appId).toBe(app2.appId);
  });
});

// ─── updateAllowlistEntry ───────────────────────────────────────────────────────

describe('updateAllowlistEntry', () => {
  it('should update display name only', () => {
    const app = addAllowlistEntry(TEST_HOST_ID, createValidEntry());
    const updated = updateAllowlistEntry(TEST_HOST_ID, app.appId, {
      displayName: 'Updated Name',
    });

    expect(updated.displayName).toBe('Updated Name');
    expect(updated.executablePath).toBe(app.executablePath);
    expect(updated.softwareCategory).toBe(app.softwareCategory);
  });

  it('should update executable path and refresh timestamp', () => {
    const app = addAllowlistEntry(TEST_HOST_ID, createValidEntry());

    const updated = updateAllowlistEntry(TEST_HOST_ID, app.appId, {
      executablePath: 'C:\\NewPath\\new.exe',
    });

    expect(updated.executablePath).toBe('C:\\NewPath\\new.exe');
    // When path changes, lastValidatedTimestamp should be set (not undefined)
    expect(updated.lastValidatedTimestamp).toBeDefined();
    expect((updated.lastValidatedTimestamp as any).seconds).toBeGreaterThan(0);
  });

  it('should update software category', () => {
    const app = addAllowlistEntry(TEST_HOST_ID, createValidEntry({ softwareCategory: 'cad' }));
    const updated = updateAllowlistEntry(TEST_HOST_ID, app.appId, {
      softwareCategory: 'bim',
    });

    expect(updated.softwareCategory).toBe('bim');
  });

  it('should reject invalid updates (name too long)', () => {
    const app = addAllowlistEntry(TEST_HOST_ID, createValidEntry());

    expect(() => updateAllowlistEntry(TEST_HOST_ID, app.appId, {
      displayName: 'X'.repeat(101),
    })).toThrow();
  });

  it('should reject invalid updates (bad path)', () => {
    const app = addAllowlistEntry(TEST_HOST_ID, createValidEntry());

    expect(() => updateAllowlistEntry(TEST_HOST_ID, app.appId, {
      executablePath: 'invalid-path',
    })).toThrow();
  });

  it('should reject invalid updates (bad category)', () => {
    const app = addAllowlistEntry(TEST_HOST_ID, createValidEntry());

    expect(() => updateAllowlistEntry(TEST_HOST_ID, app.appId, {
      softwareCategory: 'nonexistent',
    })).toThrow();
  });

  it('should throw when entry does not exist', () => {
    expect(() => updateAllowlistEntry(TEST_HOST_ID, 'nonexistent-id', {
      displayName: 'New Name',
    })).toThrow();
  });
});

// ─── getAllowlist ───────────────────────────────────────────────────────────────

describe('getAllowlist', () => {
  it('should return empty array for unknown host', () => {
    expect(getAllowlist('unknown-host')).toEqual([]);
  });

  it('should return empty array for empty host ID', () => {
    expect(getAllowlist('')).toEqual([]);
  });

  it('should return all entries for a host', () => {
    addAllowlistEntry(TEST_HOST_ID, createValidEntry({ displayName: 'App 1' }));
    addAllowlistEntry(TEST_HOST_ID, createValidEntry({ displayName: 'App 2' }));
    addAllowlistEntry(TEST_HOST_ID, createValidEntry({ displayName: 'App 3' }));

    const list = getAllowlist(TEST_HOST_ID);
    expect(list).toHaveLength(3);
  });

  it('should return a copy (mutations do not affect store)', () => {
    addAllowlistEntry(TEST_HOST_ID, createValidEntry());
    const list = getAllowlist(TEST_HOST_ID);

    list.push({} as any); // Mutate the returned array

    expect(getAllowlist(TEST_HOST_ID)).toHaveLength(1);
  });
});

// ─── markEntryUnavailable ───────────────────────────────────────────────────────

describe('markEntryUnavailable', () => {
  it('should mark an existing entry as unavailable', () => {
    const app = addAllowlistEntry(TEST_HOST_ID, createValidEntry());
    expect(app.validationStatus).toBe('valid');

    const marked = markEntryUnavailable(TEST_HOST_ID, app.appId);
    expect(marked.validationStatus).toBe('unavailable');
    expect(marked.appId).toBe(app.appId);
  });

  it('should update the lastValidatedTimestamp', () => {
    const app = addAllowlistEntry(TEST_HOST_ID, createValidEntry());
    const marked = markEntryUnavailable(TEST_HOST_ID, app.appId);

    // Timestamp should be refreshed
    expect(marked.lastValidatedTimestamp).toBeDefined();
  });

  it('should throw when entry does not exist', () => {
    expect(() => markEntryUnavailable(TEST_HOST_ID, 'nonexistent-id')).toThrow();
  });

  it('should throw when host ID is empty', () => {
    expect(() => markEntryUnavailable('', 'some-id')).toThrow();
  });

  it('should persist the change in the allowlist', () => {
    const app = addAllowlistEntry(TEST_HOST_ID, createValidEntry());
    markEntryUnavailable(TEST_HOST_ID, app.appId);

    const list = getAllowlist(TEST_HOST_ID);
    expect(list[0].validationStatus).toBe('unavailable');
  });
});

// ─── Session Snapshot (Requirement 2.5: changes apply to future sessions only) ─

describe('Session Snapshot', () => {
  it('should snapshot valid entries at session start', () => {
    addAllowlistEntry(TEST_HOST_ID, createValidEntry({ displayName: 'App A' }));
    addAllowlistEntry(TEST_HOST_ID, createValidEntry({ displayName: 'App B' }));

    const snapshot = snapshotAllowlistForSession(TEST_HOST_ID, 'session-001');
    expect(snapshot).toHaveLength(2);
  });

  it('should exclude unavailable entries from snapshot', () => {
    const app1 = addAllowlistEntry(TEST_HOST_ID, createValidEntry({ displayName: 'App A' }));
    addAllowlistEntry(TEST_HOST_ID, createValidEntry({ displayName: 'App B' }));
    markEntryUnavailable(TEST_HOST_ID, app1.appId);

    const snapshot = snapshotAllowlistForSession(TEST_HOST_ID, 'session-002');
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0].displayName).toBe('App B');
  });

  it('should not be affected by subsequent allowlist changes', () => {
    addAllowlistEntry(TEST_HOST_ID, createValidEntry({ displayName: 'App A' }));

    // Take snapshot
    snapshotAllowlistForSession(TEST_HOST_ID, 'session-003');

    // Add more entries after snapshot
    addAllowlistEntry(TEST_HOST_ID, createValidEntry({ displayName: 'App B' }));
    addAllowlistEntry(TEST_HOST_ID, createValidEntry({ displayName: 'App C' }));

    // Snapshot should still show only original entries
    const frozen = getActiveSessionAllowlist('session-003');
    expect(frozen).toHaveLength(1);
    expect(frozen![0].displayName).toBe('App A');
  });

  it('should return null for non-existent session', () => {
    expect(getActiveSessionAllowlist('nonexistent-session')).toBeNull();
  });

  it('should return null for empty session ID', () => {
    expect(getActiveSessionAllowlist('')).toBeNull();
  });

  it('should be cleared when session ends', () => {
    addAllowlistEntry(TEST_HOST_ID, createValidEntry());
    snapshotAllowlistForSession(TEST_HOST_ID, 'session-004');

    clearSessionSnapshot('session-004');
    expect(getActiveSessionAllowlist('session-004')).toBeNull();
  });

  it('should return a copy (mutations do not affect snapshot)', () => {
    addAllowlistEntry(TEST_HOST_ID, createValidEntry());
    snapshotAllowlistForSession(TEST_HOST_ID, 'session-005');

    const frozen = getActiveSessionAllowlist('session-005');
    frozen!.push({} as any); // Mutate

    expect(getActiveSessionAllowlist('session-005')).toHaveLength(1);
  });
});

// ─── Integration: Full CRUD Workflow ────────────────────────────────────────────

describe('Full CRUD Workflow', () => {
  it('should support add → update → get → remove lifecycle', () => {
    // Add
    const app = addAllowlistEntry(TEST_HOST_ID, createValidEntry({
      displayName: 'Revit',
      softwareCategory: 'bim',
    }));
    expect(getAllowlist(TEST_HOST_ID)).toHaveLength(1);

    // Update
    const updated = updateAllowlistEntry(TEST_HOST_ID, app.appId, {
      displayName: 'Revit 2025',
    });
    expect(updated.displayName).toBe('Revit 2025');
    expect(updated.softwareCategory).toBe('bim');

    // Get
    const list = getAllowlist(TEST_HOST_ID);
    expect(list[0].displayName).toBe('Revit 2025');

    // Remove
    removeAllowlistEntry(TEST_HOST_ID, app.appId);
    expect(getAllowlist(TEST_HOST_ID)).toHaveLength(0);
  });

  it('should correctly count entries after mixed operations', () => {
    const app1 = addAllowlistEntry(TEST_HOST_ID, createValidEntry({ displayName: 'App 1' }));
    addAllowlistEntry(TEST_HOST_ID, createValidEntry({ displayName: 'App 2' }));
    addAllowlistEntry(TEST_HOST_ID, createValidEntry({ displayName: 'App 3' }));

    removeAllowlistEntry(TEST_HOST_ID, app1.appId);

    // Should be able to add back to max since one was removed
    expect(getAllowlist(TEST_HOST_ID)).toHaveLength(2);

    // Fill up to 20
    for (let i = 3; i <= 20; i++) {
      addAllowlistEntry(TEST_HOST_ID, createValidEntry({
        displayName: `App ${i}`,
        executablePath: `C:\\Apps\\app${i}.exe`,
      }));
    }

    expect(getAllowlist(TEST_HOST_ID)).toHaveLength(20);

    // 21st should still fail
    expect(() => addAllowlistEntry(TEST_HOST_ID, createValidEntry({
      displayName: 'App overflow',
      executablePath: 'C:\\Apps\\overflow.exe',
    }))).toThrow();
  });
});
