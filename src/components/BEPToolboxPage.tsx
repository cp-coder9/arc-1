import React, { useState, useMemo } from 'react';
import {
  Calculator,
  Wrench,
  ShieldCheck,
  FileText,
  ClipboardCheck,
  HardHat,
  ArrowRight,
  Building2,
  Search,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ScrollArea } from './ui/scroll-area';
import { Input } from './ui/input';
import type { UserProfile } from '@/types';
import type { ToolContext, ToolDefinition } from '@/types/comprehensiveToolsets';
import type { ToolboxContext } from '@/types/toolboxCalculators';
import { getToolsForContext } from '@/services/comprehensiveToolRegistryService';
import ToolboxCalculatorPanel from './ToolboxCalculatorPanel';
import ToolRunHistoryPanel from './ToolRunHistoryPanel';

const TOOL_CATEGORY_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  briefing: { label: 'Briefing', icon: <FileText className="h-4 w-4" /> },
  proposal: { label: 'Proposal', icon: <FileText className="h-4 w-4" /> },
  compliance: { label: 'Compliance', icon: <ShieldCheck className="h-4 w-4" /> },
  drawing_ai_review: { label: 'AI Drawing Review', icon: <Search className="h-4 w-4" /> },
  document_control: { label: 'Document Control', icon: <FileText className="h-4 w-4" /> },
  tendering: { label: 'Tendering', icon: <ClipboardCheck className="h-4 w-4" /> },
  estimating_quantities: { label: 'Estimating', icon: <Calculator className="h-4 w-4" /> },
  site_management: { label: 'Site Management', icon: <HardHat className="h-4 w-4" /> },
  workforce: { label: 'Workforce', icon: <Building2 className="h-4 w-4" /> },
  plant_equipment: { label: 'Plant & Equipment', icon: <Wrench className="h-4 w-4" /> },
  resource_planning: { label: 'Resource Planning', icon: <Building2 className="h-4 w-4" /> },
  resource_marketplace: { label: 'Resource Marketplace', icon: <Building2 className="h-4 w-4" /> },
  finance_payments: { label: 'Finance & Payments', icon: <ClipboardCheck className="h-4 w-4" /> },
  closeout: { label: 'Closeout', icon: <ClipboardCheck className="h-4 w-4" /> },
};

interface BEPToolboxPageProps {
  user: UserProfile;
  projectId?: string;
  phase?: string;
}

export default function BEPToolboxPage({ user, projectId, phase }: BEPToolboxPageProps) {
  const [activeTab, setActiveTab] = useState<'calculators' | 'tools' | 'history'>('calculators');
  const [searchQuery, setSearchQuery] = useState('');

  const toolboxContext: ToolboxContext = useMemo(
    () => ({
      userId: user.uid,
      role: 'bep',
      projectId,
      phase: phase ?? 'design_coordination',
    }),
    [user.uid, projectId, phase],
  );

  const toolContext: ToolContext = useMemo(
    () => ({
      userId: user.uid,
      role: 'bep',
      phase: (phase as ToolContext['phase']) ?? 'design_coordination',
      projectId,
    }),
    [user.uid, projectId, phase],
  );

  const availableTools = useMemo(() => getToolsForContext(toolContext), [toolContext]);

  const filteredTools = useMemo(() => {
    if (!searchQuery.trim()) return availableTools;
    const q = searchQuery.toLowerCase();
    return availableTools.filter(
      (t) =>
        t.label.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q),
    );
  }, [availableTools, searchQuery]);

  const toolsByCategory = useMemo((): Record<string, ToolDefinition[]> => {
    const grouped: Record<string, ToolDefinition[]> = {};
    for (const tool of filteredTools) {
      if (!grouped[tool.category]) grouped[tool.category] = [];
      grouped[tool.category].push(tool);
    }
    return grouped;
  }, [filteredTools]);

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">BEP Professional Toolbox</h1>
          <p className="text-muted-foreground">
            Discipline calculators, compliance tools, and professional workflow support
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList>
          <TabsTrigger value="calculators">Discipline Calculators</TabsTrigger>
          <TabsTrigger value="tools">Professional Tools</TabsTrigger>
          <TabsTrigger value="history">Run History</TabsTrigger>
        </TabsList>

        <TabsContent value="calculators" className="mt-4">
          <ToolboxCalculatorPanel context={toolboxContext} />
        </TabsContent>

        <TabsContent value="tools" className="mt-4 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tools..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <ScrollArea className="h-[calc(100vh-280px)]">
            {Object.entries(toolsByCategory).map(([category, rawTools]) => {
              const tools = rawTools as ToolDefinition[];
              return (
              <div key={category} className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  {TOOL_CATEGORY_LABELS[category]?.icon ?? <Wrench className="h-4 w-4" />}
                  <h3 className="text-lg font-semibold">
                    {TOOL_CATEGORY_LABELS[category]?.label ?? category}
                  </h3>
                  <Badge variant="outline">{tools.length}</Badge>
                </div>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {tools.map((tool) => (
                    <Card key={tool.id} className="hover:border-primary/30 transition-colors">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">{tool.label}</CardTitle>
                        <CardDescription className="text-xs line-clamp-2">
                          {tool.description}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pb-2">
                        {tool.southAfricanContext && (
                          <div className="text-xs text-muted-foreground">
                            SA: {tool.southAfricanContext.slice(0, 2).join('; ')}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )})}
            {Object.keys(toolsByCategory).length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Search className="mx-auto h-8 w-8 mb-2" />
                <p>No tools match your search or current role/phase context.</p>
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <ToolRunHistoryPanel projectId={projectId} userId={user.uid} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
