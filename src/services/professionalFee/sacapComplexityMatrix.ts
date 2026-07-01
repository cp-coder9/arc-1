// SACAP Complexity Matrix - Building Category + Building Type -> Complexity Level
// Per SACAP Board Notice 27 of 2021

export interface SACAPBuildingType {
  id: string;
  name: string;
  complexityLevel: 'low' | 'medium' | 'high';
  description?: string;
}

export interface SACAPBuildingCategory {
  id: string;
  name: string;
  types: SACAPBuildingType[];
}

export interface SACAPComplexityMatrix {
  categories: SACAPBuildingCategory[];
}

export function lookupComplexity(
  matrix: SACAPComplexityMatrix,
  categoryId: string,
  typeId: string,
): 'low' | 'medium' | 'high' | null {
  const category = matrix.categories.find(c => c.id === categoryId);
  if (!category) return null;
  const type = category.types.find(t => t.id === typeId);
  if (!type) return null;
  return type.complexityLevel;
}

export function getCategories(
  matrix: SACAPComplexityMatrix,
): Array<{ id: string; name: string }> {
  return matrix.categories.map(c => ({ id: c.id, name: c.name }));
}

export function getTypesForCategory(
  matrix: SACAPComplexityMatrix,
  categoryId: string,
): Array<{ id: string; name: string; complexityLevel: 'low' | 'medium' | 'high' }> {
  const category = matrix.categories.find(c => c.id === categoryId);
  if (!category) return [];
  return category.types.map(t => ({ id: t.id, name: t.name, complexityLevel: t.complexityLevel }));
}

