import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calculator,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  Lock,
  Percent,
  PenTool,
  ReceiptText,
  ShieldCheck,
  Stamp,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import type { FeeEstimatorInput, FeeEstimateResult } from '@/services/feeEstimatorService';
import { estimateArchitecturalFee } from '@/services/feeEstimatorService';
import { feeEstimateToProposalInput, estimateAndBuildProposal } from '@/services/feeProposalBridge';
import { buildProposal } from '@/services/proposalBuilderService';
import { createEscrowMilestonePlan } from '@/services/cashflowWorkflowAgent';
import { calculatePlatformTransactionFee, roundMoney } from '@/services/platformTransactionFeeService';
import {
  listAvailableTemplates,
  createTermsSnapshot,
  termsRequireApproval,
  calculateValidityExpiry,
  daysUntilExpiry,
  isProposalExpiredFn as isProposalExpired,
  type TermsTemplate,
} from '@/services/termsTemplateService';
import {
  createProposalStateMachine,
  type ProposalStateMachine,
  type StateChangeEntry,
} from '@/services/proposalStateMachine';
import {
  projectRecordsFromProposal,
  documentOutputFromProposal,
  workflowEventsFromProposal,
  recommendationsFromProposal,
  type ProjectRecord,
  type DocumentOutput,
  type WorkflowEvent,
  type AgentRecommendation,
} from '@/services/proposalIntegrationOutputs';
import type {
  ProposalBuilderResult,
  EscrowMilestonePlan,
  ProposalTermsSnapshot,
  ProposalPartyRole,
} from '@/types/proposalBuilder';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';

const currency = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
});

const currencyWithCents = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

interface ProposalBuilderPanelProps {
  feeInput: FeeEstimatorInput;
  issuingUserId: string;
  payerUserId: string;
  payeeUserId: string;
  payeeRole: 'architect';
  projectId?: string;
  jobId?: string;
  onProposalGenerated?: (proposal: ProposalBuilderResult) => void;
  onProposalIssued?: (proposal: ProposalBuilderResult) => void;
}

type BuilderStep = 'estimate' | 'discount' | 'platform_fee' | 'terms_template' | 'validity' | 'professional_confirmation' | 'preview' | 'milestones' | 'acceptance';

const STEP_LABELS: Record<BuilderStep, string> = {
  estimate: '1. Fee Estimate',
  discount: '2. Professional Discount',
  platform_fee: '3. Platform Fee',
  terms_template: '4. Terms & Conditions',
  validity: '5. Validity Period',
  professional_confirmation: '6. Professional Confirmation',
  preview: '7. Proposal Preview',
  milestones: '8. Escrow Milestones',
  acceptance: '9. Client Acceptance',
};

