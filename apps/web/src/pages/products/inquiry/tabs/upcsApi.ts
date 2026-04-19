export interface SkuUpc {
  upc: string;
  columnLabel: string | null;
  rowLabel: string | null;
  source: string;
}

export async function fetchSkuUpcs(skuCode: string): Promise<SkuUpc[]> {
  const res = await fetch(`/api/v1/skus/${encodeURIComponent(skuCode)}/upcs`);
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`UPC fetch failed: ${res.status}`);
  return res.json();
}
