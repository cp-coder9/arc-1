// ---------------------------------------------------------------------------
// mockCPD.ts — Mock CPD data for the Architex demo site
// Realistic content for SA built-environment professionals
// ---------------------------------------------------------------------------

export interface MockCPDArticle {
  id: string;
  title: string;
  author: string;
  category: string;
  bodyPreview: string;
  readTimeMinutes: number;
  publishedAt: string;
  cpdCredits: number;
  sacapCategory: string;
}

export interface MockCPDAssessment {
  id: string;
  articleId: string;
  title: string;
  questions: { id: string; question: string; options: string[]; correctAnswer: number }[];
  passMark: number;
}

export interface MockCPDLearningModule {
  id: string;
  title: string;
  description: string;
  category: string;
  durationHours: number;
  cpdCredits: number;
  modules: { title: string; contentPreview: string }[];
}

export interface MockCPDCertificate {
  id: string;
  userId: string;
  userName: string;
  type: 'article' | 'assessment' | 'learning_module';
  referenceId: string;
  title: string;
  credits: number;
  issuedAt: string;
  expiryAt: string;
  status: 'valid' | 'expiring_soon' | 'expired';
  certificateRef: string;
}

// ---------------------------------------------------------------------------
// MOCK CPD ARTICLES  (6 articles)
// ---------------------------------------------------------------------------

export const mockCPDArticles: MockCPDArticle[] = [
  {
    id: 'cpd-art-001',
    title: 'SANS 10400 Update: Understanding the Latest Amendments to Part R (Stormwater Disposal)',
    author: 'Dr. Thandi Nkosi',
    category: 'Technical',
    bodyPreview:
      'The latest amendments to SANS 10400 Part R introduce stricter stormwater management requirements for all new developments in South Africa. Architects must now demonstrate that post-development runoff does not exceed pre-development levels for a 1-in-50-year storm event. This article breaks down the key changes, compliance deadlines, and design strategies including attenuation tanks, permeable paving, and green roofs.',
    readTimeMinutes: 12,
    publishedAt: '2026-05-15T08:00:00Z',
    cpdCredits: 1,
    sacapCategory: 'Category 1',
  },
  {
    id: 'cpd-art-002',
    title: 'SACAP Code of Ethics: Navigating Boundary Conflicts and Professional Conduct',
    author: 'Mpho Ramalapa Pr.Arch',
    category: 'Ethics',
    bodyPreview:
      'Boundary conflicts remain one of the most common ethical dilemmas facing South African architects. This article examines three real SACAP disciplinary cases — involving fee undercutting, dual professional roles, and unauthorised use of another firm\'s designs — and draws out practical lessons for ethical practice under the 2023 SACAP Code of Professional Conduct. Special attention is given to when an architect may act as both designer and contractor.',
    readTimeMinutes: 10,
    publishedAt: '2026-04-22T09:00:00Z',
    cpdCredits: 1,
    sacapCategory: 'Category 1',
  },
  {
    id: 'cpd-art-003',
    title: 'NHBRC Enrolment: Common Pitfalls and Compliance Checklists for Housing Projects',
    author: 'Lerato Moloi',
    category: 'Professional Practice',
    bodyPreview:
      'Non-compliance with NHBRC enrolment requirements is a leading cause of project delays and penalty fees in residential developments. This article walks through the enrolment process step by step — from Form A submission to final inspection sign-offs — highlighting the top five mistakes architects make when certifying home-building work. A downloadable compliance checklist is included for every stage of the project lifecycle.',
    readTimeMinutes: 8,
    publishedAt: '2026-03-10T10:30:00Z',
    cpdCredits: 0.5,
    sacapCategory: 'Category 1',
  },
  {
    id: 'cpd-art-004',
    title: 'Passive Fire Safety Design: Compartmentation, Egress, and Materials Selection',
    author: 'Prof. James Bennet',
    category: 'Health & Safety',
    bodyPreview:
      'Following recent high-rise fires in Johannesburg and Cape Town, passive fire protection has come under renewed scrutiny. This article covers the principles of fire compartmentation, minimum FRR (Fire Resistance Rating) requirements per SANS 10400 Part T, and correct specification of intumescent coatings, fire-rated doors, and cavity barriers. Case studies of both compliant and non-compliant buildings illustrate the consequences of poor design choices.',
    readTimeMinutes: 15,
    publishedAt: '2026-02-18T07:45:00Z',
    cpdCredits: 2,
    sacapCategory: 'Category 1',
  },
  {
    id: 'cpd-art-005',
    title: 'Green Star SA v2: Practical Strategies for Achieving a 5-Star Rating on a Tight Budget',
    author: 'Zanele Khumalo Pr.Arch, GBCI Associate',
    category: 'Sustainability',
    bodyPreview:
      'Many clients perceive Green Star certification as prohibitively expensive, but strategic early-design decisions can achieve a 5-Star rating with a minimal cost premium. This article compares the cost-benefit of high-impact credits — energy metering, indigenous landscaping, daylight harvesting, and waste diversion — against lower-yield options. It includes a budget allocation framework that has been tested on three recently certified SA office developments.',
    readTimeMinutes: 14,
    publishedAt: '2026-06-01T06:00:00Z',
    cpdCredits: 1.5,
    sacapCategory: 'Category 1',
  },
  {
    id: 'cpd-art-006',
    title: 'Professional Indemnity Insurance: Coverage Gaps Every Architect Should Know',
    author: 'Pieter van der Merwe (Legal Counsel, Pr.Arch)',
    category: 'Professional Practice',
    bodyPreview:
      'Standard professional indemnity policies often contain exclusions that catch architects off guard — particularly around latent defects, cross-liability between joint ventures, and cyber-risk arising from BIM data exchanges. This article reviews the PI minimum cover required by SACAP (currently R5 million per claim), highlights three common coverage gaps identified in recent claims data, and provides a checklist for reviewing your policy renewal.',
    readTimeMinutes: 11,
    publishedAt: '2026-05-28T11:00:00Z',
    cpdCredits: 1,
    sacapCategory: 'Category 1',
  },
];

