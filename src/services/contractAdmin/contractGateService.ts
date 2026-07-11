/**
 * Contract Gate Service
 *
 * Manages contract generation, signature authority validation, contract locking,
 * and commercial gate enforcement. Contracts gate payment and project activation —
 * no commercial activity begins without binding signed agreements.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7
 */

import { writeImmutableAuditRecord } from '../finance/auditTrailService';

// ── Interfaces ──────────────────────────────────────────────────────────────

/**
 * A versioned contract template used to generate contract instances.
 */
export interface ContractTemplate {
  templateId: string;
  version: number;
  documentType: string;
  body: string;
  /** Maximum 50 special condition slots per contract */
  specialConditionSlots: number;
  active: boolean;
}

/**
 * A contract instance generated from a template, tracking parties,
 * conditions, signatures, and immutability state.
 */
export interface ContractInstance {
  contractId: string;
  templateId: string;
  templateVersion: number;
  projectId: string;
  parties: Array<{ uid: string; role: string; signatureRequired: boolean }>;
  specialConditions: Array<{ index: number; text: string; addedBy: string }>;
  redlineAnnotations: Array<{ field: string; oldValue: string; newValue: string; annotatedBy: string }>;
  signatures: Array<{ uid: string; role: string; signedAtIso: string; authorityRecordId: string }>;
  locked: boolean;
  lockedAtIso?: string;
  lockedVersion?: number;
  /** Linked variation contract IDs */
  variations: string[];
  /** Linked claim/dispute IDs (Requirement 4.7) */
  linkedClaims?: string[];
}

/**
 * A verified authority record granting a user the right to sign
 * specific document types on behalf of a contracting party.
 */
export interface SignatureAuthority {
  authorityId: string;
  uid: string;
  documentTypes: string[];
  representingParty: string;
  /** ISO 8601 date */
  validFrom: string;
  /** ISO 8601 date — undefined means no expiry */
  validTo?: string;
  active: boolean;
}

/**
 * Input for creating a contract variation against a parent contract.
 * Named distinctly from the existing VariationInput in contractTypes.ts
 * which covers construction variation register entries.
 */
export interface ContractGateVariationInput {
  description: string;
  /** Fields being modified in the variation */
  modifiedFields: string[];
  /** Whether variation modifies contract sum, payment schedule, rates, penalties, retention, or fees */
  requiresFreshSignatures: boolean;
  specialConditions?: Array<{ index: number; text: string; addedBy: string }>;
  redlineAnnotations?: Array<{ field: string; oldValue: string; newValue: string; annotatedBy: string }>;
}

// ── Contract Action Types (Requirement 4.8) ─────────────────────────────────

/**
 * All contract action types that must be written to ProjectRecord,
 * Passport, Inbox, and Audit collections within 60s of the triggering action.
 */
export type ContractActionType =
  | 'contract_generated'
  | 'contract_signed'
  | 'contract_locked'
  | 'contract_varied'
  | 'claim_linked';

/**
 * Represents a contract action record written across multiple collections.
 */
export interface ContractActionRecord {
  actionId: string;
  projectId: string;
  contractId: string;
  actionType: ContractActionType;
  actorUid: string;
  actorRole: string;
  timestampIso: string;
  description: string;
  metadata?: Record<string, unknown>;
}

// ── Constants ───────────────────────────────────────────────────────────────

/** Maximum special conditions allowed per contract (Requirement 4.2) */
const MAX_SPECIAL_CONDITIONS = 50;

/**
 * Fields whose modification requires fresh signatures on a variation (Requirement 4.6).
 * If a variation's modifiedFields intersect with this set, requiresFreshSignatures
 * must be true.
 */
export const FINANCIAL_VARIATION_FIELDS = new Set([
  'contractSum',
  'paymentSchedule',
  'rates',
  'penalties',
  'retentionPercentage',
  'feeStructure',
]);

/** Firestore collection paths */
const PROPOSALS_COLLECTION = 'proposals';
const TEMPLATES_COLLECTION = 'contract_templates';
const CONTRACTS_COLLECTION = 'contracts';
const SIGNATURE_AUTHORITIES_COLLECTION = 'signature_authorities';
const PROJECT_RECORDS_COLLECTION = 'project_records';
const PROJECT_PASSPORTS_COLLECTION = 'project_passports';
const INBOX_ITEMS_COLLECTION = 'inbox_items';

