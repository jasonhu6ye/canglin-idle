import { dprFor, gfxLevel } from './gfx';

/**
 * 画布按设备像素比渲染，让像素和文字在高清屏上清晰。倍数跟画质档位走（10-27，见 gfx.ts）：
 * 高档按原生像素（最多 3 倍），中档最多 2 倍，低档 1 倍。换档时 GameCanvas 改画布尺寸、各场景按比例改镜头缩放。
 * 用 let 导出，各处读到的都是当前值
 */
export let DPR = dprFor(gfxLevel());
export function setDpr(v: number) {
  DPR = v;
}
