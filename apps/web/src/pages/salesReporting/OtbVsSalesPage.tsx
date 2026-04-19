import { Alert, Breadcrumb, Typography } from 'antd'
import { Link } from 'react-router-dom'

const { Title, Paragraph } = Typography

export default function OtbVsSalesPage() {
  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: <Link to="/reports/sales">Sales Reports</Link> },
          { title: 'Open To Buy vs Sales' },
        ]}
      />
      <Title level={2} style={{ marginBottom: 0 }}>Open To Buy vs Sales</Title>
      <Paragraph type="secondary">
        Planned OTB dollars vs. actual sales — variance per store × category × month (RICS Ch. 6 p. 100).
      </Paragraph>

      <Alert
        type="info"
        showIcon
        message="Report not yet implemented"
        description={
          <>
            This report crosses modules: OTB plan data lives in <code>otb-planning</code> (local
            Postgres via Prisma), sales actuals come from <code>RITRNSSV</code>. It reads the OTB
            plan via <code>otbPlanningContract</code> and overlays the monthly rollup from{' '}
            <code>sales-reporting</code>.
          </>
        }
      />
    </div>
  )
}
