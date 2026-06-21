import { hash } from './utils';

export function toProjectRecord(type: string, payload: unknown) { return { type, timestamp: new Date().toISOString(), auditHash: hash(JSON.stringify(payload)), payloadSummary: JSON.stringify(payload).slice(0, 160) }; }
export function toInboxTask(type: string, title: string, refId: string, severity: 'normal' | 'high' = 'normal') { return { type, title, refId, severity, createdAt: new Date().toISOString() }; }
export function agentRecommendation(message: string, reason: string) { return { message, reason, createdAt: new Date().toISOString() }; }
