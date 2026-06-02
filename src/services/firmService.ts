import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  runTransaction,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import type { DocumentReference, UpdateData } from 'firebase/firestore';
import { Firm, FirmInvite, FirmMember, FirmRole, Project, UserProfile } from '@/types';
import { notificationService } from './notificationService';

const FIRMS_COL = 'firms';
const FIRM_INVITES_COL = 'firm_invites';

const MANAGER_ROLES: FirmRole[] = ['owner', 'admin'];
const VALID_ROLES: FirmRole[] = ['owner', 'admin', 'coordinator', 'staff', 'billing_viewer'];

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function assertValidRole(role: FirmRole): void {
  if (!VALID_ROLES.includes(role)) throw new Error(`Invalid firm role: ${role}`);
}

async function getFirmMemberRecord(firmId: string, userId: string): Promise<FirmMember | null> {
  const memberSnap = await getDoc(doc(db, FIRMS_COL, firmId, 'members', userId));
  if (!memberSnap.exists()) return null;
  return { id: memberSnap.id, ...memberSnap.data() } as FirmMember;
}

async function assertCanManageFirm(firmId: string, actorId: string): Promise<FirmMember> {
  const actor = await getFirmMemberRecord(firmId, actorId);
  if (!actor || actor.status !== 'active' || !MANAGER_ROLES.includes(actor.role)) {
    throw new Error('Only active firm owners or admins can manage firm membership');
  }
  return actor;
}

async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const userSnap = await getDoc(doc(db, 'users', userId));
  return userSnap.exists() ? ({ uid: userSnap.id, ...userSnap.data() } as UserProfile) : null;
}

async function appendAuditEvent(firmId: string, actorId: string, type: string, metadata: Record<string, unknown> = {}): Promise<void> {
  await addDoc(collection(db, FIRMS_COL, firmId, 'audit_events'), {
    firmId,
    actorId,
    type,
    metadata,
    createdAt: new Date().toISOString(),
  });
}

export async function createFirm(input: { name: string; ownerId: string; primaryContactEmail?: string; billingEmail?: string; description?: string }): Promise<Firm> {
  try {
    const name = input.name.trim();
    if (!name) throw new Error('Firm name is required');
    if (!input.ownerId) throw new Error('Firm owner is required');

    const now = new Date().toISOString();
    const firmRef = doc(collection(db, FIRMS_COL));
    const ownerProfile = await getUserProfile(input.ownerId);
    const firm: Firm = {
      id: firmRef.id,
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      description: input.description?.trim() || '',
      ownerId: input.ownerId,
      primaryContactEmail: input.primaryContactEmail ? normalizeEmail(input.primaryContactEmail) : ownerProfile?.email || '',
      billingEmail: input.billingEmail ? normalizeEmail(input.billingEmail) : input.primaryContactEmail ? normalizeEmail(input.primaryContactEmail) : ownerProfile?.email || '',
      subscriptionStatus: 'none',
      createdBy: input.ownerId,
      createdAt: now,
      updatedAt: now,
    };

    const ownerMember: FirmMember = {
      id: input.ownerId,
      firmId: firmRef.id,
      userId: input.ownerId,
      email: ownerProfile?.email || firm.primaryContactEmail || '',
      displayName: ownerProfile?.displayName || '',
      role: 'owner',
      status: 'active',
      createdAt: now,
      updatedAt: now,
      acceptedAt: now,
    };

    const batch = writeBatch(db);
    batch.set(firmRef, firm);
    batch.set(doc(db, FIRMS_COL, firmRef.id, 'members', input.ownerId), ownerMember);
	    batch.update(doc(db, 'users', input.ownerId), {
	      primaryFirmId: firmRef.id,
	      firmMembershipIds: arrayUnion(firmRef.id),
	      firmRole: 'owner',
	      firmStatus: 'active',
	      updatedAt: now,
    });
    await batch.commit();
    await appendAuditEvent(firmRef.id, input.ownerId, 'firm_created', { firmName: name });
    return firm;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, FIRMS_COL);
  }
}

