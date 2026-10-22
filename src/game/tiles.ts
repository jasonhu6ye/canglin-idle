import { GROUNDS, LIQUIDS, hash, type Ground } from './world';

/*
 * 程序生成的像素地块。每种地面 4 个变体；水、岩浆、裂谷、悬崖再按四边哪边挨着陆地，
 * 各生成 15 种带岸边描边的版本（只用一层 tilemap，省内存）。
 * 图集里每块 16×16 外面各留 1px，把边缘像素往外复制一圈，镜头缩放时不会出现接缝。
 */

export const T = 16;
export const VARIANTS = 4;
const CELL = T + 2;
const COLS = 16;
const EDGE_BASE = GROUNDS.length * VARIANTS;
export const TILE_COUNT = EDGE_BASE + LIQUIDS.length * 15 * VARIANTS;
const ROWS = Math.ceil(TILE_COUNT / COLS);
export const TILESET = { margin: 1, spacing: 2, width: COLS * CELL, height: ROWS * CELL };

const ANIMATED: Ground[] = ['water', 'ocean', 'swampwater', 'lava'];

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** 每种地面的色板：[暗, 底, 亮, 点缀] */
const PAL: Record<Ground, string[]> = {
  grass: ['#4b8536', '#5c9a42', '#74b350', '#8fca62'],
  meadow: ['#5a9640', '#6aa84c', '#82bd5c', '#f2e27a'],
  darkgrass: ['#2f5a29', '#3b6c32', '#4b7f3d', '#5f9447'],
  moss: ['#284f35', '#33613f', '#41744b', '#6aa26a'],
  cobble: ['#6a6257', '#9a907f', '#b4aa96', '#857b6b'],
  road: ['#7c5c38', '#9a7548', '#b08a58', '#6a4c2c'],
  roadsnow: ['#a9b2c2', '#c4cbd8', '#d8dee8', '#98a2b4'],
  roadsand: ['#b48d55', '#c8a266', '#d8b478', '#a07a48'],
  roaddark: ['#6a5644', '#806a54', '#957e66', '#5a4838'],
  farm: ['#4a3220', '#634329', '#7a5434', '#6aa040'],
  sand: ['#c8a462', '#dcbc78', '#ead08e', '#b8935a'],
  beach: ['#d8c088', '#ead6a2', '#f6e6ba', '#ffffff'],
  snow: ['#c9d6e6', '#e4ebf3', '#f4f8fc', '#ffffff'],
  ice: ['#7fb6dc', '#9fcbea', '#c4e4f8', '#ffffff'],
  rock: ['#6a6a68', '#82827e', '#9a9a94', '#5a5a58'],
  gravel: ['#76726a', '#8e897e', '#a8a296', '#5e5a54'],
  ash: ['#33272a', '#45353a', '#58464a', '#e0602a'],
  basalt: ['#241c1e', '#332a2c', '#45393a', '#b84a2a'],
  abyss: ['#221b33', '#2f2644', '#3e3358', '#7a5ac0'],
  glowmoss: ['#1e3a42', '#285058', '#34646a', '#7ff0e0'],
  mud: ['#3e3a26', '#524c32', '#655e40', '#7a7450'],
  bridge: ['#4a3220', '#8a6238', '#a87a48', '#c89a62'],
  water: ['#2f68b0', '#3c7cc4', '#5a9ad8', '#cfe8ff'],
  ocean: ['#1a4282', '#22508f', '#3466a8', '#a8d0f8'],
  swampwater: ['#2a3e2a', '#344c32', '#466246', '#7a9a62'],
  lava: ['#8a2410', '#c8401a', '#ff8a2a', '#ffe070'],
  chasm: ['#06040c', '#0c0816', '#160f26', '#4a3a7a'],
  cliff: ['#3e3e44', '#55555c', '#6e6e76', '#8a8a92'],
};

