import { Project } from '../../types';
import { vi } from 'vitest';
import * as firestore from 'firebase/firestore';

const mockProject: Project = {
  id: 'project-1',
  jobId: 'job-1',
  clientId: 'client-1',
  leadArchitectId: 'architect-1',
  currentStage: 'coordination',
  stageHistory: [],
  teamMembers: [
    { userId: 'architect-1', role: 'architect', discipline: 'architecture', joinedAt: '2026-01-01T00:00:00.000Z', status: 'active' },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
};

const sendNotificationMock = vi.fn();
const handleFirestoreErrorMock = vi.fn((error: unknown) => { throw error; });
const getDocMock = vi.mocked(firestore.getDoc) as any;
const updateDocMock = vi.mocked(firestore.updateDoc) as any;
const onSnapshotMock = vi.mocked(firestore.onSnapshot) as any;
const docMock = vi.mocked(firestore.doc) as any;

vi.mock('@/lib/firebase', () => ({
  db: {},
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

vi.mock('@/services/notificationService', () => ({
  notificationService: {
    sendNotification: sendNotificationMock,
  },
}));

describe('teamService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    docMock.mockImplementation((_db: unknown, ...path: string[]) => {
      const segments = path.length === 1 && path[0].includes('/') ? path[0].split('/') : path;
      const collectionPath = segments.length > 1 ? segments.slice(0, -1).join('/') : segments[0] ?? '';
      const id = segments[segments.length - 1];
      return { collection: collectionPath, id };
    });
    getDocMock.mockImplementation((ref: { collection: string; id: string }) => {
      if (ref.collection === 'projects') {
        return Promise.resolve({ exists: () => true, id: ref.id, data: () => ({ ...mockProject, id: ref.id }) });
      }
      return Promise.resolve({ exists: () => true, id: ref.id, data: () => ({ role: 'freelancer', displayName: 'Consultant' }) });
    });
    updateDocMock.mockResolvedValue(undefined);
    sendNotificationMock.mockResolvedValue(undefined);
  });

  it('calculates discipline coverage for project category', async () => {
    const { getDisciplineCoverage } = await import('../teamService');

    const coverage = getDisciplineCoverage({ ...mockProject, category: 'Residential' });

    expect(coverage.filled).toEqual(['architecture']);
    expect(coverage.missing).toEqual(expect.arrayContaining(['structure', 'energy', 'drainage', 'planning', 'nhbrc', 'documentation']));
  });

  it('writes invited team member and sends notification', async () => {
    const { inviteTeamMember } = await import('../teamService');

    await inviteTeamMember('project-1', 'user-2', 'structure', 'architect-1');

    expect(updateDocMock).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'projects', id: 'project-1' }),
      expect.objectContaining({
        teamMembers: expect.arrayContaining([
          expect.objectContaining({ userId: 'user-2', discipline: 'structure', status: 'invited', invitedBy: 'architect-1' }),
        ]),
      })
    );
    expect(sendNotificationMock).toHaveBeenCalledWith('user-2', 'message', expect.stringContaining('invited'), expect.objectContaining({ jobId: 'job-1' }));
  });

  it('accepts pending invitations', async () => {
    getDocMock.mockImplementation((ref: { collection: string; id: string }) => Promise.resolve({
      exists: () => true,
      id: ref.id,
      data: () => ({
        ...mockProject,
        teamMembers: [...mockProject.teamMembers, { userId: 'user-2', role: 'freelancer', discipline: 'structure', joinedAt: '2026-01-02T00:00:00.000Z', status: 'invited' }],
      }),
    }));
    const { acceptInvitation } = await import('../teamService');

    await acceptInvitation('project-1', 'user-2');

    expect(updateDocMock).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'projects', id: 'project-1' }),
      expect.objectContaining({
        teamMembers: expect.arrayContaining([
          expect.objectContaining({ userId: 'user-2', discipline: 'structure', status: 'active' }),
        ]),
      })
    );
  });

  it('marks removed team members as removed', async () => {
    getDocMock.mockResolvedValue({
      exists: () => true,
      id: 'project-1',
      data: () => ({
        ...mockProject,
        teamMembers: [...mockProject.teamMembers, { userId: 'user-2', role: 'freelancer', discipline: 'structure', joinedAt: '2026-01-02T00:00:00.000Z', status: 'active' }],
      }),
    });
    const { removeTeamMember } = await import('../teamService');

    await removeTeamMember('project-1', 'user-2', 'architect-1');

    expect(updateDocMock).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'projects', id: 'project-1' }),
      expect.objectContaining({
        teamMembers: expect.arrayContaining([
          expect.objectContaining({ userId: 'user-2', status: 'removed', removedBy: 'architect-1' }),
        ]),
      })
    );
  });

  it('subscribes to non-removed team members', async () => {
    const callback = vi.fn();
    const unsubscribe = vi.fn();
    onSnapshotMock.mockImplementation((_ref: unknown, next: (snapshot: any) => void) => {
      next({
        exists: () => true,
        id: 'project-1',
        data: () => ({
          ...mockProject,
          teamMembers: [...mockProject.teamMembers, { userId: 'old-user', role: 'freelancer', joinedAt: '2026-01-01T00:00:00.000Z', status: 'removed' }],
        }),
      });
      return unsubscribe;
    });
    const { subscribeToTeam } = await import('../teamService');

    expect(subscribeToTeam('project-1', callback)).toBe(unsubscribe);
    expect(callback).toHaveBeenCalledWith([expect.objectContaining({ userId: 'architect-1' })]);
  });
});
