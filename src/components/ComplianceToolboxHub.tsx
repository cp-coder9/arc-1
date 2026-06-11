import React, { useState, useCallback } from "react";
import {
  AlertTriangle,
  CheckCircle,
  ClipboardCheck,
  FileText,
  Search,
  Shield,
  XCircle,
  HelpCircle,
} from "lucide-react";
import type {
  BoundaryWallInput,
  CheckResult,
  ComplianceStatus,
} from "@/types/complianceTypes";
import {
  SOURCE_BOUNDARY,
} from "@/types/complianceTypes";
import {
  runBoundaryWallDemoCheck,
} from "@/services/complianceEngineService";
import SACouncilDrawingComplianceNavigator from "./SACouncilDrawingComplianceNavigator";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

const STATUS_ICONS: Record<ComplianceStatus, React.ReactNode> = {
  pass: <CheckCircle className="w-5 h-5 text-green-500" />,
  watch: <AlertTriangle className="w-5 h-5 text-amber-500" />,
  fail: <XCircle className="w-5 h-5 text-red-500" />,
  needs_input: <HelpCircle className="w-5 h-5 text-blue-500" />,
  not_applicable: <HelpCircle className="w-5 h-5 text-gray-400" />,
};

const STATUS_LABELS: Record<ComplianceStatus, string> = {
  pass: "Pass",
  watch: "Watch",
  fail: "Fail",
  needs_input: "Needs Input",
  not_applicable: "N/A",
};

const STATUS_COLORS: Record<ComplianceStatus, string> = {
  pass: "bg-green-100 text-green-800 border-green-300",
  watch: "bg-amber-100 text-amber-800 border-amber-300",
  fail: "bg-red-100 text-red-800 border-red-300",
  needs_input: "bg-blue-100 text-blue-800 border-blue-300",
  not_applicable: "bg-gray-100 text-gray-500 border-gray-200",
};

