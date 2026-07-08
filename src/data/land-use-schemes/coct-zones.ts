import type { ZoneDefinition } from '@/types/municipalWorkspace';
import { registerScheme } from '@/data/land-use-schemes';

/**
 * City of Cape Town — Zoning Scheme Regulations (2012, as amended)
 *
 * Structured zone definitions for common Cape Town zones.
 * Source reference: Cape Town Zoning Scheme Regulations (2012).
 * Advisory only — always verify against the published scheme document.
 */

const coctZones: ZoneDefinition[] = [
  {
    id: 'coct-sr1',
    municipalityId: 'COCT',
    schemeName: 'Cape Town Zoning Scheme Regulations 2012',
    zoneCode: 'SR1',
    zoneName: 'Single Residential Zone 1',
    permittedUses: [
      'dwelling house',
      'home occupation',
      'bed and breakfast (1–2 rooms)',
    ],
    consentUses: [
      'second dwelling',
      'guest house',
      'place of instruction (small)',
      'bed and breakfast (3+ rooms)',
    ],
    parameters: {
      maxCoverage: 50,
      maxFAR: 0.6,
      maxHeight: 8,
      buildingLines: {
        front: 4,
        rear: 2,
        sides: 1,
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
    id: 'coct-sr2',
    municipalityId: 'COCT',
    schemeName: 'Cape Town Zoning Scheme Regulations 2012',
    zoneCode: 'SR2',
    zoneName: 'Single Residential Zone 2',
    permittedUses: [
      'dwelling house',
      'home occupation',
    ],
    consentUses: [
      'second dwelling',
      'guest house',
      'place of worship (small)',
    ],
    parameters: {
      maxCoverage: 50,
      maxFAR: 0.4,
      maxHeight: 8,
      buildingLines: {
        front: 6,
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
    id: 'coct-gr1',
    municipalityId: 'COCT',
    schemeName: 'Cape Town Zoning Scheme Regulations 2012',
    zoneCode: 'GR1',
    zoneName: 'General Residential Zone 1',
    permittedUses: [
      'dwelling house',
      'flats',
      'group housing',
      'home occupation',
    ],
    consentUses: [
      'place of assembly (small)',
      'place of instruction',
      'boarding house',
      'medical consulting rooms',
      'hotel',
    ],
    parameters: {
      maxCoverage: 50,
      maxFAR: 0.75,
      maxHeight: 12,
      buildingLines: {
        front: 3,
        rear: 3,
        sides: 2,
      },
      maxDensity: 40,
      parkingRatios: [
        {
          landUseType: 'flats',
          ratioDescription: '1 bay per unit',
          baysPerUnit: 1,
          unitMeasure: 'dwelling_unit',
        },
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
    id: 'coct-gb1',
    municipalityId: 'COCT',
    schemeName: 'Cape Town Zoning Scheme Regulations 2012',
    zoneCode: 'GB1',
    zoneName: 'General Business Zone 1',
    permittedUses: [
      'office',
      'shop',
      'restaurant',
      'place of assembly',
      'medical consulting rooms',
      'hotel',
      'service trade',
    ],
    consentUses: [
      'vehicle sales',
      'filling station',
      'place of instruction',
      'light industry',
    ],
    parameters: {
      maxCoverage: 80,
      maxFAR: 3.0,
      maxHeight: 24,
      buildingLines: {
        front: 0,
        rear: 2,
        sides: 0,
      },
      parkingRatios: [
        {
          landUseType: 'office',
          ratioDescription: '1 bay per 25m² GLA',
          baysPerUnit: 1,
          unitMeasure: 'm²_gla',
        },
        {
          landUseType: 'shop',
          ratioDescription: '1 bay per 25m² GLA',
          baysPerUnit: 1,
          unitMeasure: 'm²_gla',
        },
      ],
    },
  },
  {
    id: 'coct-gb2',
    municipalityId: 'COCT',
    schemeName: 'Cape Town Zoning Scheme Regulations 2012',
    zoneCode: 'GB2',
    zoneName: 'General Business Zone 2',
    permittedUses: [
      'office',
      'shop',
      'restaurant',
      'medical consulting rooms',
      'service trade',
    ],
    consentUses: [
      'place of assembly',
      'hotel',
      'vehicle sales',
      'filling station',
    ],
    parameters: {
      maxCoverage: 80,
      maxFAR: 2.5,
      maxHeight: 18,
      buildingLines: {
        front: 0,
        rear: 2,
        sides: 0,
      },
      parkingRatios: [
        {
          landUseType: 'office',
          ratioDescription: '1 bay per 25m² GLA',
          baysPerUnit: 1,
          unitMeasure: 'm²_gla',
        },
        {
          landUseType: 'shop',
          ratioDescription: '1 bay per 25m² GLA',
          baysPerUnit: 1,
          unitMeasure: 'm²_gla',
        },
      ],
    },
  },
];

// Register Cape Town zones with the scheme registry
registerScheme('COCT', coctZones);

export default coctZones;
