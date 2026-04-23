import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Input, Modal, Space, Table, Typography } from 'antd'
import type { InputRef } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useVendors } from '../../hooks/useProductsVendors'

/**
 * Lookup modal for the 4-letter RICS vendor codes. Mirrors the RICS desktop
 * "Vendor Lookup" dialog shown to operators: two columns (Code / Name),
 * a Quick-Search field, keyboard navigation, and a Select / Cancel pair.
 *
 * Data comes from the Postgres-backed `useVendors()` hook (same source the
 * main SKU form uses). All filtering is client-side — the vendor list is
 * short enough (~hundreds) that shipping it once and filtering in-memory is
 * both faster and simpler than round-tripping to the server on each keystroke.
 */
export interface VendorLookupPicked {
  code: string
  name: string
}

export interface VendorLookupProps {
  open: boolean
  onClose: () => void
  onSelect: (picked: VendorLookupPicked) => void
  /** Pre-populate the Quick Search box — typically the current form value so
   *  the operator doesn't have to re-type what they already entered. */
  initialQuery?: string
}

type VendorRow = { code: string; name: string }

export const VendorLookup: React.FC<VendorLookupProps> = ({
  open,
  onClose,
  onSelect,
  initialQuery = '',
}) => {
  const { data: vendors, isLoading } = useVendors()
  const [q, setQ] = useState(initialQuery)
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const inputRef = useRef<InputRef>(null)

  // Autofocus Quick Search + reset selection every time the modal opens, so
  // the operator can start typing immediately. `initialQuery` seeds the
  // search so they don't retype what they already had in the form field.
  useEffect(() => {
    if (open) {
      setQ(initialQuery)
      setSelectedCode(null)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open, initialQuery])

  const filtered = useMemo<VendorRow[]>(() => {
    const all: VendorRow[] = (vendors ?? []).map((v) => ({ code: v.code, name: v.name }))
    const needle = q.trim().toLowerCase()
    if (!needle) return all
    return all.filter(
      (v) => v.code.toLowerCase().includes(needle) || v.name.toLowerCase().includes(needle),
    )
  }, [vendors, q])

  const columns: ColumnsType<VendorRow> = [
    {
      title: 'Code',
      dataIndex: 'code',
      key: 'code',
      width: 100,
      sorter: (a, b) => a.code.localeCompare(b.code),
      defaultSortOrder: 'ascend',
      render: (c: string) => <Typography.Text strong style={{ fontFamily: 'monospace' }}>{c}</Typography.Text>,
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      sorter: (a, b) => a.name.localeCompare(b.name),
    },
  ]

  const confirmSelection = (row: VendorRow) => {
    onSelect({ code: row.code, name: row.name })
    onClose()
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="Vendor Lookup"
      width={640}
      destroyOnClose
      footer={
        <Space>
          <Button
            type="primary"
            disabled={!selectedCode}
            onClick={() => {
              const row = filtered.find((r) => r.code === selectedCode)
              if (row) confirmSelection(row)
            }}
          >
            Select
          </Button>
          <Button onClick={onClose}>Cancel</Button>
        </Space>
      }
    >
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        <Input
          ref={inputRef}
          placeholder="Quick Search (code or name)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onPressEnter={() => {
            // Enter: pick the first result if it's a unique match.
            if (filtered.length === 1) confirmSelection(filtered[0]!)
            else if (selectedCode) {
              const row = filtered.find((r) => r.code === selectedCode)
              if (row) confirmSelection(row)
            }
          }}
          allowClear
        />
        <Table<VendorRow>
          size="small"
          rowKey="code"
          columns={columns}
          dataSource={filtered}
          loading={isLoading}
          pagination={{ pageSize: 15, showSizeChanger: false, size: 'small' }}
          rowSelection={{
            type: 'radio',
            selectedRowKeys: selectedCode ? [selectedCode] : [],
            onChange: (keys) => setSelectedCode((keys[0] as string | undefined) ?? null),
          }}
          onRow={(record) => ({
            onClick: () => setSelectedCode(record.code),
            onDoubleClick: () => confirmSelection(record),
            style: { cursor: 'pointer' },
          })}
        />
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
          Enter para seleccionar · Doble click para seleccionar directo · Esc para cerrar
        </Typography.Text>
      </Space>
    </Modal>
  )
}
