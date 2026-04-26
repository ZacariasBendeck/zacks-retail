import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert, Card, Checkbox, Col, Radio, Row, Select, Space, Spin, Table, Typography,
} from 'antd'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useSalesPivot, useSalesDimensions, type SalesPivotArgs } from '../../hooks/useReports'
import type {
  SalesPivotLeafRow,
  SalesPivotVariant,
} from '../../services/reportApi'
import { getErrorMessage } from '../../utils/errors'
import RunReportControls from './RunReportControls'
import DateRangeControl from '../../components/reports/DateRangeControl'
import { briefDateSpec, resolveDateSpec, type DateSpec } from '../../utils/dateSpec'
import ReportHeader from '../../components/reports/ReportHeader'
import FilterChips from '../../components/reports/FilterChips'
import ReportEmptyState from '../../components/reports/ReportEmptyState'
import CollapsibleFilterCard from '../../components/reports/CollapsibleFilterCard'
import { fmtMoney, fmtQty, DASH } from '../../utils/reportFormatters'
import { SkuLink } from '../../components/sku-link'
import SaveSnapshotButton from '../../components/reports/SaveSnapshotButton'

const { Text } = Typography

const DEFAULT_DATE_SPEC: DateSpec = { type: 'this_month' }

// Three top-level report choices; `separateStore` refines `department` and
// `buyer-vendor`. Plain `buyer` has no separate-store flavor.
type ReportChoice = 'department' | 'buyer' | 'buyer-vendor'

const REPORT_CHOICES: { value: ReportChoice; label: string }[] = [
  { value: 'department', label: 'Department Pivot Report' },
  { value: 'buyer', label: 'Buyer Pivot Report' },
  { value: 'buyer-vendor', label: 'Buyer Vendor Report' },
]

/** Full display names per the spec — used in the page header + chips.
 *  The `'custom'` variant is served by a separate page (SalesPivotCustomPage)
 *  and never selected here; it's in the union purely because the API type is
 *  shared. The fallback keeps the switch exhaustive for TypeScript. */
function titleFor(variant: SalesPivotVariant): string {
  switch (variant) {
    case 'department': return 'Department Pivot Report'
    case 'department-separate-store': return 'Separate Store Department Pivot Report'
    case 'buyer': return 'Buyer Pivot Report'
    case 'buyer-vendor': return 'Buyer Vendor Report'
    case 'buyer-vendor-separate-store': return 'Separate Store Buyer Vendor Report'
    case 'custom': return 'Custom Pivot Report'
  }
}

function effectiveVariant(choice: ReportChoice, separateStore: boolean): SalesPivotVariant {
  if (choice === 'buyer') return 'buyer'
  if (choice === 'buyer-vendor') {
    return separateStore ? 'buyer-vendor-separate-store' : 'buyer-vendor'
  }
  return separateStore ? 'department-separate-store' : 'department'
}

/** Compact label for the variant — used as the dimensions portion of the
 *  default snapshot title. */
function variantDescriptor(variant: SalesPivotVariant): string {
  switch (variant) {
    case 'department': return 'Department'
    case 'department-separate-store': return 'Department × Store'
    case 'buyer': return 'Buyer'
    case 'buyer-vendor': return 'Buyer × Vendor'
    case 'buyer-vendor-separate-store': return 'Buyer × Vendor × Store'
    case 'custom': return 'Custom'
  }
}

/** Which choices honor the Separate Store checkbox. */
const SUPPORTS_SEPARATE_STORE: Record<ReportChoice, boolean> = {
  department: true,
  buyer: false,
  'buyer-vendor': true,
}

// ───────────────────────── Tree model ──────────────────────────────────────

interface TreeNode {
  rowKey: string
  label: string
  /** Populated only on SKU leaves — makes the Group column render as a
   *  SkuLink that opens the inventory-inquiry popup on click. */
  skuCode?: string
  onHandQty: number
  onHandCostVal: number
  qtyTY: number
  netSalesTY: number
  profitTY: number
  qtyLY: number
  netSalesLY: number
  profitLY: number
  children?: TreeNode[]
}

