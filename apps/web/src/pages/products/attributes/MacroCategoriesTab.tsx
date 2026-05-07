import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, SaveOutlined } from '@ant-design/icons'
import {
  useAttributeMacroRules,
  useAttributeMacroRuleSet,
  useReplaceAttributeMacroRules,
} from '../../../hooks/useProductsAttributes'
import type {
  AttributeDimension,
  AttributeMacroRuleRow,
  AttributeMacroRuleSummary,
} from '../../../types/productsAttributes'

interface Props {
  dimensions: AttributeDimension[]
  onCreateMacroCategory?: () => void
}

interface Pair {
  sourceDimensionCode: string
  targetDimensionCode: string
}

interface PairFormValues {
  mappingKey: string
}

const SUPPORTED_MACRO_MAPPINGS: Pair[] = [
  { sourceDimensionCode: 'color', targetDimensionCode: 'color_family' },
]

function pairKey(pair: Pair): string {
  return `${pair.sourceDimensionCode}->${pair.targetDimensionCode}`
}

function formatDate(value: string | null): string {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString()
}

function compareText(left: string | null | undefined, right: string | null | undefined): number {
  return (left ?? '').localeCompare(right ?? '', undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

function compareDate(left: string | null, right: string | null): number {
  const leftTime = left ? new Date(left).getTime() : 0
  const rightTime = right ? new Date(right).getTime() : 0
  const safeLeftTime = Number.isNaN(leftTime) ? 0 : leftTime
  const safeRightTime = Number.isNaN(rightTime) ? 0 : rightTime
  return safeLeftTime - safeRightTime
}

export default function MacroCategoriesTab({ dimensions, onCreateMacroCategory }: Props) {
  const { message } = App.useApp()
  const summaries = useAttributeMacroRules()
  const replace = useReplaceAttributeMacroRules()
  const [form] = Form.useForm<PairFormValues>()
  const [pair, setPair] = useState<Pair | null>(null)
  const [draft, setDraft] = useState<Record<string, string | null>>({})

  const defaultColorPair = useMemo(() => {
    const hasColor = dimensions.some((d) => d.code === 'color')
    const hasColorFamily = dimensions.some((d) => d.code === 'color_family')
    return hasColor && hasColorFamily
      ? { sourceDimensionCode: 'color', targetDimensionCode: 'color_family' }
      : null
  }, [dimensions])

  const supportedPairs = useMemo(
    () =>
      SUPPORTED_MACRO_MAPPINGS.filter(
        (mapping) =>
          dimensions.some((d) => d.code === mapping.sourceDimensionCode) &&
          dimensions.some((d) => d.code === mapping.targetDimensionCode),
      ),
    [dimensions],
  )

  const mappingOptions = supportedPairs.map((mapping) => {
    const source = dimensions.find((d) => d.code === mapping.sourceDimensionCode)
    const target = dimensions.find((d) => d.code === mapping.targetDimensionCode)
    return {
      value: pairKey(mapping),
      label: `${source?.labelEs ?? mapping.sourceDimensionCode} -> ${
        target?.labelEs ?? mapping.targetDimensionCode
      }`,
    }
  })

  useEffect(() => {
    if (pair) return
    const first = summaries.data?.[0]
    if (first) {
      setPair({
        sourceDimensionCode: first.sourceDimensionCode,
        targetDimensionCode: first.targetDimensionCode,
      })
      return
    }
    if (defaultColorPair) setPair(defaultColorPair)
  }, [defaultColorPair, pair, summaries.data])

  useEffect(() => {
    if (defaultColorPair) form.setFieldsValue({ mappingKey: pairKey(defaultColorPair) })
  }, [defaultColorPair, form])

  const ruleSet = useAttributeMacroRuleSet(pair?.sourceDimensionCode ?? null, pair?.targetDimensionCode ?? null)

  useEffect(() => {
    if (!ruleSet.data) {
      setDraft({})
      return
    }
    setDraft(
      Object.fromEntries(
        ruleSet.data.rules.map((rule) => [rule.sourceValueCode, rule.targetValueCode ?? null]),
      ),
    )
  }, [ruleSet.data])

  const selectedSource = dimensions.find((d) => d.code === pair?.sourceDimensionCode) ?? null
  const selectedTarget = dimensions.find((d) => d.code === pair?.targetDimensionCode) ?? null
  const targetValueLabelByCode = useMemo(
    () => new Map((selectedTarget?.values ?? []).map((value) => [value.code, value.labelEs])),
    [selectedTarget?.values],
  )

  const targetValueOptions = (selectedTarget?.values ?? []).map((value) => ({
    value: value.code,
    label: (
      <Space size={6}>
        <span>{value.labelEs}</span>
        <Tag style={{ marginInlineEnd: 0 }}>{value.code}</Tag>
        {!value.isActive ? <Tag color="default">inactive</Tag> : null}
      </Space>
    ),
  }))

  const dirty =
    !!ruleSet.data &&
    ruleSet.data.rules.some((rule) => (draft[rule.sourceValueCode] ?? null) !== (rule.targetValueCode ?? null))

  const openPair = (values: PairFormValues) => {
    const selectedPair = supportedPairs.find((mapping) => pairKey(mapping) === values.mappingKey)
    if (!selectedPair) {
      message.error('Choose a supported macro mapping.')
      return
    }
    setPair(selectedPair)
  }

  const createOrEditDefaultMapping = () => {
    const selectedPair = defaultColorPair ?? supportedPairs[0]
    if (!selectedPair) {
      message.warning('Create the source attribute and macro category first.')
      return
    }
    form.setFieldsValue({ mappingKey: pairKey(selectedPair) })
    setPair(selectedPair)
  }

  const save = async () => {
    if (!pair || !ruleSet.data) return
    try {
      await replace.mutateAsync({
        sourceDimensionCode: pair.sourceDimensionCode,
        targetDimensionCode: pair.targetDimensionCode,
        input: {
          rules: ruleSet.data.rules.map((rule) => ({
            sourceValueCode: rule.sourceValueCode,
            targetValueCode: draft[rule.sourceValueCode] ?? null,
          })),
        },
      })
      message.success('Macro category mappings saved')
    } catch (err) {
      message.error((err as Error).message)
    }
  }

  const targetSortValue = (row: AttributeMacroRuleRow): string => {
    const valueCode = draft[row.sourceValueCode] ?? row.targetValueCode
    if (!valueCode) return ''
    return targetValueLabelByCode.get(valueCode) ?? valueCode
  }

  const summaryColumns: ColumnsType<AttributeMacroRuleSummary> = [
    {
      title: 'Macro',
      key: 'macro',
      sorter: (a, b) =>
        compareText(a.sourceDimensionLabelEs, b.sourceDimensionLabelEs) ||
        compareText(a.sourceDimensionCode, b.sourceDimensionCode) ||
        compareText(a.targetDimensionLabelEs, b.targetDimensionLabelEs) ||
        compareText(a.targetDimensionCode, b.targetDimensionCode),
      render: (_: unknown, row: AttributeMacroRuleSummary) => (
        <Space size={6}>
          <Tag>{row.sourceDimensionCode}</Tag>
          <span>to</span>
          <Tag color="blue">{row.targetDimensionCode}</Tag>
        </Space>
      ),
    },
    {
      title: 'Mapped',
      key: 'mapped',
      width: 120,
      sorter: (a, b) =>
        a.mappedCount - b.mappedCount ||
        a.sourceValueCount - b.sourceValueCount ||
        compareText(a.sourceDimensionCode, b.sourceDimensionCode),
      render: (_: unknown, row: AttributeMacroRuleSummary) =>
        `${row.mappedCount.toLocaleString()} / ${row.sourceValueCount.toLocaleString()}`,
    },
    {
      title: 'Updated',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 190,
      sorter: (a, b) => compareDate(a.updatedAt, b.updatedAt),
      render: (value: AttributeMacroRuleSummary['updatedAt']) => formatDate(value),
    },
  ]

  const ruleColumns: ColumnsType<AttributeMacroRuleRow> = [
    {
      title: selectedSource ? selectedSource.labelEs : 'Source value',
      key: 'source',
      width: 260,
      sorter: (a, b) =>
        compareText(a.sourceLabelEs, b.sourceLabelEs) ||
        compareText(a.sourceValueCode, b.sourceValueCode),
      render: (_: unknown, row: AttributeMacroRuleRow) => (
        <Space size={6}>
          <Typography.Text strong>{row.sourceLabelEs}</Typography.Text>
          <Tag>{row.sourceValueCode}</Tag>
        </Space>
      ),
    },
    {
      title: selectedTarget ? selectedTarget.labelEs : 'Macro value',
      key: 'target',
      sorter: (a, b) =>
        compareText(targetSortValue(a), targetSortValue(b)) ||
        compareText(a.sourceLabelEs, b.sourceLabelEs),
      render: (_: unknown, row: AttributeMacroRuleRow) => (
        <Select
          allowClear
          showSearch
          optionFilterProp="labelText"
          value={draft[row.sourceValueCode] ?? undefined}
          placeholder="No macro value"
          style={{ minWidth: 260 }}
          options={targetValueOptions.map((option) => ({
            ...option,
            labelText: String(option.value),
          }))}
          onChange={(value) =>
            setDraft((prev) => ({ ...prev, [row.sourceValueCode]: value ?? null }))
          }
        />
      ),
    },
    {
      title: 'Last saved',
      key: 'updated',
      width: 230,
      sorter: (a, b) =>
        compareDate(a.updatedAt, b.updatedAt) ||
        compareText(a.updatedBy, b.updatedBy) ||
        compareText(a.sourceLabelEs, b.sourceLabelEs),
      render: (_: unknown, row: AttributeMacroRuleRow) => (
        <Space size={4} direction="vertical">
          <Typography.Text>{formatDate(row.updatedAt)}</Typography.Text>
          {row.updatedBy ? <Typography.Text type="secondary">{row.updatedBy}</Typography.Text> : null}
        </Space>
      ),
    },
  ]

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Alert
        type="info"
        showIcon
        message="Macro categories are derived attributes"
        description="Use this when a detailed attribute should roll up into a broader reporting/filtering category. Operators edit the mapping here; SKU records keep the detailed attribute, and the macro assignment is rebuilt automatically."
      />

      <Row gutter={16}>
        <Col xs={24} lg={11}>
          <Card size="small" title="Existing macro mappings">
            {summaries.isLoading ? (
              <Spin />
            ) : summaries.error ? (
              <Alert type="error" message={(summaries.error as Error).message} />
            ) : summaries.data && summaries.data.length > 0 ? (
              <Table<AttributeMacroRuleSummary>
                size="small"
                rowKey={(row) => `${row.sourceDimensionCode}->${row.targetDimensionCode}`}
                columns={summaryColumns}
                dataSource={summaries.data}
                pagination={false}
                rowClassName={(row) =>
                  pair && pairKey(pair) === `${row.sourceDimensionCode}->${row.targetDimensionCode}`
                    ? 'ant-table-row-selected'
                    : ''
                }
                onRow={(row) => ({
                  onClick: () => {
                    const nextPair = {
                      sourceDimensionCode: row.sourceDimensionCode,
                      targetDimensionCode: row.targetDimensionCode,
                    }
                    setPair(nextPair)
                    form.setFieldsValue({ mappingKey: pairKey(nextPair) })
                  },
                  style: { cursor: 'pointer' },
                })}
              />
            ) : (
              <Empty description="No macro mappings yet" />
            )}
          </Card>
        </Col>

        <Col xs={24} lg={13}>
          <Card
            size="small"
            title="Macro category setup"
            extra={
              <Space wrap>
                <Button onClick={onCreateMacroCategory} icon={<PlusOutlined />}>
                  New Macro Category
                </Button>
                <Button type="primary" onClick={createOrEditDefaultMapping} icon={<PlusOutlined />}>
                  New Macro Mapping
                </Button>
              </Space>
            }
          >
            <Form<PairFormValues>
              form={form}
              layout="vertical"
              onFinish={openPair}
              initialValues={defaultColorPair ? { mappingKey: pairKey(defaultColorPair) } : undefined}
            >
              <Row gutter={12}>
                <Col xs={24} md={18}>
                  <Form.Item
                    label="Macro mapping"
                    name="mappingKey"
                    rules={[{ required: true, message: 'Choose a macro mapping' }]}
                  >
                    <Select
                      showSearch
                      optionFilterProp="label"
                      options={mappingOptions}
                      placeholder="Choose a macro mapping"
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={6}>
                  <Form.Item label=" ">
                    <Button type="primary" htmlType="submit" icon={<PlusOutlined />} block>
                      Open Selected Mapping
                    </Button>
                  </Form.Item>
                </Col>
              </Row>
            </Form>
            <Typography.Text type="secondary">
              Derived macro categories are rollup targets. Today the only supported macro category is
              Color Family, derived from Color.
            </Typography.Text>
          </Card>
        </Col>
      </Row>

      <Card
        size="small"
        title={
          pair ? (
            <Space>
              <Tag>{pair.sourceDimensionCode}</Tag>
              <span>to</span>
              <Tag color="blue">{pair.targetDimensionCode}</Tag>
            </Space>
          ) : (
            'Mapping'
          )
        }
        extra={
          <Button
            type="primary"
            icon={<SaveOutlined />}
            disabled={!pair || !dirty}
            loading={replace.isPending}
            onClick={save}
          >
            Save mappings
          </Button>
        }
      >
        {!pair ? (
          <Empty description="Select or open a macro mapping" />
        ) : ruleSet.isLoading ? (
          <Spin />
        ) : ruleSet.error ? (
          <Alert type="error" message={(ruleSet.error as Error).message} />
        ) : selectedTarget && selectedTarget.values.length === 0 ? (
          <Alert
            type="warning"
            showIcon
            message="The macro attribute has no values"
            description="Add values to the macro dimension before mapping source values."
          />
        ) : ruleSet.data ? (
          <Table<AttributeMacroRuleRow>
            size="small"
            rowKey="sourceValueCode"
            columns={ruleColumns}
            dataSource={ruleSet.data.rules}
            pagination={false}
          />
        ) : null}
      </Card>
    </Space>
  )
}
