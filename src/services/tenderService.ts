import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  updateDoc,
  where,
} from 'firebase/firestore';
import type { Bid, BidLineItem, BidStatus, TenderPackage, TenderStatus } from '@/types';

const TENDERS_COL = 'tender_packages';

type TenderInput = Omit<TenderPackage, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'awardedBidId' | 'awardedContractorId' | 'aiComparisonReport'> & {
  status?: TenderStatus;
};

type BidInput = Omit<Bid, 'id' | 'tenderPackageId' | 'status' | 'createdAt' | 'updatedAt' | 'totalAmount' | 'aiScore' | 'aiNotes'> & {
  status?: BidStatus;
  totalAmount?: number;
};

function nowIso(): string {
  return new Date().toISOString();
}

function bidTotal(lineItems: BidLineItem[], explicitTotal?: number): number {
  if (typeof explicitTotal === 'number' && Number.isFinite(explicitTotal)) return explicitTotal;
  return lineItems.reduce((sum, item) => sum + Number(item.total || item.quantity * item.unitPrice || 0), 0);
}

function tenderFromDoc(snapshot: { id: string; data: () => unknown }): TenderPackage {
  return { id: snapshot.id, ...(snapshot.data() as Omit<TenderPackage, 'id'>) };
}

function bidFromDoc(snapshot: { id: string; data: () => unknown }): Bid {
  return { id: snapshot.id, ...(snapshot.data() as Omit<Bid, 'id'>) };
}

export async function createTenderPackage(data: TenderInput): Promise<string> {
  try {
    const timestamp = nowIso();
    const tender: Omit<TenderPackage, 'id'> = {
      ...data,
      documents: data.documents ?? [],
      scope: data.scope ?? [],
      requiredDisciplines: data.requiredDisciplines ?? [],
      requiredCertifications: data.requiredCertifications ?? [],
      status: data.status ?? 'draft',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const tenderRef = await addDoc(collection(db, TENDERS_COL), tender);
    return tenderRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, TENDERS_COL);
  }
}

async function updateTenderStatus(tenderId: string, status: TenderStatus): Promise<void> {
  try {
    await updateDoc(doc(db, TENDERS_COL, tenderId), { status, updatedAt: nowIso() });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${TENDERS_COL}/${tenderId}`);
  }
}

export function publishTender(tenderId: string): Promise<void> {
  return updateTenderStatus(tenderId, 'published');
}

export function closeTender(tenderId: string): Promise<void> {
  return updateTenderStatus(tenderId, 'closed');
}

export function getContractorBidId(contractorId: string): string {
  return `contractor_${contractorId}`;
}

export async function submitBid(tenderId: string, bidData: BidInput): Promise<string> {
  try {
    const bidId = getContractorBidId(bidData.contractorId);
    const tenderRef = doc(db, TENDERS_COL, tenderId);
    const bidRef = doc(db, TENDERS_COL, tenderId, 'bids', bidId);

    await runTransaction(db, async (transaction) => {
      const [tenderSnap, existingBidSnap] = await Promise.all([
        transaction.get(tenderRef),
        transaction.get(bidRef),
      ]);
      if (!tenderSnap.exists()) throw new Error(`Tender ${tenderId} not found`);
      const tender = tenderSnap.data() as TenderPackage;
      if (tender.status !== 'published') throw new Error('Bids can only be submitted to published tenders');
      if (existingBidSnap.exists()) {
        const existingBid = existingBidSnap.data() as Bid;
        if (existingBid.status !== 'withdrawn') {
          throw new Error('You already have an active bid for this tender');
        }
      }

      const timestamp = nowIso();
      const bid: Omit<Bid, 'id'> = {
        ...bidData,
        tenderPackageId: tenderId,
        attachments: bidData.attachments ?? [],
        lineItems: bidData.lineItems.map((item) => ({ ...item, total: Number(item.total || item.quantity * item.unitPrice || 0) })),
        totalAmount: bidTotal(bidData.lineItems, bidData.totalAmount),
        status: bidData.status ?? 'submitted',
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      transaction.set(bidRef, bid);
    });

    return bidId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${TENDERS_COL}/${tenderId}/bids`);
  }
}

export async function withdrawBid(tenderId: string, bidId: string): Promise<void> {
  await updateBidStatus(tenderId, bidId, 'withdrawn');
}

export async function shortlistBid(tenderId: string, bidId: string): Promise<void> {
  await updateBidStatus(tenderId, bidId, 'shortlisted');
}

