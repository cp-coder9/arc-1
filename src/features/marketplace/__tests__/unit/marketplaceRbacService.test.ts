import { describe, it, expect } from 'vitest';
import { checkMarketplacePermission } from '../../services/marketplaceRbacService';
import type { UserRole } from '@/types';
import type { MarketplaceAction } from '../../types';

describe('marketplaceRbacService', () => {
  describe('Client/Developer actions', () => {
    const clientActions: MarketplaceAction[] = [
      'create_project_posting',
      'search_professionals',
      'accept_proposal',
      'receive_certificate',
    ];

    it.each(['client', 'developer'] as UserRole[])('%s can perform client actions', (role) => {
      for (const action of clientActions) {
        const result = checkMarketplacePermission(role, action);
        expect(result.allowed).toBe(true);
        expect(result.requiredRoles).toBeUndefined();
        expect(result.reason).toBeUndefined();
      }
    });
  });

  describe('Professional actions', () => {
    const professionalActions: MarketplaceAction[] = [
      'apply_project',
      'create_task',
      'hire_freelancer',
      'post_collaboration',
    ];

    const professionalRoles: UserRole[] = [
      'architect',
      'engineer',
      'quantity_surveyor',
      'town_planner',
      'energy_professional',
      'fire_engineer',
      'bep',
    ];

    it.each(professionalRoles)('%s can perform professional actions', (role) => {
      for (const action of professionalActions) {
        const result = checkMarketplacePermission(role, action);
        expect(result.allowed).toBe(true);
      }
    });
  });

  describe('Contractor/Subcontractor actions', () => {
    const contractorOnlyActions: MarketplaceAction[] = [
      'search_suppliers',
      'request_quote',
    ];

    const sharedWithProfessionals: MarketplaceAction[] = [
      'apply_project',
      'hire_freelancer',
    ];

    it.each(['contractor', 'subcontractor'] as UserRole[])('%s can perform contractor actions', (role) => {
      for (const action of [...contractorOnlyActions, ...sharedWithProfessionals]) {
        const result = checkMarketplacePermission(role, action);
        expect(result.allowed).toBe(true);
      }
    });
  });

  describe('Freelancer actions', () => {
    it('freelancer can apply to tasks and create profile', () => {
      expect(checkMarketplacePermission('freelancer', 'apply_task').allowed).toBe(true);
      expect(checkMarketplacePermission('freelancer', 'create_freelancer_profile').allowed).toBe(true);
    });

    it('freelancer cannot perform client actions', () => {
      const result = checkMarketplacePermission('freelancer', 'create_project_posting');
      expect(result.allowed).toBe(false);
      expect(result.requiredRoles).toContain('client');
      expect(result.reason).toBeDefined();
    });
  });

  describe('Supplier actions', () => {
    it('supplier can create listings and respond to quotes', () => {
      expect(checkMarketplacePermission('supplier', 'create_material_listing').allowed).toBe(true);
      expect(checkMarketplacePermission('supplier', 'respond_quote').allowed).toBe(true);
    });

    it('supplier cannot perform professional actions', () => {
      const result = checkMarketplacePermission('supplier', 'create_task');
      expect(result.allowed).toBe(false);
    });
  });

  describe('Admin actions', () => {
    const adminActions: MarketplaceAction[] = [
      'resolve_dispute',
      'manage_verification',
      'access_analytics',
    ];

    it.each(['platform_admin', 'admin'] as UserRole[])('%s can perform admin actions', (role) => {
      for (const action of adminActions) {
        const result = checkMarketplacePermission(role, action);
        expect(result.allowed).toBe(true);
      }
    });
  });

  describe('Architect/BEP role equivalence (Requirement 12.8)', () => {
    const professionalActions: MarketplaceAction[] = [
      'apply_project',
      'create_task',
      'hire_freelancer',
      'post_collaboration',
    ];

    it('architect and bep have identical permissions', () => {
      for (const action of professionalActions) {
        const architectResult = checkMarketplacePermission('architect', action);
        const bepResult = checkMarketplacePermission('bep', action);
        expect(architectResult.allowed).toBe(bepResult.allowed);
      }
    });

    it('bep is granted the same access as architect on all actions', () => {
      const allActions: MarketplaceAction[] = [
        'create_project_posting',
        'search_professionals',
        'accept_proposal',
        'receive_certificate',
        'apply_project',
        'create_task',
        'hire_freelancer',
        'post_collaboration',
        'apply_task',
        'create_freelancer_profile',
        'create_material_listing',
        'respond_quote',
        'search_suppliers',
        'request_quote',
        'resolve_dispute',
        'manage_verification',
        'access_analytics',
      ];

      for (const action of allActions) {
        const architectResult = checkMarketplacePermission('architect', action);
        const bepResult = checkMarketplacePermission('bep', action);
        expect(bepResult.allowed).toBe(architectResult.allowed);
      }
    });
  });

  describe('Denied action response format', () => {
    it('returns requiredRoles and reason for denied actions', () => {
      const result = checkMarketplacePermission('freelancer', 'resolve_dispute');
      expect(result.allowed).toBe(false);
      expect(result.requiredRoles).toBeDefined();
      expect(result.requiredRoles!.length).toBeGreaterThan(0);
      expect(result.reason).toBeDefined();
      expect(result.reason).toContain('freelancer');
      expect(result.reason).toContain('resolve_dispute');
    });

    it('returns allowed: true with no extra fields for permitted actions', () => {
      const result = checkMarketplacePermission('client', 'create_project_posting');
      expect(result).toEqual({ allowed: true });
    });
  });
});
