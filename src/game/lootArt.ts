import { mix, Pix } from './pix';

/*
 * 精英和首领的战利品图标（用户 10-23）：福袋、宝箱、首领宝藏每阶一个造型，
 * 首领战旗和首领战利品按首领的配色和种族画。全部 20×20，逐像素画出来。
 */

const GOLD = ['#8a5a10', '#c89020', '#f0c840', '#fff0a0'];

// ---- 宝箱 ----

type ChestStyle = {
  body: string[]; // 箱体 暗→亮
  metal: string[]; // 包边 暗→亮
  lid: 'flat' | 'arch' | 'peak';
  bands: number;
  studs?: boolean;
  corners?: boolean;
  lock: 'plain' | 'gem' | 'skull' | 'star';
  gem?: string;
  extra?: 'stars' | 'runes' | 'horns' | 'moss';
};

const CHESTS: ChestStyle[] = [
  { body: ['#4a2e16', '#6a4422', '#8a5c32', '#a87444'], metal: ['#3a3a3a', '#5a5a5a', '#7a7a7a', '#9a9a9a'], lid: 'flat', bands: 0, lock: 'plain', extra: 'moss' },
  { body: ['#4e3018', '#704826', '#906036', '#ac7a48'], metal: ['#3a4048', '#5e6670', '#88909a', '#b8c0c8'], lid: 'flat', bands: 2, studs: true, lock: 'plain' },
  { body: ['#3e2414', '#5a3820', '#784e2e', '#94643c'], metal: ['#6a3412', '#a85a24', '#d8843c', '#f0b070'], lid: 'arch', bands: 2, corners: true, lock: 'plain' },
  { body: ['#1e2a40', '#2c3c5a', '#3e5278', '#566c96'], metal: ['#6a7480', '#a0aab4', '#d0d8e0', '#ffffff'], lid: 'arch', bands: 3, studs: true, lock: 'gem', gem: '#5ab0ff' },
  { body: ['#4a1010', '#701a1a', '#962828', '#b83a3a'], metal: GOLD, lid: 'arch', bands: 2, corners: true, lock: 'gem', gem: '#40e070' },
  { body: ['#103a40', '#1a5a62', '#2a7e86', '#46a4aa'], metal: ['#4a8a9a', '#7ac0d0', '#b0f0ff', '#ffffff'], lid: 'peak', bands: 2, corners: true, lock: 'gem', gem: '#c060ff', extra: 'runes' },
  { body: ['#8a7e66', '#b0a486', '#d4caa8', '#f0e8cc'], metal: ['#4a0e0e', '#7a1a14', '#a82a1e', '#d84a30'], lid: 'arch', bands: 2, lock: 'skull', extra: 'horns' },
  { body: ['#14103a', '#221a5a', '#342a80', '#4a3eaa'], metal: ['#a08a40', '#e0c060', '#fff0a0', '#ffffff'], lid: 'arch', bands: 2, corners: true, lock: 'star', gem: '#ffffff', extra: 'stars' },
];

