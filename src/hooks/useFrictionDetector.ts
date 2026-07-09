/**
 * useFrictionDetector — Behavioural Friction Monitoring Hook
 *
 * Monitors authenticated user sessions for implicit friction signals:
 * 1. Repeated errors: ≥3 errors on same (page, target) within 60s
 * 2. Workflow abandonment: Navigation away from multi-step process after step ≥2
 * 3. Rage clicks: ≥5 rapid clicks on same element (no state change) within 3s, each within 500ms
 *
 * On signal detection, submits implicit feedback via POST /api/feedback/submit.
 * Never captures form values, document content, or chat messages.
 * Fails silently on any error — logs to console, never disrupts user session.
 *
 * @module useFrictionDetector
 */

import { useEffect, useRef } from 'react';
import type { UserProfile } from '@/types';
import { apiFetch } from '@/lib/apiClient';

// ─── Constants ──────────────────────────────────────────────────────────────────

const ERROR_THRESHOLD = 3;
const ERROR_WINDOW_MS = 60_000;

const RAGE_CLICK_THRESHOLD = 5;
const RAGE_CLICK_WINDOW_MS = 3_000;
const RAGE_CLICK_INTERVAL_MS = 500;

const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1_000; // 24 hours
const DEDUP_STORAGE_KEY = 'friction_detector_emissions';

const MAX_DESCRIPTION_LENGTH = 500;

// ─── Types ──────────────────────────────────────────────────────────────────────

interface ErrorEntry {
  timestamp: number;
}

interface ClickEntry {
  timestamp: number;
}

interface EmissionRecord {
  [key: string]: number; // key → last emission timestamp
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function getPagePath(): string {
  try {
    return window.location.pathname;
  } catch {
    return 'unknown';
  }
}

function getElementIdentifier(element: EventTarget | null): string {
  if (!element || !(element instanceof HTMLElement)) return 'unknown';
  if (element.id) return `#${element.id}`;
  if (element.getAttribute('data-testid')) return `[data-testid="${element.getAttribute('data-testid')}"]`;
  const tag = element.tagName.toLowerCase();
  const classes = element.className && typeof element.className === 'string'
    ? `.${element.className.split(/\s+/).filter(Boolean).slice(0, 2).join('.')}`
    : '';
  return `${tag}${classes}`;
}

function buildDeduplicationKey(type: string, pagePath: string, target: string): string {
  return `${type}::${pagePath}::${target}`;
}

function getEmissionRecords(): EmissionRecord {
  try {
    const raw = localStorage.getItem(DEDUP_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as EmissionRecord;
  } catch {
    return {};
  }
}

function setEmissionRecords(records: EmissionRecord): void {
  try {
    localStorage.setItem(DEDUP_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Storage full or unavailable — ignore
  }
}

function canEmit(type: string, pagePath: string, target: string): boolean {
  const key = buildDeduplicationKey(type, pagePath, target);
  const records = getEmissionRecords();
  const lastEmission = records[key];
  if (!lastEmission) return true;
  return Date.now() - lastEmission >= DEDUP_WINDOW_MS;
}

function recordEmission(type: string, pagePath: string, target: string): void {
  const key = buildDeduplicationKey(type, pagePath, target);
  const records = getEmissionRecords();

  // Prune expired entries while we're at it
  const now = Date.now();
  const pruned: EmissionRecord = {};
  for (const [k, v] of Object.entries(records)) {
    if (now - v < DEDUP_WINDOW_MS) {
      pruned[k] = v;
    }
  }
  pruned[key] = now;
  setEmissionRecords(pruned);
}

function buildDescription(
  frictionType: string,
  pagePath: string,
  target: string,
  count: number
): string {
  const desc = `[${frictionType}] on ${pagePath} targeting ${target}: ${count} occurrences`;
  return desc.slice(0, MAX_DESCRIPTION_LENGTH);
}

async function submitImplicitFeedback(
  frictionType: string,
  pagePath: string,
  target: string,
  count: number,
  user: UserProfile
): Promise<void> {
  try {
    if (!canEmit(frictionType, pagePath, target)) return;

    const description = buildDescription(frictionType, pagePath, target, count);

    await apiFetch('/api/feedback/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: 'usability',
        description,
        implicit: true,
        contextSnapshot: {
          pagePath,
          activeModule: frictionType,
          projectId: null,
          userRole: user.role,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
        },
        implicitMetadata: {
          frictionType,
          targetIdentifier: target,
          signalCount: count,
        },
      }),
    });

    recordEmission(frictionType, pagePath, target);
  } catch (err) {
    // Fail silently — never disrupt user session
    console.warn('[FrictionDetector] Failed to submit implicit feedback:', err);
  }
}

// ─── Hook ───────────────────────────────────────────────────────────────────────

/**
 * Monitors user sessions for friction signals and submits implicit feedback.
 * Does nothing if user is not authenticated (uid falsy).
 * Sets up event listeners on mount, cleans up on unmount.
 */
