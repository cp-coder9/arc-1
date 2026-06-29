import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FieldReport } from '@/types';
import FieldReportView, {
  statusLabel,
  weatherLabel,
  buildReportExportLines,
  reportExportFilename,
} from './FieldReportView';
import { generateReport, exportReport } from '@/services/fieldReportService';

vi.mock('@/services/fieldReportService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/fieldReportService')>();
  return {
    ...actual,
    generateReport: vi.fn(),
  };
});

const mockedGenerate = vi.mocked(generateReport);

// Mock pdf-lib so the export path can run without the real PDF engine.
const drawTextMock = vi.fn();
const saveMock = vi.fn(() => new Uint8Array([37, 80, 68, 70]));
vi.mock('pdf-lib', () => {
  const page = {
    getSize: () => ({ width: 595, height: 842 }),
    drawText: (...args: unknown[]) => drawTextMock(...args),
  };
  return {
    PDFDocument: {
      create: vi.fn(async () => ({
        addPage: vi.fn(() => page),
        embedFont: vi.fn(async () => ({})),
        save: vi.fn(async () => saveMock()),
      })),
    },
    PageSizes: { A4: [595, 842] },
    StandardFonts: { Helvetica: 'Helvetica', HelveticaBold: 'HelveticaBold' },
    rgb: (r: number, g: number, b: number) => ({ r, g, b }),
  };
});

function buildReport(overrides: Partial<FieldReport> = {}): FieldReport {
  return {
    projectId: 'proj-1',
    date: '2026-06-15',
    timeZone: 'Africa/Johannesburg',
    issues: [
      { id: 'snag-001', status: 'open', severity: 'critical' },
      { id: 'snag-002', status: 'ready_for_reinspection', severity: 'low' },
    ],
    evidence: [
      { id: 'ev-001', type: 'photo', uri: 'https://blob.example/ev-001.jpg' },
    ],
    weather: 'clear',
    paymentBlockingCount: 1,
    ...overrides,
  };
}

