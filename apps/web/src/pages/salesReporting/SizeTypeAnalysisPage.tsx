import { Alert, Breadcrumb, Typography } from 'antd'
import { Link } from 'react-router-dom'

const { Title, Paragraph } = Typography

export default function SizeTypeAnalysisPage() {
  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: <Link to="/reports/sales">Sales Reports</Link> },
          { title: 'Size Type Analysis' },
        ]}
      />
      <Title level={2} style={{ marginBottom: 0 }}>Size Type Analysis</Title>
      <Paragraph type="secondary">
        Size-grid distribution of sales and on-hand across a size type (RICS Ch. 6 p. 99).
      </Paragraph>

      <Alert
        type="info"
        showIcon
        message="Report not yet implemented"
        description={
          <>
            The adapter + endpoint for this report have not been built yet. When wired up, it will
            pivot <code>TicketDetail.Column</code> / <code>Row</code> against the selected SizeType
            in <code>RISIZE.SizeTypes</code>, comparing sold vs. on-hand per cell.
          </>
        }
      />
    </div>
  )
}
