import React, { useEffect, useMemo, useState } from 'react';
import { Calculator, CheckCircle2, Percent, ReceiptText, Save, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DEFAULT_FEE_ESTIMATOR_INPUT,
  DEFAULT_FEE_ESTIMATOR_SETTINGS,
  FeeComplexity,
  FeeDeliverable,
  FeeEstimatorInput,
  FeeEstimatorRole,
  FeeEstimatorSettings,
  FeeProjectType,
  FeeServiceStage,
  estimateArchitecturalFee,
  feeComplexityLabels,
  feeDeliverableLabels,
  feeProjectTypeLabels,
  loadFeeEstimatorSettings,
  mergeFeeEstimatorSettings,
  sanitizeFeeEstimatorSettings,
  saveFeeEstimatorSettings,
} from '@/services/feeEstimatorService';

const currency = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 });

const escrowMilestoneBreakdown = [
  { stage: 'Intake', percentage: 10 },
  { stage: 'Appointment', percentage: 15 },
  { stage: 'Compliance', percentage: 25 },
  { stage: 'Tender', percentage: 20 },
  { stage: 'Delivery', percentage: 20 },
  { stage: 'Close-out', percentage: 10 },
];

const projectTypes = Object.keys(feeProjectTypeLabels) as FeeProjectType[];
const complexities = Object.keys(feeComplexityLabels) as FeeComplexity[];
const deliverables = Object.keys(feeDeliverableLabels) as FeeDeliverable[];

interface FeeEstimatorProps {
  role: FeeEstimatorRole;
  compact?: boolean;
  onEstimateBudget?: (amount: number) => void;
}

