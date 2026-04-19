import { useMemo, useState } from 'react'
import { Button, Checkbox, Popover, Space, Table, Typography } from 'antd'
import type { ColumnType, ColumnsType, TablePaginationConfig } from 'antd/es/table'
import type { FilterValue, SorterResult } from 'antd/es/table/interface'
import { AppstoreOutlined, FileExcelOutlined, FileTextOutlined } from '@ant-design/icons'

export interface ServerPagination {
  page: number
  pageSize: number
  totalItems: number
  totalPages?: number
}

export interface ServerQueryChange {
  page: number
  pageSize: number
  sort?: string
  order?: 'asc' | 'desc'
  filters?: Record<string, string[]>
}

export type ServerTableColumn<T> = ColumnType<T> & {
  exportValue?: (record: T) => string | number | null | undefined
}

interface ServerDataTableProps<T extends object> {
  title?: React.ReactNode
  data?: T[]
  columns: ServerTableColumn<T>[]
  rowKey: string | ((record: T) => string)
  loading?: boolean
  fetching?: boolean
  pagination?: ServerPagination
  onQueryChange?: (query: ServerQueryChange) => void
  expectedTotalRows?: number
  enableVirtualization?: boolean
  exportFileName?: string
  scrollX?: number
  tableSize?: 'small' | 'middle' | 'large'
}

function getColumnId<T extends object>(column: ServerTableColumn<T>): string {
  if (column.key != null) return String(column.key)
  if (Array.isArray(column.dataIndex)) return column.dataIndex.join('.')
  if (column.dataIndex != null) return String(column.dataIndex)
  return ''
}

function getCellValue<T extends object>(record: T, column: ServerTableColumn<T>): string {
  if (column.exportValue) {
    const value = column.exportValue(record)
    return value == null ? '' : String(value)
  }

  if (!column.dataIndex) return ''
  const path = Array.isArray(column.dataIndex) ? column.dataIndex : [column.dataIndex]
  let cursor: unknown = record
  for (const key of path) {
    if (cursor == null || typeof cursor !== 'object') return ''
    cursor = (cursor as Record<string, unknown>)[String(key)]
  }
  return cursor == null ? '' : String(cursor)
}

