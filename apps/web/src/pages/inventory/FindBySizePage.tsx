import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Empty,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { SearchOutlined } from '@ant-design/icons'
import { useFindBySize } from '../../hooks/useRicsInventory'
import { SkuLink } from '../../components/sku-link'
import { SkuLookup } from '../../components/sku-lookup'
import type {
  FindBySizeParams,
  FindBySizeResult,
  FindBySizeRow,
  FindBySizeSort,
} from '../../services/ricsInventoryApi'
import { getErrorMessage } from '../../utils/errors'

interface FormValues {
  seedSku?: string
  sizeTypeCode?: number
  columnLabel?: string
  rowLabel?: string
  restrictToSizeType?: boolean
  vendorCode?: string
  category?: number
  styleColor?: string
  storeNumbers?: string
  sort?: FindBySizeSort
  separateByStore?: boolean
  limit?: number
}

const SORT_OPTIONS: Array<{ value: FindBySizeSort; label: string }> = [
  { value: 'SKU', label: 'SKU' },
  { value: 'DESCRIPTION', label: 'Description' },
  { value: 'VENDOR', label: 'Vendor' },
  { value: 'CATEGORY', label: 'Category' },
]

export default function FindBySizePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [lookupOpen, setLookupOpen] = useState(false)
  const [form] = Form.useForm<FormValues>()
  const watchedSeedSku = Form.useWatch('seedSku', form)

  const activeParams = useMemo<FindBySizeParams | null>(() => {
    const columnLabel = (searchParams.get('columnLabel') || searchParams.get('size') || '').trim()
    const rowLabel = (searchParams.get('rowLabel') || '').trim()
    if (!columnLabel && !rowLabel) return null

    const storeNumbers = parseStoreNumbers(searchParams.get('storeNumbers'))
    const sizeTypeCode = parseOptionalInt(searchParams.get('sizeTypeCode'))
    const category = parseOptionalInt(searchParams.get('category'))
    const limit = parseOptionalInt(searchParams.get('limit'))
    const sortRaw = (searchParams.get('sort') || 'SKU').toUpperCase()
    const sort: FindBySizeSort =
      sortRaw === 'DESCRIPTION' || sortRaw === 'VENDOR' || sortRaw === 'CATEGORY' ? sortRaw : 'SKU'

    return {
      seedSku: (searchParams.get('seedSku') || searchParams.get('sku') || '').trim() || undefined,
      sizeTypeCode: sizeTypeCode ?? undefined,
      columnLabel: columnLabel || undefined,
      rowLabel: rowLabel || undefined,
      restrictToSizeType: searchParams.get('restrictToSizeType') !== 'false',
      vendorCode: (searchParams.get('vendorCode') || '').trim() || undefined,
      category: category ?? undefined,
      styleColor: (searchParams.get('styleColor') || '').trim() || undefined,
      storeNumbers,
      sort,
      separateByStore: searchParams.get('separateByStore') === 'true',
      limit: limit ?? undefined,
    }
  }, [searchParams])

  const { data, isLoading, isFetching, error } = useFindBySize(activeParams)

  const initialValues = useMemo<FormValues>(
    () => ({
      seedSku: searchParams.get('seedSku') || searchParams.get('sku') || '',
      sizeTypeCode: parseOptionalInt(searchParams.get('sizeTypeCode')) ?? undefined,
      columnLabel: searchParams.get('columnLabel') || searchParams.get('size') || '',
      rowLabel: searchParams.get('rowLabel') || '',
      restrictToSizeType: searchParams.get('restrictToSizeType') !== 'false',
      vendorCode: searchParams.get('vendorCode') || '',
      category: parseOptionalInt(searchParams.get('category')) ?? undefined,
      styleColor: searchParams.get('styleColor') || '',
      storeNumbers: searchParams.get('storeNumbers') || '',
      sort:
        ((searchParams.get('sort') || 'SKU').toUpperCase() as FindBySizeSort),
      separateByStore: searchParams.get('separateByStore') === 'true',
      limit: parseOptionalInt(searchParams.get('limit')) ?? 500,
    }),
    [searchParams],
  )

  useEffect(() => {
    form.setFieldsValue(initialValues)
  }, [form, initialValues])

  const handleRun = (values: FormValues) => {
    const next = new URLSearchParams()
    const setTrimmed = (key: string, value?: string) => {
      const trimmed = value?.trim()
      if (trimmed) next.set(key, trimmed)
    }

    setTrimmed('seedSku', values.seedSku)
    if (values.sizeTypeCode != null) next.set('sizeTypeCode', String(values.sizeTypeCode))
    setTrimmed('columnLabel', values.columnLabel)
    setTrimmed('rowLabel', values.rowLabel)
    next.set('restrictToSizeType', String(values.restrictToSizeType !== false))
    setTrimmed('vendorCode', values.vendorCode)
    if (values.category != null) next.set('category', String(values.category))
    setTrimmed('styleColor', values.styleColor)
    const storeNumbers = values.storeNumbers?.trim()
    if (storeNumbers) next.set('storeNumbers', storeNumbers)
    next.set('sort', values.sort || 'SKU')
    next.set('separateByStore', String(!!values.separateByStore))
    if (values.limit != null) next.set('limit', String(values.limit))
    setSearchParams(next)
  }

  const handleClear = () => {
    form.resetFields()
    setSearchParams({})
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card size="small">
        <Typography.Title level={4} style={{ margin: 0 }}>
          Find Inventory by Size
        </Typography.Title>
        <Typography.Text type="secondary">
          RICS Ch. 4 p. 72 — search every SKU carrying a size, then narrow by vendor, category, style/color, and store.
        </Typography.Text>
        <Form
          form={form}
          layout="vertical"
          style={{ marginTop: 16 }}
          initialValues={initialValues}
          onFinish={handleRun}
        >
          <Row gutter={16}>
            <Col xs={24} md={6}>
              <Form.Item label="Seed SKU" name="seedSku">
                <Space.Compact style={{ width: '100%' }}>
                  <Input
                    placeholder="Optional SKU to borrow size type"
                    allowClear
                  />
                  <Button
                    icon={<SearchOutlined />}
                    onClick={() => setLookupOpen(true)}
                    title="Look up SKU"
                  />
                </Space.Compact>
              </Form.Item>
            </Col>
            <Col xs={12} md={4}>
              <Form.Item label="Size Type #" name="sizeTypeCode">
                <InputNumber min={1} style={{ width: '100%' }} placeholder="Optional" />
              </Form.Item>
            </Col>
            <Col xs={12} md={4}>
              <Form.Item label="Column" name="columnLabel">
                <Input placeholder="e.g. 080" allowClear />
              </Form.Item>
            </Col>
            <Col xs={12} md={4}>
              <Form.Item label="Row" name="rowLabel">
                <Input placeholder="e.g. M" allowClear />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item label="Sort" name="sort">
                <Select options={SORT_OPTIONS} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} md={6}>
              <Form.Item label="Vendor" name="vendorCode">
                <Input placeholder="Optional vendor code" allowClear />
              </Form.Item>
            </Col>
            <Col xs={12} md={4}>
              <Form.Item label="Category" name="category">
                <InputNumber min={1} style={{ width: '100%' }} placeholder="Optional" />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item label="Style / Color" name="styleColor">
                <Input placeholder="Optional contains filter" allowClear />
              </Form.Item>
            </Col>
            <Col xs={24} md={5}>
              <Form.Item label="Stores" name="storeNumbers">
                <Input placeholder="e.g. 1,2,5" allowClear />
              </Form.Item>
            </Col>
            <Col xs={12} md={3}>
              <Form.Item label="Limit" name="limit">
                <InputNumber min={1} max={10000} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item name="restrictToSizeType" valuePropName="checked">
                <Checkbox>Restrict search to this size type</Checkbox>
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="separateByStore" valuePropName="checked">
                <Checkbox>Separate rows by store</Checkbox>
              </Form.Item>
            </Col>
          </Row>

          <Space>
            <Button type="primary" htmlType="submit" loading={isFetching}>
              Find
            </Button>
            <Button onClick={() => setLookupOpen(true)} icon={<SearchOutlined />}>
              Look up SKU
            </Button>
            <Button onClick={handleClear}>Clear</Button>
          </Space>
        </Form>
      </Card>

      <SkuLookup
        open={lookupOpen}
        onClose={() => setLookupOpen(false)}
        onSelect={(picked) => {
          form.setFieldValue('seedSku', picked.skuCode)
          setLookupOpen(false)
        }}
        initialQuery={watchedSeedSku ?? ''}
      />

      {!activeParams && (
        <Card>
          <Empty description="Enter at least a column or row label to search." />
        </Card>
      )}

      {activeParams && error && (
        <Alert
          type="error"
          showIcon
          message="Find-by-size failed"
          description={getErrorMessage(error, 'Unable to execute find-by-size lookup.')}
        />
      )}

      {activeParams && isLoading && (
        <Card>
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin />
          </div>
        </Card>
      )}

      {activeParams && data && <FindResults data={data} />}
    </Space>
  )
}

