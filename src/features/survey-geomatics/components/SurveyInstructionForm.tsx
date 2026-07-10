/**
 * Survey Instruction Form
 *
 * Form for creating and issuing survey instructions.
 * Fields: survey type (select), property description, scope of work,
 * surveyor name + PLATO number, completion date, linked documents.
 * Issue button transitions from drafted → issued.
 *
 * Requirements: 16.1, 16.5, 22.8
 */

import React, { useState } from 'react';
import { Send, Plus, X } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { SurveyType } from '../types';

const SURVEY_TYPE_OPTIONS: { value: SurveyType; label: string }[] = [
  { value: 'boundary_determination', label: 'Boundary Determination' },
  { value: 'topographic_survey', label: 'Topographic Survey' },
  { value: 'as_built_survey', label: 'As-Built Survey' },
  { value: 'sectional_title_survey', label: 'Sectional Title Survey' },
  { value: 'subdivision_survey', label: 'Subdivision Survey' },
  { value: 'consolidation_survey', label: 'Consolidation Survey' },
  { value: 'general_purposes_diagram', label: 'General Purposes Diagram' },
];

interface FormState {
  surveyType: SurveyType;
  propertyDescription: string;
  scopeOfWork: string;
  appointedSurveyorName: string;
  appointedSurveyorPLATO: string;
  requiredCompletionDate: string;
  linkedDocuments: string[];
}

const INITIAL_STATE: FormState = {
  surveyType: 'boundary_determination',
  propertyDescription: '',
  scopeOfWork: '',
  appointedSurveyorName: '',
  appointedSurveyorPLATO: '',
  requiredCompletionDate: '',
  linkedDocuments: [],
};

export function SurveyInstructionForm() {
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [newDocRef, setNewDocRef] = useState('');

  const handleChange = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddDocument = () => {
    const trimmed = newDocRef.trim();
    if (trimmed && form.linkedDocuments.length < 20) {
      setForm((prev) => ({
        ...prev,
        linkedDocuments: [...prev.linkedDocuments, trimmed],
      }));
      setNewDocRef('');
    }
  };

  const handleRemoveDocument = (index: number) => {
    setForm((prev) => ({
      ...prev,
      linkedDocuments: prev.linkedDocuments.filter((_, i) => i !== index),
    }));
  };

  const handleIssue = () => {
    // In production, this would call surveyEngineService.createInstruction + issueInstruction
    // For now, this is the UI form structure
    console.info('[SurveyInstructionForm] Issue instruction:', form);
  };

  const isValid =
    form.propertyDescription.trim() !== '' &&
    form.scopeOfWork.trim() !== '' &&
    form.appointedSurveyorName.trim() !== '' &&
    form.requiredCompletionDate !== '';

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-base">New Survey Instruction</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-5">
          {/* Survey Type */}
          <div className="grid gap-1.5">
            <Label htmlFor="survey-type">Survey Type</Label>
            <select
              id="survey-type"
              value={form.surveyType}
              onChange={(e) => handleChange('surveyType', e.target.value)}
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            >
              {SURVEY_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Property Description */}
          <div className="grid gap-1.5">
            <Label htmlFor="property-description">Property Description</Label>
            <Textarea
              id="property-description"
              value={form.propertyDescription}
              onChange={(e) => handleChange('propertyDescription', e.target.value)}
              placeholder="Erf/Portion number, township, municipality..."
              maxLength={500}
            />
            <span className="text-xs text-muted-foreground">{form.propertyDescription.length}/500</span>
          </div>

          {/* Scope of Work */}
          <div className="grid gap-1.5">
            <Label htmlFor="scope-of-work">Scope of Work</Label>
            <Textarea
              id="scope-of-work"
              value={form.scopeOfWork}
              onChange={(e) => handleChange('scopeOfWork', e.target.value)}
              placeholder="Describe the required survey work..."
              maxLength={2000}
            />
            <span className="text-xs text-muted-foreground">{form.scopeOfWork.length}/2000</span>
          </div>

          {/* Surveyor Details */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="surveyor-name">Surveyor Name</Label>
              <Input
                id="surveyor-name"
                value={form.appointedSurveyorName}
                onChange={(e) => handleChange('appointedSurveyorName', e.target.value)}
                placeholder="Professional Land Surveyor name"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="surveyor-plato">PLATO Registration No.</Label>
              <Input
                id="surveyor-plato"
                value={form.appointedSurveyorPLATO}
                onChange={(e) => handleChange('appointedSurveyorPLATO', e.target.value)}
                placeholder="e.g. PLS-12345"
                maxLength={20}
              />
            </div>
          </div>

          {/* Completion Date */}
          <div className="grid gap-1.5">
            <Label htmlFor="completion-date">Required Completion Date</Label>
            <Input
              id="completion-date"
              type="date"
              value={form.requiredCompletionDate}
              onChange={(e) => handleChange('requiredCompletionDate', e.target.value)}
            />
          </div>

          {/* Linked Documents */}
          <div className="grid gap-1.5">
            <Label>Linked Documents</Label>
            <div className="flex items-center gap-2">
              <Input
                value={newDocRef}
                onChange={(e) => setNewDocRef(e.target.value)}
                placeholder="Document reference..."
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddDocument(); } }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddDocument}
                disabled={!newDocRef.trim() || form.linkedDocuments.length >= 20}
                aria-label="Add document reference"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {form.linkedDocuments.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-2">
                {form.linkedDocuments.map((doc, i) => (
                  <li
                    key={`${doc}-${i}`}
                    className="inline-flex items-center gap-1 rounded-md border border-input bg-muted/50 px-2 py-0.5 text-xs"
                  >
                    <span className="max-w-[160px] truncate">{doc}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveDocument(i)}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={`Remove ${doc}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <span className="text-xs text-muted-foreground">{form.linkedDocuments.length}/20 documents</span>
          </div>

          {/* Issue Button */}
          <div className="flex justify-end pt-2">
            <Button onClick={handleIssue} disabled={!isValid}>
              <Send className="mr-2 h-4 w-4" />
              Issue Instruction
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
