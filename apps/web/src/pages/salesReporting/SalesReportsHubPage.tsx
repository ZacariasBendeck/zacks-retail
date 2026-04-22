import { Card, Col, Row, Tag, Typography } from 'antd'
import {
  LineChartOutlined,
  TrophyOutlined,
  CalendarOutlined,
  DatabaseOutlined,
  ColumnHeightOutlined,
  FundOutlined,
} from '@ant-design/icons'
import { Link } from 'react-router-dom'
import ReportHeader from '../../components/reports/ReportHeader'

const { Paragraph } = Typography

interface ReportCard {
  title: string
  description: string
  citation: string
  to: string
  icon: React.ReactNode
  status?: 'live' | 'planned'
}

const REPORTS: ReportCard[] = [
  {
    title: 'Sales Analysis',
    description:
      'Flagship multi-dimensional analysis: category / vendor / season grouping with GP %, prior-year comparison.',
    citation: 'RICS Ch. 6 p. 88',
    to: '/reports/sales/analysis',
    icon: <LineChartOutlined />,
    status: 'live',
  },
  {
    title: 'Best Sellers',
    description: 'Top-N ranked by qty / net sales / profit across SKU / vendor / category / store.',
    citation: 'RICS Ch. 6 p. 93',
    to: '/reports/sales/best-sellers',
    icon: <TrophyOutlined />,
    status: 'live',
  },
  {
    title: 'Sales History by Month',
    description: 'Month-over-month sales trend by category, vendor, or department.',
    citation: 'RICS Ch. 6 p. 95',
    to: '/reports/sales/history-by-month',
    icon: <CalendarOutlined />,
    status: 'live',
  },
  {
    title: 'Stock Status',
    description:
      'On-hand / on-order / model / short / critical, filterable by vendor, category, or status.',
    citation: 'RICS Ch. 6 p. 96',
    to: '/reports/sales/stock-status',
    icon: <DatabaseOutlined />,
    status: 'live',
  },
  {
    title: 'Size Type Analysis',
    description:
      'Size-grid distribution of sales and on-hand across a size type — which sizes sell, which sit.',
    citation: 'RICS Ch. 6 p. 99',
    to: '/reports/sales/size-type-analysis',
    icon: <ColumnHeightOutlined />,
    status: 'planned',
  },
  {
    title: 'Open To Buy vs Sales',
    description:
      'Planned OTB dollars vs. actual sales — variance per store × category × month.',
    citation: 'RICS Ch. 6 p. 100',
    to: '/reports/sales/otb-vs-sales',
    icon: <FundOutlined />,
    status: 'planned',
  },
]

export default function SalesReportsHubPage() {
  return (
    <div>
      <ReportHeader
        title="Sales Reports"
        description="Live read-through to the legacy RICS sales database. Data reflects posted and unposted sales tickets as they appear in RITRNSSV."
        breadcrumb={[{ title: 'Reports' }, { title: 'Sales' }]}
        showCurrencyNote={false}
      />
      <Row gutter={[16, 16]}>
        {REPORTS.map((r) => (
          <Col key={r.to} xs={24} sm={12} lg={8}>
            <Link to={r.to} style={{ display: 'block', height: '100%' }}>
              <Card
                hoverable
                style={{
                  height: '100%',
                  opacity: r.status === 'planned' ? 0.85 : 1,
                }}
                styles={{ body: { display: 'flex', flexDirection: 'column', gap: 8, height: '100%' } }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 38,
                      height: 38,
                      borderRadius: 8,
                      background: 'rgba(22, 119, 255, 0.08)',
                      color: '#1677ff',
                      fontSize: 20,
                    }}
                  >
                    {r.icon}
                  </span>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <strong style={{ fontSize: 16 }}>{r.title}</strong>
                    {r.status === 'planned' && (
                      <Tag color="default" style={{ margin: 0, fontSize: 11 }}>Planned</Tag>
                    )}
                  </div>
                </div>
                <Paragraph style={{ margin: 0, flex: 1 }}>{r.description}</Paragraph>
                <Tag
                  style={{
                    alignSelf: 'flex-start',
                    margin: 0,
                    fontSize: 11,
                    background: 'transparent',
                    borderStyle: 'dashed',
                    color: 'rgba(0, 0, 0, 0.45)',
                  }}
                >
                  {r.citation}
                </Tag>
              </Card>
            </Link>
          </Col>
        ))}
      </Row>
    </div>
  )
}
