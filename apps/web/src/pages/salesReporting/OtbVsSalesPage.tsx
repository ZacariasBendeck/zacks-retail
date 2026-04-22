import { Alert } from 'antd'
import { Link } from 'react-router-dom'
import ReportHeader from '../../components/reports/ReportHeader'

export default function OtbVsSalesPage() {
  return (
    <div>
      <ReportHeader
        title="Open To Buy vs Sales"
        description="Planned OTB dollars vs. actual sales — variance per store × category × month."
        citation="RICS Ch. 6 p. 100"
        breadcrumb={[
          { title: <Link to="/reports/sales">Sales Reports</Link> },
          { title: 'Open To Buy vs Sales' },
        ]}
      />

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
