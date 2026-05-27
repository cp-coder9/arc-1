import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const PROJECT_ID = 'architex-rules-test';
const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');

let testEnv: RulesTestEnvironment;

function authedDb(uid: string, token: Record<string, unknown> = {}) {
  return testEnv.authenticatedContext(uid, token).firestore();
}

function anonDb() {
  return testEnv.unauthenticatedContext().firestore();
}

async function seed(path: string, data: Record<string, unknown>) {
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
    createdAt: '2026-05-27T00:00:00.000Z',
    ...extra,
  });
}

describe('Firestore emulator allow/deny security matrix', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it('enforces user profile ownership and blocks privilege escalation fields', async () => {
    await seedUser('client-1', 'client');
    await seedUser('contractor-1', 'contractor');

    const owner = authedDb('client-1');
    const other = authedDb('contractor-1');
    const admin = authedDb('admin-1', { admin: true, email: 'admin@example.com' });

    await assertSucceeds(updateDoc(doc(owner, 'users/client-1'), {
      displayName: 'Client One',
      updatedAt: 'now',
    }));

    await assertFails(updateDoc(doc(owner, 'users/client-1'), {
      role: 'admin',
      updatedAt: 'now',
    }));

    await assertFails(updateDoc(doc(other, 'users/client-1'), {
      displayName: 'Impersonated',
      updatedAt: 'now',
    }));

    await assertSucceeds(updateDoc(doc(admin, 'users/client-1'), {
      role: 'bep',
      updatedAt: 'now',
    }));
  });

  it('enforces firm membership reads, invite creation, and admin-only deletion', async () => {
    await seedUser('owner-1', 'bep');
    await seedUser('member-1', 'architect');
    await seedUser('outsider-1', 'client');
    await seed('firms/firm-1', {
      ownerId: 'owner-1',
      createdBy: 'owner-1',
      name: 'Firm One',
      createdAt: 'now',
    });
    await seed('firms/firm-1/members/member-1', {
      userId: 'member-1',
      role: 'member',
      status: 'active',
      createdAt: 'now',
    });

    const owner = authedDb('owner-1');
    const member = authedDb('member-1');
    const outsider = authedDb('outsider-1');
    const admin = authedDb('admin-1', { admin: true });

    await assertSucceeds(getDoc(doc(owner, 'firms/firm-1')));
    await assertSucceeds(getDoc(doc(member, 'firms/firm-1')));
    await assertFails(getDoc(doc(outsider, 'firms/firm-1')));

    await assertSucceeds(setDoc(doc(member, 'firm_invites/invite-1'), {
      firmId: 'firm-1',
      invitedBy: 'member-1',
      invitedUid: 'candidate-1',
      email: 'candidate@example.com',
      status: 'pending',
      createdAt: 'now',
    }));

    await assertFails(setDoc(doc(outsider, 'firm_invites/invite-2'), {
      firmId: 'firm-1',
      invitedBy: 'outsider-1',
      invitedUid: 'candidate-2',
      email: 'candidate2@example.com',
      status: 'pending',
      createdAt: 'now',
    }));

    await assertFails(deleteDoc(doc(member, 'firms/firm-1')));
    await assertSucceeds(deleteDoc(doc(admin, 'firms/firm-1')));
  });

  it('keeps financial state server/admin-owned while allowing scoped reads', async () => {
    await seedUser('payer-1', 'client');
    await seedUser('payee-1', 'bep');
    await seedUser('other-1', 'contractor');
    await seed('jobs/job-1', {
      clientId: 'payer-1',
      selectedArchitectId: 'payee-1',
      status: 'awarded',
      title: 'Job One',
      createdAt: 'now',
    });
    await seed('payments/payment-1', {
      payerId: 'payer-1',
      payeeId: 'payee-1',
      amount: 1000,
      status: 'pending',
    });
    await seed('escrow/job-1', {
      payerId: 'payer-1',
      payeeId: 'payee-1',
      clientId: 'payer-1',
      amountHeld: 1000,
      status: 'funded',
    });
    await seed('ledger/entry-1', {
      projectId: 'project-1',
      jobId: 'job-1',
      type: 'escrow_funding',
      amount: 1000,
      direction: 'credit',
      description: 'Funding',
      payerId: 'payer-1',
      payeeId: 'payee-1',
      createdAt: 'now',
    });

    const payer = authedDb('payer-1');
    const payee = authedDb('payee-1');
    const other = authedDb('other-1');
    const admin = authedDb('admin-1', { admin: true });

    await assertSucceeds(getDoc(doc(payer, 'payments/payment-1')));
    await assertSucceeds(getDoc(doc(payee, 'escrow/job-1')));
    await assertFails(getDoc(doc(other, 'payments/payment-1')));

    await assertFails(setDoc(doc(payer, 'payments/payment-2'), {
      payerId: 'payer-1',
      payeeId: 'payee-1',
      amount: 200,
      status: 'paid',
    }));
    await assertSucceeds(setDoc(doc(admin, 'payments/payment-2'), {
      payerId: 'payer-1',
      payeeId: 'payee-1',
      amount: 200,
      status: 'paid',
    }));

    await assertFails(updateDoc(doc(payer, 'escrow/job-1'), { status: 'released' }));
    await assertSucceeds(updateDoc(doc(admin, 'escrow/job-1'), { status: 'released' }));

    await assertFails(updateDoc(doc(admin, 'ledger/entry-1'), { amount: 1 }));
    await assertFails(deleteDoc(doc(admin, 'ledger/entry-1')));
    await assertSucceeds(setDoc(doc(admin, 'ledger/entry-2'), {
      projectId: 'project-1',
      jobId: 'job-1',
      type: 'escrow_release',
      amount: 500,
      direction: 'debit',
      description: 'Release',
      payerId: 'payer-1',
      payeeId: 'payee-1',
      createdAt: 'now',
    }));
  });

  it('blocks browser mutation of subscriptions, credits, AI governance, and human signoff records', async () => {
    await seedUser('user-1', 'client');
    await seedUser('project-client', 'client');
    await seed('projects/project-1', {
      clientId: 'project-client',
      leadProfessionalId: 'bep-1',
      teamMembers: [],
      firmAccessEnabled: false,
    });
    await seed('subscriptions/sub-1', {
      userId: 'user-1',
      status: 'active',
      plan: 'pro',
    });
    await seed('credits/credit-1', {
      userId: 'user-1',
      balance: 10,
    });
    await seed('ai_review_queue/item-1', {
      projectId: 'project-1',
      status: 'pending',
    });
    await seed('human_signoffs/signoff-1', {
      target: { projectId: 'project-1' },
      domain: 'payment_release',
      status: 'pending',
    });

    const user = authedDb('user-1');
    const projectClient = authedDb('project-client');
    const admin = authedDb('admin-1', { admin: true });

    await assertSucceeds(getDoc(doc(user, 'subscriptions/sub-1')));
    await assertFails(updateDoc(doc(user, 'subscriptions/sub-1'), { status: 'active' }));
    await assertFails(updateDoc(doc(user, 'credits/credit-1'), { balance: 999 }));
    await assertSucceeds(updateDoc(doc(admin, 'credits/credit-1'), { balance: 11 }));

    await assertSucceeds(getDoc(doc(projectClient, 'ai_review_queue/item-1')));
    await assertFails(setDoc(doc(projectClient, 'ai_review_queue/item-2'), {
      projectId: 'project-1',
      status: 'approved',
    }));
    await assertFails(updateDoc(doc(projectClient, 'human_signoffs/signoff-1'), { status: 'approved' }));
  });

  it('enforces CPD attempt ownership and verification anti-spoofing', async () => {
    await seedUser('learner-1', 'architect');
    await seedUser('other-1', 'architect');
    await seed('cpd_attempts/attempt-1', {
      userId: 'learner-1',
      assessmentId: 'assessment-1',
      score: 75,
      humanReviewRequired: true,
      createdAt: 'now',
    });
    await seed('user_verifications/verification-1', {
      userId: 'learner-1',
      subjectType: 'bep',
      statutoryBody: 'SACAP',
      status: 'pending',
      createdAt: 'now',
    });

    const learner = authedDb('learner-1');
    const other = authedDb('other-1');
    const admin = authedDb('admin-1', { admin: true });

    await assertSucceeds(getDoc(doc(learner, 'cpd_attempts/attempt-1')));
    await assertFails(getDoc(doc(other, 'cpd_attempts/attempt-1')));
    await assertSucceeds(setDoc(doc(learner, 'cpd_attempts/attempt-2'), {
      userId: 'learner-1',
      assessmentId: 'assessment-1',
      answers: ['a'],
      humanReviewRequired: true,
      createdAt: 'now',
    }));
    await assertFails(setDoc(doc(learner, 'cpd_attempts/attempt-3'), {
      userId: 'learner-1',
      assessmentId: 'assessment-1',
      answers: ['a'],
      humanReviewRequired: false,
      createdAt: 'now',
    }));

    await assertFails(updateDoc(doc(learner, 'user_verifications/verification-1'), { status: 'verified' }));
    await assertSucceeds(updateDoc(doc(admin, 'user_verifications/verification-1'), { status: 'verified' }));
  });

  it('denies anonymous reads for protected records', async () => {
    await seed('credits/credit-1', { userId: 'user-1', balance: 10 });
    await assertFails(getDoc(doc(anonDb(), 'credits/credit-1')));
  });
});
