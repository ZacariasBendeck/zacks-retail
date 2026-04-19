import { useEffect, useMemo, useRef } from 'react'
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { OtbTrendPoint } from '../../types/otb'

echarts.use([BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

interface WeeklyBudgetVsActualChartProps {
  points: OtbTrendPoint[]
  height?: number
}

export default function WeeklyBudgetVsActualChart({
  points,
  height = 320,
}: WeeklyBudgetVsActualChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  const option = useMemo(
    () => ({
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        valueFormatter: (value: number) => `$${value.toLocaleString('en-US')}`,
      },
      legend: {
        top: 0,
      },
      grid: {
        left: 16,
        right: 16,
        top: 38,
        bottom: 18,
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: points.map((point) => point.weekLabel),
        axisTick: { alignWithLabel: true },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          formatter: (value: number) => `$${Math.round(value / 1000)}k`,
        },
      },
      series: [
        {
          name: 'Budget',
          type: 'bar',
          barGap: 0,
          data: points.map((point) => point.budgetAmount),
          itemStyle: { color: '#2f54eb' },
        },
        {
          name: 'Actual',
          type: 'bar',
          data: points.map((point) => point.actualAmount),
          itemStyle: { color: '#13c2c2' },
        },
      ],
    }),
    [points],
  )

  useEffect(() => {
    if (!containerRef.current) return
    const chart = echarts.init(containerRef.current)
    chart.setOption(option)

    const handleResize = () => chart.resize()
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.dispose()
    }
  }, [option])

  return <div ref={containerRef} style={{ width: '100%', height }} />
}
