import { useParams, Link } from 'react-router-dom';
import { Breadcrumb, Card, Empty, Space, Typography } from 'antd';
import { SkuChangeLedger } from '../../components/SkuChangeLedger';
import { useInventoryInquiry } from '../../hooks/useRicsInventory';

// RICS Ch. 2 p. 55 / Ch. 4 p. 72 — standalone route for the Inventory Inquiry
// [Detail] view, deep-linkable by SKU so the view can be shared by URL.
// Shares the SkuChangeLedger component with the Product Inquiry Detail tab.

export default function SkuChangeDetailPage() {
  const { sku } = useParams<{ sku: string }>();
  const skuCode = sku ? decodeURIComponent(sku) : '';

  // Lightweight inquiry read just to get the SKU description for the header.
  // Silent failure — if RICS inquiry misses, we still render the ledger.
  const { data: inquiry } = useInventoryInquiry(skuCode || null);

  if (!skuCode) {
    return (
      <Card>
        <Empty description="No SKU specified. Use /inventory/change-detail to search by date range." />
      </Card>
    );
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Breadcrumb
        items={[
          { title: <Link to="/inventory/dashboard">Inventory</Link> },
          { title: <Link to="/inventory/change-detail">Change Detail</Link> },
          { title: skuCode },
        ]}
      />
      <Typography.Title level={4} style={{ margin: 0 }}>
        Inventory Detail — SKU {skuCode}, All Stores
      </Typography.Title>
      <SkuChangeLedger
        skuCode={skuCode}
        description={inquiry?.master?.description ?? null}
      />
    </Space>
  );
}
