/**
 * Architecture Compliance Test: OTB Module Cross-Module Join Prevention
 *
 * Per ZAI-137 / ZAI-145 / ZAI-189:
 * The OTB module must NOT perform direct SQL joins against purchasing or inventory tables.
 * All cross-module data must flow through governed contract adapters.
 *
 * This test statically analyzes the OTB service source to detect prohibited patterns.
 */
import * as fs from 'fs';
import * as path from 'path';

const OTB_SERVICE_DIR = path.resolve(__dirname, '../src/services');
const OTB_ROUTES_DIR = path.resolve(__dirname, '../src/routes');

// Tables owned by other modules — OTB must not reference these directly
const PROHIBITED_TABLES = [
  'purchase_orders',
  'purchase_order_lines',
  'po_status_history',
  'po_receipts',
  'po_receipt_lines',
  'skus',
  'sku_sizes',
  'inventory',
  'inventory_audit_log',
  'sales_transactions',
  'vendors',
];

// OTB source files to check
const OTB_FILES = [
  'otbBudgetService.ts',
  'otbPolicyAuditService.ts',
];

const OTB_ROUTE_FILES = [
  'otbBudgetRoutes.ts',
];

function getFileContent(dir: string, filename: string): string | null {
  const filePath = path.join(dir, filename);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf-8');
}

describe('OTB Architecture Compliance', () => {
  describe('OTB services must not contain direct cross-module table references', () => {
    for (const filename of OTB_FILES) {
      it(`${filename} must not reference prohibited tables in SQL`, () => {
        const content = getFileContent(OTB_SERVICE_DIR, filename);
        if (!content) {
          // File may not exist yet — skip
          return;
        }

        // Remove import lines and comments to reduce false positives
        const lines = content.split('\n');
        const codeLines = lines.filter(
          (line) =>
            !line.trim().startsWith('import ') &&
            !line.trim().startsWith('//') &&
            !line.trim().startsWith('*')
        );
        const codeContent = codeLines.join('\n');

        for (const table of PROHIBITED_TABLES) {
          // Match table names in SQL context: preceded by FROM, JOIN, INTO, UPDATE, or table alias patterns
          const sqlPattern = new RegExp(
            `\\b(FROM|JOIN|INTO|UPDATE|DELETE\\s+FROM)\\s+${table}\\b`,
            'i'
          );
          expect(codeContent).not.toMatch(sqlPattern);
        }
      });
    }
  });

  describe('OTB routes must not import non-OTB services directly', () => {
    const PROHIBITED_IMPORTS = [
      'purchaseOrderService',
      'inventoryService',
      'skuService',
      'vendorService',
    ];

    for (const filename of OTB_ROUTE_FILES) {
      it(`${filename} must not import cross-module services`, () => {
        const content = getFileContent(OTB_ROUTES_DIR, filename);
        if (!content) return;

        for (const svc of PROHIBITED_IMPORTS) {
          expect(content).not.toContain(svc);
        }
      });
    }
  });

  describe('OTB services must use contract adapters for cross-module data', () => {
    it('otbBudgetService.ts must import the purchasing contract', () => {
      const content = getFileContent(OTB_SERVICE_DIR, 'otbBudgetService.ts');
      expect(content).not.toBeNull();
      expect(content!).toContain('purchasingContract');
    });
  });
});
