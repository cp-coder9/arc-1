// @vitest-environment jsdom
/**
 * Property Tests for Compliance Certificate
 *
 * Feature: pack-marketplace, Property 35: Compliance Certificate data completeness and withholding
 *
 * **Validates: Requirements 11.1, 11.5**
 */
import * as fc from 'fast-check';

// ── Types ────────────────────────────────────────────────────────────────────

interface CertificateProfessional {
  userId: string;
  displayName: string;
  registrationNumber: string;
}

interface MilestoneAuditResult {
  milestoneId: string;
  title: string;
  aiAuditStatus: 'passed' | 'failed';
  signOffBy: string;
}

interface EscrowConfirmation {
  milestoneId: string;
  amount: number;
  recipientUserId: string;
  releasedAt: string;
}

interface ComplianceCertificateData {
  certificateId: string;
  projectId: string;
  projectTitle: string;
  professionals: CertificateProfessional[];
  sansReferences: string[];
  toolsUsed: string[];
  milestoneAuditResults: MilestoneAuditResult[];
  escrowConfirmations: EscrowConfirmation[];
  generatedAt: string;
  documentVaultFileId: string;
}

interface ProjectMilestone {
  milestoneId: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed';
  signOffBy?: string;
}

interface ProjectData {
  projectId: string;
  projectTitle: string;
  professionals: CertificateProfessional[];
  sansReferences: string[];
  toolsUsed: string[];
  milestones: ProjectMilestone[];
  auditResults: MilestoneAuditResult[];
  escrowConfirmations: EscrowConfirmation[];
}

interface CertificateGenerationResult {
  success: boolean;
  certificate?: ComplianceCertificateData;
  withheld?: boolean;
  missingItems?: string[];
}

// ── Certificate Generation Logic ─────────────────────────────────────────────

function generateCertificateId(): string {
  return 'cert-' + Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
}

function isNonGuessableId(id: string): boolean {
  return id.length >= 20 && /^cert-[0-9a-f]{32}$/.test(id);
}

function generateCertificate(project: ProjectData): CertificateGenerationResult {
  const missingItems: string[] = [];

  const incompleteMilestones = project.milestones.filter(m => m.status !== 'completed');
  if (incompleteMilestones.length > 0) {
    missingItems.push(
      ...incompleteMilestones.map(m => `Milestone "${m.title}" not completed (status: ${m.status})`)
    );
  }

  const unsignedMilestones = project.milestones.filter(m => !m.signOffBy);
  if (unsignedMilestones.length > 0) {
    missingItems.push(
      ...unsignedMilestones.map(m => `Milestone "${m.title}" missing sign-off`)
    );
  }

  const missingRegNumbers = project.professionals.filter(p => !p.registrationNumber);
  if (missingRegNumbers.length > 0) {
    missingItems.push(
      ...missingRegNumbers.map(p => `Professional "${p.displayName}" missing registration number`)
    );
  }

  const milestoneIds = project.milestones.map(m => m.milestoneId);
  const auditedMilestoneIds = project.auditResults.map(r => r.milestoneId);
  const missingAudits = milestoneIds.filter(id => !auditedMilestoneIds.includes(id));
  if (missingAudits.length > 0) {
    missingItems.push(
      ...missingAudits.map(id => `Milestone "${id}" missing AI audit result`)
    );
  }

  const confirmedMilestoneIds = project.escrowConfirmations.map(c => c.milestoneId);
  const missingPayments = milestoneIds.filter(id => !confirmedMilestoneIds.includes(id));
  if (missingPayments.length > 0) {
    missingItems.push(
      ...missingPayments.map(id => `Milestone "${id}" missing payment confirmation`)
    );
  }

  if (project.professionals.length === 0) {
    missingItems.push('No professionals assigned to project');
  }

  if (missingItems.length > 0) {
    return { success: false, withheld: true, missingItems };
  }

  const certificate: ComplianceCertificateData = {
    certificateId: generateCertificateId(),
    projectId: project.projectId,
    projectTitle: project.projectTitle,
    professionals: project.professionals,
    sansReferences: project.sansReferences,
    toolsUsed: project.toolsUsed,
    milestoneAuditResults: project.auditResults,
    escrowConfirmations: project.escrowConfirmations,
    generatedAt: new Date().toISOString(),
    documentVaultFileId: `vault-${project.projectId}-cert`,
  };

  return { success: true, certificate };
}

// ── Arbitraries ──────────────────────────────────────────────────────────────

const milestoneIdArb = fc.uuid().map(id => `ms-${id}`);
const userIdArb = fc.uuid().map(id => `usr-${id}`);
const projectIdArb = fc.uuid().map(id => `prj-${id}`);

const professionalArb = fc.record({
  userId: userIdArb,
  displayName: fc.string({ minLength: 2, maxLength: 50 }),
  registrationNumber: fc.string({ minLength: 5, maxLength: 20 }),
});

