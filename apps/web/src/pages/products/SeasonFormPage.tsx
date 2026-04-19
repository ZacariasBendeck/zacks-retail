import { Alert, Card, Typography, Button, Space } from 'antd'
import { useNavigate } from 'react-router-dom'

/**
 * Season Master create/edit is disabled in Phase 1 — the RISEMF.MDB file uses a
 * legacy Jet format that modern ACE OLE DB refuses to open. A placeholder page
 * is still rendered so the router doesn't 404 if anyone lands here via link.
 */
export default function SeasonFormPage() {
  const navigate = useNavigate()
  return (
    <Card title={<Typography.Text strong>Seasons — editor unavailable</Typography.Text>}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Alert
          type="warning"
          message="Season editor is disabled in Phase 1"
          description={
            <>
              RICS stores season definitions in RISEMF.MDB. This customer's copy of that file is in
              an older Jet format that the current OLE DB driver cannot open, so writes are
              intentionally blocked. Seasons can still be assigned to SKUs by typing the code; the
              list view shows every code currently in use.
            </>
          }
          showIcon
        />
        <Button onClick={() => navigate('/products/taxonomy/seasons')}>Back to seasons</Button>
      </Space>
    </Card>
  )
}
