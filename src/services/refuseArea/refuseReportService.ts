/**
 * Municipal Refuse Area — PDF Report Generation Service
 *
 * Generates a compliance advisory PDF report from a Refuse_Area_Result
 * and Professional_Sign_Off_Record using pdf-lib.
 *
 * Requirements: 7.5, 7.6, 8.1
 */

import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from 'pdf-lib';
import type { Refuse_Area_Result, Professional_Sign_Off_Record, BinAllocation } from './types';

// --- Layout constants ---
const PAGE_WIDTH = 595.28; // A4 width in points
const PAGE_HEIGHT = 841.89; // A4 height in points
const MARGIN_LEFT = 50;
const MARGIN_RIGHT = 50;
const MARGIN_TOP = 60;
const MARGIN_BOTTOM = 60;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
const LINE_HEIGHT = 16;
const SECTION_GAP = 24;
const HEADING_SIZE = 14;
const BODY_SIZE = 10;
const SMALL_SIZE = 8;
const FOOTER_HEIGHT = 30;

interface DrawContext {
  doc: PDFDocument;
  font: PDFFont;
  boldFont: PDFFont;
  pages: PDFPage[];
  currentPage: PDFPage;
  y: number;
  pageNumber: number;
}

/**
 * Generates a PDF report for the Municipal Refuse Area Compliance Advisory.
 *
 * @param result - The computed Refuse_Area_Result
 * @param signOff - The professional sign-off record
 * @returns PDF as Uint8Array
 * @throws Error if PDF generation fails
 */
export async function generateRefuseAreaPdf(
  result: Refuse_Area_Result,
  signOff: Professional_Sign_Off_Record
): Promise<Uint8Array> {
  try {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

    const firstPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

    const ctx: DrawContext = {
      doc,
      font,
      boldFont,
      pages: [firstPage],
      currentPage: firstPage,
      y: PAGE_HEIGHT - MARGIN_TOP,
      pageNumber: 1,
    };

    // 1. Header
    drawHeader(ctx, result);

    // 2. Project Info
    drawProjectInfo(ctx, result);

    // 3. Area Summary
    drawAreaSummary(ctx, result);

    // 4. Bin Schedule
    drawBinSchedule(ctx, result);

    // 5. Vehicle Access
    drawVehicleAccess(ctx, result);

    // 6. Ventilation
    drawVentilation(ctx, result);

    // 7. Drainage
    drawDrainage(ctx, result);

    // 8. Pest Control
    drawPestControl(ctx, result);

    // 9. Advisory Disclaimer
    drawAdvisoryDisclaimer(ctx, result);

    // 10. Sign-Off Record
    drawSignOffRecord(ctx, signOff);

    // Draw footers on all pages
    drawFooters(ctx);

    const pdfBytes = await doc.save();
    return pdfBytes;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`PDF generation failed: ${message}`);
  }
}

// --- Helper: ensure space on page, create new page if needed ---

function ensureSpace(ctx: DrawContext, requiredHeight: number): void {
  if (ctx.y - requiredHeight < MARGIN_BOTTOM + FOOTER_HEIGHT) {
    const newPage = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    ctx.pages.push(newPage);
    ctx.currentPage = newPage;
    ctx.y = PAGE_HEIGHT - MARGIN_TOP;
    ctx.pageNumber++;
  }
}

// --- Helper: draw wrapped text ---

function drawWrappedText(
  ctx: DrawContext,
  text: string,
  options: { fontSize?: number; font?: PDFFont; indent?: number; maxWidth?: number } = {}
): void {
  const fontSize = options.fontSize ?? BODY_SIZE;
  const drawFont = options.font ?? ctx.font;
  const indent = options.indent ?? 0;
  const maxWidth = options.maxWidth ?? CONTENT_WIDTH - indent;

  const words = text.split(' ');
  let line = '';

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    const testWidth = drawFont.widthOfTextAtSize(testLine, fontSize);

    if (testWidth > maxWidth && line) {
      ensureSpace(ctx, LINE_HEIGHT);
      ctx.currentPage.drawText(line, {
        x: MARGIN_LEFT + indent,
        y: ctx.y,
        size: fontSize,
        font: drawFont,
        color: rgb(0.1, 0.1, 0.1),
      });
      ctx.y -= LINE_HEIGHT;
      line = word;
    } else {
      line = testLine;
    }
  }

  if (line) {
    ensureSpace(ctx, LINE_HEIGHT);
    ctx.currentPage.drawText(line, {
      x: MARGIN_LEFT + indent,
      y: ctx.y,
      size: fontSize,
      font: drawFont,
      color: rgb(0.1, 0.1, 0.1),
    });
    ctx.y -= LINE_HEIGHT;
  }
}

// --- Helper: draw a section heading ---

