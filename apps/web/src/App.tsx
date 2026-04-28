import { Suspense, lazy } from 'react'
import { Flex, Spin } from 'antd'
import { Routes, Route, Navigate, Outlet, useParams, useSearchParams } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import { AuthProvider } from './auth/AuthContext'
import { RequireAuth } from './auth/RequireAuth'
import { RequirePermission } from './auth/RequirePermission'

const SkuListPage = lazy(() => import('./pages/inventory/SkuListPage'))
const SkuFormPageModern = lazy(() => import('./pages/inventory/SkuFormPageModern'))
const SkuDraftsListPage = lazy(() => import('./pages/inventory/SkuDraftsListPage'))
const DashboardPage = lazy(() => import('./pages/inventory/DashboardPage'))
const InventoryBalancesPage = lazy(() => import('./pages/inventory/InventoryBalancesPage'))
const SalesLedgerPage = lazy(() => import('./pages/inventory/SalesLedgerPage'))
const InventoryMovementPage = lazy(() => import('./pages/inventory/InventoryMovementPage'))
const FindBySizePage = lazy(() => import('./pages/inventory/FindBySizePage'))
const ReplenishmentTargetsPage = lazy(() => import('./pages/inventory/ReplenishmentTargetsPage'))
const TransferSummaryReportPage = lazy(() => import('./pages/inventory/TransferSummaryReportPage'))
const RecommendedTransferReportPage = lazy(() => import('./pages/inventory/RecommendedTransferReportPage'))
const AutoTransferPreviewPage = lazy(() => import('./pages/inventory/AutoTransferPreviewPage'))
const BalancingTransferPreviewPage = lazy(() => import('./pages/inventory/BalancingTransferPreviewPage'))
const BalancingTransferPreviewPageV2 = lazy(() => import('./pages/inventory/BalancingTransferPreviewPageV2'))
const ManualTransferEntryPage = lazy(() => import('./pages/inventory/ManualTransferEntryPage'))
const InventoryDetailReportPage = lazy(() => import('./pages/inventory/InventoryDetailReportPage'))
const ChangeDetailPage = lazy(() => import('./pages/inventory/ChangeDetailPage'))
const SkuChangeDetailPage = lazy(() => import('./pages/inventory/SkuChangeDetailPage'))
const InventoryAuditPage = lazy(() => import('./pages/inventory/InventoryAuditPage'))
const AdjustmentListPage = lazy(() => import('./pages/inventory/AdjustmentListPage'))
const AdjustmentFormPage = lazy(() => import('./pages/inventory/AdjustmentFormPage'))
const AdjustmentDetailPage = lazy(() => import('./pages/inventory/AdjustmentDetailPage'))
const ManualReceiptFormPage = lazy(() => import('./pages/inventory/ManualReceiptFormPage'))
const ManualReceiptDetailPage = lazy(() => import('./pages/inventory/ManualReceiptDetailPage'))
const ManualReturnFormPage = lazy(() => import('./pages/inventory/ManualReturnFormPage'))
const ManualReturnDetailPage = lazy(() => import('./pages/inventory/ManualReturnDetailPage'))
const OnHandReportPage = lazy(() => import('./pages/inventory/OnHandReportPage'))
const SalesReportPage = lazy(() => import('./pages/inventory/SalesReportPage'))
const InventoryTurnoverReportPage = lazy(() => import('./pages/inventory/InventoryTurnoverReportPage'))
const InventoryAgingReportPage = lazy(() => import('./pages/inventory/InventoryAgingReportPage'))
const SellThroughReportPage = lazy(() => import('./pages/inventory/SellThroughReportPage'))
const PoReceivePage = lazy(() => import('./pages/inventory/PoReceivePage'))
const PurchaseOrdersPage = lazy(() => import('./pages/purchasing/PurchaseOrdersPage'))
const PurchaseOrderFormPage = lazy(() => import('./pages/purchasing/PurchaseOrderFormPage'))
const PurchaseOrderDetailPage = lazy(() => import('./pages/purchasing/PurchaseOrderDetailPage'))
const PoEntryMockPage = lazy(() => import('./pages/purchasing/PoEntryMockPage'))
const PoReceiveMockPage = lazy(() => import('./pages/purchasing/PoReceiveMockPage'))
const OtbDashboardPage = lazy(() => import('./pages/otb/OtbDashboardPage'))
const PurchasePlanningPage = lazy(() => import('./pages/purchasePlanning/PurchasePlanningPage'))
const OtbMonthlyPlansPage = lazy(() => import('./pages/otb/OtbMonthlyPlansPage'))
const OtbPlanEntryPage = lazy(() => import('./pages/otb/OtbPlanEntryPage'))
const SalesReportsHubPage = lazy(() => import('./pages/salesReporting/SalesReportsHubPage'))
const SalesAnalysisPage = lazy(() => import('./pages/salesReporting/SalesAnalysisPage'))
const SalesHierarchyDrillDownPage = lazy(() => import('./pages/salesReporting/SalesHierarchyDrillDownPage'))
const SalesPivotPage = lazy(() => import('./pages/salesReporting/SalesPivotPage'))
const SalesPivotCustomPage = lazy(() => import('./pages/salesReporting/SalesPivotCustomPage'))
const BestSellersPage = lazy(() => import('./pages/salesReporting/BestSellersPage'))
const SalesHistoryByMonthPage = lazy(() => import('./pages/salesReporting/SalesHistoryByMonthPage'))
const StockStatusPage = lazy(() => import('./pages/salesReporting/StockStatusPage'))
const SizeTypeAnalysisPage = lazy(() => import('./pages/salesReporting/SizeTypeAnalysisPage'))
const OtbVsSalesPage = lazy(() => import('./pages/salesReporting/OtbVsSalesPage'))
const ReportsOthersHubPage = lazy(() => import('./pages/salesReporting/ReportsOthersHubPage'))
const SalesByDayPage = lazy(() => import('./pages/salesReporting/SalesByDayPage'))
const SalesByTimePage = lazy(() => import('./pages/salesReporting/SalesByTimePage'))
const SalespersonSummaryPage = lazy(() => import('./pages/salesReporting/SalespersonSummaryPage'))
const TemplatesListPage = lazy(() => import('./pages/reports/templates/TemplatesListPage'))
const RunsListPage = lazy(() => import('./pages/reports/runs/RunsListPage'))
const RunViewPage = lazy(() => import('./pages/reports/runs/RunViewPage'))
const ReportViewerPage = lazy(() => import('./pages/reports/ReportViewerPage'))
const CustomerListPage = lazy(() => import('./pages/customers/CustomerListPage'))
const CustomerFormPage = lazy(() => import('./pages/customers/CustomerFormPage'))
const CustomerKpiDashboardPage = lazy(() => import('./pages/customers/CustomerKpiDashboardPage'))
const CustomerKpiListPage = lazy(() => import('./pages/customers/CustomerKpiListPage'))
const CustomerKpiDetailPage = lazy(() => import('./pages/customers/CustomerKpiDetailPage'))
const CustomerSegmentsPage = lazy(() => import('./pages/customers/CustomerSegmentsPage'))
const CustomerChurnRiskPage = lazy(() => import('./pages/customers/CustomerChurnRiskPage'))
const CustomerVipPage = lazy(() => import('./pages/customers/CustomerVipPage'))
const CustomerDiscountSensitivePage = lazy(() => import('./pages/customers/CustomerDiscountSensitivePage'))
const LoginPage = lazy(() => import('./pages/auth/LoginPage'))
const MePage = lazy(() => import('./pages/auth/MePage'))
const ChangePasswordPage = lazy(() => import('./pages/auth/ChangePasswordPage'))
const UsersListPage = lazy(() => import('./pages/users/UsersListPage'))
const UserFormPage = lazy(() => import('./pages/users/UserFormPage'))
const EnterSalesPage = lazy(() => import('./pages/sales/enter/EnterSalesPage'))
const CasePacksPage = lazy(() => import('./pages/fileSetup/CasePacksPage'))

