// Unit Conversion Data — 18+ categories with conversion factors
//
// Design reference: .kiro/specs/engineers-calculation-hub/design.md
// Requirements: 18.1

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export type UnitCategory =
  | 'length' | 'area' | 'volume' | 'mass' | 'force'
  | 'pressure' | 'moment' | 'velocity' | 'flow' | 'temperature'
  | 'density' | 'power' | 'energy' | 'angle' | 'time'
  | 'acceleration' | 'torque' | 'stress';

export interface UnitDefinition {
  name: string;
  symbol: string;
  /** Multiply by this to convert to base unit (NaN for temperature — handled separately) */
  toBase: number;
}

export interface UnitCategoryDefinition {
  category: UnitCategory;
  baseUnit: string;
  units: UnitDefinition[];
}

// ----------------------------------------------------------------------------
// Conversion Data
// ----------------------------------------------------------------------------

export const UNIT_CONVERSIONS: UnitCategoryDefinition[] = [
  // 1. Length (base: m)
  {
    category: 'length',
    baseUnit: 'm',
    units: [
      { name: 'Millimetre', symbol: 'mm', toBase: 0.001 },
      { name: 'Metre', symbol: 'm', toBase: 1 },
      { name: 'Kilometre', symbol: 'km', toBase: 1000 },
      { name: 'Foot', symbol: 'ft', toBase: 0.3048 },
      { name: 'Inch', symbol: 'in', toBase: 0.0254 },
      { name: 'Yard', symbol: 'yd', toBase: 0.9144 },
      { name: 'Mile', symbol: 'mi', toBase: 1609.344 },
    ],
  },

  // 2. Area (base: m²)
  {
    category: 'area',
    baseUnit: 'm²',
    units: [
      { name: 'Square Millimetre', symbol: 'mm²', toBase: 1e-6 },
      { name: 'Square Metre', symbol: 'm²', toBase: 1 },
      { name: 'Square Kilometre', symbol: 'km²', toBase: 1e6 },
      { name: 'Square Foot', symbol: 'ft²', toBase: 0.092903 },
      { name: 'Square Inch', symbol: 'in²', toBase: 0.000645 },
      { name: 'Hectare', symbol: 'ha', toBase: 10000 },
      { name: 'Acre', symbol: 'acre', toBase: 4046.86 },
    ],
  },

  // 3. Volume (base: m³)
  {
    category: 'volume',
    baseUnit: 'm³',
    units: [
      { name: 'Litre', symbol: 'L', toBase: 0.001 },
      { name: 'Millilitre', symbol: 'mL', toBase: 1e-6 },
      { name: 'Cubic Metre', symbol: 'm³', toBase: 1 },
      { name: 'Cubic Foot', symbol: 'ft³', toBase: 0.028317 },
      { name: 'US Gallon', symbol: 'gal_us', toBase: 0.003785 },
      { name: 'UK Gallon', symbol: 'gal_uk', toBase: 0.004546 },
    ],
  },

  // 4. Mass (base: kg)
  {
    category: 'mass',
    baseUnit: 'kg',
    units: [
      { name: 'Gram', symbol: 'g', toBase: 0.001 },
      { name: 'Kilogram', symbol: 'kg', toBase: 1 },
      { name: 'Tonne', symbol: 'tonne', toBase: 1000 },
      { name: 'Pound', symbol: 'lb', toBase: 0.453592 },
      { name: 'Ounce', symbol: 'oz', toBase: 0.028350 },
      { name: 'US Short Ton', symbol: 'ton_us', toBase: 907.185 },
    ],
  },

  // 5. Force (base: N)
  {
    category: 'force',
    baseUnit: 'N',
    units: [
      { name: 'Newton', symbol: 'N', toBase: 1 },
      { name: 'Kilonewton', symbol: 'kN', toBase: 1000 },
      { name: 'Meganewton', symbol: 'MN', toBase: 1e6 },
      { name: 'Kilogram-force', symbol: 'kgf', toBase: 9.80665 },
      { name: 'Pound-force', symbol: 'lbf', toBase: 4.44822 },
      { name: 'Tonne-force', symbol: 'tonf', toBase: 9806.65 },
    ],
  },

  // 6. Pressure (base: Pa)
  {
    category: 'pressure',
    baseUnit: 'Pa',
    units: [
      { name: 'Pascal', symbol: 'Pa', toBase: 1 },
      { name: 'Kilopascal', symbol: 'kPa', toBase: 1000 },
      { name: 'Megapascal', symbol: 'MPa', toBase: 1e6 },
      { name: 'Gigapascal', symbol: 'GPa', toBase: 1e9 },
      { name: 'Bar', symbol: 'bar', toBase: 100000 },
      { name: 'Pounds per Square Inch', symbol: 'psi', toBase: 6894.76 },
      { name: 'Atmosphere', symbol: 'atm', toBase: 101325 },
    ],
  },

  // 7. Moment (base: Nm)
  {
    category: 'moment',
    baseUnit: 'Nm',
    units: [
      { name: 'Newton-metre', symbol: 'Nm', toBase: 1 },
      { name: 'Kilonewton-metre', symbol: 'kNm', toBase: 1000 },
      { name: 'Pound-foot', symbol: 'lbft', toBase: 1.35582 },
      { name: 'Kilogram-force-metre', symbol: 'kgfm', toBase: 9.80665 },
    ],
  },

  // 8. Velocity (base: m/s)
  {
    category: 'velocity',
    baseUnit: 'm/s',
    units: [
      { name: 'Metres per Second', symbol: 'm/s', toBase: 1 },
      { name: 'Kilometres per Hour', symbol: 'km/h', toBase: 0.277778 },
      { name: 'Miles per Hour', symbol: 'mph', toBase: 0.44704 },
      { name: 'Feet per Second', symbol: 'ft/s', toBase: 0.3048 },
      { name: 'Knot', symbol: 'knot', toBase: 0.514444 },
    ],
  },

  // 9. Flow (base: m³/s)
  {
    category: 'flow',
    baseUnit: 'm³/s',
    units: [
      { name: 'Cubic Metres per Second', symbol: 'm³/s', toBase: 1 },
      { name: 'Litres per Second', symbol: 'L/s', toBase: 0.001 },
      { name: 'Cubic Metres per Hour', symbol: 'm³/h', toBase: 0.000277778 },
      { name: 'US Gallons per Minute', symbol: 'gpm', toBase: 0.0000630902 },
      { name: 'Litres per Minute', symbol: 'L/min', toBase: 0.0000166667 },
    ],
  },

  // 10. Temperature (base: °C) — SPECIAL: uses offset conversion, toBase is NaN
  {
    category: 'temperature',
    baseUnit: '°C',
    units: [
      { name: 'Celsius', symbol: '°C', toBase: NaN },
      { name: 'Fahrenheit', symbol: '°F', toBase: NaN },
      { name: 'Kelvin', symbol: 'K', toBase: NaN },
    ],
  },

  // 11. Density (base: kg/m³)
  {
    category: 'density',
    baseUnit: 'kg/m³',
    units: [
      { name: 'Kilograms per Cubic Metre', symbol: 'kg/m³', toBase: 1 },
      { name: 'Kilonewtons per Cubic Metre', symbol: 'kN/m³', toBase: 101.9716 },
      { name: 'Grams per Cubic Centimetre', symbol: 'g/cm³', toBase: 1000 },
      { name: 'Pounds per Cubic Foot', symbol: 'lb/ft³', toBase: 16.0185 },
    ],
  },

  // 12. Power (base: W)
  {
    category: 'power',
    baseUnit: 'W',
    units: [
      { name: 'Watt', symbol: 'W', toBase: 1 },
      { name: 'Kilowatt', symbol: 'kW', toBase: 1000 },
      { name: 'Megawatt', symbol: 'MW', toBase: 1e6 },
      { name: 'Horsepower', symbol: 'hp', toBase: 745.7 },
      { name: 'BTU per Hour', symbol: 'BTU/h', toBase: 0.29307 },
    ],
  },

  // 13. Energy (base: J)
  {
    category: 'energy',
    baseUnit: 'J',
    units: [
      { name: 'Joule', symbol: 'J', toBase: 1 },
      { name: 'Kilojoule', symbol: 'kJ', toBase: 1000 },
      { name: 'Megajoule', symbol: 'MJ', toBase: 1e6 },
      { name: 'Kilowatt-hour', symbol: 'kWh', toBase: 3.6e6 },
      { name: 'British Thermal Unit', symbol: 'BTU', toBase: 1055.06 },
      { name: 'Calorie', symbol: 'cal', toBase: 4.184 },
    ],
  },

  // 14. Angle (base: rad)
  {
    category: 'angle',
    baseUnit: 'rad',
    units: [
      { name: 'Radian', symbol: 'rad', toBase: 1 },
      { name: 'Degree', symbol: 'deg', toBase: 0.017453 },
      { name: 'Gradian', symbol: 'grad', toBase: 0.015708 },
      { name: 'Revolution', symbol: 'rev', toBase: 6.28318 },
    ],
  },

  // 15. Time (base: s)
  {
    category: 'time',
    baseUnit: 's',
    units: [
      { name: 'Second', symbol: 's', toBase: 1 },
      { name: 'Minute', symbol: 'min', toBase: 60 },
      { name: 'Hour', symbol: 'h', toBase: 3600 },
      { name: 'Day', symbol: 'day', toBase: 86400 },
    ],
  },

  // 16. Acceleration (base: m/s²)
  {
    category: 'acceleration',
    baseUnit: 'm/s²',
    units: [
      { name: 'Metres per Second Squared', symbol: 'm/s²', toBase: 1 },
      { name: 'Standard Gravity', symbol: 'g', toBase: 9.80665 },
      { name: 'Feet per Second Squared', symbol: 'ft/s²', toBase: 0.3048 },
    ],
  },

  // 17. Torque (base: Nm)
  {
    category: 'torque',
    baseUnit: 'Nm',
    units: [
      { name: 'Newton-metre', symbol: 'Nm', toBase: 1 },
      { name: 'Kilonewton-metre', symbol: 'kNm', toBase: 1000 },
      { name: 'Pound-foot', symbol: 'lbft', toBase: 1.35582 },
    ],
  },

  // 18. Stress (base: Pa)
  {
    category: 'stress',
    baseUnit: 'Pa',
    units: [
      { name: 'Pascal', symbol: 'Pa', toBase: 1 },
      { name: 'Kilopascal', symbol: 'kPa', toBase: 1000 },
      { name: 'Megapascal', symbol: 'MPa', toBase: 1e6 },
      { name: 'Gigapascal', symbol: 'GPa', toBase: 1e9 },
    ],
  },
];

