import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 每次构建一个版本号：页面里内置一份，同时写一个 version.json。
// GitHub Pages 会把 index.html 缓存 10 分钟，游戏里定时比对，发现新版本就提示刷新（用户 10-23 手机上看不到更新）
const BUILD = String(Date.now());

export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(BUILD) },
  plugins: [react(), {
    name: 'version-json',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD }) });
    },
  }],
  build: {
    // 兼容 iOS 13+ 的 Safari；打成单个普通脚本，在沙箱 iframe 里也能加载
    target: ['es2018', 'safari13'],
    cssTarget: 'safari13',
    modulePreload: false,
    rollupOptions: { output: { format: 'iife', inlineDynamicImports: true } },
  },
  test: { globals: true, environment: 'node' },
});
