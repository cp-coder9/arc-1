// Material Densities — Common construction materials
// Reference: General engineering practice (South Africa)
// Requirements: 12.4, 18.2

export interface MaterialDensity {
  name: string
  density: number // kg/m³
  category: string
}

export const MATERIAL_DENSITIES: MaterialDensity[] = [
  // Metals
  { name: 'Structural Steel', density: 7850, category: 'Metals' },
  { name: 'Aluminium', density: 2700, category: 'Metals' },

  // Concrete
  { name: 'Reinforced Concrete', density: 2500, category: 'Concrete' },
  { name: 'Plain Concrete', density: 2300, category: 'Concrete' },

  // Timber
  { name: 'Timber - Pine (SA)', density: 500, category: 'Timber' },
  { name: 'Timber - Hardwood', density: 900, category: 'Timber' },

  // Masonry
  { name: 'Clay Masonry', density: 2200, category: 'Masonry' },
  { name: 'Concrete Masonry', density: 1800, category: 'Masonry' },
  { name: 'Brick', density: 1900, category: 'Masonry' },

  // Aggregates & Soils
  { name: 'Sand (Dry)', density: 1600, category: 'Aggregates & Soils' },
  { name: 'Sand (Wet)', density: 1900, category: 'Aggregates & Soils' },
  { name: 'Gravel', density: 1800, category: 'Aggregates & Soils' },
  { name: 'Soil (Dry)', density: 1500, category: 'Aggregates & Soils' },
  { name: 'Soil (Saturated)', density: 2000, category: 'Aggregates & Soils' },

  // Stone
  { name: 'Granite', density: 2700, category: 'Stone' },
  { name: 'Sandstone', density: 2200, category: 'Stone' },

  // Liquids
  { name: 'Water', density: 1000, category: 'Liquids' },

  // Glass
  { name: 'Glass', density: 2500, category: 'Glass' },

  // Surfacing & Cladding
  { name: 'Bitumen', density: 2400, category: 'Surfacing & Cladding' },
  { name: 'Plasterboard', density: 800, category: 'Surfacing & Cladding' },
  { name: 'Fibre Cement', density: 1600, category: 'Surfacing & Cladding' },
]

/**
 * Look up the density of a material by name (case-insensitive match).
 * Returns the density in kg/m³ or undefined if not found.
 */
export function getMaterialDensity(name: string): number | undefined {
  const lower = name.toLowerCase()
  const entry = MATERIAL_DENSITIES.find(
    (m) => m.name.toLowerCase() === lower
  )
  return entry?.density
}
