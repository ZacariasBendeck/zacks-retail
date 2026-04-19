import { Card, Col, Row, Typography, Breadcrumb } from 'antd'
import {
  BarChartOutlined,
  ClockCircleOutlined,
  UserOutlined,
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
    title: 'Sales by Day',
    description: 'Net sales by day for one store, with prior-year weekday comparison.',
    citation: 'RICS Ch. 6 p. 52',
    to: '/reports/others/sales-by-day',
    icon: <BarChartOutlined />,
  },
  {
    title: 'Sales by Time',
    description: 'Ticket count, units, and dollars bucketed by hour-of-day.',
    citation: 'RICS Ch. 2 p. 41',
    to: '/reports/others/sales-by-time',
    icon: <ClockCircleOutlined />,
  },
  {
    title: 'Salesperson Summary',
    description: 'Qty / $ / perks per salesperson, with optional vendor or category subtotals.',
    citation: 'RICS Ch. 2 p. 42',
    to: '/reports/others/salesperson-summary',
    icon: <UserOutlined />,
  },
]

export default function ReportsOthersHubPage() {
  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[{ title: 'Reports' }, { title: 'Others' }]}
      />
      <Title level={2} style={{ marginBottom: 0 }}>
        Other Reports
      </Title>
      <Paragraph type="secondary" style={{ marginBottom: 24 }}>
        Operational reports that complement the main Sales hub. Live read-through to the legacy
        RICS databases.
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