function chest(p: Pix, t: number, boss: boolean) {
  const st = CHESTS[t];
  const x0 = boss ? 1 : 2;
  const x1 = boss ? 18 : 17;
  const top = boss ? 9 : 10;
  const bottom = 18;
  // 箱体：竖木板，左亮右暗
  for (let y = top; y <= bottom; y++) {
    for (let x = x0; x <= x1; x++) {
      const plank = (x - x0) % 4 === 3;
      const shade = x < x0 + 3 ? 3 : x > x1 - 3 ? 0 : 1 + ((x - x0) >> 2) % 2;
      p.set(x, y, plank ? st.body[0] : st.body[Math.min(3, shade)]);
    }
  }
  // 箱盖
  const lidTop = boss ? 3 : 4;
  for (let x = x0; x <= x1; x++) {
    const u = (x - x0) / (x1 - x0) - 0.5;
    const rise = st.lid === 'flat' ? 2 : st.lid === 'arch' ? Math.round(Math.sqrt(Math.max(0, 0.25 - u * u)) * 6) : Math.round((0.5 - Math.abs(u)) * 7);
    const yTop = top - 2 - rise + (st.lid === 'flat' ? 0 : 1);
    for (let y = Math.max(lidTop, yTop); y < top; y++) {
      const hi = y - yTop < 1;
      p.set(x, y, hi ? st.body[3] : x > x1 - 2 ? st.body[0] : st.body[2]);
    }
  }
  // 盖子和箱体之间的接缝 + 包边
  for (let x = x0; x <= x1; x++) p.set(x, top, st.metal[1]);
  for (let y = lidTop; y <= bottom; y++) {
    for (const x of [x0, x1]) if (p.get(x, y)) p.set(x, y, x === x0 ? st.metal[2] : st.metal[0]);
  }
  for (let x = x0; x <= x1; x++) p.set(x, bottom, st.metal[0]);
  // 竖包带
  const bandXs = st.bands === 3 ? [x0 + 3, (x0 + x1) >> 1, x1 - 3] : st.bands === 2 ? [x0 + 3, x1 - 3] : [];
  for (const bx of bandXs) {
    for (let y = lidTop; y <= bottom; y++) if (p.get(bx, y)) p.set(bx, y, y < top ? st.metal[2] : st.metal[1]);
    if (st.studs) for (let y = top + 2; y < bottom; y += 3) p.set(bx, y, st.metal[3]);
  }
  if (st.corners) {
    for (const [cx, cy] of [[x0, top + 1], [x1, top + 1], [x0, bottom - 1], [x1, bottom - 1]]) {
      p.rect(cx === x0 ? cx : cx - 1, cy === bottom - 1 ? cy - 1 : cy, 2, 2, st.metal[2]);
      p.set(cx, cy, st.metal[3]);
    }
  }
  // 锁扣
  const lx = (x0 + x1) >> 1;
  const ly = top + 1;
  p.rect(lx - 1, ly - 1, 3, 4, st.metal[1]);
  p.set(lx - 1, ly - 1, st.metal[3]);
  if (st.lock === 'plain') p.set(lx, ly + 1, '#1a120e');
  if (st.lock === 'gem') { p.set(lx, ly, st.gem!); p.set(lx, ly + 1, mix(st.gem!, '#000000', 0.4)); }
  if (st.lock === 'skull') {
    p.rect(lx - 1, ly - 1, 3, 3, '#f0ead8');
    p.set(lx - 1, ly, '#1a120e');
    p.set(lx + 1, ly, '#1a120e');
    p.rect(lx - 1, ly + 2, 3, 1, '#c8c0a8');
  }
  if (st.lock === 'star') {
    for (const [dx, dy] of [[0, -1], [-1, 0], [0, 0], [1, 0], [0, 1]]) p.set(lx + dx, ly + dy, '#fff8c0');
  }
  // 各阶的特征
  if (st.extra === 'moss') { p.paint(x0 + 1, bottom - 1, '#4a7a2a'); p.paint(x0 + 2, bottom - 1, '#5a9a3a'); p.paint(x1 - 1, top + 3, '#4a7a2a'); }
  if (st.extra === 'runes') for (let x = x0 + 2; x < x1 - 1; x += 3) p.paint(x, bottom - 3, '#b0f0ff');
  if (st.extra === 'stars') for (const [sx, sy] of [[x0 + 2, top + 4], [x1 - 2, top + 3], [x0 + 5, bottom - 2], [x1 - 5, bottom - 3]]) p.paint(sx, sy, '#fff8c0');
  if (st.extra === 'horns') {
    p.line(x0, lidTop + 3, x0 - 1, lidTop, '#f0ead8');
    p.line(x1, lidTop + 3, x1 + 1, lidTop, '#f0ead8');
  }
  if (boss) {
    // 首领宝藏：盖子上一顶金冠，箱身一条红绸
    for (let y = top + 3; y <= top + 4; y++) for (let x = x0 + 1; x < x1; x++) p.set(x, y, y === top + 3 ? '#e03a3a' : '#a01818');
    const cx = lx;
    const cy = lidTop - 1;
    p.rect(cx - 3, cy + 1, 7, 2, GOLD[2]);
    for (const dx of [-3, 0, 3]) { p.set(cx + dx, cy, GOLD[2]); p.set(cx + dx, cy - 1, GOLD[3]); }
    p.set(cx, cy + 1, '#e03a3a');
    p.rect(cx - 3, cy + 2, 7, 1, GOLD[1]);
  }
}

// ---- 福袋 ----

type BagStyle = { cloth: string[]; cord: string; pattern: 'none' | 'stripe' | 'dots' | 'coin' | 'cloud' | 'rim' | 'scale' | 'stars'; tassel?: string };

