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
}

interface Pair {
  sourceDimensionCode: string
  targetDimensionCode: string
}

interface PairFormValues {
  sourceDimensionCode: string
  targetDimensionCode: string
}

function pairKey(pair: Pair): string {
  return `${pair.sourceDimensionCode}->${pair.targetDimensionCode}`
}

function formatDate(value: string | null): string {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString()
}

export default function MacroCategoriesTab({ dimensions }: Props) {
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
    if (defaultColorPair) form.setFieldsValue(defaultColorPair)
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

  const dimensionOptions = dimensions.map((dim) => ({
    value: dim.code,
    label: `${dim.labelEs} (${dim.code})`,
    disabled: dim.isMultiValue,
  }))

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
    if (values.sourceDimensionCode === values.targetDimensionCode) {
      message.error('Source and macro target must be different attributes.')
      return
    }
    setPair(values)
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

  const summaryColumns = [
    {
      title: 'Macro',
      key: 'macro',
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
      render: (_: unknown, row: AttributeMacroRuleSummary) =>
        `${row.mappedCount.toLocaleString()} / ${row.sourceValueCount.toLocaleString()}`,
    },
    {
      title: 'Updated',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 190,
      render: formatDate,
    },
  ]

  const ruleColumns = [
    {
      title: selectedSource ? selectedSource.labelEs : 'Source value',
      key: 'source',
      width: 260,
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
                  onClick: () =>
                    setPair({
                      sourceDimensionCode: row.sourceDimensionCode,
                      targetDimensionCode: row.targetDimensionCode,
                    }),
                  style: { cursor: 'pointer' },
                })}
              />
            ) : (
              <Empty description="No macro mappings yet" />
            )}
          </Card>
        </Col>

        <Col xs={24} lg={13}>
          <Card size="small" title="Create or open a macro mapping">
            <Form<PairFormValues>
              form={form}
              layout="vertical"
              onFinish={openPair}
              initialValues={defaultColorPair ?? undefined}
            >
              <Row gutter={12}>
                <Col xs={24} md={10}>
                  <Form.Item
                    label="Source attribute"
                    name="sourceDimensionCode"
                    rules={[{ required: true, message: 'Choose a source attribute' }]}
                  >
                    <Select showSearch optionFilterProp="label" options={dimensionOptions} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={10}>
                  <Form.Item
                    label="Macro attribute"
                    name="targetDimensionCode"
                    rules={[{ required: true, message: 'Choose a macro attribute' }]}
                  >
                    <Select showSearch optionFilterProp="label" options={dimensionOptions} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={4}>
                  <Form.Item label=" ">
                    <Button type="primary" htmlType="submit" icon={<PlusOutlined />} block>
                      Open
                    </Button>
                  </Form.Item>
                </Col>
              </Row>
            </Form>
            <Typography.Text type="secondary">
              Create the source and macro dimensions, plus their values, in the Dimensions tab first.
              Multi-value dimensions are disabled because a macro rollup must resolve to one value.
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
