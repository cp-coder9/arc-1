/**
 * Client Toolbox
 *
 * Comprehensive toolset for Client users covering the full project lifecycle:
 * - Guided Brief Wizard: Create project briefs with AI diagnostic guidance
 * - Proposal Comparison: Compare BEP proposals on fee, scope, timeline
 * - Progress Reports: High-level project status translated to simple summaries
 * - Contract Signing: Digital signature interface for appointments/contracts
 * - Escrow Payments: Clean portal with "Pay into escrow" triggers
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  FileText,

  TrendingUp,
  Signature,
  Wallet,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Plus,
  Settings2,
  Calculator,
  Landmark,
  Star,
  Calendar,
  ShieldCheck,
  ArrowLeftRight
} from 'lucide-react';
import type { UserProfile, Job, Application, Escrow, LedgerEntry, ProjectStage } from '../types';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { Label } from './ui/label';
import { Progress } from './ui/progress';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { addDoc, collection, getDocs, query, where, orderBy, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { uploadAndTrackFile } from '../lib/uploadService';
import GuidedBriefWizard from './GuidedBriefWizard';
import FeeEstimator from './FeeEstimator';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { buildProposalComparison } from '../services/marketplaceWorkflowService';
import { buildMarketplaceOpportunityFromBrief } from '../services/marketplaceWorkflowService';

/**
 * Client Tool: Project Brief Creator
 * Enhanced wrapper around GuidedBriefWizard with status tracking
 */