function FindResults({ data }: { data: FindBySizeResult }) {
  const columns = useMemo(
    () => buildColumns(data.separateByStore),
    [data.separateByStore],
  )

  return (
    <>
      <Card>
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={14}>
            <Typography.Title level={4} style={{ marginTop: 0 }}>
              Size Search
            </Typography.Title>
            <Space wrap>
              {data.columnLabel && <Tag color="geekblue">Column {data.columnLabel}</Tag>}
              {data.rowLabel && <Tag color="purple">Row {data.rowLabel}</Tag>}
              {data.sizeTypeCode != null && (
                <Tag color="gold">
                  Size Type {data.sizeTypeCode}
                  {data.sizeTypeDesc ? ` — ${data.sizeTypeDesc}` : ''}
                </Tag>
              )}
              <Tag>{data.sort}</Tag>
              {data.restrictToSizeType && <Tag color="blue">Restricted to one size type</Tag>}
              {data.separateByStore && <Tag color="cyan">Per-store rows</Tag>}
            </Space>
          </Col>
          <Col xs={24} lg={10}>
            <Row gutter={[16, 16]}>
              <Col xs={12}>
                <Statistic title="Matches" value={data.totalMatches} />
              </Col>
              <Col xs={12}>
                <Statistic title="Total On Hand" value={data.totalOnHand} />
              </Col>
            </Row>
          </Col>
        </Row>
      </Card>

      <Card title={`Matches (${data.totalMatches})`}>
        {data.rows.length === 0 ? (
          <Empty description="No SKUs match the requested size and filters." />
        ) : (
          <Table<FindBySizeRow>
            size="middle"
            dataSource={data.rows}
            rowKey={(row) => `${row.sku}::${row.storeNumber ?? 'all'}`}
            pagination={{ pageSize: 50 }}
            columns={columns}
          />
        )}
      </Card>
    </>
  )
}