const BAGS: BagStyle[] = [
  { cloth: ['#6a5a40', '#8a7654', '#a8946c', '#c4b088'], cord: '#4a3a24', pattern: 'none' },
  { cloth: ['#5a6a3a', '#76884c', '#94a862', '#b0c47c'], cord: '#c8a060', pattern: 'stripe' },
  { cloth: ['#7a1a1a', '#a02424', '#c83a30', '#e05a48'], cord: '#f0c840', pattern: 'coin' },
  { cloth: ['#7a1a4a', '#a02a66', '#c84a88', '#e070a8'], cord: '#f0c840', pattern: 'dots', tassel: '#f0c840' },
  { cloth: ['#1a3a7a', '#24509e', '#3a6ac8', '#5a8ae0'], cord: '#f0f0ff', pattern: 'cloud', tassel: '#f0c840' },
  { cloth: ['#4a1a6a', '#6a2a8e', '#8a40b0', '#a860d0'], cord: '#f0c840', pattern: 'rim', tassel: '#e03a3a' },
  { cloth: ['#0e4a2e', '#16683e', '#22884e', '#3aa866'], cord: '#f0c840', pattern: 'scale', tassel: '#f0c840' },
  { cloth: ['#a07010', '#c89020', '#f0c840', '#fff0a0'], cord: '#e03a3a', pattern: 'stars', tassel: '#e03a3a' },
];

function luckyBag(p: Pix, t: number) {
  const st = BAGS[t];
  const pal = st.cloth;
  // 袋身
  p.blob(10, 12.5, 7, 6, pal, 31 + t);
  // 袋口褶边
  for (let x = 6; x <= 14; x++) {
    const h = (x % 2) + 1;
    for (let y = 4 - h; y <= 6; y++) p.set(x, y, x < 9 ? pal[3] : x > 12 ? pal[1] : pal[2]);
  }
  for (let x = 7; x <= 13; x++) p.set(x, 7, pal[1]);
  // 扎口的绳子
  for (let x = 6; x <= 14; x++) p.set(x, 7, st.cord);
  p.set(14, 8, st.cord);
  p.set(15, 9, st.cord);
  if (st.tassel) { p.set(15, 10, st.tassel); p.set(15, 11, st.tassel); p.set(16, 11, st.tassel); p.set(14, 11, st.tassel); }
  // 花纹
  const cx = 10;
  const cy = 13;
  if (st.pattern === 'stripe') for (let x = 4; x <= 16; x++) { p.paint(x, 11, pal[0]); p.paint(x, 15, pal[0]); }
  if (st.pattern === 'coin' || st.pattern === 'dots' || st.pattern === 'rim') {
    // 正中一枚铜钱
    p.blob(cx, cy, 2.6, 2.6, GOLD, 4);
    p.set(cx, cy, pal[1]);
  }
  if (st.pattern === 'dots') for (const [x, y] of [[5, 11], [15, 12], [6, 16], [14, 16], [10, 9]]) p.paint(x, y, '#f0c840');
  if (st.pattern === 'cloud') {
    for (const [x, y] of [[6, 11], [7, 10], [8, 11], [12, 15], [13, 14], [14, 15]]) p.paint(x, y, '#e0ecff');
    p.blob(cx, cy, 2, 2, GOLD, 4);
  }
  if (st.pattern === 'rim') for (let x = 4; x <= 16; x++) p.paint(x, 17, GOLD[2]);
  if (st.pattern === 'scale') {
    for (let y = 10; y <= 17; y += 2) for (let x = 4 + (y % 4 === 0 ? 1 : 0); x <= 16; x += 2) p.paint(x, y, pal[3]);
    p.blob(cx, cy, 2.4, 2.4, GOLD, 4);
    p.set(cx, cy, '#e03a3a');
  }
  if (st.pattern === 'stars') {
    for (const [x, y] of [[6, 11], [14, 11], [8, 16], [13, 16]]) p.paint(x, y, '#ffffff');
    p.blob(cx, cy, 2.6, 2.6, ['#a01818', '#c82a2a', '#e04a4a', '#ff8a7a'], 4);
    p.set(cx, cy, '#fff0a0');
  }
}

// ---- 首领战旗与战利品 ----