function toCsvCell(value: string): string {
  const escaped = value.replace(/"/g, '""')
  return `"${escaped}"`
}

export function normalizeServerFilters(
  filters: Record<string, FilterValue | null>,
): Record<string, string[]> {
  const parsedFilters: Record<string, string[]> = {}
  for (const [key, values] of Object.entries(filters)) {
    if (!values || values.length === 0) continue
    parsedFilters[key] = values.map((value) => String(value))
  }
  return parsedFilters
}

function downloadBlob(filename: string, mimeType: string, content: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function ServerDataTable<T extends object>({
  title,
  data = [],
  columns,
  rowKey,
  loading = false,
  fetching = false,
  pagination,
  onQueryChange,
  expectedTotalRows,
  enableVirtualization = true,
  exportFileName = 'table-export',
  scrollX = 1200,
  tableSize = 'small',
}: ServerDataTableProps<T>) {
  const usableColumns = useMemo(
    () => columns.filter((column) => column.title != null && getColumnId(column)),
    [columns],
  )

  const [visibleColumnKeys, setVisibleColumnKeys] = useState<string[]>(
    () => usableColumns.map((column) => getColumnId(column)),
  )

  const activeColumns = useMemo(() => {
    const visible = new Set(visibleColumnKeys)
    return columns.filter((column) => {
      const id = getColumnId(column)
      if (!id) return true
      return visible.has(id)
    }) as ColumnsType<T>
  }, [columns, visibleColumnKeys])

  const totalRows = expectedTotalRows ?? pagination?.totalItems ?? data.length
  const effectivePageSize = pagination?.pageSize ?? data.length
  const shouldVirtualize = enableVirtualization && (totalRows > 1000 || effectivePageSize > 100)

  const handleExportCsv = () => {
    if (!data.length) return
    const exportedColumns = usableColumns.filter((column) =>
      visibleColumnKeys.includes(getColumnId(column)),
    )
    const header = exportedColumns.map((column) => toCsvCell(String(column.title ?? '')))
    const rows = data.map((record) =>
      exportedColumns.map((column) => toCsvCell(getCellValue(record, column))),
    )
    const csv = [header, ...rows].map((row) => row.join(',')).join('\n')
    downloadBlob(`${exportFileName}.csv`, 'text/csv;charset=utf-8', csv)
  }

  const handleExportExcel = () => {
    if (!data.length) return
    const exportedColumns = usableColumns.filter((column) =>
      visibleColumnKeys.includes(getColumnId(column)),
    )
    const header = exportedColumns.map((column) => String(column.title ?? '')).join('\t')
    const rows = data
      .map((record) => exportedColumns.map((column) => getCellValue(record, column)).join('\t'))
      .join('\n')
    const content = `${header}\n${rows}`
    downloadBlob(`${exportFileName}.xls`, 'application/vnd.ms-excel;charset=utf-8', content)
  }

  const handleTableChange = (
    nextPagination: TablePaginationConfig,
    filters: Record<string, FilterValue | null>,
    sorter: SorterResult<T> | SorterResult<T>[],
  ) => {
    if (!onQueryChange) return
    const activeSorter = Array.isArray(sorter) ? sorter[0] : sorter

    onQueryChange({
      page: nextPagination.current ?? pagination?.page ?? 1,
      pageSize: nextPagination.pageSize ?? pagination?.pageSize ?? 25,
      sort: activeSorter?.field ? String(activeSorter.field) : undefined,
      order:
        activeSorter?.order === 'descend'
          ? 'desc'
          : activeSorter?.order === 'ascend'
            ? 'asc'
            : undefined,
      filters: normalizeServerFilters(filters),
    })
  }

  return (
    <Space direction="vertical" size="small" style={{ width: '100%' }}>
      <Space
        align="center"
        style={{ width: '100%', justifyContent: 'space-between', flexWrap: 'wrap' }}
      >
        <Space>
          {title}
          {pagination && (
            <Typography.Text type="secondary">
              ({pagination.totalItems.toLocaleString()} rows)
            </Typography.Text>
          )}
        </Space>
        <Space>
          <Popover
            trigger="click"
            placement="bottomRight"
            content={
              <Checkbox.Group
                value={visibleColumnKeys}
                onChange={(next) => setVisibleColumnKeys(next as string[])}
                style={{ display: 'grid', gap: 6, maxHeight: 280, overflow: 'auto' }}
              >
                {usableColumns.map((column) => {
                  const columnId = getColumnId(column)
                  return (
                    <Checkbox key={columnId} value={columnId}>
                      {String(column.title)}
                    </Checkbox>
                  )
                })}
              </Checkbox.Group>
            }
          >
            <Button icon={<AppstoreOutlined />}>Columns</Button>
          </Popover>
          <Button
            icon={<FileTextOutlined />}
            onClick={handleExportCsv}
            disabled={data.length === 0}
          >
            CSV
          </Button>
          <Button
            icon={<FileExcelOutlined />}
            onClick={handleExportExcel}
            disabled={data.length === 0}
          >
            Excel
          </Button>
        </Space>
      </Space>

      <Table<T>
        dataSource={data}
        columns={activeColumns}
        rowKey={rowKey}
        loading={loading}
        size={tableSize}
        virtual={shouldVirtualize}
        scroll={{ x: scrollX, y: shouldVirtualize ? 560 : undefined }}
        onChange={handleTableChange}
        pagination={
          pagination
            ? {
                current: pagination.page,
                pageSize: pagination.pageSize,
                total: pagination.totalItems,
                showSizeChanger: true,
                pageSizeOptions: ['25', '50', '100', '200'],
                showTotal: (total, range) => `${range[0]}-${range[1]} of ${total}`,
                size: 'default',
              }
            : false
        }
        style={{ opacity: fetching && !loading ? 0.6 : 1 }}
      />
    </Space>
  )
}
