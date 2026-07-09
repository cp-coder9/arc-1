/**
 * IFC Parser Service — File validation, schema detection, and full IFC parsing
 *
 * Handles IFC file validation (size, extension, STEP header), schema version
 * detection from the FILE_SCHEMA header, and full parsing implementation using
 * web-ifc WASM engine.
 *
 * Requirements: 1.2, 1.3, 1.4, 1.5, 1.7, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 */

import * as WebIFC from 'web-ifc';
import type {
  IfcSchemaVersion,
  IfcEntityType,
  ParsedIfcModel,
  SpatialNode,
  IfcElement,
  IfcClassification,
  MaterialLayer,
  BimErrorResponse,
} from './types';

// ─── Constants ────────────────────────────────────────────────────────────

/** Maximum file size: 500MB */
const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024;

/** Number of bytes to read for schema detection */
const SCHEMA_DETECTION_BYTES = 4096;

/** Valid IFC file extension */
const VALID_IFC_EXTENSION = '.ifc';

/** STEP physical file format marker (ISO 10303-21) */
const STEP_HEADER_MARKER = 'ISO-10303-21;';

/** Supported IFC schema versions (case-insensitive matching) */
const SUPPORTED_SCHEMAS: readonly IfcSchemaVersion[] = ['IFC2X3', 'IFC4', 'IFC4X3'];

/**
 * Regex to match FILE_SCHEMA header in IFC/STEP files.
 * Handles formats like:
 *   FILE_SCHEMA(('IFC2X3'));
 *   FILE_SCHEMA (( 'IFC4' ));
 *   FILE_SCHEMA(('IFC4X3_ADD2'));
 */
const FILE_SCHEMA_REGEX = /FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'\s*\)\s*\)/i;

// ─── File Validation ──────────────────────────────────────────────────────

/**
 * Validates file size against the 500MB maximum limit.
 *
 * @param sizeBytes - File size in bytes
 * @returns Validation result with optional error message
 */
