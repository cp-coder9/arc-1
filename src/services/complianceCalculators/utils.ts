let n = 0;
export function id(p: string) { n++; return `${p}_${Date.now().toString(36)}_${n.toString(36)}`; }
export function round(v: number) { return Math.round((v + Number.EPSILON) * 100) / 100; }
export function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return `fnv1a32:${(h >>> 0).toString(16).padStart(8, '0')}`; }
export function verdictFrom(results: Array<{ verdict: string }>) { return results.some(r => r.verdict === 'fail') ? 'fail' : results.some(r => r.verdict === 'watch') ? 'watch' : 'pass'; }
