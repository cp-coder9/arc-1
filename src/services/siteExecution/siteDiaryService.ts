import type { MobileFieldCommand, SiteDiaryEntry } from './types';
import { id } from './utils';

export class SiteDiaryService {
  create(command: MobileFieldCommand, data: { weather: string; labourCount: number; plantCount: number; deliveries?: string[]; visitors?: string[]; safetyNotes?: string[]; delayNotes?: string[] }): SiteDiaryEntry {
    return {
      id: id('diary'), projectRef: command.projectRef, date: new Date().toISOString().slice(0, 10),
      weather: data.weather, labourCount: data.labourCount, plantCount: data.plantCount,
      deliveries: data.deliveries ?? [], visitors: data.visitors ?? [], safetyNotes: data.safetyNotes ?? [],
      delayNotes: data.delayNotes ?? [], evidenceRefs: command.evidenceRefs, createdBy: command.actorId,
    };
  }
}
