import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { MenuOutlined, CloseOutlined, RightOutlined } from '@ant-design/icons'
import { Button, Drawer, Collapse } from 'antd'
import { useTranslation } from '@benlow-rics/i18n/react'
import { useFacets } from '@/hooks/useProducts'
import type { Facets } from '@/types/product'

interface SubcategoryGroup {
  title: string
  items: { label: string; params: Record<string, string> }[]
}

interface MenuItem {
  key: string
  label: string
  groups: SubcategoryGroup[]
}

function buildMenuItems(facets: Facets | undefined, t: (key: string) => string): MenuItem[] {
  const departments = facets?.departments ?? []
  const categories = facets?.categories ?? []
  const brands = facets?.brands ?? []

  const deptMap: Record<string, string> = {
    FORMAL: 'Formal',
    CASUAL: 'Casual',
    FIESTA: t('nav.party'),
    SANDALIAS: t('nav.sandals'),
    BOOTS: t('nav.boots'),
    COMFORT: t('nav.comfort'),
  }

  const topCategories = categories.slice(0, 12)
  const topBrands = brands.slice(0, 12)

  return [
    {
      key: 'zapatos',
      label: t('nav.shoes'),
      groups: [
        {
          title: t('nav.departments'),
          items: departments.map(d => ({
            label: deptMap[d.name] ?? d.name,
            params: { department: d.name },
          })),
        },
        {
          title: t('nav.categories'),
          items: topCategories.map(c => ({
            label: c.name,
            params: { categoryId: String(c.id) },
          })),
        },
        {
          title: t('nav.popularBrands'),
          items: topBrands.slice(0, 6).map(b => ({
            label: b.name,
            params: { brandId: String(b.id) },
          })),
        },
      ],
    },
    {
      key: 'formal',
      label: t('nav.formal'),
      groups: [
        {
          title: t('nav.categories'),
          items: topCategories.map(c => ({
            label: c.name,
            params: { department: 'FORMAL', categoryId: String(c.id) },
          })),
        },
        {
          title: t('nav.brands'),
          items: topBrands.slice(0, 8).map(b => ({
            label: b.name,
            params: { department: 'FORMAL', brandId: String(b.id) },
          })),
        },
      ],
    },
    {
      key: 'casual',
      label: t('nav.casual'),
      groups: [
        {
          title: t('nav.categories'),
          items: topCategories.map(c => ({
            label: c.name,
            params: { department: 'CASUAL', categoryId: String(c.id) },
          })),
        },
        {
          title: t('nav.brands'),
          items: topBrands.slice(0, 8).map(b => ({
            label: b.name,
            params: { department: 'CASUAL', brandId: String(b.id) },
          })),
        },
      ],
    },
    {
      key: 'fiesta',
      label: t('nav.party'),
      groups: [
        {
          title: t('nav.categories'),
          items: topCategories.map(c => ({
            label: c.name,
            params: { department: 'FIESTA', categoryId: String(c.id) },
          })),
        },
        {
          title: t('nav.brands'),
          items: topBrands.slice(0, 8).map(b => ({
            label: b.name,
            params: { department: 'FIESTA', brandId: String(b.id) },
          })),
        },
      ],
    },
    {
      key: 'sandalias',
      label: t('nav.sandals'),
      groups: [
        {
          title: t('nav.styles'),
          items: topCategories.slice(0, 8).map(c => ({
            label: c.name,
            params: { department: 'SANDALIAS', categoryId: String(c.id) },
          })),
        },
        {
          title: t('nav.brands'),
          items: topBrands.slice(0, 6).map(b => ({
            label: b.name,
            params: { department: 'SANDALIAS', brandId: String(b.id) },
          })),
        },
      ],
    },
    {
      key: 'botas',
      label: t('nav.boots'),
      groups: [
        {
          title: t('nav.styles'),
          items: topCategories.slice(0, 8).map(c => ({
            label: c.name,
            params: { department: 'BOOTS', categoryId: String(c.id) },
          })),
        },
        {
          title: t('nav.brands'),
          items: topBrands.slice(0, 6).map(b => ({
            label: b.name,
            params: { department: 'BOOTS', brandId: String(b.id) },
          })),
        },
      ],
    },
    {
      key: 'comfort',
      label: t('nav.comfort'),
      groups: [
        {
          title: t('nav.categories'),
          items: topCategories.slice(0, 8).map(c => ({
            label: c.name,
            params: { department: 'COMFORT', categoryId: String(c.id) },
          })),
        },
        {
          title: t('nav.brands'),
          items: topBrands.slice(0, 6).map(b => ({
            label: b.name,
            params: { department: 'COMFORT', brandId: String(b.id) },
          })),
        },
      ],
    },
    {
      key: 'marcas',
      label: t('nav.brands'),
      groups: [
        {
          title: t('nav.brandsAM'),
          items: topBrands.filter((_, i) => i % 2 === 0).map(b => ({
            label: b.name,
            params: { brandId: String(b.id) },
          })),
        },
        {
          title: t('nav.brandsNZ'),
          items: topBrands.filter((_, i) => i % 2 === 1).map(b => ({
            label: b.name,
            params: { brandId: String(b.id) },
          })),
        },
      ],
    },
    {
      key: 'outlet',
      label: t('nav.outlet'),
      groups: [],
    },
  ]
}

