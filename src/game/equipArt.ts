import { mix, phash, Pix } from './pix';

/*
 * 装备图标（用户 10-23 要求全部重做）：T1 木制 … T8 精金，每一阶的造型都不一样，
 * 不是同一张图换颜色。24×24 逐像素程序绘制，最后统一描边。
 * 武器和工具沿对角线画（左下是握柄，右上是尖端），用「沿轴距离 u / 离轴距离 v」描述形状；
 * 盔甲正面朝前、左右对称地画。
 */

const N = 24;

// ---- 配色 ----

/** 各阶的金属色和点缀色（宝石、符文光、火光） */
const METAL = ['#b08a58', '#d07a3a', '#c8ccd4', '#8a8f99', '#9ad8f0', '#7a7aa0', '#5a4a48', '#4ad898'];
const ACCENT = ['#6a9a3a', '#3aa89a', '#3a6ae0', '#c83a3a', '#e8f8ff', '#b070ff', '#ff8a2a', '#f0e070'];
const WOODS = ['#a87a48', '#e0d8c0', '#d0a860', '#8a6a40', '#d08060', '#a82a2a', '#4a4440', '#f4ecc8'];
const HIDE = ['#a07a50', '#b8925a', '#7e7e84', '#6a4430', '#c8ccd8', '#8a3a22', '#3a3238', '#5a3e8a'];
const CLOTH = ['#d8d4cc', '#e8d090', '#e8a0b0', '#7aa0d8', '#e8f0f8', '#c87a30', '#c84a2a', '#8a6ad8'];
const TRIM = ['#8a6a40', '#c87a3a', '#c8ccd4', '#e8c050', '#9ad8f0', '#b070ff', '#ffb040', '#f0e070'];

/** 一个颜色 → [最暗, 暗, 本色, 亮, 高光] */
function ramp(c: string): string[] {
  return [mix(c, '#140c18', 0.6), mix(c, '#140c18', 0.3), c, mix(c, '#ffffff', 0.35), mix(c, '#ffffff', 0.75)];
}

// ---- 沿对角线画（武器、工具） ----

type Part = (u: number, v: number) => string | null;
const S2 = Math.SQRT2;

/** 把一串部件画到画布上：后面的盖住前面的 */
function axis(p: Pix, parts: Part[], ox = 3.5, oy = 20.5) {
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = x + 0.5 - ox;
      const dy = y + 0.5 - oy;
      const u = (dx - dy) / S2;
      const v = (dx + dy) / S2;
      for (const part of parts) {
        const c = part(u, v);
        if (c) p.set(x, y, c);
      }
    }
  }
}

/** 握柄：缠绳或皮条，一段一段的 */
const grip = (u0: number, u1: number, hw: number, a: string, b: string, step = 1.4): Part => (u, v) =>
  u >= u0 && u <= u1 && Math.abs(v) <= hw ? (Math.floor((u - u0) / step) % 2 ? a : b) : null;

/** 直杆（木柄），左亮右暗 */
const shaft = (u0: number, u1: number, hw: number, pal: string[]): Part => (u, v) =>
  u >= u0 && u <= u1 && Math.abs(v) <= hw ? (v < -hw * 0.3 ? pal[3] : v > hw * 0.3 ? pal[1] : pal[2]) : null;

/** 圆球（柄头、宝石） */
const ball = (uc: number, vc: number, r: number, pal: string[]): Part => (u, v) => {
  const d = Math.hypot(u - uc, v - vc);
  if (d > r) return null;
  return u - uc + (vc - v) * 0.5 > r * 0.35 ? pal[4] ?? pal[3] : d > r * 0.7 ? pal[1] : pal[2];
};

/** 横档（护手）：在 uc 处垂直于轴，半长 len，半厚 th */
const bar = (uc: number, len: number, th: number, pal: string[], bend = 0): Part => (u, v) => {
  const uu = u - uc - bend * (v / len) ** 2;
  return Math.abs(uu) <= th && Math.abs(v) <= len ? (uu > th * 0.3 ? pal[3] : uu < -th * 0.3 ? pal[1] : pal[2]) : null;
};

/**
 * 刃：从 u0 到 u1，每处半宽 hw(q)，中线偏移 c(q)（弯刀），q = 0..1。
 * 一侧刃口亮，一侧暗，中间可带血槽
 */
function blade(u0: number, u1: number, hw: (q: number) => number, pal: string[], opt: { c?: (q: number) => number; fuller?: string; edge?: string } = {}): Part {
  return (u, v) => {
    if (u < u0 || u > u1) return null;
    const q = (u - u0) / (u1 - u0);
    const vc = opt.c ? opt.c(q) : 0;
    const w = hw(q);
    const d = v - vc;
    if (Math.abs(d) > w) return null;
    if (opt.fuller && Math.abs(d) < 0.55 && q < 0.75 && w > 1.2) return opt.fuller;
    if (d < -w + 0.8) return opt.edge ?? pal[4];
    if (d > w - 0.8) return pal[1];
    return d < 0 ? pal[3] : pal[2];
  };
}
/** 收尖：q 接近 1 时半宽线性收到 0 */
const taper = (w: number, from = 0.75) => (q: number) => (q < from ? w : w * (1 - q) / (1 - from));

/** 沿轴每隔一段亮一个点（符文、宝石镶嵌） */
const dots = (u0: number, u1: number, step: number, vc: number, col: string): Part => (u, v) =>
  u >= u0 && u <= u1 && Math.abs(v - vc) < 0.6 && Math.abs(((u - u0) % step) - step / 2) < 0.5 ? col : null;

// ---- 武器 ----

function sword(p: Pix, t: number) {
  const M = ramp(METAL[t]);
  const A = ramp(ACCENT[t]);
  const W = ramp(WOODS[t]);
  const parts: Part[] = [];
  switch (t) {
    case 0: // 木剑：宽而钝的木片，圆头，一根木条当护手，缠麻绳
      parts.push(grip(1, 5, 1, '#c8b088', '#8a6a40'), ball(0.6, 0, 1.3, W), bar(5.6, 2.8, 0.8, W),
        blade(6.2, 20, (q) => (q > 0.85 ? 2.2 * Math.sqrt(Math.max(0, 1 - ((q - 0.85) / 0.15) ** 2)) : 2.2), W, { fuller: W[1] }));
      break;
    case 1: // 铜短剑：叶形刃
      parts.push(grip(1, 5, 0.9, '#5a3a22', '#7a5232'), ball(0.6, 0, 1.2, M), bar(5.6, 2.4, 0.7, M),
        blade(6.2, 19, (q) => (q < 0.85 ? 1.4 + Math.sin(q * Math.PI * 1.05) * 1.1 : 2.2 * (1 - q) / 0.15), M));
      break;
    case 2: // 锡制罗马短剑：直刃短身，三角尖，圆盘护手
      parts.push(grip(1.5, 5, 0.9, '#3a2a1a', '#6a4a2a'), ball(0.8, 0, 1.6, M), ball(5.6, 0, 2.2, ramp('#8a6a40')),
        blade(6.8, 18.5, taper(1.9, 0.78), M));
      break;
    case 3: // 铁长剑：长直刃，血槽，直护手，红皮握把
      parts.push(grip(0.5, 5, 0.9, A[1], A[2]), ball(0, 0, 1.3, M), bar(5.6, 3.6, 0.8, M),
        blade(6.2, 22.5, taper(1.6, 0.85), M, { fuller: M[1] }));
      break;
    case 4: // 钛弯刀：刃身外弯，越往前越宽，护手是一道弧
      parts.push(grip(0.5, 5, 0.9, '#2a3a4a', '#4a6a8a'), ball(0, 0, 1.2, M), bar(5.6, 3, 0.7, M, -1.2),
        blade(6.2, 21.5, (q) => (q < 0.8 ? 1.2 + q * 1.2 : 2.2 * (1 - q) / 0.2), M, { c: (q) => -q * q * 3.2 }));
      break;
    case 5: // 符文剑：直刃上一串发光符文，护手往上翘成两翼
      parts.push(grip(0.5, 5, 0.9, '#2a1a3a', '#4a3a6a'), ball(0, 0, 1.4, A), bar(5.6, 3.8, 0.8, M, 2.2),
        blade(6.2, 22, taper(1.7, 0.82), M, { fuller: M[1] }), dots(8, 19, 2.6, 0, A[3]));
      break;
    case 6: // 陨铁焰形剑：波浪刃，刃口烧得发红
      parts.push(grip(0.5, 5, 0.9, '#3a1a10', '#6a2a1a'), ball(0, 0, 1.4, ramp('#ff8a2a')), bar(5.6, 3.4, 0.9, M),
        blade(6.2, 22.5, (q) => (q < 0.85 ? 1.6 + Math.sin(q * 22) * 0.55 : 1.9 * (1 - q) / 0.15), M, { edge: A[3] }),
        dots(7.5, 20, 3, 0, A[2]));
      break;
    default: // 精金巨剑：宽刃，中脊一条亮线，护手镶宝石
      parts.push(grip(0, 4.6, 1.1, '#1a4a3a', '#2a7a5a'), ball(-0.6, 0, 1.5, A), bar(5.6, 4.4, 1, M, 1),
        blade(6.4, 23.5, taper(2.6, 0.8), M, { fuller: M[4] }), ball(5.6, 0, 1.3, A));
  }
  axis(p, parts);
}

