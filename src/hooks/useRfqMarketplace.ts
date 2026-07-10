/**
 * useRfqMarketplace — React hook for RFQ Marketplace state management.
 *
 * Provides React components with a clean API for managing RFQ lifecycle:
 * - RFQ list, current RFQ, quotes, comparison, award, supplier profiles
 * - Action functions wrapping service layer calls
 * - Loading and error states for each async operation
 *
 * Does NOT auto-fetch on mount (safe for SSR/testing). Components call
 * `loadRfqs()`, `loadCurrentRfq(rfqId)`, `loadQuotes(rfqId)` explicitly.
 *
 * Requirements validated: All (state management layer)
 */

import { useState, useCallback } from 'react';
import type {
  RfqDocument,
  QuoteResponse,
  ComparisonResult,
  AwardRecommendation,
  SupplierMarketplaceProfile,
  EvaluationCriteria,
  RfqLineItem,
  QuoteLineItem,
  QuoteAttachment,
  VerificationStatus,
  ValidationResult,
} from '@/services/rfqMarketplace';
import {
  createRfq,
  getRfq,
  listRfqs,
  publishRfq,
  cancelRfq,
  submitQuote,
  reviseQuote,
  listQuotes,
  generateComparison,
  createAwardRecommendation,
  recordClientApproval,
  recordProfessionalApproval,
  rejectRecommendation,
  getAwardRecommendation,
  addToInvitationList,
  addSuppliersToPublishedRfq,
  removeFromInvitationList,
  discoverSuppliers,
} from '@/services/rfqMarketplace';
import type { SupplierDiscoveryFilters } from '@/services/rfqMarketplace';
import type { SupplierAffiliations, TeamMember } from '@/services/rfqMarketplace';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Loading/error state for an individual async operation. */
export interface AsyncState {
  loading: boolean;
  error: string | null;
}

/** Parameters for creating a new RFQ. */
export interface CreateRfqParams {
  title: string;
  description: string;
  packageScopeId: string;
  packageScopeTitle: string;
  lineItems: RfqLineItem[];
  deliveryAddress: string;
  quoteDeadline: string;
  evaluationCriteria: EvaluationCriteria;
  isPublicSector: boolean;
  localSpendTargetPct?: number;
  estimatedValue?: number;
}

/** Parameters for submitting a quote. */
export interface SubmitQuoteParams {
  rfqId: string;
  supplierId: string;
  supplierName: string;
  lineItems: QuoteLineItem[];
  leadTimeDays: number;
  deliveryTerms: string;
  warrantyMonths?: number;
  attachments: QuoteAttachment[];
}

/** Parameters for adding suppliers to an invitation list. */
export interface AddSupplierParams {
  supplierId: string;
  supplierName: string;
  tradeCategories: string[];
  verificationStatus: VerificationStatus;
  bbeeLevelNumber?: number;
}

/** Parameters for creating an award recommendation. */
export interface CreateAwardParams {
  rfqId: string;
  recommendedSupplierId: string;
  recommendedQuoteId: string;
  quotedPrice: number;
  justification: string;
  riskNotes?: string;
  comparedQuoteIds: string[];
  supplierAffiliations?: SupplierAffiliations;
  teamMembers?: TeamMember[];
}

/** Hook input parameters. */
export interface UseRfqMarketplaceParams {
  projectId: string;
  userId: string;
}

/** Async state key names for clearError utility. */
export type AsyncStateKey =
  | 'rfqListState'
  | 'currentRfqState'
  | 'quotesState'
  | 'comparisonState'
  | 'awardState'
  | 'supplierProfilesState';

/** Hook return value with state, actions, and async states. */
export interface UseRfqMarketplaceResult {
  // ── State ──────────────────────────────────────────────────────────────
  rfqList: RfqDocument[];
  currentRfq: RfqDocument | null;
  quotes: QuoteResponse[];
  comparison: ComparisonResult | null;
  award: AwardRecommendation | null;
  supplierProfiles: SupplierMarketplaceProfile[];

