/** 世界首领的地图标记：一个红色骷髅头（用户 10-24 要求），地图上和世界地图里共用 */
const ROWS = [
  '................',
  '.....kkkkkk.....',
  '...kkrrrrrrkk...',
  '..krrwwrrrrrrk..',
  '.krrwrrrrrrrrRk.',
  '.krwrrrrrrrrrRk.',
  '.krrkkkrrkkkrRk.',
  '.krkeeekkeeekRk.',
  '.krkeeekkeeekRk.',
  '.krrkkrrrrkkrRk.',
  '..krrrrkkrrrRk..',
  '...kRrrkkrrRk...',
  '...krkrkrkrkk...',
  '...kRkRkRkRk....',
  '....kkkkkkkk....',
  '................',
];
const COL: Record<string, string> = { k: '#2a0606', r: '#e8281e', R: '#9a1010', w: '#ffb0a0', e: '#140202' };

export function paintSkull(scale = 2): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 16 * scale;
  c.height = 16 * scale;
  const ctx = c.getContext('2d')!;
  ROWS.forEach((row, y) => {
    for (let x = 0; x < 16; x++) {
      const col = COL[row[x]];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  });
  // 眼窝里两点红光
  ctx.fillStyle = '#ff6a40';
  ctx.fillRect(5 * scale, 7 * scale, scale, scale);
  ctx.fillRect(10 * scale, 7 * scale, scale, scale);
  return c;
}

let url: string | undefined;
/** 给 React 界面用的图片地址 */
export const skullUrl = () => (url ??= paintSkull(2).toDataURL());