function spear(p: Pix, t: number) {
  const M = ramp(METAL[t]);
  const A = ramp(ACCENT[t]);
  const W = ramp(WOODS[t]);
  const pole = shaft(-2, 16, 0.75, W);
  const parts: Part[] = [pole];
  switch (t) {
    case 0: // 削尖的木棍，火烤硬的尖头
      parts.push(blade(15.5, 23, (q) => 0.9 * (1 - q), W), (u, v) => (u > 20 && Math.abs(v) < 0.6 ? '#3a2a1a' : null));
      break;
    case 1: // 铜叶形矛头
      parts.push(blade(15, 23, (q) => Math.sin(Math.min(1, q * 1.2) * Math.PI) * 2, M), grip(13, 15, 0.9, '#5a3a22', '#7a5232'));
      break;
    case 2: // 锡矛：细长矛头，下面一撮红缨
      parts.push(blade(16, 23.5, taper(1.3, 0.5), M), (u, v) => (u > 13 && u < 16 && Math.abs(v) < 0.8 + (16 - u) * 0.5 ? (Math.round(v * 2) % 2 ? '#c02a1a' : '#e04a2a') : null));
      break;
    case 3: // 铁翼矛：矛头下面两片横出的小翼
      parts.push(blade(15.5, 23, taper(1.6, 0.6), M), bar(15.5, 2.8, 0.6, M, 1.2));
      break;
    case 4: // 钛偃月刀：长柄上一把弯刀
      parts.push(blade(13, 23, (q) => (q < 0.8 ? 1.4 + q * 1.2 : 2.4 * (1 - q) / 0.2), M, { c: (q) => -1.4 - q * q * 2.4 }));
      break;
    case 5: // 符文三叉戟
      parts.push(bar(15.5, 3.2, 0.7, M), blade(15.5, 23, taper(1, 0.6), M), blade(15.5, 21, taper(0.8, 0.5), M, { c: () => -2.6 }),
        blade(15.5, 21, taper(0.8, 0.5), M, { c: () => 2.6 }), ball(15.5, 0, 1, A));
      break;
    case 6: // 陨铁戟：一边斧刃，一边倒钩，顶上长刺
      parts.push(blade(15, 23.5, taper(1, 0.5), M, { edge: A[3] }),
        (u, v) => (u > 14 && u < 19 && v < -0.5 && v > -4.5 + Math.abs(u - 16.5) * 0.6 ? (v < -3.6 + Math.abs(u - 16.5) * 0.6 ? A[3] : M[2]) : null),
        (u, v) => (u > 15 && u < 17.5 && v > 0.5 && v < 3 - (u - 15) ? M[1] : null));
      break;
    default: // 精金龙枪：螺旋纹的长锥，护手镶宝石，挂流苏
      parts.push(grip(10, 14, 1, '#1a4a3a', '#2a7a5a'), bar(14.6, 2.6, 0.8, M, -0.8), ball(14.6, 0, 1.2, A),
        blade(15.2, 23.8, (q) => 2 * (1 - q), M), (u, v) => (u > 15.5 && u < 22 && Math.abs(v) < 2 * (1 - (u - 15.2) / 8.6) && Math.round(u * 1.4 + v) % 3 === 0 ? M[4] : null));
  }
  axis(p, parts, 3, 21);
}

function dagger(p: Pix, t: number) {
  const M = ramp(METAL[t]);
  const A = ramp(ACCENT[t]);
  const W = ramp(WOODS[t]);
  const parts: Part[] = [];
  const o = 2; // 匕首整体往右上挪一点，居中
  switch (t) {
    case 0: // 木刺：一截削尖的木片，绑着布条
      parts.push(grip(o, o + 5, 1, '#d8ccb0', '#a89878'), blade(o + 5, o + 17, taper(1.6, 0.4), W));
      break;
    case 1: // 铜小刀：单刃，刀背直
      parts.push(grip(o, o + 5, 0.9, '#5a3a22', '#7a5232'), blade(o + 5.2, o + 17, (q) => (q < 0.7 ? 1.8 : 1.8 * (1 - q) / 0.3), M, { c: (q) => -0.4 + q * 0.4 }));
      break;
    case 2: // 锡制细剑匕：三棱细刺
      parts.push(grip(o, o + 5, 0.8, '#3a2a1a', '#6a4a2a'), ball(o - 0.4, 0, 1.2, M), bar(o + 5.4, 1.8, 0.6, M), blade(o + 5.8, o + 19, taper(1.1, 0.3), M));
      break;
    case 3: // 铁短剑匕：宽刃，十字护手
      parts.push(grip(o, o + 5, 0.9, A[1], A[2]), ball(o - 0.4, 0, 1.2, M), bar(o + 5.4, 2.6, 0.7, M), blade(o + 6, o + 18, taper(2, 0.6), M, { fuller: M[1] }));
      break;
    case 4: // 钛爪刀：刀尖弯成钩，柄尾有指环
      parts.push((u, v) => (Math.abs(Math.hypot(u - o + 1.4, v) - 1.5) < 0.6 ? M[2] : null), grip(o, o + 5, 0.9, '#2a3a4a', '#4a6a8a'),
        blade(o + 5.2, o + 17, (q) => 1.7 * (1 - q * 0.6), M, { c: (q) => q * q * 4 }));
      break;
    case 5: // 符文匕首：刃上一道发光纹，柄头嵌紫晶
      parts.push(grip(o, o + 5, 0.9, '#2a1a3a', '#4a3a6a'), ball(o - 0.6, 0, 1.3, A), bar(o + 5.4, 2.2, 0.6, M, 0.8),
        blade(o + 6, o + 18.5, taper(1.9, 0.6), M, { fuller: A[3] }));
      break;
    case 6: // 陨铁蛇形匕首（波浪刃），刃口通红
      parts.push(grip(o, o + 5, 0.9, '#3a1a10', '#6a2a1a'), bar(o + 5.4, 2.4, 0.7, M),
        blade(o + 6, o + 19, (q) => (q < 0.8 ? 1.5 : 1.5 * (1 - q) / 0.2), M, { c: (q) => Math.sin(q * 14) * 0.9, edge: A[3] }));
      break;
    default: // 精金双刃匕：柄两头都有刃，中间镶宝石
      parts.push(blade(o - 6, o, (q) => 1.2 * q, M), grip(o, o + 4, 1, '#1a4a3a', '#2a7a5a'), ball(o + 2, 0, 1.1, A),
        bar(o + 4.4, 2.8, 0.7, M, 1), blade(o + 4.8, o + 18.5, taper(2.1, 0.55), M, { fuller: M[4] }));
  }
  axis(p, parts);
}

