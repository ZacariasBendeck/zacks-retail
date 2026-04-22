import { useEffect, useMemo, useState } from 'react'
import { Alert, Card, Col, Menu, Row, Spin, Typography } from 'antd'
import { useAttributeCoverage, useAttributeDimensions } from '../../../hooks/useProductsAttributes'
import CatalogDimensionPanel from './CatalogDimensionPanel'

export default function CatalogPage() {
  const { data: dimensions, isLoading, error } = useAttributeDimensions(true)
  const { data: coverage } = useAttributeCoverage()
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    if (!selected && dimensions && dimensions.length > 0) {
      const first = dimensions[0]
      if (first) setSelected(first.code)
    }
  }, [dimensions, selected])

  const coverageByDim = useMemo(() => {
    const map = new Map<string, { coveragePct: number; classifiedSkus: number; totalSkus: number }>()
    for (const c of coverage ?? []) {
      map.set(c.dimensionCode, {
        coveragePct: c.coveragePct,
        classifiedSkus: c.classifiedSkus,
        totalSkus: c.totalSkus,
      })
    }
    return map
  }, [coverage])

  const selectedDim = useMemo(
    () => dimensions?.find((d) => d.code === selected),
    [dimensions, selected]
  )

  if (isLoading) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    )
  }
  if (error) {
    return (
      <Alert
        type="error"
        message="Error al cargar el catálogo de atributos"
        description={(error as Error).message}
      />
    )
  }
  if (!dimensions || dimensions.length === 0) {
    return <Alert type="info" message="No hay dimensiones configuradas. Ejecute `pnpm seed:sku-attributes`." />
  }

  const menuItems = dimensions.map((d) => ({
    key: d.code,
    label: (
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span>{d.labelEs}</span>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {coverageByDim.get(d.code)?.coveragePct.toFixed(1) ?? '—'}%
        </Typography.Text>
      </div>
    ),
  }))

  const selectedCoverage = selected ? coverageByDim.get(selected) : undefined

  return (
    <div>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        Atributos extendidos
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        Catálogo de dimensiones y valores usados para clasificar SKUs más allá del vendor, categoría
        y temporada.
      </Typography.Paragraph>
      <Row gutter={16}>
        <Col xs={24} md={6}>
          <Card size="small" styles={{ body: { padding: 0 } }}>
            <Menu
              mode="inline"
              selectedKeys={selected ? [selected] : []}
              items={menuItems}
              onClick={({ key }) => setSelected(String(key))}
              style={{ borderRight: 0 }}
            />
          </Card>
        </Col>
        <Col xs={24} md={18}>
          <Card size="small" title={selectedDim?.labelEs ?? '—'}>
            {selectedCoverage ? (
              <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
                {selectedCoverage.classifiedSkus.toLocaleString('en-US')} SKUs clasificados de{' '}
                {selectedCoverage.totalSkus.toLocaleString('en-US')} ·{' '}
                {selectedCoverage.coveragePct.toFixed(1)}% de cobertura
              </Typography.Paragraph>
            ) : null}
            <CatalogDimensionPanel dimension={selectedDim} />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
