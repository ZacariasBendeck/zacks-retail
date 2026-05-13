import { Card, Col, Row, Tag, Typography } from 'antd'
import {
  BarChartOutlined,
  ClockCircleOutlined,
  UserOutlined,
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
}

const REPORTS: ReportCard[] = [
  {
    title: 'Sales by Day',
    description: 'Net sales, tickets, and average ticket by day, with prior-year weekday comparison.',
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
      <ReportHeader
        title="Other Reports"
        description="Operational reports that complement the main Sales hub. Live read-through to the legacy RICS databases."
        breadcrumb={[{ title: 'Reports' }, { title: 'Others' }]}
        showCurrencyNote={false}
      />
      <Row gutter={[16, 16]}>
        {REPORTS.map((r) => (
          <Col key={r.to} xs={24} sm={12} lg={8}>
            <Link to={r.to} style={{ display: 'block', height: '100%' }}>
              <Card
                hoverable
                style={{ height: '100%' }}
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
                  <strong style={{ fontSize: 16 }}>{r.title}</strong>
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