/** 弓：一条弧形的弓臂 + 弦；bend 是弯曲程度，recurve 是两端反曲 */
function bowLimb(u0: number, u1: number, bend: number, thick: number, pal: string[], recurve = 0): Part {
  return (u, v) => {
    if (u < u0 || u > u1) return null;
    const q = (u - u0) / (u1 - u0);
    const vc = -bend * Math.sin(q * Math.PI) + recurve * (Math.max(0, 0.12 - q) + Math.max(0, q - 0.88)) * 8;
    const w = thick * (0.55 + 0.45 * Math.sin(q * Math.PI));
    const d = v - vc;
    if (Math.abs(d) > w) return null;
    return d < -w * 0.3 ? pal[3] : d > w * 0.3 ? pal[1] : pal[2];
  };
}
const string = (u0: number, u1: number, col: string, vOff = 0): Part => (u, v) => (u >= u0 && u <= u1 && Math.abs(v - vOff) < 0.45 ? col : null);

function bow(p: Pix, t: number, long: boolean) {
  const W = ramp(WOODS[t]);
  const M = ramp(METAL[t]);
  const A = ramp(ACCENT[t]);
  const u0 = long ? -2 : 1;
  const u1 = long ? 25.5 : 22.5;
  const mid = (u0 + u1) / 2;
  const bend = long ? [3.6, 3.8, 3.2, 4, 3, 3.8, 4.2, 4][t] : [4.2, 4.4, 3.6, 4.6, 3.4, 4.4, 4.8, 4.6][t];
  const recurve = [0, 0, 1, 0, 0.6, 1, 0.8, 1.2][t];
  const parts: Part[] = [string(u0 + 0.4, u1 - 0.4, t >= 5 ? A[3] : '#e8e0d0', 1.2)];
  parts.push(bowLimb(u0, u1, bend, long ? 1.2 : 1.45, t === 4 ? M : W, recurve));
  // 握把
  parts.push(grip(mid - 1.6, mid + 1.6, 1.3, t >= 3 ? A[1] : '#5a3a22', t >= 3 ? A[2] : '#7a5232', 1)
    && ((u, v) => (Math.abs(u - mid) <= 1.6 && Math.abs(v + bend) <= 1.4 ? (Math.floor(u) % 2 ? (t >= 3 ? A[1] : '#5a3a22') : t >= 3 ? A[2] : '#7a5232') : null)));
  const tip = (uc: number, col: string, r = 1): Part => ball(uc, 0.4, r, ramp(col));
  switch (t) {
    case 1: parts.push(tip(u0 + 0.6, METAL[1]), tip(u1 - 0.6, METAL[1])); break;
    case 2: // 牛角弓梢
      parts.push(tip(u0 + 0.6, '#e8dcc0', 1.1), tip(u1 - 0.6, '#e8dcc0', 1.1)); break;
    case 3: // 铁包弓梢 + 中段铁箍
      parts.push(tip(u0 + 0.6, METAL[3], 1.2), tip(u1 - 0.6, METAL[3], 1.2), (u, v) => (Math.abs(Math.abs(u - mid) - 4) < 0.5 && Math.abs(v + bend * 0.85) < 1.4 ? M[3] : null));
      break;
    case 4: // 钛制复合弓：两端带滑轮
      parts.push(ball(u0 + 0.8, -0.2, 1.4, M), ball(u1 - 0.8, -0.2, 1.4, M), string(u0 + 1, u1 - 1, '#c8e8ff', 0.2));
      break;
    case 5: // 符文弓：弓臂上一串发光符文
      parts.push(dots(u0 + 3, u1 - 3, 3, -bend * 0.8, A[3])); break;
    case 6: // 陨铁弓：两端烧着火翼
      parts.push(
        (u, v) => (u < u0 + 3.5 && u > u0 && v > -1 && v < 2.6 - (u - u0) * 0.5 ? (v > 1 ? A[3] : A[2]) : null),
        (u, v) => (u > u1 - 3.5 && u < u1 && v > -1 && v < 2.6 - (u1 - u) * 0.5 ? (v > 1 ? A[3] : A[2]) : null));
      break;
    case 7: // 精金弓：握把上方镶宝石，两端各一枚小宝石
      parts.push(ball(mid, -bend - 0.3, 1.4, A), tip(u0 + 0.6, ACCENT[7], 1), tip(u1 - 0.6, ACCENT[7], 1)); break;
  }
  axis(p, parts, long ? 3 : 3.5, long ? 21 : 20.5);
}

function crossbow(p: Pix, t: number) {
  const W = ramp(WOODS[t]);
  const M = ramp(METAL[t]);
  const A = ramp(ACCENT[t]);
  const parts: Part[] = [];
  // 弩身：一根粗木托
  parts.push(shaft(0, 19, 1.3, t === 4 || t === 7 ? M : W), grip(0, 4, 1.4, W[1], W[2], 2));
  // 弩臂：在 u=16 处横着一道弧
  const prodU = 16;
  const prodLen = [7, 7.5, 7.5, 8.5, 8, 8, 9, 9][t];
  const prodBend = [1.6, 2, 2.2, 2.4, 1.2, 2.4, 2.6, 2.8][t];
  const prod = (du: number, len: number, pal: string[]): Part => (u, v) => {
    if (Math.abs(v) > len) return null;
    const uc = prodU + du - prodBend * (1 - (v / len) ** 2);
    const d = u - uc;
    const w = 0.7 + (1 - Math.abs(v) / len) * 0.5;
    return Math.abs(d) <= w ? (d > 0.2 ? pal[3] : d < -0.2 ? pal[1] : pal[2]) : null;
  };
  // 弦从两端连到扳机前
  parts.push((u, v) => {
    if (Math.abs(v) > prodLen) return null;
    const k = Math.abs(v) / prodLen;
    return Math.abs(u - (prodU - prodBend * 0 - (1 - k) * 6 - 0.4)) < 0.45 ? '#e8e0d0' : null;
  });
  parts.push(prod(0, prodLen, t === 0 ? W : M));
  if (t === 6 || t === 7) parts.push(prod(-2.4, prodLen - 1.5, M)); // 双臂
  // 扳机
  parts.push((u, v) => (u > 5 && u < 7 && v > 1 && v < 3 ? M[1] : null));
  // 搭在槽里的弩箭
  parts.push((u, v) => (u > 9 && u < 21 && Math.abs(v) < 0.4 ? (u > 19.5 ? M[4] : '#c8a070') : null));
  switch (t) {
    case 2: // 前端脚蹬
      parts.push((u, v) => (Math.abs(Math.hypot(u - 20.5, v) - 1.6) < 0.5 && u > 19.5 ? M[2] : null)); break;
    case 3: // 绞盘
      parts.push(ball(2, -1.8, 1.3, M)); break;
    case 4: // 连弩：上面一个箭匣
      parts.push((u, v) => (u > 8 && u < 14 && v > -3.2 && v < -1 ? (Math.floor(u) % 2 ? M[2] : M[1]) : null)); break;
    case 5: parts.push(dots(2, 14, 3, 0, A[3])); break;
    case 6: parts.push(ball(prodU - prodBend, 0, 1.2, A)); break;
    case 7: parts.push(ball(prodU - prodBend, 0, 1.4, A), ball(1, 0, 1.1, A)); break;
  }
  axis(p, parts, 3, 20);
}

