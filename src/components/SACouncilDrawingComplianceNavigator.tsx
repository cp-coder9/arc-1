import React, { useState, useMemo, useCallback } from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  HelpCircle,
  MapPin,
  XCircle,
} from "lucide-react";
import type {
  DrawingComplianceChecklist,
  ChecklistItem,
  ChecklistStatus,
} from "@/services/drawingChecklistWorkflowTool";
import {
  buildManualDrawingChecklist,
  updateChecklistItem,
  countChecklistStatuses,
} from "@/services/drawingChecklistWorkflowTool";
import { getMunicipalityProfile } from "@/services/saCouncilDrawingComplianceData";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { ScrollArea } from "./ui/scroll-area";

const STATUS_BADGE: Record<ChecklistStatus, { label: string; className: string; icon: React.ReactNode }> = {
  unchecked: {
    label: "Unchecked",
    className: "bg-gray-100 text-gray-600",
    icon: <HelpCircle className="w-4 h-4" />,
  },
  pass: {
    label: "Pass",
    className: "bg-green-100 text-green-700",
    icon: <CheckCircle2 className="w-4 h-4" />,
  },
  fail: {
    label: "Fail",
    className: "bg-red-100 text-red-700",
    icon: <XCircle className="w-4 h-4" />,
  },
  needs_input: {
    label: "Needs Input",
    className: "bg-blue-100 text-blue-700",
    icon: <HelpCircle className="w-4 h-4" />,
  },
  not_applicable: {
    label: "N/A",
    className: "bg-gray-200 text-gray-500",
    icon: <HelpCircle className="w-4 h-4" />,
  },
};

