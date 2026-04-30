import ExcelJS from 'exceljs';
import type {
  CreateImportChargeInput,
  CreateImportInvoiceLineInput,
  CreateImportShipmentInput,
  CreateImportSupplierInvoiceInput,
  ImportChargeType,
  ImportInvoiceGroup,
  ImportInvoiceKind,
  ImportSourceCurrency,
  ImportWorkbookChargePreview,
  ImportWorkbookImportResult,
  ImportWorkbookLinePreview,
  ImportWorkbookOptions,
  ImportWorkbookPreview,
  ImportWorkbookSupplierInvoicePreview,
  ImportWorkbookVerificationCheckPreview,
} from '../models/importManagement';
import {
  addImportCharge,
  addImportInvoiceLine,
  addImportSupplierInvoice,
  allocateImportLandedCost,
  createImportShipment,
  getImportShipmentById,
  recordImportVerificationCheck,
} from './importManagementService';

class ImportWorkbookServiceError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function isImportWorkbookServiceError(err: unknown): err is ImportWorkbookServiceError {
  return err instanceof ImportWorkbookServiceError;
}

type Worksheet = ExcelJS.Worksheet;

const SOURCE_CURRENCIES = new Set<ImportSourceCurrency>(['CNY', 'USD', 'HNL']);
const TODAY = new Date().toISOString().slice(0, 10);

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function round4(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

function cleanString(value: unknown): string | null {
  const trimmed = String(value ?? '').replace(/\s+/g, ' ').trim();
  return trimmed ? trimmed : null;
}

function isPositive(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function rawCellValue(ws: Worksheet, row: number, col: number): unknown {
  const value = ws.getCell(row, col).value as any;
  if (value == null) return null;
  if (value instanceof Date) return value;
  if (typeof value !== 'object') return value;
  if ('result' in value && value.result != null) return value.result;
  if ('text' in value && value.text != null) return value.text;
  if (Array.isArray(value.richText)) return value.richText.map((part: { text?: string }) => part.text ?? '').join('');
  return null;
}

function cellText(ws: Worksheet, row: number, col: number): string | null {
  const value = rawCellValue(ws, row, col);
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return cleanString(value);
}

function cellNumber(ws: Worksheet, row: number, col: number): number | null {
  const value = rawCellValue(ws, row, col);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const normalized = value.replace(/,/g, '').trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function excelSerialDate(value: number): string | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const date = new Date(Math.round((value - 25569) * 86400 * 1000));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function cellDate(ws: Worksheet, row: number, col: number): string | null {
  const value = rawCellValue(ws, row, col);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') return excelSerialDate(value);
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
  }
  return null;
}

function firstTextInRow(ws: Worksheet, row: number, startCol: number, endCol: number): string | null {
  for (let col = startCol; col <= endCol; col += 1) {
    const value = cellText(ws, row, col);
    if (value) return value;
  }
  return null;
}

function findValueAfterLabel(ws: Worksheet, label: string, maxRows = 40, maxCols = 12): string | null {
  const needle = label.toLowerCase();
  for (let row = 1; row <= Math.min(ws.rowCount, maxRows); row += 1) {
    for (let col = 1; col <= Math.min(ws.columnCount, maxCols); col += 1) {
      const text = cellText(ws, row, col)?.toLowerCase();
      if (!text?.includes(needle)) continue;
      for (let offset = 1; offset <= 4; offset += 1) {
        const next = cellText(ws, row, col + offset);
        if (next && !next.toLowerCase().includes(needle)) return next;
      }
    }
  }
  return null;
}

function normalizeDateOption(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value.slice(0, 10) : parsed.toISOString().slice(0, 10);
}

function sourceCurrency(options: ImportWorkbookOptions, fallback: ImportSourceCurrency): ImportSourceCurrency {
  const requested = options.sourceCurrency ?? fallback;
  return SOURCE_CURRENCIES.has(requested) ? requested : fallback;
}

function resolveFxRate(
  currency: ImportSourceCurrency,
  options: ImportWorkbookOptions,
  workbookFxRate?: number | null,
): number | null {
  if (currency === 'HNL') return 1;
  if (isPositive(options.defaultFxRate ?? null)) return Number(options.defaultFxRate);
  if (isPositive(workbookFxRate ?? null)) return Number(workbookFxRate);
  return null;
}

function resolveFxDate(options: ImportWorkbookOptions, workbookDate?: string | null): string {
  return normalizeDateOption(options.defaultFxDate ?? null) ?? workbookDate ?? TODAY;
}

function moneyPreview(
  sourceAmount: number,
  sourceCurrencyValue: ImportSourceCurrency,
  fxRate: number | null,
  fxDate: string | null,
): Pick<ImportWorkbookLinePreview, 'sourceAmount' | 'sourceCurrency' | 'fxRate' | 'fxDate' | 'hnlAmount'> {
  return {
    sourceAmount: round4(sourceAmount),
    sourceCurrency: sourceCurrencyValue,
    fxRate,
    fxDate,
    hnlAmount: fxRate == null ? null : round2(sourceAmount * fxRate),
  };
}

function safeCode(value: string): string {
  return (
    value
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || `IMPORT-${Date.now()}`
  );
}

function addPreviewLine(invoice: ImportWorkbookSupplierInvoicePreview, line: ImportWorkbookLinePreview): void {
  invoice.lines.push(line);
}

function setInvoiceAmount(invoice: ImportWorkbookSupplierInvoicePreview, sourceAmount: number): void {
  const money = moneyPreview(sourceAmount, invoice.sourceCurrency, invoice.fxRate, invoice.fxDate);
  invoice.sourceAmount = money.sourceAmount;
  invoice.hnlAmount = money.hnlAmount;
}

function recomputeInvoiceFromLines(invoice: ImportWorkbookSupplierInvoicePreview): void {
  setInvoiceAmount(invoice, invoice.lines.reduce((sum, line) => sum + line.sourceAmount, 0));
}

function buildInvoice(input: {
  invoiceNumber: string;
  supplierName: string;
  supplierCode?: string | null;
  invoiceDate?: string | null;
  invoiceGroup?: ImportInvoiceGroup;
  invoiceKind?: ImportInvoiceKind;
  sourceAmount?: number;
  sourceCurrency: ImportSourceCurrency;
  fxRate: number | null;
  fxDate: string | null;
  notes?: string | null;
}): ImportWorkbookSupplierInvoicePreview {
  const sourceAmount = input.sourceAmount ?? 0;
  return {
    invoiceNumber: input.invoiceNumber,
    supplierCode: input.supplierCode ?? null,
    supplierName: input.supplierName,
    invoiceDate: input.invoiceDate ?? null,
    invoiceGroup: input.invoiceGroup ?? 'TAXABLE',
    invoiceKind: input.invoiceKind ?? 'MERCHANDISE',
    notes: input.notes ?? null,
    lines: [],
    ...moneyPreview(sourceAmount, input.sourceCurrency, input.fxRate, input.fxDate),
  };
}

function lineQuantity(values: Array<number | null>): number {
  const positives = values.filter(isPositive);
  const total = positives.reduce((sum, value) => sum + value, 0);
  return total > 0 ? round4(total) : 1;
}

function buildLine(input: {
  lineNumber: number;
  itemCode?: string | null;
  styleCode?: string | null;
  description?: string | null;
  materialMeters?: number | null;
  quantity: number;
  unitOfMeasure: string;
  sourceUnitCost?: number | null;
  sourceAmount: number;
  sourceCurrency: ImportSourceCurrency;
  fxRate: number | null;
  fxDate: string | null;
  taxable?: boolean;
}): ImportWorkbookLinePreview {
  const sourceUnitCost = input.sourceUnitCost ?? (input.quantity > 0 ? round4(input.sourceAmount / input.quantity) : null);
  return {
    lineNumber: input.lineNumber,
    itemCode: cleanString(input.itemCode),
    styleCode: cleanString(input.styleCode),
    description: cleanString(input.description),
    materialMeters: input.materialMeters ?? null,
    quantity: input.quantity,
    unitOfMeasure: input.unitOfMeasure,
    sourceUnitCost,
    taxable: input.taxable ?? true,
    ...moneyPreview(input.sourceAmount, input.sourceCurrency, input.fxRate, input.fxDate),
  };
}

function buildCharge(input: {
  chargeType: ImportChargeType;
  sourceAmount: number;
  sourceCurrency: ImportSourceCurrency;
  fxRate: number | null;
  fxDate: string | null;
  counterparty?: string | null;
  documentNumber?: string | null;
  taxable?: boolean;
  estimated?: boolean;
  final?: boolean;
  notes?: string | null;
}): ImportWorkbookChargePreview {
  return {
    chargeType: input.chargeType,
    counterparty: input.counterparty ?? null,
    documentNumber: input.documentNumber ?? null,
    taxable: input.taxable ?? false,
    estimated: input.estimated ?? true,
    final: input.final ?? false,
    notes: input.notes ?? null,
    ...moneyPreview(input.sourceAmount, input.sourceCurrency, input.fxRate, input.fxDate),
  };
}

function totalsForPreview(
  invoices: ImportWorkbookSupplierInvoicePreview[],
  charges: ImportWorkbookChargePreview[],
): ImportWorkbookPreview['totals'] {
  const invoiceHnlValues = invoices.map((invoice) => invoice.hnlAmount);
  const chargeHnlValues = charges.map((charge) => charge.hnlAmount);
  return {
    invoiceSourceTotal: round4(invoices.reduce((sum, invoice) => sum + invoice.sourceAmount, 0)),
    invoiceHnlTotal: invoiceHnlValues.some((value) => value == null)
      ? null
      : round2(invoiceHnlValues.reduce<number>((sum, value) => sum + Number(value), 0)),
    chargeHnlTotal: chargeHnlValues.some((value) => value == null)
      ? null
      : round2(chargeHnlValues.reduce<number>((sum, value) => sum + Number(value), 0)),
    invoiceCount: invoices.length,
    lineCount: invoices.reduce((sum, invoice) => sum + invoice.lines.length, 0),
    chargeCount: charges.length,
  };
}

function suitProformaDetected(workbook: ExcelJS.Workbook): boolean {
  const ws = workbook.worksheets[0];
  if (!ws) return false;
  return Boolean(cellText(ws, 8, 1)?.toLowerCase().includes('proforma invoice') || cellText(ws, 6, 25)?.toLowerCase().includes('pi'));
}

function panamaLiquidationDetected(workbook: ExcelJS.Workbook): boolean {
  return Boolean(workbook.getWorksheet('Liquidacion Importaciones') && workbook.getWorksheet('Liquidacion para Costo'));
}

function pushSuitLineWarnings(
  warnings: string[],
  invoices: ImportWorkbookSupplierInvoicePreview[],
  statedGrandTotal: number | null,
): ImportWorkbookVerificationCheckPreview[] {
  const actualSourceTotal = round4(
    invoices.flatMap((invoice) => invoice.lines).reduce((sum, line) => sum + line.sourceAmount, 0),
  );
  const checks: ImportWorkbookVerificationCheckPreview[] = [];
  if (statedGrandTotal != null) {
    const variance = round2(actualSourceTotal - statedGrandTotal);
    checks.push({
      checkCode: 'SUIT_PROFORMA_TOTAL',
      status: Math.abs(variance) <= 0.01 ? 'PASS' : 'WARN',
      expectedHnlAmount: null,
      actualHnlAmount: null,
      varianceHnlAmount: null,
      message:
        Math.abs(variance) <= 0.01
          ? 'Parsed fabric, CMT, accessory, and finished-goods source totals reconcile to the workbook grand total.'
          : `Parsed source total ${actualSourceTotal} differs from workbook grand total ${statedGrandTotal}.`,
    });
    if (Math.abs(variance) > 0.01) {
      warnings.push(`Suit proforma parsed total ${actualSourceTotal} differs from workbook grand total ${statedGrandTotal}.`);
    }
  }
  return checks;
}

function parseSuitProforma(
  workbook: ExcelJS.Workbook,
  fileName: string,
  options: ImportWorkbookOptions,
): ImportWorkbookPreview {
  const ws = workbook.worksheets[0];
  if (!ws) {
    throw new ImportWorkbookServiceError(422, 'EMPTY_WORKBOOK', 'Workbook has no worksheets.');
  }

  const piNumber = cellText(ws, 6, 26) ?? cellText(ws, 6, 25) ?? 'SUIT-PROFORMA';
  const invoiceDate = cellDate(ws, 5, 26) ?? cellDate(ws, 5, 25);
  const currency = sourceCurrency(options, 'CNY');
  const fxRate = resolveFxRate(currency, options);
  const fxDate = resolveFxDate(options, invoiceDate);
  const warnings: string[] = [];

  if (fxRate == null) {
    warnings.push('CNY proforma source amounts need an FX rate before this workbook can be imported to HNL.');
  }

  const invoicesByKey = new Map<string, ImportWorkbookSupplierInvoicePreview>();
  const getInvoice = (
    key: string,
    suffix: string,
    supplierName: string,
    invoiceKind: ImportInvoiceKind,
    notes: string,
  ): ImportWorkbookSupplierInvoicePreview => {
    const existing = invoicesByKey.get(key);
    if (existing) return existing;
    const invoice = buildInvoice({
      invoiceNumber: `${piNumber}-${suffix}`,
      supplierName,
      invoiceDate,
      invoiceKind,
      invoiceGroup: 'TAXABLE',
      sourceCurrency: currency,
      fxRate,
      fxDate,
      notes,
    });
    invoicesByKey.set(key, invoice);
    return invoice;
  };

  let nextLineNumber = 1;
  for (let row = 10; row <= Math.min(ws.rowCount, 39); row += 1) {
    const lineType = cellText(ws, row, 1);
    const amount = cellNumber(ws, row, 26);
    const itemNo = cellText(ws, row, 3);
    const color = cellText(ws, row, 2);
    const typeVersion = cellText(ws, row, 27);

    if (lineType === 'CMT') {
      const fabricAmount = cellNumber(ws, row, 8);
      const fabricSupplier = cellText(ws, row, 9) ?? 'Fabric supplier';
      const meters = cellNumber(ws, row, 7);
      const meterPrice = cellNumber(ws, row, 6);
      if (isPositive(fabricAmount)) {
        addPreviewLine(
          getInvoice(
            `FABRIC:${fabricSupplier}`,
            `FABRIC-${safeCode(fabricSupplier).slice(0, 24)}`,
            fabricSupplier,
            'FABRIC',
            'Material purchased by meter from the suit proforma.',
          ),
          buildLine({
            lineNumber: nextLineNumber,
            itemCode: itemNo,
            styleCode: typeVersion,
            description: `Fabric ${color ?? ''} ${itemNo ?? ''}`.trim(),
            materialMeters: meters ?? null,
            quantity: meters ?? 1,
            unitOfMeasure: 'METER',
            sourceUnitCost: meterPrice,
            sourceAmount: fabricAmount,
            sourceCurrency: currency,
            fxRate,
            fxDate,
          }),
        );
        nextLineNumber += 1;
      }

      if (isPositive(amount)) {
        const quantity = lineQuantity([cellNumber(ws, row, 15), cellNumber(ws, row, 16), cellNumber(ws, row, 17), cellNumber(ws, row, 18)]);
        addPreviewLine(
          getInvoice(
            'CMT',
            'CMT',
            'KS Forwarding CMT Factory',
            'CMT',
            'Cut-make-trim labor/components from the suit proforma.',
          ),
          buildLine({
            lineNumber: nextLineNumber,
            itemCode: itemNo,
            styleCode: typeVersion,
            description: `CMT labor ${color ?? ''} ${itemNo ?? ''}`.trim(),
            quantity,
            unitOfMeasure: 'UNIT',
            sourceAmount: amount,
            sourceCurrency: currency,
            fxRate,
            fxDate,
          }),
        );
        nextLineNumber += 1;
      }
      continue;
    }

    if (lineType === 'Suits' && isPositive(amount)) {
      const quantity = lineQuantity([
        cellNumber(ws, row, 14),
        cellNumber(ws, row, 15),
        cellNumber(ws, row, 16),
        cellNumber(ws, row, 17),
        cellNumber(ws, row, 18),
      ]);
      const fabricReference = cellText(ws, row, 8);
      const supplierReference = cellText(ws, row, 9);
      addPreviewLine(
        getInvoice(
          'FINISHED-SUITS',
          'FINISHED-SUITS',
          'KS Forwarding Finished Goods',
          'MERCHANDISE',
          'Finished suit merchandise from the proforma.',
        ),
        buildLine({
          lineNumber: nextLineNumber,
          itemCode: itemNo,
          styleCode: typeVersion,
          description: [`Finished suits ${color ?? ''} ${itemNo ?? ''}`.trim(), fabricReference, supplierReference]
            .filter(Boolean)
            .join(' | '),
          quantity,
          unitOfMeasure: 'UNIT',
          sourceAmount: amount,
          sourceCurrency: currency,
          fxRate,
          fxDate,
        }),
      );
      nextLineNumber += 1;
      continue;
    }

    const accessoryLabel = itemNo ?? cellText(ws, row, 14);
    if (!lineType && row <= 35 && isPositive(amount) && accessoryLabel) {
      const quantity = lineQuantity([cellNumber(ws, row, 14), cellNumber(ws, row, 15), cellNumber(ws, row, 16)]);
      addPreviewLine(
        getInvoice(
          'ACCESSORIES',
          'ACCESSORIES',
          'KS Forwarding Accessories',
          'ACCESSORY',
          'Accessory lines from the suit proforma.',
        ),
        buildLine({
          lineNumber: nextLineNumber,
          itemCode: accessoryLabel,
          description: accessoryLabel,
          quantity,
          unitOfMeasure: 'UNIT',
          sourceUnitCost: cellNumber(ws, row, 24),
          sourceAmount: amount,
          sourceCurrency: currency,
          fxRate,
          fxDate,
        }),
      );
      nextLineNumber += 1;
    }
  }

  const supplierInvoices = [...invoicesByKey.values()];
  supplierInvoices.forEach(recomputeInvoiceFromLines);
  const verificationChecks = pushSuitLineWarnings(warnings, supplierInvoices, cellNumber(ws, 39, 26));

  return {
    kind: 'SUIT_PROFORMA',
    fileName,
    shipment: {
      shipmentNumber: options.shipmentNumber?.trim() || safeCode(piNumber),
      displayName: options.displayName?.trim() || `Suit proforma ${piNumber}`,
      sourceWorkbookName: fileName,
      notes:
        'Imported from suit proforma workbook. Fabric-by-meter, CMT labor, accessories, and finished goods are split into separate supplier invoice groups.',
    },
    supplierInvoices,
    charges: [],
    verificationChecks,
    totals: totalsForPreview(supplierInvoices, []),
    warnings,
  };
}

function panamaChargeTypeFromText(text: string): ImportChargeType {
  const normalized = text.toLowerCase();
  if (normalized.includes('seguro')) return 'INSURANCE';
  if (normalized.includes('interno')) return 'LOCAL_FREIGHT';
  return 'FREIGHT';
}

function parsePanamaVerificationChecks(workbook: ExcelJS.Workbook): ImportWorkbookVerificationCheckPreview[] {
  const ws = workbook.getWorksheet('VERIFICACION');
  if (!ws) return [];
  const rows: Array<{ row: number; code: string; message: string }> = [
    { row: 8, code: 'TAXABLE_INVOICE_COUNT', message: 'Taxable invoice count verification from workbook.' },
    { row: 11, code: 'NON_TAXABLE_INVOICE_COUNT', message: 'Non-taxable invoice count verification from workbook.' },
    { row: 17, code: 'TAXABLE_INVOICE_VALUE', message: 'Taxable invoice value verification from workbook.' },
    { row: 26, code: 'MERCHANDISE_TOTAL', message: 'Merchandise total verification from workbook.' },
    { row: 29, code: 'INTERNAL_FREIGHT_TOTAL', message: 'Internal freight verification from workbook.' },
    { row: 35, code: 'TOTAL_PAYABLE_INVOICES', message: 'Total payable invoice verification from workbook.' },
  ];
  return rows.map((candidate) => {
    const rowText = Array.from({ length: Math.min(ws.columnCount, 12) }, (_value, idx) => cellText(ws, candidate.row, idx + 1))
      .filter(Boolean)
      .join(' ');
    const status = rowText.toUpperCase().includes('OK') ? 'PASS' : rowText.toUpperCase().includes('ERROR') ? 'FAIL' : 'WARN';
    return {
      checkCode: candidate.code,
      status,
      expectedHnlAmount: null,
      actualHnlAmount: null,
      varianceHnlAmount: null,
      message: `${candidate.message} ${rowText}`.trim(),
    };
  });
}

function parsePanamaLiquidation(
  workbook: ExcelJS.Workbook,
  fileName: string,
  options: ImportWorkbookOptions,
): ImportWorkbookPreview {
  const summary = workbook.getWorksheet('Liquidacion Importaciones');
  const cost = workbook.getWorksheet('Liquidacion para Costo');
  if (!summary || !cost) {
    throw new ImportWorkbookServiceError(422, 'INVALID_WORKBOOK', 'Panama liquidation workbook is missing required sheets.');
  }

  const workbookFxRate = cellNumber(summary, 7, 3) ?? cellNumber(summary, 1, 8) ?? cellNumber(cost, 7, 19);
  const fxRate = resolveFxRate('USD', options, workbookFxRate);
  const fxDate = resolveFxDate(options, cellDate(summary, 2, 3) ?? cellDate(cost, 7, 3));
  const displayName = cellText(summary, 4, 3) ?? firstTextInRow(cost, 5, 1, 7) ?? 'Panama liquidation';
  const cargoNumber = cellNumber(summary, 3, 7) ?? cellNumber(cost, 4, 5);
  const policyNumber = cellText(summary, 3, 3) ?? cellText(cost, 7, 4);
  const blNumber = cellText(summary, 8, 3) ?? findValueAfterLabel(summary, 'BL');
  const arrivalDate = cellDate(summary, 2, 3) ?? cellDate(cost, 7, 3);
  const warnings: string[] = [];

  if (fxRate == null) {
    warnings.push('USD liquidation source amounts need an FX rate before this workbook can be imported to HNL.');
  }

  const supplierInvoices: ImportWorkbookSupplierInvoicePreview[] = [];
  for (let row = 10; row <= cost.rowCount; row += 1) {
    const supplierName = cellText(cost, row, 2);
    const invoiceNumber = cellText(cost, row, 3);
    const merchandiseAmount = cellNumber(cost, row, 8);
    const payableAmount = cellNumber(cost, row, 10) ?? merchandiseAmount;
    if (!supplierName || !invoiceNumber || !isPositive(payableAmount)) continue;

    supplierInvoices.push(
      buildInvoice({
        invoiceNumber,
        supplierName,
        invoiceDate: cellDate(cost, row, 4),
        invoiceGroup: cellNumber(cost, row, 12) === 0 ? 'NON_TAXABLE' : 'TAXABLE',
        invoiceKind: 'MERCHANDISE',
        sourceAmount: payableAmount,
        sourceCurrency: 'USD',
        fxRate,
        fxDate,
        notes:
          merchandiseAmount != null && Math.abs(payableAmount - merchandiseAmount) > 0.01
            ? `Workbook payable includes ${round2(payableAmount - merchandiseAmount)} USD internal freight or adjustments.`
            : null,
      }),
    );
  }

  supplierInvoices.forEach((invoice, index) => {
    const sheet = workbook.getWorksheet(String(index + 1));
    if (!sheet) {
      warnings.push(`Missing detail sheet ${index + 1} for invoice ${invoice.invoiceNumber}.`);
      return;
    }

    for (let row = 17; row <= sheet.rowCount; row += 1) {
      const sourceAmount = cellNumber(sheet, row, 11);
      const quantity = cellNumber(sheet, row, 8) ?? cellNumber(sheet, row, 7) ?? cellNumber(sheet, row, 6);
      const itemCode = cellText(sheet, row, 3);
      const styleCode = cellText(sheet, row, 2);
      if (!isPositive(sourceAmount) || !isPositive(quantity) || (!itemCode && !styleCode)) continue;
      addPreviewLine(
        invoice,
        buildLine({
          lineNumber: cellNumber(sheet, row, 1) ?? invoice.lines.length + 1,
          itemCode,
          styleCode,
          description: [styleCode, itemCode].filter(Boolean).join(' '),
          quantity,
          unitOfMeasure: 'UNIT',
          sourceUnitCost: cellNumber(sheet, row, 9),
          sourceAmount,
          sourceCurrency: 'USD',
          fxRate,
          fxDate,
        }),
      );
    }

    const detailTotal = cellNumber(sheet, 10, 11);
    const lineTotal = round4(invoice.lines.reduce((sum, line) => sum + line.sourceAmount, 0));
    if (detailTotal != null && Math.abs(detailTotal - lineTotal) > 0.01) {
      warnings.push(`Detail sheet ${sheet.name} line total ${lineTotal} differs from workbook subtotal ${detailTotal}.`);
    }
  });

  const usdCharges: Array<{ row: number; type: ImportChargeType; notes: string }> = [
    { row: 7, type: 'FREIGHT', notes: 'Flete Terrestre' },
    { row: 8, type: 'INSURANCE', notes: 'Seguro Mds.' },
    { row: 10, type: 'LOCAL_FREIGHT', notes: 'Flete Internos' },
  ];
  const charges = usdCharges
    .map((entry) => {
      const sourceAmount = cellNumber(summary, entry.row, 8);
      if (!isPositive(sourceAmount)) return null;
      return buildCharge({
        chargeType: entry.type,
        sourceAmount,
        sourceCurrency: 'USD',
        fxRate,
        fxDate,
        counterparty: 'Freight / Insurance',
        notes: entry.notes,
        final: true,
        estimated: false,
      });
    })
    .filter((charge): charge is ImportWorkbookChargePreview => charge != null);

  const fallbackFreightRows = [19, 20, 22];
  if (charges.length === 0) {
    for (const row of fallbackFreightRows) {
      const sourceAmount = cellNumber(summary, row, 4);
      const detail = cellText(summary, row, 5) ?? 'Flete';
      if (!isPositive(sourceAmount)) continue;
      charges.push(
        buildCharge({
          chargeType: panamaChargeTypeFromText(detail),
          sourceAmount,
          sourceCurrency: 'USD',
          fxRate,
          fxDate,
          counterparty: 'Freight / Insurance',
          notes: detail,
          final: true,
          estimated: false,
        }),
      );
    }
  }

  const taxAmount = cellNumber(summary, 11, 4);
  const agencyAmount = cellNumber(summary, 12, 4);
  const dutyAmount = cellNumber(summary, 13, 4);
  if (isPositive(taxAmount)) {
    charges.push(
      buildCharge({
        chargeType: 'TAX',
        sourceAmount: taxAmount,
        sourceCurrency: 'HNL',
        fxRate: 1,
        fxDate,
        counterparty: 'Customs / Tax Authority',
        notes: 'Impuestos 15%',
        final: true,
        estimated: false,
      }),
    );
  }
  if (isPositive(agencyAmount)) {
    charges.push(
      buildCharge({
        chargeType: 'CUSTOMS_AGENCY',
        sourceAmount: agencyAmount,
        sourceCurrency: 'HNL',
        fxRate: 1,
        fxDate,
        counterparty: 'Customs Broker',
        notes: 'Gastos A.A.I',
        final: true,
        estimated: false,
      }),
    );
  }
  if (isPositive(dutyAmount)) {
    charges.push(
      buildCharge({
        chargeType: 'DUTY',
        sourceAmount: dutyAmount,
        sourceCurrency: 'HNL',
        fxRate: 1,
        fxDate,
        counterparty: 'Customs / Tax Authority',
        notes: 'Aranceles',
        final: true,
        estimated: false,
      }),
    );
  }

  return {
    kind: 'PANAMA_LIQUIDATION',
    fileName,
    shipment: {
      shipmentNumber: options.shipmentNumber?.trim() || safeCode(`PANAMA-${cargoNumber ?? displayName}`),
      displayName: options.displayName?.trim() || displayName,
      customsPolicyNumber: policyNumber,
      blNumber,
      expectedArrivalAt: arrivalDate,
      actualArrivalAt: arrivalDate,
      sourceWorkbookName: fileName,
      notes:
        'Imported from Panama loose-cargo liquidation workbook. Supplier invoice lines use source USD merchandise values; freight, insurance, customs duties, taxes, and agency fees are separate landed-cost charges.',
    },
    supplierInvoices,
    charges,
    verificationChecks: parsePanamaVerificationChecks(workbook),
    totals: totalsForPreview(supplierInvoices, charges),
    warnings,
  };
}

function unknownPreview(fileName: string, options: ImportWorkbookOptions): ImportWorkbookPreview {
  const shipment: CreateImportShipmentInput = {
    shipmentNumber: options.shipmentNumber?.trim() || safeCode(fileName.replace(/\.xlsx$/i, '')),
    displayName: options.displayName?.trim() || fileName.replace(/\.xlsx$/i, ''),
    sourceWorkbookName: fileName,
    notes: 'Workbook layout was not recognized by the Import Management parser.',
  };
  return {
    kind: 'UNKNOWN',
    fileName,
    shipment,
    supplierInvoices: [],
    charges: [],
    verificationChecks: [],
    totals: totalsForPreview([], []),
    warnings: ['Workbook layout was not recognized. Expected a suit proforma or Panama liquidation workbook.'],
  };
}

export async function parseImportWorkbook(
  buffer: Buffer,
  fileName: string,
  options: ImportWorkbookOptions = {},
): Promise<ImportWorkbookPreview> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);

  if (panamaLiquidationDetected(workbook)) {
    return parsePanamaLiquidation(workbook, fileName, options);
  }
  if (suitProformaDetected(workbook)) {
    return parseSuitProforma(workbook, fileName, options);
  }
  return unknownPreview(fileName, options);
}

