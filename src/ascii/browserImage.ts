import type { ImageDimensions, ImageFrame } from './types';

// DrawableResource 结构：封装 Canvas 可绘制对象和对应清理函数，避免临时 URL 泄漏。
interface DrawableResource {
  source: CanvasImageSource;
  cleanup: () => void;
}

// readImageDimensionsFromUrl 函数：通过浏览器图片解码能力读取预览 URL 的真实尺寸。
export function readImageDimensionsFromUrl(url: string): Promise<ImageDimensions> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    // 图片加载成功后读取 naturalWidth/naturalHeight，避免 CSS 尺寸影响采样比例。
    image.onload = () => {
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    };

    image.onerror = () => {
      reject(new Error('图片读取失败，请确认文件格式是否受浏览器支持。'));
    };

    image.decoding = 'async';
    image.src = url;
  });
}

// createHtmlImageFromFile 函数：在 createImageBitmap 不可用时回退到 HTMLImageElement 解码。
function createHtmlImageFromFile(file: File): Promise<DrawableResource> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    // 加载成功后返回可绘制图片，同时把临时 URL 的释放逻辑交给调用方。
    image.onload = () => {
      resolve({
        source: image,
        cleanup: () => URL.revokeObjectURL(objectUrl),
      });
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('图片解码失败，请尝试使用 PNG、JPG 或 WebP 图片。'));
    };

    image.decoding = 'async';
    image.src = objectUrl;
  });
}

// createDrawableFromFile 函数：优先使用 createImageBitmap，失败时自动回退到图片元素。
async function createDrawableFromFile(file: File): Promise<DrawableResource> {
  if ('createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(file);

      return {
        source: bitmap,
        cleanup: () => bitmap.close(),
      };
    } catch {
      // 某些浏览器或图片格式会让 createImageBitmap 失败，此时继续走兼容回退路径。
    }
  }

  return createHtmlImageFromFile(file);
}

// createSamplingCanvas 函数：创建固定尺寸 Canvas，并确保 2D 上下文可用。
function createSamplingCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d', { willReadFrequently: true });

  if (!context) {
    throw new Error('当前浏览器不支持 Canvas 2D 读取像素。');
  }

  return [canvas, context];
}

// renderImageFileToFrame 函数：把用户图片缩放到目标采样尺寸并导出 RGBA 像素帧。
export async function renderImageFileToFrame(file: File, width: number, height: number): Promise<ImageFrame> {
  const drawable = await createDrawableFromFile(file);
  const [, context] = createSamplingCanvas(width, height);

  try {
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';

    // 透明图片先铺白底，后续亮度计算也会再次按白底合成，保证结果稳定。
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(drawable.source, 0, 0, width, height);

    const imageData = context.getImageData(0, 0, width, height);

    return {
      width,
      height,
      data: new Uint8ClampedArray(imageData.data),
    };
  } finally {
    drawable.cleanup();
  }
}