export async function rejectBid(tenderId: string, bidId: string): Promise<void> {
  await updateBidStatus(tenderId, bidId, 'rejected');
}

async function updateBidStatus(tenderId: string, bidId: string, status: BidStatus): Promise<void> {
  try {
    await updateDoc(doc(db, TENDERS_COL, tenderId, 'bids', bidId), { status, updatedAt: nowIso() });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${TENDERS_COL}/${tenderId}/bids/${bidId}`);
  }
}

export async function awardBid(tenderId: string, bidId: string): Promise<void> {
  try {
    const tenderRef = doc(db, TENDERS_COL, tenderId);
    const bidRef = doc(db, TENDERS_COL, tenderId, 'bids', bidId);
    await runTransaction(db, async (transaction) => {
      const competingBidRefs = (await getDocs(collection(db, TENDERS_COL, tenderId, 'bids'))).docs
        .map((snap) => doc(db, TENDERS_COL, tenderId, 'bids', snap.id));
      const [tenderSnap, bidSnap, ...competingBidSnaps] = await Promise.all([
        transaction.get(tenderRef),
        transaction.get(bidRef),
        ...competingBidRefs.map((ref) => transaction.get(ref)),
      ]);

      if (!tenderSnap.exists()) throw new Error(`Tender ${tenderId} not found`);
      const tender = tenderSnap.data() as TenderPackage;
      if (tender.status === 'awarded' || tender.status === 'cancelled') {
        throw new Error(`Tender ${tenderId} is already ${tender.status}`);
      }

      if (!bidSnap.exists()) throw new Error(`Bid ${bidId} not found`);
      const bid = bidSnap.data() as Bid;
      if (bid.tenderPackageId !== tenderId) throw new Error(`Bid ${bidId} does not belong to tender ${tenderId}`);
      if (bid.status !== 'submitted' && bid.status !== 'shortlisted') {
        throw new Error(`Bid ${bidId} is not eligible for award`);
      }

      const timestamp = nowIso();
      transaction.update(tenderRef, {
        status: 'awarded',
        awardedBidId: bidId,
        awardedContractorId: bid.contractorId,
        updatedAt: timestamp,
      });
      transaction.update(bidRef, { status: 'awarded', updatedAt: timestamp });

      competingBidSnaps.forEach((snap, index) => {
        if (!snap.exists() || snap.id === bidId) return;
        const competingBid = bidFromDoc(snap);
        if (competingBid.status === 'submitted' || competingBid.status === 'shortlisted') {
          transaction.update(competingBidRefs[index], { status: 'rejected', updatedAt: timestamp });
        }
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${TENDERS_COL}/${tenderId}`);
  }
}

export async function getTendersByProject(projectId: string): Promise<TenderPackage[]> {
  try {
    const snap = await getDocs(query(collection(db, TENDERS_COL), where('projectId', '==', projectId)));
    return snap.docs.map(tenderFromDoc).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, TENDERS_COL);
  }
}

export function subscribeToTendersByProject(projectId: string, cb: (tenders: TenderPackage[]) => void): () => void {
  const tendersQuery = query(collection(db, TENDERS_COL), where('projectId', '==', projectId));
  return onSnapshot(tendersQuery, (snap) => {
    cb(snap.docs.map(tenderFromDoc).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  });
}

export async function getBidsForTender(tenderId: string): Promise<Bid[]> {
  try {
    const snap = await getDocs(collection(db, TENDERS_COL, tenderId, 'bids'));
    return snap.docs.map(bidFromDoc).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${TENDERS_COL}/${tenderId}/bids`);
  }
}

export function subscribeToTender(tenderId: string, cb: (tender: TenderPackage | null) => void): () => void {
  return onSnapshot(doc(db, TENDERS_COL, tenderId), (snap) => cb(snap.exists() ? tenderFromDoc(snap) : null));
}

export function subscribeToBids(tenderId: string, cb: (bids: Bid[]) => void): () => void {
  return onSnapshot(collection(db, TENDERS_COL, tenderId, 'bids'), (snap) => cb(snap.docs.map(bidFromDoc)));
}

export const tenderService = {
  createTenderPackage,
  publishTender,
  closeTender,
  submitBid,
  withdrawBid,
  shortlistBid,
  rejectBid,
  awardBid,
  getTendersByProject,
  subscribeToTendersByProject,
  getBidsForTender,
  subscribeToTender,
  subscribeToBids,
};

export default tenderService;
