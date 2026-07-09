/**
 * Export Service — BIM/IFC Quantity Extraction Bridge
 *
 * Provides export functionality for BoQ documents and procurement packages
 * in CSV, Excel (.xlsx), and JSON formats. Excel exports include formatted
 * headers, section groupings, subtotals, grand totals, and ZAR currency formatting.
 *
 * Requirements: 6.5, 6.6, 6.7, 12.3
 */

import * as XLSX from 'xlsx';
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
export function exportToExcel(boq: BoqDocument): Buffer {
  const wb = XLSX.utils.book_new();

  // Build worksheet data
  const wsData: (string | number | undefined)[][] = [];

  // Header row
  wsData.push(['Section', 'Item No', 'Description', 'Unit', 'Quantity', 'Rate (ZAR)', 'Amount (ZAR)']);

  let grandTotalQuantity = 0;

  for (const section of boq.sections) {
    // Section header row
    wsData.push([`Section ${section.sectionNumber}: ${section.title}`, '', '', '', '', '', '']);

    let sectionQuantityTotal = 0;

    for (const item of section.lineItems) {
      wsData.push([
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
    wsData.push(['', '', `Subtotal — ${section.title}`, '', sectionQuantityTotal, '', '']);
    grandTotalQuantity += sectionQuantityTotal;
  }

  // Grand total row
  wsData.push(['', '', 'GRAND TOTAL', '', grandTotalQuantity, '', '']);

  // Create worksheet from array of arrays
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Set column widths for readability
  ws['!cols'] = [
    { wch: 22 }, // Section
    { wch: 10 }, // Item No
    { wch: 50 }, // Description
    { wch: 8 },  // Unit
    { wch: 12 }, // Quantity
    { wch: 14 }, // Rate
    { wch: 14 }, // Amount
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Bill of Quantities');

  // Write workbook to buffer
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return Buffer.from(buf);
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
export function exportProcurementPackage(pkg: ProcurementPackage): Buffer {
  const wb = XLSX.utils.book_new();

  // ─── Cover Sheet ──────────────────────────────────────────────────────────

  const coverData: (string | number | undefined)[][] = [
    ['PROCUREMENT PACKAGE — COVER SHEET'],
    [],
    ['Project Name', pkg.coverSheet.projectName],
    ['Project Number', pkg.coverSheet.projectNumber],
    ['Package Title', pkg.coverSheet.packageTitle],
    ['Issue Date', pkg.coverSheet.issueDate],
    ['Revision', pkg.coverSheet.revisionNumber],
    [],
    ['QS Contact Name', pkg.coverSheet.qsContactName],
    ['QS Contact Email', pkg.coverSheet.qsContactEmail],
    [],
    ['Trade Sections', pkg.tradeSections.join(', ')],
    ['Total Line Items', pkg.lineItems.length],
  ];

  const coverWs = XLSX.utils.aoa_to_sheet(coverData);
  coverWs['!cols'] = [
    { wch: 20 },
    { wch: 50 },
  ];
  XLSX.utils.book_append_sheet(wb, coverWs, 'Cover Sheet');

  // ─── Line Items Sheet ─────────────────────────────────────────────────────

  const itemsData: (string | number | undefined)[][] = [
    ['Item No', 'Description', 'Unit', 'Quantity', 'Rate (ZAR)', 'Amount (ZAR)'],
  ];

  for (const item of pkg.lineItems) {
    itemsData.push([
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
  itemsData.push(['', 'TOTAL', '', totalQuantity, '', '']);

  const itemsWs = XLSX.utils.aoa_to_sheet(itemsData);
  itemsWs['!cols'] = [
    { wch: 10 },  // Item No
    { wch: 50 },  // Description
    { wch: 8 },   // Unit
    { wch: 12 },  // Quantity
    { wch: 14 },  // Rate
    { wch: 14 },  // Amount
  ];
  XLSX.utils.book_append_sheet(wb, itemsWs, 'Line Items');

  // Write workbook to buffer
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return Buffer.from(buf);
}
