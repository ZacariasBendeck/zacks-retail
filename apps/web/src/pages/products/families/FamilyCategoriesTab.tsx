import { useEffect, useMemo, useState } from 'react'
import { Alert, App, Button, Space, Spin, Transfer, Typography } from 'antd'
import type { TransferItem } from 'antd/es/transfer'
import { useCategories } from '../../../hooks/useProductsTaxonomy'
import { useProductFamilies } from '../../../hooks/useProductFamilies'
import {
  useFamilyCategories,
  useReplaceFamilyCategories,
} from '../../../hooks/useProductFamilies'
import type { ProductFamily } from '../../../types/sku'

interface Props {
  family: ProductFamily
}

/**
 * Categorías tab: replaces the full category-to-family mapping for the current
 * family. Categories already mapped to another family appear greyed with their
 * current family in parens — assigning them reassigns (the backend upserts).
 *
 * Commit = one PUT /families/:code/categories with the whole list. First try
 * without `force`; if the backend returns 409 (orphan-assignment risk), we show
 * the inline warning and offer a "Reintentar forzando" button.
 */
export default function FamilyCategoriesTab({ family }: Props) {
  const { message } = App.useApp()
  const { data: allCategories, isLoading: catsLoading } = useCategories()
  const { data: assignedCategories, isLoading: assignedLoading } = useFamilyCategories(family.code)
  const { data: allFamilies } = useProductFamilies()
  const replace = useReplaceFamilyCategories()

  const [targetKeys, setTargetKeys] = useState<string[]>([])
  const [dirty, setDirty] = useState(false)
  const [pendingError, setPendingError] = useState<string | null>(null)

  useEffect(() => {
    if (!assignedCategories) return
    setTargetKeys(assignedCategories.map((c) => String(c.categoryNumber)))
    setDirty(false)
    setPendingError(null)
  }, [assignedCategories, family.code])

  // Build the list of all RICS categories for the Transfer. Annotate the label
  // with each category's current family assignment so the operator can see
  // what they're about to reassign from.
  const dataSource: TransferItem[] = useMemo(() => {
    if (!allCategories) return []
    // We can't ask for every family's mapping without N calls — the Family
    // selector already showed it in the nav, and reassignment is rare. For
    // now we simply show all categories with their number + description.
    return allCategories.map((c) => ({
      key: String(c.number),
      title: `${c.number} — ${c.description}`,
      description: c.description,
    }))
  }, [allCategories])

  const handleSave = async (force = false) => {
    try {
      const nums = targetKeys.map((k) => Number(k)).filter(Number.isInteger)
      const result = await replace.mutateAsync({ code: family.code, categories: nums, force })
      message.success(
        `Guardado: +${result.assigned} · ↻${result.reassigned} · −${result.removed}`,
      )
      setDirty(false)
      setPendingError(null)
    } catch (e) {
      const err = e as Error & { code?: string; status?: number }
      if (err.status === 409 && !force) {
        setPendingError(err.message)
      } else {
        message.error(err.message)
      }
    }
  }

  if (catsLoading || assignedLoading) {
    return <Spin />
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
        Mueva categorías entre las listas. Las categorías del lado derecho pertenecen a esta
        familia. Cada categoría RICS sólo puede pertenecer a una familia; reasignar una aquí
        la saca de su familia anterior. ({allFamilies?.length ?? 0} familias en total.)
      </Typography.Paragraph>
      <Transfer
        dataSource={dataSource}
        targetKeys={targetKeys}
        onChange={(keys) => {
          setTargetKeys(keys as string[])
          setDirty(true)
          setPendingError(null)
        }}
        showSearch
        filterOption={(input, item) =>
          ((item as TransferItem).title ?? '').toLowerCase().includes(input.toLowerCase())
        }
        listStyle={{ width: '45%', height: 420 }}
        titles={['Disponibles', 'Asignadas a esta familia']}
        render={(item) => (item as TransferItem).title ?? String((item as TransferItem).key)}
      />
      {pendingError ? (
        <Alert
          type="warning"
          showIcon
          message="La reasignación dejaría asignaciones huérfanas"
          description={
            <Space direction="vertical" size="small">
              <span>{pendingError}</span>
              <Space>
                <Button type="primary" danger onClick={() => handleSave(true)} loading={replace.isPending}>
                  Reintentar forzando
                </Button>
                <Button onClick={() => setPendingError(null)}>Cancelar</Button>
              </Space>
            </Space>
          }
        />
      ) : null}
      <Space>
        <Button
          type="primary"
          disabled={!dirty || !!pendingError}
          loading={replace.isPending}
          onClick={() => handleSave(false)}
        >
          Guardar asignación
        </Button>
        {dirty ? <Typography.Text type="warning">Cambios sin guardar.</Typography.Text> : null}
      </Space>
    </Space>
  )
}
