import { describe, expect, it } from 'vitest';
import { DEFAULT_ASCII_OPTIONS } from './constants';
import {
  calculateTargetSize,
  convertBrightnessToAscii,
  convertEdgesToAscii,
  convertFrameToAscii,
  createPreprocessedLineArtFrame,
  mapEdgeAngleToCharacter,
  normalizeAsciiOptions,
  selectBrightnessCharacter,
} from './convert';
import type { ImageFrame } from './types';

// createFrame 函数：用测试像素快速构造 ImageFrame，避免依赖浏览器 Canvas。
function createFrame(width: number, height: number, pixels: Array<[number, number, number, number]>): ImageFrame {
  const data = new Uint8ClampedArray(width * height * 4);

  pixels.forEach((pixel, pixelIndex) => {
    const dataIndex = pixelIndex * 4;

    // 每个测试像素都按 RGBA 写入，方便精确验证亮度和透明合成。
    data[dataIndex] = pixel[0];
    data[dataIndex + 1] = pixel[1];
    data[dataIndex + 2] = pixel[2];
    data[dataIndex + 3] = pixel[3];
  });

  return { width, height, data };
}

// repeatPixel 函数：生成指定数量的相同像素，用于构造规则测试图。
function repeatPixel(count: number, pixel: [number, number, number, number]): Array<[number, number, number, number]> {
  return Array.from({ length: count }, () => pixel);
}

describe('ASCII 转换核心', () => {
  it('默认关闭线稿预处理', () => {
    expect(DEFAULT_ASCII_OPTIONS.preprocessEnabled).toBe(false);
  });

  it('参数规整会保留线稿预处理开关状态', () => {
    const normalizedOptions = normalizeAsciiOptions({
      ...DEFAULT_ASCII_OPTIONS,
      preprocessEnabled: false,
    });

    expect(normalizedOptions.preprocessEnabled).toBe(false);
  });

  it('按亮度把黑色映射到高密度字符，白色映射到低密度字符', () => {
    expect(selectBrightnessCharacter(0, ' .#', false, 1, 1)).toBe('#');
    expect(selectBrightnessCharacter(255, ' .#', false, 1, 1)).toBe(' ');
  });

  it('反色模式会反转亮度到字符密度的方向', () => {
    expect(selectBrightnessCharacter(0, ' .#', true, 1, 1)).toBe(' ');
    expect(selectBrightnessCharacter(255, ' .#', true, 1, 1)).toBe('#');
  });

  it('透明像素按白底合成，避免透明黑被误判为深色', () => {
    const frame = createFrame(1, 1, [[0, 0, 0, 0]]);
    const text = convertBrightnessToAscii(frame, {
      ...DEFAULT_ASCII_OPTIONS,
      preprocessEnabled: false,
      characterSet: 'simple',
    });

    expect(text).toBe(' ');
  });

  it('每行输出长度严格等于采样帧宽度', () => {
    const frame = createFrame(4, 2, [
      ...repeatPixel(4, [0, 0, 0, 255]),
      ...repeatPixel(4, [255, 255, 255, 255]),
    ]);
    const result = convertFrameToAscii(frame, DEFAULT_ASCII_OPTIONS);

    expect(result.text.split('\n')).toHaveLength(2);
    expect(result.text.split('\n').every((line) => line.length === 4)).toBe(true);
  });

  it('按原图比例和字符宽高修正计算目标行数', () => {
    expect(calculateTargetSize(200, 100, 80)).toEqual({ width: 80, height: 20 });
  });

  it('Sobel 轮廓模式能识别竖向边缘', () => {
    const pixels: Array<[number, number, number, number]> = [];

    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 5; x += 1) {
        // 左黑右白构造垂直明暗断层，Sobel 应输出竖线方向字符。
        pixels.push(x < 2 ? [0, 0, 0, 255] : [255, 255, 255, 255]);
      }
    }

    const frame = createFrame(5, 5, pixels);
    const text = convertEdgesToAscii(frame, {
      ...DEFAULT_ASCII_OPTIONS,
      mode: 'edge',
      quality: 'high',
      edgeThreshold: 8,
    });

    expect(text).toContain('|');
  });

  it('线稿预处理会把绿色背景压成白色空白', () => {
    const frame = createFrame(1, 1, [[120, 170, 72, 255]]);
    const result = convertFrameToAscii(frame, {
      ...DEFAULT_ASCII_OPTIONS,
      preprocessEnabled: true,
      characterSet: 'simple',
      quality: 'low',
    });

    expect(result.text).toBe(' ');
  });

  it('线稿预处理会保留深色轮廓像素', () => {
    const frame = createFrame(3, 3, [
      [120, 170, 72, 255],
      [120, 170, 72, 255],
      [120, 170, 72, 255],
      [120, 170, 72, 255],
      [12, 12, 12, 255],
      [120, 170, 72, 255],
      [120, 170, 72, 255],
      [120, 170, 72, 255],
      [120, 170, 72, 255],
    ]);
    const preprocessedFrame = createPreprocessedLineArtFrame(frame);
    const centerIndex = (1 * 3 + 1) * 4;
    const cornerIndex = 0;

    expect(preprocessedFrame.data[centerIndex]).toBe(0);
    expect(preprocessedFrame.data[cornerIndex]).toBe(255);
  });

  it('关闭线稿预处理时保留原有灰度映射效果', () => {
    const frame = createFrame(1, 1, [[120, 170, 72, 255]]);
    const result = convertFrameToAscii(frame, {
      ...DEFAULT_ASCII_OPTIONS,
      preprocessEnabled: false,
      characterSet: 'simple',
      quality: 'low',
    });

    expect(result.text).not.toBe(' ');
  });

  it('轮廓模式开启线稿预处理后仍能识别竖向边缘', () => {
    const frame = createFrame(5, 5, [
      ...repeatPixel(2, [255, 255, 255, 255]),
      [0, 0, 0, 255],
      ...repeatPixel(2, [255, 255, 255, 255]),
      ...repeatPixel(2, [255, 255, 255, 255]),
      [0, 0, 0, 255],
      ...repeatPixel(2, [255, 255, 255, 255]),
      ...repeatPixel(2, [255, 255, 255, 255]),
      [0, 0, 0, 255],
      ...repeatPixel(2, [255, 255, 255, 255]),
      ...repeatPixel(2, [255, 255, 255, 255]),
      [0, 0, 0, 255],
      ...repeatPixel(2, [255, 255, 255, 255]),
      ...repeatPixel(2, [255, 255, 255, 255]),
      [0, 0, 0, 255],
      ...repeatPixel(2, [255, 255, 255, 255]),
    ]);
    const result = convertFrameToAscii(frame, {
      ...DEFAULT_ASCII_OPTIONS,
      mode: 'edge',
      preprocessEnabled: true,
      quality: 'high',
      edgeThreshold: 8,
    });

    expect(result.text).toContain('|');
  });

  it('Sobel 方向映射能覆盖水平、竖直和斜向字符', () => {
    expect(mapEdgeAngleToCharacter(0)).toBe('|');
    expect(mapEdgeAngleToCharacter(Math.PI / 2)).toBe('-');
    expect(mapEdgeAngleToCharacter(Math.PI / 4)).toBe('/');
    expect(mapEdgeAngleToCharacter(-Math.PI / 4)).toBe('\\');
  });
});
