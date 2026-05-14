import { useMemo, useState } from 'react'
import {
  App,
  Button,
  Card,
  Input,
  Popconfirm,
  Radio,
  Select,
  Space,
  Tooltip,
  Typography,
} from 'antd'
import { HistoryOutlined, PlusOutlined } from '@ant-design/icons'
import {
  useCategories,
  useGroups,
  useKeywords,
  useSeasons,
} from '../../hooks/useProductsTaxonomy'
import { useVendors } from '../../hooks/useProductsVendors'
import {
  useAttributeDimensions,
  useAttributeMacroRules,
  useCreateValue,
} from '../../hooks/useProductsAttributes'
import { useApplyBatchChange } from '../../hooks/useUtilities'
import type { Sku, SkuListFilters } from '../../types/productsSku'
import type {
  AttributeDimension,
  AttributeDimensionValue,
} from '../../types/productsAttributes'
import type {
  AttributeChange,
  BatchOperationType,
} from '../../services/utilitiesApi'
import {
  getResultFamilyScope,
  getVisibleActionDimensions,
} from '../utilities/ChangeSkuAttributesPage'

type CoreActionKind = 'CATEGORY' | 'VENDOR' | 'SEASON' | 'GROUP' | 'KEYWORD_ADD' | 'KEYWORD_REMOVE'
type AttributeMode = 'REPLACE' | 'ADD' | 'REMOVE'

const CORE_ACTION_META: Record<CoreActionKind, { label: string; verb: string; opType: BatchOperationType }> = {
  CATEGORY: { label: 'Category', verb: 'Move to category', opType: 'CHANGE_CATEGORY' },
  VENDOR: { label: 'Vendor', verb: 'Reassign to vendor', opType: 'CHANGE_VENDOR' },
  SEASON: { label: 'Season', verb: 'Reassign to season', opType: 'CHANGE_SEASON' },
  GROUP: { label: 'Group', verb: 'Reassign to group', opType: 'CHANGE_GROUP_CODE' },
  KEYWORD_ADD: { label: 'Keyword add', verb: 'Add keyword', opType: 'CHANGE_KEYWORDS_ADD' },
  KEYWORD_REMOVE: { label: 'Keyword remove', verb: 'Remove keyword', opType: 'CHANGE_KEYWORDS_REMOVE' },
}

const ATTRIBUTE_ACTION_PREFIX = 'ATTR:'
const ATTRIBUTE_VALUE_CODE_PATTERN = /^[a-z0-9][a-z0-9_]*$/

const isUniversalAttributeDimension = (dimension: AttributeDimension) =>
  dimension.familyRules.length === 0

interface SkuBulkChangePanelProps {
  activeFilters: SkuListFilters | null
  hasRun: boolean
  resultCount: number
  resultSkus: Sku[]
  selectedCodes: string[]
  setSelectedCodes: (codes: string[]) => void
}

