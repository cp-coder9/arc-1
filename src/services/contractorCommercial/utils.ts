let seq = 0;
export function id(prefix: string): string { seq += 1; return `${prefix}_${Date.now().toString(36)}_${seq.toString(36)}`; }
export function money(value: number): number { return Math.round(value * 100) / 100; }
export function hash(value: string): string { let h = 2166136261; for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); } return `fnv1a32:${(h >>> 0).toString(16).padStart(8, '0')}`; }
