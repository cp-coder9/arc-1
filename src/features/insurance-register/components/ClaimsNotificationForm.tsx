/**
 * Insurance Register — Claims Notification Form
 *
 * Form for registering a claims event notification against a project policy.
 * Fields: incidentDate, discoveryDate, affectedPolicyType, description,
 * estimatedLoss, locationOnSite. Shows inline Zod validation errors.
 *
 * Requirements: 3.8
 */

import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { claimsNotificationSchema } from '../schemas';
import type { InsurancePolicy, InsurancePolicyType } from '../types';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ClaimsNotificationFormProps {
  policies?: InsurancePolicy[];
  onSubmit?: (data: Record<string, unknown>) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const POLICY_TYPE_LABELS: Record<InsurancePolicyType, string> = {
  CAR: 'Contractors All Risk',
  PI: 'Professional Indemnity',
  public_liability: 'Public Liability',
  SASRIA: 'SASRIA',
  LDI: 'Latent Defects Insurance',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function ClaimsNotificationForm({ policies = [], onSubmit }: ClaimsNotificationFormProps) {
  const [formData, setFormData] = useState({
    incidentDate: '',
    discoveryDate: '',
    affectedPolicyId: '',
    affectedPolicyType: 'CAR' as InsurancePolicyType,
    description: '',
    estimatedLoss: 0,
    locationOnSite: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleChange(field: string, value: string | number) {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }

  function handlePolicySelect(policyId: string) {
    const selected = policies.find((p) => p.id === policyId);
    setFormData((prev) => ({
      ...prev,
      affectedPolicyId: policyId,
      affectedPolicyType: selected?.policyType ?? prev.affectedPolicyType,
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const payload = {
      ...formData,
      estimatedLoss: Number(formData.estimatedLoss),
      locationOnSite: formData.locationOnSite || undefined,
    };

    const result = claimsNotificationSchema.safeParse(payload);

    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const path = issue.path.join('.') || '_form';
        if (!fieldErrors[path]) {
          fieldErrors[path] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    onSubmit?.(result.data as unknown as Record<string, unknown>);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-amber-400" aria-hidden="true" />
          Notify a Claim
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {errors['_form'] && (
            <p className="text-sm text-red-400" role="alert">{errors['_form']}</p>
          )}

          {/* Dates */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FieldWrapper
              id="incidentDate"
              label="Incident Date"
              error={errors['incidentDate']}
            >
              <Input
                id="incidentDate"
                type="date"
                value={formData.incidentDate}
                onChange={(e) => handleChange('incidentDate', e.target.value)}
                aria-invalid={!!errors['incidentDate']}
              />
            </FieldWrapper>
            <FieldWrapper
              id="discoveryDate"
              label="Discovery Date"
              error={errors['discoveryDate']}
            >
              <Input
                id="discoveryDate"
                type="date"
                value={formData.discoveryDate}
                onChange={(e) => handleChange('discoveryDate', e.target.value)}
                aria-invalid={!!errors['discoveryDate']}
              />
            </FieldWrapper>
          </div>

          {/* Affected Policy */}
          <FieldWrapper
            id="affectedPolicyId"
            label="Affected Policy"
            error={errors['affectedPolicyId']}
          >
            {policies.length > 0 ? (
              <select
                id="affectedPolicyId"
                value={formData.affectedPolicyId}
                onChange={(e) => handlePolicySelect(e.target.value)}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                aria-invalid={!!errors['affectedPolicyId']}
              >
                <option value="">Select a policy...</option>
                {policies.map((p) => (
                  <option key={p.id} value={p.id}>
                    {POLICY_TYPE_LABELS[p.policyType]} — {p.insurerName} ({p.policyNumber})
                  </option>
                ))}
              </select>
            ) : (
              <div className="space-y-1.5">
                <Input
                  id="affectedPolicyId"
                  value={formData.affectedPolicyId}
                  onChange={(e) => handleChange('affectedPolicyId', e.target.value)}
                  placeholder="Policy ID"
                  aria-invalid={!!errors['affectedPolicyId']}
                />
                <div className="space-y-1.5">
                  <Label htmlFor="affectedPolicyType">Policy Type</Label>
                  <select
                    id="affectedPolicyType"
                    value={formData.affectedPolicyType}
                    onChange={(e) => handleChange('affectedPolicyType', e.target.value)}
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                  >
                    {Object.entries(POLICY_TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </FieldWrapper>

          {/* Description */}
          <FieldWrapper
            id="description"
            label="Description"
            error={errors['description']}
          >
            <textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="Describe the incident or loss event (max 2000 characters)"
              rows={4}
              maxLength={2000}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              aria-invalid={!!errors['description']}
            />
          </FieldWrapper>

          {/* Estimated Loss + Location */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FieldWrapper
              id="estimatedLoss"
              label="Estimated Loss (ZAR)"
              error={errors['estimatedLoss']}
            >
              <Input
                id="estimatedLoss"
                type="number"
                value={String(formData.estimatedLoss)}
                onChange={(e) => handleChange('estimatedLoss', Number(e.target.value))}
                placeholder="0.00"
                aria-invalid={!!errors['estimatedLoss']}
              />
            </FieldWrapper>
            <FieldWrapper
              id="locationOnSite"
              label="Location on Site"
              error={errors['locationOnSite']}
            >
              <Input
                id="locationOnSite"
                value={formData.locationOnSite}
                onChange={(e) => handleChange('locationOnSite', e.target.value)}
                placeholder="e.g. Block A, Level 3"
                aria-invalid={!!errors['locationOnSite']}
              />
            </FieldWrapper>
          </div>

          <Button type="submit" className="mt-2">
            Submit Claim Notification
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ─── Internal Field Wrapper ───────────────────────────────────────────────────

interface FieldWrapperProps {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}

function FieldWrapper({ id, label, error, children }: FieldWrapperProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-xs text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
