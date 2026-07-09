// ─── EIA Firestore Persistence Service ───────────────────────────────────────
// Provides read/write functions for all EIA collections under
// `tenants/{tenantId}/projects/{projectId}/eia/{subcollection}/{docId}`.
//
// Wires screening results, assessments, authorizations, EMPr, public
// participation, green building, and EAP records to Firestore persistence.
// Writes ProjectRecord envelope on all status changes (within 5-second SLA).
//
// Requirements: 12.1–12.3, 12.7, 2.8, 6.6, 8.6, 9.8, 10.7, 11.6

import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  serverTimestamp,
} from 'firebase/firestore';

import { db, handleFirestoreError, OperationType } from '@/lib/firebase';

import { toProjectRecord } from './eiaIntegrationService';

import type {
  ScreeningResult,
  AssessmentRecord,
  AuthorizationRecord,
  EMPrCommitment,
  EAPAppointment,
  GreenStarRating,
  EDGECertification,
  NetZeroTarget,
} from './eiaTypes';

// ─── Path Helpers ────────────────────────────────────────────────────────────

/**
 * Base path for all EIA data scoped to a tenant and project.
 */
function eiaBasePath(tenantId: string, projectId: string): string {
  return `tenants/${tenantId}/projects/${projectId}/eia`;
}

// ─── Screening ───────────────────────────────────────────────────────────────

/**
 * Persists a screening result and writes the ProjectRecord envelope.
 * Requirement 2.8: Write screening result to Project Passport.
 */
export async function saveScreeningResult(
  tenantId: string,
  projectId: string,
  result: ScreeningResult
): Promise<void> {
  try {
    const basePath = eiaBasePath(tenantId, projectId);
    const docRef = doc(db, basePath, 'screening', result.id);
    await setDoc(docRef, { ...result, _updatedAt: serverTimestamp() });

    // Write ProjectRecord envelope for Project Passport visibility
    const envelope = toProjectRecord(result, projectId, tenantId);
    const envelopeRef = doc(db, basePath, 'records', envelope.id);
    await setDoc(envelopeRef, { ...envelope, _updatedAt: serverTimestamp() });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `tenants/${tenantId}/projects/${projectId}/eia/screening/${result.id}`);
  }
}

// ─── Assessment ──────────────────────────────────────────────────────────────

/**
 * Persists an assessment record (Basic Assessment or Full EIA) and writes the
 * ProjectRecord envelope on status/phase changes.
 * Requirement 12.3: Write updated status record to Project Passport.
 */
export async function saveAssessment(
  tenantId: string,
  projectId: string,
  assessment: AssessmentRecord
): Promise<void> {
  try {
    const basePath = eiaBasePath(tenantId, projectId);
    const docRef = doc(db, basePath, 'assessments', assessment.id);
    await setDoc(docRef, { ...assessment, _updatedAt: serverTimestamp() }, { merge: true });

    // Write ProjectRecord envelope
    const envelope = toProjectRecord(assessment, projectId, tenantId);
    const envelopeRef = doc(db, basePath, 'records', envelope.id);
    await setDoc(envelopeRef, { ...envelope, _updatedAt: serverTimestamp() });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `tenants/${tenantId}/projects/${projectId}/eia/assessments/${assessment.id}`);
  }
}

// ─── Authorization ───────────────────────────────────────────────────────────

/**
 * Persists an authorization record and its conditions. Writes ProjectRecord
 * envelope for lifecycle engine consumption.
 * Requirement 6.6: Write authorization records and condition compliance to Project Passport.
 */
export async function saveAuthorization(
  tenantId: string,
  projectId: string,
  authorization: AuthorizationRecord
): Promise<void> {
  try {
    const basePath = eiaBasePath(tenantId, projectId);
    const docRef = doc(db, basePath, 'authorizations', authorization.id);
    await setDoc(docRef, { ...authorization, _updatedAt: serverTimestamp() }, { merge: true });

    // Write ProjectRecord envelope
    const envelope = toProjectRecord(authorization, projectId, tenantId);
    const envelopeRef = doc(db, basePath, 'records', envelope.id);
    await setDoc(envelopeRef, { ...envelope, _updatedAt: serverTimestamp() });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `tenants/${tenantId}/projects/${projectId}/eia/authorizations/${authorization.id}`);
  }
}

// ─── EMPr ────────────────────────────────────────────────────────────────────

/**
 * Persists an EMPr commitment and writes the ProjectRecord envelope.
 * Requirement 8.6: Write EMPr compliance status to Project Passport.
 */
