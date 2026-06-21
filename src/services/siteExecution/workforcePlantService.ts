import type { MobileFieldCommand, PlantLog, WorkforceLog } from './types';
import { id } from './utils';

export class WorkforcePlantService {
  logWorkforce(command: MobileFieldCommand, data: { trade: string; crewCount: number; hours: number; activity: string; costCode: string; dayworksFlag?: boolean }): WorkforceLog {
    return {
      id: id('workforce'), projectRef: command.projectRef, trade: data.trade, crewCount: data.crewCount,
      hours: data.hours, activity: data.activity, costCode: data.costCode,
      dayworksFlag: data.dayworksFlag ?? false, loggedByRole: command.actorRole,
    };
  }
  logPlant(command: MobileFieldCommand, data: { equipment: string; operator: string; hours: number; fuelLitres: number; condition: 'good' | 'service_due' | 'unsafe' | 'unknown'; costCode: string }): PlantLog {
    return {
      id: id('plant'), projectRef: command.projectRef, equipment: data.equipment, operator: data.operator,
      hours: data.hours, fuelLitres: data.fuelLitres, condition: data.condition, costCode: data.costCode,
      loggedByRole: command.actorRole,
    };
  }
}
