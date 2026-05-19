import type { UserRole } from '../types';
import { trackEvent } from './firebase';

export type UserActivitySource =
  | 'dashboard_tab'
  | 'sidebar'
  | 'keyboard_shortcut'
  | 'header_cta'
  | 'component'
  | 'legacy_dashboard'
  | 'auth';

export interface UserActivityInput {
  action: string;
  role?: UserRole | null;
  feature?: string | null;
  source?: UserActivitySource;
  target?: string | null;
  label?: string | null;
}

const MAX_VALUE_LENGTH = 80;

function normalizeActivityValue(value: string | null | undefined) {
  if (value == null) return undefined;
  const normalized = String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_./:-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!normalized) return undefined;
  return normalized.slice(0, MAX_VALUE_LENGTH);
}

export function buildUserActivityParams(input: UserActivityInput) {
  return {
    action: normalizeActivityValue(input.action) ?? 'unknown',
    role: normalizeActivityValue(input.role),
    feature: normalizeActivityValue(input.feature),
    source: normalizeActivityValue(input.source),
    target: normalizeActivityValue(input.target),
    label: normalizeActivityValue(input.label),
  };
}

export function trackUserActivity(input: UserActivityInput) {
  const params = buildUserActivityParams(input);
  void trackEvent('user_activity', params);
}