  // ── Async states ───────────────────────────────────────────────────────
  rfqListState: AsyncState;
  currentRfqState: AsyncState;
  quotesState: AsyncState;
  comparisonState: AsyncState;
  awardState: AsyncState;
  supplierProfilesState: AsyncState;

  // ── Data loading actions ───────────────────────────────────────────────
  loadRfqs: () => Promise<void>;
  loadCurrentRfq: (rfqId: string) => Promise<void>;
  loadQuotes: (rfqId: string) => Promise<void>;
  loadComparison: (rfqId: string) => Promise<void>;
  loadAward: (rfqId: string) => Promise<void>;
  loadSupplierProfiles: (filters: SupplierDiscoveryFilters) => Promise<void>;

  // ── RFQ lifecycle actions ──────────────────────────────────────────────
  createNewRfq: (params: CreateRfqParams) => Promise<RfqDocument | null>;
  publishCurrentRfq: (rfqId: string) => Promise<boolean>;
  cancelCurrentRfq: (rfqId: string) => Promise<boolean>;

  // ── Quote actions ──────────────────────────────────────────────────────
  submitNewQuote: (params: SubmitQuoteParams) => Promise<QuoteResponse | null>;
  reviseExistingQuote: (params: SubmitQuoteParams) => Promise<QuoteResponse | null>;

  // ── Comparison actions ─────────────────────────────────────────────────
  generateQuoteComparison: (rfqId: string) => Promise<ComparisonResult | null>;

  // ── Award actions ──────────────────────────────────────────────────────
  createAward: (params: CreateAwardParams) => Promise<AwardRecommendation | null>;
  approveAsClient: (rfqId: string, approverId: string, approverName: string) => Promise<boolean>;
  approveAsProfessional: (rfqId: string, approverId: string, approverName: string) => Promise<boolean>;
  rejectAward: (rfqId: string, approverId: string, approverName: string, reason: string) => Promise<boolean>;

  // ── Invitation actions ─────────────────────────────────────────────────
  addSuppliers: (rfqId: string, suppliers: AddSupplierParams[]) => Promise<boolean>;
  addSuppliersToPublished: (rfqId: string, suppliers: AddSupplierParams[]) => Promise<boolean>;
  removeSupplier: (rfqId: string, supplierId: string) => Promise<boolean>;

  // ── Utility ────────────────────────────────────────────────────────────
  clearError: (key: AsyncStateKey) => void;
  clearCurrentRfq: () => void;
}

// ─── Default async state ─────────────────────────────────────────────────────

const defaultAsyncState: AsyncState = { loading: false, error: null };

// ─── Helper: extract error message from service result ───────────────────────

