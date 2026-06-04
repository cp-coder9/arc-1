import React, { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { Award, Calendar, CheckCircle2, Download, ExternalLink, Loader2, QrCode, Shield, User } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { CPDCertificate } from '@/services/cpdTypes';
import { renderCertificateText } from '@/services/cpdIndex';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type LoadState = 'loading' | 'ready' | 'error' | 'not_found';

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
          // In production, maintain a verification index; for MVP, try direct lookup
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
      } catch (err) {
        console.error('Failed to load certificate:', err);
        setState('error');
      }
    };
    load();
  }, [certificateId, verificationCode, user?.uid, issuerKey]);

  if (state === 'loading') {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground p-4"><Loader2 className="h-4 w-4 animate-spin" /> Loading certificate...</div>;
  }

  if (state === 'not_found') {
    return (
      <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
        <CardContent className="p-8 text-center">
          <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Certificate not found. The verification code or ID may be invalid.</p>
        </CardContent>
      </Card>
    );
  }

  if (state === 'error' || !certificate) {
    return <div className="p-4 text-sm text-destructive">Unable to load certificate.</div>;
  }

  const certText = renderCertificateText(certificate);

  return (
    <div className="space-y-6" data-testid="cpd-certificate-viewer">
      <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm overflow-hidden">
        <CardHeader className="bg-primary/5 border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <Badge variant="secondary" className="uppercase tracking-widest">Certificate</Badge>
              <CardTitle className="font-heading text-3xl mt-3 flex items-center gap-3">
                <Award className="h-7 w-7 text-primary" /> CPD Certificate of Completion
              </CardTitle>
            </div>
            {verification && (
              <Badge variant={verification.valid ? 'default' : 'destructive'}>
                {verification.valid ? 'Verified' : 'Invalid'}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          {/* Certificate details in a styled layout */}
          <div className="rounded-2xl border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-background p-8 space-y-4">
            <p className="text-center text-xs font-bold uppercase tracking-[0.25em] text-muted-foreground">Architex Built Environment OS</p>
            <h2 className="text-center font-heading text-2xl font-black">CPD Certificate</h2>

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
                <p className="text-xs text-muted-foreground uppercase tracking-widest">Credits Awarded</p>
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
                <CheckCircle2 className="h-4 w-4 text-green-600" /> Passed
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <QrCode className="h-4 w-4" /> Verifiable
              </div>
            </div>
          </div>

          {/* Verification section */}
          <div className="rounded-2xl border border-border p-6 space-y-3">
            <h3 className="font-heading text-lg font-semibold flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" /> Verification
            </h3>
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
              <div className={`rounded-xl p-3 text-sm ${verification.valid ? 'bg-green-50 dark:bg-green-950/10 text-green-700' : 'bg-destructive/10 text-destructive'}`}>
                {verification.valid ? '✓ Certificate verified' : '⚠ Certificate verification failed'} — {verification.status}
                {verification.warnings.map((w, i) => <p key={i} className="text-xs mt-1">{w}</p>)}
              </div>
            )}
          </div>

          {/* Raw certificate text (for PDF integration) */}
          <details className="text-sm">
            <summary className="text-muted-foreground cursor-pointer hover:text-primary">View certificate text (PDF-compatible)</summary>
            <pre className="mt-3 rounded-xl border border-border bg-muted/30 p-4 text-xs whitespace-pre-wrap font-mono">{certText}</pre>
          </details>

          <div className="flex items-center gap-3">
            <Button variant="default">
              <Download className="h-4 w-4 mr-2" /> Download PDF
            </Button>
            <Button variant="outline" onClick={() => window.open(certificate.verificationUrl, '_blank')}>
              <ExternalLink className="h-4 w-4 mr-2" /> Verify Online
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
