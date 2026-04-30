import type { AsciiConversionTask, AsciiOptions, ConvertWorkerResponse, ImageFrame } from './types';

let nextRequestId = 1;

// startAsciiConversion 函数：为每次转换创建独立 Worker，便于参数变化时立即取消旧任务。
export function startAsciiConversion(frame: ImageFrame, options: AsciiOptions): AsciiConversionTask {
  const worker = new Worker(new URL('./convert.worker.ts', import.meta.url), { type: 'module' });
  const requestId = nextRequestId;
  let isSettled = false;

  nextRequestId += 1;

  const promise = new Promise<Awaited<AsciiConversionTask['promise']>>((resolve, reject) => {
    // 成功或失败后统一终止 Worker，避免空闲线程残留。
    const finish = () => {
      isSettled = true;
      worker.terminate();
    };

    worker.onmessage = (event: MessageEvent<ConvertWorkerResponse>) => {
      if (event.data.id !== requestId) {
        return;
      }

      finish();

      if (event.data.status === 'success') {
        resolve(event.data.result);
      } else {
        reject(new Error(event.data.message));
      }
    };

    worker.onerror = (event) => {
      finish();
      reject(new Error(event.message || 'Worker 执行失败。'));
    };

    // 像素缓冲区通过 Transferable 交给 Worker，减少一次大数组复制。
    worker.postMessage({ id: requestId, frame, options }, [frame.data.buffer as ArrayBuffer]);
  });

  return {
    promise,
    cancel: () => {
      if (!isSettled) {
        isSettled = true;
        worker.terminate();
      }
    },
  };
}
