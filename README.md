# ASCII 字符画生成器

一个纯前端图片转 ASCII 字符画工具站，使用 React、Vite 和 TypeScript 构建。图片只在浏览器本地解码和转换，不上传到服务器，适合部署到 Cloudflare Pages 或 GitHub Pages。

## 功能

- 图片选择和拖拽上传。
- 灰度明暗字符画模式。
- Sobel 轮廓线稿字符画模式。
- 可选实验性线稿预处理，尽量把浅色铺底和绿色背景压成空白。
- 每行长度、精度、字符集、反色、边缘强度配置。
- Web Worker 后台转换，减少大图处理时的界面卡顿。
- 结果复制和 `.txt` 下载。

## 本地运行

```bash
npm install
npm run dev
```

## 验证

```bash
npm test
npm run build
npm run build:github-pages
```

## 部署

生产构建产物位于 `dist/`，可以直接部署为静态站点。

Cloudflare Pages 推荐配置：

- Build command: `npm run build`
- Build output directory: `dist`

GitHub Pages 推荐配置：

- 已内置 `.github/workflows/deploy-pages.yml`
- 每次推送到 `main` 时自动运行 `npm run build:github-pages`
- GitHub Pages 项目站点会使用 `/image-character-switch/` 作为资源基础路径
- 仓库 Pages Source 需要设置为 GitHub Actions

## 目录结构

- `src/App.tsx`：工具站主界面和交互流程。
- `src/ascii/`：图片采样、字符画算法、Worker 通信和模块 README。
- `src/hooks/`：通用 React Hook。
- `src/styles.css`：响应式界面样式。
