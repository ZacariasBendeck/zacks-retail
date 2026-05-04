import { useEffect, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Alert, Breadcrumb, Card, Col, Row, Space, Typography } from 'antd'
import { Link, useLocation, useParams } from 'react-router-dom'
import { getManualChapter, manualChapters } from '../../content/manualChapters'

function textFromNode(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textFromNode).join('')
  if (typeof node === 'object' && 'props' in node) {
    return textFromNode((node as { props?: { children?: ReactNode } }).props?.children)
  }
  return ''
}

function slugifyHeading(children: ReactNode): string {
  return textFromNode(children)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function manualRouteForHref(href: string, currentPath: string): string | null {
  if (href.startsWith('#')) return `${currentPath}${href}`
  const hrefParts = href.split('#')
  const rawPath = hrefParts[0] ?? ''
  const rawHash = hrefParts[1]
  if (rawPath.includes('/')) return null
  const fileName = rawPath.split('/').pop()
  if (!fileName?.toLowerCase().endsWith('.md')) return null
  const slug = fileName.replace(/\.md$/i, '').toLowerCase()
  const path = slug === 'index' ? '/manual' : `/manual/${slug}`
  return `${path}${rawHash ? `#${rawHash}` : ''}`
}

function heading(level: 1 | 2 | 3 | 4) {
  const Heading = ({ children }: { children?: ReactNode }) => (
    <Typography.Title
      id={slugifyHeading(children)}
      level={level}
      style={{ marginTop: level === 1 ? 0 : 24 }}
    >
      {children}
    </Typography.Title>
  )
  return Heading
}

export default function ManualPage() {
  const { chapterSlug } = useParams<{ chapterSlug?: string }>()
  const location = useLocation()
  const chapter = getManualChapter(chapterSlug)

  useEffect(() => {
    if (!location.hash) return
    window.setTimeout(() => {
      document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView?.({
        block: 'start',
      })
    }, 0)
  }, [location.hash, chapter?.slug])

  const markdownComponents: Components = {
    h1: heading(1),
    h2: heading(2),
    h3: heading(3),
    h4: heading(4),
    p: ({ children }) => <Typography.Paragraph>{children}</Typography.Paragraph>,
    a: ({ href, children }) => {
      if (!href) return <>{children}</>
      const manualRoute = manualRouteForHref(href, location.pathname)
      if (manualRoute) return <Link to={manualRoute}>{children}</Link>
      return (
        <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
          {children}
        </a>
      )
    },
    table: ({ children }) => (
      <div style={{ overflowX: 'auto', marginBottom: 16 }}>
        <table style={{ borderCollapse: 'collapse', minWidth: 520, width: '100%' }}>{children}</table>
      </div>
    ),
    th: ({ children }) => (
      <th style={{ border: '1px solid #d9d9d9', padding: '6px 8px', textAlign: 'left' }}>
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td style={{ border: '1px solid #d9d9d9', padding: '6px 8px', verticalAlign: 'top' }}>
        {children}
      </td>
    ),
    blockquote: ({ children }) => (
      <blockquote
        style={{
          borderLeft: '3px solid #1677ff',
          margin: '12px 0',
          paddingLeft: 12,
          color: 'rgba(0, 0, 0, 0.65)',
        }}
      >
        {children}
      </blockquote>
    ),
    code: ({ children }) => <Typography.Text code>{children}</Typography.Text>,
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Breadcrumb
        items={[
          { title: <Link to="/manual">Manual</Link> },
          { title: chapter?.title ?? 'Capítulo no encontrado' },
        ]}
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={6}>
          <Card size="small" title="Capítulos">
            <Space direction="vertical" size={8}>
              {manualChapters.map((item) => {
                const to = item.slug === 'index' ? '/manual' : `/manual/${item.slug}`
                return (
                  <Link key={item.slug} to={to} style={{ fontWeight: item.slug === chapter?.slug ? 600 : 400 }}>
                    {item.title}
                  </Link>
                )
              })}
            </Space>
          </Card>
        </Col>
        <Col xs={24} lg={18}>
          {chapter ? (
            <Card>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {chapter.content}
              </ReactMarkdown>
            </Card>
          ) : (
            <Alert
              type="warning"
              showIcon
              message="Capítulo no encontrado"
              description="El capítulo del manual solicitado no existe en docs/zacks-retail-manual."
            />
          )}
        </Col>
      </Row>
    </Space>
  )
}
