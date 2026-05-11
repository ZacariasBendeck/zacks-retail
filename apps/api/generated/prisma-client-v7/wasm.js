
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

exports.Prisma.EmployeeScalarFieldEnum = {
  id: 'id',
  salespersonCode: 'salespersonCode',
  displayName: 'displayName',
  active: 'active',
  otherInformation: 'otherInformation',
  commissionRate: 'commissionRate',
  commissionBase: 'commissionBase',
  ricsCommissionMethod: 'ricsCommissionMethod',
  timeClockEnabled: 'timeClockEnabled',
  timeClockPinHash: 'timeClockPinHash',
  timeClockAdmin: 'timeClockAdmin',
  timeClockFullUser: 'timeClockFullUser',
  legacyCashierPinHash: 'legacyCashierPinHash',
  ricsSalespersonChangedAt: 'ricsSalespersonChangedAt',
  ricsSalespersonImportedAt: 'ricsSalespersonImportedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.RoleScalarFieldEnum = {
  id: 'id',
  name: 'name',
  permissions: 'permissions',
  description: 'description',
  archivedAt: 'archivedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SessionScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  expiresAt: 'expiresAt',
  createdAt: 'createdAt'
};

exports.Prisma.IdentityUserRoleAssignmentScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  roleId: 'roleId',
  assignedByUserId: 'assignedByUserId',
  assignedAt: 'assignedAt',
  revokedByUserId: 'revokedByUserId',
  revokedAt: 'revokedAt',
  reason: 'reason',
  createdAt: 'createdAt'
};

exports.Prisma.IdentityUserStoreScopeScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  scopeType: 'scopeType',
  scopeId: 'scopeId',
  grantedByUserId: 'grantedByUserId',
  grantedAt: 'grantedAt',
  revokedByUserId: 'revokedByUserId',
  revokedAt: 'revokedAt',
  reason: 'reason',
  createdAt: 'createdAt'
};

exports.Prisma.IdentityMfaFactorScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  factorType: 'factorType',
  label: 'label',
  secretHash: 'secretHash',
  publicKeyJson: 'publicKeyJson',
  active: 'active',
  verifiedAt: 'verifiedAt',
  createdAt: 'createdAt',
  revokedAt: 'revokedAt'
};

exports.Prisma.IdentityExternalIdentityScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  provider: 'provider',
  providerSubject: 'providerSubject',
  emailAtProvider: 'emailAtProvider',
  createdAt: 'createdAt',
  lastAuthenticatedAt: 'lastAuthenticatedAt'
};

exports.Prisma.IdentityLoginEventScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  roleId: 'roleId',
  email: 'email',
  outcome: 'outcome',
  reason: 'reason',
  ipAddress: 'ipAddress',
  userAgent: 'userAgent',
  occurredAt: 'occurredAt'
};