function staff(p: Pix, t: number) {
  const W = ramp(WOODS[t]);
  const M = ramp(METAL[t]);
  const A = ramp(ACCENT[t]);
  const parts: Part[] = [shaft(-2, 18, 0.8, W)];
  switch (t) {
    case 0: // 木杖：顶上一个树瘤，挂一片叶
      parts.push(ball(18.5, 0, 2.6, W), (u, v) => (u > 18 && u < 21 && v > 1 && v < 2.8 - (u - 18) * 0.4 ? '#6ac040' : null));
      break;
    case 1: // 铜环杖
      parts.push((u, v) => (Math.abs(Math.hypot(u - 20.2, v) - 2.6) < 0.8 ? M[Math.round(u) % 2 ? 2 : 3] : null), bar(17.5, 1.5, 0.6, M));
      break;
    case 2: // 分叉的树枝托着一块蓝石
      parts.push(blade(15, 21.5, () => 0.7, W, { c: (q) => -q * 2.8 }), blade(15, 21.5, () => 0.7, W, { c: (q) => q * 2.8 }), ball(20.5, 0, 2.1, A));
      break;
    case 3: // 铁头杖：方形铁帽，四个角钉
      parts.push((u, v) => (u > 17 && u < 22 && Math.abs(v) < 2 ? (u > 21 ? M[3] : v < 0 ? M[2] : M[1]) : null), ball(22.6, 0, 0.9, M), bar(17.4, 1.6, 0.5, A));
      break;
    case 4: // 钛爪握着一颗冰晶球
      parts.push(ball(20.5, 0, 2.6, ramp('#bfe8ff')), (u, v) => (u > 17 && u < 22 && Math.abs(Math.abs(v) - 2.6 + (u - 17) * 0.1) < 0.6 ? M[2] : null));
      break;
    case 5: // 符文杖：顶端悬着发光宝石，外面两圈符文环
      parts.push(ball(20.5, 0, 2.2, A), (u, v) => (Math.abs(Math.hypot(u - 20.5, (v) * 1.5) - 4) < 0.55 ? A[3] : null), bar(17, 2.4, 0.7, M, 0.6));
      break;
    case 6: // 陨铁笼里关着一团火
      parts.push(ball(20.5, 0, 2.2, ramp('#ff8a2a')), (u, v) => (Math.abs(Math.hypot(u - 20.5, v) - 2.8) < 0.5 && Math.round(Math.atan2(v, u - 20.5) * 2.5) % 2 === 0 ? M[3] : null),
        bar(17.6, 2.2, 0.6, M), ball(20.5, 0, 0.9, ['#fff', '#fff8c0', '#fff8c0', '#ffffff']));
      break;
    default: // 精金新月杖：一弯月牙托着宝石
      parts.push((u, v) => {
        const d = Math.hypot(u - 19.5, v);
        return d < 3.6 && Math.hypot(u - 21, v) > 2.6 ? (v < 0 ? M[3] : M[2]) : null;
      }, ball(21, 0, 1.6, A), bar(16.6, 1.8, 0.6, M), dots(4, 15, 3.5, 0, A[3]));
  }
  axis(p, parts, 3, 21);
}

// ---- 工具 ----

function tool(p: Pix, key: string, t: number) {
  const M = ramp(METAL[t]);
  const A = ramp(ACCENT[t]);
  const W = ramp(WOODS[t]);
  const handle = shaft(-1, 17, 0.8, W);
  const wrap = t >= 3 ? grip(-1, 4, 0.95, A[1], A[2]) : null;
  const deco: Part[] = t >= 5 ? [ball(-1.2, 0, 1.1, A)] : [];
  const parts: Part[] = [handle];
  if (wrap) parts.push(wrap);
  const wide = [0.8, 1, 1, 1.15, 1.1, 1.2, 1.25, 1.3][t];
  switch (key) {
    case 'axe': {
      // 斧刃从 v>0 一侧伸出，每阶刃形不同：方刃、月牙、胡子斧、双刃……
      const shape = (u: number, v: number) => {
        const du = u - 16;
        if (v < 0.6 || v > 6 * wide) return false;
        const reach = v / (6 * wide);
        const half = [1.8, 2.2 + reach * 1.2, 1.6 + reach * 2.4, 2 + reach * 2, 1.5 + reach * 3, 2 + reach * 2.6, 1.6 + reach * 3.4, 2.2 + reach * 3][t];
        const off = t === 3 ? -reach * 1.6 : t === 6 ? reach * 0.8 : 0;
        return Math.abs(du - off) <= half;
      };
      parts.push((u, v) => (shape(u, v) ? (v > 6 * wide - 1.2 ? M[4] : u - 16 > 0 ? M[3] : M[2]) : null));
      if (t === 7 || t === 5) parts.push((u, v) => (shape(u, -v) && -v < 4 * wide ? (u - 16 > 0 ? M[3] : M[1]) : null));
      parts.push(bar(16, 1.2, 1.8, M));
      if (t === 6) parts.push((u, v) => (Math.abs(u - 16) < 0.6 && v > 1 && v < 5 ? A[3] : null));
      break;
    }
    case 'pickaxe': {
      // 镐头：一道弧，两头的尖各阶不同（一头尖一头扁、双尖、带倒钩……）
      const span = [5, 5.5, 6, 6.5, 6.5, 7, 7.5, 7.5][t];
      const curve = [1.6, 2, 2.4, 2.2, 3, 2.6, 2.8, 3.2][t];
      parts.push((u, v) => {
        if (Math.abs(v) > span) return null;
        const k = Math.abs(v) / span;
        const uc = 16.5 - curve * k * k;
        const w = (t === 0 || t === 3 ? (v > 0 ? 1.3 : 1.3 * (1 - k)) : 1.3 * (1 - k * 0.8)) + 0.2;
        return Math.abs(u - uc) <= w ? (u > uc ? M[3] : M[2]) : null;
      });
      if (t === 4 || t === 7) parts.push(ball(16.5, 0, 1.3, A));
      if (t === 6) parts.push((u, v) => (Math.abs(v) > span - 1.5 && Math.abs(v) <= span && Math.abs(u - 16.5 + curve * (v / span) ** 2) < 1.2 ? A[3] : null));
      parts.push(bar(16.5, 1, 1.4, M));
      break;
    }
    case 'sickle': {
      // 镰刀：短柄，刃弯成半月，越高阶弯得越大、越细
      parts.length = 0;
      parts.push(shaft(-1, 8, 0.85, W));
      if (wrap) parts.push(grip(-1, 4, 0.95, A[1], A[2]));
      const r = [5, 5.5, 6, 6.5, 7, 7, 7.5, 8][t];
      const th = [1.6, 1.4, 1.3, 1.3, 1.1, 1.2, 1.2, 1.3][t];
      parts.push((u, v) => {
        const d = Math.hypot(u - 8 - r * 0.2, v - r);
        const ang = Math.atan2(v - r, u - 8 - r * 0.2);
        if (ang > 0.3 || ang < -Math.PI * (0.65 + t * 0.03)) return null;
        return Math.abs(d - r) <= th ? (d < r - th * 0.3 ? M[4] : M[2]) : null;
      });
      if (t === 5) parts.push(dots(9, 14, 2, 1.5, A[3]));
      if (t === 6) parts.push(ball(8.5, 0.8, 1, A));
      break;
    }
    case 'knife': {
      // 剥皮刀：厚背，刃尖上挑；高阶带护手和锯齿背
      parts.length = 0;
      const o = 4;
      parts.push(grip(o, o + 6, 1, t >= 3 ? A[1] : W[1], t >= 3 ? A[2] : W[2]));
      if (t >= 2) parts.push(bar(o + 6.4, 1.8 + t * 0.1, 0.6, M));
      parts.push(blade(o + 6.6, o + 15 + t * 0.2, (q) => (q < 0.6 ? 1.6 + t * 0.05 : (1.6 + t * 0.05) * (1 - q) / 0.4), M, { c: (q) => -q * q * (0.5 + t * 0.25) }));
      if (t === 4 || t === 7) parts.push((u, v) => (u > o + 8 && u < o + 13 && v > 1.2 && v < 2 && Math.floor(u) % 2 === 0 ? M[1] : null));
      if (t >= 5) parts.push(ball(o - 0.4, 0, 1.1, A));
      break;
    }
    case 'rod': {
      // 鱼竿：细长竿 + 线轮 + 垂下来的线，高阶有更多导环和更好的线轮
      parts.length = 0;
      parts.push(shaft(-2, 24, 0.55, W), grip(-2, 4, 0.8, t >= 3 ? A[1] : '#5a3a22', t >= 3 ? A[2] : '#7a5232'));
      if (t >= 1) parts.push(ball(5, 1.4, t >= 4 ? 1.6 : 1.2, M));
      for (let k = 0; k < Math.min(4, Math.floor(t / 2) + 1); k++) parts.push(ball(9 + k * 4, 0.9, 0.55, M));
      parts.push((u, v) => (u > 22 && u < 23.5 && v > 0 && v < 9 && Math.abs(u - 23) < 0.4 ? '#e8e8f0' : null));
      parts.push(ball(23, 9, 0.9, ramp(t >= 5 ? ACCENT[t] : '#e04a4a')));
      break;
    }
    case 'hoe': {
      // 锄头：刃垂直装在顶端，形状各阶不同（方锄、尖锄、双齿、宽刃……）
      parts.push((u, v) => {
        if (v < 0 || v > 6) return null;
        const k = v / 6;
        const w = [1.6, 2, 1.2 + (1 - k) * 1.2, 2.4, 1.8, 2.2, 2.4, 2.6][t];
        const uc = 16 - (t === 4 || t === 6 ? k * 2.4 : t === 2 ? k : 0);
        if (t === 3 || t === 7) if (Math.abs(u - uc) < 0.5 && v > 3) return null; // 双齿
        return Math.abs(u - uc) <= w ? (v > 5 ? M[4] : u > uc ? M[3] : M[2]) : null;
      }, bar(16, 1, 1.5, M));
      if (t === 5) parts.push(dots(15, 17, 2, 3, A[3]));
      break;
    }
    case 'hammer': {
      // 锤头：方锤、圆锤、羊角锤、战锤……
      const L = [2.8, 3, 3.4, 3.6, 3.8, 4, 4.2, 4.4][t];
      const H = [1.8, 2, 2.2, 2.2, 2, 2.4, 2.6, 2.6][t];
      parts.push((u, v) => {
        const du = u - 16.5;
        if (t === 2 && v < -1 && v > -L - 1.5 && Math.abs(du - (v + 1) * -0.4) < 0.8) return M[2]; // 羊角
        if (v < -L || v > L || Math.abs(du) > H - (t === 1 || t === 5 ? (Math.abs(v) / L) ** 2 * 0.8 : 0)) return null;
        if (t === 2 && v < 0) return null;
        return Math.abs(v) > L - 0.9 ? M[4] : du > 0 ? M[3] : M[2];
      });
      if (t === 6) parts.push((u, v) => (Math.abs(v) < L && Math.abs(u - 16.5) < 0.4 ? A[3] : null));
      if (t === 7 || t === 4) parts.push(ball(16.5, 0, 1.1, A));
      break;
    }
    case 'pan': {
      // 炒锅（烹饪工具，用户 10-25）：短柄 + 圆锅，锅形各阶不同（平底锅、深锅、双耳锅、宽口炒锅……）
      parts.length = 0;
      parts.push(shaft(-1, 9.5, 0.75, W));
      if (wrap) parts.push(grip(-1, 4, 0.9, A[1], A[2]));
      const r = [4, 4.3, 4.5, 4.8, 5, 5.2, 5.4, 5.6][t];
      const sq = [1, 1, 0.85, 1, 0.8, 1, 0.9, 1][t];
      const cu = 10 + r;
      parts.push((u, v) => {
        const d = Math.hypot((u - cu) * sq, v);
        if (d > r) return null;
        if (d > r - 0.9) return t >= 5 ? (v < 0 ? A[3] : A[2]) : v < 0 ? M[4] : M[3];
        // 锅底：左上亮、右下暗，中间一圈油光
        if (Math.abs(d - r * 0.45) < 0.4 && u < cu) return M[3];
        return v < -1 ? M[2] : M[1];
      });
      if (t === 2 || t === 4 || t === 6) parts.push(ball(cu + r - 0.3, 0, 1, M)); // 对面的小耳
      if (t >= 2) parts.push(ball(10.3, 0, 0.7, M)); // 柄和锅的铆钉
      if (t === 7) parts.push(ball(cu, 0, 1.2, A));
      if (t === 3 || t === 6) parts.push(dots(cu - r * 0.4, cu + r * 0.4, r * 0.4, 0, A[3]));
      break;
    }
    default: { // needle 针：一根针 + 旁边一轴线，线的颜色和线轴样式逐阶不同
      parts.length = 0;
      const thread = ramp([WOODS[0], '#e04a4a', '#4a8ae0', '#e8c040', '#f0f0f8', ACCENT[5], ACCENT[6], ACCENT[7]][t]);
      // 线轴：两片圆盘夹着一卷线
      parts.push((u, v) => {
        const du = u - 9;
        const dv = v - 5.5;
        if (Math.abs(dv) > 4 || Math.abs(du) > 3.4) return null;
        if (Math.abs(dv) > 3) return t >= 4 ? M[2] : WOODS[t];
        return Math.abs(du) <= 3 ? (Math.round(dv * 2 + du) % 3 === 0 ? thread[1] : du < -1 ? thread[3] : thread[2]) : null;
      });
      parts.push(blade(1, 22, (q) => (q < 0.85 ? 0.75 + (t >= 4 ? 0.25 : 0) : 0.8 * (1 - q) / 0.15), M));
      parts.push((u, v) => (Math.abs(Math.hypot(u - 2.6, v) - 0.9) < 0.45 ? M[1] : null));
      // 线头从针眼牵到线轴
      parts.push((u, v) => (u > 2.6 && u < 7 && Math.abs(v - (u - 2.6) * 0.6) < 0.45 ? thread[2] : null));
      if (t >= 5) parts.push(ball(1, 0, 1, A));
    }
  }
  parts.push(...deco);
  axis(p, parts, 3.5, 20.5);
}

