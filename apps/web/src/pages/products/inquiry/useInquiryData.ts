import { useQuery } from '@tanstack/react-query';
import type { InventoryInquiry } from '../../../types/inventoryInquiry';

export function useInquiryData(skuCode: string, storeId?: number) {
  return useQuery<InventoryInquiry>({
    queryKey: ['product-inquiry', skuCode, storeId],
    queryFn: async () => {
      const qs = storeId !== undefined ? `?storeId=${storeId}` : '';
      const response = await fetch(`/api/v1/inventory/inquiry/${encodeURIComponent(skuCode)}${qs}`);
      if (response.status === 404) throw new Error(`SKU ${skuCode} not found`);
      if (!response.ok) throw new Error(`Inquiry failed: ${response.status}`);
      return response.json();
    },
    enabled: !!skuCode,
    staleTime: 30_000,
  });
}
