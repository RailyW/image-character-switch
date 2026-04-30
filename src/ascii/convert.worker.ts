/// <reference lib="webworker" />

import { convertFrameToAscii } from './convert';
import type { ConvertWorkerRequest, ConvertWorkerResponse } from './types';

const workerScope = self as DedicatedWorkerGlobalScope;

// onmessage 处理函数：接收主线程传入的像素帧并返回字符画结果。
workerScope.onmessage = (event: MessageEvent<ConvertWorkerRequest>) => {
  const { id, frame, options } = event.data;

  try {
    const result = convertFrameToAscii(frame, options);
    const response: ConvertWorkerResponse = {
      id,
      status: 'success',
      result,
    };

    workerScope.postMessage(response);
  } catch (error) {
    const response: ConvertWorkerResponse = {
      id,
      status: 'error',
      message: error instanceof Error ? error.message : '字符画转换失败。',
    };

    workerScope.postMessage(response);
  }
};

export {};
