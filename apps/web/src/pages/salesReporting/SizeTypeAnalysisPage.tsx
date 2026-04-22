import { Alert } from 'antd'
import { Link } from 'react-router-dom'
import ReportHeader from '../../components/reports/ReportHeader'

export default function SizeTypeAnalysisPage() {
  return (
    <div>
      <ReportHeader
        title="Size Type Analysis"
        description="Size-grid distribution of sales and on-hand across a size type."
        citation="RICS Ch. 6 p. 99"
        breadcrumb={[
          { title: <Link to="/reports/sales">Sales Reports</Link> },
          { title: 'Size Type Analysis' },
        ]}
        showCurrencyNote={false}
      />

      <Alert
        type="info"
        showIcon
        message="Report not yet implemented"
        description={
          <>
            The adapter + endpoint for this report have not been built yet. When wired up, it will
            pivot <code>TicketDetail.Column</code> / <code>Row</code> against the selected SizeType
            in <code>RISIZE.SizeTypes</code>, comparing sold vs. on-hand per cell with heatmap-
            style cell shading keyed to sell-thru %.
          </>
        }
      />
    </div>
  )
}
