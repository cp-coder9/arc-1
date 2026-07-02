// Engineer's Calculation Hub — PDF Export Service
//
// Generates a professional A4 calculation sheet as an HTML string
// suitable for browser print-to-PDF or future PDF library integration.
//
// Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
// Design reference: .kiro/specs/engineers-calculation-hub/design.md §7

import type { DerivationStep, PassFailStatus } from './types'

// ----------------------------------------------------------------------------
// Public interface
// ----------------------------------------------------------------------------

export interface CalcPdfExportParams {
  calculatorTitle: string
  sansRef: string
  projectName?: string
  jobRef?: string
  engineerName: string
  engineerRole: string
  date: string
  runId: string
  inputs: Array<{ label: string; value: string | number; unit: string }>
  outputs: Array<{ label: string; value: string | number; unit: string }>
  derivation: DerivationStep[]
  status: PassFailStatus
  utilisationRatio: number
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function getStatusBadge(status: PassFailStatus): string {
  const colours: Record<PassFailStatus, { bg: string; text: string; label: string }> = {
    pass: { bg: '#16a34a', text: '#ffffff', label: 'PASS' },
    warning: { bg: '#d97706', text: '#ffffff', label: 'WARNING' },
    fail: { bg: '#dc2626', text: '#ffffff', label: 'FAIL' },
  }
  const c = colours[status]
  return `<span style="display:inline-block;padding:4px 12px;border-radius:4px;background:${c.bg};color:${c.text};font-weight:700;font-size:13px;letter-spacing:0.5px;">${c.label}</span>`
}

function formatUtilisation(ratio: number): string {
  const pct = (ratio * 100).toFixed(1)
  let colour = '#16a34a' // green ≤90%
  if (ratio > 1) colour = '#dc2626' // red >100%
  else if (ratio >= 0.9) colour = '#d97706' // amber 90-100%
  return `<span style="color:${colour};font-weight:700;">${pct}%</span>`
}

function renderDerivationSteps(steps: DerivationStep[]): string {
  return steps
    .map((step) => {
      const refTag = step.sansRef
        ? `<span style="color:#aeefe3;font-weight:600;">[${escapeHtml(step.sansRef)}]</span> `
        : ''
      const failMark = step.isFailing ? '<span style="color:#dc2626;font-weight:700;">✗ </span>' : ''
      return [
        `<div style="margin-bottom:8px;${step.isFailing ? 'background:#fef2f2;padding:4px 6px;border-left:3px solid #dc2626;' : ''}">`,
        `  <div>${failMark}${refTag}<strong>${escapeHtml(step.label)}</strong></div>`,
        `  <div style="color:#64748b;margin-left:16px;">${escapeHtml(step.formula)}</div>`,
        `  <div style="margin-left:16px;">${escapeHtml(step.substitution)}</div>`,
        `  <div style="margin-left:16px;font-weight:600;">= ${escapeHtml(step.result)}</div>`,
        `</div>`,
      ].join('\n')
    })
    .join('\n')
}

// ----------------------------------------------------------------------------
// Main export function
// ----------------------------------------------------------------------------

/**
 * Generates a complete HTML document string representing a professional
 * A4 calculation sheet. Open in a browser and print as PDF.
 *
 * Requirement 6.1: Contains project name, calculator title, SANS ref, date,
 *   engineer name/role, inputs, outputs, derivation, status, disclaimer.
 * Requirement 6.2: A4 page, Architex logo, monospace derivation.
 * Requirement 6.3: Advisory disclaimer text.
 * Requirement 6.5: Run reference (runId) in footer.
 * Requirement 6.6: Project name and job ref in header when assigned.
 */
export function generateCalcSheetHtml(params: CalcPdfExportParams): string {
  const {
    calculatorTitle,
    sansRef,
    projectName,
    jobRef,
    engineerName,
    engineerRole,
    date,
    runId,
    inputs,
    outputs,
    derivation,
    status,
    utilisationRatio,
  } = params

  const projectHeader = projectName
    ? `<tr><td style="color:#64748b;padding-right:16px;">Project:</td><td><strong>${escapeHtml(projectName)}</strong>${jobRef ? ` &mdash; ${escapeHtml(jobRef)}` : ''}</td></tr>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(calculatorTitle)} - Calculation Sheet</title>
  <style>
    @page {
      size: A4;
      margin: 20mm 15mm 25mm 15mm;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif;
      font-size: 11px;
      line-height: 1.5;
      color: #1e293b;
      background: #ffffff;
    }

    .page {
      width: 210mm;
      min-height: 297mm;
      padding: 20mm 15mm 25mm 15mm;
      margin: 0 auto;
      position: relative;
    }

    @media print {
      body { background: none; }
      .page {
        width: 100%;
        min-height: auto;
        padding: 0;
        margin: 0;
      }
    }

    @media screen {
      body { background: #f1f5f9; padding: 20px; }
      .page {
        background: #ffffff;
        box-shadow: 0 4px 20px rgba(0,0,0,0.1);
        border-radius: 4px;
      }
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 12px;
      margin-bottom: 16px;
    }

    .logo {
      font-size: 20px;
      font-weight: 800;
      letter-spacing: 2px;
      color: #0f172a;
    }

    .header-meta {
      text-align: right;
      font-size: 10px;
      color: #64748b;
    }

    .calc-title {
      font-size: 16px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 4px;
    }

    .sans-ref {
      font-size: 11px;
      color: #0ea5e9;
      font-weight: 600;
      margin-bottom: 12px;
    }

    .meta-table {
      font-size: 10px;
      margin-bottom: 16px;
    }

    .meta-table td {
      padding: 2px 0;
      vertical-align: top;
    }

    .section-title {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #0f172a;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 4px;
      margin: 16px 0 8px 0;
    }

    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
      margin-bottom: 12px;
    }

    .data-table th {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      padding: 5px 8px;
      text-align: left;
      font-weight: 600;
      color: #475569;
      text-transform: uppercase;
      font-size: 9px;
      letter-spacing: 0.3px;
    }

    .data-table td {
      border: 1px solid #e2e8f0;
      padding: 5px 8px;
    }

    .data-table .value-cell {
      text-align: right;
      font-weight: 600;
      font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
    }

    .data-table .unit-cell {
      color: #64748b;
      width: 60px;
    }

    .status-section {
      display: flex;
      align-items: center;
      gap: 16px;
      margin: 16px 0;
      padding: 10px 12px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
    }

    .derivation {
      font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
      font-size: 10px;
      line-height: 1.6;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      padding: 12px;
      margin-bottom: 12px;
    }

    .disclaimer {
      margin-top: 20px;
      padding: 10px 12px;
      background: #fffbeb;
      border: 1px solid #fcd34d;
      border-radius: 4px;
      font-size: 9px;
      color: #92400e;
      line-height: 1.5;
    }

    .disclaimer strong {
      display: block;
      margin-bottom: 2px;
      font-size: 10px;
    }

    .footer {
      position: absolute;
      bottom: 20mm;
      left: 15mm;
      right: 15mm;
      border-top: 1px solid #e2e8f0;
      padding-top: 8px;
      display: flex;
      justify-content: space-between;
      font-size: 9px;
      color: #94a3b8;
    }

    @media print {
      .footer {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <!-- Header -->
    <div class="header">
      <div>
        <div class="logo">ARCHITEX</div>
        <div style="font-size:9px;color:#64748b;margin-top:2px;">Engineer's Calculation Hub</div>
      </div>
      <div class="header-meta">
        <div>${escapeHtml(date)}</div>
        <div>${escapeHtml(engineerName)}</div>
        <div>${escapeHtml(engineerRole)}</div>
      </div>
    </div>

    <!-- Calculator Title & SANS Reference -->
    <div class="calc-title">${escapeHtml(calculatorTitle)}</div>
    <div class="sans-ref">${escapeHtml(sansRef)}</div>

    <!-- Meta Information -->
    <table class="meta-table">
      ${projectHeader}
      <tr><td style="color:#64748b;padding-right:16px;">Engineer:</td><td>${escapeHtml(engineerName)} (${escapeHtml(engineerRole)})</td></tr>
      <tr><td style="color:#64748b;padding-right:16px;">Date:</td><td>${escapeHtml(date)}</td></tr>
      <tr><td style="color:#64748b;padding-right:16px;">Run Ref:</td><td style="font-family:monospace;">${escapeHtml(runId)}</td></tr>
    </table>

    <!-- Status -->
    <div class="status-section">
      <div>Status: ${getStatusBadge(status)}</div>
      <div style="font-size:11px;">Utilisation: ${formatUtilisation(utilisationRatio)}</div>
    </div>

    <!-- Inputs Table -->
    <div class="section-title">Input Parameters</div>
    <table class="data-table">
      <thead>
        <tr><th>Parameter</th><th>Value</th><th>Unit</th></tr>
      </thead>
      <tbody>
        ${inputs
          .map(
            (inp) =>
              `<tr><td>${escapeHtml(inp.label)}</td><td class="value-cell">${escapeHtml(String(inp.value))}</td><td class="unit-cell">${escapeHtml(inp.unit)}</td></tr>`
          )
          .join('\n        ')}
      </tbody>
    </table>

    <!-- Outputs Table -->
    <div class="section-title">Results</div>
    <table class="data-table">
      <thead>
        <tr><th>Result</th><th>Value</th><th>Unit</th></tr>
      </thead>
      <tbody>
        ${outputs
          .map(
            (out) =>
              `<tr><td>${escapeHtml(out.label)}</td><td class="value-cell">${escapeHtml(String(out.value))}</td><td class="unit-cell">${escapeHtml(out.unit)}</td></tr>`
          )
          .join('\n        ')}
      </tbody>
    </table>

    <!-- Derivation Steps -->
    <div class="section-title">Derivation</div>
    <div class="derivation">
      ${renderDerivationSteps(derivation)}
    </div>

    <!-- Advisory Disclaimer -->
    <div class="disclaimer">
      <strong>Advisory Only</strong>
      These calculations are provided for preliminary design purposes. All results must be verified by a qualified Professional Engineer (Pr.Eng) registered with ECSA.
    </div>

    <!-- Footer -->
    <div class="footer">
      <span>ARCHITEX &mdash; Engineer's Calculation Hub</span>
      <span>Run Ref: ${escapeHtml(runId)}</span>
    </div>
  </div>
</body>
</html>`
}
