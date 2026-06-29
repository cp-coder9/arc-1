import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  FileUp,
  List,
  AlertTriangle,
  ShoppingCart,
  Link2,
  Sparkles,
  ClipboardCheck,
  FileText,
  Download,
  Bot,
  History,
} from 'lucide-react';
import type { BomProject, BomLineItem } from '@/services/bomBuilder/types';

// ── Types ───────────────────────────────────────────────────────────────────

interface UserProfile {
  email: string;
  role: string;
  displayName?: string;
}

interface BomBuilderDashboardProps {
  user: UserProfile;
  projectId?: string;
}

// ── Mock data for scaffold rendering ────────────────────────────────────────
// TODO: Replace with Firestore query using projectId once API wired

const DEMO_PROJECT: BomProject = {
  id: 'bom_demo_001',
  projectId: 'proj_001',
  name: 'Sandton Residential Development',
  stage: 'takeoff',
  revision: '2.1',
  sources: [
    { id: 'src_1', fileName: 'GA-Plan-L00.pdf', format: 'pdf_vector', drawingRef: 'DWG-001', revision: 'P03', uploadedBy: 'architect@firm.co.za', uploadedAt: '2026-06-10T08:00:00Z', itemsExtracted: 42, confidence: 0.91, status: 'complete' },
    { id: 'src_2', fileName: 'Structural-Model.ifc', format: 'ifc', drawingRef: 'STR-001', revision: 'P01', uploadedBy: 'engineer@firm.co.za', uploadedAt: '2026-06-11T10:30:00Z', itemsExtracted: 28, confidence: 0.87, status: 'needs_review' },
  ],
  lineItems: [],
  qsReviews: [],
  tenderPackages: [],
  exports: [],
  createdAt: '2026-06-10T07:00:00Z',
  updatedAt: '2026-06-12T14:00:00Z',
};

const DEMO_ITEMS: BomLineItem[] = [
  { id: 'item_1', sourceIds: ['src_1'], itemCode: '001-masonry', description: 'Face brick external walls 230mm', material: 'FBA clay brick', tradePackage: 'masonry', costCode: 'CC-2300', unit: 'm2', quantity: 185.4, rate: 680, total: 126072, confidence: 0.92, status: 'approved', flags: [], procurementStatus: 'quoted', leadTimeDays: 14 },
  { id: 'item_2', sourceIds: ['src_1'], itemCode: '002-concrete', description: 'Concrete strip footings 600x200', material: '25MPa ready-mix', tradePackage: 'concrete', costCode: 'CC-2100', unit: 'm3', quantity: 18.6, rate: 2450, total: 45570, confidence: 0.88, status: 'flagged', flags: [{ id: 'f1', lineItemId: 'item_2', severity: 'warning', reason: 'Quantity variance >10% from structural calc', suggestedAction: 'Confirm with engineer' }], procurementStatus: 'not_started' },
  { id: 'item_3', sourceIds: ['src_2'], itemCode: '003-doors-windows', description: 'Aluminium sliding doors 2400x2100', material: 'Powder-coated aluminium', tradePackage: 'doors-windows', costCode: 'CC-3100', unit: 'nr', quantity: 4, rate: 1850, total: 7400, confidence: 0.95, status: 'approved', flags: [], procurementStatus: 'ordered', leadTimeDays: 21, specForgeItemId: 'sf_item_012' },
];

// ── Tab definitions ─────────────────────────────────────────────────────────

const TABS = [
  { id: 'takeoff', label: 'Drawing Takeoff', icon: FileUp },
  { id: 'lines', label: 'BoM Lines', icon: List },
  { id: 'flagged', label: 'Flagged', icon: AlertTriangle },
  { id: 'procurement', label: 'Procurement', icon: ShoppingCart },
  { id: 'programme', label: 'Programme Link', icon: Link2 },
  { id: 'specforge', label: 'SpecForge', icon: Sparkles },
  { id: 'qs-review', label: 'QS Review', icon: ClipboardCheck },
  { id: 'tender', label: 'Tender Gen', icon: FileText },
  { id: 'export', label: 'Doc Export', icon: Download },
  { id: 'agents', label: 'AI Agents', icon: Bot },
  { id: 'audit', label: 'Audit Trail', icon: History },
] as const;

