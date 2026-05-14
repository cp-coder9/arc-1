import { vi } from 'vitest';
import { analyzeBrief } from '../agents/briefingAgent';
import { rankArchitectsForProject } from '../agents/matchingAgent';
import { analyzeTenderBids } from '../agents/tenderAgent';
import { monitorConstructionDelivery } from '../agents/constructionAgent';
import { Bid, GanttTask, Project, RFI, SiteLog, TenderPackage, UserProfile } from '@/types';

vi.mock('../geminiService', () => ({
  SYSTEM_GUARDRAILS: 'guardrails',
  getAgentConfig: vi.fn(),
  getLLMConfig: vi.fn().mockResolvedValue({ provider: 'openai', apiKey: '', model: 'test' }),
  callGeminiProxy: vi.fn(),
}));

vi.mock('../bidComparisonService', () => ({
  compareBids: vi.fn().mockResolvedValue({ report: 'report', scores: { bid1: 95, bid2: 85, bid3: 75 }, notes: {} }),
}));

describe('workflow agents', () => {
  it('analyzes briefs with safe deterministic fallback', async () => {
    const result = await analyzeBrief('Renovation and extension to a residential house in Cape Town');
    expect(result.suggestedCategory).toBe('Renovation');
    expect(result.requirements.length).toBeGreaterThan(0);
    expect(result.estimatedBudget.max).toBeGreaterThanOrEqual(result.estimatedBudget.min);
  });

  it('ranks architects using deterministic project/profile data', () => {
    const project = { id: 'p1', jobId: 'j1', clientId: 'c1', currentStage: 'scoping', stageHistory: [], teamMembers: [], createdAt: '2026-01-01', job: { category: 'Residential', description: 'Residential house design', location: 'Cape Town' } } as Project & any;
    const architects = [
      { uid: 'a1', role: 'architect', displayName: 'A One', email: 'a1@test.dev', professionalLabels: ['Residential'], region: 'Cape Town', averageRating: 5, completedJobs: 10, createdAt: '2026-01-01' },
      { uid: 'a2', role: 'architect', displayName: 'A Two', email: 'a2@test.dev', professionalLabels: ['Industrial'], region: 'Durban', averageRating: 3, completedJobs: 1, createdAt: '2026-01-01' },
    ] as UserProfile[];
    const ranked = rankArchitectsForProject(project, architects);
    expect(ranked[0].architect.uid).toBe('a1');
    expect(ranked[0].reasoning.join(' ')).toContain('Region');
  });

  it('enhances tender analysis with risks and BOQ verification', async () => {
    const tender = { id: 't1', projectId: 'p1', jobId: 'j1', title: 'Main', description: '', scope: ['Foundation', 'Roof'], documents: [], deadline: '2026-06-01', requiredDisciplines: ['architecture'], status: 'published', createdBy: 'a1', createdAt: '2026-01-01' } as TenderPackage;
    const bids = [
      { id: 'bid1', tenderPackageId: 't1', contractorId: 'c1', contractorName: 'Low Co', totalAmount: 50, lineItems: [{ description: 'Foundation works', quantity: 1, unitPrice: 50, total: 50 }], proposedTimeline: '4 weeks', proposedStartDate: '2026-01-01', methodology: '', qualifications: '', attachments: [], status: 'submitted', createdAt: '2026-01-01' },
      { id: 'bid2', tenderPackageId: 't1', contractorId: 'c2', contractorName: 'Mid Co', totalAmount: 100, lineItems: [], proposedTimeline: '5 weeks', proposedStartDate: '2026-01-01', methodology: 'Method', qualifications: 'CIDB', attachments: [], status: 'submitted', createdAt: '2026-01-01' },
      { id: 'bid3', tenderPackageId: 't1', contractorId: 'c3', contractorName: 'High Co', totalAmount: 120, lineItems: [], proposedTimeline: '6 weeks', proposedStartDate: '2026-01-01', methodology: 'Method', qualifications: 'CIDB', attachments: [], status: 'submitted', createdAt: '2026-01-01' },
    ] as Bid[];
    const analysis = await analyzeTenderBids(tender, bids);
    expect(analysis.riskFlags.length).toBeGreaterThan(0);
    expect(analysis.boqVerification.missingScopeItems).toContain('Roof');
  });

  it('detects construction schedule, RFI, and site log risks', () => {
    const now = new Date('2026-05-10T00:00:00.000Z');
    const tasks = [{ id: 'task1', projectId: 'p1', title: 'Foundations', startDate: '2026-05-01', endDate: '2026-05-05', progress: 50, phase: 'works', status: 'in_progress', createdAt: '2026-05-01' }] as GanttTask[];
    const rfis = [{ id: 'rfi1', projectId: 'p1', number: 1, subject: 'Detail', question: 'Confirm', attachments: [], requestedBy: 'u1', assignedTo: 'u2', priority: 'high', status: 'open', dueDate: '2026-05-09', createdAt: '2026-05-01' }] as RFI[];
    const logs = [{ id: 'log1', projectId: 'p1', date: '2026-05-09', weather: 'sunny', workDescription: '', photos: [], createdBy: 'u1', createdAt: '2026-05-09' }] as SiteLog[];
    const summary = monitorConstructionDelivery(tasks, rfis, logs, now);
    expect(summary.alerts.some((alert) => alert.type === 'schedule')).toBe(true);
    expect(summary.alerts.some((alert) => alert.type === 'rfi')).toBe(true);
    expect(summary.rfiSuggestions.rfi1).toContain('Review RFI');
  });
});
