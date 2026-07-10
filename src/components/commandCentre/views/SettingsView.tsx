'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Settings, CheckCircle, XCircle } from 'lucide-react';
import type { ComplexityMode } from '@/services/commandCentre/types';

interface SettingsViewProps {
  projectId: string;
  complexityMode: ComplexityMode;
  onComplexityChange: (mode: ComplexityMode) => void;
}

export default function SettingsView({ projectId, complexityMode, onComplexityChange }: SettingsViewProps) {
  const integrations = [
    { module: 'Project Passport', connected: true, lastSync: '2 minutes ago' },
    { module: 'SpecForge', connected: true, lastSync: '5 minutes ago' },
    { module: 'Document Intelligence', connected: true, lastSync: '10 minutes ago' },
    { module: 'Payment Gateway', connected: false, lastSync: undefined },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Settings</h2>

      {/* Complexity Mode Toggle */}
      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Complexity Mode</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Choose the level of detail shown in the Command Centre. Simple mode focuses on
            essential project management, while Full mode includes programme/Gantt, resource
            management, analytics, and advanced commercial views.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => onComplexityChange('simple')}
              className={`flex-1 p-4 rounded-lg border text-left transition-colors ${
                complexityMode === 'simple'
                  ? 'border-primary-500/50 bg-primary-600/10'
                  : 'border-surface-700/50 hover:border-surface-600/50'
              }`}
            >
              <p className="text-sm font-medium">Simple</p>
              <p className="text-xs text-muted-foreground mt-1">
                Tasks, Milestones, Budget, Site Diary, Quality, Documents
              </p>
            </button>
            <button
              type="button"
              onClick={() => onComplexityChange('full')}
              className={`flex-1 p-4 rounded-lg border text-left transition-colors ${
                complexityMode === 'full'
                  ? 'border-primary-500/50 bg-primary-600/10'
                  : 'border-surface-700/50 hover:border-surface-600/50'
              }`}
            >
              <p className="text-sm font-medium">Full</p>
              <p className="text-xs text-muted-foreground mt-1">
                All subsystems including Programme, Resource Management, Analytics, Contracts
              </p>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Integration Status */}
      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Platform Integrations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {integrations.map((integration) => (
              <div
                key={integration.module}
                className="flex items-center justify-between p-3 rounded-lg border border-surface-700/50"
              >
                <div className="flex items-center gap-2">
                  {integration.connected ? (
                    <CheckCircle className="h-4 w-4 text-green-400" />
                  ) : (
                    <XCircle className="h-4 w-4 text-muted-foreground" />
                  )}
                  <div>
                    <p className="text-sm font-medium">{integration.module}</p>
                    {integration.lastSync && (
                      <p className="text-xs text-muted-foreground">Last sync: {integration.lastSync}</p>
                    )}
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={`text-xs ${integration.connected ? 'border-green-500/50 text-green-400' : 'border-slate-500/50 text-slate-400'}`}
                >
                  {integration.connected ? 'Connected' : 'Not connected'}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Project ID Reference */}
      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Project Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Project ID</span>
              <span className="font-mono text-xs">{projectId}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
