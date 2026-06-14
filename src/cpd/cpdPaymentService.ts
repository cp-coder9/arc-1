import type {
  CPDAssessmentPurchase,
  CPDCommercialModel,
  CPDCourse,
  CPDInstructorPayout,
  CPDPaymentSettings,
  CPDPriceCalculation,
} from './cpdTypes';

const roundMoney = (value: number) => Math.round(value * 100) / 100;

type RecommendationBand = {
  minRand: number;
  maxRand: number;
  rationale: string;
};

const commercialModelBands: Record<CPDCommercialModel, RecommendationBand> = {
  free_launch_or_partner_funnel: {
    minRand: 0,
    maxRand: 0,
    rationale: 'Used when the CPD activity is a launch funnel, sponsor-funded, or intentionally free.',
  },
  partner_bundle_included: {
    minRand: 0,
    maxRand: 0,
    rationale: 'Learner already paid the partner/course bundle; assessment is included by contract.',
  },
  paid_webinar_addon_assessment: {
    minRand: 25,
    maxRand: 75,
    rationale: 'Learner already paid the higher webinar/course fee elsewhere, so Architex charges a lower add-on fee for the extra assessed CPD evidence/credits.',
  },
  standalone_article_based_assessment: {
    minRand: 75,
    maxRand: 250,
    rationale: 'Article/reading-based CPD is consumed mainly through the Architex assessment/evidence workflow, so the assessment carries more standalone value.',
  },
  dedicated_cpd_course_assessment: {
    minRand: 100,
    maxRand: 750,
    rationale: 'Dedicated CPD course pricing should be judged from duration, approved category, credit value, effort and content-owner proposal.',
  },
};

export function recommendAssessmentPrice({ course }: { course: CPDCourse }): {
  recommendedPriceRand: number;
  minRand: number;
  maxRand: number;
  rationale: string;
} {
  const model = course.commercialModel ?? 'dedicated_cpd_course_assessment';
  const band = commercialModelBands[model];
  if (course.adminApprovedPriceRand !== undefined) {
    return {
      recommendedPriceRand: roundMoney(course.adminApprovedPriceRand),
      minRand: band.minRand,
      maxRand: band.maxRand,
      rationale: `Admin-approved price overrides formula. ${band.rationale}`,
    };
  }

  if (course.contentOwnerProposedPriceRand !== undefined && course.pricingBasis === 'content_owner_proposed_admin_approved') {
    const clamped = Math.min(Math.max(course.contentOwnerProposedPriceRand, band.minRand), band.maxRand);
    return {
      recommendedPriceRand: roundMoney(clamped),
      minRand: band.minRand,
      maxRand: band.maxRand,
      rationale: `Content-owner proposed price, subject to admin approval and band limits. ${band.rationale}`,
    };
  }

  if (model === 'dedicated_cpd_course_assessment') {
    const minutes = course.expectedAssessmentMinutes ?? 30;
    const creditMultiplier = Math.max(course.approvedCredits, 1);
    const categoryMultiplier = course.approvedCategory === 'category_1_developmental_activity' ? 1.25 : 1;
    const durationComponent = minutes * 2.5;
    const creditComponent = creditMultiplier * 75;
    const formulaPrice = Math.min(Math.max((durationComponent + creditComponent) * categoryMultiplier, band.minRand), band.maxRand);
    return {
      recommendedPriceRand: roundMoney(formulaPrice),
      minRand: band.minRand,
      maxRand: band.maxRand,
      rationale: `Formula based on expected assessment duration, approved CPD credits and approved CPD category. ${band.rationale}`,
    };
  }

  const midpoint = (band.minRand + band.maxRand) / 2;
  return {
    recommendedPriceRand: roundMoney(midpoint),
    minRand: band.minRand,
    maxRand: band.maxRand,
    rationale: band.rationale,
  };
}

