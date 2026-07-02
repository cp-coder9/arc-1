/**
 * SpecForge Discipline Sections — Default section templates per discipline.
 *
 * When a new workspace is auto-created for a project with a known discipline,
 * this module provides sensible default sections to seed the workspace.
 *
 * Requirements: 11.5
 */
import type { SpecSection } from '@/types/specforgeTypes';

/**
 * Map of discipline names to their default section templates.
 * Each section has a unique ID prefix, code, title, discipline tag,
 * and a default ownerRole.
 */
const DISCIPLINE_SECTIONS: Record<string, Omit<SpecSection, 'id'>[]> = {
  architecture: [
    { code: '03', title: 'Concrete', discipline: 'architecture', ownerRole: 'architect', status: 'draft' },
    { code: '04', title: 'Masonry', discipline: 'architecture', ownerRole: 'architect', status: 'draft' },
    { code: '05', title: 'Metals', discipline: 'architecture', ownerRole: 'architect', status: 'draft' },
    { code: '06', title: 'Wood, Plastics & Composites', discipline: 'architecture', ownerRole: 'architect', status: 'draft' },
    { code: '07', title: 'Thermal & Moisture Protection', discipline: 'architecture', ownerRole: 'architect', status: 'draft' },
    { code: '08', title: 'Openings (Doors & Windows)', discipline: 'architecture', ownerRole: 'architect', status: 'draft' },
    { code: '09', title: 'Finishes', discipline: 'architecture', ownerRole: 'architect', status: 'draft' },
    { code: '10', title: 'Specialties', discipline: 'architecture', ownerRole: 'architect', status: 'draft' },
    { code: '12', title: 'Furnishings', discipline: 'architecture', ownerRole: 'architect', status: 'draft' },
  ],
  structure: [
    { code: '03', title: 'Concrete', discipline: 'structure', ownerRole: 'engineer', status: 'draft' },
    { code: '04', title: 'Masonry', discipline: 'structure', ownerRole: 'engineer', status: 'draft' },
    { code: '05', title: 'Metals (Structural Steel)', discipline: 'structure', ownerRole: 'engineer', status: 'draft' },
    { code: '06', title: 'Wood & Timber', discipline: 'structure', ownerRole: 'engineer', status: 'draft' },
    { code: '31', title: 'Earthworks', discipline: 'structure', ownerRole: 'engineer', status: 'draft' },
    { code: '32', title: 'Exterior Improvements', discipline: 'structure', ownerRole: 'engineer', status: 'draft' },
  ],
  electrical: [
    { code: '26', title: 'Electrical', discipline: 'electrical', ownerRole: 'engineer', status: 'draft' },
    { code: '27', title: 'Communications', discipline: 'electrical', ownerRole: 'engineer', status: 'draft' },
    { code: '28', title: 'Electronic Safety & Security', discipline: 'electrical', ownerRole: 'engineer', status: 'draft' },
  ],
  mechanical: [
    { code: '21', title: 'Fire Suppression', discipline: 'mechanical', ownerRole: 'engineer', status: 'draft' },
    { code: '22', title: 'Plumbing', discipline: 'mechanical', ownerRole: 'engineer', status: 'draft' },
    { code: '23', title: 'HVAC', discipline: 'mechanical', ownerRole: 'engineer', status: 'draft' },
  ],
  fire: [
    { code: '07', title: 'Fireproofing & Fire Stopping', discipline: 'fire', ownerRole: 'fire_engineer', status: 'draft' },
    { code: '08', title: 'Fire-Rated Openings', discipline: 'fire', ownerRole: 'fire_engineer', status: 'draft' },
    { code: '21', title: 'Fire Suppression Systems', discipline: 'fire', ownerRole: 'fire_engineer', status: 'draft' },
    { code: '28', title: 'Fire Detection & Alarm', discipline: 'fire', ownerRole: 'fire_engineer', status: 'draft' },
  ],
  energy: [
    { code: '07', title: 'Thermal Insulation', discipline: 'energy', ownerRole: 'bep', status: 'draft' },
    { code: '08', title: 'Glazing & Fenestration', discipline: 'energy', ownerRole: 'bep', status: 'draft' },
    { code: '23', title: 'HVAC (Energy)', discipline: 'energy', ownerRole: 'bep', status: 'draft' },
    { code: '26', title: 'Electrical (Lighting & Power)', discipline: 'energy', ownerRole: 'bep', status: 'draft' },
    { code: '48', title: 'Renewable Energy Systems', discipline: 'energy', ownerRole: 'bep', status: 'draft' },
  ],
  planning: [
    { code: '01', title: 'General Requirements', discipline: 'planning', ownerRole: 'town_planner', status: 'draft' },
    { code: '32', title: 'Exterior Improvements', discipline: 'planning', ownerRole: 'town_planner', status: 'draft' },
    { code: '33', title: 'Utilities', discipline: 'planning', ownerRole: 'town_planner', status: 'draft' },
  ],
  drainage: [
    { code: '22', title: 'Plumbing & Drainage', discipline: 'drainage', ownerRole: 'engineer', status: 'draft' },
    { code: '33', title: 'Utilities (Water & Sewer)', discipline: 'drainage', ownerRole: 'engineer', status: 'draft' },
  ],
  accessibility: [
    { code: '08', title: 'Accessible Openings', discipline: 'accessibility', ownerRole: 'architect', status: 'draft' },
    { code: '10', title: 'Accessible Specialties', discipline: 'accessibility', ownerRole: 'architect', status: 'draft' },
    { code: '14', title: 'Conveying Equipment (Lifts)', discipline: 'accessibility', ownerRole: 'architect', status: 'draft' },
  ],
};

/**
 * Returns default sections for a given discipline.
 * Each section receives a unique ID based on the discipline and code.
 * Returns an empty array if the discipline is not recognized.
 */
export function getDefaultSectionsForDiscipline(discipline: string): SpecSection[] {
  const templates = DISCIPLINE_SECTIONS[discipline];
  if (!templates) return [];

  return templates.map((template) => ({
    ...template,
    id: `sec-${discipline}-${template.code}`,
  }));
}