function drawSectionHeading(ctx: DrawContext, title: string): void {
  ctx.y -= SECTION_GAP;
  ensureSpace(ctx, LINE_HEIGHT + 4);

  ctx.currentPage.drawText(title, {
    x: MARGIN_LEFT,
    y: ctx.y,
    size: HEADING_SIZE,
    font: ctx.boldFont,
    color: rgb(0.09, 0.49, 0.47), // teal-ish
  });
  ctx.y -= LINE_HEIGHT + 4;

  // Separator line
  ctx.currentPage.drawLine({
    start: { x: MARGIN_LEFT, y: ctx.y + 6 },
    end: { x: MARGIN_LEFT + CONTENT_WIDTH, y: ctx.y + 6 },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });
  ctx.y -= 4;
}

// --- Helper: draw a label-value pair ---

function drawLabelValue(ctx: DrawContext, label: string, value: string): void {
  ensureSpace(ctx, LINE_HEIGHT);
  const labelWidth = ctx.boldFont.widthOfTextAtSize(label + ': ', BODY_SIZE);

  ctx.currentPage.drawText(label + ': ', {
    x: MARGIN_LEFT,
    y: ctx.y,
    size: BODY_SIZE,
    font: ctx.boldFont,
    color: rgb(0.2, 0.2, 0.2),
  });
  ctx.currentPage.drawText(value, {
    x: MARGIN_LEFT + labelWidth,
    y: ctx.y,
    size: BODY_SIZE,
    font: ctx.font,
    color: rgb(0.1, 0.1, 0.1),
  });
  ctx.y -= LINE_HEIGHT;
}

// --- Section 1: Header ---

function drawHeader(ctx: DrawContext, result: Refuse_Area_Result): void {
  // Logo placeholder
  ctx.currentPage.drawText('ARCHITEX', {
    x: MARGIN_LEFT,
    y: ctx.y,
    size: 18,
    font: ctx.boldFont,
    color: rgb(0.09, 0.49, 0.47),
  });
  ctx.y -= 28;

  // Report title
  ctx.currentPage.drawText('Municipal Refuse Area — Compliance Advisory Report', {
    x: MARGIN_LEFT,
    y: ctx.y,
    size: 16,
    font: ctx.boldFont,
    color: rgb(0.06, 0.13, 0.2),
  });
  ctx.y -= 20;

  // Generation date
  const generationDate = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  ctx.currentPage.drawText(`Generated: ${generationDate}`, {
    x: MARGIN_LEFT,
    y: ctx.y,
    size: SMALL_SIZE,
    font: ctx.font,
    color: rgb(0.4, 0.4, 0.4),
  });
  ctx.y -= LINE_HEIGHT;
}

// --- Section 2: Project Info ---

function drawProjectInfo(ctx: DrawContext, result: Refuse_Area_Result): void {
  drawSectionHeading(ctx, 'Project Information');

  drawLabelValue(ctx, 'Municipality', result.municipalityName);
  drawLabelValue(ctx, 'Building Type', formatBuildingType(result.buildingType));
  drawLabelValue(ctx, 'Profile Last Updated', result.profileLastUpdated);
}

// --- Section 3: Area Summary ---

function drawAreaSummary(ctx: DrawContext, result: Refuse_Area_Result): void {
  drawSectionHeading(ctx, 'Area Summary');

  drawLabelValue(ctx, 'Total Area', `${result.area.totalAreaSqm} m²`);
  drawLabelValue(
    ctx,
    'Dimensions (L × W × H)',
    `${result.area.dimensions.length}m × ${result.area.dimensions.width}m × ${result.area.dimensions.height}m`
  );

  if (result.area.minimumApplied) {
    ensureSpace(ctx, LINE_HEIGHT);
    ctx.currentPage.drawText('Note: Municipal minimum room size of 4.0 m² has been applied.', {
      x: MARGIN_LEFT,
      y: ctx.y,
      size: BODY_SIZE,
      font: ctx.font,
      color: rgb(0.6, 0.4, 0.1),
    });
    ctx.y -= LINE_HEIGHT;
  }

  if (result.area.componentAreas && result.area.componentAreas.length > 0) {
    ensureSpace(ctx, LINE_HEIGHT);
    ctx.currentPage.drawText('Component Areas:', {
      x: MARGIN_LEFT,
      y: ctx.y,
      size: BODY_SIZE,
      font: ctx.boldFont,
      color: rgb(0.2, 0.2, 0.2),
    });
    ctx.y -= LINE_HEIGHT;

    for (const comp of result.area.componentAreas) {
      drawLabelValue(ctx, `  ${formatBuildingType(comp.type)}`, `${comp.areaSqm} m²`);
    }
  }
}

// --- Section 4: Bin Schedule ---