export default function ProposalBuilderPanel({
  feeInput,
  issuingUserId,
  payerUserId,
  payeeUserId,
  payeeRole,
  projectId,
  jobId,
  onProposalGenerated,
  onProposalIssued,
}: ProposalBuilderPanelProps) {
  const [expandedStep, setExpandedStep] = useState<BuilderStep>('estimate');
  const [discountPercentage, setDiscountPercentage] = useState(0);
  const [discountReason, setDiscountReason] = useState('');
  const [terms, setTerms] = useState<ProposalTermsSnapshot>({
    termsTemplateId: 'architex-standard-professional-services',
    termsTemplateVersion: '2026.1',
    paymentTerms: 'Paid through Architex escrow by agreed milestones.',
    validityPeriodDays: 14,
  });
  const [customTermsText, setCustomTermsText] = useState('');
  const [specialConditions, setSpecialConditions] = useState('');
  const [proposal, setProposal] = useState<ProposalBuilderResult | null>(null);

  // New: Terms template selection
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>(['architex-standard-professional-services']);
  const [availableTemplates, setAvailableTemplates] = useState<TermsTemplate[]>(() =>
    listAvailableTemplates('architect'),
  );

  // New: Validity period
  const [validityDays, setValidityDays] = useState(14);
  const [expiryDate, setExpiryDate] = useState<string | null>(null);

  // New: Professional confirmation
  const [professionalConfirmed, setProfessionalConfirmed] = useState(false);
  const [professionalConfirmationName, setProfessionalConfirmationName] = useState('');
  const [professionalConfirmationDate, setProfessionalConfirmationDate] = useState('');

  // New: State machine
  const [stateMachine, setStateMachine] = useState<ProposalStateMachine | null>(null);
  const [stateHistory, setStateHistory] = useState<StateChangeEntry[]>([]);

  // New: Integration outputs
  const [projectRecords, setProjectRecords] = useState<ProjectRecord[]>([]);
  const [documentOutput, setDocumentOutput] = useState<DocumentOutput | null>(null);
  const [workflowEvents, setWorkflowEvents] = useState<WorkflowEvent[]>([]);
  const [agentRecommendations, setAgentRecommendations] = useState<AgentRecommendation[]>([]);

  // New: Acceptance
  const [acceptanceStatus, setAcceptanceStatus] = useState<'pending' | 'accepted' | 'rejected' | null>(null);
  const [acceptanceNotes, setAcceptanceNotes] = useState('');

  const estimate = useMemo(() => estimateArchitecturalFee(feeInput), [feeInput]);

  const proposalWithDiscount = useMemo(() => {
    const input = feeEstimateToProposalInput({
      estimate,
      calculatorId: 'architect_sacap_fee',
      calculatorVersion: '0.1-draft',
      issuingUserId,
      payerUserId,
      payeeUserId,
      payeeRole,
      projectId,
      jobId,
      discountPercentage: discountPercentage > 0 ? discountPercentage : undefined,
      discountReason: discountReason || undefined,
      discountAppliedBy: issuingUserId,
    });
    return buildProposal(input);
  }, [estimate, discountPercentage, discountReason, issuingUserId, payerUserId, payeeUserId, payeeRole, projectId, jobId]);

  const milestonePlan = useMemo(
    () => (proposalWithDiscount ? createEscrowMilestonePlan(proposalWithDiscount) : []),
    [proposalWithDiscount],
  );

  const handleGenerateProposal = () => {
    const input = feeEstimateToProposalInput({
      estimate,
      calculatorId: 'architect_sacap_fee',
      calculatorVersion: '0.1-draft',
      issuingUserId,
      payerUserId,
      payeeUserId,
      payeeRole,
      projectId,
      jobId,
      discountPercentage: discountPercentage > 0 ? discountPercentage : undefined,
      discountReason: discountReason || undefined,
      discountAppliedBy: issuingUserId,
    });
    input.terms = {
      ...terms,
      customTermsText: customTermsText || undefined,
      specialConditions: specialConditions || undefined,
    };
    const result = buildProposal(input);
    setProposal(result);
    setExpandedStep('preview');

    // Initialize state machine
    const machine = createProposalStateMachine(result.idSeed);
    if (discountPercentage > 0 || result.discountAmount > 0) {
      machine.transition(
        'calculator_completed',
        { id: issuingUserId, role: payeeRole },
        'Fee calculated with discount applied.',
      );
    }
    if (terms.termsTemplateId) {
      machine.transition(
        'terms_attached',
        { id: issuingUserId, role: payeeRole },
        'Terms and conditions attached.',
      );
    }
    if (professionalConfirmed) {
      machine.transition(
        'professional_approved',
        { id: issuingUserId, role: payeeRole },
        'Professional responsibility confirmed.',
      );
    }
    setStateMachine(machine);
    setStateHistory([...machine.getHistory()]);

    // Generate integration outputs
    const context = {
      proposalId: result.idSeed,
      tenantId: 'tenant-demo',
      projectId: projectId || 'project-demo',
      professionalName: payeeUserId,
      professionalRole: payeeRole as ProposalPartyRole,
      clientName: payerUserId,
    };
    const records = projectRecordsFromProposal(result, context);
    setProjectRecords(records);

    const doc = documentOutputFromProposal(result, result.idSeed, context.projectId, context.professionalName);
    setDocumentOutput(doc);

    // Calculate expiry date
    const validityPeriodDays = terms.validityPeriodDays || 14;
    const expiry = calculateValidityExpiry(new Date().toISOString(), validityPeriodDays);
    setExpiryDate(expiry);

    const events = workflowEventsFromProposal(result, result.idSeed, context.projectId, context.professionalRole);
    setWorkflowEvents(events);

    const recs = recommendationsFromProposal(result, result.idSeed, context.projectId, events, context.professionalRole);
    setAgentRecommendations(recs);

    onProposalGenerated?.(result);
    toast.success('Proposal generated');
  };

  const handleIssueProposal = () => {
    if (!proposal) {
      toast.error('Generate a proposal first.');
      return;
    }
    if (!professionalConfirmed) {
      toast.error('Professional responsibility must be confirmed before issuing.');
      return;
    }
    // Transition state machine to 'issued'
    if (stateMachine) {
      if (stateMachine.currentState === 'professional_approved') {
        stateMachine.transition(
          'issued',
          { id: issuingUserId, role: payeeRole },
          'Proposal issued to client for acceptance.',
        );
        setStateHistory([...stateMachine.getHistory()]);
      } else if (stateMachine.currentState === 'terms_attached') {
        stateMachine.transition(
          'professional_approved',
          { id: issuingUserId, role: payeeRole },
          'Auto-approved on issue.',
        );
        stateMachine.transition(
          'issued',
          { id: issuingUserId, role: payeeRole },
          'Proposal issued to client for acceptance.',
        );
        setStateHistory([...stateMachine.getHistory()]);
      }
    }
    onProposalIssued?.(proposal);
    toast.success('Proposal issued to client');
  };

  const toggleStep = (step: BuilderStep) => {
    setExpandedStep((current) => (current === step ? 'estimate' : step));
  };

  const StepHeader = ({ step, complete }: { step: BuilderStep; complete: boolean }) => (
    <button
      type="button"
      onClick={() => toggleStep(step)}
      className={`w-full flex items-center justify-between gap-4 rounded-2xl border p-4 text-left transition-all ${
        expandedStep === step
          ? 'border-primary bg-primary/5 shadow-sm'
          : 'border-border bg-white hover:border-primary/30'
      }`}
    >
      <div className="flex items-center gap-3">
        {complete ? (
          <CheckCircle2 size={18} className="text-primary" />
        ) : (
          <div className="w-[18px] h-[18px] rounded-full border-2 border-muted-foreground/30" />
        )}
        <span className="font-bold text-sm">{STEP_LABELS[step]}</span>
      </div>
      {expandedStep === step ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
    </button>
  );

  return (
    <div className="space-y-6" data-testid="proposal-builder-panel">
      {/* Header */}
      <div className="rounded-[2rem] border border-border bg-white p-6 md:p-8 shadow-sm">
        <Badge variant="outline" className="uppercase text-[10px] tracking-widest mb-3">
          Proposal Builder
        </Badge>
        <h2 className="text-3xl md:text-4xl font-heading font-black tracking-tight flex items-center gap-3">
          <FileText className="text-primary" />
          Build Proposal from Fee Estimate
        </h2>
        <p className="text-sm text-muted-foreground mt-3 max-w-3xl">
          Convert your fee estimate into a professional proposal with discount options, terms
          attachment, and visible Architex platform-fee disclosure.
        </p>
      </div>

      {/* Stepper */}
      <div className="space-y-3">
        {/* Step 1: Fee Estimate Summary */}
        <StepHeader step="estimate" complete />
        {expandedStep === 'estimate' && (
          <Card className="border-border shadow-sm bg-white rounded-[2rem] overflow-hidden">
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <SummaryTile label="Professional Fee" value={estimate.professionalFee} />
                <SummaryTile label="Deliverables" value={estimate.deliverableTotal} />
                <SummaryTile label="Council Admin" value={estimate.councilAdminFee} />
              </div>
              <div className="rounded-2xl bg-primary/5 border border-primary/20 p-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold">Estimated total (excl. platform fee &amp; VAT)</span>
                  <span className="text-xl font-black text-primary">
                    {currency.format(estimate.subtotalExVat - estimate.platformFee)}
                  </span>
                </div>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>
                  <span className="font-bold">Value of works:</span>{' '}
                  {currency.format(estimate.valueOfWorks)}
                </p>
                <p>
                  <span className="font-bold">Fee percentage:</span>{' '}
                  {estimate.feePercentageOfWorks.toFixed(2)}% of value of works
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Professional Discount */}
        <StepHeader step="discount" complete={discountPercentage > 0} />
        {expandedStep === 'discount' && (
          <Card className="border-border shadow-sm bg-white rounded-[2rem] overflow-hidden">
            <CardContent className="p-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                Apply an optional commercial discount to the professional fee. The guideline
                calculation remains visible alongside the discounted amount.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Discount percentage (%)">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={discountPercentage}
                    onChange={(e) => setDiscountPercentage(Math.min(100, Math.max(0, Number(e.target.value))))}
                    className="h-12 rounded-xl"
                  />
                </Field>
                <Field label="Reason for discount">
                  <Input
                    value={discountReason}
                    onChange={(e) => setDiscountReason(e.target.value)}
                    placeholder="e.g. Introductory project discount"
                    className="h-12 rounded-xl"
                  />
                </Field>
              </div>
              {discountPercentage > 0 && (
                <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4">
                  <div className="flex justify-between text-sm">
                    <span>Fee before discount</span>
                    <span className="font-bold">{currency.format(proposalWithDiscount.feeBeforeDiscountExVat)}</span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span>Discount ({discountPercentage}%)</span>
                    <span className="font-bold text-amber-700">
                      −{currency.format(proposalWithDiscount.discountAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm font-bold mt-2 pt-2 border-t border-amber-300">
                    <span>Fee after discount</span>
                    <span>{currency.format(proposalWithDiscount.feeAfterDiscountExVat)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 3: Platform Fee Disclosure */}
        <StepHeader step="platform_fee" complete />
        {expandedStep === 'platform_fee' && (
          <Card className="border-border shadow-sm bg-white rounded-[2rem] overflow-hidden">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-start gap-3 rounded-2xl bg-primary/5 border border-primary/20 p-4">
                <ShieldCheck size={20} className="text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-bold">Architex Platform Transaction Fee</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {proposalWithDiscount.platformFee.disclosure}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-border p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
                    Client / Payer Side
                  </p>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Chargeable base</span>
                      <span className="font-bold">{currency.format(proposalWithDiscount.platformFee.chargeableBase)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Client platform fee ({proposalWithDiscount.platformFee.payerSharePercent.toFixed(2)}%)</span>
                      <span className="font-bold">{currencyWithCents.format(proposalWithDiscount.platformFee.payerPlatformFee)}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-border text-base">
                      <span className="font-bold">Client pays into escrow</span>
                      <span className="font-black text-primary">{currency.format(proposalWithDiscount.clientAmountPayableIntoEscrow)}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-border p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
                    Payee / Professional Side
                  </p>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Gross release</span>
                      <span className="font-bold">{currency.format(proposalWithDiscount.platformFee.payeeGrossRelease)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Payee platform fee ({proposalWithDiscount.platformFee.payeeSharePercent.toFixed(2)}%)</span>
                      <span className="font-bold text-amber-700">
                        −{currencyWithCents.format(proposalWithDiscount.platformFee.payeePlatformFee)}
                      </span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-border text-base">
                      <span className="font-bold">Net release to professional</span>
                      <span className="font-black text-primary">{currency.format(proposalWithDiscount.payeeNetReleaseAmount)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-green-50 border border-green-200 p-4 text-center">
                <p className="text-[10px] font-black uppercase tracking-widest text-green-700 mb-1">
                  Total Architex Platform Revenue
                </p>
                <p className="text-2xl font-black text-green-800">
                  {currencyWithCents.format(proposalWithDiscount.architexPlatformRevenue)}
                </p>
                <p className="text-xs text-green-600 mt-1">
                  1.00% total, shared equally between payer and payee
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Terms & Conditions — Template Selection */}
        <StepHeader step="terms_template" complete={selectedTemplateIds.length > 0} />
        {expandedStep === 'terms_template' && (
          <Card className="border-border shadow-sm bg-white rounded-[2rem] overflow-hidden">
            <CardContent className="p-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                Select the terms and conditions templates to apply. Standard templates plus
                profession-specific terms are available. Terms are locked into the proposal
                once issued.
              </p>
              <div className="space-y-2">
                {availableTemplates.map((tpl) => {
                  const selected = selectedTemplateIds.includes(tpl.templateId);
                  return (
                    <button
                      key={tpl.templateId}
                      type="button"
                      onClick={() => {
                        setSelectedTemplateIds((prev) =>
                          selected
                            ? prev.filter((id) => id !== tpl.templateId)
                            : [...prev, tpl.templateId],
                        );
                      }}
                      className={`w-full text-left rounded-2xl border p-4 transition-all ${
                        selected
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : 'border-border bg-white hover:border-primary/30'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            {selected ? (
                              <CheckCircle2 size={16} className="text-primary shrink-0" />
                            ) : (
                              <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30 shrink-0" />
                            )}
                            <span className="font-bold text-sm">{tpl.label}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 ml-7">{tpl.description}</p>
                          <div className="flex flex-wrap gap-1 mt-2 ml-7">
                            <Badge variant="outline" className="text-[9px]">
                              {tpl.scope.replace(/_/g, ' ')}
                            </Badge>
                            <Badge variant="outline" className="text-[9px]">
                              v{tpl.version}
                            </Badge>
                            {tpl.requiresProfessionalApproval && (
                              <Badge variant="outline" className="text-[9px] text-amber-600 border-amber-300">
                                approval required
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <Field label="Payment terms">
                  <Input
                    value={terms.paymentTerms || ''}
                    onChange={(e) => setTerms((t) => ({ ...t, paymentTerms: e.target.value }))}
                    placeholder="e.g. Paid through Architex escrow by agreed milestones."
                    className="h-12 rounded-xl"
                  />
                </Field>
                <Field label="Acceptance method">
                  <select
                    value={terms.acceptanceMethod || 'digital_acceptance'}
                    onChange={(e) =>
                      setTerms((t) => ({
                        ...t,
                        acceptanceMethod: e.target.value as ProposalTermsSnapshot['acceptanceMethod'],
                      }))
                    }
                    className="h-12 rounded-xl border border-border px-3 text-sm w-full"
                  >
                    <option value="digital_acceptance">Digital acceptance</option>
                    <option value="signature_upload">Signature upload</option>
                    <option value="manual_admin_capture">Manual admin capture</option>
                  </select>
                </Field>
              </div>
              <Field label="Custom terms">
                <textarea
                  value={customTermsText}
                  onChange={(e) => setCustomTermsText(e.target.value)}
                  placeholder="Add any custom terms or special conditions..."
                  rows={3}
                  className="w-full rounded-xl border border-border p-3 text-sm resize-y"
                />
              </Field>
              <Field label="Special conditions">
                <textarea
                  value={specialConditions}
                  onChange={(e) => setSpecialConditions(e.target.value)}
                  placeholder="Project-specific special conditions..."
                  rows={2}
                  className="w-full rounded-xl border border-border p-3 text-sm resize-y"
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Field label="Client responsibilities">
                  <textarea
                    value={(terms.clientResponsibilities || []).join('\n')}
                    onChange={(e) =>
                      setTerms((t) => ({
                        ...t,
                        clientResponsibilities: e.target.value.split('\n').filter(Boolean),
                      }))
                    }
                    placeholder="Client responsibilities (one per line)..."
                    rows={3}
                    className="w-full rounded-xl border border-border p-3 text-sm resize-y"
                  />
                </Field>
                <Field label="Exclusions">
                  <textarea
                    value={(terms.exclusions || []).join('\n')}
                    onChange={(e) =>
                      setTerms((t) => ({
                        ...t,
                        exclusions: e.target.value.split('\n').filter(Boolean),
                      }))
                    }
                    placeholder="Exclusions (one per line)..."
                    rows={3}
                    className="w-full rounded-xl border border-border p-3 text-sm resize-y"
                  />
                </Field>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 5: Validity Period */}
        <StepHeader step="validity" complete={!!expiryDate} />
        {expandedStep === 'validity' && (
          <Card className="border-border shadow-sm bg-white rounded-[2rem] overflow-hidden">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-start gap-3 rounded-2xl bg-blue-50 border border-blue-200 p-4">
                <Clock size={20} className="text-blue-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-blue-800">Proposal Validity</p>
                  <p className="text-xs text-blue-600 mt-1">
                    Set the validity period. The proposal will expire automatically and
                    notifications will be sent when approaching expiry.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Validity period (days)">
                  <Input
                    type="number"
                    min="1"
                    max="90"
                    value={validityDays}
                    onChange={(e) => {
                      const days = Math.min(90, Math.max(1, Number(e.target.value) || 14));
                      setValidityDays(days);
                      setTerms((t) => ({ ...t, validityPeriodDays: days }));
                      const expiry = calculateValidityExpiry(new Date().toISOString(), days);
                      setExpiryDate(expiry);
                    }}
                    className="h-12 rounded-xl"
                  />
                </Field>
                <Field label="Expiry date">
                  <div className="h-12 rounded-xl border border-border bg-secondary/20 flex items-center px-4">
                    <Calendar size={16} className="text-muted-foreground mr-2 shrink-0" />
                    <span className="text-sm font-bold">
                      {expiryDate
                        ? new Date(expiryDate).toLocaleDateString('en-ZA', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })
                        : 'Not set'}
                    </span>
                  </div>
                </Field>
              </div>
              {expiryDate && (
                <div className="rounded-2xl bg-secondary/20 border border-border p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
                    Expiry Notifications
                  </p>
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span>3 days before expiry — reminder notification</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-amber-500" />
                      <span>1 day before expiry — urgent notification</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-red-500" />
                      <span>After expiry — expired proposal notification, suggest revision</span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 6: Professional Responsibility Confirmation */}
        <StepHeader step="professional_confirmation" complete={professionalConfirmed} />
        {expandedStep === 'professional_confirmation' && (
          <Card className="border-border shadow-sm bg-white rounded-[2rem] overflow-hidden">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-start gap-3 rounded-2xl bg-amber-50 border border-amber-200 p-4">
                <AlertTriangle size={20} className="text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-amber-800">Professional Responsibility</p>
                  <p className="text-xs text-amber-600 mt-1">
                    As the registered professional, you are responsible for verifying that:
                    the fee estimate is reasonable, scope is accurately described, terms are
                    appropriate, and the proposal is suitable for issue. This confirmation is
                    recorded in the audit trail.
                  </p>
                </div>
              </div>
              <div className="rounded-2xl border border-border p-4 space-y-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={professionalConfirmed}
                    onChange={(e) => {
                      setProfessionalConfirmed(e.target.checked);
                      if (e.target.checked) {
                        setProfessionalConfirmationDate(new Date().toISOString());
                      }
                    }}
                    className="mt-1 h-4 w-4 rounded border-border text-primary"
                  />
                  <div>
                    <p className="text-sm font-bold">
                      I confirm that I have reviewed this proposal in full
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      I confirm that the fee calculation, scope of services, deliverables,
                      assumptions, exclusions, terms and conditions, and platform fee disclosure
                      are correct to the best of my professional knowledge. I understand that
                      this proposal will be issued as a formal professional document and that
                      issued proposals are version-locked.
                    </p>
                  </div>
                </label>
                {professionalConfirmed && (
                  <div className="ml-7 space-y-3">
                    <Field label="Professional name (as registered)">
                      <Input
                        value={professionalConfirmationName}
                        onChange={(e) => setProfessionalConfirmationName(e.target.value)}
                        placeholder="e.g. J. Smith PrArch"
                        className="h-12 rounded-xl"
                      />
                    </Field>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Stamp size={14} />
                      <span>
                        Confirmed at:{' '}
                        {new Date(professionalConfirmationDate).toLocaleString('en-ZA')}
                      </span>
                    </div>
                    <div className="rounded-2xl bg-green-50 border border-green-200 p-4">
                      <div className="flex items-center gap-2">
                        <ShieldCheck size={16} className="text-green-600" />
                        <div>
                          <p className="text-sm font-bold text-green-800">
                            Professional responsibility recorded
                          </p>
                          <p className="text-xs text-green-600">
                            This confirmation will be locked into the proposal audit trail.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 5: Preview (after generation) */}
        {proposal && (
          <>
            <StepHeader step="preview" complete />
            {expandedStep === 'preview' && (
              <Card className="border-primary/10 shadow-xl shadow-primary/5 bg-white rounded-[2rem] overflow-hidden">
                <CardHeader className="bg-gradient-to-br from-primary/10 to-transparent border-b border-border p-6">
                  <CardTitle className="text-sm font-bold uppercase tracking-widest flex items-center gap-2 text-primary">
                    <ReceiptText size={16} /> Proposal Preview
                  </CardTitle>
                  <CardDescription>
                    Review the complete proposal before issuing to the client.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  <div className="rounded-2xl bg-primary text-primary-foreground p-6">
                    <p className="text-xs uppercase tracking-widest font-bold opacity-80">Client Pays Into Escrow</p>
                    <p className="text-4xl font-heading font-black mt-2">
                      {currency.format(proposal.clientAmountPayableIntoEscrow)}
                    </p>
                    <p className="text-xs opacity-80 mt-2">
                      Net release to professional: {currency.format(proposal.payeeNetReleaseAmount)}
                    </p>
                  </div>

                  <div className="space-y-2">
                    {proposal.visibleLineItems.map((item) => (
                      <div key={item.id} className="flex justify-between rounded-xl border border-border p-3 text-sm">
                        <span>{item.description}</span>
                        <span className={`font-bold ${item.total < 0 ? 'text-amber-700' : ''}`}>
                          {currencyWithCents.format(item.total)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-2xl bg-secondary/20 border border-border p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
                      Audit Snapshot
                    </p>
                    <pre className="text-[11px] text-muted-foreground whitespace-pre-wrap font-mono">
                      {JSON.stringify(proposal.auditSnapshot, null, 2)}
                    </pre>
                  </div>

                  <Button
                    onClick={handleIssueProposal}
                    className="w-full h-14 rounded-2xl font-bold text-base gap-2"
                  >
                    <Users size={18} />
                    Issue Proposal to Client
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Step 8: Escrow Milestones */}
            <StepHeader step="milestones" complete={milestonePlan.length > 0} />
            {expandedStep === 'milestones' && (
              <Card className="border-border shadow-sm bg-white rounded-[2rem] overflow-hidden">
                <CardContent className="p-6 space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Escrow milestone breakdown. Each milestone shows the split platform fee and
                    release conditions.
                  </p>
                  <div className="space-y-3">
                    {milestonePlan.map((milestone) => (
                      <div
                        key={milestone.id}
                        className="rounded-2xl border border-border p-4 hover:bg-secondary/10 transition-colors"
                      >
                        <div className="flex justify-between items-start gap-4 mb-2">
                          <div>
                            <p className="font-bold text-sm">{milestone.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {milestone.percentage}% of chargeable base
                            </p>
                          </div>
                          <Badge variant="outline" className="text-[10px]">
                            {milestone.status}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                          <div>
                            <p className="text-muted-foreground">Chargeable</p>
                            <p className="font-bold">{currency.format(milestone.grossChargeableBase)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Client Fee</p>
                            <p className="font-bold">{currencyWithCents.format(milestone.payerPlatformFee)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Payee Fee</p>
                            <p className="font-bold">{currencyWithCents.format(milestone.payeePlatformFee)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Net Release</p>
                            <p className="font-bold text-primary">{currency.format(milestone.payeeNetRelease)}</p>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {milestone.releaseConditions.map((condition) => (
                            <span
                              key={condition}
                              className="inline-block text-[10px] bg-secondary/30 rounded-full px-2 py-0.5"
                            >
                              {condition}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 9: Client Acceptance */}
            <StepHeader step="acceptance" complete={!!acceptanceStatus} />
            {expandedStep === 'acceptance' && (
              <Card className="border-border shadow-sm bg-white rounded-[2rem] overflow-hidden">
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-start gap-3 rounded-2xl bg-purple-50 border border-purple-200 p-4">
                    <PenTool size={20} className="text-purple-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-purple-800">Digital Acceptance Workflow</p>
                      <p className="text-xs text-purple-600 mt-1">
                        The client can accept or reject the proposal digitally. Acceptance
                        is recorded in the audit trail and can trigger appointment conversion.
                      </p>
                    </div>
                  </div>

                  {!acceptanceStatus ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Button
                        onClick={() => {
                          setAcceptanceStatus('accepted');
                          if (stateMachine) {
                            stateMachine.transition(
                              'accepted',
                              { id: payerUserId, role: 'client' },
                              acceptanceNotes || 'Client accepted the proposal.',
                            );
                            setStateHistory([...stateMachine.getHistory()]);
                          }
                          toast.success('Proposal accepted by client');
                        }}
                        className="h-14 rounded-2xl font-bold text-base gap-2 bg-green-600 hover:bg-green-700"
                      >
                        <CheckCircle2 size={18} />
                        Accept Proposal
                      </Button>
                      <Button
                        onClick={() => {
                          setAcceptanceStatus('rejected');
                          if (stateMachine) {
                            stateMachine.transition(
                              'rejected',
                              { id: payerUserId, role: 'client' },
                              acceptanceNotes || 'Client declined the proposal.',
                            );
                            setStateHistory([...stateMachine.getHistory()]);
                          }
                          toast.error('Proposal rejected');
                        }}
                        variant="outline"
                        className="h-14 rounded-2xl font-bold text-base gap-2 border-red-300 text-red-700 hover:bg-red-50"
                      >
                        Decline Proposal
                      </Button>
                    </div>
                  ) : (
                    <div
                      className={`rounded-2xl p-6 text-center ${
                        acceptanceStatus === 'accepted'
                          ? 'bg-green-50 border border-green-200'
                          : 'bg-red-50 border border-red-200'
                      }`}
                    >
                      <p
                        className={`text-2xl font-black ${
                          acceptanceStatus === 'accepted' ? 'text-green-700' : 'text-red-700'
                        }`}
                      >
                        {acceptanceStatus === 'accepted' ? '✓ Proposal Accepted' : '✗ Proposal Rejected'}
                      </p>
                      <p className="text-sm text-muted-foreground mt-2">
                        {acceptanceStatus === 'accepted'
                          ? 'The proposal has been accepted. You can now convert it to a professional appointment.'
                          : 'The proposal has been rejected. You may issue a revised proposal.'}
                      </p>
                      {acceptanceStatus === 'accepted' && (
                        <Button
                          onClick={() => {
                            if (stateMachine) {
                              stateMachine.transition(
                                'converted_to_appointment',
                                { id: issuingUserId, role: payeeRole },
                                'Converted to professional appointment.',
                              );
                              setStateHistory([...stateMachine.getHistory()]);
                            }
                            toast.success('Converted to professional appointment');
                          }}
                          className="mt-4 h-12 rounded-2xl font-bold gap-2"
                        >
                          <Stamp size={16} />
                          Convert to Appointment
                        </Button>
                      )}
                    </div>
                  )}

                  <Field label="Acceptance notes">
                    <textarea
                      value={acceptanceNotes}
                      onChange={(e) => setAcceptanceNotes(e.target.value)}
                      placeholder="Optional notes regarding acceptance or rejection..."
                      rows={2}
                      className="w-full rounded-xl border border-border p-3 text-sm resize-y"
                    />
                  </Field>
                </CardContent>
              </Card>
            )}

            {/* State Machine Status */}
            <StepHeader step="preview" complete />
            {expandedStep === 'preview' && (
              <div className="space-y-4">
                {/* Proposal State Machine */}
                {stateMachine && (
                  <Card className="border-border shadow-sm bg-white rounded-[2rem] overflow-hidden">
                    <CardContent className="p-6 space-y-4">
                      <div className="flex items-center gap-2">
                        <Lock size={16} className="text-primary" />
                        <span className="text-sm font-bold uppercase tracking-widest">
                          Proposal State — {stateMachine.currentState.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {[
                          'draft',
                          'calculator_completed',
                          'terms_attached',
                          'professional_approved',
                          'issued',
                          'accepted',
                          'rejected',
                          'withdrawn',
                          'converted_to_appointment',
                        ].map((state) => {
                          const isCurrent = stateMachine.currentState === state;
                          const isPast = stateHistory.some((e) => e.to === state);
                          return (
                            <Badge
                              key={state}
                              variant={isCurrent ? 'default' : isPast ? 'outline' : 'secondary'}
                              className={`text-[10px] ${isCurrent ? 'bg-primary text-primary-foreground' : ''}`}
                            >
                              {state.replace(/_/g, ' ')}
                            </Badge>
                          );
                        })}
                      </div>
                      <div className="rounded-2xl bg-secondary/20 border border-border p-4">
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
                          Audit Trail
                        </p>
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {stateHistory.map((entry) => (
                            <div key={entry.id} className="text-xs border-b border-border pb-1">
                              <span className="font-bold">{entry.from}</span> →{' '}
                              <span className="font-bold">{entry.to}</span>{' '}
                              <span className="text-muted-foreground">
                                by {entry.actorRole} ({new Date(entry.timestamp).toLocaleString('en-ZA')})
                              </span>
                              {entry.reason && (
                                <p className="text-muted-foreground italic mt-0.5">{entry.reason}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Integration Outputs */}
                {projectRecords.length > 0 && (
                  <Card className="border-border shadow-sm bg-white rounded-[2rem] overflow-hidden">
                    <CardContent className="p-6 space-y-4">
                      <p className="text-sm font-bold uppercase tracking-widest">
                        Project Records ({projectRecords.length})
                      </p>
                      <div className="space-y-2">
                        {projectRecords.map((record) => (
                          <div
                            key={record.id}
                            className="rounded-xl border border-border p-3 flex justify-between items-center"
                          >
                            <div>
                              <p className="text-xs font-bold">{record.title}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {record.recordType.replace(/_/g, ' ')} · {record.status}
                              </p>
                            </div>
                            <Badge variant="outline" className="text-[9px]">
                              {record.approvals.required ? 'needs approval' : 'auto'}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {documentOutput && (
                  <Card className="border-border shadow-sm bg-white rounded-[2rem] overflow-hidden">
                    <CardContent className="p-6 space-y-4">
                      <p className="text-sm font-bold uppercase tracking-widest">
                        Document Output
                      </p>
                      <div className="rounded-xl border border-border p-3">
                        <div className="flex items-center gap-3">
                          <FileText size={16} className="text-primary" />
                          <div>
                            <p className="text-xs font-bold">{documentOutput.title}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {documentOutput.documentType} · {documentOutput.revision} ·{' '}
                              {documentOutput.status}
                            </p>
                          </div>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-2 italic">
                          {documentOutput.placeholderNote}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {workflowEvents.length > 0 && (
                  <Card className="border-border shadow-sm bg-white rounded-[2rem] overflow-hidden">
                    <CardContent className="p-6 space-y-4">
                      <p className="text-sm font-bold uppercase tracking-widest">
                        Inbox Events ({workflowEvents.length})
                      </p>
                      <div className="space-y-2">
                        {workflowEvents.map((evt) => (
                          <div
                            key={evt.id}
                            className="rounded-xl border border-border p-3"
                          >
                            <div className="flex items-center gap-2">
                              <Badge
                                variant="outline"
                                className={`text-[9px] ${
                                  evt.priority === 'critical'
                                    ? 'bg-red-50 text-red-700 border-red-300'
                                    : evt.priority === 'high'
                                      ? 'bg-amber-50 text-amber-700 border-amber-300'
                                      : ''
                                }`}
                              >
                                {evt.priority}
                              </Badge>
                              <p className="text-xs font-bold">{evt.title}</p>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-1">{evt.detail}</p>
                            <div className="flex flex-wrap gap-1 mt-2">
                              {evt.assignedRoles.map((role) => (
                                <Badge key={role} variant="secondary" className="text-[9px]">
                                  {role}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {agentRecommendations.length > 0 && (
                  <Card className="border-border shadow-sm bg-white rounded-[2rem] overflow-hidden">
                    <CardContent className="p-6 space-y-4">
                      <p className="text-sm font-bold uppercase tracking-widest">
                        Agent Recommendations ({agentRecommendations.length})
                      </p>
                      <div className="space-y-2">
                        {agentRecommendations.map((rec) => (
                          <div
                            key={rec.id}
                            className="rounded-xl border border-border p-3"
                          >
                            <div className="flex items-center gap-2">
                              <Badge
                                variant="outline"
                                className={`text-[9px] ${
                                  rec.priority === 'high' || rec.priority === 'critical'
                                    ? 'bg-primary/10 text-primary border-primary/30'
                                    : ''
                                }`}
                              >
                                {rec.priority}
                              </Badge>
                              <p className="text-xs font-bold">{rec.title}</p>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-1">{rec.rationale}</p>
                            <div className="flex items-center gap-2 mt-2">
                              <Badge variant="secondary" className="text-[9px]">
                                {rec.requiresHumanApproval ? 'needs approval' : 'auto'}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">
                                {rec.recommendedActionLabel}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Issue button */}
                <Button
                  onClick={handleIssueProposal}
                  className="w-full h-14 rounded-2xl font-bold text-base gap-2"
                  disabled={!professionalConfirmed}
                >
                  <Users size={18} />
                  {professionalConfirmed
                    ? 'Issue Proposal to Client'
                    : 'Confirm Professional Responsibility First'}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Generate button (before proposal is generated) */}
      {!proposal && (
        <Button
          onClick={handleGenerateProposal}
          className="w-full h-14 rounded-2xl font-bold text-base gap-2"
          size="lg"
        >
          <Calculator size={18} />
          Generate Proposal with Platform Fee Disclosure
        </Button>
      )}
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border p-4 text-center">
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="text-xl font-black mt-1">{currency.format(value)}</p>
    </div>
  );
}

function Field({ label, children }: React.PropsWithChildren<{ label: string }>) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}
