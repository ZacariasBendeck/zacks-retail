import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  Row,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd'
import { SearchOutlined, ShopOutlined } from '@ant-design/icons'
import { useFindBySize } from '../../hooks/useRicsInventory'
import { SkuLink } from '../../components/sku-link'
import type { FindBySizeResult } from '../../services/ricsInventoryApi'
import { getErrorMessage } from '../../utils/errors'

// RICS Ch. 4 p. 70 — Find Inventory by Size. Enter a SKU + size label, get
// on-hand per store sorted by quantity so the biggest pocket is top.
export default function FindBySizePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeSku = (searchParams.get('sku') || '').trim() || null
  const activeSize = (searchParams.get('size') || '').trim() || null

  const [skuInput, setSkuInput] = useState(activeSku ?? '')
  const [sizeInput, setSizeInput] = useState(activeSize ?? '')

  const { data, isLoading, isFetching, error } = useFindBySize(activeSku, activeSize)

  const handleSubmit = () => {
    const sku = skuInput.trim()
    const size = sizeInput.trim()
    if (!sku || !size) {
      setSearchParams({})
      return
    }
    setSearchParams({ sku, size })
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card size="small">
        <Typography.Title level={4} style={{ margin: 0 }}>
          Find Inventory by Size
        </Typography.Title>
        <Typography.Text type="secondary">
          RICS Ch. 4 p. 70 — locate on-hand for a (SKU, size) across every store
        </Typography.Text>
        <Form layout="inline" style={{ marginTop: 16 }} onFinish={handleSubmit}>
          <Form.Item label="SKU" required>
            <Input
              placeholder="e.g. 349101-BKPT"
              value={skuInput}
              onChange={(e) => setSkuInput(e.target.value)}
              style={{ width: 240 }}
              prefix={<SearchOutlined />}
            />
          </Form.Item>
          <Form.Item label="Size" required>
            <Input
              placeholder="e.g. 070"
              value={sizeInput}
              onChange={(e) => setSizeInput(e.target.value)}
              style={{ width: 120 }}
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={isFetching}>
              Find
            </Button>
          </Form.Item>
        </Form>
      </Card>

      {(!activeSku || !activeSize) && (
        <Card>
          <Empty description="Enter both a SKU and a size label to search." />
        </Card>
      )}

      {activeSku && activeSize && error && (
        <Alert
          type="error"
          showIcon
          message="Find-by-size failed"
          description={getErrorMessage(error, 'Unable to execute find-by-size lookup.')}
        />
      )}

      {activeSku && activeSize && isLoading && (
        <Card>
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin />
          </div>
        </Card>
      )}

      {activeSku && activeSize && data && <FindResults data={data} />}
    </Space>
  )
}

function FindResults({ data }: { data: FindBySizeResult }) {
  return (
    <>
      <Card>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} md={14}>
            <Typography.Title level={4} style={{ marginTop: 0 }}>
              <SkuLink skuCode={data.sku} /> — size <Tag color="geekblue">{data.sizeLabel}</Tag>
            </Typography.Title>
            <Typography.Paragraph style={{ margin: 0 }}>
              {data.description || <Typography.Text type="secondary">(no description)</Typography.Text>}
              {data.brand && (
                <>
                  {' · '}
                  <Tag color="blue">{data.brand}</Tag>
                </>
              )}
            </Typography.Paragraph>
          </Col>
          <Col xs={24} md={10}>
            <Row gutter={[16, 16]}>
              <Col xs={12}>
                <Statistic title="Total On Hand" value={data.totalOnHand} />
              </Col>
              <Col xs={12}>
                <Statistic
                  title="Stores w/ Stock"
                  value={data.matches.length}
                  prefix={<ShopOutlined />}
                />
              </Col>
            </Row>
          </Col>
        </Row>
      </Card>

      <Card title={`Matches (${data.matches.length})`}>
        {data.matches.length === 0 ? (
          <Empty description={`No store currently holds size ${data.sizeLabel} for this SKU.`} />
        ) : (
          <Table
            size="middle"
            dataSource={data.matches}
            rowKey={(r) => `${r.storeNumber}::${r.rowLabel}`}
            pagination={false}
            columns={[
              { title: 'Store #', dataIndex: 'storeNumber', key: 'storeNumber', width: 90 },
              { title: 'Store Name', dataIndex: 'storeName', key: 'storeName', render: (v: string | null) => v ?? '—' },
              {
                title: 'Row',
                dataIndex: 'rowLabel',
                key: 'rowLabel',
                width: 100,
                render: (v: string) => v || <Typography.Text type="secondary">—</Typography.Text>,
              },
              {
                title: 'On Hand',
                dataIndex: 'onHand',
                key: 'onHand',
                align: 'right',
                width: 110,
                render: (v: number) => <strong>{v}</strong>,
              },
            ]}
          />
        )}
      </Card>
    </>
  )
}
