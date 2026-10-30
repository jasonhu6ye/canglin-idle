import { Pix } from './pix';

/**
 * 家园宠物（用户 10-29「增加家园岛屿玩法内容」）：有猫窝就来一只橘猫，有狗屋就来一只柴犬，在岛上溜达。
 * 侧面朝右画，三帧：走路两帧、坐下一帧。场景里往左走就翻转。
 */
export const PET_FRAMES = ['walk0', 'walk1', 'sit'] as const;
export const PET_SIZE: Record<string, { w: number; h: number }> = { cat: { w: 16, h: 13 }, dog: { w: 20, h: 15 } };

const CAT = ['#8a4a1a', '#c8742a', '#ec9a44', '#ffc27a'];
const DOG = ['#7a4418', '#b8682a', '#dc9040', '#f6b868'];
const CREAM = ['#c8b8a0', '#e8dcc8', '#f8f0e4', '#ffffff'];

function cat(frame: string): Pix {
  const { w, h } = PET_SIZE.cat;
  const p = new Pix(w, h);
  const B = h - 1;
  const sit = frame === 'sit';
  const step = frame === 'walk1' ? 1 : 0;
  // 尾巴：走路时往上翘，坐着时贴着地绕到前面
  if (sit) for (let x = 2; x < 10; x++) p.set(x, B - (x < 4 ? 1 : 0), x < 4 ? CAT[1] : CAT[2]);
  else for (let i = 0; i < 6; i++) p.set(2 - Math.floor(i / 3) + step * (i > 3 ? 1 : 0), 7 - i, i > 3 ? CAT[3] : CAT[1]);
  if (sit) {
    p.blob(6, 8, 3.5, 3.6, CAT, 3);
    p.blob(8, 9.5, 1.8, 2, CREAM, 4);
  } else {
    // 四条腿交替迈
    const legs = step ? [[4, 2], [6, 3], [9, 3], [11, 2]] : [[4, 3], [6, 2], [9, 2], [11, 3]];
    for (const [x, l] of legs) for (let y = B - l; y <= B; y++) p.set(x, y, x === 6 || x === 11 ? CAT[1] : CAT[2]);
    p.blob(7.5, 7.5, 4.6, 2.4, CAT, 5);
    for (const sx of [5, 8]) { p.set(sx, 6, CAT[0]); p.set(sx, 7, CAT[1]); }
  }
  const hx = sit ? 9 : 12;
  const hy = sit ? 4 : 5;
  p.blob(hx, hy, 2.8, 2.5, CAT, 6);
  p.set(hx - 2, hy - 3, CAT[2]); p.set(hx - 1, hy - 3, CAT[1]); p.set(hx + 1, hy - 3, CAT[2]); p.set(hx + 2, hy - 3, CAT[1]);
  p.set(hx - 2, hy - 2, CAT[1]); p.set(hx + 2, hy - 2, CAT[1]); p.set(hx - 1, hy - 2, '#ff9aa8');
  p.set(hx + 1, hy, '#1a2a1a'); p.set(hx + 1, hy - 1, '#a0e070');
  p.set(hx + 2, hy + 1, '#ff8a9a');
  p.set(hx, hy + 1, CREAM[2]); p.set(hx + 1, hy + 1, CREAM[2]);
  return p.outlineTinted();
}

function dog(frame: string): Pix {
  const { w, h } = PET_SIZE.dog;
  const p = new Pix(w, h);
  const B = h - 1;
  const sit = frame === 'sit';
  const step = frame === 'walk1' ? 1 : 0;
  // 柴犬的卷尾巴
  const tx = sit ? 4 : 3;
  const ty = sit ? 7 : 4;
  for (const [dx, dy] of [[0, 2], [0, 1], [0, 0], [1, -1], [2, -1], [3, 0], [2, 1]]) p.set(tx + dx, ty + dy - step * (sit ? 0 : 1), dy < 0 ? CREAM[2] : DOG[2]);
  if (sit) {
    p.blob(8, 9, 4, 4, DOG, 7);
    p.blob(10.5, 10, 2, 2.6, CREAM, 8);
    for (const x of [7, 11]) p.rect(x, B - 1, 2, 2, CREAM[1]);
  } else {
    const legs = step ? [[5, 2], [7, 3], [12, 3], [14, 2]] : [[5, 3], [7, 2], [12, 2], [14, 3]];
    for (const [x, l] of legs) for (let y = B - l; y <= B; y++) { p.set(x, y, y === B ? CREAM[2] : DOG[x === 7 || x === 14 ? 1 : 2]); }
    p.blob(9.5, 8.5, 5.6, 3, DOG, 9);
    for (let x = 7; x < 14; x++) p.set(x, 11, CREAM[1]);
  }
  const hx = sit ? 12 : 15;
  const hy = sit ? 4 : 5;
  p.blob(hx, hy, 3.2, 2.9, DOG, 10);
  // 竖起来的三角耳朵、白脸颊、小黑鼻子
  for (const ex of [hx - 2, hx + 1]) { p.set(ex, hy - 3, DOG[2]); p.set(ex + 1, hy - 3, DOG[1]); p.set(ex, hy - 4, DOG[1]); }
  p.set(hx - 1, hy - 3, '#e88a7a');
  p.rect(hx + 1, hy + 1, 3, 2, CREAM[2]);
  p.set(hx + 3, hy, CREAM[2]); p.set(hx + 4, hy, '#1a1010'); p.set(hx + 4, hy + 1, CREAM[1]);
  p.set(hx + 1, hy - 1, '#1a1010'); p.set(hx + 1, hy - 2, DOG[3]);
  p.set(hx + 2, hy + 3, '#e85a6a');
  return p.outlineTinted();
}

/** 一只宠物的整张图：三帧横排 */
export function paintPetSheet(kind: string): HTMLCanvasElement {
  const { w, h } = PET_SIZE[kind];
  const c = document.createElement('canvas');
  c.width = w * PET_FRAMES.length;
  c.height = h;
  const g = c.getContext('2d')!;
  PET_FRAMES.forEach((f, i) => g.drawImage((kind === 'cat' ? cat(f) : dog(f)).canvas(), i * w, 0));
  return c;
}

/** 摸宠物冒出来的小红心 */
export function paintHeart(): HTMLCanvasElement {
  const p = new Pix(7, 6);
  ['.aa.aa.', 'abbabba', 'abbbbba', '.abbba.', '..aba..', '...a...'].forEach((r, y) => [...r].forEach((ch, x) => {
    if (ch !== '.') p.set(x, y, ch === 'a' ? '#c82a4a' : '#ff6a8a');
  }));
  p.set(2, 1, '#ffd0dc');
  return p.canvas();
}

/** 告示板上的「!」：今天还有订单没交 */
export function paintBang(): HTMLCanvasElement {
  const p = new Pix(9, 12);
  for (let y = 0; y < 10; y++) for (let x = 0; x < 9; x++) {
    const d = Math.hypot((x - 4) / 4.5, (y - 4.5) / 5);
    if (d <= 1) p.set(x, y, d > 0.8 ? '#a06a10' : '#ffd84a');
  }
  p.set(4, 10, '#a06a10'); p.set(4, 11, '#a06a10');
  p.rect(4, 2, 1, 4, '#5a2a0a'); p.set(4, 7, '#5a2a0a');
  p.set(2, 2, '#fff6c0');
  return p.canvas();
}
