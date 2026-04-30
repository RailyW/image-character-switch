import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Vite 配置函数：集中声明 React 插件、测试环境和构建入口，方便静态托管直接部署 dist。
export default defineConfig(({ mode }) => {
  const isGitHubPagesBuild = mode === 'github-pages';

  return {
    // GitHub Pages 项目站点部署在 /image-character-switch/ 子路径下，本地和其他静态平台仍使用根路径。
    base: isGitHubPagesBuild ? '/image-character-switch/' : '/',
    plugins: [react()],
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setup.ts',
    },
  };
});
