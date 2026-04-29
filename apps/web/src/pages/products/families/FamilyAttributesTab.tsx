import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { useMemo, useState } from 'react'
import {
  Alert,
  App,
  Button,
  Card,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import { useAttributeDimensions } from '../../../hooks/useProductsAttributes'
import {
  useFamilyAttributeRules,
  useRemoveFamilyAttributeRule,
  useToggleFamilyAttributeRule,
} from '../../../hooks/useProductFamilies'
import type { ProductFamily } from '../../../types/sku'
import type { AttributeDimension, FamilyAttributeRuleRow } from '../../../types/productsAttributes'

interface Props {
  family: ProductFamily
}

function bySortThenLabel(a: { sortOrder: number; labelEs: string }, b: { sortOrder: number; labelEs: string }) {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
  return a.labelEs.localeCompare(b.labelEs)
}

/**
 * Dimensions for the selected family only. The left family list controls this
 * tab; do not render every family here.
 */
export default function FamilyAttributesTab({ family }: Props) {
  const { message } = App.useApp()
  const { data: dimensions, isLoading: dimensionsLoading } = useAttributeDimensions()
  const { data: rules, isLoading: rulesLoading } = useFamilyAttributeRules(family.code)
  const toggle = useToggleFamilyAttributeRule()
  const remove = useRemoveFamilyAttributeRule()
  const [pickerDim, setPickerDim] = useState<string | undefined>()

  const universalDims = useMemo(
    () => [...(dimensions ?? [])].filter((dimension) => dimension.familyRules.length === 0).sort(bySortThenLabel),
    [dimensions],
  )

  const ruledDimensionCodes = useMemo(
    () => new Set((rules ?? []).map((rule) => rule.dimensionCode)),
    [rules],
  )

  const addableDims = useMemo(
    () =>
      [...(dimensions ?? [])]
        .filter((dimension) => dimension.familyRules.length > 0 && !ruledDimensionCodes.has(dimension.code))
        .sort(bySortThenLabel),
    [dimensions, ruledDimensionCodes],
  )

  const selectedFamilyRows = useMemo(
    () => [...(rules ?? [])].sort(bySortThenLabel),
    [rules],
  )

  const effectiveDimensionRows = useMemo(
    () => [
      ...universalDims.map((dimension) => ({
        key: `universal:${dimension.code}`,
        scope: 'Universal',
        code: dimension.code,
        labelEs: dimension.labelEs,
        enabled: true,
        isRequired: false,
        valuesCount: dimension.values.length,
      })),
      ...selectedFamilyRows.map((row) => ({
        key: `family:${row.dimensionCode}`,
        scope: family.labelEs,
        code: row.dimensionCode,
        labelEs: row.labelEs,
        enabled: row.enabled,
        isRequired: row.isRequired,
        valuesCount: null,
      })),
    ],
    [family.labelEs, selectedFamilyRows, universalDims],
  )

  const handleAddDim = async () => {
    if (!pickerDim) return
    try {
      await toggle.mutateAsync({
        familyCode: family.code,
        dimensionCode: pickerDim,
        patch: { enabled: true, isRequired: false, sortOrder: 0 },
      })
      message.success(`'${pickerDim}' agregado a '${family.code}'`)
      setPickerDim(undefined)
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  const ruleColumns = [
    { title: 'Dimension', dataIndex: 'labelEs', key: 'labelEs', width: 240 },
    {
      title: 'Code',
      dataIndex: 'dimensionCode',
      key: 'dimensionCode',
      width: 170,
      render: (code: string) => <Tag>{code}</Tag>,
    },
    {
      title: 'Enabled',
      key: 'enabled',
      width: 110,
      align: 'center' as const,
      render: (_: unknown, row: FamilyAttributeRuleRow) => (
        <Switch
          size="small"
          checked={row.enabled}
          loading={toggle.isPending}
          onChange={async (checked) => {
            try {
              await toggle.mutateAsync({
                familyCode: family.code,
                dimensionCode: row.dimensionCode,
                patch: { enabled: checked, ...(checked ? {} : { isRequired: false }) },
              })
            } catch (e) {
              message.error((e as Error).message)
            }
          }}
        />
      ),
    },
    {
      title: 'Required',
      key: 'isRequired',
      width: 110,
      align: 'center' as const,
      render: (_: unknown, row: FamilyAttributeRuleRow) => (
        <Switch
          size="small"
          checked={row.isRequired}
          disabled={!row.enabled}
          loading={toggle.isPending}
          onChange={async (checked) => {
            try {
              await toggle.mutateAsync({
                familyCode: family.code,
                dimensionCode: row.dimensionCode,
                patch: { isRequired: checked },
              })
            } catch (e) {
              message.error((e as Error).message)
            }
          }}
        />
      ),
    },
    {
      title: 'Order',
      key: 'sortOrder',
      width: 100,
      render: (_: unknown, row: FamilyAttributeRuleRow) => (
        <InputNumber
          size="small"
          min={0}
          max={32767}
          step={10}
          defaultValue={row.sortOrder}
          onBlur={async (event) => {
            const next = Number((event.target as HTMLInputElement).value)
            if (!Number.isFinite(next) || next === row.sortOrder) return
            try {
              await toggle.mutateAsync({
                familyCode: family.code,
                dimensionCode: row.dimensionCode,
                patch: { sortOrder: next },
              })
            } catch (e) {
              message.error((e as Error).message)
            }
          }}
          style={{ width: 80 }}
        />
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 60,
      render: (_: unknown, row: FamilyAttributeRuleRow) => (
        <Popconfirm
          title="Remove rule?"
          description="The dimension will still exist, but it will no longer apply to this family."
          onConfirm={async () => {
            try {
              await remove.mutateAsync({
                familyCode: family.code,
                dimensionCode: row.dimensionCode,
              })
              message.success(`'${row.dimensionCode}' removido de '${family.code}'`)
            } catch (e) {
              message.error((e as Error).message)
            }
          }}
        >
          <Button type="text" size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ]

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Alert
        type="info"
        showIcon
        message="Dimensions for the selected family."
        description={`The left family list controls this tab. Universal dimensions also apply to ${family.labelEs}, so they are shown here together with the family-specific dimensions.`}
      />

      <Card
        size="small"
        title={
          <Space>
            <Typography.Text>Effective Dimensions for Selected Family</Typography.Text>
            <Tag>{family.code}</Tag>
            <Typography.Text type="secondary">
              {universalDims.length} universal + {selectedFamilyRows.length} family-specific
            </Typography.Text>
          </Space>
        }
      >
        <Table
          size="small"
          rowKey="key"
          loading={dimensionsLoading || rulesLoading}
          columns={[
            {
              title: 'Scope',
              dataIndex: 'scope',
              key: 'scope',
              width: 150,
              render: (scope: string) =>
                scope === 'Universal' ? <Tag color="blue">Universal</Tag> : <Tag>{scope}</Tag>,
            },
            { title: 'Dimension', dataIndex: 'labelEs', key: 'labelEs', width: 260 },
            {
              title: 'Code',
              dataIndex: 'code',
              key: 'code',
              width: 180,
              render: (code: string) => <Tag>{code}</Tag>,
            },
            {
              title: 'Enabled',
              dataIndex: 'enabled',
              key: 'enabled',
              width: 90,
              render: (enabled: boolean) => (enabled ? 'Yes' : 'No'),
            },
            {
              title: 'Required',
              dataIndex: 'isRequired',
              key: 'isRequired',
              width: 90,
              render: (required: boolean) => (required ? 'Yes' : 'No'),
            },
          ]}
          dataSource={effectiveDimensionRows}
          pagination={false}
        />
      </Card>

      <Card size="small" title="Universal Dimensions">
        {universalDims.length > 0 ? (
          <Table<AttributeDimension>
            size="small"
            rowKey="code"
            loading={dimensionsLoading}
            columns={[
              { title: 'Dimension', dataIndex: 'labelEs', key: 'labelEs', width: 260 },
              {
                title: 'Code',
                dataIndex: 'code',
                key: 'code',
                width: 180,
                render: (code: string) => <Tag>{code}</Tag>,
              },
              {
                title: 'Multi-value',
                key: 'multiValue',
                width: 120,
                render: (_: unknown, row: AttributeDimension) => (row.isMultiValue ? 'Yes' : 'No'),
              },
              {
                title: 'Values',
                key: 'values',
                width: 100,
                align: 'right' as const,
                render: (_: unknown, row: AttributeDimension) => row.values.length,
              },
            ]}
            dataSource={universalDims}
            pagination={false}
          />
        ) : (
          <Typography.Text type="secondary">No universal dimensions.</Typography.Text>
        )}
      </Card>

      <Card
        size="small"
        title={
          <Space>
            <Typography.Text>Dimensions Scoped Only to Selected Family</Typography.Text>
            <Tag>{family.code}</Tag>
            <Typography.Text type="secondary">{family.labelEs}</Typography.Text>
          </Space>
        }
        extra={
          <Space>
            <Select
              size="small"
              placeholder="Add dimension..."
              value={pickerDim}
              onChange={setPickerDim}
              style={{ minWidth: 260 }}
              options={addableDims.map((dimension) => ({
                value: dimension.code,
                label: `${dimension.code} - ${dimension.labelEs}`,
              }))}
              showSearch
              optionFilterProp="label"
              allowClear
            />
            <Tooltip
              title={
                addableDims.length === 0
                  ? 'All non-universal dimensions already have a rule for this family.'
                  : ''
              }
            >
              <Button
                type="primary"
                size="small"
                icon={<PlusOutlined />}
                disabled={!pickerDim}
                loading={toggle.isPending}
                onClick={() => void handleAddDim()}
              >
                Add
              </Button>
            </Tooltip>
          </Space>
        }
      >
        {selectedFamilyRows.length > 0 ? (
          <Table<FamilyAttributeRuleRow>
            size="small"
            rowKey="dimensionCode"
            loading={rulesLoading}
            columns={ruleColumns}
            dataSource={selectedFamilyRows}
            pagination={false}
            scroll={{ x: 790 }}
          />
        ) : (
          <Alert
            type="info"
            showIcon
            message="No dimensions scoped to this family"
            description="Use Add dimension above to assign a non-universal dimension to the selected family."
          />
        )}
      </Card>
    </Space>
  )
}
