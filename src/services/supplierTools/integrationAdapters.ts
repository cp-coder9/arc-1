import { hash } from './utils';

export function toProjectRecord(type: string, payload: unknown) { return { type, timestamp: new Date().toISOString(), auditHash: hash(JSON.stringify(payload)), summary: JSON.stringify(payload).slice(0, 180) }; }
export function toInboxTask(role: string, title: string, refId: string, priority: 'normal' | 'high' | 'critical' = 'normal') { return { role, title, refId, priority, createdAt: new Date().toISOString() }; }
export function agentRecommendation(message: string, reason: string) { return { message, reason, createdAt: new Date().toISOString() }; }