function BriefCreatorTool({ user, onBriefCreated }: { user: UserProfile; onBriefCreated?: () => void }) {
  const [isCreating, setIsCreating] = useState(false);
  const [recentBriefs, setRecentBriefs] = useState<Array<{ id: string; title: string; status: string; createdAt: string }>>([]);

  useEffect(() => {
    if (user.role === 'client') {
      loadRecentBriefs();
    }
  }, [user]);

  const loadRecentBriefs = async () => {
    try {
      const q = query(
        getDemoCol( 'project_briefs'),
        where('clientId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      setRecentBriefs(
        snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        } as any))
      );
    } catch (error) {
      console.error('Failed to load recent briefs:', error);
    }
  };

  return (
    <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm overflow-hidden">
      <CardHeader className="bg-primary/5 border-b border-border">
        <Badge variant="secondary" className="w-fit uppercase tracking-widest">Client Tools</Badge>
        <CardTitle className="font-heading text-2xl flex items-center gap-2">
          <FileText className="text-primary" size={24} />
          Project Brief Creator
        </CardTitle>
        <CardDescription>
          Create a structured project brief with AI diagnostic guidance, upload supporting documents, and publish to the BEP marketplace.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        <Alert className="bg-amber-50 border-amber-200">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-900">AI Guidance is Advisory</AlertTitle>
          <AlertDescription className="text-amber-800">
            AI diagnostic findings help explain likely routes, risks, and professional inputs but require BEP review before any binding commitment.
          </AlertDescription>
        </Alert>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Button
            onClick={() => setIsCreating(true)}
            className="gap-2 h-14 text-lg"
            variant="default"
          >
            <Plus size={20} />
            Create New Brief
          </Button>
          <Button
            onClick={() => { /* Navigate to fee estimator */ }}
            variant="outline"
            className="gap-2 h-14"
          >
            <Calculator size={20} />
            Estimate Fees First
          </Button>
        </div>

        {recentBriefs.length > 0 && (
          <>
            <Separator />
            <div className="space-y-3">
              <h4 className="font-semibold text-sm uppercase tracking-wider">Recent Briefs</h4>
              {recentBriefs.slice(0, 3).map((brief) => (
                <div key={brief.id} className="flex items-center justify-between p-4 rounded-2xl border border-border bg-card hover:bg-accent/50 transition-colors">
                  <div>
                    <p className="font-medium">{brief.title}</p>
                    <Badge variant={brief.status === 'published' ? 'default' : 'secondary'}>{brief.status}</Badge>
                  </div>
                  <Button variant="ghost" size="sm">
                    View <ArrowRight size={16} className="ml-2" />
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>

      {/* Creation Dialog */}
      <Dialog open={isCreating} onOpenChange={setIsCreating}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Project Brief</DialogTitle>
            <DialogDescription>
              Guide the AI diagnostic engine and prepare your project for BEP proposals.
            </DialogDescription>
          </DialogHeader>
          <GuidedBriefWizard user={user} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreating(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/**
 * Client Tool: Proposal Comparison Viewer
 * Compare BEP proposals across fee, scope, timeline, and quality
 */
function ProposalComparisonTool({ user, jobId }: { user: UserProfile; jobId?: string }) {
  const [proposals, setProposals] = useState<
    Array<{
      id: string;
      bepId: string;
      bepName: string;
      sacapNumber?: string;
      totalFee: number;
      serviceStages: string[];
      timeline: { start: string; end: string };
      rating?: number;
      completedJobs?: number;
      specializations: string[];
      proposalNote: string;
      submittedAt: string;
    }>
  >([]);
  const [selectedForAppointment, setSelectedForAppointment] = useState<string | null>(null);

  useEffect(() => {
    if (jobId) loadProposals();
  }, [jobId]);

  const loadProposals = async () => {
    try {
      const q = query(
        getDemoCol( 'applications'),
        where('jobId', '==', jobId),
        where('status', 'in', ['pending', 'accepted'])
      );
      const snapshot = await getDocs(q);
      setProposals(
        snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        } as any))
      );
    } catch (error) {
      console.error('Failed to load proposals:', error);
    }
  };

  const handleAppointment = async (proposerId: string) => {
    try {
      await updateDoc(getDemoDoc( 'applications', selectedForAppointment!), {
        status: 'accepted',
        appointedAt: serverTimestamp(),
      });
      // Create appointment contract record
      await addDoc(getDemoCol( 'appointment_contracts'), {
        jobId,
        clientId: user.uid,
        bepId: proposerId,
        status: 'pending_signature',
        createdAt: serverTimestamp(),
      });
      toast.success('Professional appointed. Contract generated for signature.');
      setSelectedForAppointment(null);
    } catch (error) {
      toast.error('Failed to create appointment. Please try again.');
    }
  };

  return (
    <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm overflow-hidden">
      <CardHeader className="bg-primary/5 border-b border-border">
        <Badge variant="secondary" className="w-fit uppercase tracking-widest">Client Tools</Badge>
        <CardTitle className="font-heading text-2xl flex items-center gap-2">
          <ArrowLeftRight className="text-primary" size={24} />
          Proposal Comparison
        </CardTitle>
        <CardDescription>
          Compare BEP proposals side-by-side on fee structure, service scope, timeline, and track record.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        {proposals.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FileText size={48} className="mx-auto mb-4 opacity-20" />
            <p>No proposals yet. Publish your brief to attract BEP applications.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {proposals.map((proposal, index) => {
                const isSelected = selectedForAppointment === proposal.id;
                return (
                  <Card key={proposal.id} className={cn(
                    "rounded-2xl border-border hover:shadow-md transition-all cursor-pointer",
                    isSelected && "border-primary ring-2 ring-primary/20"
                  )} onClick={() => setSelectedForAppointment(isSelected ? null : proposal.id)}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">{proposal.bepName}</CardTitle>
                          <CardDescription>{proposal.sacapNumber || 'SACAP Registration Pending'}</CardDescription>
                        </div>
                        {proposal.rating && (
                          <div className="flex items-center gap-1 text-amber-500">
                            <Star size={16} fill="currentColor" />
                            <span className="font-semibold">{proposal.rating.toFixed(1)}</span>
                          </div>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Proposed Fee</span>
                        <span className="text-xl font-bold">
                          {new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(proposal.totalFee)}
                        </span>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">Timeline</span>
                        <p className="text-sm">{new Date(proposal.timeline.start).toLocaleDateString()} - {new Date(proposal.timeline.end).toLocaleDateString()}</p>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">Service Stages</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {proposal.serviceStages.slice(0, 3).map((stage) => (
                            <Badge key={stage} variant="outline" className="text-xs">{stage}</Badge>
                          ))}
                          {proposal.serviceStages.length > 3 && (
                            <Badge variant="secondary" className="text-xs">+{proposal.serviceStages.length - 3}</Badge>
                          )}
                        </div>
                      </div>
                      <div className="pt-2 border-t border-border">
                        <p className="text-sm line-clamp-2 text-muted-foreground">{proposal.proposalNote}</p>
                      </div>
                    </CardContent>
                    <CardFooter className="pt-0">
                      {isSelected && (
                        <Button className="w-full gap-2" onClick={(e) => { e.stopPropagation(); handleAppointment(proposal.bepId); }}>
                          <CheckCircle2 size={16} />
                          Appoint This Professional
                        </Button>
                      )}
                    </CardFooter>
                  </Card>
                );
              })}
            </div>

            {selectedForAppointment && (
              <Alert className="bg-primary/5 border-primary">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <AlertTitle className="text-primary">Ready to Appoint</AlertTitle>
                <AlertDescription>
                  An appointment contract will be generated automatically upon confirmation.
                </AlertDescription>
              </Alert>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Client Tool: Progress Reports Dashboard
 * High-level project status translated to simple summaries
 */
function ProgressReportsTool({ user, activeProjectId }: { user: UserProfile; activeProjectId?: string }) {
  const [projects, setProjects] = useState<Array<{
    id: string;
    title: string;
    currentStage: ProjectStage;
    stageHistory: Array<{ stage: string; enteredAt: string; exitedAt?: string }>;
    status: string;
    updatedAt: string;
  }>>([]);

  const STAGE_LABELS: Record<ProjectStage, { label: string; description: string }> = {
    intake: { label: 'Brief & Diagnostic', description: 'AI analysis and professional matching' },
    scoping: { label: 'Scope Confirmation', description: 'Confirm project scope, constraints, and professional team route' },
    appointment: { label: 'Appointment', description: 'Contract signing and escrow setup' },
    coordination: { label: 'Design Coordination', description: 'Multi-discipline design development' },
    compliance: { label: 'Compliance & Submission', description: 'SANS verification and council submission' },
    tender: { label: 'Tender & Procurement', description: 'Contractor bidding and materials planning' },
    delivery: { label: 'Construction Delivery', description: 'On-site building works' },
    payments: { label: 'Payment Processing', description: 'Milestone claims and verification' },
    closeout: { label: 'Close-out & Handover', description: 'Final inspections and documentation' },
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const clientProjects = await getDocs(
        query(getDemoCol( 'projects'), where('clientId', '==', user.uid))
      );
      setProjects(clientProjects.docs.map((doc) => ({ id: doc.id, ...doc.data() } as any)));
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  const currentStageProgress = (stage: ProjectStage) => {
    const progression: ProjectStage[] = ['intake', 'appointment', 'coordination', 'compliance', 'tender', 'delivery', 'payments', 'closeout'];
    return ((progression.indexOf(stage) + 1) / progression.length) * 100;
  };

  return (
    <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm overflow-hidden">
      <CardHeader className="bg-primary/5 border-b border-border">
        <Badge variant="secondary" className="w-fit uppercase tracking-widest">Client Tools</Badge>
        <CardTitle className="font-heading text-2xl flex items-center gap-2">
          <TrendingUp className="text-primary" size={24} />
          Progress Reports
        </CardTitle>
        <CardDescription>
          Track your project status with plain-language summaries and key milestones.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        {projects.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Calendar size={48} className="mx-auto mb-4 opacity-20" />
            <p>No active projects. Create a brief to get started.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {projects.map((project) => (
              <Card key={project.id} className="rounded-2xl border-border bg-card hover:shadow-md transition-all">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle>{project.title}</CardTitle>
                      <CardDescription>Project #{project.id.slice(0, 8)}</CardDescription>
                    </div>
                    <Badge variant={project.status === 'active' ? 'default' : 'secondary'}>
                      {project.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium flex items-center gap-2">
                        <ShieldCheck size={16} />
                        {STAGE_LABELS[project.currentStage]?.label}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {Math.round(currentStageProgress(project.currentStage))}% Complete
                      </span>
                    </div>
                    <Progress value={currentStageProgress(project.currentStage)} className="h-2" />
                    <p className="text-sm text-muted-foreground mt-2">
                      {STAGE_LABELS[project.currentStage]?.description}
                    </p>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Last Updated</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(project.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Button variant="outline" size="sm">
                      View Full Report <ArrowRight size={14} className="ml-2" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Client Tool: Contract Signing Portal
 * Digital signature interface for appointments and contracts
 */
function ContractSigningTool({ user, activeContractId }: { user: UserProfile; activeContractId?: string }) {
  const [contracts, setContracts] = useState<Array<{
    id: string;
    type: 'appointment' | 'subcontract' | 'supplier';
    counterpartyName: string;
    counterpartyId: string;
    projectId: string;
    status: 'pending_signature' | 'signed' | 'rejected';
    documentUrl: string;
    createdAt: string;
    expiresAt?: string;
  }>>([]);
  const [signingContract, setSigningContract] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);

  useEffect(() => {
    loadContracts();
  }, []);

  const loadContracts = async () => {
    try {
      const q = query(
        getDemoCol( 'appointment_contracts'),
        where('clientId', '==', user.uid)
      );
      const snapshot = await getDocs(q);
      setContracts(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as any)));
    } catch (error) {
      console.error('Failed to load contracts:', error);
    }
  };

  const handleSign = async (contractId: string) => {
    setSigning(true);
    try {
      await updateDoc(getDemoDoc( 'appointment_contracts', contractId), {
        status: 'signed',
        signedBy: user.uid,
        signedAt: serverTimestamp(),
      });
      toast.success('Contract signed successfully');
      await loadContracts();
      setSigningContract(null);
    } catch (error) {
      toast.error('Failed to sign contract');
    } finally {
      setSigning(false);
    }
  };

  return (
    <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm overflow-hidden">
      <CardHeader className="bg-primary/5 border-b border-border">
        <Badge variant="secondary" className="w-fit uppercase tracking-widest">Client Tools</Badge>
        <CardTitle className="font-heading text-2xl flex items-center gap-2">
          <Signature className="text-primary" size={24} />
          Contract Signing
        </CardTitle>
        <CardDescription>
          Review and digitally sign appointment contracts, subcontractor agreements, and supplier terms.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        {contracts.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FileText size={48} className="mx-auto mb-4 opacity-20" />
            <p>No pending contracts. Contracts are generated when you appoint a professional.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {contracts.map((contract) => (
              <Card key={contract.id} className={cn(
                "rounded-2xl border-border",
                contract.status === 'pending_signature' && "border-amber-300 bg-amber-50/30"
              )}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <Badge variant="outline" className="mb-2">{contract.type}</Badge>
                      <CardTitle className="text-lg">{contract.counterpartyName}</CardTitle>
                      <CardDescription>
                        Project #{contract.projectId.slice(0, 8)}
                      </CardDescription>
                    </div>
                    <Badge variant={
                      contract.status === 'signed' ? 'default' :
                      contract.status === 'pending_signature' ? 'destructive' : 'secondary'
                    }>
                      {contract.status.replace('_', ' ')}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Created</span>
                    <span>{new Date(contract.createdAt).toLocaleDateString()}</span>
                  </div>
                  {contract.expiresAt && (
                    <Alert className={cn(
                      "mb-0",
                      new Date(contract.expiresAt) < new Date() ? "bg-destructive/10 border-destructive" : "bg-amber-50 border-amber-200"
                    )}>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="text-sm">
                        {new Date(contract.expiresAt) < new Date() ? 'Contract expired' : `Expires ${new Date(contract.expiresAt).toLocaleDateString()}`}
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
                <CardFooter className="pt-0 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(contract.documentUrl, '_blank')}
                  >
                    View Document
                  </Button>
                  {contract.status === 'pending_signature' && (
                    <Button
                      size="sm"
                      onClick={() => setSigningContract(contract.id)}
                      disabled={signing}
                    >
                      {signing && signingContract === contract.id ? (
                        <>
                          <Loader2 size={16} className="animate-spin mr-2" />
                          Signing...
                        </>
                      ) : (
                        <>
                          <Signature size={16} className="mr-2" />
                          Sign
                        </>
                      )}
                    </Button>
                  )}
                </CardFooter>
              </Card>
            ))}
          </div>
        )}

        {/* Signing Dialog */}
        {signingContract && contracts.find(c => c.id === signingContract) && (
          <Dialog open onOpenChange={() => setSigningContract(null)}>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Sign Contract</DialogTitle>
                <DialogDescription>
                  Review the contract below carefully before signing.
                </DialogDescription>
              </DialogHeader>
              <iframe
                src={contracts.find(c => c.id === signingContract)?.documentUrl || ''}
                className="w-full h-96 border rounded-lg"
                title="Contract Document"
              />
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setSigningContract(null)}>Cancel</Button>
                <Button onClick={() => handleSign(signingContract)} disabled={signing}>
                  {signing ? <Loader2 size={16} className="animate-spin mr-2" /> : <Signature size={16} className="mr-2" />}
                  Confirm Signature
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Client Tool: Escrow Payments Manager
 * Manage payments, view milestones, and release funds
 */
function EscrowPaymentsTool({ user, jobId }: { user: UserProfile; jobId?: string }) {
  const [escrows, setEscrows] = useState<Array<{
    id: string;
    jobId: string;
    totalAmount: number;
    heldAmount: number;
    releasedAmount: number;
    platformFeeAmount: number;
    status: 'active' | 'funded' | 'released' | 'disputed';
    milestones: Array<{
      id: string;
      name: string;
      stage: string;
      amount: number;
      percentage: number;
      status: 'unfunded' | 'funded' | 'certified' | 'released' | 'disputed';
      dueDate?: string;
    }>;
    createdAt: string;
  }>>([]);
  const [selectedEscrow, setSelectedEscrow] = useState<string | null>(null);

  useEffect(() => {
    if (user.role === 'client') loadEscrows();
  }, [user]);

  const loadEscrows = async () => {
    try {
      const q = query(getDemoCol( 'escrows'), where('clientId', '==', user.uid));
      const snapshot = await getDocs(q);
      setEscrows(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as any)));
    } catch (error) {
      console.error('Failed to load escrows:', error);
    }
  };

  const handleFundEscrow = async (escrowId: string, amount: number) => {
    try {
      // Simulate payment integration - in production, redirect to payment gateway
      toast.success('Processing payment...');

      await updateDoc(getDemoDoc( 'escrows', escrowId), {
        status: 'funded',
        heldAmount: serverTimestamp(),
        fundedAt: serverTimestamp(),
      });

      toast.success('Funds deposited into escrow');
      await loadEscrows();
    } catch (error) {
      toast.error('Payment failed. Please try again.');
    }
  };

  const handleReleaseMilestone = async (escrowId: string, milestoneId: string) => {
    try {
      await updateDoc(getDemoDoc( 'escrows', escrowId, 'milestones', milestoneId), {
        status: 'released',
        releasedAt: serverTimestamp(),
      });
      toast.success('Milestone payment released');
      await loadEscrows();
    } catch (error) {
      toast.error('Failed to release payment');
    }
  };

  const STAGE_LABELS: Record<string, string> = {
    intake: 'Brief & Diagnostic',
    appointment: 'Professional Appointment',
    coordination: 'Design Coordination',
    compliance: 'Compliance Submission',
    tender: 'Tender & Procurement',
    delivery: 'Construction Delivery',
    closeout: 'Close-out',
  };

  return (
    <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm overflow-hidden">
      <CardHeader className="bg-primary/5 border-b border-border">
        <Badge variant="secondary" className="w-fit uppercase tracking-widest">Client Tools</Badge>
        <CardTitle className="font-heading text-2xl flex items-center gap-2">
          <Wallet className="text-primary" size={24} />
          Escrow Payments
        </CardTitle>
        <CardDescription>
          Secure payment management with milestone-based releases and platform fee transparency.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        {escrows.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Wallet size={48} className="mx-auto mb-4 opacity-20" />
            <p>No active escrow accounts. Create a project and appoint a professional to get started.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {escrows.map((escrow) => (
              <Card key={escrow.id} className="rounded-2xl border-border bg-card hover:shadow-md transition-all">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle>Project Escrow</CardTitle>
                      <CardDescription>Job #{escrow.jobId.slice(0, 8)}</CardDescription>
                    </div>
                    <Badge variant={escrow.status === 'active' ? 'default' : 'secondary'}>
                      {escrow.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="p-3 rounded-xl bg-primary/5">
                      <p className="text-xs text-muted-foreground">Total Funds</p>
                      <p className="text-lg font-bold">
                        {new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(escrow.totalAmount)}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-amber-50">
                      <p className="text-xs text-muted-foreground">Held in Escrow</p>
                      <p className="text-lg font-bold">
                        {new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(escrow.heldAmount)}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-green-50">
                      <p className="text-xs text-muted-foreground">Released</p>
                      <p className="text-lg font-bold text-green-700">
                        {new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(escrow.releasedAmount)}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-blue-50">
                      <p className="text-xs text-muted-foreground">Platform Fee</p>
                      <p className="text-lg font-bold text-blue-700">
                        {new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(escrow.platformFeeAmount)}
                      </p>
                    </div>
                  </div>

                  {/* Milestones */}
                  <div className="space-y-3">
                    <h4 className="font-semibold text-sm uppercase tracking-wider">Milestone Payments</h4>
                    {escrow.milestones?.map((milestone, index) => (
                      <div key={milestone.id || index} className="flex items-center justify-between p-3 rounded-xl border border-border">
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
                            milestone.status === 'released' ? "bg-green-100 text-green-700" :
                            milestone.status === 'funded' ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"
                          )}>
                            {index + 1}
                          </div>
                          <div>
                            <p className="font-medium">{milestone.name || STAGE_LABELS[milestone.stage]}</p>
                            <Badge variant={milestone.status === 'released' ? 'default' : 'secondary'} className="text-xs">
                              {milestone.status}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="font-semibold">
                              {new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(milestone.amount)}
                            </p>
                            <p className="text-xs text-muted-foreground">{milestone.percentage}%</p>
                          </div>
                          {milestone.status === 'funded' && (
                            <Button
                              size="sm"
                              onClick={() => handleReleaseMilestone(escrow.id, milestone.id)}
                            >
                              Release
                            </Button>
                          )}
                          {milestone.status === 'unfunded' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleFundEscrow(escrow.id, milestone.amount)}
                            >
                              Fund
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Payment Summary */}
                  <Separator />
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Created</span>
                    <span>{new Date(escrow.createdAt).toLocaleDateString()}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Quick Fund Dialog */}
        {selectedEscrow && (
          <Dialog open onOpenChange={() => setSelectedEscrow(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Fund Escrow Account</DialogTitle>
                <DialogDescription>
                  Add funds to your escrow account for project milestone payments.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-primary/5">
                  <p className="text-sm text-muted-foreground">Current Balance</p>
                  <p className="text-2xl font-bold">
                    {new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(
                      escrows.find(e => e.id === selectedEscrow)?.heldAmount || 0
                    )}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Amount (ZAR)</Label>
                  <Input type="number" placeholder="Enter amount" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSelectedEscrow(null)}>Cancel</Button>
                <Button onClick={() => setSelectedEscrow(null)}>Proceed to Payment</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Main Client Toolbox Component
 * Aggregates all client-facing tools with tabs navigation
 */
export interface ClientToolboxProps {
  user: UserProfile;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  selectedProjectId?: string;
  selectedJobId?: string;
}

export default function ClientToolbox({
  user,
  activeTab = 'brief',
  onTabChange,
  selectedProjectId,
  selectedJobId,
}: ClientToolboxProps) {
  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={onTabChange}>
        <TabsList className="grid grid-cols-5 lg:grid-cols-10 w-full max-w-4xl mx-auto mb-6">
          <TabsTrigger value="brief" className="text-xs sm:text-sm">
            <FileText size={14} className="mr-1 sm:mr-2" />
            <span className="hidden sm:inline">Create Brief</span>
            <span className="sm:hidden">Brief</span>
          </TabsTrigger>
          <TabsTrigger value="proposals" className="text-xs sm:text-sm">
            <ArrowLeftRight size={14} className="mr-1 sm:mr-2" />
            <span className="hidden sm:inline">Proposals</span>
            <span className="sm:hidden">Proposals</span>
          </TabsTrigger>
          <TabsTrigger value="progress" className="text-xs sm:text-sm">
            <TrendingUp size={14} className="mr-1 sm:mr-2" />
            <span className="hidden sm:inline">Progress</span>
            <span className="sm:hidden">Progress</span>
          </TabsTrigger>
          <TabsTrigger value="contracts" className="text-xs sm:text-sm">
            <Signature size={14} className="mr-1 sm:mr-2" />
            <span className="hidden sm:inline">Contracts</span>
            <span className="sm:hidden">Contracts</span>
          </TabsTrigger>
          <TabsTrigger value="payments" className="text-xs sm:text-sm">
            <Wallet size={14} className="mr-1 sm:mr-2" />
            <span className="hidden sm:inline">Payments</span>
            <span className="sm:hidden">Payments</span>
          </TabsTrigger>
          <TabsTrigger value="fees" className="text-xs sm:text-sm hidden lg:flex">
            <Calculator size={14} className="mr-2" />
            Fees
          </TabsTrigger>
          <TabsTrigger value="reports" className="text-xs sm:text-sm hidden xl:flex">
            <FileText size={14} className="mr-2" />
            Reports
          </TabsTrigger>
          <TabsTrigger value="municipal" className="text-xs sm:text-sm hidden xl:flex">
            <Landmark size={14} className="mr-2" />
            Municipal
          </TabsTrigger>
          <TabsTrigger value="directory" className="text-xs sm:text-sm hidden xl:flex">
            <Search size={14} className="mr-2" />
            Directory
          </TabsTrigger>
          <TabsTrigger value="settings" className="text-xs sm:text-sm hidden xl:flex">
            <Settings2 size={14} className="mr-2" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="brief">
          <BriefCreatorTool user={user} />
        </TabsContent>

        <TabsContent value="proposals">
          <ProposalComparisonTool user={user} jobId={selectedJobId} />
        </TabsContent>

        <TabsContent value="progress">
          <ProgressReportsTool user={user} activeProjectId={selectedProjectId} />
        </TabsContent>

        <TabsContent value="contracts">
          <ContractSigningTool user={user} activeContractId={undefined} />
        </TabsContent>

        <TabsContent value="payments">
          <EscrowPaymentsTool user={user} jobId={selectedJobId} />
        </TabsContent>

        <TabsContent value="fees">
          <FeeEstimator role="client" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Additional icon imports needed for hidden tabs
import { Search } from 'lucide-react';

import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';