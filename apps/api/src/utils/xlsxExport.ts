/**
 * Shared XLSX export helper used by every report route that exposes
 * `?format=xlsx`. See docs/modules/sales-reporting.md — the sales reports
 * want CSV and XLSX as sibling formats.
 *
 * Implementation choice: `exceljs` is already listed in apps/api/package.json.
 * We write a workbook buffer and pipe it to the Express `Response` with the
 * correct XLSX content-type + Content-Disposition so the browser downloads it
 * with the right filename and file association.
 *
 * Design notes:
 * - `numFmt` is applied per column so columns that hold money render with the
 *   `$#,##0.00` Excel number format and quantities render as integers. That
 *   keeps the output tidy when the user opens the file in Excel.
 * - Multi-sheet support is built in (the `sheets` array). Every current
 *   consumer only passes one sheet, but the API is future-proof for reports
 *   that need a "summary + details" split.
 */
import type { Response } from 'express';
import ExcelJS from 'exceljs';

export interface XlsxColumnSpec {
  header: string;
  key: string;
  width?: number;
  /** Excel number format code, e.g. '$#,##0.00' for currency, '0' for int. */
  numFmt?: string;
}

export interface XlsxSheetSpec {
  name: string;
  columns: XlsxColumnSpec[];
  rows: Array<Record<string, unknown>>;
  freezeHeader?: boolean;
  autoFilter?: boolean;
  rowOptions?: (row: Record<string, unknown>, rowIndex: number) => {
    bold?: boolean;
    fillColor?: string;
    outlineLevel?: number;
    indentByKey?: Record<string, number>;
  } | undefined;
}

export interface XlsxExportOptions {
  filename: string;
  sheets: XlsxSheetSpec[];
}

/**
 * Build an XLSX workbook buffer from the provided sheet specs. Separated from
 * `sendXlsx` so tests can assert on the raw buffer without wiring up Express.
 */
export async function buildXlsxBuffer(sheets: XlsxSheetSpec[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Zack\'s Retail';
  workbook.created = new Date();

  for (const sheetSpec of sheets) {
    // Excel caps sheet names at 31 chars and disallows :\\/?*[] — we trim &
    // sanitize to avoid exceljs throwing on edge cases.
    const safeName = sheetSpec.name.slice(0, 31).replace(/[\\/?*:\[\]]/g, '_') || 'Sheet1';
    const sheet = workbook.addWorksheet(safeName);

    sheet.columns = sheetSpec.columns.map((c) => ({
      header: c.header,
      key: c.key,
      width: c.width ?? Math.max(12, c.header.length + 2),
    }));

    // Style header row — bold, slight fill. Kept minimal on purpose; the file
    // is meant to be opened + manipulated in Excel, not presented.
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: 'middle' };

    if (sheetSpec.freezeHeader) {
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
    }

    if (sheetSpec.autoFilter) {
      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: sheetSpec.columns.length },
      };
    }

    for (const [rowIndex, rowData] of sheetSpec.rows.entries()) {
      const row = sheet.addRow(rowData);
      const options = sheetSpec.rowOptions?.(rowData, rowIndex);
      if (!options) continue;

      if (options.outlineLevel != null) {
        row.outlineLevel = options.outlineLevel;
      }
      if (options.bold) {
        row.font = { ...row.font, bold: true };
      }
      if (options.fillColor) {
        row.eachCell((cell) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: options.fillColor },
          };
        });
      }
      if (options.indentByKey) {
        for (const [key, indent] of Object.entries(options.indentByKey)) {
          const cell = row.getCell(key);
          cell.alignment = { ...cell.alignment, indent };
        }
      }
    }

    // Apply per-column number formats. `sheet.getColumn(key)` only works after
    // rows are added because that's when the column is materialized.
    for (const col of sheetSpec.columns) {
      if (col.numFmt) {
        const column = sheet.getColumn(col.key);
        column.numFmt = col.numFmt;
      }
    }
  }

  // exceljs typings return ArrayBuffer | Buffer depending on platform; coerce
  // to Buffer since our consumers run in Node.
  const out = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(out) ? out : Buffer.from(out);
}

/**
 * Write an XLSX buffer to the given response with `attachment` disposition.
 */
export async function sendXlsx(res: Response, options: XlsxExportOptions): Promise<void> {
  const buffer = await buildXlsxBuffer(options.sheets);
  const safeFilename = options.filename.endsWith('.xlsx')
    ? options.filename
    : `${options.filename}.xlsx`;
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
  res.setHeader('Content-Length', String(buffer.byteLength));
  res.send(buffer);
}

// Common Excel number format codes, exported so routes don't duplicate string
// literals. Currency policy (see CLAUDE.md): render money as plain numbers
// with thousands separators and no currency symbol — the system is
// single-currency (Lempira) and the page surface labels the unit once.
// '#,##0.00' = two-decimal money. '0' renders integers. '0.00' is a
// two-decimal number (good for ratios, multipliers, etc.). '0.0%' is a
// percentage multiplied by 100 — we use '0.0' instead for values we
// pre-compute as percentages so Excel doesn't apply ×100 again.
export const XLSX_NUMFMT = {
  money: '#,##0.00',
  integer: '0',
  decimal2: '0.00',
  /** Pre-computed percentage (e.g. "53.3") — shows 1 decimal without ×100. */
  percent1: '0.0',
  date: 'yyyy-mm-dd',
} as const;
