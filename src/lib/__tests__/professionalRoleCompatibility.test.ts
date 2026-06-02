import { describe, expect, it } from 'vitest';
import {
  getApplicationProfessionalId,
  getLeadProfessionalId,
  getSelectedProfessionalId,
  isLeadProfessional,
  isSelectedProfessional,
  withProfessionalApplicationAliases,
  withProfessionalJobAliases,
  withProfessionalProjectAliases,
} from '../professionalRoleCompatibility';

describe('professional role compatibility helpers', () => {
  it('reads selected professional ids using canonical, BEP, then legacy architect aliases', () => {
    expect(getSelectedProfessionalId({ selectedProfessionalId: 'pro-1', selectedBepId: 'bep-1', selectedArchitectId: 'arch-1' })).toBe('pro-1');
    expect(getSelectedProfessionalId({ selectedBepId: 'bep-1', selectedArchitectId: 'arch-1' })).toBe('bep-1');
    expect(getSelectedProfessionalId({ selectedArchitectId: 'arch-1' })).toBe('arch-1');
    expect(getSelectedProfessionalId({ selectedProfessionalId: '   ', selectedArchitectId: 'arch-1' })).toBe('arch-1');
  });

  it('reads application professional ids across current and legacy names', () => {
    expect(getApplicationProfessionalId({ professionalId: 'pro-1', bepId: 'bep-1', architectId: 'arch-1' })).toBe('pro-1');
    expect(getApplicationProfessionalId({ bepId: 'bep-1', architectId: 'arch-1' })).toBe('bep-1');
    expect(getApplicationProfessionalId({ architectId: 'arch-1' })).toBe('arch-1');
  });

  it('reads project lead ids across current and legacy names', () => {
    expect(getLeadProfessionalId({ leadProfessionalId: 'pro-1', leadBepId: 'bep-1', leadArchitectId: 'arch-1' })).toBe('pro-1');
    expect(getLeadProfessionalId({ leadBepId: 'bep-1', leadArchitectId: 'arch-1' })).toBe('bep-1');
    expect(getLeadProfessionalId({ leadArchitectId: 'arch-1' })).toBe('arch-1');
  });

  it('matches selected/lead professional access through aliases', () => {
    expect(isSelectedProfessional({ selectedBepId: 'bep-1' }, 'bep-1')).toBe(true);
    expect(isSelectedProfessional({ selectedBepId: 'bep-1' }, 'other')).toBe(false);
    expect(isLeadProfessional({ leadBepId: 'bep-1' }, 'bep-1')).toBe(true);
  });

  it('backfills alias sets before new writes without overwriting explicit values', () => {
    expect(withProfessionalJobAliases({ selectedArchitectId: 'arch-1' })).toMatchObject({
      selectedProfessionalId: 'arch-1',
      selectedBepId: 'arch-1',
      selectedArchitectId: 'arch-1',
    });

    expect(withProfessionalApplicationAliases({ architectId: 'arch-1' })).toMatchObject({
      professionalId: 'arch-1',
      bepId: 'arch-1',
      architectId: 'arch-1',
    });

    expect(withProfessionalProjectAliases({ leadArchitectId: 'arch-1' })).toMatchObject({
      leadProfessionalId: 'arch-1',
      leadBepId: 'arch-1',
      leadArchitectId: 'arch-1',
    });
  });
});
