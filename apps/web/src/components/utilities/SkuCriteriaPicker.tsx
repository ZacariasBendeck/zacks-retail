/**
 * SkuCriteriaPicker — the shared criteria-based SKU selector used by every
 * utilities-module batch-change page (Change Keywords, Change Categories,
 * Change Vendors, Change Seasons, Change Group Codes). Also reusable by the
 * products' Bulk Price Discount screen when that module lands.
 *
 * Spec: docs/dev/specs/2026-04-21-utilities-batch-change-design.md
 * RICS manual reference: p. 195 (Change Keywords screen) — the canonical layout.
 *
 * The picker is purely presentational-plus-debounced-preview: it owns no mutation
 * state. The host page composes it + its own target-value form + submit logic.
 */

import { Card, Checkbox, Form, Input, Select, Space, Typography, Tag, Tooltip } from 'antd'
import { useMemo } from 'react'
import { useCategories, useGroups, useKeywords, useSeasons } from '../../hooks/useProductsTaxonomy'
import { useSkuLookup } from '../../hooks/useUtilities'
import type { SkuCriteria } from '../../services/utilitiesApi'

export interface SkuCriteriaPickerProps {
  value: SkuCriteria
  onChange: (next: SkuCriteria) => void
  /** Disable the "future price changes" / "WTD sales" checkboxes (feature-flagged). */
  disableFutureFilter?: boolean
  disableWtdFilter?: boolean
}

export function SkuCriteriaPicker({
  value,
  onChange,
  disableFutureFilter = true,     // Phase A: rics_mirror has no price_changes table yet
  disableWtdFilter = true,        // Phase A: WTD sales filter not wired yet
}: SkuCriteriaPickerProps) {
  const { data: categories = [] } = useCategories()
  const { data: seasons = [] } = useSeasons()
  const { data: groups = [] } = useGroups()
  const { data: keywords = [] } = useKeywords()

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ label: `${c.number} — ${c.description}`, value: c.number })),
    [categories],
  )
  const seasonOptions = useMemo(
    () => seasons.map((s) => ({ label: `${s.code} — ${s.description}`, value: s.code })),
    [seasons],
  )
  const groupOptions = useMemo(
    () => groups.map((g) => ({ label: `${g.code} — ${g.description}`, value: g.code })),
    [groups],
  )
  const keywordOptions = useMemo(
    () => keywords.map((k) => ({ label: k.keyword, value: k.keyword })),
    [keywords],
  )

  const patch = (p: Partial<SkuCriteria>) => onChange({ ...value, ...p })

  const { data: preview, isFetching } = useSkuLookup(value, 5)

  return (
    <Card size="small" title={<Typography.Text strong>Criteria</Typography.Text>}>
      <Form layout="vertical" size="small">
        <Form.Item label="SKUs (exact codes, comma/newline separated)">
          <Input.TextArea
            rows={2}
            placeholder="SKU001, SKU002"
            value={(value.skus ?? []).join(', ')}
            onChange={(e) => {
              const parts = e.target.value
                .split(/[\s,]+/)
                .map((s) => s.trim())
                .filter(Boolean)
              patch({ skus: parts.length ? parts : undefined })
            }}
          />
        </Form.Item>

        <Form.Item label="Categories">
          <Select<number[]>
            mode="multiple"
            value={value.categories ?? []}
            options={categoryOptions}
            onChange={(v) => patch({ categories: v.length ? v : undefined })}
            showSearch
            optionFilterProp="label"
            placeholder="Any category"
          />
        </Form.Item>

        <Form.Item label="Vendors (codes, comma/newline separated)">
          <Input.TextArea
            rows={1}
            placeholder="ACME, TIMBERLAND"
            value={(value.vendors ?? []).join(', ')}
            onChange={(e) => {
              const parts = e.target.value
                .split(/[\s,]+/)
                .map((s) => s.trim())
                .filter(Boolean)
              patch({ vendors: parts.length ? parts : undefined })
            }}
          />
        </Form.Item>

        <Form.Item label="Seasons">
          <Select<string[]>
            mode="multiple"
            value={value.seasons ?? []}
            options={seasonOptions}
            onChange={(v) => patch({ seasons: v.length ? v : undefined })}
            showSearch
            optionFilterProp="label"
            placeholder="Any season"
          />
        </Form.Item>

        <Form.Item label="Style/Color (substring match, comma separated)">
          <Input
            placeholder="BLACK, 12 RED"
            value={(value.stylesColors ?? []).join(', ')}
            onChange={(e) => {
              const parts = e.target.value
                .split(/,/)
                .map((s) => s.trim())
                .filter(Boolean)
              patch({ stylesColors: parts.length ? parts : undefined })
            }}
          />
        </Form.Item>

        <Form.Item label="Groups">
          <Select<string[]>
            mode="multiple"
            value={value.groups ?? []}
            options={groupOptions}
            onChange={(v) => patch({ groups: v.length ? v : undefined })}
            showSearch
            optionFilterProp="label"
            placeholder="Any group"
          />
        </Form.Item>

        <Form.Item label="Keywords">
          <Select<string[]>
            mode="multiple"
            value={value.keywords ?? []}
            options={keywordOptions}
            onChange={(v) => patch({ keywords: v.length ? v : undefined })}
            showSearch
            optionFilterProp="label"
            placeholder="Any keyword"
            allowClear
          />
        </Form.Item>

        <Space direction="vertical" style={{ width: '100%' }}>
          <Tooltip
            title={
              disableFutureFilter
                ? 'Not available in Phase A — requires scheduled price-change data in rics_mirror.'
                : undefined
            }
          >
            <Checkbox
              checked={!!value.onlyFuturePriceChanges}
              disabled={disableFutureFilter}
              onChange={(e) => patch({ onlyFuturePriceChanges: e.target.checked || undefined })}
            >
              Only change SKUs with future price changes
            </Checkbox>
          </Tooltip>
          <Tooltip
            title={
              disableWtdFilter
                ? 'Not available in Phase A — requires ticket history integration.'
                : undefined
            }
          >
            <Checkbox
              checked={!!value.onlyWtdSales}
              disabled={disableWtdFilter}
              onChange={(e) => patch({ onlyWtdSales: e.target.checked || undefined })}
            >
              Only change SKUs with Week-to-Date sales
            </Checkbox>
          </Tooltip>
        </Space>
      </Form>

      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f0f0f0' }}>
        <Space>
          <Typography.Text type="secondary">{isFetching ? 'Counting…' : 'Matches:'}</Typography.Text>
          <Typography.Text strong>{preview?.count ?? 0}</Typography.Text>
          <Typography.Text type="secondary">SKUs</Typography.Text>
        </Space>
        {preview && preview.sample.length > 0 && (
          <div style={{ marginTop: 8 }}>
            {preview.sample.map((s) => (
              <Tag key={s.sku} style={{ marginBottom: 4 }}>
                {s.sku} — {s.description ?? '(no description)'}
              </Tag>
            ))}
            {preview.count > preview.sample.length && (
              <Typography.Text type="secondary">
                … +{preview.count - preview.sample.length} more
              </Typography.Text>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}
