import type { FieldEvidence, MobileFieldCommand, MobileIntent, UserRole } from './types';
import { id } from './utils';

export class MobileCommandParser {
  parse(input: { projectRef: string; actorId: string; actorRole: UserRole; rawText: string; channel: 'mobile_app' | 'whatsapp_style' | 'web'; evidenceRefs?: FieldEvidence[]; offlineDraft?: boolean }): MobileFieldCommand {
    const text = input.rawText.toLowerCase();
    let intent: MobileIntent = 'unknown';
    if (/diary|daily log|weather|delivery/.test(text)) intent = 'log_diary';
    else if (/rfi|request for information|question/.test(text)) intent = 'raise_rfi';
    else if (/site instruction|\bsi\b|instruction/.test(text)) intent = 'draft_site_instruction';
    else if (/snag|defect|punch/.test(text)) intent = 'create_snag';
    else if (/workforce|labour|crew|timesheet/.test(text)) intent = 'log_workforce';
    else if (/plant|equipment|tlb|excavator|crane/.test(text)) intent = 'log_plant';
    return {
      id: id('cmd'), projectRef: input.projectRef, actorId: input.actorId, actorRole: input.actorRole,
      channel: input.channel, rawText: input.rawText, intent, evidenceRefs: input.evidenceRefs ?? [],
      offlineDraft: input.offlineDraft ?? false,
    };
  }
}
