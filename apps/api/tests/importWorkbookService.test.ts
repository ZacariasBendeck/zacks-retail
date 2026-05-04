import ExcelJS from 'exceljs';
import { parseImportWorkbook } from '../src/services/importWorkbookService';

async function toBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
  const out = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
}

describe('Import workbook parser', () => {
  it('parses suit proformas into fabric-by-meter, CMT, and finished-goods invoices', async () => {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Sheet1');
    ws.getCell(5, 26).value = new Date('2025-05-23T00:00:00Z');
    ws.getCell(6, 25).value = 'PI NO.:';
    ws.getCell(6, 26).value = 'KSPI2025052305';
    ws.getCell(8, 1).value = 'Proforma Invoice';

    ws.getCell(10, 1).value = 'CMT';
    ws.getCell(10, 2).value = 'Navy';
    ws.getCell(10, 3).value = '230#';
    ws.getCell(10, 6).value = 18.5;
    ws.getCell(10, 7).value = 10;
    ws.getCell(10, 8).value = 185;
    ws.getCell(10, 9).value = 'BaoLi Textile';
    ws.getCell(10, 15).value = 2;
    ws.getCell(10, 16).value = 2;
    ws.getCell(10, 19).value = 76;
    ws.getCell(10, 20).value = 25;
    ws.getCell(10, 26).value = 202;
    ws.getCell(10, 27).value = 'Slim Fit';

    ws.getCell(19, 1).value = 'Suits';
    ws.getCell(19, 2).value = 'Black';
    ws.getCell(19, 3).value = 'A62';
    ws.getCell(19, 8).value = 'TaiSiDiNi Fabric';
    ws.getCell(19, 9).value = 'Jia Rong Textile';
    ws.getCell(19, 14).value = 3;
    ws.getCell(19, 22).value = 180;
    ws.getCell(19, 26).value = 540;
    ws.getCell(19, 27).value = 'Regular fit';
    ws.getCell(39, 26).value = 927;

    const preview = await parseImportWorkbook(await toBuffer(workbook), 'suits.xlsx', {
      defaultFxRate: 3,
      defaultFxDate: '2026-04-29',
    });

    expect(preview.kind).toBe('SUIT_PROFORMA');
    expect(preview.shipment.shipmentNumber).toBe('KSPI2025052305');
    expect(preview.totals.invoiceCount).toBe(3);
    expect(preview.totals.lineCount).toBe(3);
    expect(preview.totals.invoiceHnlTotal).toBe(2781);
    expect(preview.supplierInvoices.map((invoice) => invoice.invoiceKind).sort()).toEqual([
      'CMT',
      'FABRIC',
      'MERCHANDISE',
    ]);
    expect(preview.supplierInvoices.find((invoice) => invoice.invoiceKind === 'FABRIC')?.lines[0]).toMatchObject({
      unitOfMeasure: 'METER',
      materialMeters: 10,
      sourceAmount: 185,
      sourceCurrency: 'CNY',
      costRole: 'MATERIAL',
      receiptPolicy: 'ROLL_TO_OUTPUT',
      allocationGroupKey: 'KSPI2025052305-SUITS',
    });
    expect(preview.supplierInvoices.find((invoice) => invoice.invoiceKind === 'CMT')?.lines[0]).toMatchObject({
      costRole: 'CONVERSION',
      receiptPolicy: 'ROLL_TO_OUTPUT',
      allocationGroupKey: 'KSPI2025052305-SUITS',
    });
    expect(preview.supplierInvoices.find((invoice) => invoice.invoiceKind === 'MERCHANDISE')?.lines[0]).toMatchObject({
      costRole: 'FINISHED_GOOD',
      receiptPolicy: 'RECEIVE_TO_STOCK',
      allocationGroupKey: 'KSPI2025052305-SUITS',
    });
    expect(preview.verificationChecks[0]).toMatchObject({ checkCode: 'SUIT_PROFORMA_TOTAL', status: 'PASS' });
  });

  it('parses Panama liquidations into invoice lines and landed-cost charges', async () => {
    const workbook = new ExcelJS.Workbook();
    const summary = workbook.addWorksheet('Liquidacion Importaciones');
    summary.getCell(2, 3).value = new Date('2025-11-30T00:00:00Z');
    summary.getCell(3, 3).value = '250014040879S';
    summary.getCell(3, 7).value = 86;
    summary.getCell(4, 3).value = 'CARGA SUELTA PANAMA # 2 IB';
    summary.getCell(7, 3).value = 26.4583;
    summary.getCell(7, 8).value = 965;
    summary.getCell(8, 3).value = 'CFZTGU11112502';
    summary.getCell(8, 8).value = 490;
    summary.getCell(10, 8).value = 170;
    summary.getCell(11, 4).value = 292183.82;
    summary.getCell(12, 4).value = 36872.89;
    summary.getCell(13, 4).value = 250331.96;

    const cost = workbook.addWorksheet('Liquidacion para Costo');
    cost.getCell(4, 5).value = 86;
    cost.getCell(7, 3).value = new Date('2025-11-29T00:00:00Z');
    cost.getCell(7, 19).value = 26.4583;
    cost.getCell(10, 2).value = 'Magic Trading';
    cost.getCell(10, 3).value = '84458';
    cost.getCell(10, 4).value = new Date('2025-11-11T00:00:00Z');
    cost.getCell(10, 8).value = 240;
    cost.getCell(10, 9).value = 10;
    cost.getCell(10, 10).value = 250;
    cost.getCell(10, 12).value = 1;

    const detail = workbook.addWorksheet('1');
    detail.getCell(10, 11).value = 240;
    detail.getCell(17, 1).value = 1;
    detail.getCell(17, 2).value = 'PANT';
    detail.getCell(17, 3).value = 'BFLP40101';
    detail.getCell(17, 8).value = 24;
    detail.getCell(17, 9).value = 10;
    detail.getCell(17, 11).value = 240;

    const preview = await parseImportWorkbook(await toBuffer(workbook), 'panama.xlsx');

    expect(preview.kind).toBe('PANAMA_LIQUIDATION');
    expect(preview.shipment.shipmentNumber).toBe('PANAMA-86');
    expect(preview.shipment.customsPolicyNumber).toBe('250014040879S');
    expect(preview.supplierInvoices).toHaveLength(1);
    expect(preview.supplierInvoices[0].lines[0]).toMatchObject({
      itemCode: 'BFLP40101',
      styleCode: 'PANT',
      quantity: 24,
      sourceAmount: 240,
      sourceCurrency: 'USD',
      fxRate: 26.4583,
    });
    expect(preview.charges.map((charge) => charge.chargeType)).toEqual([
      'FREIGHT',
      'INSURANCE',
      'LOCAL_FREIGHT',
      'TAX',
      'CUSTOMS_AGENCY',
      'DUTY',
    ]);
  });
});