function drawBinSchedule(ctx: DrawContext, result: Refuse_Area_Result): void {
  drawSectionHeading(ctx, 'Bin Schedule');

  // Table header
  const columns = ['Waste Stream', 'Bin Size', 'Count', 'Total Volume', 'Floor Space'];
  const colWidths = [120, 100, 60, 100, 100];
  drawTableHeader(ctx, columns, colWidths);

  // General waste row
  drawBinRow(ctx, 'General', result.bins.generalWaste, result.bins.totalFloorSpaceSqm, colWidths);

  // Recyclable waste row (if applicable)
  if (result.bins.recyclableWaste) {
    drawBinRow(ctx, 'Recyclable', result.bins.recyclableWaste, null, colWidths);
  }

  // Total volume
  ctx.y -= 4;
  drawLabelValue(ctx, 'Total Waste Volume', `${result.bins.totalWasteVolumeLitres} litres`);
  drawLabelValue(ctx, 'Total Bin Floor Space', `${result.bins.totalFloorSpaceSqm} m²`);
}

function drawTableHeader(ctx: DrawContext, columns: string[], colWidths: number[]): void {
  ensureSpace(ctx, LINE_HEIGHT + 4);
  let x = MARGIN_LEFT;

  for (let i = 0; i < columns.length; i++) {
    ctx.currentPage.drawText(columns[i], {
      x,
      y: ctx.y,
      size: SMALL_SIZE,
      font: ctx.boldFont,
      color: rgb(0.3, 0.3, 0.3),
    });
    x += colWidths[i];
  }
  ctx.y -= LINE_HEIGHT;

  // Header underline
  ctx.currentPage.drawLine({
    start: { x: MARGIN_LEFT, y: ctx.y + 6 },
    end: { x: MARGIN_LEFT + CONTENT_WIDTH, y: ctx.y + 6 },
    thickness: 0.3,
    color: rgb(0.7, 0.7, 0.7),
  });
  ctx.y -= 4;
}

function drawBinRow(
  ctx: DrawContext,
  stream: string,
  allocation: BinAllocation,
  floorSpace: number | null,
  colWidths: number[]
): void {
  ensureSpace(ctx, LINE_HEIGHT);
  let x = MARGIN_LEFT;

  const values = [
    stream,
    allocation.binLabel,
    String(allocation.binCount),
    `${allocation.totalVolumeLitres} L`,
    floorSpace != null ? `${floorSpace} m²` : '—',
  ];

  for (let i = 0; i < values.length; i++) {
    ctx.currentPage.drawText(values[i], {
      x,
      y: ctx.y,
      size: BODY_SIZE,
      font: ctx.font,
      color: rgb(0.1, 0.1, 0.1),
    });
    x += colWidths[i];
  }
  ctx.y -= LINE_HEIGHT;
}

// --- Section 5: Vehicle Access ---

function drawVehicleAccess(ctx: DrawContext, result: Refuse_Area_Result): void {
  drawSectionHeading(ctx, 'Vehicle Access');

  const va = result.vehicleAccess;
  drawLabelValue(ctx, 'Minimum Road Width', va.minimumRoadWidth != null ? `${va.minimumRoadWidth} m` : 'Not specified');
  drawLabelValue(ctx, 'Turning Circle Radius', va.turningCircleRadius != null ? `${va.turningCircleRadius} m` : 'Not specified');
  drawLabelValue(ctx, 'Maximum Gradient', va.maximumGradient != null ? `${va.maximumGradient}%` : 'Not specified');
  drawLabelValue(ctx, 'Maximum Carry Distance', va.maximumCarryDistance != null ? `${va.maximumCarryDistance} m` : 'Not specified');
  drawLabelValue(ctx, 'Hardstand Required', va.hardstandRequired != null ? (va.hardstandRequired ? 'Yes' : 'No') : 'Not specified');

  if (va.hardstandRequired && va.hardstandDimensions) {
    drawLabelValue(
      ctx,
      'Hardstand Dimensions',
      `${va.hardstandDimensions.length}m × ${va.hardstandDimensions.width}m`
    );
  }

  if (va.missingFields.length > 0) {
    ensureSpace(ctx, LINE_HEIGHT);
    drawWrappedText(ctx, `Advisory: The following fields are not specified by the municipality and should be verified with the relevant local authority: ${va.missingFields.join(', ')}.`, {
      fontSize: SMALL_SIZE,
    });
  }
}

// --- Section 6: Ventilation ---

