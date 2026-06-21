import type { ProjectMeta, AssemblyInput, ComplianceReport, Verdict } from './types';
import { MATERIAL_LIBRARY, SOURCE_VERSION, ZONE_DATA } from './rules';
import { hash, id, round, verdictFrom } from './utils';

export class RValueAssemblyService {
  evaluate(project: ProjectMeta, assemblies: AssemblyInput[]): ComplianceReport {
    const results = assemblies.map((a) => {
      const zone = ZONE_DATA[a.climateZone];
      if (!zone) throw new Error('Unknown climate zone');
      const layerResults = a.layers.map((l) => {
        const lib = MATERIAL_LIBRARY[l.material.toLowerCase()];
        const r = l.rValue
          ?? lib?.rValue
          ?? (l.conductivity ?? lib?.conductivity
            ? (l.thicknessMm / 1000) / (l.conductivity ?? (lib as NonNullable<typeof lib>).conductivity!)
            : 0);
        return { ...l, rValue: round(r) };
      });
      const totalR = round(layerResults.reduce((s, l) => s + l.rValue, 0));
      const minR = zone.minR[a.type];
      const verdict: Verdict = totalR >= minR ? 'pass' : totalR >= minR * 0.85 ? 'watch' : 'fail';
      const uValue = round(1 / Math.max(totalR, 0.01));
      return {
        id: a.id, type: a.type, description: a.description, verdict, totalR, minR, uValue, layerResults,
        message: verdict === 'pass' ? 'Assembly meets checked R-value target' : `R ${totalR} below target ${minR}`,
      };
    });
    const verdict = verdictFrom(results);
    const report: ComplianceReport = {
      id: id('rval'), title: 'R-Value / Thermal Assembly Evidence Report', verdict,
      sourceVersion: SOURCE_VERSION, project,
      summary: [`${results.length} assemblies checked`,
        `${results.filter((r) => r.verdict === 'pass').length} pass`,
        `${results.filter((r) => r.verdict !== 'pass').length} require action`],
      actionCards: results.filter((r) => r.verdict !== 'pass').map((r) => `${r.id}: ${r.message}`),
      results, createdAt: new Date().toISOString(), auditHash: '',
    };
    report.auditHash = hash(JSON.stringify(report));
    return report;
  }
}