function buildColumns(separateByStore: boolean) {
  const columns: ColumnsType<FindBySizeRow> = [
    {
      title: 'SKU',
      dataIndex: 'sku',
      key: 'sku',
      width: 150,
      render: (value: string) => <SkuLink skuCode={value} />,
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      render: (value: string | null) => value ?? <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      title: 'Vendor',
      dataIndex: 'vendorCode',
      key: 'vendorCode',
      width: 110,
      render: (value: string | null) => value ?? '—',
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      width: 110,
      render: (value: number | null) => value ?? '—',
    },
    {
      title: 'Style / Color',
      dataIndex: 'styleColor',
      key: 'styleColor',
      render: (value: string | null) => value ?? '—',
    },
    {
      title: 'Stores',
      dataIndex: 'storeCount',
      key: 'storeCount',
      width: 90,
      align: 'right' as const,
    },
    {
      title: 'On Hand',
      dataIndex: 'totalOnHand',
      key: 'totalOnHand',
      width: 110,
      align: 'right' as const,
      render: (value: number) => <strong>{value}</strong>,
    },
  ]

  if (separateByStore) {
    columns.splice(5, 0,
      {
        title: 'Store #',
        dataIndex: 'storeNumber',
        key: 'storeNumber',
        width: 90,
      },
      {
        title: 'Store Name',
        dataIndex: 'storeName',
        key: 'storeName',
        render: (value: string | null) => value ?? '—',
      },
    )
  }

  return columns
}

function parseOptionalInt(value: string | null): number | null {
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null
}

function parseStoreNumbers(value: string | null): number[] | undefined {
  if (!value) return undefined
  const parsed = value
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isFinite(part))
    .map((part) => Math.trunc(part))
  return parsed.length ? parsed : undefined
}
