import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // 必须添加 base 配置，否则部署后无法加载 JS/CSS 文件
  // 这里的 'wb-calculator' 必须与你在 GitHub 上创建的仓库名称完全一致
  base: '/wb-calculator/',
})