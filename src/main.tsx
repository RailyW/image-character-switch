import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

// mountApp 函数：把 React 应用挂载到静态 HTML 根节点。
function mountApp(): void {
  const rootElement = document.getElementById('root');

  if (!rootElement) {
    throw new Error('缺少应用根节点。');
  }

  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

mountApp();
