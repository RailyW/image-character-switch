import type { AsciiOptions, CharacterSetKey, QualityProfile } from './types';

// 输入文件大小上限：纯前端工具避免一次性读取过大的图片造成浏览器内存压力。
export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

// 输出列数下限：过小会让图片信息损失严重，默认不低于 40 列。
export const MIN_COLUMNS = 40;

// 输出列数硬上限：首版控制在 240 列以内，避免预览和复制时性能过重。
export const MAX_COLUMNS = 240;

// 字符宽高修正系数：等宽字体的单个字符格通常更高，因此行数需要乘以该系数。
export const CHARACTER_ASPECT_RATIO = 0.5;

// 默认转换选项：应用首次打开时直接使用这组稳定参数。
export const DEFAULT_ASCII_OPTIONS: AsciiOptions = {
  mode: 'brightness',
  columns: 100,
  quality: 'standard',
  inverted: false,
  preprocessEnabled: false,
  characterSet: 'standard',
  edgeThreshold: 36,
};

// 字符集映射：每个字符串都按“从浅到深”的视觉密度排序。
export const CHARACTER_SETS: Record<CharacterSetKey, string> = {
  simple: ' .:-=+*#%@',
  standard: ' .,:;irsXA253hMHGS#9B&@',
  dense: ' .`^",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$',
};

// 精度档案：低精度更快，高精度保留更多列数和边缘细节。
export const QUALITY_PROFILES: Record<AsciiOptions['quality'], QualityProfile> = {
  low: {
    maxColumns: 120,
    contrast: 1.05,
    gamma: 1,
    shouldBlurEdges: true,
    edgeSensitivity: 0.85,
  },
  standard: {
    maxColumns: 180,
    contrast: 1.15,
    gamma: 0.95,
    shouldBlurEdges: true,
    edgeSensitivity: 1,
  },
  high: {
    maxColumns: 240,
    contrast: 1.25,
    gamma: 0.9,
    shouldBlurEdges: false,
    edgeSensitivity: 1.15,
  },
};

// 轮廓模式可用字符：根据边缘方向选择最接近的 ASCII 线条符号。
export const EDGE_CHARACTERS = {
  horizontal: '-',
  vertical: '|',
  slash: '/',
  backslash: '\\',
} as const;
