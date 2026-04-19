import type {
  MockCasePack,
  MockOpenPo,
  MockSku,
  MockStore,
  MockVendor,
  SizeType,
} from '../types/purchasingSpec'

// Cell key format used across case packs + per-line size quantities.
export const cellKey = (columnLabel: string, rowLabel: string) =>
  `${columnLabel}|${rowLabel}`

// Mock size types — shape mirrors RISIZE.MDB `SizeTypes` (Code, Desc,
// ColumnDesc/RowDesc, Columns_01..54, Rows_01..27). Codes & labels here
// are illustrative; real codes live in the Access DB.
export const SIZE_TYPES: SizeType[] = [
  {
    id: 'st-mshoe-us',
    code: 10,
    name: "Men's Shoe — US (Size × Width)",
    columnDesc: 'Size',
    rowDesc: 'Width',
    columns: ['7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11', '12', '13'],
    rows: ['M', 'W', '3E'],
  },
  {
    id: 'st-wshoe-us',
    code: 20,
    name: "Women's Shoe — US (Size × Width)",
    columnDesc: 'Size',
    rowDesc: 'Width',
    columns: ['5', '5.5', '6', '6.5', '7', '7.5', '8', '8.5', '9', '10'],
    rows: ['M', 'W'],
  },
  {
    id: 'st-apparel-smlx',
    code: 30,
    name: 'Apparel — Size only (XS–XXL)',
    columnDesc: 'Size',
    rowDesc: '',
    columns: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    rows: [''],
  },
  {
    id: 'st-apparel-color',
    code: 35,
    name: 'Apparel — Size × Color',
    columnDesc: 'Size',
    rowDesc: 'Color',
    columns: ['S', 'M', 'L', 'XL'],
    rows: ['Navy', 'White', 'Red', 'Black'],
  },
]

export const MOCK_VENDORS: MockVendor[] = [
  {
    id: 'vendor-nike',
    code: 'NIKE',
    name: 'Nike, Inc.',
    defaultTerms: 'Net 30',
    defaultShipVia: 'UPS Ground',
    defaultAccountNumber: '104-773-221',
    defaultStoreLabelsOnReceive: true,
  },
  {
    id: 'vendor-merrell',
    code: 'MRRL',
    name: 'Merrell',
    defaultTerms: 'Net 60',
    defaultShipVia: 'FedEx Ground',
    defaultAccountNumber: '88201-02',
    defaultStoreLabelsOnReceive: false,
  },
  {
    id: 'vendor-apparelco',
    code: 'APCO',
    name: 'Generic Apparel Co.',
    defaultTerms: 'Net 30',
    defaultShipVia: 'UPS Ground',
    defaultAccountNumber: 'A-1203',
    defaultStoreLabelsOnReceive: false,
  },
]

export const MOCK_STORES: MockStore[] = [
  { id: 1, code: '01', name: 'Main Store' },
  { id: 2, code: '02', name: 'Mall Store' },
  { id: 3, code: '03', name: 'Warehouse / DC' },
]

export const MOCK_SKUS: MockSku[] = [
  {
    id: 'sku-nk-air-42',
    skuCode: 'NK-AIR-42',
    brand: 'Nike',
    description: 'Air Trainer — Mens',
    vendorId: 'vendor-nike',
    sizeTypeId: 'st-mshoe-us',
    defaultUnitCost: 48.5,
    defaultRetailPrice: 109.99,
  },
  {
    id: 'sku-nk-court-w',
    skuCode: 'NK-CRT-W',
    brand: 'Nike',
    description: 'Court Vision — Womens',
    vendorId: 'vendor-nike',
    sizeTypeId: 'st-wshoe-us',
    defaultUnitCost: 42.0,
    defaultRetailPrice: 94.99,
  },
  {
    id: 'sku-mr-hk-w',
    skuCode: 'MR-HK-W',
    brand: 'Merrell',
    description: 'Moab 3 Hiking — Womens',
    vendorId: 'vendor-merrell',
    sizeTypeId: 'st-wshoe-us',
    defaultUnitCost: 62.0,
    defaultRetailPrice: 139.0,
  },
  {
    id: 'sku-ga-polo',
    skuCode: 'GA-POLO',
    brand: 'Generic Apparel',
    description: 'Cotton Polo',
    vendorId: 'vendor-apparelco',
    sizeTypeId: 'st-apparel-color',
    defaultUnitCost: 14.25,
    defaultRetailPrice: 34.0,
  },
  {
    id: 'sku-ga-tee',
    skuCode: 'GA-TEE',
    brand: 'Generic Apparel',
    description: 'Classic Tee — Solid',
    vendorId: 'vendor-apparelco',
    sizeTypeId: 'st-apparel-smlx',
    defaultUnitCost: 6.5,
    defaultRetailPrice: 19.0,
  },
]

