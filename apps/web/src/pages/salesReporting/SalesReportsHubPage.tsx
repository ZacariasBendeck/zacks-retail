import { Card, Col, Row, Typography, Breadcrumb } from 'antd'
import {
  LineChartOutlined,
  TrophyOutlined,
  CalendarOutlined,
  DatabaseOutlined,
  ColumnHeightOutlined,
  FundOutlined,
} from '@ant-design/icons'
import { Link } from 'react-router-dom'

const { Title, Paragraph } = Typography

interface ReportCard {
  title: string
  description: string
  citation: string
  to: string
  icon: React.ReactNode
}

const REPORTS: ReportCard[] = [
  {
    title: 'Sales Analysis',
    description:
      'Flagship multi-dimensional analysis: category / vendor / season grouping with GP %, prior-year comparison.',
    citation: 'RICS Ch. 6 p. 88',
    to: '/reports/sales/analysis',
    icon: <LineChartOutlined />,
  },
  {
    title: 'Best Sellers',
    description: 'Top-N ranked by qty / net sales / profit across SKU / vendor / category / store.',
    citation: 'RICS Ch. 6 p. 93',
    to: '/reports/sales/best-sellers',
    icon: <TrophyOutlined />,
  },
  {
    title: 'Sales History by Month',
    description: 'Month-over-month sales trend by category, vendor, or department.',
    citation: 'RICS Ch. 6 p. 95',
    to: '/reports/sales/history-by-month',
    icon: <CalendarOutlined />,
  },
  {
    title: 'Stock Status',
    description:
      'On-hand / on-order / model / short / critical, filterable by vendor, category, or status.',
    citation: 'RICS Ch. 6 p. 96',
    to: '/reports/sales/stock-status',
    icon: <DatabaseOutlined />,
  },
  {
    title: 'Size Type Analysis',
    description:
      'Size-grid distribution of sales and on-hand across a size type — which sizes sell, which sit.',
    citation: 'RICS Ch. 6 p. 99',
    to: '/reports/sales/size-type-analysis',
    icon: <ColumnHeightOutlined />,
  },
  {
    title: 'Open To Buy vs Sales',
    description:
      'Planned OTB dollars vs. actual sales — variance per store × category × month.',
    citation: 'RICS Ch. 6 p. 100',
    to: '/reports/sales/otb-vs-sales',
    icon: <FundOutlined />,
  },
]

export default function SalesReportsHubPage() {
  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[{ title: 'Reports' }, { title: 'Sales' }]}
      />
      <Title level={2} style={{ marginBottom: 0 }}>
        Sales Reports
      </Title>
      <Paragraph type="secondary" style={{ marginBottom: 24 }}>
        Live read-through to the legacy RICS sales database. Data reflects posted and unposted
        sales tickets as they appear in RITRNSSV.
      </Paragraph>
      <Row gutter={[16, 16]}>
        {REPORTS.map((r) => (
          <Col key={r.to} xs={24} sm={12} lg={8}>
            <Link to={r.to} style={{ display: 'block' }}>
              <Card hoverable style={{ height: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <span style={{ fontSize: 24, color: '#1677ff' }}>{r.icon}</span>
                  <Title level={4} style={{ margin: 0 }}>
                    {r.title}
                  </Title>
                </div>
                <Paragraph style={{ marginBottom: 8 }}>{r.description}</Paragraph>
                <Paragraph type="secondary" style={{ margin: 0, fontSize: 12 }}>
                  {r.citation}
                </Paragraph>
              </Card>
            </Link>
          </Col>
        ))}
      </Row>
    </div>
  )
}
