import { Button, Space, Tag, Typography } from 'antd'
import { ArrowLeftOutlined, SaveOutlined, PlusOutlined, ThunderboltOutlined, StepForwardOutlined } from '@ant-design/icons'
import { tokens } from './styles'
import type { SkuLifecycleRow } from '../../../types/skuLifecycle'
import type { Sku } from '../../../types/sku'
import { SkuLink } from '../../../components/sku-link/SkuLink'

interface PageHeaderProps {
  isEdit: boolean
  skuState: 'DRAFT' | 'ACTIVE' | 'DISCONTINUED' | null
  lifecycleSku: SkuLifecycleRow | undefined
  matchedSku: Sku | null
  isSaving: boolean
  isFinalizing: boolean
  onCancel: () => void
  onSave: () => void
  onSaveAndNext: () => void
  onSaveAndNew: () => void
  onResetToCreate: () => void
  canSaveAndNext: boolean
}

export function PageHeader({
  isEdit,
  skuState,
  lifecycleSku,
  matchedSku,
  isSaving,
  isFinalizing,
  onCancel,
  onSave,
  onSaveAndNext,
  onSaveAndNew,
  onResetToCreate,
  canSaveAndNext,
}: PageHeaderProps) {
  const isDraft = skuState === 'DRAFT'
  const isActive = skuState === 'ACTIVE'
  const isDiscontinued = skuState === 'DISCONTINUED'
  const currentSkuCode = lifecycleSku?.code ?? lifecycleSku?.provisionalCode ?? null

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
      }}
    >
      <Space size={12} align="center">
        <Button icon={<ArrowLeftOutlined />} onClick={onCancel} type="text">
          Volver
        </Button>
        <Typography.Title level={2} style={{ margin: 0, fontSize: tokens.title.page, fontWeight: 600 }}>
          {isEdit ? 'Editar SKU' : 'Nuevo SKU'}
        </Typography.Title>
        {isDraft && (
          <Tag color="gold" style={{ fontWeight: 700, letterSpacing: 0.5 }}>
            BORRADOR
          </Tag>
        )}
        {isActive && <Tag color="green">ACTIVO</Tag>}
        {isDiscontinued && <Tag color="red">DISCONTINUADO</Tag>}
        {currentSkuCode && (
          <Tag color="blue" style={{ fontFamily: 'monospace', cursor: 'pointer' }}>
            <SkuLink
              skuCode={currentSkuCode}
              title="Open Inventory Inquiry"
              style={{ color: 'inherit', textDecoration: 'none' }}
            >
              {currentSkuCode}
            </SkuLink>
          </Tag>
        )}
        {!isEdit && matchedSku && (
          <>
            <Tag color="orange">Existente: {matchedSku.skuCode}</Tag>
            <Button size="small" type="link" onClick={onResetToCreate}>
              Crear nuevo
            </Button>
          </>
        )}
      </Space>

      <Space size={8} wrap>
        <Button onClick={onCancel}>Cancelar</Button>
        <Button
          icon={<StepForwardOutlined />}
          onClick={onSaveAndNext}
          loading={isSaving && !isFinalizing}
          disabled={isDiscontinued || !canSaveAndNext}
        >
          Save &amp; Next SKU
        </Button>
        <Button
          icon={<PlusOutlined />}
          onClick={onSaveAndNew}
          loading={isSaving && !isFinalizing}
          disabled={isDiscontinued}
        >
          Save &amp; Create Another
        </Button>
        <Button
          type="primary"
          icon={isFinalizing ? <ThunderboltOutlined /> : <SaveOutlined />}
          onClick={onSave}
          loading={isSaving}
          disabled={isDiscontinued}
        >
          Save SKU
        </Button>
      </Space>
    </div>
  )
}
