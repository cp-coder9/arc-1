'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, FileText, AlertTriangle } from 'lucide-react';
import type { ContractItem } from '@/services/commandCentre/types';

interface ContractViewProps {
  projectId: string;
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-500/20 text-green-400 border-green-500/50',
  expired: 'bg-red-500/20 text-red-400 border-red-500/50',
  terminated: 'bg-slate-500/20 text-slate-400 border-slate-500/50',
  pending: 'bg-amber-500/20 text-amber-400 border-amber-500/50',
};

const FORM_LABELS: Record<string, string> = {
  jbcc_pba: 'JBCC PBA',
  jbcc_ns: 'JBCC N/S',
  jbcc_mwa: 'JBCC MWA',
  nec_ecc: 'NEC ECC',
  nec_psc: 'NEC PSC',
  nec_tsc: 'NEC TSC',
  custom: 'Custom',
};

export default function ContractView({ projectId }: ContractViewProps) {
  const [contracts, setContracts] = useState<ContractItem[]>([]);

  useEffect(() => {
    void projectId;
  }, [projectId]);

  const isExpiringSoon = (contract: ContractItem) => {
    const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return contract.status === 'active' && contract.expiryDate <= thirtyDaysFromNow;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Contract Register</h2>
        <Button size="sm" className="gap-1">
          <Plus className="h-3.5 w-3.5" />
          Add Contract
        </Button>
      </div>

      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
        <CardContent className="pt-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-700/50">
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Reference</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Contractor / Supplier</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Scope</th>
                  <th className="text-right py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Value</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Form</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Expiry</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {contracts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <FileText className="h-8 w-8 opacity-40" />
                        <p>No contracts registered</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  contracts.map((contract) => (
                    <tr key={contract.id} className="border-b border-surface-700/30">
                      <td className="py-2 px-2 font-mono text-xs">{contract.reference}</td>
                      <td className="py-2 px-2 font-medium">{contract.contractorSupplier}</td>
                      <td className="py-2 px-2 text-muted-foreground truncate max-w-xs">{contract.scope}</td>
                      <td className="text-right py-2 px-2">R {contract.value.toLocaleString()}</td>
                      <td className="py-2 px-2">
                        <Badge variant="outline" className="text-xs">{FORM_LABELS[contract.form] ?? contract.form}</Badge>
                      </td>
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">{contract.expiryDate}</span>
                          {isExpiringSoon(contract) && <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />}
                        </div>
                      </td>
                      <td className="py-2 px-2">
                        <Badge variant="outline" className={`text-xs ${STATUS_COLORS[contract.status] ?? ''}`}>
                          {contract.status}
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