export function validateFileSize(sizeBytes: number): { valid: boolean; error?: string } {
  if (sizeBytes <= 0) {
    return { valid: false, error: 'File is empty or has invalid size' };
  }

  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File exceeds maximum size of 500MB (${(sizeBytes / (1024 * 1024)).toFixed(1)}MB provided)`,
    };
  }

  return { valid: true };
}

/**
 * Validates file extension is `.ifc` (case-insensitive).
 *
 * @param fileName - The file name or path to validate
 * @returns Validation result with optional error message
 */
export function validateFileExtension(fileName: string): { valid: boolean; error?: string } {
  if (!fileName || fileName.trim().length === 0) {
    return { valid: false, error: 'File name is required' };
  }

  const extension = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();

  if (extension !== VALID_IFC_EXTENSION) {
    return {
      valid: false,
      error: `Invalid file extension "${extension}". Only .ifc files are supported`,
    };
  }

  return { valid: true };
}

/**
 * Validates that the buffer starts with the ISO-10303-21 STEP header marker.
 * This confirms the file is a valid STEP physical file format.
 *
 * @param buffer - File content as Uint8Array
 * @returns Validation result with optional error message
 */
export function validateStepHeader(buffer: Uint8Array): { valid: boolean; error?: string } {
  if (buffer.length === 0) {
    return { valid: false, error: 'File buffer is empty' };
  }

  // Decode enough bytes to check for the STEP marker
  const headerLength = Math.min(buffer.length, STEP_HEADER_MARKER.length + 50);
  const headerText = new TextDecoder('ascii').decode(buffer.slice(0, headerLength));

  // Trim leading whitespace/BOM and check for STEP marker
  const trimmed = headerText.trimStart();

  if (!trimmed.startsWith(STEP_HEADER_MARKER)) {
    return {
      valid: false,
      error: `File does not contain a valid STEP header. Expected "${STEP_HEADER_MARKER}" at file start`,
    };
  }

  return { valid: true };
}

// ─── Schema Detection ─────────────────────────────────────────────────────

/**
 * Detects the IFC schema version from the FILE_SCHEMA header in the file buffer.
 * Reads the first 4KB of the file to find the FILE_SCHEMA declaration.
 *
 * Supports case-insensitive matching of:
 * - IFC2X3 (including IFC2X3_TC1, IFC2X3_FINAL, etc.)
 * - IFC4 (including IFC4_ADD1, IFC4_ADD2, etc.)
 * - IFC4X3 (including IFC4X3_ADD1, IFC4X3_ADD2, etc.)
 *
 * @param buffer - File content as Uint8Array
 * @returns Detected schema version or null if unsupported/not found
 */
export function detectSchemaVersion(buffer: Uint8Array): IfcSchemaVersion | null {
  if (buffer.length === 0) {
    return null;
  }

  // Read only the first 4KB for schema detection
  const readLength = Math.min(buffer.length, SCHEMA_DETECTION_BYTES);
  const headerText = new TextDecoder('ascii').decode(buffer.slice(0, readLength));

  // Find FILE_SCHEMA header using regex
  const match = FILE_SCHEMA_REGEX.exec(headerText);

  if (!match || !match[1]) {
    return null;
  }

  const schemaString = match[1].toUpperCase();

  // Match against supported schemas (check most specific first)
  // IFC4X3 must be checked before IFC4 to avoid false match
  if (schemaString.startsWith('IFC4X3')) {
    return 'IFC4X3';
  }

  if (schemaString === 'IFC4' || schemaString.startsWith('IFC4_') || schemaString.startsWith('IFC4 ')) {
    return 'IFC4';
  }

  if (schemaString.startsWith('IFC2X3')) {
    return 'IFC2X3';
  }

  // No supported schema found
  return null;
}


// ─── Entity Type Classification ───────────────────────────────────────────

/**
 * Map of IFC type name strings to their canonical IfcEntityType union values.
 * Keys are UPPERCASE for case-insensitive matching.
 */
const ENTITY_TYPE_MAP: Record<string, IfcEntityType> = {
  // Structural
  IFCWALL: 'IfcWall',
  IFCWALLSTANDARDCASE: 'IfcWallStandardCase',
  IFCSLAB: 'IfcSlab',
  IFCCOLUMN: 'IfcColumn',
  IFCBEAM: 'IfcBeam',
  IFCDOOR: 'IfcDoor',
  IFCWINDOW: 'IfcWindow',
  IFCROOF: 'IfcRoof',
  IFCSTAIR: 'IfcStair',
  IFCRAILING: 'IfcRailing',
  IFCCURTAINWALL: 'IfcCurtainWall',
  IFCPLATE: 'IfcPlate',
  IFCMEMBER: 'IfcMember',
  IFCPILE: 'IfcPile',
  IFCFOOTING: 'IfcFooting',
  IFCCOVERING: 'IfcCovering',
  IFCBUILDINGELEMENTPROXY: 'IfcBuildingElementProxy',
  // MEP
  IFCPIPESEGMENT: 'IfcPipeSegment',
  IFCPIPEFITTING: 'IfcPipeFitting',
  IFCDUCTSEGMENT: 'IfcDuctSegment',
  IFCDUCTFITTING: 'IfcDuctFitting',
  IFCCABLESEGMENT: 'IfcCableSegment',
  IFCCABLEFITTING: 'IfcCableFitting',
  IFCFLOWTERMINAL: 'IfcFlowTerminal',
  IFCENERGYCONVERSIONDEVICE: 'IfcEnergyConversionDevice',
  IFCFLOWCONTROLLER: 'IfcFlowController',
  IFCFLOWSTORAGEDEVICE: 'IfcFlowStorageDevice',
};

/**
 * Classifies an IFC entity type string into the supported IfcEntityType union.
 * Returns undefined for unsupported types.
 *
 * Handles various input formats:
 * - Full uppercase: "IFCWALL"
 * - PascalCase: "IfcWall"
 * - Mixed case: "ifcwall"
 *
 * @param typeString - The IFC entity type string to classify
 * @returns The classified IfcEntityType or undefined if not supported
 */
export function classifyEntityType(typeString: string): IfcEntityType | undefined {
  if (!typeString) return undefined;
  return ENTITY_TYPE_MAP[typeString.toUpperCase()];
}

// ─── Spatial Hierarchy Extraction ─────────────────────────────────────────

/**
 * Extracts the spatial hierarchy (IfcProject → IfcSite → IfcBuilding → IfcBuildingStorey)
 * from a parsed model using the web-ifc API.
 *
 * @param api - Initialized IfcAPI instance
 * @param modelId - The model ID from OpenModel
 * @returns Root SpatialNode representing the project hierarchy
 */
export function extractSpatialHierarchy(api: WebIFC.IfcAPI, modelId: number): SpatialNode {
  // Build the spatial tree starting from IfcProject
  const projectTypeCode = api.GetTypeCodeFromName('IFCPROJECT');
  const projectIds = api.GetLineIDsWithType(modelId, projectTypeCode);

  if (projectIds.size() === 0) {
    // Return a synthetic project node if none found
    return {
      globalId: 'NO_PROJECT',
      name: 'Unknown Project',
      type: 'IfcProject',
      children: [],
      elementIds: [],
    };
  }

  const projectExpressId = projectIds.get(0);
  const projectLine = api.GetLine(modelId, projectExpressId, true);

  const projectNode: SpatialNode = {
    globalId: extractGlobalId(projectLine) || `project_${projectExpressId}`,
    name: extractName(projectLine) || 'Project',
    type: 'IfcProject',
    children: [],
    elementIds: [],
  };

  // Get sites
  const siteTypeCode = api.GetTypeCodeFromName('IFCSITE');
  const siteIds = api.GetLineIDsWithType(modelId, siteTypeCode);

  for (let i = 0; i < siteIds.size(); i++) {
    const siteExpressId = siteIds.get(i);
    const siteLine = api.GetLine(modelId, siteExpressId, true);

    const siteNode: SpatialNode = {
      globalId: extractGlobalId(siteLine) || `site_${siteExpressId}`,
      name: extractName(siteLine) || 'Site',
      type: 'IfcSite',
      children: [],
      elementIds: [],
    };

    // Get buildings within this site
    const buildingTypeCode = api.GetTypeCodeFromName('IFCBUILDING');
    const buildingIds = api.GetLineIDsWithType(modelId, buildingTypeCode);

    for (let j = 0; j < buildingIds.size(); j++) {
      const buildingExpressId = buildingIds.get(j);
      const buildingLine = api.GetLine(modelId, buildingExpressId, true);

      const buildingNode: SpatialNode = {
        globalId: extractGlobalId(buildingLine) || `building_${buildingExpressId}`,
        name: extractName(buildingLine) || 'Building',
        type: 'IfcBuilding',
        children: [],
        elementIds: [],
      };

      // Get storeys within this building
      const storeyTypeCode = api.GetTypeCodeFromName('IFCBUILDINGSTOREY');
      const storeyIds = api.GetLineIDsWithType(modelId, storeyTypeCode);

      for (let k = 0; k < storeyIds.size(); k++) {
        const storeyExpressId = storeyIds.get(k);
        const storeyLine = api.GetLine(modelId, storeyExpressId, true);

        const storeyNode: SpatialNode = {
          globalId: extractGlobalId(storeyLine) || `storey_${storeyExpressId}`,
          name: extractName(storeyLine) || `Storey ${k}`,
          type: 'IfcBuildingStorey',
          children: [],
          elementIds: [],
        };

        buildingNode.children.push(storeyNode);
      }

      siteNode.children.push(buildingNode);
    }

    projectNode.children.push(siteNode);
  }

  return projectNode;
}

// ─── Full IFC File Parsing ────────────────────────────────────────────────

/**
 * Parses an IFC file buffer into a structured ParsedIfcModel.
 * Uses web-ifc (WASM) for STEP file parsing.
 *
 * @param buffer - File content as Uint8Array
 * @param fileName - Original file name
 * @returns ParsedIfcModel on success
 * @throws BimErrorResponse-compatible error on failure
 */
export async function parseIfcFile(
  buffer: Uint8Array,
  fileName: string
): Promise<ParsedIfcModel | BimErrorResponse> {
  // Validate inputs
  const sizeResult = validateFileSize(buffer.length);
  if (!sizeResult.valid) {
    return { error: 'FILE_TOO_LARGE', message: sizeResult.error! };
  }

  const extResult = validateFileExtension(fileName);
  if (!extResult.valid) {
    return { error: 'PARSE_ERROR', message: extResult.error! };
  }

  const headerResult = validateStepHeader(buffer);
  if (!headerResult.valid) {
    return { error: 'PARSE_ERROR', message: headerResult.error! };
  }

  // Detect schema version
  const schemaVersion = detectSchemaVersion(buffer);
  if (!schemaVersion) {
    return {
      error: 'PARSE_ERROR',
      message: 'Unsupported or unrecognized IFC schema version in FILE_SCHEMA header',
    };
  }

  let api: WebIFC.IfcAPI | null = null;
  let modelId: number = -1;

  try {
    api = new WebIFC.IfcAPI();
    await api.Init();

    modelId = api.OpenModel(buffer);

    if (modelId < 0) {
      return {
        error: 'PARSE_ERROR',
        message: 'Failed to open IFC model — file may contain malformed STEP syntax',
      };
    }

    // Extract spatial hierarchy
    const spatialHierarchy = extractSpatialHierarchy(api, modelId);

    // Extract elements
    const elements = extractElements(api, modelId, spatialHierarchy);

    // Handle empty models (no elements)
    const parsedModel: ParsedIfcModel = {
      fileId: generateFileId(),
      fileName,
      schemaVersion,
      parsedAt: new Date().toISOString(),
      spatialHierarchy,
      elements,
      elementCount: elements.length,
    };

    return parsedModel;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown parsing error';
    return {
      error: 'PARSE_ERROR',
      message: `Failed to parse IFC file: ${message}`,
    };
  } finally {
    if (api && modelId >= 0) {
      try {
        api.CloseModel(modelId);
      } catch {
        // Ignore close errors
      }
    }
  }
}

// ─── Element Extraction ───────────────────────────────────────────────────

/**
 * Extracts all supported IFC elements from the model.
 */
function extractElements(
  api: WebIFC.IfcAPI,
  modelId: number,
  spatialHierarchy: SpatialNode
): IfcElement[] {
  const elements: IfcElement[] = [];

  // Build a map of expressId → storey GlobalId for spatial containment
  const containmentMap = buildContainmentMap(api, modelId);

  // Get all types in the model
  const allTypes = api.GetAllTypesOfModel(modelId);

  for (const ifcType of allTypes) {
    const entityType = classifyEntityType(ifcType.typeName);
    if (!entityType) continue; // Skip unsupported types

    const typeCode = ifcType.typeID;
    const lineIds = api.GetLineIDsWithType(modelId, typeCode);

    for (let i = 0; i < lineIds.size(); i++) {
      const expressId = lineIds.get(i);

      try {
        const line = api.GetLine(modelId, expressId, true);
        const element = buildElement(api, modelId, expressId, line, entityType, containmentMap);
        if (element) {
          elements.push(element);
        }
      } catch {
        // Skip elements that fail to parse
        continue;
      }
    }
  }

  // Assign element IDs to spatial hierarchy nodes
  assignElementsToSpatialNodes(elements, spatialHierarchy);

  return elements;
}

/**
 * Builds a map of element expressId → containing storey/building GlobalId
 * by traversing IfcRelContainedInSpatialStructure relationships.
 */
function buildContainmentMap(api: WebIFC.IfcAPI, modelId: number): Map<number, string> {
  const map = new Map<number, string>();

  try {
    const relTypeCode = api.GetTypeCodeFromName('IFCRELCONTAINEDINSPATIALSTRUCTURE');
    const relIds = api.GetLineIDsWithType(modelId, relTypeCode);

    for (let i = 0; i < relIds.size(); i++) {
      const relExpressId = relIds.get(i);
      try {
        const rel = api.GetLine(modelId, relExpressId, true);
        const structureGlobalId = extractRelatingStructureGlobalId(rel);
        const relatedElements = extractRelatedElements(rel);

        if (structureGlobalId && relatedElements) {
          for (const elementExpressId of relatedElements) {
            map.set(elementExpressId, structureGlobalId);
          }
        }
      } catch {
        continue;
      }
    }
  } catch {
    // IfcRelContainedInSpatialStructure may not exist
  }

  return map;
}

/**
 * Builds an IfcElement from a parsed line.
 */
function buildElement(
  api: WebIFC.IfcAPI,
  modelId: number,
  expressId: number,
  line: any,
  entityType: IfcEntityType,
  containmentMap: Map<number, string>
): IfcElement | null {
  const globalId = extractGlobalId(line);
  if (!globalId) return null;

  const name = extractName(line) || '';
  const predefinedType = extractPredefinedType(line);
  const spatialContainment = containmentMap.get(expressId) || '';
  const classification = extractClassification(api, modelId, expressId);
  const materials = extractMaterialLayers(api, modelId, expressId);
  const hasGeometry = hasRepresentation(line);

  const element: IfcElement = {
    globalId,
    entityType,
    name,
    predefinedType,
    spatialContainment,
    classification,
    materials,
    quantitySets: [], // Will be populated by quantityExtractorService
    propertySets: [], // Will be populated by quantityExtractorService
    hasGeometry,
    taggedMetadata: {},
  };

  return element;
}

// ─── Classification Extraction ────────────────────────────────────────────

/**
 * Extracts IfcClassificationReference data for an element via
 * IfcRelAssociatesClassification relationships.
 */
function extractClassification(
  api: WebIFC.IfcAPI,
  modelId: number,
  elementExpressId: number
): IfcClassification | undefined {
  try {
    const relTypeCode = api.GetTypeCodeFromName('IFCRELASSOCIATESCLASSIFICATION');
    const relIds = api.GetLineIDsWithType(modelId, relTypeCode);

    for (let i = 0; i < relIds.size(); i++) {
      const relExpressId = relIds.get(i);
      try {
        const rel = api.GetLine(modelId, relExpressId, true);

        // Check if this element is in the RelatedObjects
        const relatedObjects = rel.RelatedObjects;
        if (!relatedObjects) continue;

        let found = false;
        if (Array.isArray(relatedObjects)) {
          found = relatedObjects.some((obj: any) => {
            const id = typeof obj === 'object' ? obj.expressID ?? obj.value : obj;
            return id === elementExpressId;
          });
        }

        if (!found) continue;

        // Extract classification reference
        const classRef = rel.RelatingClassification;
        if (!classRef) continue;

        const classRefObj = typeof classRef === 'object' && classRef.expressID
          ? api.GetLine(modelId, classRef.expressID, true)
          : classRef;

        const code = extractStringValue(classRefObj?.Identification ?? classRefObj?.ItemReference) || '';
        const description = extractStringValue(classRefObj?.Name ?? classRefObj?.Description) || '';

        // Get classification system name
        let systemName = '';
        const referencedSource = classRefObj?.ReferencedSource;
        if (referencedSource) {
          const sourceObj = typeof referencedSource === 'object' && referencedSource.expressID
            ? api.GetLine(modelId, referencedSource.expressID, true)
            : referencedSource;
          systemName = extractStringValue(sourceObj?.Name) || '';
        }

        if (code || description || systemName) {
          return { systemName, code, description };
        }
      } catch {
        continue;
      }
    }
  } catch {
    // Classification relationships may not exist
  }

  return undefined;
}

// ─── Material Extraction ──────────────────────────────────────────────────

/**
 * Extracts material layers from IfcMaterialLayerSetUsage or IfcMaterialConstituentSet
 * via IfcRelAssociatesMaterial relationships.
 *
 * @param api - Initialized IfcAPI instance
 * @param modelId - The model ID
 * @param elementExpressId - Express ID of the element
 * @returns Array of MaterialLayer objects
 */
export function extractMaterialLayers(
  api: WebIFC.IfcAPI,
  modelId: number,
  elementExpressId: number
): MaterialLayer[] {
  const layers: MaterialLayer[] = [];

  try {
    const relTypeCode = api.GetTypeCodeFromName('IFCRELASSOCIATESMATERIAL');
    const relIds = api.GetLineIDsWithType(modelId, relTypeCode);

    for (let i = 0; i < relIds.size(); i++) {
      const relExpressId = relIds.get(i);
      try {
        const rel = api.GetLine(modelId, relExpressId, true);

        // Check if this element is in RelatedObjects
        const relatedObjects = rel.RelatedObjects;
        if (!relatedObjects) continue;

        let found = false;
        if (Array.isArray(relatedObjects)) {
          found = relatedObjects.some((obj: any) => {
            const id = typeof obj === 'object' ? obj.expressID ?? obj.value : obj;
            return id === elementExpressId;
          });
        }

        if (!found) continue;

        // Extract material
        const relatingMaterial = rel.RelatingMaterial;
        if (!relatingMaterial) continue;

        const materialObj = typeof relatingMaterial === 'object' && relatingMaterial.expressID
          ? api.GetLine(modelId, relatingMaterial.expressID, true)
          : relatingMaterial;

        if (!materialObj) continue;

        // Handle IfcMaterialLayerSetUsage
        if (materialObj.ForLayerSet || materialObj.MaterialLayers) {
          const layerSet = materialObj.ForLayerSet
            ? (typeof materialObj.ForLayerSet === 'object' && materialObj.ForLayerSet.expressID
              ? api.GetLine(modelId, materialObj.ForLayerSet.expressID, true)
              : materialObj.ForLayerSet)
            : materialObj;

          const materialLayers = layerSet?.MaterialLayers;
          if (Array.isArray(materialLayers)) {
            for (const layer of materialLayers) {
              const layerObj = typeof layer === 'object' && layer.expressID
                ? api.GetLine(modelId, layer.expressID, true)
                : layer;

              const materialRef = layerObj?.Material;
              const materialEntity = materialRef && typeof materialRef === 'object' && materialRef.expressID
                ? api.GetLine(modelId, materialRef.expressID, true)
                : materialRef;

              const materialName = extractStringValue(materialEntity?.Name) || 'Unknown Material';
              const thickness = typeof layerObj?.LayerThickness === 'number'
                ? layerObj.LayerThickness * 1000 // Convert from m to mm
                : (layerObj?.LayerThickness?.value ?? 0) * 1000;
              const category = extractStringValue(materialEntity?.Category);

              layers.push({
                materialName,
                thicknessMm: thickness,
                category: category || undefined,
              });
            }
          }
        }
        // Handle IfcMaterialConstituentSet
        else if (materialObj.MaterialConstituents) {
          const constituents = materialObj.MaterialConstituents;
          if (Array.isArray(constituents)) {
            for (const constituent of constituents) {
              const constituentObj = typeof constituent === 'object' && constituent.expressID
                ? api.GetLine(modelId, constituent.expressID, true)
                : constituent;

              const materialRef = constituentObj?.Material;
              const materialEntity = materialRef && typeof materialRef === 'object' && materialRef.expressID
                ? api.GetLine(modelId, materialRef.expressID, true)
                : materialRef;

              const materialName = extractStringValue(materialEntity?.Name) || 'Unknown Material';
              const category = extractStringValue(materialEntity?.Category);

              layers.push({
                materialName,
                thicknessMm: 0, // Constituent sets don't have explicit thickness
                category: category || undefined,
              });
            }
          }
        }
        // Handle single IfcMaterial
        else if (materialObj.Name) {
          layers.push({
            materialName: extractStringValue(materialObj.Name) || 'Unknown Material',
            thicknessMm: 0,
            category: extractStringValue(materialObj.Category) || undefined,
          });
        }

        // Once we find materials for this element, stop looking
        if (layers.length > 0) break;
      } catch {
        continue;
      }
    }
  } catch {
    // Material relationships may not exist
  }

  return layers;
}

// ─── Helper Functions ─────────────────────────────────────────────────────

/**
 * Extracts GlobalId from an IFC line object.
 * GlobalId is typically the first attribute (index 0) of IFC entities.
 */
function extractGlobalId(line: any): string | undefined {
  if (!line) return undefined;

  // web-ifc flattened line has GlobalId property
  if (line.GlobalId !== undefined) {
    return extractStringValue(line.GlobalId);
  }

  return undefined;
}

/**
 * Extracts the Name attribute from an IFC line object.
 */
function extractName(line: any): string | undefined {
  if (!line) return undefined;

  if (line.Name !== undefined) {
    return extractStringValue(line.Name);
  }

  return undefined;
}

/**
 * Extracts PredefinedType attribute from an element line.
 */
function extractPredefinedType(line: any): string | undefined {
  if (!line) return undefined;

  const predefined = line.PredefinedType;
  if (!predefined) return undefined;

  // Handle IFC enum values
  if (typeof predefined === 'string') return predefined;
  if (typeof predefined === 'object' && predefined.value) return String(predefined.value);

  return undefined;
}

/**
 * Extracts a string value from various IFC value representations.
 */
function extractStringValue(value: any): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value.value !== undefined) return String(value.value);
  if (typeof value === 'number') return String(value);
  return undefined;
}

/**
 * Checks if a line has geometric representation.
 */
function hasRepresentation(line: any): boolean {
  if (!line) return false;
  return !!(line.Representation || line.ObjectPlacement);
}

/**
 * Extracts the GlobalId of the RelatingStructure from a spatial containment relation.
 */
function extractRelatingStructureGlobalId(rel: any): string | undefined {
  if (!rel?.RelatingStructure) return undefined;
  const structure = rel.RelatingStructure;
  return extractGlobalId(structure);
}

/**
 * Extracts express IDs of related elements from a relationship.
 */
function extractRelatedElements(rel: any): number[] | undefined {
  if (!rel?.RelatedElements) return undefined;

  const elements = rel.RelatedElements;
  if (!Array.isArray(elements)) return undefined;

  return elements
    .map((obj: any) => {
      if (typeof obj === 'number') return obj;
      if (typeof obj === 'object') return obj.expressID ?? obj.value;
      return undefined;
    })
    .filter((id: any): id is number => typeof id === 'number');
}

/**
 * Assigns element IDs to matching spatial hierarchy nodes based on
 * the elements' spatialContainment values.
 */
function assignElementsToSpatialNodes(elements: IfcElement[], node: SpatialNode): void {
  for (const element of elements) {
    if (element.spatialContainment === node.globalId) {
      node.elementIds.push(element.globalId);
    }
  }

  for (const child of node.children) {
    assignElementsToSpatialNodes(elements, child);
  }
}

/**
 * Generates a unique file ID.
 */
function generateFileId(): string {
  return `bim_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
