/**
 * EIACheckerView — EIA Screening Checklist Component
 *
 * Structured checklist organised by NEMA EIA Regulations 2014 listing notices.
 * Allows users to select triggered activities, input geographic context,
 * view assessment determination, and generate a screening report.
 *
 * Requirements: 15.1, 15.3, 15.6
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  ClipboardCheck,
  MapPin,
  FileText,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { UserProfile } from '@/types';
import type {
  SelectedActivity,
  GeographicContext,
  ScreeningReport,
  ListingNotice,
  AssessmentType,
} from '../types';
import { determineAssessmentType, generateScreeningReport } from '../services/eiaChecker';
import { DisclaimerBanner } from './DisclaimerBanner';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface EIACheckerViewProps {
  user: UserProfile;
  projectId: string;
  projectName?: string;
}

// ─── Sample Listed Activities (Simplified Summaries) ──────────────────────────

interface ListedActivityItem {
  listingNotice: ListingNotice;
  activityNumber: string;
  description: string;
}

const LISTING_NOTICE_1_ACTIVITIES: ListedActivityItem[] = [
  { listingNotice: 'listing_notice_1', activityNumber: '1', description: 'Construction of facilities or infrastructure for the generation of electricity from a renewable resource (wind, solar concentrated, hydropower, biomass) where capacity exceeds 10MW' },
  { listingNotice: 'listing_notice_1', activityNumber: '9', description: 'Construction of facilities or infrastructure for the transmission and distribution of electricity with a capacity of 275kV or more' },
  { listingNotice: 'listing_notice_1', activityNumber: '12', description: 'Construction of facilities or infrastructure for bulk transportation of water or storm water exceeding 36 inches' },
  { listingNotice: 'listing_notice_1', activityNumber: '19', description: 'Infilling or depositing of material exceeding 10 cubic metres into a watercourse' },
  { listingNotice: 'listing_notice_1', activityNumber: '24', description: 'Development of a road wider than 8 metres or a road with a reserve wider than 13.5 metres' },
  { listingNotice: 'listing_notice_1', activityNumber: '27', description: 'Clearance of indigenous vegetation of 1 hectare or more' },
  { listingNotice: 'listing_notice_1', activityNumber: '28', description: 'Residential, mixed-use, retail, commercial, industrial or institutional developments where total area exceeds 1 hectare' },
  { listingNotice: 'listing_notice_1', activityNumber: '30', description: 'Any process or activity that requires a permit or licence under national or provincial legislation relating to waste management' },
];

const LISTING_NOTICE_2_ACTIVITIES: ListedActivityItem[] = [
  { listingNotice: 'listing_notice_2', activityNumber: '1', description: 'Construction of a facility or infrastructure for the generation of electricity from nuclear fuels' },
  { listingNotice: 'listing_notice_2', activityNumber: '2', description: 'Construction of facilities or infrastructure for the refining, extraction or processing of gas, oil, or petroleum products' },
  { listingNotice: 'listing_notice_2', activityNumber: '6', description: 'Construction of facilities for any process requiring a waste management licence' },
  { listingNotice: 'listing_notice_2', activityNumber: '11', description: 'Construction of railway lines, stations, and associated structures exceeding 1km' },
  { listingNotice: 'listing_notice_2', activityNumber: '15', description: 'Construction of a dam with a capacity of more than 50,000 cubic metres' },
  { listingNotice: 'listing_notice_2', activityNumber: '17', description: 'Any activity that requires a mining right, prospecting right, or exploration right' },
  { listingNotice: 'listing_notice_2', activityNumber: '19', description: 'Expansion of runway or aircraft landing strip where expanded area exceeds 1.4km in length' },
];

const LISTING_NOTICE_3_ACTIVITIES: ListedActivityItem[] = [
  { listingNotice: 'listing_notice_3', activityNumber: '4', description: 'Construction of a road wider than 4 metres in specified geographical areas' },
  { listingNotice: 'listing_notice_3', activityNumber: '10', description: 'Storage and handling of dangerous goods in specified geographical areas' },
  { listingNotice: 'listing_notice_3', activityNumber: '12', description: 'Clearance of indigenous vegetation of 300 square metres or more in specified geographical areas' },
  { listingNotice: 'listing_notice_3', activityNumber: '14', description: 'Development exceeding 1,000 square metres in specified geographical areas including coastal zones and sensitive environments' },
  { listingNotice: 'listing_notice_3', activityNumber: '18', description: 'Widening of a road by more than 4 metres in specified geographical areas' },
  { listingNotice: 'listing_notice_3', activityNumber: '21', description: 'Subdivision of land into portions of 2000 square metres or less in specified geographical areas' },
];

// ─── Province list ────────────────────────────────────────────────────────────

const SA_PROVINCES = [
  'Gauteng',
  'Western Cape',
  'KwaZulu-Natal',
  'Eastern Cape',
  'Free State',
  'Limpopo',
  'Mpumalanga',
  'North West',
  'Northern Cape',
];

// ─── Component ────────────────────────────────────────────────────────────────

export function EIACheckerView({ user, projectId, projectName }: EIACheckerViewProps) {
  // ─── State ────────────────────────────────────────────────────────────────
  const [selectedActivities, setSelectedActivities] = useState<SelectedActivity[]>([]);
  const [geographicContext, setGeographicContext] = useState<GeographicContext>({
    province: '',
    municipality: '',
    isCoastalZone: false,
    isUrbanArea: false,
    isSensitiveEnvironment: false,
  });
  const [screeningReport, setScreeningReport] = useState<ScreeningReport | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── Section Collapse State ───────────────────────────────────────────────
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    listing_notice_1: true,
    listing_notice_2: true,
    listing_notice_3: true,
  });

  // ─── Live Assessment Determination ────────────────────────────────────────
  const assessmentDetermination = useMemo(() => {
    if (selectedActivities.length === 0) return null;
    const result = determineAssessmentType(selectedActivities, geographicContext.province || undefined);
    if (result.success) return result.data;
    return null;
  }, [selectedActivities, geographicContext.province]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const toggleActivity = useCallback((item: ListedActivityItem) => {
    setSelectedActivities((prev) => {
      const exists = prev.some(
        (a) => a.listingNotice === item.listingNotice && a.activityNumber === item.activityNumber,
      );
      if (exists) {
        return prev.filter(
          (a) => !(a.listingNotice === item.listingNotice && a.activityNumber === item.activityNumber),
        );
      }
      return [...prev, { listingNotice: item.listingNotice, activityNumber: item.activityNumber, description: item.description }];
    });
    setScreeningReport(null);
    setError(null);
  }, []);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const isActivitySelected = (item: ListedActivityItem) =>
    selectedActivities.some(
      (a) => a.listingNotice === item.listingNotice && a.activityNumber === item.activityNumber,
    );

  const handleGenerateReport = useCallback(() => {
    setError(null);
    setIsGenerating(true);

    const result = generateScreeningReport(
      { projectId, projectName: projectName || `Project ${projectId}` },
      selectedActivities,
      geographicContext,
      { uid: user.uid, displayName: user.displayName },
      new Date(),
    );

    setIsGenerating(false);

    if (result.success) {
      setScreeningReport(result.data);
    } else {
      setError((result as Extract<typeof result, { success: false }>).error.message);
    }
  }, [selectedActivities, geographicContext, projectId, projectName, user]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Disclaimer Banner */}
      <DisclaimerBanner />

      {/* Activities Checklist */}
      <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
        <CardHeader className="border-b border-border">
          <CardTitle className="text-lg flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-primary" aria-hidden="true" />
            NEMA Listed Activities Screening
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          {/* Listing Notice 1 */}
          <ListingNoticeSection
            title="Listing Notice 1 (GN R983) — Basic Assessment"
            listingNotice="listing_notice_1"
            activities={LISTING_NOTICE_1_ACTIVITIES}
            expanded={expandedSections.listing_notice_1}
            onToggleSection={() => toggleSection('listing_notice_1')}
            onToggleActivity={toggleActivity}
            isActivitySelected={isActivitySelected}
          />

          {/* Listing Notice 2 */}
          <ListingNoticeSection
            title="Listing Notice 2 (GN R984) — Scoping & EIR"
            listingNotice="listing_notice_2"
            activities={LISTING_NOTICE_2_ACTIVITIES}
            expanded={expandedSections.listing_notice_2}
            onToggleSection={() => toggleSection('listing_notice_2')}
            onToggleActivity={toggleActivity}
            isActivitySelected={isActivitySelected}
          />

          {/* Listing Notice 3 */}
          <ListingNoticeSection
            title="Listing Notice 3 (GN R985) — Provincial/Location-Specific"
            listingNotice="listing_notice_3"
            activities={LISTING_NOTICE_3_ACTIVITIES}
            expanded={expandedSections.listing_notice_3}
            onToggleSection={() => toggleSection('listing_notice_3')}
            onToggleActivity={toggleActivity}
            isActivitySelected={isActivitySelected}
          />
        </CardContent>
      </Card>

      {/* Geographic Context Inputs */}
      <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
        <CardHeader className="border-b border-border">
          <CardTitle className="text-lg flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" aria-hidden="true" />
            Geographic Context
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Province */}
            <div className="space-y-1.5">
              <label htmlFor="province" className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                Province <span className="text-red-400">*</span>
              </label>
              <select
                id="province"
                value={geographicContext.province}
                onChange={(e) =>
                  setGeographicContext((prev) => ({ ...prev, province: e.target.value }))
                }
                className="w-full rounded-lg border border-border bg-surface-800 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                aria-required="true"
              >
                <option value="">Select province…</option>
                {SA_PROVINCES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            {/* Municipality */}
            <div className="space-y-1.5">
              <label htmlFor="municipality" className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                Municipality
              </label>
              <input
                id="municipality"
                type="text"
                value={geographicContext.municipality || ''}
                onChange={(e) =>
                  setGeographicContext((prev) => ({ ...prev, municipality: e.target.value }))
                }
                placeholder="Enter municipality name"
                className="w-full rounded-lg border border-border bg-surface-800 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            {/* Specified Geographical Area Toggles */}
            <div className="col-span-full space-y-3 pt-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                Specified Geographical Area (Listing Notice 3 applicability)
              </p>
              <div className="flex flex-wrap gap-4">
                <CheckboxField
                  id="coastal-zone"
                  label="Coastal Zone"
                  checked={geographicContext.isCoastalZone}
                  onChange={(v) => setGeographicContext((prev) => ({ ...prev, isCoastalZone: v }))}
                />
                <CheckboxField
                  id="urban-area"
                  label="Urban Area"
                  checked={geographicContext.isUrbanArea}
                  onChange={(v) => setGeographicContext((prev) => ({ ...prev, isUrbanArea: v }))}
                />
                <CheckboxField
                  id="sensitive-environment"
                  label="Sensitive Environment"
                  checked={geographicContext.isSensitiveEnvironment}
                  onChange={(v) => setGeographicContext((prev) => ({ ...prev, isSensitiveEnvironment: v }))}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Assessment Determination Display */}
      {assessmentDetermination && (
        <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
          <CardContent className="p-4">
            <AssessmentDeterminationDisplay
              assessmentType={assessmentDetermination.assessmentType}
              competentAuthority={assessmentDetermination.competentAuthority}
              selectedCount={selectedActivities.length}
            />
          </CardContent>
        </Card>
      )}

      {/* Error Display */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3" role="alert">
          <XCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {/* Generate Report Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleGenerateReport}
          disabled={selectedActivities.length === 0 || isGenerating}
          className="gap-2"
        >
          {isGenerating ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <FileText className="h-4 w-4" aria-hidden="true" />
          )}
          Generate Screening Report
        </Button>
      </div>

      {/* Screening Report Display */}
      {screeningReport && <ScreeningReportDisplay report={screeningReport} />}
    </div>
  );
}

