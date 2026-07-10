/**
 * Unified Router — Command Centre Route Resolution & Access Gating
 *
 * Matches routes of the form `/command-centre/:projectId/:viewId`, validates
 * the view identifier against the registered set, enforces role-based access
 * control, and renders the ProjectCommandCentre or redirects appropriately.
 *
 * Error handling:
 * - Unrecognized viewId → redirect to dashboard with notification
 * - Non-existent projectId → redirect to dashboard with notification
 * - Unauthorized access (role lacks permission) → access-denied page
 * - Unauthenticated user → access-denied page (no project data revealed)
 *
 * @module navigation/UnifiedRouter
 *
 * Validates: Requirements 1.1, 1.6, 8.1, 8.2, 8.3, 8.4
 */

import React, { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import type { UserProfile } from '@/types';
import type { CommandCentreView, ComplexityMode } from '@/services/commandCentre/types';
import { isViewAccessible, getDefaultComplexityMode } from '@/services/commandCentre/roleViewMatrix';
import { parseCommandCentreUrl, REGISTERED_VIEWS, replaceCommandCentreState } from '@/navigation/commandCentreUrlUtils';
import { getProject } from '@/services/projectLifecycleService';

// ── Types ────────────────────────────────────────────────────────────────────

export interface UnifiedRouterProps {
  /** The authenticated user profile. Null if unauthenticated. */
  user: UserProfile | null;
  /** The current URL path to resolve. */
  path: string;
  /** Callback to render the ProjectCommandCentre with resolved context. */
  renderCommandCentre: (props: ResolvedRouteContext) => React.ReactNode;
  /** Callback rendered when access is denied. */
  renderAccessDenied?: () => React.ReactNode;
  /** Callback when user should be redirected to default view (e.g. non-matching URL). */
  onRedirectToDefault?: () => void;
}

export interface ResolvedRouteContext {
  projectId: string;
  viewId: CommandCentreView;
  complexityMode: ComplexityMode;
}

export type RouteResolutionStatus =
  | 'loading'
  | 'resolved'
  | 'access_denied'
  | 'not_found'
  | 'unauthenticated';

// ── Route Resolution ─────────────────────────────────────────────────────────

/**
 * Resolves a viewId string to a valid CommandCentreView type.
 * Returns the viewId if it is a registered view; otherwise falls back to 'dashboard'.
 *
 * This implements the "fallback to dashboard for unrecognized viewId" requirement.
 */
export function resolveViewId(viewId: string): { view: CommandCentreView; isValid: boolean } {
  if ((REGISTERED_VIEWS as readonly string[]).includes(viewId)) {
    return { view: viewId as CommandCentreView, isValid: true };
  }
  return { view: 'dashboard', isValid: false };
}

/**
 * Parses a command centre URL path and resolves the viewId.
 * Returns null if the path doesn't match the command centre format at all.
 * If the path matches but viewId is unrecognized, falls back to 'dashboard'.
 */
export function resolveCommandCentreRoute(path: string): {
  projectId: string;
  viewId: CommandCentreView;
  viewWasRecognized: boolean;
} | null {
  // First try strict parse (only passes for registered views)
  const parsed = parseCommandCentreUrl(path);
  if (parsed) {
    return { projectId: parsed.projectId, viewId: parsed.viewId, viewWasRecognized: true };
  }

  // If strict parse failed, check if the path matches the command-centre pattern
  // but has an unrecognized viewId (fallback to dashboard)
  const segments = path.replace(/^\/+|\/+$/g, '').split('/');
  if (segments.length === 3 && segments[0] === 'command-centre' && segments[1]) {
    const projectId = decodeURIComponent(segments[1]);
    const rawViewId = decodeURIComponent(segments[2]);
    const { view, isValid } = resolveViewId(rawViewId);
    return { projectId, viewId: view, viewWasRecognized: isValid };
  }

  return null;
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * UnifiedRouter — resolves the current command centre route, validates
 * access permissions, and renders the appropriate output.
 */
export default function UnifiedRouter({
  user,
  path,
  renderCommandCentre,
  renderAccessDenied,
  onRedirectToDefault,
}: UnifiedRouterProps) {
  const [status, setStatus] = useState<RouteResolutionStatus>('loading');
  const [resolvedContext, setResolvedContext] = useState<ResolvedRouteContext | null>(null);

  const resolveRoute = useCallback(async () => {
    // 1. Unauthenticated — deny access, reveal no project data
    if (!user) {
      setStatus('unauthenticated');
      return;
    }

    // 2. Parse the URL
    const routeResult = resolveCommandCentreRoute(path);
    if (!routeResult) {
      // Path doesn't match command-centre pattern at all
      setStatus('not_found');
      toast.info('The requested page was not found. Redirecting to dashboard.');
      onRedirectToDefault?.();
      return;
    }

    const { projectId, viewId, viewWasRecognized } = routeResult;

    // 3. Check if viewId was unrecognized → show notification
    if (!viewWasRecognized) {
      toast.info('The requested view is unavailable. Showing dashboard instead.');
    }

    // 4. Verify project exists
    try {
      const project = await getProject(projectId);
      if (!project) {
        setStatus('not_found');
        toast.error('The requested project was not found. Redirecting to dashboard.');
        onRedirectToDefault?.();
        return;
      }

      // 5. Determine complexity mode from contract value
      // The Project type may not carry contractValue directly; use a safe fallback.
      // Default to 'full' mode when unknown so the router does not inadvertently
      // block access. The ProjectContextProvider will set the accurate mode once mounted.
      const projectData = project as unknown as Record<string, unknown>;
      const contractValue = typeof projectData.contractValue === 'number' ? projectData.contractValue : undefined;
      const complexityMode: ComplexityMode = contractValue !== undefined
        ? getDefaultComplexityMode(contractValue)
        : 'full';

      // 6. Access check — verify role has permission for the resolved view
      const hasAccess = isViewAccessible(user.role, viewId, complexityMode);
      if (!hasAccess) {
        setStatus('access_denied');
        return;
      }

      // 7. Route resolved successfully
      const context: ResolvedRouteContext = {
        projectId,
        viewId,
        complexityMode,
      };

      setResolvedContext(context);
      setStatus('resolved');

      // Update browser URL to reflect the resolved view (handles fallback case)
      if (!viewWasRecognized) {
        replaceCommandCentreState(projectId, viewId);
      }
    } catch {
      // Project fetch failed — treat as not found
      setStatus('not_found');
      toast.error('Unable to load the requested project. Redirecting to dashboard.');
      onRedirectToDefault?.();
    }
  }, [user, path, onRedirectToDefault]);

  useEffect(() => {
    setStatus('loading');
    setResolvedContext(null);
    resolveRoute();
  }, [resolveRoute]);

  // ── Render ───────────────────────────────────────────────────────────────

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--teal)] border-t-transparent" />
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Loading project workspace…</p>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated' || status === 'access_denied') {
    if (renderAccessDenied) {
      return <>{renderAccessDenied()}</>;
    }
    return <AccessDeniedPage />;
  }

  if (status === 'not_found') {
    // The redirect callback already fired; render nothing (or loading state)
    // while the parent handles the redirect
    return null;
  }

  if (status === 'resolved' && resolvedContext) {
    return <>{renderCommandCentre(resolvedContext)}</>;
  }

  return null;
}

// ── Access Denied Page ───────────────────────────────────────────────────────

/**
 * Default access-denied page. Does not reveal any project data.
 * Validates: Requirement 8.3
 */
function AccessDeniedPage() {
  return (
    <div className="flex items-center justify-center h-full min-h-[400px]">
      <div className="panel" style={{ maxWidth: 420, textAlign: 'center', padding: 32 }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'rgba(217, 87, 71, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
          }}
        >
          <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="var(--red)" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5.07 19h13.86a2 2 0 001.74-3L13.74 4a2 2 0 00-3.48 0L3.33 16a2 2 0 001.74 3z" />
          </svg>
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>
          Access Denied
        </h2>
        <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.5 }}>
          You do not have permission to access this project workspace. If you believe this
          is an error, please contact your project administrator.
        </p>
      </div>
    </div>
  );
}