/** 种族图案 5×5 */
const EMBLEM: Record<string, string[]> = {
  beast: ['.#.#.', '#...#', '.###.', '#####', '.###.'],
  small: ['#...#', '##.##', '.###.', '.#.#.', '..#..'],
  bird: ['#...#', '##.##', '#####', '..#..', '.#.#.'],
  bat: ['#...#', '##.##', '#####', '#.#.#', '.....'],
  slime: ['..#..', '.###.', '##.##', '#####', '.###.'],
  insect: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  crab: ['#...#', '#.#.#', '.###.', '#####', '.#.#.'],
  serpent: ['.###.', '#....', '.###.', '....#', '.###.'],
  reptile: ['.###.', '#.#.#', '#####', '#.#.#', '.###.'],
  dragon: ['#...#', '##.##', '.###.', '#####', '..#..'],
  humanoid: ['#.#.#', '#####', '#####', '.....', '#####'],
  undead: ['.###.', '#.#.#', '#####', '.#.#.', '.....'],
  golem: ['#####', '#...#', '#.#.#', '#...#', '#####'],
  spirit: ['..#..', '.#.#.', '#...#', '.#.#.', '..#..'],
  plant: ['..#..', '.###.', '#####', '..#..', '..#..'],
  eye: ['.....', '.###.', '##.##', '.###.', '.....'],
};

function banner(p: Pix, col: string, acc: string, family: string) {
  // 旗杆和金色杆头
  for (let y = 2; y <= 19; y++) { p.set(3, y, '#6a4422'); p.set(4, y, '#8a5c32'); }
  p.set(3, 1, GOLD[2]); p.set(4, 1, GOLD[3]); p.set(3, 0, GOLD[2]); p.set(4, 0, GOLD[2]);
  p.rect(2, 2, 4, 1, GOLD[1]);
  // 旗面：燕尾，随风有一点起伏
  const dark = mix(col, '#000000', 0.35);
  const light = mix(col, '#ffffff', 0.25);
  for (let x = 5; x <= 17; x++) {
    const wave = Math.round(Math.sin((x - 5) * 0.55) * 0.8);
    const bottom = 15 - (x > 13 ? Math.abs(x - 15.5) < 1 ? 3 : 0 : 0) + wave;
    for (let y = 3 + wave; y <= bottom; y++) {
      const edge = y === 3 + wave || y === bottom || x === 17 || (x > 13 && Math.abs(x - 15.5) < 1.5 && y === bottom);
      p.set(x, y, edge ? acc : x === 5 ? light : (x + wave) % 5 === 0 ? dark : col);
    }
  }
  // 燕尾缺口
  for (let y = 12; y <= 16; y++) { p.set(15, y + (y > 13 ? 0 : 1), null); p.set(16, y + 1, null); }
  // 横杆
  p.rect(4, 3, 14, 1, GOLD[2]);
  // 种族图案
  const em = EMBLEM[family] ?? EMBLEM.beast;
  em.forEach((row, j) => [...row].forEach((c, i) => c === '#' && p.set(9 + i, 6 + j, acc)));
  // 金穗
  for (let x = 6; x <= 13; x += 2) p.set(x, 16 + Math.round(Math.sin((x - 5) * 0.55) * 0.8), GOLD[2]);
}

