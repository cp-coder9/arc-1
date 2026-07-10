// TermsLibraryView — Template list filtered by profession
//
// Requirements: 7.1, 7.2, 7.3, 7.4, 7.5

import { useState } from 'react';
import { BookOpen, Shield, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useFeeProposalBuilder } from '../FeeProposalBuilderContext';
import { ClauseEditor } from './ClauseEditor';
import { TermsVersionHistory } from './TermsVersionHistory';
import { DemoDataNotice } from '../shared/DemoDataNotice';

// ---------------------------------------------------------------------------
// Mock terms templates
// ---------------------------------------------------------------------------

interface TermsTemplate {
  id: string;
  title: string;
  professions: string[];
  clauses: string[];
  legalReviewed: boolean;
  version: number;
  lastUpdated: string;
}

const MOCK_TEMPLATES: TermsTemplate[] = [
  {
    id: 'standard-sa-professional',
    title: 'Standard SA Professional Appointment Terms',
    professions: ['all'],
    clauses: [
      'The professional shall exercise reasonable skill, care and diligence in the performance of services.',
      'Payment terms: 30 days from date of invoice.',
      'The client acknowledges that the professional is not responsible for defects in work by others.',
      'Either party may terminate this agreement with 30 days written notice.',
      'Dispute resolution shall be by mediation, followed by arbitration under the Arbitration Act.',
    ],
    legalReviewed: true,
    version: 3,
    lastUpdated: '2026-05-15',
  },
  {
    id: 'architectural-services',
    title: 'Architectural Services — SACAP Conditions',
    professions: ['architect'],
    clauses: [
      'Services shall be rendered in accordance with the SACAP scope of work guidelines.',
      'Copyright in all designs and documentation remains with the architect until full payment.',
      'The architect\'s liability is limited to the professional fee charged for the relevant stage.',
      'Site visits shall be at intervals appropriate to the stage of construction.',
    ],
    legalReviewed: true,
    version: 2,
    lastUpdated: '2026-04-20',
  },
  {
    id: 'engineering-services',
    title: 'Engineering Services — ECSA Conditions',
    professions: ['civilEngineer', 'structuralEngineer', 'electricalEngineer', 'mechanicalEngineer', 'fireEngineer'],
    clauses: [
      'Engineering services shall comply with applicable SANS standards and ECSA guidelines.',
      'The engineer shall carry appropriate professional indemnity insurance.',
      'Design review and approval by the client does not relieve the engineer of responsibility.',
    ],
    legalReviewed: false,
    version: 1,
    lastUpdated: '2026-06-01',
  },
  {
    id: 'quantity-surveying',
    title: 'Quantity Surveying — SACQSP Terms',
    professions: ['quantitySurveyor'],
    clauses: [
      'Cost estimates are provided in good faith based on available information and are not guarantees.',
      'Bills of quantities are prepared in accordance with the Standard System of Measuring Building Work.',
      'The QS shall not be liable for cost overruns resulting from design changes not communicated.',
    ],
    legalReviewed: true,
    version: 2,
    lastUpdated: '2026-03-10',
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TermsLibraryView() {
  const { activeProfession } = useFeeProposalBuilder();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<TermsTemplate | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const filtered = MOCK_TEMPLATES.filter((t) => {
    const matchesProfession = t.professions.includes('all') || t.professions.includes(activeProfession);
    const matchesSearch = t.title.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesProfession && matchesSearch;
  });

  if (showHistory && selectedTemplate) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setShowHistory(false)}>
          ← Back to Template
        </Button>
        <TermsVersionHistory templateId={selectedTemplate.id} templateTitle={selectedTemplate.title} />
      </div>
    );
  }

  if (selectedTemplate) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setSelectedTemplate(null)}>
          ← Back to Library
        </Button>
        <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-surface-100">{selectedTemplate.title}</h2>
              <p className="text-xs text-surface-400 mt-1">
                Version {selectedTemplate.version} · Last updated {selectedTemplate.lastUpdated}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {selectedTemplate.legalReviewed ? (
                <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-300">
                  <Shield className="h-3 w-3 mr-1" /> Legal Reviewed
                </Badge>
              ) : (
                <Badge className="border-amber-500/30 bg-amber-500/15 text-amber-300">
                  Pending Review
                </Badge>
              )}
              <Button variant="ghost" size="sm" onClick={() => setShowHistory(true)}>
                Version History
              </Button>
            </div>
          </div>
        </div>
        <ClauseEditor clauses={selectedTemplate.clauses} templateId={selectedTemplate.id} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DemoDataNotice className="mb-4" />
      <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-6">
        <div className="flex items-center gap-3 mb-4">
          <BookOpen className="h-5 w-5 text-primary-400" />
          <h2 className="text-lg font-bold text-surface-100">Terms Library</h2>
        </div>
        <p className="text-sm text-surface-400 mb-4">
          Manage terms templates for fee proposals. Templates are filtered by the active profession.
        </p>
        <Input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search templates..."
          className="max-w-sm"
        />
      </div>

      <div className="space-y-2">
        {filtered.map((template) => (
          <div
            key={template.id}
            onClick={() => setSelectedTemplate(template)}
            className="rounded-lg bg-surface-800/70 backdrop-blur border border-surface-700/50 p-4 flex items-center gap-4 hover:bg-surface-700/50 transition-colors cursor-pointer"
          >
            <BookOpen className="h-5 w-5 text-surface-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-surface-100">{template.title}</p>
              <p className="text-xs text-surface-400">
                v{template.version} · {template.clauses.length} clauses · Updated {template.lastUpdated}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {template.legalReviewed && (
                <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-300 text-[10px]">
                  <Check className="h-3 w-3 mr-0.5" /> Reviewed
                </Badge>
              )}
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="rounded-lg bg-surface-800/70 border border-surface-700/50 p-8 text-center">
            <BookOpen className="h-8 w-8 text-surface-500 mx-auto mb-2" />
            <p className="text-sm text-surface-400">No templates found for the current profession or search.</p>
          </div>
        )}
      </div>
    </div>
  );
}
