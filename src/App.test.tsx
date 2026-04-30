import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { renderImageFileToFrame, readImageDimensionsFromUrl } from './ascii/browserImage';
import { startAsciiConversion } from './ascii/workerClient';

vi.mock('./ascii/browserImage', () => ({
  readImageDimensionsFromUrl: vi.fn(),
  renderImageFileToFrame: vi.fn(),
}));

vi.mock('./ascii/workerClient', () => ({
  startAsciiConversion: vi.fn(),
}));

const mockedReadImageDimensionsFromUrl = vi.mocked(readImageDimensionsFromUrl);
const mockedRenderImageFileToFrame = vi.mocked(renderImageFileToFrame);
const mockedStartAsciiConversion = vi.mocked(startAsciiConversion);

// mockBrowserApis 函数：补齐 jsdom 中缺少的对象 URL 和剪贴板能力。
function mockBrowserApis(): void {
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:mock-image'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  });
}

// createTestImageFile 函数：生成测试上传文件，模拟真实图片选择流程。
function createTestImageFile(): File {
  return new File(['mock-image'], 'portrait.png', { type: 'image/png' });
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBrowserApis();

    mockedReadImageDimensionsFromUrl.mockResolvedValue({ width: 400, height: 300 });
    mockedRenderImageFileToFrame.mockResolvedValue({
      width: 100,
      height: 38,
      data: new Uint8ClampedArray(100 * 38 * 4),
    });
    mockedStartAsciiConversion.mockReturnValue({
      promise: Promise.resolve({
        text: '@@@@',
        columns: 4,
        rows: 1,
        durationMs: 3,
      }),
      cancel: vi.fn(),
    });
  });

  it('上传图片后会触发采样和 Worker 转换，并渲染字符结果', async () => {
    render(<App />);

    const input = screen.getByLabelText('选择图片');
    fireEvent.change(input, {
      target: {
        files: [createTestImageFile()],
      },
    });

    expect(await screen.findByText('@@@@')).toBeInTheDocument();
    expect(mockedReadImageDimensionsFromUrl).toHaveBeenCalledWith('blob:mock-image');
    expect(mockedRenderImageFileToFrame).toHaveBeenCalled();
    expect(mockedStartAsciiConversion).toHaveBeenCalled();
  });

  it('复制按钮会把当前字符画文本写入剪贴板', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('选择图片'), {
      target: {
        files: [createTestImageFile()],
      },
    });

    await screen.findByText('@@@@');
    fireEvent.click(screen.getByRole('button', { name: /复制/ }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('@@@@');
    });
  });
});
