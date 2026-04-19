import { Card, Col, Row, Typography } from 'antd'
import { Link } from 'react-router-dom'

const TILES: Array<{ path: string; title: string; description: string }> = [
  { path: '/products/taxonomy/departments', title: 'Departments', description: 'RICS p. 144 — group categories (1–99).' },
  { path: '/products/taxonomy/categories', title: 'Categories', description: 'RICS p. 145 — required on every SKU (1–999).' },
  { path: '/products/taxonomy/groups', title: 'Groups', description: 'RICS p. 145 — 3-char code for bulk operations.' },
  { path: '/products/taxonomy/keywords', title: 'Keywords', description: 'RICS p. 165 — 10-char tags (space-separated on SKU).' },
  { path: '/products/taxonomy/seasons', title: 'Seasons', description: 'RICS p. 218 — 1-char season code (read-only in Phase 1).' },
  { path: '/products/taxonomy/sectors', title: 'Sectors', description: 'RICS p. 144 — department rollup groups.' },
  { path: '/products/taxonomy/return-codes', title: 'Return Codes', description: 'RICS p. 166 — 1–99, with trackable flag.' },
  { path: '/products/taxonomy/promotion-codes', title: 'Promotion Codes', description: 'RICS p. 167 — 6-char promo identifiers.' },
  { path: '/products/taxonomy/size-types', title: 'Size Types', description: 'RICS p. 147 — 54×27 grid shapes.' },
]

export default function TaxonomyHomePage() {
  return (
    <div>
      <Typography.Title level={3}>Products taxonomy</Typography.Title>
      <Typography.Paragraph type="secondary">
        Reference data backing the products module. Edits land directly against the live RICS
        Access files; the page below each tile is the editor for that entity.
      </Typography.Paragraph>
      <Row gutter={[16, 16]}>
        {TILES.map((t) => (
          <Col xs={24} sm={12} md={8} key={t.path}>
            <Link to={t.path}>
              <Card hoverable title={t.title}>
                <Typography.Text type="secondary">{t.description}</Typography.Text>
              </Card>
            </Link>
          </Col>
        ))}
      </Row>
    </div>
  )
}
