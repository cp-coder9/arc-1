/**
 * P1 Shared Module — Type Definitions
 *
 * Cross-cutting types used by all four P1 workflow modules:
 * Insurance Register, Dispute Resolution, NHBRC Enrolment, Survey & Geomatics.
 */

// ─── Retry & Integration ──────────────────────────────────────────────────────

export interface RetryConfig {
  maxRetries: 3;
  baseDelayMs: 1000;
  maxDelayMs: 60000;
  backoffMultiplier: 2;
}

export interface IntegrationWriteResult {
  success: boolean;
  retryQueued?: boolean;
  failedSyncAlertId?: string;
}

// ─── Disclaimer Configuration ─────────────────────────────────────────────────

export interface DisclaimerConfig {
  module: 'insurance' | 'dispute' | 'nhbrc' | 'survey';
  text: string;
  type: 'advisory' | 'legal' | 'compliance';
}

// ─── Working Day Calculation ──────────────────────────────────────────────────

export interface WorkingDayConfig {
  excludeSaturdays: boolean;
  excludeSundays: boolean;
  excludePublicHolidays: boolean;
  publicHolidaySource: 'sa_public_holidays_act_36_1994';
}

export interface SAPublicHoliday {
  date: string; // ISO date (YYYY-MM-DD)
  name: string;
  isObserved: boolean; // true if falls on Sunday and Monday is observed
}
