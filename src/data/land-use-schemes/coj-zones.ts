import type { ZoneDefinition } from '@/types/municipalWorkspace';
import { registerScheme } from '@/data/land-use-schemes';

/**
 * City of Johannesburg Land Use Scheme Zoning Data
 *
 * Based on the Johannesburg Town Planning Scheme 2018 and Sandton Town Planning Scheme patterns.
 * Parameters are representative of common development controls for each zone type.
 *
 * Note: This is advisory reference data. Always verify against the published scheme
 * document for the applicable township/suburb.
 */

const zones: ZoneDefinition[] = [
  {
    id: 'coj-r1',
    municipalityId: 'COJ',
    schemeName: 'Johannesburg Town Planning Scheme 2018',
    zoneCode: 'R1',
    zoneName: 'Residential 1',
    permittedUses: [
      'single dwelling house',
      'home occupation (category 1)',
      'private open space',
    ],
    consentUses: [
      'second dwelling unit',
      'home occupation (category 2)',
      'place of worship',
      'place of instruction (nursery school)',
      'guest house',
    ],
    parameters: {
      maxCoverage: 50,
      maxFAR: 0.5,
      maxHeight: 8,
      buildingLines: {
        front: 5,
        rear: 3,
        sides: 1.5,
        streetSide: 3,
      },
      maxDensity: 15,
      parkingRatios: [
        {
          landUseType: 'dwelling house',
          ratioDescription: '2 bays per dwelling unit',
          baysPerUnit: 2,
          unitMeasure: 'dwelling_unit',
        },
        {
          landUseType: 'second dwelling unit',
          ratioDescription: '1 bay per unit',
          baysPerUnit: 1,
          unitMeasure: 'dwelling_unit',
        },
      ],
    },
  },
  {
    id: 'coj-r2',
    municipalityId: 'COJ',
    schemeName: 'Johannesburg Town Planning Scheme 2018',
    zoneCode: 'R2',
    zoneName: 'Residential 2',
    permittedUses: [
      'single dwelling house',
      'duplex dwelling',
      'group housing (up to 4 units)',
      'home occupation (category 1)',
      'private open space',
    ],
    consentUses: [
      'group housing (more than 4 units)',
      'home occupation (category 2)',
      'place of worship',
      'place of instruction (nursery school)',
      'guest house',
      'residential building (up to 3 storeys)',
    ],
    parameters: {
      maxCoverage: 60,
      maxFAR: 0.75,
      maxHeight: 10,
      buildingLines: {
        front: 4,
        rear: 2,
        sides: 1,
        streetSide: 2.5,
      },
      maxDensity: 40,
      parkingRatios: [
        {
          landUseType: 'dwelling house',
          ratioDescription: '1.5 bays per dwelling unit',
          baysPerUnit: 1.5,
          unitMeasure: 'dwelling_unit',
        },
        {
          landUseType: 'group housing',
          ratioDescription: '1.5 bays per dwelling unit',
          baysPerUnit: 1.5,
          unitMeasure: 'dwelling_unit',
        },
        {
          landUseType: 'guest house',
          ratioDescription: '1 bay per guest room',
          baysPerUnit: 1,
          unitMeasure: 'dwelling_unit',
        },
      ],
    },
  },
  {
    id: 'coj-gr',
    municipalityId: 'COJ',
    schemeName: 'Johannesburg Town Planning Scheme 2018',
    zoneCode: 'GR',
    zoneName: 'General Residential',
    permittedUses: [
      'residential building (flats)',
      'group housing',
      'boarding house',
      'old age home',
      'private open space',
    ],
    consentUses: [
      'place of worship',
      'place of instruction',
      'medical consulting rooms',
      'hotel',
      'conference facility',
      'funeral parlour',
    ],
    parameters: {
      maxCoverage: 60,
      maxFAR: 1.0,
      maxHeight: 14,
      buildingLines: {
        front: 3,
        rear: 3,
        sides: 2,
        streetSide: 3,
      },
      maxDensity: 80,
      parkingRatios: [
        {
          landUseType: 'residential building',
          ratioDescription: '1 bay per dwelling unit',
          baysPerUnit: 1,
          unitMeasure: 'dwelling_unit',
        },
        {
          landUseType: 'boarding house',
          ratioDescription: '1 bay per 3 beds',
          baysPerUnit: 0.33,
          unitMeasure: 'bed',
        },
        {
          landUseType: 'old age home',
          ratioDescription: '1 bay per 4 units',
          baysPerUnit: 0.25,
          unitMeasure: 'dwelling_unit',
        },
      ],
    },
  },
  {
    id: 'coj-gb',
    municipalityId: 'COJ',
    schemeName: 'Johannesburg Town Planning Scheme 2018',
    zoneCode: 'GB',
    zoneName: 'General Business',
    permittedUses: [
      'shop',
      'office',
      'restaurant',
      'place of amusement',
      'hotel',
      'motor garage',
      'medical consulting rooms',
      'funeral parlour',
      'private open space',
    ],
    consentUses: [
      'place of worship',
      'place of instruction',
      'residential building (above ground floor)',
      'service station',
      'hospital',
      'vehicle sales',
      'adult entertainment',
    ],
    parameters: {
      maxCoverage: 80,
      maxFAR: 2.5,
      maxHeight: 25,
      buildingLines: {
        front: 0,
        rear: 3,
        sides: 0,
        streetSide: 0,
      },
      parkingRatios: [
        {
          landUseType: 'shop',
          ratioDescription: '1 bay per 25m² GLA',
          baysPerUnit: 1,
          unitMeasure: 'm²_gla',
        },
        {
          landUseType: 'office',
          ratioDescription: '1 bay per 40m² GLA',
          baysPerUnit: 1,
          unitMeasure: 'm²_gla',
        },
        {
          landUseType: 'restaurant',
          ratioDescription: '1 bay per 10m² GLA',
          baysPerUnit: 1,
          unitMeasure: 'm²_gla',
        },
        {
          landUseType: 'hotel',
          ratioDescription: '1 bay per bedroom plus 1 per 10m² function area',
          baysPerUnit: 1,
          unitMeasure: 'dwelling_unit',
        },
      ],
    },
  },
  {
    id: 'coj-i1',
    municipalityId: 'COJ',
    schemeName: 'Johannesburg Town Planning Scheme 2018',
    zoneCode: 'I1',
    zoneName: 'Industrial 1',
    permittedUses: [
      'industry (light)',
      'warehouse',
      'transport depot',
      'builder\'s yard',
      'scrap yard (enclosed)',
      'motor repair garage',
      'private open space',
    ],
    consentUses: [
      'industry (heavy)',
      'noxious industry',
      'retail (ancillary, max 10% GFA)',
      'office (ancillary)',
      'service station',
      'place of instruction (trade school)',
    ],
    parameters: {
      maxCoverage: 80,
      maxFAR: 1.5,
      maxHeight: 15,
      buildingLines: {
        front: 5,
        rear: 3,
        sides: 3,
        streetSide: 5,
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
        {
          landUseType: 'office (ancillary)',
          ratioDescription: '1 bay per 40m² GFA',
          baysPerUnit: 1,
          unitMeasure: 'm²_gla',
        },
      ],
    },
  },
];

registerScheme('COJ', zones);

export { zones as cojZones };
