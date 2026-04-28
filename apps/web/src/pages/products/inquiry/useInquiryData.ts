import { useQuery } from '@tanstack/react-query';
import type { InventoryInquiry, InquiryInfo } from '../../../types/inventoryInquiry';

// The backend's GET /api/v1/inventory/inquiry/:sku historically returned a
// nested shape with `master: {...}` and `stores[]`. Task 5 added the extended
// fields (pricing / rollup / grids / pictureUrl) at the top level without
// changing the legacy shape. This hook flattens the legacy `master.*` block
// onto the top-level flat contract the new Inquiry page consumes.
//
// See docs/dev/specs/2026-04-19-inventory-inquiry-design.md § 6 for the
// canonical flat contract. When the old InventoryInquiryPage is removed
// (Task 24), the backend can drop the legacy nested block and this transform
// collapses to a pass-through.

interface BackendMaster {
  description?: string | null;
  brand?: string | null;
  vendorCode?: string | null;
  category?: number | null;
  categoryName?: string | null;
  season?: string | null;
  retailPrice?: number | null;
  currentCost?: number | null;
  sizeType?: {
    code: number | null;
    desc: string | null;
    rowLabels: string[];
    columnLabels: string[];
  };
  vendorSku?: string | null;
  styleColor?: string | null;
  status?: string | null;
}

interface BackendInquiry {
  sku: string;
  master?: BackendMaster;
  pricing: InventoryInquiry['pricing'];
  rollup: InventoryInquiry['rollup'];
  grids: InventoryInquiry['grids'];
  pictureUrl: string | null;
  lastReceivedAt?: string | null;
  info?: InquiryInfo;
}

export function flattenInquiryPayload(raw: BackendInquiry): InventoryInquiry {
  const master = raw.master ?? {};
  return {
    sku: raw.sku,
    description: master.description ?? '',
    category: master.category != null
      ? { id: master.category, name: master.categoryName ?? '' }
      : null,
    vendor: master.vendorCode != null
      ? { code: master.vendorCode, name: master.brand ?? '' }
      : null,
    vendorSku: master.vendorSku ?? null,
    styleColor: master.styleColor ?? null,
    status: master.status ?? null,
    sizeType: master.sizeType
      ? {
          id: master.sizeType.code ?? 0,
          name: master.sizeType.desc ?? '',
          columns: master.sizeType.columnLabels ?? [],
          rows: master.sizeType.rowLabels ?? [],
        }
      : null,
    lastReceivedAt: raw.lastReceivedAt ?? null,
    pricing: raw.pricing,
    rollup: raw.rollup,
    grids: raw.grids,
    pictureUrl: raw.pictureUrl,
    info: raw.info ?? {
      seasonCode: null,
      labelCode: null,
      groupCode: null,
      firstReceivedAt: null,
      lastMarkdownAt: null,
      perks: null,
      comment: null,
    },
  };
}

export function useInquiryData(skuCode: string, storeId?: number, selectedRow?: string | null) {
  return useQuery<InventoryInquiry>({
    queryKey: ['product-inquiry', skuCode, storeId, selectedRow ?? null],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (storeId !== undefined) qs.set('storeId', String(storeId));
      if (selectedRow && selectedRow.trim()) qs.set('row', selectedRow.trim());
      const suffix = qs.size > 0 ? `?${qs.toString()}` : '';
      const response = await fetch(`/api/v1/inventory/inquiry/${encodeURIComponent(skuCode)}${suffix}`);
      if (response.status === 404) throw new Error(`SKU ${skuCode} not found`);
      if (!response.ok) throw new Error(`Inquiry failed: ${response.status}`);
      const raw = (await response.json()) as BackendInquiry;
      return flattenInquiryPayload(raw);
    },
    enabled: !!skuCode,
    staleTime: 30_000,
  });
}