// products module — Phase 1 Step 2 taxonomy pages
const TaxonomyHomePage = lazy(() => import('./pages/products/TaxonomyHomePage'))
const DepartmentListPage = lazy(() => import('./pages/products/DepartmentListPage'))
const DepartmentFormPage = lazy(() => import('./pages/products/DepartmentFormPage'))
const CategoryListPage = lazy(() => import('./pages/products/CategoryListPage'))
const CategoryFormPage = lazy(() => import('./pages/products/CategoryFormPage'))
const GroupListPage = lazy(() => import('./pages/products/GroupListPage'))
const GroupFormPage = lazy(() => import('./pages/products/GroupFormPage'))
const KeywordListPage = lazy(() => import('./pages/products/KeywordListPage'))
const KeywordFormPage = lazy(() => import('./pages/products/KeywordFormPage'))
const SectorListPage = lazy(() => import('./pages/products/SectorListPage'))
const SectorFormPage = lazy(() => import('./pages/products/SectorFormPage'))
const ReturnCodeListPage = lazy(() => import('./pages/products/ReturnCodeListPage'))
const ReturnCodeFormPage = lazy(() => import('./pages/products/ReturnCodeFormPage'))
const PromotionCodeListPage = lazy(() => import('./pages/products/PromotionCodeListPage'))
const PromotionCodeFormPage = lazy(() => import('./pages/products/PromotionCodeFormPage'))
const SeasonListPage = lazy(() => import('./pages/products/SeasonListPage'))
const SeasonFormPage = lazy(() => import('./pages/products/SeasonFormPage'))
const SizeTypeListPage = lazy(() => import('./pages/products/SizeTypeListPage'))
const SizeTypeGridEditorPage = lazy(() => import('./pages/products/SizeTypeGridEditorPage'))

