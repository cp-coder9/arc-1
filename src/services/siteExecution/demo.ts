import { MobileCommandParser } from './mobileCommandParser';
import { SiteDiaryService } from './siteDiaryService';
import { RfiSiService } from './rfiSiService';
import { SnagService } from './snagService';
import { WorkforcePlantService } from './workforcePlantService';
import { BlockerService } from './blockerService';
import { agentRecommendation, toInboxTask, toProjectRecord } from './integrationAdapters';

export function runDemo() {
  const parser = new MobileCommandParser();
  const diaryService = new SiteDiaryService();
  const rfiSi = new RfiSiService();
  const snags = new SnagService();
  const wp = new WorkforcePlantService();
  const blockers = new BlockerService();

  const photo = { id: 'ev-photo-001', type: 'photo' as const, ref: 'filemanager://site/photo/cracked-tile.jpg', capturedAt: new Date().toISOString(), capturedBy: 'architect-1' };
  const loc = { id: 'ev-loc-001', type: 'location' as const, ref: 'gps:-33.9249,18.4241', capturedAt: new Date().toISOString(), capturedBy: 'site-manager-1' };

  const diaryCmd = parser.parse({ projectRef: 'ATX-SITE-006', actorId: 'site-manager-1', actorRole: 'site_manager', channel: 'mobile_app', rawText: 'Log diary: clear weather, 14 labour, 2 plant, concrete delivery late', evidenceRefs: [loc], offlineDraft: true });
  const diary = diaryService.create(diaryCmd, { weather: 'clear', labourCount: 14, plantCount: 2, deliveries: ['Concrete delivery late by 90min'], safetyNotes: ['Toolbox talk completed'], delayNotes: ['Concrete delivery delay may affect pour sequence'] });

  const rfiCmd = parser.parse({ projectRef: 'ATX-SITE-006', actorId: 'contractor-1', actorRole: 'contractor', channel: 'whatsapp_style', rawText: 'RFI: A101 door D05 size conflicts with schedule. Time impact possible.' });
  const rfi = rfiSi.raiseRfi(rfiCmd, 'A101 door D05 size conflicts with door schedule. Time impact possible.', ['doc-A101-rev2', 'door-schedule-rev1']);

  const siCmd = parser.parse({ projectRef: 'ATX-SITE-006', actorId: 'pm-1', actorRole: 'project_manager', channel: 'mobile_app', rawText: 'SI draft: move manhole 600mm west due clash with existing service' });
  const siDraft = rfiSi.draftSiteInstruction(siCmd, 'Move manhole 600mm west due clash with existing service', 'architect', ['civil-dwg-C201']);
  const siIssued = rfiSi.issue(siDraft, 'architect-1');

  const snagCmd = parser.parse({ projectRef: 'ATX-SITE-006', actorId: 'architect-1', actorRole: 'architect', channel: 'mobile_app', rawText: 'Snag: cracked bathroom tile unit 3. Assign tiler.', evidenceRefs: [photo] });
  const snag = snags.create(snagCmd, { title: 'Cracked bathroom tile', description: 'Cracked tile to unit 3 bathroom wall behind basin', location: 'Unit 3 bathroom', assignedToRole: 'subcontractor', severity: 'high', dueDays: 3 });
  const snagReady = snags.markReady(snag);
  const snagClosed = snags.verifyClosed(snagReady, 'architect');

  const clientSnagCmd = parser.parse({ projectRef: 'ATX-SITE-006', actorId: 'client-1', actorRole: 'client', channel: 'mobile_app', rawText: 'Defect: water stain on ceiling lobby, photo attached', evidenceRefs: [photo] });
  const clientSnag = snags.create(clientSnagCmd, { title: 'Water stain on lobby ceiling', description: 'Client reported water stain after rain', location: 'Lobby ceiling', assignedToRole: 'contractor', severity: 'critical', dueDays: 1 });

  const workforceCmd = parser.parse({ projectRef: 'ATX-SITE-006', actorId: 'foreman-1', actorRole: 'contractor', channel: 'mobile_app', rawText: 'Workforce: 6 bricklayers 8h level 1 walls dayworks' });
  const workforce = wp.logWorkforce(workforceCmd, { trade: 'bricklayers', crewCount: 6, hours: 8, activity: 'Level 1 masonry walls', costCode: 'CC-2300', dayworksFlag: true });

  const plantCmd = parser.parse({ projectRef: 'ATX-SITE-006', actorId: 'site-manager-1', actorRole: 'site_manager', channel: 'mobile_app', rawText: 'Plant: TLB 5h trenching zone B, unsafe brake issue' });
  const plant = wp.logPlant(plantCmd, { equipment: 'TLB', operator: 'Operator A', hours: 5, fuelLitres: 38, condition: 'unsafe', costCode: 'CC-plant-010' });

  const paymentBlockers = [blockers.fromSnag(snag), blockers.fromSnag(clientSnag), blockers.fromRfi(rfi), blockers.fromSi(siIssued), blockers.fromPlant(plant)].filter((b): b is NonNullable<typeof b> => Boolean(b));
  const projectRecords = [
    toProjectRecord('SITE_DIARY_LOGGED', diary), toProjectRecord('RFI_RAISED', rfi), toProjectRecord('SITE_INSTRUCTION_DRAFTED', siDraft), toProjectRecord('SITE_INSTRUCTION_ISSUED', siIssued), toProjectRecord('SNAG_CREATED', snag), toProjectRecord('SNAG_VERIFIED_CLOSED', snagClosed), toProjectRecord('SNAG_CREATED', clientSnag), toProjectRecord('WORKFORCE_LOGGED', workforce), toProjectRecord('PLANT_LOGGED', plant), ...paymentBlockers.map((b) => toProjectRecord('PAYMENT_BLOCKER_CREATED', b)),
  ];
  const inbox = [
    toInboxTask(rfi.responderRole, 'RFI response due: D05 size conflict', rfi.id, 'high'),
    toInboxTask(siDraft.approverRole, 'Site instruction approval required', siDraft.id, 'high'),
    toInboxTask(snag.assignedToRole, 'Snag assigned: cracked bathroom tile', snag.id, 'high'),
    toInboxTask(clientSnag.assignedToRole, 'Critical client defect assigned', clientSnag.id, 'critical'),
    toInboxTask('health_safety', 'Unsafe plant logged: TLB brake issue', plant.id, 'critical'),
  ];

  return {
    mobileCommandsParsed: [diaryCmd.intent, rfiCmd.intent, siCmd.intent, snagCmd.intent, clientSnagCmd.intent, workforceCmd.intent, plantCmd.intent],
    siteDiary: { labourCount: diary.labourCount, plantCount: diary.plantCount, offlineDraft: diaryCmd.offlineDraft },
    rfi: { responderRole: rfi.responderRole, status: rfi.status, costTimeImpactFlag: rfi.costTimeImpactFlag },
    siteInstruction: { draftStatus: siDraft.status, issuedStatus: siIssued.status },
    snags: { architectCreatedStatus: snag.status, clientCreatedAssignedTo: clientSnag.assignedToRole, clientSnagSeverity: clientSnag.severity },
    workforce: { trade: workforce.trade, crewCount: workforce.crewCount, hours: workforce.hours, dayworksFlag: workforce.dayworksFlag },
    plant: { equipment: plant.equipment, condition: plant.condition },
    paymentBlockerCount: paymentBlockers.length,
    criticalBlockerCount: paymentBlockers.filter((b) => b.severity === 'critical').length,
    projectRecordCount: projectRecords.length,
    inboxTaskCount: inbox.length,
  };
}