// ---------------------------------------------------------------------------
// MOCK CPD ASSESSMENTS  (4 assessments, each linked to an article by articleId)
// ---------------------------------------------------------------------------

export const mockCPDAssessments: MockCPDAssessment[] = [
  {
    id: 'cpd-ass-001',
    articleId: 'cpd-art-001',
    title: 'SANS 10400 Part R Amendments — Knowledge Check',
    questions: [
      {
        id: 'q-001-1',
        question:
          'Under the amended SANS 10400 Part R, what return-period storm event must post-development runoff not exceed?',
        options: [
          '1-in-10-year',
          '1-in-20-year',
          '1-in-50-year',
          '1-in-100-year',
        ],
        correctAnswer: 2,
      },
      {
        id: 'q-001-2',
        question:
          'Which of the following is NOT listed as an acceptable stormwater management strategy in the article?',
        options: [
          'Attenuation tanks',
          'Permeable paving',
          'Underground injection wells',
          'Green roofs',
        ],
        correctAnswer: 2,
      },
      {
        id: 'q-001-3',
        question:
          'What is the primary purpose of the amended Part R requirements?',
        options: [
          'To reduce municipal stormwater infrastructure costs',
          'To ensure post-development runoff does not exceed pre-development levels',
          'To mandate rainwater harvesting for all new buildings',
          'To eliminate the need for stormwater detention on small sites',
        ],
        correctAnswer: 1,
      },
    ],
    passMark: 67,
  },
  {
    id: 'cpd-ass-002',
    articleId: 'cpd-art-002',
    title: 'SACAP Code of Ethics — Boundary Conflicts Assessment',
    questions: [
      {
        id: 'q-002-1',
        question:
          'According to the article, which scenario is a common ethical boundary conflict?',
        options: [
          'An architect recommending a preferred structural engineer',
          'An architect acting as both designer and contractor',
          'An architect declining a project due to budget constraints',
          'An architect referring a client to another firm',
        ],
        correctAnswer: 1,
      },
      {
        id: 'q-002-2',
        question:
          'The 2023 SACAP Code of Professional Conduct prohibits fee undercutting primarily because it:',
        options: [
          'Reduces the profitability of large firms',
          'Compromises the quality of professional services and devalues the profession',
          'Violates competition law in South Africa',
          'Is only allowed for emerging architects',
        ],
        correctAnswer: 1,
      },
      {
        id: 'q-002-3',
        question:
          'What is the recommended first step when an architect identifies a potential boundary conflict?',
        options: [
          'Resign from the project immediately',
          'Proceed and document the decision rationale',
          'Disclose the conflict in writing to the client and seek informed consent',
          'Refer the matter to the SACAP disciplinary committee',
        ],
        correctAnswer: 2,
      },
    ],
    passMark: 67,
  },
  {
    id: 'cpd-ass-003',
    articleId: 'cpd-art-004',
    title: 'Passive Fire Safety — Compartmentation & Egress',
    questions: [
      {
        id: 'q-004-1',
        question:
          'SANS 10400 Part T requires fire compartments to have a minimum Fire Resistance Rating (FRR) of:',
        options: [
          '15 minutes',
          '30 minutes',
          '60 minutes',
          '120 minutes',
        ],
        correctAnswer: 2,
      },
      {
        id: 'q-004-2',
        question:
          'Which product is typically used to protect steel structural members from fire?',
        options: [
          'Epoxy paint',
          'Intumescent coating',
          'Zinc-rich primer',
          'Polyurethane sealant',
        ],
        correctAnswer: 1,
      },
      {
        id: 'q-004-3',
        question:
          'What is the maximum travel distance to an exit in an unsprinklered office building under SANS 10400?',
        options: ['15 metres', '30 metres', '45 metres', '60 metres'],
        correctAnswer: 1,
      },
      {
        id: 'q-004-4',
        question:
          'Cavity barriers must be installed in concealed spaces to prevent:',
        options: [
          'Thermal bridging',
          'Moisture ingress',
          'Flame spread through hidden voids',
          'Acoustic transmission',
        ],
        correctAnswer: 2,
      },
    ],
    passMark: 75,
  },
  {
    id: 'cpd-ass-004',
    articleId: 'cpd-art-005',
    title: 'Green Star SA v2 — Cost-Effective Certification',
    questions: [
      {
        id: 'q-005-1',
        question:
          'Which credit is identified as high-impact with relatively low cost under Green Star SA v2?',
        options: [
          'On-site renewable energy generation',
          'Energy metering and sub-metering',
          'Geothermal HVAC system',
          'Triple-glazed curtain wall',
        ],
        correctAnswer: 1,
      },
      {
        id: 'q-005-2',
        question:
          'Indigenous landscaping contributes to which Green Star category?',
        options: ['Energy', 'Water', 'Ecology', 'Indoor Environment Quality'],
        correctAnswer: 2,
      },
      {
        id: 'q-005-3',
        question:
          'What is the minimum star rating typically achievable on a "tight budget" according to the article?',
        options: ['3-Star', '4-Star', '5-Star', '6-Star'],
        correctAnswer: 2,
      },
    ],
    passMark: 67,
  },
];

