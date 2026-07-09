/**
 * Tests for IFC Parser Service — entity classification and parsing structure
 *
 * Tests classifyEntityType (no web-ifc needed) and parseIfcFile output structure
 * (uses mocked web-ifc API).
 *
 * Validates: Requirements 1.3, 1.7, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 */

import { vi } from 'vitest';
import {
  classifyEntityType,
  extractSpatialHierarchy,
  parseIfcFile,
} from '../ifcParserService';
import type { IfcEntityType } from '../types';
import { ALL_IFC_ENTITY_TYPES } from './generators';

// ─── classifyEntityType Tests ─────────────────────────────────────────────

describe('classifyEntityType', () => {
  describe('structural entity types', () => {
    const structuralTypes: [string, IfcEntityType][] = [
      ['IFCWALL', 'IfcWall'],
      ['IFCWALLSTANDARDCASE', 'IfcWallStandardCase'],
      ['IFCSLAB', 'IfcSlab'],
      ['IFCCOLUMN', 'IfcColumn'],
      ['IFCBEAM', 'IfcBeam'],
      ['IFCDOOR', 'IfcDoor'],
      ['IFCWINDOW', 'IfcWindow'],
      ['IFCROOF', 'IfcRoof'],
      ['IFCSTAIR', 'IfcStair'],
      ['IFCRAILING', 'IfcRailing'],
      ['IFCCURTAINWALL', 'IfcCurtainWall'],
      ['IFCPLATE', 'IfcPlate'],
      ['IFCMEMBER', 'IfcMember'],
      ['IFCPILE', 'IfcPile'],
      ['IFCFOOTING', 'IfcFooting'],
      ['IFCCOVERING', 'IfcCovering'],
      ['IFCBUILDINGELEMENTPROXY', 'IfcBuildingElementProxy'],
    ];

    it.each(structuralTypes)(
      'classifies %s as %s',
      (input, expected) => {
        expect(classifyEntityType(input)).toBe(expected);
      }
    );
  });

  describe('MEP entity types', () => {
    const mepTypes: [string, IfcEntityType][] = [
      ['IFCPIPESEGMENT', 'IfcPipeSegment'],
      ['IFCPIPEFITTING', 'IfcPipeFitting'],
      ['IFCDUCTSEGMENT', 'IfcDuctSegment'],
      ['IFCDUCTFITTING', 'IfcDuctFitting'],
      ['IFCCABLESEGMENT', 'IfcCableSegment'],
      ['IFCCABLEFITTING', 'IfcCableFitting'],
      ['IFCFLOWTERMINAL', 'IfcFlowTerminal'],
      ['IFCENERGYCONVERSIONDEVICE', 'IfcEnergyConversionDevice'],
      ['IFCFLOWCONTROLLER', 'IfcFlowController'],
      ['IFCFLOWSTORAGEDEVICE', 'IfcFlowStorageDevice'],
    ];

    it.each(mepTypes)(
      'classifies %s as %s',
      (input, expected) => {
        expect(classifyEntityType(input)).toBe(expected);
      }
    );
  });

  describe('case-insensitive matching', () => {
    it('classifies PascalCase input', () => {
      expect(classifyEntityType('IfcWall')).toBe('IfcWall');
      expect(classifyEntityType('IfcPipeSegment')).toBe('IfcPipeSegment');
    });

    it('classifies lowercase input', () => {
      expect(classifyEntityType('ifcwall')).toBe('IfcWall');
      expect(classifyEntityType('ifcslab')).toBe('IfcSlab');
    });

    it('classifies mixed case input', () => {
      expect(classifyEntityType('IFCwall')).toBe('IfcWall');
      expect(classifyEntityType('ifcBEAM')).toBe('IfcBeam');
    });
  });

  describe('unsupported and edge cases', () => {
    it('returns undefined for unsupported entity types', () => {
      expect(classifyEntityType('IFCSPACE')).toBeUndefined();
      expect(classifyEntityType('IFCPROJECT')).toBeUndefined();
      expect(classifyEntityType('IFCSITE')).toBeUndefined();
      expect(classifyEntityType('IFCBUILDING')).toBeUndefined();
      expect(classifyEntityType('IFCBUILDINGSTOREY')).toBeUndefined();
      expect(classifyEntityType('IFCPRODUCT')).toBeUndefined();
    });

    it('returns undefined for empty string', () => {
      expect(classifyEntityType('')).toBeUndefined();
    });

    it('returns undefined for random string', () => {
      expect(classifyEntityType('NotAnIfcType')).toBeUndefined();
      expect(classifyEntityType('SomeRandomString')).toBeUndefined();
    });

    it('covers all 27 entity types in the IfcEntityType union', () => {
      // Verify all 27 types are recognized
      const recognizedTypes = ALL_IFC_ENTITY_TYPES.map((t) => classifyEntityType(t));
      expect(recognizedTypes.every((t) => t !== undefined)).toBe(true);
      expect(new Set(recognizedTypes).size).toBe(27);
    });
  });
});

