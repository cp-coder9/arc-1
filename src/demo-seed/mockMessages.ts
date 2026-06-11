import type { MockProject } from './mockProjects';

export interface MockMessage {
  id: string;
  projectId: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  text: string;
  timestamp: string;
  attachments: string[];
  replyTo?: string;
}

export function getMessagesForProject(project: MockProject): MockMessage[] {
  const stages = ['brief_enquiry', 'concept_design', 'design_development', 'tender_documentation', 'construction', 'close_out'];
  const currentStageIdx = stages.indexOf(project.stage);
  if (currentStageIdx < 0) return [];

  const msgs: MockMessage[] = [];
  let msgId = 0;

  const addMsg = (senderId: string, senderName: string, senderRole: string, text: string) => {
    msgId++;
    msgs.push({
      id: `msg_${project.id}_${String(msgId).padStart(3, '0')}`,
      projectId: project.id,
      senderId,
      senderName,
      senderRole,
      text,
      timestamp: new Date(new Date(project.createdAt).getTime() + msgId * 3 * 86400000).toISOString(),
      attachments: [],
    });
  };

  // Brief stage messages (always present)
  addMsg(project.clientId, 'Sarah van der Merwe', 'client', 'Hi team, Ive uploaded the initial brief for Parkview Residence. Looking forward to concept proposals.');
  addMsg(project.assignedArchitect || 'demo_architect_01', 'Gregory Thompson', 'architect', 'Received the brief — looks good. Ill start site analysis and concept sketches this week.');

  // Concept design messages
  if (currentStageIdx >= 1) {
    addMsg(project.assignedArchitect || 'demo_architect_01', 'Gregory Thompson', 'architect', 'Concept design pack v1 uploaded. 3 options presented for your review. [link]');
    addMsg(project.clientId, 'Sarah van der Merwe', 'client', 'Option B is our preferred — the north-facing living areas with the courtyard are exactly what we wanted.');
    addMsg(project.assignedArchitect || 'demo_architect_01', 'Gregory Thompson', 'architect', 'Great, Ill develop Option B further and circulate to engineers for preliminary sizing.');
    if (project.assignedBEP) {
      addMsg(project.assignedBEP, 'Tendai Mukwena', 'bep', 'Running SANS 10400-XA compliance check on the concept fenestration schedule. Looking good so far — glazing percentage at 22% on the north facade meets Zone 3 limits.');
    }
  }

  // Design development messages
  if (currentStageIdx >= 2) {
    addMsg('demo_engineer_struct_01', 'David Govender', 'bep', 'Structural prelims done. Roof steel at 152x152 UC sections — columns at 6m grid spacing.');
    addMsg('demo_engineer_elec_01', 'Ahmed Cassim', 'bep', 'Electrical load schedule complete. 80A per unit, backup generator provision included.');
    addMsg(project.assignedArchitect || 'demo_architect_01', 'Gregory Thompson', 'architect', 'Coordinating all services into Revit model. Clash detection in progress.');
    addMsg('demo_qs_01', 'Maria Pretorius', 'bep', 'Elemental cost estimate prepared. Current budget estimate R3.15M — within the R3.2M envelope.');
  }

  // Tender documentation messages
  if (currentStageIdx >= 3) {
    addMsg(project.assignedArchitect || 'demo_architect_01', 'Gregory Thompson', 'architect', 'Tender pack v1 uploaded. 24 drawings + BOQ + prelims. Ready for contractor pricing.');
    addMsg('demo_qs_01', 'Maria Pretorius', 'bep', 'BOQ review complete. Measured quantities verified against drawings. No major discrepancies.');
  }

  // Construction messages
  if (currentStageIdx >= 4) {
    addMsg(project.assignedContractor || 'demo_contractor_01', 'James Mokoena', 'contractor', 'Site establishment complete. Earthworks starting next week. Programme attached.');
    addMsg(project.assignedArchitect || 'demo_architect_01', 'Gregory Thompson', 'architect', 'Site instruction SI-001 issued: Foundation depth increased to 1.8m due to soil conditions. [link]');
    addMsg('demo_engineer_struct_01', 'David Govender', 'bep', 'Confirmed — strip footing design revised to suit 1.8m depth. Reinforcement upgraded to Y12 @ 150 centres.');
    addMsg('demo_qs_01', 'Maria Pretorius', 'bep', 'VO-001 cost impact: Additional concrete + rebar ~R24,500. Contingency still adequate.');
  }

  // Close-out messages
  if (currentStageIdx >= 5) {
    addMsg(project.assignedArchitect || 'demo_architect_01', 'Gregory Thompson', 'architect', 'Practical completion walkthrough scheduled for next Thursday. Snag list to follow.');
    addMsg(project.clientId, 'Sarah van der Merwe', 'client', 'All COCs received. Final payment certificate approved. Thank you team!');
    addMsg(project.assignedContractor || 'demo_contractor_01', 'James Mokoena', 'contractor', 'O&M manuals and as-built drawings uploaded to the project folder. Warranty documents included.');
  }

  return msgs;
}
