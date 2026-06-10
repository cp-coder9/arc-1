// Pack 5: Kickoff Checklist Dashboard
// Displays the 7 kickoff readiness gates, project workspace status,
// missing facts, and professional confirmation action.
// All agent outputs are advisory; human approval gates are always shown.

import React, { useCallback, useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

// ── Types ───────────────────────────────────────────────────────────────────────

type ChecklistItem = {
  id: string;
  label: string;
  ownerRole: 'client' | 'lead_professional' | 'platform_agent';
  required: boolean;
  completed: boolean;
};

type KickoffData = {
  projectId: string;
  appointmentId?: string;
  checklist: ChecklistItem[];
  initialTasks: Array<{ id: string; title: string; phase: string; ownerRole: string }>;
  readiness: 'blocked' | 'ready';
  updatedAt?: string;
};

type GateData = {
  gate: number;
  label: string;
  passed: boolean;
};

type Props = {
  projectId: string;
  /** If provided, shows the professional confirmation action */
  isProfessional?: boolean;
  /** Called when the professional confirms the appointment */
  onProfessionalConfirm?: () => Promise<void>;
};

// ── Helpers ─────────────────────────────────────────────────────────────────────

function ownerLabel(role: string): string {
  switch (role) {
    case 'client':
      return 'Client';
    case 'lead_professional':
      return 'Professional';
    case 'platform_agent':
      return 'Platform (auto)';
    default:
      return role;
  }
}

function ownerBadgeVariant(
  role: string,
): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (role) {
    case 'client':
      return 'default';
    case 'lead_professional':
      return 'secondary';
    case 'platform_agent':
      return 'outline';
    default:
      return 'outline';
  }
}

// ── Component ───────────────────────────────────────────────────────────────────