type Measures = Omit<TreeNode, 'rowKey' | 'label' | 'children'>

function labelFor(code: number | string | null, desc: string | null, fallback: string): string {
  if (code != null && desc) return `${code} — ${desc}`
  if (code != null) return String(code)
  if (desc) return desc
  return fallback
}

function emptyMeasures(): Measures {
  return {
    onHandQty: 0, onHandCostVal: 0,
    qtyTY: 0, netSalesTY: 0, profitTY: 0,
    qtyLY: 0, netSalesLY: 0, profitLY: 0,
  }
}

function addMeasures(into: Measures, r: Measures): void {
  into.onHandQty += r.onHandQty
  into.onHandCostVal += r.onHandCostVal
  into.qtyTY += r.qtyTY
  into.netSalesTY += r.netSalesTY
  into.profitTY += r.profitTY
  into.qtyLY += r.qtyLY
  into.netSalesLY += r.netSalesLY
  into.profitLY += r.profitLY
}

/** Sort helper — numeric keys first, then alphabetical. */
const byCodeNumOrLabel = <T extends { keyPart: string; label: string }>(a: T, b: T): number => {
  const na = Number(a.keyPart)
  const nb = Number(b.keyPart)
  const aNum = Number.isFinite(na)
  const bNum = Number.isFinite(nb)
  if (aNum && bNum) return na - nb
  return a.label.localeCompare(b.label)
}

const UNASSIGNED_BUYER = '(Unassigned)'

/** Department Pivot: Sector → Dept → Category → SKU. */
function buildDepartmentTree(rows: SalesPivotLeafRow[]): TreeNode[] {
  type SectorBucket = {
    label: string; keyPart: string
    depts: Map<string, {
      label: string; keyPart: string
      categs: Map<string, {
        label: string; keyPart: string
        skus: SalesPivotLeafRow[]
      }>
    }>
  }
  const sectors = new Map<string, SectorBucket>()
  for (const r of rows) {
    const sectorKey = r.sector == null ? '(no sector)' : String(r.sector)
    const deptKey = r.dept == null ? '(no dept)' : String(r.dept)
    const categKey = r.categ == null ? '(no categ)' : String(r.categ)

    let sb = sectors.get(sectorKey)
    if (!sb) {
      sb = { label: labelFor(r.sector, r.sectorDesc, '(no sector)'), keyPart: sectorKey, depts: new Map() }
      sectors.set(sectorKey, sb)
    }
    let db = sb.depts.get(deptKey)
    if (!db) {
      db = { label: labelFor(r.dept, r.deptDesc, '(no dept)'), keyPart: deptKey, categs: new Map() }
      sb.depts.set(deptKey, db)
    }
    let cb = db.categs.get(categKey)
    if (!cb) {
      cb = { label: labelFor(r.categ, r.categDesc, '(no category)'), keyPart: categKey, skus: [] }
      db.categs.set(categKey, cb)
    }
    cb.skus.push(r)
  }

  return [...sectors.values()].sort(byCodeNumOrLabel).map<TreeNode>((sb) => {
    const sectorNode: TreeNode = {
      rowKey: `se:${sb.keyPart}`, label: sb.label, ...emptyMeasures(),
      children: [...sb.depts.values()].sort(byCodeNumOrLabel).map<TreeNode>((db) => {
        const deptNode: TreeNode = {
          rowKey: `se:${sb.keyPart}/d:${db.keyPart}`, label: db.label, ...emptyMeasures(),
          children: [...db.categs.values()].sort(byCodeNumOrLabel).map<TreeNode>((cb) => {
            const categNode: TreeNode = {
              rowKey: `se:${sb.keyPart}/d:${db.keyPart}/c:${cb.keyPart}`,
              label: cb.label, ...emptyMeasures(),
              children: [...cb.skus].sort((a, z) => a.sku.localeCompare(z.sku)).map<TreeNode>((leaf) => {
                const node: TreeNode = {
                  rowKey: `se:${sb.keyPart}/d:${db.keyPart}/c:${cb.keyPart}/s:${leaf.sku}`,
                  label: labelFor(leaf.sku, leaf.skuDescription, leaf.sku),
                  skuCode: leaf.sku,
                  ...emptyMeasures(),
                }
                addMeasures(node, leaf)
                return node
              }),
            }
            for (const ch of categNode.children!) addMeasures(categNode, ch)
            return categNode
          }),
        }
        for (const ch of deptNode.children!) addMeasures(deptNode, ch)
        return deptNode
      }),
    }
    for (const ch of sectorNode.children!) addMeasures(sectorNode, ch)
    return sectorNode
  })
}

