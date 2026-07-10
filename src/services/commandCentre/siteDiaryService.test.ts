/**
 * Unit tests for siteDiaryService
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const createRichSiteLogMock = vi.fn();
const getRichSiteLogsMock = vi.fn();

vi.mock('@/services/dailyLogService', () => ({
  createRichSiteLog: (...args: unknown[]) => createRichSiteLogMock(...args),
  getRichSiteLogs: (...args: unknown[]) => getRichSiteLogsMock(...args),
}));

vi.mock('@/lib/firebase', () => ({
  db: { name: 'test-db' },
  OperationType: {
    CREATE: 'create',
    UPDATE: 'update',
    DELETE: 'delete',
    LIST: 'list',
    GET: 'get',
    WRITE: 'write',
  },
  handleFirestoreError: vi.fn((error: unknown) => { throw error; }),
}));

vi.mock('@/demo-seed/demoFirestore', () => ({
  getDemoDoc: (...segments: string[]) => ({ path: segments.join('/'), type: 'doc' }),
  getDemoCol: (...segments: string[]) => ({ path: segments.join('/'), type: 'col' }),
}));

import {
  createEntry,
  getEntries,
  getDelaySurfaceEvents,
  detectDelayMention,
  extractDelaySurfaceEvents,
  sortEntriesReverseChronological,
  mapSiteLogToDiaryEntry,
  mapWeatherToSiteLogWeather,
  VALID_WEATHER_OPTIONS,
} from './siteDiaryService';
import type { SiteDiaryEntry } from './siteDiaryService';
import type { SiteLog } from '@/types';

describe('siteDiaryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Pure Function Tests ────────────────────────────────────────────────────

  describe('detectDelayMention', () => {
    it('returns false for undefined input', () => {
      expect(detectDelayMention(undefined)).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(detectDelayMention('')).toBe(false);
    });

    it('returns false for whitespace-only string', () => {
      expect(detectDelayMention('   ')).toBe(false);
    });

    it('returns true for non-empty issues/delays text', () => {
      expect(detectDelayMention('Rain caused 2-hour delay')).toBe(true);
    });

    it('returns true for any non-empty content', () => {
      expect(detectDelayMention('Minor issue with materials')).toBe(true);
    });
  });

  describe('mapWeatherToSiteLogWeather', () => {
    it('maps sunny to sunny', () => {
      expect(mapWeatherToSiteLogWeather('sunny')).toBe('sunny');
    });

    it('maps cloudy to cloudy', () => {
      expect(mapWeatherToSiteLogWeather('cloudy')).toBe('cloudy');
    });

    it('maps rainy to rainy', () => {
      expect(mapWeatherToSiteLogWeather('rainy')).toBe('rainy');
    });

    it('maps stormy to stormy', () => {
      expect(mapWeatherToSiteLogWeather('stormy')).toBe('stormy');
    });

    it('maps windy to cloudy', () => {
      expect(mapWeatherToSiteLogWeather('windy')).toBe('cloudy');
    });

    it('maps cold to cloudy', () => {
      expect(mapWeatherToSiteLogWeather('cold')).toBe('cloudy');
    });

    it('maps hot to sunny', () => {
      expect(mapWeatherToSiteLogWeather('hot')).toBe('sunny');
    });

    it('defaults unknown values to sunny', () => {
      expect(mapWeatherToSiteLogWeather('tornado')).toBe('sunny');
    });
  });

  describe('VALID_WEATHER_OPTIONS', () => {
    it('contains all 7 valid weather types', () => {
      expect(VALID_WEATHER_OPTIONS).toHaveLength(7);
      expect(VALID_WEATHER_OPTIONS).toContain('sunny');
      expect(VALID_WEATHER_OPTIONS).toContain('cloudy');
      expect(VALID_WEATHER_OPTIONS).toContain('rainy');
      expect(VALID_WEATHER_OPTIONS).toContain('windy');
      expect(VALID_WEATHER_OPTIONS).toContain('stormy');
      expect(VALID_WEATHER_OPTIONS).toContain('cold');
      expect(VALID_WEATHER_OPTIONS).toContain('hot');
    });
  });

  describe('mapSiteLogToDiaryEntry', () => {
    const baseSiteLog: SiteLog = {
      id: 'log-1',
      projectId: 'proj-1',
      date: '2026-06-15',
      weather: 'sunny',
      workDescription: 'Foundation pouring completed',
      labourCount: 12,
      plantOnSite: [],
      deliveries: [],
      visitors: [],
      safetyNotes: [],
      delayNotes: [],
      materialsUsed: [],
      issues: [],
      evidenceIds: [],
      photos: [],
      status: 'submitted',
      createdBy: 'user-1',
      createdAt: '2026-06-15T08:00:00Z',
    };

    it('maps a basic site log to diary entry', () => {
      const entry = mapSiteLogToDiaryEntry(baseSiteLog);
      expect(entry.id).toBe('log-1');
      expect(entry.projectId).toBe('proj-1');
      expect(entry.date).toBe('2026-06-15');
      expect(entry.weather).toBe('sunny');
      expect(entry.workforceCount).toBe(12);
      expect(entry.workCompleted).toBe('Foundation pouring completed');
      expect(entry.issuesDelays).toBeUndefined();
      expect(entry.mentionsDelays).toBe(false);
      expect(entry.createdBy).toBe('user-1');
      expect(entry.createdAt).toBe('2026-06-15T08:00:00Z');
    });

    it('combines delay notes and issues into issuesDelays', () => {
      const logWithDelays: SiteLog = {
        ...baseSiteLog,
        delayNotes: ['Rain delay 2hrs'],
        issues: ['Material shortage'],
      };
      const entry = mapSiteLogToDiaryEntry(logWithDelays);
      expect(entry.issuesDelays).toBe('Rain delay 2hrs; Material shortage');
      expect(entry.mentionsDelays).toBe(true);
    });

    it('handles missing labourCount by defaulting to 0', () => {
      const logNoLabour: SiteLog = {
        ...baseSiteLog,
        labourCount: undefined,
      };
      const entry = mapSiteLogToDiaryEntry(logNoLabour);
      expect(entry.workforceCount).toBe(0);
    });

    it('handles delay notes only', () => {
      const logDelaysOnly: SiteLog = {
        ...baseSiteLog,
        delayNotes: ['Permit delay'],
        issues: [],
      };
      const entry = mapSiteLogToDiaryEntry(logDelaysOnly);
      expect(entry.issuesDelays).toBe('Permit delay');
      expect(entry.mentionsDelays).toBe(true);
    });

    it('handles issues only', () => {
      const logIssuesOnly: SiteLog = {
        ...baseSiteLog,
        delayNotes: [],
        issues: ['Equipment breakdown'],
      };
      const entry = mapSiteLogToDiaryEntry(logIssuesOnly);
      expect(entry.issuesDelays).toBe('Equipment breakdown');
      expect(entry.mentionsDelays).toBe(true);
    });
  });

  describe('sortEntriesReverseChronological', () => {
    it('sorts entries by date descending', () => {
      const entries: SiteDiaryEntry[] = [
        { id: '1', projectId: 'p1', date: '2026-06-13', weather: 'sunny', workforceCount: 5, workCompleted: 'A', createdBy: 'u1', createdAt: '2026-06-13T08:00:00Z', mentionsDelays: false },
        { id: '2', projectId: 'p1', date: '2026-06-15', weather: 'cloudy', workforceCount: 8, workCompleted: 'B', createdBy: 'u1', createdAt: '2026-06-15T08:00:00Z', mentionsDelays: false },
        { id: '3', projectId: 'p1', date: '2026-06-14', weather: 'rainy', workforceCount: 3, workCompleted: 'C', createdBy: 'u1', createdAt: '2026-06-14T08:00:00Z', mentionsDelays: false },
      ];
      const sorted = sortEntriesReverseChronological(entries);
      expect(sorted[0].date).toBe('2026-06-15');
      expect(sorted[1].date).toBe('2026-06-14');
      expect(sorted[2].date).toBe('2026-06-13');
    });

    it('stable sorts entries with same date by createdAt descending', () => {
      const entries: SiteDiaryEntry[] = [
        { id: '1', projectId: 'p1', date: '2026-06-15', weather: 'sunny', workforceCount: 5, workCompleted: 'First', createdBy: 'u1', createdAt: '2026-06-15T07:00:00Z', mentionsDelays: false },
        { id: '2', projectId: 'p1', date: '2026-06-15', weather: 'cloudy', workforceCount: 8, workCompleted: 'Second', createdBy: 'u1', createdAt: '2026-06-15T14:00:00Z', mentionsDelays: false },
      ];
      const sorted = sortEntriesReverseChronological(entries);
      expect(sorted[0].workCompleted).toBe('Second'); // later createdAt first
      expect(sorted[1].workCompleted).toBe('First');
    });

    it('returns empty array for empty input', () => {
      expect(sortEntriesReverseChronological([])).toEqual([]);
    });

    it('does not mutate original array', () => {
      const entries: SiteDiaryEntry[] = [
        { id: '1', projectId: 'p1', date: '2026-06-13', weather: 'sunny', workforceCount: 5, workCompleted: 'A', createdBy: 'u1', createdAt: '2026-06-13T08:00:00Z', mentionsDelays: false },
        { id: '2', projectId: 'p1', date: '2026-06-15', weather: 'cloudy', workforceCount: 8, workCompleted: 'B', createdBy: 'u1', createdAt: '2026-06-15T08:00:00Z', mentionsDelays: false },
      ];
      const original = [...entries];
      sortEntriesReverseChronological(entries);
      expect(entries).toEqual(original);
    });
  });

  describe('extractDelaySurfaceEvents', () => {
    it('returns events only for entries that mention delays', () => {
      const entries: SiteDiaryEntry[] = [
        { id: '1', projectId: 'p1', date: '2026-06-15', weather: 'sunny', workforceCount: 10, workCompleted: 'Work A', createdBy: 'u1', createdAt: '2026-06-15T08:00:00Z', mentionsDelays: false },
        { id: '2', projectId: 'p1', date: '2026-06-16', weather: 'rainy', workforceCount: 3, workCompleted: 'Work B', issuesDelays: 'Rain delay 3hrs', createdBy: 'u1', createdAt: '2026-06-16T08:00:00Z', mentionsDelays: true },
        { id: '3', projectId: 'p1', date: '2026-06-17', weather: 'cloudy', workforceCount: 8, workCompleted: 'Work C', issuesDelays: 'Material shortage', createdBy: 'u1', createdAt: '2026-06-17T08:00:00Z', mentionsDelays: true },
      ];

      const events = extractDelaySurfaceEvents(entries);
      expect(events).toHaveLength(2);
      expect(events[0].entryId).toBe('2');
      expect(events[0].summary).toBe('Rain delay 3hrs');
      expect(events[0].targets).toEqual(['programme_engine', 'risk_register']);
      expect(events[1].entryId).toBe('3');
      expect(events[1].summary).toBe('Material shortage');
    });

    it('returns empty array when no entries have delays', () => {
      const entries: SiteDiaryEntry[] = [
        { id: '1', projectId: 'p1', date: '2026-06-15', weather: 'sunny', workforceCount: 10, workCompleted: 'Work A', createdBy: 'u1', createdAt: '2026-06-15T08:00:00Z', mentionsDelays: false },
      ];
      expect(extractDelaySurfaceEvents(entries)).toEqual([]);
    });

    it('returns empty array for empty input', () => {
      expect(extractDelaySurfaceEvents([])).toEqual([]);
    });
  });

  // ── createEntry ────────────────────────────────────────────────────────────

  describe('createEntry', () => {
    it('creates a diary entry with valid data and returns it', async () => {
      createRichSiteLogMock.mockResolvedValue('log-new-1');

      const result = await createEntry('proj-1', {
        weather: 'sunny',
        workforceCount: 15,
        workCompleted: 'Completed roofing on Block A',
        createdBy: 'user-1',
      });

      expect(result.id).toBe('log-new-1');
      expect(result.projectId).toBe('proj-1');
      expect(result.weather).toBe('sunny');
      expect(result.workforceCount).toBe(15);
      expect(result.workCompleted).toBe('Completed roofing on Block A');
      expect(result.issuesDelays).toBeUndefined();
      expect(result.mentionsDelays).toBe(false);
      expect(result.createdBy).toBe('user-1');
      expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result.createdAt).toBeDefined();
      expect(createRichSiteLogMock).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'proj-1',
          weather: 'sunny',
          workDescription: 'Completed roofing on Block A',
          labourCount: 15,
          createdBy: 'user-1',
        }),
      );
    });

    it('creates entry with issues/delays and flags mentionsDelays', async () => {
      createRichSiteLogMock.mockResolvedValue('log-new-2');

      const result = await createEntry('proj-1', {
        weather: 'rainy',
        workforceCount: 5,
        workCompleted: 'Limited work due to rain',
        issuesDelays: 'Heavy rain caused 4-hour delay',
        createdBy: 'user-1',
      });

      expect(result.issuesDelays).toBe('Heavy rain caused 4-hour delay');
      expect(result.mentionsDelays).toBe(true);
      expect(createRichSiteLogMock).toHaveBeenCalledWith(
        expect.objectContaining({
          delayNotes: ['Heavy rain caused 4-hour delay'],
          issues: ['Heavy rain caused 4-hour delay'],
        }),
      );
    });

    it('rejects when projectId is empty', async () => {
      await expect(
        createEntry('', {
          weather: 'sunny',
          workforceCount: 10,
          workCompleted: 'Work done',
          createdBy: 'user-1',
        }),
      ).rejects.toThrow('projectId is required');
    });

    it('rejects when weather is empty (validation error)', async () => {
      await expect(
        createEntry('proj-1', {
          weather: '',
          workforceCount: 10,
          workCompleted: 'Work done',
          createdBy: 'user-1',
        }),
      ).rejects.toThrow();
    });

    it('rejects when workCompleted is empty (validation error)', async () => {
      await expect(
        createEntry('proj-1', {
          weather: 'sunny',
          workforceCount: 10,
          workCompleted: '',
          createdBy: 'user-1',
        }),
      ).rejects.toThrow();
    });

    it('rejects when workforceCount is negative (validation error)', async () => {
      await expect(
        createEntry('proj-1', {
          weather: 'sunny',
          workforceCount: -1,
          workCompleted: 'Work done',
          createdBy: 'user-1',
        }),
      ).rejects.toThrow();
    });

    it('maps extended weather values when persisting', async () => {
      createRichSiteLogMock.mockResolvedValue('log-new-3');

      await createEntry('proj-1', {
        weather: 'hot',
        workforceCount: 10,
        workCompleted: 'External painting',
        createdBy: 'user-1',
      });

      expect(createRichSiteLogMock).toHaveBeenCalledWith(
        expect.objectContaining({
          weather: 'sunny', // hot maps to sunny
        }),
      );
    });

    it('propagates Firestore errors from dailyLogService', async () => {
      const error = new Error('Firestore write failed');
      createRichSiteLogMock.mockRejectedValue(error);

      await expect(
        createEntry('proj-1', {
          weather: 'cloudy',
          workforceCount: 8,
          workCompleted: 'Brick laying',
          createdBy: 'user-1',
        }),
      ).rejects.toThrow('Firestore write failed');
    });
  });

  // ── getEntries ─────────────────────────────────────────────────────────────

  describe('getEntries', () => {
    it('returns entries in reverse chronological order', async () => {
      const mockLogs: SiteLog[] = [
        {
          id: 'log-1',
          projectId: 'proj-1',
          date: '2026-06-15',
          weather: 'sunny',
          workDescription: 'Work A',
          labourCount: 10,
          plantOnSite: [],
          deliveries: [],
          visitors: [],
          safetyNotes: [],
          delayNotes: [],
          materialsUsed: [],
          issues: [],
          evidenceIds: [],
          photos: [],
          status: 'submitted',
          createdBy: 'user-1',
          createdAt: '2026-06-15T08:00:00Z',
        },
        {
          id: 'log-2',
          projectId: 'proj-1',
          date: '2026-06-13',
          weather: 'rainy',
          workDescription: 'Work B',
          labourCount: 5,
          plantOnSite: [],
          deliveries: [],
          visitors: [],
          safetyNotes: [],
          delayNotes: ['Delay due to rain'],
          materialsUsed: [],
          issues: [],
          evidenceIds: [],
          photos: [],
          status: 'submitted',
          createdBy: 'user-1',
          createdAt: '2026-06-13T08:00:00Z',
        },
      ];

      // getRichSiteLogs already returns desc order, but we verify our sort handles any order
      getRichSiteLogsMock.mockResolvedValue(mockLogs);

      const entries = await getEntries('proj-1');

      expect(entries).toHaveLength(2);
      // Newest first
      expect(entries[0].date).toBe('2026-06-15');
      expect(entries[1].date).toBe('2026-06-13');
      // Verify mapping
      expect(entries[0].workCompleted).toBe('Work A');
      expect(entries[0].workforceCount).toBe(10);
      expect(entries[1].mentionsDelays).toBe(true);
      expect(entries[1].issuesDelays).toBe('Delay due to rain');
    });

    it('returns empty array for project with no logs', async () => {
      getRichSiteLogsMock.mockResolvedValue([]);
      const entries = await getEntries('proj-1');
      expect(entries).toEqual([]);
    });

    it('throws when projectId is empty', async () => {
      await expect(getEntries('')).rejects.toThrow('projectId is required');
    });

    it('propagates Firestore errors from dailyLogService', async () => {
      const error = new Error('Network error');
      getRichSiteLogsMock.mockRejectedValue(error);
      await expect(getEntries('proj-1')).rejects.toThrow('Network error');
    });
  });

  // ── getDelaySurfaceEvents ──────────────────────────────────────────────────

  describe('getDelaySurfaceEvents', () => {
    it('returns delay events only for entries with issues/delays', async () => {
      const mockLogs: SiteLog[] = [
        {
          id: 'log-1',
          projectId: 'proj-1',
          date: '2026-06-15',
          weather: 'sunny',
          workDescription: 'Good day',
          labourCount: 10,
          plantOnSite: [],
          deliveries: [],
          visitors: [],
          safetyNotes: [],
          delayNotes: [],
          materialsUsed: [],
          issues: [],
          evidenceIds: [],
          photos: [],
          status: 'submitted',
          createdBy: 'user-1',
          createdAt: '2026-06-15T08:00:00Z',
        },
        {
          id: 'log-2',
          projectId: 'proj-1',
          date: '2026-06-16',
          weather: 'stormy',
          workDescription: 'Minimal work',
          labourCount: 2,
          plantOnSite: [],
          deliveries: [],
          visitors: [],
          safetyNotes: [],
          delayNotes: ['Storm delay'],
          materialsUsed: [],
          issues: ['Power outage'],
          evidenceIds: [],
          photos: [],
          status: 'submitted',
          createdBy: 'user-1',
          createdAt: '2026-06-16T08:00:00Z',
        },
      ];
      getRichSiteLogsMock.mockResolvedValue(mockLogs);

      const events = await getDelaySurfaceEvents('proj-1');

      expect(events).toHaveLength(1);
      expect(events[0].entryId).toBe('log-2');
      expect(events[0].summary).toBe('Storm delay; Power outage');
      expect(events[0].targets).toEqual(['programme_engine', 'risk_register']);
    });

    it('returns empty array when no entries have delays', async () => {
      const mockLogs: SiteLog[] = [
        {
          id: 'log-1',
          projectId: 'proj-1',
          date: '2026-06-15',
          weather: 'sunny',
          workDescription: 'All good',
          labourCount: 10,
          plantOnSite: [],
          deliveries: [],
          visitors: [],
          safetyNotes: [],
          delayNotes: [],
          materialsUsed: [],
          issues: [],
          evidenceIds: [],
          photos: [],
          status: 'submitted',
          createdBy: 'user-1',
          createdAt: '2026-06-15T08:00:00Z',
        },
      ];
      getRichSiteLogsMock.mockResolvedValue(mockLogs);

      const events = await getDelaySurfaceEvents('proj-1');
      expect(events).toEqual([]);
    });
  });
});