export default function KickoffChecklistDashboard({
  projectId,
  isProfessional = false,
  onProfessionalConfirm,
}: Props) {
  const [data, setData] = useState<KickoffData | null>(null);
  const [gates, setGates] = useState<GateData[]>([]);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to kickoff checklist in Firestore
  useEffect(() => {
    const kickoffRef = doc(db, 'kickoff_checklists', projectId);
    const unsub = onSnapshot(
      kickoffRef,
      (snap) => {
        if (snap.exists()) {
          const d = snap.data() as KickoffData;
          setData(d);
        } else {
          setData(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error('Kickoff checklist subscription error:', err);
        setError('Failed to load kickoff data.');
        setLoading(false);
      },
    );
    return () => unsub();
  }, [projectId]);

  // Fetch gates from API on mount
  useEffect(() => {
    const fetchGates = async () => {
      try {
        // Try the API first; fall back to local data
        const resp = await fetch(`/api/projects/${projectId}/kickoff-checklist`);
        if (resp.ok) {
          const json = await resp.json();
          setGates(json.gates || []);
          setBlockers(json.blockers || []);
        }
      } catch {
        // API may not be available during development; use local data
      }
    };
    fetchGates();
  }, [projectId]);

  const handleConfirm = useCallback(async () => {
    if (!onProfessionalConfirm || !data?.appointmentId) return;
    setConfirming(true);
    try {
      await onProfessionalConfirm();
    } catch (err: any) {
      console.error('Professional confirmation error:', err);
      setError(err.message || 'Failed to confirm appointment.');
    } finally {
      setConfirming(false);
    }
  }, [onProfessionalConfirm, data?.appointmentId]);

  // ── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          <span className="text-muted-foreground">Loading kickoff checklist...</span>
        </CardContent>
      </Card>
    );
  }

  // ── Readiness banner ───────────────────────────────────────────────────────

  const isReady = data?.readiness === 'ready';
  const gateItems = data?.checklist.filter((item) => item.id.startsWith('gate-')) || [];
  const passedGates = gateItems.filter((g) => g.completed).length;
  const totalGates = gateItems.length || 7;
  const missingFactItems =
    data?.checklist.filter((item) => item.id.startsWith('missing-fact-')) || [];
  const operationalItems =
    data?.checklist.filter(
      (item) =>
        !item.id.startsWith('gate-') && !item.id.startsWith('missing-fact-'),
    ) || [];

  return (
    <div className="space-y-6">
      {/* Readiness banner */}
      <Card
        className={
          isReady
            ? 'border-green-500/50 bg-green-50/30 dark:bg-green-950/20'
            : 'border-amber-500/50 bg-amber-50/30 dark:bg-amber-950/20'
        }
      >
        <CardContent className="flex items-center gap-3 py-4">
          {isReady ? (
            <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
          ) : (
            <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
          )}
          <div>
            <h3 className="text-lg font-semibold">
              {isReady
                ? 'Ready for Kickoff'
                : `Blocked: ${blockers.length || missingFactItems.filter((i) => !i.completed).length} items need attention`}
            </h3>
            <p className="text-sm text-muted-foreground">
              {isReady
                ? 'All kickoff readiness gates have passed. The project can proceed to inception.'
                : 'Some required gates have not passed. Resolve the blockers below to proceed.'}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Error display */}
      {error && (
        <Card className="border-red-500/50">
          <CardContent className="py-3">
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <XCircle className="h-5 w-5" />
              <span className="text-sm">{error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 7 Gates checklist */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Kickoff Readiness Gates
          </CardTitle>
          <CardDescription>
            {passedGates} of {totalGates} required gates passed
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {gateItems.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-md border p-3"
            >
              <div className="flex items-center gap-3">
                {item.completed ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                )}
                <div>
                  <p
                    className={
                      item.completed
                        ? 'text-sm font-medium'
                        : 'text-sm font-medium text-muted-foreground'
                    }
                  >
                    {item.label}
                  </p>
                </div>
              </div>
              <Badge variant={ownerBadgeVariant(item.ownerRole)}>
                {ownerLabel(item.ownerRole)}
              </Badge>
            </div>
          ))}

          {/* Operational items */}
          {operationalItems.length > 0 && (
            <>
              <p className="mt-4 text-sm font-medium text-muted-foreground">
                Operational Items
              </p>
              {operationalItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div className="flex items-center gap-3">
                    {item.completed ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                    ) : item.required ? (
                      <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                    ) : (
                      <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                    <p className="text-sm">{item.label}</p>
                  </div>
                  <Badge variant={ownerBadgeVariant(item.ownerRole)}>
                    {ownerLabel(item.ownerRole)}
                  </Badge>
                </div>
              ))}
            </>
          )}
        </CardContent>
      </Card>

      {/* Missing facts card */}
      {missingFactItems.filter((i) => !i.completed).length > 0 && (
        <Card className="border-amber-500/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-5 w-5" />
              Missing Project Facts
            </CardTitle>
            <CardDescription>
              These facts are required before the project can proceed. The client must provide them.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {missingFactItems
              .filter((i) => !i.completed)
              .map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-800 dark:bg-amber-950/20"
                >
                  <div className="flex items-center gap-3">
                    <XCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                    <p className="text-sm">{item.label}</p>
                  </div>
                  <Badge variant="outline">Client action needed</Badge>
                </div>
              ))}
          </CardContent>
        </Card>
      )}

      {/* Professional confirmation action */}
      {isProfessional && data?.appointmentId && (
        <Card>
          <CardHeader>
            <CardTitle>Professional Confirmation</CardTitle>
            <CardDescription>
              As the appointed professional, confirm your acceptance of this appointment.
              This action creates an auditable record.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={handleConfirm}
              disabled={confirming}
              className="w-full sm:w-auto"
            >
              {confirming && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Appointment Responsibility
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Initial tasks preview */}
      {data?.initialTasks && data.initialTasks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Initial Tasks</CardTitle>
            <CardDescription>
              Starter tasks for the inception phase
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.initialTasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <div className="flex items-center gap-3">
                  <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <p className="text-sm">{task.title}</p>
                </div>
                <Badge variant="outline">
                  {task.phase.replace(/_/g, ' ')}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
