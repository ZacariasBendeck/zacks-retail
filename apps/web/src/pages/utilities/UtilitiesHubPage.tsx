/**
 * Utilities hub — top-level landing page for the utilities module.
 *
 * Spec: docs/modules/utilities.md
 * RICS manual: Ch. 15 Utilities 2 (p. 193+).
 */

import { Card, Col, Row, Tag, Typography } from 'antd'
import { Link } from 'react-router-dom'

interface UtilityCard {
  title: string
  description: string
  to?: string
  status: 'active' | 'deferred'
  deferredReason?: string
  ricsPage: string
}

const CARDS: UtilityCard[] = [
  {
    title: 'Change SKU Attributes',
    description:
      'Search and select SKUs, then reassign their Category, Vendor, Season, or Group in one batch. The action picker lives next to the Apply button.',
    to: '/utilities/change-sku-attributes',
    status: 'active',
    ricsPage: 'p. 194',
  },
  {
    title: 'Change Keywords',
    description: 'Add or remove a keyword across SKUs matching criteria.',
    to: '/utilities/change-keywords',
    status: 'active',
    ricsPage: 'p. 195',
  },
  {
    title: 'Change Size Columns',
    description: 'Global rename of a size column label across every size type where it appears.',
    status: 'deferred',
    deferredReason: 'Phase A2 — schema decision pending',
    ricsPage: 'p. 193',
  },
  {
    title: 'Change Size Types',
    description: 'Restructure a size grid (add / move / delete columns and rows with consolidation).',
    status: 'deferred',
    deferredReason: 'Phase A2 — schema decision pending',
    ricsPage: 'p. 193',
  },
  {
    title: 'Batch History',
    description: 'Review every batch operation, drill into per-SKU before/after, undo in one click.',
    to: '/utilities/batch-history',
    status: 'active',
    ricsPage: '(new)',
  },
  {
    title: 'Check Data Integrity',
    description: 'Diagnose orphans and dangling references in the mirror. Rescoped as Ingest Diagnostics.',
    status: 'deferred',
    deferredReason: 'Separate planning exercise',
    ricsPage: 'p. 193',
  },
  {
    title: 'Reset Pictures',
    description: 'Auto-assign and clean up image filenames on SKUs.',
    status: 'deferred',
    deferredReason: 'Depends on products image pipeline',
    ricsPage: 'p. 193',
  },
  {
    title: 'Change Salespeople',
    description: 'Renumber or merge salesperson records.',
    status: 'deferred',
    deferredReason: 'Belongs to employees module',
    ricsPage: 'p. 193',
  },
]

export default function UtilitiesHubPage() {
  return (
    <div>
      <Typography.Title level={3}>Utilities</Typography.Title>
      <Typography.Paragraph type="secondary">
        Batch-change tools for SKU attributes and size-type taxonomy. All operations are
        transactional with per-SKU before/after snapshots — every batch is reversible from
        Batch History. Writes land in Postgres overlay tables; RICS MDBs are not modified.
      </Typography.Paragraph>

      <Row gutter={[16, 16]}>
        {CARDS.map((c) => (
          <Col xs={24} md={12} lg={8} key={c.title}>
            <Card
              hoverable={c.status === 'active'}
              title={
                <Typography.Text strong style={{ opacity: c.status === 'active' ? 1 : 0.6 }}>
                  {c.title}
                </Typography.Text>
              }
              extra={
                c.status === 'active' ? (
                  <Tag color="green">Active</Tag>
                ) : (
                  <Tag color="default">Deferred</Tag>
                )
              }
              style={{ opacity: c.status === 'active' ? 1 : 0.7 }}
            >
              <Typography.Paragraph>
                {c.description}{' '}
                <Typography.Text type="secondary">
                  RICS {c.ricsPage}.
                </Typography.Text>
              </Typography.Paragraph>
              {c.status === 'active' && c.to ? (
                <Link to={c.to}>Open →</Link>
              ) : (
                <Typography.Text type="secondary">{c.deferredReason}</Typography.Text>
              )}
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  )
}
