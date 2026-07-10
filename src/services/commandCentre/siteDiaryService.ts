/**
 * Project Command Centre — Site Diary Service
 *
 * Captures daily site conditions, workforce, work completed, and issues/delays.
 * Integrates with the existing dailyLogService for Firestore persistence.
 * Surfaces entries mentioning delays to the Programme_Engine and Risk_Register.
 *
 * Persists to Firestore `projects/{projectId}/site_logs/` via dailyLogService.
 *
 * @module commandCentre/siteDiaryService
 */

import { createRichSiteLog, getRichSiteLogs } from '@/services/dailyLogService';
import { createDiaryEntrySchema } from '@/services/commandCentre/schemas';
import type { SiteLog, WeatherCondition } from '@/types';

// ── Types ────────────────────────────────────────────────────────────────────

/** Extended weather options for the Command Centre site diary. */
export type SiteDiaryWeather = WeatherCondition | 'windy' | 'cold' | 'hot';

/** Valid weather values accepted by the site diary form. */
export const VALID_WEATHER_OPTIONS: readonly SiteDiaryWeather[] = [
  'sunny',
  'cloudy',
  'rainy',
  'windy',
  'stormy',
  'cold',
  'hot',
] as const;

/** Input data for creating a site diary entry. */
export interface CreateDiaryEntryData {
  weather: string;
  workforceCount: number;
  workCompleted: string;
  issuesDelays?: string;
  createdBy: string;
}

/** A site diary entry as returned by the service. */
export interface SiteDiaryEntry {
  id: string;
  projectId: string;
  date: string;
  weather: string;
  workforceCount: number;
  workCompleted: string;
  issuesDelays?: string;
  createdBy: string;
  createdAt: string;
  /** Whether this entry mentions delays (relevant for Programme_Engine / Risk_Register). */
  mentionsDelays: boolean;
}

/** Delay surface event for cross-subsystem correlation. */
export interface DelaySurfaceEvent {
  entryId: string;
  projectId: string;
  date: string;
  summary: string;
  targets: ('programme_engine' | 'risk_register')[];
}

// ── Pure Helpers ─────────────────────────────────────────────────────────────

/**
 * Determines if diary entry text mentions delays or issues.
 * Used to surface entries to Programme_Engine and Risk_Register.
 */
export function detectDelayMention(issuesDelays?: string): boolean {
  if (!issuesDelays || issuesDelays.trim().length === 0) return false;
  return true;
}

/**
 * Maps a SiteLog from dailyLogService to a SiteDiaryEntry.
 */
export function mapSiteLogToDiaryEntry(log: SiteLog): SiteDiaryEntry {
  const issuesDelays = buildIssuesDelaysText(log);
  return {
    id: log.id,
    projectId: log.projectId,
    date: log.date,
    weather: log.weather,
    workforceCount: log.labourCount ?? 0,
    workCompleted: log.workDescription,
    issuesDelays: issuesDelays || undefined,
    createdBy: log.createdBy,
    createdAt: log.createdAt,
    mentionsDelays: detectDelayMention(issuesDelays),
  };
}

/**
 * Combines issues and delay notes from a SiteLog into a single text field.
 */
function buildIssuesDelaysText(log: SiteLog): string {
  const parts: string[] = [];
  if (log.delayNotes && log.delayNotes.length > 0) {
    parts.push(...log.delayNotes);
  }
  if (log.issues && log.issues.length > 0) {
    parts.push(...log.issues);
  }
  return parts.join('; ');
}

/**
 * Extracts delay surface events from a list of diary entries.
 * Returns only entries that mention delays for cross-subsystem surfacing.
 */
export function extractDelaySurfaceEvents(
  entries: SiteDiaryEntry[],
): DelaySurfaceEvent[] {
  return entries
    .filter((entry) => entry.mentionsDelays)
    .map((entry) => ({
      entryId: entry.id,
      projectId: entry.projectId,
      date: entry.date,
      summary: entry.issuesDelays ?? '',
      targets: ['programme_engine', 'risk_register'] as const,
    }));
}

/**
 * Sorts diary entries in reverse chronological order (newest first).
 * Stable sort for entries with the same date.
 */