export default function FeeEstimator({ role, compact = false, onEstimateBudget }: FeeEstimatorProps) {
  const [settings, setSettings] = useState<FeeEstimatorSettings>(DEFAULT_FEE_ESTIMATOR_SETTINGS);
  const [settingsDraft, setSettingsDraft] = useState<FeeEstimatorSettings>(DEFAULT_FEE_ESTIMATOR_SETTINGS);
  const [input, setInput] = useState<FeeEstimatorInput>(DEFAULT_FEE_ESTIMATOR_INPUT);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    let active = true;
    loadFeeEstimatorSettings().then((loadedSettings) => {
      if (!active) return;
      setSettings(loadedSettings);
      setSettingsDraft(loadedSettings);
      setLoadingSettings(false);
    });
    return () => { active = false; };
  }, []);

  const estimate = useMemo(() => estimateArchitecturalFee(input, settings), [input, settings]);
  const activeStageSettings = settings.stageWeightings;
  const milestoneAmounts = useMemo(() => {
    let allocated = 0;
    return escrowMilestoneBreakdown.map((milestone, index) => {
      const amount = index === escrowMilestoneBreakdown.length - 1
        ? Math.round(estimate.total) - allocated
        : Math.round(estimate.total * (milestone.percentage / 100));
      allocated += amount;
      return { ...milestone, amount };
    });
  }, [estimate.total]);

  const roleCopy = {
    architect: {
      eyebrow: 'Architect quoting tool',
      title: 'Fee Estimator for Architectural Services',
      description: 'Build an indicative Architex marketplace fee using project value, SACAP-style stage weightings, deliverables and platform allowances.',
      disclaimer: 'Use this as a quoting aid only. Confirm scope, appointment terms, exclusions and VAT before issuing a binding proposal.',
    },
    client: {
      eyebrow: 'Client planning preview',
      title: 'Preview likely professional fees',
      description: 'Estimate the architectural fees you may need to budget before posting a job and receiving marketplace proposals.',
      disclaimer: 'This estimate helps planning only. Actual quotes depend on the appointed architect, site constraints and final scope.',
    },
    admin: {
      eyebrow: 'Admin fee controls',
      title: 'Fee Estimator Settings',
      description: 'Tune the percentages, fixed fees and allowances used by both client and architect estimators.',
      disclaimer: 'Saved settings are persisted to Firestore with safe defaults used when settings cannot be loaded.',
    },
  }[role];

  const updateInput = <K extends keyof FeeEstimatorInput>(key: K, value: FeeEstimatorInput[K]) => {
    setInput(current => ({ ...current, [key]: value }));
  };

  const toggleStage = (stage: FeeServiceStage) => {
    setInput(current => ({
      ...current,
      serviceStages: current.serviceStages.includes(stage)
        ? current.serviceStages.filter(item => item !== stage)
        : [...current.serviceStages, stage],
    }));
  };

  const toggleDeliverable = (deliverable: FeeDeliverable) => {
    setInput(current => ({
      ...current,
      deliverables: current.deliverables.includes(deliverable)
        ? current.deliverables.filter(item => item !== deliverable)
        : [...current.deliverables, deliverable],
    }));
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const merged = sanitizeFeeEstimatorSettings(settingsDraft);
      await saveFeeEstimatorSettings(merged);
      setSettings(merged);
      setSettingsDraft(merged);
      toast.success('Fee estimator settings saved');
    } catch (error) {
      toast.error('Could not save fee estimator settings');
    } finally {
      setSavingSettings(false);
    }
  };

  if (role === 'admin') {
    return (
      <div className="space-y-8">
        <EstimatorHeader {...roleCopy} loadingSettings={loadingSettings} />
        <AdminSettingsEditor
          settingsDraft={settingsDraft}
          onSettingsDraftChange={setSettingsDraft}
          onSave={handleSaveSettings}
          savingSettings={savingSettings}
        />
        <FeeEstimator role="architect" compact />
      </div>
    );
  }

  return (
    <div className="space-y-8" data-testid={`${role}-fee-estimator`}>
      {!compact && <EstimatorHeader {...roleCopy} loadingSettings={loadingSettings} />}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)] gap-8">
        <Card className="border-border shadow-sm bg-white rounded-[2rem] overflow-hidden">
          <CardHeader className="bg-primary/5 border-b border-border p-6">
            <CardTitle className="text-sm font-bold uppercase tracking-widest flex items-center gap-2 text-primary">
              <Calculator size={16} /> Project Details
            </CardTitle>
            <CardDescription>Inputs mirror a proposal-style architectural fee workflow adapted for Architex.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Project type">
                <select value={input.projectType} onChange={e => updateInput('projectType', e.target.value as FeeProjectType)} className="w-full h-12 px-4 rounded-xl border border-border bg-white text-sm">
                  {projectTypes.map(type => <option key={type} value={type}>{feeProjectTypeLabels[type]}</option>)}
                </select>
              </Field>
              <Field label="Municipality / location">
                <Input value={input.municipality} onChange={e => updateInput('municipality', e.target.value)} placeholder="Johannesburg, Tshwane, Cape Town..." className="h-12 rounded-xl" />
              </Field>
              <Field label="Value of works excl. VAT">
                <Input type="number" min="0" value={input.constructionValue} onChange={e => updateInput('constructionValue', Number(e.target.value))} className="h-12 rounded-xl" />
              </Field>
              <Field label="Estimated floor area (sqm)">
                <Input type="number" min="0" value={input.areaSqm} onChange={e => updateInput('areaSqm', Number(e.target.value))} className="h-12 rounded-xl" />
              </Field>
            </div>

            <Field label="Project complexity">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {complexities.map(complexity => (
                  <button key={complexity} type="button" onClick={() => updateInput('complexity', complexity)} className={`text-left rounded-2xl border p-4 transition-all ${input.complexity === complexity ? 'border-primary bg-primary/5 shadow-sm' : 'border-border bg-white hover:border-primary/30'}`}>
                    <p className="font-bold capitalize flex items-center justify-between">{complexity}{input.complexity === complexity && <CheckCircle2 size={16} className="text-primary" />}</p>
                    <p className="text-xs text-muted-foreground mt-2">{feeComplexityLabels[complexity]}</p>
                  </button>
                ))}
              </div>
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Urgency">
                <select value={input.urgency} onChange={e => updateInput('urgency', e.target.value as FeeEstimatorInput['urgency'])} className="w-full h-12 px-4 rounded-xl border border-border bg-white text-sm">
                  <option value="standard">Standard programme</option>
                  <option value="urgent">Urgent (+10%)</option>
                  <option value="express">Express / compressed (+20%)</option>
                </select>
              </Field>
              <Field label="Fee treatments">
                <div className="grid grid-cols-1 gap-2 text-sm">
                  <CheckRow label="Include council/admin allowance" checked={input.includeCouncilAdmin} onChange={() => updateInput('includeCouncilAdmin', !input.includeCouncilAdmin)} />
                  <CheckRow label="Include Architex platform fee" checked={input.includePlatformFee} onChange={() => updateInput('includePlatformFee', !input.includePlatformFee)} />
                  <CheckRow label="VAT applicable" checked={input.vatApplicable} onChange={() => updateInput('vatApplicable', !input.vatApplicable)} />
                </div>
              </Field>
            </div>

            <Field label="Work stages">
              <div className="rounded-2xl border border-border overflow-hidden">
                {activeStageSettings.map(stage => (
                  <label key={stage.id} className="flex items-start gap-3 p-4 border-b border-border last:border-b-0 hover:bg-secondary/20">
                    <input type="checkbox" checked={input.serviceStages.includes(stage.id)} onChange={() => toggleStage(stage.id)} className="mt-1 h-4 w-4 accent-primary" />
                    <span className="flex-1">
                      <span className="flex justify-between gap-4 font-bold text-sm"><span>{stage.label}</span><span>{stage.weighting}%</span></span>
                      <span className="text-xs text-muted-foreground">{stage.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </Field>

            <Field label="Deliverables and allowances">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {deliverables.map(deliverable => (
                  <CheckRow
                    key={deliverable}
                    label={`${feeDeliverableLabels[deliverable]} (${currency.format(settings.deliverableFees[deliverable])})`}
                    checked={input.deliverables.includes(deliverable)}
                    onChange={() => toggleDeliverable(deliverable)}
                  />
                ))}
              </div>
            </Field>
          </CardContent>
        </Card>

        <Card className="border-primary/10 shadow-xl shadow-primary/5 bg-white rounded-[2rem] overflow-hidden h-fit sticky top-6">
          <CardHeader className="bg-gradient-to-br from-primary/10 to-transparent border-b border-border p-6">
            <CardTitle className="text-sm font-bold uppercase tracking-widest flex items-center gap-2 text-primary"><ReceiptText size={16} /> Estimate Summary</CardTitle>
            <CardDescription>{roleCopy.disclaimer}</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="rounded-[1.5rem] bg-primary text-primary-foreground p-6">
              <p className="text-xs uppercase tracking-widest font-bold opacity-80">Estimated total</p>
              <p className="text-4xl font-heading font-black mt-2">{currency.format(estimate.total)}</p>
              <p className="text-xs opacity-80 mt-2">Professional fee is {estimate.feePercentageOfWorks.toFixed(2)}% of value of works.</p>
            </div>
            {role === 'client' && onEstimateBudget && (
              <Button onClick={() => onEstimateBudget(Math.round(estimate.total))} className="w-full h-12 rounded-xl font-bold">
                Use as job budget guide
              </Button>
            )}
            <div className="space-y-3">
              {estimate.breakdown.map(item => (
                <div key={item.label} className="rounded-2xl border border-border p-4">
                  <div className="flex justify-between gap-4 text-sm font-bold">
                    <span>{item.label}</span>
                    <span>{currency.format(item.amount)}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">{item.note}</p>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-primary">Milestone Breakdown</p>
                <p className="text-xs text-muted-foreground mt-1">Stage-linked escrow estimate. Amounts reconcile to {currency.format(estimate.total)}.</p>
              </div>
              {milestoneAmounts.map((milestone) => (
                <div key={milestone.stage} className="flex items-center justify-between gap-4 rounded-xl bg-white border border-border p-3 text-sm">
                  <span className="font-bold">{milestone.stage}</span>
                  <span className="text-muted-foreground">{milestone.percentage}%</span>
                  <span className="font-black text-primary">{currency.format(milestone.amount)}</span>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-border bg-secondary/20 p-4 space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">Transparent assumptions</p>
              {estimate.assumptions.map(assumption => <p key={assumption} className="text-xs text-muted-foreground">• {assumption}</p>)}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function EstimatorHeader({ eyebrow, title, description, loadingSettings }: { eyebrow: string; title: string; description: string; disclaimer: string; loadingSettings: boolean }) {
  return (
    <div className="rounded-[2rem] border border-border bg-white p-6 md:p-8 shadow-sm">
      <Badge variant="outline" className="uppercase text-[10px] tracking-widest mb-3">{eyebrow}</Badge>
      <h2 className="text-3xl md:text-4xl font-heading font-black tracking-tight flex items-center gap-3"><Calculator className="text-primary" /> {title}</h2>
      <p className="text-sm md:text-base text-muted-foreground mt-3 max-w-3xl leading-relaxed">{description}</p>
      {loadingSettings && <p className="text-xs text-muted-foreground mt-3">Loading configured fee settings...</p>}
    </div>
  );
}

function Field({ label, children }: React.PropsWithChildren<{ label: string }>) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function CheckRow({ label, checked, onChange }: { key?: React.Key; label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex items-center gap-3 rounded-xl border border-border bg-white p-3 text-sm hover:bg-secondary/20">
      <input type="checkbox" checked={checked} onChange={onChange} className="h-4 w-4 accent-primary" />
      <span>{label}</span>
    </label>
  );
}

function AdminSettingsEditor({ settingsDraft, onSettingsDraftChange, onSave, savingSettings }: { settingsDraft: FeeEstimatorSettings; onSettingsDraftChange: (settings: FeeEstimatorSettings) => void; onSave: () => void; savingSettings: boolean }) {
  const sanitizeDraftNumber = (value: number) => Number.isFinite(value) ? Math.max(value, 0) : 0;
  const updateBasePercent = (type: FeeProjectType, value: number) => {
    onSettingsDraftChange({ ...settingsDraft, baseFeePercentByProjectType: { ...settingsDraft.baseFeePercentByProjectType, [type]: sanitizeDraftNumber(value) } });
  };
  const updateDeliverableFee = (deliverable: FeeDeliverable, value: number) => {
    onSettingsDraftChange({ ...settingsDraft, deliverableFees: { ...settingsDraft.deliverableFees, [deliverable]: sanitizeDraftNumber(value) } });
  };
  const updateStageWeighting = (stage: FeeServiceStage, value: number) => {
    onSettingsDraftChange({ ...settingsDraft, stageWeightings: settingsDraft.stageWeightings.map(item => item.id === stage ? { ...item, weighting: sanitizeDraftNumber(value) } : item) });
  };

  return (
    <Card className="border-border shadow-sm bg-white rounded-[2rem] overflow-hidden" data-testid="fee-estimator-admin-settings">
      <CardHeader className="bg-primary/5 border-b border-border p-6">
        <CardTitle className="text-sm font-bold uppercase tracking-widest flex items-center gap-2 text-primary"><Settings2 size={16} /> Editable fee assumptions</CardTitle>
        <CardDescription>Admins can adjust the shared defaults without changing code.</CardDescription>
      </CardHeader>
      <CardContent className="p-6 space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <SettingsPanel title="Professional fee percentages">
            {projectTypes.map(type => <NumberSetting key={type} label={feeProjectTypeLabels[type]} value={settingsDraft.baseFeePercentByProjectType[type]} suffix="%" onChange={value => updateBasePercent(type, value)} />)}
          </SettingsPanel>
          <SettingsPanel title="Fixed deliverable allowances">
            {deliverables.map(deliverable => <NumberSetting key={deliverable} label={feeDeliverableLabels[deliverable]} value={settingsDraft.deliverableFees[deliverable]} prefix="R" onChange={value => updateDeliverableFee(deliverable, value)} />)}
          </SettingsPanel>
          <SettingsPanel title="Platform, VAT and admin fees">
            <NumberSetting label="Platform fee" value={settingsDraft.platformFeePercent} suffix="%" onChange={value => onSettingsDraftChange({ ...settingsDraft, platformFeePercent: sanitizeDraftNumber(value) })} />
            <NumberSetting label="Council/admin allowance" value={settingsDraft.councilAdminFee} prefix="R" onChange={value => onSettingsDraftChange({ ...settingsDraft, councilAdminFee: sanitizeDraftNumber(value) })} />
            <NumberSetting label="VAT rate" value={settingsDraft.vatRate} suffix="%" onChange={value => onSettingsDraftChange({ ...settingsDraft, vatRate: sanitizeDraftNumber(value) })} />
            <NumberSetting label="Minimum professional fee" value={settingsDraft.minimumProfessionalFee} prefix="R" onChange={value => onSettingsDraftChange({ ...settingsDraft, minimumProfessionalFee: sanitizeDraftNumber(value) })} />
          </SettingsPanel>
        </div>
        <SettingsPanel title="SACAP-style stage weighting">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {settingsDraft.stageWeightings.map(stage => <NumberSetting key={stage.id} label={stage.label} value={stage.weighting} suffix="%" onChange={value => updateStageWeighting(stage.id, value)} />)}
          </div>
        </SettingsPanel>
        <div className="flex flex-wrap gap-3">
          <Button onClick={onSave} disabled={savingSettings} className="h-12 rounded-xl font-bold gap-2"><Save size={16} /> {savingSettings ? 'Saving...' : 'Save fee settings'}</Button>
          <Button variant="outline" onClick={() => onSettingsDraftChange(DEFAULT_FEE_ESTIMATOR_SETTINGS)} className="h-12 rounded-xl font-bold gap-2"><Percent size={16} /> Reset to defaults</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SettingsPanel({ title, children }: React.PropsWithChildren<{ title: string }>) {
  return (
    <div className="rounded-[1.5rem] border border-border bg-secondary/10 p-4 space-y-3">
      <h3 className="text-[10px] font-black uppercase tracking-widest text-primary">{title}</h3>
      {children}
    </div>
  );
}

function NumberSetting({ label, value, onChange, prefix, suffix }: { key?: React.Key; label: string; value: number; onChange: (value: number) => void; prefix?: string; suffix?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        {prefix && <span className="text-xs font-bold text-muted-foreground">{prefix}</span>}
        <Input type="number" min="0" value={value} onChange={e => onChange(Number(e.target.value))} className="h-10 rounded-xl" />
        {suffix && <span className="text-xs font-bold text-muted-foreground">{suffix}</span>}
      </div>
    </label>
  );
}
