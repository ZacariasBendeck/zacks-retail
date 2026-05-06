import { Suspense, lazy, type ReactElement } from 'react'
import { Flex, Spin } from 'antd'
import { Routes, Route, Navigate, Outlet, useParams, useSearchParams } from 'react-router-dom'
import AppLayout, { firstAccessibleMenuRoute } from './components/AppLayout'
import { AuthProvider } from './auth/AuthContext'
import { RequireAuth } from './auth/RequireAuth'
import { RequirePermission } from './auth/RequirePermission'
import { useAuth } from './auth/useAuth'
import LegacyPurchaseOrderDetailPage from './pages/purchasing/LegacyPurchaseOrderDetailPage'

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
const PurchaseOrderReportsPage = lazy(() => import('./pages/purchasing/PurchaseOrderReportsPage'))
const PoEntryMockPage = lazy(() => import('./pages/purchasing/PoEntryMockPage'))
const PoReceiveMockPage = lazy(() => import('./pages/purchasing/PoReceiveMockPage'))
const OtbDashboardPage = lazy(() => import('./pages/otb/OtbDashboardPage'))
const PurchasePlanningPage = lazy(() => import('./pages/purchasePlanning/PurchasePlanningPage'))
const PurchasePlanningV3Page = lazy(() => import('./pages/purchasePlanning/PurchasePlanningV3Page'))
const ImportShipmentsPage = lazy(() => import('./pages/importManagement/ImportShipmentsPage'))
const OtbMonthlyPlansPage = lazy(() => import('./pages/otb/OtbMonthlyPlansPage'))
const OtbPlanEntryPage = lazy(() => import('./pages/otb/OtbPlanEntryPage'))
const SalesReportsHubPage = lazy(() => import('./pages/salesReporting/SalesReportsHubPage'))
const SalesAnalysisPage = lazy(() => import('./pages/salesReporting/SalesAnalysisPage'))
const SalesAnalysisPictureReportPage = lazy(() => import('./pages/salesReporting/SalesAnalysisPictureReportPage'))
const SalesHierarchyDrillDownPage = lazy(() => import('./pages/salesReporting/SalesHierarchyDrillDownPage'))
const SalesPivotPage = lazy(() => import('./pages/salesReporting/SalesPivotPage'))
const SalesPivotCustomPage = lazy(() => import('./pages/salesReporting/SalesPivotCustomPage'))
const BestSellersPage = lazy(() => import('./pages/salesReporting/BestSellersPage'))
const SalesHistoryByMonthPage = lazy(() => import('./pages/salesReporting/SalesHistoryByMonthPage'))
const SeasonalityIndexPage = lazy(() => import('./pages/salesReporting/SeasonalityIndexPage'))
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
const ManualPage = lazy(() => import('./pages/manual/ManualPage'))
const SalespeoplePage = lazy(() => import('./pages/employees/SalespeoplePage'))
const UsersListPage = lazy(() => import('./pages/users/UsersListPage'))
const UserFormPage = lazy(() => import('./pages/users/UserFormPage'))
const PlatformAuditPage = lazy(() => import('./pages/users/PlatformAuditPage'))
const RolePermissionsPage = lazy(() => import('./pages/users/RolePermissionsPage'))
const EffectiveAccessPage = lazy(() => import('./pages/users/EffectiveAccessPage'))
const SecurityCenterPage = lazy(() => import('./pages/users/SecurityCenterPage'))
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
const InventoryClosePage = lazy(() => import('./pages/operations/InventoryClosePage'))

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

function DefaultRoute() {
  const { permissions } = useAuth()
  return <Navigate to={firstAccessibleMenuRoute(permissions)} replace />
}

