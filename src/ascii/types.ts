// 字符画模式类型：用于区分灰度明暗转换和 Sobel 轮廓线稿转换。
export type AsciiMode = 'brightness' | 'edge';

// 转换精度类型：用于同时控制字符密度、采样上限和边缘检测默认策略。
export type AsciiQuality = 'low' | 'standard' | 'high';

// 字符集类型：用于决定亮度映射时可用的字符密度梯度。
export type CharacterSetKey = 'simple' | 'standard' | 'dense';

// 图片尺寸结构：用于在主线程和转换模块之间传递原图或采样图尺寸。
export interface ImageDimensions {
  width: number;
  height: number;
}

// 采样后的图片帧结构：data 使用 RGBA 顺序，每个像素占 4 个字节。
export interface ImageFrame extends ImageDimensions {
  data: Uint8ClampedArray;
}

// 字符画转换选项：UI、Worker 和核心算法统一使用这份结构。
export interface AsciiOptions {
  mode: AsciiMode;
  columns: number;
  quality: AsciiQuality;
  inverted: boolean;
  characterSet: CharacterSetKey;
  edgeThreshold: number;
}

// 转换结果结构：包含最终文本，以及便于 UI 展示的尺寸和耗时信息。
export interface AsciiResult {
  text: string;
  columns: number;
  rows: number;
  durationMs: number;
}

// 精度档案结构：集中保存不同精度下的采样上限和算法调参。
export interface QualityProfile {
  maxColumns: number;
  contrast: number;
  gamma: number;
  shouldBlurEdges: boolean;
  edgeSensitivity: number;
}

// Worker 请求消息：主线程把采样后的像素、选项和请求编号传入 Worker。
export interface ConvertWorkerRequest {
  id: number;
  frame: ImageFrame;
  options: AsciiOptions;
}

// Worker 成功消息：Worker 完成转换后返回同一个请求编号和结果。
export interface ConvertWorkerSuccess {
  id: number;
  status: 'success';
  result: AsciiResult;
}

// Worker 失败消息：Worker 捕获异常后返回同一个请求编号和错误信息。
export interface ConvertWorkerFailure {
  id: number;
  status: 'error';
  message: string;
}

// Worker 响应联合类型：主线程据此判断转换是否成功。
export type ConvertWorkerResponse = ConvertWorkerSuccess | ConvertWorkerFailure;

// 转换任务结构：用于让 React 组件能等待结果，也能在参数变化时取消旧任务。
export interface AsciiConversionTask {
  promise: Promise<AsciiResult>;
  cancel: () => void;
}
