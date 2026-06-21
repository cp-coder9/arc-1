export type ParticipantRole = 'supplier' | 'subcontractor' | 'freelancer' | 'candidate_professional' | 'registered_supervisor' | 'contractor' | 'architect' | 'project_manager' | 'qs' | 'client';
export type QuoteStatus = 'draft' | 'submitted' | 'clarification_required' | 'comparable' | 'recommended' | 'superseded';
export type DeliveryStatus = 'submitted' | 'acceptance_required' | 'accepted' | 'rejected' | 'partially_accepted';
export type ShopDrawingStatus = 'submitted' | 'under_review' | 'approved' | 'approved_with_comments' | 'rejected' | 'resubmit_required' | 'superseded';
export type FreelancerDeliverableStatus = 'submitted' | 'supervisor_review_required' | 'signed_off' | 'rejected' | 'external_issue_ready';
export type Severity = 'info' | 'warning' | 'blocker' | 'critical';
export interface FileRef { id: string; type: 'pdf' | 'image' | 'certificate' | 'datasheet' | 'model' | 'other'; ref: string; }
export interface PackageScope { id: string; projectRef: string; title: string; assignedRole: ParticipantRole; assignedUserId: string; scopeSummary: string; visibleDocumentRefs: string[]; boqLineRefs: string[]; dueDate: string; returnables: string[]; }
export interface QuoteLine { rfqLineId: string; description: string; quantity: number; unit: string; unitRate: number; total: number; leadTimeDays: number; substitutionOffered: boolean; substitutionDescription?: string; exclusions: string[]; }
export interface QuoteResponse { id: string; packageId: string; supplierId: string; status: QuoteStatus; validityDate: string; vat: number; lines: QuoteLine[]; returnableRefs: FileRef[]; flags: string[]; }
export interface DeliveryNote { id: string; packageId: string; poRef: string; deliveredBy: string; status: DeliveryStatus; deliveredItems: { boqLineRef: string; deliveredQty: number; orderedQty: number; damagedQty: number }[]; podRefs: FileRef[]; receivedBy?: string; rejectionReason?: string; }
export interface WarrantyCertificate { id: string; packageId: string; productOrAsset: string; location: string; expiryDate: string; uploadedBy: string; fileRefs: FileRef[]; verified: boolean; }
export interface ShopDrawingSubmission { id: string; packageId: string; submittedBy: string; revision: string; title: string; fileRefs: FileRef[]; status: ShopDrawingStatus; reviewerRole: 'architect' | 'engineer' | 'project_manager' | 'contractor'; reviewComment?: string; }
export interface FreelancerEngagement { id: string; packageId: string; freelancerId: string; discipline: string; supervisorId: string; supervisorRole: 'architect' | 'engineer' | 'qs' | 'project_manager' | 'registered_supervisor'; supervisorRequired: true; }
export interface FreelancerDeliverable { id: string; engagementId: string; title: string; fileRefs: FileRef[]; status: FreelancerDeliverableStatus; supervisorSignoffBy?: string; externalIssueBlocked: boolean; }
export interface FreelancerTimesheet { id: string; engagementId: string; date: string; hours: number; activity: string; deliverableRefs: string[]; hourlyRate: number; claimAmount: number; supervisorApproved: boolean; }
export interface PaymentBlocker { id: string; packageId: string; sourceType: 'quote' | 'delivery' | 'warranty' | 'shop_drawing' | 'freelancer_deliverable' | 'timesheet'; sourceId: string; severity: Severity; reason: string; blocksPaymentRecommendation: boolean; }
