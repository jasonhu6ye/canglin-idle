import { ITEMS, TIERS } from '../core/data';
import { phash, Pix } from './pix';

/*
 * T1-T8 分阶资源的像素画：背包图标（16×16）和地图上的资源物件（矿石堆、树、棉株、晒皮架）。
 * 每一阶都有自己的配色和花纹，同名的棉花、兽皮靠颜色和图案区分。
 */

export type ResKind = 'ore' | 'log' | 'cotton' | 'hide';

/** 物品 id → 资源种类和阶级（0 = T1），不是分阶资源返回 null */
export function resOf(id: string): { kind: ResKind; tier: number } | null {
  const tier = ITEMS[id]?.tier;
  if (tier === undefined) return null;
  if (id === TIERS[tier].ore) return { kind: 'ore', tier };
  if (id === `${TIERS[tier].wood}_log`) return { kind: 'log', tier };
  if (id === `cotton_${tier + 1}`) return { kind: 'cotton', tier };
  if (id === `hide_${tier + 1}`) return { kind: 'hide', tier };
  return null;
}

// ---- 配色 ----

type OreStyle = 'pile' | 'specks' | 'streak' | 'chunks' | 'facet' | 'glyph' | 'crater' | 'crystal';
/** 矿石：[岩石四色, 矿物三色, 花纹] */
const ORE: [string[], string[], OreStyle][] = [
  [['#4a4a4e', '#6e6e72', '#94949a', '#b8b8bc'], ['#5a5a5e', '#808084', '#a4a4a8'], 'pile'],
  [['#4a3e38', '#6a5a50', '#8a786c', '#a8968a'], ['#8a4a1a', '#d07a3a', '#f0a868'], 'specks'],
  [['#4e5054', '#707276', '#94969a', '#b4b6ba'], ['#9aa0a8', '#dce0e6', '#ffffff'], 'streak'],
  [['#3a3230', '#564a46', '#74645c', '#8e7c72'], ['#6a2a1a', '#a8482a', '#d07050'], 'chunks'],
  [['#2e3a4a', '#465a70', '#6a849c', '#90aac0'], ['#3a90c0', '#8ad8ff', '#e8faff'], 'facet'],
  [['#2a2638', '#3e3852', '#5a5272', '#766e90'], ['#7a3ad8', '#b070ff', '#ecd0ff'], 'glyph'],
  [['#1e1a1a', '#322a28', '#4a3e3a', '#665650'], ['#c04010', '#ff8a2a', '#ffd070'], 'crater'],
  [['#2a3a30', '#3e5444', '#5a7660', '#7a9a80'], ['#1e8a5a', '#4ad898', '#d8ffe8'], 'crystal'],
];

/** 木头：[树皮三色, 截面三色] */
const LOG: [string[], string[]][] = [
  [['#4a2e1a', '#6a4426', '#8a5c34'], ['#a87a48', '#c89a60', '#e0b880']],
  [['#a8a49a', '#e0dcd0', '#ffffff'], ['#c0a070', '#d8b888', '#ecd0a0']],
  [['#5a3420', '#7a4a2a', '#9a6438'], ['#d0a860', '#e8c478', '#f8dc98']],
  [['#3a2818', '#54402a', '#6e5838'], ['#9a7040', '#b88a50', '#d0a468']],
  [['#6a3020', '#8c4430', '#ae5c40'], ['#d08060', '#e8a078', '#f8c098']],
  [['#2a1414', '#441e1e', '#5e2a28'], ['#8a1a1a', '#c02a2a', '#e85050']],
  [['#1a1818', '#2a2626', '#3e3836'], ['#5a5450', '#7a726c', '#9a928a']],
  [['#b8b4ac', '#e0dcd4', '#ffffff'], ['#e0d4a8', '#f0e8c4', '#fffbe8']],
];
/** 树冠四色 */
const LEAF: string[][] = [
  ['#2a5a26', '#3c7a32', '#58a040', '#7cc456'],
  ['#5a7a2a', '#7a9a38', '#9cbc4a', '#c4dc6a'],
  ['#1e4a2e', '#2a6038', '#3a7a46', '#4e9658'],
  ['#1e4020', '#2a5a2a', '#3e7636', '#5a9444'],
  ['#1e4048', '#2a5a60', '#3e7a7a', '#a8d0d0'],
  ['#4a0e14', '#7a1a20', '#a82a2a', '#d84a40'],
  ['#3a3634', '#545050', '#747070', '#9a9490'],
  ['#a8a890', '#d0d0b8', '#ecead4', '#fffbe0'],
];

