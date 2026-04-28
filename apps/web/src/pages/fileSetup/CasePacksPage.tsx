import { useEffect, useMemo, useState } from 'react'
import { Card, Col, Empty, Input, Row, Space, Statistic, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Link } from 'react-router-dom'
import { useCasePack, useCasePacks } from '../../hooks/useCasePacks'
import type { CasePackCell, CasePackSummary } from '../../services/casePackApi'

function formatDate(value: string | null): string {
  if (!value) return '-'
  return new Date(value).toLocaleDateString()
}

export default function CasePacksPage() {
  const { data: casePacks = [], isLoading } = useCasePacks()
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const [searchText, setSearchText] = useState('')
  const { data: selectedCasePack, isLoading: isDetailLoading } = useCasePack(selectedCode)

  useEffect(() => {
    if (casePacks.length === 0) {
      setSelectedCode(null)
      return
    }
    if (!selectedCode || !casePacks.some((casePack) => casePack.code === selectedCode)) {
      setSelectedCode(casePacks[0]?.code ?? null)
    }
  }, [casePacks, selectedCode])

  const filteredCasePacks = useMemo(() => {
    const needle = searchText.trim().toLowerCase()
    if (!needle) return casePacks
    return casePacks.filter((casePack) =>
      [casePack.code, casePack.description ?? '', String(casePack.sizeTypeCode)]
        .some((value) => value.toLowerCase().includes(needle)),
    )
  }, [casePacks, searchText])

  const columns: ColumnsType<CasePackSummary> = [
    {
      title: 'Code',
      dataIndex: 'code',
      width: 110,
      sorter: (a, b) => a.code.localeCompare(b.code),
      render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
    },
    {
      title: 'Description',
      dataIndex: 'description',
      sorter: (a, b) => (a.description ?? '').localeCompare(b.description ?? ''),
      render: (value: string | null) => value || '-',
    },
    {
      title: 'Size Type',
      dataIndex: 'sizeTypeCode',
      width: 110,
      align: 'right',
      sorter: (a, b) => a.sizeTypeCode - b.sizeTypeCode,
    },
    {
      title: 'Units',
      dataIndex: 'totalUnits',
      width: 90,
      align: 'right',
      sorter: (a, b) => a.totalUnits - b.totalUnits,
    },
    {
      title: 'Cells',
      dataIndex: 'cellCount',
      width: 90,
      align: 'right',
      sorter: (a, b) => a.cellCount - b.cellCount,
    },
    {
      title: 'Status',
      dataIndex: 'active',
      width: 110,
      filters: [
        { text: 'Active', value: true },
        { text: 'Inactive', value: false },
      ],
      onFilter: (value, record) => record.active === value,
      render: (value: boolean) => value ? <Tag color="blue">Active</Tag> : <Tag>Inactive</Tag>,
    },
    {
      title: 'Last Changed',
      dataIndex: 'dateLastChanged',
      width: 130,
      sorter: (a, b) => (a.dateLastChanged ?? '').localeCompare(b.dateLastChanged ?? ''),
      render: formatDate,
    },
  ]

  const cellColumns: ColumnsType<CasePackCell> = [
    {
      title: 'Row',
      dataIndex: 'rowLabel',
      width: 120,
      render: (value: string) => value || '-',
    },
    {
      title: 'Column',
      dataIndex: 'columnLabel',
    },
    {
      title: 'Quantity',
      dataIndex: 'quantity',
      align: 'right',
      width: 120,
    },
  ]

  return (
    <div>
      <Typography.Title level={3}>Case Packs</Typography.Title>
      <Typography.Paragraph type="secondary">
        Read-only RICS case pack definitions imported into Postgres. Size labels are managed from{' '}
        <Link to="/products/taxonomy/size-types">Size Types</Link>.
      </Typography.Paragraph>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={15}>
          <Card
            title="Case Pack List"
            extra={
              <Input.Search
                allowClear
                placeholder="Search code, description, or size type"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                style={{ width: 300 }}
              />
            }
          >
            <Table<CasePackSummary>
              rowKey="code"
              columns={columns}
              dataSource={filteredCasePacks}
              loading={isLoading}
              size="small"
              pagination={{ pageSize: 25, showSizeChanger: true }}
              locale={{ emptyText: 'No case packs found.' }}
              rowSelection={{
                type: 'radio',
                selectedRowKeys: selectedCode ? [selectedCode] : [],
                onChange: (selectedRowKeys) => setSelectedCode(String(selectedRowKeys[0])),
              }}
              onRow={(record) => ({
                onClick: () => setSelectedCode(record.code),
                style: { cursor: 'pointer' },
              })}
            />
          </Card>
        </Col>

        <Col xs={24} xl={9}>
          <Card title="Case Pack Detail" loading={isDetailLoading}>
            {!selectedCasePack ? (
              <Empty description="Select a case pack to see its cells." />
            ) : (
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <div>
                  <Typography.Text type="secondary">Code</Typography.Text>
                  <div>
                    <Typography.Text code>{selectedCasePack.code}</Typography.Text>
                  </div>
                </div>
                <div>
                  <Typography.Text type="secondary">Description</Typography.Text>
                  <div>{selectedCasePack.description || '-'}</div>
                </div>
                <Row gutter={12}>
                  <Col span={8}>
                    <Statistic title="Size Type" value={selectedCasePack.sizeTypeCode} />
                  </Col>
                  <Col span={8}>
                    <Statistic title="Units" value={selectedCasePack.totalUnits} />
                  </Col>
                  <Col span={8}>
                    <Statistic title="Cells" value={selectedCasePack.cellCount} />
                  </Col>
                </Row>
                <Table<CasePackCell>
                  rowKey={(record) => `${record.rowLabel}:${record.columnLabel}`}
                  columns={cellColumns}
                  dataSource={selectedCasePack.cells}
                  size="small"
                  pagination={false}
                  locale={{ emptyText: 'No cells defined.' }}
                />
              </Space>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  )
}
