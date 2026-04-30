import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const workbookPath = "E:/dev/zacks-retail/outputs/balancing_transfers_2026-04-28_132646/balancing_transfers_2026-04-28_132646.xlsx";
const input = await FileBlob.load(workbookPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const checks = [
  ["Report Summary", "A1:B24"],
  ["Transfer Items", "A1:U6"],
  ["Units By Size", "A1:T6"],
  ["Exceptions", "A1:L6"],
];

for (const [sheet, range] of checks) {
  const result = await workbook.inspect({
    kind: "table",
    range: `${sheet}!${range}`,
    include: "values",
    tableMaxRows: 8,
    tableMaxCols: 22,
  });
  console.log(`--- ${sheet} ---`);
  console.log(result.ndjson.split("\n").slice(0, 8).join("\n"));
}

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 20 },
  summary: "formula error scan",
});
console.log("--- Formula Errors ---");
console.log(errors.ndjson || "none");