export function createDemoMatrix(): SACAPComplexityMatrix {
  return {
    categories: [
      {
        id: 'residential-domestic',
        name: 'Residential Domestic',
        types: [
          { id: 'rd-low-cost', name: 'Low-cost housing', complexityLevel: 'low', description: 'Low-cost, subsidised housing (repetitive plans)' },
          { id: 'rd-single-dwelling', name: 'Houses / standard dwellings', complexityLevel: 'low', description: 'Standard single residential dwelling' },
          { id: 'rd-townhouse', name: 'Townhouses / cluster housing', complexityLevel: 'medium', description: 'Townhouse or cluster dwelling unit' },
          { id: 'rd-alterations', name: 'Domestic alterations and additions', complexityLevel: 'medium', description: 'Alterations/additions to existing residential' },
          { id: 'rd-custom', name: 'Custom residences', complexityLevel: 'high', description: 'Bespoke, high-performance or luxury residential' },
        ],
      },
      {
        id: 'residential-multi-unit',
        name: 'Residential Multi-Unit',
        types: [
          { id: 'rmu-hostel', name: 'Hostel / dormitory', complexityLevel: 'low', description: 'Standard hostel or dormitory accommodation' },
          { id: 'rmu-walk-up', name: 'Walk-up flats (3 storeys or less)', complexityLevel: 'medium', description: 'Low-rise residential blocks without lifts' },
          { id: 'rmu-retirement', name: 'Retirement village / frail care', complexityLevel: 'medium', description: 'Retirement village with care facilities' },
          { id: 'rmu-high-rise', name: 'High-rise apartments (more than 3 storeys)', complexityLevel: 'high', description: 'Multi-storey residential tower with lifts' },
          { id: 'rmu-mixed-use', name: 'Mixed-use residential', complexityLevel: 'high', description: 'Residential with ground-floor commercial' },
        ],
      },
      {
        id: 'commercial',
        name: 'Commercial',
        types: [
          { id: 'com-shop', name: 'Small retail / shops', complexityLevel: 'low', description: 'Single retail unit or showroom' },
          { id: 'com-office-standard', name: 'Office parks / standard offices', complexityLevel: 'medium', description: 'General commercial office block' },
          { id: 'com-retail-centre', name: 'Shopping centres', complexityLevel: 'medium', description: 'Shopping centre or large retail complex' },
          { id: 'com-hotel', name: 'Hotels / guest houses', complexityLevel: 'high', description: 'Hospitality accommodation building' },
          { id: 'com-mixed-high-rise', name: 'Mixed-use high-rise', complexityLevel: 'high', description: 'High-rise mixed commercial/retail/residential' },
        ],
      },
      {
        id: 'industrial',
        name: 'Industrial',
        types: [
          { id: 'ind-warehouse', name: 'Warehouses / stores', complexityLevel: 'low', description: 'Standard warehouse or storage building' },
          { id: 'ind-factory-light', name: 'Light industrial / workshops', complexityLevel: 'low', description: 'Light manufacturing or workshop' },
          { id: 'ind-factory-heavy', name: 'Factories', complexityLevel: 'medium', description: 'Heavy manufacturing plant' },
          { id: 'ind-cold-storage', name: 'Cold storage / specialised', complexityLevel: 'medium', description: 'Temperature-controlled or specialised facility' },
          { id: 'ind-process-plant', name: 'Process plants', complexityLevel: 'high', description: 'Complex industrial process or power generation plant' },
        ],
      },
      {
        id: 'medical-social-services',
        name: 'Medical Social Services',
        types: [
          { id: 'med-day-care', name: 'Day care centres', complexityLevel: 'low', description: 'Day care or creche facility' },
          { id: 'med-clinic', name: 'Clinics', complexityLevel: 'medium', description: 'Community clinic or day hospital' },
          { id: 'med-old-age', name: 'Old age homes', complexityLevel: 'medium', description: 'Residential care for the elderly' },
          { id: 'med-general-hospital', name: 'General hospitals', complexityLevel: 'high', description: 'Full-service general hospital' },
          { id: 'med-specialist', name: 'Specialist medical facilities', complexityLevel: 'high', description: 'Specialist or private hospital facility' },
        ],
      },
      {
        id: 'educational',
        name: 'Educational',
        types: [
          { id: 'edu-creche', name: 'Creche / pre-primary', complexityLevel: 'low', description: 'Early childhood development facility' },
          { id: 'edu-primary', name: 'Primary schools', complexityLevel: 'low', description: 'Standard primary school buildings' },
          { id: 'edu-secondary', name: 'Secondary schools', complexityLevel: 'medium', description: 'Secondary school with specialist facilities' },
          { id: 'edu-library', name: 'Libraries', complexityLevel: 'medium', description: 'Public or institutional library' },
          { id: 'edu-tertiary', name: 'University facilities', complexityLevel: 'high', description: 'University or college with specialist labs' },
        ],
      },
      {
        id: 'recreational',
        name: 'Recreational',
        types: [
          { id: 'rec-community-hall', name: 'Community halls', complexityLevel: 'low', description: 'Standard community hall or gathering place' },
          { id: 'rec-sports-field', name: 'Sports fields / outdoor facilities', complexityLevel: 'low', description: 'Outdoor sports and recreation' },
          { id: 'rec-sports-centre', name: 'Sports centres / gymnasiums', complexityLevel: 'medium', description: 'Indoor fitness and exercise facility' },
          { id: 'rec-swimming', name: 'Swimming pool complexes', complexityLevel: 'medium', description: 'Aquatic centre or pool complex' },
          { id: 'rec-stadium', name: 'Stadia / arenas', complexityLevel: 'high', description: 'Large spectator sports venue' },
        ],
      },
      {
        id: 'religious',
        name: 'Religious',
        types: [
          { id: 'rel-hall', name: 'Church halls / parish offices', complexityLevel: 'low', description: 'Ancillary hall or office building' },
          { id: 'rel-standard', name: 'Simple places of worship', complexityLevel: 'low', description: 'Standard place of worship' },
          { id: 'rel-medium', name: 'Medium churches / mosques / temples', complexityLevel: 'medium', description: 'Medium-scale place of worship' },
          { id: 'rel-cathedral', name: 'Large churches / cathedrals', complexityLevel: 'high', description: 'Large or architecturally significant place of worship' },
        ],
      },
      {
        id: 'agricultural',
        name: 'Agricultural',
        types: [
          { id: 'agr-shed', name: 'Farm buildings / sheds', complexityLevel: 'low', description: 'Standard agricultural storage or barn' },
          { id: 'agr-silo', name: 'Silos / grain storage', complexityLevel: 'low', description: 'Grain or bulk storage facility' },
          { id: 'agr-processing', name: 'Complex agri-processing', complexityLevel: 'medium', description: 'Produce processing or packing facility' },
          { id: 'agr-greenhouse', name: 'Greenhouses / controlled environments', complexityLevel: 'medium', description: 'Climate-controlled growing facility' },
          { id: 'agr-winery', name: 'Wineries / distilleries', complexityLevel: 'high', description: 'Wine production or visitor-facing agricultural facility' },
        ],
      },
    ],
  };
}

const DEMO_MATRIX = createDemoMatrix();

export function getMatrix(): SACAPComplexityMatrix {
  return DEMO_MATRIX;
}
