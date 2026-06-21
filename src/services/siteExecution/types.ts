export type UserRole = 'client' | 'architect' | 'project_manager' | 'contractor' | 'subcontractor' | 'site_manager' | 'engineer' | 'qs' | 'supplier' | 'health_safety' | 'admin';
export type MobileIntent = 'log_diary' | 'raise_rfi' | 'draft_site_instruction' | 'create_snag' | 'assign_snag' | 'mark_snag_ready' | 'verify_snag' | 'log_workforce' | 'log_plant' | 'unknown';
export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type SnagStatus = 'created' | 'assigned' | 'in_progress' | 'ready_for_reinspection' | 'verified_closed' | 'rejected_reinspection';
export type RfiStatus = 'draft' | 'open' | 'responded' | 'closed' | 'overdue';
export type SiStatus = 'draft' | 'approval_required' | 'issued' | 'acknowledged' | 'superseded' | 'closed';

export interface FieldEvidence { id: string; type: 'photo' | 'file' | 'location' | 'message'; ref: string; capturedAt: string; capturedBy: string; }
export interface MobileFieldCommand { id: string; projectRef: string; actorId: string; actorRole: UserRole; channel: 'mobile_app' | 'whatsapp_style' | 'web'; rawText: string; intent: MobileIntent; evidenceRefs: FieldEvidence[]; offlineDraft: boolean; }
export interface SiteDiaryEntry { id: string; projectRef: string; date: string; weather: string; labourCount: number; plantCount: number; deliveries: string[]; visitors: string[]; safetyNotes: string[]; delayNotes: string[]; evidenceRefs: FieldEvidence[]; createdBy: string; }
export interface RFI { id: string; projectRef: string; question: string; raisedByRole: UserRole; responderRole: UserRole; linkedRefs: string[]; dueDate: string; status: RfiStatus; response?: string; costTimeImpactFlag: boolean; }
export interface SiteInstruction { id: string; projectRef: string; instruction: string; draftedByRole: UserRole; approverRole: UserRole; status: SiStatus; approvedBy?: string; acknowledgedBy?: string; costTimeImpactFlag: boolean; linkedRefs: string[]; }
export interface Snag { id: string; projectRef: string; title: string; description: string; location: string; createdByRole: UserRole; assignedToRole: UserRole; severity: Severity; status: SnagStatus; dueDate: string; evidenceRefs: FieldEvidence[]; verifierRole?: UserRole; }
export interface WorkforceLog { id: string; projectRef: string; trade: string; crewCount: number; hours: number; activity: string; costCode: string; dayworksFlag: boolean; loggedByRole: UserRole; }
export interface PlantLog { id: string; projectRef: string; equipment: string; operator: string; hours: number; fuelLitres: number; condition: 'good' | 'service_due' | 'unsafe' | 'unknown'; costCode: string; loggedByRole: UserRole; }
export interface PaymentBlocker { id: string; projectRef: string; sourceType: 'snag' | 'rfi' | 'site_instruction' | 'diary' | 'plant'; sourceId: string; severity: Severity; reason: string; blocksPaymentRecommendation: boolean; }