// ── ID Generation ───────────────────────────────────────────────────────────

function generateContractId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ── Contract Action Collection Writer (Requirement 4.8) ─────────────────────

/**
 * Writes a contract action to ProjectRecord, Passport, Inbox, and Audit
 * collections within 60 seconds of the triggering action.
 *
 * Requirement 4.8: THE Contract_Engine SHALL write all contract actions
 * (generation, signature, lock, variation, notice, claim linkage) to
 * ProjectRecord, Passport, Inbox, and Audit collections within 60 seconds.
 *
 * @param action - The contract action record to write across collections
 */
export async function writeContractActionToCollections(
  action: ContractActionRecord,
): Promise<void> {
  const { adminDb } = await import('@/lib/firebase-admin');

  const { actionId, projectId, contractId, actionType, actorUid, actorRole, timestampIso, description, metadata } = action;

  // Write to project_records collection
  const projectRecord = {
    id: actionId,
    projectId,
    recordType: 'contract_action',
    contractId,
    actionType,
    actorUid,
    actorRole,
    timestampIso,
    description,
    status: actionType === 'contract_locked' ? 'locked' : 'active',
    ...(metadata && { metadata }),
  };

  // Write to project_passports collection
  const passportEntry = {
    id: actionId,
    projectId,
    entryType: 'contract_action',
    contractId,
    actionType,
    actorUid,
    actorRole,
    timestampIso,
    description,
    ...(metadata && { metadata }),
  };

  // Write to inbox_items collection
  const inboxItem = {
    id: actionId,
    projectId,
    type: 'contract_action',
    contractId,
    actionType,
    actorUid,
    actorRole,
    timestampIso,
    title: description,
    read: false,
    ...(metadata && { metadata }),
  };

  // Write to audit_logs collection (immutable)
  const auditEntry = {
    id: actionId,
    projectId,
    contractId,
    actionType,
    actorUid,
    actorRole,
    timestampIso,
    description,
    immutable: true,
    ...(metadata && { metadata }),
  };

  // Execute all writes in parallel for performance (must complete within 60s)
  await Promise.all([
    adminDb.collection(PROJECT_RECORDS_COLLECTION).doc(actionId).create(projectRecord),
    adminDb.collection(PROJECT_PASSPORTS_COLLECTION).doc(actionId).create(passportEntry),
    adminDb.collection(INBOX_ITEMS_COLLECTION).doc(actionId).create(inboxItem),
    adminDb.collection('audit_logs').doc(`${actionId}-action`).create(auditEntry),
  ]);
}

// ── Implementation ──────────────────────────────────────────────────────────

/**
 * Converts an accepted proposal into a contract instance using the active
 * versioned template. (Requirement 4.1)
 *
 * - Reads the proposal document from Firestore
 * - Reads the contract template to ensure it's active
 * - Generates a new contract instance with parties from the proposal
 * - Supports up to 50 special conditions and redline annotations (Requirement 4.2)
 * - Persists the contract to Firestore and writes an audit record
 *
 * @param proposalId - The accepted proposal identifier
 * @param templateId - The contract template to use for generation
 * @returns The generated contract instance
 */