export default function SkuBulkChangePanel({
  activeFilters,
  hasRun,
  resultCount,
  resultSkus,
  selectedCodes,
  setSelectedCodes,
}: SkuBulkChangePanelProps) {
  const { message, notification } = App.useApp()

  const [action, setAction] = useState<string>('CATEGORY')
  const [targetCategory, setTargetCategory] = useState<number | undefined>(undefined)
  const [targetVendor, setTargetVendor] = useState<string | undefined>(undefined)
  const [targetSeason, setTargetSeason] = useState<string | undefined>(undefined)
  const [targetGroup, setTargetGroup] = useState<string | undefined>(undefined)
  const [targetKeyword, setTargetKeyword] = useState<string | undefined>(undefined)
  const [targetAttributeValues, setTargetAttributeValues] = useState<string[]>([])
  const [attributeMode, setAttributeMode] = useState<AttributeMode>('REPLACE')
  const [newAttributeValueCode, setNewAttributeValueCode] = useState('')
  const [newAttributeValueLabel, setNewAttributeValueLabel] = useState('')
  const [localAttributeValues, setLocalAttributeValues] = useState<Record<string, AttributeDimensionValue[]>>({})

  const { data: categories, isLoading: categoriesLoading } = useCategories()
  const { data: groups } = useGroups()
  const { data: keywords } = useKeywords()
  const { data: seasons } = useSeasons()
  const { data: vendors } = useVendors()
  const { data: attributeDimensions } = useAttributeDimensions(true)
  const { data: macroRules } = useAttributeMacroRules()
  const createAttributeValue = useCreateValue()
  const apply = useApplyBatchChange()

  const sortedAttributeDimensions = useMemo(
    () => [...(attributeDimensions ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.labelEs.localeCompare(b.labelEs)),
    [attributeDimensions],
  )

  const resultFamilyScope = useMemo(
    () => getResultFamilyScope(resultSkus.map((sku) => sku.category), categories),
    [categories, resultSkus],
  )

  const actionAttributeDimensions = useMemo(
    () => getVisibleActionDimensions(sortedAttributeDimensions, hasRun, resultFamilyScope),
    [hasRun, resultFamilyScope, sortedAttributeDimensions],
  )

  const universalActionAttributeDimensions = useMemo(
    () => actionAttributeDimensions.filter(isUniversalAttributeDimension),
    [actionAttributeDimensions],
  )

  const familyActionAttributeDimensions = useMemo(
    () => actionAttributeDimensions.filter((dimension) => !isUniversalAttributeDimension(dimension)),
    [actionAttributeDimensions],
  )

  const derivedDimensionCodes = useMemo(
    () => new Set((macroRules ?? []).map((rule) => rule.targetDimensionCode)),
    [macroRules],
  )

  const selectedAttributeDimension = useMemo(() => {
    if (!action.startsWith(ATTRIBUTE_ACTION_PREFIX)) return null
    const code = action.slice(ATTRIBUTE_ACTION_PREFIX.length)
    return sortedAttributeDimensions.find((dimension) => dimension.code === code) ?? null
  }, [action, sortedAttributeDimensions])

  const selectedAttributeValues = useMemo(() => {
    if (!selectedAttributeDimension) return []
    const byCode = new Map<string, AttributeDimensionValue>()
    for (const value of selectedAttributeDimension.values) byCode.set(value.code, value)
    for (const value of localAttributeValues[selectedAttributeDimension.code] ?? []) {
      byCode.set(value.code, value)
    }
    return Array.from(byCode.values()).sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code))
  }, [localAttributeValues, selectedAttributeDimension])

  const onActionChange = (next: string) => {
    setAction(next)
    setTargetCategory(undefined)
    setTargetVendor(undefined)
    setTargetSeason(undefined)
    setTargetGroup(undefined)
    setTargetKeyword(undefined)
    setTargetAttributeValues([])
    setAttributeMode('REPLACE')
    setNewAttributeValueCode('')
    setNewAttributeValueLabel('')
  }

  const currentTarget = (): number | string | string[] | undefined => {
    if (selectedAttributeDimension) return targetAttributeValues
    switch (action) {
      case 'CATEGORY': return targetCategory
      case 'VENDOR': return targetVendor
      case 'SEASON': return targetSeason
      case 'GROUP': return targetGroup
      case 'KEYWORD_ADD':
      case 'KEYWORD_REMOVE':
        return targetKeyword
    }
  }

  const buildChange = (): AttributeChange | null => {
    if (selectedAttributeDimension) {
      const mode = selectedAttributeDimension.isMultiValue ? attributeMode : 'REPLACE'
      return targetAttributeValues.length > 0
        ? {
            type: 'CHANGE_SKU_ATTRIBUTE',
            dimensionCode: selectedAttributeDimension.code,
            valueCodes: targetAttributeValues,
            mode,
          }
        : null
    }
    switch (action) {
      case 'CATEGORY': return targetCategory != null ? { type: 'CHANGE_CATEGORY', category: targetCategory } : null
      case 'VENDOR': return targetVendor ? { type: 'CHANGE_VENDOR', vendor: targetVendor } : null
      case 'SEASON': return targetSeason ? { type: 'CHANGE_SEASON', season: targetSeason } : null
      case 'GROUP': return targetGroup ? { type: 'CHANGE_GROUP_CODE', groupCode: targetGroup } : null
      case 'KEYWORD_ADD': return targetKeyword ? { type: 'CHANGE_KEYWORDS_ADD', keyword: targetKeyword } : null
      case 'KEYWORD_REMOVE': return targetKeyword ? { type: 'CHANGE_KEYWORDS_REMOVE', keyword: targetKeyword } : null
    }
    return null
  }

  const currentTargetValue = currentTarget()
  const targetReady = Array.isArray(currentTargetValue)
    ? currentTargetValue.length > 0
    : currentTargetValue != null && currentTargetValue !== ''

  const meta = selectedAttributeDimension
    ? {
        label: selectedAttributeDimension.labelEs,
        verb: selectedAttributeDimension.isMultiValue
          ? `${attributeMode.toLowerCase()} ${selectedAttributeDimension.labelEs}`
          : `Set ${selectedAttributeDimension.labelEs}`,
        opType: 'CHANGE_SKU_ATTRIBUTE' as BatchOperationType,
      }
    : CORE_ACTION_META[action as CoreActionKind] ?? CORE_ACTION_META.CATEGORY

  const attributeActionDisabledReason = (dimension: AttributeDimension) => {
    if (derivedDimensionCodes.has(dimension.code)) {
      return 'Derived from another attribute; query is allowed but manual bulk change is disabled.'
    }
    if (!hasRun && !isUniversalAttributeDimension(dimension)) {
      return 'Run a SKU query to determine which product families are in scope.'
    }
    if (hasRun && resultSkus.length > 0 && categoriesLoading) {
      return 'Loading product-family scope for current results.'
    }
    return null
  }

  const buildAttributeActionOptions = (dimensions: AttributeDimension[]) =>
    dimensions.map((dimension) => {
      const disabledReason = attributeActionDisabledReason(dimension)
      return {
        value: `${ATTRIBUTE_ACTION_PREFIX}${dimension.code}`,
        disabled: Boolean(disabledReason),
        label: dimension.labelEs,
        title: disabledReason ?? undefined,
      }
    })

  const attributeActionOptionGroups = actionAttributeDimensions.length > 0
    ? [
        ...(universalActionAttributeDimensions.length > 0
          ? [{ label: 'Universal dimensions', options: buildAttributeActionOptions(universalActionAttributeDimensions) }]
          : []),
        ...(familyActionAttributeDimensions.length > 0
          ? [{ label: 'Family dimensions', options: buildAttributeActionOptions(familyActionAttributeDimensions) }]
          : []),
      ]
    : [
        {
          label: 'Extended attributes',
          options: [
            {
              value: '__NO_RESULT_ATTRIBUTES__',
              disabled: true,
              label: sortedAttributeDimensions.length === 0
                ? 'No extended attributes'
                : 'No assignable attributes for current result families',
            },
          ],
        },
      ]

  const selectAllVisible = () => {
    const merged = Array.from(new Set([...selectedCodes, ...resultSkus.map((sku) => sku.code)]))
    setSelectedCodes(merged)
  }

  const createAndSelectAttributeValue = async () => {
    if (!selectedAttributeDimension) return
    const code = newAttributeValueCode.trim()
    const labelEs = newAttributeValueLabel.trim()
    if (!code || !labelEs) {
      message.warning('Enter a code and label for the new value.')
      return
    }
    if (!ATTRIBUTE_VALUE_CODE_PATTERN.test(code)) {
      message.warning('Use lowercase letters, digits, and underscores for the value code.')
      return
    }
    if (selectedAttributeValues.some((value) => value.code === code)) {
      message.warning(`Value '${code}' already exists in ${selectedAttributeDimension.labelEs}.`)
      return
    }

    const nextSortOrder = Math.max(0, ...selectedAttributeValues.map((value) => value.sortOrder)) + 10
    try {
      const created = await createAttributeValue.mutateAsync({
        dimensionCode: selectedAttributeDimension.code,
        input: {
          code,
          labelEs,
          descriptionEs: null,
          sortOrder: nextSortOrder,
        },
      })
      setLocalAttributeValues((prev) => ({
        ...prev,
        [selectedAttributeDimension.code]: [
          ...(prev[selectedAttributeDimension.code] ?? []),
          created,
        ],
      }))
      setTargetAttributeValues((prev) => {
        if (!selectedAttributeDimension.isMultiValue) return [created.code]
        return Array.from(new Set([...prev, created.code]))
      })
      setNewAttributeValueCode('')
      setNewAttributeValueLabel('')
      message.success(`Value '${created.code}' created and selected.`)
    } catch (error) {
      message.error((error as Error).message)
    }
  }

  const applyChange = async () => {
    if (selectedCodes.length === 0) {
      message.warning('Select at least one SKU.')
      return
    }
    const change = buildChange()
    if (!change) {
      message.warning(`Pick a target ${meta.label.toLowerCase()}.`)
      return
    }

    try {
      const criteria = activeFilters
        ? { skus: selectedCodes, sourceQuery: activeFilters }
        : { skus: selectedCodes }
      const result = await apply.mutateAsync({
        operationType: meta.opType,
        criteria,
        change,
      })
      if (result.affectedCount === 0) {
        message.info('No SKUs matched - nothing changed.')
        return
      }
      const targetDisplay =
        selectedAttributeDimension
          ? `${selectedAttributeDimension.labelEs}: ${targetAttributeValues.join(', ')}`
          : action === 'CATEGORY' ? `category ${targetCategory}`
          : action === 'VENDOR' ? `vendor ${targetVendor}`
          : action === 'SEASON' ? `season ${targetSeason}`
          : action === 'GROUP' ? `group ${targetGroup}`
          : action === 'KEYWORD_ADD' ? `keyword ${targetKeyword}`
          : `without keyword ${targetKeyword}`
      notification.success({
        message: `Reassigned ${result.affectedCount} SKU${result.affectedCount === 1 ? '' : 's'} to ${targetDisplay}`,
        description: result.batchId && (
          <a href={`/utilities/batch-history/${result.batchId}`}>View batch / Undo</a>
        ),
        duration: 30,
      })
      setSelectedCodes([])
      setTargetCategory(undefined)
      setTargetVendor(undefined)
      setTargetSeason(undefined)
      setTargetGroup(undefined)
      setTargetKeyword(undefined)
      setTargetAttributeValues([])
    } catch (error) {
      message.error((error as Error).message)
    }
  }

  const renderTargetField = () => {
    if (selectedAttributeDimension) {
      const activeValues = selectedAttributeValues.filter((value) => value.isActive)
      return (
        <Space wrap>
          {selectedAttributeDimension.isMultiValue ? (
            <Radio.Group
              value={attributeMode}
              onChange={(event) => setAttributeMode(event.target.value as AttributeMode)}
              optionType="button"
              buttonStyle="solid"
            >
              <Radio.Button value="REPLACE">Replace</Radio.Button>
              <Radio.Button value="ADD">Add</Radio.Button>
              <Radio.Button value="REMOVE">Remove</Radio.Button>
            </Radio.Group>
          ) : null}
          <Select<string | string[]>
            mode={selectedAttributeDimension.isMultiValue ? 'multiple' : undefined}
            placeholder={`Target ${selectedAttributeDimension.labelEs}`}
            value={
              selectedAttributeDimension.isMultiValue
                ? targetAttributeValues
                : targetAttributeValues[0]
            }
            options={activeValues.map((value) => ({
              value: value.code,
              label: `${value.code} - ${value.labelEs}${value.skuCount != null ? ` (${value.skuCount.toLocaleString()})` : ''}`,
            }))}
            onChange={(value) => {
              if (Array.isArray(value)) setTargetAttributeValues(value)
              else setTargetAttributeValues(value ? [value] : [])
            }}
            allowClear
            showSearch
            style={{ minWidth: selectedAttributeDimension.isMultiValue ? 340 : 280 }}
            maxTagCount={2}
            filterOption={(input, option) =>
              String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
            }
          />
          {attributeMode !== 'REMOVE' ? (
            <>
              <Input
                placeholder="New value code"
                value={newAttributeValueCode}
                onChange={(event) => setNewAttributeValueCode(event.target.value.trim().toLowerCase())}
                onPressEnter={createAndSelectAttributeValue}
                style={{ width: 160 }}
              />
              <Input
                placeholder="New value label"
                value={newAttributeValueLabel}
                onChange={(event) => setNewAttributeValueLabel(event.target.value)}
                onPressEnter={createAndSelectAttributeValue}
                style={{ width: 220 }}
              />
              <Tooltip title="Create this attribute value and select it for the pending change.">
                <Button
                  icon={<PlusOutlined />}
                  onClick={createAndSelectAttributeValue}
                  loading={createAttributeValue.isPending}
                  disabled={!newAttributeValueCode.trim() || !newAttributeValueLabel.trim()}
                >
                  Create value
                </Button>
              </Tooltip>
            </>
          ) : null}
        </Space>
      )
    }

    switch (action) {
      case 'CATEGORY':
        return (
          <Select<number>
            placeholder="Target category"
            value={targetCategory}
            options={(categories ?? []).map((category) => ({
              value: category.number,
              label: `${category.number} - ${category.description}`,
            }))}
            onChange={setTargetCategory}
            allowClear
            showSearch
            style={{ minWidth: 280 }}
            filterOption={(input, option) =>
              String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
            }
          />
        )
      case 'VENDOR':
        return (
          <Select<string>
            placeholder="Target vendor"
            value={targetVendor}
            options={(vendors ?? []).map((vendor) => ({
              value: vendor.code,
              label: `${vendor.code} - ${vendor.name}`,
            }))}
            onChange={setTargetVendor}
            allowClear
            showSearch
            style={{ minWidth: 280 }}
            filterOption={(input, option) =>
              String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
            }
          />
        )
      case 'SEASON':
        return (
          <Select<string>
            placeholder="Target season"
            value={targetSeason}
            options={(seasons ?? []).map((season) => ({
              value: season.code,
              label: `${season.code} - ${season.description}`,
            }))}
            onChange={setTargetSeason}
            allowClear
            showSearch
            style={{ minWidth: 240 }}
            filterOption={(input, option) =>
              String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
            }
          />
        )
      case 'GROUP':
        return (
          <Select<string>
            placeholder="Target group"
            value={targetGroup}
            options={(groups ?? []).map((group) => ({
              value: group.code,
              label: `${group.code} - ${group.description}`,
            }))}
            onChange={setTargetGroup}
            allowClear
            showSearch
            style={{ minWidth: 240 }}
            filterOption={(input, option) =>
              String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
            }
          />
        )
      case 'KEYWORD_ADD':
      case 'KEYWORD_REMOVE':
        return (
          <Select<string>
            placeholder="Target keyword"
            value={targetKeyword}
            options={(keywords ?? []).map((keyword) => ({
              value: keyword.keyword,
              label: keyword.description ? `${keyword.keyword} - ${keyword.description}` : keyword.keyword,
            }))}
            onChange={setTargetKeyword}
            allowClear
            showSearch
            style={{ minWidth: 260 }}
            filterOption={(input, option) =>
              String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
            }
          />
        )
      default:
        return null
    }
  }

  return (
    <Card
      size="small"
      title="Bulk change SKU attributes"
      extra={
        <Button href="/utilities/batch-history" icon={<HistoryOutlined />}>
          Batch History
        </Button>
      }
    >
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        <Space wrap>
          <Typography.Text strong>
            {selectedCodes.length.toLocaleString()} SKU{selectedCodes.length === 1 ? '' : 's'} selected
          </Typography.Text>
          {hasRun && resultCount > 0 ? (
            <Tooltip title="Add every SKU in the current result set to the selection. Existing picks are kept.">
              <Button size="small" onClick={selectAllVisible}>
                Select all in results ({resultCount})
              </Button>
            </Tooltip>
          ) : null}
          {selectedCodes.length > 0 ? (
            <Button size="small" onClick={() => setSelectedCodes([])}>
              Clear selection
            </Button>
          ) : null}
        </Space>
        <Space wrap>
          <span>Change:</span>
          <Select
            value={action}
            onChange={onActionChange}
            showSearch
            optionFilterProp="label"
            style={{ minWidth: 260 }}
            options={[
              {
                label: 'Core fields',
                options: [
                  { value: 'CATEGORY', label: 'Category' },
                  { value: 'VENDOR', label: 'Vendor' },
                  { value: 'SEASON', label: 'Season' },
                  { value: 'GROUP', label: 'Group' },
                  { value: 'KEYWORD_ADD', label: 'Keyword add' },
                  { value: 'KEYWORD_REMOVE', label: 'Keyword remove' },
                ],
              },
              ...attributeActionOptionGroups,
            ]}
          />
          <span style={{ marginLeft: 12 }}>{meta.verb}:</span>
          {renderTargetField()}
          <Popconfirm
            title={`${meta.verb} for ${selectedCodes.length} SKU${selectedCodes.length === 1 ? '' : 's'}?`}
            description="Reversible via Batch History."
            okText="Apply"
            cancelText="Cancel"
            onConfirm={applyChange}
            disabled={selectedCodes.length === 0 || !targetReady}
          >
            <Button
              type="primary"
              loading={apply.isPending}
              disabled={selectedCodes.length === 0 || !targetReady}
            >
              Apply
            </Button>
          </Popconfirm>
        </Space>
      </Space>
    </Card>
  )
}
