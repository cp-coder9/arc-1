/**
 * Cashflow Forecast Service
 *
 * Generates projected inflows/outflows and tracks actuals vs forecast.
 * The forecast is advisory — actual money movement depends on provider
 * configuration and confirmed payments.
 */
import type {
  CashflowForecast,
  PaymentCertificate,
  PaymentMilestone,
} from './types';

/**
 * Create a cashflow forecast for a project based on the payment schedule
 * and the most recent payment certificate.
 */
export function createCashflowForecast(
  projectId: string,
  schedule: PaymentMilestone[],
  latestCertificate: PaymentCertificate,
  notes?: string[],
): CashflowForecast {
  const totalScheduledAmount = schedule.reduce(
    (sum, m) => sum + m.amount.amount,
    0,
  );

  const defaultNotes = [
    'Forecast is advisory and excludes provider fees unless configured.',
    'Provider-confirmed paid amount remains separate from certified amount.',
  ];

  return {
    forecastId: `forecast-${projectId}-${Date.now()}`,
    projectId,
    totalScheduled: { currency: 'ZAR', amount: totalScheduledAmount },
    nextRelease: latestCertificate.approvedForRelease,
    retentionHeld: latestCertificate.retentionHeld,
    notes: [...defaultNotes, ...(notes ?? [])],
    generatedAtIso: new Date().toISOString(),
  };
}

/**
 * Calculate projected cashflow by categorising schedule items.
 */
export function calculateCashflowProjections(schedule: PaymentMilestone[]): {
  projectedInflow: number;
  projectedOutflow: number;
  netPosition: number;
} {
  let projectedOutflow = 0;
  let confirmedInflow = 0;

  for (const milestone of schedule) {
    projectedOutflow += milestone.amount.amount;

    if (milestone.status === 'provider_confirmed_paid') {
      confirmedInflow += milestone.amount.amount;
    }
  }

  // In a full implementation, inflow would come from client funding / provider confirmations
  const projectedInflow = projectedOutflow; // Assume fully funded

  return {
    projectedInflow,
    projectedOutflow,
    netPosition: confirmedInflow - projectedOutflow,
  };
}

/**
 * Compare actual payments against the forecast schedule.
 */
export function compareActualsVsForecast(
  forecast: CashflowForecast,
  actualPaidToDate: number,
): {
  variance: number;
  variancePercent: number;
  status: 'on_track' | 'ahead' | 'behind';
} {
  const scheduled = forecast.totalScheduled.amount;
  const variance = actualPaidToDate - scheduled;

  let variancePercent = 0;
  if (scheduled > 0) {
    variancePercent = Math.round((variance / scheduled) * 10000) / 100;
  }

  let status: 'on_track' | 'ahead' | 'behind';
  if (Math.abs(variancePercent) < 5) {
    status = 'on_track';
  } else if (variance > 0) {
    status = 'ahead';
  } else {
    status = 'behind';
  }

  return { variance, variancePercent, status };
}

/**
 * Merge forecasts (e.g., combine phase-level forecasts into a project-level view).
 */
export function mergeForecasts(
  forecasts: CashflowForecast[],
  projectId: string,
): CashflowForecast {
  const totalScheduled = forecasts.reduce(
    (sum, f) => sum + f.totalScheduled.amount,
    0,
  );
  const totalRetention = forecasts.reduce(
    (sum, f) => sum + f.retentionHeld.amount,
    0,
  );
  const totalNextRelease = forecasts.reduce(
    (sum, f) => sum + f.nextRelease.amount,
    0,
  );

  return {
    forecastId: `forecast-merged-${projectId}-${Date.now()}`,
    projectId,
    totalScheduled: { currency: 'ZAR', amount: totalScheduled },
    nextRelease: { currency: 'ZAR', amount: totalNextRelease },
    retentionHeld: { currency: 'ZAR', amount: totalRetention },
    notes: forecasts.flatMap((f) => f.notes),
    generatedAtIso: new Date().toISOString(),
  };
}