export default function SACouncilDrawingComplianceNavigator() {
  const [municipality, setMunicipality] = useState("");
  const [projectName, setProjectName] = useState("");
  const [erfNumber, setErfNumber] = useState("");
  const [intent, setIntent] = useState<"building-plan" | "sdp" | "full-set">("building-plan");
  const [checklist, setChecklist] = useState<DrawingComplianceChecklist | null>(null);

  const profile = useMemo(() => getMunicipalityProfile(municipality || null), [municipality]);

  const buildChecklist = useCallback(() => {
    const cl = buildManualDrawingChecklist({
      projectContext: {
        municipality: municipality || null,
        projectName: projectName || "Untitled",
        erfNumber: erfNumber || null,
        intent,
      },
    });
    setChecklist(cl);
  }, [municipality, projectName, erfNumber, intent]);

  const toggleItem = useCallback(
    (itemId: string, status: ChecklistStatus) => {
      if (!checklist) return;
      setChecklist(updateChecklistItem(checklist, itemId, { status }));
    },
    [checklist],
  );

  if (!checklist) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5" />
            SA Council Drawing Compliance Navigator
          </CardTitle>
          <CardDescription>
            Manual checklist + AI guidance for council drawing submission compliance.
            Prepopulated from project context across 8 SA municipalities.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Municipality</Label>
              <Input
                placeholder="e.g. City of Johannesburg"
                value={municipality}
                onChange={(e) => setMunicipality(e.target.value)}
              />
            </div>
            <div>
              <Label>Project Name</Label>
              <Input
                placeholder="e.g. Sandringham Shul"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
              />
            </div>
            <div>
              <Label>ERF / Stand Number</Label>
              <Input
                placeholder="e.g. 1234"
                value={erfNumber}
                onChange={(e) => setErfNumber(e.target.value)}
              />
            </div>
            <div>
              <Label>Submission Intent</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={intent}
                onChange={(e) => setIntent(e.target.value as "building-plan" | "sdp" | "full-set")}
              >
                <option value="building-plan">Building Plan</option>
                <option value="sdp">SDP / Site Development</option>
                <option value="full-set">Full Set</option>
              </select>
            </div>
          </div>

          {profile && (
            <div className="p-3 rounded-lg bg-muted text-sm space-y-1">
              <div className="flex items-center gap-2 font-medium">
                <Building2 className="w-4 h-4" />
                {profile.municipality}
              </div>
              <div className="text-muted-foreground">
                Channel: {profile.buildingPlanChannel}
              </div>
              <div className="text-muted-foreground">{profile.keyDifference}</div>
              {profile.officialSource && (
                <a
                  href={profile.officialSource}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs underline text-primary"
                >
                  Official source
                </a>
              )}
            </div>
          )}

          <Button onClick={buildChecklist} className="w-full">
            Build Checklist
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Checklist view
  const groups = [...new Set(checklist.items.map((i) => i.group))];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5" />
          Drawing Compliance Checklist
        </CardTitle>
        <CardDescription className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline">
              <MapPin className="w-3 h-3 mr-1" />
              {checklist.context.municipality ?? "No municipality"}
            </Badge>
            <Badge variant="outline">{checklist.context.intent}</Badge>
            <Badge variant="outline">{checklist.counts.total} items</Badge>
            <Badge
              variant="outline"
              className={
                checklist.counts.completionPercent >= 80
                  ? "bg-green-100"
                  : checklist.counts.completionPercent >= 50
                    ? "bg-amber-100"
                    : "bg-red-100"
              }
            >
              {checklist.counts.completionPercent}% complete
            </Badge>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setChecklist(null)}>
            ← Back to setup
          </Button>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px] pr-4">
          {groups.map((group) => {
            const groupItems = checklist.items.filter((i) => i.group === group);
            return (
              <div key={group} className="mb-6">
                <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
                  {group}
                  {groupItems.some((i) => i.sourceStatus === "ai-guided") && (
                    <Badge variant="secondary" className="text-xs">AI guided</Badge>
                  )}
                </h3>
                <div className="space-y-1">
                  {groupItems.map((item: ChecklistItem) => (
                    <React.Fragment key={item.id}>
                    <ChecklistItemRow
                      item={item}
                      onToggle={(status) => toggleItem(item.id, status)}
                    />
                    </React.Fragment>
                  ))}
                </div>
              </div>
            );
          })}
        </ScrollArea>

        {/* Summary footer */}
        <div className="mt-4 p-3 rounded-lg border text-sm">
          <div className="grid grid-cols-5 gap-2 text-center">
            {(["pass", "fail", "needs_input", "unchecked", "not_applicable"] as ChecklistStatus[]).map(
              (s) => (
                <div key={s}>
                  <div className="font-bold text-lg">{checklist.counts[s]}</div>
                  <div className="text-xs text-muted-foreground">{STATUS_BADGE[s].label}</div>
                </div>
              ),
            )}
          </div>
          {checklist.projectRecordEvent.blockers.length > 0 && (
            <div className="mt-2 flex items-start gap-2 text-amber-700">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                {checklist.projectRecordEvent.blockers.length} blockers remain. Professional review required.
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ChecklistItemRow({
  item,
  onToggle,
}: {
  item: ChecklistItem;
  onToggle: (status: ChecklistStatus) => void;
}) {
  const badge = STATUS_BADGE[item.status];

  return (
    <div className="flex items-start gap-3 py-1.5 border-b border-muted last:border-0">
      <select
        className="mt-0.5 text-xs rounded border px-1 py-0.5 shrink-0"
        value={item.status}
        onChange={(e) => onToggle(e.target.value as ChecklistStatus)}
      >
        <option value="unchecked">—</option>
        <option value="pass">✓ Pass</option>
        <option value="fail">✗ Fail</option>
        <option value="needs_input">? Input</option>
        <option value="not_applicable">N/A</option>
      </select>
      <div className="flex-1 min-w-0">
        <div className="text-sm">{item.text}</div>
        {item.aiGuidance && (
          <div className="text-xs text-blue-600 mt-0.5">
            💡 {item.aiGuidance}
          </div>
        )}
        <div className="text-xs text-muted-foreground mt-0.5">
          Source: {item.source}
        </div>
      </div>
    </div>
  );
}