/** Separate-Store Department Pivot: Store → Sector → Dept → Category → SKU. */
function buildSeparateStoreTree(rows: SalesPivotLeafRow[]): TreeNode[] {
  type StoreBucket = {
    label: string; keyPart: string
    subRows: SalesPivotLeafRow[]
  }
  const stores = new Map<string, StoreBucket>()
  for (const r of rows) {
    const storeKey = r.storeNumber == null ? '(no store)' : String(r.storeNumber)
    let sb = stores.get(storeKey)
    if (!sb) {
      sb = {
        label: labelFor(r.storeNumber, r.storeName, `Store ${r.storeNumber ?? ''}`),
        keyPart: storeKey,
        subRows: [],
      }
      stores.set(storeKey, sb)
    }
    sb.subRows.push(r)
  }

  return [...stores.values()].sort(byCodeNumOrLabel).map<TreeNode>((sb) => {
    const storeNode: TreeNode = {
      rowKey: `s:${sb.keyPart}`,
      label: sb.label,
      ...emptyMeasures(),
      children: buildDepartmentTree(sb.subRows).map((n) => ({
        ...n,
        // Namespace the child row keys under this store so identical
        // (sector, dept, categ, sku) pairs across stores stay distinct.
        rowKey: `s:${sb.keyPart}/${n.rowKey}`,
        children: n.children?.map(function prefix(child): TreeNode {
          return {
            ...child,
            rowKey: `s:${sb.keyPart}/${child.rowKey}`,
            children: child.children?.map(prefix),
          }
        }),
      })),
    }
    for (const ch of storeNode.children!) addMeasures(storeNode, ch)
    return storeNode
  })
}