export async function saveEMPrCommitment(
  tenantId: string,
  projectId: string,
  commitment: EMPrCommitment
): Promise<void> {
  try {
    const basePath = eiaBasePath(tenantId, projectId);
    const docRef = doc(db, basePath, 'empr', commitment.id);
    await setDoc(docRef, { ...commitment, _updatedAt: serverTimestamp() }, { merge: true });

    // Write ProjectRecord envelope
    const envelope = toProjectRecord(commitment, projectId, tenantId);
    const envelopeRef = doc(db, basePath, 'records', envelope.id);
    await setDoc(envelopeRef, { ...envelope, _updatedAt: serverTimestamp() });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `tenants/${tenantId}/projects/${projectId}/eia/empr/${commitment.id}`);
  }
}

// ─── EAP Appointment ─────────────────────────────────────────────────────────

/**
 * Persists an EAP appointment record.
 * Requirement 12.1: Write appointment record to Project Passport.
 */
export async function saveEAPAppointment(
  tenantId: string,
  projectId: string,
  appointment: EAPAppointment
): Promise<void> {
  try {
    const basePath = eiaBasePath(tenantId, projectId);
    const docRef = doc(db, basePath, 'eap', appointment.id);
    await setDoc(docRef, { ...appointment, _updatedAt: serverTimestamp() }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `tenants/${tenantId}/projects/${projectId}/eia/eap/${appointment.id}`);
  }
}

// ─── Green Star SA ───────────────────────────────────────────────────────────

/**
 * Persists a Green Star SA rating record and writes ProjectRecord envelope.
 * Requirement 9.8: Write Green Star SA rating data to Project Passport.
 */
export async function saveGreenStarRating(
  tenantId: string,
  projectId: string,
  rating: GreenStarRating
): Promise<void> {
  try {
    const basePath = eiaBasePath(tenantId, projectId);
    const docRef = doc(db, basePath, 'green-building', rating.id);
    await setDoc(docRef, { ...rating, _type: 'green_star', _updatedAt: serverTimestamp() }, { merge: true });

    // Write ProjectRecord envelope — convert to GreenStarResult-compatible shape
    const resultPayload = {
      ratingTool: rating.ratingTool,
      credits: rating.credits,
      totalTargeted: rating.credits.reduce((sum, c) => sum + c.targetedPoints, 0),
      totalAchieved: rating.credits.reduce((sum, c) => sum + c.achievedPoints, 0),
      starRating: 0 as const, // Actual star rating calculated by greenBuildingService
      categoryMinimumsMet: true,
      unmetMinimums: [],
    };
    const envelope = toProjectRecord(resultPayload, projectId, tenantId);
    const envelopeRef = doc(db, basePath, 'records', envelope.id);
    await setDoc(envelopeRef, { ...envelope, _updatedAt: serverTimestamp() });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `tenants/${tenantId}/projects/${projectId}/eia/green-building/${rating.id}`);
  }
}

// ─── EDGE Certification ──────────────────────────────────────────────────────

/**
 * Persists an EDGE certification record and writes ProjectRecord envelope.
 * Requirement 10.7: Write EDGE certification status to Project Passport.
 */
export async function saveEDGECertification(
  tenantId: string,
  projectId: string,
  edge: EDGECertification
): Promise<void> {
  try {
    const basePath = eiaBasePath(tenantId, projectId);
    const docRef = doc(db, basePath, 'green-building', edge.id);
    await setDoc(docRef, { ...edge, _type: 'edge', _updatedAt: serverTimestamp() }, { merge: true });

    // Write ProjectRecord envelope
    const resultPayload = {
      categories: edge.categories,
      level: edge.level,
      stage: edge.stage,
      allCategoriesValid: edge.categories.every(c => c.meetsThreshold),
      lastUpdated: edge.lastUpdated,
    };
    const envelope = toProjectRecord(resultPayload, projectId, tenantId);
    const envelopeRef = doc(db, basePath, 'records', envelope.id);
    await setDoc(envelopeRef, { ...envelope, _updatedAt: serverTimestamp() });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `tenants/${tenantId}/projects/${projectId}/eia/green-building/${edge.id}`);
  }
}

// ─── Net Zero Target ─────────────────────────────────────────────────────────

/**
 * Persists a Net Zero target record.
 * Requirement 11.6: Write net-zero target and progress to Project Passport.
 */
