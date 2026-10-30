import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 开发时前端跑 vite（5173），数据接口转发给本地服务（4173）
const devPort = Number(process.env.DEV_PORT) || 5173
const previewPort = Number(process.env.PORT) || 4173
const apiTarget = `http://127.0.0.1:${Number(process.env.API_PORT) || 4173}`

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    host: '0.0.0.0',
    port: devPort,
    allowedHosts: true,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: previewPort,
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    assetsInlineLimit: 4096,
  },
})
