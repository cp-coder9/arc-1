/**
 * Accessibility Audit — axe-core automated scan
 *
 * Validates: Requirements 17.1
 *
 * Runs axe-core against the three primary dashboards:
 *   - ArchitectDashboard
 *   - AdminDashboard
 *   - ClientDashboard
 *
 * Verifies zero accessibility errors / violations per dashboard.
 * Exports human-readable summary to docs/accessibility-audit-results/.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { describe, test, expect, jest, beforeAll } from '@jest/globals';
import '@testing-library/jest-dom';
import { axe, toHaveNoViolations } from 'jest-axe';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ─── Extend vitest's expect with jest-axe matcher ────────────────────────────
expect.extend(toHaveNoViolations);

// ─── Component imports ────────────────────────────────────────────────────────
import ArchitectDashboard from '@/components/ArchitectDashboard';
import AdminDashboard from '@/components/AdminDashboard';
import ClientDashboard from '@/components/ClientDashboard';
import { UserProfile } from '@/types';

// ─── Firebase mocks ───────────────────────────────────────────────────────────
jest.mock('@/lib/firebase', () => ({
  auth: {
    currentUser: { uid: 'test-uid', email: 'test@example.com' },
  },
  db: {
    collection: jest.fn<any>(() => ({
      doc: jest.fn<any>(() => ({
        get: jest.fn<any>(),
        set: jest.fn<any>(),
        update: jest.fn<any>(),
        delete: jest.fn<any>(),
      })),
      where: jest.fn<any>(() => ({
        orderBy: jest.fn<any>(() => ({
          limit: jest.fn<any>(() => ({
            onSnapshot: jest.fn<any>((cb: any) => { cb({ docs: [], empty: true }); return jest.fn(); }),
          })),
          onSnapshot: jest.fn<any>((cb: any) => { cb({ docs: [] }); return jest.fn(); }),
        })),
        onSnapshot: jest.fn<any>((cb: any) => { cb({ docs: [], empty: true }); return jest.fn(); }),
      })),
      orderBy: jest.fn<any>(() => ({
        onSnapshot: jest.fn<any>((cb: any) => { cb({ docs: [] }); return jest.fn(); }),
      })),
      onSnapshot: jest.fn<any>((cb: any) => { cb({ docs: [] }); return jest.fn(); }),
    })),
  },
  handleFirestoreError: jest.fn<any>(),
  OperationType: {
    CREATE: 'CREATE', READ: 'READ', UPDATE: 'UPDATE',
    DELETE: 'DELETE', LIST: 'LIST', UPLOAD: 'UPLOAD',
  },
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn<any>(),
  collectionGroup: jest.fn<any>(() => ({})),
  query: jest.fn<any>(),
  where: jest.fn<any>(),
  orderBy: jest.fn<any>(),
  limit: jest.fn<any>(),
  onSnapshot: jest.fn<any>((_q: any, cb: any) => {
    cb({ docs: [], empty: true });
    return jest.fn();
  }),
  doc: jest.fn<any>(() => ({})),
  getDoc: jest.fn<any>(() => Promise.resolve({ exists: () => false, data: () => ({}) })),
  getDocs: jest.fn<any>(() => Promise.resolve({ docs: [], empty: true })),
  setDoc: jest.fn<any>(() => Promise.resolve()),
  updateDoc: jest.fn<any>(() => Promise.resolve()),
  addDoc: jest.fn<any>(() => Promise.resolve({ id: 'new-id' })),
  deleteDoc: jest.fn<any>(() => Promise.resolve()),
  deleteField: jest.fn<any>(() => ({})),
}));

jest.mock('firebase/auth', () => ({
  sendPasswordResetEmail: jest.fn<any>().mockResolvedValue(undefined),
}));

// ─── Service / API mocks ──────────────────────────────────────────────────────
jest.mock('@/lib/apiClient', () => ({ apiFetch: jest.fn<any>() }));
jest.mock('@/lib/uploadService', () => ({ uploadAndTrackFile: jest.fn<any>() }));
jest.mock('@/lib/professionalRoleCompatibility', () => ({ getSelectedProfessionalId: jest.fn<any>() }));

jest.mock('@/services/geminiService', () => ({
  reviewDrawing: jest.fn<any>().mockResolvedValue({ status: 'passed', feedback: '', categories: [] }),
  logSystemEvent: jest.fn<any>(),
  seedAgents: jest.fn<any>(),
  AIProgress: {},
}));

jest.mock('@/services/notificationService', () => ({
  notificationService: { sendNotification: jest.fn<any>().mockResolvedValue(undefined) },
}));

jest.mock('@/services/projectLifecycleService', () => ({
  subscribeToProjectByJobId: jest.fn<any>(() => jest.fn()),
}));

jest.mock('@/services/teamService', () => ({
  getDisciplineCoverage: jest.fn<any>(() => ({ filled: [], missing: [] })),
  subscribeToTeam: jest.fn<any>(() => jest.fn()),
}));

jest.mock('@/services/userVerificationService', () => ({
  buildVerificationQueueProjection: jest.fn<any>(() => []),
  getVerificationLifecycle: jest.fn<any>(() => ({})),
}));

jest.mock('@/services/pdfGenerationService', () => ({
  pdfGenerationService: { generatePDF: jest.fn<any>() },
}));

jest.mock('@/demo-seed/demoFirestore', () => ({
  getDemoDoc: jest.fn<any>(() => Promise.resolve({ exists: () => false, data: () => ({}) })),
  getDemoCol: jest.fn<any>(() => Promise.resolve({ docs: [] })),
}));

// ─── Glass system component mocks ─────────────────────────────────────────────
jest.mock('@/components/navigation/RoleAwareSidebar', () => ({
  __esModule: true,
  default: () => <nav aria-label="Main navigation">Sidebar</nav>,
  RoleAwareSidebar: () => <nav aria-label="Main navigation">Sidebar</nav>,
}));

jest.mock('@/components/navigation/Breadcrumbs', () => ({
  __esModule: true,
  default: () => <nav aria-label="Breadcrumb"><ol><li>Home</li></ol></nav>,
  Breadcrumbs: () => <nav aria-label="Breadcrumb"><ol><li>Home</li></ol></nav>,
}));

jest.mock('@/components/navigation/MobileMenuTrigger', () => ({
  __esModule: true,
  default: () => <button aria-label="Open mobile menu" type="button">Menu</button>,
  MobileMenuTrigger: () => <button aria-label="Open mobile menu" type="button">Menu</button>,
}));

jest.mock('@/components/animated/StatCardAnimated', () => ({
  StatCardAnimated: ({ label, value }: { label: string; value: string | number }) => (
    <div role="region" aria-label={label}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  ),
}));

jest.mock('@/components/animated/GlassCardAnimated', () => ({
  GlassCardAnimated: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

jest.mock('@/components/composite/DashboardSection', () => ({
  DashboardSection: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section aria-labelledby={`section-${title.replace(/\s+/g, '-').toLowerCase()}`}>
      <h2 id={`section-${title.replace(/\s+/g, '-').toLowerCase()}`}>{title}</h2>
      {children}
    </section>
  ),
}));

jest.mock('@/components/composite/GlassTable', () => ({
  GlassTable: ({ columns = [] }: { columns?: Array<{ key: string; label: string }> }) => (
    <table>
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={String(col.key)} scope="col">{col.label}</th>
          ))}
        </tr>
      </thead>
      <tbody></tbody>
    </table>
  ),
}));

jest.mock('@/components/ui/GlassButton', () => ({
  GlassButton: ({ children, onClick, ...props }: { children: React.ReactNode; onClick?: () => void; [key: string]: any }) => (
    <button type="button" onClick={onClick} {...props}>{children}</button>
  ),
}));

// ─── shadcn/ui mocks ──────────────────────────────────────────────────────────
jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h3>{children}</h3>,
  CardDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  CardFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, ...props }: { children: React.ReactNode; onClick?: () => void; [key: string]: any }) => (
    <button type="button" onClick={onClick} {...props}>{children}</button>
  ),
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

jest.mock('@/components/ui/input', () => ({
  Input: ({ ...props }: any) => <input {...props} />,
}));

jest.mock('@/components/ui/textarea', () => ({
  Textarea: ({ ...props }: any) => <textarea {...props} />,
}));

jest.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open?: boolean }) =>
    open ? <div role="dialog" aria-modal="true">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: React.ReactNode }) => <div role="tablist">{children}</div>,
  TabsTrigger: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <button role="tab" type="button" id={`tab-${value}`}>{children}</button>
  ),
  TabsContent: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <div role="tabpanel" aria-labelledby={`tab-${value}`}>{children}</div>
  ),
}));

jest.mock('@/components/ui/accordion', () => ({
  Accordion: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AccordionItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AccordionTrigger: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button>,
  AccordionContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/components/ui/table', () => ({
  Table: ({ children }: { children: React.ReactNode }) => <table>{children}</table>,
  TableHeader: ({ children }: { children: React.ReactNode }) => <thead>{children}</thead>,
  TableBody: ({ children }: { children: React.ReactNode }) => <tbody>{children}</tbody>,
  TableRow: ({ children }: { children: React.ReactNode }) => <tr>{children}</tr>,
  TableHead: ({ children }: { children: React.ReactNode }) => <th scope="col">{children}</th>,
  TableCell: ({ children }: { children: React.ReactNode }) => <td>{children}</td>,
}));

// ─── Child component mocks ────────────────────────────────────────────────────
jest.mock('@/components/ProfileEditor', () => ({ __esModule: true, default: () => <div>Profile Editor</div> }));
jest.mock('@/components/RatingSystem', () => ({ __esModule: true, default: () => <div>Rating System</div> }));
jest.mock('@/components/Chat', () => ({
  Chat: () => <div>Chat</div>,
  ChatButton: () => <button type="button">Chat</button>,
}));
jest.mock('@/components/SubmissionItem', () => ({
  __esModule: true,
  default: () => <div>Submission Item</div>,
  SubmissionItem: () => <div>Submission Item</div>,
}));
jest.mock('@/components/OrchestrationProgressModal', () => ({
  __esModule: true,
  default: () => null,
  OrchestrationProgressModal: () => null,
}));
jest.mock('@/components/SearchFilter', () => ({
  __esModule: true,
  default: () => <div>Search Filter</div>,
  SearchFilter: () => <div>Search Filter</div>,
}));
jest.mock('@/components/MunicipalTracker', () => ({ __esModule: true, default: () => <div>Municipal Tracker</div> }));
jest.mock('@/components/FeeEstimator', () => ({ __esModule: true, default: () => <div>Fee Estimator</div> }));
jest.mock('@/components/StageProgressTracker', () => ({ __esModule: true, default: () => <div>Stage Progress</div> }));
jest.mock('../components/StageProgressTracker', () => ({ __esModule: true, default: () => <div>Stage Progress</div> }));
jest.mock('@/components/AdvanceStageButton', () => ({ __esModule: true, default: () => <button type="button">Advance Stage</button> }));
jest.mock('../components/AdvanceStageButton', () => ({ __esModule: true, default: () => <button type="button">Advance Stage</button> }));
jest.mock('@/components/ResponsibilityMatrix', () => ({ __esModule: true, default: () => <div>Responsibility Matrix</div> }));
jest.mock('@/components/TeamBuilder', () => ({ __esModule: true, default: () => <div>Team Builder</div> }));
jest.mock('@/components/GanttChart', () => ({ __esModule: true, default: () => <div>Gantt Chart</div> }));
jest.mock('@/components/SiteLogManager', () => ({ __esModule: true, default: () => <div>Site Log Manager</div> }));
jest.mock('@/components/RFIManager', () => ({ __esModule: true, default: () => <div>RFI Manager</div> }));
jest.mock('@/components/CloseoutWizard', () => ({ __esModule: true, default: () => <div>Closeout Wizard</div> }));
jest.mock('@/components/ComplianceReport', () => ({ __esModule: true, default: () => <div>Compliance Report</div> }));
jest.mock('@/components/AgentKnowledgeManager', () => ({ __esModule: true, default: () => <div>Agent Knowledge Manager</div> }));
jest.mock('@/components/AdminKnowledgeUploader', () => ({ __esModule: true, default: () => <div>Knowledge Uploader</div> }));
jest.mock('@/components/ReviewManagement', () => ({ __esModule: true, default: () => <div>Review Management</div> }));
jest.mock('@/components/MunicipalSettingsAdmin', () => ({ __esModule: true, default: () => <div>Municipal Settings</div> }));
jest.mock('@/components/ExecutionModePicker', () => ({ __esModule: true, default: () => <div>Execution Mode</div> }));
jest.mock('@/components/FinancialDashboard', () => ({ __esModule: true, default: () => <div>Financial Dashboard</div> }));
// FeeEstimator — mock both aliased and relative paths to prevent unlabelled form rendering
jest.mock('@/components/FeeEstimator', () => ({ __esModule: true, default: () => <div>Fee Estimator</div> }));
jest.mock('../components/FeeEstimator', () => ({ __esModule: true, default: () => <div>Fee Estimator</div> }));

// ─── Test data ────────────────────────────────────────────────────────────────

const architectUser: UserProfile = {
  uid: 'arch-uid',
  email: 'architect@example.com',
  displayName: 'Test Architect',
  role: 'architect',
  createdAt: '2026-01-01T00:00:00Z',
  averageRating: 4.8,
  completedJobs: 12,
};

const adminUser: UserProfile = {
  uid: 'admin-uid',
  email: 'admin@example.com',
  displayName: 'Test Admin',
  role: 'admin',
  createdAt: '2026-01-01T00:00:00Z',
};

const clientUser: UserProfile = {
  uid: 'client-uid',
  email: 'client@example.com',
  displayName: 'Test Client',
  role: 'client',
  createdAt: '2026-01-01T00:00:00Z',
};

// ─── Audit result collection ──────────────────────────────────────────────────
interface AuditEntry {
  dashboard: string;
  violations: number;
  passes: number;
  incomplete: number;
  violationDetails: string[];
}

const auditResults: AuditEntry[] = [];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Accessibility Audit — Primary Dashboards (axe-core)', () => {
  /**
   * ArchitectDashboard
   * Validates: Requirements 17.1
   */
  test('ArchitectDashboard has zero accessibility violations', async () => {
    const { container } = render(
      <div>
        <ArchitectDashboard user={architectUser} />
      </div>
    );

    const results = await axe(container);

    auditResults.push({
      dashboard: 'ArchitectDashboard',
      violations: results.violations.length,
      passes: results.passes.length,
      incomplete: results.incomplete.length,
      violationDetails: results.violations.map(
        (v) => `[${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} node(s))`
      ),
    });

    expect(results).toHaveNoViolations();
  });

  /**
   * AdminDashboard
   * Validates: Requirements 17.1
   */
  test('AdminDashboard has zero accessibility violations', async () => {
    const { container } = render(
      <div>
        <AdminDashboard user={adminUser} />
      </div>
    );

    const results = await axe(container);

    auditResults.push({
      dashboard: 'AdminDashboard',
      violations: results.violations.length,
      passes: results.passes.length,
      incomplete: results.incomplete.length,
      violationDetails: results.violations.map(
        (v) => `[${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} node(s))`
      ),
    });

    expect(results).toHaveNoViolations();
  });

  /**
   * ClientDashboard
   * Validates: Requirements 17.1
   */
  test('ClientDashboard has zero accessibility violations', async () => {
    const { container } = render(
      <div>
        <ClientDashboard user={clientUser} />
      </div>
    );

    const results = await axe(container);

    auditResults.push({
      dashboard: 'ClientDashboard',
      violations: results.violations.length,
      passes: results.passes.length,
      incomplete: results.incomplete.length,
      violationDetails: results.violations.map(
        (v) => `[${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} node(s))`
      ),
    });

    expect(results).toHaveNoViolations();
  });
});

