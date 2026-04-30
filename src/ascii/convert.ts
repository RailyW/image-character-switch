import {
  CHARACTER_ASPECT_RATIO,
  CHARACTER_SETS,
  EDGE_CHARACTERS,
  MAX_COLUMNS,
  MIN_COLUMNS,
  QUALITY_PROFILES,
} from './constants';
import type { AsciiOptions, AsciiResult, CharacterSetKey, ImageDimensions, ImageFrame } from './types';

// clampNumber 函数：把外部输入限制在安全范围内，避免 UI 或测试传入异常数值。
export function clampNumber(value: number, min: number, max: number): number {
  // 这里处理 NaN 和 Infinity，确保后续数组索引和 Canvas 尺寸始终是有限数字。
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

// resolveQualityProfile 函数：根据精度名称读取算法调参，作为所有转换路径的统一入口。
export function resolveQualityProfile(quality: AsciiOptions['quality']) {
  return QUALITY_PROFILES[quality] ?? QUALITY_PROFILES.standard;
}

// normalizeAsciiOptions 函数：把用户参数规整为算法可直接使用的安全参数。
export function normalizeAsciiOptions(options: AsciiOptions): AsciiOptions {
  const profile = resolveQualityProfile(options.quality);

  return {
    mode: options.mode,
    columns: Math.round(clampNumber(options.columns, MIN_COLUMNS, profile.maxColumns)),
    quality: options.quality,
    inverted: options.inverted,
    characterSet: options.characterSet,
    edgeThreshold: Math.round(clampNumber(options.edgeThreshold, 8, 92)),
  };
}

// calculateTargetSize 函数：根据原图比例和目标列数计算最终字符画采样尺寸。
export function calculateTargetSize(sourceWidth: number, sourceHeight: number, requestedColumns: number): ImageDimensions {
  const width = Math.round(clampNumber(requestedColumns, MIN_COLUMNS, MAX_COLUMNS));

  // 行数按原图宽高比和字符格比例修正，避免输出结果被垂直拉伸。
  const rawRows = (sourceHeight / Math.max(1, sourceWidth)) * width * CHARACTER_ASPECT_RATIO;
  const height = Math.max(1, Math.round(rawRows));

  return { width, height };
}

// resolveCharacterRamp 函数：读取指定字符集，异常键值会回退到标准字符集。
export function resolveCharacterRamp(characterSet: CharacterSetKey): string {
  return CHARACTER_SETS[characterSet] ?? CHARACTER_SETS.standard;
}

// composePixelOnWhite 函数：把透明像素合成到白底，保证 PNG 透明区域不会被误判为黑色。
export function composePixelOnWhite(data: Uint8ClampedArray, index: number): [number, number, number] {
  const alpha = data[index + 3] / 255;
  const inverseAlpha = 1 - alpha;

  // 这里使用白色作为首版默认背景，后续若增加背景色选项只需要替换 255。
  const red = data[index] * alpha + 255 * inverseAlpha;
  const green = data[index + 1] * alpha + 255 * inverseAlpha;
  const blue = data[index + 2] * alpha + 255 * inverseAlpha;

  return [red, green, blue];
}

// calculateLuminance 函数：使用 Rec. 709 权重计算人眼感知更接近的亮度值。
export function calculateLuminance(red: number, green: number, blue: number): number {
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

// createLuminanceGrid 函数：把 RGBA 像素帧转换为一维亮度网格，供两种模式复用。
export function createLuminanceGrid(frame: ImageFrame): Float32Array {
  const luminance = new Float32Array(frame.width * frame.height);

  for (let pixelIndex = 0; pixelIndex < luminance.length; pixelIndex += 1) {
    const dataIndex = pixelIndex * 4;
    const [red, green, blue] = composePixelOnWhite(frame.data, dataIndex);

    // 每个采样点只保留亮度，减少后续转换时重复读取 RGBA 的成本。
    luminance[pixelIndex] = calculateLuminance(red, green, blue);
  }

  return luminance;
}

// selectBrightnessCharacter 函数：把 0-255 亮度映射成字符集中的一个具体字符。
export function selectBrightnessCharacter(
  luminance: number,
  characterRamp: string,
  inverted: boolean,
  contrast: number,
  gamma: number,
): string {
  const normalizedLuminance = clampNumber(luminance / 255, 0, 1);
  const rawDensity = inverted ? normalizedLuminance : 1 - normalizedLuminance;

  // 对密度做轻量对比度和 gamma 调整，让照片在字符集上更有层次。
  const contrastedDensity = clampNumber(0.5 + (rawDensity - 0.5) * contrast, 0, 1);
  const adjustedDensity = clampNumber(Math.pow(contrastedDensity, gamma), 0, 1);
  const characterIndex = Math.round(adjustedDensity * (characterRamp.length - 1));

  return characterRamp[characterIndex] ?? characterRamp[0];
}

// convertBrightnessToAscii 函数：把亮度网格逐点映射为灰度明暗 ASCII 字符画。
export function convertBrightnessToAscii(frame: ImageFrame, options: AsciiOptions): string {
  const profile = resolveQualityProfile(options.quality);
  const characterRamp = resolveCharacterRamp(options.characterSet);
  const luminance = createLuminanceGrid(frame);
  const rows: string[] = [];

  for (let y = 0; y < frame.height; y += 1) {
    let line = '';

    for (let x = 0; x < frame.width; x += 1) {
      const luminanceIndex = y * frame.width + x;

      // 每个输出字符对应一个采样点，确保每行字符数严格等于 frame.width。
      line += selectBrightnessCharacter(
        luminance[luminanceIndex],
        characterRamp,
        options.inverted,
        profile.contrast,
        profile.gamma,
      );
    }

    rows.push(line);
  }

  return rows.join('\n');
}

// applyBoxBlur 函数：对亮度网格做 3x3 轻量模糊，降低轮廓模式下的噪点。
export function applyBoxBlur(luminance: Float32Array, width: number, height: number): Float32Array {
  const blurred = new Float32Array(luminance.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let count = 0;

      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          const sampleX = clampNumber(x + offsetX, 0, width - 1);
          const sampleY = clampNumber(y + offsetY, 0, height - 1);

          // 边缘像素使用贴边采样，避免访问数组外部。
          sum += luminance[sampleY * width + sampleX];
          count += 1;
        }
      }

      blurred[y * width + x] = sum / count;
    }
  }

  return blurred;
}

