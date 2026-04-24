
Object.defineProperty(exports, "__esModule", { value: true });

const {
  Decimal,
  objectEnumValues,
  makeStrictEnum,
  Public,
  getRuntime,
  skip
} = require('./runtime/index-browser.js')


const Prisma = {}

exports.Prisma = Prisma
exports.$Enums = {}

/**
 * Prisma Client JS version: 5.22.0
 * Query Engine version: 605197351a3c8bdd595af2d2a9bc3025bca48ea2
 */
Prisma.prismaVersion = {
  client: "5.22.0",
  engine: "605197351a3c8bdd595af2d2a9bc3025bca48ea2"
}

Prisma.PrismaClientKnownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientKnownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)};
Prisma.PrismaClientUnknownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientUnknownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientRustPanicError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientRustPanicError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientInitializationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientInitializationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientValidationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientValidationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.NotFoundError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`NotFoundError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`sqltag is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.empty = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`empty is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.join = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`join is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.raw = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`raw is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.getExtensionContext is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.defineExtension = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.defineExtension is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}

/**
 * Shorthand utilities for JSON filtering
 */
Prisma.DbNull = objectEnumValues.instances.DbNull
Prisma.JsonNull = objectEnumValues.instances.JsonNull
Prisma.AnyNull = objectEnumValues.instances.AnyNull

Prisma.NullTypes = {
  DbNull: objectEnumValues.classes.DbNull,
  JsonNull: objectEnumValues.classes.JsonNull,
  AnyNull: objectEnumValues.classes.AnyNull
}



/**
 * Enums
 */

exports.Prisma.TransactionIsolationLevel = makeStrictEnum({
  ReadUncommitted: 'ReadUncommitted',
  ReadCommitted: 'ReadCommitted',
  RepeatableRead: 'RepeatableRead',
  Serializable: 'Serializable'
});

exports.Prisma.ProductContentScalarFieldEnum = {
  ricsSkuCode: 'ricsSkuCode',
  webDescription: 'webDescription',
  heroImageUrl: 'heroImageUrl',
  galleryJson: 'galleryJson',
  specsJson: 'specsJson',
  seoSlug: 'seoSlug',
  published: 'published',
  updatedAt: 'updatedAt',
  createdAt: 'createdAt'
};

exports.Prisma.CartScalarFieldEnum = {
  id: 'id',
  sessionId: 'sessionId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CartLineScalarFieldEnum = {
  id: 'id',
  cartId: 'cartId',
  ricsSkuCode: 'ricsSkuCode',
  sizeLabel: 'sizeLabel',
  colorId: 'colorId',
  quantity: 'quantity',
  unitPriceSnapshot: 'unitPriceSnapshot',
  createdAt: 'createdAt'
};

exports.Prisma.OrderScalarFieldEnum = {
  id: 'id',
  status: 'status',
  shippingJson: 'shippingJson',
  paymentMethod: 'paymentMethod',
  subtotal: 'subtotal',
  tax: 'tax',
  total: 'total',
  createdAt: 'createdAt'
};

exports.Prisma.OrderLineScalarFieldEnum = {
  id: 'id',
  orderId: 'orderId',
  ricsSkuCode: 'ricsSkuCode',
  sizeLabel: 'sizeLabel',
  colorId: 'colorId',
  quantity: 'quantity',
  unitPrice: 'unitPrice'
};

exports.Prisma.UserScalarFieldEnum = {
  id: 'id',
  email: 'email',
  passwordHash: 'passwordHash',
  displayName: 'displayName',
  active: 'active',
  isEmployee: 'isEmployee',
  ricsUserId: 'ricsUserId',
  salespersonCode: 'salespersonCode',
  otherInformation: 'otherInformation',
  commissionRate: 'commissionRate',
  commissionBase: 'commissionBase',
  homeStoreId: 'homeStoreId',
  hireDate: 'hireDate',
  terminatedAt: 'terminatedAt',
  timeClockEnabled: 'timeClockEnabled',
  timeClockPinHash: 'timeClockPinHash',
  roleId: 'roleId',
  lastLoginAt: 'lastLoginAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.RoleScalarFieldEnum = {
  id: 'id',
  name: 'name',
  permissions: 'permissions',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SessionScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  expiresAt: 'expiresAt',
  createdAt: 'createdAt'
};

exports.Prisma.EmployeeSalesPasswordScalarFieldEnum = {
  id: 'id',
  employeeId: 'employeeId',
  pinHash: 'pinHash',
  scopes: 'scopes',
  active: 'active',
  failedAttempts: 'failedAttempts',
  failedAttemptWindowStartedAt: 'failedAttemptWindowStartedAt',
  dailyFailedCount: 'dailyFailedCount',
  dailyFailedWindowStartedAt: 'dailyFailedWindowStartedAt',
  lockedUntil: 'lockedUntil',
  revokedAt: 'revokedAt',
  issuedByUserId: 'issuedByUserId',
  updatedByUserId: 'updatedByUserId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.EmployeeSalesPasswordAuditScalarFieldEnum = {
  id: 'id',
  employeeId: 'employeeId',
  passwordId: 'passwordId',
  scope: 'scope',
  outcome: 'outcome',
  invokingUserId: 'invokingUserId',
  ticketId: 'ticketId',
  action: 'action',
  ipAddress: 'ipAddress',
  createdAt: 'createdAt'
};

exports.Prisma.EmployeeSalesOverrideTokenScalarFieldEnum = {
  id: 'id',
  passwordId: 'passwordId',
  employeeId: 'employeeId',
  scope: 'scope',
  tokenHash: 'tokenHash',
  ticketId: 'ticketId',
  action: 'action',
  invokingUserId: 'invokingUserId',
  expiresAt: 'expiresAt',
  consumedAt: 'consumedAt',
  createdAt: 'createdAt'
};

exports.Prisma.TimeClockPolicyScalarFieldEnum = {
  storeId: 'storeId',
  enabled: 'enabled',
  requireClockInBeforeSale: 'requireClockInBeforeSale',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.TimeClockEntryScalarFieldEnum = {
  id: 'id',
  employeeId: 'employeeId',
  storeId: 'storeId',
  clockedInAt: 'clockedInAt',
  clockedOutAt: 'clockedOutAt',
  nonSales: 'nonSales',
  clockedInByUserId: 'clockedInByUserId',
  clockedOutByUserId: 'clockedOutByUserId',
  autoClosedAtCap: 'autoClosedAtCap',
  note: 'note',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.TimeClockEntryAdjustmentScalarFieldEnum = {
  id: 'id',
  timeClockEntryId: 'timeClockEntryId',
  employeeId: 'employeeId',
  actedByUserId: 'actedByUserId',
  reason: 'reason',
  previousStoreId: 'previousStoreId',
  nextStoreId: 'nextStoreId',
  previousClockedInAt: 'previousClockedInAt',
  nextClockedInAt: 'nextClockedInAt',
  previousClockedOutAt: 'previousClockedOutAt',
  nextClockedOutAt: 'nextClockedOutAt',
  previousNonSales: 'previousNonSales',
  nextNonSales: 'nextNonSales',
  previousAutoClosedAtCap: 'previousAutoClosedAtCap',
  nextAutoClosedAtCap: 'nextAutoClosedAtCap',
  previousNote: 'previousNote',
  nextNote: 'nextNote',
  createdAt: 'createdAt'
};

exports.Prisma.CommissionOverrideScalarFieldEnum = {
  id: 'id',
  employeeId: 'employeeId',
  scope: 'scope',
  skuId: 'skuId',
  categoryId: 'categoryId',
  departmentId: 'departmentId',
  rate: 'rate',
  effectiveFrom: 'effectiveFrom',
  effectiveTo: 'effectiveTo',
  createdByUserId: 'createdByUserId',
  updatedByUserId: 'updatedByUserId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ProductsAuditLogScalarFieldEnum = {
  id: 'id',
  actor: 'actor',
  action: 'action',
  targetTable: 'targetTable',
  targetPk: 'targetPk',
  payloadJson: 'payloadJson',
  occurredAt: 'occurredAt'
};

exports.Prisma.SeasonOverlayScalarFieldEnum = {
  code: 'code',
  description: 'description',
  dateLastChanged: 'dateLastChanged'
};

exports.Prisma.EtlRunScalarFieldEnum = {
  id: 'id',
  startedAt: 'startedAt',
  finishedAt: 'finishedAt',
  status: 'status',
  totalRows: 'totalRows',
  tableCount: 'tableCount',
  errorText: 'errorText'
};

exports.Prisma.SkuAttributeOverrideScalarFieldEnum = {
  ricsSkuCode: 'ricsSkuCode',
  category: 'category',
  vendor: 'vendor',
  season: 'season',
  groupCode: 'groupCode',
  updatedAt: 'updatedAt',
  updatedBy: 'updatedBy'
};

exports.Prisma.VendorOverlayScalarFieldEnum = {
  code: 'code',
  source: 'source',
  shortName: 'shortName',
  mailName: 'mailName',
  addr1: 'addr1',
  addr2: 'addr2',
  city: 'city',
  state: 'state',
  zip: 'zip',
  phone: 'phone',
  fax: 'fax',
  contact: 'contact',
  terms: 'terms',
  shipInst: 'shipInst',
  comment: 'comment',
  manuCode: 'manuCode',
  manuName: 'manuName',
  qualifierId: 'qualifierId',
  qualifierCode: 'qualifierCode',
  colorCode: 'colorCode',
  longComment: 'longComment',
  eMail: 'eMail',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  createdBy: 'createdBy',
  updatedBy: 'updatedBy'
};

exports.Prisma.SkuKeywordOverrideScalarFieldEnum = {
  ricsSkuCode: 'ricsSkuCode',
  keyword: 'keyword',
  action: 'action',
  updatedAt: 'updatedAt',
  updatedBy: 'updatedBy'
};

exports.Prisma.SizeTypeOverrideScalarFieldEnum = {
  code: 'code',
  description: 'description',
  columnsJson: 'columnsJson',
  rowsJson: 'rowsJson',
  maxColumns: 'maxColumns',
  maxRows: 'maxRows',
  updatedAt: 'updatedAt',
  updatedBy: 'updatedBy'
};

exports.Prisma.ProductsBatchOperationScalarFieldEnum = {
  id: 'id',
  actor: 'actor',
  operationType: 'operationType',
  criteriaJson: 'criteriaJson',
  changeJson: 'changeJson',
  affectedCount: 'affectedCount',
  startedAt: 'startedAt',
  completedAt: 'completedAt',
  undoneAt: 'undoneAt'
};

exports.Prisma.ProductsBatchOperationItemScalarFieldEnum = {
  id: 'id',
  batchId: 'batchId',
  ricsSkuCode: 'ricsSkuCode',
  beforeJson: 'beforeJson',
  afterJson: 'afterJson'
};

exports.Prisma.ProductFamilyScalarFieldEnum = {
  code: 'code',
  labelEs: 'labelEs',
  descriptionEs: 'descriptionEs',
  sortOrder: 'sortOrder',
  createdAt: 'createdAt'
};

exports.Prisma.CategoryProductFamilyScalarFieldEnum = {
  categoryNumber: 'categoryNumber',
  familyCode: 'familyCode',
  updatedAt: 'updatedAt',
  updatedBy: 'updatedBy'
};

exports.Prisma.SkuScalarFieldEnum = {
  id: 'id',
  provisionalCode: 'provisionalCode',
  code: 'code',
  skuState: 'skuState',
  familyCode: 'familyCode',
  categoryNumber: 'categoryNumber',
  vendorId: 'vendorId',
  vendorSku: 'vendorSku',
  brandId: 'brandId',
  descriptionRics: 'descriptionRics',
  descriptionWeb: 'descriptionWeb',
  comment: 'comment',
  keywords: 'keywords',
  listPrice: 'listPrice',
  retailPrice: 'retailPrice',
  markDownPrice1: 'markDownPrice1',
  markDownPrice2: 'markDownPrice2',
  currentCost: 'currentCost',
  currentPriceSlot: 'currentPriceSlot',
  sizeType: 'sizeType',
  style: 'style',
  styleColor: 'styleColor',
  season: 'season',
  location: 'location',
  labelCode: 'labelCode',
  colorCode: 'colorCode',
  groupCode: 'groupCode',
  pictureFileName: 'pictureFileName',
  manufacturer: 'manufacturer',
  coupon: 'coupon',
  orderMultiple: 'orderMultiple',
  orderUom: 'orderUom',
  perks: 'perks',
  discountCode: 'discountCode',
  activatedAt: 'activatedAt',
  activatedBy: 'activatedBy',
  discontinuedAt: 'discontinuedAt',
  discontinuedBy: 'discontinuedBy',
  createdAt: 'createdAt',
  createdBy: 'createdBy',
  updatedAt: 'updatedAt',
  legacyAttrs: 'legacyAttrs',
  source: 'source',
  ricsLastSyncedAt: 'ricsLastSyncedAt',
  ricsStatus: 'ricsStatus'
};

exports.Prisma.SkuActivityScalarFieldEnum = {
  id: 'id',
  skuId: 'skuId',
  event: 'event',
  fromState: 'fromState',
  toState: 'toState',
  actor: 'actor',
  payloadJson: 'payloadJson',
  occurredAt: 'occurredAt'
};

exports.Prisma.SkuSizeScalarFieldEnum = {
  id: 'id',
  skuId: 'skuId',
  sizeLabel: 'sizeLabel',
  sortOrder: 'sortOrder',
  active: 'active'
};

exports.Prisma.InventoryScalarFieldEnum = {
  id: 'id',
  skuId: 'skuId',
  skuSizeId: 'skuSizeId',
  quantityOnHand: 'quantityOnHand',
  quantityReserved: 'quantityReserved',
  lastCountedAt: 'lastCountedAt',
  version: 'version',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.InventoryAuditLogScalarFieldEnum = {
  id: 'id',
  skuId: 'skuId',
  skuSizeId: 'skuSizeId',
  adjustment: 'adjustment',
  reason: 'reason',
  resultingBalance: 'resultingBalance',
  performedBy: 'performedBy',
  sourceDocumentRefType: 'sourceDocumentRefType',
  sourceDocumentRefId: 'sourceDocumentRefId',
  idempotencyKey: 'idempotencyKey',
  createdAt: 'createdAt'
};

exports.Prisma.InventoryAdjustmentScalarFieldEnum = {
  id: 'id',
  type: 'type',
  fromLocationId: 'fromLocationId',
  toLocationId: 'toLocationId',
  reason: 'reason',
  createdBy: 'createdBy',
  createdAt: 'createdAt'
};

exports.Prisma.InventoryAdjustmentLineScalarFieldEnum = {
  id: 'id',
  adjustmentId: 'adjustmentId',
  skuId: 'skuId',
  quantity: 'quantity',
  createdAt: 'createdAt'
};

exports.Prisma.StockLevelScalarFieldEnum = {
  id: 'id',
  storeId: 'storeId',
  skuId: 'skuId',
  columnLabel: 'columnLabel',
  rowLabel: 'rowLabel',
  onHand: 'onHand',
  reserved: 'reserved',
  lastReceivedAt: 'lastReceivedAt',
  lastMovementAt: 'lastMovementAt',
  version: 'version',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.StockMovementScalarFieldEnum = {
  id: 'id',
  storeId: 'storeId',
  skuId: 'skuId',
  columnLabel: 'columnLabel',
  rowLabel: 'rowLabel',
  movementType: 'movementType',
  quantityDelta: 'quantityDelta',
  unitCostSnapshot: 'unitCostSnapshot',
  retailPriceSnapshot: 'retailPriceSnapshot',
  sourceDocumentType: 'sourceDocumentType',
  sourceDocumentId: 'sourceDocumentId',
  reasonCode: 'reasonCode',
  comment: 'comment',
  performedBy: 'performedBy',
  movementAt: 'movementAt',
  createdAt: 'createdAt',
  idempotencyKey: 'idempotencyKey'
};

exports.Prisma.ManualReceiptScalarFieldEnum = {
  id: 'id',
  storeId: 'storeId',
  skuId: 'skuId',
  performedBy: 'performedBy',
  referenceNumber: 'referenceNumber',
  storeLabelsOnReceive: 'storeLabelsOnReceive',
  movementAt: 'movementAt',
  unitCostOverride: 'unitCostOverride',
  retailPriceOverride: 'retailPriceOverride',
  casePackId: 'casePackId',
  casePackMultiplier: 'casePackMultiplier',
  note: 'note',
  idempotencyKey: 'idempotencyKey',
  createdAt: 'createdAt'
};

exports.Prisma.ManualReceiptLineScalarFieldEnum = {
  id: 'id',
  manualReceiptId: 'manualReceiptId',
  columnLabel: 'columnLabel',
  rowLabel: 'rowLabel',
  quantity: 'quantity',
  unitCost: 'unitCost',
  retailPrice: 'retailPrice',
  movementId: 'movementId'
};

exports.Prisma.SkuCodeSequenceScalarFieldEnum = {
  prefix: 'prefix',
  nextVal: 'nextVal'
};

exports.Prisma.AttributeDimensionScalarFieldEnum = {
  id: 'id',
  code: 'code',
  labelEs: 'labelEs',
  descriptionEs: 'descriptionEs',
  sortOrder: 'sortOrder',
  isMultiValue: 'isMultiValue',
  createdAt: 'createdAt'
};

exports.Prisma.AttributeFamilyRuleScalarFieldEnum = {
  dimensionId: 'dimensionId',
  familyCode: 'familyCode',
  enabled: 'enabled',
  isRequired: 'isRequired',
  sortOrder: 'sortOrder',
  updatedAt: 'updatedAt',
  updatedBy: 'updatedBy'
};

exports.Prisma.AttributeValueScalarFieldEnum = {
  id: 'id',
  dimensionId: 'dimensionId',
  code: 'code',
  labelEs: 'labelEs',
  sortOrder: 'sortOrder',
  isActive: 'isActive',
  createdAt: 'createdAt'
};

exports.Prisma.SkuAttributeAssignmentScalarFieldEnum = {
  skuCode: 'skuCode',
  dimensionId: 'dimensionId',
  valueId: 'valueId',
  assignedAt: 'assignedAt',
  assignedBy: 'assignedBy'
};

exports.Prisma.EtlRunTableScalarFieldEnum = {
  id: 'id',
  runId: 'runId',
  mdbFile: 'mdbFile',
  sourceTable: 'sourceTable',
  targetTable: 'targetTable',
  rowCount: 'rowCount',
  durationMs: 'durationMs',
  status: 'status',
  errorText: 'errorText',
  startedAt: 'startedAt'
};

exports.Prisma.ReportTemplateScalarFieldEnum = {
  id: 'id',
  ownerId: 'ownerId',
  reportType: 'reportType',
  title: 'title',
  paramsJson: 'paramsJson',
  visibility: 'visibility',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  lastUsedAt: 'lastUsedAt'
};

exports.Prisma.ReportRunScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  reportType: 'reportType',
  sourceTemplateId: 'sourceTemplateId',
  title: 'title',
  paramsJson: 'paramsJson',
  resultJson: 'resultJson',
  rowCount: 'rowCount',
  resultSizeBytes: 'resultSizeBytes',
  reportTypeVersion: 'reportTypeVersion',
  visibility: 'visibility',
  createdAt: 'createdAt'
};

exports.Prisma.CustomerScalarFieldEnum = {
  id: 'id',
  accountNumber: 'accountNumber',
  phoneE164: 'phoneE164',
  firstName: 'firstName',
  lastName: 'lastName',
  displayName: 'displayName',
  email: 'email',
  addressLine1: 'addressLine1',
  addressLine2: 'addressLine2',
  city: 'city',
  stateRegion: 'stateRegion',
  postalCode: 'postalCode',
  country: 'country',
  creditLimit: 'creditLimit',
  alertFlag: 'alertFlag',
  alertMessage: 'alertMessage',
  comments: 'comments',
  ptdQty: 'ptdQty',
  ptdSalesCents: 'ptdSalesCents',
  ytdQty: 'ytdQty',
  ytdSalesCents: 'ytdSalesCents',
  ttdQty: 'ttdQty',
  ttdSalesCents: 'ttdSalesCents',
  lastYearSalesCents: 'lastYearSalesCents',
  dateAdded: 'dateAdded',
  dateOfLastPurchase: 'dateOfLastPurchase',
  lastKnownArBalanceCents: 'lastKnownArBalanceCents',
  arBalanceAsOf: 'arBalanceAsOf',
  lastKnownStoreCreditCents: 'lastKnownStoreCreditCents',
  storeCreditAsOf: 'storeCreditAsOf',
  extraFieldsJson: 'extraFieldsJson',
  marketingOptIn: 'marketingOptIn',
  active: 'active',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.FamilyMemberScalarFieldEnum = {
  id: 'id',
  customerId: 'customerId',
  code: 'code',
  firstName: 'firstName',
  lastName: 'lastName',
  gender: 'gender',
  birthday: 'birthday',
  comments: 'comments',
  alertFlag: 'alertFlag',
  alertMessage: 'alertMessage',
  extraFieldsJson: 'extraFieldsJson',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.NullableJsonNullValueInput = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull
};

exports.Prisma.JsonNullValueInput = {
  JsonNull: Prisma.JsonNull
};

exports.Prisma.QueryMode = {
  default: 'default',
  insensitive: 'insensitive'
};

exports.Prisma.JsonNullValueFilter = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull,
  AnyNull: Prisma.AnyNull
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};
exports.CommissionOverrideScope = exports.$Enums.CommissionOverrideScope = {
  SKU: 'SKU',
  CATEGORY: 'CATEGORY',
  DEPARTMENT: 'DEPARTMENT'
};

exports.Prisma.ModelName = {
  ProductContent: 'ProductContent',
  Cart: 'Cart',
  CartLine: 'CartLine',
  Order: 'Order',
  OrderLine: 'OrderLine',
  User: 'User',
  Role: 'Role',
  Session: 'Session',
  EmployeeSalesPassword: 'EmployeeSalesPassword',
  EmployeeSalesPasswordAudit: 'EmployeeSalesPasswordAudit',
  EmployeeSalesOverrideToken: 'EmployeeSalesOverrideToken',
  TimeClockPolicy: 'TimeClockPolicy',
  TimeClockEntry: 'TimeClockEntry',
  TimeClockEntryAdjustment: 'TimeClockEntryAdjustment',
  CommissionOverride: 'CommissionOverride',
  ProductsAuditLog: 'ProductsAuditLog',
  SeasonOverlay: 'SeasonOverlay',
  EtlRun: 'EtlRun',
  SkuAttributeOverride: 'SkuAttributeOverride',
  VendorOverlay: 'VendorOverlay',
  SkuKeywordOverride: 'SkuKeywordOverride',
  SizeTypeOverride: 'SizeTypeOverride',
  ProductsBatchOperation: 'ProductsBatchOperation',
  ProductsBatchOperationItem: 'ProductsBatchOperationItem',
  ProductFamily: 'ProductFamily',
  CategoryProductFamily: 'CategoryProductFamily',
  Sku: 'Sku',
  SkuActivity: 'SkuActivity',
  SkuSize: 'SkuSize',
  Inventory: 'Inventory',
  InventoryAuditLog: 'InventoryAuditLog',
  InventoryAdjustment: 'InventoryAdjustment',
  InventoryAdjustmentLine: 'InventoryAdjustmentLine',
  StockLevel: 'StockLevel',
  StockMovement: 'StockMovement',
  ManualReceipt: 'ManualReceipt',
  ManualReceiptLine: 'ManualReceiptLine',
  SkuCodeSequence: 'SkuCodeSequence',
  AttributeDimension: 'AttributeDimension',
  AttributeFamilyRule: 'AttributeFamilyRule',
  AttributeValue: 'AttributeValue',
  SkuAttributeAssignment: 'SkuAttributeAssignment',
  EtlRunTable: 'EtlRunTable',
  ReportTemplate: 'ReportTemplate',
  ReportRun: 'ReportRun',
  Customer: 'Customer',
  FamilyMember: 'FamilyMember'
};

/**
 * This is a stub Prisma Client that will error at runtime if called.
 */
class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(target, prop) {
        let message
        const runtime = getRuntime()
        if (runtime.isEdge) {
          message = `PrismaClient is not configured to run in ${runtime.prettyName}. In order to run Prisma Client on edge runtime, either:
- Use Prisma Accelerate: https://pris.ly/d/accelerate
- Use Driver Adapters: https://pris.ly/d/driver-adapters
`;
        } else {
          message = 'PrismaClient is unable to run in this browser environment, or has been bundled for the browser (running in `' + runtime.prettyName + '`).'
        }
        
        message += `
If this is unexpected, please open an issue: https://pris.ly/prisma-prisma-bug-report`

        throw new Error(message)
      }
    })
  }
}

exports.PrismaClient = PrismaClient

Object.assign(exports, Prisma)