// products module — Phase 1 Step 3 vendor pages
const VendorListPage = lazy(() => import('./pages/products/vendors/VendorListPage'))
const VendorFormPage = lazy(() => import('./pages/products/vendors/VendorFormPage'))

// products module — legacy RICS-tabs SKU detail form
const ProductsSkuFormPage = lazy(() => import('./pages/products/skus/SkuFormPage'))

// products module — extended-attributes catalog (spec: 2026-04-22)
const AttributesCatalogPage = lazy(() => import('./pages/products/attributes/CatalogPage'))

// products module — Product Family admin (category mapping + attribute rules)
const ProductFamiliesPage = lazy(() => import('./pages/products/families/FamiliesPage'))
const MatchingSetsPage = lazy(() => import('./pages/products/matchingSets/MatchingSetsPage'))

// utilities module — RICS Ch. 15 batch-change ports (spec: docs/modules/utilities.md)
const UtilitiesHubPage = lazy(() => import('./pages/utilities/UtilitiesHubPage'))
const StoresPage = lazy(() => import('./pages/utilities/StoresPage'))
const StoreChainsPage = lazy(() => import('./pages/utilities/StoreChainsPage'))
const ChangeKeywordsPage = lazy(() => import('./pages/utilities/ChangeKeywordsPage'))
const ChangeSkuAttributesPage = lazy(() => import('./pages/utilities/ChangeSkuAttributesPage'))
const BatchHistoryPage = lazy(() => import('./pages/utilities/BatchHistoryPage'))
const BatchHistoryDetailPage = lazy(() => import('./pages/utilities/BatchHistoryDetailPage'))
const MigrationDayConsolePage = lazy(() => import('./pages/operations/MigrationDayConsolePage'))

// products module — Inventory Inquiry (/inventory/inquiry now redirects here)
const InquiryPage = lazy(() => import('./pages/products/inquiry/InquiryPage').then(m => ({ default: m.InquiryPage })))

export const LegacyInquiryRedirect: React.FC = () => {
  const { skuCode } = useParams<{ skuCode?: string }>()
  const [params] = useSearchParams()
  const qs = params.toString()
  const base = skuCode ? `/products/inquiry/${skuCode}` : '/products/inquiry'
  return <Navigate to={`${base}${qs ? `?${qs}` : ''}`} replace />
}

function RouteLoadingFallback() {
  return (
    <Flex align="center" justify="center" style={{ minHeight: 240 }} data-testid="route-loading-fallback">
      <Spin size="large" />
    </Flex>
  )
}

