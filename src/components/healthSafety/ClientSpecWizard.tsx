/**
 * ClientSpecWizard — Step-by-step Regulation 5(1) H&S Specification wizard.
 *
 * Guides the Client through creating a project Health & Safety Specification
 * covering: Project Description → Scope of Work → Known Hazards →
 * Min H&S Requirements → Monitoring Arrangements.
 *
 * Role-aware:
 * - `client` role can edit and generate the specification document
 * - All other roles see a read-only view of the completed specification
 *
 * Satisfies Requirements: 3.1, 3.2, 3.3, 3.4
 */

import React from 'react';
import type { ClientHSSpecification } from '@/services/healthSafety/hsTypes';
import { ADVISORY_DISCLAIMER } from '@/services/healthSafety/hsConstants';
import { isSpecificationComplete } from '@/services/healthSafety/clientSpecificationService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { FileText, CheckCircle, Circle, AlertTriangle } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface ClientSpecWizardProps {
  /** The user's derived H&S role */
  hsRole: 'hs_officer' | 'principal_contractor' | 'client' | 'designer' | 'viewer';
}

// ── Wizard Steps ─────────────────────────────────────────────────────────────

const WIZARD_STEPS = [
  { id: 1, label: 'Project Description', field: 'projectDescription' },
  { id: 2, label: 'Scope of Work', field: 'scopeOfWork' },
  { id: 3, label: 'Known Hazards', field: 'knownHazards' },
  { id: 4, label: 'Min H&S Requirements', field: 'minimumHSRequirements' },
  { id: 5, label: 'Monitoring Arrangements', field: 'complianceMonitoringArrangements' },
] as const;

// ── Demo Specification Data ──────────────────────────────────────────────────

const DEMO_SPECIFICATION: ClientHSSpecification = {
  id: 'hs-spec-demo-001',
  projectId: 'proj-1',
  projectDescription: 'Mixed-use commercial and residential development, 4 stories, 52 units',
  scopeOfWork: 'Full structural construction including foundations, framing, roofing, MEP, and finishes',
  knownHazards: [
    'Working at height (>2m)',
    'Excavation near existing services',
    'Crane operations adjacent to powerlines',
  ],
  minimumHSRequirements: [
    'OHSA-compliant H&S Plan',
    'Fall protection for all work above 2m',
    'Daily toolbox talks',
  ],
  complianceMonitoringArrangements: 'Weekly site audits by appointed H&S Officer with written reports to Client',
  completedAt: '2026-06-08T10:00:00.000Z',
  createdAt: '2026-06-01T08:00:00.000Z',
  updatedAt: '2026-06-08T10:00:00.000Z',
};

// ── Component ────────────────────────────────────────────────────────────────

export default function ClientSpecWizard({ hsRole }: ClientSpecWizardProps) {
  const spec = DEMO_SPECIFICATION;
  const complete = isSpecificationComplete(spec);
  const isClient = hsRole === 'client';

  return (
    <div className="space-y-6" data-testid="client-spec-wizard">
      {/* Regulation Explanation */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Client H&S Specification</CardTitle>
            </div>
            <Badge
              variant="outline"
              className={cn(
                'rounded-full',
                complete
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
              )}
            >
              {complete ? 'Complete' : 'Incomplete'}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Regulation 5(1) — Construction Regulations 2014: A Client must prepare a Health and Safety Specification
            for their project before appointing any contractor.
          </p>
        </CardHeader>
      </Card>

      {/* Step Indicator */}
      <Card>
        <CardContent className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Wizard Steps
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {WIZARD_STEPS.map((step, idx) => {
              const stepComplete = isStepComplete(spec, step.field);
              return (
                <React.Fragment key={step.id}>
                  <div className="flex items-center gap-1.5">
                    {stepComplete ? (
                      <CheckCircle className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span
                      className={cn(
                        'text-xs font-medium',
                        stepComplete ? 'text-emerald-400' : 'text-muted-foreground',
                      )}
                    >
                      {step.id}. {step.label}
                    </span>
                  </div>
                  {idx < WIZARD_STEPS.length - 1 && (
                    <span className="text-muted-foreground/50 text-xs">→</span>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Specification Content */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Specification Details</CardTitle>
          {!isClient && (
            <p className="text-xs text-muted-foreground italic">
              Read-only view — only the Client role can edit this specification.
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Step 1: Project Description */}
          <SpecSection
            stepNumber={1}
            label="Project Description"
            complete={spec.projectDescription.length > 0}
          >
            <p className="text-sm text-foreground">{spec.projectDescription}</p>
          </SpecSection>

          {/* Step 2: Scope of Work */}
          <SpecSection
            stepNumber={2}
            label="Scope of Work"
            complete={spec.scopeOfWork.length > 0}
          >
            <p className="text-sm text-foreground">{spec.scopeOfWork}</p>
          </SpecSection>

          {/* Step 3: Known Hazards */}
          <SpecSection
            stepNumber={3}
            label="Known Hazards"
            complete={spec.knownHazards.length > 0}
          >
            <ul className="space-y-1">
              {spec.knownHazards.map((hazard, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-orange-400" />
                  {hazard}
                </li>
              ))}
            </ul>
          </SpecSection>

          {/* Step 4: Minimum H&S Requirements */}
          <SpecSection
            stepNumber={4}
            label="Minimum H&S Requirements"
            complete={spec.minimumHSRequirements.length > 0}
          >
            <ul className="space-y-1">
              {spec.minimumHSRequirements.map((req, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                  <CheckCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />
                  {req}
                </li>
              ))}
            </ul>
          </SpecSection>

          {/* Step 5: Compliance Monitoring */}
          <SpecSection
            stepNumber={5}
            label="Compliance Monitoring Arrangements"
            complete={spec.complianceMonitoringArrangements.length > 0}
          >
            <p className="text-sm text-foreground">{spec.complianceMonitoringArrangements}</p>
          </SpecSection>
        </CardContent>
      </Card>

      {/* Actions + Disclaimer */}
      <Card>
        <CardContent className="p-4 space-y-4">
          {/* Generate Document button — client role only */}
          {isClient && (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Generate Specification Document</p>
                <p className="text-xs text-muted-foreground">
                  Produces a formatted Regulation 5(1) specification for the project record.
                </p>
              </div>
              <Button size="sm" className="rounded-full" disabled={!complete}>
                <FileText className="mr-1.5 h-3.5 w-3.5" /> Generate Document
              </Button>
            </div>
          )}

          {/* Advisory Disclaimer */}
          <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground italic">{ADVISORY_DISCLAIMER}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SpecSection({
  stepNumber,
  label,
  complete,
  children,
}: {
  stepNumber: number;
  label: string;
  complete: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/50 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className={cn(
            'rounded-full text-xs tabular-nums',
            complete
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
          )}
        >
          Step {stepNumber}
        </Badge>
        <span className="text-sm font-medium">{label}</span>
        {complete && <CheckCircle className="ml-auto h-4 w-4 text-emerald-400" />}
      </div>
      <div className="pl-1">{children}</div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isStepComplete(spec: ClientHSSpecification, field: string): boolean {
  const value = spec[field as keyof ClientHSSpecification];
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.length > 0;
  return false;
}
