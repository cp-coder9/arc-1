import type { ZoneDefinition } from '@/types/municipalWorkspace';
import type { MunicipalityType } from '@/types';

// Registry: maps municipality ID to its zone definitions
const schemeRegistry: Map<MunicipalityType, ZoneDefinition[]> = new Map();

/**
 * Register zone definitions for a municipality.
 * Called by per-municipality data files on import.
 */
export function registerScheme(municipalityId: MunicipalityType, zones: ZoneDefinition[]): void {
  schemeRegistry.set(municipalityId, zones);
}

/**
 * Find a specific zone definition by municipality and zone code.
 * Case-insensitive zone code matching.
 */
export function findZone(municipalityId: MunicipalityType, zoneCode: string): ZoneDefinition | null {
  const zones = schemeRegistry.get(municipalityId);
  if (!zones) return null;
  const normalizedCode = zoneCode.toUpperCase().trim();
  return zones.find(z => z.zoneCode.toUpperCase().trim() === normalizedCode) ?? null;
}

/**
 * List all zone definitions for a municipality.
 */
export function listZonesForMunicipality(municipalityId: MunicipalityType): ZoneDefinition[] {
  return schemeRegistry.get(municipalityId) ?? [];
}

/**
 * List all registered municipalities.
 */
export function listRegisteredMunicipalities(): MunicipalityType[] {
  return [...schemeRegistry.keys()];
}

/**
 * Initialize all scheme data by importing per-municipality files.
 * Call this at module load to ensure all data is registered.
 */
export function initializeSchemes(): void {
  // Will import per-municipality files when they are created (tasks 2.2-2.4)
  // For now, this is a no-op placeholder
}
