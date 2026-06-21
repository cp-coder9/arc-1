export interface TermsTemplate {
  id: string;
  name: string;
  professionTags: string[];
  version: string;
  clauses: string[];
  editable: boolean;
  legalReviewRequired: boolean;
}

export class TermsLibraryService {
  private templates = new Map<string, TermsTemplate>();

  constructor() {
    this.seed([
      {
        id: 'standard-sa-professional', name: 'Standard South African professional services terms',
        professionTags: ['all'], version: '0.2.0', editable: true, legalReviewRequired: true,
        clauses: [
          'The professional services are limited to the scope, stages and deliverables recorded in this proposal.',
          'The client remains responsible for providing accurate instructions, site access, ownership information and timeous decisions.',
          'Fees exclude statutory/municipal charges, specialist investigations and reimbursable expenses unless expressly included.',
          'This template is not legal advice and must be approved by the professional before issue.',
        ],
      },
      {
        id: 'architectural-services', name: 'Architectural services terms',
        professionTags: ['architect'], version: '0.2.0', editable: true, legalReviewRequired: true,
        clauses: [
          'Architectural services are provided with reference to the agreed SACAP category, IDoW stages and selected deliverables.',
          'Municipal approval is not guaranteed; the architect will prepare and coordinate submissions as scoped.',
          'Copyright in drawings and documents remains subject to the appointment terms and applicable law.',
        ],
      },
      {
        id: 'engineering-services', name: 'Engineering services terms',
        professionTags: ['engineer'], version: '0.2.0', editable: true, legalReviewRequired: true,
        clauses: [
          'Engineering services are discipline-specific and exclude other engineering disciplines unless expressly stated.',
          'Construction monitoring is periodic unless full-time resident engineering services are separately appointed.',
          'Design responsibility is limited to the engineer\'s discipline and signed/stamped deliverables.',
        ],
      },
      {
        id: 'quantity-surveying', name: 'Quantity surveying terms',
        professionTags: ['quantitySurveyor'], version: '0.2.0', editable: true, legalReviewRequired: true,
        clauses: [
          'Cost estimates are opinions based on available information and are not contractor prices unless based on accepted tenders.',
          'Variations, escalation, currency movement and scope changes may affect the final account.',
          'Payment valuations depend on measured progress and contract conditions.',
        ],
      },
      {
        id: 'town-planning', name: 'Town planning terms',
        professionTags: ['townPlanner'], version: '0.2.0', editable: true, legalReviewRequired: true,
        clauses: [
          'Planning services are subject to municipal by-laws, SPLUMA context, land-use scheme requirements and authority timelines.',
          'Approval outcomes are not guaranteed.',
          'Public participation, specialist reports and appeal processes are excluded unless listed.',
        ],
      },
      {
        id: 'surveying-geomatics', name: 'Surveying / geomatics terms',
        professionTags: ['landSurveyor'], version: '0.2.0', editable: true, legalReviewRequired: true,
        clauses: [
          'Survey deliverables depend on site access, beacon availability, records and required accuracy class.',
          'Deeds office, SG office or municipal processing timelines are outside the surveyor\'s control.',
          'Additional field visits are chargeable unless included.',
        ],
      },
      {
        id: 'landscape-architecture', name: 'Landscape architecture terms',
        professionTags: ['landscapeArchitect'], version: '0.2.0', editable: true, legalReviewRequired: true,
        clauses: [
          'Planting, irrigation and landscape construction outcomes depend on maintenance, seasonality and site conditions.',
          'Specialist environmental approvals are excluded unless listed.',
          'Substitutions require professional review.',
        ],
      },
      {
        id: 'interior-design', name: 'Interior design terms',
        professionTags: ['interiorDesigner'], version: '0.2.0', editable: true, legalReviewRequired: true,
        clauses: [
          'Furniture, fittings, equipment and procurement prices are subject to supplier validity periods and availability.',
          'Structural, fire, electrical and statutory compliance services are excluded unless separately appointed.',
          'Design revisions beyond the agreed rounds are additional services.',
        ],
      },
      {
        id: 'project-management', name: 'Construction project management terms',
        professionTags: ['constructionProjectManager'], version: '0.2.0', editable: true, legalReviewRequired: true,
        clauses: [
          'Project management services coordinate programme, cost, risk and communication but do not replace discipline professional appointments.',
          'Principal-agent authority depends on the contract and written appointment.',
          'Contractor performance and statutory approvals are not guaranteed by the CPM.',
        ],
      },
      {
        id: 'specialist-fire', name: 'Fire engineering specialist terms',
        professionTags: ['fireEngineer'], version: '0.2.0', editable: true, legalReviewRequired: true,
        clauses: [
          'Fire engineering advice is based on the stated occupancy, design assumptions and available drawings.',
          'Authority acceptance and fire department comments may require revisions.',
          'Performance-based designs require explicit scope and approval pathway.',
        ],
      },
    ]);
  }

  seed(templates: TermsTemplate[]): void {
    templates.forEach((t) => this.templates.set(t.id, t));
  }

  get(ids: string[], custom: string[] = []): string[] {
    return [...ids.flatMap((id) => this.templates.get(id)?.clauses ?? []), ...custom];
  }

  list(): TermsTemplate[] {
    return [...this.templates.values()];
  }
}
