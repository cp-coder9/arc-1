/**
 * Council Submission Service
 * Integration with South African municipalities
 */

import { db } from '../lib/firebase';
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  query,
  where,
  onSnapshot,
  getDocs,
  getDoc,
  orderBy
} from 'firebase/firestore';
import { CouncilSubmission, Job, UserProfile } from '../types';
import { notificationService } from './notificationService';
import { pdfGenerationService } from './pdfGenerationService';
import { toast } from 'sonner';

import { MunicipalityType } from '../types';

export type Municipality = 
  | 'city_of_johannesburg'
  | 'city_of_cape_town'
  | 'ethekwini'
  | 'nels_mandela_bay'
  | 'mbombela'
  | 'polokwane'
  | 'buffalo_city'
  | 'mangaung';

interface MunicipalityConfig {
  name: string;
  type: MunicipalityType;
  hasApi: boolean;
  apiUrl?: string;
  manualSubmissionUrl: string;
  requirements: string[];
}

const MUNICIPALITIES: Record<Municipality, MunicipalityConfig> = {
  city_of_johannesburg: {
    name: 'City of Johannesburg',
    type: 'COJ',
    hasApi: false,
    manualSubmissionUrl: 'https://www.joburg.org.za/departments_/Pages/Development%20Planning%20and%20Facilitation/DPD-Application-Forms.aspx',
    requirements: [
      'Completed application form (Form 1)',
      'Copy of title deed',
      'Site plan (1:500 scale)',
      'Floor plans, sections, elevations',
      'SANS 10400 compliance certificate',
      'Engineer\'s certificates (if applicable)',
      'Environmental authorization (if applicable)',
    ],
  },
  city_of_cape_town: {
    name: 'City of Cape Town',
    type: 'COCT',
    hasApi: false,
    manualSubmissionUrl: 'https://www.capetown.gov.za/Departments/Planning%20and%20Building%20Development%20Management',
    requirements: [
      'Completed application form',
      'Property description',
      'Location plan',
      'Site plan',
      'Building plans',
      'Engineer\'s certificate',
      'SANS 10400 compliance',
    ],
  },
  ethekwini: {
    name: 'eThekwini Municipality',
    type: 'eThekwini',
    hasApi: false,
    manualSubmissionUrl: 'https://www.durban.gov.za/departments/planning/',
    requirements: [
      'Application form',
      'Title deed',
      'Zoning certificate',
      'Building plans',
      'SANS compliance',
    ],
  },
  nels_mandela_bay: {
    name: 'Nelson Mandela Bay',
    type: 'Other',
    hasApi: false,
    manualSubmissionUrl: 'https://www.nelsonmandelabay.gov.za/',
    requirements: [
      'Application form',
      'Site plan',
      'Building plans',
      'SANS 10400 compliance',
    ],
  },
  mbombela: {
    name: 'Mbombela Local Municipality',
    type: 'Other',
    hasApi: false,
    manualSubmissionUrl: 'https://www.mbombela.gov.za/',
    requirements: [
      'Application form',
      'Site plan',
      'Building plans',
      'Compliance certificates',
    ],
  },
  polokwane: {
    name: 'Polokwane Municipality',
    type: 'Other',
    hasApi: false,
    manualSubmissionUrl: 'https://www.polokwane.gov.za/',
    requirements: [
      'Application form',
      'Building plans',
      'SANS compliance',
    ],
  },
  buffalo_city: {
    name: 'Buffalo City Metropolitan',
    type: 'Other',
    hasApi: false,
    manualSubmissionUrl: 'https://www.buffalocity.gov.za/',
    requirements: [
      'Application form',
      'Title deed',
      'Building plans',
      'SANS compliance',
    ],
  },
  mangaung: {
    name: 'Mangaung Metropolitan',
    type: 'Mangaung',
    hasApi: false,
    manualSubmissionUrl: 'https://www.mangaung.gov.za/',
    requirements: [
      'Application form',
      'Building plans',
      'Compliance certificates',
    ],
  },
};

class CouncilSubmissionService {
  /**
   * Get municipality configuration
   */
  getMunicipalityConfig(municipality: Municipality): MunicipalityConfig {
    return MUNICIPALITIES[municipality];
  }

  /**
   * Get all municipalities
   */
  getAllMunicipalities(): { value: Municipality; label: string }[] {
    return Object.entries(MUNICIPALITIES).map(([value, config]) => ({
      value: value as Municipality,
      label: config.name,
    }));
  }

