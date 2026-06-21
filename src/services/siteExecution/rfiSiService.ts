import type { MobileFieldCommand, RFI, SiteInstruction, UserRole } from './types';
import { daysFromNow, id } from './utils';
import { rfiResponderFor } from './roleRoutingService';

export class RfiSiService {
  raiseRfi(command: MobileFieldCommand, question: string, linkedRefs: string[] = []): RFI {
    return {
      id: id('rfi'), projectRef: command.projectRef, question, raisedByRole: command.actorRole,
      responderRole: rfiResponderFor(question), linkedRefs, dueDate: daysFromNow(7), status: 'open',
      costTimeImpactFlag: /cost|time|delay|variation|claim/i.test(question),
    };
  }
  draftSiteInstruction(command: MobileFieldCommand, instruction: string, approverRole: UserRole = 'architect', linkedRefs: string[] = []): SiteInstruction {
    return {
      id: id('si'), projectRef: command.projectRef, instruction, draftedByRole: command.actorRole,
      approverRole, status: 'approval_required',
      costTimeImpactFlag: /cost|time|delay|variation|move|change/i.test(instruction), linkedRefs,
    };
  }
  issue(si: SiteInstruction, approvedBy: string): SiteInstruction { return { ...si, status: 'issued', approvedBy }; }
  acknowledge(si: SiteInstruction, acknowledgedBy: string): SiteInstruction { return { ...si, status: 'acknowledged', acknowledgedBy }; }
}
