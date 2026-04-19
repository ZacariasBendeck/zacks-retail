import { Button, Card, Popconfirm, Space, Table, Tag, Typography, App } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { Link, useNavigate } from 'react-router-dom'
import { useMemo } from 'react'
import { useDeleteDepartment, useDepartments, useSectors } from '../../hooks/useProductsTaxonomy'
import type { Department, Sector } from '../../types/productsTaxonomy'

export default function DepartmentListPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const { data, isLoading } = useDepartments()
  const { data: sectors } = useSectors()
  const del = useDeleteDepartment()

  const sectorFor = useMemo(() => {
    return (deptNum: number): Sector | null => {
      if (!sectors) return null
      return (
        sectors.find((s) => s.begDept <= deptNum && s.endDept >= deptNum) ?? null
      )
    }
  }, [sectors])

  const columns = [
    { title: 'Number', dataIndex: 'number', key: 'number', sorter: (a: Department, b: Department) => a.number - b.number, width: 100 },
    { title: 'Description', dataIndex: 'description', key: 'description' },
    {
      title: 'Sector',
      key: 'sector',
      width: 180,
      render: (_: unknown, r: Department) => {
        const s = sectorFor(r.number)
        return s ? (
          <Space size={4}>
            <Tag color="purple">{s.number}</Tag>
            <span>{s.description}</span>
          </Space>
        ) : (
          <Typography.Text type="danger">— no sector range</Typography.Text>
        )
      },
    },
    { title: 'BegCateg', dataIndex: 'begCateg', key: 'begCateg', width: 110 },
    { title: 'EndCateg', dataIndex: 'endCateg', key: 'endCateg', width: 110 },
    {
      title: '',
      key: 'actions',
      width: 100,
      render: (_: unknown, record: Department) => (
        <Space size={0}>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => navigate(`/products/taxonomy/departments/${record.number}`)}
          />
          <Popconfirm
            title="Delete this department?"
            onConfirm={async () => {
              try {
                await del.mutateAsync(record.number)
                message.success('Deleted')
              } catch (e) {
                message.error((e as Error).message)
              }
            }}
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <Card
      title={<Typography.Text strong>Departments</Typography.Text>}
      extra={
        <Link to="/products/taxonomy/departments/new">
          <Button type="primary" icon={<PlusOutlined />}>New department</Button>
        </Link>
      }
    >
      <Table<Department>
        size="small"
        className="products-compact-table"
        rowKey="number"
        dataSource={data}
        columns={columns}
        loading={isLoading}
        pagination={{ defaultPageSize: 25, showSizeChanger: true, pageSizeOptions: [25, 50, 100, 200] }}
      />
    </Card>
  )
}
