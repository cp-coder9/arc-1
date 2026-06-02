import { db } from '@/lib/firebase';
import { LedgerEntry } from '@/types';
import { addDoc, collection, getDocs, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';

const LEDGER_COLLECTION = 'ledger';

const mapLedgerDoc = (docSnap: { id: string; data: () => Record<string, unknown> }): LedgerEntry => ({
  id: docSnap.id,
  ...docSnap.data(),
} as LedgerEntry);

export async function recordTransaction(entry: Omit<LedgerEntry, 'id'>): Promise<string> {
  const docRef = await addDoc(collection(db, LEDGER_COLLECTION), entry);
  return docRef.id;
}

export async function getLedgerForProject(projectId: string): Promise<LedgerEntry[]> {
  const snapshot = await getDocs(query(collection(db, LEDGER_COLLECTION), where('projectId', '==', projectId), orderBy('createdAt', 'desc')));
  return snapshot.docs.map(mapLedgerDoc);
}

export async function getLedgerForUser(userId: string): Promise<LedgerEntry[]> {
  const [payerSnapshot, payeeSnapshot] = await Promise.all([
    getDocs(query(collection(db, LEDGER_COLLECTION), where('payerId', '==', userId), orderBy('createdAt', 'desc'))),
    getDocs(query(collection(db, LEDGER_COLLECTION), where('payeeId', '==', userId), orderBy('createdAt', 'desc'))),
  ]);
  const entries = new Map<string, LedgerEntry>();
  [...payerSnapshot.docs, ...payeeSnapshot.docs].forEach((docSnap) => entries.set(docSnap.id, mapLedgerDoc(docSnap)));
  return [...entries.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getPlatformSummary(): Promise<{ totalRevenue: number; totalEscrowHeld: number; totalRefunded: number; ledgerCount: number }> {
  const snapshot = await getDocs(query(collection(db, LEDGER_COLLECTION), orderBy('createdAt', 'desc'), limit(1000)));
  const entries = snapshot.docs.map(mapLedgerDoc);
  return entries.reduce((summary, entry) => {
    if (entry.type === 'platform_fee') summary.totalRevenue += entry.amount;
    if (entry.type === 'escrow_deposit') summary.totalEscrowHeld += entry.amount;
    if (entry.type === 'milestone_release') summary.totalEscrowHeld -= entry.amount;
    if (entry.type === 'refund') {
      summary.totalRefunded += entry.amount;
      summary.totalEscrowHeld -= entry.amount;
    }
    summary.ledgerCount += 1;
    return summary;
  }, { totalRevenue: 0, totalEscrowHeld: 0, totalRefunded: 0, ledgerCount: 0 });
}

export function subscribeToLedger(projectId: string, cb: (entries: LedgerEntry[]) => void): () => void {
  return onSnapshot(
    query(collection(db, LEDGER_COLLECTION), where('projectId', '==', projectId), orderBy('createdAt', 'desc')),
    (snapshot) => cb(snapshot.docs.map(mapLedgerDoc))
  );
}
