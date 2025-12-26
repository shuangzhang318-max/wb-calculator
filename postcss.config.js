export default {
  plugins: {
    // 关键：这是针对 Tailwind v4 的新版 PostCSS 插件
    '@tailwindcss/postcss': {},
    // 自动处理浏览器兼容性
    'autoprefixer': {},
  },
}