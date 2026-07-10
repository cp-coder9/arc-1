/**
 * Beacon Register Panel
 *
 * Beacon list with identifier, type, coordinates, condition status (color-coded).
 * Includes boundary line visualization showing beacon sequences.
 *
 * Requirements: 18.2, 22.8
 */

import React from 'react';
import { MapPin, Circle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Beacon, BeaconCondition, BoundaryLine } from '../types';

// ─── Condition Styling ────────────────────────────────────────────────────────

const CONDITION_STYLES: Record<BeaconCondition, { bg: string; text: string; label: string }> = {
  intact: { bg: 'bg-green-950/40 border-green-700/50', text: 'text-green-300', label: 'Intact' },
  damaged: { bg: 'bg-amber-950/40 border-amber-700/50', text: 'text-amber-300', label: 'Damaged' },
  missing: { bg: 'bg-red-950/40 border-red-700/50', text: 'text-red-300', label: 'Missing' },
  replaced: { bg: 'bg-blue-950/40 border-blue-700/50', text: 'text-blue-300', label: 'Replaced' },
};

const BEACON_TYPE_LABELS: Record<string, string> = {
  iron_peg: 'Iron Peg',
  concrete_block: 'Concrete Block',
  nail_in_tar: 'Nail in Tar',
  reference_mark: 'Reference Mark',
  trigonometric_beacon: 'Trigonometric',
  other: 'Other',
};

// ─── Demo Data ────────────────────────────────────────────────────────────────

const DEMO_BEACONS: Beacon[] = [
  {
    id: 'bcn_001',
    projectId: 'proj_001',
    identifier: 'BN-A001',
    beaconType: 'iron_peg',
    latitude: -26.107567,
    longitude: 28.056702,
    coordinateSystem: 'WGS84',
    condition: 'intact',
    dateLastInspected: '2026-05-15',
    linkedDiagramRef: 'SG-2026/001',
    replacementHistory: [],
    createdAt: '2026-04-01T08:00:00Z',
    updatedAt: '2026-05-15T10:00:00Z',
  },
  {
    id: 'bcn_002',
    projectId: 'proj_001',
    identifier: 'BN-A002',
    beaconType: 'concrete_block',
    latitude: -26.107890,
    longitude: 28.057100,
    coordinateSystem: 'WGS84',
    condition: 'damaged',
    dateLastInspected: '2026-05-15',
    notes: 'Cap displaced, peg visible',
    replacementHistory: [],
    createdAt: '2026-04-01T08:00:00Z',
    updatedAt: '2026-05-15T10:00:00Z',
  },
  {
    id: 'bcn_003',
    projectId: 'proj_001',
    identifier: 'BN-A003',
    beaconType: 'iron_peg',
    latitude: -26.108200,
    longitude: 28.057450,
    coordinateSystem: 'WGS84',
    condition: 'missing',
    dateLastInspected: '2026-05-15',
    notes: 'Not found during inspection',
    replacementHistory: [],
    createdAt: '2026-04-01T08:00:00Z',
    updatedAt: '2026-05-15T10:00:00Z',
  },
  {
    id: 'bcn_004',
    projectId: 'proj_001',
    identifier: 'BN-A004',
    beaconType: 'nail_in_tar',
    latitude: -26.107300,
    longitude: 28.057100,
    coordinateSystem: 'WGS84',
    condition: 'replaced',
    dateLastInspected: '2026-05-20',
    replacementHistory: [
      {
        date: '2026-05-20',
        newLatitude: -26.107300,
        newLongitude: 28.057100,
        replacingSurveyorId: 'surveyor_001',
        reason: 'Original beacon destroyed during construction',
        evidenceRefs: ['DOC-EV-001'],
      },
    ],
    createdAt: '2026-04-01T08:00:00Z',
    updatedAt: '2026-05-20T14:00:00Z',
  },
];

const DEMO_BOUNDARY_LINES: BoundaryLine[] = [
  {
    id: 'bl_001',
    projectId: 'proj_001',
    parcelIdentifier: 'Erf 123/45',
    beaconSequence: ['BN-A001', 'BN-A002', 'BN-A003', 'BN-A004', 'BN-A001'],
    createdAt: '2026-04-02T10:00:00Z',
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function BeaconRegisterPanel() {
  const beacons = DEMO_BEACONS;
  const boundaryLines = DEMO_BOUNDARY_LINES;

  const formatCoordinates = (beacon: Beacon): string => {
    if (beacon.coordinateSystem === 'WGS84' && beacon.latitude != null && beacon.longitude != null) {
      return `${beacon.latitude.toFixed(6)}°, ${beacon.longitude.toFixed(6)}°`;
    }
    if (beacon.yCoordinate != null && beacon.xCoordinate != null) {
      return `Y: ${beacon.yCoordinate.toFixed(3)}, X: ${beacon.xCoordinate.toFixed(3)}`;
    }
    return 'No coordinates';
  };

  return (
    <div className="mt-4 space-y-4">
      {/* Beacon List */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-blue-400" aria-hidden="true" />
            <CardTitle className="text-base">Beacon Register</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" role="table">
              <thead>
                <tr className="border-b border-slate-700/50 text-left">
                  <th className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Identifier</th>
                  <th className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Type</th>
                  <th className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Coordinates</th>
                  <th className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Condition</th>
                  <th className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Last Inspected</th>
                </tr>
              </thead>
              <tbody>
                {beacons.map((beacon) => {
                  const condStyle = CONDITION_STYLES[beacon.condition];
                  return (
                    <tr key={beacon.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                      <td className="px-3 py-2.5 font-mono text-xs font-semibold">{beacon.identifier}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {BEACON_TYPE_LABELS[beacon.beaconType] ?? beacon.beaconType}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                        {formatCoordinates(beacon)}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${condStyle.bg} ${condStyle.text}`}>
                          {condStyle.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">{beacon.dateLastInspected}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Boundary Line Visualization */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Boundary Lines</CardTitle>
        </CardHeader>
        <CardContent>
          {boundaryLines.length === 0 ? (
            <p className="text-sm text-muted-foreground">No boundary lines defined.</p>
          ) : (
            <div className="space-y-3">
              {boundaryLines.map((line) => (
                <div key={line.id} className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium">{line.parcelIdentifier}</span>
                    <Badge variant="secondary">{line.beaconSequence.length} points</Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {line.beaconSequence.map((beaconId, idx) => {
                      const beacon = beacons.find((b) => b.identifier === beaconId);
                      const condStyle = beacon ? CONDITION_STYLES[beacon.condition] : CONDITION_STYLES.intact;
                      return (
                        <React.Fragment key={`${beaconId}-${idx}`}>
                          <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono ${condStyle.text}`}>
                            <Circle className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
                            {beaconId}
                          </span>
                          {idx < line.beaconSequence.length - 1 && (
                            <span className="text-slate-600">→</span>
                          )}
                        </React.Fragment>
                      );
                    })}
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
