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
import { Bid, TenderPackage, UserVerification, VerificationSubjectType } from '../types';
import { isActiveVerifiedVerification } from './userVerificationService';

const TENDERS_COL = 'tender_packages';

export type CreateTenderPackageData = Omit<TenderPackage, 'id' | 'status' | 'createdAt' | 'updatedAt'> & {
  status?: TenderPackage['status'];
};

export type SubmitBidData = Omit<Bid, 'id' | 'tenderPackageId' | 'status' | 'createdAt' | 'updatedAt' | 'verificationId'> & {
  status?: Bid['status'];
  verificationId?: string;
};

const TENDER_BID_VERIFICATION_REQUIREMENTS: Array<{ subjectType: VerificationSubjectType; statutoryBody: string }> = [
  { subjectType: 'contractor', statutoryBody: 'CIDB' },
  { subjectType: 'subcontractor', statutoryBody: 'CIDB' },
  { subjectType: 'contractor', statutoryBody: 'NHBRC' },
];

export async function getActiveTenderBidVerification(contractorId: string): Promise<UserVerification | null> {
  for (const requirement of TENDER_BID_VERIFICATION_REQUIREMENTS) {
    const verificationQuery = query(
      collection(db, 'user_verifications'),
      where('userId', '==', contractorId),
      where('subjectType', '==', requirement.subjectType),
      where('status', '==', 'verified'),
    );
    const snapshot = await getDocs(verificationQuery);
    const active = snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }) as UserVerification)
      .find((verification) => isActiveVerifiedVerification(verification, requirement));
    if (active) return active;
  }
  return null;
}

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
  const verification = bidData.verificationId
    ? ({ id: bidData.verificationId } as UserVerification)
    : await getActiveTenderBidVerification(bidData.contractorId);

  if (!verification?.id) {
    throw new Error('Active contractor verification is required before submitting tender bids');
  }

  const bidRef = doc(db, TENDERS_COL, tenderId, 'bids', `contractor_${bidData.contractorId}`);
  const now = new Date().toISOString();
  const bid: Bid = {
    ...bidData,
    id: bidRef.id,
    tenderPackageId: tenderId,
    verificationId: verification.id,
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