/** 棉花：[棉桃两色, 茎叶三色] */
const COTTON: [string[], string[]][] = [
  [['#d8d4cc', '#f8f6f0'], ['#2e5a26', '#3e7a32', '#5a9a40']],
  [['#d8c498', '#f4e6c0'], ['#3a5a24', '#527a30', '#6e9a40']],
  [['#e0a0b0', '#fcd4dc'], ['#2e5a2e', '#3e7a3e', '#5a9a50']],
  [['#98b8e0', '#d4e8fc'], ['#2a4a3a', '#3a6a50', '#4e8a64']],
  [['#b0d4e8', '#f0faff'], ['#2a4a58', '#3a6a78', '#5a8c98']],
  [['#c8902a', '#f8d070'], ['#4a3a1a', '#6a5426', '#8a7034']],
  [['#d0602a', '#ffa868'], ['#2a2220', '#3e3430', '#5a4a40']],
  [['#b8a0e8', '#f0e8ff'], ['#4a4a5a', '#6a6a7e', '#9a9aae']],
];

type HideStyle = 'plain' | 'belly' | 'stripe' | 'bands' | 'spots' | 'scales' | 'embers' | 'glow';
/** 兽皮：[三色, 花纹, 花纹色] */
const HIDE: [string[], HideStyle, string][] = [
  [['#7a5434', '#a07a50', '#c09a6a'], 'plain', ''],
  [['#8a6a40', '#b8925a', '#d8b47a'], 'belly', '#f0dcb0'],
  [['#5a5a5e', '#7e7e84', '#a4a4aa'], 'stripe', '#3e3e42'],
  [['#4a3020', '#6a4430', '#8a5c40'], 'bands', '#2a1a10'],
  [['#c8ccd4', '#e8ecf2', '#ffffff'], 'spots', '#8a92a0'],
  [['#5a2a1a', '#8a3a22', '#b85a30'], 'scales', '#e08a50'],
  [['#1e1a1e', '#2e282e', '#463e46'], 'embers', '#ff8a2a'],
  [['#3a2a5a', '#5a3e8a', '#8a6ac0'], 'glow', '#e0c8ff'],
];

// ---- 共用的画法 ----

