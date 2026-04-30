import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Vite 配置函数：集中声明 React 插件、测试环境和构建入口，方便静态托管直接部署 dist。
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
});
