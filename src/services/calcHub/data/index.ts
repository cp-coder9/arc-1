// Data barrel - exports added as data constants are implemented
export { STEEL_SECTIONS, getSteelSection } from './steelSections'

export { MATERIAL_DENSITIES, getMaterialDensity } from './materialDensities'
export type { MaterialDensity } from './materialDensities'

export { CONCRETE_GRADES, getConcreteGrade } from './concreteGrades'
export type { ConcreteGrade } from './concreteGrades'

export { IMPOSED_LOADS, getImposedLoad } from './imposedLoads'
export type { ImposedLoad } from './imposedLoads'

export { PIPE_SIZES, getNextStandardPipeDiameter } from './pipeSizes'
export type { PipeSize } from './pipeSizes'

export { FIRE_TRAVEL_DISTANCES, getTravelDistance } from './fireDistances'
export type { FireTravelDistance } from './fireDistances'

export { FIXTURE_UNITS, getFixtureUnit } from './fixtureUnits'
export type { FixtureUnit } from './fixtureUnits'

export {
  UNIT_CONVERSIONS,
  convertUnit,
  getUnitsForCategory,
  getAllCategories,
} from './unitConversions'
export type {
  UnitCategory,
  UnitDefinition,
  UnitCategoryDefinition,
} from './unitConversions'
