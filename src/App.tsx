import {
  Copy,
  Download,
  FileImage,
  Image as ImageIcon,
  LoaderCircle,
  ScanLine,
  SlidersHorizontal,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { renderImageFileToFrame, readImageDimensionsFromUrl } from './ascii/browserImage';
import {
  DEFAULT_ASCII_OPTIONS,
  MAX_FILE_SIZE_BYTES,
  MIN_COLUMNS,
  QUALITY_PROFILES,
} from './ascii/constants';
import { calculateTargetSize, normalizeAsciiOptions } from './ascii/convert';
import type { AsciiMode, AsciiOptions, AsciiQuality, AsciiResult, CharacterSetKey, ImageDimensions } from './ascii/types';
import { startAsciiConversion } from './ascii/workerClient';
import { useDebouncedValue } from './hooks/useDebouncedValue';

const MODE_OPTIONS: Array<{ value: AsciiMode; label: string; icon: typeof ImageIcon }> = [
  { value: 'brightness', label: '灰度明暗', icon: ImageIcon },
  { value: 'edge', label: '轮廓线稿', icon: ScanLine },
];

const QUALITY_OPTIONS: Array<{ value: AsciiQuality; label: string }> = [
  { value: 'low', label: '低' },
  { value: 'standard', label: '标准' },
  { value: 'high', label: '高' },
];

const CHARACTER_SET_OPTIONS: Array<{ value: CharacterSetKey; label: string }> = [
  { value: 'simple', label: '简洁' },
  { value: 'standard', label: '标准' },
  { value: 'dense', label: '密集' },
];

// formatFileSize 函数：把字节数转换为界面可读的 MB/KB 文案。
function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// buildDownloadName 函数：根据原始文件名生成稳定的 txt 下载文件名。
function buildDownloadName(file: File | null): string {
  if (!file) {
    return 'ascii-art.txt';
  }

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'ascii-art';

  return `${baseName}-ascii.txt`;
}

// App 组件：承载上传、参数配置、转换状态、结果预览和导出操作。
export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sourceSize, setSourceSize] = useState<ImageDimensions | null>(null);
  const [options, setOptions] = useState<AsciiOptions>(DEFAULT_ASCII_OPTIONS);
  const [result, setResult] = useState<AsciiResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const normalizedOptions = useMemo(() => normalizeAsciiOptions(options), [options]);
  const debouncedOptions = useDebouncedValue(normalizedOptions, 260);
  const qualityProfile = resolveQualityProfileForUi(options.quality);
  const targetSize = sourceSize ? calculateTargetSize(sourceSize.width, sourceSize.height, normalizedOptions.columns) : null;

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!file || !sourceSize) {
      return;
    }

    // 把当前文件和尺寸固定到本次 effect 内，避免异步流程中读取到后续渲染的空状态。
    const activeFile = file;
    const activeSourceSize = sourceSize;
    let isCancelled = false;
    let cancelWorker: (() => void) | null = null;

    // runConversion 函数：按当前参数重新采样图片，并把重计算交给 Web Worker。
    async function runConversion(): Promise<void> {
      setIsProcessing(true);
      setErrorMessage(null);

      try {
        const nextTargetSize = calculateTargetSize(activeSourceSize.width, activeSourceSize.height, debouncedOptions.columns);
        const frame = await renderImageFileToFrame(activeFile, nextTargetSize.width, nextTargetSize.height);

        if (isCancelled) {
          return;
        }

        const task = startAsciiConversion(frame, debouncedOptions);
        cancelWorker = task.cancel;
        const nextResult = await task.promise;

        if (!isCancelled) {
          setResult(nextResult);
        }
      } catch (error) {
        if (!isCancelled) {
          setResult(null);
          setErrorMessage(error instanceof Error ? error.message : '字符画转换失败。');
        }
      } finally {
        if (!isCancelled) {
          setIsProcessing(false);
        }
      }
    }

    runConversion();

    return () => {
      isCancelled = true;

      if (cancelWorker) {
        cancelWorker();
      }
    };
  }, [file, sourceSize, debouncedOptions]);

  // handleIncomingFile 函数：校验用户选择的文件，并读取图片尺寸和预览地址。
  async function handleIncomingFile(nextFile: File | undefined): Promise<void> {
    if (!nextFile) {
      return;
    }

    if (!nextFile.type.startsWith('image/')) {
      setErrorMessage('请选择图片文件。');
      return;
    }

    if (nextFile.size > MAX_FILE_SIZE_BYTES) {
      setErrorMessage(`图片不能超过 ${formatFileSize(MAX_FILE_SIZE_BYTES)}。`);
      return;
    }

    const objectUrl = URL.createObjectURL(nextFile);

    try {
      const dimensions = await readImageDimensionsFromUrl(objectUrl);

      // 文件通过校验后再进入转换状态，避免错误文件污染现有结果。
      setFile(nextFile);
      setPreviewUrl(objectUrl);
      setSourceSize(dimensions);
      setResult(null);
      setErrorMessage(null);
      setIsCopied(false);
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      setErrorMessage(error instanceof Error ? error.message : '图片读取失败。');
    }
  }

  // handleFileInputChange 函数：响应文件选择控件变化，并转交给统一文件入口。
  function handleFileInputChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const nextFile = event.target.files?.[0];
    void handleIncomingFile(nextFile);

    // 清空 input value，让用户连续选择同一张图片时也能触发 change。
    event.target.value = '';
  }

  // handleDrop 函数：响应拖拽上传，把拖入的第一张图片交给统一文件入口。
  function handleDrop(event: React.DragEvent<HTMLLabelElement>): void {
    event.preventDefault();
    void handleIncomingFile(event.dataTransfer.files[0]);
  }

  // updateOptions 函数：合并局部参数，并让转换 effect 通过 debounce 自动重算。
  function updateOptions(nextOptions: Partial<AsciiOptions>): void {
    setOptions((currentOptions) => ({
      ...currentOptions,
      ...nextOptions,
    }));
  }

  // handleQualityChange 函数：切换精度时同步收紧列数，避免 UI 显示超出当前精度上限。
  function handleQualityChange(nextQuality: AsciiQuality): void {
    const nextProfile = resolveQualityProfileForUi(nextQuality);

    setOptions((currentOptions) => ({
      ...currentOptions,
      quality: nextQuality,
      columns: Math.min(currentOptions.columns, nextProfile.maxColumns),
    }));
  }

  // handleCopyResult 函数：把当前字符画文本复制到系统剪贴板。
  async function handleCopyResult(): Promise<void> {
    if (!result) {
      return;
    }

    try {
      await navigator.clipboard.writeText(result.text);
      setIsCopied(true);
      window.setTimeout(() => setIsCopied(false), 1500);
    } catch {
      setErrorMessage('复制失败，请检查浏览器剪贴板权限。');
    }
  }

  // handleDownloadResult 函数：把当前字符画结果保存为 txt 文件。
  function handleDownloadResult(): void {
    if (!result) {
      return;
    }

    const blob = new Blob([result.text], { type: 'text/plain;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');

    // 使用临时 a 标签触发浏览器下载，完成后立即释放对象 URL。
    link.href = objectUrl;
    link.download = buildDownloadName(file);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  }

  // handleResetImage 函数：清空当前图片、结果和错误，让页面回到初始上传状态。
  function handleResetImage(): void {
    setFile(null);
    setPreviewUrl(null);
    setSourceSize(null);
    setResult(null);
    setErrorMessage(null);
    setIsCopied(false);
    setIsProcessing(false);
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">本地转换</p>
          <h1>ASCII 字符画生成器</h1>
        </div>
        <span className="privacy-pill">无上传</span>
      </header>

      <main className="workspace">
        <aside className="control-column" aria-label="转换设置">
          <section className="tool-panel upload-panel" aria-labelledby="upload-title">
            <div className="panel-title-row">
              <h2 id="upload-title">
                <FileImage aria-hidden="true" />
                图片
              </h2>
              {file ? (
                <button className="icon-button" type="button" onClick={handleResetImage} title="移除图片">
                  <Trash2 aria-hidden="true" />
                  <span>移除</span>
                </button>
              ) : null}
            </div>

            <label className="drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
              <input
                aria-label="选择图片"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
                onChange={handleFileInputChange}
              />
              <UploadCloud aria-hidden="true" />
              <span>{file ? file.name : '选择图片或拖入此处'}</span>
              <small>{file ? formatFileSize(file.size) : `上限 ${formatFileSize(MAX_FILE_SIZE_BYTES)}`}</small>
            </label>

            {previewUrl && sourceSize ? (
              <div className="source-preview">
                <img src={previewUrl} alt="已选择图片预览" />
                <div>
                  <span>{sourceSize.width} x {sourceSize.height}</span>
                  {targetSize ? <span>{targetSize.width} x {targetSize.height} 字符</span> : null}
                </div>
              </div>
            ) : null}
          </section>

          <section className="tool-panel settings-panel" aria-labelledby="settings-title">
            <div className="panel-title-row">
              <h2 id="settings-title">
                <SlidersHorizontal aria-hidden="true" />
                参数
              </h2>
            </div>

            <div className="field-group">
              <span className="field-label">模式</span>
              <div className="segmented-control" role="group" aria-label="转换模式">
                {MODE_OPTIONS.map((item) => {
                  const Icon = item.icon;

                  return (
                    <button
                      key={item.value}
                      type="button"
                      className={options.mode === item.value ? 'segment is-active' : 'segment'}
                      onClick={() => updateOptions({ mode: item.value })}
                    >
                      <Icon aria-hidden="true" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="field-group">
              <label className="range-label" htmlFor="columns">
                <span>每行长度</span>
                <strong>{options.columns}</strong>
              </label>
              <input
                id="columns"
                type="range"
                min={MIN_COLUMNS}
                max={qualityProfile.maxColumns}
                value={options.columns}
                onChange={(event) => updateOptions({ columns: Number(event.target.value) })}
              />
            </div>

            <div className="field-group">
              <span className="field-label">精度</span>
              <div className="quality-grid" role="group" aria-label="转换精度">
                {QUALITY_OPTIONS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={options.quality === item.value ? 'choice-button is-active' : 'choice-button'}
                    onClick={() => handleQualityChange(item.value)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="character-set">字符集</label>
              <select
                id="character-set"
                value={options.characterSet}
                onChange={(event) => updateOptions({ characterSet: event.target.value as CharacterSetKey })}
              >
                {CHARACTER_SET_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            {options.mode === 'edge' ? (
              <div className="field-group">
                <label className="range-label" htmlFor="edge-threshold">
                  <span>边缘强度</span>
                  <strong>{options.edgeThreshold}</strong>
                </label>
                <input
                  id="edge-threshold"
                  type="range"
                  min={8}
                  max={92}
                  value={options.edgeThreshold}
                  onChange={(event) => updateOptions({ edgeThreshold: Number(event.target.value) })}
                />
              </div>
            ) : null}

            <label className="toggle-row">
              <input
                type="checkbox"
                checked={options.inverted}
                onChange={(event) => updateOptions({ inverted: event.target.checked })}
              />
              <span>反色</span>
            </label>
          </section>
        </aside>

        <section className="output-panel" aria-labelledby="output-title">
          <div className="output-toolbar">
            <div>
              <h2 id="output-title">结果</h2>
              <p>
                {result ? `${result.columns} 列 / ${result.rows} 行 / ${result.durationMs} ms` : '等待图片'}
              </p>
            </div>
            <div className="output-actions">
              {isProcessing ? (
                <span className="processing-state">
                  <LoaderCircle aria-hidden="true" />
                  处理中
                </span>
              ) : null}
              <button
                type="button"
                className="icon-button"
                disabled={!result}
                onClick={() => void handleCopyResult()}
                title="复制结果"
              >
                <Copy aria-hidden="true" />
                <span>{isCopied ? '已复制' : '复制'}</span>
              </button>
              <button
                type="button"
                className="icon-button"
                disabled={!result}
                onClick={handleDownloadResult}
                title="下载 txt"
              >
                <Download aria-hidden="true" />
                <span>下载</span>
              </button>
            </div>
          </div>

          {errorMessage ? <div className="error-message" role="alert">{errorMessage}</div> : null}

          <div className="ascii-stage">
            {result ? (
              <pre aria-label="ASCII 字符画结果">{result.text}</pre>
            ) : (
              <div className="empty-state">
                <UploadCloud aria-hidden="true" />
                <span>选择图片后生成字符画</span>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

// resolveQualityProfileForUi 函数：给 UI 读取当前精度的列数上限和配置。
function resolveQualityProfileForUi(quality: AsciiQuality) {
  return QUALITY_PROFILES[quality] ?? QUALITY_PROFILES.standard;
}
