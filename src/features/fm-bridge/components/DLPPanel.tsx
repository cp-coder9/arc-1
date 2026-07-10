/**
 * FM Bridge — DLP Panel Component
 *
 * Defects Liability Period management UI:
 * - DLP countdown display (days remaining)
 * - Defect logging form (description, location, category, severity, photos)
 * - Defect list with stage progression badges
 * - Summary report (total/closed/outstanding)
 *
 * Requirements: 5.2, 5.3
 */

import React, { useState, useMemo } from 'react';
import {
  Clock,
  AlertTriangle,
  Plus,
  Camera,
  X,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type {
  FMBuildingRole,
  DLPRecord,
  DefectRecord,
  DefectCategory,
  DefectSeverity,
  DefectStage,
} from '../types';

// ─── Props ────────────────────────────────────────────────────────────────────

interface DLPPanelProps {
  buildingId: string;
  userRole: FMBuildingRole;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFECT_CATEGORIES: { value: DefectCategory; label: string }[] = [
  { value: 'structural', label: 'Structural' },
  { value: 'mechanical', label: 'Mechanical' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'finishes', label: 'Finishes' },
  { value: 'external', label: 'External' },
  { value: 'other', label: 'Other' },
];

const DEFECT_SEVERITIES: { value: DefectSeverity; label: string }[] = [
  { value: 'critical', label: 'Critical' },
  { value: 'major', label: 'Major' },
  { value: 'minor', label: 'Minor' },
  { value: 'cosmetic', label: 'Cosmetic' },
];

const STAGE_LABELS: Record<DefectStage, string> = {
  logged: 'Logged',
  notified: 'Notified',
  inspection_scheduled: 'Inspection Scheduled',
  rectification_in_progress: 'Rectification',
  rectified: 'Rectified',
  verified: 'Verified',
  closed: 'Closed',
};

const STAGE_STYLES: Record<DefectStage, string> = {
  logged: 'bg-slate-800/60 text-slate-300 border-slate-600/50',
  notified: 'bg-amber-950/40 text-amber-300 border-amber-700/50',
  inspection_scheduled: 'bg-blue-950/40 text-blue-300 border-blue-700/50',
  rectification_in_progress: 'bg-purple-950/40 text-purple-300 border-purple-700/50',
  rectified: 'bg-emerald-950/40 text-emerald-300 border-emerald-700/50',
  verified: 'bg-green-950/40 text-green-300 border-green-700/50',
  closed: 'bg-green-900/50 text-green-200 border-green-600/50',
};

const SEVERITY_STYLES: Record<DefectSeverity, string> = {
  critical: 'bg-red-950/40 text-red-300 border-red-700/50',
  major: 'bg-amber-950/40 text-amber-300 border-amber-700/50',
  minor: 'bg-blue-950/40 text-blue-300 border-blue-700/50',
  cosmetic: 'bg-slate-800/50 text-slate-300 border-slate-600/50',
};

// ─── Demo Data ────────────────────────────────────────────────────────────────

const DEMO_DLP: DLPRecord = {
  id: 'dlp_001',
  buildingId: 'bld_001',
  startDate: '2026-03-15',
  endDate: '2026-06-13',
  durationDays: 90,
  mainContractorRef: 'Moyo Construction (Pty) Ltd',
  principalAgentRef: 'Arch Studio SA',
  status: 'active',
  createdAt: '2026-03-15T08:00:00Z',
  updatedAt: '2026-03-15T08:00:00Z',
};

const DEMO_DEFECTS: DefectRecord[] = [
  {
    id: 'def_001',
    dlpId: 'dlp_001',
    buildingId: 'bld_001',
    description: 'Cracking at junction between internal wall and ceiling in unit 4B living room. Crack runs approximately 1.2m along junction.',
    locationInBuilding: 'Unit 4B — Living Room, north wall/ceiling junction',
    category: 'finishes',
    severity: 'minor',
    photographicEvidence: ['photo_001', 'photo_002'],
    dateDiscovered: '2026-04-10',
    responsibleTrade: 'Plastering',
    stage: 'rectification_in_progress',
    isPostDLP: false,
    stageHistory: [
      { stage: 'logged', date: '2026-04-10', actor: 'user_fm_001' },
      { stage: 'notified', date: '2026-04-11', actor: 'system' },
      { stage: 'inspection_scheduled', date: '2026-04-14', actor: 'user_pa_001' },
      { stage: 'rectification_in_progress', date: '2026-04-18', actor: 'user_contractor_001' },
    ],
    createdAt: '2026-04-10T09:00:00Z',
    updatedAt: '2026-04-18T14:00:00Z',
  },
  {
    id: 'def_002',
    dlpId: 'dlp_001',
    buildingId: 'bld_001',
    description: 'Hot water supply intermittent in ground-floor communal bathroom. Water runs hot for ~30s then drops to cold.',
    locationInBuilding: 'Ground Floor — Communal Bathroom B',
    category: 'plumbing',
    severity: 'major',
    photographicEvidence: [],
    dateDiscovered: '2026-04-22',
    responsibleTrade: 'Plumbing',
    stage: 'notified',
    isPostDLP: false,
    stageHistory: [
      { stage: 'logged', date: '2026-04-22', actor: 'user_fm_001' },
      { stage: 'notified', date: '2026-04-23', actor: 'system' },
    ],
    createdAt: '2026-04-22T11:00:00Z',
    updatedAt: '2026-04-23T08:00:00Z',
  },
  {
    id: 'def_003',
    dlpId: 'dlp_001',
    buildingId: 'bld_001',
    description: 'Garage door motor failure — door will not open or close using remote or wall switch.',
    locationInBuilding: 'Basement Parking — Bay 12',
    category: 'mechanical',
    severity: 'critical',
    photographicEvidence: ['photo_003'],
    dateDiscovered: '2026-05-01',
    responsibleTrade: 'Electrical / Automation',
    stage: 'logged',
    isPostDLP: false,
    stageHistory: [
      { stage: 'logged', date: '2026-05-01', actor: 'user_fm_001' },
    ],
    createdAt: '2026-05-01T07:00:00Z',
    updatedAt: '2026-05-01T07:00:00Z',
  },
  {
    id: 'def_004',
    dlpId: 'dlp_001',
    buildingId: 'bld_001',
    description: 'Paint peeling on external east-facing balcony railing (3rd floor). Approximately 2m² affected.',
    locationInBuilding: '3rd Floor — East balcony railing',
    category: 'external',
    severity: 'cosmetic',
    photographicEvidence: ['photo_004', 'photo_005'],
    dateDiscovered: '2026-04-05',
    responsibleTrade: 'Painting',
    stage: 'closed',
    isPostDLP: false,
    stageHistory: [
      { stage: 'logged', date: '2026-04-05', actor: 'user_fm_001' },
      { stage: 'notified', date: '2026-04-06', actor: 'system' },
      { stage: 'inspection_scheduled', date: '2026-04-08', actor: 'user_pa_001' },
      { stage: 'rectification_in_progress', date: '2026-04-09', actor: 'user_contractor_001' },
      { stage: 'rectified', date: '2026-04-11', actor: 'user_contractor_001' },
      { stage: 'verified', date: '2026-04-12', actor: 'user_fm_001' },
      { stage: 'closed', date: '2026-04-12', actor: 'user_fm_001' },
    ],
    createdAt: '2026-04-05T10:00:00Z',
    updatedAt: '2026-04-12T16:00:00Z',
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function DLPPanel({ buildingId: _buildingId, userRole }: DLPPanelProps) {
  const dlp = DEMO_DLP;
  const defects = DEMO_DEFECTS;

  const [showForm, setShowForm] = useState(false);
  const [formDescription, setFormDescription] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formCategory, setFormCategory] = useState<DefectCategory>('other');
  const [formSeverity, setFormSeverity] = useState<DefectSeverity>('minor');
  const [formPhotos, setFormPhotos] = useState<string[]>([]);

  const canLogDefects = userRole !== 'read_only';

  // ─── Countdown Calculation ────────────────────────────────────────────────

  const countdown = useMemo(() => {
    const now = new Date();
    const endDate = new Date(dlp.endDate);
    const msPerDay = 24 * 60 * 60 * 1000;
    const remaining = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / msPerDay));
    const isExpired = remaining <= 0;
    return { remaining, isExpired };
  }, [dlp.endDate]);

  // ─── Summary Metrics ──────────────────────────────────────────────────────

  const summary = useMemo(() => {
    const total = defects.length;
    const closed = defects.filter((d) => d.stage === 'closed').length;
    const outstanding = total - closed;
    const outstandingBySeverity = {
      critical: defects.filter((d) => d.stage !== 'closed' && d.severity === 'critical').length,
      major: defects.filter((d) => d.stage !== 'closed' && d.severity === 'major').length,
      minor: defects.filter((d) => d.stage !== 'closed' && d.severity === 'minor').length,
      cosmetic: defects.filter((d) => d.stage !== 'closed' && d.severity === 'cosmetic').length,
    };
    return { total, closed, outstanding, outstandingBySeverity };
  }, [defects]);

  // ─── Form Handlers ────────────────────────────────────────────────────────

  const handleAddPhoto = () => {
    if (formPhotos.length < 10) {
      setFormPhotos([...formPhotos, `photo_new_${Date.now()}`]);
    }
  };

  const handleRemovePhoto = (index: number) => {
    setFormPhotos(formPhotos.filter((_, i) => i !== index));
  };

  const handleSubmitDefect = () => {
    // In production this would call the DLP Manager service
    // For now, just reset the form
    setFormDescription('');
    setFormLocation('');
    setFormCategory('other');
    setFormSeverity('minor');
    setFormPhotos([]);
    setShowForm(false);
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* DLP Countdown */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-400" aria-hidden="true" />
              <CardTitle className="text-base">Defects Liability Period</CardTitle>
            </div>
            <Badge
              variant="secondary"
              className={
                countdown.isExpired
                  ? 'bg-red-950/40 text-red-300 border-red-700/50'
                  : dlp.status === 'all_defects_resolved'
                    ? 'bg-green-950/40 text-green-300 border-green-700/50'
                    : 'bg-blue-950/40 text-blue-300 border-blue-700/50'
              }
            >
              {countdown.isExpired ? 'Expired' : dlp.status === 'all_defects_resolved' ? 'Resolved' : 'Active'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* Days Remaining */}
            <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-4 text-center">
              <p className="text-3xl font-bold text-blue-300">{countdown.remaining}</p>
              <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">Days Remaining</p>
            </div>
            {/* Contractor */}
            <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Main Contractor</p>
              <p className="mt-1 text-sm font-medium">{dlp.mainContractorRef}</p>
            </div>
            {/* Period */}
            <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">DLP Period</p>
              <p className="mt-1 text-sm font-medium">{dlp.startDate} → {dlp.endDate}</p>
            </div>
          </div>

          {countdown.remaining <= 30 && !countdown.isExpired && (
            <div className="mt-3 flex items-center gap-2 rounded border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>DLP expiry approaching — ensure all outstanding defects are recorded before expiry.</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary Report */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Defect Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-3 text-center">
              <p className="text-2xl font-bold">{summary.total}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
            <div className="rounded-lg border border-green-700/50 bg-green-950/20 p-3 text-center">
              <p className="text-2xl font-bold text-green-300">{summary.closed}</p>
              <p className="text-xs text-muted-foreground">Closed</p>
            </div>
            <div className="rounded-lg border border-amber-700/50 bg-amber-950/20 p-3 text-center">
              <p className="text-2xl font-bold text-amber-300">{summary.outstanding}</p>
              <p className="text-xs text-muted-foreground">Outstanding</p>
            </div>
            <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-3">
              <p className="mb-1 text-xs text-muted-foreground">By Severity</p>
              <div className="space-y-0.5 text-xs">
                {summary.outstandingBySeverity.critical > 0 && (
                  <span className="mr-2 text-red-300">Crit: {summary.outstandingBySeverity.critical}</span>
                )}
                {summary.outstandingBySeverity.major > 0 && (
                  <span className="mr-2 text-amber-300">Maj: {summary.outstandingBySeverity.major}</span>
                )}
                {summary.outstandingBySeverity.minor > 0 && (
                  <span className="mr-2 text-blue-300">Min: {summary.outstandingBySeverity.minor}</span>
                )}
                {summary.outstandingBySeverity.cosmetic > 0 && (
                  <span className="text-slate-300">Cos: {summary.outstandingBySeverity.cosmetic}</span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Defect Logging Form */}
      {canLogDefects && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Log Defect</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowForm(!showForm)}
                className="gap-1"
              >
                {showForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                {showForm ? 'Cancel' : 'New Defect'}
              </Button>
            </div>
          </CardHeader>
          {showForm && (
            <CardContent>
              <div className="space-y-4">
                {/* Description */}
                <div>
                  <label htmlFor="defect-description" className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">
                    Description *
                  </label>
                  <textarea
                    id="defect-description"
                    className="w-full rounded-md border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    rows={3}
                    maxLength={2000}
                    placeholder="Describe the defect in detail..."
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                  />
                  <p className="mt-0.5 text-xs text-muted-foreground">{formDescription.length}/2000</p>
                </div>

                {/* Location */}
                <div>
                  <label htmlFor="defect-location" className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">
                    Location *
                  </label>
                  <input
                    id="defect-location"
                    type="text"
                    className="w-full rounded-md border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    maxLength={500}
                    placeholder="e.g. Unit 3A — Kitchen, south wall"
                    value={formLocation}
                    onChange={(e) => setFormLocation(e.target.value)}
                  />
                </div>

                {/* Category & Severity Row */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="defect-category" className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">
                      Category *
                    </label>
                    <select
                      id="defect-category"
                      className="w-full rounded-md border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value as DefectCategory)}
                    >
                      {DEFECT_CATEGORIES.map((cat) => (
                        <option key={cat.value} value={cat.value}>{cat.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="defect-severity" className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">
                      Severity *
                    </label>
                    <select
                      id="defect-severity"
                      className="w-full rounded-md border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={formSeverity}
                      onChange={(e) => setFormSeverity(e.target.value as DefectSeverity)}
                    >
                      {DEFECT_SEVERITIES.map((sev) => (
                        <option key={sev.value} value={sev.value}>{sev.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Photos */}
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">
                    Photographic Evidence ({formPhotos.length}/10)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {formPhotos.map((photo, idx) => (
                      <div
                        key={photo}
                        className="flex items-center gap-1 rounded border border-slate-700 bg-slate-800/50 px-2 py-1 text-xs"
                      >
                        <Camera className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                        <span>Photo {idx + 1}</span>
                        <button
                          type="button"
                          onClick={() => handleRemovePhoto(idx)}
                          className="ml-1 text-red-400 hover:text-red-300"
                          aria-label={`Remove photo ${idx + 1}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    {formPhotos.length < 10 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleAddPhoto}
                        className="gap-1 text-xs"
                      >
                        <Camera className="h-3 w-3" />
                        Add Photo
                      </Button>
                    )}
                  </div>
                </div>

                {/* Submit */}
                <Button
                  onClick={handleSubmitDefect}
                  disabled={!formDescription.trim() || !formLocation.trim()}
                  className="gap-1"
                >
                  <Plus className="h-4 w-4" />
                  Log Defect
                </Button>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Defect List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Defects ({defects.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {defects.length === 0 ? (
            <p className="text-sm text-muted-foreground">No defects logged.</p>
          ) : (
            <div className="space-y-3">
              {defects.map((defect) => (
                <div
                  key={defect.id}
                  className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-3"
                >
                  <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-sm font-medium leading-snug">{defect.description}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{defect.locationInBuilding}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${SEVERITY_STYLES[defect.severity]}`}>
                        {defect.severity}
                      </span>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STAGE_STYLES[defect.stage]}`}>
                        {STAGE_LABELS[defect.stage]}
                      </span>
                    </div>
                  </div>
                  {/* Stage progression badges */}
                  <div className="flex flex-wrap items-center gap-1 text-[9px]">
                    {defect.stageHistory.map((entry, idx) => (
                      <React.Fragment key={`${entry.stage}-${idx}`}>
                        <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 ${STAGE_STYLES[entry.stage]}`}>
                          {idx === defect.stageHistory.length - 1 && defect.stage === 'closed' && (
                            <CheckCircle2 className="h-2.5 w-2.5" aria-hidden="true" />
                          )}
                          {STAGE_LABELS[entry.stage]}
                        </span>
                        {idx < defect.stageHistory.length - 1 && (
                          <ArrowRight className="h-2.5 w-2.5 text-slate-600" aria-hidden="true" />
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>Discovered: {defect.dateDiscovered}</span>
                    {defect.responsibleTrade && <span>Trade: {defect.responsibleTrade}</span>}
                    {defect.photographicEvidence.length > 0 && (
                      <span className="flex items-center gap-0.5">
                        <Camera className="h-3 w-3" aria-hidden="true" />
                        {defect.photographicEvidence.length}
                      </span>
                    )}
                    {defect.isPostDLP && (
                      <Badge variant="secondary" className="bg-red-950/40 text-red-300 border-red-700/50 text-[9px]">
                        Post-DLP
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
