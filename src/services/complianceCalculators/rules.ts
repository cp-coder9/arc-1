export const SOURCE_VERSION = 'SANS-10400-XA-implementation-seed-v0.1-review-required';

export const ZONE_DATA: Record<number, { name: string; uLimit: Record<string, number>; shgc: Record<string, number>; maxGlazingPercent: number; minR: Record<string, number> }> = {
  1: { name: 'Interior', uLimit: { alu: 3.5, thermal: 2.7, timber: 5.7 }, shgc: { n: 0.60, s: 0.65, ew: 0.30 }, maxGlazingPercent: 0.15, minR: { roof: 3.7, wall: 1.9, floor: 1.0 } },
  2: { name: 'Coastal', uLimit: { alu: 3.3, thermal: 2.5, timber: 3.5 }, shgc: { n: 0.50, s: 0.55, ew: 0.25 }, maxGlazingPercent: 0.15, minR: { roof: 3.7, wall: 1.8, floor: 1.0 } },
  3: { name: 'KZN Coast', uLimit: { alu: 5.7, thermal: 5.7, timber: 5.7 }, shgc: { n: 0.65, s: 0.70, ew: 0.30 }, maxGlazingPercent: 0.20, minR: { roof: 3.7, wall: 1.4, floor: 0.8 } },
  4: { name: 'Central Interior', uLimit: { alu: 3.0, thermal: 2.3, timber: 3.0 }, shgc: { n: 0.50, s: 0.55, ew: 0.20 }, maxGlazingPercent: 0.15, minR: { roof: 3.7, wall: 2.2, floor: 1.3 } },
  5: { name: 'High Altitude', uLimit: { alu: 3.0, thermal: 2.3, timber: 3.0 }, shgc: { n: 0.60, s: 0.65, ew: 0.20 }, maxGlazingPercent: 0.15, minR: { roof: 3.7, wall: 2.2, floor: 1.3 } },
  6: { name: 'Hot Interior', uLimit: { alu: 5.7, thermal: 5.7, timber: 5.7 }, shgc: { n: 0.50, s: 0.55, ew: 0.20 }, maxGlazingPercent: 0.20, minR: { roof: 3.7, wall: 1.9, floor: 1.0 } },
};

export function orientationBand(o: string): 'n' | 's' | 'ew' {
  return ['N', 'NE', 'NW', 'HORIZONTAL'].includes(o) ? 'n' : ['S', 'SE', 'SW'].includes(o) ? 's' : 'ew';
}

export const MATERIAL_LIBRARY: Record<string, { conductivity?: number; rValue?: number }> = {
  brick: { conductivity: 0.77 },
  concrete: { conductivity: 1.4 },
  plaster: { conductivity: 0.72 },
  gypsum: { conductivity: 0.25 },
  glasswool: { conductivity: 0.04 },
  polyiso: { conductivity: 0.026 },
  xps: { conductivity: 0.034 },
  'air-cavity': { rValue: 0.18 },
  'roof-tile': { rValue: 0.02 },
  'ceiling-board': { conductivity: 0.21 },
};
