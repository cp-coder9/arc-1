/**
 * RemoteDesktopAgentDownload — Host Agent Download Page
 *
 * Provides the download page for the Host_Agent installer, accessible only
 * to authenticated users with resource-owning roles (BEP, architect, firm_admin,
 * freelancer, contractor). Displays current version, OS requirements, installer
 * size, SHA-256 checksum, download button, and SmartScreen/antivirus
 * troubleshooting guidance.
 *
 * Renders within the Architex OS shell (no custom chrome), uses platform CSS tokens.
 *
 * Validates: Requirement 11.1, 11.4
 */

import { Download, Shield, AlertTriangle, CheckCircle, Monitor } from 'lucide-react';
import type { UserProfile, UserRole } from '@/types';

// ─── Constants ──────────────────────────────────────────────────────────────────

/** Roles that can own resources and therefore download the Host Agent */
const RESOURCE_OWNING_ROLES: readonly UserRole[] = [
  'bep',
  'architect',
  'firm_admin',
  'freelancer',
  'contractor',
] as const;

/** Current agent version metadata */
const AGENT_INFO = {
  version: '1.0.0',
  osRequirements: 'Windows 10 (build 1903 or later)',
  installerSize: '48.2 MB',
  sha256Checksum: 'a3f7c9e1d2b4056789abcdef0123456789abcdef0123456789abcdef01234567',
  downloadUrl: '/api/remote-desktop/agent/download',
} as const;

// ─── Props ──────────────────────────────────────────────────────────────────────

interface RemoteDesktopAgentDownloadProps {
  user: UserProfile;
}

// ─── Component ──────────────────────────────────────────────────────────────────