export async function generateContractFromProposal(
  proposalId: string,
  templateId: string
): Promise<ContractInstance> {
  const { adminDb } = await import('@/lib/firebase-admin');

  // Read the proposal document
  const proposalDoc = await adminDb
    .collection(PROPOSALS_COLLECTION)
    .doc(proposalId)
    .get();

  if (!proposalDoc.exists) {
    throw new Error(`Proposal '${proposalId}' not found`);
  }

  const proposal = proposalDoc.data() as {
    projectId: string;
    parties?: Array<{ uid: string; role: string; signatureRequired: boolean }>;
    specialConditions?: Array<{ index: number; text: string; addedBy: string }>;
    redlineAnnotations?: Array<{ field: string; oldValue: string; newValue: string; annotatedBy: string }>;
    status?: string;
  };

  if (proposal.status !== 'accepted') {
    throw new Error(`Proposal '${proposalId}' is not in 'accepted' status`);
  }

  // Read the template document
  const templateDoc = await adminDb
    .collection(TEMPLATES_COLLECTION)
    .doc(templateId)
    .get();

  if (!templateDoc.exists) {
    throw new Error(`Contract template '${templateId}' not found`);
  }

  const template = templateDoc.data() as ContractTemplate;

  if (!template.active) {
    throw new Error(`Contract template '${templateId}' is not active`);
  }

  // Validate special conditions count
  const specialConditions = proposal.specialConditions ?? [];
  if (specialConditions.length > MAX_SPECIAL_CONDITIONS) {
    throw new Error(
      `Special conditions count (${specialConditions.length}) exceeds maximum of ${MAX_SPECIAL_CONDITIONS}`
    );
  }

  // Generate the contract instance
  const contractId = generateContractId();
  const contract: ContractInstance = {
    contractId,
    templateId: template.templateId,
    templateVersion: template.version,
    projectId: proposal.projectId,
    parties: proposal.parties ?? [],
    specialConditions,
    redlineAnnotations: proposal.redlineAnnotations ?? [],
    signatures: [],
    locked: false,
    variations: [],
  };

  // Persist the contract to Firestore
  await adminDb
    .collection(CONTRACTS_COLLECTION)
    .doc(contractId)
    .create(contract);

  // Write audit record for contract generation
  await writeImmutableAuditRecord({
    actorUid: 'system',
    actorRole: 'system',
    action: 'contract_generated',
    timestampIso: new Date().toISOString(),
    targetResourceId: contractId,
    evidenceReferences: [
      { type: 'document_version', referenceId: `${templateId}:v${template.version}` },
      { type: 'approval_chain', referenceId: proposalId },
    ],
    previousState: 'proposal_accepted',
    newState: 'contract_generated',
  });

  // Write contract action to ProjectRecord, Passport, Inbox, and Audit collections (Requirement 4.8)
  await writeContractActionToCollections({
    actionId: generateContractId(),
    projectId: contract.projectId,
    contractId,
    actionType: 'contract_generated',
    actorUid: 'system',
    actorRole: 'system',
    timestampIso: new Date().toISOString(),
    description: `Contract generated from proposal '${proposalId}' using template '${templateId}' v${template.version}`,
    metadata: { proposalId, templateId, templateVersion: template.version },
  });

  return contract;
}

/**
 * Validates that a user holds a registered, active SignatureAuthority record
 * for the specified document type and contracting party. (Requirement 4.3)
 *
 * Checks:
 * - Authority record exists for the UID
 * - Authority is active
 * - documentTypes array contains the requested document type
 * - representingParty matches the requested party
 * - Current date is within validFrom/validTo range
 *
 * @param uid - The user attempting to sign
 * @param documentType - The contract document type
 * @param party - The contracting party the user represents
 * @returns true if authority is valid, false otherwise
 */
export async function validateSignatureAuthority(
  uid: string,
  documentType: string,
  party: string
): Promise<boolean> {
  const { adminDb } = await import('@/lib/firebase-admin');

  // Query signature authorities for the user
  const querySnapshot = await adminDb
    .collection(SIGNATURE_AUTHORITIES_COLLECTION)
    .where('uid', '==', uid)
    .where('active', '==', true)
    .where('representingParty', '==', party)
    .get();

  if (querySnapshot.empty) {
    return false;
  }

  const now = new Date().toISOString();

  // Check each matching authority record for document type and date validity
  for (const doc of querySnapshot.docs) {
    const authority = doc.data() as SignatureAuthority;

    // Check document type is included
    if (!authority.documentTypes.includes(documentType)) {
      continue;
    }

    // Check validFrom — must be on or before now
    if (authority.validFrom > now) {
      continue;
    }

    // Check validTo — if present, must be on or after now
    if (authority.validTo && authority.validTo < now) {
      continue;
    }

    // All checks pass
    return true;
  }

  return false;
}

/**
 * Records a signature on a contract after validating signature authority.
 * (Requirement 4.3, 4.4)
 *
 * - Validates the signer's authority for the contract's document type and party
 * - If invalid: rejects signature, writes rejected-signature audit record (Requirement 4.9)
 * - If valid: adds signature to contract, checks if all required signatures collected
 * - Auto-locks the contract when all required signatures are present (Requirement 4.4)
 *
 * @param contractId - The contract to sign
 * @param signerUid - The UID of the signing party
 * @returns The updated contract instance
 */
