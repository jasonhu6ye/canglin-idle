import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    // 兼容 iOS 13+ 的 Safari；打成单个普通脚本，在沙箱 iframe 里也能加载
    target: ['es2018', 'safari13'],
    cssTarget: 'safari13',
    modulePreload: false,
    rollupOptions: { output: { format: 'iife', inlineDynamicImports: true } },
  },
  test: { globals: true, environment: 'node' },
});