// ─── parseIfcFile Tests (with mocked web-ifc) ────────────────────────────

// Mock web-ifc module with a proper class
vi.mock('web-ifc', () => {
  function makeMockVector(items: number[]) {
    return {
      get: (index: number) => items[index],
      size: () => items.length,
      [Symbol.iterator]: function* () { yield* items; },
    };
  }

  const mockLines: Record<number, any> = {
    1: { expressID: 1, GlobalId: 'PROJECT_001', Name: 'Test Project', type: 1 },
    2: { expressID: 2, GlobalId: 'SITE_001', Name: 'Test Site', type: 2 },
    3: { expressID: 3, GlobalId: 'BUILDING_001', Name: 'Building A', type: 3 },
    4: { expressID: 4, GlobalId: 'STOREY_001', Name: 'Ground Floor', type: 4 },
    10: { expressID: 10, GlobalId: 'WALL_001', Name: 'External Wall 1', PredefinedType: 'STANDARD', Representation: {}, type: 100 },
    11: { expressID: 11, GlobalId: 'WALL_002', Name: 'Internal Wall 1', PredefinedType: { value: 'PARTITIONING' }, Representation: {}, type: 100 },
    20: { expressID: 20, GlobalId: 'SLAB_001', Name: 'Ground Slab', Representation: {}, type: 101 },
  };

  class MockIfcAPI {
    Init() { return Promise.resolve(); }
    OpenModel() { return 0; }
    CloseModel() {}
    GetAllTypesOfModel() {
      return [
        { typeID: 100, typeName: 'IFCWALL' },
        { typeID: 101, typeName: 'IFCSLAB' },
      ];
    }
    GetLineIDsWithType(_modelId: number, typeCode: number) {
      if (typeCode === 1) return makeMockVector([1]);
      if (typeCode === 2) return makeMockVector([2]);
      if (typeCode === 3) return makeMockVector([3]);
      if (typeCode === 4) return makeMockVector([4]);
      if (typeCode === 5) return makeMockVector([]);
      if (typeCode === 6) return makeMockVector([]);
      if (typeCode === 7) return makeMockVector([]);
      if (typeCode === 100) return makeMockVector([10, 11]);
      if (typeCode === 101) return makeMockVector([20]);
      return makeMockVector([]);
    }
    GetLine(_modelId: number, expressId: number) {
      return mockLines[expressId] || { expressID: expressId, GlobalId: `GID_${expressId}`, Name: `Entity ${expressId}` };
    }
    GetTypeCodeFromName(name: string) {
      const codes: Record<string, number> = {
        IFCPROJECT: 1, IFCSITE: 2, IFCBUILDING: 3,
        IFCBUILDINGSTOREY: 4, IFCRELCONTAINEDINSPATIALSTRUCTURE: 5,
        IFCRELASSOCIATESCLASSIFICATION: 6, IFCRELASSOCIATESMATERIAL: 7,
      };
      return codes[name] ?? 999;
    }
    GetNameFromTypeCode(code: number) {
      const names: Record<number, string> = {
        1: 'IFCPROJECT', 2: 'IFCSITE', 3: 'IFCBUILDING', 4: 'IFCBUILDINGSTOREY',
        100: 'IFCWALL', 101: 'IFCSLAB',
      };
      return names[code] ?? 'UNKNOWN';
    }
  }
  return { IfcAPI: MockIfcAPI };
});

