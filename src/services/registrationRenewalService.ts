import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import {
  addDoc,

  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  orderBy,
  writeBatch,
} from 'firebase/firestore';
import type { ProfessionalRegistration, RegistrationBody, RegistrationStatus } from '@/types';
import { notificationService } from './notificationService';


import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';
const REGISTRATIONS_COL = 'registrations';

const VALID_BODIES: RegistrationBody[] = ['SACAP', 'ECSA', 'SACQSP', 'SACLAP', 'SACPCMP'];
const VALID_STATUSES: RegistrationStatus[] = ['active', 'expiring_soon', 'expired', 'renewed', 'suspended'];
const EXPIRY_WARNING_DAYS = 90; // Warn 90 days before expiry

function assertValidBody(body: RegistrationBody): void {
  if (!VALID_BODIES.includes(body)) throw new Error(`Invalid registration body: ${body}`);
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  const target = new Date(dateStr);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function computeStatus(expiryDate: string): RegistrationStatus {
  const days = daysUntil(expiryDate);
  if (days < 0) return 'expired';
  if (days <= EXPIRY_WARNING_DAYS) return 'expiring_soon';
  return 'active';
}

export async function registerProfessional(input: {
  userId: string;
  firmId: string;
  body: RegistrationBody;
  registrationNumber: string;
  expiryDate: string;
  cpdPointsRequired?: number;
  cpdPointsEarned?: number;
  documents?: { name: string; url: string }[];
}): Promise<ProfessionalRegistration> {
  try {
    if (!input.userId || !input.firmId || !input.body || !input.registrationNumber || !input.expiryDate) {
      throw new Error('userId, firmId, body, registrationNumber, and expiryDate are required.');
    }
    assertValidBody(input.body);

    const status = computeStatus(input.expiryDate);
    const now = new Date().toISOString();
    const ref = doc(getDemoCol( REGISTRATIONS_COL));
    const registration: ProfessionalRegistration = {
      id: ref.id,
      userId: input.userId,
      firmId: input.firmId,
      body: input.body,
      registrationNumber: input.registrationNumber.trim(),
      expiryDate: input.expiryDate,
      status,
      cpdPointsRequired: input.cpdPointsRequired || 0,
      cpdPointsEarned: input.cpdPointsEarned || 0,
      renewalReminderSent: false,
      documents: input.documents,
      createdAt: now,
      updatedAt: now,
    };

    await setDoc(ref, registration);

    if (status === 'expiring_soon' || status === 'expired') {
      await notificationService.sendNotification(
        input.userId,
        'registration_expiring',
        `Your ${input.body} registration (${input.registrationNumber}) ${status === 'expired' ? 'has expired' : 'expires soon'} on ${input.expiryDate}.`,
        { entityId: ref.id, firmId: input.firmId }
      );
    }

    return registration;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, REGISTRATIONS_COL);
  }
}

export async function updateCpdPoints(id: string, cpdPointsEarned: number, actorId: string): Promise<void> {
  try {
    if (cpdPointsEarned < 0) throw new Error('CPD points earned cannot be negative.');

    const regRef = getDemoDoc( REGISTRATIONS_COL, id);
    const regSnap = await getDoc(regRef);
    if (!regSnap.exists()) throw new Error('Registration not found.');

    const now = new Date().toISOString();
    const reg = { id: regSnap.id, ...regSnap.data() } as ProfessionalRegistration;
    const totalPoints = (reg.cpdPointsEarned || 0) + cpdPointsEarned;

    await updateDoc(regRef, { cpdPointsEarned: totalPoints, updatedAt: now });

    // Check for CPD shortfall
    if (reg.cpdPointsRequired > 0 && totalPoints < reg.cpdPointsRequired) {
      const shortfall = reg.cpdPointsRequired - totalPoints;
      await notificationService.sendNotification(
        reg.userId,
        'cpd_shortfall',
        `CPD shortfall: You need ${shortfall} more points to meet the ${reg.cpdPointsRequired} requirement for ${reg.body}.`,
        { entityId: id, firmId: reg.firmId }
      );
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${REGISTRATIONS_COL}/${id}`);
  }
}

export async function checkRenewalEligibility(id: string): Promise<{ eligible: boolean; blockers: string[]; warnings: string[] }> {
  try {
    const regSnap = await getDoc(getDemoDoc( REGISTRATIONS_COL, id));
    if (!regSnap.exists()) throw new Error('Registration not found.');

    const reg = { id: regSnap.id, ...regSnap.data() } as ProfessionalRegistration;
    const blockers: string[] = [];
    const warnings: string[] = [];

    if (reg.cpdPointsRequired > 0 && reg.cpdPointsEarned < reg.cpdPointsRequired) {
      blockers.push(`CPD shortfall: ${reg.cpdPointsEarned}/${reg.cpdPointsRequired} points earned.`);
    }
    if (reg.status === 'suspended') blockers.push('Registration is suspended.');
    if (reg.status === 'expired') blockers.push('Registration has expired.');

    const days = daysUntil(reg.expiryDate);
    if (days <= 30 && days > 0) warnings.push(`Registration expires in ${days} days.`);
    if (days <= 0) warnings.push('Registration has passed its expiry date.');

    return { eligible: blockers.length === 0, blockers, warnings };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${REGISTRATIONS_COL}/${id}`);
  }
}

