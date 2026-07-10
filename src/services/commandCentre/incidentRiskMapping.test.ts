/**
 * H&S Incident to Risk Register Mapping — Unit Tests
 *
 * Tests deterministic severity mapping and risk entry creation from H&S incidents.
 * @validates Requirements 12.4
 */

import {
  mapIncidentSeverityToRiskSeverity,
  createRiskFromHSIncident,
  type HSIncident,
} from './incidentRiskMapping';
import type { Severity } from '@/types';

describe('incidentRiskMapping', () => {
  describe('mapIncidentSeverityToRiskSeverity', () => {
    it('maps critical incident severity to critical risk severity', () => {
      expect(mapIncidentSeverityToRiskSeverity('critical')).toBe('critical');
    });

    it('maps high incident severity to high risk severity', () => {
      expect(mapIncidentSeverityToRiskSeverity('high')).toBe('high');
    });

    it('maps medium incident severity to medium risk severity', () => {
      expect(mapIncidentSeverityToRiskSeverity('medium')).toBe('medium');
    });

    it('maps low incident severity to low risk severity', () => {
      expect(mapIncidentSeverityToRiskSeverity('low')).toBe('low');
    });

    it('covers all valid Severity values', () => {
      const allSeverities: Severity[] = ['low', 'medium', 'high', 'critical'];
      for (const sev of allSeverities) {
        const result = mapIncidentSeverityToRiskSeverity(sev);
        expect(['low', 'medium', 'high', 'critical']).toContain(result);
      }
    });
  });

  describe('createRiskFromHSIncident', () => {
    const baseIncident: HSIncident = {
      id: 'inc-001',
      projectId: 'proj-abc',
      title: 'Worker fall from scaffolding',
      description: 'Worker fell from 3m height during roof truss installation',
      severity: 'high',
      location: 'Block A, Level 2',
      reportedBy: 'user-site-mgr',
      reportedByName: 'John Smith',
      occurredAt: '2025-03-01T10:30:00Z',
      createdAt: '2025-03-01T11:00:00Z',
    };

    it('creates a risk entry with category "health_and_safety"', () => {
      const risk = createRiskFromHSIncident('proj-abc', baseIncident);
      expect(risk.category).toBe('health_and_safety');
    });

    it('creates a risk entry with status "open"', () => {
      const risk = createRiskFromHSIncident('proj-abc', baseIncident);
      expect(risk.status).toBe('open');
    });

    it('derives severity deterministically from incident severity', () => {
      const risk = createRiskFromHSIncident('proj-abc', baseIncident);
      expect(risk.severity).toBe('high');
    });

    it('derives critical risk severity from critical incident', () => {
      const incident = { ...baseIncident, severity: 'critical' as Severity };
      const risk = createRiskFromHSIncident('proj-abc', incident);
      expect(risk.severity).toBe('critical');
    });

    it('uses the provided projectId', () => {
      const risk = createRiskFromHSIncident('proj-xyz', baseIncident);
      expect(risk.projectId).toBe('proj-xyz');
    });

    it('includes incident title in the description', () => {
      const risk = createRiskFromHSIncident('proj-abc', baseIncident);
      expect(risk.description).toContain('Worker fall from scaffolding');
    });

    it('includes incident description in risk description', () => {
      const risk = createRiskFromHSIncident('proj-abc', baseIncident);
      expect(risk.description).toContain('Worker fell from 3m height');
    });

    it('sets ownerId to incident reportedBy', () => {
      const risk = createRiskFromHSIncident('proj-abc', baseIncident);
      expect(risk.ownerId).toBe('user-site-mgr');
    });

    it('sets ownerName to incident reportedByName', () => {
      const risk = createRiskFromHSIncident('proj-abc', baseIncident);
      expect(risk.ownerName).toBe('John Smith');
    });

    it('falls back to reportedBy for ownerName when reportedByName is missing', () => {
      const incident = { ...baseIncident, reportedByName: undefined };
      const risk = createRiskFromHSIncident('proj-abc', incident);
      expect(risk.ownerName).toBe('user-site-mgr');
    });

    it('sets createdAt and updatedAt as valid ISO strings', () => {
      const risk = createRiskFromHSIncident('proj-abc', baseIncident);
      expect(() => new Date(risk.createdAt)).not.toThrow();
      expect(() => new Date(risk.updatedAt)).not.toThrow();
      expect(new Date(risk.createdAt).toISOString()).toBe(risk.createdAt);
    });

    it('sets aiGenerated to false', () => {
      const risk = createRiskFromHSIncident('proj-abc', baseIncident);
      expect(risk.aiGenerated).toBe(false);
    });
  });
});