// ── Helpers ─────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    approved: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    flagged: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    extracted: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
    edited: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    info_required: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  };
  return (
    <Badge variant="outline" className={colorMap[status] ?? 'bg-slate-500/20 text-slate-400'}>
      {status.replace('_', ' ')}
    </Badge>
  );
}

// ── Component ───────────────────────────────────────────────────────────────

export default function BomBuilderDashboard({ user, projectId }: BomBuilderDashboardProps) {
  const [activeTab, setActiveTab] = useState('takeoff');
  const [project] = useState<BomProject>({ ...DEMO_PROJECT, lineItems: DEMO_ITEMS });

  const isQs = user.role === 'quantity_surveyor' || user.role === 'admin';
  const flaggedCount = project.lineItems.filter((i) => i.status === 'flagged').length;

  return (
    <div className="space-y-6 p-6">
      {/* Tool Header */}
      <Card className="bg-slate-800/70 backdrop-blur border-slate-700/50">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-2xl font-bold text-white">BoM / BoQ Builder</CardTitle>
            <p className="text-sm text-slate-400 mt-1">
              AI-powered material takeoff &amp; quantity management
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="bg-blue-500/10 text-blue-300 border-blue-500/30">
              Rev {project.revision}
            </Badge>
            <Badge variant="outline" className="bg-slate-600/50 text-slate-300">
              {project.lineItems.length} items
            </Badge>
            {flaggedCount > 0 && (
              <Badge variant="outline" className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                {flaggedCount} flagged
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-slate-500 uppercase tracking-wider">
            Project: {project.name}{projectId ? ` • ID: ${projectId}` : ''} • Stage: {project.stage} • Sources: {project.sources.length}
          </p>
        </CardContent>
      </Card>

      {/* Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-slate-800/70 border border-slate-700/50 flex-wrap h-auto gap-1 p-1">
          {TABS.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="data-[state=active]:bg-slate-700 data-[state=active]:text-white text-slate-400 text-xs gap-1.5 px-3 py-1.5"
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Drawing Takeoff Tab */}
        <TabsContent value="takeoff" className="space-y-4 mt-4">
          <Card className="bg-slate-800/70 backdrop-blur border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-lg text-white">Drawing Sources</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Upload drop zone */}
              <div className="border-2 border-dashed border-slate-600 rounded-lg p-8 text-center mb-4 hover:border-blue-500/50 transition-colors">
                <FileUp className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                <p className="text-slate-400 text-sm">
                  Drop drawings here or click to upload
                </p>
                <p className="text-slate-500 text-xs mt-1">
                  Supports PDF, DWG, DXF, IFC, Revit, CSV, XLSX
                </p>
              </div>
              {/* Source list */}
              <div className="space-y-2">
                {project.sources.map((src) => (
                  <div key={src.id} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-slate-700/30">
                    <div className="flex items-center gap-3">
                      <FileText className="w-4 h-4 text-slate-400" />
                      <div>
                        <p className="text-sm text-white">{src.fileName}</p>
                        <p className="text-xs text-slate-500">{src.drawingRef} • Rev {src.revision}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">{src.itemsExtracted} items</span>
                      <Badge variant="outline" className={src.status === 'complete' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border-amber-500/30'}>
                        {src.status.replace('_', ' ')}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* BoM Lines Tab */}
        <TabsContent value="lines" className="space-y-4 mt-4">
          <Card className="bg-slate-800/70 backdrop-blur border-slate-700/50">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg text-white">Bill of Materials</CardTitle>
              <Button size="sm" variant="outline" className="text-xs">
                + Add Line
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-left text-xs text-slate-400 uppercase tracking-wider">
                      <th className="pb-2 pr-3">Code</th>
                      <th className="pb-2 pr-3">Description</th>
                      <th className="pb-2 pr-3">Trade</th>
                      <th className="pb-2 pr-3 text-right">Qty</th>
                      <th className="pb-2 pr-3">Unit</th>
                      <th className="pb-2 pr-3 text-right">Rate</th>
                      <th className="pb-2 pr-3 text-right">Total</th>
                      <th className="pb-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {project.lineItems.map((item) => (
                      <tr key={item.id} className="border-b border-slate-800/50 text-slate-300">
                        <td className="py-2 pr-3 font-mono text-xs">{item.itemCode}</td>
                        <td className="py-2 pr-3">{item.description}</td>
                        <td className="py-2 pr-3 text-xs">{item.tradePackage}</td>
                        <td className="py-2 pr-3 text-right">{item.quantity}</td>
                        <td className="py-2 pr-3 text-xs">{item.unit}</td>
                        <td className="py-2 pr-3 text-right">R{item.rate.toLocaleString()}</td>
                        <td className="py-2 pr-3 text-right font-medium">R{item.total.toLocaleString()}</td>
                        <td className="py-2"><StatusBadge status={item.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Flagged Tab */}
        <TabsContent value="flagged" className="space-y-4 mt-4">
          <Card className="bg-slate-800/70 backdrop-blur border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                Flagged Items ({flaggedCount})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {project.lineItems.filter((i) => i.status === 'flagged').map((item) => (
                <div key={item.id} className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg mb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-white font-medium">{item.description}</p>
                      <p className="text-xs text-slate-400">{item.itemCode} • {item.material}</p>
                    </div>
                    <Button size="sm" variant="outline" className="text-xs">Resolve</Button>
                  </div>
                  {item.flags.map((flag) => (
                    <div key={flag.id} className="mt-2 ml-4 text-xs">
                      <Badge variant="outline" className="bg-amber-500/10 text-amber-300 border-amber-500/20 mr-2">
                        {flag.severity}
                      </Badge>
                      <span className="text-slate-400">{flag.reason}</span>
                    </div>
                  ))}
                </div>
              ))}
              {flaggedCount === 0 && (
                <p className="text-slate-500 text-sm text-center py-4">No flagged items</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Procurement Tab */}
        <TabsContent value="procurement" className="space-y-4 mt-4">
          <Card className="bg-slate-800/70 backdrop-blur border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-lg text-white">Procurement Tracker</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                {(['not_started', 'rfq_sent', 'ordered', 'delivered'] as const).map((status) => {
                  const count = project.lineItems.filter((i) => i.procurementStatus === status).length;
                  return (
                    <div key={status} className="p-3 bg-slate-900/50 rounded-lg border border-slate-700/30 text-center">
                      <p className="text-2xl font-bold text-white">{count}</p>
                      <p className="text-xs text-slate-400 uppercase tracking-wider mt-1">{status.replace(/_/g, ' ')}</p>
                    </div>
                  );
                })}
              </div>
              <p className="text-slate-500 text-xs">Track RFQs, supplier quotes, purchase orders, and deliveries</p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Programme Link Tab */}
        <TabsContent value="programme" className="space-y-4 mt-4">
          <Card className="bg-slate-800/70 backdrop-blur border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-lg text-white">Programme Linkage</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-400 text-sm">
                Link BoM items to programme activities for drawdown scheduling and cashflow forecasting.
              </p>
              <div className="mt-4 space-y-2">
                {project.lineItems.filter((i) => i.programmeActivityId).map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-2 bg-slate-900/50 rounded border border-slate-700/30">
                    <span className="text-sm text-white">{item.description}</span>
                    <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-300">
                      {item.programmeActivityId}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SpecForge Tab */}
        <TabsContent value="specforge" className="space-y-4 mt-4">
          <Card className="bg-slate-800/70 backdrop-blur border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-400" />
                SpecForge Integration
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-400 text-sm mb-4">
                Items linked to SpecForge specifications for full traceability.
              </p>
              {project.lineItems.filter((i) => i.specForgeItemId).map((item) => (
                <div key={item.id} className="flex items-center justify-between p-2 bg-purple-500/5 border border-purple-500/20 rounded-lg mb-2">
                  <div>
                    <p className="text-sm text-white">{item.description}</p>
                    <p className="text-xs text-slate-500">{item.itemCode}</p>
                  </div>
                  <Badge variant="outline" className="bg-purple-500/10 text-purple-300 border-purple-500/20 text-xs">
                    {item.specForgeItemId}
                  </Badge>
                </div>
              ))}
              {project.lineItems.filter((i) => i.specForgeItemId).length === 0 && (
                <p className="text-slate-500 text-sm text-center py-4">No items linked to SpecForge yet</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* QS Review Tab */}
        <TabsContent value="qs-review" className="space-y-4 mt-4">
          <Card className="bg-slate-800/70 backdrop-blur border-slate-700/50">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg text-white">QS Review & Sign-Off</CardTitle>
              {isQs && (
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs">
                  Submit for Review
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-700/30 text-center">
                  <p className="text-2xl font-bold text-emerald-400">{project.lineItems.filter((i) => i.status === 'approved').length}</p>
                  <p className="text-xs text-slate-400 uppercase tracking-wider mt-1">Approved</p>
                </div>
                <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-700/30 text-center">
                  <p className="text-2xl font-bold text-amber-400">{flaggedCount}</p>
                  <p className="text-xs text-slate-400 uppercase tracking-wider mt-1">Pending</p>
                </div>
                <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-700/30 text-center">
                  <p className="text-2xl font-bold text-white">{project.lineItems.length}</p>
                  <p className="text-xs text-slate-400 uppercase tracking-wider mt-1">Total</p>
                </div>
              </div>
              <p className="text-xs text-slate-500">Rate benchmarking against market data. QS certification required before tender issue.</p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tender Gen Tab */}
        <TabsContent value="tender" className="space-y-4 mt-4">
          <Card className="bg-slate-800/70 backdrop-blur border-slate-700/50">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg text-white">Tender Package Generation</CardTitle>
              <Button size="sm" variant="outline" className="text-xs">Generate Packages</Button>
            </CardHeader>
            <CardContent>
              <p className="text-slate-400 text-sm mb-4">
                Auto-generate trade packages from approved BoM items for competitive tender.
              </p>
              {project.tenderPackages.length === 0 && (
                <div className="text-center py-8 border border-dashed border-slate-600 rounded-lg">
                  <FileText className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                  <p className="text-slate-500 text-sm">No tender packages generated yet</p>
                  <p className="text-slate-600 text-xs mt-1">Approve items and generate trade packages</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Doc Export Tab */}
        <TabsContent value="export" className="space-y-4 mt-4">
          <Card className="bg-slate-800/70 backdrop-blur border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-lg text-white">Document Export</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {(['full_bom', 'priced_boq', 'trade_package', 'procurement_schedule', 'qs_cost_report', 'cashflow_forecast'] as const).map((tmpl) => (
                  <Button
                    key={tmpl}
                    variant="outline"
                    className="h-auto py-3 flex flex-col items-center gap-1 text-slate-300 border-slate-600 hover:border-blue-500/50"
                  >
                    <Download className="w-4 h-4" />
                    <span className="text-xs">{tmpl.replace(/_/g, ' ')}</span>
                  </Button>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-4">Export as PDF, XLSX, CSV, or MS Project XML</p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Agents Tab */}
        <TabsContent value="agents" className="space-y-4 mt-4">
          <Card className="bg-slate-800/70 backdrop-blur border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <Bot className="w-5 h-5 text-blue-400" />
                AI Agent Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                  <p className="text-sm text-white font-medium">Quantity Extraction Agent</p>
                  <p className="text-xs text-slate-400 mt-1">AI-powered takeoff from uploaded drawings</p>
                </div>
                <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                  <p className="text-sm text-white font-medium">Rate Benchmarking Agent</p>
                  <p className="text-xs text-slate-400 mt-1">Validates rates against market database</p>
                </div>
                <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                  <p className="text-sm text-white font-medium">SANS Compliance Agent</p>
                  <p className="text-xs text-slate-400 mt-1">Flags items requiring SANS specification compliance</p>
                </div>
                <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                  <p className="text-sm text-white font-medium">Procurement Risk Agent</p>
                  <p className="text-xs text-slate-400 mt-1">Lead time analysis and supply chain risk assessment</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audit Trail Tab */}
        <TabsContent value="audit" className="space-y-4 mt-4">
          <Card className="bg-slate-800/70 backdrop-blur border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-lg text-white">Audit Trail</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center gap-3 p-2 border-l-2 border-blue-500/50">
                  <span className="text-xs text-slate-500 w-32">2026-06-12 14:00</span>
                  <span className="text-sm text-slate-300">3 items approved by QS</span>
                </div>
                <div className="flex items-center gap-3 p-2 border-l-2 border-amber-500/50">
                  <span className="text-xs text-slate-500 w-32">2026-06-11 10:30</span>
                  <span className="text-sm text-slate-300">IFC model uploaded — 28 items extracted</span>
                </div>
                <div className="flex items-center gap-3 p-2 border-l-2 border-emerald-500/50">
                  <span className="text-xs text-slate-500 w-32">2026-06-10 08:00</span>
                  <span className="text-sm text-slate-300">Project created — GA Plan uploaded</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
