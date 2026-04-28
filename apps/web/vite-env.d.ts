/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_MOCK_OTB_SUMMARY?: 'true' | 'false'
  readonly VITE_USE_MOCK_OTB_LINES?: 'true' | 'false'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
