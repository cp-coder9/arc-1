'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, Receipt } from 'lucide-react';
import type { PaymentCertificate } from '@/services/commandCentre/types';

interface ValuationViewProps {
  projectId: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-500/20 text-slate-400 border-slate-500/50',
  awaiting_signature: 'bg-amber-500/20 text-amber-400 border-amber-500/50',
  certified: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
  paid: 'bg-green-500/20 text-green-400 border-green-500/50',
};

export default function ValuationView({ projectId }: ValuationViewProps) {
  const [certificates, setCertificates] = useState<PaymentCertificate[]>([]);

  useEffect(() => {
    void projectId;
  }, [projectId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Valuations & Payment Certificates</h2>
        <Button size="sm" className="gap-1">
          <Plus className="h-3.5 w-3.5" />
          New Certificate
        </Button>
      </div>

      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
        <CardContent className="pt-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-700/50">
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Cert #</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Period</th>
                  <th className="text-right py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Gross Value</th>
                  <th className="text-right py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Retention</th>
                  <th className="text-right py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Net Certified</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {certificates.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <Receipt className="h-8 w-8 opacity-40" />
                        <p>No payment certificates created</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  certificates.map((cert) => (
                    <tr key={cert.id} className="border-b border-surface-700/30">
                      <td className="py-2 px-2 font-mono">{cert.certificateNumber}</td>
                      <td className="py-2 px-2 text-muted-foreground">{cert.period}</td>
                      <td className="text-right py-2 px-2">R {cert.grossValue.toLocaleString()}</td>
                      <td className="text-right py-2 px-2 text-muted-foreground">R {cert.retentionAmount.toLocaleString()}</td>
                      <td className="text-right py-2 px-2 font-medium">R {cert.netCertifiedAmount.toLocaleString()}</td>
                      <td className="py-2 px-2">
                        <Badge variant="outline" className={`text-xs ${STATUS_COLORS[cert.status] ?? ''}`}>
                          {cert.status.replace(/_/g, ' ')}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
