import { GROUNDS, LIQUIDS, hash, type Ground } from './world';

/*
 * 程序生成的像素地块。每种地面 4 个变体；水、岩浆、裂谷、悬崖再按四边哪边挨着陆地，
 * 各生成 15 种带岸边描边的版本（只用一层 tilemap，省内存）。
 * 图集里每块 16×16 外面各留 1px，把边缘像素往外复制一圈，镜头缩放时不会出现接缝。
 */

export const T = 16;
export const VARIANTS = 4;
/**
 * 地块的高清倍数（10-28 画质升级）：图集按 2 倍像素画，tilemap 图层缩回原大小。
 * 地面花纹还是按 16×16 逻辑像素算，每个逻辑像素底下的真像素再往相邻像素的颜色稍微过渡、加一点颗粒，看起来更细。
 */
export const TILE_RES = 2;
const CELL = (T + 2) * TILE_RES;
const COLS = 16;
const EDGE_BASE = GROUNDS.length * VARIANTS;
export const TILE_COUNT = EDGE_BASE + LIQUIDS.length * 15 * VARIANTS;
const ROWS = Math.ceil(TILE_COUNT / COLS);
/** 图集里每格的真像素尺寸和间距（margin/spacing 都已乘倍数） */
export const TILESET = { tile: T * TILE_RES, margin: TILE_RES, spacing: 2 * TILE_RES, width: COLS * CELL, height: ROWS * CELL };

const ANIMATED: Ground[] = ['water', 'ocean', 'swampwater', 'lava', 'shallows', 'moonwater', 'starwater'];

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
  savanna: ['#a08a3c', '#b8a04a', '#cfb85e', '#6a8a34'],
  autumn: ['#8a4a22', '#a85e2a', '#c47a36', '#e8b040'],
  jungle: ['#1c4a22', '#245c2a', '#2e7034', '#c84a6a'],
  redrock: ['#8a3e26', '#a85232', '#c26a42', '#6a2a1a'],
  dune: ['#c8964a', '#dcaa5a', '#ecc274', '#b07c3a'],
  crystalground: ['#3a3a5e', '#4a4a74', '#5e5e8e', '#a8f0ff'],
  alpine: ['#6a7a6a', '#869484', '#a4b0a0', '#e8eef2'],
  coral: ['#d8b890', '#e8caa0', '#f4dcb8', '#f07a7a'],
  shallows: ['#2a9ab0', '#38b0c4', '#5ccad8', '#e0fbff'],
  redcliff: ['#5a2418', '#7a3422', '#9a4a30', '#b86040'],
  // 12080 最外圈（10-24）
  hillgrass: ['#3e8a5a', '#4e9e68', '#68b47c', '#c8e0a0'],
  marble: ['#a8a49c', '#d4d0c6', '#e8e4dc', '#b8b0e0'],
  moonmud: ['#3a2e48', '#4a3c5a', '#5e4e70', '#a888d8'],
  frostrock: ['#4a5670', '#5e6c8a', '#7888a6', '#d8e8ff'],
  stormrock: ['#262634', '#33334a', '#44445e', '#9ad0ff'],
  blacksand: ['#1e1a1c', '#2c2628', '#3c3436', '#e06a2a'],
  chalk: ['#c8c4b8', '#e2ded2', '#f2eee4', '#a8a498'],
  moonwater: ['#2e2448', '#3a2e5c', '#52427a', '#c8a8ff'],
  starwater: ['#141850', '#1c2266', '#2a3284', '#e8e0ff'],
};

// 每个像素都要用调色板，先解析一次（以前每个像素都重新 parseInt，开局要多花 1 秒）
const PAL_RGB = Object.fromEntries(Object.entries(PAL).map(([k, v]) => [k, v.map(hex)])) as Record<Ground, RGB[]>;