function LazyRouteOutlet() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <Outlet />
    </Suspense>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route
          path="/login"
          element={
            <Suspense fallback={<RouteLoadingFallback />}>
              <LoginPage />
            </Suspense>
          }
        />
        <Route
          path="/report-viewer"
          element={
            <RequireAuth>
              <Suspense fallback={<RouteLoadingFallback />}>
                <ReportViewerPage />
              </Suspense>
            </RequireAuth>
          }
        />
        <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
          <Route path="/" element={<Navigate to="/inventory/dashboard" replace />} />
          <Route path="/dashboard" element={<Navigate to="/inventory/dashboard" replace />} />
          <Route path="/inventory" element={<Navigate to="/inventory/dashboard" replace />} />
          <Route element={<LazyRouteOutlet />}>
            <Route path="/inventory/dashboard" element={<DashboardPage />} />
            <Route path="/inventory/balances" element={<InventoryBalancesPage />} />
            <Route path="/inventory/skus" element={<SkuListPage />} />
            {/* Primary SKU creator lives at /products/skus/new.
                Legacy URL kept as a redirect so in-app links / bookmarks still work. */}
            <Route path="/inventory/skus/new" element={<Navigate to="/products/skus/new" replace />} />
            <Route path="/inventory/skus/:skuId/edit" element={<SkuFormPageModern />} />
            <Route path="/inventory/sku-drafts" element={<SkuDraftsListPage />} />
            <Route path="/inventory/adjustments" element={<AdjustmentListPage />} />
            <Route path="/inventory/adjustments/new" element={<AdjustmentFormPage />} />
            <Route path="/inventory/adjustments/:adjustmentId" element={<AdjustmentDetailPage />} />
            <Route path="/inventory/manual-receipts/new" element={<ManualReceiptFormPage />} />
            <Route path="/inventory/manual-receipts/:receiptId" element={<ManualReceiptDetailPage />} />
            <Route path="/inventory/manual-returns/new" element={<ManualReturnFormPage />} />
            <Route path="/inventory/manual-returns/:returnId" element={<ManualReturnDetailPage />} />
            <Route path="/inventory/sales-ledger" element={<SalesLedgerPage />} />
            <Route path="/inventory/movements" element={<InventoryMovementPage />} />
            <Route path="/inventory/inquiry" element={<LegacyInquiryRedirect />} />
            <Route path="/inventory/inquiry/:skuCode" element={<LegacyInquiryRedirect />} />
            <Route path="/products/inquiry" element={<InquiryPage />} />
            <Route path="/products/inquiry/:skuCode" element={<InquiryPage />} />
            <Route path="/inventory/find-by-size" element={<FindBySizePage />} />
            <Route path="/inventory/replenishment" element={<ReplenishmentTargetsPage />} />
            <Route path="/inventory/transfers/manual" element={<ManualTransferEntryPage />} />
            <Route path="/inventory/transfers/automatic" element={<AutoTransferPreviewPage />} />
            <Route path="/inventory/transfers/auto-preview" element={<Navigate to="/inventory/transfers/automatic" replace />} />
            <Route path="/inventory/transfers/balancing" element={<BalancingTransferPreviewPage />} />
            <Route path="/inventory/transfers/balancing-v2" element={<BalancingTransferPreviewPageV2 />} />
            <Route path="/inventory/transfers/balancing-preview" element={<Navigate to="/inventory/transfers/balancing" replace />} />
            <Route path="/reports/transfer-summary" element={<TransferSummaryReportPage />} />
            <Route path="/reports/recommended-transfers" element={<RecommendedTransferReportPage />} />
            <Route path="/reports/inventory-detail" element={<InventoryDetailReportPage />} />
            <Route path="/inventory/change-detail" element={<ChangeDetailPage />} />
            <Route path="/inventory/change-detail/:sku" element={<SkuChangeDetailPage />} />
            <Route path="/inventory/audit" element={<InventoryAuditPage />} />
            <Route path="/purchasing" element={<Navigate to="/purchasing/orders" replace />} />
            <Route path="/purchasing/orders" element={<PurchaseOrdersPage />} />
            <Route path="/purchasing/orders/new" element={<PurchaseOrderFormPage />} />
            <Route path="/purchasing/orders/new-spec-preview" element={<PoEntryMockPage />} />
            <Route path="/purchasing/receive-spec-preview" element={<PoReceiveMockPage />} />
            <Route path="/purchasing/receive-spec-preview/:poId" element={<PoReceiveMockPage />} />
            <Route path="/purchasing/orders/:poId" element={<PurchaseOrderDetailPage />} />
            <Route path="/purchasing/receive" element={<PoReceivePage />} />
            <Route path="/purchasing/receive/:poId" element={<PoReceivePage />} />
            <Route path="/otb" element={<Navigate to="/otb/monthly-plans" replace />} />
            <Route path="/otb/monthly-plans" element={<OtbMonthlyPlansPage />} />
            <Route path="/otb/dashboard" element={<OtbDashboardPage />} />
            <Route path="/otb/plan" element={<OtbPlanEntryPage />} />
            <Route path="/purchase-planning" element={<PurchasePlanningPage />} />
            <Route
              path="/sales/enter"
              element={<RequirePermission permission="sales_pos.operate"><EnterSalesPage /></RequirePermission>}
            />
            <Route path="/reports" element={<Navigate to="/reports/sales" replace />} />
            <Route path="/reports/templates" element={<TemplatesListPage />} />
            <Route path="/reports/runs" element={<RunsListPage />} />
            <Route path="/reports/runs/:id" element={<RunViewPage />} />
            <Route path="/reports/on-hand" element={<OnHandReportPage />} />
            <Route path="/reports/sales" element={<SalesReportsHubPage />} />
            <Route path="/reports/sales/performance" element={<SalesReportPage />} />
            <Route path="/reports/sales/analysis" element={<SalesAnalysisPage />} />
            <Route path="/reports/sales/hierarchy-drill-down" element={<SalesHierarchyDrillDownPage />} />
            <Route path="/reports/sales/pivot" element={<SalesPivotPage />} />
            <Route path="/reports/sales/pivot-custom" element={<SalesPivotCustomPage />} />
            <Route path="/reports/sales/best-sellers" element={<BestSellersPage />} />
            <Route path="/reports/sales/history-by-month" element={<SalesHistoryByMonthPage />} />
            <Route path="/reports/sales/stock-status" element={<StockStatusPage />} />
            <Route path="/reports/sales/size-type-analysis" element={<SizeTypeAnalysisPage />} />
            <Route path="/reports/sales/otb-vs-sales" element={<OtbVsSalesPage />} />
            <Route path="/reports/others" element={<ReportsOthersHubPage />} />
            <Route path="/reports/others/sales-by-day" element={<SalesByDayPage />} />
            <Route path="/reports/others/sales-by-time" element={<SalesByTimePage />} />
            <Route path="/reports/others/salesperson-summary" element={<SalespersonSummaryPage />} />
            <Route path="/reports/turnover" element={<InventoryTurnoverReportPage />} />
            <Route path="/reports/aging" element={<InventoryAgingReportPage />} />
            <Route path="/reports/sell-through" element={<SellThroughReportPage />} />
            <Route path="/customers" element={<CustomerListPage />} />
            <Route path="/customers/dashboard" element={<CustomerKpiDashboardPage />} />
            <Route path="/customers/intelligence" element={<CustomerKpiListPage />} />
            <Route path="/customers/segments" element={<CustomerSegmentsPage />} />
            <Route path="/customers/churn-risk" element={<CustomerChurnRiskPage />} />
            <Route path="/customers/vip" element={<CustomerVipPage />} />
            <Route path="/customers/discount-sensitive" element={<CustomerDiscountSensitivePage />} />
            <Route path="/customers/new" element={<CustomerFormPage />} />
            <Route path="/customers/:customerId/edit" element={<CustomerFormPage />} />
            <Route path="/customers/:customerId" element={<CustomerKpiDetailPage />} />

            {/* products module — Phase 1 Step 2 taxonomy pages */}
            <Route path="/products" element={<Navigate to="/inventory/skus" replace />} />
            <Route path="/file-setup" element={<Navigate to="/products/vendors" replace />} />
            <Route path="/file-setup/case-packs" element={<CasePacksPage />} />
            <Route path="/products/taxonomy" element={<TaxonomyHomePage />} />
            <Route path="/products/taxonomy/departments" element={<DepartmentListPage />} />
            <Route path="/products/taxonomy/departments/new" element={<DepartmentFormPage />} />
            <Route path="/products/taxonomy/departments/:number" element={<DepartmentFormPage />} />
            <Route path="/products/taxonomy/categories" element={<CategoryListPage />} />
            <Route path="/products/taxonomy/categories/new" element={<CategoryFormPage />} />
            <Route path="/products/taxonomy/categories/:number" element={<CategoryFormPage />} />
            <Route path="/products/taxonomy/groups" element={<GroupListPage />} />
            <Route path="/products/taxonomy/groups/new" element={<GroupFormPage />} />
            <Route path="/products/taxonomy/groups/:code" element={<GroupFormPage />} />
            <Route path="/products/taxonomy/keywords" element={<KeywordListPage />} />
            <Route path="/products/taxonomy/keywords/new" element={<KeywordFormPage />} />
            <Route path="/products/taxonomy/keywords/:keyword" element={<KeywordFormPage />} />
            <Route path="/products/taxonomy/sectors" element={<SectorListPage />} />
            <Route path="/products/taxonomy/sectors/new" element={<SectorFormPage />} />
            <Route path="/products/taxonomy/sectors/:number" element={<SectorFormPage />} />
            <Route path="/products/taxonomy/return-codes" element={<ReturnCodeListPage />} />
            <Route path="/products/taxonomy/return-codes/new" element={<ReturnCodeFormPage />} />
            <Route path="/products/taxonomy/return-codes/:code" element={<ReturnCodeFormPage />} />
            <Route path="/products/taxonomy/promotion-codes" element={<PromotionCodeListPage />} />
            <Route path="/products/taxonomy/promotion-codes/new" element={<PromotionCodeFormPage />} />
            <Route path="/products/taxonomy/promotion-codes/:code" element={<PromotionCodeFormPage />} />
            <Route path="/products/taxonomy/seasons" element={<SeasonListPage />} />
            <Route path="/products/taxonomy/seasons/new" element={<SeasonFormPage />} />
            <Route path="/products/taxonomy/seasons/:code" element={<SeasonFormPage />} />
            <Route path="/products/taxonomy/size-types" element={<SizeTypeListPage />} />
            <Route path="/products/taxonomy/size-types/new" element={<SizeTypeGridEditorPage />} />
            <Route path="/products/taxonomy/size-types/:code" element={<SizeTypeGridEditorPage />} />
            <Route path="/products/vendors" element={<VendorListPage />} />
            <Route path="/products/vendors/new" element={<VendorFormPage />} />
            <Route path="/products/vendors/:code" element={<VendorFormPage />} />
            <Route path="/products/skus" element={<SkuListPage />} />
            {/* Primary SKU creator. The modern form is now the only New SKU flow. */}
            <Route path="/products/skus/new" element={<SkuFormPageModern />} />
            <Route path="/products/skus/new-modern" element={<Navigate to="/products/skus/new" replace />} />
            <Route path="/products/skus/:skuId/edit" element={<SkuFormPageModern />} />
            {/* Legacy RICS-tabs creator, kept as an alternate entry. */}
            <Route path="/products/skus/new-alt" element={<ProductsSkuFormPage />} />
            <Route path="/products/skus/:code" element={<ProductsSkuFormPage />} />
            <Route path="/products/attributes" element={<AttributesCatalogPage />} />
            <Route path="/products/attributes/macros" element={<AttributesCatalogPage />} />
            <Route path="/products/families" element={<ProductFamiliesPage />} />
            <Route path="/products/matching-sets" element={<MatchingSetsPage />} />

            {/* utilities module — RICS Ch. 15 batch-change ports */}
            <Route path="/utilities" element={<UtilitiesHubPage />} />
            <Route path="/utilities/overview" element={<Navigate to="/utilities" replace />} />
            <Route path="/utilities/stores" element={<StoresPage />} />
            <Route path="/utilities/store-chains" element={<StoreChainsPage />} />
            <Route path="/utilities/change-keywords" element={<ChangeKeywordsPage />} />
            <Route path="/utilities/change-sku-attributes" element={<ChangeSkuAttributesPage />} />
            {/* Backward-compat redirects from the four pre-consolidation routes. */}
            <Route path="/utilities/change-categories" element={<Navigate to="/utilities/change-sku-attributes" replace />} />
            <Route path="/utilities/change-vendors" element={<Navigate to="/utilities/change-sku-attributes" replace />} />
            <Route path="/utilities/change-seasons" element={<Navigate to="/utilities/change-sku-attributes" replace />} />
            <Route path="/utilities/change-group-codes" element={<Navigate to="/utilities/change-sku-attributes" replace />} />
            <Route path="/utilities/batch-history" element={<BatchHistoryPage />} />
            <Route path="/utilities/batch-history/:id" element={<BatchHistoryDetailPage />} />
            <Route path="/operations" element={<Navigate to="/operations/migration-day" replace />} />
            <Route
              path="/operations/migration-day"
              element={<RequirePermission permission="employees.manage"><MigrationDayConsolePage /></RequirePermission>}
            />

            <Route path="/me" element={<MePage />} />
            <Route path="/change-password" element={<ChangePasswordPage />} />
            <Route
              path="/admin/users"
              element={<RequirePermission permission="employees.view"><UsersListPage /></RequirePermission>}
            />
            <Route
              path="/admin/users/new"
              element={<RequirePermission permission="employees.manage"><UserFormPage /></RequirePermission>}
            />
            <Route
              path="/admin/users/:id/edit"
              element={<RequirePermission permission="employees.manage"><UserFormPage /></RequirePermission>}
            />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
