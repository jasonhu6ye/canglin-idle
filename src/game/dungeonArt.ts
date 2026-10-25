import { mix, phash, Pix } from './pix';

/*
 * 副本更新（用户 10-25）的图标和场景美术，全部逐像素画：
 * 副本钥匙 T4-T8（绿洞镶绿宝石、蓝洞镶蓝宝石，每阶钥匙柄造型不同）、强化石和碎片 T1-T8、回城卷轴；
 * 地下场景里的洞口、楼梯、宝箱建筑（绿/蓝/紫/金）和洞穴地面墙壁。
 */

const cache = new Map<string, string>();
const done = (key: string, p: Pix) => {
  const url = p.outline().canvas().toDataURL();
  cache.set(key, url);
  return url;
};

/** 多边形填充，按位置给明暗（左上亮、右下暗） */
function poly(p: Pix, pts: [number, number][], pal: string[], seed = 0) {
  const xs = pts.map((q) => q[0]);
  const ys = pts.map((q) => q[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const inside = (x: number, y: number) => {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i];
      const [xj, yj] = pts[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  for (let y = Math.floor(y0); y <= y1; y++) {
    for (let x = Math.floor(x0); x <= x1; x++) {
      if (!inside(x + 0.5, y + 0.5)) continue;
      const s = -(x - cx) / Math.max(1, x1 - x0) - (y - cy) / Math.max(1, y1 - y0) + (phash(x, y, seed) - 0.5) * 0.3;
      p.set(x, y, s > 0.45 ? pal[3] : s > 0.05 ? pal[2] : s > -0.35 ? pal[1] : pal[0]);
    }
  }
}

function disc(p: Pix, cx: number, cy: number, r: number, col: string | ((x: number, y: number) => string), hole = 0) {
  for (let y = Math.floor(cy - r); y <= cy + r; y++) {
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d <= r && d >= hole) p.set(x, y, typeof col === 'string' ? col : col(x, y));
    }
  }
}

// ---- 副本钥匙 ----

/** 每阶钥匙的金属色（暗→亮）：铁、钛、符文、陨铁、精金 */
const KEY_METAL = [
  ['#3e444c', '#6a737e', '#9aa3ae', '#d4dae2'],
  ['#4a5a6a', '#7a92a8', '#b0c8dc', '#eaf6ff'],
  ['#1e4a4a', '#2e7a74', '#4ab0a4', '#9ae8d8'],
  ['#2a1e2a', '#4a3044', '#7a4a5e', '#c07a8a'],
  ['#8a5a10', '#c89020', '#f0c840', '#fff0a0'],
];
const GEM = { green: ['#0e5a2a', '#1e9a46', '#4ae07a', '#c8ffd8'], blue: ['#0e2e6a', '#1e5ab0', '#4a9aff', '#d0e8ff'] };

/** i：0-4 对应 T4-T8 */
function key(p: Pix, i: number, kind: 'green' | 'blue') {
  const M = KEY_METAL[i];
  const G = GEM[kind];
  // 钥匙杆：从右下往左上斜着，末端是齿
  for (let k = 0; k <= 9; k++) {
    const x = 8 + k;
    const y = 8 + k;
    p.set(x, y, M[2]);
    p.set(x + 1, y, M[1]);
    p.set(x, y + 1, M[0]);
  }
  // 钥匙齿：越高阶齿越多、越花
  const teeth = [2, 2, 3, 3, 4][i];
  for (let k = 0; k < teeth; k++) {
    const x = 16 - k * 2;
    const y = 18 - k * 2;
    p.set(x - 1, y + 1, M[1]);
    p.set(x - 2, y + 1, M[0]);
    if (i >= 2) p.set(x - 2, y + 2, M[0]);
  }
  p.set(17, 17, M[3]);
  // 护手：两道横杠
  p.line(6, 10, 10, 6, M[1]);
  if (i >= 1) p.line(7, 11, 11, 7, M[0]);
  // 钥匙柄：每阶不同造型
  const cx = 6;
  const cy = 6;
  if (i === 0) {
    // 铁：朴素的圆环
    disc(p, cx, cy, 5, (x, y) => (x + y < cx + cy - 1 ? M[2] : M[1]), 2.6);
  } else if (i === 1) {
    // 钛：菱形
    poly(p, [[cx, cy - 6], [cx + 6, cy], [cx, cy + 6], [cx - 6, cy]], M, 3);
    poly(p, [[cx, cy - 3], [cx + 3, cy], [cx, cy + 3], [cx - 3, cy]], ['#1a2028', '#1a2028', '#1a2028', '#1a2028']);
  } else if (i === 2) {
    // 符文：三叶草形，叶片上刻符文
    for (const [dx, dy] of [[0, -3], [3, 2], [-3, 2]]) disc(p, cx + dx, cy + dy, 3.2, (x, y) => (x + y < cx + cy ? M[2] : M[1]));
    for (const [dx, dy] of [[0, -3], [3, 2], [-3, 2]]) p.set(cx + dx, cy + dy, '#c8fff0');
  } else if (i === 3) {
    // 陨铁：八角星，尖上冒红光
    const pts: [number, number][] = [];
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const r = k % 2 ? 3.4 : 6.4;
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    poly(p, pts, M, 7);
    for (let k = 0; k < 8; k += 2) {
      const a = (k / 8) * Math.PI * 2;
      p.set(cx + Math.cos(a) * 6, cy + Math.sin(a) * 6, '#ff5a3a');
    }
  } else {
    // 精金：带翅膀的王冠柄
    disc(p, cx, cy + 1, 4.4, (x, y) => (x + y < cx + cy ? M[3] : M[2]));
    poly(p, [[cx - 4, cy - 2], [cx - 4, cy - 6], [cx - 2, cy - 3], [cx, cy - 7], [cx + 2, cy - 3], [cx + 4, cy - 6], [cx + 4, cy - 2]], M, 9);
    for (const sx of [-1, 1]) {
      for (let k = 0; k < 4; k++) p.line(cx + sx * 5, cy + k, cx + sx * (7 + (k < 2 ? 1 : 0)), cy - 2 + k * 1.5, k % 2 ? M[3] : M[2]);
    }
    p.set(cx, cy - 7, '#ffffff');
  }
  // 中间的宝石：绿洞绿、蓝洞蓝
  const gr = i >= 3 ? 2 : 1.6;
  disc(p, cx, cy + (i === 4 ? 1 : 0), gr, (x, y) => (x + y < cx + cy ? G[2] : G[1]));
  p.set(Math.round(cx - 0.6), Math.round(cy - 0.6 + (i === 4 ? 1 : 0)), G[3]);
}

export function keyIconUrl(kind: 'green' | 'blue', tier: number): string {
  const k = `key${kind}${tier}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const p = new Pix(20, 20);
  key(p, Math.max(0, Math.min(4, tier - 3)), kind);
  return done(k, p);
}

// ---- 强化石、碎片 ----

/** 每阶强化石的配色（暗→亮）和发光色 */
const STONE: { pal: string[]; glow: string }[] = [
  { pal: ['#3e3a36', '#625c54', '#8a8478', '#b8b0a2'], glow: '#d8e8ff' },
  { pal: ['#5a3412', '#8a5424', '#c07a3a', '#eab070'], glow: '#ffe0a0' },
  { pal: ['#3e4652', '#68727e', '#a0aab4', '#dce2e8'], glow: '#c8f0ff' },
  { pal: ['#2a2e34', '#4a525c', '#727c88', '#a8b2bc'], glow: '#ff6a4a' },
  { pal: ['#1e3a5a', '#2e5e8e', '#4a8ec8', '#a8dcff'], glow: '#e8f8ff' },
  { pal: ['#0e3a36', '#1a6058', '#2a9a88', '#7ae8d0'], glow: '#c8fff0' },
  { pal: ['#1e1030', '#3a1e58', '#5e3488', '#9a6ad0'], glow: '#ff9aff' },
  { pal: ['#8a5a10', '#c89020', '#f0c840', '#fff4b0'], glow: '#ffffff' },
];

function stone(p: Pix, t: number) {
  const { pal, glow } = STONE[t];
  const cx = 10;
  const cy = 11;
  if (t <= 1) {
    // 粗石、青铜：圆润的石块，表面一道发光的纹
    p.blob(cx, cy, 6.5, 5.5, pal, 11 + t);
    p.line(cx - 3, cy + 1, cx + 2, cy - 2, glow);
    p.set(cx + 3, cy - 2, glow);
  } else if (t <= 3) {
    // 锡纹、铁心：六角形的打磨石，带金属箍
    poly(p, [[cx - 6, cy - 2], [cx - 3, cy - 6], [cx + 3, cy - 6], [cx + 6, cy - 2], [cx + 5, cy + 5], [cx - 5, cy + 5]], pal, t);
    p.line(cx - 6, cy, cx + 6, cy, pal[0]);
    p.line(cx - 6, cy + 1, cx + 6, cy + 1, pal[3]);
    if (t === 3) disc(p, cx, cy - 2, 1.6, glow);
    else for (let k = -4; k <= 4; k += 2) p.set(cx + k, cy - 3, glow);
  } else if (t <= 5) {
    // 钛晶、秘纹：竖着的水晶，两侧小晶簇
    poly(p, [[cx, cy - 9], [cx + 4, cy - 4], [cx + 3, cy + 6], [cx - 3, cy + 6], [cx - 4, cy - 4]], pal, t);
    poly(p, [[cx - 6, cy - 1], [cx - 3, cy + 2], [cx - 4, cy + 6], [cx - 7, cy + 6]], pal, t + 5);
    poly(p, [[cx + 6, cy], [cx + 7, cy + 6], [cx + 4, cy + 6], [cx + 3, cy + 3]], pal, t + 9);
    p.line(cx, cy - 7, cx, cy + 4, pal[3]);
    if (t === 5) { p.set(cx - 1, cy - 2, glow); p.set(cx + 1, cy - 1, glow); p.set(cx, cy + 1, glow); }
  } else {
    // 陨星、精金：多面切割的宝石，四周有光点
    poly(p, [[cx - 7, cy - 2], [cx - 4, cy - 7], [cx + 4, cy - 7], [cx + 7, cy - 2], [cx, cy + 8]], pal, t);
    p.line(cx - 7, cy - 2, cx + 7, cy - 2, pal[3]);
    p.line(cx - 4, cy - 7, cx - 2, cy - 2, pal[3]);
    p.line(cx + 4, cy - 7, cx + 2, cy - 2, pal[1]);
    p.line(cx - 2, cy - 2, cx, cy + 7, pal[2]);
    for (const [x, y] of [[2, 3], [17, 4], [3, 17], [17, 16]]) {
      p.set(x, y, glow);
      if (t === 7) { p.set(x - 1, y, mix(glow, pal[2], 0.5)); p.set(x + 1, y, mix(glow, pal[2], 0.5)); }
    }
  }
}

function shard(p: Pix, t: number) {
  const { pal, glow } = STONE[t];
  // 三块大小不一的碎片
  poly(p, [[4, 9], [9, 4], [11, 9], [7, 14]], pal, t);
  poly(p, [[11, 11], [16, 8], [17, 14], [12, 16]], pal, t + 3);
  poly(p, [[5, 15], [8, 15], [7, 18]], pal, t + 6);
  p.set(8, 7, glow);
  p.set(15, 11, glow);
}

export function enhStoneIconUrl(tier: number, isShard: boolean): string {
  const k = `${isShard ? 'shard' : 'stone'}${tier}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const p = new Pix(20, 20);
  (isShard ? shard : stone)(p, tier);
  return done(k, p);
}

// ---- 回城卷轴 ----

export function scrollIconUrl(): string {
  const hit = cache.get('scroll');
  if (hit) return hit;
  const p = new Pix(20, 20);
  const PAPER = ['#a88a5a', '#d4b884', '#ecd8a8', '#fff4d4'];
  // 展开的纸，两头卷轴
  poly(p, [[4, 4], [16, 4], [16, 16], [4, 16]], PAPER, 2);
  for (const y of [3, 16]) {
    for (let x = 3; x <= 17; x++) p.set(x, y, x < 6 ? '#8a5a2a' : x > 14 ? '#5a3a1a' : '#b07a3a');
    for (let x = 3; x <= 17; x++) p.set(x, y + 1, '#6a4420');
    p.set(2, y, '#c8902a');
    p.set(18, y, '#c8902a');
  }
  // 纸上画一座小城门和传送光圈
  p.line(7, 13, 13, 13, '#6a4a2a');
  p.rect(8, 9, 1, 4, '#6a4a2a');
  p.rect(12, 9, 1, 4, '#6a4a2a');
  p.line(8, 8, 12, 8, '#6a4a2a');
  p.set(10, 7, '#6a4a2a');
  disc(p, 10, 10.5, 1.6, '#4a9aff');
  p.set(10, 10, '#d0f0ff');
  // 蓝色绑带
  p.rect(15, 8, 3, 2, '#2e6ad0');
  p.set(18, 10, '#2e6ad0');
  return done('scroll', p);
}

/** 副本相关物品的图标（不是这几种返回 null） */
export function dungeonIconUrl(id: string, tier?: number): string | null {
  if (id === 'scroll_town') return scrollIconUrl();
  const m = /^dkey_([gb])(\d)$/.exec(id);
  if (m) return keyIconUrl(m[1] === 'g' ? 'green' : 'blue', Number(m[2]) - 1);
  if (tier === undefined) return null;
  if (id.startsWith('enhstone_')) return enhStoneIconUrl(tier, false);
  if (id.startsWith('enhshard_')) return enhStoneIconUrl(tier, true);
  return null;
}

// ---- 地下场景 ----

export type DgThemeId = 'earth' | 'ice' | 'lava' | 'crystal' | 'fungus' | 'crypt';
/** 每种主题：地面三阶、岩壁四阶（暗→亮）、点缀色 */
const THEME: Record<DgThemeId, { floor: string[]; wall: string[]; accent: string; fog: number }> = {
  earth: { floor: ['#2e241c', '#3c3024', '#4a3c2c'], wall: ['#140f0b', '#2a2018', '#43352a', '#5e4c3c'], accent: '#c8a060', fog: 0x0a0806 },
  ice: { floor: ['#2a3a4a', '#344a5c', '#40586c'], wall: ['#0c1620', '#1c2e40', '#3a5672', '#8ab4d8'], accent: '#c8f0ff', fog: 0x060c14 },
  lava: { floor: ['#2a1a16', '#3a221c', '#482a20'], wall: ['#120a08', '#2a1410', '#46201a', '#6a3020'], accent: '#ff7a2a', fog: 0x140604 },
  crystal: { floor: ['#2a2238', '#342a46', '#403454'], wall: ['#100c1a', '#241c38', '#3e3060', '#7a5ab0'], accent: '#c88aff', fog: 0x0a0612 },
  fungus: { floor: ['#1e2a22', '#26362a', '#304232'], wall: ['#0a120c', '#18261c', '#2a3e2e', '#4a6a4a'], accent: '#6ae0c0', fog: 0x040a06 },
  crypt: { floor: ['#2e2e34', '#3a3a42', '#46464e'], wall: ['#101014', '#22222a', '#3a3a44', '#5c5c68'], accent: '#e8d8a0', fog: 0x08080c },
};
export const themeFog = (t: DgThemeId) => THEME[t].fog;
export const themeAccent = (t: DgThemeId) => THEME[t].accent;

/** 16×16 地面：底色加碎石和裂纹；v 是变体 */
export function paintDgFloor(t: DgThemeId, v: number): HTMLCanvasElement {
  const { floor: F, accent } = THEME[t];
  const p = new Pix(16, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const n = phash(x, y, 31 + v * 7);
    p.set(x, y, n < 0.12 ? F[0] : n > 0.9 ? F[2] : F[1]);
  }
  if (t === 'crypt') {
    // 古墓：石板缝
    p.line(0, 7, 15, 7, F[0]);
    p.line(v % 2 ? 5 : 10, 0, v % 2 ? 5 : 10, 7, F[0]);
    p.line(v % 2 ? 11 : 3, 8, v % 2 ? 11 : 3, 15, F[0]);
  } else if (v === 1) {
    p.line(3, 10, 7, 12, F[0]);
    p.line(7, 12, 9, 11, F[0]);
  } else if (v === 2) {
    p.set(11, 4, F[2]); p.set(12, 4, F[2]); p.set(11, 5, F[0]);
  }
  if (t === 'lava' && v === 3) { p.line(2, 4, 6, 6, '#c84a1a'); p.set(4, 5, '#ff9a3a'); }
  if (t === 'crystal' && v === 3) { p.set(9, 9, accent); p.set(10, 8, accent); }
  if (t === 'fungus' && v === 3) { p.set(5, 5, accent); p.set(12, 11, '#3a8a6a'); }
  if (t === 'ice' && v === 3) p.line(2, 13, 8, 13, '#6a90b0');
  return p.canvas();
}

/** 岩壁：top 是看下去的岩顶，face 是朝向镜头的那一面（下面是地面时） */
export function paintDgWall(t: DgThemeId, face: boolean, v: number): HTMLCanvasElement {
  const { wall: Wl, accent } = THEME[t];
  const p = new Pix(16, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const n = phash(x, y, 77 + v * 13);
    if (!face) { p.set(x, y, n < 0.15 ? Wl[0] : n > 0.92 ? Wl[2] : Wl[1]); continue; }
    // 正面：上沿亮一道，往下变暗，有横向的岩层
    const band = Math.floor((y + (n > 0.7 ? 1 : 0)) / 4);
    const c = y < 2 ? Wl[3] : band % 2 ? Wl[2] : Wl[1];
    p.set(x, y, y > 13 ? Wl[0] : n < 0.08 ? Wl[0] : c);
  }
  if (face && t === 'crystal' && v % 2) { p.line(6, 5, 8, 11, accent); p.set(7, 7, '#ffffff'); }
  if (face && t === 'lava' && v % 3 === 0) { p.line(4, 6, 9, 9, '#c84a1a'); p.set(7, 8, '#ffb040'); }
  if (face && t === 'ice' && v % 2) for (let k = 0; k < 4; k++) p.set(3 + k * 3, 14 - (k % 2), '#c8f0ff');
  if (face && t === 'fungus' && v % 3 === 1) { p.set(10, 10, accent); p.set(11, 9, accent); }
  return p.canvas();
}

/** 靠墙的小装饰（每种主题 4 种）：石头、晶簇、蘑菇、骨头、冰锥、岩浆口、烛台… 16×16 */
export function paintDgDecor(t: DgThemeId, k: number): HTMLCanvasElement {
  const p = new Pix(16, 16);
  const { wall: Wl, accent } = THEME[t];
  const rock = () => p.blob(8, 12, 4, 2.6, [Wl[1], Wl[2], Wl[3], mix(Wl[3], '#ffffff', 0.3)], 5 + k);
  const crystal = (c: string) => {
    const pal = [mix(c, '#000000', 0.5), mix(c, '#000000', 0.25), c, mix(c, '#ffffff', 0.5)];
    poly(p, [[7, 4], [9, 6], [9, 14], [6, 14], [6, 6]], pal, 3);
    poly(p, [[3, 9], [5, 10], [5, 14], [2, 14]], pal, 4);
    poly(p, [[11, 8], [13, 10], [13, 14], [10, 14]], pal, 5);
  };
  const shroom = (c: string) => {
    p.rect(7, 10, 2, 4, '#d8d0c0');
    p.blob(8, 9, 4, 2.2, [mix(c, '#000000', 0.5), mix(c, '#000000', 0.2), c, mix(c, '#ffffff', 0.4)], 3);
    p.set(6, 8, '#ffffff');
    p.rect(3, 12, 1, 2, '#d8d0c0');
    p.blob(3.5, 11.5, 1.8, 1, [mix(c, '#000000', 0.4), c, c, mix(c, '#ffffff', 0.4)], 4);
  };
  const bones = () => {
    p.line(3, 13, 12, 11, '#e8e0cc');
    p.line(5, 11, 9, 14, '#d8d0bc');
    disc(p, 12, 10, 1.8, '#f0e8d4');
    p.set(11, 10, '#2a2420');
  };
  const torch = () => {
    p.rect(7, 8, 2, 6, '#5a3a1a');
    p.rect(6, 13, 4, 1, '#3a2a1a');
    disc(p, 8, 6, 2, '#ff9a2a');
    p.set(8, 5, '#fff0a0');
    p.set(8, 3, '#ffd060');
  };
  const variants: Record<DgThemeId, (() => void)[]> = {
    earth: [rock, bones, () => shroom('#c8a060'), rock],
    ice: [() => crystal('#a8e0ff'), rock, () => crystal('#e8f8ff'), bones],
    lava: [rock, () => { rock(); p.set(8, 10, '#ff7a2a'); p.set(9, 11, '#ffc040'); }, bones, () => crystal('#ff6a2a')],
    crystal: [() => crystal(accent), () => crystal('#7ad8ff'), rock, () => crystal('#ff8ad8')],
    fungus: [() => shroom('#3ac0a0'), () => shroom('#c05ae0'), rock, () => shroom('#e0c040')],
    crypt: [torch, bones, rock, () => { p.rect(5, 6, 6, 8, Wl[2]); p.rect(6, 5, 4, 1, Wl[3]); p.line(8, 7, 8, 11, Wl[0]); p.line(6, 8, 10, 8, Wl[0]); }],
  };
  variants[t][k % 4]();
  return p.outline().canvas();
}

/** 下楼的楼梯：地上一个方洞，台阶往下渐暗，四周石框 */
export function paintStairs(): HTMLCanvasElement {
  const p = new Pix(24, 24);
  p.rect(2, 3, 20, 18, '#4a4a52');
  p.rect(3, 4, 18, 16, '#6a6a74');
  for (let i = 0; i < 6; i++) {
    const c = mix('#8a8278', '#06060a', i / 6);
    p.rect(5, 6 + i * 2, 14, 2, c);
    p.line(5, 6 + i * 2, 18, 6 + i * 2, mix(c, '#ffffff', 0.15));
  }
  p.rect(5, 18, 14, 1, '#04040a');
  return p.outline().canvas();
}

/**
 * 宝箱建筑（用户 10-25：宝箱不是物品，是建筑，点了打开）：石台上的大宝箱，按品质染色发光。
 * q：0 绿 1 蓝 2 紫 3 金；open 打开后箱盖掀起、里面冒光
 */
export function paintDgChest(q: number, open: boolean): HTMLCanvasElement {
  const C = [
    ['#0e3a1a', '#1e6a32', '#3aa050', '#8ae09a'],
    ['#0e2448', '#1e4a8a', '#3a7ad0', '#9ac8ff'],
    ['#2a0e48', '#4e1e8a', '#7e3ad0', '#c89aff'],
    ['#5a3a08', '#a06a10', '#e0a820', '#fff0a0'],
  ][q];
  const M = q === 3 ? ['#6a4a1a', '#a87a2a', '#e8c060', '#ffffff'] : ['#4a4a52', '#7a7a84', '#b0b0bc', '#f0f0f8'];
  const p = new Pix(40, 36);
  // 石台
  p.rect(3, 28, 34, 6, '#3a3a42');
  p.rect(4, 28, 32, 2, '#5a5a66');
  p.rect(1, 33, 38, 2, '#2a2a30');
  // 箱体
  poly(p, [[6, 16], [34, 16], [34, 29], [6, 29]], C, 2);
  for (const x of [6, 13, 26, 33]) p.rect(x, 16, 2, 13, M[1]);
  p.line(6, 16, 34, 16, M[2]);
  p.line(6, 28, 34, 28, M[0]);
  // 锁
  p.rect(18, 19, 5, 6, M[2]);
  p.rect(19, 21, 3, 2, C[0]);
  if (!open) {
    // 拱形箱盖
    for (let y = 6; y < 16; y++) {
      const w = Math.round(Math.sqrt(Math.max(0, 1 - ((16 - y) / 10) ** 2)) * 14);
      for (let x = 20 - w; x <= 20 + w; x++) p.set(x, y, y < 9 ? C[3] : y < 12 ? C[2] : C[1]);
    }
    p.line(6, 15, 34, 15, M[2]);
    for (const x of [13, 26]) for (let y = 7; y < 16; y++) if (p.get(x, y)) p.set(x, y, M[1]);
    p.set(20, 6, M[3]);
  } else {
    // 箱盖掀到后面，箱口冒光
    for (let y = 2; y < 10; y++) for (let x = 8; x <= 32; x++) if (Math.abs(x - 20) < 12 - (10 - y) * 0.2) p.set(x, y, y < 4 ? C[1] : C[2]);
    p.rect(7, 13, 26, 3, '#fff8d0');
    for (let k = 0; k < 6; k++) p.set(10 + k * 4, 11 - (k % 2), '#fff0a0');
  }
  return p.outline().canvas();
}

/**
 * 地表的副本洞口：地上裂开一道发光的口子，绿洞绿光、蓝洞青光，四周碎石。32×24
 */
export function paintGatePortal(kind: 'green' | 'blue'): HTMLCanvasElement {
  const G = kind === 'green' ? ['#0a3a14', '#1e8a3a', '#4ae07a', '#d8ffe0'] : ['#0a2a4a', '#1e6ab0', '#4ac8ff', '#e0f8ff'];
  const p = new Pix(32, 24);
  // 外圈碎石
  for (let a = 0; a < 14; a++) {
    const t = (a / 14) * Math.PI * 2;
    p.blob(16 + Math.cos(t) * 13, 14 + Math.sin(t) * 7, 2.2, 1.6, ['#2a2620', '#4a443a', '#6a6254', '#8a8270'], a);
  }
  // 洞口：椭圆，中心最亮
  for (let y = 0; y < 24; y++) for (let x = 0; x < 32; x++) {
    const d = Math.hypot((x - 16) / 11, (y - 14) / 6);
    if (d > 1) continue;
    p.set(x, y, d < 0.35 ? G[3] : d < 0.6 ? G[2] : d < 0.85 ? G[1] : G[0]);
  }
  return p.outline().canvas();
}