function extractErrorMessage(errors?: ValidationResult): string {
  if (!errors) return 'Unknown error';
  if ('errors' in errors && Array.isArray(errors.errors) && errors.errors.length > 0) {
    return errors.errors.map(e => e.message).join('; ');
  }
  return 'Validation failed';
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useRfqMarketplace({
  projectId,
  userId,
}: UseRfqMarketplaceParams): UseRfqMarketplaceResult {
  // ── Core state ──────────────────────────────────────────────────────────
  const [rfqList, setRfqList] = useState<RfqDocument[]>([]);
  const [currentRfq, setCurrentRfq] = useState<RfqDocument | null>(null);
  const [quotes, setQuotes] = useState<QuoteResponse[]>([]);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [award, setAward] = useState<AwardRecommendation | null>(null);
  const [supplierProfiles, setSupplierProfiles] = useState<SupplierMarketplaceProfile[]>([]);

  // ── Async states ────────────────────────────────────────────────────────
  const [rfqListState, setRfqListState] = useState<AsyncState>(defaultAsyncState);
  const [currentRfqState, setCurrentRfqState] = useState<AsyncState>(defaultAsyncState);
  const [quotesState, setQuotesState] = useState<AsyncState>(defaultAsyncState);
  const [comparisonState, setComparisonState] = useState<AsyncState>(defaultAsyncState);
  const [awardState, setAwardState] = useState<AsyncState>(defaultAsyncState);
  const [supplierProfilesState, setSupplierProfilesState] = useState<AsyncState>(defaultAsyncState);

  // ── Data loading actions ────────────────────────────────────────────────

  const loadRfqs = useCallback(async () => {
    setRfqListState({ loading: true, error: null });
    try {
      const result = await listRfqs(projectId);
      setRfqList(result);
      setRfqListState({ loading: false, error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load RFQs';
      setRfqListState({ loading: false, error: message });
    }
  }, [projectId]);

  const loadCurrentRfq = useCallback(async (rfqId: string) => {
    setCurrentRfqState({ loading: true, error: null });
    try {
      const result = await getRfq(projectId, rfqId);
      setCurrentRfq(result);
      setCurrentRfqState({ loading: false, error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load RFQ';
      setCurrentRfqState({ loading: false, error: message });
    }
  }, [projectId]);

  const loadQuotes = useCallback(async (rfqId: string) => {
    setQuotesState({ loading: true, error: null });
    try {
      const result = await listQuotes(projectId, rfqId);
      setQuotes(result);
      setQuotesState({ loading: false, error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load quotes';
      setQuotesState({ loading: false, error: message });
    }
  }, [projectId]);

  const loadComparison = useCallback(async (rfqId: string) => {
    setComparisonState({ loading: true, error: null });
    try {
      const currentQuotes = quotes.length > 0 ? quotes : await listQuotes(projectId, rfqId);
      const rfq = currentRfq ?? await getRfq(projectId, rfqId);
      if (!rfq) throw new Error('RFQ not found');
      const result = generateComparison(currentQuotes, rfq.evaluationCriteria, new Map());
      setComparison(result);
      setComparisonState({ loading: false, error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate comparison';
      setComparisonState({ loading: false, error: message });
    }
  }, [projectId, quotes, currentRfq]);

  const loadAward = useCallback(async (rfqId: string) => {
    setAwardState({ loading: true, error: null });
    try {
      const result = await getAwardRecommendation(projectId, rfqId);
      setAward(result);
      setAwardState({ loading: false, error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load award';
      setAwardState({ loading: false, error: message });
    }
  }, [projectId]);

  const loadSupplierProfiles = useCallback(async (filters: SupplierDiscoveryFilters) => {
    setSupplierProfilesState({ loading: true, error: null });
    try {
      const result = await discoverSuppliers(filters);
      setSupplierProfiles(result.suppliers);
      setSupplierProfilesState({ loading: false, error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load supplier profiles';
      setSupplierProfilesState({ loading: false, error: message });
    }
  }, []);

  // ── RFQ lifecycle actions ───────────────────────────────────────────────

  const createNewRfq = useCallback(async (params: CreateRfqParams): Promise<RfqDocument | null> => {
    setRfqListState({ loading: true, error: null });
    try {
      const result = await createRfq({
        projectId,
        createdBy: userId,
        title: params.title,
        description: params.description,
        packageScopeId: params.packageScopeId,
        packageScopeTitle: params.packageScopeTitle,
        lineItems: params.lineItems,
        deliveryAddress: params.deliveryAddress,
        quoteDeadline: params.quoteDeadline,
        evaluationCriteria: params.evaluationCriteria,
        isPublicSector: params.isPublicSector,
        localSpendTargetPct: params.localSpendTargetPct,
        estimatedValue: params.estimatedValue,
      });
      if (!result.success || !result.rfq) {
        const msg = extractErrorMessage(result.errors);
        setRfqListState({ loading: false, error: msg });
        return null;
      }
      // Optimistic update: prepend new RFQ to list
      setRfqList(prev => [result.rfq!, ...prev]);
      setRfqListState({ loading: false, error: null });
      return result.rfq;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create RFQ';
      setRfqListState({ loading: false, error: message });
      return null;
    }
  }, [projectId, userId]);

  const publishCurrentRfq = useCallback(async (rfqId: string): Promise<boolean> => {
    setCurrentRfqState({ loading: true, error: null });
    try {
      const result = await publishRfq(projectId, rfqId);
      if (!result.success) {
        const msg = extractErrorMessage(result.errors);
        setCurrentRfqState({ loading: false, error: msg });
        return false;
      }
      // Reload the RFQ to get the updated document
      const updated = await getRfq(projectId, rfqId);
      if (updated) {
        setCurrentRfq(updated);
        setRfqList(prev => prev.map(r => r.id === rfqId ? updated : r));
      }
      setCurrentRfqState({ loading: false, error: null });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to publish RFQ';
      setCurrentRfqState({ loading: false, error: message });
      return false;
    }
  }, [projectId]);

  const cancelCurrentRfq = useCallback(async (rfqId: string): Promise<boolean> => {
    setCurrentRfqState({ loading: true, error: null });
    try {
      const result = await cancelRfq(projectId, rfqId);
      if (!result.success) {
        const msg = extractErrorMessage(result.errors);
        setCurrentRfqState({ loading: false, error: msg });
        return false;
      }
      // Reload the RFQ to get the updated document
      const updated = await getRfq(projectId, rfqId);
      if (updated) {
        setCurrentRfq(updated);
        setRfqList(prev => prev.map(r => r.id === rfqId ? updated : r));
      }
      setCurrentRfqState({ loading: false, error: null });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to cancel RFQ';
      setCurrentRfqState({ loading: false, error: message });
      return false;
    }
  }, [projectId]);

  // ── Quote actions ───────────────────────────────────────────────────────

  const submitNewQuote = useCallback(async (params: SubmitQuoteParams): Promise<QuoteResponse | null> => {
    setQuotesState({ loading: true, error: null });
    try {
      const result = await submitQuote({
        projectId,
        rfqId: params.rfqId,
        supplierId: params.supplierId,
        supplierName: params.supplierName,
        lineItems: params.lineItems,
        leadTimeDays: params.leadTimeDays,
        deliveryTerms: params.deliveryTerms,
        warrantyMonths: params.warrantyMonths,
        attachments: params.attachments,
      });
      if (!result.success || !result.quote) {
        const msg = extractErrorMessage(result.errors);
        setQuotesState({ loading: false, error: msg });
        return null;
      }
      // Optimistic update: append new quote
      setQuotes(prev => [...prev, result.quote!]);
      setQuotesState({ loading: false, error: null });
      return result.quote;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit quote';
      setQuotesState({ loading: false, error: message });
      return null;
    }
  }, [projectId]);

  const reviseExistingQuote = useCallback(async (params: SubmitQuoteParams): Promise<QuoteResponse | null> => {
    setQuotesState({ loading: true, error: null });
    try {
      const result = await reviseQuote({
        projectId,
        rfqId: params.rfqId,
        supplierId: params.supplierId,
        supplierName: params.supplierName,
        lineItems: params.lineItems,
        leadTimeDays: params.leadTimeDays,
        deliveryTerms: params.deliveryTerms,
        warrantyMonths: params.warrantyMonths,
        attachments: params.attachments,
      });
      if (!result.success || !result.quote) {
        const msg = extractErrorMessage(result.errors);
        setQuotesState({ loading: false, error: msg });
        return null;
      }
      // Optimistic update: mark previous as superseded, add new
      setQuotes(prev => [
        ...prev.map(q =>
          q.supplierId === params.supplierId && q.status === 'submitted'
            ? { ...q, status: 'superseded' as const }
            : q
        ),
        result.quote!,
      ]);
      setQuotesState({ loading: false, error: null });
      return result.quote;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to revise quote';
      setQuotesState({ loading: false, error: message });
      return null;
    }
  }, [projectId]);

  // ── Comparison actions ──────────────────────────────────────────────────

  const generateQuoteComparison = useCallback(async (rfqId: string): Promise<ComparisonResult | null> => {
    setComparisonState({ loading: true, error: null });
    try {
      const currentQuotes = quotes.length > 0 ? quotes : await listQuotes(projectId, rfqId);
      const rfq = currentRfq ?? await getRfq(projectId, rfqId);
      if (!rfq) throw new Error('RFQ not found');
      const result = generateComparison(currentQuotes, rfq.evaluationCriteria, new Map());
      setComparison(result);
      setComparisonState({ loading: false, error: null });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate comparison';
      setComparisonState({ loading: false, error: message });
      return null;
    }
  }, [projectId, quotes, currentRfq]);

  // ── Award actions ───────────────────────────────────────────────────────

  const createAward = useCallback(async (params: CreateAwardParams): Promise<AwardRecommendation | null> => {
    setAwardState({ loading: true, error: null });
    try {
      const result = await createAwardRecommendation({
        projectId,
        rfqId: params.rfqId,
        createdBy: userId,
        recommendedSupplierId: params.recommendedSupplierId,
        recommendedQuoteId: params.recommendedQuoteId,
        quotedPrice: params.quotedPrice,
        justification: params.justification,
        riskNotes: params.riskNotes,
        comparedQuoteIds: params.comparedQuoteIds,
        supplierAffiliations: params.supplierAffiliations,
        teamMembers: params.teamMembers,
      });
      if (!result.success || !result.recommendation) {
        const msg = extractErrorMessage(result.errors);
        setAwardState({ loading: false, error: msg });
        return null;
      }
      setAward(result.recommendation);
      setAwardState({ loading: false, error: null });
      return result.recommendation;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create award recommendation';
      setAwardState({ loading: false, error: message });
      return null;
    }
  }, [projectId, userId]);

  const approveAsClient = useCallback(async (
    rfqId: string,
    approverId: string,
    approverName: string,
  ): Promise<boolean> => {
    setAwardState({ loading: true, error: null });
    try {
      const result = await recordClientApproval({
        projectId,
        rfqId,
        approval: {
          approverId,
          approverName,
          decision: 'approved',
          decidedAt: new Date().toISOString(),
        },
      });
      if (!result.success) {
        const msg = extractErrorMessage(result.errors);
        setAwardState({ loading: false, error: msg });
        return false;
      }
      // Reload award to get updated state
      const updated = await getAwardRecommendation(projectId, rfqId);
      setAward(updated);
      setAwardState({ loading: false, error: null });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to record client approval';
      setAwardState({ loading: false, error: message });
      return false;
    }
  }, [projectId]);

  const approveAsProfessional = useCallback(async (
    rfqId: string,
    approverId: string,
    approverName: string,
  ): Promise<boolean> => {
    setAwardState({ loading: true, error: null });
    try {
      const result = await recordProfessionalApproval({
        projectId,
        rfqId,
        approval: {
          approverId,
          approverName,
          decision: 'approved',
          decidedAt: new Date().toISOString(),
        },
      });
      if (!result.success) {
        const msg = extractErrorMessage(result.errors);
        setAwardState({ loading: false, error: msg });
        return false;
      }
      // Reload award to get updated state
      const updated = await getAwardRecommendation(projectId, rfqId);
      setAward(updated);
      setAwardState({ loading: false, error: null });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to record professional approval';
      setAwardState({ loading: false, error: message });
      return false;
    }
  }, [projectId]);

  const rejectAward = useCallback(async (
    rfqId: string,
    approverId: string,
    approverName: string,
    reason: string,
  ): Promise<boolean> => {
    setAwardState({ loading: true, error: null });
    try {
      const result = await rejectRecommendation({
        projectId,
        rfqId,
        reason,
        rejectedBy: approverId,
      });
      if (!result.success) {
        const msg = extractErrorMessage(result.errors);
        setAwardState({ loading: false, error: msg });
        return false;
      }
      // Reload award to get updated state
      const updated = await getAwardRecommendation(projectId, rfqId);
      setAward(updated);
      setAwardState({ loading: false, error: null });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reject award';
      setAwardState({ loading: false, error: message });
      return false;
    }
  }, [projectId]);

  // ── Invitation actions ──────────────────────────────────────────────────

  const addSuppliers = useCallback(async (rfqId: string, suppliers: AddSupplierParams[]): Promise<boolean> => {
    setCurrentRfqState({ loading: true, error: null });
    try {
      const result = await addToInvitationList({
        projectId,
        rfqId,
        suppliers,
      });
      if (!result.success) {
        const msg = extractErrorMessage(result.errors);
        setCurrentRfqState({ loading: false, error: msg });
        return false;
      }
      // Reload RFQ to get updated invitation list
      const updated = await getRfq(projectId, rfqId);
      if (updated) {
        setCurrentRfq(updated);
        setRfqList(prev => prev.map(r => r.id === rfqId ? updated : r));
      }
      setCurrentRfqState({ loading: false, error: null });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add suppliers';
      setCurrentRfqState({ loading: false, error: message });
      return false;
    }
  }, [projectId]);

  const addSuppliersToPublished = useCallback(async (
    rfqId: string,
    suppliers: AddSupplierParams[],
  ): Promise<boolean> => {
    setCurrentRfqState({ loading: true, error: null });
    try {
      const result = await addSuppliersToPublishedRfq({
        projectId,
        rfqId,
        suppliers,
      });
      if (!result.success) {
        const msg = extractErrorMessage(result.errors);
        setCurrentRfqState({ loading: false, error: msg });
        return false;
      }
      // Reload RFQ to get updated invitation list
      const updated = await getRfq(projectId, rfqId);
      if (updated) {
        setCurrentRfq(updated);
        setRfqList(prev => prev.map(r => r.id === rfqId ? updated : r));
      }
      setCurrentRfqState({ loading: false, error: null });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add suppliers';
      setCurrentRfqState({ loading: false, error: message });
      return false;
    }
  }, [projectId]);

  const removeSupplier = useCallback(async (rfqId: string, supplierId: string): Promise<boolean> => {
    setCurrentRfqState({ loading: true, error: null });
    try {
      const result = await removeFromInvitationList({
        projectId,
        rfqId,
        supplierId,
      });
      if (!result.success) {
        const msg = extractErrorMessage(result.errors);
        setCurrentRfqState({ loading: false, error: msg });
        return false;
      }
      // Reload RFQ to get updated invitation list
      const updated = await getRfq(projectId, rfqId);
      if (updated) {
        setCurrentRfq(updated);
        setRfqList(prev => prev.map(r => r.id === rfqId ? updated : r));
      }
      setCurrentRfqState({ loading: false, error: null });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove supplier';
      setCurrentRfqState({ loading: false, error: message });
      return false;
    }
  }, [projectId]);

  // ── Utility ─────────────────────────────────────────────────────────────

  const clearError = useCallback((key: AsyncStateKey) => {
    const setters: Record<AsyncStateKey, (s: AsyncState) => void> = {
      rfqListState: setRfqListState,
      currentRfqState: setCurrentRfqState,
      quotesState: setQuotesState,
      comparisonState: setComparisonState,
      awardState: setAwardState,
      supplierProfilesState: setSupplierProfilesState,
    };
    const setter = setters[key];
    if (setter) setter(defaultAsyncState);
  }, []);

  const clearCurrentRfq = useCallback(() => {
    setCurrentRfq(null);
    setQuotes([]);
    setComparison(null);
    setAward(null);
    setCurrentRfqState(defaultAsyncState);
    setQuotesState(defaultAsyncState);
    setComparisonState(defaultAsyncState);
    setAwardState(defaultAsyncState);
  }, []);

  return {
    // State
    rfqList,
    currentRfq,
    quotes,
    comparison,
    award,
    supplierProfiles,

    // Async states
    rfqListState,
    currentRfqState,
    quotesState,
    comparisonState,
    awardState,
    supplierProfilesState,

    // Data loading actions
    loadRfqs,
    loadCurrentRfq,
    loadQuotes,
    loadComparison,
    loadAward,
    loadSupplierProfiles,

    // RFQ lifecycle actions
    createNewRfq,
    publishCurrentRfq,
    cancelCurrentRfq,

    // Quote actions
    submitNewQuote,
    reviseExistingQuote,

    // Comparison actions
    generateQuoteComparison,

    // Award actions
    createAward,
    approveAsClient,
    approveAsProfessional,
    rejectAward,

    // Invitation actions
    addSuppliers,
    addSuppliersToPublished,
    removeSupplier,

    // Utility
    clearError,
    clearCurrentRfq,
  };
}

export default useRfqMarketplace;
