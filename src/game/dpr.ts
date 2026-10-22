/** 画布按设备像素比渲染（最多 3 倍），让像素和文字在高清屏上清晰 */
export const DPR = Math.min(Math.max(window.devicePixelRatio || 1, 1), 3);
