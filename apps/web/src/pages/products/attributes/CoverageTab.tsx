import { useMemo } from 'react'
import { Alert, Descriptions, Space, Typography } from 'antd'
import { useAttributeCoverage } from '../../../hooks/useProductsAttributes'
import type { AttributeDimension } from '../../../types/productsAttributes'

interface Props {
  dimension: AttributeDimension
}

function fmtInt(n: number | undefined | null): string {
  return (n ?? 0).toLocaleString('en-US')
}

export default function CoverageTab({ dimension }: Props) {
  const { data: coverage, isLoading } = useAttributeCoverage()

  const row = useMemo(
    () => coverage?.find((c) => c.dimensionCode === dimension.code),
    [coverage, dimension.code],
  )

  if (isLoading) {
    return <Typography.Text type="secondary">Cargando cobertura…</Typography.Text>
  }
  if (!row) {
    return (
      <Alert
        type="info"
        message="Sin datos de cobertura para esta dimensión"
        description="La cobertura se mide contra rics_mirror.inventory_master. Si no aparecen valores, asegúrese de que el sync RICS se ha ejecutado."
      />
    )
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Descriptions size="small" column={3} bordered>
        <Descriptions.Item label="SKUs totales">{fmtInt(row.totalSkus)}</Descriptions.Item>
        <Descriptions.Item label="SKUs clasificados">{fmtInt(row.classifiedSkus)}</Descriptions.Item>
        <Descriptions.Item label="Cobertura">{row.coveragePct.toFixed(1)}%</Descriptions.Item>
        <Descriptions.Item label="Desde keywords">{fmtInt(row.bySource.keyword)}</Descriptions.Item>
        <Descriptions.Item label="Desde Excel">{fmtInt(row.bySource.excel)}</Descriptions.Item>
        <Descriptions.Item label="Desde operador">{fmtInt(row.bySource.operator)}</Descriptions.Item>
      </Descriptions>
      <Typography.Text type="secondary">
        Cobertura significa: cuántos SKUs únicos tienen al menos una asignación en esta dimensión,
        dividido entre el total de SKUs en <code>rics_mirror.inventory_master</code>.
      </Typography.Text>
    </Space>
  )
}