export function sortEntriesReverseChronological(
  entries: SiteDiaryEntry[],
): SiteDiaryEntry[] {
  return [...entries].sort((a, b) => {
    // Primary: date descending
    const dateCompare = b.date.localeCompare(a.date);
    if (dateCompare !== 0) return dateCompare;
    // Secondary: createdAt descending for stability
    return b.createdAt.localeCompare(a.createdAt);
  });
}

// ── Service Operations ───────────────────────────────────────────────────────

/**
 * Creates a new site diary entry.
 * Validates input using Zod schema, persists via dailyLogService,
 * and returns the created entry.
 *
 * @throws {Error} Validation error if required fields are missing/invalid.
 * @throws {Error} Firestore error if persistence fails.
 */
export async function createEntry(
  projectId: string,
  data: CreateDiaryEntryData,
): Promise<SiteDiaryEntry> {
  if (!projectId) throw new Error('projectId is required');

  // Validate input
  const parsed = createDiaryEntrySchema.parse({
    weather: data.weather,
    workforceCount: data.workforceCount,
    workCompleted: data.workCompleted,
    issuesDelays: data.issuesDelays,
  });

  const now = new Date();
  const date = now.toISOString().split('T')[0]; // YYYY-MM-DD

  // Persist via dailyLogService
  const logId = await createRichSiteLog({
    projectId,
    date,
    weather: mapWeatherToSiteLogWeather(parsed.weather),
    workDescription: parsed.workCompleted,
    labourCount: parsed.workforceCount,
    delayNotes: parsed.issuesDelays ? [parsed.issuesDelays] : [],
    issues: parsed.issuesDelays ? [parsed.issuesDelays] : [],
    createdBy: data.createdBy,
  });

  const entry: SiteDiaryEntry = {
    id: logId,
    projectId,
    date,
    weather: parsed.weather,
    workforceCount: parsed.workforceCount,
    workCompleted: parsed.workCompleted,
    issuesDelays: parsed.issuesDelays || undefined,
    createdBy: data.createdBy,
    createdAt: now.toISOString(),
    mentionsDelays: detectDelayMention(parsed.issuesDelays),
  };

  return entry;
}

/**
 * Retrieves all site diary entries for a project in reverse chronological order.
 * Maps from the underlying SiteLog format to the SiteDiaryEntry format.
 *
 * @throws {Error} Firestore error if retrieval fails.
 */
export async function getEntries(projectId: string): Promise<SiteDiaryEntry[]> {
  if (!projectId) throw new Error('projectId is required');

  const logs = await getRichSiteLogs(projectId);
  const entries = logs.map(mapSiteLogToDiaryEntry);
  return sortEntriesReverseChronological(entries);
}

/**
 * Gets delay surface events for a project — entries mentioning delays
 * surfaced to Programme_Engine and Risk_Register for correlation.
 */
export async function getDelaySurfaceEvents(
  projectId: string,
): Promise<DelaySurfaceEvent[]> {
  const entries = await getEntries(projectId);
  return extractDelaySurfaceEvents(entries);
}

// ── Weather Mapping ──────────────────────────────────────────────────────────

/**
 * Maps the extended site diary weather string to the WeatherCondition type
 * used by dailyLogService. Extended values (windy, cold, hot) map to the
 * closest base type.
 */
export function mapWeatherToSiteLogWeather(weather: string): WeatherCondition {
  switch (weather) {
    case 'sunny':
      return 'sunny';
    case 'cloudy':
      return 'cloudy';
    case 'rainy':
      return 'rainy';
    case 'stormy':
      return 'stormy';
    case 'windy':
      return 'cloudy'; // Closest base mapping
    case 'cold':
      return 'cloudy'; // Closest base mapping
    case 'hot':
      return 'sunny'; // Closest base mapping
    default:
      return 'sunny'; // Fallback
  }
}

// ── Exported Service Object ──────────────────────────────────────────────────

export const siteDiaryService = {
  createEntry,
  getEntries,
  getDelaySurfaceEvents,
  detectDelayMention,
  extractDelaySurfaceEvents,
  sortEntriesReverseChronological,
  mapSiteLogToDiaryEntry,
  mapWeatherToSiteLogWeather,
};

export default siteDiaryService;
