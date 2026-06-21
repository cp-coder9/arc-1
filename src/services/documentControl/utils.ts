let n = 0;
export function id(p: string) { n++; return `${p}_${Date.now().toString(36)}_${n.toString(36)}`; }
export function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return `fnv1a32:${(h >>> 0).toString(16).padStart(8, '0')}`; }
export function tsNumber() { const d = new Date(); return `TS-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(n).padStart(3, '0')}`; }
