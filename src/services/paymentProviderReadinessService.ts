export type ProviderReadinessStatus = 'ready' | 'watch' | 'blocked';
export type ProviderReadinessGateDomain = 'credentials' | 'webhooks' | 'ledger_controls' | 'statutory_controls' | 'human_governance';

export interface PaymentProviderReadinessInput {
  provider: 'payfast' | 'manual_eft' | 'escrow_ledger' | 'other';
  availableServerEnv?: string[];
  availablePublicEnv?: string[];
  serverRoutes?: string[];
  webhookEvents?: string[];
  controls?: {
    serverOwnedLedger?: boolean;
    humanEscrowReleaseGate?: boolean;
    disputeHoldQueue?: boolean;
    vatInvoiceNumbering?: boolean;
    taxAuditExport?: boolean;
    providerCredentialsStoredServerSide?: boolean;
  };
  generatedAt?: string;
}

export interface PaymentProviderReadinessGate {
  domain: ProviderReadinessGateDomain;
  status: ProviderReadinessStatus;
  label: string;
  evidence: string[];
  blockers: string[];
  warnings: string[];
}

export interface PaymentProviderReadinessProjection {
  provider: PaymentProviderReadinessInput['provider'];
  generatedAt: string;
  overallStatus: ProviderReadinessStatus;
  gates: PaymentProviderReadinessGate[];
  requiredServerEnv: string[];
  prohibitedPublicEnv: string[];
  requiredRoutes: string[];
  requiredWebhookEvents: string[];
  nextActions: string[];
  audit: {
    providerNeutral: true;
    noSecretValuesAccepted: true;
    autoReleaseProhibited: true;
    humanApprovalRequiredForMoneyMovement: true;
  };
}

const PAYFAST_SERVER_ENV = ['PAYFAST_MERCHANT_ID', 'PAYFAST_MERCHANT_KEY', 'PAYFAST_PASSPHRASE'];
const PAYFAST_PROHIBITED_PUBLIC_ENV = ['VITE_PAYFAST_MERCHANT_ID', 'VITE_PAYFAST_MERCHANT_KEY', 'VITE_PAYFAST_PASSPHRASE'];
const PAYFAST_ROUTES = ['/api/payment/payfast/itn'];
const PAYFAST_WEBHOOK_EVENTS = ['payment_complete', 'payment_failed', 'payment_cancelled'];

export function projectPaymentProviderReadiness(input: PaymentProviderReadinessInput): PaymentProviderReadinessProjection {
  const requiredServerEnv = input.provider === 'payfast' ? PAYFAST_SERVER_ENV : [];
  const prohibitedPublicEnv = input.provider === 'payfast' ? PAYFAST_PROHIBITED_PUBLIC_ENV : [];
  const requiredRoutes = input.provider === 'payfast' ? PAYFAST_ROUTES : [];
  const requiredWebhookEvents = input.provider === 'payfast' ? PAYFAST_WEBHOOK_EVENTS : [];
  const gates = [
    projectCredentialGate(input, requiredServerEnv, prohibitedPublicEnv),
    projectWebhookGate(input, requiredRoutes, requiredWebhookEvents),
    projectLedgerControlsGate(input),
    projectStatutoryControlsGate(input),
    projectHumanGovernanceGate(input),
  ];
  const nextActions = gates.flatMap((gate) => [...gate.blockers, ...gate.warnings]);

  return {
    provider: input.provider,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    overallStatus: combineStatuses(gates.map((gate) => gate.status)),
    gates,
    requiredServerEnv,
    prohibitedPublicEnv,
    requiredRoutes,
    requiredWebhookEvents,
    nextActions,
    audit: {
      providerNeutral: true,
      noSecretValuesAccepted: true,
      autoReleaseProhibited: true,
      humanApprovalRequiredForMoneyMovement: true,
    },
  };
}

