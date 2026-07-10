/**
 * Project Passport Adapter
 *
 * Writes town planning status into the Project Passport health card.
 */
import type { FirestoreDB } from '../services/accessControl';
import type { ApplicationStage, DecisionOutcome } from '../types';

export interface PlanningPassportUpdate {
  applicationId: string;
  applicationType: string;
  currentStage: ApplicationStage;
  referenceNumber: string;
  decision?: DecisionOutcome;
  conditionsCompliancePercent?: number;
  lastUpdated: string;
}

/**
 * Write planning status to Project Passport.
 */
export async function updateProjectPassport(
  db: FirestoreDB,
  projectId: string,
  update: PlanningPassportUpdate,
): Promise<void> {
  const passportRef = db.collection('projects').doc(projectId);
  const doc = await passportRef.get();

  if (!doc.exists) return;

  await passportRef.update({
    'passport.townPlanning': {
      ...update,
      updatedAt: new Date().toISOString(),
    },
    updatedAt: new Date().toISOString(),
  });
}