function DropdownPanel({
  item,
  onNavigate,
}: {
  item: MenuItem
  onNavigate: (params: Record<string, string>) => void
}) {
  const nonEmptyGroups = item.groups.filter(g => g.items.length > 0)
  if (!nonEmptyGroups.length) return null

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${Math.min(nonEmptyGroups.length, 4)}, 1fr)`,
      gap: 32,
      padding: '24px 32px',
      maxWidth: 1400,
      margin: '0 auto',
    }}>
      {nonEmptyGroups.map(group => (
        <div key={group.title}>
          <div style={{
            fontWeight: 600,
            fontSize: 13,
            textTransform: 'uppercase',
            color: '#333',
            marginBottom: 12,
            paddingBottom: 8,
            borderBottom: '2px solid #1677ff',
          }}>
            {group.title}
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {group.items.map((sub, i) => (
              <li key={i}>
                <a
                  href="#"
                  onClick={(e) => { e.preventDefault(); onNavigate(sub.params) }}
                  style={{
                    display: 'block',
                    padding: '5px 0',
                    color: '#555',
                    textDecoration: 'none',
                    fontSize: 14,
                    transition: 'color 0.15s',
                  }}
                  onMouseEnter={e => { (e.target as HTMLElement).style.color = '#1677ff' }}
                  onMouseLeave={e => { (e.target as HTMLElement).style.color = '#555' }}
                >
                  {sub.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

export default function MegaMenu() {
  const navigate = useNavigate()
  const { t } = useTranslation('storefront')
  const { data: facets } = useFacets()
  const menuItems = buildMenuItems(facets, t)
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [mobileExpandedKey, setMobileExpandedKey] = useState<string | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleNavigate = useCallback((params: Record<string, string>) => {
    const sp = new URLSearchParams(params)
    sp.set('page', '1')
    navigate(`/?${sp}`)
    setActiveKey(null)
    setDrawerOpen(false)
    setMobileExpandedKey(null)
  }, [navigate])

  const handleMouseEnter = useCallback((key: string) => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    setActiveKey(key)
  }, [])

  const handleMouseLeave = useCallback(() => {
    closeTimer.current = setTimeout(() => setActiveKey(null), 150)
  }, [])

  const handleTopLevelClick = useCallback((item: MenuItem) => {
    if (!item.groups.length) {
      handleNavigate({})
      return
    }
    const deptKey = item.key.toUpperCase()
    const knownDepts = ['FORMAL', 'CASUAL', 'FIESTA', 'SANDALIAS', 'BOOTS', 'COMFORT']
    if (knownDepts.includes(deptKey === 'BOTAS' ? 'BOOTS' : deptKey)) {
      handleNavigate({ department: deptKey === 'BOTAS' ? 'BOOTS' : deptKey })
    } else if (item.key === 'zapatos' || item.key === 'outlet') {
      handleNavigate({})
    } else {
      handleNavigate({})
    }
  }, [handleNavigate])

  return (
    <>
      {/* Desktop mega menu */}
      <nav
        className="mega-menu-desktop"
        style={{ borderTop: '1px solid #f0f0f0' }}
        onMouseLeave={handleMouseLeave}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          maxWidth: 1400,
          margin: '0 auto',
          padding: '0 24px',
        }}>
          {menuItems.map(item => (
            <div
              key={item.key}
              onMouseEnter={() => handleMouseEnter(item.key)}
              style={{ position: 'relative' }}
            >
              <a
                href="#"
                onClick={(e) => { e.preventDefault(); handleTopLevelClick(item) }}
                style={{
                  display: 'block',
                  padding: '12px 16px',
                  fontWeight: 500,
                  fontSize: 14,
                  color: activeKey === item.key ? '#1677ff' : '#333',
                  textDecoration: 'none',
                  borderBottom: activeKey === item.key ? '2px solid #1677ff' : '2px solid transparent',
                  transition: 'color 0.15s, border-color 0.15s',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.label}
              </a>
            </div>
          ))}
        </div>

        {/* Dropdown overlay */}
        {activeKey && (() => {
          const item = menuItems.find(m => m.key === activeKey)
          if (!item || !item.groups.length) return null
          return (
            <div
              onMouseEnter={() => handleMouseEnter(activeKey)}
              onMouseLeave={handleMouseLeave}
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                background: '#fff',
                boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                borderTop: '1px solid #f0f0f0',
                zIndex: 99,
                animation: 'megaMenuFadeIn 0.15s ease',
              }}
            >
              <DropdownPanel item={item} onNavigate={handleNavigate} />
            </div>
          )
        })()}
      </nav>

      {/* Mobile hamburger button */}
      <div className="mega-menu-mobile-trigger" style={{ display: 'none' }}>
        <Button
          type="text"
          icon={<MenuOutlined />}
          onClick={() => setDrawerOpen(true)}
          style={{ fontSize: 20, padding: '4px 12px' }}
        />
      </div>

      {/* Mobile drawer */}
      <Drawer
        title={t('nav.menu')}
        placement="left"
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setMobileExpandedKey(null) }}
        width={300}
        closeIcon={<CloseOutlined />}
        styles={{ body: { padding: 0 } }}
      >
        <div>
          {menuItems.map(item => (
            <div key={item.key} style={{ borderBottom: '1px solid #f0f0f0' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 16px',
                  cursor: 'pointer',
                  fontWeight: 500,
                  color: mobileExpandedKey === item.key ? '#1677ff' : '#333',
                  background: mobileExpandedKey === item.key ? '#f5f8ff' : 'transparent',
                }}
                onClick={() => {
                  if (!item.groups.length) {
                    handleNavigate({})
                    return
                  }
                  setMobileExpandedKey(mobileExpandedKey === item.key ? null : item.key)
                }}
              >
                <span>{item.label}</span>
                {item.groups.length > 0 && (
                  <RightOutlined style={{
                    fontSize: 10,
                    transition: 'transform 0.2s',
                    transform: mobileExpandedKey === item.key ? 'rotate(90deg)' : 'none',
                  }} />
                )}
              </div>
              {mobileExpandedKey === item.key && item.groups.length > 0 && (
                <div style={{ padding: '0 16px 12px', background: '#fafafa' }}>
                  <Collapse
                    ghost
                    defaultActiveKey={item.groups.map(g => g.title)}
                    items={item.groups.filter(g => g.items.length > 0).map(group => ({
                      key: group.title,
                      label: <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase' as const }}>{group.title}</span>,
                      children: (
                        <div>
                          {group.items.map((sub, i) => (
                            <a
                              key={i}
                              href="#"
                              onClick={(e) => { e.preventDefault(); handleNavigate(sub.params) }}
                              style={{
                                display: 'block',
                                padding: '6px 0',
                                color: '#555',
                                textDecoration: 'none',
                                fontSize: 13,
                              }}
                            >
                              {sub.label}
                            </a>
                          ))}
                        </div>
                      ),
                    }))}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </Drawer>

      <style>{`
        @keyframes megaMenuFadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 767px) {
          .mega-menu-desktop { display: none !important; }
          .mega-menu-mobile-trigger { display: block !important; }
        }
        @media (min-width: 768px) {
          .mega-menu-mobile-trigger { display: none !important; }
        }
      `}</style>
    </>
  )
}
