import { Alert, Button, Card, Typography } from 'antd'
import { useNavigate, useParams } from 'react-router-dom'
import { useCategory } from '../../hooks/useProductsTaxonomy'

export default function CategoryFormPage() {
  const { number } = useParams<{ number: string }>()
  const navigate = useNavigate()
  const editing = number != null && number !== 'new'
  const n = editing ? Number(number) : undefined
  const { data } = useCategory(n)

  return (
    <Card title={<Typography.Text strong>{editing ? 'Category details' : 'New category'}</Typography.Text>}>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Category writes are not available on Render yet."
        description="During Development Against RICS Mirror, categories are served from rics_mirror.categories and remain read-only until a Postgres overlay is built."
      />
      {editing && data ? (
        <>
          <Typography.Paragraph>
            <strong>Number:</strong> {data.number}
          </Typography.Paragraph>
          <Typography.Paragraph>
            <strong>Description:</strong> {data.description}
          </Typography.Paragraph>
        </>
      ) : null}
      {!editing ? (
        <Typography.Paragraph type="secondary">
          Creating a new category is intentionally disabled in this rollout stage.
        </Typography.Paragraph>
      ) : null}
      <Button type="primary" onClick={() => navigate('/products/taxonomy/categories')}>
        Back to categories
      </Button>
    </Card>
  )
}