/** Buyer Pivot: Buyer → Dept → Category → SKU. Unassigned buyers sort last. */
function buildBuyerTree(rows: SalesPivotLeafRow[]): TreeNode[] {
  type BuyerBucket = {
    label: string; keyPart: string
    depts: Map<string, {
      label: string; keyPart: string
      categs: Map<string, {
        label: string; keyPart: string
        skus: SalesPivotLeafRow[]
      }>
    }>
  }
  const buyers = new Map<string, BuyerBucket>()
  for (const r of rows) {
    const buyerKey = r.buyerCode ?? '__unassigned__'
    const deptKey = r.dept == null ? '(no dept)' : String(r.dept)
    const categKey = r.categ == null ? '(no categ)' : String(r.categ)

    let bb = buyers.get(buyerKey)
    if (!bb) {
      bb = {
        label: r.buyerCode ? labelFor(r.buyerCode, r.buyerLabel, r.buyerCode) : UNASSIGNED_BUYER,
        keyPart: buyerKey,
        depts: new Map(),
      }
      buyers.set(buyerKey, bb)
    }
    let db = bb.depts.get(deptKey)
    if (!db) {
      db = { label: labelFor(r.dept, r.deptDesc, '(no dept)'), keyPart: deptKey, categs: new Map() }
      bb.depts.set(deptKey, db)
    }
    let cb = db.categs.get(categKey)
    if (!cb) {
      cb = { label: labelFor(r.categ, r.categDesc, '(no category)'), keyPart: categKey, skus: [] }
      db.categs.set(categKey, cb)
    }
    cb.skus.push(r)
  }

  const byBuyer = (a: BuyerBucket, b: BuyerBucket): number => {
    if (a.keyPart === '__unassigned__') return 1
    if (b.keyPart === '__unassigned__') return -1
    return a.label.localeCompare(b.label)
  }

  return [...buyers.values()].sort(byBuyer).map<TreeNode>((bb) => {
    const buyerNode: TreeNode = {
      rowKey: `b:${bb.keyPart}`, label: bb.label, ...emptyMeasures(),
      children: [...bb.depts.values()].sort(byCodeNumOrLabel).map<TreeNode>((db) => {
        const deptNode: TreeNode = {
          rowKey: `b:${bb.keyPart}/d:${db.keyPart}`, label: db.label, ...emptyMeasures(),
          children: [...db.categs.values()].sort(byCodeNumOrLabel).map<TreeNode>((cb) => {
            const categNode: TreeNode = {
              rowKey: `b:${bb.keyPart}/d:${db.keyPart}/c:${cb.keyPart}`,
              label: cb.label, ...emptyMeasures(),
              children: [...cb.skus].sort((a, z) => a.sku.localeCompare(z.sku)).map<TreeNode>((leaf) => {
                const node: TreeNode = {
                  rowKey: `b:${bb.keyPart}/d:${db.keyPart}/c:${cb.keyPart}/s:${leaf.sku}`,
                  label: labelFor(leaf.sku, leaf.skuDescription, leaf.sku),
                  skuCode: leaf.sku,
                  ...emptyMeasures(),
                }
                addMeasures(node, leaf)
                return node
              }),
            }
            for (const ch of categNode.children!) addMeasures(categNode, ch)
            return categNode
          }),
        }
        for (const ch of deptNode.children!) addMeasures(deptNode, ch)
        return deptNode
      }),
    }
    for (const ch of buyerNode.children!) addMeasures(buyerNode, ch)
    return buyerNode
  })
}

/** Buyer Vendor Pivot: Buyer → Vendor → SKU. SKU leaves order by Net Sales
 *  TY descending per the spec — the highest-selling SKUs inside a vendor
 *  surface first when the operator expands the vendor. Unassigned buyers
 *  sort last; unknown vendors ("(no vendor)") also sort last within a buyer. */