function assertMoneyImportable(value: { fxRate: number | null; fxDate: string | null }, label: string): asserts value is {
  fxRate: number;
  fxDate: string;
} {
  if (value.fxRate == null || value.fxDate == null) {
    throw new ImportWorkbookServiceError(422, 'FX_RATE_REQUIRED', `${label} needs a valid FX rate and FX date before import.`);
  }
}

function assertPreviewImportable(preview: ImportWorkbookPreview): void {
  if (preview.kind === 'UNKNOWN') {
    throw new ImportWorkbookServiceError(422, 'UNSUPPORTED_WORKBOOK', 'Workbook layout was not recognized.');
  }
  if (preview.supplierInvoices.length === 0 || preview.totals.lineCount === 0) {
    throw new ImportWorkbookServiceError(422, 'NO_IMPORT_LINES', 'Workbook did not produce any import invoice lines.');
  }
  for (const invoice of preview.supplierInvoices) {
    assertMoneyImportable(invoice, `Invoice ${invoice.invoiceNumber}`);
    for (const line of invoice.lines) {
      assertMoneyImportable(line, `Line ${line.lineNumber} on invoice ${invoice.invoiceNumber}`);
    }
  }
  for (const charge of preview.charges) {
    assertMoneyImportable(charge, `Charge ${charge.chargeType}`);
  }
}

