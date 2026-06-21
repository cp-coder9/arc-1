export type Verdict = 'pass' | 'watch' | 'fail';
export type Orientation = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW' | 'HORIZONTAL';
export type FrameType = 'alu' | 'thermal' | 'timber';
export interface ProjectMeta { projectName: string; reference: string; climateZone: number; buildingType: 'residential' | 'commercial' | 'public'; storeys: number; floorArea: number; }
export interface FenestrationElement { id: string; storey: number; room: string; orientation: Orientation; frameType: FrameType; glassArea: number; wallArea: number; uValue: number; shgc: number; shadingFactor: number; description: string; }
export interface ElementResult { id: string; verdict: Verdict; messages: string[]; effectiveShgc: number; glazingPercent: number; limits: Record<string, number>; }
export interface ComplianceReport { id: string; title: string; verdict: Verdict; sourceVersion: string; project: ProjectMeta; summary: string[]; actionCards: string[]; results: unknown[]; createdAt: string; auditHash: string; }
export interface AssemblyLayer { material: string; thicknessMm: number; conductivity?: number; rValue?: number; }
export interface AssemblyInput { id: string; type: 'roof' | 'wall' | 'floor'; climateZone: number; area: number; layers: AssemblyLayer[]; description: string; }
export interface FormChecklistInput { project: ProjectMeta; occupancyClass: string; includesCompetentPersons: boolean; parts: string[]; }
export interface DrawingSheet { number: string; title: string; scale?: string; revision?: string; hasNorthPoint?: boolean; hasProfessionalBlock?: boolean; hasDimensions?: boolean; hasRoomLabels?: boolean; referencedSheets?: string[]; textExtract?: string; }