function groundPixel(g: Ground, x: number, y: number, v: number, f: number): RGB {
  const p = PAL[g].map(hex);
  const [dark, base, light, acc] = p;
  const n = hash(x, y, v * 31 + g.length);
  const n2 = hash(x >> 1, y >> 1, v * 17 + 5);
  switch (g) {
    case 'grass':
    case 'meadow':
    case 'darkgrass':
    case 'moss': {
      // 草丛：随机的小「v」形叶片
      for (let k = 0; k < 4; k++) {
        const bx = Math.floor(hash(v, k, 3) * 14) + 1;
        const by = Math.floor(hash(k, v, 4) * 12) + 3;
        if ((y === by && (x === bx - 1 || x === bx + 1)) || (y === by - 1 && x === bx)) return light;
        if (y === by + 1 && x === bx) return dark;
      }
      if (g === 'meadow' && v >= 2 && hash(x, y, v + 90) < 0.02) return n < 0.5 ? acc : hex('#ffffff');
      if (g === 'moss' && n > 0.97) return acc;
      return n < 0.14 ? dark : n > 0.9 ? light : n2 < 0.3 ? mix(base, dark, 0.35) : base;
    }
    case 'cobble': {
      // 错缝铺石
      const row = Math.floor(y / 4);
      const off = row % 2 ? 3 : 0;
      const col = Math.floor((x + off) / 6);
      const lx = (x + off) % 6;
      const ly = y % 4;
      if (ly === 3 || lx === 5) return dark;
      const tint = hash(col, row, v + 7);
      const stone = tint < 0.3 ? acc : tint > 0.8 ? mix(base, light, 0.4) : base;
      if (ly === 0 || lx === 0) return mix(stone, light, 0.55);
      if (ly === 2 && lx === 4) return mix(stone, dark, 0.3);
      return n > 0.94 ? mix(stone, dark, 0.25) : stone;
    }
    case 'road':
    case 'roadsnow':
    case 'roadsand':
    case 'roaddark': {
      if (hash(x >> 1, y >> 1, v + 40) < 0.07) return (x + y) % 2 ? light : acc;
      return n < 0.18 ? dark : n > 0.88 ? light : base;
    }
    case 'farm': {
      // 一条条田垄，偶尔冒出嫩芽
      const furrow = y % 4;
      if (furrow === 0) return dark;
      if (furrow === 1 && hash(x, y, v + 2) < 0.12) return acc;
      return furrow === 3 ? light : n < 0.2 ? dark : base;
    }
    case 'sand':
    case 'beach': {
      const ripple = Math.sin((x + y * 0.6 + v * 5) * 0.7) > 0.86;
      if (ripple) return light;
      if (g === 'beach' && n > 0.985) return acc;
      return n < 0.1 ? dark : n > 0.92 ? light : base;
    }
    case 'snow': {
      if (n > 0.985) return acc;
      const drift = Math.sin((x * 0.5 + y * 0.9 + v * 3)) > 0.8;
      return drift ? dark : n < 0.08 ? mix(base, dark, 0.5) : n > 0.8 ? light : base;
    }
    case 'ice': {
      // 冰面裂纹
      const crack = (x + v * 3) % 11 === Math.floor(y * 0.7) % 11 || (y + v) % 13 === 0 && x > 4 && x < 10;
      if (crack) return light;
      return n > 0.96 ? acc : n < 0.15 ? dark : base;
    }
    case 'rock':
    case 'gravel': {
      if (g === 'gravel' && hash(x >> 1, y >> 1, v + 9) < 0.25) return (x + y) % 2 ? light : dark;
      const crack = g === 'rock' && ((x * 3 + y * 2 + v * 7) % 17 === 0);
      if (crack) return acc;
      return n < 0.15 ? dark : n > 0.86 ? light : base;
    }
    case 'ash':
    case 'basalt': {
      if (n > 0.985) return acc;
      if (g === 'basalt' && (x % 6 === 0 || (y + (x >> 3) * 3) % 6 === 0)) return dark;
      return n < 0.15 ? dark : n > 0.88 ? light : base;
    }
    case 'abyss':
    case 'glowmoss': {
      if (n > (g === 'glowmoss' ? 0.95 : 0.99)) return acc;
      return n < 0.15 ? dark : n > 0.86 ? light : base;
    }
    case 'mud': {
      const puddle = hash(x >> 2, y >> 2, v + 70) < 0.2;
      if (puddle) return n > 0.8 ? acc : dark;
      return n < 0.12 ? dark : n > 0.9 ? light : base;
    }
    case 'bridge': {
      // 横向木板
      const ly = y % 5;
      if (ly === 4) return dark;
      if ((x === 2 || x === 13) && ly === 2) return hex('#2a1e17');
      return ly === 0 ? light : n < 0.1 ? mix(base, dark, 0.4) : hash(0, Math.floor(y / 5), v) < 0.5 ? base : acc;
    }
    case 'water':
    case 'ocean':
    case 'swampwater': {
      // 波纹：随帧移动的短横线
      const t = f * 0.6;
      const wave = Math.sin(x * 0.55 + t + Math.floor(y / 4) * 2.1 + v) + Math.sin(y * 0.9 - t * 0.7);
      if (wave > 1.75 && y % 4 === 1) return acc;
      if (wave > 1.3) return light;
      if (g === 'swampwater' && hash(x, y, Math.floor(f / 3) + v) > 0.995) return acc;
      return wave < -1.4 ? dark : base;
    }
    case 'lava': {
      const t = f * 0.35;
      const flow = Math.sin(x * 0.4 + t) + Math.sin(y * 0.5 - t * 0.8 + v) + Math.sin((x + y) * 0.3 + t * 0.5);
      if (flow > 2.1) return acc;
      if (flow > 1.0) return light;
      if (flow < -1.6) return dark;
      return base;
    }
    case 'chasm': {
      if (n > 0.993) return acc;
      return n < 0.4 ? dark : base;
    }
    case 'cliff': {
      // 竖向的岩层纹理
      const stripe = (x + Math.floor(hash(0, y >> 2, v) * 4)) % 5;
      if (stripe === 0) return dark;
      if (stripe === 1) return light;
      return n > 0.92 ? acc : base;
    }
  }
}