export function useFrictionDetector(user: UserProfile | null): void {
  const userRef = useRef(user);
  userRef.current = user;

  // Error tracking: Map<key, timestamps[]>
  const errorMapRef = useRef<Map<string, ErrorEntry[]>>(new Map());

  // Click tracking: Map<elementId, timestamps[]>
  const clickMapRef = useRef<Map<string, ClickEntry[]>>(new Map());

  useEffect(() => {
    // Do nothing if user is not authenticated
    if (!user?.uid) return;

    // ─── Repeated Errors Detection ────────────────────────────────────────────

    function handleError(event: ErrorEvent): void {
      try {
        const pagePath = getPagePath();
        const target = event.filename
          ? `${event.filename}:${event.lineno}:${event.colno}`
          : event.message || 'unknown';

        const key = `${pagePath}::${target}`;
        const now = Date.now();

        const entries = errorMapRef.current.get(key) || [];
        // Remove entries older than 60s
        const recent = entries.filter((e: ErrorEntry) => now - e.timestamp < ERROR_WINDOW_MS);
        recent.push({ timestamp: now });
        errorMapRef.current.set(key, recent);

        if (recent.length >= ERROR_THRESHOLD) {
          submitImplicitFeedback(
            'repeated_errors',
            pagePath,
            target,
            recent.length,
            userRef.current
          );
          // Reset after submission to avoid flooding
          errorMapRef.current.set(key, []);
        }
      } catch (err) {
        console.warn('[FrictionDetector] Error handler failed:', err);
      }
    }

    // ─── Rage Clicks Detection ────────────────────────────────────────────────

    function handleClick(event: MouseEvent): void {
      try {
        const target = event.target;
        const elementId = getElementIdentifier(target);
        const now = Date.now();

        const entries = clickMapRef.current.get(elementId) || [];

        // Check if this click is within 500ms of the last click on same element
        if (entries.length > 0) {
          const lastClick = entries[entries.length - 1];
          if (now - lastClick.timestamp > RAGE_CLICK_INTERVAL_MS) {
            // Gap too large — reset sequence
            clickMapRef.current.set(elementId, [{ timestamp: now }]);
            return;
          }
        }

        entries.push({ timestamp: now });

        // Remove entries outside the 3s window
        const windowStart = now - RAGE_CLICK_WINDOW_MS;
        const recent = entries.filter((e: ClickEntry) => e.timestamp >= windowStart);
        clickMapRef.current.set(elementId, recent);

        if (recent.length >= RAGE_CLICK_THRESHOLD) {
          const pagePath = getPagePath();
          submitImplicitFeedback(
            'rage_clicks',
            pagePath,
            elementId,
            recent.length,
            userRef.current
          );
          // Reset after submission
          clickMapRef.current.set(elementId, []);
        }
      } catch (err) {
        console.warn('[FrictionDetector] Click handler failed:', err);
      }
    }

    // ─── Workflow Abandonment Detection ───────────────────────────────────────

    function handleBeforeUnload(): void {
      try {
        // Check if user is on a multi-step form/process at step ≥2
        // Detection: look for step indicators in the URL or DOM
        const pagePath = getPagePath();

        // Heuristic: URL contains step/stage indicators
        const stepMatch = pagePath.match(/(?:step|stage)[/-](\d+)/i);
        if (stepMatch) {
          const stepNumber = parseInt(stepMatch[1], 10);
          if (stepNumber >= 2) {
            submitImplicitFeedback(
              'workflow_abandonment',
              pagePath,
              `step-${stepNumber}`,
              stepNumber,
              userRef.current
            );
          }
          return;
        }

        // Heuristic: DOM contains progress indicators showing step ≥2
        const progressSteps = document.querySelectorAll(
          '[data-step], [aria-current="step"], .wizard-step.active, .step.active'
        );
        if (progressSteps.length > 0) {
          const activeStep = document.querySelector(
            '[data-step][aria-current], [data-step].active, .wizard-step.active, .step.active'
          );
          if (activeStep) {
            const stepAttr = activeStep.getAttribute('data-step');
            const stepNumber = stepAttr ? parseInt(stepAttr, 10) : 0;
            if (stepNumber >= 2) {
              submitImplicitFeedback(
                'workflow_abandonment',
                pagePath,
                `step-${stepNumber}`,
                stepNumber,
                userRef.current
              );
            }
          }
        }
      } catch (err) {
        console.warn('[FrictionDetector] Abandonment handler failed:', err);
      }
    }

    // ─── Set up listeners ─────────────────────────────────────────────────────

    window.addEventListener('error', handleError);
    document.addEventListener('click', handleClick, true);
    window.addEventListener('beforeunload', handleBeforeUnload);

    // ─── Cleanup ──────────────────────────────────────────────────────────────

    return () => {
      window.removeEventListener('error', handleError);
      document.removeEventListener('click', handleClick, true);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [user?.uid]);
}

export default useFrictionDetector;