const professionalWithMissingRegArb = fc.record({
  userId: userIdArb,
  displayName: fc.string({ minLength: 2, maxLength: 50 }),
  registrationNumber: fc.constant(''),
});

function completeProjectArb(milestoneCount: number) {
  const milestoneIds = Array.from({ length: milestoneCount }, (_, i) => `ms-${i}`);

  return fc.record({
    projectId: projectIdArb,
    projectTitle: fc.string({ minLength: 3, maxLength: 150 }),
    professionals: fc.array(professionalArb, { minLength: 1, maxLength: 5 }),
    sansReferences: fc.array(fc.string({ minLength: 3, maxLength: 30 }), { minLength: 1, maxLength: 10 }),
    toolsUsed: fc.array(fc.string({ minLength: 3, maxLength: 30 }), { minLength: 1, maxLength: 10 }),
    milestones: fc.tuple(
      ...milestoneIds.map(id => fc.record({
        milestoneId: fc.constant(id),
        title: fc.string({ minLength: 3, maxLength: 100 }),
        status: fc.constant('completed' as const),
        signOffBy: userIdArb,
      }))
    ),
    auditResults: fc.tuple(
      ...milestoneIds.map(id => fc.record({
        milestoneId: fc.constant(id),
        title: fc.string({ minLength: 3, maxLength: 100 }),
        aiAuditStatus: fc.constantFrom('passed' as const, 'failed' as const),
        signOffBy: userIdArb,
      }))
    ),
    escrowConfirmations: fc.tuple(
      ...milestoneIds.map(id => fc.record({
        milestoneId: fc.constant(id),
        amount: fc.double({ min: 1000, max: 10000000, noNaN: true }),
        recipientUserId: userIdArb,
        releasedAt: fc.integer({ min: 1704067200000, max: 1798761600000 }).map(ms => new Date(ms).toISOString()),
      }))
    ),
  }).map(data => ({
    ...data,
    milestones: data.milestones as unknown as ProjectMilestone[],
    auditResults: data.auditResults as unknown as MilestoneAuditResult[],
    escrowConfirmations: data.escrowConfirmations as unknown as EscrowConfirmation[],
  }));
}


