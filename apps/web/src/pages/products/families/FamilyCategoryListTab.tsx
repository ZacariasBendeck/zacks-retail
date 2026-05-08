import { useMemo, useState } from 'react'
import { Alert, Empty, Input, Space, Spin, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useFamilyCategories } from '../../../hooks/useProductFamilies'
import type { FamilyCategory } from '../../../services/productFamiliesApi'
import type { ProductFamily } from '../../../types/sku'

interface Props {
  family: ProductFamily
}

function normalize(value: string | number | null | undefined): string {
  return String(value ?? '').trim().toLowerCase()
}

function matchesSearch(category: FamilyCategory, query: string): boolean {
  if (!query) return true
  return [
    category.categoryNumber,
    category.categoryDesc,
    category.departmentNumber,
    category.departmentDesc,
  ].some((value) => normalize(value).includes(query))
}

export default function FamilyCategoryListTab({ family }: Props) {
  const [search, setSearch] = useState('')
  const { data, error, isLoading } = useFamilyCategories(family.code)

  const query = normalize(search)
  const rows = useMemo(
    () =>
      (data ?? [])
        .slice()
        .sort(
          (a, b) =>
            (a.departmentNumber ?? Number.MAX_SAFE_INTEGER) -
              (b.departmentNumber ?? Number.MAX_SAFE_INTEGER) ||
            a.categoryNumber - b.categoryNumber,
        )
        .filter((category) => matchesSearch(category, query)),
    [data, query],
  )

  const columns: ColumnsType<FamilyCategory> = [
    {
      title: 'Categoria',
      key: 'category',
      render: (_value, row) => (
        <Space size={6} wrap>
          <Tag>{row.categoryNumber}</Tag>
          <Typography.Text>{row.categoryDesc}</Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Departamento',
      key: 'department',
      width: 300,
      render: (_value, row) =>
        row.departmentNumber == null ? (
          <Typography.Text type="secondary">Sin departamento</Typography.Text>
        ) : (
          <Space size={6} wrap>
            <Tag>{row.departmentNumber}</Tag>
            <Typography.Text>{row.departmentDesc ?? 'Departamento'}</Typography.Text>
          </Space>
        ),
    },
  ]

  if (isLoading) return <Spin />

  if (error) {
    return (
      <Alert
        type="error"
        message="Error al cargar categorias"
        description={(error as Error).message}
      />
    )
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Input.Search
        allowClear
        placeholder="Buscar por categoria o departamento"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        style={{ maxWidth: 360 }}
      />
      <Table<FamilyCategory>
        size="small"
        rowKey="categoryNumber"
        columns={columns}
        dataSource={rows}
        locale={{
          emptyText:
            data && data.length > 0 ? (
              <Empty description="No hay categorias que coincidan" />
            ) : (
              <Empty description="Esta familia no tiene categorias asignadas" />
            ),
        }}
        pagination={{ pageSize: 25, hideOnSinglePage: true }}
      />
    </Space>
  )
}
