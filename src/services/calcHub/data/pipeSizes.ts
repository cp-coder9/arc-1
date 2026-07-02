// Standard pipe diameters for copper, steel, PVC, and HDPE
// Used by wet services and stormwater calculators for pipe sizing
// Requirements: 15.1, 17.1, 17.4

export interface PipeSize {
  nominalDiameter: number // mm (nominal bore)
  outerDiameter: number // mm
  material: 'copper' | 'steel' | 'pvc' | 'hdpe'
}

export const PIPE_SIZES: PipeSize[] = [
  // Copper
  { nominalDiameter: 15, outerDiameter: 15.88, material: 'copper' },
  { nominalDiameter: 22, outerDiameter: 22.22, material: 'copper' },
  { nominalDiameter: 28, outerDiameter: 28.58, material: 'copper' },
  { nominalDiameter: 35, outerDiameter: 34.93, material: 'copper' },
  { nominalDiameter: 42, outerDiameter: 41.28, material: 'copper' },
  { nominalDiameter: 54, outerDiameter: 53.98, material: 'copper' },
  // Steel (galvanised)
  { nominalDiameter: 15, outerDiameter: 21.3, material: 'steel' },
  { nominalDiameter: 20, outerDiameter: 26.9, material: 'steel' },
  { nominalDiameter: 25, outerDiameter: 33.7, material: 'steel' },
  { nominalDiameter: 32, outerDiameter: 42.4, material: 'steel' },
  { nominalDiameter: 40, outerDiameter: 48.3, material: 'steel' },
  { nominalDiameter: 50, outerDiameter: 60.3, material: 'steel' },
  { nominalDiameter: 65, outerDiameter: 76.1, material: 'steel' },
  { nominalDiameter: 80, outerDiameter: 88.9, material: 'steel' },
  { nominalDiameter: 100, outerDiameter: 114.3, material: 'steel' },
  { nominalDiameter: 150, outerDiameter: 168.3, material: 'steel' },
  // PVC
  { nominalDiameter: 40, outerDiameter: 40, material: 'pvc' },
  { nominalDiameter: 50, outerDiameter: 50, material: 'pvc' },
  { nominalDiameter: 75, outerDiameter: 75, material: 'pvc' },
  { nominalDiameter: 110, outerDiameter: 110, material: 'pvc' },
  { nominalDiameter: 160, outerDiameter: 160, material: 'pvc' },
  { nominalDiameter: 200, outerDiameter: 200, material: 'pvc' },
  { nominalDiameter: 250, outerDiameter: 250, material: 'pvc' },
  { nominalDiameter: 315, outerDiameter: 315, material: 'pvc' },
]

/**
 * Returns the smallest standard pipe size with nominal diameter ≥ minDiameter
 * for the given material, or undefined if no matching size exists.
 */
export function getNextStandardPipeDiameter(
  minDiameter: number,
  material: PipeSize['material']
): PipeSize | undefined {
  return PIPE_SIZES
    .filter((p) => p.material === material && p.nominalDiameter >= minDiameter)
    .sort((a, b) => a.nominalDiameter - b.nominalDiameter)[0]
}