export async function inviteFirmMember(input: { firmId: string; email: string; role: FirmRole; invitedBy: string; invitedUid?: string; expiresAt?: string }): Promise<FirmInvite> {
  try {
    assertValidRole(input.role);
    if (input.role === 'owner') throw new Error('Owner transfers are not supported by firm invites');
    const manager = await assertCanManageFirm(input.firmId, input.invitedBy);
    const email = normalizeEmail(input.email);
    if (!email) throw new Error('Invite recipient email is required');

    const now = new Date().toISOString();
    const inviteRef = doc(collection(db, FIRM_INVITES_COL));
    const invite: FirmInvite = {
      id: inviteRef.id,
      firmId: input.firmId,
      email,
      invitedUid: input.invitedUid,
      role: input.role,
      status: 'pending',
      invitedBy: input.invitedBy,
      invitedAt: now,
      expiresAt: input.expiresAt,
      createdAt: now,
      updatedAt: now,
    };

    await setDoc(inviteRef, invite);
    if (input.invitedUid) {
      await notificationService.notifyFirmInvite(input.invitedUid, input.firmId, inviteRef.id, manager.displayName || manager.email || 'A firm administrator');
    }
    await appendAuditEvent(input.firmId, input.invitedBy, 'member_invited', { inviteId: inviteRef.id, email, role: input.role });
    return invite;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, FIRM_INVITES_COL);
  }
}

export async function acceptFirmInvite(inviteId: string, user: Pick<UserProfile, 'uid' | 'email' | 'displayName'>): Promise<FirmMember> {
  try {
    const email = normalizeEmail(user.email || '');

    const { invite, member } = await runTransaction(db, async (transaction) => {
      const inviteRef = doc(db, FIRM_INVITES_COL, inviteId);
      const inviteSnap = await transaction.get(inviteRef);
      if (!inviteSnap.exists()) throw new Error('Firm invite not found');
      const currentInvite = { id: inviteSnap.id, ...inviteSnap.data() } as FirmInvite;

      if (currentInvite.status !== 'pending') throw new Error('Firm invite is no longer pending');
      if (currentInvite.expiresAt && new Date(currentInvite.expiresAt).getTime() < Date.now()) throw new Error('Firm invite has expired');
      if (currentInvite.invitedUid && currentInvite.invitedUid !== user.uid) throw new Error('Firm invite is not assigned to this user');
      if (!currentInvite.invitedUid && normalizeEmail(currentInvite.email) !== email) throw new Error('Firm invite email does not match the signed-in user');

      const now = new Date().toISOString();
      const acceptedMember: FirmMember = {
        id: user.uid,
        firmId: currentInvite.firmId,
        userId: user.uid,
        email,
        displayName: user.displayName,
        role: currentInvite.role,
        status: 'active',
        invitedBy: currentInvite.invitedBy,
        invitedAt: currentInvite.invitedAt,
        acceptedAt: now,
        createdAt: now,
        updatedAt: now,
      };

      transaction.set(doc(db, FIRMS_COL, currentInvite.firmId, 'members', user.uid), acceptedMember);
      transaction.update(inviteRef, { status: 'accepted', acceptedBy: user.uid, acceptedAt: now, updatedAt: now });
      transaction.update(doc(db, 'users', user.uid), {
        primaryFirmId: currentInvite.firmId,
        firmMembershipIds: arrayUnion(currentInvite.firmId),
        firmRole: currentInvite.role,
        firmStatus: 'active',
        updatedAt: now,
      });

      return { invite: currentInvite, member: acceptedMember };
    });
    await notificationService.notifyFirmRoleChanged(user.uid, invite.firmId, invite.role, invite.invitedBy);
    await appendAuditEvent(invite.firmId, user.uid, 'invite_accepted', { inviteId });
    return member;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${FIRM_INVITES_COL}/${inviteId}`);
  }
}

export async function updateFirmMemberRole(firmId: string, memberId: string, role: FirmRole, actorId: string): Promise<void> {
  try {
    assertValidRole(role);
    if (role === 'owner') throw new Error('Owner role changes require a dedicated ownership transfer');
    await assertCanManageFirm(firmId, actorId);
    const member = await getFirmMemberRecord(firmId, memberId);
    if (!member || member.status === 'removed') throw new Error('Firm member not found');
    if (member.role === 'owner') throw new Error('Owner role cannot be changed');
    const now = new Date().toISOString();
    await updateDoc(doc(db, FIRMS_COL, firmId, 'members', memberId), { role, updatedAt: now });
    await notificationService.notifyFirmRoleChanged(memberId, firmId, role, actorId);
    await appendAuditEvent(firmId, actorId, 'role_changed', { memberId, role });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${FIRMS_COL}/${firmId}/members/${memberId}`);
  }
}