export async function importWorkbook(
  buffer: Buffer,
  fileName: string,
  options: ImportWorkbookOptions = {},
  actor: string | null = null,
): Promise<ImportWorkbookImportResult> {
  const preview = await parseImportWorkbook(buffer, fileName, options);
  assertPreviewImportable(preview);

  let shipment = await createImportShipment(preview.shipment, actor);

  for (const invoicePreview of preview.supplierInvoices) {
    assertMoneyImportable(invoicePreview, `Invoice ${invoicePreview.invoiceNumber}`);
    const invoicePayload: CreateImportSupplierInvoiceInput = {
      invoiceNumber: invoicePreview.invoiceNumber,
      supplierCode: invoicePreview.supplierCode,
      supplierName: invoicePreview.supplierName,
      invoiceDate: invoicePreview.invoiceDate,
      invoiceGroup: invoicePreview.invoiceGroup,
      invoiceKind: invoicePreview.invoiceKind,
      sourceAmount: invoicePreview.sourceAmount,
      sourceCurrency: invoicePreview.sourceCurrency,
      fxRate: invoicePreview.fxRate,
      fxDate: invoicePreview.fxDate,
      notes: invoicePreview.notes,
    };
    shipment = await addImportSupplierInvoice(shipment.id, invoicePayload);
    const createdInvoice = shipment.supplierInvoices.find((invoice) => invoice.invoiceNumber === invoicePreview.invoiceNumber);
    if (!createdInvoice) {
      throw new ImportWorkbookServiceError(500, 'INVOICE_IMPORT_FAILED', `Could not locate created invoice ${invoicePreview.invoiceNumber}.`);
    }

    for (const linePreview of invoicePreview.lines) {
      assertMoneyImportable(linePreview, `Line ${linePreview.lineNumber} on invoice ${invoicePreview.invoiceNumber}`);
      const linePayload: CreateImportInvoiceLineInput = {
        lineNumber: linePreview.lineNumber,
        itemCode: linePreview.itemCode,
        styleCode: linePreview.styleCode,
        description: linePreview.description,
        materialMeters: linePreview.materialMeters,
        quantity: linePreview.quantity,
        unitOfMeasure: linePreview.unitOfMeasure,
        sourceUnitCost: linePreview.sourceUnitCost,
        sourceAmount: linePreview.sourceAmount,
        sourceCurrency: linePreview.sourceCurrency,
        fxRate: linePreview.fxRate,
        fxDate: linePreview.fxDate,
        taxable: linePreview.taxable,
      };
      shipment = await addImportInvoiceLine(createdInvoice.id, linePayload);
    }
  }

  for (const chargePreview of preview.charges) {
    assertMoneyImportable(chargePreview, `Charge ${chargePreview.chargeType}`);
    const chargePayload: CreateImportChargeInput = {
      chargeType: chargePreview.chargeType,
      counterparty: chargePreview.counterparty,
      documentNumber: chargePreview.documentNumber,
      sourceAmount: chargePreview.sourceAmount,
      sourceCurrency: chargePreview.sourceCurrency,
      fxRate: chargePreview.fxRate,
      fxDate: chargePreview.fxDate,
      taxable: chargePreview.taxable,
      estimated: chargePreview.estimated,
      final: chargePreview.final,
      notes: chargePreview.notes,
    };
    shipment = await addImportCharge(shipment.id, chargePayload);
  }

  for (const check of preview.verificationChecks) {
    shipment = await recordImportVerificationCheck(shipment.id, check);
  }

  const allocation = await allocateImportLandedCost(shipment.id, { markupFactor: options.markupFactor ?? undefined });
  shipment = (await getImportShipmentById(shipment.id)) ?? shipment;

  return {
    preview,
    shipment,
    allocation,
  };
}
