import { useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Row, Col, Pagination, Spin, Empty, Button, Drawer } from 'antd'
import { FilterOutlined } from '@ant-design/icons'
import { useProducts, useFacets } from '@/hooks/useProducts'
import Breadcrumbs from '@/components/Breadcrumbs'
import FacetedFilters, { type FilterState } from '@/components/FacetedFilters'
import SortBar from '@/components/SortBar'
import ProductCard from '@/components/ProductCard'
import ActiveFilters from '@/components/ActiveFilters'
import type { ProductListParams } from '@/types/product'
import { useState } from 'react'

function numParam(params: URLSearchParams, key: string): number | undefined {
  const val = params.get(key)
  return val ? Number(val) : undefined
}

export default function ProductListingPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const filters: FilterState = {
    brandId: numParam(searchParams, 'brandId'),
    colorId: numParam(searchParams, 'colorId'),
    sizeLabel: searchParams.get('sizeLabel') ?? undefined,
    categoryId: numParam(searchParams, 'categoryId'),
    department: searchParams.get('department') ?? undefined,
    materialId: numParam(searchParams, 'materialId'),
    minPrice: numParam(searchParams, 'minPrice'),
    maxPrice: numParam(searchParams, 'maxPrice'),
  }

  const sort = (searchParams.get('sort') as ProductListParams['sort']) ?? 'name'
  const order = (searchParams.get('order') as ProductListParams['order']) ?? 'asc'

  const queryParams: ProductListParams = {
    page: Number(searchParams.get('page') ?? 1),
    limit: 24,
    sort,
    order,
    q: searchParams.get('q') ?? undefined,
    ...filters,
  }

  const { data, isLoading } = useProducts(queryParams)
  const { data: facets } = useFacets({
    q: queryParams.q,
    department: filters.department,
    categoryId: filters.categoryId,
    brandId: filters.brandId,
    colorId: filters.colorId,
    sizeLabel: filters.sizeLabel,
    materialId: filters.materialId,
    minPrice: filters.minPrice,
    maxPrice: filters.maxPrice,
  })

  const updateParams = useCallback((updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams)
    for (const [key, val] of Object.entries(updates)) {
      if (val != null) params.set(key, val)
      else params.delete(key)
    }
    navigate(`/?${params}`)
  }, [searchParams, navigate])

  const handleFiltersChange = useCallback((newFilters: FilterState) => {
    const params = new URLSearchParams(searchParams)
    // Clear all filter params first
    for (const key of ['brandId', 'colorId', 'sizeLabel', 'categoryId', 'department', 'materialId', 'minPrice', 'maxPrice']) {
      params.delete(key)
    }
    // Set new ones
    for (const [key, val] of Object.entries(newFilters)) {
      if (val != null) params.set(key, String(val))
    }
    params.set('page', '1')
    navigate(`/?${params}`)
  }, [searchParams, navigate])

  const handleSortChange = useCallback((newSort: string, newOrder: string) => {
    updateParams({ sort: newSort, order: newOrder, page: '1' })
  }, [updateParams])

  const handlePageChange = useCallback((page: number) => {
    updateParams({ page: String(page) })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [updateParams])

  const filterSidebar = (
    <FacetedFilters
      facets={facets}
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
          <ActiveFilters
            filters={filters}
            facets={facets}
            onChange={handleFiltersChange}
          />

          <SortBar
            total={data?.pagination.totalItems ?? 0}
            sort={sort}
            order={order}
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
                    pageSize={data.pagination.limit}
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