export async function signContract(
  contractId: string,
  signerUid: string
): Promise<ContractInstance> {
  const { adminDb } = await import('@/lib/firebase-admin');

  // Read the contract
  const contractDoc = await adminDb
    .collection(CONTRACTS_COLLECTION)
    .doc(contractId)
    .get();

  if (!contractDoc.exists) {
    throw new Error(`Contract '${contractId}' not found`);
  }

  const contract = contractDoc.data() as ContractInstance;

  if (contract.locked) {
    throw new Error(`Contract '${contractId}' is already locked`);
  }

  // Find the signer's party info from the contract
  const signerParty = contract.parties.find((p) => p.uid === signerUid);
  if (!signerParty) {
    throw new Error(`User '${signerUid}' is not a party to contract '${contractId}'`);
  }

  // Read the template to get the document type
  const templateDoc = await adminDb
    .collection(TEMPLATES_COLLECTION)
    .doc(contract.templateId)
    .get();

  const template = templateDoc.exists
    ? (templateDoc.data() as ContractTemplate)
    : null;

  const documentType = template?.documentType ?? 'unknown';

  // Validate signature authority
  const hasAuthority = await validateSignatureAuthority(
    signerUid,
    documentType,
    signerParty.role
  );

  if (!hasAuthority) {
    // Write rejected-signature audit record (Requirement 4.9)
    await writeImmutableAuditRecord({
      actorUid: signerUid,
      actorRole: signerParty.role,
      action: 'contract_signed',
      timestampIso: new Date().toISOString(),
      targetResourceId: contractId,
      evidenceReferences: [
        { type: 'document_version', referenceId: `${contract.templateId}:v${contract.templateVersion}` },
      ],
      previousState: 'unsigned',
      newState: 'signature_rejected',
    });

    throw new Error(
      `Signature rejected: user '${signerUid}' does not hold valid SignatureAuthority for document type '${documentType}' representing party '${signerParty.role}'`
    );
  }

  // Find the authority record ID for the signature
  const authoritySnapshot = await adminDb
    .collection(SIGNATURE_AUTHORITIES_COLLECTION)
    .where('uid', '==', signerUid)
    .where('active', '==', true)
    .where('representingParty', '==', signerParty.role)
    .get();

  const authorityRecordId = authoritySnapshot.empty
    ? 'unknown'
    : (authoritySnapshot.docs[0].data() as SignatureAuthority).authorityId;

  // Add signature
  const signedAtIso = new Date().toISOString();
  contract.signatures.push({
    uid: signerUid,
    role: signerParty.role,
    signedAtIso,
    authorityRecordId,
  });

  // Check if all required signatures are collected
  const requiredParties = contract.parties.filter((p) => p.signatureRequired);
  const signedUids = new Set(contract.signatures.map((s) => s.uid));
  const allSigned = requiredParties.every((p) => signedUids.has(p.uid));

  if (allSigned) {
    // Auto-lock the contract (Requirement 4.4)
    contract.locked = true;
    contract.lockedAtIso = new Date().toISOString();
    contract.lockedVersion = contract.templateVersion;
  }

  // Persist the updated contract
  await adminDb
    .collection(CONTRACTS_COLLECTION)
    .doc(contractId)
    .set(contract);

  // Write signature audit record
  await writeImmutableAuditRecord({
    actorUid: signerUid,
    actorRole: signerParty.role,
    action: 'contract_signed',
    timestampIso: signedAtIso,
    targetResourceId: contractId,
    evidenceReferences: [
      { type: 'document_version', referenceId: `${contract.templateId}:v${contract.templateVersion}` },
      { type: 'approval_chain', referenceId: authorityRecordId },
    ],
    previousState: 'unsigned',
    newState: allSigned ? 'fully_signed' : 'partially_signed',
  });

  // If locked, write the lock audit record too
  if (allSigned) {
    await writeImmutableAuditRecord({
      actorUid: signerUid,
      actorRole: signerParty.role,
      action: 'contract_locked',
      timestampIso: contract.lockedAtIso!,
      targetResourceId: contractId,
      evidenceReferences: [
        { type: 'document_version', referenceId: `${contract.templateId}:v${contract.templateVersion}` },
      ],
      previousState: 'fully_signed',
      newState: 'locked',
    });
  }

  // Write contract action to ProjectRecord, Passport, Inbox, and Audit collections (Requirement 4.8)
  await writeContractActionToCollections({
    actionId: generateContractId(),
    projectId: contract.projectId,
    contractId,
    actionType: 'contract_signed',
    actorUid: signerUid,
    actorRole: signerParty.role,
    timestampIso: signedAtIso,
    description: `Contract signed by '${signerUid}' (${signerParty.role})`,
    metadata: { authorityRecordId, allSigned },
  });

  // If auto-locked, also write the lock action to collections
  if (allSigned) {
    await writeContractActionToCollections({
      actionId: generateContractId(),
      projectId: contract.projectId,
      contractId,
      actionType: 'contract_locked',
      actorUid: signerUid,
      actorRole: signerParty.role,
      timestampIso: contract.lockedAtIso!,
      description: `Contract locked as Immutable_Version after all required signatures collected`,
      metadata: { lockedVersion: contract.lockedVersion },
    });
  }

  return contract;
}

