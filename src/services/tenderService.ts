import { db } from '../lib/firebase';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { Bid, TenderPackage } from '../types';

const TENDERS_COL = 'tender_packages';

export type CreateTenderPackageData = Omit<TenderPackage, 'id' | 'status' | 'createdAt' | 'updatedAt'> & {
  status?: TenderPackage['status'];
};

export type SubmitBidData = Omit<Bid, 'id' | 'tenderPackageId' | 'status' | 'createdAt' | 'updatedAt'> & {
  status?: Bid['status'];
};

export async function createTenderPackage(data: CreateTenderPackageData): Promise<string> {
  const tenderRef = doc(collection(db, TENDERS_COL));
  const now = new Date().toISOString();
  const tender: TenderPackage = {
    ...data,
    id: tenderRef.id,
    status: data.status ?? 'draft',
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(tenderRef, tender);
  return tenderRef.id;
}

export async function publishTender(tenderId: string): Promise<void> {
  await updateTenderStatus(tenderId, 'published');
}

export async function closeTender(tenderId: string): Promise<void> {
  await updateTenderStatus(tenderId, 'closed');
}

export async function submitBid(tenderId: string, bidData: SubmitBidData): Promise<string> {
  const bidRef = doc(collection(db, TENDERS_COL, tenderId, 'bids'));
  const now = new Date().toISOString();
  const bid: Bid = {
    ...bidData,
    id: bidRef.id,
    tenderPackageId: tenderId,
    status: bidData.status ?? 'submitted',
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(bidRef, bid);
  return bidRef.id;
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

export async function awardBid(tenderId: string, bid: Bid): Promise<void> {
  const now = new Date().toISOString();
  await updateDoc(doc(db, TENDERS_COL, tenderId), {
    status: 'awarded',
    awardedBidId: bid.id,
    awardedContractorId: bid.contractorId,
    updatedAt: now,
  });
  await updateBidStatus(tenderId, bid.id, 'awarded');
}

export async function getTendersByProject(projectId: string): Promise<TenderPackage[]> {
  const tenderQuery = query(collection(db, TENDERS_COL), where('projectId', '==', projectId));
  const snapshot = await getDocs(tenderQuery);
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as TenderPackage);
}

export async function getBidsForTender(tenderId: string): Promise<Bid[]> {
  const snapshot = await getDocs(collection(db, TENDERS_COL, tenderId, 'bids'));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as Bid);
}

export function subscribeToBids(tenderId: string, cb: (bids: Bid[]) => void): () => void {
  return onSnapshot(collection(db, TENDERS_COL, tenderId, 'bids'), (snapshot) => {
    cb(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as Bid));
  });
}

async function updateTenderStatus(tenderId: string, status: TenderPackage['status']): Promise<void> {
  await updateDoc(doc(db, TENDERS_COL, tenderId), {
    status,
    updatedAt: new Date().toISOString(),
  });
}

async function updateBidStatus(tenderId: string, bidId: string, status: Bid['status']): Promise<void> {
  await updateDoc(doc(db, TENDERS_COL, tenderId, 'bids', bidId), {
    status,
    updatedAt: new Date().toISOString(),
  });
}