function gate(permission: string, element: ReactElement) {
  return <RequirePermission permission={permission}>{element}</RequirePermission>
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
          <Route path="/" element={<DefaultRoute />} />
          <Route path="/dashboard" element={<DefaultRoute />} />
          <Route path="/inventory" element={<Navigate to="/inventory/dashboard" replace />} />
          <Route element={<LazyRouteOutlet />}>
            <Route path="/inventory/dashboard" element={gate('inventory.view', <DashboardPage />)} />
            <Route path="/inventory/balances" element={gate('inventory.view', <InventoryBalancesPage />)} />
            <Route path="/inventory/skus" element={gate('products.view', <SkuListPage />)} />
            {/* Primary SKU creator lives at /products/skus/new.
                Legacy URL kept as a redirect so in-app links / bookmarks still work. */}
            <Route path="/inventory/skus/new" element={<Navigate to="/products/skus/new" replace />} />
            <Route path="/inventory/skus/:skuId/edit" element={gate('products.write', <SkuFormPageModern />)} />
            <Route path="/inventory/sku-drafts" element={gate('products.write', <SkuDraftsListPage />)} />
            <Route path="/inventory/adjustments" element={gate('inventory.adjust', <AdjustmentListPage />)} />
            <Route path="/inventory/adjustments/new" element={gate('inventory.adjust', <AdjustmentFormPage />)} />
            <Route path="/inventory/adjustments/:adjustmentId" element={gate('inventory.view', <AdjustmentDetailPage />)} />
            <Route path="/inventory/manual-receipts/new" element={gate('inventory.adjust', <ManualReceiptFormPage />)} />
            <Route path="/inventory/manual-receipts/:receiptId" element={gate('inventory.view', <ManualReceiptDetailPage />)} />
            <Route path="/inventory/manual-returns/new" element={gate('inventory.adjust', <ManualReturnFormPage />)} />
            <Route path="/inventory/manual-returns/:returnId" element={gate('inventory.view', <ManualReturnDetailPage />)} />
            <Route path="/inventory/sales-ledger" element={gate('inventory.view', <SalesLedgerPage />)} />
            <Route path="/inventory/movements" element={gate('inventory.view', <InventoryMovementPage />)} />
            <Route path="/inventory/inquiry" element={<LegacyInquiryRedirect />} />
            <Route path="/inventory/inquiry/:skuCode" element={<LegacyInquiryRedirect />} />
            <Route path="/products/inquiry" element={gate('products.view', <InquiryPage />)} />
            <Route path="/products/inquiry/:skuCode" element={gate('products.view', <InquiryPage />)} />
            <Route path="/inventory/find-by-size" element={gate('inventory.view', <FindBySizePage />)} />
            <Route path="/inventory/replenishment" element={gate('inventory.view', <ReplenishmentTargetsPage />)} />
            <Route path="/inventory/transfers/manual" element={gate('inventory.adjust', <ManualTransferEntryPage />)} />
            <Route path="/inventory/transfers/automatic" element={gate('inventory.adjust', <AutoTransferPreviewPage />)} />
            <Route path="/inventory/transfers/auto-preview" element={<Navigate to="/inventory/transfers/automatic" replace />} />
            <Route path="/inventory/transfers/balancing" element={gate('inventory.adjust', <BalancingTransferPreviewPage />)} />
            <Route path="/inventory/transfers/balancing-v2" element={gate('inventory.adjust', <BalancingTransferPreviewPageV2 />)} />
            <Route path="/inventory/transfers/balancing-preview" element={<Navigate to="/inventory/transfers/balancing" replace />} />
            <Route path="/reports/transfer-summary" element={gate('reports.view', <TransferSummaryReportPage />)} />
            <Route path="/reports/recommended-transfers" element={gate('reports.view', <RecommendedTransferReportPage />)} />
            <Route path="/reports/inventory-detail" element={gate('reports.view', <InventoryDetailReportPage />)} />
            <Route path="/inventory/change-detail" element={gate('inventory.view', <ChangeDetailPage />)} />
            <Route path="/inventory/change-detail/:sku" element={gate('inventory.view', <SkuChangeDetailPage />)} />
            <Route path="/inventory/audit" element={gate('inventory.view', <InventoryAuditPage />)} />
            <Route path="/purchasing" element={<Navigate to="/purchasing/orders" replace />} />
            <Route path="/purchasing/orders" element={gate('purchasing.view', <PurchaseOrdersPage />)} />
            <Route path="/purchasing/reports" element={gate('purchasing.view', <PurchaseOrderReportsPage />)} />
            <Route path="/purchasing/orders/new" element={gate('purchasing.edit', <PurchaseOrderFormPage />)} />
            <Route path="/purchasing/orders/new-spec-preview" element={gate('purchasing.edit', <PoEntryMockPage />)} />
            <Route path="/purchasing/receive-spec-preview" element={gate('purchasing.edit', <PoReceiveMockPage />)} />
            <Route path="/purchasing/receive-spec-preview/:poId" element={gate('purchasing.edit', <PoReceiveMockPage />)} />
            <Route path="/purchasing/legacy-orders/:poNumber" element={gate('purchasing.view', <LegacyPurchaseOrderDetailPage />)} />
            <Route path="/purchasing/orders/:poId/edit" element={gate('purchasing.edit', <PurchaseOrderFormPage />)} />
            <Route path="/purchasing/orders/:poId" element={gate('purchasing.view', <PurchaseOrderDetailPage />)} />
            <Route path="/purchasing/receive" element={gate('purchasing.edit', <PoReceivePage />)} />
            <Route path="/purchasing/receive/:poId" element={gate('purchasing.edit', <PoReceivePage />)} />
            <Route path="/otb" element={<Navigate to="/otb/monthly-plans" replace />} />
            <Route path="/otb/monthly-plans" element={gate('otb.view', <OtbMonthlyPlansPage />)} />
            <Route path="/otb/dashboard" element={gate('otb.view', <OtbDashboardPage />)} />
            <Route path="/otb/plan" element={gate('otb.edit', <OtbPlanEntryPage />)} />
            <Route path="/purchase-planning" element={gate('purchasing.view', <PurchasePlanningPage />)} />
            <Route path="/purchase-planning/v3" element={gate('purchasing.view', <PurchasePlanningV3Page />)} />
            <Route path="/import-management" element={gate('import_management.view', <ImportShipmentsPage />)} />
            <Route path="/import-management/:shipmentId" element={gate('import_management.view', <ImportShipmentsPage />)} />
            <Route
              path="/sales/enter"
              element={<RequirePermission permission="sales_pos.operate"><EnterSalesPage /></RequirePermission>}
            />
            <Route path="/reports" element={<Navigate to="/reports/sales" replace />} />
            <Route path="/reports/templates" element={gate('reports.admin', <TemplatesListPage />)} />
            <Route path="/reports/runs" element={gate('reports.admin', <RunsListPage />)} />
            <Route path="/reports/runs/:id" element={gate('reports.view', <RunViewPage />)} />
            <Route path="/reports/on-hand" element={gate('reports.view', <OnHandReportPage />)} />
            <Route path="/reports/sales" element={gate('reports.view', <SalesReportsHubPage />)} />
            <Route path="/reports/sales/performance" element={gate('reports.view', <SalesReportPage />)} />
            <Route path="/reports/sales/analysis" element={gate('reports.view', <SalesAnalysisPage />)} />
            <Route path="/reports/sales/analysis-picture" element={gate('reports.view', <SalesAnalysisPictureReportPage />)} />
            <Route path="/reports/sales/hierarchy-drill-down" element={gate('reports.view', <SalesHierarchyDrillDownPage />)} />
            <Route path="/reports/sales/pivot" element={gate('reports.view', <SalesPivotPage />)} />
            <Route path="/reports/sales/pivot-custom" element={gate('reports.view', <SalesPivotCustomPage />)} />
            <Route path="/reports/sales/best-sellers" element={gate('reports.view', <BestSellersPage />)} />
            <Route path="/reports/sales/history-by-month" element={gate('reports.view', <SalesHistoryByMonthPage />)} />
            <Route path="/reports/sales/seasonality-index" element={gate('reports.view', <SeasonalityIndexPage />)} />
            <Route path="/reports/sales/stock-status" element={gate('reports.view', <StockStatusPage />)} />
            <Route path="/reports/sales/size-type-analysis" element={gate('reports.view', <SizeTypeAnalysisPage />)} />
            <Route path="/reports/sales/otb-vs-sales" element={gate('reports.view', <OtbVsSalesPage />)} />
            <Route path="/reports/others" element={gate('reports.view', <ReportsOthersHubPage />)} />
            <Route path="/reports/others/sales-by-day" element={gate('reports.view', <SalesByDayPage />)} />
            <Route path="/reports/others/sales-by-time" element={gate('reports.view', <SalesByTimePage />)} />
            <Route path="/reports/others/salesperson-summary" element={gate('reports.view', <SalespersonSummaryPage />)} />
            <Route path="/reports/turnover" element={gate('reports.view', <InventoryTurnoverReportPage />)} />
            <Route path="/reports/aging" element={gate('reports.view', <InventoryAgingReportPage />)} />
            <Route path="/reports/sell-through" element={gate('reports.view', <SellThroughReportPage />)} />
            <Route path="/customers" element={gate('segmentation.read', <CustomerListPage />)} />
            <Route path="/customers/dashboard" element={gate('segmentation.read', <CustomerKpiDashboardPage />)} />
            <Route path="/customers/intelligence" element={gate('segmentation.read', <CustomerKpiListPage />)} />
            <Route path="/customers/segments" element={gate('segmentation.read', <CustomerSegmentsPage />)} />
            <Route path="/customers/churn-risk" element={gate('segmentation.read', <CustomerChurnRiskPage />)} />
            <Route path="/customers/vip" element={gate('segmentation.read', <CustomerVipPage />)} />
            <Route path="/customers/discount-sensitive" element={gate('segmentation.read', <CustomerDiscountSensitivePage />)} />
            <Route path="/customers/new" element={gate('segmentation.write', <CustomerFormPage />)} />
            <Route path="/customers/:customerId/edit" element={gate('segmentation.write', <CustomerFormPage />)} />
            <Route path="/customers/:customerId" element={gate('segmentation.read', <CustomerKpiDetailPage />)} />

            {/* products module — Phase 1 Step 2 taxonomy pages */}
            <Route path="/products" element={<Navigate to="/inventory/skus" replace />} />
            <Route path="/file-setup" element={<Navigate to="/products/vendors" replace />} />
            <Route path="/file-setup/case-packs" element={gate('products.view', <CasePacksPage />)} />
            <Route path="/products/taxonomy" element={gate('products.view', <TaxonomyHomePage />)} />
            <Route path="/products/taxonomy/departments" element={gate('products.view', <DepartmentListPage />)} />
            <Route path="/products/taxonomy/departments/new" element={gate('products.write', <DepartmentFormPage />)} />
            <Route path="/products/taxonomy/departments/:number" element={gate('products.write', <DepartmentFormPage />)} />
            <Route path="/products/taxonomy/categories" element={gate('products.view', <CategoryListPage />)} />
            <Route path="/products/taxonomy/categories/new" element={gate('products.write', <CategoryFormPage />)} />
            <Route path="/products/taxonomy/categories/:number" element={gate('products.write', <CategoryFormPage />)} />
            <Route path="/products/taxonomy/groups" element={gate('products.view', <GroupListPage />)} />
            <Route path="/products/taxonomy/groups/new" element={gate('products.write', <GroupFormPage />)} />
            <Route path="/products/taxonomy/groups/:code" element={gate('products.write', <GroupFormPage />)} />
            <Route path="/products/taxonomy/keywords" element={gate('products.view', <KeywordListPage />)} />
            <Route path="/products/taxonomy/keywords/new" element={gate('products.write', <KeywordFormPage />)} />
            <Route path="/products/taxonomy/keywords/:keyword" element={gate('products.write', <KeywordFormPage />)} />
            <Route path="/products/taxonomy/sectors" element={gate('products.view', <SectorListPage />)} />
            <Route path="/products/taxonomy/sectors/new" element={gate('products.write', <SectorFormPage />)} />
            <Route path="/products/taxonomy/sectors/:number" element={gate('products.write', <SectorFormPage />)} />
            <Route path="/products/taxonomy/return-codes" element={gate('products.view', <ReturnCodeListPage />)} />
            <Route path="/products/taxonomy/return-codes/new" element={gate('products.write', <ReturnCodeFormPage />)} />
            <Route path="/products/taxonomy/return-codes/:code" element={gate('products.write', <ReturnCodeFormPage />)} />
            <Route path="/products/taxonomy/promotion-codes" element={gate('products.view', <PromotionCodeListPage />)} />
            <Route path="/products/taxonomy/promotion-codes/new" element={gate('products.write', <PromotionCodeFormPage />)} />
            <Route path="/products/taxonomy/promotion-codes/:code" element={gate('products.write', <PromotionCodeFormPage />)} />
            <Route path="/products/taxonomy/seasons" element={gate('products.view', <SeasonListPage />)} />
            <Route path="/products/taxonomy/seasons/new" element={gate('products.write', <SeasonFormPage />)} />
            <Route path="/products/taxonomy/seasons/:code" element={gate('products.write', <SeasonFormPage />)} />
            <Route path="/products/taxonomy/size-types" element={gate('products.view', <SizeTypeListPage />)} />
            <Route path="/products/taxonomy/size-types/new" element={gate('products.write', <SizeTypeGridEditorPage />)} />
            <Route path="/products/taxonomy/size-types/:code" element={gate('products.write', <SizeTypeGridEditorPage />)} />
            <Route path="/products/vendors" element={gate('products.view', <VendorListPage />)} />
            <Route path="/products/vendors/new" element={gate('products.write', <VendorFormPage />)} />
            <Route path="/products/vendors/:code" element={gate('products.write', <VendorFormPage />)} />
            <Route path="/products/skus" element={gate('products.view', <SkuListPage />)} />
            {/* Primary SKU creator. The modern form is now the only New SKU flow. */}
            <Route path="/products/skus/new" element={gate('products.write', <SkuFormPageModern />)} />
            <Route path="/products/skus/new-modern" element={<Navigate to="/products/skus/new" replace />} />
            <Route path="/products/skus/:skuId/edit" element={gate('products.write', <SkuFormPageModern />)} />
            {/* Legacy RICS-tabs creator, kept as an alternate entry. */}
            <Route path="/products/skus/new-alt" element={gate('products.write', <ProductsSkuFormPage />)} />
            <Route path="/products/skus/:code" element={gate('products.view', <ProductsSkuFormPage />)} />
            <Route path="/products/attributes" element={gate('products.view', <AttributesCatalogPage />)} />
            <Route path="/products/attributes/macros" element={gate('products.view', <AttributesCatalogPage />)} />
            <Route path="/products/families" element={gate('products.view', <ProductFamiliesPage />)} />
            <Route path="/products/matching-sets" element={gate('products.view', <MatchingSetsPage />)} />

            {/* utilities module — RICS Ch. 15 batch-change ports */}
            <Route path="/utilities" element={gate('store_ops.view', <UtilitiesHubPage />)} />
            <Route path="/utilities/overview" element={<Navigate to="/utilities" replace />} />
            <Route path="/utilities/stores" element={gate('store_ops.view', <StoresPage />)} />
            <Route path="/utilities/store-chains" element={gate('store_ops.view', <StoreChainsPage />)} />
            <Route path="/utilities/change-keywords" element={gate('products.write', <ChangeKeywordsPage />)} />
            <Route path="/utilities/change-sku-attributes" element={gate('products.write', <ChangeSkuAttributesPage />)} />
            {/* Backward-compat redirects from the four pre-consolidation routes. */}
            <Route path="/utilities/change-categories" element={<Navigate to="/utilities/change-sku-attributes" replace />} />
            <Route path="/utilities/change-vendors" element={<Navigate to="/utilities/change-sku-attributes" replace />} />
            <Route path="/utilities/change-seasons" element={<Navigate to="/utilities/change-sku-attributes" replace />} />
            <Route path="/utilities/change-group-codes" element={<Navigate to="/utilities/change-sku-attributes" replace />} />
            <Route path="/utilities/batch-history" element={gate('products.write', <BatchHistoryPage />)} />
            <Route path="/utilities/batch-history/:id" element={gate('products.write', <BatchHistoryDetailPage />)} />
            <Route path="/operations" element={<Navigate to="/operations/inventory-close" replace />} />
            <Route
              path="/operations/inventory-close"
              element={<RequirePermission permission="employees.manage"><InventoryClosePage /></RequirePermission>}
            />
            <Route
              path="/operations/migration-day"
              element={<RequirePermission permission="employees.manage"><MigrationDayConsolePage /></RequirePermission>}
            />

            <Route path="/me" element={<MePage />} />
            <Route path="/change-password" element={<ChangePasswordPage />} />
            <Route path="/manual" element={<ManualPage />} />
            <Route path="/manual/:chapterSlug" element={<ManualPage />} />
            <Route
              path="/employees/salespeople"
              element={<RequirePermission permission="employees.view"><SalespeoplePage /></RequirePermission>}
            />
            <Route
              path="/admin/users"
              element={<RequirePermission permission="identity_access.view"><UsersListPage /></RequirePermission>}
            />
            <Route
              path="/admin/users/new"
              element={<RequirePermission permission="identity_access.manage"><UserFormPage /></RequirePermission>}
            />
            <Route
              path="/admin/users/:id/edit"
              element={<RequirePermission permission="identity_access.manage"><UserFormPage /></RequirePermission>}
            />
            <Route
              path="/admin/audit"
              element={<RequirePermission permission="identity_access.view"><PlatformAuditPage /></RequirePermission>}
            />
            <Route
              path="/admin/roles"
              element={<RequirePermission permission="identity_access.manage"><RolePermissionsPage /></RequirePermission>}
            />
            <Route
              path="/admin/effective-access"
              element={<RequirePermission permission="identity_access.view"><EffectiveAccessPage /></RequirePermission>}
            />
            <Route
              path="/admin/security"
              element={<RequirePermission permission="identity_access.view"><SecurityCenterPage /></RequirePermission>}
            />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