function oreRock(p: Pix, cx: number, cy: number, rx: number, ry: number, t: number, seed: number) {
  const [rock, min, style] = ORE[t];
  if (style === 'pile') {
    p.blob(cx - rx * 0.35, cy + ry * 0.2, rx * 0.62, ry * 0.75, rock, seed);
    p.blob(cx + rx * 0.4, cy + ry * 0.3, rx * 0.55, ry * 0.62, rock, seed + 1);
    p.blob(cx + rx * 0.05, cy - ry * 0.35, rx * 0.5, ry * 0.55, rock, seed + 2);
    return;
  }
  if (style === 'crystal') {
    p.blob(cx, cy + ry * 0.35, rx, ry * 0.65, rock, seed);
    const spikes: [number, number, number][] = [[0, -1, 0.34], [-0.45, -0.55, 0.24], [0.45, -0.6, 0.26]];
    for (const [ox, top, hw] of spikes) {
      const x0 = cx + ox * rx;
      const y0 = cy + top * ry;
      const y1 = cy + ry * 0.4;
      for (let y = Math.round(y0); y <= y1; y++) {
        const k = Math.min(1, (y - y0) / ((y1 - y0) * 0.4));
        const half = Math.max(0.5, hw * rx * k);
        for (let x = Math.round(x0 - half); x <= Math.round(x0 + half); x++) p.set(x, y, x < x0 - 0.3 ? min[2] : x > x0 + 0.3 ? min[0] : min[1]);
      }
      p.set(x0, y0, '#ffffff');
    }
    // 精金的金色斑点
    for (let i = 0; i < 4; i++) p.paint(cx - rx * 0.7 + phash(i, seed, 3) * rx * 1.4, cy + ry * (0.3 + phash(seed, i, 4) * 0.5), '#e8c84a');
    return;
  }
  p.blob(cx, cy, rx, ry, rock, seed);
  const n = Math.max(3, Math.round(rx * ry * 0.18));
  const rnd = (i: number, k: number) => phash(i, seed, k);
  const inside = (i: number): [number, number] => [cx - rx * 0.75 + rnd(i, 1) * rx * 1.5, cy - ry * 0.65 + rnd(i, 2) * ry * 1.4];
  if (style === 'specks') {
    for (let i = 0; i < n; i++) {
      const [x, y] = inside(i);
      p.paint(x, y, min[1]);
      p.paint(x + 1, y, min[0]);
      p.paint(x, y - 1, min[2]);
    }
  } else if (style === 'streak') {
    for (let i = 0; i < 3; i++) {
      const [x, y] = inside(i);
      for (let k = 0; k < 4; k++) p.paint(x + k, y - k * 0.5, k === 1 ? min[2] : min[1]);
    }
  } else if (style === 'chunks') {
    for (let i = 0; i < n / 2; i++) {
      const [x, y] = inside(i);
      p.paint(x, y, min[1]);
      p.paint(x + 1, y, min[1]);
      p.paint(x, y + 1, min[0]);
      p.paint(x + 1, y + 1, min[0]);
    }
  } else if (style === 'facet') {
    // 钛矿：一道斜切的亮面
    for (let y = Math.round(cy - ry); y <= cy + ry; y++) {
      for (let x = Math.round(cx - rx); x <= cx + rx; x++) {
        const d = (x - cx) + (y - cy) * 0.8;
        if (d > -rx * 0.15 && d < rx * 0.35) p.paint(x, y, d < rx * 0.05 ? min[2] : min[1]);
        else if (d >= rx * 0.35 && d < rx * 0.5) p.paint(x, y, min[0]);
      }
    }
  } else if (style === 'glyph') {
    // 符文矿：发光的符文线
    const gx = Math.round(cx);
    const gy = Math.round(cy);
    const s = Math.max(2, Math.round(Math.min(rx, ry) * 0.5));
    p.line(gx, gy - s, gx, gy + s, min[1]);
    p.line(gx - s, gy - s + 1, gx, gy, min[1]);
    p.line(gx, gy, gx + s, gy - s + 1, min[1]);
    p.paint(gx, gy - s, min[2]);
    p.paint(gx, gy + s, min[2]);
  } else if (style === 'crater') {
    // 陨铁：烧红的坑洞
    for (let i = 0; i < Math.max(2, n / 3); i++) {
      const [x, y] = inside(i);
      p.paint(x, y, min[0]);
      p.paint(x + 1, y, min[1]);
      p.paint(x, y + 1, min[1]);
      p.paint(x + 1, y + 1, min[2]);
    }
  }
}

