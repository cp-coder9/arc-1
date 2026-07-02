// Concrete Grades — Characteristic strengths and modulus of elasticity
// Reference: SANS 10100-1 (South Africa)
// Requirements: 12.4, 18.2

export interface ConcreteGrade {
  grade: string // e.g. '25', '30', '35', '40', '45', '50'
  fcu: number   // Characteristic cube strength (MPa)
  fck: number   // Characteristic cylinder strength (MPa)
  Ec: number    // Modulus of elasticity (GPa)
}

export const CONCRETE_GRADES: ConcreteGrade[] = [
  { grade: '25', fcu: 25, fck: 20, Ec: 26 },
  { grade: '30', fcu: 30, fck: 24, Ec: 28 },
  { grade: '35', fcu: 35, fck: 28, Ec: 29.5 },
  { grade: '40', fcu: 40, fck: 32, Ec: 31 },
  { grade: '45', fcu: 45, fck: 36, Ec: 32 },
  { grade: '50', fcu: 50, fck: 40, Ec: 34 },
]

/**
 * Look up a concrete grade by its grade string (e.g. '30').
 * Returns the ConcreteGrade object or undefined if not found.
 */
export function getConcreteGrade(grade: string): ConcreteGrade | undefined {
  return CONCRETE_GRADES.find((g) => g.grade === grade)
}
