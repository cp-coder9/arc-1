export type ProjectStage =
  | 'brief_enquiry'
  | 'shortlisted'
  | 'submissions'
  | 'interviewing'
  | 'appointed'
  | 'concept_design'
  | 'design_development'
  | 'tender_documentation'
  | 'construction'
  | 'close_out'
  | 'complete';

export interface MockProject {
  id: string;
  title: string;
  description: string;
  projectType: string;
  stage: ProjectStage;
  location: string;
  province: string;
  municipality: string;
  budget: number;
  erfSize: number;
  floorArea: number;
  storeys: number;
  clientId: string;
  assignedArchitect: string;
  assignedEngineers: string[];
  assignedQS: string;
  assignedContractor: string;
  assignedBEP?: string;
  assignedCPDOfficer?: string;
  briefHighlights: string[];
  createdAt: string;
  targetDate: string;
  imageSeed: string;
}

export const MOCK_PROJECTS: MockProject[] = [
  // ─── Original 6 ───
  {
    id: 'project_parkview_01',
    title: 'Parkview Residence',
    description: 'New-build luxury residential home with 4 bedrooms, home office, pool, and landscaped garden. Contemporary architecture with emphasis on north-facing orientation and passive solar design.',
    projectType: 'Residential (New)',
    stage: 'concept_design',
    location: 'Parkview, Johannesburg',
    province: 'Gauteng',
    municipality: 'City of Johannesburg',
    budget: 3_200_000,
    erfSize: 1200,
    floorArea: 320,
    storeys: 2,
    clientId: 'demo_client_01',
    assignedArchitect: 'demo_architect_01',
    assignedEngineers: ['demo_engineer_struct_01', 'demo_engineer_elec_01', 'demo_engineer_mech_01'],
    assignedQS: 'demo_qs_01',
    assignedContractor: '',
    assignedBEP: 'demo_bep_01',
    assignedCPDOfficer: 'demo_cpd_officer_01',
    briefHighlights: [
      '4 bedrooms with en-suite bathrooms',
      'Open-plan living/kitchen/dining',
      'Home office with separate entrance',
      'Pool and entertainment area',
      'Double garage with storage',
      'North-facing living areas',
      'Solar-ready roof structure',
    ],
    createdAt: '2026-03-15T08:00:00Z',
    targetDate: '2027-06-30T00:00:00Z',
    imageSeed: 'parkview-house',
  },
  {
    id: 'project_sandton_01',
    title: 'Sandton Office Block',
    description: 'Four-storey commercial office building with ground-floor retail, basement parking, and rooftop terrace. Targeting 4-star Green Star SA rating.',
    projectType: 'Commercial (New)',
    stage: 'tender_documentation',
    location: 'Sandton Central, Johannesburg',
    province: 'Gauteng',
    municipality: 'City of Johannesburg',
    budget: 18_500_000,
    erfSize: 2500,
    floorArea: 4200,
    storeys: 4,
    clientId: 'demo_client_02',
    assignedArchitect: 'demo_architect_02',
    assignedEngineers: ['demo_engineer_struct_01', 'demo_engineer_civil_01', 'demo_engineer_elec_01', 'demo_engineer_mech_01', 'demo_engineer_fire_01'],
    assignedQS: 'demo_qs_01',
    assignedContractor: 'demo_contractor_01',
    assignedBEP: 'demo_bep_01',
    briefHighlights: [
      'Ground-floor retail: 3 tenancies',
      'Office floors: 800m² each',
      'Basement parking: 60 bays',
      'Rooftop terrace with landscaping',
      'Two lifts + fire escape stairs',
      'BMS and smart building systems',
      'PV-ready roof',
    ],
    createdAt: '2025-08-01T09:00:00Z',
    targetDate: '2027-03-31T00:00:00Z',
    imageSeed: 'sandton-office',
  },
  {
    id: 'project_seapoint_01',
    title: 'Sea Point Apartment Renovation',
    description: 'Full renovation of 8-unit apartment block including structural strengthening, new fenestration, MEP upgrade, and basement conversion to resident amenity space.',
    projectType: 'Residential (Renovation)',
    stage: 'construction',
    location: 'Sea Point, Cape Town',
    province: 'Western Cape',
    municipality: 'City of Cape Town',
    budget: 8_700_000,
    erfSize: 850,
    floorArea: 1800,
    storeys: 4,
    clientId: 'demo_client_02',
    assignedArchitect: 'demo_architect_01',
    assignedEngineers: ['demo_engineer_struct_01', 'demo_engineer_elec_01', 'demo_engineer_mech_01', 'demo_engineer_fire_01'],
    assignedQS: 'demo_qs_01',
    assignedContractor: 'demo_contractor_01',
    briefHighlights: [
      'Structural strengthening of sea-facing wall',
      'All-new aluminium glazing with thermal break',
      'MEP full replacement (plumbing, elec, HVAC)',
      'Basement conversion to gym + laundry',
      'New roof waterproofing and insulation',
      'Communal rooftop garden',
    ],
    createdAt: '2025-06-15T10:00:00Z',
    targetDate: '2026-09-30T00:00:00Z',
    imageSeed: 'seapoint-apartment',
  },
  {
    id: 'project_umhlanga_01',
    title: 'Umhlanga Medical Centre',
    description: 'New-build 3-storey medical consulting centre with 20 consulting rooms, pharmacy, radiology suite, and basement parking. Located in Umhlanga Ridge precinct.',
    projectType: 'Commercial (Healthcare)',
    stage: 'brief_enquiry',
    location: 'Umhlanga Ridge, Durban',
    province: 'KwaZulu-Natal',
    municipality: 'eThekwini Metropolitan',
    budget: 22_000_000,
    erfSize: 3200,
    floorArea: 3500,
    storeys: 3,
    clientId: 'demo_client_03',
    assignedArchitect: '',
    assignedEngineers: [],
    assignedQS: '',
    assignedContractor: '',
    briefHighlights: [
      '20 consulting rooms (varying sizes)',
      'Reception and waiting areas per floor',
      'Pharmacy and dispensary (ground floor)',
      'Radiology suite with X-ray and ultrasound',
      'Staff tea room and admin offices',
      'Basement parking: 40 bays',
      'Backup generator and UPS rooms',
      'Medical gas system infrastructure',
    ],
    createdAt: '2026-05-01T11:00:00Z',
    targetDate: '2027-12-31T00:00:00Z',
    imageSeed: 'umhlanga-medical',
  },
  {
    id: 'project_fourways_01',
    title: 'Fourways Mall Extension',
    description: '12 000m² retail extension to existing Fourways Mall including new anchor tenant space, cinema complex, food court, and 500-bay parking deck over 3 levels.',
    projectType: 'Commercial (Retail)',
    stage: 'design_development',
    location: 'Fourways, Johannesburg',
    province: 'Gauteng',
    municipality: 'City of Johannesburg',
    budget: 45_000_000,
    erfSize: 15000,
    floorArea: 12000,
    storeys: 3,
    clientId: 'demo_client_01',
    assignedArchitect: 'demo_architect_02',
    assignedEngineers: ['demo_engineer_struct_01', 'demo_engineer_civil_01', 'demo_engineer_elec_01', 'demo_engineer_mech_01', 'demo_engineer_fire_01'],
    assignedQS: 'demo_qs_01',
    assignedContractor: '',
    assignedBEP: 'demo_bep_01',
    briefHighlights: [
      '12 000m² additional retail space',
      'Anchor tenant: 3 000m² department store',
      'Cinema complex: 8 screens',
      'Food court seating 400',
      '3-level parking deck: 500 bays',
      'Covered walkway connecting to existing mall',
      'Loading dock with 6 bay positions',
    ],
    createdAt: '2025-11-01T08:00:00Z',
    targetDate: '2028-06-30T00:00:00Z',
    imageSeed: 'fourways-mall',
  },
  {
    id: 'project_greenpoint_01',
    title: 'Greenpoint Primary School',
    description: 'New 24-classroom primary school with hall, sports field, admin wing, and early childhood development centre. PPP project between Western Cape Education Department and private developer.',
    projectType: 'Educational (New)',
    stage: 'close_out',
    location: 'Greenpoint, Cape Town',
    province: 'Western Cape',
    municipality: 'City of Cape Town',
    budget: 35_000_000,
    erfSize: 8000,
    floorArea: 5200,
    storeys: 2,
    clientId: 'demo_client_03',
    assignedArchitect: 'demo_architect_02',
    assignedEngineers: ['demo_engineer_struct_01', 'demo_engineer_civil_01', 'demo_engineer_elec_01', 'demo_engineer_mech_01', 'demo_engineer_fire_01'],
    assignedQS: 'demo_qs_01',
    assignedContractor: 'demo_contractor_01',
    briefHighlights: [
      '24 classrooms (8 per grade)',
      'Multi-purpose hall seating 500',
      'Sports field with athletics track',
      'ECD wing: 4 classrooms + play area',
      'Admin block with staff room and offices',
      'Library and computer lab',
      'Kitchen and dining hall',
      'After-care facility',
    ],
    createdAt: '2024-09-01T08:00:00Z',
    targetDate: '2026-05-31T00:00:00Z',
    imageSeed: 'greenpoint-school',
  },

  // ─── 6 NEW projects for wider variety ───
  {
    id: 'project_rosebank_01',
    title: 'Rosebank Mixed-Use Precinct',
    description: 'Mixed-use development combining 5 levels of luxury apartments above 2 levels of retail and office space. Includes basement parking, rooftop pool, and communal gardens. Transit-oriented development adjacent to Rosebank Gautrain station.',
    projectType: 'Mixed-Use (Residential + Retail)',
    stage: 'shortlisted',
    location: 'Rosebank, Johannesburg',
    province: 'Gauteng',
    municipality: 'City of Johannesburg',
    budget: 85_000_000,
    erfSize: 4500,
    floorArea: 12000,
    storeys: 7,
    clientId: 'demo_client_01',
    assignedArchitect: 'demo_architect_01',
    assignedEngineers: ['demo_engineer_struct_01', 'demo_engineer_civil_01', 'demo_engineer_elec_01', 'demo_engineer_mech_01', 'demo_engineer_fire_01'],
    assignedQS: 'demo_qs_01',
    assignedContractor: '',
    assignedBEP: 'demo_bep_01',
    assignedCPDOfficer: 'demo_cpd_officer_01',
    briefHighlights: [
      '46 luxury apartments (1, 2, 3-bed)',
      'Ground-floor retail: 6 tenancies',
      'First-floor office: 1 200m²',
      'Basement parking: 120 bays',
      'Rooftop pool and communal garden',
      'Gautrain pedestrian link',
      'PV-ready roof + greywater system',
      'Mixed-use zoning consent pending',
    ],
    createdAt: '2026-04-10T09:00:00Z',
    targetDate: '2028-12-31T00:00:00Z',
    imageSeed: 'rosebank-mixed-use',
  },
  {
    id: 'project_springs_01',
    title: 'Springs Industrial Warehouse',
    description: 'New-build 4 500m² industrial warehouse with 800m² office wing, 6 loading bays, and truck turning area. Located in Springs Industrial Park. Designed for logistics and warehousing tenant.',
    projectType: 'Industrial (New)',
    stage: 'design_development',
    location: 'Springs, Ekurhuleni',
    province: 'Gauteng',
    municipality: 'Ekurhuleni Metropolitan',
    budget: 28_000_000,
    erfSize: 12000,
    floorArea: 5300,
    storeys: 1,
    clientId: 'demo_client_02',
    assignedArchitect: 'demo_technologist_01',
    assignedEngineers: ['demo_engineer_struct_01', 'demo_engineer_civil_01', 'demo_engineer_elec_01', 'demo_engineer_fire_01'],
    assignedQS: 'demo_qs_01',
    assignedContractor: '',
    briefHighlights: [
      '4 500m² warehouse floor plate',
      '800m² office mezzanine',
      '6 dock-level loading bays',
      '25m truck turning radius',
      '3-phase electrical supply 400A',
      'Fire sprinkler system (OH3)',
      '50m clear span roof structure',
      'ESKOM municipal supply upgrade required',
    ],
    createdAt: '2026-01-20T08:00:00Z',
    targetDate: '2027-08-31T00:00:00Z',
    imageSeed: 'springs-warehouse',
  },
  {
    id: 'project_bo_kaap_01',
    title: 'Bo-Kaap Heritage Restoration',
    description: 'Heritage-sensitive restoration of 3 adjoining 19th-century terrace houses in the Bo-Kaap heritage precinct. Includes structural stabilisation, period-appropriate window restoration, and conversion to boutique guesthouse with 8 suites.',
    projectType: 'Heritage (Restoration)',
    stage: 'construction',
    location: 'Bo-Kaap, Cape Town',
    province: 'Western Cape',
    municipality: 'City of Cape Town',
    budget: 6_500_000,
    erfSize: 500,
    floorArea: 750,
    storeys: 3,
    clientId: 'demo_client_03',
    assignedArchitect: 'demo_architect_02',
    assignedEngineers: ['demo_engineer_struct_01', 'demo_engineer_elec_01', 'demo_engineer_fire_01'],
    assignedQS: 'demo_qs_01',
    assignedContractor: 'demo_contractor_01',
    assignedBEP: 'demo_bep_01',
    assignedCPDOfficer: 'demo_cpd_officer_01',
    briefHighlights: [
      'Heritage SA approval in place',
      'Structural stabilisation of party walls',
      'Period-appropriate sash window restoration',
      '8 boutique guesthouse suites',
      'Communal courtyard garden',
      'Roof replacement with period clay tiles',
      'Modern MEP hidden in heritage fabric',
      'Fire compliance for 16-guest occupancy',
    ],
    createdAt: '2025-10-01T10:00:00Z',
    targetDate: '2026-11-30T00:00:00Z',
    imageSeed: 'bokaap-heritage',
  },
  {
    id: 'project_stellenbosch_01',
    title: 'Stellenbosch Wine Estate Centre',
    description: 'New wine-tasting centre, restaurant, and cellar door facility on a working wine estate. Includes underground barrel cellar, tasting room with 80-seat capacity, and outdoor terrace overlooking Simonsberg mountain.',
    projectType: 'Agricultural / Hospitality',
    stage: 'brief_enquiry',
    location: 'Stellenbosch, Western Cape',
    province: 'Western Cape',
    municipality: 'Stellenbosch Municipality',
    budget: 14_000_000,
    erfSize: 35000,
    floorArea: 1600,
    storeys: 2,
    clientId: 'demo_client_01',
    assignedArchitect: '',
    assignedEngineers: [],
    assignedQS: '',
    assignedContractor: '',
    assignedBEP: 'demo_bep_01',
    briefHighlights: [
      '80-seat tasting room and restaurant',
      'Underground barrel cellar (500-barrel capacity)',
      'Outdoor terrace with mountain views',
      'Commercial kitchen and cold storage',
      'Cellar door retail shop',
      'Staff facilities and admin office',
      'Wastewater treatment plant',
      'Agricultural land-use consent required',
    ],
    createdAt: '2026-05-20T11:00:00Z',
    targetDate: '2028-06-30T00:00:00Z',
    imageSeed: 'stellenbosch-wine',
  },
  {
    id: 'project_lenasia_01',
    title: 'Lenasia Community Mosque & Centre',
    description: 'New religious and community centre including prayer hall for 600 worshippers, community hall, madressa classrooms, imam residence, and ablution facilities. Minaret and dome architectural features.',
    projectType: 'Religious / Community',
    stage: 'tender_documentation',
    location: 'Lenasia, Johannesburg',
    province: 'Gauteng',
    municipality: 'City of Johannesburg',
    budget: 12_500_000,
    erfSize: 3500,
    floorArea: 2200,
    storeys: 2,
    clientId: 'demo_client_03',
    assignedArchitect: 'demo_architect_01',
    assignedEngineers: ['demo_engineer_struct_01', 'demo_engineer_elec_01', 'demo_engineer_mech_01', 'demo_engineer_fire_01'],
    assignedQS: 'demo_qs_01',
    assignedContractor: 'demo_contractor_01',
    briefHighlights: [
      'Main prayer hall: 600 capacity',
      'Community hall seating 300',
      '8 madressa classrooms',
      'Imam residence (3-bed)',
      'Ablution facilities (male/female)',
      'Minaret height 18m',
      'Dome structural design',
      'Sound system and AV integration',
      'Parking: 80 bays',
    ],
    createdAt: '2025-07-01T08:00:00Z',
    targetDate: '2027-01-31T00:00:00Z',
    imageSeed: 'lenasia-mosque',
  },
  {
    id: 'project_umhlanga_ridge_01',
    title: 'Umhlanga Ridge Tower',
    description: '20-storey mixed-use high-rise with 150 luxury apartments above 3 levels of commercial/retail podium. Iconic tower with curtain-wall glazing, rooftop restaurant, and 3-level basement parking. Landmark development on Umhlanga Ridge.',
    projectType: 'Mixed-Use (High-Rise)',
    stage: 'concept_design',
    location: 'Umhlanga Ridge, Durban',
    province: 'KwaZulu-Natal',
    municipality: 'eThekwini Metropolitan',
    budget: 220_000_000,
    erfSize: 3500,
    floorArea: 18000,
    storeys: 20,
    clientId: 'demo_client_01',
    assignedArchitect: 'demo_architect_02',
    assignedEngineers: ['demo_engineer_struct_01', 'demo_engineer_civil_01', 'demo_engineer_elec_01', 'demo_engineer_mech_01', 'demo_engineer_fire_01'],
    assignedQS: 'demo_qs_01',
    assignedContractor: '',
    assignedBEP: 'demo_bep_01',
    assignedCPDOfficer: 'demo_cpd_officer_01',
    briefHighlights: [
      '150 luxury apartments (15 floors)',
      '3-level commercial/retail podium',
      'Rooftop restaurant and bar',
      'Curtain-wall glazing system',
      '3-level basement: 200 bays',
      '3 high-speed lifts + fire lift',
      'Rooftop helipad provision',
      'Structural: post-tensioned concrete core',
      'Green Star SA 5-star target',
    ],
    createdAt: '2026-02-01T09:00:00Z',
    targetDate: '2029-06-30T00:00:00Z',
    imageSeed: 'umhlanga-tower',
  },
];