function logPiece(p: Pix, x0: number, y0: number, len: number, r: number, t: number) {
  const [bark, end] = LOG[t];
  // 横放的圆木，右端是截面
  for (let x = x0; x < x0 + len; x++) {
    for (let y = y0 - r; y <= y0 + r; y++) {
      const k = (y - y0) / r;
      p.set(x, y, k < -0.4 ? bark[2] : k < 0.5 ? bark[1] : bark[0]);
    }
  }
  const ex = x0 + len;
  for (let y = y0 - r; y <= y0 + r; y++) {
    for (let x = ex - 1; x <= ex + r * 0.6; x++) {
      const d = Math.hypot((x - ex) / (r * 0.7), (y - y0) / r);
      if (d > 1.05) continue;
      p.set(x, y, d > 0.8 ? bark[0] : d > 0.55 ? end[1] : d > 0.3 ? end[2] : end[0]);
    }
  }
  // 每一阶的特征
  if (t === 1) for (let x = x0 + 1; x < x0 + len - 1; x += 3) p.set(x, y0 - Math.round(r * 0.3) + (x % 2), '#2a2a2a');
  if (t === 2) p.set(x0 + 2, y0 + r, '#f0b030');
  if (t === 4) for (let x = x0; x < x0 + len; x++) if (phash(x, 1, 9) < 0.7) p.set(x, y0 - r, '#f4f8fc');
  if (t === 5) {
    p.set(ex - 1, y0 + r + 1, '#c02a2a');
    p.set(ex - 1, y0 + r + 2, '#e85050');
  }
  if (t === 6) for (let x = x0 + 1; x < x0 + len; x += 2) if (phash(x, 2, 7) < 0.5) p.set(x, y0 + (phash(x, 3, 7) < 0.5 ? 0 : 1), '#ff8a2a');
  if (t === 7) {
    p.set(x0 + 2, y0 - r + 1, '#fff6c0');
    p.set(ex, y0 - 1, '#fffbe8');
  }
}

function cottonPlant(p: Pix, cx: number, base: number, h: number, t: number, seed: number) {
  const [boll, leaf] = COTTON[t];
  p.line(cx, base, cx, base - h, leaf[0]);
  p.line(cx, base - h * 0.4, cx - h * 0.4, base - h * 0.75, leaf[1]);
  p.line(cx, base - h * 0.5, cx + h * 0.4, base - h * 0.85, leaf[1]);
  p.set(cx - 1, base - h * 0.25, leaf[2]);
  p.set(cx + 1, base - h * 0.3, leaf[2]);
  const bolls: [number, number][] = [[cx, base - h], [cx - h * 0.4, base - h * 0.75], [cx + h * 0.4, base - h * 0.85]];
  bolls.forEach(([x, y], i) => {
    const r = h > 10 ? 2 : 1.5;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r + 0.5) continue;
        p.set(x + dx, y + dy, dx + dy < 0 ? boll[1] : boll[0]);
      }
    }
    p.set(x - 1, y + r + 1, leaf[0]);
    p.set(x + 1, y + r + 1, leaf[0]);
    if (t >= 5 && phash(i, seed, 2) < 0.7) p.set(x, y - r, '#ffffff');
  });
}