// ---------------------------------------------------------------------------
// MOCK CPD LEARNING MODULES  (3 multi-part courses)
// ---------------------------------------------------------------------------

export const mockCPDLearningModules: MockCPDLearningModule[] = [
  {
    id: 'cpd-mod-001',
    title: 'SANS 10400 Compliance Masterclass',
    description:
      'A comprehensive three-part course covering the most frequently cited sections of SANS 10400 that trip up practising architects. Part A focuses on structural safety and geotechnical considerations (Parts A, B, F). Part B covers fire protection and means of egress (Parts T, TT, W). Part C addresses drainage, stormwater, and water supply (Parts P, R, Q). Each part includes worked examples from recent SACAP inspection reports.',
    category: 'Technical',
    durationHours: 6,
    cpdCredits: 6,
    modules: [
      {
        title: 'Part A: Structural Safety & Geotechnical Considerations (A, B, F)',
        contentPreview:
          'Site classification per SANS 10400 Part A: identifying A, B, C, D, E, F, G, H sites. NHBRC minimum requirements for foundation design on dolomitic and expansive soils. Interpretation of geotechnical reports for the non-specialist. Worked example: foundation design on a Class C (expansive clay) site with a single-storey residential dwelling.',
      },
      {
        title: 'Part B: Fire Protection & Means of Egress (T, TT, W)',
        contentPreview:
          'Compartmentation rules for different occupancy classes. Stair width, travel distance, and dead-end length calculations per SANS 10400 Part T. Fire-rated glazing vs sprinkler trade-offs. Worked example: egress design for a 3-storey office building with an atrium and a basement parking level.',
      },
      {
        title: 'Part C: Drainage, Stormwater & Water Supply (P, R, Q)',
        contentPreview:
          'Stormwater detention vs retention design under the amended Part R. Sewer connection gradients and venting requirements. Rainwater harvesting integration — sizing tanks, first-flush diverters, and backflow prevention. Worked example: combined stormwater and rainwater system for a mixed-use development in Gauteng.',
      },
    ],
  },
  {
    id: 'cpd-mod-002',
    title: 'Green Building Design & Energy Efficiency for SA Architects',
    description:
      'A practical five-part course designed to equip architects with the knowledge to integrate energy-efficient and sustainable design strategies into South African projects without relying on expensive certification schemes. Topics include passive solar design, HVAC load reduction, water-efficient fittings and fixtures, embodied carbon assessment, and the SANS 10400 Part XA energy usage compliance pathway. Each module includes climate-region-specific guidance for the six SA climatic zones.',
    category: 'Sustainability',
    durationHours: 8,
    cpdCredits: 8,
    modules: [
      {
        title: 'Module 1: Passive Solar Design Principles',
        contentPreview:
          'Building orientation, shading calculations, thermal mass placement, and window-to-wall ratios optimised for SA climatic zones. The difference between north-facing passive gain in Johannesburg (highveld) vs Cape Town (mediterranean). Tools: solar path diagrams and shading mask overlays.',
      },
      {
        title: 'Module 2: HVAC Load Reduction Strategies',
        contentPreview:
          'Insulation values (R-values) per SANS 10400 Part XA for roofs, walls, and floors. Glazing selection: SHGC and U-value trade-offs. Natural ventilation design — stack effect, cross-ventilation, and night purging. Case study: an office building in Durban that eliminated mechanical cooling entirely.',
      },
      {
        title: 'Module 3: Water Efficiency & Fittings',
        contentPreview:
          'Water consumption targets per Green Star SA and Net Zero Water frameworks. Selecting WELS-rated fittings, dual-flush toilets, and low-flow fixtures. Greywater system design considerations for residential and commercial projects. Rainwater harvesting payback periods across different SA rainfall regions.',
      },
      {
        title: 'Module 4: Embodied Carbon & Material Selection',
        contentPreview:
          'Introduction to whole-life carbon assessment for buildings. Low-carbon concrete alternatives (fly-ash, slag), locally sourced materials, and recycled-content specifications. Comparing the carbon footprint of steel vs timber vs concrete structural systems in the SA context. EPD (Environmental Product Declaration) literacy.',
      },
      {
        title: 'Module 5: SANS 10400 Part XA Compliance Pathway',
        contentPreview:
          'Navigating the two compliance routes: deemed-to-satisfy (prescriptive) vs rational design (performance-based). Energy modelling software requirements. Typical compliance documentation checklists. Common reasons for plan submission rejections under Part XA and how to fix them.',
      },
    ],
  },
  {
    id: 'cpd-mod-003',
    title: 'Professional Practice & Risk Management for Architects',
    description:
      'This four-part module covers the essential non-technical competencies every practising architect needs: contract administration, dispute resolution, professional indemnity risk management, and SACAP CPD compliance. Developed from material presented at the 2025 SAIA Convention and aligned with the SACAP CPD framework for Category 1 and Category 2 activities.',
    category: 'Professional Practice',
    durationHours: 5,
    cpdCredits: 5,
    modules: [
      {
        title: 'Module 1: Contract Administration — JBCC & NEC4',
        contentPreview:
          'Key differences between JBCC Principal Building Agreement 6.2 and NEC4 Engineering and Construction Contract. Managing variation orders, extension of time claims, and payment certificates. Common administration pitfalls that lead to disputes. Templates for site instruction and project meeting minutes.',
      },
      {
        title: 'Module 2: Dispute Resolution & Adjudication',
        contentPreview:
          'The dispute resolution ladder: negotiation, mediation, adjudication, and arbitration. The role of the adjudicator under the JBCC and NEC4. Preparing a dispute referral — what evidence is needed. Case study: a R2 million payment dispute resolved through adjudication without arbitration.',
      },
      {
        title: 'Module 3: PI Insurance & Risk Transfer',
        contentPreview:
          'Understanding the SACAP minimum PI cover requirements (R5 million). Additional insured endorsements, run-off cover, and policy exclusions to watch. Risk-transfer mechanisms: collateral warranties, novation agreements, and waivers of subrogation. How to respond when a claim is threatened.',
      },
      {
        title: 'Module 4: SACAP CPD Compliance & Record-Keeping',
        contentPreview:
          'Breaking down the SACAP CPD requirements per year: 10 points minimum (Category 1 + Category 2). How to log CPD activities, what counts as verifiable evidence, and audit-readiness. Common reasons practitioners fail CPD audits and how to avoid them. Template CPD activity log.',
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// MOCK CPD CERTIFICATES  (5 certificates — some valid, one expiring_soon, one expired)
// ---------------------------------------------------------------------------

const today = new Date();
const twoYearsAgo = new Date(today.getFullYear() - 2, 0, 15); // 2024-01-15
const oneYearAgo = new Date(today.getFullYear() - 1, 5, 10); // 2025-06-10
const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 6, 1);
const threeMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 3, 15);
const oneMonthAgo = new Date(today.getFullYear(), today.getMonth() - 1, 20);

const validExpiry = new Date(today.getFullYear() + 2, 5, 15); // far future
const expiringSoonExpiry = new Date(today.getFullYear(), today.getMonth() + 1, 1); // ~1 month away
const expiredExpiry = new Date(today.getFullYear() - 1, 10, 1); // already past

function iso(d: Date): string {
  return d.toISOString();
}

export const mockCPDCertificates: MockCPDCertificate[] = [
  {
    id: 'cpd-cert-001',
    userId: 'user-arch-001',
    userName: 'John Mokoena',
    type: 'article',
    referenceId: 'cpd-art-001',
    title: 'SANS 10400 Update: Understanding the Latest Amendments to Part R (Stormwater Disposal)',
    credits: 1,
    issuedAt: iso(sixMonthsAgo),
    expiryAt: iso(validExpiry),
    status: 'valid',
    certificateRef: 'CERT-SANS10400-PARTR-001',
  },
  {
    id: 'cpd-cert-002',
    userId: 'user-arch-001',
    userName: 'John Mokoena',
    type: 'assessment',
    referenceId: 'cpd-ass-002',
    title: 'SACAP Code of Ethics — Boundary Conflicts Assessment',
    credits: 1,
    issuedAt: iso(threeMonthsAgo),
    expiryAt: iso(validExpiry),
    status: 'valid',
    certificateRef: 'CERT-ETHICS-BC-002',
  },
  {
    id: 'cpd-cert-003',
    userId: 'user-arch-001',
    userName: 'John Mokoena',
    type: 'learning_module',
    referenceId: 'cpd-mod-001',
    title: 'SANS 10400 Compliance Masterclass',
    credits: 6,
    issuedAt: iso(oneYearAgo),
    expiryAt: iso(expiringSoonExpiry),
    status: 'expiring_soon',
    certificateRef: 'CERT-SANS10400-MC-003',
  },
  {
    id: 'cpd-cert-004',
    userId: 'user-arch-002',
    userName: 'Sarah Botha',
    type: 'article',
    referenceId: 'cpd-art-004',
    title: 'Passive Fire Safety Design: Compartmentation, Egress, and Materials Selection',
    credits: 2,
    issuedAt: iso(twoYearsAgo),
    expiryAt: iso(expiredExpiry),
    status: 'expired',
    certificateRef: 'CERT-FIRESAFE-004',
  },
  {
    id: 'cpd-cert-005',
    userId: 'user-arch-001',
    userName: 'John Mokoena',
    type: 'assessment',
    referenceId: 'cpd-ass-001',
    title: 'SANS 10400 Part R Amendments — Knowledge Check',
    credits: 1,
    issuedAt: iso(oneMonthAgo),
    expiryAt: iso(validExpiry),
    status: 'valid',
    certificateRef: 'CERT-PARTR-KC-005',
  },
];
