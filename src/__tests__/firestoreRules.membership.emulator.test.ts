/**
 * Firestore Emulator Tests — Project Membership & Scoped Access
 *
 * Validates Requirements:
 *   5.1  Project membership enforcement
 *   5.2  Package-limited subcontractor access
 *   5.3  Task-limited freelancer access
 *   5.4  Supplier access scoping
 *   5.10 Emulator test suite passes for each criterion
 *   7.1  Non-member project access denial
 *   7.2  Unauthorized subcontractor package access denial
 *   7.3  Unauthorized freelancer task access denial
 *   7.4  Unauthorized supplier package access denial
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const PROJECT_ID = 'architex-rules-test';
const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');

let testEnv: RulesTestEnvironment;

function authedDb(uid: string, token: Record<string, unknown> = {}) {
  if (!testEnv) throw new Error('Firestore emulator not available');
  return testEnv.authenticatedContext(uid, token).firestore();
}

function anonDb() {
  if (!testEnv) throw new Error('Firestore emulator not available');
  return testEnv.unauthenticatedContext().firestore();
}

async function seed(path: string, data: Record<string, unknown>) {
  if (!testEnv) throw new Error('Firestore emulator not available');
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), data);
  });
}

async function seedUser(uid: string, role: string, extra: Record<string, unknown> = {}) {
  await seed(`users/${uid}`, {
    uid,
    email: `${uid}@example.com`,
    displayName: uid,
    role,
    createdAt: '2026-06-01T00:00:00.000Z',
    ...extra,
  });
}


// ─── Common seed helpers ─────────────────────────────────────────────────────

async function seedProject(projectId: string, opts: {
  clientId: string;
  leadProfessionalId?: string;
  teamMembers?: Array<{ userId: string; status: string }>;
  firmAccessEnabled?: boolean;
  firmId?: string;
}) {
  await seed(`projects/${projectId}`, {
    clientId: opts.clientId,
    leadProfessionalId: opts.leadProfessionalId ?? '',
    leadBepId: '',
    leadArchitectId: '',
    teamMembers: opts.teamMembers ?? [],
    firmAccessEnabled: opts.firmAccessEnabled ?? false,
    firmId: opts.firmId ?? '',
    createdAt: '2026-06-01T00:00:00.000Z',
  });
}

async function seedTenderPackage(tenderId: string, opts: {
  projectId: string;
  jobId: string;
  createdBy: string;
  status?: string;
  awardedContractorId?: string;
}) {
  await seed(`tender_packages/${tenderId}`, {
    projectId: opts.projectId,
    jobId: opts.jobId,
    createdBy: opts.createdBy,
    title: 'Test Package',
    description: 'Test',
    scope: 'All',
    documents: [],
    deadline: '2026-12-31',
    requiredDisciplines: ['general'],
    status: opts.status ?? 'awarded',
    awardedContractorId: opts.awardedContractorId ?? '',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  });
}

async function seedJob(jobId: string, clientId: string, selectedProfessionalId?: string) {
  await seed(`jobs/${jobId}`, {
    clientId,
    selectedProfessionalId: selectedProfessionalId ?? '',
    selectedArchitectId: selectedProfessionalId ?? '',
    selectedBepId: '',
    title: 'Test Job',
    description: 'Test',
    budget: 100000,
    status: 'awarded',
    createdAt: '2026-06-01T00:00:00.000Z',
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// Test Suite
// ═════════════════════════════════════════════════════════════════════════════

describe('Firestore Rules: Project Membership & Scoped Access', () => {
  beforeAll(async () => {
    const host = process.env.FIRESTORE_EMULATOR_HOST;
    if (!host) {
      console.warn(
        'Firestore emulator not available — skipping. ' +
        'Start the emulator or run via `npm run test:firestore:rules`.'
      );
      return;
    }
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules },
    });
  });

  beforeEach(async (ctx) => {
    if (!testEnv) {
      ctx.skip();
      return;
    }
    await testEnv.clearFirestore();
  });

  afterAll(async () => {
    if (!testEnv) return;
    await testEnv.cleanup();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Requirement 5.1: Project Membership Enforcement
  // ─────────────────────────────────────────────────────────────────────────

  describe('5.1 — Project membership enforcement', () => {
    it('POSITIVE: project client can read the project', async () => {
      await seedUser('client-1', 'client');
      await seedProject('proj-1', { clientId: 'client-1' });

      const db = authedDb('client-1');
      await assertSucceeds(getDoc(doc(db, 'projects/proj-1')));
    });

    it('POSITIVE: lead professional can read the project', async () => {
      await seedUser('client-1', 'client');
      await seedUser('lead-1', 'architect');
      await seedProject('proj-1', {
        clientId: 'client-1',
        leadProfessionalId: 'lead-1',
      });

      const db = authedDb('lead-1');
      await assertSucceeds(getDoc(doc(db, 'projects/proj-1')));
    });

    it('POSITIVE: active team member can read the project', async () => {
      await seedUser('client-1', 'client');
      await seedUser('team-1', 'engineer');
      await seedProject('proj-1', {
        clientId: 'client-1',
        teamMembers: [{ userId: 'team-1', status: 'active' }],
      });

      const db = authedDb('team-1');
      await assertSucceeds(getDoc(doc(db, 'projects/proj-1')));
    });

    it('POSITIVE: active firm member can read project when firmAccessEnabled', async () => {
      await seedUser('client-1', 'client');
      await seedUser('firm-member-1', 'architect');
      await seed('firms/firm-1', { ownerId: 'firm-owner', createdBy: 'firm-owner', name: 'TestFirm' });
      await seed('firms/firm-1/members/firm-member-1', { userId: 'firm-member-1', status: 'active', role: 'staff' });
      await seedProject('proj-1', {
        clientId: 'client-1',
        firmAccessEnabled: true,
        firmId: 'firm-1',
      });

      const db = authedDb('firm-member-1');
      await assertSucceeds(getDoc(doc(db, 'projects/proj-1')));
    });

    it('NEGATIVE: non-member cannot read the project', async () => {
      await seedUser('client-1', 'client');
      await seedUser('outsider-1', 'contractor');
      await seedProject('proj-1', { clientId: 'client-1' });

      const db = authedDb('outsider-1');
      await assertFails(getDoc(doc(db, 'projects/proj-1')));
    });

    it('NEGATIVE: inactive team member cannot read the project', async () => {
      await seedUser('client-1', 'client');
      await seedUser('inactive-1', 'engineer');
      await seedProject('proj-1', {
        clientId: 'client-1',
        teamMembers: [{ userId: 'inactive-1', status: 'inactive' }],
      });

      const db = authedDb('inactive-1');
      await assertFails(getDoc(doc(db, 'projects/proj-1')));
    });

    it('NEGATIVE: firm member cannot read project when firmAccessEnabled is false', async () => {
      await seedUser('client-1', 'client');
      await seedUser('firm-member-1', 'architect');
      await seed('firms/firm-1', { ownerId: 'firm-owner', createdBy: 'firm-owner', name: 'TestFirm' });
      await seed('firms/firm-1/members/firm-member-1', { userId: 'firm-member-1', status: 'active', role: 'staff' });
      await seedProject('proj-1', {
        clientId: 'client-1',
        firmAccessEnabled: false,
        firmId: 'firm-1',
      });

      const db = authedDb('firm-member-1');
      await assertFails(getDoc(doc(db, 'projects/proj-1')));
    });
  });


  // ─────────────────────────────────────────────────────────────────────────
  // Requirement 5.2: Package-Limited Subcontractor Access
  // ─────────────────────────────────────────────────────────────────────────

  describe('5.2 — Package-limited subcontractor access', () => {
    it('POSITIVE: awarded subcontractor can read package-linked records', async () => {
      await seedUser('client-1', 'client');
      await seedUser('sub-1', 'subcontractor');
      await seedJob('job-1', 'client-1', 'lead-1');
      await seedProject('proj-1', { clientId: 'client-1' });
      await seedTenderPackage('pkg-1', {
        projectId: 'proj-1',
        jobId: 'job-1',
        createdBy: 'client-1',
        status: 'awarded',
        awardedContractorId: 'sub-1',
      });

      // Seed package-linked records
      await seed('package_procurement_commitments/commit-1', {
        projectId: 'proj-1',
        packageId: 'pkg-1',
        createdBy: 'client-1',
        humanReviewRequired: true,
        status: 'pending',
      });
      await seed('package_delivery_evidence/evidence-1', {
        projectId: 'proj-1',
        packageId: 'pkg-1',
        createdBy: 'client-1',
      });
      await seed('site_instructions/si-1', {
        projectId: 'proj-1',
        packageId: 'pkg-1',
        createdBy: 'client-1',
        issuedBy: 'client-1',
        status: 'issued',
        costImpactStatus: 'none',
        programmeImpactStatus: 'none',
        humanReviewRequired: true,
      });

      const db = authedDb('sub-1');
      await assertSucceeds(getDoc(doc(db, 'package_procurement_commitments/commit-1')));
      await assertSucceeds(getDoc(doc(db, 'package_delivery_evidence/evidence-1')));
      await assertSucceeds(getDoc(doc(db, 'site_instructions/si-1')));
    });

    it('NEGATIVE: subcontractor not awarded the package cannot read package-linked records', async () => {
      await seedUser('client-1', 'client');
      await seedUser('sub-1', 'subcontractor');
      await seedUser('sub-2', 'subcontractor');
      await seedJob('job-1', 'client-1', 'lead-1');
      await seedProject('proj-1', { clientId: 'client-1' });
      await seedTenderPackage('pkg-1', {
        projectId: 'proj-1',
        jobId: 'job-1',
        createdBy: 'client-1',
        status: 'awarded',
        awardedContractorId: 'sub-1', // awarded to sub-1, NOT sub-2
      });

      await seed('package_procurement_commitments/commit-1', {
        projectId: 'proj-1',
        packageId: 'pkg-1',
        createdBy: 'client-1',
        humanReviewRequired: true,
        status: 'pending',
      });
      await seed('package_delivery_evidence/evidence-1', {
        projectId: 'proj-1',
        packageId: 'pkg-1',
        createdBy: 'client-1',
      });
      await seed('site_instructions/si-1', {
        projectId: 'proj-1',
        packageId: 'pkg-1',
        createdBy: 'client-1',
        issuedBy: 'client-1',
        status: 'issued',
        costImpactStatus: 'none',
        programmeImpactStatus: 'none',
        humanReviewRequired: true,
      });

      const db = authedDb('sub-2');
      await assertFails(getDoc(doc(db, 'package_procurement_commitments/commit-1')));
      await assertFails(getDoc(doc(db, 'package_delivery_evidence/evidence-1')));
      await assertFails(getDoc(doc(db, 'site_instructions/si-1')));
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Requirement 5.3: Task-Limited Freelancer Access
  // ─────────────────────────────────────────────────────────────────────────

  describe('5.3 — Task-limited freelancer access', () => {
    it('POSITIVE: freelancer assigned to a work package can read it', async () => {
      await seedUser('client-1', 'client');
      await seedUser('freelancer-1', 'freelancer');
      await seedProject('proj-1', { clientId: 'client-1' });

      await seed('projects/proj-1/work_packages/wp-1', {
        projectId: 'proj-1',
        assignedFreelancerId: 'freelancer-1',
        postedBy: 'client-1',
        title: 'Design task',
        status: 'assigned',
      });

      const db = authedDb('freelancer-1');
      await assertSucceeds(getDoc(doc(db, 'projects/proj-1/work_packages/wp-1')));
    });

    it('POSITIVE: freelancer assigned to a work package can update delivery fields', async () => {
      await seedUser('client-1', 'client');
      await seedUser('freelancer-1', 'freelancer');
      await seedProject('proj-1', { clientId: 'client-1' });

      await seed('projects/proj-1/work_packages/wp-1', {
        projectId: 'proj-1',
        assignedFreelancerId: 'freelancer-1',
        postedBy: 'client-1',
        title: 'Design task',
        status: 'assigned',
        deliverables: [],
      });

      const db = authedDb('freelancer-1');
      await assertSucceeds(updateDoc(doc(db, 'projects/proj-1/work_packages/wp-1'), {
        status: 'in_progress',
        deliverables: ['file1.pdf'],
        updatedAt: '2026-06-10T00:00:00.000Z',
      }));
    });

    it('POSITIVE: freelancer assigned via assigneeId can read delegatedTask', async () => {
      await seedUser('freelancer-1', 'freelancer');
      await seedUser('bep-1', 'bep');

      await seed('delegatedTasks/task-1', {
        assigneeId: 'freelancer-1',
        professionalId: 'bep-1',
        architectId: '',
        bepId: 'bep-1',
        title: 'Write report',
        status: 'in-progress',
        humanApprovalRequired: true,
      });

      const db = authedDb('freelancer-1');
      await assertSucceeds(getDoc(doc(db, 'delegatedTasks/task-1')));
    });

    it('NEGATIVE: freelancer NOT assigned cannot read work package', async () => {
      await seedUser('client-1', 'client');
      await seedUser('freelancer-1', 'freelancer');
      await seedUser('freelancer-2', 'freelancer');
      await seedProject('proj-1', { clientId: 'client-1' });

      await seed('projects/proj-1/work_packages/wp-1', {
        projectId: 'proj-1',
        assignedFreelancerId: 'freelancer-1', // assigned to freelancer-1
        postedBy: 'client-1',
        title: 'Design task',
        status: 'assigned',
      });

      const db = authedDb('freelancer-2'); // freelancer-2 tries to read
      await assertFails(getDoc(doc(db, 'projects/proj-1/work_packages/wp-1')));
    });

    it('NEGATIVE: freelancer NOT assigned cannot read delegatedTask', async () => {
      await seedUser('freelancer-1', 'freelancer');
      await seedUser('freelancer-2', 'freelancer');
      await seedUser('bep-1', 'bep');

      await seed('delegatedTasks/task-1', {
        assigneeId: 'freelancer-1', // assigned to freelancer-1
        professionalId: 'bep-1',
        architectId: '',
        bepId: 'bep-1',
        title: 'Write report',
        status: 'in-progress',
        humanApprovalRequired: true,
      });

      const db = authedDb('freelancer-2'); // freelancer-2 tries to read
      await assertFails(getDoc(doc(db, 'delegatedTasks/task-1')));
    });

    it('NEGATIVE: freelancer NOT assigned cannot update work package', async () => {
      await seedUser('client-1', 'client');
      await seedUser('freelancer-2', 'freelancer');
      await seedProject('proj-1', { clientId: 'client-1' });

      await seed('projects/proj-1/work_packages/wp-1', {
        projectId: 'proj-1',
        assignedFreelancerId: 'freelancer-1',
        postedBy: 'client-1',
        title: 'Design task',
        status: 'assigned',
        deliverables: [],
      });

      const db = authedDb('freelancer-2');
      await assertFails(updateDoc(doc(db, 'projects/proj-1/work_packages/wp-1'), {
        status: 'completed',
        updatedAt: '2026-06-10T00:00:00.000Z',
      }));
    });
  });


  // ─────────────────────────────────────────────────────────────────────────
  // Requirement 5.4: Supplier Access Scoping
  // ─────────────────────────────────────────────────────────────────────────

  describe('5.4 — Supplier access scoping', () => {
    it('POSITIVE: supplier awarded the package can read tender package', async () => {
      await seedUser('client-1', 'client');
      await seedUser('supplier-1', 'supplier');
      await seedJob('job-1', 'client-1', 'lead-1');
      await seedProject('proj-1', { clientId: 'client-1' });
      await seedTenderPackage('pkg-1', {
        projectId: 'proj-1',
        jobId: 'job-1',
        createdBy: 'client-1',
        status: 'awarded',
        awardedContractorId: 'supplier-1',
      });

      const db = authedDb('supplier-1');
      await assertSucceeds(getDoc(doc(db, 'tender_packages/pkg-1')));
    });

    it('POSITIVE: supplier with eligible role can read published tender package', async () => {
      await seedUser('client-1', 'client');
      await seedUser('supplier-1', 'supplier');
      await seedJob('job-1', 'client-1', 'lead-1');
      await seedProject('proj-1', { clientId: 'client-1' });
      await seedTenderPackage('pkg-1', {
        projectId: 'proj-1',
        jobId: 'job-1',
        createdBy: 'client-1',
        status: 'published', // published = open for bids
        awardedContractorId: '',
      });

      const db = authedDb('supplier-1');
      await assertSucceeds(getDoc(doc(db, 'tender_packages/pkg-1')));
    });

    it('POSITIVE: awarded supplier can read package-linked records', async () => {
      await seedUser('client-1', 'client');
      await seedUser('supplier-1', 'supplier');
      await seedJob('job-1', 'client-1', 'lead-1');
      await seedProject('proj-1', { clientId: 'client-1' });
      await seedTenderPackage('pkg-1', {
        projectId: 'proj-1',
        jobId: 'job-1',
        createdBy: 'client-1',
        status: 'awarded',
        awardedContractorId: 'supplier-1',
      });

      await seed('package_procurement_commitments/commit-1', {
        projectId: 'proj-1',
        packageId: 'pkg-1',
        createdBy: 'client-1',
        humanReviewRequired: true,
        status: 'pending',
      });
      await seed('package_delivery_evidence/evidence-1', {
        projectId: 'proj-1',
        packageId: 'pkg-1',
        createdBy: 'client-1',
      });

      const db = authedDb('supplier-1');
      await assertSucceeds(getDoc(doc(db, 'package_procurement_commitments/commit-1')));
      await assertSucceeds(getDoc(doc(db, 'package_delivery_evidence/evidence-1')));
    });

    it('NEGATIVE: supplier NOT awarded/eligible cannot read non-published package', async () => {
      await seedUser('client-1', 'client');
      await seedUser('supplier-1', 'supplier');
      await seedUser('supplier-2', 'supplier');
      await seedJob('job-1', 'client-1', 'lead-1');
      await seedProject('proj-1', { clientId: 'client-1' });
      await seedTenderPackage('pkg-1', {
        projectId: 'proj-1',
        jobId: 'job-1',
        createdBy: 'client-1',
        status: 'awarded',
        awardedContractorId: 'supplier-1', // awarded to supplier-1
      });

      const db = authedDb('supplier-2'); // supplier-2 is not awarded
      await assertFails(getDoc(doc(db, 'tender_packages/pkg-1')));
    });

    it('NEGATIVE: supplier NOT awarded cannot read package-linked records', async () => {
      await seedUser('client-1', 'client');
      await seedUser('supplier-1', 'supplier');
      await seedUser('supplier-2', 'supplier');
      await seedJob('job-1', 'client-1', 'lead-1');
      await seedProject('proj-1', { clientId: 'client-1' });
      await seedTenderPackage('pkg-1', {
        projectId: 'proj-1',
        jobId: 'job-1',
        createdBy: 'client-1',
        status: 'awarded',
        awardedContractorId: 'supplier-1',
      });

      await seed('package_procurement_commitments/commit-1', {
        projectId: 'proj-1',
        packageId: 'pkg-1',
        createdBy: 'client-1',
        humanReviewRequired: true,
        status: 'pending',
      });

      const db = authedDb('supplier-2');
      await assertFails(getDoc(doc(db, 'package_procurement_commitments/commit-1')));
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Requirements 7.1–7.4: Non-Member Project Access Denial
  // ─────────────────────────────────────────────────────────────────────────

  describe('7.1 — Non-member project access denial across collections', () => {
    it('denies non-member read on project documents', async () => {
      await seedUser('client-1', 'client');
      await seedUser('outsider-1', 'contractor');
      await seedProject('proj-1', { clientId: 'client-1' });

      await seed('projects/proj-1/documents/doc-1', {
        id: 'doc-1',
        projectId: 'proj-1',
        title: 'Site Plan',
        documentType: 'drawing',
        status: 'active',
        currentVersionId: 'v1',
        currentRevision: 'A',
        createdBy: 'client-1',
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      });

      const db = authedDb('outsider-1');
      await assertFails(getDoc(doc(db, 'projects/proj-1/documents/doc-1')));
    });

    it('denies non-member read on drawing checklists', async () => {
      await seedUser('client-1', 'client');
      await seedUser('outsider-1', 'contractor');
      await seedProject('proj-1', { clientId: 'client-1' });

      await seed('projects/proj-1/drawing_checklists/chk-1', {
        projectId: 'proj-1',
        createdBy: 'client-1',
        title: 'Drawing Review Checklist',
      });

      const db = authedDb('outsider-1');
      await assertFails(getDoc(doc(db, 'projects/proj-1/drawing_checklists/chk-1')));
    });

    it('denies non-member read on municipal submissions', async () => {
      await seedUser('client-1', 'client');
      await seedUser('outsider-1', 'contractor');
      await seedProject('proj-1', { clientId: 'client-1' });

      await seed('projects/proj-1/municipal_submissions/sub-1', {
        projectId: 'proj-1',
        createdBy: 'client-1',
        title: 'Building Plan Submission',
      });

      const db = authedDb('outsider-1');
      await assertFails(getDoc(doc(db, 'projects/proj-1/municipal_submissions/sub-1')));
    });

    it('denies non-member read on gantt tasks', async () => {
      await seedUser('client-1', 'client');
      await seedUser('outsider-1', 'contractor');
      await seedProject('proj-1', { clientId: 'client-1' });

      await seed('projects/proj-1/gantt_tasks/gt-1', {
        projectId: 'proj-1',
        title: 'Foundation',
        phase: 'build',
        startDate: '2026-07-01',
        endDate: '2026-07-31',
        progress: 0,
        status: 'not_started',
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      });

      const db = authedDb('outsider-1');
      await assertFails(getDoc(doc(db, 'projects/proj-1/gantt_tasks/gt-1')));
    });

    it('denies non-member read on transmittals', async () => {
      await seedUser('client-1', 'client');
      await seedUser('outsider-1', 'contractor');
      await seedProject('proj-1', { clientId: 'client-1' });

      await seed('projects/proj-1/transmittals/tr-1', {
        id: 'tr-1',
        projectId: 'proj-1',
        title: 'Drawing Transmittal',
        status: 'issued',
        recipientIds: ['engineer-1'],
        documentVersionIds: ['v1'],
        issuedBy: 'client-1',
        issuedAt: '2026-06-01T00:00:00.000Z',
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      });

      const db = authedDb('outsider-1');
      await assertFails(getDoc(doc(db, 'projects/proj-1/transmittals/tr-1')));
    });

    it('denies non-member read on coordination items', async () => {
      await seedUser('client-1', 'client');
      await seedUser('outsider-1', 'contractor');
      await seedProject('proj-1', { clientId: 'client-1' });

      await seed('projects/proj-1/coordination_items/ci-1', {
        projectId: 'proj-1',
        createdBy: 'client-1',
        title: 'Structural coordination',
        description: 'Resolve clash',
        status: 'open',
      });

      const db = authedDb('outsider-1');
      await assertFails(getDoc(doc(db, 'projects/proj-1/coordination_items/ci-1')));
    });

    it('allows project member to read all project sub-collections', async () => {
      await seedUser('client-1', 'client');
      await seedProject('proj-1', { clientId: 'client-1' });

      await seed('projects/proj-1/documents/doc-1', {
        id: 'doc-1',
        projectId: 'proj-1',
        title: 'Site Plan',
        documentType: 'drawing',
        status: 'active',
        currentVersionId: 'v1',
        currentRevision: 'A',
        createdBy: 'client-1',
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      });
      await seed('projects/proj-1/drawing_checklists/chk-1', {
        projectId: 'proj-1',
        createdBy: 'client-1',
        title: 'Checklist',
      });
      await seed('projects/proj-1/municipal_submissions/sub-1', {
        projectId: 'proj-1',
        createdBy: 'client-1',
        title: 'Submission',
      });
      await seed('projects/proj-1/gantt_tasks/gt-1', {
        projectId: 'proj-1',
        title: 'Task',
        phase: 'design',
        startDate: '2026-07-01',
        endDate: '2026-07-31',
        progress: 50,
        status: 'in_progress',
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      });
      await seed('projects/proj-1/transmittals/tr-1', {
        id: 'tr-1',
        projectId: 'proj-1',
        title: 'Transmittal',
        status: 'issued',
        recipientIds: ['a'],
        documentVersionIds: ['v1'],
        issuedBy: 'client-1',
        issuedAt: '2026-06-01T00:00:00.000Z',
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      });
      await seed('projects/proj-1/coordination_items/ci-1', {
        projectId: 'proj-1',
        createdBy: 'client-1',
        title: 'Item',
        description: 'Desc',
        status: 'open',
      });

      const db = authedDb('client-1');
      await assertSucceeds(getDoc(doc(db, 'projects/proj-1/documents/doc-1')));
      await assertSucceeds(getDoc(doc(db, 'projects/proj-1/drawing_checklists/chk-1')));
      await assertSucceeds(getDoc(doc(db, 'projects/proj-1/municipal_submissions/sub-1')));
      await assertSucceeds(getDoc(doc(db, 'projects/proj-1/gantt_tasks/gt-1')));
      await assertSucceeds(getDoc(doc(db, 'projects/proj-1/transmittals/tr-1')));
      await assertSucceeds(getDoc(doc(db, 'projects/proj-1/coordination_items/ci-1')));
    });
  });

  describe('7.2 — Unauthorized subcontractor package access denial', () => {
    it('denies unauthorized subcontractor read on package_procurement_commitments', async () => {
      await seedUser('client-1', 'client');
      await seedUser('sub-unauth', 'subcontractor');
      await seedJob('job-1', 'client-1');
      await seedProject('proj-1', { clientId: 'client-1' });
      await seedTenderPackage('pkg-1', {
        projectId: 'proj-1',
        jobId: 'job-1',
        createdBy: 'client-1',
        status: 'awarded',
        awardedContractorId: 'other-sub',
      });

      await seed('package_procurement_commitments/commit-1', {
        projectId: 'proj-1',
        packageId: 'pkg-1',
        createdBy: 'client-1',
        humanReviewRequired: true,
        status: 'pending',
      });

      const db = authedDb('sub-unauth');
      await assertFails(getDoc(doc(db, 'package_procurement_commitments/commit-1')));
    });

    it('denies unauthorized subcontractor read on package_delivery_evidence', async () => {
      await seedUser('client-1', 'client');
      await seedUser('sub-unauth', 'subcontractor');
      await seedJob('job-1', 'client-1');
      await seedProject('proj-1', { clientId: 'client-1' });
      await seedTenderPackage('pkg-1', {
        projectId: 'proj-1',
        jobId: 'job-1',
        createdBy: 'client-1',
        status: 'awarded',
        awardedContractorId: 'other-sub',
      });

      await seed('package_delivery_evidence/evidence-1', {
        projectId: 'proj-1',
        packageId: 'pkg-1',
        createdBy: 'client-1',
      });

      const db = authedDb('sub-unauth');
      await assertFails(getDoc(doc(db, 'package_delivery_evidence/evidence-1')));
    });

    it('denies unauthorized subcontractor read on site_instructions', async () => {
      await seedUser('client-1', 'client');
      await seedUser('sub-unauth', 'subcontractor');
      await seedJob('job-1', 'client-1');
      await seedProject('proj-1', { clientId: 'client-1' });
      await seedTenderPackage('pkg-1', {
        projectId: 'proj-1',
        jobId: 'job-1',
        createdBy: 'client-1',
        status: 'awarded',
        awardedContractorId: 'other-sub',
      });

      await seed('site_instructions/si-1', {
        projectId: 'proj-1',
        packageId: 'pkg-1',
        createdBy: 'client-1',
        issuedBy: 'client-1',
        status: 'issued',
        costImpactStatus: 'none',
        programmeImpactStatus: 'none',
        humanReviewRequired: true,
      });

      const db = authedDb('sub-unauth');
      await assertFails(getDoc(doc(db, 'site_instructions/si-1')));
    });
  });

  describe('7.3 — Unauthorized freelancer task access denial', () => {
    it('denies unauthorized freelancer read on work_packages', async () => {
      await seedUser('client-1', 'client');
      await seedUser('freelancer-unauth', 'freelancer');
      await seedProject('proj-1', { clientId: 'client-1' });

      await seed('projects/proj-1/work_packages/wp-1', {
        projectId: 'proj-1',
        assignedFreelancerId: 'other-freelancer',
        postedBy: 'client-1',
        title: 'Task',
        status: 'assigned',
      });

      const db = authedDb('freelancer-unauth');
      await assertFails(getDoc(doc(db, 'projects/proj-1/work_packages/wp-1')));
    });

    it('denies unauthorized freelancer update on work_packages', async () => {
      await seedUser('client-1', 'client');
      await seedUser('freelancer-unauth', 'freelancer');
      await seedProject('proj-1', { clientId: 'client-1' });

      await seed('projects/proj-1/work_packages/wp-1', {
        projectId: 'proj-1',
        assignedFreelancerId: 'other-freelancer',
        postedBy: 'client-1',
        title: 'Task',
        status: 'assigned',
        deliverables: [],
      });

      const db = authedDb('freelancer-unauth');
      await assertFails(updateDoc(doc(db, 'projects/proj-1/work_packages/wp-1'), {
        status: 'completed',
        deliverables: ['hack.pdf'],
        updatedAt: '2026-06-10T00:00:00.000Z',
      }));
    });
  });

  describe('7.4 — Unauthorized supplier package access denial', () => {
    it('denies unauthorized supplier read on awarded non-published tender package', async () => {
      await seedUser('client-1', 'client');
      await seedUser('supplier-unauth', 'supplier');
      await seedJob('job-1', 'client-1');
      await seedProject('proj-1', { clientId: 'client-1' });
      await seedTenderPackage('pkg-1', {
        projectId: 'proj-1',
        jobId: 'job-1',
        createdBy: 'client-1',
        status: 'awarded',
        awardedContractorId: 'other-supplier',
      });

      const db = authedDb('supplier-unauth');
      await assertFails(getDoc(doc(db, 'tender_packages/pkg-1')));
    });

    it('denies unauthorized supplier read on package-linked records', async () => {
      await seedUser('client-1', 'client');
      await seedUser('supplier-unauth', 'supplier');
      await seedJob('job-1', 'client-1');
      await seedProject('proj-1', { clientId: 'client-1' });
      await seedTenderPackage('pkg-1', {
        projectId: 'proj-1',
        jobId: 'job-1',
        createdBy: 'client-1',
        status: 'awarded',
        awardedContractorId: 'other-supplier',
      });

      await seed('package_procurement_commitments/commit-1', {
        projectId: 'proj-1',
        packageId: 'pkg-1',
        createdBy: 'client-1',
        humanReviewRequired: true,
        status: 'pending',
      });
      await seed('package_delivery_evidence/evidence-1', {
        projectId: 'proj-1',
        packageId: 'pkg-1',
        createdBy: 'client-1',
      });

      const db = authedDb('supplier-unauth');
      await assertFails(getDoc(doc(db, 'package_procurement_commitments/commit-1')));
      await assertFails(getDoc(doc(db, 'package_delivery_evidence/evidence-1')));
    });
  });
});
