import { Alert, Button, Space, Tag, Typography } from 'antd'
import {
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import type { AiFillSummary, EnhancedAnalysisResult } from '../../../types/sku'

interface AiAnalysisPanelProps {
  analysisError: string | null
  analysisResult: EnhancedAnalysisResult | null
  aiFillSummary: AiFillSummary | null
  analyzing: boolean
  onRetry: () => void
}

/**
 * Renders below the Product Identity section (or wherever the parent slots it).
 * Three states: error (with retry), analysis-ready (preview of what IA saw),
 * fill summary (list of filled/skipped fields after "Llenar con IA").
 */
export function AiAnalysisPanel({
  analysisError,
  analysisResult,
  aiFillSummary,
  analyzing,
  onRetry,
}: AiAnalysisPanelProps) {
  if (!analysisError && !analysisResult && !aiFillSummary) return null

  return (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      {analysisError && (
        <Alert
          type="error"
          showIcon
          icon={<ExclamationCircleOutlined />}
          message="Fallo el análisis de imagen"
          description={
            <div>
              <Typography.Text>{analysisError}</Typography.Text>
              <div style={{ marginTop: 8 }}>
                <Button size="small" icon={<ReloadOutlined />} onClick={onRetry} loading={analyzing}>
                  Reintentar
                </Button>
              </div>
            </div>
          }
        />
      )}

      {analysisResult && !aiFillSummary && (
        <Alert
          type="info"
          showIcon
          message="Imagen analizada — lista para llenar"
          description={
            <div style={{ fontSize: 12 }}>
              {analysisResult.resolution && (
                <div style={{ marginBottom: 4, padding: '4px 8px', background: '#f0f9ff', borderRadius: 4 }}>
                  <strong>Categoría sugerida:</strong>{' '}
                  <Tag color="blue">
                    {analysisResult.resolution.categoryNumber} — {analysisResult.resolution.categoryDesc}
                  </Tag>
                  <strong style={{ marginLeft: 8 }}>Dept:</strong>{' '}
                  <Tag color="geekblue">
                    {analysisResult.resolution.departmentNumber} — {analysisResult.resolution.departmentDesc}
                  </Tag>
                </div>
              )}
              {analysisResult.raw.shoe_type && <span><strong>Tipo:</strong> {analysisResult.raw.shoe_type} | </span>}
              {analysisResult.raw.heel_height && <span><strong>Tacón:</strong> {analysisResult.raw.heel_height} | </span>}
              {analysisResult.raw.upper_material && <span><strong>Material:</strong> {analysisResult.raw.upper_material} | </span>}
              {analysisResult.raw.color && <span><strong>Color:</strong> {analysisResult.raw.color} | </span>}
              {analysisResult.raw.occasion && <span><strong>Ocasión:</strong> {analysisResult.raw.occasion}</span>}
              <br />
              <Typography.Text type="secondary">
                Haz clic en "Llenar con IA" para aplicar estos valores a los campos del formulario.
              </Typography.Text>
            </div>
          }
        />
      )}

      {aiFillSummary && (
        <Alert
          type="success"
          showIcon
          icon={<CheckCircleOutlined />}
          message={`IA llenó ${aiFillSummary.filled.length} de ${aiFillSummary.total} campos`}
          description={
            <div style={{ fontSize: 12 }}>
              {aiFillSummary.filled.length > 0 && (
                <div>
                  <strong>Llenados:</strong>{' '}
                  {aiFillSummary.filled.map((f) => (
                    <Tag key={f} color="green" style={{ marginBottom: 2 }}>
                      {f}
                    </Tag>
                  ))}
                </div>
              )}
              {aiFillSummary.skipped.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  <strong>No determinados:</strong>{' '}
                  {aiFillSummary.skipped.map((f) => (
                    <Tag key={f} style={{ marginBottom: 2 }}>
                      {f}
                    </Tag>
                  ))}
                </div>
              )}
              <Typography.Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
                Todos los valores son editables — ajústalos si es necesario.
              </Typography.Text>
            </div>
          }
        />
      )}
    </Space>
  )
}
