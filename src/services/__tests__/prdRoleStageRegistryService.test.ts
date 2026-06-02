import { describe, expect, it } from 'vitest';
import {
  getPrdLifecycleStages,
  getPrdRoleStageToolset,
  getPrdStakeholderProfile,
  listPrdStakeholderProfiles,
} from '../prdRoleStageRegistryService';

describe('prdRoleStageRegistryService', () => {
  it('exposes the PRD 8-stage lifecycle in canonical order with command-centre labels', () => {
    const stages = getPrdLifecycleStages();

    expect(stages.map(stage => stage.stage)).toEqual([
      'intake',
      'appointment',
      'coordination',
      'compliance',
      'tender',
      'delivery',
      'payments',
      'closeout',
    ]);
    expect(stages[0]).toMatchObject({ stage: 'intake', prdNumber: 1, label: 'Brief & Diagnostic', commandCentreFocus: 'Guided brief, diagnostic prediction, and technical scope confirmation' });
    expect(stages[7]).toMatchObject({ stage: 'closeout', prdNumber: 8, label: 'Close-Out & Handover' });
  });

  it('maps current app roles into the six PRD stakeholder profiles', () => {
    const profiles = listPrdStakeholderProfiles();

    expect(profiles.map(profile => profile.key)).toEqual([
      'client',
      'bep_design_team',
      'main_contractor',
      'subcontractor_supplier',
      'freelancer',
      'admin_governance',
    ]);
    expect(getPrdStakeholderProfile('architect')).toMatchObject({ key: 'bep_design_team', appRoles: ['bep', 'architect'] });
    expect(getPrdStakeholderProfile('supplier')).toMatchObject({ key: 'subcontractor_supplier' });
  });

  it('keeps freelancers isolated to assigned work and blocks raw client-project bidding', () => {
    const profile = getPrdStakeholderProfile('freelancer');
    const toolset = getPrdRoleStageToolset('freelancer', 'coordination');

    expect(profile.marketplaceAccess).toMatchObject({ canBidOnRawClientProjects: false, canReceiveBepAssignedPackages: true });
    expect(toolset.primaryTools).toEqual(expect.arrayContaining(['Assigned Work', 'Submissions & Feedback', 'Remote Desktop / Resource Sharing']));
    expect(toolset.hiddenTools).toEqual(expect.arrayContaining(['BEP Proposal Comparison', 'Client Raw Project Bidding']));
    expect(toolset.nextBestAction).toBe('Submit assigned deliverable or respond to BEP feedback');
  });

  it('returns role and stage filtered tools for payment governance', () => {
    const clientPayment = getPrdRoleStageToolset('client', 'payments');
    const adminPayment = getPrdRoleStageToolset('admin', 'payments');

    expect(clientPayment.primaryTools).toEqual(expect.arrayContaining(['Payments & Escrow', 'Contracts & Digital Signing']));
    expect(clientPayment.nextBestAction).toBe('Review invoice, escrow status, and approval gate before payment release');
    expect(adminPayment.primaryTools).toEqual(expect.arrayContaining(['Admin Whole-System Governance Console', 'Payment Rate Settings', 'AI Orchestration']));
    expect(adminPayment.nextBestAction).toBe('Review disputes, escrow holds, STR/CTR flags, and approval-gate audit trails');
  });
});