function buildBuyerVendorTree(rows: SalesPivotLeafRow[]): TreeNode[] {
  type BuyerBucket = {
    label: string; keyPart: string
    vendors: Map<string, {
      label: string; keyPart: string; isUnknown: boolean
      skus: SalesPivotLeafRow[]
    }>
  }
  const buyers = new Map<string, BuyerBucket>()
  for (const r of rows) {
    const buyerKey = r.buyerCode ?? '__unassigned__'
    const vendorKey = r.vendorCode ?? '__no_vendor__'

    let bb = buyers.get(buyerKey)
    if (!bb) {
      bb = {
        label: r.buyerCode ? labelFor(r.buyerCode, r.buyerLabel, r.buyerCode) : UNASSIGNED_BUYER,
        keyPart: buyerKey,
        vendors: new Map(),
      }
      buyers.set(buyerKey, bb)
    }
    let vb = bb.vendors.get(vendorKey)
    if (!vb) {
      vb = {
        label: r.vendorCode ? labelFor(r.vendorCode, r.vendorLabel, r.vendorCode) : '(no vendor)',
        keyPart: vendorKey,
        isUnknown: !r.vendorCode,
        skus: [],
      }
      bb.vendors.set(vendorKey, vb)
    }
    vb.skus.push(r)
  }

  const byBuyer = (a: BuyerBucket, b: BuyerBucket): number => {
    if (a.keyPart === '__unassigned__') return 1
    if (b.keyPart === '__unassigned__') return -1
    return a.label.localeCompare(b.label)
  }

  return [...buyers.values()].sort(byBuyer).map<TreeNode>((bb) => {
    // Build vendor nodes first, then sort by their aggregated Net Sales TY
    // descending — the sort key isn't knowable until each vendor's SKUs are
    // rolled up. `(no vendor)` and any vendor with zero TY sales sort last
    // (ties broken by label) so missing vendors don't steal the top slot.
    const vendorNodes: Array<TreeNode & { __isUnknown: boolean }> = [...bb.vendors.values()].map((vb) => {
      const vendorNode: TreeNode & { __isUnknown: boolean } = {
        rowKey: `b:${bb.keyPart}/v:${vb.keyPart}`,
        label: vb.label,
        ...emptyMeasures(),
        __isUnknown: vb.isUnknown,
        children: [...vb.skus]
          // Per spec: SKUs under a vendor sort by Net Sales (this year) descending.
          // Ties fall back to SKU code for stable ordering.
          .sort((a, z) => {
            if (z.netSalesTY !== a.netSalesTY) return z.netSalesTY - a.netSalesTY
            return a.sku.localeCompare(z.sku)
          })
          .map<TreeNode>((leaf) => {
            const node: TreeNode = {
              rowKey: `b:${bb.keyPart}/v:${vb.keyPart}/s:${leaf.sku}`,
              label: labelFor(leaf.sku, leaf.skuDescription, leaf.sku),
              skuCode: leaf.sku,
              ...emptyMeasures(),
            }
            addMeasures(node, leaf)
            return node
          }),
      }
      for (const ch of vendorNode.children!) addMeasures(vendorNode, ch)
      return vendorNode
    })
    vendorNodes.sort((a, b) => {
      if (a.__isUnknown && !b.__isUnknown) return 1
      if (!a.__isUnknown && b.__isUnknown) return -1
      if (b.netSalesTY !== a.netSalesTY) return b.netSalesTY - a.netSalesTY
      return a.label.localeCompare(b.label)
    })

    const buyerNode: TreeNode = {
      rowKey: `b:${bb.keyPart}`, label: bb.label, ...emptyMeasures(),
      children: vendorNodes.map(({ __isUnknown: _u, ...rest }) => rest),
    }
    for (const ch of buyerNode.children!) addMeasures(buyerNode, ch)
    return buyerNode
  })
}

/** Store → Buyer → Vendor → SKU. Reuses buildBuyerVendorTree per store. */
function buildStoreBuyerVendorTree(rows: SalesPivotLeafRow[]): TreeNode[] {
  const stores = new Map<string, { label: string; keyPart: string; subRows: SalesPivotLeafRow[] }>()
  for (const r of rows) {
    const storeKey = r.storeNumber == null ? '(no store)' : String(r.storeNumber)
    let sb = stores.get(storeKey)
    if (!sb) {
      sb = {
        label: labelFor(r.storeNumber, r.storeName, `Store ${r.storeNumber ?? ''}`),
        keyPart: storeKey,
        subRows: [],
      }
      stores.set(storeKey, sb)
    }
    sb.subRows.push(r)
  }

  return [...stores.values()].sort(byCodeNumOrLabel).map<TreeNode>((sb) => {
    const storeNode: TreeNode = {
      rowKey: `s:${sb.keyPart}`,
      label: sb.label,
      ...emptyMeasures(),
      children: buildBuyerVendorTree(sb.subRows).map(function prefix(n): TreeNode {
        return {
          ...n,
          rowKey: `s:${sb.keyPart}/${n.rowKey}`,
          children: n.children?.map(prefix),
        }
      }),
    }
    for (const ch of storeNode.children!) addMeasures(storeNode, ch)
    return storeNode
  })
}

