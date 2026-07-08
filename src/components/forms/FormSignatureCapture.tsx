/**
 * FormSignatureCapture — Signature capture interface for form signing.
 *
 * Features:
 * - Signature pad area (dashed border placeholder with "Click to sign" text)
 * - Credential validation info display
 * - Outstanding signatures list with names/roles
 * - Sign button
 *
 * Requirements validated: 12.1, 12.2, 12.4, 12.5
 */

import React, { useState } from 'react';
import { PenTool, CheckCircle, Clock, ShieldCheck } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

export interface OutstandingSignature {
  signatoryId: string;
  signatoryName: string;
  role: string;
  order: number;
}

interface Props {
  instanceId: string;
  signatoryId: string;
  signatoryName: string;
  role: string;
  onSign: (signatureData: string) => void;
  onCancel: () => void;
  credentialVerified?: boolean;
  credentialType?: string;
  outstandingSignatures?: OutstandingSignature[];
}

// ── Component ────────────────────────────────────────────────────────────────

export default function FormSignatureCapture({
  instanceId: _instanceId,
  signatoryId: _signatoryId,
  signatoryName,
  role,
  onSign,
  onCancel,
  credentialVerified = true,
  credentialType,
  outstandingSignatures = [],
}: Props) {
  const [signed, setSigned] = useState(false);

  const handleSignClick = () => {
    if (!credentialVerified) return;
    setSigned(true);
  };

  const handleConfirmSign = () => {
    // In a real implementation, this would capture canvas data
    // For now, generate a placeholder signature data string
    const signatureData = `sig_${signatoryName.replace(/\s/g, '_')}_${Date.now()}`;
    onSign(signatureData);
  };

  return (
    <div className="panel" style={{ padding: '20px 22px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <PenTool style={{ width: 18, height: 18, color: 'var(--deep)' }} />
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>
          Digital Signature
        </h2>
      </div>

      {/* Signatory Info */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>
          {signatoryName}
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
          {role}
        </div>
      </div>

      {/* Credential Validation Info */}
      <div
        className="panel"
        style={{
          padding: '10px 14px',
          marginBottom: 16,
          background: credentialVerified
            ? 'rgba(74,222,128,.04)'
            : 'rgba(217,87,71,.04)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <ShieldCheck
          style={{
            width: 16,
            height: 16,
            color: credentialVerified ? 'var(--green)' : 'var(--red)',
            flexShrink: 0,
          }}
        />
        <div>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink)' }}>
            {credentialVerified
              ? 'Credentials verified'
              : 'Credential verification failed'}
          </div>
          {credentialType && (
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
              {credentialType}
            </div>
          )}
          {!credentialVerified && (
            <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 2 }}>
              You do not have the required professional credentials to sign this form.
            </div>
          )}
        </div>
      </div>

      {/* Signature Pad Area */}
      <div
        className="sig-pad"
        onClick={handleSignClick}
        role="button"
        tabIndex={0}
        aria-label="Click to sign"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleSignClick();
          }
        }}
        style={{
          width: '100%',
          height: 140,
          border: '2px dashed var(--border)',
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 16,
          cursor: credentialVerified ? 'pointer' : 'not-allowed',
          background: signed
            ? 'var(--aqua)'
            : 'rgba(255,255,255,.5)',
          transition: 'background .2s, border-color .2s',
          opacity: credentialVerified ? 1 : 0.5,
        }}
      >
        {signed ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <CheckCircle style={{ width: 24, height: 24, color: 'var(--green)' }} />
            <span style={{ fontSize: 13, color: 'var(--deep)', fontWeight: 500 }}>
              Signature captured
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <PenTool style={{ width: 24, height: 24, color: 'var(--muted)' }} />
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>
              Click to sign
            </span>
          </div>
        )}
      </div>

      {/* Outstanding Signatures */}
      {outstandingSignatures.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--deep)', marginBottom: 8 }}>
            Outstanding Signatures
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {outstandingSignatures.map((sig) => (
              <div
                key={sig.signatoryId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'rgba(255,255,255,.7)',
                }}
              >
                <Clock style={{ width: 14, height: 14, color: 'var(--amber)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink)' }}>
                    {sig.signatoryName}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {sig.role}
                  </div>
                </div>
                <span
                  className="pill"
                  style={{
                    fontSize: 10,
                    padding: '2px 8px',
                    color: 'var(--amber)',
                    background: 'rgba(245,166,35,.08)',
                    borderColor: 'rgba(245,166,35,.18)',
                  }}
                >
                  Awaiting
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button
          className="btn"
          onClick={onCancel}
          style={{
            minWidth: 90,
            border: '1px solid var(--border)',
            background: 'rgba(255,255,255,.7)',
            color: 'var(--ink)',
          }}
        >
          Cancel
        </button>
        <button
          className="btn"
          onClick={handleConfirmSign}
          disabled={!signed || !credentialVerified}
          style={{
            minWidth: 120,
            opacity: signed && credentialVerified ? 1 : 0.5,
            cursor: signed && credentialVerified ? 'pointer' : 'not-allowed',
          }}
        >
          <PenTool style={{ width: 14, height: 14, marginRight: 6, display: 'inline' }} />
          Sign Form
        </button>
      </div>
    </div>
  );
}