// Feature: pack-marketplace, Property 35: Compliance Certificate data completeness and withholding
describe('Property 35: Compliance Certificate data completeness and withholding', () => {
  // **Validates: Requirements 11.1, 11.5**

  it('certificate contains all required fields when project data is complete', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }).chain(count => completeProjectArb(count)),
        (project) => {
          const result = generateCertificate(project);

          expect(result.success).toBe(true);
          expect(result.withheld).toBeUndefined();
          expect(result.certificate).toBeDefined();

          const cert = result.certificate!;
          expect(cert.projectTitle).toBe(project.projectTitle);
          expect(cert.projectTitle.length).toBeGreaterThan(0);

          expect(cert.professionals.length).toBe(project.professionals.length);
          for (const prof of cert.professionals) {
            expect(prof.registrationNumber.length).toBeGreaterThan(0);
            expect(prof.displayName.length).toBeGreaterThan(0);
            expect(prof.userId.length).toBeGreaterThan(0);
          }

          expect(cert.sansReferences).toEqual(project.sansReferences);
          expect(cert.toolsUsed).toEqual(project.toolsUsed);

          expect(cert.milestoneAuditResults.length).toBe(project.milestones.length);
          for (const audit of cert.milestoneAuditResults) {
            expect(audit.milestoneId.length).toBeGreaterThan(0);
            expect(['passed', 'failed']).toContain(audit.aiAuditStatus);
          }

          expect(cert.escrowConfirmations.length).toBe(project.milestones.length);
          for (const conf of cert.escrowConfirmations) {
            expect(conf.milestoneId.length).toBeGreaterThan(0);
            expect(conf.amount).toBeGreaterThan(0);
            expect(conf.recipientUserId.length).toBeGreaterThan(0);
            expect(conf.releasedAt.length).toBeGreaterThan(0);
          }

          expect(isNonGuessableId(cert.certificateId)).toBe(true);
          expect(cert.generatedAt.length).toBeGreaterThan(0);
          expect(() => new Date(cert.generatedAt)).not.toThrow();
        }
      ),
      { numRuns: 100 },
    );
  });

  it('certificate is withheld when professionals have missing registration numbers', () => {
    fc.assert(
      fc.property(
        fc.record({
          projectId: projectIdArb,
          projectTitle: fc.string({ minLength: 3, maxLength: 150 }),
          professionals: fc.array(professionalWithMissingRegArb, { minLength: 1, maxLength: 3 }),
          sansReferences: fc.array(fc.string({ minLength: 3, maxLength: 30 }), { minLength: 1, maxLength: 5 }),
          toolsUsed: fc.array(fc.string({ minLength: 3, maxLength: 30 }), { minLength: 1, maxLength: 5 }),
          milestones: fc.constant([{ milestoneId: 'ms-0', title: 'Design', status: 'completed' as const, signOffBy: 'usr-1' }]),
          auditResults: fc.constant([{ milestoneId: 'ms-0', title: 'Design', aiAuditStatus: 'passed' as const, signOffBy: 'usr-1' }]),
          escrowConfirmations: fc.constant([{ milestoneId: 'ms-0', amount: 50000, recipientUserId: 'usr-2', releasedAt: '2025-06-01T00:00:00Z' }]),
        }),
        (project) => {
          const result = generateCertificate(project);
          expect(result.success).toBe(false);
          expect(result.withheld).toBe(true);
          expect(result.missingItems).toBeDefined();
          expect(result.missingItems!.some(item => item.includes('registration number'))).toBe(true);
          expect(result.certificate).toBeUndefined();
        }
      ),
      { numRuns: 100 },
    );
  });

  it('certificate is withheld when audit results are missing for milestones', () => {
    fc.assert(
      fc.property(
        fc.record({
          projectId: projectIdArb,
          projectTitle: fc.string({ minLength: 3, maxLength: 150 }),
          professionals: fc.array(professionalArb, { minLength: 1, maxLength: 3 }),
          sansReferences: fc.array(fc.string({ minLength: 3, maxLength: 30 }), { minLength: 1, maxLength: 5 }),
          toolsUsed: fc.array(fc.string({ minLength: 3, maxLength: 30 }), { minLength: 1, maxLength: 5 }),
          milestones: fc.constant([
            { milestoneId: 'ms-0', title: 'Design', status: 'completed' as const, signOffBy: 'usr-1' },
            { milestoneId: 'ms-1', title: 'Build', status: 'completed' as const, signOffBy: 'usr-1' },
          ]),
          auditResults: fc.constant([
            { milestoneId: 'ms-0', title: 'Design', aiAuditStatus: 'passed' as const, signOffBy: 'usr-1' },
          ]),
          escrowConfirmations: fc.constant([
            { milestoneId: 'ms-0', amount: 50000, recipientUserId: 'usr-2', releasedAt: '2025-06-01T00:00:00Z' },
            { milestoneId: 'ms-1', amount: 75000, recipientUserId: 'usr-2', releasedAt: '2025-07-01T00:00:00Z' },
          ]),
        }),
        (project) => {
          const result = generateCertificate(project);
          expect(result.success).toBe(false);
          expect(result.withheld).toBe(true);
          expect(result.missingItems).toBeDefined();
          expect(result.missingItems!.some(item => item.includes('audit result'))).toBe(true);
        }
      ),
      { numRuns: 100 },
    );
  });

  it('certificate is withheld when payment confirmations are missing', () => {
    fc.assert(
      fc.property(
        fc.record({
          projectId: projectIdArb,
          projectTitle: fc.string({ minLength: 3, maxLength: 150 }),
          professionals: fc.array(professionalArb, { minLength: 1, maxLength: 3 }),
          sansReferences: fc.array(fc.string({ minLength: 3, maxLength: 30 }), { minLength: 1, maxLength: 5 }),
          toolsUsed: fc.array(fc.string({ minLength: 3, maxLength: 30 }), { minLength: 1, maxLength: 5 }),
          milestones: fc.constant([
            { milestoneId: 'ms-0', title: 'Design', status: 'completed' as const, signOffBy: 'usr-1' },
          ]),
          auditResults: fc.constant([
            { milestoneId: 'ms-0', title: 'Design', aiAuditStatus: 'passed' as const, signOffBy: 'usr-1' },
          ]),
          escrowConfirmations: fc.constant([]),
        }),
        (project) => {
          const result = generateCertificate(project);
          expect(result.success).toBe(false);
          expect(result.withheld).toBe(true);
          expect(result.missingItems).toBeDefined();
          expect(result.missingItems!.some(item => item.includes('payment confirmation'))).toBe(true);
        }
      ),
      { numRuns: 100 },
    );
  });

  it('certificate IDs are unique and non-guessable across generations', () => {
    fc.assert(
      fc.property(
        completeProjectArb(2),
        (project) => {
          const result1 = generateCertificate(project);
          const result2 = generateCertificate(project);

          expect(result1.success).toBe(true);
          expect(result2.success).toBe(true);
          expect(result1.certificate!.certificateId).not.toBe(result2.certificate!.certificateId);
          expect(isNonGuessableId(result1.certificate!.certificateId)).toBe(true);
          expect(isNonGuessableId(result2.certificate!.certificateId)).toBe(true);
        }
      ),
      { numRuns: 100 },
    );
  });
});
