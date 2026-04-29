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
    return <Typography.Text type="secondary">Cargando cobertura...</Typography.Text>
  }
  if (!row) {
    return (
      <Alert
        type="info"
        message="Sin datos de cobertura para esta dimension"
        description="La cobertura se mide contra los SKUs activos en app.sku. Si no aparecen valores, verifique que el import de productos se haya ejecutado."
      />
    )
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Descriptions size="small" column={4} bordered>
        <Descriptions.Item label="SKUs totales">{fmtInt(row.totalSkus)}</Descriptions.Item>
        <Descriptions.Item label="SKUs en familia">{fmtInt(row.familySkus)}</Descriptions.Item>
        <Descriptions.Item label="Con valor en familia">{fmtInt(row.familyClassifiedSkus)}</Descriptions.Item>
        <Descriptions.Item label="Cobertura">{row.coveragePct.toFixed(1)}%</Descriptions.Item>
      </Descriptions>
      <Typography.Text type="secondary">
        Cobertura significa: SKUs de la familia con valor en esta dimension,
        dividido entre el total de SKUs activos de esa familia.
      </Typography.Text>
    </Space>
  )
}
