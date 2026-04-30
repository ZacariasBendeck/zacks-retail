import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const baseDir = "E:/dev/zacks-retail/outputs/balancing_transfers_2026-04-28_132646";
const outputPath = path.join(baseDir, "balancing_transfers_2026-04-28_132646.xlsx");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell.length || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v !== ""));
}

function colName(n) {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

async function loadCsv(name) {
  const text = await fs.readFile(path.join(baseDir, name), "utf8");
  return parseCsv(text.replace(/^\uFEFF/, ""));
}

function writeMatrix(sheet, startRow, startCol, matrix) {
  if (!matrix.length || !matrix[0].length) return;
  const endRow = startRow + matrix.length - 1;
  const endCol = startCol + matrix[0].length - 1;
  sheet.getRange(`${colName(startCol)}${startRow}:${colName(endCol)}${endRow}`).values = matrix;
}

const workbook = Workbook.create();
const summary = JSON.parse(await fs.readFile(path.join(baseDir, "report_summary.json"), "utf8"));

const summarySheet = workbook.worksheets.add("Report Summary");
writeMatrix(summarySheet, 1, 1, [
  ["Field", "Value"],
  ["Source PDF", summary.source_pdf],
  ["Report date", summary.report_date],
  ["Report time", summary.report_time],
  ["Title", summary.title],
  ["Company", summary.company],
  ["Report name", summary.report_name],
  ["Selection", summary.selection_name],
  ["Mode", summary.mode],
  ["Sort order", summary.sort_order],
  ["Transfer basis", summary.transfer_basis],
  ["Selected stores", summary.selected_stores],
  ["Selected categories", summary.selected_categories],
  ["Selected seasons", summary.selected_seasons],
  ["Selected keywords", summary.selected_keywords],
  ["Pages", summary.pages],
  ["Transfer item rows", summary.transfer_item_rows],
  ["Transfer unit rows", summary.transfer_unit_rows],
  ["Total units to transfer", summary.total_units_to_transfer],
  ["Store pair count", summary.store_pair_count],
  ["Category count", summary.category_count],
  ["Exception rows consolidated", summary.exception_rows_consolidated],
  ["Exception rows raw", summary.exception_rows_raw],
  ["Parse warning count", summary.parse_warning_count],
]);

const sheets = [
  ["Transfer Items", "transfer_items.csv"],
  ["Units By Size", "transfer_units_by_size.csv"],
  ["Store Pair Summary", "store_pair_summary.csv"],
  ["Category Summary", "category_summary.csv"],
  ["Exceptions", "exceptions.csv"],
];

for (const [sheetName, fileName] of sheets) {
  const sheet = workbook.worksheets.add(sheetName);
  const rows = await loadCsv(fileName);
  writeMatrix(sheet, 1, 1, rows);
}

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(outputPath);
