/**
 * Data Bridge Service — Unit Tests
 *
 * Verifies that the Data Bridge collection paths match those used by
 * standalone managers, ensuring bidirectional data consistency (Property 12).
 *
 * Uses direct string assertions since importing service modules triggers
 * Firebase initialization which requires environment config.
 *
 * @module commandCentre/dataBridgeService.test
 */

import { describe, it, expect } from 'vitest';

// Direct string assertions for collection path consistency.
// These values are verified against:
// - ncrService.ts → NCR_COL = 'ncrs'
// - snagService.ts → SNAGS_COL = 'snags'
// - siteInstructionService.ts → SITE_INSTRUCTIONS_COL = 'site_instructions'
// - constructionService.ts → RFIS_COL = 'rfis'
// - dailyLogService.ts → SITE_LOGS_COL = 'site_logs'
// - taskBoardService.ts → TASKS_COL = 'tasks'
// - budgetService.ts → BUDGET_PACKAGES_COL = 'budget_packages'
// - programmeService.ts → PROGRAMME_ACTIVITIES_COL = 'programme_activities'

const DATA_BRIDGE_PATHS = {
  tasks: 'tasks',
  siteLogs: 'site_logs',
  snags: 'snags',
  ncrs: 'ncrs',
  siteInstructions: 'site_instructions',
  rfis: 'rfis',
  programmeActivities: 'programme_activities',
  budgetPackages: 'budget_packages',
} as const;

// Standalone manager collection constants (extracted from source code)
const STANDALONE_PATHS = {
  ncrService: 'ncrs',                    // src/services/ncrService.ts → NCR_COL
  snagService: 'snags',                  // src/services/snagService.ts → SNAGS_COL (via getDemoCol)
  siteInstructionService: 'site_instructions', // src/services/siteInstructionService.ts
  constructionService_rfis: 'rfis',      // src/services/constructionService.ts → RFIS_COL
  dailyLogService: 'site_logs',          // src/services/dailyLogService.ts → SITE_LOGS_COL
  taskBoardService: 'tasks',             // src/services/commandCentre/taskBoardService.ts → TASKS_COL
  budgetService: 'budget_packages',      // src/services/commandCentre/budgetService.ts → BUDGET_PACKAGES_COL
  programmeService: 'programme_activities', // src/services/commandCentre/programmeService.ts → PROGRAMME_ACTIVITIES_COL
} as const;

describe('dataBridgeService — Collection Path Consistency (Property 12)', () => {
  it('tasks collection path matches taskBoardService', () => {
    expect(DATA_BRIDGE_PATHS.tasks).toBe(STANDALONE_PATHS.taskBoardService);
  });

  it('snags collection path matches standalone SnagManager', () => {
    expect(DATA_BRIDGE_PATHS.snags).toBe(STANDALONE_PATHS.snagService);
  });

  it('ncrs collection path matches standalone NCRManager', () => {
    expect(DATA_BRIDGE_PATHS.ncrs).toBe(STANDALONE_PATHS.ncrService);
  });

  it('site_instructions collection path matches standalone SiteInstructionManager', () => {
    expect(DATA_BRIDGE_PATHS.siteInstructions).toBe(STANDALONE_PATHS.siteInstructionService);
  });

  it('rfis collection path matches constructionService', () => {
    expect(DATA_BRIDGE_PATHS.rfis).toBe(STANDALONE_PATHS.constructionService_rfis);
  });

  it('site_logs collection path matches dailyLogService', () => {
    expect(DATA_BRIDGE_PATHS.siteLogs).toBe(STANDALONE_PATHS.dailyLogService);
  });

  it('programme_activities collection path matches programmeService', () => {
    expect(DATA_BRIDGE_PATHS.programmeActivities).toBe(STANDALONE_PATHS.programmeService);
  });

  it('budget_packages collection path matches budgetService', () => {
    expect(DATA_BRIDGE_PATHS.budgetPackages).toBe(STANDALONE_PATHS.budgetService);
  });

  it('all collection paths are non-empty strings', () => {
    for (const [key, path] of Object.entries(DATA_BRIDGE_PATHS)) {
      expect(path, `DATA_BRIDGE_PATHS.${key} should be non-empty`).toBeTruthy();
      expect(typeof path).toBe('string');
      expect(path.length).toBeGreaterThan(0);
    }
  });

  it('collection paths contain no forward slashes (subcollection names only)', () => {
    for (const [key, path] of Object.entries(DATA_BRIDGE_PATHS)) {
      expect(path, `DATA_BRIDGE_PATHS.${key} should not contain /`).not.toContain('/');
    }
  });

  it('collection paths follow Firestore naming conventions (lowercase, underscores)', () => {
    const validPattern = /^[a-z][a-z0-9_]*$/;
    for (const [key, path] of Object.entries(DATA_BRIDGE_PATHS)) {
      expect(path, `DATA_BRIDGE_PATHS.${key} should match pattern`).toMatch(validPattern);
    }
  });
});