function trophy(p: Pix, col: string, acc: string, family: string) {
  const pal = [mix(col, '#000000', 0.45), mix(col, '#000000', 0.15), col, mix(col, '#ffffff', 0.4)];
  const apal = [mix(acc, '#000000', 0.45), mix(acc, '#000000', 0.15), acc, mix(acc, '#ffffff', 0.45)];
  if (family === 'beast') {
    // 一绺鬃毛 / 兽毛：一束弯弯的毛，根部用金环扎住
    for (let k = 0; k < 7; k++) {
      const x0 = 5 + k;
      for (let i = 0; i <= 12; i++) {
        const x = x0 + Math.round(Math.sin(i * 0.25 + k * 0.3) * 2 + i * 0.25);
        p.set(x, 5 + i, k < 2 ? pal[3] : k > 4 ? pal[1] : pal[2]);
      }
    }
    p.rect(5, 3, 8, 3, GOLD[2]);
    p.rect(5, 3, 8, 1, GOLD[3]);
    p.set(9, 4, apal[2]);
  } else if (['serpent', 'reptile', 'small', 'bat'].includes(family)) {
    // 一颗弯弯的大獠牙，根部是首领的皮色，缠着皮绳；鼠王的是金牙
    const tooth = family === 'small' ? GOLD : ['#c8bea0', '#f0e8d0', '#fffaf0', '#ffffff'];
    for (let i = 0; i <= 13; i++) {
      const y = 3 + i;
      const x = 6 + Math.round(Math.sin(i * 0.22) * 6);
      const w = Math.max(0, Math.round(3 - i * 0.2));
      for (let k = -w; k <= w; k++) p.set(x + k, y, i < 3 ? (k < 0 ? pal[3] : pal[1]) : k < 0 ? tooth[2] : k > 0 ? tooth[0] : tooth[1]);
    }
    p.rect(3, 3, 7, 2, apal[1]);
    p.rect(3, 3, 7, 1, apal[2]);
    p.set(6, 1, apal[2]); p.set(6, 2, apal[2]);
  } else if (family === 'crab' || family === 'insect') {
    // 一只张开的巨钳 / 一根毒针
    if (family === 'crab') {
      p.blob(7, 13, 5, 4.5, pal, 3);
      for (let i = 0; i <= 9; i++) {
        const a = (i / 9) * 1.4;
        p.set(9 + Math.round(Math.sin(a) * 7), 11 - Math.round(Math.cos(a) * 8) + 1, pal[3]);
        p.set(10 + Math.round(Math.sin(a) * 6), 11 - Math.round(Math.cos(a) * 7) + 1, pal[2]);
        p.set(11 + Math.round(Math.sin(a) * 6), 15 - Math.round(Math.cos(a) * 3), pal[1]);
      }
      p.set(5, 11, apal[3]);
    } else {
      for (let i = 0; i <= 14; i++) {
        const w = Math.max(0, Math.round(3 - i * 0.22));
        for (let k = -w; k <= w; k++) p.set(4 + i + k * 0.5, 16 - i + k * 0.5, k < 0 ? pal[3] : k > 0 ? pal[1] : pal[2]);
      }
      p.set(18, 2, apal[3]);
      p.set(17, 3, apal[2]);
      p.blob(4, 16, 2.5, 2.5, pal, 5);
    }
  } else if (family === 'humanoid' || family === 'undead') {
    // 一顶王冠
    p.rect(3, 10, 14, 6, GOLD[2]);
    p.rect(3, 15, 14, 1, GOLD[0]);
    p.rect(3, 10, 14, 1, GOLD[3]);
    for (const x of [3, 6, 9, 10, 13, 16]) for (let y = 5 + (x === 9 || x === 10 ? 0 : 2); y < 10; y++) p.set(x, y, GOLD[2]);
    p.set(3, 6, GOLD[3]); p.set(16, 6, GOLD[3]);
    p.rect(9, 3, 2, 2, apal[2]);
    for (const x of [5, 9, 14]) { p.set(x, 12, apal[2]); p.set(x, 13, apal[0]); }
  } else if (family === 'dragon') {
    // 一片龙鳞
    for (let y = 2; y <= 18; y++) {
      const w = Math.round(Math.sin(((y - 2) / 16) * Math.PI) * 6.5);
      for (let x = 10 - w; x <= 10 + w; x++) p.set(x, y, x < 9 ? pal[3] : x > 11 ? pal[1] : pal[2]);
    }
    for (let y = 5; y <= 16; y += 3) p.line(10 - 3, y, 10, y + 2, pal[0]);
    p.line(10, 3, 10, 17, apal[2]);
  } else {
    // 一颗发光的核心
    p.blob(10, 10.5, 6.5, 6.5, pal, 7);
    p.blob(10, 10.5, 3.5, 3.5, apal, 8);
    p.set(8, 8, '#ffffff'); p.set(9, 8, apal[3]);
    for (const [x, y] of [[2, 4], [17, 5], [3, 16], [17, 15]]) p.set(x, y, apal[3]);
  }
}

const cache = new Map<string, string>();
const done = (key: string, p: Pix) => {
  const url = p.outline().canvas().toDataURL();
  cache.set(key, url);
  return url;
};

export function chestIconUrl(tier: number, boss: boolean): string {
  const key = `chest${boss ? 'b' : ''}${tier}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = new Pix(20, 20);
  chest(p, tier, boss);
  return done(key, p);
}

export function luckyBagIconUrl(tier: number): string {
  const key = `bag${tier}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = new Pix(20, 20);
  luckyBag(p, tier);
  return done(key, p);
}

export function bannerIconUrl(col: string, acc: string, family: string): string {
  const key = `banner${col}${acc}${family}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = new Pix(20, 20);
  banner(p, col, acc, family);
  return done(key, p);
}

export function trophyIconUrl(col: string, acc: string, family: string): string {
  const key = `trophy${col}${acc}${family}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = new Pix(20, 20);
  trophy(p, col, acc, family);
  return done(key, p);
}