function pelt(p: Pix, cx: number, cy: number, w: number, h: number, t: number) {
  const [pal, style, accent] = HIDE[t];
  const hw = w / 2;
  const hh = h / 2;
  for (let y = Math.round(cy - hh); y <= cy + hh; y++) {
    for (let x = Math.round(cx - hw); x <= cx + hw; x++) {
      const dx = (x - cx) / hw;
      const dy = (y - cy) / hh;
      // 兽皮轮廓：中间是椭圆，四角伸出腿
      const body = dx * dx * 1.4 + dy * dy < 0.8;
      const legs = Math.abs(dy) > 0.45 && Math.abs(dx) > 0.55 && Math.abs(dx) < 0.95 && Math.abs(dy) < 1;
      const head = dy < -0.75 && Math.abs(dx) < 0.25;
      if (!body && !legs && !head) continue;
      const s = -dx * 0.4 - dy * 0.6;
      p.set(x, y, s > 0.3 ? pal[2] : s > -0.3 ? pal[1] : pal[0]);
    }
  }
  const at = (x: number, y: number, c: string) => p.paint(cx + x, cy + y, c);
  const ix = Math.max(1, Math.round(hw * 0.5));
  const iy = Math.max(1, Math.round(hh * 0.6));
  if (style === 'belly') for (let y = -iy + 1; y < iy; y++) at(0, y, accent);
  if (style === 'stripe') for (let y = -iy; y <= iy; y++) { at(0, y, accent); at(-1, y, accent); }
  if (style === 'bands') for (let y = -iy; y <= iy; y += 2) for (let x = -ix; x <= ix; x++) if (Math.abs(x) > 0) at(x, y, accent);
  if (style === 'spots') for (let i = 0; i < 6; i++) at(Math.round((phash(i, 4, 1) - 0.5) * hw * 1.4), Math.round((phash(i, 5, 1) - 0.5) * hh * 1.4), accent);
  if (style === 'scales' || style === 'glow') {
    for (let y = -iy; y <= iy; y += 2) for (let x = -ix + (y & 1); x <= ix; x += 2) at(x, y, style === 'glow' ? pal[2] : accent);
  }
  if (style === 'embers') for (let i = 0; i < 5; i++) at(Math.round((phash(i, 6, 1) - 0.5) * hw * 1.2), Math.round((phash(i, 7, 1) - 0.5) * hh * 1.2), accent);
  if (style === 'glow') for (let i = 0; i < 3; i++) at(Math.round((phash(i, 8, 1) - 0.5) * hw), Math.round((phash(i, 9, 1) - 0.5) * hh), accent);
}

// ---- 背包图标 ----

const iconCache = new Map<string, string>();

/** 分阶资源的图标（data URL），不是分阶资源返回 null */
export function resIconUrl(id: string): string | null {
  const r = resOf(id);
  if (!r || typeof document === 'undefined') return null;
  const hit = iconCache.get(id);
  if (hit) return hit;
  const p = new Pix(16, 16);
  const t = r.tier;
  if (r.kind === 'ore') oreRock(p, 7.5, 8.5, 6, 5.5, t, 11 + t);
  if (r.kind === 'log') {
    logPiece(p, 1, 10, 9, 2, t);
    logPiece(p, 3, 5, 8, 2, t);
  }
  if (r.kind === 'cotton') cottonPlant(p, 7.5, 15, 11, t, t);
  if (r.kind === 'hide') pelt(p, 7.5, 8, 14, 13, t);
  const url = p.outline().canvas().toDataURL();
  iconCache.set(id, url);
  return url;
}

// ---- 地图上的资源物件 ----

function oreNode(t: number) {
  const p = new Pix(26, 20);
  oreRock(p, 9, 11, 7.5, 6.5, t, 40 + t);
  oreRock(p, 18.5, 13.5, 5, 4.5, t, 50 + t);
  return p.outline();
}

