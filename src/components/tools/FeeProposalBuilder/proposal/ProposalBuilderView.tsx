// ProposalBuilderView — Form for assembling a fee proposal document
//
// Includes: project details, client details, professional details, assumptions,
// exclusions, notes, terms selection, validity days.
// Disables "Generate Proposal" when discount applied without reason.
//
// Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 13.3, 13.4

import { useState, useCallback } from 'react';
import { FileText, Plus, Trash2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useFeeProposalBuilder } from '../FeeProposalBuilderContext';
import { ResponsibilityGate } from './ResponsibilityGate';
import { ProposalPreview } from './ProposalPreview';
import { ProposalHistoryList } from './ProposalHistoryList';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ListEditorProps {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
}

function ListEditor({ label, items, onChange, placeholder }: ListEditorProps) {
  const [newItem, setNewItem] = useState('');

  const handleAdd = () => {
    const trimmed = newItem.trim();
    if (trimmed) {
      onChange([...items, trimmed]);
      setNewItem('');
    }
  };

  const handleRemove = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs uppercase tracking-wider text-surface-400">{label}</Label>
      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map((item, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="flex-1 text-sm text-surface-200 bg-surface-800/50 px-3 py-1.5 rounded">{item}</span>
              <Button variant="ghost" size="icon-sm" onClick={() => handleRemove(i)} className="text-surface-500 hover:text-red-400">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
          placeholder={placeholder ?? 'Add item...'}
          className="flex-1"
        />
        <Button variant="ghost" size="sm" onClick={handleAdd} disabled={!newItem.trim()}>
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ProposalBuilderView() {
  const { calculatorState } = useFeeProposalBuilder();

  const [projectName, setProjectName] = useState('');
  const [projectLocation, setProjectLocation] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [professionalName, setProfessionalName] = useState('');
  const [professionalCompany, setProfessionalCompany] = useState('');
  const [professionalRegistration, setProfessionalRegistration] = useState('');
  const [assumptions, setAssumptions] = useState<string[]>([]);
  const [exclusions, setExclusions] = useState<string[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [selectedTerms, setSelectedTerms] = useState<string[]>(['standard-sa-professional']);
  const [customTerms, setCustomTerms] = useState<string[]>([]);
  const [validityDays, setValidityDays] = useState(30);
  const [showPreview, setShowPreview] = useState(false);
  const [showGate, setShowGate] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Validation: discount without reason blocks proposal
  const discountInvalid = calculatorState.discount.percentage > 0 && calculatorState.discount.reason.trim() === '';
  const canGenerate = !!projectName.trim() && !!clientName.trim() && !!professionalName.trim() && !discountInvalid;

  const handleGenerate = useCallback(() => {
    setShowGate(true);
  }, []);

  const handleGateConfirm = useCallback(() => {
    setShowGate(false);
    setShowPreview(true);
  }, []);

  if (showHistory) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setShowHistory(false)}>
          ← Back to Proposal Builder
        </Button>
        <ProposalHistoryList />
      </div>
    );
  }

  if (showPreview) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setShowPreview(false)}>
          ← Back to Editing
        </Button>
        <ProposalPreview
          projectName={projectName}
          projectLocation={projectLocation}
          projectDescription={projectDescription}
          clientName={clientName}
          professionalName={professionalName}
          professionalCompany={professionalCompany}
          assumptions={assumptions}
          exclusions={exclusions}
          notes={notes}
          validityDays={validityDays}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-primary-400" />
            <h2 className="text-lg font-bold text-surface-100">Proposal Builder</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setShowHistory(true)}>
            View History
          </Button>
        </div>
        <p className="text-sm text-surface-400 mt-2">
          Assemble your fee proposal document. Fill in project, client, and professional details,
          then add assumptions, exclusions, and terms.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column */}
        <div className="space-y-6">
          {/* Project Details */}
          <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-5 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400">Project Details</h3>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-surface-400">Project Name *</Label>
              <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="e.g. Smith Residence" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-surface-400">Location</Label>
              <Input value={projectLocation} onChange={(e) => setProjectLocation(e.target.value)} placeholder="e.g. Sandton, Johannesburg" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-surface-400">Description</Label>
              <Textarea value={projectDescription} onChange={(e) => setProjectDescription(e.target.value)} placeholder="Brief project description..." />
            </div>
          </div>

          {/* Client Details */}
          <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-5 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400">Client Details</h3>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-surface-400">Client Name *</Label>
              <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Client full name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-surface-400">Email</Label>
                <Input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="client@email.com" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-surface-400">Phone</Label>
                <Input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="+27..." />
              </div>
            </div>
          </div>

          {/* Professional Details */}
          <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-5 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400">Professional Details</h3>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-surface-400">Name *</Label>
              <Input value={professionalName} onChange={(e) => setProfessionalName(e.target.value)} placeholder="Your full name" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-surface-400">Company</Label>
              <Input value={professionalCompany} onChange={(e) => setProfessionalCompany(e.target.value)} placeholder="Practice / firm name" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-surface-400">Registration Number</Label>
              <Input value={professionalRegistration} onChange={(e) => setProfessionalRegistration(e.target.value)} placeholder="e.g. PrArch 12345" />
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Assumptions & Exclusions */}
          <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-5 space-y-4">
            <ListEditor label="Assumptions" items={assumptions} onChange={setAssumptions} placeholder="e.g. Normal ground conditions" />
          </div>
          <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-5 space-y-4">
            <ListEditor label="Exclusions" items={exclusions} onChange={setExclusions} placeholder="e.g. Geotechnical investigation" />
          </div>
          <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-5 space-y-4">
            <ListEditor label="Notes" items={notes} onChange={setNotes} placeholder="Additional notes..." />
          </div>

          {/* Terms & Validity */}
          <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-5 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400">Terms & Validity</h3>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-surface-400">Validity Period (days)</Label>
              <Input type="number" min={1} max={365} value={validityDays} onChange={(e) => setValidityDays(parseInt(e.target.value) || 30)} />
            </div>
            <ListEditor label="Custom Clauses" items={customTerms} onChange={setCustomTerms} placeholder="Add custom clause..." />
          </div>

          {/* Generate Button */}
          <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-5">
            {discountInvalid && (
              <p className="text-xs text-red-400 mb-3">
                A discount reason is required before generating a proposal.
              </p>
            )}
            <Button
              className="w-full"
              size="lg"
              onClick={handleGenerate}
              disabled={!canGenerate}
            >
              <FileText className="h-4 w-4 mr-2" />
              Generate Proposal
            </Button>
          </div>
        </div>
      </div>

      {/* Responsibility Gate Modal */}
      {showGate && (
        <ResponsibilityGate
          onConfirm={handleGateConfirm}
          onCancel={() => setShowGate(false)}
        />
      )}
    </div>
  );
}
