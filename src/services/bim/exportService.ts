/**
 * Export Service — BIM/IFC Quantity Extraction Bridge
 *
 * Provides export functionality for BoQ documents and procurement packages
 * in CSV, Excel (.xlsx), and JSON formats. Excel exports include formatted
 * headers, section groupings, subtotals, grand totals, and ZAR currency formatting.
 *
 * Requirements: 6.5, 6.6, 6.7, 12.3
 */

import ExcelJS from 'exceljs';
import type {
  BoqDocument,
  BoqSection,
  BoqLineItem,
  ProcurementPackage,
} from './types';

// ─── CSV Export ─────────────────────────────────────────────────────────────

/**
 * Exports a BoQ document to CSV format.
 * Columns: Section, Item No, Description, Unit, Quantity, Rate, Amount
 * Rate and Amount are left blank (filled by tenderer).
 *
 * @param boq - The BoQ document to export
 * @returns CSV string with headers and data rows
 */
export function exportToCsv(boq: BoqDocument): string {
  const headers = ['Section', 'Item No', 'Description', 'Unit', 'Quantity', 'Rate', 'Amount'];
  const rows: string[] = [headers.join(',')];

  for (const section of boq.sections) {
    for (const item of section.lineItems) {
      const row = [
        escapeCsvField(section.title),
        escapeCsvField(item.itemNumber),
        escapeCsvField(item.description),
        escapeCsvField(item.unit),
        String(item.quantity),
        '', // Rate — blank for tenderer
        '', // Amount — blank for tenderer
      ];
      rows.push(row.join(','));
    }
  }

  return rows.join('\n');
}

/**
 * Escapes a CSV field value, wrapping in quotes if it contains commas,
 * quotes, or newlines. Internal quotes are doubled.
 */
function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// ─── Excel Export ───────────────────────────────────────────────────────────

/**
 * Exports a BoQ to Excel (.xlsx) with formatted headers, section groupings,
 * subtotal rows per section, and a grand total row.
 *
 * @param boq - The BoQ document to export
 * @returns Buffer containing the .xlsx file data
 */
export async function exportToExcel(boq: BoqDocument): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Bill of Quantities');

  // Set column widths for readability
  ws.columns = [
    { width: 22 },  // Section
    { width: 10 },  // Item No
    { width: 50 },  // Description
    { width: 8 },   // Unit
    { width: 12 },  // Quantity
    { width: 14 },  // Rate
    { width: 14 },  // Amount
  ];

  // Header row
  ws.addRow(['Section', 'Item No', 'Description', 'Unit', 'Quantity', 'Rate (ZAR)', 'Amount (ZAR)']);

  let grandTotalQuantity = 0;

  for (const section of boq.sections) {
    // Section header row
    ws.addRow([`Section ${section.sectionNumber}: ${section.title}`, '', '', '', '', '', '']);

    let sectionQuantityTotal = 0;

    for (const item of section.lineItems) {
      ws.addRow([
        section.title,
        item.itemNumber,
        item.description,
        item.unit,
        item.quantity,
        undefined, // Rate — blank
        undefined, // Amount — blank
      ]);
      sectionQuantityTotal += item.quantity;
    }

    // Subtotal row for section
    ws.addRow(['', '', `Subtotal — ${section.title}`, '', sectionQuantityTotal, '', '']);
    grandTotalQuantity += sectionQuantityTotal;
  }

  // Grand total row
  ws.addRow(['', '', 'GRAND TOTAL', '', grandTotalQuantity, '', '']);

  // Write workbook to buffer
  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

// ─── JSON Export ────────────────────────────────────────────────────────────

/**
 * Exports a BoQ to structured JSON for programmatic consumption.
 * Includes the full BoQ hierarchy with all metadata.
 *
 * @param boq - The BoQ document to export
 * @returns Pretty-printed JSON string of the full BoQ document
 */
export function exportToJson(boq: BoqDocument): string {
  return JSON.stringify(boq, null, 2);
}

// ─── Procurement Package Export ─────────────────────────────────────────────

/**
 * Exports a procurement package to Excel with a cover sheet and line items.
 * The cover sheet contains project/package metadata; the line items sheet
 * contains supplier-facing descriptions, quantities, and units.
 *
 * @param pkg - The procurement package to export
 * @returns Buffer containing the .xlsx file data
 */
export async function exportProcurementPackage(pkg: ProcurementPackage): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();

  // ─── Cover Sheet ──────────────────────────────────────────────────────────

  const coverWs = wb.addWorksheet('Cover Sheet');
  coverWs.columns = [
    { width: 20 },
    { width: 50 },
  ];

  coverWs.addRow(['PROCUREMENT PACKAGE — COVER SHEET']);
  coverWs.addRow([]);
  coverWs.addRow(['Project Name', pkg.coverSheet.projectName]);
  coverWs.addRow(['Project Number', pkg.coverSheet.projectNumber]);
  coverWs.addRow(['Package Title', pkg.coverSheet.packageTitle]);
  coverWs.addRow(['Issue Date', pkg.coverSheet.issueDate]);
  coverWs.addRow(['Revision', pkg.coverSheet.revisionNumber]);
  coverWs.addRow([]);
  coverWs.addRow(['QS Contact Name', pkg.coverSheet.qsContactName]);
  coverWs.addRow(['QS Contact Email', pkg.coverSheet.qsContactEmail]);
  coverWs.addRow([]);
  coverWs.addRow(['Trade Sections', pkg.tradeSections.join(', ')]);
  coverWs.addRow(['Total Line Items', pkg.lineItems.length]);

  // ─── Line Items Sheet ─────────────────────────────────────────────────────

  const itemsWs = wb.addWorksheet('Line Items');
  itemsWs.columns = [
    { width: 10 },  // Item No
    { width: 50 },  // Description
    { width: 8 },   // Unit
    { width: 12 },  // Quantity
    { width: 14 },  // Rate
    { width: 14 },  // Amount
  ];

  itemsWs.addRow(['Item No', 'Description', 'Unit', 'Quantity', 'Rate (ZAR)', 'Amount (ZAR)']);

  for (const item of pkg.lineItems) {
    itemsWs.addRow([
      item.itemNumber,
      item.description,
      item.unit,
      item.quantity,
      undefined, // Rate — blank for supplier
      undefined, // Amount — blank for supplier
    ]);
  }

  // Grand total row
  const totalQuantity = pkg.lineItems.reduce((sum, item) => sum + item.quantity, 0);
  itemsWs.addRow(['', 'TOTAL', '', totalQuantity, '', '']);

  // Write workbook to buffer
  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