// calculateSobelAt 函数：计算指定像素的 Sobel 边缘强度和方向。
export function calculateSobelAt(luminance: Float32Array, width: number, height: number, x: number, y: number) {
  // Sobel 卷积核使用贴边采样，保证边缘位置也能得到稳定结果。
  const sample = (sampleX: number, sampleY: number) => {
    const clampedX = clampNumber(sampleX, 0, width - 1);
    const clampedY = clampNumber(sampleY, 0, height - 1);

    return luminance[clampedY * width + clampedX];
  };

  const topLeft = sample(x - 1, y - 1);
  const top = sample(x, y - 1);
  const topRight = sample(x + 1, y - 1);
  const left = sample(x - 1, y);
  const right = sample(x + 1, y);
  const bottomLeft = sample(x - 1, y + 1);
  const bottom = sample(x, y + 1);
  const bottomRight = sample(x + 1, y + 1);

  const gradientX = -topLeft + topRight - 2 * left + 2 * right - bottomLeft + bottomRight;
  const gradientY = -topLeft - 2 * top - topRight + bottomLeft + 2 * bottom + bottomRight;

  return {
    magnitude: Math.hypot(gradientX, gradientY),
    angle: Math.atan2(gradientY, gradientX),
  };
}

// mapEdgeAngleToCharacter 函数：把 Sobel 梯度方向转换为最接近的 ASCII 线条字符。
export function mapEdgeAngleToCharacter(angle: number): string {
  const lineAngle = angle + Math.PI / 2;
  const normalizedDegrees = ((((lineAngle * 180) / Math.PI) % 180) + 180) % 180;

  if (normalizedDegrees < 22.5 || normalizedDegrees >= 157.5) {
    return EDGE_CHARACTERS.horizontal;
  }

  if (normalizedDegrees < 67.5) {
    return EDGE_CHARACTERS.backslash;
  }

  if (normalizedDegrees < 112.5) {
    return EDGE_CHARACTERS.vertical;
  }

  return EDGE_CHARACTERS.slash;
}

// convertEdgesToAscii 函数：使用 Sobel 算子把图片转换为轮廓线稿字符画。
export function convertEdgesToAscii(frame: ImageFrame, options: AsciiOptions): string {
  const profile = resolveQualityProfile(options.quality);
  const rawLuminance = createLuminanceGrid(frame);
  const luminance = profile.shouldBlurEdges ? applyBoxBlur(rawLuminance, frame.width, frame.height) : rawLuminance;
  const rows: string[] = [];
  const threshold = (options.edgeThreshold / 100) * 1442 * (1 / profile.edgeSensitivity);

  for (let y = 0; y < frame.height; y += 1) {
    let line = '';

    for (let x = 0; x < frame.width; x += 1) {
      const edge = calculateSobelAt(luminance, frame.width, frame.height, x, y);

      // 强度低于阈值时输出空格，保留线稿模式的留白感。
      if (edge.magnitude < threshold) {
        line += ' ';
      } else {
        const character = mapEdgeAngleToCharacter(edge.angle);

        // 反色模式下仍保留线条字符；轮廓结果主要由背景色决定，不反转字符密度。
        line += options.inverted ? character : character;
      }
    }

    rows.push(line);
  }

  return rows.join('\n');
}

// validateImageFrame 函数：在算法入口检查像素帧完整性，避免 Worker 中出现难定位异常。
export function validateImageFrame(frame: ImageFrame): void {
  if (frame.width <= 0 || frame.height <= 0) {
    throw new Error('图片采样尺寸无效。');
  }

  if (frame.data.length < frame.width * frame.height * 4) {
    throw new Error('图片像素数据不完整。');
  }
}

// convertFrameToAscii 函数：核心转换入口，根据模式选择灰度明暗或轮廓线稿算法。
export function convertFrameToAscii(frame: ImageFrame, inputOptions: AsciiOptions): AsciiResult {
  const startedAt = performance.now();
  const options = normalizeAsciiOptions(inputOptions);

  validateImageFrame(frame);

  // 当前帧已经由主线程按目标列数缩放，因此这里以 frame.width/frame.height 作为最终尺寸。
  const text = options.mode === 'edge' ? convertEdgesToAscii(frame, options) : convertBrightnessToAscii(frame, options);
  const durationMs = Math.max(0, Math.round(performance.now() - startedAt));

  return {
    text,
    columns: frame.width,
    rows: frame.height,
    durationMs,
  };
}
