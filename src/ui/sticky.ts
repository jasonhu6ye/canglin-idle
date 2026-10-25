import { useState, type Dispatch, type SetStateAction } from 'react';

/*
 * 页面停在原处（用户 10-25）：切到别的页面再回来，分类、筛选、展开的子页面都保持上次的样子。
 * 只存在内存里，刷新网页后回到默认。
 */
const memo = new Map<string, unknown>();

export function useSticky<T>(key: string, init: T): [T, Dispatch<SetStateAction<T>>] {
  const [v, setV] = useState<T>(() => (memo.has(key) ? (memo.get(key) as T) : init));
  const set: Dispatch<SetStateAction<T>> = (next) => {
    setV((prev) => {
      const val = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
      memo.set(key, val);
      return val;
    });
  };
  return [v, set];
}

/** 面板滚动位置，按页面记 */
export const scrollMemo = new Map<string, number>();
