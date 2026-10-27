/**
 * 画布按设备像素比渲染，让像素和文字在高清屏上清晰。最多 2 倍（10-27）：
 * iPhone 是 3 倍屏，按 3 倍要画 1170×2532 个点，比 2 倍多一倍多，像素画放大后看不出差别，帧率却掉得明显
 */
export const DPR = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