exports.Prisma.IdentitySessionEventScalarFieldEnum = {
  id: 'id',
  sessionId: 'sessionId',
  userId: 'userId',
  eventType: 'eventType',
  reason: 'reason',
  ipAddress: 'ipAddress',
  userAgent: 'userAgent',
  occurredAt: 'occurredAt'
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

exports.Prisma.PlatformAuditLogScalarFieldEnum = {
  id: 'id',
  eventType: 'eventType',
  action: 'action',
  resourceType: 'resourceType',
  resourceId: 'resourceId',
  actorUserId: 'actorUserId',
  actorSessionId: 'actorSessionId',
  outcome: 'outcome',
  reason: 'reason',
  ipAddress: 'ipAddress',
  userAgent: 'userAgent',
  beforeJson: 'beforeJson',
  afterJson: 'afterJson',
  metadataJson: 'metadataJson',
  traceId: 'traceId',
  createdAt: 'createdAt'
};

exports.Prisma.ActivityReviewEventReviewScalarFieldEnum = {
  auditEventId: 'auditEventId',
  status: 'status',
  reviewedByUserId: 'reviewedByUserId',
  reviewNote: 'reviewNote',
  reviewedAt: 'reviewedAt',
  updatedAt: 'updatedAt'
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

exports.Prisma.VendorScalarFieldEnum = {
  code: 'code',
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
  dateLastChanged: 'dateLastChanged'
};

exports.Prisma.VendorStoreAccountScalarFieldEnum = {
  vendorCode: 'vendorCode',
  storeId: 'storeId',
  account: 'account',
  dateLastChanged: 'dateLastChanged'
};

exports.Prisma.StoreMasterScalarFieldEnum = {
  number: 'number',
  description: 'description',
  mailName: 'mailName',
  addr1: 'addr1',
  addr2: 'addr2',
  city: 'city',
  state: 'state',
  zip: 'zip',
  eMail: 'eMail',
  phone: 'phone',
  fax: 'fax',
  lastTicket: 'lastTicket',
  billMailName: 'billMailName',
  billAddr1: 'billAddr1',
  billAddr2: 'billAddr2',
  billCity: 'billCity',
  billState: 'billState',
  billZip: 'billZip',
  otherChargeDesc: 'otherChargeDesc',
  region: 'region',
  dateLastChanged: 'dateLastChanged',
  rawJson: 'rawJson'
};

exports.Prisma.StoreGroupScalarFieldEnum = {
  code: 'code',
  label: 'label',
  active: 'active',
  sortOrder: 'sortOrder',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.StoreGroupMemberScalarFieldEnum = {
  storeNumber: 'storeNumber',
  groupCode: 'groupCode',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PurchasePlanScalarFieldEnum = {
  id: 'id',
  storeGroupCode: 'storeGroupCode',
  planningScope: 'planningScope',
  scopeLabel: 'scopeLabel',
  label: 'label',
  status: 'status',
  season: 'season',
  seasonYear: 'seasonYear',
  seasonMonths: 'seasonMonths',
  selectedDepartments: 'selectedDepartments',
  forecastMethod: 'forecastMethod',
  eohMethod: 'eohMethod',
  coverMonths: 'coverMonths',
  discountNormalization: 'discountNormalization',
  historyFromYearMonth: 'historyFromYearMonth',
  historyToYearMonth: 'historyToYearMonth',
  createdBy: 'createdBy',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  archivedAt: 'archivedAt'
};

exports.Prisma.PurchasePlanRowScalarFieldEnum = {
  id: 'id',
  planId: 'planId',
  departmentKey: 'departmentKey',
  departmentNumber: 'departmentNumber',
  departmentLabel: 'departmentLabel',
  yearMonth: 'yearMonth',
  baselineBoh: 'baselineBoh',
  baselineProjSales: 'baselineProjSales',
  baselineEohTarget: 'baselineEohTarget',
  baselineBuy: 'baselineBuy',
  baselineEohActual: 'baselineEohActual',
  currentBoh: 'currentBoh',
  currentProjSales: 'currentProjSales',
  currentEohTarget: 'currentEohTarget',
  currentBuy: 'currentBuy',
  currentEohActual: 'currentEohActual',
  onHand: 'onHand',
  currentOnOrder: 'currentOnOrder',
  futureOnOrder: 'futureOnOrder',
  nativeOpenPo: 'nativeOpenPo',
  stockPosition: 'stockPosition',
  normalizationFactor: 'normalizationFactor',
  rawProjSales: 'rawProjSales',
  metadata: 'metadata',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PurchasePlanAdjustmentScalarFieldEnum = {
  id: 'id',
  planId: 'planId',
  departmentKey: 'departmentKey',
  kind: 'kind',
  value: 'value',
  reason: 'reason',
  appliedBy: 'appliedBy',
  appliedAt: 'appliedAt',
  beforeRowsJson: 'beforeRowsJson',
  afterRowsJson: 'afterRowsJson'
};

exports.Prisma.PurchasePlanAuditScalarFieldEnum = {
  id: 'id',
  planId: 'planId',
  action: 'action',
  actor: 'actor',
  at: 'at',
  beforeJson: 'beforeJson',
  afterJson: 'afterJson'
};

exports.Prisma.PurchasePlanV3ScalarFieldEnum = {
  id: 'id',
  label: 'label',
  status: 'status',
  storeGroupCodes: 'storeGroupCodes',
  departmentNumber: 'departmentNumber',
  departmentLabel: 'departmentLabel',
  year: 'year',
  forecastMethod: 'forecastMethod',
  eohMethod: 'eohMethod',
  coverMonths: 'coverMonths',
  discountNormalization: 'discountNormalization',
  historyFromYearMonth: 'historyFromYearMonth',
  historyToYearMonth: 'historyToYearMonth',
  warehouseStoreNumbers: 'warehouseStoreNumbers',
  createdBy: 'createdBy',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  archivedAt: 'archivedAt'
};

exports.Prisma.PurchasePlanV3RowScalarFieldEnum = {
  id: 'id',
  planId: 'planId',
  storeGroupCode: 'storeGroupCode',
  storeGroupLabel: 'storeGroupLabel',
  season: 'season',
  seasonYear: 'seasonYear',
  seasonMonths: 'seasonMonths',
  projectedBoh: 'projectedBoh',
  projectedSales: 'projectedSales',
  eohTarget: 'eohTarget',
  baselineBuy: 'baselineBuy',
  chainOnHand: 'chainOnHand',
  currentOnOrder: 'currentOnOrder',
  futureOnOrder: 'futureOnOrder',
  nativeOpenPo: 'nativeOpenPo',
  stockPosition: 'stockPosition',
  warehouseEligible: 'warehouseEligible',
  warehousePlanningCredit: 'warehousePlanningCredit',
  warehouseUnallocated: 'warehouseUnallocated',
  totalAvailableForPlan: 'totalAvailableForPlan',
  recommendedBuy: 'recommendedBuy',
  projectedEoh: 'projectedEoh',
  metadata: 'metadata',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PurchasePlanV3AdjustmentScalarFieldEnum = {
  id: 'id',
  planId: 'planId',
  storeGroupCode: 'storeGroupCode',
  season: 'season',
  kind: 'kind',
  value: 'value',
  reason: 'reason',
  appliedBy: 'appliedBy',
  appliedAt: 'appliedAt',
  beforeRowsJson: 'beforeRowsJson',
  afterRowsJson: 'afterRowsJson'
};

exports.Prisma.PurchasePlanV3AuditScalarFieldEnum = {
  id: 'id',
  planId: 'planId',
  action: 'action',
  actor: 'actor',
  at: 'at',
  beforeJson: 'beforeJson',
  afterJson: 'afterJson'
};

exports.Prisma.AssortmentColorAliasScalarFieldEnum = {
  rawKey: 'rawKey',
  canonicalColor: 'canonicalColor',
  colorFamily: 'colorFamily',
  updatedAt: 'updatedAt',
  updatedBy: 'updatedBy'
};

exports.Prisma.AssortmentPlanScalarFieldEnum = {
  id: 'id',
  label: 'label',
  status: 'status',
  categoryNumber: 'categoryNumber',
  categoryLabel: 'categoryLabel',
  warehouseStoreId: 'warehouseStoreId',
  warehouseStoreLabel: 'warehouseStoreLabel',
  targetStoreIds: 'targetStoreIds',
  startDate: 'startDate',
  horizonMonths: 'horizonMonths',
  highSeasonMonths: 'highSeasonMonths',
  historyFromYearMonth: 'historyFromYearMonth',
  historyToYearMonth: 'historyToYearMonth',
  metadata: 'metadata',
  createdBy: 'createdBy',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  archivedAt: 'archivedAt'
};

exports.Prisma.AssortmentPlanPoolItemScalarFieldEnum = {
  id: 'id',
  planId: 'planId',
  skuId: 'skuId',
  skuCode: 'skuCode',
  skuDescription: 'skuDescription',
  rawColorKey: 'rawColorKey',
  canonicalColor: 'canonicalColor',
  colorFamily: 'colorFamily',
  inclusionReason: 'inclusionReason',
  warehouseUnits: 'warehouseUnits',
  keywords: 'keywords',
  assignedWaveId: 'assignedWaveId',
  metadata: 'metadata',
  createdAt: 'createdAt'
};

exports.Prisma.AssortmentPlanWaveScalarFieldEnum = {
  id: 'id',
  planId: 'planId',
  sequence: 'sequence',
  releaseDate: 'releaseDate',
  status: 'status',
  generatedTransferIds: 'generatedTransferIds',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  committedAt: 'committedAt'
};

exports.Prisma.AssortmentPlanWaveLineScalarFieldEnum = {
  id: 'id',
  waveId: 'waveId',
  poolItemId: 'poolItemId',
  skuId: 'skuId',
  skuCode: 'skuCode',
  rawColorKey: 'rawColorKey',
  canonicalColor: 'canonicalColor',
  warehouseUnits: 'warehouseUnits',
  createdAt: 'createdAt'
};

exports.Prisma.AssortmentPlanStoreAllocationScalarFieldEnum = {
  id: 'id',
  waveLineId: 'waveLineId',
  storeId: 'storeId',
  storeLabel: 'storeLabel',
  quantity: 'quantity',
  createdAt: 'createdAt'
};

exports.Prisma.AssortmentPlanTransferLinkScalarFieldEnum = {
  id: 'id',
  planId: 'planId',
  waveId: 'waveId',
  transferId: 'transferId',
  createdAt: 'createdAt'
};

exports.Prisma.SkuUpcScalarFieldEnum = {
  upc: 'upc',
  skuCode: 'skuCode',
  skuId: 'skuId',
  columnLabel: 'columnLabel',
  rowLabel: 'rowLabel',
  source: 'source',
  vendorSku: 'vendorSku',
  nrmaCode: 'nrmaCode',
  status: 'status',
  legacyPrefix: 'legacyPrefix',
  legacyNumber: 'legacyNumber',
  legacyCheckDigit: 'legacyCheckDigit',
  dateLastChanged: 'dateLastChanged'
};

exports.Prisma.CasePackScalarFieldEnum = {
  code: 'code',
  description: 'description',
  sizeTypeCode: 'sizeTypeCode',
  active: 'active',
  dateLastChanged: 'dateLastChanged'
};

exports.Prisma.CasePackCellScalarFieldEnum = {
  casePackCode: 'casePackCode',
  columnLabel: 'columnLabel',
  rowLabel: 'rowLabel',
  quantity: 'quantity'
};

exports.Prisma.FuturePriceChangeScalarFieldEnum = {
  id: 'id',
  importKey: 'importKey',
  skuCode: 'skuCode',
  skuId: 'skuId',
  storeId: 'storeId',
  effectiveAt: 'effectiveAt',
  changeMaster: 'changeMaster',
  revert: 'revert',
  listPrice: 'listPrice',
  retailPrice: 'retailPrice',
  markDownPrice1: 'markDownPrice1',
  markDownPrice2: 'markDownPrice2',
  currentPriceSlot: 'currentPriceSlot',
  overSizeAmount: 'overSizeAmount',
  perks: 'perks',
  source: 'source',
  dateLastChanged: 'dateLastChanged'
};

exports.Prisma.PurchaseOrderLegacyScalarFieldEnum = {
  poNumber: 'poNumber',
  billStore: 'billStore',
  shipStore: 'shipStore',
  vendorCode: 'vendorCode',
  confirmation: 'confirmation',
  account: 'account',
  terms: 'terms',
  shipVia: 'shipVia',
  backOrder: 'backOrder',
  splitShipment: 'splitShipment',
  orderDate: 'orderDate',
  dueDate: 'dueDate',
  cancelDate: 'cancelDate',
  paymentDate: 'paymentDate',
  lastReceivedAt: 'lastReceivedAt',
  comment: 'comment',
  exportFlag: 'exportFlag',
  exportComment: 'exportComment',
  orderType: 'orderType',
  releaseDt: 'releaseDt',
  department: 'department',
  buyer: 'buyer',
  notBefore: 'notBefore',
  notAfter: 'notAfter',
  shipCode: 'shipCode',
  carrier: 'carrier',
  termsPeriod: 'termsPeriod',
  termsDay: 'termsDay',
  current: 'current',
  legacyStatus: 'legacyStatus',
  dateLastChanged: 'dateLastChanged'
};

exports.Prisma.PurchaseOrderLegacyLineScalarFieldEnum = {
  poNumber: 'poNumber',
  skuCode: 'skuCode',
  skuId: 'skuId',
  rowLabel: 'rowLabel',
  segment: 'segment',
  orderedQtys: 'orderedQtys',
  receivedQtys: 'receivedQtys',
  cost: 'cost',
  vendorCode: 'vendorCode',
  casePackCode: 'casePackCode',
  caseMultiplier: 'caseMultiplier',
  dateLastChanged: 'dateLastChanged'
};

exports.Prisma.PurchaseOrderScalarFieldEnum = {
  id: 'id',
  poNumber: 'poNumber',
  billToStoreId: 'billToStoreId',
  shipToStoreId: 'shipToStoreId',
  vendorCode: 'vendorCode',
  orderType: 'orderType',
  classification: 'classification',
  status: 'status',
  origin: 'origin',
  originSourcePoId: 'originSourcePoId',
  confirmationNumber: 'confirmationNumber',
  accountNumber: 'accountNumber',
  terms: 'terms',
  shipVia: 'shipVia',
  backorderAllowed: 'backorderAllowed',
  splitShipment: 'splitShipment',
  programCode: 'programCode',
  storeLabelsOnReceive: 'storeLabelsOnReceive',
  buyer: 'buyer',
  comments: 'comments',
  sourceCurrency: 'sourceCurrency',
  fxRate: 'fxRate',
  fxDate: 'fxDate',
  incotermCode: 'incotermCode',
  incotermPlace: 'incotermPlace',
  costBasis: 'costBasis',
  orderDate: 'orderDate',
  shipDate: 'shipDate',
  plannedReceiptDate: 'plannedReceiptDate',
  cancelDate: 'cancelDate',
  paymentDate: 'paymentDate',
  supplierQuotationId: 'supplierQuotationId',
  createdBy: 'createdBy',
  submittedAt: 'submittedAt',
  closedAt: 'closedAt',
  cancellationReason: 'cancellationReason',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PurchaseOrderLineScalarFieldEnum = {
  id: 'id',
  poId: 'poId',
  skuId: 'skuId',
  lineSequence: 'lineSequence',
  casePackId: 'casePackId',
  casePackMultiplier: 'casePackMultiplier',
  retailPrice: 'retailPrice',
  unitCost: 'unitCost',
  sourceUnitCost: 'sourceUnitCost',
  commercialUnitCostHnl: 'commercialUnitCostHnl',
  estimatedLandedUnitCostHnl: 'estimatedLandedUnitCostHnl',
  supplierQuotationLineId: 'supplierQuotationLineId',
  quantityOrdered: 'quantityOrdered',
  quantityReceived: 'quantityReceived',
  writeBackToMaster: 'writeBackToMaster',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PurchaseOrderLineSizeCellScalarFieldEnum = {
  id: 'id',
  poLineId: 'poLineId',
  columnLabel: 'columnLabel',
  rowLabel: 'rowLabel',
  quantityOrdered: 'quantityOrdered',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SupplierQuotationScalarFieldEnum = {
  id: 'id',
  quoteNumber: 'quoteNumber',
  vendorCode: 'vendorCode',
  buyer: 'buyer',
  season: 'season',
  chainId: 'chainId',
  sourceCurrency: 'sourceCurrency',
  fxRate: 'fxRate',
  fxDate: 'fxDate',
  incotermCode: 'incotermCode',
  incotermPlace: 'incotermPlace',
  paymentTerms: 'paymentTerms',
  quoteDate: 'quoteDate',
  validUntil: 'validUntil',
  leadTimeDays: 'leadTimeDays',
  status: 'status',
  sourceDocumentRef: 'sourceDocumentRef',
  notes: 'notes',
  createdAt: 'createdAt',
  createdBy: 'createdBy',
  updatedAt: 'updatedAt',
  updatedBy: 'updatedBy'
};

exports.Prisma.SupplierQuotationLineScalarFieldEnum = {
  id: 'id',
  quotationId: 'quotationId',
  lineSequence: 'lineSequence',
  linkedSkuId: 'linkedSkuId',
  supplierStyle: 'supplierStyle',
  supplierColorCode: 'supplierColorCode',
  supplierColorName: 'supplierColorName',
  description: 'description',
  familyCode: 'familyCode',
  categoryNumber: 'categoryNumber',
  colorFamilyValueId: 'colorFamilyValueId',
  materialValueId: 'materialValueId',
  styleElementValueId: 'styleElementValueId',
  keywords: 'keywords',
  imageUrl: 'imageUrl',
  moqQty: 'moqQty',
  quotedQty: 'quotedQty',
  unitCost: 'unitCost',
  estimatedLandedUnitCostHnl: 'estimatedLandedUnitCostHnl',
  targetRetailHnl: 'targetRetailHnl',
  marginPct: 'marginPct',
  plannedReceiptDate: 'plannedReceiptDate',
  decisionStatus: 'decisionStatus',
  decisionReason: 'decisionReason',
  decisionAt: 'decisionAt',
  decisionBy: 'decisionBy',
  createdAt: 'createdAt',
  createdBy: 'createdBy',
  updatedAt: 'updatedAt',
  updatedBy: 'updatedBy'
};

exports.Prisma.SupplierQuotationLineRelationScalarFieldEnum = {
  id: 'id',
  sourceLineId: 'sourceLineId',
  relationType: 'relationType',
  targetType: 'targetType',
  targetSkuId: 'targetSkuId',
  targetMatchingSetId: 'targetMatchingSetId',
  targetQuotationLineId: 'targetQuotationLineId',
  note: 'note',
  createdAt: 'createdAt',
  createdBy: 'createdBy'
};

exports.Prisma.PoReceiptScalarFieldEnum = {
  id: 'id',
  poId: 'poId',
  receivedAtStoreId: 'receivedAtStoreId',
  receivedBy: 'receivedBy',
  referenceNumber: 'referenceNumber',
  idempotencyKey: 'idempotencyKey',
  asnCartonId: 'asnCartonId',
  mode: 'mode',
  discountPercent: 'discountPercent',
  freightEach: 'freightEach',
  receivedAt: 'receivedAt',
  reversalOfReceiptId: 'reversalOfReceiptId',
  createdAt: 'createdAt'
};

exports.Prisma.PoReceiptLineScalarFieldEnum = {
  id: 'id',
  receiptId: 'receiptId',
  poLineId: 'poLineId',
  skuId: 'skuId',
  columnLabel: 'columnLabel',
  rowLabel: 'rowLabel',
  quantityReceived: 'quantityReceived',
  effectiveUnitCost: 'effectiveUnitCost',
  discrepancyReason: 'discrepancyReason',
  auditReference: 'auditReference',
  movementId: 'movementId',
  importShipmentId: 'importShipmentId',
  importInvoiceLineId: 'importInvoiceLineId',
  importShipmentLineId: 'importShipmentLineId',
  landedCostBasis: 'landedCostBasis',
  commercialUnitCostHnl: 'commercialUnitCostHnl',
  allocatedLandedCostHnl: 'allocatedLandedCostHnl',
  landedUnitCostHnl: 'landedUnitCostHnl',
  createdAt: 'createdAt'
};

exports.Prisma.PoStatusHistoryScalarFieldEnum = {
  id: 'id',
  poId: 'poId',
  fromStatus: 'fromStatus',
  toStatus: 'toStatus',
  changedBy: 'changedBy',
  reason: 'reason',
  createdAt: 'createdAt'
};

exports.Prisma.AsnCartonLegacyScalarFieldEnum = {
  cartonNumber: 'cartonNumber',
  poNumber: 'poNumber',
  receivedAt: 'receivedAt',
  status: 'status',
  dateLastChanged: 'dateLastChanged'
};

exports.Prisma.AsnCartonLegacyLineScalarFieldEnum = {
  cartonNumber: 'cartonNumber',
  poNumber: 'poNumber',
  upc: 'upc',
  quantity: 'quantity',
  dateLastChanged: 'dateLastChanged'
};

exports.Prisma.TransferLegacySummaryScalarFieldEnum = {
  id: 'id',
  importKey: 'importKey',
  fromStoreId: 'fromStoreId',
  legacyType: 'legacyType',
  toStoreId: 'toStoreId',
  transferredAt: 'transferredAt',
  quantity: 'quantity',
  amount: 'amount'
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

exports.Prisma.CategoryBuyerAssignmentScalarFieldEnum = {
  categoryNumber: 'categoryNumber',
  buyerValueId: 'buyerValueId',
  updatedBy: 'updatedBy',
  updatedAt: 'updatedAt'
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

exports.Prisma.MatchingSetTypeScalarFieldEnum = {
  code: 'code',
  labelEs: 'labelEs',
  descriptionEs: 'descriptionEs',
  sortOrder: 'sortOrder',
  active: 'active',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.MatchingSetRoleScalarFieldEnum = {
  setTypeCode: 'setTypeCode',
  code: 'code',
  labelEs: 'labelEs',
  sortOrder: 'sortOrder',
  requiredDefault: 'requiredDefault',
  active: 'active',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.MatchingSetScalarFieldEnum = {
  id: 'id',
  code: 'code',
  setTypeCode: 'setTypeCode',
  descriptionEs: 'descriptionEs',
  vendorId: 'vendorId',
  vendorStyle: 'vendorStyle',
  materialCode: 'materialCode',
  materialLabel: 'materialLabel',
  sharedColorCode: 'sharedColorCode',
  sharedColorLabel: 'sharedColorLabel',
  season: 'season',
  chainId: 'chainId',
  sellMode: 'sellMode',
  planningActive: 'planningActive',
  notes: 'notes',
  active: 'active',
  createdAt: 'createdAt',
  createdBy: 'createdBy',
  updatedAt: 'updatedAt',
  updatedBy: 'updatedBy'
};

exports.Prisma.MatchingSetMemberScalarFieldEnum = {
  setId: 'setId',
  skuId: 'skuId',
  roleCode: 'roleCode',
  isPrimary: 'isPrimary',
  quantityRatio: 'quantityRatio',
  addedAt: 'addedAt',
  addedBy: 'addedBy',
  updatedAt: 'updatedAt',
  updatedBy: 'updatedBy'
};

exports.Prisma.MatchingSetMemberSizeCurveScalarFieldEnum = {
  id: 'id',
  setId: 'setId',
  skuId: 'skuId',
  chainId: 'chainId',
  storeId: 'storeId',
  sizeLabel: 'sizeLabel',
  columnLabel: 'columnLabel',
  rowLabel: 'rowLabel',
  ratioPct: 'ratioPct',
  createdAt: 'createdAt',
  createdBy: 'createdBy',
  updatedAt: 'updatedAt',
  updatedBy: 'updatedBy'
};

exports.Prisma.MatchingSetBuyPlanScalarFieldEnum = {
  id: 'id',
  setId: 'setId',
  chainId: 'chainId',
  receiptMonth: 'receiptMonth',
  horizonWeeks: 'horizonWeeks',
  targetCoverWeeks: 'targetCoverWeeks',
  status: 'status',
  generatedPoId: 'generatedPoId',
  otbStatus: 'otbStatus',
  otbSnapshotJson: 'otbSnapshotJson',
  createdAt: 'createdAt',
  createdBy: 'createdBy',
  updatedAt: 'updatedAt',
  updatedBy: 'updatedBy'
};

exports.Prisma.MatchingSetBuyPlanLineScalarFieldEnum = {
  id: 'id',
  planId: 'planId',
  setId: 'setId',
  skuId: 'skuId',
  roleCode: 'roleCode',
  sizeLabel: 'sizeLabel',
  columnLabel: 'columnLabel',
  rowLabel: 'rowLabel',
  onHand: 'onHand',
  onOrder: 'onOrder',
  projectedSales: 'projectedSales',
  targetEnding: 'targetEnding',
  recommendedQty: 'recommendedQty',
  unitCost: 'unitCost',
  retailPrice: 'retailPrice',
  categoryNumber: 'categoryNumber',
  departmentNumber: 'departmentNumber',
  poLineId: 'poLineId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
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

exports.Prisma.StockCostEventScalarFieldEnum = {
  id: 'id',
  stockMovementId: 'stockMovementId',
  storeId: 'storeId',
  skuId: 'skuId',
  quantityDelta: 'quantityDelta',
  valueDeltaHnl: 'valueDeltaHnl',
  unitCostHnl: 'unitCostHnl',
  valuationBasis: 'valuationBasis',
  sourceDocumentType: 'sourceDocumentType',
  sourceDocumentId: 'sourceDocumentId',
  postedBy: 'postedBy',
  postedAt: 'postedAt',
  idempotencyKey: 'idempotencyKey'
};

exports.Prisma.StockCostBalanceScalarFieldEnum = {
  storeId: 'storeId',
  skuId: 'skuId',
  quantityOnHand: 'quantityOnHand',
  inventoryValueHnl: 'inventoryValueHnl',
  averageUnitCostHnl: 'averageUnitCostHnl',
  updatedAt: 'updatedAt'
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

exports.Prisma.ImportShipmentScalarFieldEnum = {
  id: 'id',
  shipmentNumber: 'shipmentNumber',
  displayName: 'displayName',
  status: 'status',
  buyer: 'buyer',
  originPort: 'originPort',
  destinationPort: 'destinationPort',
  carrier: 'carrier',
  freightForwarder: 'freightForwarder',
  customsPolicyNumber: 'customsPolicyNumber',
  blNumber: 'blNumber',
  expectedDepartureAt: 'expectedDepartureAt',
  expectedArrivalAt: 'expectedArrivalAt',
  actualArrivalAt: 'actualArrivalAt',
  baseCurrency: 'baseCurrency',
  sourceWorkbookName: 'sourceWorkbookName',
  notes: 'notes',
  approvedEstimateAt: 'approvedEstimateAt',
  approvedEstimateBy: 'approvedEstimateBy',
  finalLiquidationAt: 'finalLiquidationAt',
  closedAt: 'closedAt',
  createdBy: 'createdBy',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ImportContainerScalarFieldEnum = {
  id: 'id',
  shipmentId: 'shipmentId',
  containerNumber: 'containerNumber',
  containerType: 'containerType',
  sealNumber: 'sealNumber',
  cargoGroup: 'cargoGroup',
  status: 'status',
  expectedArrivalAt: 'expectedArrivalAt',
  actualArrivalAt: 'actualArrivalAt',
  notes: 'notes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ImportShipmentLineScalarFieldEnum = {
  id: 'id',
  shipmentId: 'shipmentId',
  purchaseOrderLineId: 'purchaseOrderLineId',
  containerId: 'containerId',
  invoiceLineId: 'invoiceLineId',
  expectedQuantity: 'expectedQuantity',
  sourceUnitCost: 'sourceUnitCost',
  sourceCurrency: 'sourceCurrency',
  fxRate: 'fxRate',
  fxDate: 'fxDate',
  incotermCode: 'incotermCode',
  incotermPlace: 'incotermPlace',
  commercialUnitCostHnl: 'commercialUnitCostHnl',
  estimatedLandedUnitCostHnl: 'estimatedLandedUnitCostHnl',
  allocatedLandedCostHnl: 'allocatedLandedCostHnl',
  landedUnitCostHnl: 'landedUnitCostHnl',
  status: 'status',
  invoiceMatchApprovedAt: 'invoiceMatchApprovedAt',
  invoiceMatchApprovedBy: 'invoiceMatchApprovedBy',
  invoiceMatchApprovalReason: 'invoiceMatchApprovalReason',
  notes: 'notes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ImportSupplierInvoiceScalarFieldEnum = {
  id: 'id',
  shipmentId: 'shipmentId',
  invoiceNumber: 'invoiceNumber',
  supplierCode: 'supplierCode',
  supplierName: 'supplierName',
  invoiceDate: 'invoiceDate',
  invoiceGroup: 'invoiceGroup',
  invoiceKind: 'invoiceKind',
  sourceAmount: 'sourceAmount',
  sourceCurrency: 'sourceCurrency',
  fxRate: 'fxRate',
  fxDate: 'fxDate',
  hnlAmount: 'hnlAmount',
  notes: 'notes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ImportInvoiceLineScalarFieldEnum = {
  id: 'id',
  invoiceId: 'invoiceId',
  skuId: 'skuId',
  purchaseOrderLineId: 'purchaseOrderLineId',
  lineNumber: 'lineNumber',
  itemCode: 'itemCode',
  styleCode: 'styleCode',
  description: 'description',
  materialMeters: 'materialMeters',
  cartonCount: 'cartonCount',
  weightKg: 'weightKg',
  volumeCbm: 'volumeCbm',
  quantity: 'quantity',
  unitOfMeasure: 'unitOfMeasure',
  sourceUnitCost: 'sourceUnitCost',
  sourceAmount: 'sourceAmount',
  sourceCurrency: 'sourceCurrency',
  fxRate: 'fxRate',
  fxDate: 'fxDate',
  hnlAmount: 'hnlAmount',
  baseUnitCostHnl: 'baseUnitCostHnl',
  allocatedLandedCostHnl: 'allocatedLandedCostHnl',
  landedUnitCostHnl: 'landedUnitCostHnl',
  costRole: 'costRole',
  receiptPolicy: 'receiptPolicy',
  allocationGroupKey: 'allocationGroupKey',
  componentAllocatedCostHnl: 'componentAllocatedCostHnl',
  commercialUnitCostHnl: 'commercialUnitCostHnl',
  taxable: 'taxable',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ImportChargeScalarFieldEnum = {
  id: 'id',
  shipmentId: 'shipmentId',
  chargeType: 'chargeType',
  counterparty: 'counterparty',
  documentNumber: 'documentNumber',
  sourceAmount: 'sourceAmount',
  sourceCurrency: 'sourceCurrency',
  fxRate: 'fxRate',
  fxDate: 'fxDate',
  hnlAmount: 'hnlAmount',
  allocationBasis: 'allocationBasis',
  taxable: 'taxable',
  estimated: 'estimated',
  final: 'final',
  costTreatment: 'costTreatment',
  notes: 'notes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ImportLandedCostAllocationScalarFieldEnum = {
  id: 'id',
  shipmentId: 'shipmentId',
  chargeId: 'chargeId',
  invoiceLineId: 'invoiceLineId',
  shipmentLineId: 'shipmentLineId',
  allocationBasis: 'allocationBasis',
  allocatedHnlAmount: 'allocatedHnlAmount',
  createdAt: 'createdAt'
};

exports.Prisma.ImportCostBuildScalarFieldEnum = {
  id: 'id',
  shipmentId: 'shipmentId',
  buildCode: 'buildCode',
  description: 'description',
  outputInvoiceLineId: 'outputInvoiceLineId',
  outputShipmentLineId: 'outputShipmentLineId',
  outputSkuId: 'outputSkuId',
  outputQuantity: 'outputQuantity',
  allocationBasis: 'allocationBasis',
  createdBy: 'createdBy',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ImportCostComponentAllocationScalarFieldEnum = {
  id: 'id',
  shipmentId: 'shipmentId',
  buildId: 'buildId',
  componentInvoiceLineId: 'componentInvoiceLineId',
  outputInvoiceLineId: 'outputInvoiceLineId',
  outputShipmentLineId: 'outputShipmentLineId',
  allocationBasis: 'allocationBasis',
  allocatedHnlAmount: 'allocatedHnlAmount',
  allocatedQuantity: 'allocatedQuantity',
  createdAt: 'createdAt'
};

exports.Prisma.GoodsInTransitRecordScalarFieldEnum = {
  id: 'id',
  shipmentId: 'shipmentId',
  containerId: 'containerId',
  invoiceLineId: 'invoiceLineId',
  shipmentLineId: 'shipmentLineId',
  status: 'status',
  ownershipTransferAt: 'ownershipTransferAt',
  expectedReceiptAt: 'expectedReceiptAt',
  receivedAt: 'receivedAt',
  quantityInTransit: 'quantityInTransit',
  auditReason: 'auditReason',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ImportVerificationCheckScalarFieldEnum = {
  id: 'id',
  shipmentId: 'shipmentId',
  checkCode: 'checkCode',
  status: 'status',
  expectedHnlAmount: 'expectedHnlAmount',
  actualHnlAmount: 'actualHnlAmount',
  varianceHnlAmount: 'varianceHnlAmount',
  message: 'message',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ImportSuggestedPriceScalarFieldEnum = {
  id: 'id',
  shipmentId: 'shipmentId',
  invoiceLineId: 'invoiceLineId',
  skuId: 'skuId',
  landedUnitCostHnl: 'landedUnitCostHnl',
  markupFactor: 'markupFactor',
  suggestedRetailHnl: 'suggestedRetailHnl',
  approvalStatus: 'approvalStatus',
  approvedBy: 'approvedBy',
  approvedAt: 'approvedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ImportPayableHandoffScalarFieldEnum = {
  id: 'id',
  shipmentId: 'shipmentId',
  sourceType: 'sourceType',
  sourceId: 'sourceId',
  counterparty: 'counterparty',
  documentNumber: 'documentNumber',
  payableKind: 'payableKind',
  sourceAmount: 'sourceAmount',
  sourceCurrency: 'sourceCurrency',
  fxRate: 'fxRate',
  fxDate: 'fxDate',
  hnlAmount: 'hnlAmount',
  final: 'final',
  handoffStatus: 'handoffStatus',
  apReference: 'apReference',
  sentToApBy: 'sentToApBy',
  sentToApAt: 'sentToApAt',
  paymentReference: 'paymentReference',
  paidBy: 'paidBy',
  paidAt: 'paidAt',
  voidedBy: 'voidedBy',
  voidedAt: 'voidedAt',
  voidReason: 'voidReason',
  notes: 'notes',
  createdBy: 'createdBy',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ImportInventoryReceiptScalarFieldEnum = {
  id: 'id',
  shipmentId: 'shipmentId',
  invoiceLineId: 'invoiceLineId',
  goodsInTransitRecordId: 'goodsInTransitRecordId',
  stockMovementId: 'stockMovementId',
  skuId: 'skuId',
  storeId: 'storeId',
  receiptBasis: 'receiptBasis',
  quantity: 'quantity',
  unitCostHnl: 'unitCostHnl',
  hnlAmount: 'hnlAmount',
  postedBy: 'postedBy',
  auditReason: 'auditReason',
  postedAt: 'postedAt'
};

exports.Prisma.ImportInventoryTrueUpScalarFieldEnum = {
  id: 'id',
  shipmentId: 'shipmentId',
  invoiceLineId: 'invoiceLineId',
  goodsInTransitRecordId: 'goodsInTransitRecordId',
  purchaseOrderId: 'purchaseOrderId',
  purchaseOrderLineId: 'purchaseOrderLineId',
  poReceiptLineId: 'poReceiptLineId',
  importInventoryReceiptId: 'importInventoryReceiptId',
  stockMovementId: 'stockMovementId',
  skuId: 'skuId',
  storeId: 'storeId',
  quantity: 'quantity',
  estimatedUnitCostHnl: 'estimatedUnitCostHnl',
  finalUnitCostHnl: 'finalUnitCostHnl',
  deltaUnitCostHnl: 'deltaUnitCostHnl',
  deltaHnlAmount: 'deltaHnlAmount',
  postedBy: 'postedBy',
  auditReason: 'auditReason',
  postedAt: 'postedAt'
};

exports.Prisma.ReplenishmentTargetScalarFieldEnum = {
  id: 'id',
  storeId: 'storeId',
  skuId: 'skuId',
  columnLabel: 'columnLabel',
  rowLabel: 'rowLabel',
  modelQty: 'modelQty',
  maxQty: 'maxQty',
  reorderQty: 'reorderQty',
  updatedBy: 'updatedBy',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.InventorySalesCellScalarFieldEnum = {
  id: 'id',
  storeId: 'storeId',
  skuId: 'skuId',
  columnLabel: 'columnLabel',
  rowLabel: 'rowLabel',
  mtdSales: 'mtdSales',
  stdSales: 'stdSales',
  ytdSales: 'ytdSales',
  lySales: 'lySales',
  source: 'source',
  sourceRunId: 'sourceRunId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ReorderPlannerDefaultsScalarFieldEnum = {
  id: 'id',
  scopeType: 'scopeType',
  scopeKey: 'scopeKey',
  leadTimeDays: 'leadTimeDays',
  orderCycleDays: 'orderCycleDays',
  moqQty: 'moqQty',
  createdAt: 'createdAt',
  createdBy: 'createdBy',
  updatedAt: 'updatedAt',
  updatedBy: 'updatedBy'
};

exports.Prisma.InventoryHistorySnapshotScalarFieldEnum = {
  id: 'id',
  skuId: 'skuId',
  skuCode: 'skuCode',
  storeId: 'storeId',
  source: 'source',
  sourceRunId: 'sourceRunId',
  snapshotAsOf: 'snapshotAsOf',
  dateLastReceived: 'dateLastReceived',
  averageCost: 'averageCost',
  seasonInvValue: 'seasonInvValue',
  yearInvValue: 'yearInvValue',
  lastMonthInvValue: 'lastMonthInvValue',
  onHand: 'onHand',
  currentOnOrder: 'currentOnOrder',
  futureOnOrder: 'futureOnOrder',
  modelQty: 'modelQty',
  weekQtySales: 'weekQtySales',
  monthQtySales: 'monthQtySales',
  seasonQtySales: 'seasonQtySales',
  yearQtySales: 'yearQtySales',
  lySeasonQtySales: 'lySeasonQtySales',
  lyYearQtySales: 'lyYearQtySales',
  weekDolSales: 'weekDolSales',
  monthDolSales: 'monthDolSales',
  seasonDolSales: 'seasonDolSales',
  yearDolSales: 'yearDolSales',
  lySeasonDolSales: 'lySeasonDolSales',
  lyYearDolSales: 'lyYearDolSales',
  weekProfit: 'weekProfit',
  monthProfit: 'monthProfit',
  seasonProfit: 'seasonProfit',
  yearProfit: 'yearProfit',
  lySeasonProfit: 'lySeasonProfit',
  lyYearProfit: 'lyYearProfit',
  weekMarkdown: 'weekMarkdown',
  monthMarkdown: 'monthMarkdown',
  seasonMarkdown: 'seasonMarkdown',
  yearMarkdown: 'yearMarkdown',
  lastMonthOnHand: 'lastMonthOnHand',
  lastSeasonOnHand: 'lastSeasonOnHand',
  lastYearOnHand: 'lastYearOnHand',
  trendWeek8BegOnHand: 'trendWeek8BegOnHand',
  lastMonthRetail: 'lastMonthRetail',
  retailPrice: 'retailPrice',
  markDownPrice1: 'markDownPrice1',
  markDownPrice2: 'markDownPrice2',
  currentPriceSlotRaw: 'currentPriceSlotRaw',
  currentPriceSlot: 'currentPriceSlot',
  perks: 'perks',
  dateFirstReceived: 'dateFirstReceived',
  lastPriceChangeAt: 'lastPriceChangeAt',
  sourceDateLastChanged: 'sourceDateLastChanged',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.InventoryHistoryMonthScalarFieldEnum = {
  id: 'id',
  snapshotId: 'snapshotId',
  slotNumber: 'slotNumber',
  calendarMonth: 'calendarMonth',
  storedYear: 'storedYear',
  yearMonth: 'yearMonth',
  qtySales: 'qtySales',
  netSales: 'netSales',
  profit: 'profit',
  qtyOnHand: 'qtyOnHand',
  inventoryValue: 'inventoryValue'
};

exports.Prisma.InventoryHistoryTrendWeekScalarFieldEnum = {
  id: 'id',
  snapshotId: 'snapshotId',
  slotNumber: 'slotNumber',
  beginOnHand: 'beginOnHand',
  onHandConstant: 'onHandConstant',
  sales: 'sales'
};

exports.Prisma.InventoryHistoryMovementBucketScalarFieldEnum = {
  id: 'id',
  snapshotId: 'snapshotId',
  bucketNumber: 'bucketNumber',
  receivedQty: 'receivedQty',
  receivedValue: 'receivedValue',
  returnedQty: 'returnedQty',
  returnedValue: 'returnedValue',
  transferInQty: 'transferInQty',
  transferInValue: 'transferInValue',
  transferOutQty: 'transferOutQty',
  transferOutValue: 'transferOutValue',
  physicalQty: 'physicalQty',
  physicalValue: 'physicalValue',
  beginningValue: 'beginningValue'
};

exports.Prisma.InventoryMonthCloseRunScalarFieldEnum = {
  id: 'id',
  yearMonth: 'yearMonth',
  targetSlot: 'targetSlot',
  snapshotAsOf: 'snapshotAsOf',
  closedBy: 'closedBy',
  dryRun: 'dryRun',
  status: 'status',
  validationStatus: 'validationStatus',
  snapshotsScanned: 'snapshotsScanned',
  monthsUpserted: 'monthsUpserted',
  snapshotsUpdated: 'snapshotsUpdated',
  nonzeroMtdCellsBefore: 'nonzeroMtdCellsBefore',
  salesCellsReset: 'salesCellsReset',
  unpromotedPosTickets: 'unpromotedPosTickets',
  salesCellMismatchCount: 'salesCellMismatchCount',
  salesCellMismatchQtyAbs: 'salesCellMismatchQtyAbs',
  totalQtySales: 'totalQtySales',
  totalNetSales: 'totalNetSales',
  totalProfit: 'totalProfit',
  inventoryValueTotal: 'inventoryValueTotal',
  errorText: 'errorText',
  startedAt: 'startedAt',
  finishedAt: 'finishedAt'
};

exports.Prisma.InventoryClosedMonthScalarFieldEnum = {
  yearMonth: 'yearMonth',
  runId: 'runId',
  targetSlot: 'targetSlot',
  snapshotAsOf: 'snapshotAsOf',
  closedBy: 'closedBy',
  closedAt: 'closedAt',
  snapshotsClosed: 'snapshotsClosed',
  monthRowsClosed: 'monthRowsClosed',
  salesCellsReset: 'salesCellsReset',
  totalQtySales: 'totalQtySales',
  totalNetSales: 'totalNetSales',
  totalProfit: 'totalProfit',
  inventoryValueTotal: 'inventoryValueTotal'
};

exports.Prisma.InventoryWeekCloseRunScalarFieldEnum = {
  id: 'id',
  weekEndingDate: 'weekEndingDate',
  weekStartDate: 'weekStartDate',
  snapshotAsOf: 'snapshotAsOf',
  closedBy: 'closedBy',
  dryRun: 'dryRun',
  status: 'status',
  validationStatus: 'validationStatus',
  snapshotsScanned: 'snapshotsScanned',
  trendRowsWritten: 'trendRowsWritten',
  snapshotsUpdated: 'snapshotsUpdated',
  unpromotedPosTickets: 'unpromotedPosTickets',
  weekSalesMismatchCount: 'weekSalesMismatchCount',
  weekSalesMismatchQtyAbs: 'weekSalesMismatchQtyAbs',
  totalWeekQtySales: 'totalWeekQtySales',
  totalWeekNetSales: 'totalWeekNetSales',
  totalWeekProfit: 'totalWeekProfit',
  errorText: 'errorText',
  startedAt: 'startedAt',
  finishedAt: 'finishedAt'
};

exports.Prisma.InventoryClosedWeekScalarFieldEnum = {
  weekEndingDate: 'weekEndingDate',
  runId: 'runId',
  weekStartDate: 'weekStartDate',
  snapshotAsOf: 'snapshotAsOf',
  closedBy: 'closedBy',
  closedAt: 'closedAt',
  snapshotsClosed: 'snapshotsClosed',
  trendRowsClosed: 'trendRowsClosed',
  totalWeekQtySales: 'totalWeekQtySales',
  totalWeekNetSales: 'totalWeekNetSales',
  totalWeekProfit: 'totalWeekProfit'
};

exports.Prisma.ManualReturnScalarFieldEnum = {
  id: 'id',
  storeId: 'storeId',
  skuId: 'skuId',
  performedBy: 'performedBy',
  returnReasonCode: 'returnReasonCode',
  rmaNumber: 'rmaNumber',
  movementAt: 'movementAt',
  note: 'note',
  idempotencyKey: 'idempotencyKey',
  createdAt: 'createdAt'
};

exports.Prisma.ManualReturnLineScalarFieldEnum = {
  id: 'id',
  manualReturnId: 'manualReturnId',
  columnLabel: 'columnLabel',
  rowLabel: 'rowLabel',
  quantity: 'quantity',
  unitCost: 'unitCost',
  movementId: 'movementId'
};

exports.Prisma.TransferScalarFieldEnum = {
  id: 'id',
  transferNumber: 'transferNumber',
  fromStoreId: 'fromStoreId',
  toStoreId: 'toStoreId',
  status: 'status',
  origin: 'origin',
  originRunId: 'originRunId',
  reason: 'reason',
  createdBy: 'createdBy',
  shippedAt: 'shippedAt',
  receivedAt: 'receivedAt',
  cancelledAt: 'cancelledAt',
  createdAt: 'createdAt'
};

exports.Prisma.TransferLineScalarFieldEnum = {
  id: 'id',
  transferId: 'transferId',
  skuId: 'skuId',
  columnLabel: 'columnLabel',
  rowLabel: 'rowLabel',
  quantity: 'quantity',
  unitCostSnapshot: 'unitCostSnapshot',
  outboundMovementId: 'outboundMovementId',
  inboundMovementId: 'inboundMovementId'
};

exports.Prisma.AutoTransferRunScalarFieldEnum = {
  id: 'id',
  status: 'status',
  warehouseStoreId: 'warehouseStoreId',
  targetStoreIds: 'targetStoreIds',
  sortOrder: 'sortOrder',
  criteriaJson: 'criteriaJson',
  inTransitPos: 'inTransitPos',
  requestedBy: 'requestedBy',
  createdAt: 'createdAt',
  previewedAt: 'previewedAt',
  committedAt: 'committedAt',
  generatedTransferIds: 'generatedTransferIds'
};

exports.Prisma.BalancingTransferRunScalarFieldEnum = {
  id: 'id',
  status: 'status',
  balancingMethod: 'balancingMethod',
  performanceMetric: 'performanceMetric',
  salesPeriod: 'salesPeriod',
  tieBreakKind: 'tieBreakKind',
  tieBreakValue: 'tieBreakValue',
  transferDoublesToLowerPriority: 'transferDoublesToLowerPriority',
  stripStoresBelowSizeCount: 'stripStoresBelowSizeCount',
  includeOriginalRetailOnly: 'includeOriginalRetailOnly',
  includeMarkdownOnly: 'includeMarkdownOnly',
  includePerksOnly: 'includePerksOnly',
  criteriaJson: 'criteriaJson',
  inTransitPos: 'inTransitPos',
  requestedBy: 'requestedBy',
  createdAt: 'createdAt',
  previewedAt: 'previewedAt',
  committedAt: 'committedAt',
  generatedTransferIds: 'generatedTransferIds',
  exceptionsJson: 'exceptionsJson'
};

exports.Prisma.BalancingTransferRunV2ScalarFieldEnum = {
  id: 'id',
  status: 'status',
  goalPreset: 'goalPreset',
  balancingMethod: 'balancingMethod',
  performanceMetric: 'performanceMetric',
  salesPeriod: 'salesPeriod',
  sortOrder: 'sortOrder',
  tieBreakKind: 'tieBreakKind',
  tieBreakValue: 'tieBreakValue',
  transferDoublesToLowerPriority: 'transferDoublesToLowerPriority',
  stripStoresBelowSizeCount: 'stripStoresBelowSizeCount',
  inTransitPos: 'inTransitPos',
  allowLowConfidenceMoves: 'allowLowConfidenceMoves',
  cooldownDays: 'cooldownDays',
  protectDaysOverride: 'protectDaysOverride',
  requestedBy: 'requestedBy',
  createdAt: 'createdAt',
  previewedAt: 'previewedAt',
  committedAt: 'committedAt',
  generatedTransferIds: 'generatedTransferIds',
  criteriaJson: 'criteriaJson',
  summaryJson: 'summaryJson',
  linesJson: 'linesJson',
  exceptionsJson: 'exceptionsJson',
  comparisonJson: 'comparisonJson',
  comparedLegacyRunId: 'comparedLegacyRunId'
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
  descriptionEs: 'descriptionEs',
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

exports.Prisma.AttributeDerivationRuleScalarFieldEnum = {
  sourceDimensionCode: 'sourceDimensionCode',
  sourceValueCode: 'sourceValueCode',
  targetDimensionCode: 'targetDimensionCode',
  targetValueCode: 'targetValueCode',
  updatedAt: 'updatedAt',
  updatedBy: 'updatedBy'
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

exports.Prisma.CustomerIntelligenceCustomerScalarFieldEnum = {
  id: 'id',
  honduranIdRaw: 'honduranIdRaw',
  honduranIdNormalized: 'honduranIdNormalized',
  fullName: 'fullName',
  gender: 'gender',
  birthDate: 'birthDate',
  status: 'status',
  source: 'source',
  firstSeenAt: 'firstSeenAt',
  lastSeenAt: 'lastSeenAt',
  importedFromBatchId: 'importedFromBatchId',
  ricsAccount: 'ricsAccount',
  ricsCode: 'ricsCode',
  ricsDateAdded: 'ricsDateAdded',
  ricsDateLastChanged: 'ricsDateLastChanged',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CustomerIdentityScalarFieldEnum = {
  id: 'id',
  customerId: 'customerId',
  identityType: 'identityType',
  identityValue: 'identityValue',
  normalizedValue: 'normalizedValue',
  source: 'source',
  isPrimary: 'isPrimary',
  createdAt: 'createdAt'
};

exports.Prisma.CustomerContactScalarFieldEnum = {
  id: 'id',
  customerId: 'customerId',
  contactType: 'contactType',
  value: 'value',
  normalizedValue: 'normalizedValue',
  isPrimary: 'isPrimary',
  isVerified: 'isVerified',
  acceptsMarketing: 'acceptsMarketing',
  source: 'source',
  createdAt: 'createdAt'
};

exports.Prisma.CustomerAddressScalarFieldEnum = {
  id: 'id',
  customerId: 'customerId',
  addr1: 'addr1',
  addr2: 'addr2',
  city: 'city',
  state: 'state',
  county: 'county',
  zip: 'zip',
  country: 'country',
  source: 'source',
  createdAt: 'createdAt'
};

exports.Prisma.CustomerLegacyProfileScalarFieldEnum = {
  id: 'id',
  customerId: 'customerId',
  customerExtra01: 'customerExtra01',
  customerExtra02: 'customerExtra02',
  customerExtra03: 'customerExtra03',
  customerExtra04: 'customerExtra04',
  customerExtra05: 'customerExtra05',
  customerExtra06: 'customerExtra06',
  mailExtra01: 'mailExtra01',
  mailExtra02: 'mailExtra02',
  mailExtra03: 'mailExtra03',
  mailExtra04: 'mailExtra04',
  mailExtra05: 'mailExtra05',
  mailExtra06: 'mailExtra06',
  customerComment: 'customerComment',
  mailComment: 'mailComment',
  changeTo: 'changeTo',
  createdAt: 'createdAt'
};

exports.Prisma.CustomerFinancialProfileScalarFieldEnum = {
  id: 'id',
  customerId: 'customerId',
  creditLimit: 'creditLimit',
  currentBalance: 'currentBalance',
  creditSlipBalance: 'creditSlipBalance',
  nonTaxable: 'nonTaxable',
  planNum: 'planNum',
  planCount: 'planCount',
  planDollars: 'planDollars',
  planLastCreditAt: 'planLastCreditAt',
  planCreditBalance: 'planCreditBalance',
  createdAt: 'createdAt'
};

exports.Prisma.CustomerSalesSummaryLegacyScalarFieldEnum = {
  id: 'id',
  customerId: 'customerId',
  dateLastPurchase: 'dateLastPurchase',
  qtySales01: 'qtySales01',
  qtySales02: 'qtySales02',
  qtySales03: 'qtySales03',
  qtySales04: 'qtySales04',
  dollarSales01: 'dollarSales01',
  dollarSales02: 'dollarSales02',
  dollarSales03: 'dollarSales03',
  dollarSales04: 'dollarSales04',
  createdAt: 'createdAt'
};

exports.Prisma.CustomerImportBatchScalarFieldEnum = {
  id: 'id',
  source: 'source',
  fileName: 'fileName',
  startedAt: 'startedAt',
  finishedAt: 'finishedAt',
  totalRows: 'totalRows',
  createdCount: 'createdCount',
  updatedCount: 'updatedCount',
  skippedCount: 'skippedCount',
  rejectedCount: 'rejectedCount'
};

exports.Prisma.CustomerImportRejectScalarFieldEnum = {
  id: 'id',
  batchId: 'batchId',
  sourceFile: 'sourceFile',
  rowNumber: 'rowNumber',
  account: 'account',
  code: 'code',
  name: 'name',
  honduranIdRaw: 'honduranIdRaw',
  honduranIdNormalized: 'honduranIdNormalized',
  email: 'email',
  rejectReason: 'rejectReason',
  rawRow: 'rawRow',
  createdAt: 'createdAt'
};

exports.Prisma.CustomerTransactionFactScalarFieldEnum = {
  id: 'id',
  customerId: 'customerId',
  externalTransactionId: 'externalTransactionId',
  source: 'source',
  transactionKind: 'transactionKind',
  status: 'status',
  storeId: 'storeId',
  channel: 'channel',
  promotionCode: 'promotionCode',
  couponCode: 'couponCode',
  totalAmount: 'totalAmount',
  netAmount: 'netAmount',
  costAmount: 'costAmount',
  discountAmount: 'discountAmount',
  purchasedAt: 'purchasedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CustomerTransactionItemScalarFieldEnum = {
  id: 'id',
  transactionId: 'transactionId',
  skuId: 'skuId',
  categoryId: 'categoryId',
  categoryKey: 'categoryKey',
  brandId: 'brandId',
  brandKey: 'brandKey',
  sizeType: 'sizeType',
  sizeValue: 'sizeValue',
  quantity: 'quantity',
  netAmount: 'netAmount',
  costAmount: 'costAmount',
  discountAmount: 'discountAmount',
  isMarkdown: 'isMarkdown',
  isReturn: 'isReturn',
  createdAt: 'createdAt'
};

exports.Prisma.SalesHistoryTicketScalarFieldEnum = {
  id: 'id',
  externalTransactionId: 'externalTransactionId',
  source: 'source',
  matchedCustomerId: 'matchedCustomerId',
  accountKey: 'accountKey',
  transactionType: 'transactionType',
  transactionKind: 'transactionKind',
  status: 'status',
  storeId: 'storeId',
  terminal: 'terminal',
  ticketNumber: 'ticketNumber',
  cashierCode: 'cashierCode',
  channel: 'channel',
  promotionCode: 'promotionCode',
  couponCode: 'couponCode',
  totalAmount: 'totalAmount',
  netAmount: 'netAmount',
  costAmount: 'costAmount',
  discountAmount: 'discountAmount',
  purchasedAt: 'purchasedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SalesHistoryTicketLineScalarFieldEnum = {
  id: 'id',
  ticketId: 'ticketId',
  lineNumber: 'lineNumber',
  skuId: 'skuId',
  skuCode: 'skuCode',
  categoryId: 'categoryId',
  categoryKey: 'categoryKey',
  brandId: 'brandId',
  brandKey: 'brandKey',
  columnLabel: 'columnLabel',
  rowLabel: 'rowLabel',
  sizeType: 'sizeType',
  sizeValue: 'sizeValue',
  quantity: 'quantity',
  unitPrice: 'unitPrice',
  unitCost: 'unitCost',
  netAmount: 'netAmount',
  costAmount: 'costAmount',
  discountAmount: 'discountAmount',
  isMarkdown: 'isMarkdown',
  isReturn: 'isReturn',
  returnCode: 'returnCode',
  salespersonCode: 'salespersonCode',
  createdAt: 'createdAt'
};

exports.Prisma.TicketHeaderScalarFieldEnum = {
  id: 'id',
  source: 'source',
  externalTransactionId: 'externalTransactionId',
  ticketIdentityKey: 'ticketIdentityKey',
  ticketId: 'ticketId',
  userId: 'userId',
  batchDate: 'batchDate',
  useDate: 'useDate',
  terminal: 'terminal',
  store: 'store',
  ticket: 'ticket',
  realDate: 'realDate',
  cashier: 'cashier',
  transType: 'transType',
  account: 'account',
  tax01: 'tax01',
  tax02: 'tax02',
  tax03: 'tax03',
  taxChange: 'taxChange',
  othChg: 'othChg',
  prevPaid: 'prevPaid',
  comment: 'comment',
  changeAmount: 'changeAmount',
  altChange: 'altChange',
  exchRate: 'exchRate',
  discount: 'discount',
  applyTo: 'applyTo',
  applyTender: 'applyTender',
  applyAmount: 'applyAmount',
  shipState: 'shipState',
  shipCounty: 'shipCounty',
  shipCity: 'shipCity',
  marketingCode: 'marketingCode',
  voided: 'voided',
  printed: 'printed',
  posted: 'posted',
  importedAt: 'importedAt'
};

exports.Prisma.TicketDetailScalarFieldEnum = {
  id: 'id',
  source: 'source',
  sourceRowNumber: 'sourceRowNumber',
  externalTransactionId: 'externalTransactionId',
  ticketIdentityKey: 'ticketIdentityKey',
  ticketId: 'ticketId',
  userId: 'userId',
  batchDate: 'batchDate',
  useDate: 'useDate',
  terminal: 'terminal',
  store: 'store',
  ticket: 'ticket',
  realDate: 'realDate',
  lineNo: 'lineNo',
  sku: 'sku',
  columnLabel: 'columnLabel',
  rowLabel: 'rowLabel',
  qty: 'qty',
  price: 'price',
  discPct: 'discPct',
  discAmt: 'discAmt',
  perks: 'perks',
  salesperson: 'salesperson',
  famMember: 'famMember',
  prices01: 'prices01',
  prices02: 'prices02',
  prices03: 'prices03',
  prices04: 'prices04',
  ovsAmt: 'ovsAmt',
  thisOvsAmt: 'thisOvsAmt',
  category: 'category',
  vendor: 'vendor',
  realPrice: 'realPrice',
  extension: 'extension',
  origTicket: 'origTicket',
  tax01: 'tax01',
  tax02: 'tax02',
  tax03: 'tax03',
  taxamt01: 'taxamt01',
  taxamt02: 'taxamt02',
  taxamt03: 'taxamt03',
  fbGen: 'fbGen',
  dsShipCode: 'dsShipCode',
  dsShipDesc: 'dsShipDesc',
  dsDestCode: 'dsDestCode',
  dsDyeCode: 'dsDyeCode',
  dsShipChg: 'dsShipChg',
  returnCode: 'returnCode',
  giftCert: 'giftCert',
  giftSeq: 'giftSeq',
  giftAcct: 'giftAcct',
  cost: 'cost',
  comment: 'comment',
  importedAt: 'importedAt'
};

exports.Prisma.TicketTenderScalarFieldEnum = {
  id: 'id',
  source: 'source',
  sourceRowNumber: 'sourceRowNumber',
  externalTransactionId: 'externalTransactionId',
  ticketIdentityKey: 'ticketIdentityKey',
  ticketId: 'ticketId',
  userId: 'userId',
  batchDate: 'batchDate',
  useDate: 'useDate',
  terminal: 'terminal',
  store: 'store',
  ticket: 'ticket',
  realDate: 'realDate',
  tender: 'tender',
  amount: 'amount',
  altAmount: 'altAmount',
  altCurrency: 'altCurrency',
  exchRate: 'exchRate',
  giftCert: 'giftCert',
  giftSeq: 'giftSeq',
  giftNew: 'giftNew',
  importedAt: 'importedAt'
};

exports.Prisma.CustomerMetricsScalarFieldEnum = {
  customerId: 'customerId',
  lifetimeValue: 'lifetimeValue',
  totalOrders: 'totalOrders',
  avgOrderValue: 'avgOrderValue',
  marginValue: 'marginValue',
  orders30d: 'orders30d',
  orders90d: 'orders90d',
  orders365d: 'orders365d',
  avgDaysBetweenOrders: 'avgDaysBetweenOrders',
  lastPurchaseDate: 'lastPurchaseDate',
  recencyDays: 'recencyDays',
  isActive: 'isActive',
  discountRatio: 'discountRatio',
  primaryStoreId: 'primaryStoreId',
  storeLoyaltyRatio: 'storeLoyaltyRatio',
  onlineRatio: 'onlineRatio',
  churnRisk: 'churnRisk',
  isDormant: 'isDormant',
  rScore: 'rScore',
  fScore: 'fScore',
  mScore: 'mScore',
  updatedAt: 'updatedAt'
};

exports.Prisma.CustomerMetricsDailyScalarFieldEnum = {
  id: 'id',
  customerId: 'customerId',
  snapshotDate: 'snapshotDate',
  lifetimeValue: 'lifetimeValue',
  totalOrders: 'totalOrders',
  recencyDays: 'recencyDays',
  orders90d: 'orders90d',
  createdAt: 'createdAt'
};

exports.Prisma.CustomerFeatureCurrentScalarFieldEnum = {
  customerId: 'customerId',
  firstPurchaseAt: 'firstPurchaseAt',
  lastPurchaseAt: 'lastPurchaseAt',
  daysSinceFirstPurchase: 'daysSinceFirstPurchase',
  daysSinceLastPurchase: 'daysSinceLastPurchase',
  orderCountLifetime: 'orderCountLifetime',
  orderCount7d: 'orderCount7d',
  orderCount30d: 'orderCount30d',
  orderCount90d: 'orderCount90d',
  orderCount180d: 'orderCount180d',
  orderCount365d: 'orderCount365d',
  itemCountLifetime: 'itemCountLifetime',
  itemCount365d: 'itemCount365d',
  netRevenueLifetime: 'netRevenueLifetime',
  netRevenue30d: 'netRevenue30d',
  netRevenue90d: 'netRevenue90d',
  netRevenue180d: 'netRevenue180d',
  netRevenue365d: 'netRevenue365d',
  grossRevenueLifetime: 'grossRevenueLifetime',
  grossRevenue365d: 'grossRevenue365d',
  grossMarginLifetime: 'grossMarginLifetime',
  grossMargin90d: 'grossMargin90d',
  grossMargin365d: 'grossMargin365d',
  avgOrderValueLifetime: 'avgOrderValueLifetime',
  avgOrderValue365d: 'avgOrderValue365d',
  avgItemsPerOrder365d: 'avgItemsPerOrder365d',
  returnCountLifetime: 'returnCountLifetime',
  returnCount365d: 'returnCount365d',
  returnedItemCount365d: 'returnedItemCount365d',
  returnRate365d: 'returnRate365d',
  markdownRevenueShare365d: 'markdownRevenueShare365d',
  averageDiscountPercent365d: 'averageDiscountPercent365d',
  couponRedemptionCount365d: 'couponRedemptionCount365d',
  couponRedemptionRate365d: 'couponRedemptionRate365d',
  fullPricePurchaseCount365d: 'fullPricePurchaseCount365d',
  promoPurchaseCount365d: 'promoPurchaseCount365d',
  preferredStoreId: 'preferredStoreId',
  preferredChannel: 'preferredChannel',
  primaryStorePurchaseCount365d: 'primaryStorePurchaseCount365d',
  webOrderCount365d: 'webOrderCount365d',
  storeOrderCount365d: 'storeOrderCount365d',
  emailOptIn: 'emailOptIn',
  smsOptIn: 'smsOptIn',
  pushOptIn: 'pushOptIn',
  loyaltyTier: 'loyaltyTier',
  loyaltyPointsBalance: 'loyaltyPointsBalance',
  employeeFlag: 'employeeFlag',
  fraudRiskFlag: 'fraudRiskFlag',
  abuseRiskFlag: 'abuseRiskFlag',
  updatedAt: 'updatedAt'
};

exports.Prisma.CustomerCategoryFeatureScalarFieldEnum = {
  customerId: 'customerId',
  categoryId: 'categoryId',
  categoryKey: 'categoryKey',
  purchaseCountLifetime: 'purchaseCountLifetime',
  purchaseCount365d: 'purchaseCount365d',
  netRevenueLifetime: 'netRevenueLifetime',
  netRevenue365d: 'netRevenue365d',
  grossMargin365d: 'grossMargin365d',
  lastPurchaseAt: 'lastPurchaseAt',
  affinityScore: 'affinityScore',
  updatedAt: 'updatedAt'
};

exports.Prisma.CustomerBrandFeatureScalarFieldEnum = {
  customerId: 'customerId',
  brandId: 'brandId',
  brandKey: 'brandKey',
  purchaseCountLifetime: 'purchaseCountLifetime',
  purchaseCount365d: 'purchaseCount365d',
  netRevenueLifetime: 'netRevenueLifetime',
  netRevenue365d: 'netRevenue365d',
  grossMargin365d: 'grossMargin365d',
  lastPurchaseAt: 'lastPurchaseAt',
  affinityScore: 'affinityScore',
  updatedAt: 'updatedAt'
};

exports.Prisma.CustomerSizeProfileScalarFieldEnum = {
  customerId: 'customerId',
  sizeType: 'sizeType',
  sizeValue: 'sizeValue',
  confidenceScore: 'confidenceScore',
  purchaseCount: 'purchaseCount',
  lastSeenAt: 'lastSeenAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SegmentMetricRegistryScalarFieldEnum = {
  metricKey: 'metricKey',
  displayName: 'displayName',
  description: 'description',
  valueType: 'valueType',
  sourceType: 'sourceType',
  sourceTable: 'sourceTable',
  sourceColumn: 'sourceColumn',
  allowedOperators: 'allowedOperators',
  supportsWindow: 'supportsWindow',
  supportsDimension: 'supportsDimension',
  dimensionConfig: 'dimensionConfig',
  sqlTemplate: 'sqlTemplate',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CustomerSegmentScalarFieldEnum = {
  id: 'id',
  segmentKey: 'segmentKey',
  name: 'name',
  description: 'description',
  segmentFamily: 'segmentFamily',
  status: 'status',
  evaluationMode: 'evaluationMode',
  priority: 'priority',
  createdBy: 'createdBy',
  updatedBy: 'updatedBy',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CustomerSegmentVersionScalarFieldEnum = {
  id: 'id',
  segmentId: 'segmentId',
  versionNumber: 'versionNumber',
  ruleAst: 'ruleAst',
  scoringConfig: 'scoringConfig',
  activationPolicy: 'activationPolicy',
  suppressionPolicy: 'suppressionPolicy',
  status: 'status',
  validationStatus: 'validationStatus',
  validationErrors: 'validationErrors',
  createdBy: 'createdBy',
  createdAt: 'createdAt',
  activatedAt: 'activatedAt',
  retiredAt: 'retiredAt'
};

exports.Prisma.SegmentVersionMetricDependencyScalarFieldEnum = {
  segmentVersionId: 'segmentVersionId',
  metricKey: 'metricKey'
};

exports.Prisma.CustomerSegmentCurrentScalarFieldEnum = {
  customerId: 'customerId',
  segmentId: 'segmentId',
  segmentVersionId: 'segmentVersionId',
  score: 'score',
  reasonCodes: 'reasonCodes',
  enteredAt: 'enteredAt',
  lastMatchedAt: 'lastMatchedAt',
  expiresAt: 'expiresAt',
  evaluationRunId: 'evaluationRunId'
};

exports.Prisma.CustomerSegmentHistoryScalarFieldEnum = {
  id: 'id',
  customerId: 'customerId',
  segmentId: 'segmentId',
  segmentVersionId: 'segmentVersionId',
  eventType: 'eventType',
  previousScore: 'previousScore',
  score: 'score',
  reasonCodes: 'reasonCodes',
  occurredAt: 'occurredAt',
  evaluationRunId: 'evaluationRunId'
};

exports.Prisma.CustomerSegmentEvaluationRunScalarFieldEnum = {
  id: 'id',
  segmentId: 'segmentId',
  segmentVersionId: 'segmentVersionId',
  evaluationMode: 'evaluationMode',
  status: 'status',
  startedAt: 'startedAt',
  finishedAt: 'finishedAt',
  customersEvaluated: 'customersEvaluated',
  customersMatched: 'customersMatched',
  customersEntered: 'customersEntered',
  customersExited: 'customersExited',
  customersRefreshed: 'customersRefreshed',
  customersScoreChanged: 'customersScoreChanged',
  errorMessage: 'errorMessage',
  metadata: 'metadata'
};

exports.Prisma.ActivationAudienceScalarFieldEnum = {
  id: 'id',
  audienceKey: 'audienceKey',
  name: 'name',
  description: 'description',
  requestedBy: 'requestedBy',
  request: 'request',
  totalCandidates: 'totalCandidates',
  eligibleCustomers: 'eligibleCustomers',
  holdoutCustomers: 'holdoutCustomers',
  activationCustomers: 'activationCustomers',
  status: 'status',
  createdAt: 'createdAt',
  expiresAt: 'expiresAt',
  errorMessage: 'errorMessage'
};

exports.Prisma.ActivationAudienceMemberScalarFieldEnum = {
  audienceId: 'audienceId',
  customerId: 'customerId',
  treatmentGroup: 'treatmentGroup',
  suppressionReasons: 'suppressionReasons',
  segmentIds: 'segmentIds',
  segmentVersionIds: 'segmentVersionIds',
  score: 'score',
  createdAt: 'createdAt'
};

exports.Prisma.CustomerSegmentAuditLogScalarFieldEnum = {
  id: 'id',
  actorUserId: 'actorUserId',
  eventType: 'eventType',
  entityType: 'entityType',
  entityId: 'entityId',
  beforeJson: 'beforeJson',
  afterJson: 'afterJson',
  occurredAt: 'occurredAt'
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

exports.Prisma.TaxonomyDepartmentScalarFieldEnum = {
  number: 'number',
  description: 'description',
  begCateg: 'begCateg',
  endCateg: 'endCateg',
  dateLastChanged: 'dateLastChanged'
};

exports.Prisma.TaxonomyCategoryScalarFieldEnum = {
  number: 'number',
  description: 'description',
  dateLastChanged: 'dateLastChanged'
};

exports.Prisma.TaxonomyGroupScalarFieldEnum = {
  code: 'code',
  description: 'description',
  dateLastChanged: 'dateLastChanged'
};

exports.Prisma.TaxonomyKeywordScalarFieldEnum = {
  keyword: 'keyword',
  description: 'description',
  dateLastChanged: 'dateLastChanged'
};

exports.Prisma.TaxonomySectorScalarFieldEnum = {
  number: 'number',
  description: 'description',
  begDept: 'begDept',
  endDept: 'endDept',
  dateLastChanged: 'dateLastChanged'
};

exports.Prisma.TaxonomyReturnCodeScalarFieldEnum = {
  code: 'code',
  description: 'description',
  trackable: 'trackable',
  dateLastChanged: 'dateLastChanged'
};

exports.Prisma.TaxonomyPromotionCodeScalarFieldEnum = {
  code: 'code',
  description: 'description',
  date: 'date',
  pieces: 'pieces',
  cost: 'cost',
  dateLastChanged: 'dateLastChanged'
};

exports.Prisma.TaxonomySizeTypeScalarFieldEnum = {
  code: 'code',
  description: 'description',
  columnDescription: 'columnDescription',
  rowDescription: 'rowDescription',
  tableType: 'tableType',
  columns: 'columns',
  rows: 'rows',
  maxColumns: 'maxColumns',
  maxRows: 'maxRows',
  dateLastChanged: 'dateLastChanged'
};

exports.Prisma.PosRegisterScalarFieldEnum = {
  id: 'id',
  storeId: 'storeId',
  code: 'code',
  label: 'label',
  active: 'active',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PosTenderTypeScalarFieldEnum = {
  id: 'id',
  storeId: 'storeId',
  code: 'code',
  label: 'label',
  kind: 'kind',
  requiresAccount: 'requiresAccount',
  openDrawer: 'openDrawer',
  active: 'active',
  sortOrder: 'sortOrder',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PosPayoutCategoryScalarFieldEnum = {
  id: 'id',
  storeId: 'storeId',
  code: 'code',
  label: 'label',
  active: 'active',
  sortOrder: 'sortOrder',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PosShiftScalarFieldEnum = {
  id: 'id',
  storeId: 'storeId',
  registerId: 'registerId',
  registerCode: 'registerCode',
  businessDate: 'businessDate',
  openedByUserId: 'openedByUserId',
  openedByName: 'openedByName',
  openingCashFloat: 'openingCashFloat',
  status: 'status',
  lastTicketNumber: 'lastTicketNumber',
  openedAt: 'openedAt',
  closedAt: 'closedAt',
  closedByUserId: 'closedByUserId',
  closedByName: 'closedByName',
  expectedCashTotal: 'expectedCashTotal',
  actualCashTotal: 'actualCashTotal',
  overShortAmount: 'overShortAmount',
  countSummaryJson: 'countSummaryJson',
  notes: 'notes',
  postedAt: 'postedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PosTicketScalarFieldEnum = {
  id: 'id',
  shiftId: 'shiftId',
  storeId: 'storeId',
  registerId: 'registerId',
  ticketNumber: 'ticketNumber',
  status: 'status',
  transactionType: 'transactionType',
  cashierUserId: 'cashierUserId',
  cashierName: 'cashierName',
  customerId: 'customerId',
  customerAccountNumber: 'customerAccountNumber',
  customerName: 'customerName',
  headerDiscountPct: 'headerDiscountPct',
  promotionCode: 'promotionCode',
  shipToState: 'shipToState',
  subtotal: 'subtotal',
  taxTotal: 'taxTotal',
  secondaryTaxTotal: 'secondaryTaxTotal',
  otherCharges: 'otherCharges',
  grandTotal: 'grandTotal',
  totalTendered: 'totalTendered',
  changeGiven: 'changeGiven',
  comment: 'comment',
  receiptPayloadJson: 'receiptPayloadJson',
  voidedAt: 'voidedAt',
  completedAt: 'completedAt',
  reclaimedFromTicketId: 'reclaimedFromTicketId',
  receiptPrintCount: 'receiptPrintCount',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PosTicketLineScalarFieldEnum = {
  id: 'id',
  ticketId: 'ticketId',
  lineNumber: 'lineNumber',
  skuId: 'skuId',
  skuCode: 'skuCode',
  description: 'description',
  upc: 'upc',
  sizeTypeCode: 'sizeTypeCode',
  columnLabel: 'columnLabel',
  rowLabel: 'rowLabel',
  quantity: 'quantity',
  unitPrice: 'unitPrice',
  priceMode: 'priceMode',
  discountPct: 'discountPct',
  discountAmount: 'discountAmount',
  taxable: 'taxable',
  taxRate: 'taxRate',
  secondaryTaxRate: 'secondaryTaxRate',
  salespersonUserId: 'salespersonUserId',
  salespersonCode: 'salespersonCode',
  salespersonName: 'salespersonName',
  familyMemberId: 'familyMemberId',
  returnCode: 'returnCode',
  comment: 'comment',
  lineSubtotal: 'lineSubtotal',
  lineTax: 'lineTax',
  lineSecondaryTax: 'lineSecondaryTax',
  lineTotal: 'lineTotal',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PosTicketTenderScalarFieldEnum = {
  id: 'id',
  ticketId: 'ticketId',
  sequence: 'sequence',
  tenderTypeId: 'tenderTypeId',
  tenderCode: 'tenderCode',
  tenderLabel: 'tenderLabel',
  tenderKind: 'tenderKind',
  amount: 'amount',
  accountNumber: 'accountNumber',
  reference: 'reference',
  createdAt: 'createdAt'
};

exports.Prisma.PosTicketEventScalarFieldEnum = {
  id: 'id',
  ticketId: 'ticketId',
  shiftId: 'shiftId',
  eventType: 'eventType',
  actorUserId: 'actorUserId',
  actorName: 'actorName',
  payloadJson: 'payloadJson',
  createdAt: 'createdAt'
};

exports.Prisma.PosPayoutScalarFieldEnum = {
  id: 'id',
  shiftId: 'shiftId',
  storeId: 'storeId',
  registerId: 'registerId',
  categoryId: 'categoryId',
  categoryCode: 'categoryCode',
  categoryLabel: 'categoryLabel',
  cashierUserId: 'cashierUserId',
  cashierName: 'cashierName',
  amount: 'amount',
  note: 'note',
  createdAt: 'createdAt'
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

exports.TransferStatus = exports.$Enums.TransferStatus = {
  DRAFT: 'DRAFT',
  IN_TRANSIT: 'IN_TRANSIT',
  RECEIVED: 'RECEIVED',
  CANCELLED: 'CANCELLED'
};

exports.TransferOrigin = exports.$Enums.TransferOrigin = {
  MANUAL: 'MANUAL',
  TRANSFER_ALL: 'TRANSFER_ALL',
  AUTO: 'AUTO',
  BALANCING: 'BALANCING',
  ASSORTMENT: 'ASSORTMENT'
};

exports.RunStatus = exports.$Enums.RunStatus = {
  QUEUED: 'QUEUED',
  PREVIEWED: 'PREVIEWED',
  COMMITTED: 'COMMITTED',
  CANCELLED: 'CANCELLED'
};

exports.TransferSort = exports.$Enums.TransferSort = {
  SKU: 'SKU',
  VENDOR: 'VENDOR',
  CATEGORY: 'CATEGORY',
  LOCATION: 'LOCATION'
};

exports.BalancingMethod = exports.$Enums.BalancingMethod = {
  OVER_UNDER_MODELS: 'OVER_UNDER_MODELS',
  WITHOUT_MODELS: 'WITHOUT_MODELS',
  WITHOUT_CONSIDERING_MODELS: 'WITHOUT_CONSIDERING_MODELS'
};

exports.PerformanceMetric = exports.$Enums.PerformanceMetric = {
  ROI: 'ROI',
  TURNS: 'TURNS',
  SELL_THRU: 'SELL_THRU'
};

exports.SalesPeriod = exports.$Enums.SalesPeriod = {
  MONTH: 'MONTH',
  SEASON: 'SEASON',
  YEAR: 'YEAR'
};

exports.TieBreakKind = exports.$Enums.TieBreakKind = {
  ABSOLUTE: 'ABSOLUTE',
  PERCENT: 'PERCENT'
};

exports.BalancingGoalPreset = exports.$Enums.BalancingGoalPreset = {
  DAILY_RESCUE: 'DAILY_RESCUE',
  WEEKLY_BALANCE: 'WEEKLY_BALANCE',
  SEASONAL_CONSOLIDATION: 'SEASONAL_CONSOLIDATION'
};

exports.Prisma.ModelName = {
  ProductContent: 'ProductContent',
  Cart: 'Cart',
  CartLine: 'CartLine',
  Order: 'Order',
  OrderLine: 'OrderLine',
  User: 'User',
  Employee: 'Employee',
  Role: 'Role',
  Session: 'Session',
  IdentityUserRoleAssignment: 'IdentityUserRoleAssignment',
  IdentityUserStoreScope: 'IdentityUserStoreScope',
  IdentityMfaFactor: 'IdentityMfaFactor',
  IdentityExternalIdentity: 'IdentityExternalIdentity',
  IdentityLoginEvent: 'IdentityLoginEvent',
  IdentitySessionEvent: 'IdentitySessionEvent',
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
  PlatformAuditLog: 'PlatformAuditLog',
  ActivityReviewEventReview: 'ActivityReviewEventReview',
  SkuAttributeOverride: 'SkuAttributeOverride',
  VendorOverlay: 'VendorOverlay',
  Vendor: 'Vendor',
  VendorStoreAccount: 'VendorStoreAccount',
  StoreMaster: 'StoreMaster',
  StoreGroup: 'StoreGroup',
  StoreGroupMember: 'StoreGroupMember',
  PurchasePlan: 'PurchasePlan',
  PurchasePlanRow: 'PurchasePlanRow',
  PurchasePlanAdjustment: 'PurchasePlanAdjustment',
  PurchasePlanAudit: 'PurchasePlanAudit',
  PurchasePlanV3: 'PurchasePlanV3',
  PurchasePlanV3Row: 'PurchasePlanV3Row',
  PurchasePlanV3Adjustment: 'PurchasePlanV3Adjustment',
  PurchasePlanV3Audit: 'PurchasePlanV3Audit',
  AssortmentColorAlias: 'AssortmentColorAlias',
  AssortmentPlan: 'AssortmentPlan',
  AssortmentPlanPoolItem: 'AssortmentPlanPoolItem',
  AssortmentPlanWave: 'AssortmentPlanWave',
  AssortmentPlanWaveLine: 'AssortmentPlanWaveLine',
  AssortmentPlanStoreAllocation: 'AssortmentPlanStoreAllocation',
  AssortmentPlanTransferLink: 'AssortmentPlanTransferLink',
  SkuUpc: 'SkuUpc',
  CasePack: 'CasePack',
  CasePackCell: 'CasePackCell',
  FuturePriceChange: 'FuturePriceChange',
  PurchaseOrderLegacy: 'PurchaseOrderLegacy',
  PurchaseOrderLegacyLine: 'PurchaseOrderLegacyLine',
  PurchaseOrder: 'PurchaseOrder',
  PurchaseOrderLine: 'PurchaseOrderLine',
  PurchaseOrderLineSizeCell: 'PurchaseOrderLineSizeCell',
  SupplierQuotation: 'SupplierQuotation',
  SupplierQuotationLine: 'SupplierQuotationLine',
  SupplierQuotationLineRelation: 'SupplierQuotationLineRelation',
  PoReceipt: 'PoReceipt',
  PoReceiptLine: 'PoReceiptLine',
  PoStatusHistory: 'PoStatusHistory',
  AsnCartonLegacy: 'AsnCartonLegacy',
  AsnCartonLegacyLine: 'AsnCartonLegacyLine',
  TransferLegacySummary: 'TransferLegacySummary',
  SkuKeywordOverride: 'SkuKeywordOverride',
  SizeTypeOverride: 'SizeTypeOverride',
  ProductsBatchOperation: 'ProductsBatchOperation',
  ProductsBatchOperationItem: 'ProductsBatchOperationItem',
  ProductFamily: 'ProductFamily',
  CategoryProductFamily: 'CategoryProductFamily',
  CategoryBuyerAssignment: 'CategoryBuyerAssignment',
  Sku: 'Sku',
  MatchingSetType: 'MatchingSetType',
  MatchingSetRole: 'MatchingSetRole',
  MatchingSet: 'MatchingSet',
  MatchingSetMember: 'MatchingSetMember',
  MatchingSetMemberSizeCurve: 'MatchingSetMemberSizeCurve',
  MatchingSetBuyPlan: 'MatchingSetBuyPlan',
  MatchingSetBuyPlanLine: 'MatchingSetBuyPlanLine',
  SkuActivity: 'SkuActivity',
  SkuSize: 'SkuSize',
  Inventory: 'Inventory',
  InventoryAuditLog: 'InventoryAuditLog',
  InventoryAdjustment: 'InventoryAdjustment',
  InventoryAdjustmentLine: 'InventoryAdjustmentLine',
  StockLevel: 'StockLevel',
  StockMovement: 'StockMovement',
  StockCostEvent: 'StockCostEvent',
  StockCostBalance: 'StockCostBalance',
  ManualReceipt: 'ManualReceipt',
  ManualReceiptLine: 'ManualReceiptLine',
  ImportShipment: 'ImportShipment',
  ImportContainer: 'ImportContainer',
  ImportShipmentLine: 'ImportShipmentLine',
  ImportSupplierInvoice: 'ImportSupplierInvoice',
  ImportInvoiceLine: 'ImportInvoiceLine',
  ImportCharge: 'ImportCharge',
  ImportLandedCostAllocation: 'ImportLandedCostAllocation',
  ImportCostBuild: 'ImportCostBuild',
  ImportCostComponentAllocation: 'ImportCostComponentAllocation',
  GoodsInTransitRecord: 'GoodsInTransitRecord',
  ImportVerificationCheck: 'ImportVerificationCheck',
  ImportSuggestedPrice: 'ImportSuggestedPrice',
  ImportPayableHandoff: 'ImportPayableHandoff',
  ImportInventoryReceipt: 'ImportInventoryReceipt',
  ImportInventoryTrueUp: 'ImportInventoryTrueUp',
  ReplenishmentTarget: 'ReplenishmentTarget',
  InventorySalesCell: 'InventorySalesCell',
  ReorderPlannerDefaults: 'ReorderPlannerDefaults',
  InventoryHistorySnapshot: 'InventoryHistorySnapshot',
  InventoryHistoryMonth: 'InventoryHistoryMonth',
  InventoryHistoryTrendWeek: 'InventoryHistoryTrendWeek',
  InventoryHistoryMovementBucket: 'InventoryHistoryMovementBucket',
  InventoryMonthCloseRun: 'InventoryMonthCloseRun',
  InventoryClosedMonth: 'InventoryClosedMonth',
  InventoryWeekCloseRun: 'InventoryWeekCloseRun',
  InventoryClosedWeek: 'InventoryClosedWeek',
  ManualReturn: 'ManualReturn',
  ManualReturnLine: 'ManualReturnLine',
  Transfer: 'Transfer',
  TransferLine: 'TransferLine',
  AutoTransferRun: 'AutoTransferRun',
  BalancingTransferRun: 'BalancingTransferRun',
  BalancingTransferRunV2: 'BalancingTransferRunV2',
  SkuCodeSequence: 'SkuCodeSequence',
  AttributeDimension: 'AttributeDimension',
  AttributeFamilyRule: 'AttributeFamilyRule',
  AttributeValue: 'AttributeValue',
  SkuAttributeAssignment: 'SkuAttributeAssignment',
  AttributeDerivationRule: 'AttributeDerivationRule',
  EtlRunTable: 'EtlRunTable',
  ReportTemplate: 'ReportTemplate',
  ReportRun: 'ReportRun',
  CustomerIntelligenceCustomer: 'CustomerIntelligenceCustomer',
  CustomerIdentity: 'CustomerIdentity',
  CustomerContact: 'CustomerContact',
  CustomerAddress: 'CustomerAddress',
  CustomerLegacyProfile: 'CustomerLegacyProfile',
  CustomerFinancialProfile: 'CustomerFinancialProfile',
  CustomerSalesSummaryLegacy: 'CustomerSalesSummaryLegacy',
  CustomerImportBatch: 'CustomerImportBatch',
  CustomerImportReject: 'CustomerImportReject',
  CustomerTransactionFact: 'CustomerTransactionFact',
  CustomerTransactionItem: 'CustomerTransactionItem',
  SalesHistoryTicket: 'SalesHistoryTicket',
  SalesHistoryTicketLine: 'SalesHistoryTicketLine',
  TicketHeader: 'TicketHeader',
  TicketDetail: 'TicketDetail',
  TicketTender: 'TicketTender',
  CustomerMetrics: 'CustomerMetrics',
  CustomerMetricsDaily: 'CustomerMetricsDaily',
  CustomerFeatureCurrent: 'CustomerFeatureCurrent',
  CustomerCategoryFeature: 'CustomerCategoryFeature',
  CustomerBrandFeature: 'CustomerBrandFeature',
  CustomerSizeProfile: 'CustomerSizeProfile',
  SegmentMetricRegistry: 'SegmentMetricRegistry',
  CustomerSegment: 'CustomerSegment',
  CustomerSegmentVersion: 'CustomerSegmentVersion',
  SegmentVersionMetricDependency: 'SegmentVersionMetricDependency',
  CustomerSegmentCurrent: 'CustomerSegmentCurrent',
  CustomerSegmentHistory: 'CustomerSegmentHistory',
  CustomerSegmentEvaluationRun: 'CustomerSegmentEvaluationRun',
  ActivationAudience: 'ActivationAudience',
  ActivationAudienceMember: 'ActivationAudienceMember',
  CustomerSegmentAuditLog: 'CustomerSegmentAuditLog',
  Customer: 'Customer',
  FamilyMember: 'FamilyMember',
  TaxonomyDepartment: 'TaxonomyDepartment',
  TaxonomyCategory: 'TaxonomyCategory',
  TaxonomyGroup: 'TaxonomyGroup',
  TaxonomyKeyword: 'TaxonomyKeyword',
  TaxonomySector: 'TaxonomySector',
  TaxonomyReturnCode: 'TaxonomyReturnCode',
  TaxonomyPromotionCode: 'TaxonomyPromotionCode',
  TaxonomySizeType: 'TaxonomySizeType',
  PosRegister: 'PosRegister',
  PosTenderType: 'PosTenderType',
  PosPayoutCategory: 'PosPayoutCategory',
  PosShift: 'PosShift',
  PosTicket: 'PosTicket',
  PosTicketLine: 'PosTicketLine',
  PosTicketTender: 'PosTicketTender',
  PosTicketEvent: 'PosTicketEvent',
  PosPayout: 'PosPayout'
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