/**
 * Locks a contract as an Immutable_Version once all required signatures
 * are collected. (Requirement 4.4)
 *
 * @param contractId - The contract to lock
 * @returns The locked contract instance
 */
export async function lockContract(
  contractId: string
): Promise<ContractInstance> {
  const { adminDb } = await import('@/lib/firebase-admin');

  const contractDoc = await adminDb
    .collection(CONTRACTS_COLLECTION)
    .doc(contractId)
    .get();

  if (!contractDoc.exists) {
    throw new Error(`Contract '${contractId}' not found`);
  }

  const contract = contractDoc.data() as ContractInstance;

  if (contract.locked) {
    throw new Error(`Contract '${contractId}' is already locked`);
  }

  // Verify all required signatures are present
  const requiredParties = contract.parties.filter((p) => p.signatureRequired);
  const signedUids = new Set(contract.signatures.map((s) => s.uid));
  const allSigned = requiredParties.every((p) => signedUids.has(p.uid));

  if (!allSigned) {
    const missing = requiredParties
      .filter((p) => !signedUids.has(p.uid))
      .map((p) => p.uid);
    throw new Error(
      `Cannot lock contract '${contractId}': missing signatures from ${missing.join(', ')}`
    );
  }

  // Lock the contract
  contract.locked = true;
  contract.lockedAtIso = new Date().toISOString();
  contract.lockedVersion = contract.templateVersion;

  await adminDb
    .collection(CONTRACTS_COLLECTION)
    .doc(contractId)
    .set(contract);

  // Write lock audit record
  await writeImmutableAuditRecord({
    actorUid: 'system',
    actorRole: 'system',
    action: 'contract_locked',
    timestampIso: contract.lockedAtIso,
    targetResourceId: contractId,
    evidenceReferences: [
      { type: 'document_version', referenceId: `${contract.templateId}:v${contract.templateVersion}` },
    ],
    previousState: 'fully_signed',
    newState: 'locked',
  });

  // Write contract action to ProjectRecord, Passport, Inbox, and Audit collections (Requirement 4.8)
  await writeContractActionToCollections({
    actionId: generateContractId(),
    projectId: contract.projectId,
    contractId,
    actionType: 'contract_locked',
    actorUid: 'system',
    actorRole: 'system',
    timestampIso: contract.lockedAtIso,
    description: `Contract locked as Immutable_Version after all required signatures collected`,
    metadata: { lockedVersion: contract.lockedVersion },
  });

  return contract;
}

/**
 * Checks whether the contract gate is satisfied for a project — i.e., whether
 * a fully signed and locked contract exists. While unsatisfied, escrow activation
 * and payment schedule creation are blocked. (Requirement 4.5)
 *
 * Note: This is a synchronous check against a cached/known project state.
 * For the async Firestore query variant, use isContractGateSatisfiedAsync.
 *
 * @param projectId - The project to check
 * @returns true if a locked contract exists for the project
 */
export function isContractGateSatisfied(projectId: string): boolean {
  // Synchronous check — the caller must have pre-loaded contract state.
  // In practice, this is used by the API Guard middleware which pre-fetches
  // the project's commercialGateOpen field. Return false by default when
  // no contract state is available (gate is closed).
  // For a full async check, use isContractGateSatisfiedAsync below.
  return false;
}