function drawVentilation(ctx: DrawContext, result: Refuse_Area_Result): void {
  drawSectionHeading(ctx, 'Ventilation');

  const v = result.ventilation;
  drawLabelValue(ctx, 'Type', v.type ?? 'Not specified');

  if (v.type === 'natural') {
    drawLabelValue(ctx, 'Natural Opening Area', v.naturalOpeningArea != null ? `${v.naturalOpeningArea} m²` : 'Not specified');
  } else if (v.type === 'mechanical') {
    drawLabelValue(ctx, 'Mechanical Rate', v.mechanicalRate != null ? `${v.mechanicalRate} air changes/hr` : 'Not specified');
  }

  if (v.missingFields.length > 0) {
    ensureSpace(ctx, LINE_HEIGHT);
    drawWrappedText(ctx, `Advisory: The following fields are not specified by the municipality: ${v.missingFields.join(', ')}. Verify with the relevant local authority.`, {
      fontSize: SMALL_SIZE,
    });
  }
}

// --- Section 7: Drainage ---

function drawDrainage(ctx: DrawContext, result: Refuse_Area_Result): void {
  drawSectionHeading(ctx, 'Drainage');

  const d = result.drainage;
  drawLabelValue(ctx, 'Floor Gradient', d.floorGradient != null ? `${d.floorGradient}%` : 'Not specified');
  drawLabelValue(ctx, 'Drain Diameter', d.drainDiameter != null ? `${d.drainDiameter} mm` : 'Not specified');
  drawLabelValue(ctx, 'Wash-Down Required', d.washDownRequired != null ? (d.washDownRequired ? 'Yes' : 'No') : 'Not specified');

  if (d.washDownRequired) {
    if (d.washDownType) {
      drawLabelValue(ctx, 'Wash-Down Type', d.washDownType);
    }
    if (d.washDownLocation) {
      drawLabelValue(ctx, 'Wash-Down Location', d.washDownLocation);
    }
  }

  if (d.missingFields.length > 0) {
    ensureSpace(ctx, LINE_HEIGHT);
    drawWrappedText(ctx, `Advisory: The following fields are not specified by the municipality: ${d.missingFields.join(', ')}. Verify with the relevant local authority.`, {
      fontSize: SMALL_SIZE,
    });
  }
}

// --- Section 8: Pest Control ---

function drawPestControl(ctx: DrawContext, result: Refuse_Area_Result): void {
  drawSectionHeading(ctx, 'Pest Control');

  if (result.pestControl) {
    drawWrappedText(ctx, result.pestControl);
  } else {
    ensureSpace(ctx, LINE_HEIGHT);
    ctx.currentPage.drawText('No pest control requirements specified by the municipality.', {
      x: MARGIN_LEFT,
      y: ctx.y,
      size: BODY_SIZE,
      font: ctx.font,
      color: rgb(0.4, 0.4, 0.4),
    });
    ctx.y -= LINE_HEIGHT;
  }
}

// --- Section 9: Advisory Disclaimer ---

function drawAdvisoryDisclaimer(ctx: DrawContext, result: Refuse_Area_Result): void {
  drawSectionHeading(ctx, 'Advisory Disclaimer');

  drawWrappedText(ctx, result.advisoryDisclaimer);
}

// --- Section 10: Sign-Off Record ---

function drawSignOffRecord(ctx: DrawContext, signOff: Professional_Sign_Off_Record): void {
  drawSectionHeading(ctx, 'Professional Sign-Off Record');

  drawLabelValue(ctx, 'Name', signOff.displayName);
  drawLabelValue(ctx, 'Role', signOff.platformRole);
  drawLabelValue(ctx, 'Timestamp', signOff.timestamp);
  ctx.y -= 4;

  drawWrappedText(ctx, `Acknowledgement: ${signOff.acknowledgementStatement}`, {
    fontSize: BODY_SIZE,
  });
}

// --- Section 11: Footer (page numbers) ---

function drawFooters(ctx: DrawContext): void {
  const totalPages = ctx.pages.length;
  const footerText = 'Generated by Architex — Advisory Only';

  for (let i = 0; i < totalPages; i++) {
    const page = ctx.pages[i];
    const pageNumText = `Page ${i + 1} of ${totalPages}`;

    // Page number (right-aligned)
    const pageNumWidth = ctx.font.widthOfTextAtSize(pageNumText, SMALL_SIZE);
    page.drawText(pageNumText, {
      x: PAGE_WIDTH - MARGIN_RIGHT - pageNumWidth,
      y: MARGIN_BOTTOM - 20,
      size: SMALL_SIZE,
      font: ctx.font,
      color: rgb(0.5, 0.5, 0.5),
    });

    // Footer text (left-aligned)
    page.drawText(footerText, {
      x: MARGIN_LEFT,
      y: MARGIN_BOTTOM - 20,
      size: SMALL_SIZE,
      font: ctx.font,
      color: rgb(0.5, 0.5, 0.5),
    });
  }
}

// --- Utility ---

function formatBuildingType(type: string): string {
  switch (type) {
    case 'residential':
      return 'Residential';
    case 'commercial':
      return 'Commercial';
    case 'industrial':
      return 'Industrial';
    case 'mixed-use':
      return 'Mixed-Use';
    default:
      return type;
  }
}
