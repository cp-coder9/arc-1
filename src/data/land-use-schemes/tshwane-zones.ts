import type { ZoneDefinition } from '@/types/municipalWorkspace';
import { registerScheme } from '@/data/land-use-schemes';

/**
 * City of Tshwane — Tshwane Town Planning Scheme 2014
 *
 * Structured zoning data for common residential, business, and industrial zones.
 * Values are representative of the scheme's development parameters.
 */

const zones: ZoneDefinition[] = [
  {
    id: 'tshwane-r1',
    municipalityId: 'Tshwane',
    schemeName: 'Tshwane Town Planning Scheme 2014',
    zoneCode: 'R1',
    zoneName: 'Residential 1',
    permittedUses: [
      'dwelling house',
      'home occupation',
      'private open space',
      'municipal service infrastructure',
    ],
    consentUses: [
      'bed and breakfast',
      'place of child care',
      'place of instruction (small)',
      'telecommunications mast',
    ],
    parameters: {
      maxCoverage: 50,
      maxFAR: 0.5,
      maxHeight: 8,
      buildingLines: {
        front: 5,
        rear: 3,
        sides: 1.5,
      },
      parkingRatios: [
        {
          landUseType: 'dwelling house',
          ratioDescription: '2 bays per dwelling',
          baysPerUnit: 2,
          unitMeasure: 'dwelling_unit',
        },
      ],
    },
  },
  {
    id: 'tshwane-r2',
    municipalityId: 'Tshwane',
    schemeName: 'Tshwane Town Planning Scheme 2014',
    zoneCode: 'R2',
    zoneName: 'Residential 2',
    permittedUses: [
      'dwelling house',
      'dwelling units (duplex/triplex)',
      'home occupation',
      'private open space',
      'municipal service infrastructure',
    ],
    consentUses: [
      'residential building (up to 4 units)',
      'place of child care',
      'place of instruction (small)',
      'place of worship (small)',
      'bed and breakfast',
    ],
    parameters: {
      maxCoverage: 55,
      maxFAR: 0.65,
      maxHeight: 10,
      buildingLines: {
        front: 4,
        rear: 2.5,
        sides: 1,
      },
      maxDensity: 40,
      parkingRatios: [
        {
          landUseType: 'dwelling unit',
          ratioDescription: '1.5 bays per unit',
          baysPerUnit: 1.5,
          unitMeasure: 'dwelling_unit',
        },
      ],
    },
  },
  {
    id: 'tshwane-r3',
    municipalityId: 'Tshwane',
    schemeName: 'Tshwane Town Planning Scheme 2014',
    zoneCode: 'R3',
    zoneName: 'Residential 3',
    permittedUses: [
      'residential building',
      'dwelling house',
      'dwelling units',
      'home occupation',
      'private open space',
      'municipal service infrastructure',
    ],
    consentUses: [
      'place of assembly (small)',
      'place of child care',
      'place of instruction',
      'place of worship',
      'medical consulting rooms',
      'office (ancillary to residential)',
    ],
    parameters: {
      maxCoverage: 60,
      maxFAR: 1.0,
      maxHeight: 14,
      buildingLines: {
        front: 3,
        rear: 3,
        sides: 2,
      },
      maxDensity: 80,
      parkingRatios: [
        {
          landUseType: 'dwelling unit',
          ratioDescription: '1 bay per unit',
          baysPerUnit: 1,
          unitMeasure: 'dwelling_unit',
        },
      ],
    },
  },
  {
    id: 'tshwane-b1',
    municipalityId: 'Tshwane',
    schemeName: 'Tshwane Town Planning Scheme 2014',
    zoneCode: 'B1',
    zoneName: 'Business 1',
    permittedUses: [
      'shop',
      'office',
      'restaurant',
      'place of entertainment',
      'medical consulting rooms',
      'hotel',
      'service trade',
      'funeral parlour',
      'municipal service infrastructure',
    ],
    consentUses: [
      'filling station',
      'motor dealer',
      'place of worship',
      'residential building (above ground floor)',
      'place of instruction',
      'bottle store',
    ],
    parameters: {
      maxCoverage: 80,
      maxFAR: 2.0,
      maxHeight: 20,
      buildingLines: {
        front: 0,
        rear: 3,
        sides: 0,
      },
      parkingRatios: [
        {
          landUseType: 'office',
          ratioDescription: '1 bay per 30m² GLA',
          baysPerUnit: 1,
          unitMeasure: 'm²_gla',
        },
        {
          landUseType: 'shop',
          ratioDescription: '1 bay per 25m² GLA',
          baysPerUnit: 1,
          unitMeasure: 'm²_gla',
        },
        {
          landUseType: 'restaurant',
          ratioDescription: '1 bay per 10m² GLA',
          baysPerUnit: 1,
          unitMeasure: 'm²_gla',
        },
      ],
    },
  },
  {
    id: 'tshwane-i1',
    municipalityId: 'Tshwane',
    schemeName: 'Tshwane Town Planning Scheme 2014',
    zoneCode: 'I1',
    zoneName: 'Industrial 1',
    permittedUses: [
      'industry (light)',
      'warehouse',
      'transport business',
      'builder\'s yard',
      'service trade',
      'office (ancillary to industrial)',
      'municipal service infrastructure',
    ],
    consentUses: [
      'industry (heavy)',
      'noxious trade',
      'filling station',
      'scrap yard',
      'retail warehouse',
      'place of instruction (industrial training)',
    ],
    parameters: {
      maxCoverage: 75,
      maxFAR: 1.2,
      maxHeight: 15,
      buildingLines: {
        front: 5,
        rear: 3,
        sides: 3,
      },
      parkingRatios: [
        {
          landUseType: 'industry',
          ratioDescription: '1 bay per 100m² GFA',
          baysPerUnit: 1,
          unitMeasure: 'm²_gla',
        },
        {
          landUseType: 'warehouse',
          ratioDescription: '1 bay per 200m² GFA',
          baysPerUnit: 1,
          unitMeasure: 'm²_gla',
        },
      ],
    },
  },
];

registerScheme('Tshwane', zones);

export { zones as tshwaneZones };