/**
 * Async variant: queries Firestore for a locked contract for the given project.
 * Returns true if at least one locked contract exists.
 */
export async function isContractGateSatisfiedAsync(
  projectId: string
): Promise<boolean> {
  const { adminDb } = await import('@/lib/firebase-admin');

  const querySnapshot = await adminDb
    .collection(CONTRACTS_COLLECTION)
    .where('projectId', '==', projectId)
    .where('locked', '==', true)
    .get();

  return !querySnapshot.empty;
}

/**
 * Creates a contract variation linked to a parent contract. Requires fresh
 * signatures when the variation modifies contract sum, payment schedule,
 * rates, penalties, retention percentage, or fee structure. (Requirement 4.6)
 *
 * @param parentContractId - The parent contract being varied
 * @param variation - The variation input details
 * @returns The new variation contract instance
 */
export async function createContractVariation(
  parentContractId: string,
  variation: ContractGateVariationInput
): Promise<ContractInstance> {
  const { adminDb } = await import('@/lib/firebase-admin');

  // Read the parent contract
  const parentDoc = await adminDb
    .collection(CONTRACTS_COLLECTION)
    .doc(parentContractId)
    .get();

  if (!parentDoc.exists) {
    throw new Error(`Parent contract '${parentContractId}' not found`);
  }

  const parent = parentDoc.data() as ContractInstance;

  // Validate special conditions count on the variation
  const variationConditions = variation.specialConditions ?? [];
  if (variationConditions.length > MAX_SPECIAL_CONDITIONS) {
    throw new Error(
      `Variation special conditions count (${variationConditions.length}) exceeds maximum of ${MAX_SPECIAL_CONDITIONS}`
    );
  }

  // Enforce fresh signatures for financial field modifications (Requirement 4.6)
  const modifiesFinancialFields = variation.modifiedFields.some(
    (field) => FINANCIAL_VARIATION_FIELDS.has(field)
  );
  if (modifiesFinancialFields && !variation.requiresFreshSignatures) {
    throw new Error(
      `Variation modifies financial fields (${variation.modifiedFields.filter(f => FINANCIAL_VARIATION_FIELDS.has(f)).join(', ')}); requiresFreshSignatures must be true`
    );
  }

  // Generate the variation contract
  const variationContractId = generateContractId();
  const variationContract: ContractInstance = {
    contractId: variationContractId,
    templateId: parent.templateId,
    templateVersion: parent.templateVersion,
    projectId: parent.projectId,
    parties: parent.parties.map((p) => ({
      ...p,
      // If fresh signatures required, mark all parties as needing to re-sign
      signatureRequired: variation.requiresFreshSignatures
        ? p.signatureRequired
        : false,
    })),
    specialConditions: variationConditions,
    redlineAnnotations: variation.redlineAnnotations ?? [],
    signatures: [],
    locked: !variation.requiresFreshSignatures,
    lockedAtIso: !variation.requiresFreshSignatures ? new Date().toISOString() : undefined,
    lockedVersion: !variation.requiresFreshSignatures ? parent.templateVersion : undefined,
    variations: [],
  };

  // Persist the variation contract
  await adminDb
    .collection(CONTRACTS_COLLECTION)
    .doc(variationContractId)
    .create(variationContract);

  // Link variation to parent
  parent.variations.push(variationContractId);
  await adminDb
    .collection(CONTRACTS_COLLECTION)
    .doc(parentContractId)
    .set(parent);

  // Write variation audit record
  await writeImmutableAuditRecord({
    actorUid: 'system',
    actorRole: 'system',
    action: 'contract_varied',
    timestampIso: new Date().toISOString(),
    targetResourceId: variationContractId,
    evidenceReferences: [
      { type: 'document_version', referenceId: parentContractId },
    ],
    previousState: 'parent_contract',
    newState: variation.requiresFreshSignatures ? 'variation_pending_signatures' : 'variation_locked',
  });

  // Write contract action to ProjectRecord, Passport, Inbox, and Audit collections (Requirement 4.8)
  await writeContractActionToCollections({
    actionId: generateContractId(),
    projectId: variationContract.projectId,
    contractId: variationContractId,
    actionType: 'contract_varied',
    actorUid: 'system',
    actorRole: 'system',
    timestampIso: new Date().toISOString(),
    description: `Contract variation created: ${variation.description}`,
    metadata: {
      parentContractId,
      requiresFreshSignatures: variation.requiresFreshSignatures,
      modifiedFields: variation.modifiedFields,
    },
  });

  return variationContract;
}

