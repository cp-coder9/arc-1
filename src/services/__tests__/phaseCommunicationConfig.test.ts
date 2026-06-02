import { describe, expect, it } from 'vitest';
import { getPhaseCommunicationConfig, PHASE_COMMUNICATION_CONFIG, PROJECT_COMMUNICATION_CAPTURE_TYPES } from '../phaseCommunicationConfig';
import { PROJECT_STAGE_ORDER } from '../../types';

describe('phaseCommunicationConfig', () => {
  it('covers every canonical project stage with behaviour-changing capture guidance', () => {
    expect(Object.keys(PHASE_COMMUNICATION_CONFIG).sort()).toEqual([...PROJECT_STAGE_ORDER].sort());

    for (const stage of PROJECT_STAGE_ORDER) {
      const config = getPhaseCommunicationConfig(stage);
      expect(config.stage).toBe(stage);
      expect(config.captureTools.length).toBeGreaterThan(0);
      expect(config.suggestedPrompts.length).toBeGreaterThan(0);
      expect(config.fileFocus.length).toBeGreaterThan(0);
      expect(config.nextActions.length).toBeGreaterThan(0);
      expect(config.conversionRoutes.length).toBeGreaterThan(0);
    }
  });

  it('maps delivery to site-heavy capture and compliance to authority evidence', () => {
    expect(getPhaseCommunicationConfig('delivery')).toMatchObject({
      stage: 'delivery',
      captureTools: expect.arrayContaining(['site_photo', 'site_voice_note', 'rfi', 'site_instruction']),
      conversionRoutes: expect.arrayContaining(['site_log', 'rfi', 'snag_item']),
    });

    expect(getPhaseCommunicationConfig('compliance')).toMatchObject({
      stage: 'compliance',
      captureTools: expect.arrayContaining(['drawing_comment', 'document_upload', 'approval_request']),
      conversionRoutes: expect.arrayContaining(['municipal_submission', 'compliance_issue']),
    });
  });

  it('keeps capture types explicit for validation and UI filtering', () => {
    expect(PROJECT_COMMUNICATION_CAPTURE_TYPES).toEqual(expect.arrayContaining(['chat', 'voice_note', 'site_photo', 'rfi', 'approval_request']));
  });
});
