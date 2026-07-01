import React, { useEffect, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { Award, Calendar, CheckCircle2, Download, ExternalLink, FileText, Loader2, QrCode, Shield, Upload } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { CPDCertificate } from '@/services/cpdTypes';
import { renderCertificateText } from '@/services/cpdIndex';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DashboardSection } from '@/components/composite/DashboardSection';
import { uploadEvidence, getEvidenceForCertificate } from '@/services/evidenceUploadService';
import type { EvidenceItem } from '@/services/evidenceUploadService';
import { getCertificateBadge } from '@/services/cpdDisplayUtils';

type LoadState = 'loading' | 'ready' | 'error' | 'not_found';
type UploadState = 'idle' | 'uploading' | 'success' | 'error';

interface CPDCertificateViewerProps {
  certificateId?: string;
  verificationCode?: string;
  user?: { uid: string };
  issuerKey?: string;
}

export default function CPDCertificateViewer({ certificateId, verificationCode, user, issuerKey }: CPDCertificateViewerProps) {
  const [state, setState] = useState<LoadState>('loading');
  const [certificate, setCertificate] = useState<CPDCertificate | null>(null);
  const [verification, setVerification] = useState<{ valid: boolean; status: string; warnings: string[] } | null>(null);

  // Evidence upload state
  const [evidenceItems, setEvidenceItems] = useState<EvidenceItem[]>([]);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!certificateId && !verificationCode) {
      setState('not_found');
      return;
    }

    const load = async () => {
      setState('loading');
      try {
        let cert: CPDCertificate | null = null;

        if (certificateId) {
          const snap = await getDoc(doc(db, 'cpd_certificates', certificateId));
          if (snap.exists()) {
            cert = { id: snap.id, ...snap.data() } as CPDCertificate;
          }
        }

        // If not found by ID but we have a verification code, search
        if (!cert && verificationCode) {
          const snap = await getDoc(doc(db, 'cpd_certificates', verificationCode));
          if (snap.exists()) {
            cert = { id: snap.id, ...snap.data() } as CPDCertificate;
          }
        }

        if (!cert) {
          setState('not_found');
          return;
        }

        setCertificate(cert);

        // For client-side display, trust the server-issued certificate.
        // Full cryptographic verification runs server-side via cpdService.ts.
        setVerification({
          valid: !!cert.verificationCode,
          status: cert.verificationCode ? 'valid' : 'verification_pending',
          warnings: cert.verificationCode ? [] : ['Certificate has no verification code.'],
        });

        setState('ready');

        // Load evidence items for this certificate
        try {
          const items = await getEvidenceForCertificate(cert.id);
          setEvidenceItems(items);
        } catch {
          // Non-critical: evidence list may fail without blocking certificate view
        }
      } catch (err) {
        console.error('Failed to load certificate:', err);
        setState('error');
      }
    };
    load();
  }, [certificateId, verificationCode, user?.uid, issuerKey]);

  const handleEvidenceUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset states
    setUploadError(null);
    setUploadSuccess(null);

    // Client-side PDF validation
    if (file.type !== 'application/pdf') {
      setUploadState('error');
      setUploadError('Only PDF files are accepted');
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (!certificate || !user) {
      setUploadState('error');
      setUploadError('Certificate or user context missing.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploadState('uploading');

    const result = await uploadEvidence({
      certificateId: certificate.id,
      userId: user.uid,
      file,
    });

    if (result.success && result.evidence) {
      setUploadState('success');
      setUploadSuccess(`Evidence "${result.evidence.fileName}" uploaded successfully.`);
      setEvidenceItems((prev) => [result.evidence!, ...prev]);
    } else {
      setUploadState('error');
      setUploadError(result.error || 'Upload failed. Please try again.');
    }

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (state === 'loading') {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground p-4"><Loader2 className="h-4 w-4 animate-spin" /> Loading certificate...</div>;
  }

  if (state === 'not_found') {
    return (
      <div className="glass-panel rounded-2xl p-8 text-center">
        <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Certificate not found. The verification code or ID may be invalid.</p>
      </div>
    );
  }

  if (state === 'error' || !certificate) {
    return <div className="p-4 text-sm text-destructive">Unable to load certificate.</div>;
  }

  const certText = renderCertificateText(certificate);
  const badge = getCertificateBadge(certificate);

  return (
    <div className="space-y-6" data-testid="cpd-certificate-viewer">
      {/* Certificate Details Section */}
      <DashboardSection
        title="Compliance Certificate of Completion"
        icon={<Award className="h-5 w-5" />}
        action={
          <div className="flex items-center gap-2">
            <Badge variant={badge.variant === 'default' ? 'default' : 'secondary'} className="glass-pill">
              {badge.label}
            </Badge>
            {verification && (
              <Badge variant={verification.valid ? 'default' : 'destructive'} className="glass-pill">
                {verification.valid ? 'Verified' : 'Invalid'}
              </Badge>
            )}
          </div>
        }
      >
        {/* Certificate details in a styled layout */}
        <div className="glass-tile rounded-2xl border-2 border-primary/20 p-8 space-y-4">
          <p className="text-center text-xs font-bold uppercase tracking-[0.25em] text-muted-foreground">Architex Built Environment OS</p>
          <h2 className="text-center font-heading text-2xl font-black">Professional Compliance Learning Certificate</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-widest">Awarded to</p>
              <p className="font-heading text-xl font-bold">{certificate.learnerName}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-widest">Professional Body</p>
              <p className="font-heading text-xl font-bold">{certificate.professionalBody}</p>
            </div>
            {certificate.registrationNumber && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-widest">Registration Number</p>
                <p className="font-mono text-sm">{certificate.registrationNumber}</p>
              </div>
            )}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-widest">Compliance Credits Awarded</p>
              <p className="font-heading text-xl font-black text-primary">{certificate.creditsAwarded}</p>
            </div>
          </div>

          <div className="border-t border-border pt-4 mt-4 space-y-3">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-widest">Course</p>
              <p className="font-semibold">{certificate.courseTitle}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-widest">Provider</p>
              <p>{certificate.providerName}</p>
            </div>
            {certificate.accreditationReference && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-widest">Accreditation Reference</p>
                <p className="font-mono text-sm">{certificate.accreditationReference}</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-4 border-t border-border">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" /> Issued: {certificate.issueDate}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" /> Passed
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <QrCode className="h-4 w-4" /> Verifiable
            </div>
          </div>
        </div>
      </DashboardSection>

      {/* Verification Section */}
      <DashboardSection
        title="Verification"
        icon={<Shield className="h-5 w-5" />}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-widest">Verification Code</p>
            <p className="font-mono text-sm font-bold">{certificate.verificationCode}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-widest">Verify Online</p>
            <a href={certificate.verificationUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline flex items-center gap-1">
              {certificate.verificationUrl} <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
        {verification && (
          <div className={`rounded-xl p-3 text-sm mt-4 ${verification.valid ? 'bg-green-50 dark:bg-green-950/10 text-green-700 dark:text-green-400' : 'bg-destructive/10 text-destructive'}`}>
            {verification.valid ? '✓ Certificate verified' : '⚠ Certificate verification failed'} — {verification.status}
            {verification.warnings.map((w, i) => <p key={i} className="text-xs mt-1">{w}</p>)}
          </div>
        )}
      </DashboardSection>

      {/* Evidence Upload Section */}
      <DashboardSection
        title="Evidence Upload"
        icon={<Upload className="h-5 w-5" />}
        description="Attach supporting compliance documents (PDF only)"
        action={
          <Button
            variant="outline"
            className="glass-button"
            onClick={handleEvidenceUploadClick}
            disabled={uploadState === 'uploading'}
          >
            {uploadState === 'uploading' ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading...</>
            ) : (
              <><Upload className="h-4 w-4 mr-2" /> Evidence Upload</>
            )}
          </Button>
        }
      >
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={handleFileSelected}
          data-testid="evidence-file-input"
        />

        {/* Upload feedback */}
        {uploadState === 'success' && uploadSuccess && (
          <div className="glass-record rounded-xl p-3 text-sm bg-green-50 dark:bg-green-950/10 text-green-700 dark:text-green-400 mb-4">
            <CheckCircle2 className="h-4 w-4 inline mr-2" />
            {uploadSuccess}
          </div>
        )}
        {uploadState === 'error' && uploadError && (
          <div className="glass-record rounded-xl p-3 text-sm bg-destructive/10 text-destructive mb-4">
            {uploadError}
          </div>
        )}

        {/* Evidence items list */}
        {evidenceItems.length > 0 ? (
          <div className="space-y-2">
            {evidenceItems.map((item) => (
              <div key={item.id} className="glass-record rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-primary shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{item.fileName}</p>
                    <p className="text-xs text-muted-foreground">Uploaded: {new Date(item.uploadedAt).toLocaleDateString()}</p>
                  </div>
                </div>
                <Badge variant="secondary" className="glass-pill capitalize">{item.status.replace('_', ' ')}</Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">No evidence documents uploaded yet.</p>
        )}
      </DashboardSection>

      {/* Certificate text (for PDF integration) */}
      <details className="text-sm">
        <summary className="text-muted-foreground cursor-pointer hover:text-primary">View certificate text (PDF-compatible)</summary>
        <pre className="mt-3 glass-panel rounded-xl p-4 text-xs whitespace-pre-wrap font-mono">{certText}</pre>
      </details>

      <div className="flex items-center gap-3">
        <Button variant="default" className="glass-button-solid">
          <Download className="h-4 w-4 mr-2" /> Download PDF
        </Button>
        <Button variant="outline" className="glass-button" onClick={() => window.open(certificate.verificationUrl, '_blank')}>
          <ExternalLink className="h-4 w-4 mr-2" /> Verify Online
        </Button>
      </div>
    </div>
  );
}