function projectCredentialGate(input: PaymentProviderReadinessInput, requiredServerEnv: string[], prohibitedPublicEnv: string[]): PaymentProviderReadinessGate {
  const serverEnv = input.availableServerEnv ?? [];
  const publicEnv = input.availablePublicEnv ?? [];
  const missingServerEnv = requiredServerEnv.filter((key) => !serverEnv.includes(key));
  const exposedPublicEnv = prohibitedPublicEnv.filter((key) => publicEnv.includes(key));
  const blockers = [
    ...missingServerEnv.map((key) => `Missing server-only provider credential ${key}.`),
    ...exposedPublicEnv.map((key) => `Provider credential must not be exposed as public env ${key}.`),
  ];
  const warnings = input.controls?.providerCredentialsStoredServerSide === false
    ? ['Provider credentials must be stored and used server-side only.']
    : [];
  return gate('credentials', blockers.length > 0 ? 'blocked' : warnings.length > 0 ? 'watch' : 'ready', 'Provider credential boundary', serverEnv, blockers, warnings);
}

function projectWebhookGate(input: PaymentProviderReadinessInput, requiredRoutes: string[], requiredWebhookEvents: string[]): PaymentProviderReadinessGate {
  const routes = input.serverRoutes ?? [];
  const events = input.webhookEvents ?? [];
  const missingRoutes = requiredRoutes.filter((route) => !routes.includes(route));
  const missingEvents = requiredWebhookEvents.filter((event) => !events.includes(event));
  const blockers = missingRoutes.map((route) => `Missing server webhook route ${route}.`);
  const warnings = missingEvents.map((event) => `Webhook event ${event} is not mapped into audit/ledger reconciliation.`);
  return gate('webhooks', blockers.length > 0 ? 'blocked' : warnings.length > 0 ? 'watch' : 'ready', 'Webhook and reconciliation coverage', [...routes, ...events], blockers, warnings);
}

function projectLedgerControlsGate(input: PaymentProviderReadinessInput): PaymentProviderReadinessGate {
  const blockers = [
    ...(!input.controls?.serverOwnedLedger ? ['Ledger, invoice, escrow, and commission writes must be server-owned.'] : []),
    ...(!input.controls?.disputeHoldQueue ? ['Dispute/chargeback holds must be routed to a governed queue before release.'] : []),
  ];
  return gate('ledger_controls', blockers.length > 0 ? 'blocked' : 'ready', 'Server-owned ledger controls', controlEvidence(input), blockers, []);
}

function projectStatutoryControlsGate(input: PaymentProviderReadinessInput): PaymentProviderReadinessGate {
  const blockers = [
    ...(!input.controls?.vatInvoiceNumbering ? ['VAT/tax invoice numbering must be deterministic and auditable before provider go-live.'] : []),
    ...(!input.controls?.taxAuditExport ? ['Finance team needs a tax audit export for payments, fees, refunds, and VAT before statutory readiness.'] : []),
  ];
  return gate('statutory_controls', blockers.length > 0 ? 'blocked' : 'ready', 'Statutory finance controls', controlEvidence(input), blockers, []);
}

function projectHumanGovernanceGate(input: PaymentProviderReadinessInput): PaymentProviderReadinessGate {
  const blockers = input.controls?.humanEscrowReleaseGate ? [] : ['Escrow and payout releases require a recorded human approval gate.'];
  return gate('human_governance', blockers.length > 0 ? 'blocked' : 'ready', 'Human approval for money movement', controlEvidence(input), blockers, []);
}

function controlEvidence(input: PaymentProviderReadinessInput): string[] {
  return Object.entries(input.controls ?? {})
    .filter(([, enabled]) => enabled === true)
    .map(([key]) => key)
    .sort();
}

function gate(domain: ProviderReadinessGateDomain, status: ProviderReadinessStatus, label: string, evidence: string[], blockers: string[], warnings: string[]): PaymentProviderReadinessGate {
  return { domain, status, label, evidence, blockers, warnings };
}

function combineStatuses(statuses: ProviderReadinessStatus[]): ProviderReadinessStatus {
  if (statuses.includes('blocked')) return 'blocked';
  if (statuses.includes('watch')) return 'watch';
  return 'ready';
}