// ─── Sub-Components ───────────────────────────────────────────────────────────

/** Collapsible Listing Notice section with activity checkboxes */
function ListingNoticeSection({
  title,
  listingNotice,
  activities,
  expanded,
  onToggleSection,
  onToggleActivity,
  isActivitySelected,
}: {
  title: string;
  listingNotice: string;
  activities: ListedActivityItem[];
  expanded: boolean;
  onToggleSection: () => void;
  onToggleActivity: (item: ListedActivityItem) => void;
  isActivitySelected: (item: ListedActivityItem) => boolean;
}) {
  const selectedCount = activities.filter(isActivitySelected).length;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggleSection}
        className="w-full flex items-center justify-between px-4 py-3 bg-surface-800/50 hover:bg-surface-800/70 transition-colors text-left"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          )}
          <span className="text-sm font-medium text-foreground">{title}</span>
        </div>
        {selectedCount > 0 && (
          <Badge className="bg-primary/20 text-primary border-primary/30">
            {selectedCount} selected
          </Badge>
        )}
      </button>
      {expanded && (
        <div className="divide-y divide-border">
          {activities.map((activity) => (
            <label
              key={`${activity.listingNotice}-${activity.activityNumber}`}
              className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-surface-800/30 transition-colors"
            >
              <input
                type="checkbox"
                checked={isActivitySelected(activity)}
                onChange={() => onToggleActivity(activity)}
                className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary/50"
                aria-label={`Activity ${activity.activityNumber}: ${activity.description}`}
              />
              <div className="flex-1 min-w-0">
                <span className="text-xs font-mono text-muted-foreground">
                  Activity {activity.activityNumber}
                </span>
                <p className="text-sm text-foreground leading-relaxed mt-0.5">
                  {activity.description}
                </p>
              </div>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/** Assessment determination result display */
function AssessmentDeterminationDisplay({
  assessmentType,
  competentAuthority,
  selectedCount,
}: {
  assessmentType: AssessmentType;
  competentAuthority: string;
  selectedCount: number;
}) {
  const configs: Record<AssessmentType, { label: string; color: string; icon: React.ReactNode }> = {
    none: {
      label: 'No Environmental Authorisation Required',
      color: 'text-emerald-400',
      icon: <CheckCircle2 className="h-5 w-5 text-emerald-400" aria-hidden="true" />,
    },
    basic_assessment: {
      label: 'Basic Assessment Required',
      color: 'text-amber-400',
      icon: <ClipboardCheck className="h-5 w-5 text-amber-400" aria-hidden="true" />,
    },
    scoping_and_eir: {
      label: 'Scoping & EIR Required',
      color: 'text-red-400',
      icon: <FileText className="h-5 w-5 text-red-400" aria-hidden="true" />,
    },
  };

  const config = configs[assessmentType];

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        {config.icon}
        <div>
          <p className={`text-base font-semibold ${config.color}`}>{config.label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {selectedCount} {selectedCount === 1 ? 'activity' : 'activities'} selected • Competent Authority: {competentAuthority}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Generated screening report display */
function ScreeningReportDisplay({ report }: { report: ScreeningReport }) {
  return (
    <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
      <CardHeader className="border-b border-border">
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="h-5 w-5 text-emerald-400" aria-hidden="true" />
          Screening Report
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        {/* Report Metadata */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Project</p>
            <p className="font-medium text-foreground mt-0.5">{report.projectName}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Screening Date</p>
            <p className="font-medium text-foreground mt-0.5">{report.screeningDate}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Performed By</p>
            <p className="font-medium text-foreground mt-0.5">{report.performedBy}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Assessment Type</p>
            <Badge
              className={
                report.assessmentType === 'scoping_and_eir'
                  ? 'bg-red-500/20 text-red-400 border-red-500/30'
                  : report.assessmentType === 'basic_assessment'
                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                    : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
              }
            >
              {report.assessmentType === 'scoping_and_eir'
                ? 'Scoping & EIR'
                : report.assessmentType === 'basic_assessment'
                  ? 'Basic Assessment'
                  : 'None Required'}
            </Badge>
          </div>
        </div>

        {/* Activities Selected */}
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
            Activities Selected ({report.activitiesSelected.length})
          </p>
          <div className="space-y-1">
            {report.activitiesSelected.map((a) => (
              <div
                key={`${a.listingNotice}-${a.activityNumber}`}
                className="flex items-center gap-2 text-sm"
              >
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {a.listingNotice === 'listing_notice_1'
                    ? 'LN1'
                    : a.listingNotice === 'listing_notice_2'
                      ? 'LN2'
                      : 'LN3'}
                  #{a.activityNumber}
                </Badge>
                <span className="text-muted-foreground truncate">{a.description}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Geographic Context */}
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
            Geographic Context
          </p>
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="outline">{report.geographicContext.province}</Badge>
            {report.geographicContext.municipality && (
              <Badge variant="outline">{report.geographicContext.municipality}</Badge>
            )}
            {report.geographicContext.isCoastalZone && <Badge variant="outline">Coastal Zone</Badge>}
            {report.geographicContext.isUrbanArea && <Badge variant="outline">Urban Area</Badge>}
            {report.geographicContext.isSensitiveEnvironment && (
              <Badge variant="outline">Sensitive Environment</Badge>
            )}
          </div>
        </div>

        {/* Next Steps */}
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
            Recommended Next Steps
          </p>
          <ul className="space-y-1">
            {report.nextSteps.map((step, index) => (
              <li key={index} className="flex items-start gap-2 text-sm text-foreground">
                <span className="text-muted-foreground mt-0.5 shrink-0">{index + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Competent Authority */}
        <div className="pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">Competent Authority:</span> {report.competentAuthority}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Utility Components ───────────────────────────────────────────────────────

function CheckboxField({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 cursor-pointer">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-border text-primary focus:ring-primary/50"
      />
      <span className="text-sm text-foreground">{label}</span>
    </label>
  );
}
