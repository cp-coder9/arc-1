import type { DrawingSheet, Verdict } from './types';

export class DrawingCompliancePrecheckService {
  evaluate(sheets: DrawingSheet[]) {
    const numbers = new Set(sheets.map((s) => s.number));
    const checks = sheets.map((s) => {
      const issues: string[] = [];
      if (!s.scale) issues.push('missing scale');
      if (!s.revision) issues.push('missing revision');
      if (!s.hasNorthPoint && /site|layout/i.test(s.title)) issues.push('site/layout sheet missing north point');
      if (!s.hasProfessionalBlock) issues.push('missing professional/signature block');
      if (!s.hasDimensions) issues.push('missing dimensions flag');
      if (!s.hasRoomLabels && /plan/i.test(s.title)) issues.push('plan lacks room labels flag');
      for (const ref of s.referencedSheets ?? []) if (!numbers.has(ref)) issues.push(`unresolved sheet reference ${ref}`);
      if (s.textExtract && /SANS|10400|NBR/i.test(s.textExtract) === false) issues.push('no SANS/NBR note detected in extracted text');
      const verdict: Verdict = issues.length > 2 ? 'fail' : issues.length ? 'watch' : 'pass';
      return { sheet: s.number, title: s.title, verdict, issues };
    });
    const actionCards = checks.filter((c) => c.verdict !== 'pass').flatMap((c) => c.issues.map((i) => `${c.sheet}: ${i}`));
    const verdict: Verdict = checks.some((c) => c.verdict === 'fail') ? 'fail' : actionCards.length ? 'watch' : 'pass';
    return { verdict, sheets: checks, blockers: checks.filter((c) => c.verdict === 'fail').flatMap((c) => c.issues.map((i) => `${c.sheet}: ${i}`)), actionCards, note: 'Pre-check only. No dimensions inferred. Professional review required.' };
  }
}