/**
 * Get role-specific view of projects for a given demo role.
 * Each role sees only the projects they're involved in.
 */
export function getProjectsForRole(demoRole: string): MockProject[] {
  switch (demoRole) {
    case 'client':
      return MOCK_PROJECTS.filter((p) =>
        ['demo_client_01', 'demo_client_03', 'demo_client_02'].includes(p.clientId)
      );
    case 'architect':
    case 'architectural_technologist':
    case 'candidate_architect':
      return MOCK_PROJECTS.filter((p) => p.assignedArchitect !== '');
    case 'engineer_structural':
      return MOCK_PROJECTS.filter((p) => p.assignedEngineers.includes('demo_engineer_struct_01'));
    case 'engineer_civil':
      return MOCK_PROJECTS.filter((p) => p.assignedEngineers.includes('demo_engineer_civil_01'));
    case 'engineer_electrical':
      return MOCK_PROJECTS.filter((p) => p.assignedEngineers.includes('demo_engineer_elec_01'));
    case 'engineer_mechanical':
      return MOCK_PROJECTS.filter((p) => p.assignedEngineers.includes('demo_engineer_mech_01'));
    case 'engineer_fire':
      return MOCK_PROJECTS.filter((p) => p.assignedEngineers.includes('demo_engineer_fire_01'));
    case 'quantity_surveyor':
      return MOCK_PROJECTS.filter((p) => p.assignedQS !== '');
    case 'contractor':
      return MOCK_PROJECTS.filter((p) => p.assignedContractor !== '');
    case 'subcontractor':
      return [MOCK_PROJECTS[1], MOCK_PROJECTS[2], MOCK_PROJECTS[5], MOCK_PROJECTS[8], MOCK_PROJECTS[10]];
    case 'supplier':
      return [MOCK_PROJECTS[1], MOCK_PROJECTS[2], MOCK_PROJECTS[4], MOCK_PROJECTS[7], MOCK_PROJECTS[11]];
    case 'energy_consultant':
    case 'bep':
      return MOCK_PROJECTS.filter((p) => p.assignedBEP !== '');
    case 'freelancer':
      return [MOCK_PROJECTS[0], MOCK_PROJECTS[4], MOCK_PROJECTS[6], MOCK_PROJECTS[11]];
    case 'cpd_officer':
      return MOCK_PROJECTS.filter((p) => p.assignedCPDOfficer !== '');
    case 'admin':
      return MOCK_PROJECTS;
    default:
      return MOCK_PROJECTS;
  }
}