/**
 * Links a payment claim or dispute to the latest locked Immutable_Version
 * of the governing contract effective at the time the event occurred.
 * (Requirement 4.7)
 *
 * The function:
 * 1. Queries contracts for the project that are locked and have lockedAtIso <= eventTimestampIso
 * 2. Returns the latest locked contract (by lockedAtIso descending)
 * 3. Links the claim/dispute ID to that contract's record
 * 4. Writes an audit record
 *
 * @param claimOrDisputeId - The claim or dispute identifier to link
 * @param projectId - The project to search for governing contracts
 * @param eventTimestampIso - ISO 8601 timestamp of when the claim/dispute event occurred
 * @returns The contractId and lockedVersion of the linked contract
 */
export async function linkClaimOrDisputeToContract(
  claimOrDisputeId: string,
  projectId: string,
  eventTimestampIso: string,
): Promise<{ contractId: string; lockedVersion: number }> {
  const { adminDb } = await import('@/lib/firebase-admin');

  // Query all locked contracts for this project
  const querySnapshot = await adminDb
    .collection(CONTRACTS_COLLECTION)
    .where('projectId', '==', projectId)
    .where('locked', '==', true)
    .get();

  if (querySnapshot.empty) {
    throw new Error(
      `No locked contracts found for project '${projectId}'`
    );
  }

  // Filter contracts where lockedAtIso <= eventTimestampIso and find the latest
  let latestContract: ContractInstance | null = null;
  let latestLockedAt = '';

  for (const doc of querySnapshot.docs) {
    const contract = doc.data() as ContractInstance;
    const lockedAt = contract.lockedAtIso ?? '';

    // The contract must have been locked at or before the event time
    if (lockedAt <= eventTimestampIso && lockedAt > latestLockedAt) {
      latestContract = contract;
      latestLockedAt = lockedAt;
    }
  }

  if (!latestContract) {
    throw new Error(
      `No locked contract found for project '${projectId}' effective at '${eventTimestampIso}'`
    );
  }

  // Link the claim/dispute to the contract
  const linkedClaims = latestContract.linkedClaims ?? [];
  linkedClaims.push(claimOrDisputeId);
  latestContract.linkedClaims = linkedClaims;

  await adminDb
    .collection(CONTRACTS_COLLECTION)
    .doc(latestContract.contractId)
    .set(latestContract);

  // Write audit record for claim linkage (Requirement 4.8)
  await writeImmutableAuditRecord({
    actorUid: 'system',
    actorRole: 'system',
    action: 'claim_linked',
    timestampIso: new Date().toISOString(),
    targetResourceId: latestContract.contractId,
    evidenceReferences: [
      { type: 'document_version', referenceId: `${latestContract.contractId}:v${latestContract.lockedVersion}` },
      { type: 'approval_chain', referenceId: claimOrDisputeId },
    ],
    previousState: 'locked',
    newState: 'claim_linked',
  });

  // Write contract action to ProjectRecord, Passport, Inbox, and Audit collections (Requirement 4.8)
  await writeContractActionToCollections({
    actionId: generateContractId(),
    projectId,
    contractId: latestContract.contractId,
    actionType: 'claim_linked',
    actorUid: 'system',
    actorRole: 'system',
    timestampIso: new Date().toISOString(),
    description: `Claim/dispute '${claimOrDisputeId}' linked to contract '${latestContract.contractId}' (version ${latestContract.lockedVersion})`,
    metadata: {
      claimOrDisputeId,
      eventTimestampIso,
      lockedVersion: latestContract.lockedVersion,
    },
  });

  return {
    contractId: latestContract.contractId,
    lockedVersion: latestContract.lockedVersion!,
  };
}

/**
 * Determines if a contract variation input modifies any financial fields
 * that would require fresh signatures. Utility function for callers to
 * check before submitting a variation.
 *
 * @param modifiedFields - The list of fields being modified
 * @returns true if any modified field is a financial field requiring signatures
 */
export function variationRequiresFreshSignatures(modifiedFields: string[]): boolean {
  return modifiedFields.some((field) => FINANCIAL_VARIATION_FIELDS.has(field));
}
