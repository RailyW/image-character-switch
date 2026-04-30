import { useEffect, useState } from 'react';

// useDebouncedValue 函数：把频繁变化的 UI 参数延迟提交给转换逻辑，减少重复计算。
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    // 每次 value 变化都重置计时器，只有用户停顿后才真正更新 debouncedValue。
    const timer = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [value, delayMs]);

  return debouncedValue;
}