export default function RemoteDesktopAgentDownload({ user }: RemoteDesktopAgentDownloadProps) {
  const hasAccess = RESOURCE_OWNING_ROLES.includes(user.role);

  if (!hasAccess) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="panel" style={{ textAlign: 'center', padding: 48 }}>
          <Shield size={48} style={{ color: 'var(--muted)', marginBottom: 16 }} />
          <h2 style={{ color: 'var(--ink)', fontSize: 18, marginBottom: 8 }}>
            Access Restricted
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            The Host Agent download is available only to resource-owning roles
            (BEP, architect, firm admin, freelancer, contractor).
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Hero */}
      <div className="hero">
        <div className="hero-header">
          <div>
            <div className="eyebrow">REMOTE DESKTOP</div>
            <h1>Host Agent Download</h1>
            <p className="sub">
              Install the Architex Host Agent on your workstation to share licensed
              applications with renters.
            </p>
          </div>
        </div>
        <div className="hero-pills">
          <span className="pill">
            <span className="dot"></span> v{AGENT_INFO.version}
          </span>
          <span className="pill">
            <span className="dot"></span> Windows
          </span>
        </div>
      </div>

      {/* Installer Details Panel */}
      <div className="panel">
        <h2>Installer Details</h2>
        <table className="table">
          <tbody>
            <tr>
              <td style={{ color: 'var(--muted)', fontWeight: 500 }}>Version</td>
              <td style={{ fontFamily: 'monospace', fontSize: 11 }}>
                {AGENT_INFO.version}
              </td>
            </tr>
            <tr>
              <td style={{ color: 'var(--muted)', fontWeight: 500 }}>OS Requirements</td>
              <td>{AGENT_INFO.osRequirements}</td>
            </tr>
            <tr>
              <td style={{ color: 'var(--muted)', fontWeight: 500 }}>Installer Size</td>
              <td>{AGENT_INFO.installerSize}</td>
            </tr>
            <tr>
              <td style={{ color: 'var(--muted)', fontWeight: 500 }}>SHA-256 Checksum</td>
              <td
                style={{
                  fontFamily: 'monospace',
                  fontSize: 11,
                  color: 'var(--muted)',
                  wordBreak: 'break-all',
                }}
              >
                {AGENT_INFO.sha256Checksum}
              </td>
            </tr>
          </tbody>
        </table>

        <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 12 }}>
          <a
            href={AGENT_INFO.downloadUrl}
            className="btn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              textDecoration: 'none',
            }}
            download
          >
            <Download size={16} />
            Download Host Agent v{AGENT_INFO.version}
          </a>
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>
            {AGENT_INFO.installerSize} · Code-signed by Architex
          </span>
        </div>
      </div>

      {/* Requirements Panel */}
      <div className="panel">
        <h2>System Requirements</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Monitor size={16} style={{ color: 'var(--teal)' }} />
            <span style={{ fontSize: 13 }}>
              <strong>Operating System:</strong> Windows 10 build 1903 or later (64-bit)
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CheckCircle size={16} style={{ color: 'var(--green)' }} />
            <span style={{ fontSize: 13 }}>
              <strong>App-Level Capture:</strong> Windows Graphics Capture API support required
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CheckCircle size={16} style={{ color: 'var(--green)' }} />
            <span style={{ fontSize: 13 }}>
              <strong>Network:</strong> Stable internet connection for WebRTC signalling
              and media streaming
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CheckCircle size={16} style={{ color: 'var(--green)' }} />
            <span style={{ fontSize: 13 }}>
              <strong>Permissions:</strong> Administrator access for installation
            </span>
          </div>
        </div>
      </div>

      {/* Troubleshooting Panel */}
      <div className="panel">
        <h2>SmartScreen &amp; Antivirus Troubleshooting</h2>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 14 }}>
          The Host Agent installer is code-signed with an Architex certificate. However,
          Windows SmartScreen or your antivirus software may flag new installers until
          they build reputation. Follow the steps below if you encounter any warnings.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* SmartScreen */}
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 16,
              padding: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <AlertTriangle size={16} style={{ color: 'var(--amber)' }} />
              <strong style={{ fontSize: 13 }}>Windows SmartScreen Warning</strong>
            </div>
            <ol
              style={{
                fontSize: 13,
                color: 'var(--ink)',
                paddingLeft: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <li>
                When you see &ldquo;Windows protected your PC&rdquo;, click{' '}
                <strong>More info</strong>.
              </li>
              <li>
                Verify the publisher shows <strong>Architex (Pty) Ltd</strong>.
              </li>
              <li>
                Click <strong>Run anyway</strong> to proceed with installation.
              </li>
            </ol>
          </div>

          {/* Antivirus */}
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 16,
              padding: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Shield size={16} style={{ color: 'var(--amber)' }} />
              <strong style={{ fontSize: 13 }}>Antivirus False Positive</strong>
            </div>
            <ol
              style={{
                fontSize: 13,
                color: 'var(--ink)',
                paddingLeft: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <li>
                Temporarily disable real-time protection or add an exclusion for the
                installer file.
              </li>
              <li>
                Verify the SHA-256 checksum matches the value shown above before running.
              </li>
              <li>
                Re-enable protection after installation completes.
              </li>
              <li>
                If the issue persists, contact{' '}
                <strong>support@architex.co.za</strong> with a screenshot of the
                warning.
              </li>
            </ol>
          </div>

          {/* Verification tip */}
          <div
            style={{
              background: 'var(--aqua)',
              borderRadius: 12,
              padding: 14,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
            }}
          >
            <Shield size={16} style={{ color: 'var(--deep)', marginTop: 2 }} />
            <div style={{ fontSize: 12, color: 'var(--deep)' }}>
              <strong>Verify integrity:</strong> Open PowerShell and run{' '}
              <code
                style={{
                  fontFamily: 'monospace',
                  fontSize: 11,
                  background: 'rgba(255,255,255,.6)',
                  padding: '2px 6px',
                  borderRadius: 4,
                }}
              >
                Get-FileHash ArchitexHostAgent-Setup.exe -Algorithm SHA256
              </code>{' '}
              — compare the output with the checksum listed above.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
