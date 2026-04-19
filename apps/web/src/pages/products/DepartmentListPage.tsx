import { Button, Card, Popconfirm, Space, Table, Typography, App } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { Link, useNavigate } from 'react-router-dom'
import { useDeleteDepartment, useDepartments } from '../../hooks/useProductsTaxonomy'
import type { Department } from '../../types/productsTaxonomy'

export default function DepartmentListPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const { data, isLoading } = useDepartments()
  const del = useDeleteDepartment()

  const columns = [
    { title: 'Number', dataIndex: 'number', key: 'number', sorter: (a: Department, b: Department) => a.number - b.number, width: 100 },
    { title: 'Description', dataIndex: 'description', key: 'description' },
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
        rowKey="number"
        dataSource={data}
        columns={columns}
        loading={isLoading}
        pagination={{ pageSize: 50, showSizeChanger: true }}
      />
    </Card>
  )
}
