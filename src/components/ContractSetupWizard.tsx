/**
 * Contract Setup Wizard
 *
 * Multi-step wizard for configuring a new contract on a project.
 * Steps: Select Form → Configure Parties → Set Dates & Sum →
 *        Form-Specific Params → Clause Elections → Review & Confirm
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.10, 11.1, 11.5
 */

import React, { useState, useMemo, useCallback } from 'react';
import type { UserProfile } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  ChevronLeft,
  ChevronRight,
  Check,
  AlertCircle,
  Plus,
  Trash2,
  Loader2,
} from 'lucide-react';
import {
  validateContractSetup,
  getDisclaimerBannerText,
} from '@/services/contractAdmin/client';
import { apiFetch } from '@/lib/apiClient';
import type {
  ContractForm,
  ContractParty,
  ClauseElection,
  ContractSetupInput,
  ContractProjectAssignment,
  JbccParams,
  NecParams,
  GccParams,
  FidicParams,
  ValidationFieldError,
} from '@/services/contractAdmin/client';

// TODO: wire to real API endpoint
async function setupContractViaApi(input: ContractSetupInput) {
  const res = await apiFetch('/api/contract-admin/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Contract setup failed: ${res.statusText}`);
  return res.json();
}

// ══════════════════════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════════════════════

interface ContractSetupWizardProps {
  user: UserProfile;
  projectId: string;
}

type WizardStep = 'form' | 'parties' | 'dates' | 'params' | 'clauses' | 'review';

const STEPS: { id: WizardStep; label: string }[] = [
  { id: 'form', label: 'Select Form' },
  { id: 'parties', label: 'Configure Parties' },
  { id: 'dates', label: 'Dates & Sum' },
  { id: 'params', label: 'Form Parameters' },
  { id: 'clauses', label: 'Clause Elections' },
  { id: 'review', label: 'Review & Confirm' },
];

const CONTRACT_FORMS: { value: ContractForm; label: string; description: string }[] = [
  { value: 'jbcc_pba', label: 'JBCC PBA', description: 'Joint Building Contracts Committee — Principal Building Agreement' },
  { value: 'nec_ecc', label: 'NEC ECC', description: 'New Engineering Contract — Engineering and Construction Contract' },
  { value: 'gcc_2025', label: 'GCC 2025', description: 'General Conditions of Contract 2025 — Civil Engineering Works' },
  { value: 'fidic', label: 'FIDIC', description: 'International Federation of Consulting Engineers — Standard Form' },
];

const DEFAULT_JBCC_PARAMS: JbccParams = {
  interimPaymentPeriodDays: 30,
  penaltyRatePerDay: 0.01,
  retentionPercentage: 5.0,
  defectsLiabilityMonths: 6,
};

const DEFAULT_NEC_PARAMS: NecParams = {
  earlyWarningWeeks: 4,
  compensationEventNotificationWeeks: 8,
  programmeSubmissionIntervalWeeks: 4,
};

const DEFAULT_GCC_PARAMS: GccParams = {
  advanceWarningWorkingDays: 10,
  penaltyRatePerDay: 0.01,
  firstStageClaimWorkingDays: 28,
  secondStageClaimWorkingDays: 28,
  deemedRejectionWorkingDays: 28,
};

const DEFAULT_FIDIC_PARAMS: FidicParams = {
  timeForCompletionDays: 365,
  defectsNotificationDays: 365,
  dabComposition: 1,
};

function getDefaultParams(form: ContractForm) {
  switch (form) {
    case 'jbcc_pba': return { ...DEFAULT_JBCC_PARAMS };
    case 'nec_ecc': return { ...DEFAULT_NEC_PARAMS };
    case 'gcc_2025': return { ...DEFAULT_GCC_PARAMS };
    case 'fidic': return { ...DEFAULT_FIDIC_PARAMS };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Main Component
// ══════════════════════════════════════════════════════════════════════════════

export function ContractSetupWizard({ user, projectId }: ContractSetupWizardProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>('form');
  const [contractForm, setContractForm] = useState<ContractForm | null>(null);
  const [parties, setParties] = useState<ContractParty[]>([
    { id: '1', name: '', role: 'employer' },
    { id: '2', name: '', role: 'contractor' },
  ]);
  const [commencementDate, setCommencementDate] = useState('');
  const [practicalCompletionDate, setPracticalCompletionDate] = useState('');
  const [contractSum, setContractSum] = useState<string>('');
  const [formParams, setFormParams] = useState<Record<string, number>>(
    DEFAULT_JBCC_PARAMS as unknown as Record<string, number>
  );
  const [clauseElections, setClauseElections] = useState<ClauseElection[]>([]);
  const [errors, setErrors] = useState<ValidationFieldError[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<'success' | 'failure' | null>(null);
  const [disclaimerVisible] = useState(true);

  const currentStepIndex = STEPS.findIndex((s) => s.id === currentStep);

  const getFieldError = useCallback((field: string) => {
    return errors.find((e) => e.field === field)?.message;
  }, [errors]);

  const handleFormSelect = useCallback((form: ContractForm) => {
    setContractForm(form);
    setFormParams(getDefaultParams(form) as unknown as Record<string, number>);
    setErrors([]);
  }, []);

  const handleNext = useCallback(() => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex].id);
      setErrors([]);
    }
  }, [currentStepIndex]);

  const handleBack = useCallback(() => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex].id);
      setErrors([]);
    }
  }, [currentStepIndex]);

  const canProceed = useMemo(() => {
    switch (currentStep) {
      case 'form': return contractForm !== null;
      case 'parties': return parties.length >= 2 && parties.every((p) => p.name.trim().length > 0);
      case 'dates': return commencementDate !== '' && practicalCompletionDate !== '' && contractSum !== '';
      case 'params': return true;
      case 'clauses': return true;
      case 'review': return true;
      default: return false;
    }
  }, [currentStep, contractForm, parties, commencementDate, practicalCompletionDate, contractSum]);

  // Build project assignment for RBAC
  const projectAssignment: ContractProjectAssignment = useMemo(() => ({
    projectId,
    userId: user.uid,
    roles: [user.role],
    isAssignedTeamMember: ['architect', 'bep', 'quantity_surveyor', 'engineer'].includes(user.role),
    isAssignedContractor: user.role === 'contractor',
    isAssignedSubcontractor: user.role === 'subcontractor',
    isProjectOwner: ['client', 'developer'].includes(user.role),
    isAssignedSiteManager: user.role === 'site_manager',
  }), [user, projectId]);

  const handleSubmit = useCallback(async () => {
    if (!contractForm) return;

    const input: ContractSetupInput = {
      projectId,
      contractForm,
      parties,
      commencementDate,
      practicalCompletionDate,
      contractSum: parseFloat(contractSum) || 0,
      clauseElections,
      formSpecificParams: formParams as unknown as ContractSetupInput['formSpecificParams'],
      setupBy: user.uid,
    };

    // Validate before submitting
    const validation = validateContractSetup(input);
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    setSubmitting(true);
    setErrors([]);
    try {
      await setupContractViaApi(input);
      setSubmitResult('success');
    } catch {
      setSubmitResult('failure');
    } finally {
      setSubmitting(false);
    }
  }, [contractForm, projectId, parties, commencementDate, practicalCompletionDate, contractSum, clauseElections, formParams, user.uid, projectAssignment]);

  // Block interaction if disclaimer not visible (Req 11.5)
  if (!disclaimerVisible) {
    return (
      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
        <CardContent className="py-12 text-center">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-3" />
          <p className="text-surface-300">Unable to display contract setup — disclaimer rendering failed.</p>
        </CardContent>
      </Card>
    );
  }

  // Success / Failure screens
  if (submitResult === 'success') {
    return (
      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
        <CardContent className="py-12 text-center">
          <div className="w-12 h-12 rounded-full bg-green-500/20 border border-green-500/50 flex items-center justify-center mx-auto mb-4">
            <Check className="w-6 h-6 text-green-400" />
          </div>
          <h3 className="text-lg font-semibold text-white">Contract Setup Complete</h3>
          <p className="text-sm text-surface-400 mt-2">
            The contract has been configured and saved. Audit record created.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (submitResult === 'failure') {
    return (
      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
        <CardContent className="py-12 text-center">
          <div className="w-12 h-12 rounded-full bg-red-500/20 border border-red-500/50 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6 text-red-400" />
          </div>
          <h3 className="text-lg font-semibold text-white">Setup Failed</h3>
          <p className="text-sm text-surface-400 mt-2">
            An error occurred while saving the contract configuration. Please try again.
          </p>
          <Button
            onClick={() => setSubmitResult(null)}
            className="mt-4"
            variant="outline"
          >
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-white">Contract Setup Wizard</CardTitle>
          <Badge variant="outline" className="text-surface-400 border-surface-600">
            Step {currentStepIndex + 1} of {STEPS.length}
          </Badge>
        </div>
        {/* Step indicator */}
        <div className="flex items-center gap-1 mt-3">
          {STEPS.map((step, idx) => (
            <div
              key={step.id}
              className={`h-1 flex-1 rounded-full transition-colors ${
                idx <= currentStepIndex ? 'bg-primary-500' : 'bg-surface-700'
              }`}
            />
          ))}
        </div>
        <p className="text-sm text-surface-400 mt-2">{STEPS[currentStepIndex].label}</p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Step content */}
        {currentStep === 'form' && (
          <FormSelectionStep
            selectedForm={contractForm}
            onSelect={handleFormSelect}
          />
        )}
        {currentStep === 'parties' && (
          <PartiesStep
            parties={parties}
            setParties={setParties}
            getFieldError={getFieldError}
          />
        )}
        {currentStep === 'dates' && (
          <DatesStep
            commencementDate={commencementDate}
            practicalCompletionDate={practicalCompletionDate}
            contractSum={contractSum}
            setCommencementDate={setCommencementDate}
            setPracticalCompletionDate={setPracticalCompletionDate}
            setContractSum={setContractSum}
            getFieldError={getFieldError}
          />
        )}
        {currentStep === 'params' && contractForm && (
          <FormParamsStep
            contractForm={contractForm}
            params={formParams}
            setParams={setFormParams}
            getFieldError={getFieldError}
          />
        )}
        {currentStep === 'clauses' && (
          <ClauseElectionsStep
            clauseElections={clauseElections}
            setClauseElections={setClauseElections}
          />
        )}
        {currentStep === 'review' && (
          <ReviewStep
            contractForm={contractForm}
            parties={parties}
            commencementDate={commencementDate}
            practicalCompletionDate={practicalCompletionDate}
            contractSum={contractSum}
            formParams={formParams}
            clauseElections={clauseElections}
          />
        )}

        {/* Validation errors */}
        {errors.length > 0 && (
          <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-3 space-y-1">
            {errors.map((err, i) => (
              <p key={i} className="text-xs text-red-300 flex items-center gap-2">
                <AlertCircle className="w-3 h-3 flex-shrink-0" />
                <span><strong>{err.field}:</strong> {err.message}</span>
              </p>
            ))}
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex items-center justify-between pt-4 border-t border-surface-700/50">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStepIndex === 0}
            className="flex items-center gap-2"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </Button>

          {currentStep === 'review' ? (
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700"
            >
              {submitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</>
              ) : (
                <><Check className="w-4 h-4" /> Confirm & Save</>
              )}
            </Button>
          ) : (
            <Button
              onClick={handleNext}
              disabled={!canProceed}
              className="flex items-center gap-2"
            >
              Next <ChevronRight className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Step Components
// ══════════════════════════════════════════════════════════════════════════════

function FormSelectionStep({
  selectedForm,
  onSelect,
}: {
  selectedForm: ContractForm | null;
  onSelect: (form: ContractForm) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-surface-300">
        Select the standard contract form for this project:
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {CONTRACT_FORMS.map((form) => (
          <button
            key={form.value}
            onClick={() => onSelect(form.value)}
            className={`text-left p-4 rounded-lg border transition-colors ${
              selectedForm === form.value
                ? 'border-primary-500 bg-primary-600/10'
                : 'border-surface-700/50 bg-surface-900/50 hover:border-surface-600'
            }`}
          >
            <p className="font-medium text-white">{form.label}</p>
            <p className="text-xs text-surface-400 mt-1">{form.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function PartiesStep({
  parties,
  setParties,
  getFieldError,
}: {
  parties: ContractParty[];
  setParties: React.Dispatch<React.SetStateAction<ContractParty[]>>;
  getFieldError: (field: string) => string | undefined;
}) {
  const addParty = () => {
    setParties((prev) => [
      ...prev,
      { id: String(Date.now()), name: '', role: '' },
    ]);
  };

  const removeParty = (id: string) => {
    setParties((prev) => prev.filter((p) => p.id !== id));
  };

  const updateParty = (id: string, field: keyof ContractParty, value: string) => {
    setParties((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-surface-300">
        Configure contracting parties (minimum 2: employer and contractor):
      </p>
      {parties.map((party, idx) => {
        const nameError = getFieldError(`parties[${idx}].name`);
        return (
          <div key={party.id} className="flex items-center gap-3">
            <div className="flex-1 space-y-1">
              <Input
                value={party.name}
                onChange={(e) => updateParty(party.id, 'name', e.target.value)}
                placeholder="Party name"
                className={`bg-surface-900/50 border-surface-700 ${nameError ? 'border-red-500' : ''}`}
              />
              {nameError && <p className="text-xs text-red-400">{nameError}</p>}
            </div>
            <Input
              value={party.role}
              onChange={(e) => updateParty(party.id, 'role', e.target.value)}
              placeholder="Role (e.g. employer)"
              className="w-40 bg-surface-900/50 border-surface-700"
            />
            <Input
              value={party.contactEmail || ''}
              onChange={(e) => updateParty(party.id, 'contactEmail', e.target.value)}
              placeholder="Email (optional)"
              className="w-48 bg-surface-900/50 border-surface-700"
            />
            {parties.length > 2 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeParty(party.id)}
                className="text-red-400 hover:text-red-300"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        );
      })}
      <Button variant="outline" size="sm" onClick={addParty} className="flex items-center gap-2">
        <Plus className="w-4 h-4" /> Add Party
      </Button>
    </div>
  );
}

function DatesStep({
  commencementDate,
  practicalCompletionDate,
  contractSum,
  setCommencementDate,
  setPracticalCompletionDate,
  setContractSum,
  getFieldError,
}: {
  commencementDate: string;
  practicalCompletionDate: string;
  contractSum: string;
  setCommencementDate: (v: string) => void;
  setPracticalCompletionDate: (v: string) => void;
  setContractSum: (v: string) => void;
  getFieldError: (field: string) => string | undefined;
}) {
  const dateError = getFieldError('commencementDate');
  const completionError = getFieldError('practicalCompletionDate');
  const sumError = getFieldError('contractSum');

  return (
    <div className="space-y-4">
      <p className="text-sm text-surface-300">Set contract dates and sum:</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-xs text-surface-400 uppercase tracking-wider">
            Commencement Date
          </label>
          <Input
            type="date"
            value={commencementDate}
            onChange={(e) => setCommencementDate(e.target.value)}
            className={`bg-surface-900/50 border-surface-700 ${dateError ? 'border-red-500' : ''}`}
          />
          {dateError && <p className="text-xs text-red-400">{dateError}</p>}
        </div>
        <div className="space-y-1">
          <label className="text-xs text-surface-400 uppercase tracking-wider">
            Practical Completion Date
          </label>
          <Input
            type="date"
            value={practicalCompletionDate}
            onChange={(e) => setPracticalCompletionDate(e.target.value)}
            className={`bg-surface-900/50 border-surface-700 ${completionError ? 'border-red-500' : ''}`}
          />
          {completionError && <p className="text-xs text-red-400">{completionError}</p>}
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-xs text-surface-400 uppercase tracking-wider">
          Contract Sum (ZAR)
        </label>
        <Input
          type="number"
          min="1"
          step="0.01"
          value={contractSum}
          onChange={(e) => setContractSum(e.target.value)}
          placeholder="e.g. 15000000.00"
          className={`bg-surface-900/50 border-surface-700 ${sumError ? 'border-red-500' : ''}`}
        />
        {sumError && <p className="text-xs text-red-400">{sumError}</p>}
      </div>
    </div>
  );
}

function FormParamsStep({
  contractForm,
  params,
  setParams,
  getFieldError,
}: {
  contractForm: ContractForm;
  params: Record<string, number>;
  setParams: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  getFieldError: (field: string) => string | undefined;
}) {
  const updateParam = (key: string, value: string) => {
    setParams((prev) => ({ ...prev, [key]: parseFloat(value) || 0 }));
  };

  const fields = getFormParamFields(contractForm);

  return (
    <div className="space-y-4">
      <p className="text-sm text-surface-300">
        Configure {contractForm.replace(/_/g, ' ').toUpperCase()} specific parameters:
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {fields.map((field) => {
          const error = getFieldError(`formSpecificParams.${field.key}`);
          return (
            <div key={field.key} className="space-y-1">
              <label className="text-xs text-surface-400 uppercase tracking-wider">
                {field.label}
              </label>
              <Input
                type="number"
                min={field.min}
                max={field.max}
                step={field.step || 1}
                value={params[field.key] ?? ''}
                onChange={(e) => updateParam(field.key, e.target.value)}
                className={`bg-surface-900/50 border-surface-700 ${error ? 'border-red-500' : ''}`}
              />
              <p className="text-xs text-surface-500">{field.hint}</p>
              {error && <p className="text-xs text-red-400">{error}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface ParamFieldDef {
  key: string;
  label: string;
  hint: string;
  min?: number;
  max?: number;
  step?: number;
}

function getFormParamFields(form: ContractForm): ParamFieldDef[] {
  switch (form) {
    case 'jbcc_pba':
      return [
        { key: 'interimPaymentPeriodDays', label: 'Interim Payment Period (days)', hint: 'Calendar days, default 30', min: 1, max: 365 },
        { key: 'penaltyRatePerDay', label: 'Penalty Rate per Day (ZAR)', hint: 'Minimum R0.01', min: 0.01, step: 0.01 },
        { key: 'retentionPercentage', label: 'Retention Percentage (%)', hint: 'Range 0.00–10.00', min: 0, max: 10, step: 0.01 },
        { key: 'defectsLiabilityMonths', label: 'Defects Liability Period (months)', hint: 'Range 3–24', min: 3, max: 24 },
      ];
    case 'nec_ecc':
      return [
        { key: 'earlyWarningWeeks', label: 'Early Warning Period (weeks)', hint: 'Range 1–12', min: 1, max: 12 },
        { key: 'compensationEventNotificationWeeks', label: 'CE Notification Period (weeks)', hint: 'Range 1–12', min: 1, max: 12 },
        { key: 'programmeSubmissionIntervalWeeks', label: 'Programme Submission Interval (weeks)', hint: 'Range 1–8', min: 1, max: 8 },
      ];
    case 'gcc_2025':
      return [
        { key: 'advanceWarningWorkingDays', label: 'Advance Warning (working days)', hint: 'Range 1–60', min: 1, max: 60 },
        { key: 'penaltyRatePerDay', label: 'Penalty Rate per Day (ZAR)', hint: 'Minimum R0.01', min: 0.01, step: 0.01 },
        { key: 'firstStageClaimWorkingDays', label: 'First Stage Claim (working days)', hint: 'Range 5–60', min: 5, max: 60 },
        { key: 'secondStageClaimWorkingDays', label: 'Second Stage Claim (working days)', hint: 'Range 5–60', min: 5, max: 60 },
        { key: 'deemedRejectionWorkingDays', label: 'Deemed Rejection (working days)', hint: 'Range 5–60', min: 5, max: 60 },
      ];
    case 'fidic':
      return [
        { key: 'timeForCompletionDays', label: 'Time for Completion (days)', hint: 'Calendar days, range 1–3650', min: 1, max: 3650 },
        { key: 'defectsNotificationDays', label: 'Defects Notification Period (days)', hint: 'Calendar days, range 365–1095', min: 365, max: 1095 },
        { key: 'dabComposition', label: 'DAB Composition (members)', hint: '1 or 3 members', min: 1, max: 3, step: 2 },
      ];
  }
}

function ClauseElectionsStep({
  clauseElections,
  setClauseElections,
}: {
  clauseElections: ClauseElection[];
  setClauseElections: React.Dispatch<React.SetStateAction<ClauseElection[]>>;
}) {
  const addClause = () => {
    setClauseElections((prev) => [
      ...prev,
      { clauseNumber: '', clauseTitle: '', elected: true },
    ]);
  };

  const removeClause = (idx: number) => {
    setClauseElections((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateClause = (idx: number, field: keyof ClauseElection, value: unknown) => {
    setClauseElections((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, [field]: value } : c))
    );
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-surface-300">
        Elect optional clauses (referenced by number and title only):
      </p>
      {clauseElections.length === 0 && (
        <p className="text-xs text-surface-500 italic">
          No clause elections added. Click below to add optional clause elections.
        </p>
      )}
      {clauseElections.map((clause, idx) => (
        <div key={idx} className="flex items-center gap-3">
          <Input
            value={clause.clauseNumber}
            onChange={(e) => updateClause(idx, 'clauseNumber', e.target.value)}
            placeholder="Clause #"
            className="w-24 bg-surface-900/50 border-surface-700"
          />
          <Input
            value={clause.clauseTitle}
            onChange={(e) => updateClause(idx, 'clauseTitle', e.target.value)}
            placeholder="Clause title"
            className="flex-1 bg-surface-900/50 border-surface-700"
          />
          <button
            onClick={() => updateClause(idx, 'elected', !clause.elected)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              clause.elected
                ? 'bg-green-600/20 text-green-300 border border-green-600/50'
                : 'bg-surface-700/50 text-surface-400 border border-surface-600'
            }`}
          >
            {clause.elected ? 'Elected' : 'Not Elected'}
          </button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => removeClause(idx)}
            className="text-red-400 hover:text-red-300"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addClause} className="flex items-center gap-2">
        <Plus className="w-4 h-4" /> Add Clause Election
      </Button>
    </div>
  );
}

function ReviewStep({
  contractForm,
  parties,
  commencementDate,
  practicalCompletionDate,
  contractSum,
  formParams,
  clauseElections,
}: {
  contractForm: ContractForm | null;
  parties: ContractParty[];
  commencementDate: string;
  practicalCompletionDate: string;
  contractSum: string;
  formParams: Record<string, number>;
  clauseElections: ClauseElection[];
}) {
  const formLabel = CONTRACT_FORMS.find((f) => f.value === contractForm)?.label ?? '—';

  return (
    <div className="space-y-4">
      <p className="text-sm text-surface-300">Review all details before confirming:</p>

      <div className="bg-surface-900/50 rounded-lg border border-surface-700/30 p-4 space-y-3">
        <ReviewRow label="Contract Form" value={formLabel} />
        <ReviewRow label="Commencement Date" value={commencementDate || '—'} />
        <ReviewRow label="Practical Completion" value={practicalCompletionDate || '—'} />
        <ReviewRow
          label="Contract Sum"
          value={contractSum ? `R ${parseFloat(contractSum).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}` : '—'}
        />
        <div className="border-t border-surface-700/30 pt-2">
          <p className="text-xs text-surface-400 uppercase tracking-wider mb-1">Parties ({parties.length})</p>
          {parties.map((p) => (
            <p key={p.id} className="text-sm text-white">
              {p.name || '(unnamed)'} — <span className="text-surface-400">{p.role || 'no role'}</span>
            </p>
          ))}
        </div>
        <div className="border-t border-surface-700/30 pt-2">
          <p className="text-xs text-surface-400 uppercase tracking-wider mb-1">Form Parameters</p>
          {Object.entries(formParams).map(([key, value]) => (
            <p key={key} className="text-sm text-white">
              {key.replace(/([A-Z])/g, ' $1').trim()}: <span className="text-surface-300">{value}</span>
            </p>
          ))}
        </div>
        {clauseElections.length > 0 && (
          <div className="border-t border-surface-700/30 pt-2">
            <p className="text-xs text-surface-400 uppercase tracking-wider mb-1">
              Clause Elections ({clauseElections.length})
            </p>
            {clauseElections.map((c, idx) => (
              <p key={idx} className="text-sm text-white">
                {c.clauseNumber} — {c.clauseTitle}{' '}
                <Badge variant="outline" className={c.elected ? 'text-green-400 border-green-600/50' : 'text-surface-400'}>
                  {c.elected ? 'Elected' : 'Not Elected'}
                </Badge>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-surface-400 uppercase tracking-wider">{label}</span>
      <span className="text-sm text-white font-medium">{value}</span>
    </div>
  );
}

export default ContractSetupWizard;
