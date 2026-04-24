import React, { useCallback, useMemo } from 'react'
import { Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useVendors } from '../../hooks/useProductsVendors'
import { LookupModal } from '../lookup-modal/LookupModal'

/**
 * Lookup modal for the 4-letter RICS vendor codes. Thin wrapper around the
 * shared LookupModal — the vendor list is short (~hundreds) so the search
 * runs entirely client-side.
 */
export interface VendorLookupPicked {
  code: string
  name: string
}

export interface VendorLookupProps {
  open: boolean
  onClose: () => void
  onSelect: (picked: VendorLookupPicked) => void
  initialQuery?: string
}

type VendorRow = { code: string; name: string }

export const VendorLookup: React.FC<VendorLookupProps> = ({
  open,
  onClose,
  onSelect,
  initialQuery = '',
}) => {
  const { data: vendors } = useVendors()

  // Stable view of the vendor list so searchFn's identity only changes when
  // the fetched list changes.
  const all = useMemo<VendorRow[]>(
    () => (vendors ?? []).map((v) => ({ code: v.code, name: v.name })),
    [vendors],
  )

  // Adapt client-side filter to the async searchFn contract. Matches on
  // substring of either code or name (not prefix-only) — vendor codes are
  // short enough that operators expect substring behaviour here.
  const searchFn = useCallback(
    async ({ query, page, pageSize }: { query: string; page: number; pageSize: number }) => {
      const needle = query.trim().toLowerCase()
      const filtered = needle
        ? all.filter(
            (v) =>
              v.code.toLowerCase().includes(needle) ||
              v.name.toLowerCase().includes(needle),
          )
        : all
      const start = (page - 1) * pageSize
      return { rows: filtered.slice(start, start + pageSize), total: filtered.length }
    },
    [all],
  )

  const columns: ColumnsType<VendorRow> = useMemo(() => [
    {
      title: 'Code',
      dataIndex: 'code',
      key: 'code',
      width: 100,
      sorter: (a, b) => a.code.localeCompare(b.code),
      defaultSortOrder: 'ascend',
      render: (c: string) => (
        <Typography.Text strong style={{ fontFamily: 'monospace' }}>{c}</Typography.Text>
      ),
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      sorter: (a, b) => a.name.localeCompare(b.name),
    },
  ], [])

  return (
    <LookupModal<VendorRow>
      open={open}
      onClose={onClose}
      onSelect={(row) => onSelect({ code: row.code, name: row.name })}
      title="Vendor Lookup"
      searchFn={searchFn}
      columns={columns}
      rowKey="code"
      width={640}
      pageSize={15}
      placeholder="Quick Search (code or name)"
      initialQuery={initialQuery}
      saveLabel="Select"
      helperText="Enter para seleccionar · Doble click para seleccionar directo · Esc para cerrar"
    />
  )
}