export async function removeFirmMember(firmId: string, memberId: string, actorId: string): Promise<void> {
  try {
    await assertCanManageFirm(firmId, actorId);
    const member = await getFirmMemberRecord(firmId, memberId);
    if (!member || member.status === 'removed') throw new Error('Firm member not found');
    if (member.role === 'owner') throw new Error('Firm owner cannot be removed');
	    const now = new Date().toISOString();
	    const userRef = doc(db, 'users', memberId) as DocumentReference<UserProfile>;
	    const userProfile = await getDoc(userRef);
    const userUpdates: UpdateData<UserProfile> = {
      firmMembershipIds: arrayRemove(firmId),
      updatedAt: now,
    };
    if (userProfile.exists() && userProfile.data().primaryFirmId === firmId) {
      userUpdates.primaryFirmId = deleteField();
      userUpdates.firmRole = deleteField();
      userUpdates.firmStatus = 'removed';
    }
	    const batch = writeBatch(db);
	    batch.update(doc(db, FIRMS_COL, firmId, 'members', memberId), { status: 'removed', removedBy: actorId, removedAt: now, updatedAt: now });
	    batch.update(doc(db, 'users', memberId), userUpdates);
	    await batch.commit();
	    await notificationService.notifyFirmMemberRemoved(memberId, firmId, actorId);
	    await appendAuditEvent(firmId, actorId, 'member_removed', { memberId });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${FIRMS_COL}/${firmId}/members/${memberId}`);
  }
}

export async function getFirm(firmId: string): Promise<Firm | null> {
  try {
    const snap = await getDoc(doc(db, FIRMS_COL, firmId));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as Firm) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${FIRMS_COL}/${firmId}`);
  }
}

export async function getFirmMembers(firmId: string): Promise<FirmMember[]> {
  try {
    const snapshot = await getDocs(query(collection(db, FIRMS_COL, firmId, 'members'), where('status', '!=', 'removed')));
    return snapshot.docs.map((memberDoc) => ({ id: memberDoc.id, ...memberDoc.data() } as FirmMember));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${FIRMS_COL}/${firmId}/members`);
  }
}

export function subscribeToFirm(firmId: string, callback: (firm: Firm | null) => void): () => void {
  return onSnapshot(doc(db, FIRMS_COL, firmId), (snapshot) => {
    callback(snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as Firm) : null);
  }, (error) => {
    console.error('Failed to subscribe to firm:', error);
    callback(null);
  });
}

export function subscribeToFirmMembers(firmId: string, callback: (members: FirmMember[]) => void): () => void {
  return onSnapshot(collection(db, FIRMS_COL, firmId, 'members'), (snapshot) => {
    callback(snapshot.docs.map((memberDoc) => ({ id: memberDoc.id, ...memberDoc.data() } as FirmMember)).filter((member) => member.status !== 'removed'));
  }, (error) => {
    console.error('Failed to subscribe to firm members:', error);
    callback([]);
  });
}

export function subscribeToFirmInvites(firmId: string, callback: (invites: FirmInvite[]) => void): () => void {
  return onSnapshot(
    query(collection(db, FIRM_INVITES_COL), where('firmId', '==', firmId), where('status', '==', 'pending')),
    (snapshot) => callback(snapshot.docs.map((inviteDoc) => ({ id: inviteDoc.id, ...inviteDoc.data() } as FirmInvite))),
    (error) => {
      console.error('Failed to subscribe to firm invites:', error);
      callback([]);
    }
  );
}

export function subscribeToFirmProjects(firmId: string, callback: (projects: Project[]) => void): () => void {
  return onSnapshot(
    query(collection(db, 'projects'), where('firmId', '==', firmId), where('firmAccessEnabled', '==', true)),
    (snapshot) => callback(snapshot.docs.map((projectDoc) => ({ id: projectDoc.id, ...projectDoc.data() } as Project))),
    (error) => {
      console.error('Failed to subscribe to firm-linked projects:', error);
      callback([]);
    }
  );
}

export const firmService = {
  createFirm,
  inviteFirmMember,
  acceptFirmInvite,
  updateFirmMemberRole,
  removeFirmMember,
  getFirm,
	  getFirmMembers,
	  subscribeToFirm,
	  subscribeToFirmMembers,
	  subscribeToFirmInvites,
	  subscribeToFirmProjects,
	};

export default firmService;