// ---- 盔甲（正面，左右对称） ----

/** 以 x=11.5 为中线对称画：fn(dx, y) 给 dx≥0 的颜色，左边自动镜像，左半边稍亮 */
function sym(p: Pix, fn: (dx: number, y: number) => string | null, light = true) {
  for (let y = 0; y < N; y++) {
    for (let i = 0; i < 12; i++) {
      const c = fn(i + 0.5, y);
      if (!c) continue;
      p.set(11 - i, y, light ? mix(c, '#ffffff', 0.08) : c);
      p.set(12 + i, y, c);
    }
  }
}
const inEll = (dx: number, dy: number, rx: number, ry: number) => (dx / rx) ** 2 + (dy / ry) ** 2 <= 1;

function helm(p: Pix, t: number) {
  const M = ramp(METAL[t]);
  const A = ramp(ACCENT[t]);
  const W = ramp(WOODS[0]);
  sym(p, (dx, y) => {
    switch (t) {
      case 0: { // 木盔：几块木板箍成的锅形，一道麻绳
        if (y < 6 || y > 18 || !inEll(dx, y - 14, 8, 9)) return null;
        if (y === 13 || y === 14) return '#c8b088';
        return Math.floor(dx) % 3 === 2 ? W[1] : y < 9 ? W[3] : W[2];
      }
      case 1: { // 铜盔：圆顶 + 一圈宽帽檐
        if (y >= 15 && y <= 16 && dx < 10.5) return y === 15 ? M[3] : M[1];
        if (y < 6 || y > 15 || !inEll(dx, y - 15, 7, 9)) return null;
        return dx > 5 ? M[1] : y < 9 ? M[4] : M[2];
      }
      case 2: { // 锡制护鼻盔：尖顶，正中一根护鼻条
        if (y > 19) return null;
        const half = y < 3 ? 0 : y < 12 ? (y - 3) * 0.85 : 7.6;
        if (dx > half) return null;
        if (dx < 1 && y >= 12) return M[3];
        if (y >= 12 && y <= 19 && dx > 2 && dx < 6.5 && y > 13) return null; // 露脸
        return y === 11 ? M[1] : dx > half - 1.2 ? M[1] : M[2];
      }
      case 3: { // 铁桶盔：平顶直筒，一道横向眼缝和呼吸孔
        if (y < 4 || y > 20 || dx > 7.5) return null;
        if (y === 11 && dx < 6) return '#140c10';
        if (y >= 14 && y <= 17 && dx > 1.5 && dx < 5 && (y + Math.floor(dx)) % 2 === 0) return '#140c10';
        if (dx < 0.8) return M[3];
        return y === 4 ? M[4] : dx > 6.4 ? M[1] : M[2];
      }
      case 4: { // 钛制意式盔：圆弧外形，T 形开口
        if (y < 3 || y > 21 || !inEll(dx, y - 12, 7.5, 9.5)) return null;
        if ((y >= 10 && y <= 11 && dx < 4.5) || (y > 11 && y < 20 && dx < 1.4)) return '#140c10';
        return dx > 5.5 ? M[1] : y < 7 ? M[4] : M[2];
      }
      case 5: { // 符文角盔：两只弯角，额前一枚发光符文
        const horn = y >= 1 && y <= 10 && Math.abs(dx - (10.5 - (y - 1) * 0.35) + (y < 4 ? (4 - y) * 0.4 : 0)) < 1.2 - (10 - y) * 0.05;
        if (horn) return y < 4 ? A[4] : '#e8dcc0';
        if (y < 6 || y > 20 || !inEll(dx, y - 13, 7, 8)) return null;
        if (dx < 1.2 && y >= 9 && y <= 10) return A[3];
        if (y === 13 && dx < 5.5) return '#140c10';
        return dx > 5.5 ? M[1] : M[2];
      }
      case 6: { // 陨铁冠盔：头顶一道火焰羽冠，脸甲带尖刺
        if (dx < 1.6 && y >= 0 && y <= 7) return y < 3 ? A[4] : A[2 + (y % 2)];
        if (y < 6 || y > 21) return null;
        const half = y < 10 ? (y - 5) * 1.6 : 7.8 - Math.max(0, y - 16) * 0.6;
        if (dx > half) return null;
        if (y >= 12 && y <= 13 && dx > 1.5 && dx < 5.5) return A[2];
        if (y >= 19 && dx < 1) return M[3];
        return dx > half - 1.2 ? M[1] : y < 9 ? M[3] : M[2];
      }
      default: { // 精金翼冠：两侧张开的金属翅膀，额头镶宝石
        const wing = y >= 3 && y <= 13 && dx > 7 && dx < 11.5 && y > 3 + (dx - 7) * 0.4 && (y - 3) < (11.5 - dx) * 2.8;
        if (wing) return (Math.floor(y + dx) % 3 === 0) ? M[1] : M[3];
        if (y < 4 || y > 21 || !inEll(dx, y - 13, 7.2, 9)) return null;
        if (dx < 1.6 && y >= 8 && y <= 10) return A[3];
        if (y === 13 && dx < 5) return '#140c10';
        return dx > 6 ? M[1] : y < 8 ? M[4] : M[2];
      }
    }
  });
}

