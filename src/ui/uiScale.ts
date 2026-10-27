import { useState } from 'react';

/** 手机端界面缩放（只存在这台设备上）：地图浮层、顶栏、底部标签栏一起缩放，地图本身不变 */
const KEY = 'canglin-ui-scale';
export const UI_SCALES = [70, 75, 80, 85, 90, 95, 100, 110, 120];

function read(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    return UI_SCALES.includes(v) ? v : 100;
  } catch { return 100; }
}

function apply(pct: number) {
  document.documentElement.style.setProperty('--ui-zoom', String(pct / 100));
}

apply(read());

export function useUiScale(): [number, (pct: number) => void] {
  const [pct, setPct] = useState(read);
  const set = (v: number) => {
    setPct(v);
    apply(v);
    window.dispatchEvent(new Event('resize'));
    try { localStorage.setItem(KEY, String(v)); } catch { /* 存不了就只管这一次 */ }
  };
  return [pct, set];
}
