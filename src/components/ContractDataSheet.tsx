/**
 * Contract Data Sheet Component
 *
 * Displays all contract parameters, key dates, named persons, and
 * commercial rates. Shows pending indicator for unconfigured fields.
 * Read-only for users without edit permission; inline edit + audit
 * logging for authorized users.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.6, 2.7, 2.8
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { UserProfile } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Calendar,
  Users,
  DollarSign,
  Clock,
  Edit2,
  Check,
  X,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import {
  getDataSheet,
} from '@/services/contractAdmin/client';
import { apiFetch } from '@/lib/apiClient';
import type {
  ContractConfig,
  ContractDataSheet as ContractDataSheetType,
  ContractProjectAssignment,
  DataSheetField,
} from '@/services/contractAdmin/client';

// TODO: wire to real API endpoint
async function getContractConfigViaApi(projectId: string): Promise<ContractConfig | null> {
  const res = await apiFetch(`/api/contract-admin/config?projectId=${encodeURIComponent(projectId)}`);
  if (!res.ok) return null;
  return res.json();
}

// TODO: wire to real API endpoint
async function updateContractParameterViaApi(projectId: string, field: string, value: unknown) {
  const res = await apiFetch('/api/contract-admin/update-parameter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, field, value }),
  });
  if (!res.ok) throw new Error(`Update failed: ${res.statusText}`);
  return res.json();
}

// ══════════════════════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════════════════════

interface ContractDataSheetProps {
  user: UserProfile;
  projectId: string;
}

// ══════════════════════════════════════════════════════════════════════════════
// Main Component
// ══════════════════════════════════════════════════════════════════════════════

export function ContractDataSheet({ user, projectId }: ContractDataSheetProps) {
  const [config, setConfig] = useState<ContractConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const projectAssignment: ContractProjectAssignment = useMemo(() => ({
    projectId,
    userId: user.uid,
    roles: [user.role],
    isAssignedTeamMember: ['architect', 'bep', 'quantity_surveyor', 'engineer'].includes(user.role),
    isAssignedContractor: user.role === 'contractor',
    isAssignedSubcontractor: user.role === 'subcontractor',
    isProjectOwner: ['client', 'developer'].includes(user.role),
    isAssignedSiteManager: user.role === 'site_manager',
  }), [user, projectId]);

  useEffect(() => {
    let cancelled = false;
    async function loadConfig() {
      setLoading(true);
      try {
        const cfg = await getContractConfigViaApi(projectId);
        if (!cancelled) {
          setConfig(cfg);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError('Failed to load contract configuration.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadConfig();
    return () => { cancelled = true; };
  }, [projectId]);

  const dataSheet = useMemo(() => {
    if (!config) return null;
    return getDataSheet(config, user.role, projectAssignment);
  }, [config, user.role, projectAssignment]);

  const handleFieldUpdate = useCallback(async (field: string, value: unknown) => {
    try {
      await updateContractParameterViaApi(projectId, field, value);
      // Reload config after update
      const cfg = await getContractConfigViaApi(projectId);
      setConfig(cfg);
    } catch {
      // TODO: surface error via toast in task 18
    }
  }, [projectId, user.uid, projectAssignment]);

  if (loading) {
    return (
      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
        <CardContent className="py-12 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-primary-400 animate-spin" />
          <span className="ml-3 text-surface-400 text-sm">Loading contract data sheet...</span>
        </CardContent>
      </Card>
    );
  }

  if (error || !config || !dataSheet) {
    return (
      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
        <CardContent className="py-12 text-center">
          <AlertCircle className="w-8 h-8 text-amber-400 mx-auto mb-3" />
          <p className="text-surface-300 text-sm">
            {error || 'No contract has been configured for this project yet.'}
          </p>
          <p className="text-xs text-surface-500 mt-2">
            Use the Setup tab to configure the project contract.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold text-white">Contract Data Sheet</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-surface-600 text-surface-300">
                {dataSheet.contractForm.value?.replace(/_/g, ' ').toUpperCase() || 'Not Set'}
              </Badge>
              {dataSheet.canEdit ? (
                <Badge className="bg-green-600/20 text-green-300 border border-green-600/50">
                  Editable
                </Badge>
              ) : (
                <Badge className="bg-surface-700/50 text-surface-400 border border-surface-600">
                  Read Only
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Contract Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <FieldCard
          icon={<DollarSign className="w-5 h-5 text-green-400" />}
          field={dataSheet.contractSum}
          formatValue={(v) => `R ${(v as number).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`}
          canEdit={dataSheet.canEdit}
          fieldKey="contractSum"
          onUpdate={handleFieldUpdate}
        />
        <FieldCard
          icon={<Clock className="w-5 h-5 text-blue-400" />}
          field={dataSheet.status}
          formatValue={(v) => String(v).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
          canEdit={false}
          fieldKey="status"
          onUpdate={handleFieldUpdate}
        />
        <FieldCard
          icon={<Calendar className="w-5 h-5 text-purple-400" />}
          field={dataSheet.electedClausesCount}
          formatValue={(v) => `${v} clauses`}
          canEdit={false}
          fieldKey="electedClausesCount"
          onUpdate={handleFieldUpdate}
        />
      </div>

      {/* Key Dates */}
      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-400" /> Key Dates
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <DataFieldRow field={dataSheet.keyDates.commencementDate} canEdit={dataSheet.canEdit} fieldKey="commencementDate" onUpdate={handleFieldUpdate} />
            <DataFieldRow field={dataSheet.keyDates.practicalCompletionDate} canEdit={dataSheet.canEdit} fieldKey="practicalCompletionDate" onUpdate={handleFieldUpdate} />
            <DataFieldRow field={dataSheet.keyDates.revisedCompletionDate} canEdit={dataSheet.canEdit} fieldKey="revisedCompletionDate" onUpdate={handleFieldUpdate} />
            <DataFieldRow field={dataSheet.keyDates.defectsLiabilityEndDate} canEdit={false} fieldKey="defectsLiabilityEndDate" onUpdate={handleFieldUpdate} />
            <DataFieldRow field={dataSheet.keyDates.finalAccountDate} canEdit={false} fieldKey="finalAccountDate" onUpdate={handleFieldUpdate} />
          </div>
        </CardContent>
      </Card>

      {/* Named Persons */}
      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-purple-400" /> Named Persons ({dataSheet.namedPersons.totalParties})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {dataSheet.namedPersons.parties.map((person) => (
              <div
                key={person.id}
                className="flex items-center justify-between p-3 rounded-lg bg-surface-900/50 border border-surface-700/30"
              >
                <div>
                  <p className="text-sm font-medium text-white">{person.name}</p>
                  <p className="text-xs text-surface-400 capitalize">{person.role.replace(/_/g, ' ')}</p>
                </div>
                <div className="text-right">
                  {person.contactEmail.configured ? (
                    <p className="text-xs text-surface-300">{person.contactEmail.value}</p>
                  ) : (
                    <PendingBadge />
                  )}
                </div>
              </div>
            ))}
            {dataSheet.namedPersons.parties.length === 0 && (
              <p className="text-sm text-surface-500 italic text-center py-4">
                No parties configured yet.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Commercial Rates */}
      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-green-400" /> Commercial Rates
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <DataFieldRow
              field={dataSheet.commercialRates.penaltyRatePerDay}
              canEdit={dataSheet.canEdit}
              fieldKey="penaltyRatePerDay"
              onUpdate={handleFieldUpdate}
            />
            <DataFieldRow
              field={dataSheet.commercialRates.retentionPercentage}
              canEdit={dataSheet.canEdit}
              fieldKey="retentionPercentage"
              onUpdate={handleFieldUpdate}
            />
            <DataFieldRow
              field={dataSheet.commercialRates.performanceGuaranteePercentage}
              canEdit={dataSheet.canEdit}
              fieldKey="performanceGuaranteePercentage"
              onUpdate={handleFieldUpdate}
            />
            <DataFieldRow
              field={dataSheet.commercialRates.insuranceRequirements}
              canEdit={false}
              fieldKey="insuranceRequirements"
              onUpdate={handleFieldUpdate}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Sub-Components
// ══════════════════════════════════════════════════════════════════════════════

function PendingBadge() {
  return (
    <Badge variant="outline" className="text-amber-400 border-amber-600/50 text-xs">
      Pending
    </Badge>
  );
}

function FieldCard({
  icon,
  field,
  formatValue,
  canEdit,
  fieldKey,
  onUpdate,
}: {
  icon: React.ReactNode;
  field: DataSheetField;
  formatValue: (value: unknown) => string;
  canEdit: boolean;
  fieldKey: string;
  onUpdate: (field: string, value: unknown) => Promise<void>;
}) {
  return (
    <div className="bg-surface-800/70 backdrop-blur border border-surface-700/50 rounded-lg p-4 flex items-center gap-3">
      {icon}
      <div className="flex-1">
        <p className="text-xs text-surface-400 uppercase tracking-wider">{field.label}</p>
        {field.configured ? (
          <p className="text-lg font-semibold text-white">{formatValue(field.value)}</p>
        ) : (
          <PendingBadge />
        )}
      </div>
    </div>
  );
}

function DataFieldRow({
  field,
  canEdit,
  fieldKey,
  onUpdate,
}: {
  field: DataSheetField;
  canEdit: boolean;
  fieldKey: string;
  onUpdate: (field: string, value: unknown) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const startEdit = () => {
    if (!canEdit) return;
    setEditValue(field.value != null ? String(field.value) : '');
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditValue('');
  };

  const confirmEdit = async () => {
    await onUpdate(fieldKey, editValue);
    setEditing(false);
  };

  const displayValue = (): string => {
    if (!field.configured || field.value == null) return '';
    if (typeof field.value === 'object') {
      return JSON.stringify(field.value);
    }
    return String(field.value);
  };

  return (
    <div className="p-3 rounded-lg bg-surface-900/50 border border-surface-700/30">
      <p className="text-xs text-surface-400 uppercase tracking-wider mb-1">{field.label}</p>
      {editing ? (
        <div className="flex items-center gap-2">
          <Input
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="h-8 bg-surface-800 border-surface-600 text-sm"
            autoFocus
          />
          <Button variant="ghost" size="sm" onClick={confirmEdit} className="text-green-400 p-1">
            <Check className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={cancelEdit} className="text-red-400 p-1">
            <X className="w-4 h-4" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          {field.configured ? (
            <p className="text-sm text-white font-medium">{displayValue()}</p>
          ) : (
            <PendingBadge />
          )}
          {canEdit && field.configured && (
            <Button
              variant="ghost"
              size="sm"
              onClick={startEdit}
              className="text-surface-400 hover:text-white p-1"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default ContractDataSheet;