// ----------------------------------------------------------------------------
// Temperature conversion helpers (special case — offset-based, not factor-based)
// ----------------------------------------------------------------------------

function toBaseCelsius(value: number, fromSymbol: string): number {
  switch (fromSymbol) {
    case '°C': return value;
    case '°F': return (value - 32) * 5 / 9;
    case 'K': return value - 273.15;
    default: throw new Error(`Unknown temperature unit: ${fromSymbol}`);
  }
}

function fromBaseCelsius(valueCelsius: number, toSymbol: string): number {
  switch (toSymbol) {
    case '°C': return valueCelsius;
    case '°F': return valueCelsius * 9 / 5 + 32;
    case 'K': return valueCelsius + 273.15;
    default: throw new Error(`Unknown temperature unit: ${toSymbol}`);
  }
}

// ----------------------------------------------------------------------------
// Helper Functions
// ----------------------------------------------------------------------------

/**
 * Convert a value from one unit to another within the same category.
 *
 * @param value - The numeric value to convert
 * @param fromUnit - The symbol of the source unit (e.g., 'mm', 'ft', '°C')
 * @param toUnit - The symbol of the target unit
 * @param category - The unit category (e.g., 'length', 'temperature')
 * @returns The converted value
 * @throws Error if category or units are not found
 */
