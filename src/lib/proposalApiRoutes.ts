/**
 * Proposal API Routes
 *
 * Wire proposal builder into the API:
 *   POST   /api/proposals          — create/build a proposal
 *   GET    /api/proposals/:id      — fetch a proposal by ID
 *   POST   /api/proposals/:id/issue — issue a proposal (state transition)
 *
 * To integrate into the main API router, add:
 *   import { registerProposalRoutes } from './proposalApiRoutes';
 *   registerProposalRoutes(router, adminDb);
 */

import type { Router } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import { buildProposal } from '../services/proposalBuilderService';
import { transitionProposal, createProposalState } from '../services/proposalStateMachine';
import { generateAllProposalRecords, createProposalDocumentOutput } from '../services/proposalIntegrationAdapters';
import { generateProposalInboxEvents } from '../services/proposalInboxEvents';
import { recommendationsFromProposal } from '../services/proposalAgentRecommendations';
import type { ProposalBuilderInput, ProposalBuilderResult } from '../types/proposalBuilder';

const PROPOSALS_COLLECTION = 'proposals';
const FEE_CALCULATIONS_COLLECTION = 'fee_calculations';
const TERMS_TEMPLATES_COLLECTION = 'terms_templates';

/**
 * Register all proposal-related routes on the given Express router.
 */
