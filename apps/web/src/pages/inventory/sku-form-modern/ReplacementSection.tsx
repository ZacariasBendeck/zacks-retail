import { useEffect, useMemo, useState } from 'react'
import { App, Alert, Button, Input, Select, Space, Switch, Tag, Typography } from 'antd'
import { DeleteOutlined, LinkOutlined, SearchOutlined, SaveOutlined } from '@ant-design/icons'
import type { SkuLifecycleRow, SkuReplacementType } from '../../../types/skuLifecycle'
import {
  useRetireSkuReplacement,
  useSaveSkuReplacement,
  useSkuReplacement,
} from '../../../hooks/useSkuDrafts'
import { SkuLookup } from '../../../components/sku-lookup'
import { sectionCard, sectionSubtitle, sectionTitle, tokens } from './styles'

interface ReplacementSectionProps {
  sku: SkuLifecycleRow | undefined
}

const REPLACEMENT_TYPE_OPTIONS: Array<{ value: SkuReplacementType; label: string }> = [
  { value: 'EXACT', label: 'Exact replacement' },
  { value: 'SIMILAR', label: 'Similar substitute' },
  { value: 'VENDOR_SUBSTITUTE', label: 'Vendor substitute' },
]

export function ReplacementSection({ sku }: ReplacementSectionProps) {
  const { message } = App.useApp()
  const [lookupOpen, setLookupOpen] = useState(false)
  const [picked, setPicked] = useState<{ skuCode: string; skuId: string } | null>(null)
  const [replacementType, setReplacementType] = useState<SkuReplacementType>('EXACT')
  const [transferDemand, setTransferDemand] = useState(true)
  const [note, setNote] = useState('')
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const skuId = sku?.id
  const { data: replacement, isLoading } = useSkuReplacement(skuId)
  const saveMutation = useSaveSkuReplacement()
  const retireMutation = useRetireSkuReplacement()
  const skuCode = sku?.code ?? sku?.provisionalCode ?? null
  const isDraft = sku?.skuState === 'DRAFT'
  const selected = useMemo(
    () => picked ?? (replacement
      ? { skuCode: replacement.replacementSkuCode, skuId: replacement.replacementSkuId }
      : null),
    [picked, replacement],
  )

  useEffect(() => {
    if (!replacement) {
      setPicked(null)
      setReplacementType('EXACT')
      setTransferDemand(true)
      setNote('')
      return
    }
    setPicked(null)
    setReplacementType(replacement.replacementType)
    setTransferDemand(replacement.transferDemand)
    setNote(replacement.note ?? '')
  }, [replacement?.id])

  useEffect(() => {
    setSaveStatus(null)
  }, [sku?.id])

  if (!sku) return null

  const handleSave = async () => {
    if (!selected) {
      message.warning('Select the replacement SKU first.')
      setSaveStatus({ type: 'error', message: 'Select the replacement SKU first.' })
      return
    }
    try {
      await saveMutation.mutateAsync({
        id: sku.id,
        input: {
          replacementSkuId: selected.skuId,
          replacementType,
          transferDemand,
          note,
        },
      })
      const successMessage = `Replacement saved: ${skuCode ?? 'SKU'} -> ${selected.skuCode}`
      setSaveStatus({ type: 'success', message: successMessage })
      message.success(successMessage)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save replacement.'
      setSaveStatus({ type: 'error', message: errorMessage })
      message.error(errorMessage)
    }
  }

  const handleRetire = async () => {
    try {
      await retireMutation.mutateAsync(sku.id)
      setSaveStatus({ type: 'success', message: 'Replacement link retired.' })
      message.success('Replacement link retired.')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to retire replacement link.'
      setSaveStatus({ type: 'error', message: errorMessage })
      message.error(errorMessage)
    }
  }

  return (
    <div style={sectionCard}>
      <div style={{ marginBottom: tokens.card.headerMarginBottom }}>
        <Typography.Text style={sectionTitle}>Replacement SKU</Typography.Text>
        <div style={sectionSubtitle}>
          Link an old SKU to the active SKU buyers should reorder.
        </div>
      </div>

      {isDraft ? (
        <Alert
          type="info"
          showIcon
          message="Finalize this SKU before marking it as replaced."
        />
      ) : (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {replacement ? (
            <Alert
              type="warning"
              showIcon
              message={`Current replacement: ${replacement.replacementSkuCode}`}
              description="Saving this section keeps the old SKU discontinued and updates the active replacement link."
            />
          ) : null}

          {saveStatus ? (
            <Alert
              type={saveStatus.type}
              showIcon
              message={saveStatus.message}
            />
          ) : null}

          <Space wrap align="center">
            <Button icon={<SearchOutlined />} onClick={() => setLookupOpen(true)} loading={isLoading}>
              Select replacement
            </Button>
            {selected ? (
              <Tag color="blue" icon={<LinkOutlined />} style={{ fontFamily: 'monospace' }}>
                {selected.skuCode}
              </Tag>
            ) : (
              <Typography.Text type="secondary">No replacement selected</Typography.Text>
            )}
          </Space>

          <Space wrap align="center">
            <Select
              value={replacementType}
              options={REPLACEMENT_TYPE_OPTIONS}
              onChange={setReplacementType}
              style={{ width: 220 }}
            />
            <Space size={8}>
              <Switch checked={transferDemand} onChange={setTransferDemand} />
              <Typography.Text>Use old sales for reorder planning</Typography.Text>
            </Space>
          </Space>

          <Input.TextArea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Reason, vendor note, or replacement context"
          />

          <Space>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSave}
              loading={saveMutation.isPending}
              disabled={!selected}
            >
              Save replacement
            </Button>
            {replacement ? (
              <Button
                danger
                icon={<DeleteOutlined />}
                onClick={handleRetire}
                loading={retireMutation.isPending}
              >
                Retire link
              </Button>
            ) : null}
          </Space>
        </Space>
      )}

      {lookupOpen && (
        <SkuLookup
          open={lookupOpen}
          onClose={() => setLookupOpen(false)}
          onSelect={(next) => {
            setPicked(next)
            setLookupOpen(false)
          }}
          initialQuery={selected?.skuCode ?? ''}
          helperTextOverride="Choose the active SKU that replaces this one."
        />
      )}
    </div>
  )
}