describe('FieldReportView display', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function renderWithReport(report: FieldReport) {
    mockedGenerate.mockResolvedValue(report);
    render(
      <FieldReportView
        projects={[{ id: 'proj-1', name: 'Riverside Build', lifecycleStage: 'build' }]}
      />,
    );
    fireEvent.click(screen.getByLabelText('Generate field report'));
    await waitFor(() => expect(mockedGenerate).toHaveBeenCalled());
  }

  it('renders each aggregated issue with id, status, and severity', async () => {
    await renderWithReport(buildReport());

    expect(await screen.findByText('snag-001')).toBeInTheDocument();
    const issuesTable = within(screen.getByLabelText('Aggregated issues'));
    expect(issuesTable.getByText('snag-002')).toBeInTheDocument();
    // Lifecycle status labels are humanized.
    expect(issuesTable.getByText('Open')).toBeInTheDocument();
    expect(issuesTable.getByText('Ready For Reinspection')).toBeInTheDocument();
    // Severities are rendered.
    expect(issuesTable.getByText('critical')).toBeInTheDocument();
    expect(issuesTable.getByText('low')).toBeInTheDocument();
  });

  it('renders evidence references with an open link', async () => {
    await renderWithReport(buildReport());

    expect(await screen.findByText('ev-001')).toBeInTheDocument();
    const link = screen.getByLabelText('Open evidence ev-001');
    expect(link).toHaveAttribute('href', 'https://blob.example/ev-001.jpg');
  });

  it('shows blocking-payment count from the report', async () => {
    await renderWithReport(buildReport({ paymentBlockingCount: 3 }));

    expect(await screen.findByText('3')).toBeInTheDocument();
    expect(screen.getByText('Blocking payment')).toBeInTheDocument();
  });

  it('shows outstanding snag count only when present (Close-out)', async () => {
    await renderWithReport(buildReport({ outstandingHandoverSnags: 5 }));

    expect(await screen.findByText('Outstanding snags')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('omits the outstanding snag tile when undefined', async () => {
    await renderWithReport(buildReport());

    await screen.findByText('snag-001');
    expect(screen.queryByText('Outstanding snags')).not.toBeInTheDocument();
  });

  it('shows empty states when no issues or evidence aggregated', async () => {
    await renderWithReport(buildReport({ issues: [], evidence: [] }));

    expect(
      await screen.findByText('No issues were captured for this date.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('No evidence was captured for this date.'),
    ).toBeInTheDocument();
  });
});

describe('FieldReportView helpers', () => {
  it('humanizes lifecycle status values', () => {
    expect(statusLabel('open')).toBe('Open');
    expect(statusLabel('ready_for_reinspection')).toBe('Ready For Reinspection');
  });

  it('labels the not_recorded weather sentinel', () => {
    expect(weatherLabel('not_recorded')).toBe('Not recorded');
    expect(weatherLabel('clear')).toBe('Clear');
  });
});

describe('FieldReportView export document content', () => {
  it('includes date, project, each issue (id/status/severity) and each evidence ref', () => {
    const doc = exportReport(buildReport());
    const lines = buildReportExportLines(doc);
    const text = lines.join('\n');

    // Report date and project identifier are present.
    expect(text).toContain('2026-06-15');
    expect(text).toContain('Project: proj-1');

    // Each aggregated issue's id, status, and severity appear.
    expect(text).toContain('snag-001');
    expect(text).toContain('Open');
    expect(text).toContain('critical');
    expect(text).toContain('snag-002');
    expect(text).toContain('Ready For Reinspection');
    expect(text).toContain('low');

    // An evidence reference for each aggregated evidence item appears.
    expect(text).toContain('ev-001');
    expect(text).toContain('https://blob.example/ev-001.jpg');
  });

  it('includes the outstanding handover snag count when present', () => {
    const doc = exportReport(buildReport({ outstandingHandoverSnags: 4 }));
    const lines = buildReportExportLines(doc);
    expect(lines.join('\n')).toContain('Outstanding handover snags: 4');
  });

  it('builds a safe, dated PDF filename from the export document', () => {
    const doc = exportReport(buildReport());
    expect(reportExportFilename(doc)).toBe('field-report-proj-1-2026-06-15.pdf');
  });
});

describe('FieldReportView keyboard navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes accessible names for the project selector, date picker, and generate button', () => {
    render(
      <FieldReportView projects={[{ id: 'proj-1', name: 'Riverside Build' }]} />,
    );

    // Each control is reachable by its programmatic accessible name (Requirement 9.5).
    expect(screen.getByRole('combobox', { name: 'Select project' })).toBeInTheDocument();
    expect(screen.getByLabelText('Select report date')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Generate field report' }),
    ).toBeInTheDocument();
  });

  it('moves focus through project selector, date picker, then generate button via Tab', async () => {
    const user = userEvent.setup();
    render(
      <FieldReportView projects={[{ id: 'proj-1', name: 'Riverside Build' }]} />,
    );

    const projectSelect = screen.getByRole('combobox', { name: 'Select project' });
    const dateInput = screen.getByLabelText('Select report date');
    const generateButton = screen.getByRole('button', {
      name: 'Generate field report',
    });

    // Tab order reaches each control in document order (Requirement 9.4).
    await user.tab();
    expect(projectSelect).toHaveFocus();

    await user.tab();
    expect(dateInput).toHaveFocus();

    await user.tab();
    expect(generateButton).toHaveFocus();
  });

  it('activates report generation with the keyboard alone', async () => {
    const user = userEvent.setup();
    mockedGenerate.mockResolvedValue(buildReport());
    render(
      <FieldReportView projects={[{ id: 'proj-1', name: 'Riverside Build' }]} />,
    );

    const generateButton = screen.getByRole('button', {
      name: 'Generate field report',
    });
    generateButton.focus();
    expect(generateButton).toHaveFocus();

    // Enter activates the focused primary action (Requirement 9.4).
    await user.keyboard('{Enter}');
    await waitFor(() => expect(mockedGenerate).toHaveBeenCalled());
  });

  it('exposes a keyboard-reachable export button with an accessible name once a report exists', async () => {
    const user = userEvent.setup();
    mockedGenerate.mockResolvedValue(buildReport());
    render(
      <FieldReportView projects={[{ id: 'proj-1', name: 'Riverside Build' }]} />,
    );

    fireEvent.click(screen.getByLabelText('Generate field report'));
    await waitFor(() => expect(mockedGenerate).toHaveBeenCalled());

    const exportButton = await screen.findByRole('button', {
      name: 'Export field report as PDF',
    });

    // The export button can receive focus and is operable from the keyboard.
    exportButton.focus();
    expect(exportButton).toHaveFocus();
    expect(exportButton).toBeEnabled();
    await user.keyboard('{Enter}');
  });
});

describe('FieldReportView export action', () => {
  const createObjectURL = vi.fn(() => 'blob:mock-report');
  const revokeObjectURL = vi.fn();
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(global.URL, 'createObjectURL', {
      value: createObjectURL,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(global.URL, 'revokeObjectURL', {
      value: revokeObjectURL,
      writable: true,
      configurable: true,
    });
    clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
  });

  it('exports the generated report to a downloadable PDF', async () => {
    mockedGenerate.mockResolvedValue(buildReport());
    render(<FieldReportView projects={[{ id: 'proj-1', name: 'Riverside Build' }]} />);

    fireEvent.click(screen.getByLabelText('Generate field report'));
    await waitFor(() => expect(mockedGenerate).toHaveBeenCalled());

    fireEvent.click(screen.getByLabelText('Export field report as PDF'));

    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
    expect(saveMock).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalled();
  });
});
