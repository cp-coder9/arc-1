/**
 * Unit tests for NavigationRedirect — legacy route → Command Centre mapping.
 */

import { describe, it, expect } from 'vitest';
import {
  parseLegacyRoute,
  resolveLegacyRedirect,
  isLegacyProjectRoute,
  isRedirectActive,
  LEGACY_ROUTE_MAPPINGS,
  REDIRECT_CONFIG,
  type RedirectConfig,
} from './NavigationRedirect';

describe('NavigationRedirect', () => {
  describe('parseLegacyRoute', () => {
    it('parses a valid legacy route with projectId and section', () => {
      const result = parseLegacyRoute('/projects/abc123/documents');
      expect(result).toEqual({ projectId: 'abc123', section: 'documents' });
    });

    it('parses routes with complex projectId', () => {
      const result = parseLegacyRoute('/projects/proj-2024-001/team');
      expect(result).toEqual({ projectId: 'proj-2024-001', section: 'team' });
    });

    it('handles trailing slash', () => {
      const result = parseLegacyRoute('/projects/abc123/snags/');
      expect(result).toEqual({ projectId: 'abc123', section: 'snags' });
    });

    it('returns null for non-legacy routes', () => {
      expect(parseLegacyRoute('/command-centre/abc123/quality')).toBeNull();
      expect(parseLegacyRoute('/settings')).toBeNull();
      expect(parseLegacyRoute('/projects')).toBeNull();
      expect(parseLegacyRoute('/projects/abc123')).toBeNull();
    });

    it('returns null for routes with extra segments', () => {
      expect(parseLegacyRoute('/projects/abc123/documents/subfolder')).toBeNull();
    });
  });

  describe('isLegacyProjectRoute', () => {
    it('returns true for valid legacy project routes', () => {
      expect(isLegacyProjectRoute('/projects/abc123/documents')).toBe(true);
      expect(isLegacyProjectRoute('/projects/proj1/snags')).toBe(true);
    });

    it('returns false for non-legacy routes', () => {
      expect(isLegacyProjectRoute('/command-centre/abc123/quality')).toBe(false);
      expect(isLegacyProjectRoute('/settings')).toBe(false);
    });
  });

  describe('resolveLegacyRedirect', () => {
    it('redirects /projects/:id/documents → /command-centre/:id/documents', () => {
      const result = resolveLegacyRedirect('/projects/abc123/documents');
      expect(result).not.toBeNull();
      expect(result!.targetUrl).toBe('/command-centre/abc123/documents');
      expect(result!.targetView).toBe('documents');
      expect(result!.mapped).toBe(true);
      expect(result!.showNotification).toBe(false);
    });

    it('redirects /projects/:id/snags → /command-centre/:id/quality', () => {
      const result = resolveLegacyRedirect('/projects/abc123/snags');
      expect(result!.targetUrl).toBe('/command-centre/abc123/quality');
      expect(result!.targetView).toBe('quality');
      expect(result!.mapped).toBe(true);
    });

    it('redirects /projects/:id/instructions → /command-centre/:id/rfis', () => {
      const result = resolveLegacyRedirect('/projects/abc123/instructions');
      expect(result!.targetUrl).toBe('/command-centre/abc123/rfis');
      expect(result!.targetView).toBe('rfis');
      expect(result!.mapped).toBe(true);
    });

    it('redirects /projects/:id/team → /command-centre/:id/team', () => {
      const result = resolveLegacyRedirect('/projects/abc123/team');
      expect(result!.targetUrl).toBe('/command-centre/abc123/team');
      expect(result!.targetView).toBe('team');
      expect(result!.mapped).toBe(true);
    });

    it('redirects /projects/:id/payments → /command-centre/:id/budget', () => {
      const result = resolveLegacyRedirect('/projects/abc123/payments');
      expect(result!.targetUrl).toBe('/command-centre/abc123/budget');
      expect(result!.mapped).toBe(true);
    });

    it('redirects /projects/:id/rfis → /command-centre/:id/rfis', () => {
      const result = resolveLegacyRedirect('/projects/abc123/rfis');
      expect(result!.targetUrl).toBe('/command-centre/abc123/rfis');
      expect(result!.mapped).toBe(true);
    });

    it('redirects /projects/:id/dashboard → /command-centre/:id/dashboard', () => {
      const result = resolveLegacyRedirect('/projects/abc123/dashboard');
      expect(result!.targetUrl).toBe('/command-centre/abc123/dashboard');
      expect(result!.mapped).toBe(true);
    });

    it('preserves query string parameters during redirect', () => {
      const result = resolveLegacyRedirect(
        '/projects/abc123/documents',
        'status=open&page=2&sort=date',
      );
      expect(result!.targetUrl).toBe(
        '/command-centre/abc123/documents?status=open&page=2&sort=date',
      );
    });

    it('handles empty query string', () => {
      const result = resolveLegacyRedirect('/projects/abc123/team', '');
      expect(result!.targetUrl).toBe('/command-centre/abc123/team');
    });

    it('redirects unmapped routes to dashboard with notification', () => {
      const result = resolveLegacyRedirect('/projects/abc123/unknown-section');
      expect(result).not.toBeNull();
      expect(result!.targetUrl).toBe('/command-centre/abc123/dashboard');
      expect(result!.targetView).toBe('dashboard');
      expect(result!.mapped).toBe(false);
      expect(result!.showNotification).toBe(true);
      expect(result!.notificationMessage).toContain('has moved');
      expect(result!.notificationMessage).toContain('unknown-section');
    });

    it('preserves query params on unmapped route redirect', () => {
      const result = resolveLegacyRedirect('/projects/abc123/old-page', 'ref=email');
      expect(result!.targetUrl).toBe('/command-centre/abc123/dashboard?ref=email');
    });

    it('returns null for non-legacy routes', () => {
      expect(resolveLegacyRedirect('/command-centre/abc123/tasks')).toBeNull();
      expect(resolveLegacyRedirect('/settings')).toBeNull();
    });

    it('preserves projectId exactly as given', () => {
      const result = resolveLegacyRedirect('/projects/PROJ-2024-X1/documents');
      expect(result!.targetUrl).toBe('/command-centre/PROJ-2024-X1/documents');
    });
  });

  describe('REDIRECT_CONFIG', () => {
    it('has a 6-month TTL', () => {
      expect(REDIRECT_CONFIG.ttlMonths).toBe(6);
    });

    it('uses dashboard as the fallback view', () => {
      expect(REDIRECT_CONFIG.fallbackView).toBe('dashboard');
    });

    it('has mappings for all required legacy patterns', () => {
      const patterns = LEGACY_ROUTE_MAPPINGS.map((m) => m.legacyPattern);
      expect(patterns).toContain('documents');
      expect(patterns).toContain('snags');
      expect(patterns).toContain('instructions');
      expect(patterns).toContain('team');
      expect(patterns).toContain('payments');
      expect(patterns).toContain('passport');
      expect(patterns).toContain('form-system');
      expect(patterns).toContain('audit-trail');
      expect(patterns).toContain('rfis');
      expect(patterns).toContain('dashboard');
    });

    it('all mappings have preserveParams set to true', () => {
      for (const mapping of LEGACY_ROUTE_MAPPINGS) {
        expect(mapping.preserveParams).toBe(true);
      }
    });
  });

  describe('isRedirectActive', () => {
    it('returns true within TTL window', () => {
      const deployment = new Date('2025-01-01');
      const now = new Date('2025-04-01'); // 3 months later
      expect(isRedirectActive(deployment, now)).toBe(true);
    });

    it('returns false after TTL expires', () => {
      const deployment = new Date('2024-01-01');
      const now = new Date('2025-01-01'); // 12 months later
      expect(isRedirectActive(deployment, now)).toBe(false);
    });

    it('returns true at exactly 6 months', () => {
      const deployment = new Date('2025-01-01');
      // Approximately 6 months (180 days)
      const now = new Date(deployment.getTime() + 6 * 30 * 24 * 60 * 60 * 1000);
      expect(isRedirectActive(deployment, now)).toBe(true);
    });

    it('respects custom config TTL', () => {
      const customConfig: RedirectConfig = {
        ...REDIRECT_CONFIG,
        ttlMonths: 12,
      };
      const deployment = new Date('2025-01-01');
      const now = new Date('2025-10-01'); // 9 months
      expect(isRedirectActive(deployment, now, customConfig)).toBe(true);
    });
  });
});
