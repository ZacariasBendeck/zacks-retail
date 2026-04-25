import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { BarChart, PieChart } from 'echarts/charts'
import {
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { CustomerMetricsSummary } from '../../types/customerKpi'

echarts.use([BarChart, PieChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent, CanvasRenderer])

const RISK_COLORS = {
  LOW: '#52c41a',
  MEDIUM: '#faad14',
  HIGH: '#f5222d',
  UNKNOWN: '#bfbfbf',
}

function useEchart(option: echarts.EChartsCoreOption | null, height = 280) {
  const ref = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)
  useEffect(() => {
    if (!ref.current || !option) return
    if (!chartRef.current) {
      chartRef.current = echarts.init(ref.current)
    }
    chartRef.current.setOption(option, true)
    const handle = () => chartRef.current?.resize()
    window.addEventListener('resize', handle)
    return () => {
      window.removeEventListener('resize', handle)
    }
  }, [option])

  useEffect(() => {
    return () => {
      chartRef.current?.dispose()
      chartRef.current = null
    }
  }, [])

  return { ref, height }
}

export function CustomerValueChart({ ltvDistribution }: { ltvDistribution: CustomerMetricsSummary['ltvDistribution'] }) {
  const option: echarts.EChartsCoreOption = {
    grid: { left: 60, right: 24, top: 24, bottom: 36 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: {
      type: 'category',
      data: ltvDistribution.map((b) => b.band),
      axisLabel: { fontSize: 11 },
    },
    yAxis: { type: 'value', axisLabel: { fontSize: 11 } },
    series: [
      {
        type: 'bar',
        data: ltvDistribution.map((b) => b.count),
        itemStyle: { color: '#1677ff', borderRadius: [4, 4, 0, 0] },
        barWidth: '60%',
      },
    ],
  }
  const { ref, height } = useEchart(option, 280)
  return <div ref={ref} style={{ width: '100%', height }} />
}

export function ChurnRiskChart({ churnDistribution }: { churnDistribution: CustomerMetricsSummary['churnDistribution'] }) {
  const data = [
    { name: 'Low', value: churnDistribution.low, itemStyle: { color: RISK_COLORS.LOW } },
    { name: 'Medium', value: churnDistribution.medium, itemStyle: { color: RISK_COLORS.MEDIUM } },
    { name: 'High', value: churnDistribution.high, itemStyle: { color: RISK_COLORS.HIGH } },
    { name: 'Unknown', value: churnDistribution.unknown, itemStyle: { color: RISK_COLORS.UNKNOWN } },
  ].filter((d) => d.value > 0)

  const option: echarts.EChartsCoreOption = {
    tooltip: { trigger: 'item' },
    legend: { bottom: 0, fontSize: 12 },
    series: [
      {
        type: 'pie',
        radius: ['45%', '70%'],
        avoidLabelOverlap: false,
        label: { show: false },
        labelLine: { show: false },
        data,
      },
    ],
  }
  const { ref, height } = useEchart(option, 280)
  return <div ref={ref} style={{ width: '100%', height }} />
}

export function ChannelSplitChart({
  channelDistribution,
}: {
  channelDistribution: CustomerMetricsSummary['channelDistribution']
}) {
  const data = [
    { name: 'Store Only', value: channelDistribution.storeOnly, itemStyle: { color: '#1677ff' } },
    { name: 'Online Only', value: channelDistribution.onlineOnly, itemStyle: { color: '#722ed1' } },
    { name: 'Omnichannel', value: channelDistribution.omnichannel, itemStyle: { color: '#13c2c2' } },
    { name: 'Unknown', value: channelDistribution.unknown, itemStyle: { color: '#bfbfbf' } },
  ].filter((d) => d.value > 0)

  const option: echarts.EChartsCoreOption = {
    tooltip: { trigger: 'item' },
    legend: { bottom: 0, fontSize: 12 },
    series: [
      {
        type: 'pie',
        radius: ['45%', '70%'],
        label: { show: false },
        labelLine: { show: false },
        data,
      },
    ],
  }
  const { ref, height } = useEchart(option, 280)
  return <div ref={ref} style={{ width: '100%', height }} />
}

export function DiscountDistributionChart({ rows }: { rows: Array<{ discountRatio: number | null }> }) {
  const buckets = [
    { label: '0-20%', min: 0, max: 0.2, color: '#52c41a' },
    { label: '21-50%', min: 0.2, max: 0.5, color: '#1677ff' },
    { label: '51-80%', min: 0.5, max: 0.8, color: '#faad14' },
    { label: '81-100%', min: 0.8, max: 1.001, color: '#f5222d' },
  ]
  const counts = buckets.map(
    (b) =>
      rows.filter((r) => r.discountRatio != null && r.discountRatio >= b.min && r.discountRatio < b.max).length,
  )
  const option: echarts.EChartsCoreOption = {
    grid: { left: 60, right: 24, top: 24, bottom: 36 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: { type: 'category', data: buckets.map((b) => b.label) },
    yAxis: { type: 'value' },
    series: [
      {
        type: 'bar',
        data: counts.map((value, index) => ({
          value,
          itemStyle: { color: buckets[index]!.color, borderRadius: [4, 4, 0, 0] },
        })),
        barWidth: '60%',
      },
    ],
  }
  const { ref, height } = useEchart(option, 260)
  return <div ref={ref} style={{ width: '100%', height }} />
}
