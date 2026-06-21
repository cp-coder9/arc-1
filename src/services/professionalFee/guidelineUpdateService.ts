import type { Profession, SourceVersion } from './types';

export interface FeeGuideWatchSource {
  id: string;
  profession: Profession;
  body: string;
  officialUrl: string;
  keywords: string[];
  lastKnownHash?: string;
  lastCheckedAt?: string;
  status: 'active' | 'needs-review' | 'unreachable';
}

export interface FeeGuideChangeCandidate {
  sourceId: string;
  profession: Profession;
  body: string;
  officialUrl: string;
  previousHash?: string;
  newHash: string;
  matchedKeywords: string[];
  reviewStatus: 'pending-human-review';
  message: string;
}

export interface ApprovedFeeGuideUpdate {
  candidate: FeeGuideChangeCandidate;
  approvedBy: string;
  approvedAt: string;
  sourceTitle: string;
  effectiveDate: string;
  notes: string;
}

export class FeeGuideWatchRegistry {
  private sources = new Map<string, FeeGuideWatchSource>();

  constructor() {
    this.seed([
      { id: 'sacap-fees', profession: 'architect' as Profession, body: 'SACAP', officialUrl: 'https://www.sacapsa.com/', keywords: ['fee', 'guideline', 'board notice', 'IDoW', 'professional fees'], status: 'active' as const },
      { id: 'ecsa-fees', profession: 'civilEngineer' as Profession, body: 'ECSA', officialUrl: 'https://www.ecsa.co.za/', keywords: ['guideline', 'fees', 'professional services', 'board notice'], status: 'active' as const },
      { id: 'sacqsp-fees', profession: 'quantitySurveyor' as Profession, body: 'SACQSP', officialUrl: 'https://www.sacqsp.org.za/', keywords: ['tariff', 'fees', 'professional fees', 'guideline'], status: 'active' as const },
      { id: 'sacplan-fees', profession: 'townPlanner' as Profession, body: 'SACPLAN', officialUrl: 'https://www.sacplan.org.za/', keywords: ['fees', 'tariff', 'planning', 'professional fees'], status: 'active' as const },
      { id: 'sagc-fees', profession: 'landSurveyor' as Profession, body: 'SAGC', officialUrl: 'https://sagc.org.za/', keywords: ['tariff', 'fees', 'survey', 'geomatics'], status: 'active' as const },
      { id: 'saclap-fees', profession: 'landscapeArchitect' as Profession, body: 'SACLAP', officialUrl: 'https://www.saclap.org.za/', keywords: ['tariff', 'fees', 'landscape architecture', 'professional fees'], status: 'active' as const },
      { id: 'sacpcmp-fees', profession: 'constructionProjectManager' as Profession, body: 'SACPCMP', officialUrl: 'https://www.sacpcmp.org.za/', keywords: ['fees', 'tariff', 'professional services', 'project management'], status: 'active' as const },
    ]);
  }

  seed(sources: FeeGuideWatchSource[]): void {
    sources.forEach((s) => this.sources.set(s.id, s));
  }

  list(): FeeGuideWatchSource[] {
    return [...this.sources.values()];
  }

  update(source: FeeGuideWatchSource): void {
    this.sources.set(source.id, source);
  }
}

export class FeeGuideUpdateService {
  constructor(private readonly registry: FeeGuideWatchRegistry) {}

  scanTextSnapshots(snapshots: Record<string, string>): FeeGuideChangeCandidate[] {
    const now = new Date().toISOString();
    const candidates: FeeGuideChangeCandidate[] = [];

    for (const source of this.registry.list()) {
      const text = snapshots[source.id] ?? '';
      const matchedKeywords = source.keywords.filter((k) => text.toLowerCase().includes(k.toLowerCase()));
      const newHash = stableHash(text);
      const changed = !!source.lastKnownHash && source.lastKnownHash !== newHash;
      const interesting = matchedKeywords.length > 0;

      if (changed && interesting) {
        candidates.push({
          sourceId: source.id,
          profession: source.profession,
          body: source.body,
          officialUrl: source.officialUrl,
          previousHash: source.lastKnownHash,
          newHash,
          matchedKeywords,
          reviewStatus: 'pending-human-review',
          message: `${source.body} possible fee-guide/source update detected. Human review required before calculator activation.`,
        });
        source.status = 'needs-review';
      }
      source.lastKnownHash = newHash;
      source.lastCheckedAt = now;
      this.registry.update(source);
    }
    return candidates;
  }

  approveCandidate(update: ApprovedFeeGuideUpdate): SourceVersion {
    return {
      id: `${update.candidate.profession}-${update.effectiveDate}-approved`,
      profession: update.candidate.profession,
      body: update.candidate.body,
      title: update.sourceTitle,
      effectiveDate: update.effectiveDate,
      status: 'verified',
      note: `Approved by ${update.approvedBy} on ${update.approvedAt}. ${update.notes}`,
    };
  }
}

function stableHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `source-fnv1a32:${(h >>> 0).toString(16).padStart(8, '0')}`;
}
