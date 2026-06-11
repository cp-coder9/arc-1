/**
 * Architex Platform Spine — Sample Data
 *
 * Provides representative demo data that exercises every code path in the
 * platform spine service.  Useful for smoke tests, demo scripts, and as
 * reference fixtures for unit tests.
 *
 * @see platformSpineService.ts
 */

import type {
  ProjectPassport,
  UserContext,
  WorkflowEvent,
} from '@/types/platformSpine';

// ── Demo Users ──────────────────────────────────────────────────────────────

export const DEMO_USERS: UserContext[] = [
  {
    userId: 'u-client-001',
    displayName: 'Client Developer Demo',
    role: 'client_developer',
    projectIds: ['p-sandton-001'],
  },
  {
    userId: 'u-architect-001',
    displayName: 'Architect Demo',
    role: 'architect',
    projectIds: ['p-sandton-001'],
  },
  {
    userId: 'u-contractor-001',
    displayName: 'Contractor Demo',
    role: 'contractor',
    projectIds: ['p-sandton-001'],
  },
  {
    userId: 'u-supplier-001',
    displayName: 'Supplier Demo',
    role: 'supplier',
    projectIds: ['p-sandton-001'],
  },
  {
    userId: 'u-candidate-001',
    displayName: 'Candidate Professional Demo',
    role: 'candidate_professional',
    projectIds: ['p-sandton-001'],
  },
  {
    userId: 'u-admin-001',
    displayName: 'Platform Admin Demo',
    role: 'admin',
    projectIds: ['p-sandton-001'],
  },
];

// ── Demo Project Passport ───────────────────────────────────────────────────

export const DEMO_PROJECT_PASSPORT: ProjectPassport = {
  projectId: 'p-sandton-001',
  projectName: 'Sandton Mixed-Use Upgrade',
  phase: 'construction_execution',
  municipality: 'City of Johannesburg',
  propertyUse: 'Mixed-use commercial/residential',
  riskLevel: 'high',
  leadProfessionalRole: 'architect',
  missingRecords: [
    'latest municipal approval letter',
    'signed contractor appointment',
    'snag register baseline',
  ],
};

// ── Demo Workflow Events ────────────────────────────────────────────────────

export const DEMO_WORKFLOW_EVENTS: WorkflowEvent[] = [
  {
    id: 'evt-001',
    type: 'municipal_blocker',
    projectId: 'p-sandton-001',
    title: 'Municipal approval evidence missing',
    detail:
      'The project is in construction execution but the approval letter is not attached to the passport.',
    priority: 'high',
    sourceModule: 'projects',
    assignedRoles: ['architect', 'client_developer', 'admin'],
    createdAt: '2026-06-04T09:00:00Z',
  },
  {
    id: 'evt-002',
    type: 'payment_due',
    projectId: 'p-sandton-001',
    title: 'Payment certificate requires review',
    detail:
      'Contractor milestone claim needs quantity surveyor/client review before any release.',
    priority: 'high',
    sourceModule: 'finance',
    assignedRoles: ['quantity_surveyor', 'client_developer', 'contractor'],
    createdAt: '2026-06-04T09:15:00Z',
    dueAt: '2026-06-07T09:00:00Z',
  },
  {
    id: 'evt-003',
    type: 'document_updated',
    projectId: 'p-sandton-001',
    title: 'Drawing revision uploaded',
    detail:
      'Architectural revision A-302 Rev C has been uploaded and needs construction team acknowledgement.',
    priority: 'medium',
    sourceModule: 'documents',
    assignedRoles: ['architect', 'contractor'],
    createdAt: '2026-06-04T10:00:00Z',
  },
  {
    id: 'evt-004',
    type: 'quote_received',
    projectId: 'p-sandton-001',
    title: 'Supplier quote received',
    detail:
      'Aluminium window supplier quote is ready for comparison in procurement.',
    priority: 'medium',
    sourceModule: 'marketplace',
    assignedRoles: ['quantity_surveyor', 'contractor', 'supplier'],
    createdAt: '2026-06-04T10:30:00Z',
  },
  {
    id: 'evt-005',
    type: 'cpd_certificate_ready',
    title: 'CPD certificate ready',
    detail:
      'A candidate professional completed a CPD module and certificate can be filed.',
    priority: 'low',
    sourceModule: 'cpd_learning',
    assignedRoles: ['candidate_professional', 'admin'],
    createdAt: '2026-06-04T11:00:00Z',
  },
];
