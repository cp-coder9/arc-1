/**
 * Builder Verification Panel Component
 *
 * Form to initiate builder verification: builder name, registration number,
 * verification date. Displays results with a status badge.
 *
 * Requirements: 14.7
 */

import React, { useState } from 'react';
import { UserCheck, Loader2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/features/p1-shared/components/StatusBadge';
import type { StatusBadgeVariant } from '@/features/p1-shared/components/StatusBadge';
import type { BuilderVerification, BuilderVerificationStatus, VerifyBuilderInput } from '../types';

export interface BuilderVerificationPanelProps {
  projectId?: string;
  onVerify?: (input: VerifyBuilderInput) => void;
  result?: BuilderVerification | null;
  loading?: boolean;
}

const STATUS_DISPLAY: Record<BuilderVerificationStatus, { label: string; variant: StatusBadgeVariant; description: string }> = {
  verified_active: {
    label: 'Verified Active',
    variant: 'success',
    description: 'Builder registration is current and in good standing with the NHBRC.',
  },
  verified_suspended: {
    label: 'Suspended',
    variant: 'danger',
    description: 'Builder registration has been suspended. This builder may not undertake new projects.',
  },
  verified_expired: {
    label: 'Expired',
    variant: 'warning',
    description: 'Builder registration has expired and requires renewal before proceeding.',
  },
  unverifiable: {
    label: 'Unverifiable',
    variant: 'default',
    description: 'Registration could not be verified. Check the registration number and try again.',
  },
};

const REGISTRATION_NUMBER_REGEX = /^[a-zA-Z0-9]{4,20}$/;

export function BuilderVerificationPanel({ projectId, onVerify, result, loading }: BuilderVerificationPanelProps) {
  const [builderName, setBuilderName] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [verificationDate, setVerificationDate] = useState('');
  const [validationError, setValidationError] = useState('');

  const today = new Date().toISOString().split('T')[0];

  const isValid =
    builderName.trim().length >= 2 &&
    builderName.trim().length <= 200 &&
    REGISTRATION_NUMBER_REGEX.test(registrationNumber) &&
    verificationDate !== '' &&
    verificationDate <= today;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError('');

    if (!REGISTRATION_NUMBER_REGEX.test(registrationNumber)) {
      setValidationError('Registration number must be 4–20 alphanumeric characters.');
      return;
    }
    if (verificationDate > today) {
      setValidationError('Verification date cannot be in the future.');
      return;
    }
    if (!isValid) return;

    const input: VerifyBuilderInput = {
      builderName: builderName.trim(),
      registrationNumber: registrationNumber.trim(),
      verificationDate,
    };
    onVerify?.(input);
  }

  return (
    <Card className="bg-slate-800/70 border-slate-700/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-semibold text-slate-100">
          <UserCheck className="h-5 w-5 text-blue-400" aria-hidden="true" />
          Builder Verification
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Verification form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="bv-name" className="text-xs uppercase tracking-wider text-slate-400">
                Builder Name
              </label>
              <input
                id="bv-name"
                type="text"
                minLength={2}
                maxLength={200}
                value={builderName}
                onChange={(e) => setBuilderName(e.target.value)}
                placeholder="Builder company name"
                className="w-full rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="bv-reg" className="text-xs uppercase tracking-wider text-slate-400">
                Registration Number
              </label>
              <input
                id="bv-reg"
                type="text"
                value={registrationNumber}
                onChange={(e) => setRegistrationNumber(e.target.value)}
                placeholder="e.g. NHBRC12345"
                className="w-full rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p className="text-xs text-slate-500">4–20 alphanumeric characters</p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="bv-date" className="text-xs uppercase tracking-wider text-slate-400">
                Verification Date
              </label>
              <input
                id="bv-date"
                type="date"
                max={today}
                value={verificationDate}
                onChange={(e) => setVerificationDate(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {validationError && (
            <p className="text-xs text-red-400">{validationError}</p>
          )}

          <Button type="submit" disabled={!isValid || loading}>
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Verifying...
              </span>
            ) : (
              'Verify Builder'
            )}
          </Button>
        </form>

        {/* Verification result */}
        {result && (
          <div className="rounded-lg border border-slate-700/40 bg-slate-900/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-200">Verification Result</h3>
              <StatusBadge
                status={STATUS_DISPLAY[result.result].label}
                variant={STATUS_DISPLAY[result.result].variant}
              />
            </div>

            <p className="text-xs text-slate-400">{STATUS_DISPLAY[result.result].description}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-500">Builder:</span>{' '}
                <span className="text-slate-200">{result.builderName}</span>
              </div>
              <div>
                <span className="text-slate-500">Registration:</span>{' '}
                <span className="text-slate-200 font-mono">{result.registrationNumber}</span>
              </div>
              <div>
                <span className="text-slate-500">Verified:</span>{' '}
                <span className="text-slate-200">{result.verificationDate}</span>
              </div>
              {result.registrationCategory && (
                <div>
                  <span className="text-slate-500">Category:</span>{' '}
                  <span className="text-slate-200">{result.registrationCategory}</span>
                </div>
              )}
              {result.maxProjectValue && (
                <div>
                  <span className="text-slate-500">Max Project Value:</span>{' '}
                  <span className="text-slate-200">R {result.maxProjectValue.toLocaleString()}</span>
                </div>
              )}
              {result.registrationExpiry && (
                <div>
                  <span className="text-slate-500">Expiry:</span>{' '}
                  <span className="text-slate-200">{result.registrationExpiry}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
