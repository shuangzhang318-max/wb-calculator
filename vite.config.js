import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 还原为本地开发模式，去除了 GitHub Pages 的 base 路径限制
export default defineConfig({
  plugins: [react()],
})