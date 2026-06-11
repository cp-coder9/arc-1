/**
 * SA Council Drawing Compliance Data — municipality profiles, drawing types,
 * base checklists, and municipality-specific overlay items.
 *
 * Sources: official municipal checklists, SDP booklets, application forms.
 * Last data refresh: 2026-04-30.
 */

export interface MunicipalityProfile {
  id: string;
  municipality: string;
  province: string;
  buildingPlanChannel: string;
  sdpChannel: string;
  publishedBuildingChecklist: string;
  publishedSdpGuidance: string;
  keyDifference: string;
  officialSource: string;
  lastChecked: string;
}

export interface DrawingTypeEntry {
  id: string;
  drawingType: string;
  toolboxKey: string;
  purpose: string;
  baseChecklist: string[];
  reviewFocus: string;
  primarySource: string;
}

export interface MunicipalitySpecificItem {
  municipality: string;
  drawingType: string;
  item: string;
  whereExpected: string;
  status: "Explicit" | "Partially explicit" | "Explicit on form";
  sourceNote: string;
}

export const SA_COUNCIL_DRAWING_COMPLIANCE_DATA = {
  dataDate: "2026-04-30",
  sourceHtml: "sa_council_drawing_compliance_navigator.html",
  municipalities: [
    {
      id: "city-of-johannesburg",
      municipality: "City of Johannesburg",
      province: "Gauteng",
      buildingPlanChannel: "CPMS online",
      sdpChannel: "CPMS online",
      publishedBuildingChecklist: "Yes",
      publishedSdpGuidance: "Yes",
      keyDifference:
        "Category-based building-plan checklists; online pre-scrutiny and occupancy workflow referenced.",
      officialSource:
        "https://joburg.org.za/departments_/Documents/Development%20Planning/Building%20Plans/Submission%20Categories%20-%20Checklists.pdf",
      lastChecked: "2026-04-30",
    },
    {
      id: "city-of-cape-town",
      municipality: "City of Cape Town",
      province: "Western Cape",
      buildingPlanChannel: "City planning portal / district process",
      sdpChannel: "Separate official SDP guidance",
      publishedBuildingChecklist: "Yes",
      publishedSdpGuidance: "Yes",
      keyDifference:
        "Building-plan document hub plus official booklet on when SDP is required.",
      officialSource:
        "https://www.capetown.gov.za/work%20and%20business/planning-portal/applications-and-submissions/building-plan-application-documents",
      lastChecked: "2026-04-30",
    },
    {
      id: "city-of-tshwane",
      municipality: "City of Tshwane",
      province: "Gauteng",
      buildingPlanChannel: "Electronic / land application system",
      sdpChannel: "Land application system",
      publishedBuildingChecklist: "Partial",
      publishedSdpGuidance: "Yes",
      keyDifference:
        "Land applications page lists both building-plan approval and SDP application form.",
      officialSource: "https://www.tshwane.gov.za/?page_id=21806",
      lastChecked: "2026-04-30",
    },
    {
      id: "city-of-ekurhuleni",
      municipality: "City of Ekurhuleni",
      province: "Gauteng",
      buildingPlanChannel: "Municipal forms / department process",
      sdpChannel: "Varies by planning stream",
      publishedBuildingChecklist: "Yes",
      publishedSdpGuidance: "Not clearly centralised",
      keyDifference:
        "Published forms include building plan approval, section 7(6), demolition, temporary structures, plumbing compliance, occupation certificate.",
      officialSource: "https://www.ekurhuleni.gov.za/building-control-forms/",
      lastChecked: "2026-04-30",
    },
    {
      id: "ethekwini-municipality",
      municipality: "eThekwini Municipality",
      province: "KwaZulu-Natal",
      buildingPlanChannel: "DPEM online portal",
      sdpChannel: "DPEM online portal",
      publishedBuildingChecklist: "Portal-led",
      publishedSdpGuidance: "Portal-led",
      keyDifference:
        "Development Planning, Environment and Management portal provides online forms and tracking.",
      officialSource: "https://eservices.durban.gov.za/DPEM/",
      lastChecked: "2026-04-30",
    },
    {
      id: "nelson-mandela-bay-municipality",
      municipality: "Nelson Mandela Bay Municipality",
      province: "Eastern Cape",
      buildingPlanChannel: "Municipal building-plan process / e-tracking",
      sdpChannel: "Planning and building tracked online",
      publishedBuildingChecklist: "Yes",
      publishedSdpGuidance: "Not clearly separated in source used",
      keyDifference:
        "Published building-plan submission form and checklist; tracking platform includes building plans.",
      officialSource:
        "https://www.nelsonmandelabay.gov.za/DataRepository/Documents/check-list-for-building-plans-july-2024_M350O.pdf",
      lastChecked: "2026-04-30",
    },
    {
      id: "mangaung-metropolitan-municipality",
      municipality: "Mangaung Metropolitan Municipality",
      province: "Free State",
      buildingPlanChannel: "Electronic building-plan system from May 2026",
      sdpChannel: "Planning stream separate",
      publishedBuildingChecklist: "Platform announcement",
      publishedSdpGuidance: "Planning rights notices published",
      keyDifference:
        "Municipality announced transition to electronic building-plan submission system effective May 2026.",
      officialSource:
        "https://www.mangaung.co.za/2026/04/08/mangaung-metro-launches-electronic-building-plan-submission-system/",
      lastChecked: "2026-04-30",
    },
    {
      id: "buffalo-city-metropolitan-municipality",
      municipality: "Buffalo City Metropolitan Municipality",
      province: "Eastern Cape",
      buildingPlanChannel: "Manual / municipal process",
      sdpChannel: "Planning stream separate",
      publishedBuildingChecklist: "Application form exposes core fields",
      publishedSdpGuidance: "Not clearly centralised",
      keyDifference:
        "Application form identifies core property and work-description fields even where a separate itemised drawing checklist is not published in the source used.",
      officialSource:
        "https://www.buffalocity.gov.za/Onlineservices/building/BuildingPlanApplication.pdf",
      lastChecked: "2026-04-30",
    },
  ] as MunicipalityProfile[],
  drawingTypes: [
    {
      id: "general-notes-title-block",
      drawingType: "General notes / title block",
      toolboxKey: "general_notes_title_block",
      purpose: "Applies to all plan sheets in a building plan set",
      baseChecklist: [
        "Project title",
        "erf/stand and street address",
        "owner/applicant",
        "SACAP or registered professional details where required by municipality",
        "drawing title",
        "drawing number",
        "revision",
        "date",
        "scale",
        "north point where relevant",
        "clear distinction between existing and proposed work",
        "enough blank approval-stamp space where required by municipality",
        "readable line weights and text",
        "page index / bookmarks for electronic submissions where required.",
      ],
      reviewFocus:
        "Administrative completeness; whether officials can identify the property, author, revision status and what is new versus existing.",
      primarySource:
        "Cape Town Electronic Submission Requirements; Buffalo City application form",
    },
    {
      id: "site-development-plan-sdp-site-layout-plan",
      drawingType: "Site development plan (SDP) / site layout plan",
      toolboxKey: "sdp_site_layout",
      purpose:
        "Planning approval, land-use linked approvals, group housing, flats, business/industrial parks and other complex sites",
      baseChecklist: [
        "Existing bio-physical features",
        "cadastral boundaries",
        "site layout and land-use allocation",
        "position, use and extent of buildings",
        "access, roads, parking, loading and pedestrian routes",
        "communal/private/public open space",
        "fences/walls",
        "engineering services",
        "water, sewage, stormwater and refuse provisions",
        "external lighting",
        "signage",
        "landscaping",
        "phasing",
        "existing and finished levels",
        "cut/fill",
        "floor space and parking statistics",
        "relationship to neighbours and public realm",
        "massing and sometimes 3D views",
        "information table/schedule",
        "typical architectural drawings",
        "materials/finishes schedule if called for.",
      ],
      reviewFocus:
        "Land-use control, parking compliance, urban design and service coordination.",
      primarySource: "Cape Town SDP Booklet; Mangaung Land Use Scheme",
    },
    {
      id: "site-plan-building-plan-sheet",
      drawingType: "Site plan (building-plan sheet)",
      toolboxKey: "site_plan",
      purpose: "Building-plan submission for most building work",
      baseChecklist: [
        "Site boundaries and dimensions",
        "street names",
        "north point",
        "building footprint(s)",
        "boundary building lines/setbacks",
        "distances to boundaries and between structures",
        "servitudes",
        "access points/driveways",
        "site levels where relevant",
        "drainage/stormwater points",
        "municipal services connection points where shown",
        "existing and proposed structures clearly differentiated",
        "site coverage information and area schedule.",
      ],
      reviewFocus: "Siting, setbacks, coverage, access and services.",
      primarySource:
        "Johannesburg checklist snippet; Mangaung Land Use Scheme; Tshwane construction drawing checklist",
    },
    {
      id: "floor-plans",
      drawingType: "Floor plans",
      toolboxKey: "floor_plans",
      purpose: "Architectural approval and code review",
      baseChecklist: [
        "All storeys clearly named",
        "room uses and dimensions",
        "wall thicknesses",
        "door and window positions and sizes",
        "circulation",
        "stairs/ramps where applicable",
        "sanitary fittings",
        "sectional cut lines",
        "levels where relevant",
        "existing versus proposed work",
        "floor areas for schedule reconciliation",
        "compliance notes (fire, accessibility, occupancy) where applicable.",
      ],
      reviewFocus:
        "Room use, occupancy, sanitary provision, circulation and area calculations.",
      primarySource: "Mangaung Land Use Scheme; eThekwini planning notices",
    },
    {
      id: "roof-plan",
      drawingType: "Roof plan",
      toolboxKey: "roof_plan",
      purpose: "Roof form, drainage and height compliance",
      baseChecklist: [
        "Roof shape and pitch",
        "ridges/hips/valleys",
        "drainage falls",
        "gutters and downpipes where shown",
        "roof covering/material note",
        "parapets/overhangs",
        "solar equipment or plant where relevant",
        "roof levels/heights",
        "existing versus proposed distinction",
        "orientation where relevant.",
      ],
      reviewFocus: "Height, runoff, visual bulk and consistency with rest of set.",
      primarySource: "Cape Town electronic submission requirements",
    },
    {
      id: "elevations",
      drawingType: "Elevations",
      toolboxKey: "elevations",
      purpose: "External appearance, heights and neighbour impact",
      baseChecklist: [
        "All affected elevations identified",
        "natural ground line and finished ground line where relevant",
        "overall heights",
        "floor-to-floor levels",
        "openings",
        "materials and finishes notes",
        "roof form",
        "chimneys/screens/solar equipment where relevant",
        "boundary context where relevant",
        "existing versus proposed distinction.",
      ],
      reviewFocus: "Street interface, visual impact, height and plan/section consistency.",
      primarySource: "eThekwini planning notices",
    },
    {
      id: "sections",
      drawingType: "Sections",
      toolboxKey: "sections",
      purpose: "Heights, levels and construction relationships",
      baseChecklist: [
        "At least one or more meaningful cut sections",
        "floor-to-floor heights",
        "overall building height",
        "foundations or footing indication where relevant",
        "ground line(s)",
        "ceiling/roof build-up indication",
        "stair/ramp relationships where relevant",
        "window and floor levels",
        "structural zones or notes where relevant",
        "existing versus proposed distinction.",
      ],
      reviewFocus:
        "Vertical relationships and reconciliation with plans/elevations.",
      primarySource:
        "eThekwini planning notices; Buffalo City application form",
    },
    {
      id: "foundation-or-structural-detail-sheets",
      drawingType: "Foundation or structural detail sheets",
      toolboxKey: "foundation_structural_detail_sheets",
      purpose: "Structural design or geotechnical explanation by competent person",
      baseChecklist: [
        "Foundation type",
        "dimensions/depths",
        "structural notes",
        "reinforcement references by engineer where relevant",
        "bearing levels",
        "connection to walls/columns",
        "waterproofing or DPC/DPM notes where relevant",
        "competent person references and schedules where applicable.",
      ],
      reviewFocus: "Structural adequacy and competent-person coordination.",
      primarySource:
        "Johannesburg building forms; Ekurhuleni building-control forms",
    },
    {
      id: "drainage-layout-plumbing-or-service-plan",
      drawingType: "Drainage layout / plumbing or service plan",
      toolboxKey: "drainage_plumbing_service_plan",
      purpose: "Drainage or water-borne service review",
      baseChecklist: [
        "Drainage runs",
        "inspection eyes/manholes",
        "rodding access",
        "falls/gradients where required",
        "connection point to sewer or conservancy system",
        "stormwater logic where relevant",
        "gullies/sanitary fittings",
        "pipe sizes/material notes where called for",
        "coordination with site plan and floor plan.",
      ],
      reviewFocus:
        "Health, sanitation, maintainability and municipal service connection.",
      primarySource: "Drainage/water/stormwater guide; Ekurhuleni forms",
    },
    {
      id: "parking-access-and-traffic-layout-where-applicable",
      drawingType: "Parking, access and traffic layout (where applicable)",
      toolboxKey: "parking_access_traffic_layout",
      purpose: "Parking and circulation review where triggered",
      baseChecklist: [
        "Parking bay count",
        "bay types (standard/visitor/disabled/loading)",
        "aisle widths where relevant",
        "entry/exit arrangement",
        "turning/circulation logic",
        "pedestrian movement",
        "drop-off/loading",
        "relationship to buildings and public road",
        "schedule/table confirming demand and supply.",
      ],
      reviewFocus: "Safe function and land-use parking requirements.",
      primarySource: "Mangaung Land Use Scheme; Cape Town SDP Booklet",
    },
  ] as DrawingTypeEntry[],
  contentByMunicipality: [
    {
      municipality: "Cape Town",
      drawingType: "SDP / site layout",
      item: "Existing bio-physical characteristics of the property",
      whereExpected: "Basic site layout plan",
      status: "Explicit",
      sourceNote: "SDP Booklet p.14",
    },
    {
      municipality: "Cape Town",
      drawingType: "SDP / site layout",
      item: "Existing and proposed cadastral boundaries",
      whereExpected: "Basic site layout plan",
      status: "Explicit",
      sourceNote: "SDP Booklet p.14",
    },
    {
      municipality: "Cape Town",
      drawingType: "SDP / site layout",
      item: "Access, roads, parking, loading areas, entrances and pedestrian movement",
      whereExpected: "Basic site layout plan",
      status: "Explicit",
      sourceNote: "SDP Booklet p.14",
    },
    {
      municipality: "Cape Town",
      drawingType: "SDP / site layout",
      item: "Stormwater and refuse disposal proposals",
      whereExpected: "Basic site layout plan",
      status: "Explicit",
      sourceNote: "SDP Booklet p.14",
    },
    {
      municipality: "Cape Town",
      drawingType: "SDP / site layout",
      item: "Finished levels, cut and fill, retaining structures and embankments",
      whereExpected: "Basic site layout plan",
      status: "Explicit",
      sourceNote: "SDP Booklet p.14",
    },
    {
      municipality: "Cape Town",
      drawingType: "General notes / title block",
      item: "10 cm x 15 cm approval stamp space in the top left of each plan requiring a stamp",
      whereExpected: "Each relevant plan page",
      status: "Explicit",
      sourceNote: "Electronic Submission Requirements p.12",
    },
    {
      municipality: "Cape Town",
      drawingType: "General notes / title block",
      item: "Readable scalable PDF plan sheets with an indexed cover sheet and bookmarks",
      whereExpected: "Electronic submission file set",
      status: "Explicit",
      sourceNote: "Electronic Submission Requirements pp.8-14",
    },
    {
      municipality: "Tshwane",
      drawingType: "Site / layout plan for service or road submissions",
      item: "Cadastral information and erf/stand details",
      whereExpected: "Layout plan / construction drawing package",
      status: "Explicit",
      sourceNote: "Tshwane construction drawing checklist",
    },
    {
      municipality: "Tshwane",
      drawingType: "Site / layout plan for service or road submissions",
      item: "Street names and locality identification",
      whereExpected: "Layout plan / construction drawing package",
      status: "Explicit",
      sourceNote: "Tshwane construction drawing checklist",
    },
    {
      municipality: "Tshwane",
      drawingType: "Site / layout plan for service or road submissions",
      item: "Clear distinction between existing and proposed work",
      whereExpected: "Layout plan / construction drawing package",
      status: "Explicit",
      sourceNote: "Tshwane construction drawing checklist",
    },
    {
      municipality: "Mangaung",
      drawingType: "SDP / site layout",
      item: "Parking table showing parking required and parking provided",
      whereExpected: "Every SDP and/or site plan or building plan",
      status: "Explicit",
      sourceNote: "Land Use Scheme extract",
    },
    {
      municipality: "Mangaung",
      drawingType: "SDP / site layout",
      item: "Visitor parking bays",
      whereExpected: "Parking table",
      status: "Explicit",
      sourceNote: "Land Use Scheme extract",
    },
    {
      municipality: "Mangaung",
      drawingType: "SDP / site layout",
      item: "Reserved parking bays",
      whereExpected: "Parking table",
      status: "Explicit",
      sourceNote: "Land Use Scheme extract",
    },
    {
      municipality: "Mangaung",
      drawingType: "SDP / site layout",
      item: "Parking bays for persons with disabilities",
      whereExpected: "Parking table",
      status: "Explicit",
      sourceNote: "Land Use Scheme extract",
    },
    {
      municipality: "Mangaung",
      drawingType: "SDP / site layout",
      item: "Loading bays",
      whereExpected: "Parking table",
      status: "Explicit",
      sourceNote: "Land Use Scheme extract",
    },
    {
      municipality: "Mangaung",
      drawingType: "Floor plans / site plan",
      item: "Ground storey designation",
      whereExpected: "Building plan and site development plan where applicable",
      status: "Explicit",
      sourceNote: "Land Use Scheme extract",
    },
    {
      municipality: "Johannesburg",
      drawingType: "Site plan",
      item: "Full area schedule",
      whereExpected: "Plan submission",
      status: "Partially explicit",
      sourceNote: "Search result snippet to checklist PDF",
    },
    {
      municipality: "Johannesburg",
      drawingType: "All plan sheets",
      item: "All new work to be clearly indicated",
      whereExpected: "Plan submission",
      status: "Partially explicit",
      sourceNote: "Search result snippet to checklist PDF",
    },
    {
      municipality: "Johannesburg",
      drawingType: "Structural / appointment related",
      item: "Registered person appointment and structural system certificate where applicable",
      whereExpected: "Accompanying submission forms",
      status: "Explicit",
      sourceNote: "Joburg forms page",
    },
    {
      municipality: "Ekurhuleni",
      drawingType: "Submission package",
      item: "Municipality-specific building plan approval form",
      whereExpected: "Application package",
      status: "Explicit",
      sourceNote: "Building Control Forms page",
    },
    {
      municipality: "Ekurhuleni",
      drawingType: "Submission package",
      item: "Section 7(6) form where applicable",
      whereExpected: "Application package",
      status: "Explicit",
      sourceNote: "Building Control Forms page",
    },
    {
      municipality: "Ekurhuleni",
      drawingType: "Service / completion related",
      item: "Plumbing compliance certificate/form where applicable",
      whereExpected: "Compliance / completion stage",
      status: "Explicit",
      sourceNote: "Building Control Forms page",
    },
    {
      municipality: "eThekwini",
      drawingType: "Architectural set",
      item: "Floor layouts/plans",
      whereExpected: "Municipal planning/building review set",
      status: "Partially explicit",
      sourceNote: "Public notice/search result phrasing",
    },
    {
      municipality: "eThekwini",
      drawingType: "Architectural set",
      item: "Elevations",
      whereExpected: "Municipal planning/building review set",
      status: "Partially explicit",
      sourceNote: "Public notice/search result phrasing",
    },
    {
      municipality: "eThekwini",
      drawingType: "Architectural set",
      item: "Sections",
      whereExpected: "Municipal planning/building review set",
      status: "Partially explicit",
      sourceNote: "Public notice/search result phrasing",
    },
    {
      municipality: "Nelson Mandela Bay",
      drawingType: "Submission package / core data",
      item: "Municipal checklist and submission form",
      whereExpected: "Application package",
      status: "Explicit",
      sourceNote: "Checklist PDF",
    },
    {
      municipality: "Buffalo City",
      drawingType: "General notes / title block / form-linked data",
      item: "Stand number, township and street address",
      whereExpected:
        "Application form and mirrored project-identification data on drawing set",
      status: "Explicit on form",
      sourceNote: "Building Plan Application form",
    },
    {
      municipality: "Buffalo City",
      drawingType: "General notes / title block / form-linked data",
      item: "Land size / area of site",
      whereExpected: "Application form and related area schedules",
      status: "Explicit on form",
      sourceNote: "Building Plan Application form",
    },
    {
      municipality: "Buffalo City",
      drawingType: "General notes / title block / form-linked data",
      item: "Type of work and building type",
      whereExpected: "Application form and drawing-set description",
      status: "Explicit on form",
      sourceNote: "Building Plan Application form",
    },
    {
      municipality: "Buffalo City",
      drawingType: "General notes / title block / form-linked data",
      item: "Building area and estimated cost",
      whereExpected: "Application form and related schedules",
      status: "Explicit on form",
      sourceNote: "Building Plan Application form",
    },
  ] as MunicipalitySpecificItem[],
};

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

