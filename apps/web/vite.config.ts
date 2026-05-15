import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom', 'i18next', 'react-i18next'],
    alias: {
      i18next: path.resolve(currentDir, './node_modules/i18next'),
      'react-i18next': path.resolve(currentDir, './node_modules/react-i18next'),
      '@': path.resolve(currentDir, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      // Product pictures served by the API from RICS_IMAGES_DIR (defaults to
      // C:/RICSWIN/ricspics). Without this proxy the <img src="/rics-images/…"/>
      // hits the Vite dev server, which returns the SPA HTML and the image fails
      // silently.
      '/rics-images': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined

          if (id.includes('node_modules/echarts')) return 'vendor-echarts'
          return undefined
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    globals: true,
  },
})
