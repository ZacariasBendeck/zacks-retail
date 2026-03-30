import { useState, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Row, Col, Pagination, Spin, Empty, Button, Drawer } from 'antd'
import { FilterOutlined } from '@ant-design/icons'
import { useProducts } from '@/hooks/useProducts'
import Breadcrumbs from '@/components/Breadcrumbs'
import FacetedFilters, { type FilterState } from '@/components/FacetedFilters'
import SortBar from '@/components/SortBar'
import ProductCard from '@/components/ProductCard'
import type { ProductListParams } from '@/types/product'

function parseArrayParam(params: URLSearchParams, key: string): string[] {
  const val = params.get(key)
  return val ? val.split(',') : []
}

export default function ProductListingPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const filters: FilterState = {
    brand: parseArrayParam(searchParams, 'brand'),
    size: parseArrayParam(searchParams, 'size'),
    color: parseArrayParam(searchParams, 'color'),
    material: parseArrayParam(searchParams, 'material'),
    style: parseArrayParam(searchParams, 'style'),
    price_min: searchParams.get('price_min') ? Number(searchParams.get('price_min')) : undefined,
    price_max: searchParams.get('price_max') ? Number(searchParams.get('price_max')) : undefined,
  }

  const queryParams: ProductListParams = {
    page: Number(searchParams.get('page') ?? 1),
    pageSize: 24,
    sort: (searchParams.get('sort') as ProductListParams['sort']) ?? 'relevance',
    q: searchParams.get('q') ?? undefined,
    category: searchParams.get('category') ?? undefined,
    brand: filters.brand.length ? filters.brand : undefined,
    size: filters.size.length ? filters.size : undefined,
    color: filters.color.length ? filters.color : undefined,
    material: filters.material.length ? filters.material : undefined,
    style: filters.style.length ? filters.style : undefined,
    price_min: filters.price_min,
    price_max: filters.price_max,
  }

  const { data, isLoading } = useProducts(queryParams)

  const updateParams = useCallback((updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams)
    for (const [key, val] of Object.entries(updates)) {
      if (val) params.set(key, val)
      else params.delete(key)
    }
    navigate(`/?${params}`)
  }, [searchParams, navigate])

  const handleFiltersChange = useCallback((newFilters: FilterState) => {
    const params = new URLSearchParams(searchParams)
    const arrayKeys = ['brand', 'size', 'color', 'material', 'style'] as const
    for (const key of arrayKeys) {
      if (newFilters[key].length) params.set(key, newFilters[key].join(','))
      else params.delete(key)
    }
    if (newFilters.price_min != null) params.set('price_min', String(newFilters.price_min))
    else params.delete('price_min')
    if (newFilters.price_max != null) params.set('price_max', String(newFilters.price_max))
    else params.delete('price_max')
    params.set('page', '1')
    navigate(`/?${params}`)
  }, [searchParams, navigate])

  const handleSortChange = useCallback((sort: string) => {
    updateParams({ sort, page: '1' })
  }, [updateParams])

  const handlePageChange = useCallback((page: number) => {
    updateParams({ page: String(page) })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [updateParams])

  const filterSidebar = (
    <FacetedFilters
      facets={data?.facets}
      filters={filters}
      onChange={handleFiltersChange}
      loading={isLoading}
    />
  )

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '16px 24px' }}>
      <Breadcrumbs />

      {/* Mobile filter button */}
      <div className="mobile-filter-btn" style={{ display: 'none', marginBottom: 16 }}>
        <Button icon={<FilterOutlined />} onClick={() => setDrawerOpen(true)} block>
          Filtros
        </Button>
      </div>

      <Row gutter={24}>
        {/* Desktop sidebar */}
        <Col xs={0} sm={0} md={6} lg={5} xl={5} className="filter-sidebar">
          <div style={{ position: 'sticky', top: 120, maxHeight: 'calc(100vh - 140px)', overflowY: 'auto' }}>
            {filterSidebar}
          </div>
        </Col>

        {/* Product grid */}
        <Col xs={24} sm={24} md={18} lg={19} xl={19}>
          <SortBar
            total={data?.pagination.totalItems ?? 0}
            sort={queryParams.sort ?? 'relevance'}
            onSortChange={handleSortChange}
          />

          {isLoading ? (
            <div style={{ textAlign: 'center', padding: 80 }}>
              <Spin size="large" />
            </div>
          ) : !data?.data.length ? (
            <Empty description="No se encontraron productos" />
          ) : (
            <>
              <Row gutter={[16, 16]}>
                {data.data.map(product => (
                  <Col key={product.id} xs={12} sm={8} md={8} lg={6}>
                    <ProductCard product={product} />
                  </Col>
                ))}
              </Row>

              {data.pagination.totalPages > 1 && (
                <div style={{ textAlign: 'center', marginTop: 32, paddingBottom: 32 }}>
                  <Pagination
                    current={data.pagination.page}
                    total={data.pagination.totalItems}
                    pageSize={data.pagination.pageSize}
                    onChange={handlePageChange}
                    showSizeChanger={false}
                    showTotal={(total, range) => `${range[0]}-${range[1]} de ${total} productos`}
                  />
                </div>
              )}
            </>
          )}
        </Col>
      </Row>

      {/* Mobile filter drawer */}
      <Drawer
        title="Filtros"
        placement="left"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={300}
      >
        {filterSidebar}
      </Drawer>

      <style>{`
        @media (max-width: 767px) {
          .mobile-filter-btn { display: block !important; }
        }
      `}</style>
    </div>
  )
}
