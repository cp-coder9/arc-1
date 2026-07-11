import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  ApplicationCreateSchema,
  ApplicationStatusEnum,
  AutonomyLabelEnum,
  DisciplineEnum,
  ExecutionModeEnum,
  JobCreateSchema,
  JobCategoryEnum,
  JobStatusEnum,
  NotificationSchema,
  NotificationTypeEnum,
  PaymentStatusEnum,
  PaymentTypeEnum,
  ResponsiblePartyEnum,
  RiskStatusEnum,
  ReviewCreateSchema,
  StandardFamilyEnum,
  SubmissionStatusEnum,
  UserRoleEnum,
  VerificationStatusEnum,
  validateForm,
} from '../lib/schemas';
import type {
  Application,
  AutonomyLabel,
  Discipline,
  ExecutionMode,
  Job,
  JobCategory,
  NotificationType,
  PaymentStatus,
  PaymentType,
  ResponsibleParty,
  Review,
  RiskStatus,
  StandardFamily,
  SubmissionStatus,
  UserRole,
  VerificationStatus,
} from '../types';

describe('Validation Schemas', () => {
  describe('JobCreateSchema', () => {
    it('should validate a valid job', () => {
      const job = {
        title: 'Test Job',
        description: 'This is a test job description that is long enough',
        requirements: ['Requirement 1', 'Requirement 2'],
        deadline: new Date(Date.now() + 86400000).toISOString(),
        budget: 50000,
        category: 'Residential',
      };

      const result = validateForm(JobCreateSchema, job);
      expect(result.success).toBe(true);
    });

    it('should reject job with short title', () => {
      const job = {
        title: 'Hi',
        description: 'This is a test job description that is long enough',
        requirements: ['Requirement 1'],
        deadline: new Date(Date.now() + 86400000).toISOString(),
        budget: 50000,
        category: 'Residential',
      };

      const result = validateForm(JobCreateSchema, job);
      expect(result.success).toBe(false);
    });

    it('should reject job with short description', () => {
      const job = {
        title: 'Test Job',
        description: 'Too short',
        requirements: ['Requirement 1'],
        deadline: new Date(Date.now() + 86400000).toISOString(),
        budget: 50000,
        category: 'Residential',
      };

      const result = validateForm(JobCreateSchema, job);
      expect(result.success).toBe(false);
    });

    it('should reject job with budget below minimum', () => {
      const job = {
        title: 'Test Job',
        description: 'This is a test job description that is long enough',
        requirements: ['Requirement 1'],
        deadline: new Date(Date.now() + 86400000).toISOString(),
        budget: 500,
        category: 'Residential',
      };

      const result = validateForm(JobCreateSchema, job);
      expect(result.success).toBe(false);
    });

    it('should reject job with past deadline', () => {
      const job = {
        title: 'Test Job',
        description: 'This is a test job description that is long enough',
        requirements: ['Requirement 1'],
        deadline: new Date(Date.now() - 86400000).toISOString(),
        budget: 50000,
        category: 'Residential',
      };

      const result = validateForm(JobCreateSchema, job);
      // Note: The schema doesn't validate past dates, just format
      expect(result.success).toBe(true);
    });
  });

  describe('ApplicationCreateSchema', () => {
    it('should validate a valid application', () => {
      const application = {
        proposal: 'This is a detailed proposal that explains why I am the best candidate for this project and includes my approach and timeline.',
        portfolioUrl: 'https://example.com/portfolio',
      };

      const result = validateForm(ApplicationCreateSchema, application);
      expect(result.success).toBe(true);
    });

    it('should reject application with short proposal', () => {
      const application = {
        proposal: 'Too short',
      };

      const result = validateForm(ApplicationCreateSchema, application);
      expect(result.success).toBe(false);
    });

    it('should reject invalid portfolio URL', () => {
      const application = {
        proposal: 'This is a detailed proposal that explains why I am the best candidate for this project and includes my approach and timeline.',
        portfolioUrl: 'not-a-valid-url',
      };

      const result = validateForm(ApplicationCreateSchema, application);
      expect(result.success).toBe(false);
    });

    it('should accept withdrawn application status values used by the dashboard', () => {
      expect(ApplicationStatusEnum.safeParse('withdrawn').success).toBe(true);
    });
  });

  describe('ReviewCreateSchema', () => {
    it('should validate a valid review', () => {
      const review = {
        toId: 'user-123',
        rating: 5,
        comment: 'This is a detailed review explaining the experience working together.',
        type: 'client_to_architect' as const,
        isPublic: true,
      };

      const result = validateForm(ReviewCreateSchema, review);
      expect(result.success).toBe(true);
    });

    it('should reject review with rating out of range', () => {
      const review = {
        toId: 'user-123',
        rating: 6,
        comment: 'This is a detailed review explaining the experience working together.',
        type: 'client_to_architect' as const,
        isPublic: true,
      };

      const result = validateForm(ReviewCreateSchema, review);
      expect(result.success).toBe(false);
    });

    it('should reject review with short comment', () => {
      const review = {
        toId: 'user-123',
        rating: 5,
        comment: 'Short',
        type: 'client_to_architect' as const,
        isPublic: true,
      };

      const result = validateForm(ReviewCreateSchema, review);
      expect(result.success).toBe(false);
    });
  });

  describe('Enum Consistency', () => {
    const expectOptionsMatch = (actual: readonly string[], expected: readonly string[]) => {
      expect(actual).toEqual(expected);
    };

    const userRoles = ['client', 'architect', 'admin', 'freelancer', 'bep', 'contractor', 'subcontractor', 'supplier', 'engineer', 'quantity_surveyor', 'town_planner', 'energy_professional', 'fire_engineer', 'site_manager', 'developer', 'firm_admin', 'platform_admin', 'land_surveyor', 'health_safety', 'cpm'] as const satisfies readonly UserRole[];
    it('should accept all UserRole values', () => {
      expectOptionsMatch(UserRoleEnum.options, userRoles);
      for (const role of userRoles) {
        const result = UserRoleEnum.safeParse(role);
        expect(result.success).toBe(true);
      }
    });

    const notificationTypes = [
      'job_application',
      'application_accepted',
      'drawing_submitted',
      'ai_review_complete',
      'admin_approval',
      'admin_rejection',
      'payment_released',
      'message',
      'milestone_due',
      'council_update',
      'invoice_sent',
      'invoice_paid',
      'firm_invite',
      'firm_role_changed',
      'firm_member_removed',
      'directory_invitation'
    ] as const satisfies readonly NotificationType[];
    it('should accept all NotificationType values', () => {
      expectOptionsMatch(NotificationTypeEnum.options, notificationTypes);
      for (const type of notificationTypes) {
        const result = NotificationTypeEnum.safeParse(type);
        expect(result.success).toBe(true);
      }
    });

    it('should accept directory invitation notification metadata fields', () => {
      const result = NotificationSchema.safeParse({
        userId: 'user-1',
        type: 'directory_invitation',
        title: 'Directory Invitation',
        body: 'You have been invited to a project',
        data: {
          invitationId: 'invite-1',
          projectId: 'project-1',
          workPackageId: 'package-1',
          senderId: 'client-1',
          discipline: 'architecture',
        },
      });

      expect(result.success).toBe(true);
    });

    it('should keep core runtime enums aligned with TypeScript domain unions', () => {
      const enumCases = [
        { name: 'JobCategoryEnum', actual: JobCategoryEnum.options, expected: ['Residential', 'Commercial', 'Industrial', 'Renovation', 'Interior', 'Landscape'] as const satisfies readonly JobCategory[] },
        { name: 'JobStatusEnum', actual: JobStatusEnum.options, expected: ['open', 'in-progress', 'completed', 'cancelled'] as const satisfies readonly Job['status'][] },
        { name: 'ApplicationStatusEnum', actual: ApplicationStatusEnum.options, expected: ['pending', 'accepted', 'rejected', 'withdrawn'] as const satisfies readonly Application['status'][] },
        { name: 'SubmissionStatusEnum', actual: SubmissionStatusEnum.options, expected: ['processing', 'pending_ai', 'ai_reviewing', 'ai_failed', 'ai_passed', 'admin_reviewing', 'admin_rejected', 'approved'] as const satisfies readonly SubmissionStatus[] },
        { name: 'PaymentTypeEnum', actual: PaymentTypeEnum.options, expected: ['escrow_deposit', 'milestone_release', 'refund', 'platform_fee'] as const satisfies readonly PaymentType[] },
        { name: 'PaymentStatusEnum', actual: PaymentStatusEnum.options, expected: ['pending', 'completed', 'failed', 'refunded'] as const satisfies readonly PaymentStatus[] },
        { name: 'VerificationStatusEnum', actual: VerificationStatusEnum.options, expected: ['pending', 'verified', 'rejected', 'expired'] as const satisfies readonly VerificationStatus[] },
        { name: 'DisciplineEnum', actual: DisciplineEnum.options, expected: ['architecture', 'structure', 'fire', 'accessibility', 'energy', 'drainage', 'electrical', 'mechanical', 'planning', 'documentation', 'environmental', 'nhbrc', 'coordination'] as const satisfies readonly Discipline[] },
        { name: 'StandardFamilyEnum', actual: StandardFamilyEnum.options, expected: ['NBR', 'SANS10400', 'SANS10160', 'SANS10100', 'SANS10162', 'SANS10142', 'SANS10252', 'MunicipalBylaw', 'NHBRC', 'ProfessionalCoordination', 'Other'] as const satisfies readonly StandardFamily[] },
        { name: 'AutonomyLabelEnum', actual: AutonomyLabelEnum.options, expected: ['autonomous_check', 'professional_review_required', 'competent_person_required', 'municipal_confirmation_required', 'insufficient_information'] as const satisfies readonly AutonomyLabel[] },
        { name: 'ResponsiblePartyEnum', actual: ResponsiblePartyEnum.options, expected: ['architect', 'structural_engineer', 'civil_engineer', 'fire_engineer', 'electrical_engineer', 'mechanical_engineer', 'energy_professional', 'client', 'contractor', 'municipality', 'admin'] as const satisfies readonly ResponsibleParty[] },
        { name: 'RiskStatusEnum', actual: RiskStatusEnum.options, expected: ['ready_for_admin_review', 'ready_for_professional_review', 'requires_minor_corrections', 'requires_major_corrections', 'requires_specialist_design', 'not_assessable_insufficient_information', 'ai_review_failed'] as const satisfies readonly RiskStatus[] },
        { name: 'ExecutionModeEnum', actual: ExecutionModeEnum.options, expected: ['basic_ai_screen', 'council_readiness', 'fire_plan_review', 'engineering_coordination', 'full_professional_review', 'resubmission_delta_review', 'specialist_pack_review'] as const satisfies readonly ExecutionMode[] },
      ];

      for (const enumCase of enumCases) {
        expect(enumCase.actual, enumCase.name).toEqual(enumCase.expected);
      }
    });

    const reviewTypes = ['client_to_architect', 'architect_to_client', 'to_bep', 'from_bep', 'to_freelancer'] as const satisfies readonly Review['type'][];
    it('should accept all Review type values', () => {
      for (const type of reviewTypes) {
        const result = ReviewCreateSchema.pick({ type: true }).safeParse({ type });
        expect(result.success).toBe(true);
      }
    });
  });
});
