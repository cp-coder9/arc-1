import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as firestore from 'firebase/firestore';

const handleFirestoreErrorMock = vi.fn((error: unknown) => { throw error; });
const notifyFirmInviteMock = vi.fn();
const notifyFirmRoleChangedMock = vi.fn();
const notifyFirmMemberRemovedMock = vi.fn();

vi.mock('@/lib/firebase', () => ({
  db: { name: 'test-db' },
  OperationType: {
    CREATE: 'create',
    UPDATE: 'update',
    DELETE: 'delete',
    LIST: 'list',
    GET: 'get',
    WRITE: 'write',
  },
  handleFirestoreError: handleFirestoreErrorMock,
}));

vi.mock('../notificationService', () => ({
  notificationService: {
    notifyFirmInvite: notifyFirmInviteMock,
    notifyFirmRoleChanged: notifyFirmRoleChangedMock,
    notifyFirmMemberRemoved: notifyFirmMemberRemovedMock,
  },
}));

const collectionMock = vi.mocked(firestore.collection) as any;
const docMock = vi.mocked(firestore.doc) as any;
const getDocMock = vi.mocked(firestore.getDoc) as any;
const getDocsMock = vi.mocked(firestore.getDocs) as any;
const setDocMock = vi.mocked(firestore.setDoc) as any;
const updateDocMock = vi.mocked(firestore.updateDoc) as any;
const writeBatchMock = vi.mocked(firestore.writeBatch) as any;
const runTransactionMock = vi.mocked(firestore.runTransaction) as any;
const onSnapshotMock = vi.mocked(firestore.onSnapshot) as any;
const queryMock = vi.mocked(firestore.query) as any;
const whereMock = vi.mocked(firestore.where) as any;
const arrayUnionMock = vi.mocked(firestore.arrayUnion) as any;
const arrayRemoveMock = vi.mocked(firestore.arrayRemove) as any;
const deleteFieldMock = vi.mocked(firestore.deleteField) as any;

const snap = (id: string, data: Record<string, unknown> | null) => ({
  id,
  exists: () => data !== null,
  data: () => data,
});

const memberData = (overrides: Record<string, unknown> = {}) => ({
  firmId: 'firm-1',
  userId: 'actor-1',
  email: 'owner@example.com',
  displayName: 'Owner',
  role: 'owner',
  status: 'active',
  ...overrides,
});

