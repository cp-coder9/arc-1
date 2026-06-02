import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as firestore from 'firebase/firestore';

const authMock = {
  currentUser: null as null | { uid: string; getIdToken: () => Promise<string> },
};

vi.mock('../../lib/firebase', () => ({
  db: { name: 'test-db' },
  auth: authMock,
}));

const collectionMock = vi.mocked(firestore.collection) as any;
const queryMock = vi.mocked(firestore.query) as any;
const whereMock = vi.mocked(firestore.where) as any;
const getDocsMock = vi.mocked(firestore.getDocs) as any;
const addDocMock = vi.mocked(firestore.addDoc) as any;
const updateDocMock = vi.mocked(firestore.updateDoc) as any;
const deleteDocMock = vi.mocked(firestore.deleteDoc) as any;
const docMock = vi.mocked(firestore.doc) as any;
const incrementMock = vi.mocked(firestore.increment) as any;

const docsFrom = (entries: Array<{ id: string; data: Record<string, unknown> }>) => ({
  docs: entries.map((entry) => ({ id: entry.id, data: () => entry.data })),
});

describe('knowledgeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.currentUser = null;
    collectionMock.mockImplementation((_db: unknown, path: string) => ({ path }));
    queryMock.mockImplementation((base: unknown, ...constraints: unknown[]) => ({ base, constraints }));
    whereMock.mockImplementation((field: string, op: string, value: unknown) => ({ field, op, value }));
    docMock.mockImplementation((_db: unknown, path: string, id: string) => ({ path, id }));
    addDocMock.mockResolvedValue({ id: 'knowledge-new' });
    updateDocMock.mockResolvedValue(undefined);
    deleteDocMock.mockResolvedValue(undefined);
    incrementMock.mockImplementation((value: number) => ({ __increment: value }));
    getDocsMock.mockResolvedValue(docsFrom([]));
  });

  it('fetches active knowledge for a single agent role and returns document ids', async () => {
    const { getAgentKnowledge } = await import('../knowledgeService');
    getDocsMock.mockResolvedValueOnce(docsFrom([{ id: 'k1', data: { title: 'Checklist', agentRole: 'plan-reviewer', status: 'active' } }]));

    await expect(getAgentKnowledge('plan-reviewer')).resolves.toEqual([
      expect.objectContaining({ id: 'k1', title: 'Checklist', agentRole: 'plan-reviewer', status: 'active' }),
    ]);
    expect(whereMock).toHaveBeenCalledWith('agentRole', '==', 'plan-reviewer');
    expect(whereMock).toHaveBeenCalledWith('status', '==', 'active');
  });

  it('returns an empty list instead of throwing when active reads are permission denied', async () => {
    const { getAllAgentKnowledge } = await import('../knowledgeService');
    authMock.currentUser = { uid: 'user-1', getIdToken: vi.fn() };
    getDocsMock.mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'permission-denied' }));

    await expect(getAllAgentKnowledge()).resolves.toEqual([]);
  });

  it('filters multi-agent knowledge by discipline, standard family, and municipality in memory', async () => {
    const { getKnowledgeForAgents } = await import('../knowledgeService');
    getDocsMock.mockResolvedValueOnce(docsFrom([
      { id: 'keep', data: { title: 'SANS XA', agentRole: 'energy', status: 'active', discipline: 'energy', standardFamily: 'SANS', municipality: 'cpt' } },
      { id: 'wrong-discipline', data: { title: 'NBR', agentRole: 'planning', status: 'active', discipline: 'planning', standardFamily: 'SANS', municipality: 'cpt' } },
      { id: 'wrong-city', data: { title: 'SANS JHB', agentRole: 'energy', status: 'active', discipline: 'energy', standardFamily: 'SANS', municipality: 'jhb' } },
    ]));

    const result = await getKnowledgeForAgents(['energy', 'planning'], 'active', { discipline: 'energy', standardFamily: 'SANS', municipality: 'cpt' });

    expect(result).toEqual([expect.objectContaining({ id: 'keep' })]);
    expect(whereMock).toHaveBeenCalledWith('agentRole', 'in', ['energy', 'planning']);
  });

  it('prepends the copyright-safe disclaimer when adding web or documentation knowledge', async () => {
    const { addKnowledge } = await import('../knowledgeService');

    await expect(addKnowledge({
      agentId: 'agent-1',
      agentRole: 'reviewer',
      title: 'External summary',
      content: 'Key points from source',
      source: 'documentation',
      status: 'pending_review',
      submittedBy: 'user-1',
      createdAt: 'old-date',
    } as any)).resolves.toBe('knowledge-new');

    const payload = addDocMock.mock.calls[0][1];
    expect(payload.content).toMatch(/^Summary only — refer to official SANS document/);
    expect(payload.content).toContain('\n\nKey points from source');
    expect(payload.usageCount).toBe(0);
  });

  it('searches active knowledge by title, content, tags, and optional agent role', async () => {
    const { searchKnowledge } = await import('../knowledgeService');
    getDocsMock.mockResolvedValueOnce(docsFrom([
      { id: 'tag-match', data: { title: 'Envelope', content: 'Thermal details', tags: ['SANS-10400-XA'], agentRole: 'energy', status: 'active' } },
      { id: 'role-miss', data: { title: 'SANS XA', content: 'Thermal details', tags: [], agentRole: 'planning', status: 'active' } },
      { id: 'term-miss', data: { title: 'Drainage', content: 'Pipe sizing', tags: [], agentRole: 'energy', status: 'active' } },
    ]));

    await expect(searchKnowledge('sans-10400', 'energy')).resolves.toEqual([expect.objectContaining({ id: 'tag-match' })]);
  });

  it('persists web search results as pending review knowledge for authenticated users', async () => {
    const { webSearchForAgent } = await import('../knowledgeService');
    authMock.currentUser = { uid: 'user-1', getIdToken: vi.fn().mockResolvedValue('token-1') };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ text: 'Search summary' }) }));

    await expect(webSearchForAgent('fire safety', 'plan-reviewer', 'agent-1')).resolves.toBe('Search summary');

    expect(fetch).toHaveBeenCalledWith('/api/agent/search', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer token-1' }),
      body: JSON.stringify({ query: 'fire safety', agentRole: 'plan-reviewer' }),
    }));
    expect(addDocMock.mock.calls[0][1]).toEqual(expect.objectContaining({
      agentId: 'agent-1',
      agentRole: 'plan-reviewer',
      source: 'web_search',
      status: 'pending_review',
      submittedBy: 'user-1',
      searchQuery: 'fire safety',
    }));
    vi.unstubAllGlobals();
  });

  it('increments usage count without surfacing write failures', async () => {
    const { incrementKnowledgeUsage } = await import('../knowledgeService');
    updateDocMock.mockRejectedValueOnce(new Error('offline'));

    await expect(incrementKnowledgeUsage('k1')).resolves.toBeUndefined();
    expect(updateDocMock).toHaveBeenCalledWith({ path: 'agent_knowledge', id: 'k1' }, expect.objectContaining({ usageCount: { __increment: 1 } }));
  });

  it('deletes knowledge by id', async () => {
    const { deleteKnowledge } = await import('../knowledgeService');

    await deleteKnowledge('k1');

    expect(deleteDocMock).toHaveBeenCalledWith({ path: 'agent_knowledge', id: 'k1' });
  });
});
