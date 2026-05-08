import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  App,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Space,
  Switch,
  Table,
  Typography,
} from 'antd'
import { useProductFamilies } from '../../../hooks/useProductFamilies'
import {
  useReplaceDimensionFamilyRules,
  useUpdateDimension,
} from '../../../hooks/useProductsAttributes'
import type { AttributeDimension, AttributeFamilyRule } from '../../../types/productsAttributes'

interface Props {
  dimension: AttributeDimension
}

interface RuleRow {
  familyCode: string
  labelEs: string
  sortOrder: number
  enabled: boolean
  isRequired: boolean
}

/**
 * The Reglas tab — multi-family rule editor + dimension metadata editor.
 *
 * Top: "Universal" toggle. Universal = the dimension applies to every family
 * and carries zero rule rows. Flipping off materialises one row per family all
 * set to `enabled=false`, `isRequired=false` so the operator opts in per-row.
 * Flipping back on deletes every rule row (confirm first — destructive).
 *
 * Bottom: labelEs / descriptionEs / multi-value / sortOrder form.
 */
export default function RulesTab({ dimension }: Props) {
  const { message } = App.useApp()
  const { data: families } = useProductFamilies()
  const replace = useReplaceDimensionFamilyRules()
  const updateDim = useUpdateDimension()

  const [localRules, setLocalRules] = useState<RuleRow[]>([])
  const [universalToggleLocal, setUniversalToggleLocal] = useState<boolean>(
    dimension.familyRules.length === 0,
  )
  const [dirty, setDirty] = useState(false)

  // Hydrate from props when the selected dimension changes.
  useEffect(() => {
    if (!families) return
    const existingByCode = new Map(dimension.familyRules.map((r) => [r.familyCode, r]))
    const rows: RuleRow[] = families.map((f) => {
      const existing = existingByCode.get(f.code)
      return {
        familyCode: f.code,
        labelEs: f.labelEs,
        sortOrder: existing?.sortOrder ?? f.sortOrder,
        enabled: existing?.enabled ?? false,
        isRequired: existing?.isRequired ?? false,
      }
    })
    setLocalRules(rows)
    setUniversalToggleLocal(dimension.familyRules.length === 0)
    setDirty(false)
  }, [dimension, families])

  const anyEnabled = useMemo(() => localRules.some((r) => r.enabled), [localRules])

  const handleSave = async () => {
    try {
      if (universalToggleLocal) {
        await replace.mutateAsync({
          dimensionCode: dimension.code,
          input: { universal: true },
        })
      } else {
        const rules: AttributeFamilyRule[] = localRules
          .filter((r) => r.enabled || r.isRequired) // rows toggled off AND not required ⇒ omit
          .map((r) => ({
            familyCode: r.familyCode,
            enabled: r.enabled,
            isRequired: r.isRequired,
            sortOrder: r.sortOrder,
          }))
        await replace.mutateAsync({
          dimensionCode: dimension.code,
          input: { universal: false, rules },
        })
      }
      message.success('Reglas actualizadas')
      setDirty(false)
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  const handleMetadataSave = async (values: {
    labelEs: string
    descriptionEs: string
    sortOrder: number
    isMultiValue: boolean
  }) => {
    const descriptionEs = values.descriptionEs?.trim() ?? ''
    try {
      await updateDim.mutateAsync({
        code: dimension.code,
        patch: {
          labelEs: values.labelEs,
          descriptionEs: descriptionEs.length > 0 ? descriptionEs : null,
          sortOrder: values.sortOrder,
          isMultiValue: values.isMultiValue,
        },
      })
      message.success('Dimensión actualizada')
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  const columns = [
    { title: 'Familia', dataIndex: 'labelEs', key: 'labelEs', width: 220 },
    { title: 'Código', dataIndex: 'familyCode', key: 'familyCode', width: 160 },
    {
      title: 'Habilitada',
      key: 'enabled',
      width: 110,
      align: 'center' as const,
      render: (_: unknown, r: RuleRow) => (
        <Switch
          size="small"
          checked={r.enabled}
          onChange={(checked) => {
            setLocalRules((prev) =>
              prev.map((x) =>
                x.familyCode === r.familyCode
                  ? { ...x, enabled: checked, isRequired: checked ? x.isRequired : false }
                  : x,
              ),
            )
            setDirty(true)
          }}
        />
      ),
    },
    {
      title: 'Requerida',
      key: 'isRequired',
      width: 110,
      align: 'center' as const,
      render: (_: unknown, r: RuleRow) => (
        <Switch
          size="small"
          checked={r.isRequired}
          disabled={!r.enabled}
          onChange={(checked) => {
            setLocalRules((prev) =>
              prev.map((x) => (x.familyCode === r.familyCode ? { ...x, isRequired: checked } : x)),
            )
            setDirty(true)
          }}
        />
      ),
    },
    {
      title: 'Orden',
      key: 'sortOrder',
      width: 100,
      render: (_: unknown, r: RuleRow) => (
        <InputNumber
          size="small"
          min={0}
          step={10}
          value={r.sortOrder}
          disabled={!r.enabled}
          onChange={(v) => {
            setLocalRules((prev) =>
              prev.map((x) =>
                x.familyCode === r.familyCode ? { ...x, sortOrder: Number(v ?? 0) } : x,
              ),
            )
            setDirty(true)
          }}
          style={{ width: 80 }}
        />
      ),
    },
  ]

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card size="small" title="Alcance">
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Space>
            <Typography.Text strong>Universal</Typography.Text>
            <Popconfirm
              title={
                universalToggleLocal
                  ? '¿Restringir a familias específicas? Se materializarán 11 reglas deshabilitadas.'
                  : '¿Hacer universal? Esto eliminará todas las reglas existentes de esta dimensión.'
              }
              onConfirm={() => {
                setUniversalToggleLocal((v) => !v)
                setDirty(true)
              }}
              okText="Sí"
              cancelText="Cancelar"
              disabled={false}
            >
              <Switch checked={universalToggleLocal} />
            </Popconfirm>
            <Typography.Text type="secondary">
              {universalToggleLocal
                ? 'Se aplica a todas las familias.'
                : 'Se aplica sólo a las familias marcadas abajo.'}
            </Typography.Text>
          </Space>
          {!universalToggleLocal ? (
            <Table<RuleRow>
              size="small"
              rowKey="familyCode"
              columns={columns}
              dataSource={localRules}
              pagination={false}
            />
          ) : null}
          {!universalToggleLocal && !anyEnabled ? (
            <Alert
              type="warning"
              showIcon
              message="Sin familias habilitadas"
              description="Con universal = No y cero familias habilitadas, la dimensión no se aplicará a ningún SKU."
            />
          ) : null}
          <Space>
            <Button type="primary" onClick={handleSave} loading={replace.isPending} disabled={!dirty}>
              Guardar reglas
            </Button>
            {dirty ? (
              <Typography.Text type="warning">Cambios sin guardar.</Typography.Text>
            ) : null}
          </Space>
        </Space>
      </Card>

      <Card size="small" title="Metadatos">
        <Form<{
          labelEs: string
          descriptionEs: string
          sortOrder: number
          isMultiValue: boolean
        }>
          key={dimension.code}
          layout="vertical"
          onFinish={handleMetadataSave}
          initialValues={{
            labelEs: dimension.labelEs,
            descriptionEs: dimension.descriptionEs ?? '',
            sortOrder: dimension.sortOrder,
            isMultiValue: dimension.isMultiValue,
          }}
        >
          <Form.Item
            label="Etiqueta (es)"
            name="labelEs"
            rules={[{ required: true, message: 'Etiqueta requerida' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item label="Descripción (es)" name="descriptionEs">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item label="Orden de clasificación" name="sortOrder">
            <InputNumber min={0} step={10} style={{ width: 120 }} />
          </Form.Item>
          <Form.Item
            label="Multi-valor"
            name="isMultiValue"
            valuePropName="checked"
            tooltip="Si está activado, un SKU puede tener varios valores simultáneos en esta dimensión."
          >
            <Switch />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={updateDim.isPending}>
            Guardar metadatos
          </Button>
        </Form>
      </Card>
    </Space>
  )
}
