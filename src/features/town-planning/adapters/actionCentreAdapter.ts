/**
 * Action Centre Adapter
 *
 * Surfaces town planning deadlines and notifications in the user's inbox.
 */
import type { FirestoreDB } from '../services/accessControl';

export interface ActionCentreEvent {
  projectId: string;
  applicationId: string;
  type: 'deadline_warning' | 'stage_transition' | 'condition_overdue' | 'decision_received';
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  targetUserId?: string;
  targetRole?: string;
  dueDate?: string;
  createdAt: string;
}

/**
 * Create an action centre event for a user or role.
 */
export async function createActionCentreEvent(
  db: FirestoreDB,
  event: ActionCentreEvent,
): Promise<void> {
  await db.collection('action_centre_events').add({
    ...event,
    status: 'pending',
    createdAt: new Date().toISOString(),
  } as unknown as Record<string, unknown>);
}

/**
 * Surface a deadline warning in the Action Centre.
 */
export async function surfaceDeadlineWarning(
  db: FirestoreDB,
  projectId: string,
  applicationId: string,
  title: string,
  dueDate: string,
  targetUserId: string,
): Promise<void> {
  await createActionCentreEvent(db, {
    projectId,
    applicationId,
    type: 'deadline_warning',
    title,
    description: `Deadline: ${dueDate}`,
    severity: 'warning',
    targetUserId,
    dueDate,
    createdAt: new Date().toISOString(),
  });
}