function capLeather(p: Pix, t: number) {
  const H = ramp(HIDE[t]);
  const A = ramp(ACCENT[t]);
  sym(p, (dx, y) => {
    switch (t) {
      case 0: // 皮便帽：小圆帽，一圈缝线
        if (y < 7 || y > 16 || !inEll(dx, y - 16, 7.5, 9)) return null;
        return y === 13 && Math.floor(dx) % 2 ? '#e8d8b0' : dx > 5.5 ? H[1] : y < 10 ? H[3] : H[2];
      case 1: { // 皮护额：一道弯弧的厚皮护额，正中一颗铜钉，两边垂着系带
        const yc = 9 + (dx / 8) ** 2 * 4;
        if (dx < 8.5 && Math.abs(y - yc) <= 1.6) return dx < 1.2 && Math.abs(y - yc) < 1 ? METAL[1] : y < yc - 0.6 ? H[3] : y > yc + 0.6 ? H[1] : H[2];
        if (dx > 7.2 && dx < 8.8 && y > 14 && y < 21) return y % 2 ? H[1] : H[2];
        return null;
      }
      case 2: { // 皮兜帽：尖顶垂下来，开一个椭圆脸洞
        if (y < 2 || y > 21) return null;
        const half = Math.min(8.5, 1 + (y - 2) * 0.9);
        if (dx > half) return null;
        if (inEll(dx, y - 14, 4, 5)) return '#2a1a10';
        return dx > half - 1.2 ? H[1] : H[2];
      }
      case 3: { // 游侠帽：宽檐，插一根羽毛
        if (y >= 13 && y <= 14 && dx < 11) return y === 13 ? H[3] : H[1];
        if (y >= 6 && y < 13 && dx < 6 - (13 - y) * 0.2) return y === 11 ? A[2] : H[2];
        return null;
      }
      case 4: { // 风镜皮盔：圆盔，额上架一副亮晶晶的护目镜
        if (y < 5 || y > 19 || !inEll(dx, y - 13, 7.5, 8.5)) return null;
        if (y >= 9 && y <= 12 && dx > 1 && dx < 6.5) return inEll(dx - 3.8, y - 10.5, 2.4, 1.8) ? A[3] : '#3a3a3e';
        return dx > 5.5 ? H[1] : H[2];
      }
      case 5: { // 蒙面兜帽：兜帽 + 下半脸围巾，只露眼睛
        if (y < 2 || y > 21) return null;
        const half = Math.min(8.5, 2 + (y - 2) * 0.8);
        if (dx > half) return null;
        if (y >= 11 && y <= 12 && dx < 4.5) return y === 11 && dx > 1.5 && dx < 3.5 ? A[3] : '#1a1010';
        if (y >= 13 && y <= 20 && dx < 6) return y % 2 ? A[1] : A[2];
        return H[2];
      }
      case 6: { // 鳞皮角帽：一片片鳞，两根短角
        if (y >= 2 && y <= 7 && Math.abs(dx - 6 - (7 - y) * 0.3) < 1) return '#e8dcc0';
        if (y < 6 || y > 18 || !inEll(dx, y - 15, 8, 9.5)) return null;
        return (Math.floor(dx / 2) + Math.floor(y / 2)) % 2 ? H[1] : H[3];
      }
      default: { // 龙皮冠帽：头顶一排背鳍，额前镶宝石
        if (dx < 1.5 && y >= 1 && y <= 6) return A[2 + (y % 2)];
        if (dx >= 1.5 && dx < 4 && y >= 3 && y <= 7 && y > 3 + (dx - 1.5)) return A[1];
        if (y < 5 || y > 19 || !inEll(dx, y - 13, 7.5, 8.5)) return null;
        if (dx < 1.4 && y >= 9 && y <= 11) return ACCENT[7];
        return (Math.floor(dx / 2) + Math.floor(y / 2)) % 2 ? H[1] : H[2];
      }
    }
  });
}