function groundPixel(g: Ground, x: number, y: number, v: number, f: number): RGB {
  const p = PAL_RGB[g];
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
    case 'savanna': {
      // 枯黄高草：竖直短线，偶尔一小块绿
      if (hash(x >> 2, y >> 2, v + 120) < 0.08) return acc;
      if ((x + Math.floor(hash(x, 0, v) * 6)) % 4 === 0 && y % 5 < 3) return light;
      return n < 0.15 ? dark : base;
    }
    case 'autumn': {
      // 满地落叶：红、橙、黄几种叶片色块
      if (hash(x >> 1, y >> 1, v + 130) < 0.12) return acc;
      if (hash(x >> 1, y >> 1, v + 131) < 0.1) return hex('#c8402a');
      return n < 0.15 ? dark : n > 0.88 ? light : base;
    }
    case 'jungle': {
      // 深绿厚叶，零星红花
      for (let k = 0; k < 3; k++) {
        const bx = Math.floor(hash(v, k, 13) * 13) + 1;
        const by = Math.floor(hash(k, v, 14) * 12) + 2;
        if (Math.abs(x - bx) + Math.abs(y - by) === 2 && y <= by) return light;
      }
      if (n > 0.992) return acc;
      return n < 0.2 ? dark : base;
    }
    case 'redrock':
    case 'redcliff': {
      // 横向的沉积岩层
      const band = (y + Math.floor(hash(x >> 3, 0, v) * 3)) % 6;
      if (band === 0) return dark;
      if (band === 1) return light;
      if (g === 'redcliff' && (x + v) % 7 === 0) return dark;
      return n > 0.95 ? acc : base;
    }
    case 'dune': {
      // 弯曲的沙脊
      const ridge = Math.sin(x * 0.35 + Math.sin(y * 0.3 + v) * 2 + y * 0.5);
      if (ridge > 0.9) return light;
      if (ridge < -0.92) return dark;
      return n > 0.97 ? acc : base;
    }
    case 'crystalground': {
      // 暗紫晶地，偶尔闪一颗亮晶
      if (n > 0.985) return acc;
      if ((x * 2 + y * 3 + v * 5) % 19 === 0) return light;
      return n < 0.18 ? dark : base;
    }
    case 'alpine': {
      // 高山草甸：灰绿碎石夹着残雪
      if (hash(x >> 2, y >> 2, v + 150) < 0.1) return acc;
      if (hash(x >> 1, y >> 1, v + 151) < 0.15) return (x + y) % 2 ? light : dark;
      return n < 0.15 ? dark : base;
    }
    case 'coral': {
      // 珊瑚沙：浅色沙里混着粉红碎珊瑚
      if (hash(x >> 1, y >> 1, v + 160) < 0.05) return acc;
      return n < 0.1 ? dark : n > 0.9 ? light : base;
    }
    case 'shallows': {
      // 浅海：能看到沙底的亮斑，波纹更密
      const t = f * 0.6;
      const wave = Math.sin(x * 0.7 + t + Math.floor(y / 3) * 1.7 + v) + Math.sin(y * 1.1 - t * 0.6);
      if (wave > 1.7 && y % 3 === 1) return acc;
      if (wave > 1.1) return light;
      if (hash(x >> 2, y >> 2, v + 170) < 0.12) return mix(base, hex('#e8d8a8'), 0.25);
      return wave < -1.5 ? dark : base;
    }
    case 'hillgrass': {
      // 青岚草：蓝绿色的短草，草叶比普通草地稀，偶尔一朵小白花
      for (let k = 0; k < 3; k++) {
        const bx = Math.floor(hash(v, k, 23) * 14) + 1;
        const by = Math.floor(hash(k, v, 24) * 12) + 3;
        if ((y === by && (x === bx - 1 || x === bx + 1)) || (y === by - 1 && x === bx)) return light;
      }
      if (n > 0.992) return acc;
      return n < 0.12 ? dark : n2 < 0.25 ? mix(base, light, 0.3) : base;
    }
    case 'marble': {
      // 白石板：大块方砖，细缝，偶尔一道淡紫的纹
      const lx = x % 8;
      const ly = y % 8;
      if (lx === 7 || ly === 7) return dark;
      if ((lx + ly * 2 + v) % 13 === 0 && n > 0.5) return acc;
      if (lx === 0 || ly === 0) return light;
      return n < 0.08 ? mix(base, dark, 0.3) : base;
    }
    case 'moonmud': {
      // 紫色烂泥：小水洼反着淡紫的光
      if (hash(x >> 2, y >> 2, v + 180) < 0.16) return n > 0.75 ? acc : dark;
      return n < 0.12 ? dark : n > 0.9 ? light : base;
    }
    case 'frostrock':
    case 'stormrock': {
      // 冷色岩地：斜向的裂纹；雷鸣断层的裂纹里透着电光
      const crack = (x * 2 + y * 3 + v * 5) % 23 === 0 || (x + y * 2 + v) % 29 === 0;
      if (crack) return g === 'stormrock' && n > 0.6 ? acc : dark;
      if (g === 'frostrock' && n > 0.97) return acc;
      return n < 0.14 ? dark : n > 0.86 ? light : base;
    }
    case 'blacksand': {
      // 黑沙：细碎的颗粒，偶尔一粒火星
      if (n > 0.993) return acc;
      const ripple = Math.sin((x * 0.8 + y * 0.5 + v * 4) * 0.7) > 0.9;
      return ripple ? light : n < 0.2 ? dark : base;
    }
    case 'chalk': {
      // 白垩：横向的浅色层理
      const band = (y + Math.floor(hash(x >> 3, 1, v) * 3)) % 5;
      if (band === 0) return acc;
      return n > 0.9 ? light : base;
    }
    case 'moonwater':
    case 'starwater': {
      // 月沼和晶海：波纹里闪着星光
      const t = f * 0.5;
      const wave = Math.sin(x * 0.5 + t + Math.floor(y / 4) * 2.3 + v) + Math.sin(y * 0.8 - t * 0.7);
      if (hash(x, y, Math.floor(f / 2) + v * 7) > (g === 'starwater' ? 0.992 : 0.996)) return acc;
      if (wave > 1.5) return light;
      return wave < -1.4 ? dark : base;
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
  if (g === 'redcliff') {
    // 红岩悬崖：南面是陡峭的红色崖壁
    if (S && dS < 5) return dS === 0 ? hex('#2a0e08') : hex(dS < 2 ? '#3e160c' : '#4e1e12');
    if (N && dN === 0) return hex('#c8784e');
    if ((E && dE === 0) || (W && dW === 0)) return hex('#3a140c');
    return null;
  }
  if (g === 'shallows') {
    if (d === 0) return hex('#f4ecc8');
    if (d === 1 && (x + y) % 2) return hex('#a8e8ee');
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
  if (g === 'moonwater') {
    if (d === 0) return hex('#6a5a8a');
    if (d === 1 && (x + y) % 2) return hex('#9a80c8');
    return null;
  }
  if (g === 'starwater') {
    if (N && dN === 0) return hex('#1a1a40');
    if (d === 0) return hex('#d8d0ff');
    if (d === 1 && (x + y) % 3) return hex('#8a8ae0');
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
  return { x: (i % COLS) * CELL + TILE_RES, y: Math.floor(i / COLS) * CELL + TILE_RES };
}

let tileImg: ImageData | null = null;
function putTile(ctx: CanvasRenderingContext2D, i: number, pixel: (x: number, y: number) => RGB | null) {
  const img = tileImg ?? (tileImg = ctx.createImageData(CELL, CELL));
  const R = TILE_RES;
  const half = R / 2;
  for (let py = 0; py < CELL; py++) {
    for (let px = 0; px < CELL; px++) {
      // 外圈一个逻辑像素取最近的内部像素（extrude）
      const ix = Math.min(15 * R + R - 1, Math.max(0, px - R));
      const iy = Math.min(15 * R + R - 1, Math.max(0, py - R));
      const x = ix >> (R === 2 ? 1 : 0);
      const y = iy >> (R === 2 ? 1 : 0);
      let c = pixel(x, y);
      const o = (py * CELL + px) * 4;
      if (!c) { img.data[o + 3] = 0; continue; }
      if (R > 1) {
        // 这个真像素靠近哪边，就往那边的相邻逻辑像素过渡一点，1 像素的叶片、石缝就不那么生硬；再加一点颗粒
        const sx = ix % R < half ? -1 : 1;
        const sy = iy % R < half ? -1 : 1;
        const a = x + sx >= 0 && x + sx < 16 ? pixel(x + sx, y) : null;
        const b = y + sy >= 0 && y + sy < 16 ? pixel(x, y + sy) : null;
        const grain = 1 + (hash(ix + i * 37, iy, 7) - 0.5) * 0.09;
        c = [
          (c[0] * 0.72 + (a ?? c)[0] * 0.14 + (b ?? c)[0] * 0.14) * grain,
          (c[1] * 0.72 + (a ?? c)[1] * 0.14 + (b ?? c)[1] * 0.14) * grain,
          (c[2] * 0.72 + (a ?? c)[2] * 0.14 + (b ?? c)[2] * 0.14) * grain,
        ];
      }
      img.data[o] = c[0];
      img.data[o + 1] = c[1];
      img.data[o + 2] = c[2];
      img.data[o + 3] = 255;
    }
  }
  const { x, y } = cellOrigin(i);
  ctx.putImageData(img, x - R, y - R);
}

export function paintTileset(canvas: HTMLCanvasElement) {
  canvas.width = TILESET.width;
  canvas.height = TILESET.height;
  const ctx = canvas.getContext('2d')!;
  GROUNDS.forEach((g, gi) => {
    for (let v = 0; v < VARIANTS; v++) putTile(ctx, tileIndex(gi, v), (x, y) => groundPixel(g, x, y, v, 0));
  });
  LIQUIDS.forEach((g, li) => paintLiquid(ctx, g, li, groundFrame(g, 0)));
}

function paintLiquid(ctx: CanvasRenderingContext2D, g: Ground, li: number, ground: RGB[][]) {
  const edges = edgesOf(g);
  for (let mask = 1; mask < 16; mask++) {
    const e = edges[mask];
    for (let v = 0; v < VARIANTS; v++) {
      const px = ground[v];
      putTile(ctx, liquidIndex(li, mask, v), (x, y) => e[y * 16 + x] ?? px[y * 16 + x]);
    }
  }
}

/** 一种地面某一帧 4 个变体的 16×16 像素（液体的 60 个岸边格子都复用它，不再每格重算噪声） */
function groundFrame(g: Ground, frame: number): RGB[][] {
  return Array.from({ length: VARIANTS }, (_, v) => {
    const px: RGB[] = new Array(256);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px[y * 16 + x] = groundPixel(g, x, y, v, frame);
    return px;
  });
}

/** 岸边像素不随帧变化，算一次存起来 */
const EDGES = new Map<Ground, (RGB | null)[][]>();
function edgesOf(g: Ground) {
  let e = EDGES.get(g);
  if (!e) {
    e = [[]];
    for (let mask = 1; mask < 16; mask++) {
      const px: (RGB | null)[] = new Array(256);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px[y * 16 + x] = edgePixel(g, x, y, mask);
      e.push(px);
    }
    EDGES.set(g, e);
  }
  return e;
}

/** 只重画水面和岩浆（以前每 0.22 秒把 7 种液体 448 个格子逐像素重算一遍噪声，占了主线程三成时间） */
export function animateTileset(canvas: HTMLCanvasElement, frame: number) {
  const ctx = canvas.getContext('2d')!;
  for (const g of ANIMATED) {
    const gi = GROUNDS.indexOf(g);
    const ground = groundFrame(g, frame);
    for (let v = 0; v < VARIANTS; v++) {
      const px = ground[v];
      putTile(ctx, tileIndex(gi, v), (x, y) => px[y * 16 + x]);
    }
    const li = LIQUIDS.indexOf(g);
    if (li >= 0) paintLiquid(ctx, g, li, ground);
  }
}

/** 世界地图用的平均色 */
export const GROUND_COLOR: Record<Ground, string> = Object.fromEntries(GROUNDS.map((g) => [g, PAL[g][1]])) as Record<Ground, string>;
