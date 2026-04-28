import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConfigProvider, App as AntApp } from 'antd'
import App from './App'
import { InquiryPopupProvider } from './components/inquiry-popup'
import { searchSkusForLookup } from './services/skuApi'
import './styles/productsCompactTable.css'
import './styles/reports.css'
import './styles/draggableModal.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

// Preload the SKU Lookup default page so the Inventory Inquiry modal shows
// its list instantly the first time it opens, regardless of which page the
// user lands on first. The query key + defaults match SkuLookup.tsx's
// defaults exactly — TanStack serves from cache on the real subscribe.
const SKU_LOOKUP_DEFAULT_PARAMS = {
  q: '',
  descContains: '',
  wholeWord: false,
  searchField: 'SKU' as const,
  limit: 50,
  offset: 0,
}
queryClient
  .prefetchQuery({
    queryKey: ['sku-lookup', SKU_LOOKUP_DEFAULT_PARAMS],
    queryFn: () => searchSkusForLookup(SKU_LOOKUP_DEFAULT_PARAMS),
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
  })
  .catch(() => {
    // Non-fatal — the modal will fetch on first open if the prefetch failed.
  })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        theme={{
          token: {
            colorPrimary: '#1677ff',
            borderRadius: 6,
          },
        }}
      >
        <AntApp>
          <BrowserRouter
            future={{
              v7_startTransition: true,
              v7_relativeSplatPath: true,
            }}
          >
            <InquiryPopupProvider>
              <App />
            </InquiryPopupProvider>
          </BrowserRouter>
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
