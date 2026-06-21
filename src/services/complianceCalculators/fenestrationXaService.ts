import type { ElementResult, FenestrationElement, ProjectMeta, ComplianceReport } from './types';
import { orientationBand, SOURCE_VERSION, ZONE_DATA } from './rules';
import { hash, id, round, verdictFrom } from './utils';

export class FenestrationXaService {
  evaluate(project: ProjectMeta, elements: FenestrationElement[]): ComplianceReport {
    const zone = ZONE_DATA[project.climateZone];
    if (!zone) throw new Error('Unknown climate zone');
    const results: ElementResult[] = elements.map((e) => {
      const uLimit = zone.uLimit[e.frameType];
      const shgcLimit = zone.shgc[orientationBand(e.orientation)];
      const effectiveShgc = round(e.shgc * (1 - e.shadingFactor));
      const glazingPercent = round(e.glassArea / Math.max(1, e.wallArea));
      const messages: string[] = [];
      if (e.uValue > uLimit) messages.push(`U-value ${e.uValue} exceeds ${uLimit}`);
      if (effectiveShgc > shgcLimit) messages.push(`Effective SHGC ${effectiveShgc} exceeds ${shgcLimit}`);
      if (glazingPercent > zone.maxGlazingPercent) messages.push(`Glazing ${round(glazingPercent * 100)}% exceeds ${round(zone.maxGlazingPercent * 100)}% guide`);
      const verdict = messages.length ? (messages.length > 1 ? 'fail' : 'watch') : 'pass';
      return {
        id: e.id, verdict, messages: messages.length ? messages : ['Element within checked limits'],
        effectiveShgc, glazingPercent, limits: { uLimit, shgcLimit, maxGlazingPercent: zone.maxGlazingPercent },
      };
    });
    const byStorey = new Map<number, { total: number; fail: number; watch: number; pass: number }>();
    for (const r of results) {
      const storey = elements.find((e) => e.id === r.id)!.storey;
      const s = byStorey.get(storey) ?? { total: 0, fail: 0, watch: 0, pass: 0 };
      s.total++;
      (s as Record<string, number>)[r.verdict]++;
      byStorey.set(storey, s);
    }
    const verdict = verdictFrom(results);
    const report: ComplianceReport = {
      id: id('fen'), title: 'Fenestration XA Compliance Evidence Report', verdict,
      sourceVersion: SOURCE_VERSION, project,
      summary: [`${results.length} fenestration elements checked`,
        `${results.filter((r) => r.verdict === 'pass').length} pass`,
        `${results.filter((r) => r.verdict !== 'pass').length} require action`,
        `Climate zone ${project.climateZone}: ${zone.name}`],
      actionCards: results.filter((r) => r.verdict !== 'pass').flatMap((r) => r.messages.map((m) => `${r.id}: ${m}`)),
      results: [{ elements: results, byStorey: Object.fromEntries(byStorey) }],
      createdAt: new Date().toISOString(), auditHash: '',
    };
    report.auditHash = hash(JSON.stringify(report));
    return report;
  }
}
