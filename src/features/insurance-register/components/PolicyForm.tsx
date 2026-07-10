/**
 * Insurance Register — Policy Registration/Edit Form
 *
 * Form for creating or editing an insurance policy record.
 * Fields: policyType, insurerName, policyNumber, policyholderName,
 * inceptionDate, expiryDate, sumInsured, excessAmount, brokerContactName,
 * brokerPhone, brokerEmail.
 * Shows inline validation errors from Zod schema.
 *
 * Requirements: 1.2, 1.8
 */

import React, { useState } from 'react';
import { FileText } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { insurancePolicySchema } from '../schemas';
import type { InsurancePolicy, InsurancePolicyType } from '../types';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface PolicyFormProps {
  onSubmit?: (data: Record<string, unknown>) => void;
  editingPolicy?: InsurancePolicy | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const POLICY_TYPES: { value: InsurancePolicyType; label: string }[] = [
  { value: 'CAR', label: 'Contractors All Risk (CAR)' },
  { value: 'PI', label: 'Professional Indemnity (PI)' },
  { value: 'public_liability', label: 'Public Liability' },
  { value: 'SASRIA', label: 'SASRIA' },
  { value: 'LDI', label: 'Latent Defects Insurance (LDI)' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function PolicyForm({ onSubmit, editingPolicy }: PolicyFormProps) {
  const [formData, setFormData] = useState({
    policyType: editingPolicy?.policyType ?? 'CAR' as InsurancePolicyType,
    insurerName: editingPolicy?.insurerName ?? '',
    policyNumber: editingPolicy?.policyNumber ?? '',
    policyholderName: editingPolicy?.policyholderName ?? '',
    inceptionDate: editingPolicy?.inceptionDate ?? '',
    expiryDate: editingPolicy?.expiryDate ?? '',
    sumInsured: editingPolicy?.sumInsured ?? 0,
    excessAmount: editingPolicy?.excessAmount ?? 0,
    brokerContactName: editingPolicy?.brokerContactName ?? '',
    brokerPhone: editingPolicy?.brokerPhone ?? '',
    brokerEmail: editingPolicy?.brokerEmail ?? '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleChange(field: string, value: string | number) {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear field error on change
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const payload = {
      ...formData,
      sumInsured: Number(formData.sumInsured),
      excessAmount: Number(formData.excessAmount),
      brokerPhone: formData.brokerPhone || undefined,
      brokerEmail: formData.brokerEmail || undefined,
    };

    const result = insurancePolicySchema.safeParse(payload);

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
          <FileText className="h-4 w-4 text-blue-400" aria-hidden="true" />
          {editingPolicy ? 'Edit Policy' : 'Register New Policy'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* Top-level form errors */}
          {errors['_form'] && (
            <p className="text-sm text-red-400" role="alert">{errors['_form']}</p>
          )}

          {/* Policy Type */}
          <div className="space-y-1.5">
            <Label htmlFor="policyType">Policy Type</Label>
            <select
              id="policyType"
              value={formData.policyType}
              onChange={(e) => handleChange('policyType', e.target.value)}
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              aria-invalid={!!errors['policyType']}
            >
              {POLICY_TYPES.map((pt) => (
                <option key={pt.value} value={pt.value}>{pt.label}</option>
              ))}
            </select>
            {errors['policyType'] && <p className="text-xs text-red-400" role="alert">{errors['policyType']}</p>}
          </div>

          {/* Insurer Name + Policy Number */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              id="insurerName"
              label="Insurer Name"
              value={formData.insurerName}
              onChange={(v) => handleChange('insurerName', v)}
              error={errors['insurerName']}
              placeholder="e.g. Santam, Hollard"
            />
            <FormField
              id="policyNumber"
              label="Policy Number"
              value={formData.policyNumber}
              onChange={(v) => handleChange('policyNumber', v)}
              error={errors['policyNumber']}
              placeholder="e.g. POL-2024-001234"
            />
          </div>

          {/* Policyholder Name */}
          <FormField
            id="policyholderName"
            label="Policyholder Name"
            value={formData.policyholderName}
            onChange={(v) => handleChange('policyholderName', v)}
            error={errors['policyholderName']}
            placeholder="Named insured entity"
          />

          {/* Dates */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              id="inceptionDate"
              label="Inception Date"
              type="date"
              value={formData.inceptionDate}
              onChange={(v) => handleChange('inceptionDate', v)}
              error={errors['inceptionDate']}
            />
            <FormField
              id="expiryDate"
              label="Expiry Date"
              type="date"
              value={formData.expiryDate}
              onChange={(v) => handleChange('expiryDate', v)}
              error={errors['expiryDate']}
            />
          </div>

          {/* Amounts */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              id="sumInsured"
              label="Sum Insured (ZAR)"
              type="number"
              value={String(formData.sumInsured)}
              onChange={(v) => handleChange('sumInsured', Number(v))}
              error={errors['sumInsured']}
              placeholder="0.00"
            />
            <FormField
              id="excessAmount"
              label="Excess Amount (ZAR)"
              type="number"
              value={String(formData.excessAmount)}
              onChange={(v) => handleChange('excessAmount', Number(v))}
              error={errors['excessAmount']}
              placeholder="0.00"
            />
          </div>

          {/* Broker Contact */}
          <FormField
            id="brokerContactName"
            label="Broker Contact Name"
            value={formData.brokerContactName}
            onChange={(v) => handleChange('brokerContactName', v)}
            error={errors['brokerContactName']}
            placeholder="Broker name"
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              id="brokerPhone"
              label="Broker Phone"
              value={formData.brokerPhone}
              onChange={(v) => handleChange('brokerPhone', v)}
              error={errors['brokerPhone']}
              placeholder="+27 or 0xx xxx xxxx"
            />
            <FormField
              id="brokerEmail"
              label="Broker Email"
              value={formData.brokerEmail}
              onChange={(v) => handleChange('brokerEmail', v)}
              error={errors['brokerEmail']}
              placeholder="broker@example.com"
              type="email"
            />
          </div>

          <Button type="submit" className="mt-2">
            {editingPolicy ? 'Update Policy' : 'Register Policy'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ─── Internal Form Field ──────────────────────────────────────────────────────

interface FormFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  type?: string;
}

function FormField({ id, label, value, onChange, error, placeholder, type = 'text' }: FormFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error && (
        <p id={`${id}-error`} className="text-xs text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
