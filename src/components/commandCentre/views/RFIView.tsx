'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, MessageSquare, X } from 'lucide-react';
import { subscribeSiteInstructions } from '@/services/commandCentre/realtimeService';
import { siteInstructionService } from '@/services/siteInstructionService';
import { rfiService } from '@/services/commandCentre/rfiService';
import type { SiteInstruction, UserRole } from '@/types';
import type { CommandCentreRFI } from '@/services/commandCentre/rfiService';

interface RFIViewProps {
  projectId: string;
}

type FeedbackState = {
  type: 'success' | 'error';
  message: string;
} | null;

type ActiveTab = 'rfis' | 'site-instructions';

const RFI_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-500/20 text-amber-400 border-amber-500/50',
  critical: 'bg-red-500/20 text-red-400 border-red-500/50',
  closed: 'bg-green-500/20 text-green-400 border-green-500/50',
};

const SI_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-500/20 text-gray-400 border-gray-500/50',
  issued: 'bg-amber-500/20 text-amber-400 border-amber-500/50',
  acknowledged: 'bg-green-500/20 text-green-400 border-green-500/50',
  superseded: 'bg-red-500/20 text-red-400 border-red-500/50',
};

export default function RFIView({ projectId }: RFIViewProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('rfis');
  const [rfis, setRfis] = useState<CommandCentreRFI[]>([]);
  const [siteInstructions, setSiteInstructions] = useState<SiteInstruction[]>([]);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [listenerError, setListenerError] = useState<string | null>(null);
  const [showRfiForm, setShowRfiForm] = useState(false);
  const [showSiForm, setShowSiForm] = useState(false);

  // RFI form state
  const [rfiFormData, setRfiFormData] = useState({
    subject: '',
    description: '',
    addresseeId: '',
    priority: 'medium' as 'low' | 'medium' | 'high' | 'critical',
    originatorId: 'current-user',
  });

  // Site Instruction form state
  const [siFormData, setSiFormData] = useState({
    title: '',
    instruction: '',
    issuedByRole: 'architect' as UserRole,
  });

  // ── Real-time listener for site instructions (Task 5.4) ─────────────────
  useEffect(() => {
    if (!projectId) return;

    const unsubSI = subscribeSiteInstructions(
      projectId,
      (data) => {
        setSiteInstructions(data);
        setListenerError(null);
      },
      (error) => {
        setListenerError('Live updates temporarily unavailable for site instructions');
        console.error('[RFIView] Site Instructions listener error:', error);
      },
    );

    return () => {
      unsubSI();
    };
  }, [projectId]);

  // Load RFIs on mount (real-time for RFIs handled by initial fetch + refresh on create)
  useEffect(() => {
    if (!projectId) return;
    loadRfis();
  }, [projectId]);

  const loadRfis = useCallback(async () => {
    try {
      const data = await rfiService.getRFIs(projectId);
      setRfis(data);
    } catch (error) {
      console.error('[RFIView] Failed to load RFIs:', error);
    }
  }, [projectId]);

  // Auto-dismiss feedback after 3 seconds
  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => setFeedback(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  // ── CRUD operations (Task 5.3) ──────────────────────────────────────────

  const handleCreateRfi = useCallback(async () => {
    try {
      await rfiService.createRFI(projectId, {
        subject: rfiFormData.subject,
        description: rfiFormData.description,
        addresseeId: rfiFormData.addresseeId,
        priority: rfiFormData.priority,
        originatorId: rfiFormData.originatorId,
      });
      setFeedback({ type: 'success', message: 'RFI raised successfully' });
      setShowRfiForm(false);
      setRfiFormData({ subject: '', description: '', addresseeId: '', priority: 'medium', originatorId: 'current-user' });
      // Refresh RFIs
      await loadRfis();
    } catch (error) {
      setFeedback({ type: 'error', message: `Failed to raise RFI: ${error instanceof Error ? error.message : 'Unknown error'}` });
      // Form data retained on failure
    }
  }, [projectId, rfiFormData, loadRfis]);

  const handleCreateSiteInstruction = useCallback(async () => {
    try {
      await siteInstructionService.issueSiteInstruction({
        projectId,
        title: siFormData.title,
        instruction: siFormData.instruction,
        issuedBy: 'current-user',
        issuedByRole: siFormData.issuedByRole,
      });
      setFeedback({ type: 'success', message: 'Site instruction issued successfully' });
      setShowSiForm(false);
      setSiFormData({ title: '', instruction: '', issuedByRole: 'architect' });
    } catch (error) {
      setFeedback({ type: 'error', message: `Failed to issue site instruction: ${error instanceof Error ? error.message : 'Unknown error'}` });
      // Form data retained on failure
    }
  }, [projectId, siFormData]);

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Please select a project to view RFIs and site instructions.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">RFIs & Site Instructions</h2>
        <div className="flex gap-2">
          {activeTab === 'rfis' && (
            <Button size="sm" className="gap-1" onClick={() => setShowRfiForm(true)}>
              <Plus className="h-3.5 w-3.5" />
              Raise RFI
            </Button>
          )}
          {activeTab === 'site-instructions' && (
            <Button size="sm" className="gap-1" onClick={() => setShowSiForm(true)}>
              <Plus className="h-3.5 w-3.5" />
              Issue Instruction
            </Button>
          )}
        </div>
      </div>

      {/* Feedback banner */}
      {feedback && (
        <div className={`flex items-center justify-between px-4 py-2 rounded-lg text-sm ${
          feedback.type === 'success'
            ? 'bg-green-500/20 text-green-400 border border-green-500/50'
            : 'bg-red-500/20 text-red-400 border border-red-500/50'
        }`}>
          <span>{feedback.message}</span>
          <button onClick={() => setFeedback(null)} className="ml-2">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Listener error notification */}
      {listenerError && (
        <div className="flex items-center px-4 py-2 rounded-lg text-sm bg-amber-500/20 text-amber-400 border border-amber-500/50">
          <span>{listenerError}</span>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex border-b border-surface-700/50">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'rfis'
              ? 'border-primary-400 text-primary-400'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('rfis')}
        >
          RFIs
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'site-instructions'
              ? 'border-primary-400 text-primary-400'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('site-instructions')}
        >
          Site Instructions
        </button>
      </div>

      {/* RFI creation form */}
      {showRfiForm && activeTab === 'rfis' && (
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Raise New RFI</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              type="text"
              placeholder="Subject"
              value={rfiFormData.subject}
              onChange={(e) => setRfiFormData((p) => ({ ...p, subject: e.target.value }))}
              className="w-full px-3 py-2 rounded-md border border-surface-700/50 bg-surface-900/50 text-sm"
            />
            <textarea
              placeholder="Description"
              value={rfiFormData.description}
              onChange={(e) => setRfiFormData((p) => ({ ...p, description: e.target.value }))}
              className="w-full px-3 py-2 rounded-md border border-surface-700/50 bg-surface-900/50 text-sm"
              rows={3}
            />
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Addressee ID"
                value={rfiFormData.addresseeId}
                onChange={(e) => setRfiFormData((p) => ({ ...p, addresseeId: e.target.value }))}
                className="flex-1 px-3 py-2 rounded-md border border-surface-700/50 bg-surface-900/50 text-sm"
              />
              <select
                value={rfiFormData.priority}
                onChange={(e) => setRfiFormData((p) => ({ ...p, priority: e.target.value as 'low' | 'medium' | 'high' | 'critical' }))}
                className="px-3 py-2 rounded-md border border-surface-700/50 bg-surface-900/50 text-sm"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={() => setShowRfiForm(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreateRfi}>Raise RFI</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Site Instruction creation form */}
      {showSiForm && activeTab === 'site-instructions' && (
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Issue Site Instruction</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              type="text"
              placeholder="Instruction Title"
              value={siFormData.title}
              onChange={(e) => setSiFormData((p) => ({ ...p, title: e.target.value }))}
              className="w-full px-3 py-2 rounded-md border border-surface-700/50 bg-surface-900/50 text-sm"
            />
            <textarea
              placeholder="Instruction content"
              value={siFormData.instruction}
              onChange={(e) => setSiFormData((p) => ({ ...p, instruction: e.target.value }))}
              className="w-full px-3 py-2 rounded-md border border-surface-700/50 bg-surface-900/50 text-sm"
              rows={3}
            />
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={() => setShowSiForm(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreateSiteInstruction}>Issue Instruction</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* RFI Table */}
      {activeTab === 'rfis' && (
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Active RFIs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-700/50">
                    <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">RFI #</th>
                    <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Subject</th>
                    <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Addressee</th>
                    <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Date Raised</th>
                    <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rfis.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-8 text-muted-foreground">
                        <div className="flex flex-col items-center gap-2">
                          <MessageSquare className="h-8 w-8 opacity-40" />
                          <p>No RFIs raised</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    rfis.map((rfi) => (
                      <tr key={rfi.id} className="border-b border-surface-700/30">
                        <td className="py-2 px-2 font-mono text-xs">{rfi.rfiNumber}</td>
                        <td className="py-2 px-2 font-medium">{rfi.subject}</td>
                        <td className="py-2 px-2 text-muted-foreground">{rfi.addresseeId}</td>
                        <td className="py-2 px-2 text-muted-foreground">{rfi.dateRaised?.split('T')[0] ?? ''}</td>
                        <td className="py-2 px-2">
                          <Badge variant="outline" className={`text-xs ${RFI_STATUS_COLORS[rfi.status] ?? ''}`}>
                            {rfi.status}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Site Instructions Table */}
      {activeTab === 'site-instructions' && (
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Site Instructions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-700/50">
                    <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Title</th>
                    <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Issued By</th>
                    <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Cost Impact</th>
                    <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Date</th>
                    <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {siteInstructions.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-6 text-muted-foreground">
                        No site instructions issued
                      </td>
                    </tr>
                  ) : (
                    siteInstructions.map((si) => (
                      <tr key={si.id} className="border-b border-surface-700/30">
                        <td className="py-2 px-2 font-medium">{si.title}</td>
                        <td className="py-2 px-2 text-muted-foreground">{si.issuedBy}</td>
                        <td className="py-2 px-2 text-muted-foreground capitalize">{si.costImpact}</td>
                        <td className="py-2 px-2 text-muted-foreground">{si.createdAt?.split('T')[0] ?? ''}</td>
                        <td className="py-2 px-2">
                          <Badge variant="outline" className={`text-xs ${SI_STATUS_COLORS[si.status] ?? ''}`}>
                            {si.status}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