function BoundaryWallChecker() {
  const [input, setInput] = useState<BoundaryWallInput>({
    unitType: "solid",
    thicknessMm: 220,
    heightM: 1.8,
    earthRetained: false,
    pierSpacingM: 2.7,
    pierSize: "440x440",
  });
  const [result, setResult] = useState<CheckResult | null>(null);

  const runCheck = useCallback(() => {
    const res = runBoundaryWallDemoCheck(input);
    setResult(res);
  }, [input]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="w-5 h-5" />
          Boundary / Garden Wall Checker
        </CardTitle>
        <CardDescription>
          SANS 10400-K 4.2.4 — Demo wall compliance check using Table K-T17 pattern.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Unit Type</Label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={input.unitType}
              onChange={(e) => setInput({ ...input, unitType: e.target.value as "solid" | "hollow" })}
            >
              <option value="solid">Solid</option>
              <option value="hollow">Hollow</option>
            </select>
          </div>
          <div>
            <Label>Wall Thickness (mm)</Label>
            <Input
              type="number"
              value={input.thicknessMm}
              onChange={(e) => setInput({ ...input, thicknessMm: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Wall Height (m)</Label>
            <Input
              type="number"
              step="0.1"
              value={input.heightM}
              onChange={(e) => setInput({ ...input, heightM: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Earth Retained</Label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={input.earthRetained ? "yes" : "no"}
              onChange={(e) => setInput({ ...input, earthRetained: e.target.value === "yes" })}
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>
          <div>
            <Label>Pier Spacing (m)</Label>
            <Input
              type="number"
              step="0.1"
              value={input.pierSpacingM ?? ""}
              onChange={(e) =>
                setInput({ ...input, pierSpacingM: e.target.value ? Number(e.target.value) : undefined })
              }
            />
          </div>
          <div>
            <Label>Pier Size</Label>
            <Input
              value={input.pierSize ?? ""}
              onChange={(e) => setInput({ ...input, pierSize: e.target.value || undefined })}
            />
          </div>
        </div>

        <Button onClick={runCheck} className="w-full">
          Run Boundary Wall Check
        </Button>

        {result && (
          <div className={`p-4 rounded-lg border ${STATUS_COLORS[result.status]}`}>
            <div className="flex items-center gap-2 font-semibold">
              {STATUS_ICONS[result.status]}
              {STATUS_LABELS[result.status]}
            </div>
            <p className="mt-1 text-sm">{result.message}</p>
            {result.trace && (
              <details className="mt-2">
                <summary className="text-xs cursor-pointer text-muted-foreground">
                  View trace
                </summary>
                <pre className="mt-1 text-xs whitespace-pre-wrap bg-muted p-2 rounded">
                  {JSON.stringify(result.trace, null, 2)}
                </pre>
              </details>
            )}
            <div className="mt-2 text-xs text-muted-foreground">
              Source: {SOURCE_BOUNDARY.warning}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const SANS_PARTS = [
  { code: "A", title: "General Principles and Requirements" },
  { code: "B", title: "Structural Design" },
  { code: "C", title: "Dimensions" },
  { code: "D", title: "Public Safety" },
  { code: "E", title: "Demolition Work" },
  { code: "F", title: "Site Operations" },
  { code: "G", title: "Excavations" },
  { code: "H", title: "Foundations" },
  { code: "J", title: "Floors" },
  { code: "K", title: "Walls" },
  { code: "L", title: "Roofs" },
  { code: "M", title: "Stairways" },
  { code: "N", title: "Glazing" },
  { code: "O", title: "Lighting and Ventilation" },
  { code: "P", title: "Drainage" },
  { code: "Q", title: "Non-Water-Borne Sanitary Disposal" },
  { code: "R", title: "Stormwater Disposal" },
  { code: "S", title: "Facilities for Persons with Disabilities" },
  { code: "T", title: "Fire Protection" },
  { code: "U", title: "Refuse Disposal" },
  { code: "V", title: "Space Heating" },
  { code: "W", title: "Fire Installation" },
  { code: "XA", title: "Energy Usage in Buildings" },
];

function SANSPartBrowser() {
  const [search, setSearch] = useState("");

  const filtered = SANS_PARTS.filter(
    (p) =>
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.code.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="w-5 h-5" />
          SANS 10400 Part Browser
        </CardTitle>
        <CardDescription>
          Browse SANS 10400 parts and clauses. Source data is illustrative POC until verified.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input
          placeholder="Search parts (e.g. walls, fire, glazing)..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {filtered.map((part) => (
            <Button
              key={part.code}
              variant="outline"
              className="justify-start h-auto py-3 px-4"
            >
              <div className="text-left">
                <div className="font-semibold">Part {part.code}</div>
                <div className="text-xs text-muted-foreground">{part.title}</div>
              </div>
            </Button>
          ))}
        </div>
        <div className="text-xs text-muted-foreground text-center">
          <Badge variant="outline" className="text-xs">Illustrative POC</Badge>
          {" "}Source: {SOURCE_BOUNDARY.sourceUrl}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ComplianceToolboxHub() {
  const [activeTool, setActiveTool] = useState<"browser" | "boundary-wall" | "council-navigator">("boundary-wall");

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">SANS / NBR Compliance Intelligence</h1>
        <p className="text-muted-foreground mt-1">
          Compliance tools for built-environment professionals. All outputs are decision-support only — not municipal approval or professional certification.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button
          variant={activeTool === "boundary-wall" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTool("boundary-wall")}
        >
          <Shield className="w-4 h-4 mr-1" />
          Boundary Wall Checker
        </Button>
        <Button
          variant={activeTool === "browser" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTool("browser")}
        >
          <FileText className="w-4 h-4 mr-1" />
          Part Browser
        </Button>
        <Button
          variant={activeTool === "council-navigator" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTool("council-navigator")}
        >
          <ClipboardCheck className="w-4 h-4 mr-1" />
          Council Checklist
        </Button>
      </div>

      {activeTool === "boundary-wall" && <BoundaryWallChecker />}
      {activeTool === "browser" && <SANSPartBrowser />}
      {activeTool === "council-navigator" && <SACouncilDrawingComplianceNavigator />}

      <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
        <CardContent className="py-3">
          <div className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-200">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Important boundaries:</p>
              <ul className="list-disc list-inside mt-1 space-y-0.5">
                <li>AI/compliance tool output is not municipal approval.</li>
                <li>AI/compliance tool output is not professional certification.</li>
                <li>Registered professionals remain responsible for signoff.</li>
                <li>Official SANS/NBR source/version must be verified before production reliance.</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
