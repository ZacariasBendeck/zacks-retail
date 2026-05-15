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
    port: 3100,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
