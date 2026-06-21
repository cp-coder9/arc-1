export function toToolRunDocuments(reg: { listAll: () => unknown[] }) { return reg && typeof reg.listAll === 'function' ? reg.listAll() : []; }
export function toProjectRecord(eventType: string, data: { id: string; auditHash?: string }) { return { type: eventType, recordId: data.id, timestamp: new Date().toISOString(), auditHash: data.auditHash ?? null }; }
export function toInboxTask(eventType: string, data: { id: string }) { return { type: 'DOCUMENT_CONTROL' as const, sourceEvent: eventType, refId: data.id, title: `Document action: ${eventType}` }; }
export function toMunicipalReadiness(docCount: number, latestIssueHash?: string) { return { documentRegisterCount: docCount, documentPackageHash: latestIssueHash ?? null, documentsReady: docCount > 0 }; }