export function calculateAssessmentPrice({
  course,
  settings,
}: {
  course: CPDCourse;
  settings: CPDPaymentSettings;
}): CPDPriceCalculation {
  if (!settings.enabled) {
    return {
      assessmentPriceRand: 0,
      platformFeeRand: 0,
      contentOwnerNetRand: 0,
      platformFeePercent: settings.platformFeePercent,
      minimumPlatformFeeRand: settings.minimumPlatformFeeRand,
      fixedPlatformFeeRand: settings.fixedPlatformFeeRand,
    };
  }

  const recommendation = recommendAssessmentPrice({ course });
  const assessmentPriceRand = roundMoney(
    course.assessmentPriceRand ?? course.adminApprovedPriceRand ?? recommendation.recommendedPriceRand ?? settings.defaultAssessmentPriceRand,
  );
  if (assessmentPriceRand < 0) {
    throw new Error('Assessment price cannot be negative.');
  }

  const percentFee = assessmentPriceRand * (settings.platformFeePercent / 100);
  const fixedFee = settings.fixedPlatformFeeRand ?? 0;
  const minimumFee = settings.minimumPlatformFeeRand ?? 0;
  const rawPlatformFee = Math.max(percentFee + fixedFee, minimumFee);
  const platformFeeRand = roundMoney(Math.min(rawPlatformFee, assessmentPriceRand));
  const contentOwnerNetRand = roundMoney(assessmentPriceRand - platformFeeRand);

  return {
    assessmentPriceRand,
    platformFeeRand,
    contentOwnerNetRand,
    platformFeePercent: settings.platformFeePercent,
    minimumPlatformFeeRand: settings.minimumPlatformFeeRand,
    fixedPlatformFeeRand: settings.fixedPlatformFeeRand,
  };
}

export function createAssessmentPurchase({
  course,
  learnerUserId,
  contentOwnerUserId,
  settings,
  paymentProvider,
}: {
  course: CPDCourse;
  learnerUserId: string;
  contentOwnerUserId: string;
  settings: CPDPaymentSettings;
  paymentProvider: 'payfast' | 'yoco' | 'stripe' | 'manual_eft' | 'other';
}): CPDAssessmentPurchase {
  const price = calculateAssessmentPrice({ course, settings });
  const id = `cpd_purchase_${Date.now()}`;
  return {
    id,
    courseId: course.id,
    learnerUserId,
    contentOwnerUserId,
    assessmentPriceRand: price.assessmentPriceRand,
    platformFeeRand: price.platformFeeRand,
    contentOwnerNetRand: price.contentOwnerNetRand,
    platformFeePercent: price.platformFeePercent,
    paymentProvider,
    paymentStatus: price.assessmentPriceRand === 0 ? 'paid' : 'pending',
    createdAt: new Date().toISOString(),
  };
}

export function markPurchasePaid({
  purchase,
  providerReference,
}: {
  purchase: CPDAssessmentPurchase;
  providerReference: string;
}): CPDAssessmentPurchase {
  return {
    ...purchase,
    providerReference,
    paymentStatus: 'paid',
    paidAt: new Date().toISOString(),
  };
}

export function createInstructorPayout({
  contentOwnerUserId,
  purchases,
}: {
  contentOwnerUserId: string;
  purchases: CPDAssessmentPurchase[];
}): CPDInstructorPayout {
  const paidPurchases = purchases.filter(
    (purchase) => purchase.contentOwnerUserId === contentOwnerUserId && purchase.paymentStatus === 'paid',
  );
  const grossRand = roundMoney(paidPurchases.reduce((sum, purchase) => sum + purchase.assessmentPriceRand, 0));
  const platformFeeRand = roundMoney(paidPurchases.reduce((sum, purchase) => sum + purchase.platformFeeRand, 0));
  const payoutRand = roundMoney(paidPurchases.reduce((sum, purchase) => sum + purchase.contentOwnerNetRand, 0));

  return {
    id: `cpd_payout_${contentOwnerUserId}_${Date.now()}`,
    contentOwnerUserId,
    purchaseIds: paidPurchases.map((purchase) => purchase.id),
    grossRand,
    platformFeeRand,
    payoutRand,
    payoutStatus: 'pending',
    createdAt: new Date().toISOString(),
  };
}

export function canStartPaidAssessment(purchase: CPDAssessmentPurchase): boolean {
  return purchase.paymentStatus === 'paid';
}