export async function renewRegistration(id: string, newExpiryDate: string, actorId: string): Promise<void> {
  try {
    const regRef = getDemoDoc( REGISTRATIONS_COL, id);
    const regSnap = await getDoc(regRef);
    if (!regSnap.exists()) throw new Error('Registration not found.');

    const now = new Date().toISOString();
    const status = computeStatus(newExpiryDate);
    await updateDoc(regRef, {
      expiryDate: newExpiryDate,
      status,
      lastRenewedAt: now,
      renewalSubmittedAt: now,
      renewalReminderSent: false,
      updatedAt: now,
    });

    const reg = { id: regSnap.id, ...regSnap.data() } as ProfessionalRegistration;
    await notificationService.sendNotification(
      reg.userId,
      'registration_expiring',
      `Your ${reg.body} registration has been renewed. New expiry: ${newExpiryDate}.`,
      { entityId: id, firmId: reg.firmId }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${REGISTRATIONS_COL}/${id}`);
  }
}

export async function getExpiringRegistrations(firmId: string, withinDays: number = EXPIRY_WARNING_DAYS): Promise<ProfessionalRegistration[]> {
  try {
    const all = await getFirmRegistrations(firmId);
    return all.filter((reg) => {
      const days = daysUntil(reg.expiryDate);
      return days >= 0 && days <= withinDays;
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, REGISTRATIONS_COL);
  }
}

export async function getFirmRegistrations(firmId: string, filters?: { body?: RegistrationBody; status?: RegistrationStatus }): Promise<ProfessionalRegistration[]> {
  try {
    const constraints = [where('firmId', '==', firmId), orderBy('expiryDate', 'asc')];
    if (filters?.body) constraints.unshift(where('body', '==', filters.body));
    if (filters?.status) constraints.unshift(where('status', '==', filters.status));

    const q = query(getDemoCol( REGISTRATIONS_COL), ...constraints);
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as ProfessionalRegistration));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, REGISTRATIONS_COL);
  }
}

export async function getUserRegistrations(userId: string, firmId: string): Promise<ProfessionalRegistration[]> {
  try {
    const q = query(
      getDemoCol( REGISTRATIONS_COL),
      where('userId', '==', userId),
      where('firmId', '==', firmId),
      orderBy('expiryDate', 'asc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as ProfessionalRegistration));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, REGISTRATIONS_COL);
  }
}

export async function getRegistration(id: string): Promise<ProfessionalRegistration | null> {
  try {
    const snap = await getDoc(getDemoDoc( REGISTRATIONS_COL, id));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as ProfessionalRegistration) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${REGISTRATIONS_COL}/${id}`);
  }
}

export async function sendRenewalReminders(firmId: string): Promise<number> {
  try {
    const expiring = await getExpiringRegistrations(firmId);
    let sent = 0;
    for (const reg of expiring) {
      if (reg.renewalReminderSent) continue;
      const days = daysUntil(reg.expiryDate);
      await notificationService.sendNotification(
        reg.userId,
        'registration_expiring',
        `Reminder: Your ${reg.body} registration (${reg.registrationNumber}) expires in ${days} days on ${reg.expiryDate}.`,
        { entityId: reg.id, firmId: reg.firmId }
      );
      await updateDoc(getDemoDoc( REGISTRATIONS_COL, reg.id), { renewalReminderSent: true, updatedAt: new Date().toISOString() });
      sent++;
    }
    return sent;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, REGISTRATIONS_COL);
  }
}

export async function deleteRegistration(id: string): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.delete(getDemoDoc( REGISTRATIONS_COL, id));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${REGISTRATIONS_COL}/${id}`);
  }
}

export function subscribeToRegistrations(firmId: string, callback: (registrations: ProfessionalRegistration[]) => void): () => void {
  return onSnapshot(
    query(getDemoCol( REGISTRATIONS_COL), where('firmId', '==', firmId), orderBy('expiryDate', 'asc')),
    (snapshot) => callback(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as ProfessionalRegistration))),
    (error) => {
      console.error('Failed to subscribe to registrations:', error);
      callback([]);
    }
  );
}

export const registrationRenewalService = {
  registerProfessional,
  updateCpdPoints,
  checkRenewalEligibility,
  renewRegistration,
  getExpiringRegistrations,
  getFirmRegistrations,
  getUserRegistrations,
  getRegistration,
  sendRenewalReminders,
  deleteRegistration,
  subscribeToRegistrations,
};

export default registrationRenewalService;