function hatCloth(p: Pix, t: number) {
  const C = ramp(CLOTH[t]);
  const T = ramp(TRIM[t]);
  sym(p, (dx, y) => {
    switch (t) {
      case 0: // 布头巾：包住头顶，侧面打个结垂下两条巾尾
        if (y >= 6 && y <= 15 && inEll(dx, y - 15, 7.5, 9)) return (y + Math.floor(dx)) % 4 === 0 ? C[1] : y < 9 ? C[3] : C[2];
        if (dx > 6.5 && dx < 9.5 && y >= 12 && y <= 15) return C[1];
        if (dx > 7.5 && dx < 10.5 - (y - 15) * 0.2 && y > 15 && y <= 21) return y % 2 ? C[1] : C[2];
        return null;
      case 1: // 布帽：软塌塌的圆帽
        if (y >= 14 && y <= 15 && dx < 9) return T[2];
        if (y < 6 || y > 14 || !inEll(dx, y - 14, 7.5, 8)) return null;
        return dx > 5.5 ? C[1] : C[2];
      case 2: { // 布兜帽：圆滑的兜帽，边缘一圈滚边
        if (y < 3 || y > 21 || !inEll(dx, y - 12, 8.5, 9.5)) return null;
        if (inEll(dx, y - 14, 4.5, 5.5)) return inEll(dx, y - 14, 3.5, 4.5) ? '#2a1a20' : T[2];
        return dx > 6.5 ? C[1] : C[2];
      }
      case 3: { // 尖顶法师帽：高高的尖顶往一边歪，宽帽檐
        if (y >= 17 && y <= 18 && dx < 11.5) return y === 17 ? C[3] : C[1];
        if (y === 16 && dx < 6.5) return T[2];
        const half = y < 2 ? 0 : (y - 2) * 0.45;
        if (y < 2 || y > 16 || dx > half) return null;
        return dx > half - 1 ? C[1] : C[2];
      }
      case 4: { // 银冠兜帽：兜帽外加一道发亮的头环
        if (y < 3 || y > 21 || !inEll(dx, y - 12, 8.5, 9.5)) return null;
        if (y === 8 || y === 9) return dx < 1.2 ? ACCENT[4] : T[y === 8 ? 3 : 2];
        if (inEll(dx, y - 15, 4.5, 5)) return '#2a2030';
        return dx > 6.5 ? C[1] : C[2];
      }
      case 5: { // 星纹法帽：帽身绣着星星，帽尖坠一颗星
        if (y >= 18 && y <= 19 && dx < 11) return C[1];
        const half = y < 4 ? 0 : (y - 4) * 0.55;
        if (y < 4 || y > 17 || dx > half) return null;
        if ((Math.floor(dx) === 2 && y === 12) || (Math.floor(dx) === 4 && y === 15) || (dx < 1 && y === 9)) return '#fff8c0';
        return y === 17 ? T[2] : C[2];
      }
      case 6: { // 焰冠兜帽：兜帽顶上一圈火焰形的冠
        if (y >= 2 && y <= 6 && dx < 7 && (y - 2) >= Math.abs(Math.sin(dx * 1.1)) * 3.5) return y < 4 ? ACCENT[6] : T[2];
        if (y < 6 || y > 21 || !inEll(dx, y - 13, 8.5, 8)) return null;
        if (inEll(dx, y - 15, 4.5, 5)) return '#2a1010';
        return dx > 6.5 ? C[1] : C[2];
      }
      default: { // 奥术高帽：又高又直，帽身一道金边，正中镶宝石
        if (y >= 19 && y <= 20 && dx < 10.5) return T[3];
        if (y < 1 || y > 18 || dx > 3.5 + y * 0.18) return null;
        if (y === 15 || y === 16) return T[2];
        if (dx < 1.4 && y >= 10 && y <= 12) return ACCENT[7];
        return y < 3 ? C[3] : dx > 2.5 + y * 0.18 ? C[1] : C[2];
      }
    }
  });
}

/** 身甲：三种材质各自一套 8 阶的造型 */
function bodyArmor(p: Pix, t: number, mat: 'plate' | 'leather' | 'cloth') {
  const M = ramp(mat === 'plate' ? METAL[t] : mat === 'leather' ? HIDE[t] : CLOTH[t]);
  const A = ramp(mat === 'cloth' ? TRIM[t] : ACCENT[t]);
  if (mat === 'cloth') {
    // 法袍：长度、袖子、领口、腰带、花纹逐阶变化
    const long = [17, 20, 21, 22, 22, 23, 23, 23][t];
    sym(p, (dx, y) => {
      if (y < 3 || y > long) return null;
      const shoulder = y < 7 ? 6 + (y - 3) * 0.6 : 0;
      const sleeve = t >= 3 && y >= 6 && y <= 12 && dx < 10.5 + (y - 6) * 0.15 && dx > 7;
      const half = y < 7 ? shoulder : 6.5 + (y - 7) * [0.1, 0.18, 0.22, 0.25, 0.25, 0.28, 0.3, 0.32][t];
      if (!sleeve && dx > half) return null;
      if (sleeve) return y === 12 ? A[2] : M[1];
      if (y <= 5 && dx < 3 - (y - 3) * 0.3) return '#2a1a20'; // 领口
      if (t >= 1 && y === 11) return A[2]; // 腰带
      if (t >= 2 && dx < 1.2 && y > 11) return A[t >= 5 ? 3 : 2]; // 前襟滚边
      if (t >= 4 && y === long) return A[3];
      if (t === 5 && (y * 3 + Math.floor(dx) * 5) % 11 === 0) return '#fff8c0';
      if (t === 6 && y > long - 4 && (y + Math.floor(dx)) % 3 === 0) return ACCENT[6];
      if (t === 7 && y > 13 && Math.abs(dx - 4) < 0.6) return A[3];
      return dx > half - 1.3 ? M[1] : M[2];
    });
    if (t >= 6) for (const x of [7, 16]) p.set(x, 4, A[4]);
    return;
  }
  sym(p, (dx, y) => {
    if (y < 3 || y > 21) return null;
    // 肩甲：高阶越来越大
    const pauldron = mat === 'plate' && t >= 3 && y >= 3 && y <= 8 && inEll(dx - 8, y - 6, [0, 0, 0, 3, 3.2, 3.6, 3.8, 4][t], 3);
    if (pauldron) {
      if (t === 6 && y < 5 && Math.abs(dx - 8) < 1) return ACCENT[6];
      return y < 5 ? M[3] : M[1];
    }
    if (t === 6 && mat === 'plate' && y >= 0 && y < 4 && Math.abs(dx - 8.5) < 0.7) return M[3]; // 肩刺
    const half = y < 6 ? 5 + (y - 3) * 0.9 : y < 15 ? 7.5 - (y - 6) * 0.12 : 6.5;
    if (dx > half) return null;
    if (y <= 4 && dx < 2.5) return null; // 领口
    if (mat === 'leather') {
      if (y === 14) return t >= 3 ? A[2] : M[0]; // 腰带
      if (t >= 1 && Math.abs(dx - 3.5) < 0.5 && y > 5 && y < 14 && y % 2 === 0) return '#e8d8b0'; // 缝线
      if (t === 2 || t === 6) if ((Math.floor(dx / 2) + Math.floor(y / 2)) % 2) return M[1]; // 鳞片
      if (t === 4 && y > 6 && y < 13 && dx > 1 && dx < 3) return '#3a3a3e'; // 皮扣
      if (t === 5 && y >= 15) return y % 2 ? M[1] : M[2]; // 流苏裙摆
      if (t === 7 && dx < 1.4 && y >= 7 && y <= 9) return ACCENT[7];
      if (t >= 3 && y >= 6 && y <= 7 && dx < 6) return M[3];
      return dx > half - 1.2 ? M[1] : M[2];
    }
    // 板甲
    switch (t) {
      case 0: // 木片甲：一条条竖木板，绳子绑着
        if (y === 9 || y === 15) return '#c8b088';
        return Math.floor(dx) % 3 === 2 ? M[1] : M[2];
      case 1: // 铜鳞甲：一片片小鳞
        return (Math.floor(dx / 2) + Math.floor(y / 2)) % 2 ? M[1] : (y % 2 ? M[2] : M[3]);
      case 2: // 锡制锁子甲：小圆环纹
        return (dx * 2 + y) % 3 < 1 ? M[1] : (y % 2 ? M[2] : M[3]);
      case 3: // 铁胸甲：一整块，中线一道脊，腹部几道分节
        if (dx < 0.8 && y < 14) return M[4];
        if (y >= 14 && y % 2 === 0) return M[1];
        return dx > half - 1.2 ? M[1] : y < 9 ? M[3] : M[2];
      case 4: // 钛板甲：胸口两块弧形板，下摆层叠的裙甲
        if (y >= 14) return y % 2 ? M[1] : M[3];
        if (inEll(dx - 3.2, y - 9, 3, 3)) return M[3];
        return M[2];
      case 5: // 符文板甲：胸口一个发光的符文圆
        if (Math.abs(Math.hypot(dx, y - 10) - 2.6) < 0.6) return A[3];
        if (dx < 0.8 && Math.abs(y - 10) < 2) return A[4];
        if (y >= 15 && y % 2 === 0) return M[1];
        return dx > half - 1.2 ? M[1] : M[2];
      case 6: // 陨铁板甲：表面有熔岩一样发红的裂纹
        if (Math.abs(Math.sin(dx * 1.3 + y * 0.7) + Math.cos(y * 0.9 - dx)) < 0.18) return A[3];
        return dx > half - 1.2 ? M[0] : M[1];
      default: // 精金板甲：胸口镶宝石，金色滚边，下摆披风
        if (dx < 1.6 && y >= 8 && y <= 10) return A[3];
        if (dx > half - 1 || y === 14) return '#f0d060';
        return y < 9 ? M[3] : M[2];
    }
  });
}