export async function saveNetZeroTarget(
  tenantId: string,
  projectId: string,
  target: NetZeroTarget
): Promise<void> {
  try {
    const basePath = eiaBasePath(tenantId, projectId);
    const docRef = doc(db, basePath, 'green-building', target.id);
    await setDoc(docRef, { ...target, _type: 'net_zero', _updatedAt: serverTimestamp() }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `tenants/${tenantId}/projects/${projectId}/eia/green-building/${target.id}`);
  }
}

// ─── Read All EIA Data ───────────────────────────────────────────────────────

/**
 * Reads all EIA subcollections for a project. Returns a composite object
 * with arrays for each collection.
 *
 * Used by the EIA Overview tab and Project Passport integration to surface
 * environmental compliance status.
 *
 * Requirement 12.7: Read project attributes from Project Passport for
 * screening pre-population.
 */
export interface EIAProjectData {
  screening: ScreeningResult[];
  assessments: AssessmentRecord[];
  authorizations: AuthorizationRecord[];
  empr: EMPrCommitment[];
  eapAppointments: EAPAppointment[];
  greenBuilding: {
    greenStar: GreenStarRating[];
    edge: EDGECertification[];
    netZero: NetZeroTarget[];
  };
}

export async function getEIAData(
  tenantId: string,
  projectId: string
): Promise<EIAProjectData> {
  try {
    const basePath = eiaBasePath(tenantId, projectId);

    // Read subcollections in parallel for performance
    const [
      screeningSnap,
      assessmentSnap,
      authorizationSnap,
      emprSnap,
      eapSnap,
      greenBuildingSnap,
    ] = await Promise.all([
      getDocs(collection(db, basePath, 'screening')),
      getDocs(collection(db, basePath, 'assessments')),
      getDocs(collection(db, basePath, 'authorizations')),
      getDocs(collection(db, basePath, 'empr')),
      getDocs(collection(db, basePath, 'eap')),
      getDocs(collection(db, basePath, 'green-building')),
    ]);

    const screening = screeningSnap.docs.map(d => ({ id: d.id, ...d.data() } as ScreeningResult));
    const assessments = assessmentSnap.docs.map(d => ({ id: d.id, ...d.data() } as AssessmentRecord));
    const authorizations = authorizationSnap.docs.map(d => ({ id: d.id, ...d.data() } as AuthorizationRecord));
    const empr = emprSnap.docs.map(d => ({ id: d.id, ...d.data() } as EMPrCommitment));
    const eapAppointments = eapSnap.docs.map(d => ({ id: d.id, ...d.data() } as EAPAppointment));

    // Partition green-building documents by _type discriminator
    const greenStar: GreenStarRating[] = [];
    const edge: EDGECertification[] = [];
    const netZero: NetZeroTarget[] = [];

    greenBuildingSnap.docs.forEach(d => {
      const data = d.data();
      switch (data._type) {
        case 'green_star':
          greenStar.push({ id: d.id, ...data } as unknown as GreenStarRating);
          break;
        case 'edge':
          edge.push({ id: d.id, ...data } as unknown as EDGECertification);
          break;
        case 'net_zero':
          netZero.push({ id: d.id, ...data } as unknown as NetZeroTarget);
          break;
      }
    });

    return {
      screening,
      assessments,
      authorizations,
      empr,
      eapAppointments,
      greenBuilding: { greenStar, edge, netZero },
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `tenants/${tenantId}/projects/${projectId}/eia`);
    // handleFirestoreError always throws, but TypeScript needs a return
    throw error;
  }
}

// ─── Project Passport Read ───────────────────────────────────────────────────

/**
 * Reads project attributes from Project Passport for screening
 * pre-population. Returns basic project metadata that can seed the
 * screening form fields.
 *
 * Requirement 12.7: Read project attributes from Project Passport.
 */
export interface ProjectAttributes {
  projectName?: string;
  municipality?: string;
  province?: string;
  propertyReference?: string;
  propertyUse?: string;
  landUseNotes?: string;
  totalSiteArea?: number;
}

export async function getProjectAttributes(
  tenantId: string,
  projectId: string
): Promise<ProjectAttributes | null> {
  try {
    const docRef = doc(db, `tenants/${tenantId}/projects/${projectId}`);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;

    const data = snap.data();
    return {
      projectName: data.projectName,
      municipality: data.municipality,
      province: data.province,
      propertyReference: data.propertyReference,
      propertyUse: data.propertyUse,
      landUseNotes: data.landUseNotes,
      totalSiteArea: data.totalSiteArea,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `tenants/${tenantId}/projects/${projectId}`);
    throw error;
  }
}