function buildTree(rows: SalesPivotLeafRow[], variant: SalesPivotVariant): TreeNode[] {
  switch (variant) {
    case 'department': return buildDepartmentTree(rows)
    case 'department-separate-store': return buildSeparateStoreTree(rows)
    case 'buyer': return buildBuyerTree(rows)
    case 'buyer-vendor': return buildBuyerVendorTree(rows)
    case 'buyer-vendor-separate-store': return buildStoreBuyerVendorTree(rows)
    // `'custom'` is served by SalesPivotCustomPage; this switch should never
    // see it in practice. Fall back to the department tree so a misrouted
    // response doesn't crash the page.
    case 'custom': return buildDepartmentTree(rows)
  }
}

// ───────────────────────── Column zones ────────────────────────────────────

const ZONE_BG = {
  onHand: 'rgba(140, 140, 140, 0.08)',
  ty: 'rgba(22, 119, 255, 0.08)',
  ly: 'rgba(250, 173, 20, 0.08)',
} as const

// ───────────────────────── Page ────────────────────────────────────────────

export default function SalesPivotPage() {
  const qc = useQueryClient()

  const [dateSpec, setDateSpec] = useState<DateSpec>(DEFAULT_DATE_SPEC)
  const [selectedStores, setSelectedStores] = useState<number[]>([])
  const [choice, setChoice] = useState<ReportChoice>('department')
  const [separateStore, setSeparateStore] = useState(false)
  const [query, setQuery] = useState<SalesPivotArgs | null>(null)
  const [filterOpen, setFilterOpen] = useState(true)

  const { data: dims, isLoading: dimsLoading } = useSalesDimensions()
  const { data, isFetching, error } = useSalesPivot(query)
  const running = query != null && isFetching

  useEffect(() => {
    if (query && data && !isFetching) setFilterOpen(false)
  }, [query, data, isFetching])

  const resultRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (query && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [query])

  function onRun(): void {
    const { startDate, endDate } = resolveDateSpec(dateSpec)
    setQuery({
      startDate,
      endDate,
      stores: selectedStores.length ? selectedStores : undefined,
      variant: effectiveVariant(choice, separateStore),
    })
  }
  function onStop(): void {
    qc.cancelQueries({ queryKey: ['sales-pivot', query] })
  }

  const tree = useMemo(
    () => (data ? buildTree(data.rows, data.variant) : []),
    [data],
  )

  const currentYear = data?.currentYear
  const priorYear = data?.priorYear
  const variantTitle = data ? titleFor(data.variant) : 'Sales Pivot'

  const columns = useMemo(() => {
    const moneyCell = (v: number) => (v === 0 ? DASH : fmtMoney(v))
    const qtyCell = (v: number) => (v === 0 ? DASH : fmtQty(v))
    const rightAlign = { align: 'right' as const }

    return [
      {
        title: 'Group',
        dataIndex: 'label',
        key: 'label',
        width: 420,
        fixed: 'left' as const,
        // SKU leaves render as a SkuLink so clicking opens the inventory
        // inquiry popup (see InquiryPopupProvider mounted at app root).
        // Rollup rows (Buyer/Vendor/Store/Sector/Dept/Category) stay as
        // plain text since there's nothing to drill into at those levels.
        render: (_v: string, record: TreeNode) =>
          record.skuCode
            ? <SkuLink skuCode={record.skuCode}>{record.label}</SkuLink>
            : record.label,
      },
      {
        title: 'On Hand',
        key: 'onHand',
        onHeaderCell: () => ({ style: { background: ZONE_BG.onHand } }),
        children: [
          { title: 'Qty', dataIndex: 'onHandQty', key: 'onHandQty', width: 100, ...rightAlign,
            onCell: () => ({ style: { background: ZONE_BG.onHand } }), render: qtyCell },
          { title: 'Cost Val', dataIndex: 'onHandCostVal', key: 'onHandCostVal', width: 140, ...rightAlign,
            onCell: () => ({ style: { background: ZONE_BG.onHand } }), render: moneyCell },
        ],
      },
      {
        title: currentYear != null ? String(currentYear) : 'This Year',
        key: 'ty',
        onHeaderCell: () => ({ style: { background: ZONE_BG.ty } }),
        children: [
          { title: 'Qty', dataIndex: 'qtyTY', key: 'qtyTY', width: 100, ...rightAlign,
            onCell: () => ({ style: { background: ZONE_BG.ty } }), render: qtyCell },
          { title: 'Net Sales', dataIndex: 'netSalesTY', key: 'netSalesTY', width: 140, ...rightAlign,
            onCell: () => ({ style: { background: ZONE_BG.ty } }), render: moneyCell },
          { title: 'Profit', dataIndex: 'profitTY', key: 'profitTY', width: 140, ...rightAlign,
            onCell: () => ({ style: { background: ZONE_BG.ty } }), render: moneyCell },
        ],
      },
      {
        title: priorYear != null ? String(priorYear) : 'Prior Year',
        key: 'ly',
        onHeaderCell: () => ({ style: { background: ZONE_BG.ly } }),
        children: [
          { title: 'Qty', dataIndex: 'qtyLY', key: 'qtyLY', width: 100, ...rightAlign,
            onCell: () => ({ style: { background: ZONE_BG.ly } }), render: qtyCell },
          { title: 'Net Sales', dataIndex: 'netSalesLY', key: 'netSalesLY', width: 140, ...rightAlign,
            onCell: () => ({ style: { background: ZONE_BG.ly } }), render: moneyCell },
          { title: 'Profit', dataIndex: 'profitLY', key: 'profitLY', width: 140, ...rightAlign,
            onCell: () => ({ style: { background: ZONE_BG.ly } }), render: moneyCell },
        ],
      },
    ]
  }, [currentYear, priorYear])

  return (
    <div>
      <ReportHeader
        title={variantTitle}
        description="Current on-hand snapshot plus YoY sales (this year vs last year). Pick a report type and period below."
        breadcrumb={[
          { title: <Link to="/reports/sales">Sales Reports</Link> },
          { title: variantTitle },
        ]}
        rightMeta={data ? `${data.rows.length.toLocaleString()} leaf ${data.rows.length === 1 ? 'row' : 'rows'}` : undefined}
        actions={
          <SaveSnapshotButton
            reportType="sales-pivot"
            disabled={!data}
            getParamsJson={() => ({
              variant: query?.variant ?? effectiveVariant(choice, separateStore),
              startDate: query?.startDate,
              endDate: query?.endDate,
              stores: query?.stores,
              dateSpec,
              choice,
              separateStore,
            })}
            getResultJson={() => data}
            getDescriptor={() => {
              const v = query?.variant ?? effectiveVariant(choice, separateStore)
              const parts: string[] = [variantDescriptor(v)]
              const storesArr = query?.stores
              if (storesArr && storesArr.length > 0) {
                parts.push(
                  storesArr.length <= 3
                    ? `stores ${storesArr.join(',')}`
                    : `${storesArr.length} stores`,
                )
              }
              parts.push(briefDateSpec(dateSpec))
              return parts.join(' · ')
            }}
          />
        }
      />

      <CollapsibleFilterCard
        open={filterOpen}
        onOpenChange={setFilterOpen}
        running={running}
        onRun={onRun}
        actions={<RunReportControls running={running} hasRun={query != null} onRun={onRun} onStop={onStop} />}
      >
        <Row gutter={24}>
          <Col xs={24} md={8}>
            <Card size="small" title={<Text strong>Report Type</Text>}>
              <Radio.Group
                value={choice}
                onChange={(e) => setChoice(e.target.value)}
                style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
              >
                {REPORT_CHOICES.map((o) => (
                  <Radio key={o.value} value={o.value}>{o.label}</Radio>
                ))}
              </Radio.Group>
              {SUPPORTS_SEPARATE_STORE[choice] && (
                <div style={{ marginTop: 12 }}>
                  <Checkbox
                    checked={separateStore}
                    onChange={(e) => setSeparateStore(e.target.checked)}
                  >
                    Separate Store
                  </Checkbox>
                  <Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
                    Adds Store as the top level of the hierarchy.
                  </Text>
                </div>
              )}
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card size="small" title={<Text strong>Period</Text>}>
              <DateRangeControl value={dateSpec} onChange={setDateSpec} />
              <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
                Prior-year columns cover the same window one year earlier.
              </Text>
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card size="small" title={<Text strong>Stores</Text>}>
              <Select
                mode="multiple"
                allowClear
                placeholder="All stores"
                loading={dimsLoading}
                value={selectedStores}
                onChange={setSelectedStores}
                style={{ width: '100%' }}
                options={(dims?.stores ?? []).map((s) => ({
                  value: s.number,
                  label: s.name ? `${s.number} — ${s.name}` : String(s.number),
                }))}
                optionFilterProp="label"
              />
            </Card>
          </Col>
        </Row>
      </CollapsibleFilterCard>

      <div ref={resultRef} style={{ scrollMarginTop: 12 }}>
        {error && (
          <Alert
            type="error"
            message="Failed to load report"
            description={getErrorMessage(error)}
            style={{ marginBottom: 16 }}
          />
        )}

        {!query ? (
          <ReportEmptyState
            reason="idle"
            message="Pick a report type and period, then click Run Report."
          />
        ) : running ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin size="large" tip="Building pivot…" />
          </div>
        ) : data && data.rows.length === 0 ? (
          <ReportEmptyState
            reason="no-results"
            hint={`No sales or on-hand activity between ${query.startDate} and ${query.endDate} for the selected filters.`}
          />
        ) : data ? (
          <>
            <FilterChips
              chips={[
                { label: 'Report', value: titleFor(data.variant) },
                { label: 'Period', value: `${query.startDate} → ${query.endDate}` },
                { label: 'Compare', value: `${data.currentYear} vs ${data.priorYear}` },
                query.stores?.length
                  ? { label: 'Stores', value: `${query.stores.length} selected` }
                  : { label: 'Stores', value: 'All' },
              ]}
            />
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Table<TreeNode>
                dataSource={tree}
                columns={columns}
                rowKey="rowKey"
                size="small"
                pagination={false}
                scroll={{ x: 1160 }}
                bordered
                expandable={{ defaultExpandAllRows: false }}
                summary={() => {
                  const t = data.totals
                  return (
                    <Table.Summary fixed>
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0}>
                          <strong>Totals</strong>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={1} align="right">{fmtQty(t.onHandQty)}</Table.Summary.Cell>
                        <Table.Summary.Cell index={2} align="right">{fmtMoney(t.onHandCostVal)}</Table.Summary.Cell>
                        <Table.Summary.Cell index={3} align="right">{fmtQty(t.qtyTY)}</Table.Summary.Cell>
                        <Table.Summary.Cell index={4} align="right">{fmtMoney(t.netSalesTY)}</Table.Summary.Cell>
                        <Table.Summary.Cell index={5} align="right">{fmtMoney(t.profitTY)}</Table.Summary.Cell>
                        <Table.Summary.Cell index={6} align="right">{fmtQty(t.qtyLY)}</Table.Summary.Cell>
                        <Table.Summary.Cell index={7} align="right">{fmtMoney(t.netSalesLY)}</Table.Summary.Cell>
                        <Table.Summary.Cell index={8} align="right">{fmtMoney(t.profitLY)}</Table.Summary.Cell>
                      </Table.Summary.Row>
                    </Table.Summary>
                  )
                }}
              />
            </Space>
          </>
        ) : null}
      </div>
    </div>
  )
}