function boots(p: Pix, t: number, mat: 'plate' | 'leather' | 'cloth') {
  const M = ramp(mat === 'plate' ? METAL[t] : mat === 'leather' ? HIDE[t] : CLOTH[t]);
  const A = ramp(mat === 'cloth' ? TRIM[t] : ACCENT[t]);
  // 两只靴子并排，侧面朝右；靴筒高度、鞋头形状、装饰逐阶变化
  const top = mat === 'cloth' ? [12, 11, 10, 8, 9, 7, 8, 6][t] : [12, 10, 9, 7, 6, 6, 5, 4][t];
  const toe = mat === 'cloth' && (t === 3 || t === 5) ? 'curl' : mat === 'plate' && t >= 3 ? 'point' : 'round';
  const draw = (ox: number) => {
    for (let y = top; y < 22; y++) {
      for (let x = 0; x < 10; x++) {
        const shaftPart = x >= 1 && x <= 5 && y < 17;
        const foot = y >= 17 && x <= (toe === 'point' ? 8 + (y - 17) * 0.3 : toe === 'curl' ? 8 : 7.5) && (toe !== 'round' || inEll(x - 4, y - 19, 4.6, 3.2) || x < 4);
        if (!shaftPart && !foot) continue;
        let c = x < 2 ? M[3] : x > 4 && y < 17 ? M[1] : M[2];
        if (y >= 20) c = mat === 'cloth' ? A[1] : '#2a1a10';
        if (y === top) c = mat === 'plate' ? M[4] : A[2];
        if (mat === 'plate' && t >= 3 && y < 17 && (y - top) % 3 === 2) c = M[1]; // 分节甲片
        if (mat === 'plate' && t >= 4 && y >= top + 3 && y <= top + 5 && x >= 1 && x <= 4) c = t === 5 ? A[3] : M[3]; // 护膝
        if (mat === 'leather' && t >= 1 && (y === top + 3 || y === top + 6) && x <= 5) c = t >= 4 ? A[2] : '#3a2a1a'; // 绑带
        if (mat === 'leather' && t === 6 && y < 17 && (x + y) % 3 === 0) c = M[1];
        if (mat === 'cloth' && t >= 2 && y === 18 && x > 3) c = A[3];
        p.set(ox + x, y, c);
      }
    }
    if (toe === 'curl') { p.set(ox + 9, 17, M[2]); p.set(ox + 9, 16, M[2]); }
    if (mat === 'plate' && t === 6) for (const yy of [top + 1, top + 4]) p.set(ox + 6, yy, A[3]); // 靴刺
    if (t === 7) {
      // 脚踝两侧的小翅膀
      for (let k = 0; k < 4; k++) p.set(ox + 6 + k, top + 2 - k * 0.5, '#f0e070');
      p.set(ox + 3, top + 2, ACCENT[7]);
    }
  };
  draw(1);
  draw(12);
}

function gloves(p: Pix, t: number, mat: 'plate' | 'leather' | 'cloth') {
  const M = ramp(mat === 'plate' ? METAL[t] : mat === 'leather' ? HIDE[t] : CLOTH[t]);
  const A = ramp(mat === 'cloth' ? TRIM[t] : ACCENT[t]);
  // 一只手套正面：袖口长度、手指形状（连指、分指、爪）、装饰逐阶变化
  const cuff = [2, 3, 3, 4, 5, 5, 5, 6][t];
  const fingers = mat === 'plate' ? (t <= 1 ? 'mitten' : t === 6 ? 'claw' : 'split') : mat === 'cloth' && t < 2 ? 'mitten' : t === 6 && mat === 'leather' ? 'claw' : 'split';
  const flare = mat === 'plate' && t >= 3 ? 1.5 : mat === 'cloth' && t >= 4 ? 1 : 0;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = x - 11.5;
      let c: string | null = null;
      // 袖口：手腕往下
      if (y >= 22 - cuff && y < 23 && Math.abs(dx) <= 5 + flare * (y - (22 - cuff)) / cuff) c = y === 22 - cuff ? (mat === 'plate' ? M[4] : A[2]) : M[1];
      // 手掌
      else if (y >= 10 && y < 22 - cuff && Math.abs(dx) <= 5) c = dx < -2 ? M[3] : dx > 3 ? M[1] : M[2];
      // 拇指
      else if (y >= 11 && y <= 16 && dx > 5 && dx < 8.5 - (16 - y) * 0.3) c = M[1];
      // 手指
      else if (y >= 2 && y < 10) {
        if (fingers === 'mitten') c = inEll(dx, y - 10, 5, 7.5) ? M[2] : null;
        else {
          const f = Math.floor((dx + 5) / 2.5);
          const len = [6, 8, 7.5, 5][f];
          const fx = -5 + f * 2.5 + 1.25;
          if (f >= 0 && f <= 3 && Math.abs(dx - fx) < 1 && y >= 10 - len) c = (y - (10 - len)) % 3 === 0 && mat === 'plate' ? M[1] : M[2];
          if (fingers === 'claw' && f >= 0 && f <= 3 && Math.abs(dx - fx) < 0.6 && y >= 10 - len - 2 && y < 10 - len) c = A[3];
        }
      }
      if (!c) continue;
      // 装饰
      if (y >= 12 && y < 22 - cuff) {
        if (mat === 'plate' && t >= 2 && (y - 12) % 3 === 0) c = M[1];
        if (t === 5 && Math.hypot(dx, y - 15) < 1.4) c = A[3];
        if (t === 7 && Math.hypot(dx, y - 15) < 1.6) c = ACCENT[7];
        if (mat === 'leather' && t >= 1 && Math.abs(dx) < 0.5 && y % 2 === 0) c = '#e8d8b0';
        if (mat === 'cloth' && t >= 3 && y === 13) c = A[3];
      }
      if (mat === 'plate' && t === 4 && y >= 22 - cuff && Math.abs(dx) < 1) c = M[4];
      p.set(x, y, c);
    }
  }
}

// ---- 入口 ----

const urlCache = new Map<string, string>();

/** 装备 key（sword、plate_head……）+ 阶级 → 图标 data URL；不认识的 key 返回 null */
export function equipIconUrl(key: string, tier: number): string | null {
  const id = `${key}|${tier}`;
  const hit = urlCache.get(id);
  if (hit) return hit;
  const p = new Pix(N, N);
  const [mat, part] = key.includes('_') ? key.split('_') : ['', key];
  if (key === 'sword') sword(p, tier);
  else if (key === 'spear') spear(p, tier);
  else if (key === 'dagger') dagger(p, tier);
  else if (key === 'shortbow') bow(p, tier, false);
  else if (key === 'longbow') bow(p, tier, true);
  else if (key === 'crossbow') crossbow(p, tier);
  else if (key === 'staff') staff(p, tier);
  else if (['axe', 'pickaxe', 'sickle', 'knife', 'rod', 'hoe', 'hammer', 'needle', 'pan'].includes(key)) tool(p, key, tier);
  else if (part === 'head') (mat === 'plate' ? helm : mat === 'leather' ? capLeather : hatCloth)(p, tier);
  else if (part === 'body') bodyArmor(p, tier, mat as 'plate');
  else if (part === 'feet') boots(p, tier, mat as 'plate');
  else if (part === 'hands') gloves(p, tier, mat as 'plate');
  else return null;
  // 高阶装备加几颗闪光点
  if (tier >= 5) for (let k = 0; k < tier - 4; k++) {
    const x = Math.floor(phash(k, tier, 77) * N);
    const y = Math.floor(phash(tier, k, 78) * N);
    if (p.get(x, y)) p.set(x, y, '#ffffff');
  }
  const url = p.outline().canvas().toDataURL();
  urlCache.set(id, url);
  return url;
}