describe('parseIfcFile', () => {
  const validIfcBuffer = new TextEncoder().encode(
    'ISO-10303-21;\nHEADER;\nFILE_SCHEMA((\'IFC4\'));\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n'
  );

  it('returns error for empty buffer', async () => {
    const result = await parseIfcFile(new Uint8Array(0), 'test.ifc');
    expect(result).toHaveProperty('error');
    // Empty file hits validateFileSize which returns FILE_TOO_LARGE
    expect((result as any).error).toBe('FILE_TOO_LARGE');
  });

  it('returns error for invalid extension', async () => {
    const result = await parseIfcFile(validIfcBuffer, 'test.txt');
    expect(result).toHaveProperty('error');
    expect((result as any).error).toBe('PARSE_ERROR');
  });

  it('returns error for non-STEP content', async () => {
    const buffer = new TextEncoder().encode('Not a STEP file');
    const result = await parseIfcFile(buffer, 'test.ifc');
    expect(result).toHaveProperty('error');
    expect((result as any).error).toBe('PARSE_ERROR');
  });

  it('returns error for unsupported schema', async () => {
    const buffer = new TextEncoder().encode(
      'ISO-10303-21;\nHEADER;\nFILE_SCHEMA((\'IFC1\'));\nENDSEC;\nDATA;\n'
    );
    const result = await parseIfcFile(buffer, 'test.ifc');
    expect(result).toHaveProperty('error');
    expect((result as any).message).toContain('Unsupported');
  });

  it('returns a valid ParsedIfcModel on success', async () => {
    const result = await parseIfcFile(validIfcBuffer, 'office-building.ifc');

    // Should not be an error response
    expect(result).not.toHaveProperty('error');

    const model = result as any;
    expect(model).toHaveProperty('fileId');
    expect(model).toHaveProperty('fileName', 'office-building.ifc');
    expect(model).toHaveProperty('schemaVersion', 'IFC4');
    expect(model).toHaveProperty('parsedAt');
    expect(model).toHaveProperty('spatialHierarchy');
    expect(model).toHaveProperty('elements');
    expect(model).toHaveProperty('elementCount');
  });

  it('populates spatial hierarchy from model', async () => {
    const result = await parseIfcFile(validIfcBuffer, 'test.ifc');
    const model = result as any;

    expect(model.spatialHierarchy).toBeDefined();
    expect(model.spatialHierarchy.type).toBe('IfcProject');
    expect(model.spatialHierarchy.globalId).toBe('PROJECT_001');
    expect(model.spatialHierarchy.children.length).toBeGreaterThan(0);
    expect(model.spatialHierarchy.children[0].type).toBe('IfcSite');
  });

  it('extracts elements with entity types', async () => {
    const result = await parseIfcFile(validIfcBuffer, 'test.ifc');
    const model = result as any;

    expect(model.elements.length).toBe(3); // 2 walls + 1 slab
    expect(model.elementCount).toBe(3);

    const wallElement = model.elements.find((e: any) => e.globalId === 'WALL_001');
    expect(wallElement).toBeDefined();
    expect(wallElement.entityType).toBe('IfcWall');
    expect(wallElement.name).toBe('External Wall 1');
    expect(wallElement.predefinedType).toBe('STANDARD');
    expect(wallElement.hasGeometry).toBe(true);
  });

  it('extracts predefinedType from object-style values', async () => {
    const result = await parseIfcFile(validIfcBuffer, 'test.ifc');
    const model = result as any;

    const wallElement = model.elements.find((e: any) => e.globalId === 'WALL_002');
    expect(wallElement).toBeDefined();
    expect(wallElement.predefinedType).toBe('PARTITIONING');
  });

  it('sets elementCount to match elements array length', async () => {
    const result = await parseIfcFile(validIfcBuffer, 'test.ifc');
    const model = result as any;
    expect(model.elementCount).toBe(model.elements.length);
  });

  it('includes parsedAt as ISO 8601 timestamp', async () => {
    const result = await parseIfcFile(validIfcBuffer, 'test.ifc');
    const model = result as any;
    const parsedDate = new Date(model.parsedAt);
    expect(parsedDate.toISOString()).toBe(model.parsedAt);
  });
});

// ─── extractSpatialHierarchy Tests ────────────────────────────────────────

describe('extractSpatialHierarchy', () => {
  it('builds correct hierarchy structure from mocked API', async () => {
    // Import gets the mocked version
    const WebIFC = await import('web-ifc');
    const api = new WebIFC.IfcAPI() as any;

    const hierarchy = extractSpatialHierarchy(api, 0);

    expect(hierarchy.type).toBe('IfcProject');
    expect(hierarchy.globalId).toBe('PROJECT_001');
    expect(hierarchy.name).toBe('Test Project');
    expect(hierarchy.children.length).toBe(1); // 1 site

    const site = hierarchy.children[0];
    expect(site.type).toBe('IfcSite');
    expect(site.globalId).toBe('SITE_001');
    expect(site.children.length).toBe(1); // 1 building

    const building = site.children[0];
    expect(building.type).toBe('IfcBuilding');
    expect(building.globalId).toBe('BUILDING_001');
    expect(building.children.length).toBe(1); // 1 storey

    const storey = building.children[0];
    expect(storey.type).toBe('IfcBuildingStorey');
    expect(storey.globalId).toBe('STOREY_001');
    expect(storey.name).toBe('Ground Floor');
  });
});
