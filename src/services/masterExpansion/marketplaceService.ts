import { ProjectRecord } from '@/types/architexMasterTypes';

export interface MarketplaceListingPayload {
  listingType: 'professional_service' | 'candidate_professional_capacity' | 'supplier' | 'plant_equipment' | 'template_or_knowledge_product';
  discipline?: string;
  rateBasis: 'hourly' | 'daily' | 'fixed_fee' | 'quote_required';
  requiresSupervision: boolean;
  verificationStatus: 'unverified' | 'pending' | 'verified' | 'expired';
}

export function createCandidateProfessionalListing(input: {
  tenantId: string;
  projectId: string;
  userId: string;
  discipline: string;
}): ProjectRecord<MarketplaceListingPayload> {
  return {
    id: `listing_candidate_${Date.now()}`,
    tenantId: input.tenantId,
    projectId: input.projectId,
    phase: 'design_coordination',
    moduleKey: 'marketplace',
    recordType: 'marketplace_listing',
    title: `${input.discipline} candidate-professional capacity`,
    status: 'pending_verification',
    payload: {
      listingType: 'candidate_professional_capacity',
      discipline: input.discipline,
      rateBasis: 'hourly',
      requiresSupervision: true,
      verificationStatus: 'pending',
    },
    approval: { status: 'pending_review', requiredApproverRoles: ['platform_admin', 'architect'] },
    audit: { createdByUserId: input.userId, createdAt: new Date().toISOString(), source: 'user', revision: 1 },
    linkedRecordIds: [],
  };
}
