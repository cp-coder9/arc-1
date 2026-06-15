/**
 * Architex bird — SVG polygon decomposition.
 * 30 geometric fragments forming the brand mark.
 * Each polygon has coordinates, color, and group assignment.
 * Colors from the brief palette: #021F23 #073C40 #0A5B5F #8EDFD2
 */

export type PolygonGroup = 'head' | 'body' | 'wing_upper' | 'wing_lower' | 'tail';

export interface PolygonFragment {
  id: string;
  points: string;        // SVG polygon points attribute
  color: string;
  group: PolygonGroup;
  centroid: { x: number; y: number }; // approx center
}

export const birdPalette = {
  darkest: '#021F23',
  dark: '#073C40',
  mid: '#0A5B5F',
  light: '#8EDFD2',
  accent: '#6BC4B7',
} as const;

const BIRD_POLYGONS: PolygonFragment[] = [
  // ── HEAD & BEAK (5 fragments) ──
  {
    id: 'beak-upper',
    points: '150,78 178,70 160,82',
    color: birdPalette.darkest,
    group: 'head',
    centroid: { x: 163, y: 77 },
  },
  {
    id: 'beak-lower',
    points: '150,82 178,84 158,90',
    color: birdPalette.dark,
    group: 'head',
    centroid: { x: 162, y: 85 },
  },
  {
    id: 'head-main',
    points: '134,60 158,70 150,90 128,84',
    color: birdPalette.mid,
    group: 'head',
    centroid: { x: 142, y: 76 },
  },
  {
    id: 'head-top',
    points: '130,55 148,52 142,64',
    color: birdPalette.light,
    group: 'head',
    centroid: { x: 140, y: 57 },
  },
  {
    id: 'head-neck',
    points: '128,84 150,90 135,100 118,92',
    color: birdPalette.dark,
    group: 'head',
    centroid: { x: 133, y: 92 },
  },

  // ── BODY (8 fragments) ──
  {
    id: 'body-upper',
    points: '120,78 140,85 125,102 110,92',
    color: birdPalette.mid,
    group: 'body',
    centroid: { x: 124, y: 89 },
  },
  {
    id: 'body-mid',
    points: '110,80 125,92 115,110 100,100',
    color: birdPalette.dark,
    group: 'body',
    centroid: { x: 112, y: 96 },
  },
  {
    id: 'body-lower',
    points: '100,88 115,100 105,118 88,108',
    color: birdPalette.darkest,
    group: 'body',
    centroid: { x: 102, y: 104 },
  },
  {
    id: 'body-chest',
    points: '120,78 135,85 130,95 118,92',
    color: birdPalette.light,
    group: 'body',
    centroid: { x: 126, y: 88 },
  },
  {
    id: 'body-belly',
    points: '100,100 115,110 108,120 92,115',
    color: birdPalette.mid,
    group: 'body',
    centroid: { x: 104, y: 111 },
  },
  {
    id: 'body-back',
    points: '110,80 120,78 118,92 105,88',
    color: birdPalette.dark,
    group: 'body',
    centroid: { x: 113, y: 85 },
  },
  {
    id: 'body-flank',
    points: '92,90 108,95 100,105 85,100',
    color: birdPalette.accent,
    group: 'body',
    centroid: { x: 96, y: 98 },
  },
  {
    id: 'body-core',
    points: '105,88 120,92 115,102 100,100',
    color: birdPalette.mid,
    group: 'body',
    centroid: { x: 110, y: 96 },
  },

  // ── UPPER WING (8 fragments) ──
  {
    id: 'wing-upper-1',
    points: '62,30 95,48 105,70 72,55',
    color: birdPalette.darkest,
    group: 'wing_upper',
    centroid: { x: 84, y: 51 },
  },
  {
    id: 'wing-upper-2',
    points: '72,55 105,70 110,82 82,68',
    color: birdPalette.dark,
    group: 'wing_upper',
    centroid: { x: 92, y: 69 },
  },
  {
    id: 'wing-upper-3',
    points: '82,68 110,82 112,88 90,78',
    color: birdPalette.mid,
    group: 'wing_upper',
    centroid: { x: 99, y: 79 },
  },
  {
    id: 'wing-upper-4',
    points: '95,48 118,62 120,78 105,70',
    color: birdPalette.mid,
    group: 'wing_upper',
    centroid: { x: 110, y: 65 },
  },
  {
    id: 'wing-upper-5',
    points: '62,30 48,38 72,55',
    color: birdPalette.accent,
    group: 'wing_upper',
    centroid: { x: 61, y: 41 },
  },
  {
    id: 'wing-upper-6',
    points: '48,38 38,50 62,52 72,55',
    color: birdPalette.mid,
    group: 'wing_upper',
    centroid: { x: 55, y: 49 },
  },
  {
    id: 'wing-upper-7',
    points: '105,70 120,78 125,85 112,82',
    color: birdPalette.dark,
    group: 'wing_upper',
    centroid: { x: 116, y: 79 },
  },
  {
    id: 'wing-upper-tip',
    points: '38,50 25,62 48,66 62,52',
    color: birdPalette.light,
    group: 'wing_upper',
    centroid: { x: 43, y: 58 },
  },

  // ── LOWER WING (4 fragments) ──
  {
    id: 'wing-lower-1',
    points: '68,105 88,118 100,110 78,98',
    color: birdPalette.mid,
    group: 'wing_lower',
    centroid: { x: 84, y: 108 },
  },
  {
    id: 'wing-lower-2',
    points: '55,118 78,130 88,118 68,115',
    color: birdPalette.dark,
    group: 'wing_lower',
    centroid: { x: 72, y: 120 },
  },
  {
    id: 'wing-lower-3',
    points: '42,128 65,140 78,130 55,118',
    color: birdPalette.darkest,
    group: 'wing_lower',
    centroid: { x: 60, y: 129 },
  },
  {
    id: 'wing-lower-tip',
    points: '30,135 50,148 65,140 42,128',
    color: birdPalette.accent,
    group: 'wing_lower',
    centroid: { x: 47, y: 138 },
  },

  // ── TAIL (5 fragments) ──
  {
    id: 'tail-upper',
    points: '78,90 92,100 85,108 72,100',
    color: birdPalette.mid,
    group: 'tail',
    centroid: { x: 82, y: 100 },
  },
  {
    id: 'tail-mid',
    points: '58,92 78,100 72,110 55,102',
    color: birdPalette.dark,
    group: 'tail',
    centroid: { x: 66, y: 101 },
  },
  {
    id: 'tail-lower',
    points: '45,100 62,110 55,120 40,112',
    color: birdPalette.darkest,
    group: 'tail',
    centroid: { x: 51, y: 111 },
  },
  {
    id: 'tail-tip-1',
    points: '28,96 48,106 40,115 22,104',
    color: birdPalette.accent,
    group: 'tail',
    centroid: { x: 35, y: 105 },
  },
  {
    id: 'tail-tip-2',
    points: '15,108 32,118 25,125 10,115',
    color: birdPalette.light,
    group: 'tail',
    centroid: { x: 21, y: 117 },
  },
];

export default BIRD_POLYGONS;
