import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom', 'i18next', 'react-i18next'],
    alias: {
      i18next: path.resolve(__dirname, './node_modules/i18next'),
      'react-i18next': path.resolve(__dirname, './node_modules/react-i18next'),
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/rics-images': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