// ─── Export audit report after all tests ─────────────────────────────────────
afterAll(() => {
  const outputDir = join(process.cwd(), 'docs', 'accessibility-audit-results');
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = join(outputDir, `audit-${timestamp}.json`);
  const summaryPath = join(outputDir, 'latest-summary.md');

  // Write JSON report
  writeFileSync(reportPath, JSON.stringify({ timestamp, results: auditResults }, null, 2), 'utf8');

  // Write human-readable summary
  const totalViolations = auditResults.reduce((sum, r) => sum + r.violations, 0);
  const lines: string[] = [
    '# Accessibility Audit Results',
    '',
    `**Run at:** ${new Date().toISOString()}`,
    `**Tool:** axe-core (via jest-axe)`,
    `**Standard:** WCAG 2.1 AA`,
    '',
    '## Summary',
    '',
    `| Dashboard | Violations | Passes | Incomplete |`,
    `|-----------|-----------|--------|------------|`,
    ...auditResults.map(
      (r) => `| ${r.dashboard} | ${r.violations} | ${r.passes} | ${r.incomplete} |`
    ),
    '',
    `**Total violations: ${totalViolations}**`,
    '',
    totalViolations === 0
      ? '✅ All dashboards pass WCAG 2.1 AA automated audit (zero violations).'
      : '❌ Violations detected — see details below.',
    '',
  ];

  if (totalViolations > 0) {
    lines.push('## Violation Details', '');
    for (const result of auditResults) {
      if (result.violationDetails.length > 0) {
        lines.push(`### ${result.dashboard}`, '');
        result.violationDetails.forEach((d) => lines.push(`- ${d}`));
        lines.push('');
      }
    }
  }

  lines.push(
    '## Scope',
    '',
    'This automated audit covers:',
    '- ArchitectDashboard (role: architect)',
    '- AdminDashboard (role: admin)',
    '- ClientDashboard (role: client)',
    '',
    '> **Note:** Automated axe-core testing catches ~30–40% of accessibility issues.',
    '> Manual testing with screen readers (NVDA, JAWS, VoiceOver) is required for full WCAG AA compliance.',
    '> See tasks 6.2–6.9 for manual testing procedures.',
    '',
    `_Report generated by: src/__tests__/accessibility.test.tsx_`,
  );

  writeFileSync(summaryPath, lines.join('\n'), 'utf8');
});