export function registerProposalRoutes(router: Router, adminDb: Firestore): void {
  /**
   * POST /api/proposals
   * Create/build a new proposal.
   *
   * Body: ProposalBuilderInput (JSON)
   * Returns: ProposalBuilderResult + state machine status + integration outputs
   */
  router.post('/proposals', async (req, res) => {
    try {
      const input = req.body as ProposalBuilderInput;

      // Validate required fields
      if (!input.calculatorId || !input.title || !input.lineItems?.length) {
        return res.status(400).json({
          error: 'Missing required fields: calculatorId, title, lineItems',
        });
      }

      // Build the proposal
      const result = buildProposal(input);

      // Initialize state machine
      const stateMachine = createProposalState();

      // Persist to Firestore
      const proposalDoc = {
        ...result,
        projectId: input.projectId ?? null,
        jobId: input.jobId ?? null,
        calculatorId: input.calculatorId,
        calculatorVersion: input.calculatorVersion,
        issuingUserId: input.issuingUserId,
        payerUserId: input.payerUserId,
        payeeUserId: input.payeeUserId,
        payeeRole: input.payeeRole,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        stateMachineStatus: stateMachine.currentState,
        stateMachineHistory: stateMachine.getHistory(),
      };

      const docRef = await adminDb.collection(PROPOSALS_COLLECTION).add(proposalDoc);

      // Optionally persist fee calculation snapshot
      await adminDb.collection(FEE_CALCULATIONS_COLLECTION).doc(docRef.id).set({
        proposalId: docRef.id,
        idSeed: result.idSeed,
        feeBeforeDiscountExVat: result.feeBeforeDiscountExVat,
        discountAmount: result.discountAmount,
        feeAfterDiscountExVat: result.feeAfterDiscountExVat,
        vatAmount: result.vatAmount,
        feeAfterDiscountIncVat: result.feeAfterDiscountIncVat,
        platformFee: result.platformFee,
        createdAt: new Date().toISOString(),
      });

      return res.status(201).json({
        id: docRef.id,
        ...proposalDoc,
        auditSnapshot: result.auditSnapshot,
      });
    } catch (error) {
      console.error('Error creating proposal:', error);
      return res.status(500).json({
        error: 'Failed to create proposal',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /api/proposals/:id
   * Fetch a proposal by its Firestore document ID.
   */
  router.get('/proposals/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const docRef = adminDb.collection(PROPOSALS_COLLECTION).doc(id);
      const doc = await docRef.get();

      if (!doc.exists) {
        return res.status(404).json({ error: 'Proposal not found', id });
      }

      return res.json({
        id: doc.id,
        ...doc.data(),
      });
    } catch (error) {
      console.error('Error fetching proposal:', error);
      return res.status(500).json({
        error: 'Failed to fetch proposal',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /api/proposals/:id/issue
   * Issue a proposal — transitions state to 'issued'.
   *
   * Body: { actorUserId: string, actorRole: string, reason?: string }
   */
  router.post('/proposals/:id/issue', async (req, res) => {
    try {
      const { id } = req.params;
      const { actorUserId, actorRole, reason } = req.body;

      if (!actorUserId || !actorRole) {
        return res.status(400).json({
          error: 'Missing required fields: actorUserId, actorRole',
        });
      }

      const docRef = adminDb.collection(PROPOSALS_COLLECTION).doc(id);
      const doc = await docRef.get();

      if (!doc.exists) {
        return res.status(404).json({ error: 'Proposal not found', id });
      }

      const proposalData = doc.data()!;
      const currentStatus = proposalData.stateMachineStatus || proposalData.status || 'draft';

      // Only allow issuing from professional_approved or terms_attached states
      if (!['professional_approved', 'terms_attached'].includes(currentStatus)) {
        return res.status(400).json({
          error: `Cannot issue proposal in "${currentStatus}" status. Must be professional_approved or terms_attached.`,
          currentStatus,
        });
      }

      // Transition state machine
      let state = createProposalState();
      if (currentStatus === 'terms_attached') {
        state = transitionProposal(state, 'professional_approved', { userId: actorUserId, role: actorRole }, 'Auto-approved on issue.');
      }
      state = transitionProposal(state, 'issued', { userId: actorUserId, role: actorRole }, reason || 'Proposal issued.');

      // Update Firestore
      const updates: Record<string, unknown> = {
        status: 'issued',
        stateMachineStatus: state.currentState,
        issuedAt: state.issuedAt,
        lockedAt: state.lockedAt,
        updatedAt: new Date().toISOString(),
        auditTrail: state.auditTrail,
      };

      await docRef.update(updates);

      // Generate integration outputs
      const result = proposalData as unknown as ProposalBuilderResult;
      const integrationOutputs = generateAllProposalRecords(result, {
        tenantId: proposalData.tenantId ?? 'default',
        projectId: proposalData.projectId ?? id,
        createdByUserId: actorUserId,
        scopeSummary: proposalData.scopeSummary ?? '',
        clientName: proposalData.payerUserId ?? 'client',
        professionalName: proposalData.payeeUserId ?? 'professional',
        termsSnapshot: result.terms ?? {},
      });

      // Generate inbox events
      const inboxEvents = generateProposalInboxEvents({
        projectId: proposalData.projectId ?? id,
        proposalId: id,
        status: 'issued',
        payeeRole: proposalData.payeeRole ?? 'architect',
        clientUserId: proposalData.payerUserId ?? 'client',
        professionalUserId: proposalData.payeeUserId ?? 'professional',
      }, result.terms);

      // Generate recommendations
      const recs = recommendationsFromProposal(result, proposalData.projectId ?? id);

      return res.json({
        id,
        status: 'issued',
        stateMachineStatus: state.currentState,
        issuedAt: state.issuedAt,
        integrationOutputs: {
          proposalRecord: integrationOutputs.proposalRecord,
          scopeBaselineRecord: integrationOutputs.scopeBaselineRecord,
          feeSnapshotRecord: integrationOutputs.feeSnapshotRecord,
          termsSnapshotRecord: integrationOutputs.termsSnapshotRecord,
          appointmentDraftRecord: integrationOutputs.appointmentDraftRecord,
        },
        inboxEvents,
        agentRecommendations: recs,
        auditTrail: state.auditTrail,
      });
    } catch (error) {
      console.error('Error issuing proposal:', error);
      return res.status(500).json({
        error: 'Failed to issue proposal',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /api/proposals
   * List proposals, optionally filtered by projectId.
   */
  router.get('/proposals', async (req, res) => {
    try {
      const { projectId, status, limit: limitStr } = req.query;
      const limit = Math.min(Number(limitStr) || 20, 100);

      let query: FirebaseFirestore.Query = adminDb.collection(PROPOSALS_COLLECTION);

      if (projectId) {
        query = query.where('projectId', '==', projectId);
      }
      if (status) {
        query = query.where('status', '==', status);
      }

      query = query.orderBy('createdAt', 'desc').limit(limit);

      const snapshot = await query.get();
      const proposals = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      return res.json({
        proposals,
        count: proposals.length,
      });
    } catch (error) {
      console.error('Error listing proposals:', error);
      return res.status(500).json({
        error: 'Failed to list proposals',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