function treeNode(t: number) {
  const leaf = LEAF[t];
  const bark = LOG[t][0];
  const conifer = t === 2 || t === 4;
  const w = t === 3 || t === 5 || t === 7 ? 26 : 20;
  const h = conifer ? 30 : 28;
  const p = new Pix(w, h);
  const cx = w / 2 - 0.5;
  p.trunk(cx, h - 10, h - 2, t === 3 || t === 5 ? 4 : 3, bark);
  if (t === 1) for (let y = h - 9; y < h - 2; y += 2) p.set(cx, y, '#2a2a2a');
  if (conifer) {
    for (let k = 0; k < 4; k++) {
      const top = 1 + k * 5;
      const half = 2.5 + k * 1.6;
      for (let y = 0; y < 7; y++) {
        const hw = (half * (y + 1)) / 7;
        for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
          const s = (cx - x) / (hw + 0.5) - y / 7;
          let c = s > 0.3 ? leaf[2] : s > -0.3 ? leaf[1] : leaf[0];
          if (t === 4 && y < 2) c = y === 0 ? '#ffffff' : '#dfe8f2';
          p.set(x, top + y, c);
        }
      }
    }
  } else if (t === 6) {
    // 灰烬树：稀疏的灰色枝叶
    p.line(cx, h - 10, cx - 6, h - 18, bark[1]);
    p.line(cx, h - 12, cx + 6, h - 20, bark[1]);
    p.line(cx, h - 10, cx, h - 24, bark[1]);
    p.blob(cx - 5, h - 19, 3.5, 3, leaf, 61);
    p.blob(cx + 5, h - 21, 3.5, 3, leaf, 62);
    p.blob(cx, h - 24, 4, 3, leaf, 63);
    for (let i = 0; i < 6; i++) p.paint(cx - 6 + phash(i, 1, 6) * 12, h - 26 + phash(i, 2, 6) * 10, '#ff8a2a');
    for (let y = h - 9; y < h - 2; y += 2) p.paint(cx + (y % 3) - 1, y, '#ff6a20');
  } else {
    const big = w > 20;
    p.blob(cx - (big ? 5 : 3), h - 14, big ? 6.5 : 5, 4.5, leaf, 30 + t);
    p.blob(cx + (big ? 5 : 3), h - 14, big ? 6.5 : 5, 4.5, leaf, 31 + t);
    p.blob(cx, h - 19, big ? 8.5 : 6.5, 5.5, leaf, 32 + t);
    if (t === 7) for (let i = 0; i < 5; i++) p.paint(cx - 7 + phash(i, 3, 8) * 14, h - 24 + phash(i, 4, 8) * 12, '#fff6c0');
    if (t === 5) for (let i = 0; i < 4; i++) p.paint(cx - 6 + phash(i, 5, 8) * 12, h - 22 + phash(i, 6, 8) * 10, '#ff8a80');
  }
  return p.outline();
}

function cottonNode(t: number) {
  const p = new Pix(24, 16);
  cottonPlant(p, 5, 15, 9, t, 1);
  cottonPlant(p, 12, 15, 12, t, 2);
  cottonPlant(p, 19, 15, 8, t, 3);
  return p.outline();
}

function hideNode(t: number) {
  // 晒皮架：两根木桩、一根横梁，兽皮挂在中间
  const p = new Pix(24, 22);
  const wood = ['#4a2e1a', '#6a4426', '#8a5c34'];
  p.trunk(3, 3, 21, 2, wood);
  p.trunk(20, 3, 21, 2, wood);
  p.rect(2, 3, 20, 2, wood[1]);
  p.rect(2, 3, 20, 1, wood[2]);
  pelt(p, 11.5, 12, 14, 14, t);
  p.line(7, 5, 7, 6, '#c8b088');
  p.line(16, 5, 16, 6, '#c8b088');
  return p.outline();
}

/** 地图上资源物件的画布 */
export function paintResNode(kind: ResKind, tier: number): HTMLCanvasElement {
  const p = kind === 'ore' ? oreNode(tier) : kind === 'log' ? treeNode(tier) : kind === 'cotton' ? cottonNode(tier) : hideNode(tier);
  return p.canvas();
}

/** 会发光的资源：[颜色, 半径] */
export function resGlow(kind: ResKind, tier: number): [number, number] | null {
  if (kind === 'ore' && tier >= 4) return [parseInt(ORE[tier][1][1].slice(1), 16), 14];
  if (kind === 'log' && (tier === 6 || tier === 7)) return [tier === 6 ? 0xff7a2a : 0xfff0b0, 18];
  if (kind === 'cotton' && tier === 7) return [0xd8c8ff, 12];
  if (kind === 'hide' && tier === 7) return [0xa070ff, 12];
  return null;
}

/** 防止 TIERS 改了长度这里配色表没跟上 */
export const RES_TABLES_OK = [ORE, LOG, LEAF, COTTON, HIDE].every((t) => t.length === TIERS.length);