export function convertUnit(
  value: number,
  fromUnit: string,
  toUnit: string,
  category: UnitCategory,
): number {
  const categoryDef = UNIT_CONVERSIONS.find((c) => c.category === category);
  if (!categoryDef) {
    throw new Error(`Unknown unit category: ${category}`);
  }

  // Temperature requires special offset-based conversion
  if (category === 'temperature') {
    const celsius = toBaseCelsius(value, fromUnit);
    return fromBaseCelsius(celsius, toUnit);
  }

  const fromDef = categoryDef.units.find((u) => u.symbol === fromUnit);
  const toDef = categoryDef.units.find((u) => u.symbol === toUnit);

  if (!fromDef) {
    throw new Error(`Unknown unit '${fromUnit}' in category '${category}'`);
  }
  if (!toDef) {
    throw new Error(`Unknown unit '${toUnit}' in category '${category}'`);
  }

  // Convert: source → base → target
  const baseValue = value * fromDef.toBase;
  return baseValue / toDef.toBase;
}

/**
 * Get all available units for a given category.
 */
export function getUnitsForCategory(category: UnitCategory): UnitDefinition[] {
  const categoryDef = UNIT_CONVERSIONS.find((c) => c.category === category);
  if (!categoryDef) {
    throw new Error(`Unknown unit category: ${category}`);
  }
  return categoryDef.units;
}

/**
 * Get all available unit categories.
 */
export function getAllCategories(): UnitCategory[] {
  return UNIT_CONVERSIONS.map((c) => c.category);
}