export function normaliseMunicipalityName(name = ""): string {
  return String(name)
    .replace(/^City of\s+/i, "")
    .replace(/\s+Municipality$/i, "")
    .replace(/\s+Metropolitan Municipality$/i, "")
    .trim();
}

export function getMunicipalityProfile(
  municipality: string | null | undefined,
): MunicipalityProfile | null {
  const target = normaliseMunicipalityName(municipality ?? "").toLowerCase();
  return (
    SA_COUNCIL_DRAWING_COMPLIANCE_DATA.municipalities.find(
      (m) =>
        normaliseMunicipalityName(m.municipality).toLowerCase() === target ||
        m.municipality.toLowerCase() === String(municipality ?? "").toLowerCase(),
    ) ?? null
  );
}

export function getDrawingTypeByKey(key: string): DrawingTypeEntry | null {
  return (
    SA_COUNCIL_DRAWING_COMPLIANCE_DATA.drawingTypes.find(
      (d) => d.toolboxKey === key || d.id === key || d.drawingType === key,
    ) ?? null
  );
}

export function getMunicipalitySpecificItems(
  municipality: string | null | undefined,
): MunicipalitySpecificItem[] {
  const target = normaliseMunicipalityName(municipality ?? "").toLowerCase();
  return SA_COUNCIL_DRAWING_COMPLIANCE_DATA.contentByMunicipality.filter(
    (item) => normaliseMunicipalityName(item.municipality).toLowerCase() === target,
  );
}