  /**
   * Submit plans to council
   */
  async submitToCouncil(
    job: Job,
    municipality: Municipality,
    documents: { name: string; url: string }[],
    client: UserProfile
  ): Promise<CouncilSubmission> {
    const config = this.getMunicipalityConfig(municipality);
    
    // Generate reference number
    const referenceNumber = `${municipality.toUpperCase().replace(/_/g, '-')}-${Date.now()}`;

    const submission: Omit<CouncilSubmission, 'id'> = {
      jobId: job.id,
      municipality: 'Other',
      municipalityName: config.name,
      userId: client.uid,
      userId: client.uid,
      municipality: config.type,
      municipalityName: config.name,
      referenceNumber,
      status: 'preparing',
      documents,
      source: 'manual',
      trackingHistory: [
        {
          status: 'Document Package Created',
          timestamp: new Date().toISOString(),
          notes: 'All required documents compiled and ready for submission',
          source: 'manual'
          source: 'manual',
        },
      ],
      source: 'manual',
    };

    const docRef = await addDoc(collection(db, 'council_submissions'), submission);

    // Update job with council reference
    await updateDoc(doc(db, 'jobs', job.id), {
      councilReference: referenceNumber,
      status: 'council_submitted',
    });

    // Notify client
    await notificationService.notifyCouncilUpdate(
      client.uid,
      job.title,
      'Document package prepared',
      job.id
    );

    toast.success('Council submission package prepared successfully!');

    return { id: docRef.id, ...submission };
  }

  /**
   * Update submission status
   */
  async updateStatus(
    submissionId: string,
    status: CouncilSubmission['status'],
    notes?: string,
    queryData?: { description: string }
  ): Promise<void> {
    const ref = doc(db, 'council_submissions', submissionId);
    const docSnap = await getDoc(ref);
    
    if (!docSnap.exists()) return;
    
    const submission = docSnap.data() as CouncilSubmission;

    const update: any = {
      status,
    };

    // Add to tracking history
    update.trackingHistory = [
      ...submission.trackingHistory,
      {
        status: status.replace(/_/g, ' '),
        timestamp: new Date().toISOString(),
        notes,
        source: submission.source || 'manual',
      },
    ];

    // If queries raised
    if (status === 'queries_raised' && queryData) {
      update.queries = [
        ...(submission.queries || []),
        {
          raisedAt: new Date().toISOString(),
          description: queryData.description,
        },
      ];
    }

    // If submitted, set submitted date
    if (status === 'submitted') {
      update.submittedAt = new Date().toISOString();
    }

    await updateDoc(ref, update);

    // Notify client
    const jobDoc = await getDoc(doc(db, 'jobs', submission.jobId));
    if (jobDoc.exists()) {
      const job = jobDoc.data() as Job;
      await notificationService.notifyCouncilUpdate(
        job.clientId,
        job.title,
        status.replace(/_/g, ' '),
        job.id
      );
    }
  }

  /**
   * Respond to council query
   */
  async respondToQuery(
    submissionId: string,
    queryIndex: number,
    response: string,
    attachments?: { name: string; url: string }[]
  ): Promise<void> {
    const ref = doc(db, 'council_submissions', submissionId);
    const docSnap = await getDoc(ref);
    
    if (!docSnap.exists()) return;
    
    const submission = docSnap.data() as CouncilSubmission;
    const queries = submission.queries || [];
    
    if (queries[queryIndex]) {
      queries[queryIndex] = {
        ...queries[queryIndex],
        response,
        respondedAt: new Date().toISOString(),
        attachments,
      };

      await updateDoc(ref, { queries });
      
      toast.success('Response submitted successfully');
    }
  }

  /**
   * Subscribe to submission updates
   */
  subscribeToSubmission(
    jobId: string,
    callback: (submission: CouncilSubmission | null) => void
  ): () => void {
    const q = query(
      collection(db, 'council_submissions'),
      where('jobId', '==', jobId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        callback({ id: doc.id, ...doc.data() } as CouncilSubmission);
      } else {
        callback(null);
      }
    });

    return unsubscribe;
  }

  /**
   * Generate submission package PDF
   * In a real implementation, this would generate a complete submission package
   */
  async generateSubmissionPackage(submissionId: string): Promise<string> {
    // This would integrate with a PDF generation service
    // For now, return a placeholder
    return `/api/submissions/${submissionId}/package`;
  }
}

export const councilSubmissionService = new CouncilSubmissionService();
export { MUNICIPALITIES };
export type { MunicipalityConfig };
