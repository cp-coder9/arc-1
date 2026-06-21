let n = 0;
export function id(p: string) { n++; return `${p}_${Date.now().toString(36)}_${n.toString(36)}`; }
export function daysFromNow(days: number) { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }
export function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return `fnv1a32:${(h >>> 0).toString(16).padStart(8, '0')}`; }
export function assertPermission(ok: boolean, msg: string) { if (!ok) throw new Error(msg); }