export const MOCK_CASE_PACKS: MockCasePack[] = [
  {
    id: 'pack-nk-air-42-m-standard',
    name: 'Nike Air Trainer — M-width prepack (11 pr)',
    skuId: 'sku-nk-air-42',
    cellsPerPack: {
      [cellKey('7', 'M')]: 1,
      [cellKey('7.5', 'M')]: 1,
      [cellKey('8', 'M')]: 2,
      [cellKey('8.5', 'M')]: 2,
      [cellKey('9', 'M')]: 2,
      [cellKey('9.5', 'M')]: 1,
      [cellKey('10', 'M')]: 1,
      [cellKey('10.5', 'M')]: 1,
    },
  },
  {
    id: 'pack-mr-hk-w-standard',
    name: 'Merrell Moab 3 — Standard prepack (9 pr)',
    skuId: 'sku-mr-hk-w',
    cellsPerPack: {
      [cellKey('6', 'M')]: 1,
      [cellKey('6.5', 'M')]: 1,
      [cellKey('7', 'M')]: 2,
      [cellKey('7.5', 'M')]: 2,
      [cellKey('8', 'M')]: 2,
      [cellKey('8.5', 'M')]: 1,
    },
  },
  {
    id: 'pack-ga-polo-core',
    name: 'Generic Polo — Core-color prepack (12 units)',
    skuId: 'sku-ga-polo',
    cellsPerPack: {
      [cellKey('S', 'Navy')]: 1,
      [cellKey('M', 'Navy')]: 2,
      [cellKey('L', 'Navy')]: 1,
      [cellKey('S', 'White')]: 1,
      [cellKey('M', 'White')]: 2,
      [cellKey('L', 'White')]: 1,
      [cellKey('S', 'Black')]: 1,
      [cellKey('M', 'Black')]: 2,
      [cellKey('L', 'Black')]: 1,
    },
  },
]

export const FUTURE_ORDER_THRESHOLD_DAYS = 60
export const OTB_WARN_THRESHOLD = 10_000
export const OTB_BLOCK_THRESHOLD = 50_000
export const NEXT_SUGGESTED_PO_NUMBER = 'PO01238'

// Mock open POs for Receive PO spec-preview. Ordered/received cells use the
// same `${col}|${row}` key as PO entry.
export const MOCK_OPEN_POS: MockOpenPo[] = [
  {
    id: 'po-01235',
    poNumber: 'PO01235',
    vendorId: 'vendor-nike',
    billToStoreId: 1,
    shipToStoreId: 1,
    status: 'PARTIALLY_RECEIVED',
    orderDate: '2026-02-10',
    shipDate: '2026-04-25',
    comments: 'Spring ship — partial received 2026-04-08.',
    lines: [
      {
        id: 'po-01235-l1',
        skuId: 'sku-nk-air-42',
        unitCost: 48.5,
        retailPrice: 109.99,
        orderedCells: {
          [cellKey('8', 'M')]: 2,
          [cellKey('8.5', 'M')]: 3,
          [cellKey('9', 'M')]: 4,
          [cellKey('9.5', 'M')]: 3,
          [cellKey('10', 'M')]: 2,
          [cellKey('11', 'M')]: 1,
          [cellKey('9', 'W')]: 1,
          [cellKey('10', 'W')]: 1,
        },
        receivedCells: {
          [cellKey('8', 'M')]: 1,
          [cellKey('8.5', 'M')]: 3,
          [cellKey('9', 'M')]: 2,
        },
      },
      {
        id: 'po-01235-l2',
        skuId: 'sku-nk-court-w',
        unitCost: 42.0,
        retailPrice: 94.99,
        orderedCells: {
          [cellKey('6', 'M')]: 2,
          [cellKey('6.5', 'M')]: 2,
          [cellKey('7', 'M')]: 3,
          [cellKey('7.5', 'M')]: 3,
          [cellKey('8', 'M')]: 2,
          [cellKey('8.5', 'M')]: 2,
          [cellKey('9', 'M')]: 1,
        },
        receivedCells: {},
      },
    ],
  },
  {
    id: 'po-01236',
    poNumber: 'PO01236',
    vendorId: 'vendor-apparelco',
    billToStoreId: 1,
    shipToStoreId: 2,
    status: 'CONFIRMED',
    orderDate: '2026-03-05',
    shipDate: '2026-05-10',
    comments: 'Core-color polo prepack restock.',
    lines: [
      {
        id: 'po-01236-l1',
        skuId: 'sku-ga-polo',
        unitCost: 14.25,
        retailPrice: 34.0,
        orderedCells: {
          [cellKey('S', 'Navy')]: 2,
          [cellKey('M', 'Navy')]: 4,
          [cellKey('L', 'Navy')]: 3,
          [cellKey('S', 'White')]: 2,
          [cellKey('M', 'White')]: 4,
          [cellKey('L', 'White')]: 3,
          [cellKey('S', 'Black')]: 2,
          [cellKey('M', 'Black')]: 4,
          [cellKey('L', 'Black')]: 3,
        },
        receivedCells: {},
      },
      {
        id: 'po-01236-l2',
        skuId: 'sku-ga-tee',
        unitCost: 6.5,
        retailPrice: 19.0,
        orderedCells: {
          [cellKey('XS', '')]: 4,
          [cellKey('S', '')]: 8,
          [cellKey('M', '')]: 12,
          [cellKey('L', '')]: 12,
          [cellKey('XL', '')]: 8,
          [cellKey('XXL', '')]: 4,
        },
        receivedCells: {
          [cellKey('XS', '')]: 4,
          [cellKey('S', '')]: 4,
          [cellKey('M', '')]: 4,
        },
      },
    ],
  },
]