describe('firmService', () => {
  let batchSet: ReturnType<typeof vi.fn>;
  let batchUpdate: ReturnType<typeof vi.fn>;
  let batchCommit: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    collectionMock.mockImplementation((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }));
    docMock.mockImplementation((dbOrCollection: { path?: string } | unknown, ...segments: string[]) => {
      if (segments.length === 0) {
        const path = typeof dbOrCollection === 'object' && dbOrCollection && 'path' in dbOrCollection ? String((dbOrCollection as { path?: string }).path) : 'firms';
        return { path, id: path === 'firm_invites' ? 'generated-invite-id' : 'generated-firm-id' };
      }
      const id = segments[segments.length - 1];
      return { path: segments.join('/'), id };
    });
    queryMock.mockImplementation((base: unknown, ...constraints: unknown[]) => ({ base, constraints }));
    whereMock.mockImplementation((field: string, op: string, value: unknown) => ({ field, op, value }));
    arrayUnionMock.mockImplementation((...items: unknown[]) => ({ __arrayUnion: items }));
    arrayRemoveMock.mockImplementation((...items: unknown[]) => ({ __arrayRemove: items }));
    deleteFieldMock.mockReturnValue({ __deleteField: true });
    setDocMock.mockResolvedValue(undefined);
    updateDocMock.mockResolvedValue(undefined);
    getDocsMock.mockResolvedValue({ docs: [] });
    getDocMock.mockResolvedValue(snap('actor-1', memberData()));
    batchSet = vi.fn();
    batchUpdate = vi.fn();
    batchCommit = vi.fn().mockResolvedValue(undefined);
    writeBatchMock.mockReturnValue({ set: batchSet, update: batchUpdate, commit: batchCommit });
  });

  it('creates a firm with trimmed name, normalized emails, owner membership, and audit event', async () => {
    const { createFirm } = await import('../firmService');
    getDocMock.mockResolvedValueOnce(snap('owner-1', { email: 'owner@example.com', displayName: 'Owner Name' }));

    const firm = await createFirm({ name: '  Arc Studio Pty Ltd  ', ownerId: 'owner-1', primaryContactEmail: ' INFO@ARC.EXAMPLE ', billingEmail: ' BILLING@ARC.EXAMPLE ' });

    expect(firm).toEqual(expect.objectContaining({
      id: 'generated-firm-id',
      name: 'Arc Studio Pty Ltd',
      slug: 'arc-studio-pty-ltd',
      primaryContactEmail: 'info@arc.example',
      billingEmail: 'billing@arc.example',
      ownerId: 'owner-1',
    }));
    expect(batchSet).toHaveBeenCalledWith(expect.objectContaining({ id: 'generated-firm-id' }), expect.objectContaining({ id: 'generated-firm-id' }));
    expect(batchSet).toHaveBeenCalledWith(expect.objectContaining({ path: 'firms/generated-firm-id/members/owner-1' }), expect.objectContaining({ role: 'owner', status: 'active' }));
    expect(batchUpdate).toHaveBeenCalledWith(expect.objectContaining({ path: 'users/owner-1' }), expect.objectContaining({ firmMembershipIds: { __arrayUnion: ['generated-firm-id'] }, firmRole: 'owner' }));
    expect(batchCommit).toHaveBeenCalled();
    expect(firestore.addDoc).toHaveBeenCalledWith(expect.objectContaining({ path: 'firms/generated-firm-id/audit_events' }), expect.objectContaining({ type: 'firm_created' }));
  });

  it('rejects empty firm names before writing', async () => {
    const { createFirm } = await import('../firmService');

    await expect(createFirm({ name: '   ', ownerId: 'owner-1' })).rejects.toThrow('Firm name is required');
    expect(writeBatchMock).not.toHaveBeenCalled();
  });

  it('invites a normalized non-owner member when actor can manage firm', async () => {
    const { inviteFirmMember } = await import('../firmService');
    getDocMock.mockResolvedValueOnce(snap('actor-1', memberData({ userId: 'actor-1', role: 'admin', displayName: 'Admin User' })));
    docMock.mockImplementationOnce((_collectionRef: unknown) => ({ path: 'firm_invites/generated-invite-id', id: 'generated-invite-id' }));

    const invite = await inviteFirmMember({ firmId: 'firm-1', email: ' NEW.USER@EXAMPLE.COM ', role: 'staff', invitedBy: 'actor-1', invitedUid: 'user-2' });

    expect(invite).toEqual(expect.objectContaining({ id: 'generated-invite-id', email: 'new.user@example.com', role: 'staff', status: 'pending' }));
    expect(setDocMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'generated-invite-id' }), expect.objectContaining({ email: 'new.user@example.com', role: 'staff' }));
    expect(notifyFirmInviteMock).toHaveBeenCalledWith('user-2', 'firm-1', 'generated-invite-id', 'Admin User');
    expect(firestore.addDoc).toHaveBeenCalledWith(expect.objectContaining({ path: 'firms/firm-1/audit_events' }), expect.objectContaining({ type: 'member_invited' }));
  });

  it('prevents non-managers and owner-role invites from creating invites', async () => {
    const { inviteFirmMember } = await import('../firmService');

    await expect(inviteFirmMember({ firmId: 'firm-1', email: 'owner@example.com', role: 'owner', invitedBy: 'actor-1' })).rejects.toThrow('Owner transfers are not supported');

    getDocMock.mockResolvedValueOnce(snap('actor-1', memberData({ role: 'staff' })));
    await expect(inviteFirmMember({ firmId: 'firm-1', email: 'staff@example.com', role: 'staff', invitedBy: 'actor-1' })).rejects.toThrow('Only active firm owners or admins');
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('accepts a pending invite transaction and updates the invite, member, and user profile', async () => {
    const { acceptFirmInvite } = await import('../firmService');
    const txSet = vi.fn();
    const txUpdate = vi.fn();
    runTransactionMock.mockImplementation((_db: unknown, callback: any) => callback({
      get: vi.fn().mockResolvedValue(snap('invite-1', { firmId: 'firm-1', email: 'new.user@example.com', role: 'coordinator', status: 'pending', invitedBy: 'actor-1', invitedAt: '2026-01-01T00:00:00.000Z' })),
      set: txSet,
      update: txUpdate,
    }));

    const member = await acceptFirmInvite('invite-1', { uid: 'user-2', email: ' New.User@Example.com ', displayName: 'New User' });

    expect(member).toEqual(expect.objectContaining({ userId: 'user-2', email: 'new.user@example.com', role: 'coordinator', status: 'active' }));
    expect(txSet).toHaveBeenCalledWith(expect.objectContaining({ path: 'firms/firm-1/members/user-2' }), expect.objectContaining({ userId: 'user-2' }));
    expect(txUpdate).toHaveBeenCalledWith(expect.objectContaining({ path: 'firm_invites/invite-1' }), expect.objectContaining({ status: 'accepted', acceptedBy: 'user-2' }));
    expect(txUpdate).toHaveBeenCalledWith(expect.objectContaining({ path: 'users/user-2' }), expect.objectContaining({ firmMembershipIds: { __arrayUnion: ['firm-1'] }, firmRole: 'coordinator' }));
    expect(notifyFirmRoleChangedMock).toHaveBeenCalledWith('user-2', 'firm-1', 'coordinator', 'actor-1');
  });

  it('rejects invite acceptance when the signed-in user email does not match', async () => {
    const { acceptFirmInvite } = await import('../firmService');
    runTransactionMock.mockImplementation((_db: unknown, callback: any) => callback({
      get: vi.fn().mockResolvedValue(snap('invite-1', { firmId: 'firm-1', email: 'expected@example.com', role: 'staff', status: 'pending' })),
      set: vi.fn(),
      update: vi.fn(),
    }));

    await expect(acceptFirmInvite('invite-1', { uid: 'user-2', email: 'other@example.com', displayName: 'Other' })).rejects.toThrow('Firm invite email does not match');
  });

  it('updates a non-owner member role and sends a role notification', async () => {
    const { updateFirmMemberRole } = await import('../firmService');
    getDocMock
      .mockResolvedValueOnce(snap('actor-1', memberData({ userId: 'actor-1', role: 'owner' })))
      .mockResolvedValueOnce(snap('member-1', memberData({ userId: 'member-1', role: 'staff' })));

    await updateFirmMemberRole('firm-1', 'member-1', 'billing_viewer', 'actor-1');

    expect(updateDocMock).toHaveBeenCalledWith(expect.objectContaining({ path: 'firms/firm-1/members/member-1' }), expect.objectContaining({ role: 'billing_viewer' }));
    expect(notifyFirmRoleChangedMock).toHaveBeenCalledWith('member-1', 'firm-1', 'billing_viewer', 'actor-1');
  });

  it('removes a non-owner member and clears primary firm user fields when applicable', async () => {
    const { removeFirmMember } = await import('../firmService');
    getDocMock
      .mockResolvedValueOnce(snap('actor-1', memberData({ userId: 'actor-1', role: 'admin' })))
      .mockResolvedValueOnce(snap('member-1', memberData({ userId: 'member-1', role: 'staff' })))
      .mockResolvedValueOnce(snap('member-1', { primaryFirmId: 'firm-1' }));

    await removeFirmMember('firm-1', 'member-1', 'actor-1');

    expect(batchUpdate).toHaveBeenCalledWith(expect.objectContaining({ path: 'firms/firm-1/members/member-1' }), expect.objectContaining({ status: 'removed', removedBy: 'actor-1' }));
    expect(batchUpdate).toHaveBeenCalledWith(expect.objectContaining({ path: 'users/member-1' }), expect.objectContaining({
      firmMembershipIds: { __arrayRemove: ['firm-1'] },
      primaryFirmId: { __deleteField: true },
      firmRole: { __deleteField: true },
      firmStatus: 'removed',
    }));
    expect(notifyFirmMemberRemovedMock).toHaveBeenCalledWith('member-1', 'firm-1', 'actor-1');
  });

  it('reads firms and active members', async () => {
    const { getFirm, getFirmMembers } = await import('../firmService');
    getDocMock.mockResolvedValueOnce(snap('firm-1', { name: 'Firm One' }));
    getDocsMock.mockResolvedValueOnce({ docs: [
      { id: 'm1', data: () => memberData({ userId: 'm1', status: 'active' }) },
      { id: 'm2', data: () => memberData({ userId: 'm2', status: 'invited' }) },
    ] });

    await expect(getFirm('firm-1')).resolves.toEqual(expect.objectContaining({ id: 'firm-1', name: 'Firm One' }));
    await expect(getFirmMembers('firm-1')).resolves.toHaveLength(2);
    expect(whereMock).toHaveBeenCalledWith('status', '!=', 'removed');
  });

  it('subscription helpers filter removed members and surface listener errors safely', async () => {
    const { subscribeToFirmMembers, subscribeToFirmInvites, subscribeToFirmProjects } = await import('../firmService');
    const unsubscribe = vi.fn();
    const membersCallback = vi.fn();
    onSnapshotMock.mockImplementationOnce((_ref: unknown, next: any) => {
      next({ docs: [
        { id: 'active', data: () => memberData({ userId: 'active', status: 'active' }) },
        { id: 'removed', data: () => memberData({ userId: 'removed', status: 'removed' }) },
      ] });
      return unsubscribe;
    });

    expect(subscribeToFirmMembers('firm-1', membersCallback)).toBe(unsubscribe);
    expect(membersCallback).toHaveBeenCalledWith([expect.objectContaining({ id: 'active', status: 'active' })]);

    const invitesCallback = vi.fn();
    onSnapshotMock.mockImplementationOnce((_ref: unknown, _next: any, error: any) => {
      error(new Error('listener failed'));
      return unsubscribe;
    });
    subscribeToFirmInvites('firm-1', invitesCallback);
    expect(invitesCallback).toHaveBeenCalledWith([]);

    const projectsCallback = vi.fn();
    onSnapshotMock.mockImplementationOnce((_ref: unknown, next: any) => {
      next({ docs: [{ id: 'project-1', data: () => ({ firmId: 'firm-1', firmAccessEnabled: true }) }] });
      return unsubscribe;
    });
    subscribeToFirmProjects('firm-1', projectsCallback);
    expect(projectsCallback).toHaveBeenCalledWith([expect.objectContaining({ id: 'project-1', firmId: 'firm-1' })]);
  });
});