/** 岸边描边：mask 的 1/2/4/8 位 = 北/东/南/西 是陆地 */
function edgePixel(g: Ground, x: number, y: number, mask: number): RGB | null {
  const N = mask & 1, E = mask & 2, S = mask & 4, W = mask & 8;
  const dN = y, dS = 15 - y, dE = 15 - x, dW = x;
  const d = Math.min(N ? dN : 99, S ? dS : 99, E ? dE : 99, W ? dW : 99);
  if (g === 'cliff') {
    // 悬崖：南面露出竖直岩壁，北面亮边
    if (S && dS < 5) return dS === 0 ? hex('#1e1e22') : hex(dS < 2 ? '#2e2e34' : '#3a3a40');
    if (N && dN === 0) return hex('#9a9aa2');
    if ((E && dE === 0) || (W && dW === 0)) return hex('#2a2a30');
    return null;
  }
  if (g === 'chasm') {
    // 裂谷：北边是陆地往下延伸的崖壁
    if (N && dN < 6) return hex(dN === 0 ? '#5a4a6e' : dN < 3 ? '#3a2e4a' : '#241c30');
    if (d === 0) return hex('#4a3c5e');
    return null;
  }
  if (g === 'lava') {
    if (d === 0) return hex('#2a1410');
    if (d === 1) return hex('#ffd060');
    return null;
  }
  if (g === 'swampwater') {
    if (d === 0) return hex('#5a6a3a');
    if (d === 1 && (x + y) % 2) return hex('#7a8a50');
    return null;
  }
  // 水和海：岸边一道浪花，北岸加一点岸壁阴影
  if (N && dN === 0) return hex('#2a4a6a');
  if (d === 0) return hex(g === 'ocean' ? '#cfe6ff' : '#d8eeff');
  if (d === 1 && (x + y) % 3) return hex('#9cc8f0');
  return null;
}

export const tileIndex = (g: number, v: number) => g * VARIANTS + v;
/** mask 为 1-15；0 时用 tileIndex */
export const liquidIndex = (liquid: number, mask: number, v: number) => EDGE_BASE + (liquid * 15 + mask - 1) * VARIANTS + v;

function cellOrigin(i: number) {
  return { x: (i % COLS) * CELL + 1, y: Math.floor(i / COLS) * CELL + 1 };
}

function putTile(ctx: CanvasRenderingContext2D, i: number, pixel: (x: number, y: number) => RGB | null) {
  const img = ctx.createImageData(CELL, CELL);
  for (let py = 0; py < CELL; py++) {
    for (let px = 0; px < CELL; px++) {
      // 外圈 1px 取最近的内部像素（extrude）
      const x = Math.min(15, Math.max(0, px - 1));
      const y = Math.min(15, Math.max(0, py - 1));
      const c = pixel(x, y);
      const o = (py * CELL + px) * 4;
      if (!c) continue;
      img.data[o] = c[0];
      img.data[o + 1] = c[1];
      img.data[o + 2] = c[2];
      img.data[o + 3] = 255;
    }
  }
  const { x, y } = cellOrigin(i);
  ctx.putImageData(img, x - 1, y - 1);
}

export function paintTileset(canvas: HTMLCanvasElement) {
  canvas.width = TILESET.width;
  canvas.height = TILESET.height;
  const ctx = canvas.getContext('2d')!;
  GROUNDS.forEach((g, gi) => {
    for (let v = 0; v < VARIANTS; v++) putTile(ctx, tileIndex(gi, v), (x, y) => groundPixel(g, x, y, v, 0));
  });
  LIQUIDS.forEach((g, li) => paintLiquid(ctx, g, li, 0));
}

function paintLiquid(ctx: CanvasRenderingContext2D, g: Ground, li: number, frame: number) {
  for (let mask = 1; mask < 16; mask++) {
    for (let v = 0; v < VARIANTS; v++) {
      putTile(ctx, liquidIndex(li, mask, v), (x, y) => edgePixel(g, x, y, mask) ?? groundPixel(g, x, y, v, frame));
    }
  }
}

/** 只重画水面和岩浆，返回 true 表示画布有变化 */
export function animateTileset(canvas: HTMLCanvasElement, frame: number) {
  const ctx = canvas.getContext('2d')!;
  for (const g of ANIMATED) {
    const gi = GROUNDS.indexOf(g);
    for (let v = 0; v < VARIANTS; v++) putTile(ctx, tileIndex(gi, v), (x, y) => groundPixel(g, x, y, v, frame));
    paintLiquid(ctx, g, LIQUIDS.indexOf(g), frame);
  }
}

/** 世界地图用的平均色 */
export const GROUND_COLOR: Record<Ground, string> = Object.fromEntries(GROUNDS.map((g) => [g, PAL[g][1]])) as Record<Ground, string>;
