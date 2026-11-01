import { canvas, glowAt } from './dungeonPoster';
import { phash } from './pix';
import { ICE, SNOW, glacier, px } from './winterPoster';

/*
 * 永冬传送门（用户 11-01：原来的门「太简陋，一点都不宏伟」，重画成一座远古巨门）。
 * 原图 216×210，门脚在 y=196，按 20 像素/米算约 11 米宽、10 米高：
 *   三级石阶和石台，台上一圈呼吸的符文 → 两根带符文带的冰石巨柱（柱础、柱头）→ 三层尖拱（石、冰、白边），拱面一排符文
 *   → 拱顶一颗悬着的冰晶钥石，拱背一圈放射的冰棱 → 两侧各一尊拄剑的霜骑士石像，再外侧两座燃着青焰的火炬石柱
 *   → 门洞里深不见底的空间漩涡（光臂、收缩的光环、闪电丝）
 * CG（realmIntroArt）和地图上的传送门都用这里的画法：
 *   drawWinterPortal(ctx, x, y, t, power, dissolve) 画带动画的整座门（x 是门中线、y 是门脚）
 *   paintWinterPortal(k) 只画门（门洞透明，给地图当静态贴图），paintWinterPortalSwirl(k) 单画门洞里的漩涡（地图上自己转）
 */
export const WPORTAL_W = 216;
export const WPORTAL_H = 210;
/** 门脚（石阶底）在原图的 y */
export const WPORTAL_FOOT = 196;
/** 门洞中心离门脚的高度（像素） */
export const WPORTAL_EYE = 84;
/** 门洞的半宽半高（椭圆） */
export const WPORTAL_RX = 36;
export const WPORTAL_RY = 66;

const STONE = ['#101a30', '#1a2c50', '#27406c', '#3a5a8c', '#5c86b8', '#86aed8'];
const GLOW = 'rgba(90,220,255,';
const PILLAR_X = 54;
const PILLAR_H = 110;
const SPAN = 70;
const INNER = 40;

/** 尖拱外沿：apex 顶点、span 半跨、drop 两端比顶点低多少 */
const archY = (dx: number, apex: number, span: number, drop: number) => apex + Math.pow(Math.min(1, Math.abs(dx) / span), 1.5) * drop;

/** 一尊拄着巨剑的霜骑士石像（高约 46 像素），浅色石头，面朝镜头 */
function knight(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // 台座（两层）
  for (let dx = -11; dx <= 11; dx++) for (let d = 0; d < 5; d++) px(ctx, x + dx, y - d, d === 4 ? SNOW[3] : Math.abs(dx) === 11 ? STONE[0] : d < 2 ? STONE[1] : STONE[2]);
  for (let dx = -8; dx <= 8; dx++) for (let d = 5; d < 9; d++) px(ctx, x + dx, y - d, d === 8 ? STONE[4] : Math.abs(dx) === 8 ? STONE[1] : STONE[2]);
  const by = y - 9;
  // 披风/身体：下宽上窄，浅色石头，左暗右亮
  for (let d = 0; d < 30; d++) {
    const hw = 4 + (29 - d) * 0.2;
    for (let dx = -hw; dx <= hw; dx++) px(ctx, x + dx, by - d, dx < -hw * 0.45 ? STONE[2] : dx < hw * 0.25 ? STONE[3] : STONE[4]);
  }
  // 披风褶皱
  for (let d = 2; d < 28; d += 5) { px(ctx, x - 3, by - d, STONE[2], 1, 3); px(ctx, x + 3, by - d - 1, STONE[5], 1, 2); }
  // 肩甲
  for (const sg of [-1, 1]) for (let d = 0; d < 4; d++) px(ctx, x + sg * 6 - 2, by - 27 + d, d === 0 ? STONE[5] : STONE[3], 5, 1);
  // 兜帽的头
  for (let d = 0; d < 9; d++) {
    const hw = d < 2 ? 2.5 : d < 7 ? 4 : 3;
    for (let dx = -hw; dx <= hw; dx++) px(ctx, x + dx, by - 30 - d, dx < -1 ? STONE[2] : dx < 2 ? STONE[3] : STONE[4]);
  }
  // 兜帽里的脸是黑的
  px(ctx, x - 2, by - 33, STONE[0], 5, 3);
  // 拄在身前的巨剑：剑尖插在台座上，剑格和剑柄
  for (let d = 0; d < 32; d++) px(ctx, x, by - d + 3, d < 3 ? ICE[2] : d % 6 === 0 ? ICE[4] : ICE[3], 1, 1);
  px(ctx, x - 1, by - 10, ICE[4], 1, 14);
  px(ctx, x - 5, by - 28, STONE[4], 11, 2);
  px(ctx, x - 1, by - 32, STONE[5], 3, 4);
  px(ctx, x, by - 34, ICE[4], 1, 2);
  // 肩上和兜帽上的雪
  px(ctx, x - 8, by - 28, SNOW[4], 4, 1);
  px(ctx, x + 5, by - 28, SNOW[4], 4, 1);
  px(ctx, x - 2, by - 39, SNOW[4], 4, 1);
}

/** 火炬石柱：矮石柱上一口大火盆 */
function torchStand(ctx: CanvasRenderingContext2D, x: number, y: number) {
  for (let dx = -7; dx <= 7; dx++) for (let d = 0; d < 4; d++) px(ctx, x + dx, y - d, d === 3 ? STONE[4] : Math.abs(dx) === 7 ? STONE[0] : STONE[2]);
  for (let dx = -4; dx <= 4; dx++) for (let d = 4; d < 30; d++) px(ctx, x + dx, y - d, dx === -4 ? STONE[1] : dx === 4 ? STONE[4] : dx < 0 ? STONE[2] : STONE[3]);
  for (let dx = -8; dx <= 8; dx++) for (let d = 30; d < 36; d++) {
    const hw = 8 - (35 - d) * 0.6;
    if (Math.abs(dx) > hw) continue;
    px(ctx, x + dx, y - d, d === 35 ? STONE[4] : Math.abs(dx) > hw - 1.5 ? STONE[1] : STONE[2]);
  }
  px(ctx, x - 6, y - 36, STONE[0], 13, 1);
}
/** 火盆里的青色冷焰（大），t 变化就跳 */
function torchFlame(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  glowAt(ctx, x, y - 10, 26, GLOW + '0.4)');
  for (let i = 0; i < 26; i++) {
    const ph = (t * 1.5 + phash(i, 1, 17) + x * 0.01) % 1;
    const fx = x + Math.sin(ph * 8 + i * 1.7) * (5 - ph * 4.5);
    const fy = y - 1 - ph * 24;
    const w = ph < 0.35 ? 2 : 1;
    px(ctx, fx - (w - 1) / 2, fy, ph < 0.25 ? '#ffffff' : ph < 0.55 ? ICE[4] : ph < 0.8 ? ICE[2] : 'rgba(110,150,255,0.6)', w, w);
  }
  for (let dx = -6; dx <= 6; dx++) px(ctx, x + dx, y, Math.abs(dx) > 4 ? ICE[2] : '#ffffff');
}

/** 门洞里的空间漩涡：六条往里卷的光臂、几圈收缩的光环、几道闪电丝；power 越大中心越亮 */
export function drawWinterSwirl(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, t: number, power: number) {
  for (const [k, col] of [[1, '#0c1c3a'], [0.92, '#07122c'], [0.7, '#040b20']] as [number, string][]) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * k, ry * k, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // 收缩的光环
  for (let k = 0; k < 4; k++) {
    const ph = 1 - ((t * 0.45 + k / 4) % 1);
    const a = (0.15 + (1 - ph) * 0.35).toFixed(2);
    for (let i = 0; i < 110; i++) {
      const ang = (i / 110) * Math.PI * 2;
      px(ctx, cx + Math.cos(ang) * rx * ph, cy + Math.sin(ang) * ry * ph, ph > 0.5 ? `rgba(90,140,255,${a})` : `rgba(150,230,255,${a})`);
    }
  }
  // 光臂
  for (let arm = 0; arm < 6; arm++) {
    for (let i = 0; i < 110; i++) {
      const s = i / 110;
      const a = s * Math.PI * 3.6 + (arm * Math.PI * 2) / 6 - t * 2.6;
      const r = 0.05 + s * 0.95;
      const dx = Math.cos(a) * rx * r, dy = Math.sin(a) * ry * r;
      const col = s < 0.2 ? '#ffffff' : s < 0.5 ? ICE[4] : s < 0.78 ? ICE[2] : 'rgba(110,110,255,0.75)';
      const w = s < 0.45 ? 2 : 1;
      px(ctx, cx + dx, cy + dy, col, w, w);
    }
  }
  // 闪电丝：从中心劈向边缘，每 0.25 秒换一条
  const seg = Math.floor(t * 4);
  for (let b = 0; b < 2; b++) {
    const ang = phash(seg, b, 23) * Math.PI * 2;
    let x = cx, y = cy;
    const n = 10;
    for (let i = 0; i < n; i++) {
      const nx = cx + Math.cos(ang) * rx * 0.9 * ((i + 1) / n) + (phash(seg, i + b * 20, 24) - 0.5) * 8;
      const ny = cy + Math.sin(ang) * ry * 0.9 * ((i + 1) / n) + (phash(seg, i + b * 20, 25) - 0.5) * 8;
      const steps = Math.max(Math.abs(nx - x), Math.abs(ny - y));
      for (let s = 0; s <= steps; s++) px(ctx, x + ((nx - x) * s) / steps, y + ((ny - y) * s) / steps, i < 3 ? '#ffffff' : 'rgba(190,240,255,0.8)');
      x = nx; y = ny;
    }
  }
  // 中心的白光
  glowAt(ctx, cx, cy, 12 + power * 18, `rgba(230,250,255,${(0.55 + power * 0.45).toFixed(2)})`);
  const cr = 3.5 + power * 3.5;
  for (let dy = -cr; dy <= cr; dy++) for (let dx = -cr * 1.3; dx <= cr * 1.3; dx++) if ((dx / 1.3) ** 2 + dy * dy <= cr * cr) px(ctx, cx + dx, cy + dy, '#ffffff');
  // 飘出门洞的碎光
  for (let k = 0; k < 16; k++) {
    const ph = (t * 0.5 + phash(k, 1, 51)) % 1;
    const ang = phash(k, 2, 51) * Math.PI * 2;
    const r = 4 + ph * 70;
    px(ctx, cx + Math.cos(ang) * r, cy + Math.sin(ang) * r * 0.8, ph < 0.4 ? ICE[4] : ICE[2]);
  }
}

/** 整座门不会动的部分（不含漩涡；火焰、符文呼吸、石像眼睛、台上符文环在 gateAnim 里另画） */
function gateStatic(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // 门后泄出的大片青光
  glowAt(ctx, x, y - WPORTAL_EYE, 110, GLOW + '0.22)');
  // 三级石阶
  for (let s = 0; s < 3; s++) {
    const hw = 106 - s * 10, top = y - s * 4 - 4;
    for (let dx = -hw; dx <= hw; dx++) for (let d = 0; d < 4; d++) {
      const edge = Math.abs(dx) > hw - 2;
      px(ctx, x + dx, top + d, d === 0 ? (phash(dx, s, 11) < 0.7 ? SNOW[4] : SNOW[3]) : edge ? STONE[0] : d === 1 ? STONE[2] : STONE[1]);
    }
  }
  const platY = y - 12;
  const top = platY - PILLAR_H;
  // 两根巨柱
  for (const sg of [-1, 1]) {
    const cx = x + sg * PILLAR_X;
    // 柱础（两层）
    for (let dx = -14; dx <= 14; dx++) for (let d = 0; d < 5; d++) px(ctx, cx + dx, platY - d, d === 4 ? STONE[3] : Math.abs(dx) > 12 ? STONE[0] : STONE[1]);
    for (let dx = -12; dx <= 12; dx++) for (let d = 5; d < 9; d++) px(ctx, cx + dx, platY - d, d === 8 ? STONE[4] : Math.abs(dx) > 10 ? STONE[0] : STONE[2]);
    // 柱身：冰石，左暗右亮
    glacier(ctx, cx - 10, cx + 11, platY - 9, () => PILLAR_H - 16, 41 + sg);
    for (let yy = top + 8; yy < platY - 9; yy++) {
      px(ctx, cx - 10, yy, STONE[0]);
      px(ctx, cx + 10, yy, STONE[3]);
    }
    // 符文带（两道）的框
    for (const band of [platY - 36, platY - 76]) {
      for (let dx = -10; dx <= 10; dx++) px(ctx, cx + dx, band - 1, STONE[0], 1, 8);
      for (let dx = -10; dx <= 10; dx++) { px(ctx, cx + dx, band - 2, STONE[3]); px(ctx, cx + dx, band + 7, STONE[3]); }
    }
    // 柱头（往外张开）
    for (let d = 0; d < 9; d++) {
      const hw = 11 + d * 0.5;
      for (let dx = -hw; dx <= hw; dx++) px(ctx, cx + dx, top + d, d === 0 ? SNOW[4] : d < 3 ? STONE[4] : Math.abs(dx) > hw - 2 ? STONE[0] : STONE[2]);
    }
    // 石像站在柱子前方外侧、火炬柱在最外侧
    knight(ctx, x + sg * 76, y - 4);
    torchStand(ctx, x + sg * 98, y - 2);
  }
  // 尖拱：三层（石、冰、白边），搭在两根柱头上
  const capY = top;
  const APEX = capY - 54;
  const inner = (dx: number) => archY(dx, APEX + 20, INNER, capY - (APEX + 20));
  for (let dx = -SPAN; dx <= SPAN; dx++) {
    const yo = archY(dx, APEX, SPAN, capY - APEX);
    const yEnd = Math.abs(dx) <= INNER ? inner(dx) : capY + 3;
    for (let yy = yo; yy < yEnd; yy++) {
      const d = yy - yo;
      const toIn = yEnd - yy;
      let col: string;
      if (d < 1) col = '#ffffff';
      else if (d < 3) col = ICE[4];
      else if (d < 6) col = ICE[2];
      else if (d < 8) col = STONE[3];
      else if (Math.abs(dx) <= INNER && toIn < 2) col = ICE[4];
      else if (Math.abs(dx) <= INNER && toIn < 4) col = ICE[2];
      else col = phash(dx + 100, Math.round(yy), 15) < 0.08 ? STONE[0] : (dx + Math.round(yy)) % 9 === 0 ? STONE[0] : STONE[dx < 0 ? 1 : 2];
      px(ctx, x + dx, yy, col);
    }
  }
  // 拱面上一排符文槽（亮的符文在 gateAnim 里画）
  for (let i = -5; i <= 5; i++) {
    const dx = i * 11;
    const yo = archY(dx, APEX, SPAN, capY - APEX) + 11;
    px(ctx, x + dx - 1, yo - 1, STONE[0], 3, 5);
  }
  // 拱背的冰棱
  for (const [dx, h] of [[-16, 20], [16, 20], [-31, 16], [31, 16], [-46, 12], [46, 12], [-60, 9], [60, 9]]) {
    const base = archY(dx, APEX, SPAN, capY - APEX);
    const lean = dx / SPAN;
    for (let j = 0; j < h; j++) {
      const w = j < h * 0.4 ? 3 : j < h * 0.75 ? 2 : 1;
      px(ctx, x + dx + lean * j * 0.7 - (w - 1) / 2, base - j, j === h - 1 ? '#ffffff' : j > h * 0.6 ? ICE[4] : ICE[3], w, 1);
    }
  }
  // 拱顶悬着的钥石冰晶
  const ky = APEX - 11;
  glowAt(ctx, x, ky, 20, GLOW + '0.5)');
  for (let d = -10; d <= 10; d++) {
    const hw = 5.5 * (1 - Math.abs(d) / 10);
    for (let dx = -hw; dx <= hw; dx++) px(ctx, x + dx, ky + d, dx < -hw * 0.3 ? '#ffffff' : dx < hw * 0.3 ? ICE[4] : ICE[2]);
  }
  for (let j = 0; j < 4; j++) px(ctx, x, APEX + 1 + j, ICE[3]);
  // 门洞内沿垂下来的冰链
  for (const dx of [-26, 26]) {
    const y0 = inner(dx);
    for (let j = 0; j < 16; j++) px(ctx, x + dx + (j % 2 ? 1 : 0), y0 + j, j % 2 ? ICE[3] : ICE[1]);
    px(ctx, x + dx - 1, y0 + 16, ICE[4], 3, 2);
  }
}

/** 门上会动的部分：台上的符文环、柱子符文带和拱面符文的呼吸、火炬青焰、石像兜帽里的眼睛 */
function gateAnim(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  const platY = y - 12;
  const top = platY - PILLAR_H;
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const gx = x + Math.cos(a) * 54, gy = platY - 1 + Math.sin(a) * 5;
    const lit = (Math.sin(t * 1.5 + i * 0.6) + 1) / 2;
    px(ctx, gx, gy, `rgba(120,230,255,${(0.35 + lit * 0.6).toFixed(2)})`);
    if (i % 9 === 0) px(ctx, gx, gy - 1, ICE[4]);
  }
  for (const sg of [-1, 1]) {
    const cx = x + sg * PILLAR_X;
    for (const band of [platY - 36, platY - 76]) {
      for (let r = 0; r < 4; r++) {
        const rx = cx - 8 + r * 5;
        const lit = 0.5 + Math.sin(t * 1.8 + r + sg) * 0.5;
        const col = `rgba(140,240,255,${(0.45 + lit * 0.55).toFixed(2)})`;
        const g = Math.floor(phash(r, sg + 2, 13) * 4);
        px(ctx, rx, band, col, 1, 5);
        if (g === 0) { px(ctx, rx + 1, band + 1, col); px(ctx, rx + 1, band + 3, col); }
        else if (g === 1) { px(ctx, rx + 1, band, col, 2, 1); px(ctx, rx + 1, band + 4, col, 2, 1); }
        else if (g === 2) { px(ctx, rx + 1, band + 2, col, 2, 1); px(ctx, rx + 2, band, col, 1, 5); }
        else { px(ctx, rx + 1, band + 1, col); px(ctx, rx + 2, band + 2, col); px(ctx, rx + 1, band + 3, col); }
      }
      glowAt(ctx, cx, band + 2, 13, GLOW + '0.25)');
    }
    torchFlame(ctx, x + sg * 98, y - 2 - 36, t);
    const kx = x + sg * 76, ky = y - 4 - 9 - 33;
    const blink = 0.6 + Math.sin(t * 2.3 + sg) * 0.4;
    px(ctx, kx - 2, ky, `rgba(140,240,255,${blink.toFixed(2)})`);
    px(ctx, kx + 1, ky, `rgba(140,240,255,${blink.toFixed(2)})`);
  }
  const APEX = top - 54;
  for (let i = -5; i <= 5; i++) {
    const dx = i * 11;
    const yo = archY(dx, APEX, SPAN, top - APEX) + 11;
    const lit = 0.4 + (Math.sin(t * 2 - i * 0.7) + 1) * 0.3;
    px(ctx, x + dx, yo, `rgba(140,240,255,${lit.toFixed(2)})`, 1, 3);
    if (i % 2 === 0) px(ctx, x + dx - 1, yo + 1, `rgba(140,240,255,${(lit * 0.8).toFixed(2)})`, 3, 1);
  }
}
let gateCache: HTMLCanvasElement | null = null;
/** 不会动的门画一次存起来 */
function gateImage() {
  if (!gateCache) {
    const o = canvas(WPORTAL_W, WPORTAL_H);
    gateStatic(o.ctx, WPORTAL_W / 2, WPORTAL_FOOT);
    gateCache = o.c;
  }
  return gateCache;
}

let dissolveCache: Float32Array | null = null;
/** 每个像素碎掉的先后（从上往下碎，再加杂点），算一次存起来 */
function dissolveMap() {
  if (!dissolveCache) {
    dissolveCache = new Float32Array(WPORTAL_W * WPORTAL_H);
    for (let yy = 0; yy < WPORTAL_H; yy++) for (let xx = 0; xx < WPORTAL_W; xx++) dissolveCache[yy * WPORTAL_W + xx] = phash(xx, yy, 7) * 0.7 + (1 - yy / WPORTAL_H) * 0.3;
  }
  return dissolveCache;
}
let portalTmp: { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null = null;
/** 画整座带动画的传送门：x 门中线、y 门脚。power 0-1 中心有多亮；dissolve 0-1 把门按杂点抠掉（正在碎掉） */
export function drawWinterPortal(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, power = 0, dissolve = 0) {
  portalTmp ??= canvas(WPORTAL_W, WPORTAL_H);
  const c = portalTmp.ctx;
  c.clearRect(0, 0, WPORTAL_W, WPORTAL_H);
  const ox = WPORTAL_W / 2, oy = WPORTAL_FOOT;
  drawWinterSwirl(c, ox, oy - WPORTAL_EYE, WPORTAL_RX, WPORTAL_RY, t, power);
  c.drawImage(gateImage(), 0, 0);
  gateAnim(c, ox, oy, t);
  if (dissolve > 0) {
    const th = dissolveMap();
    const img = c.getImageData(0, 0, WPORTAL_W, WPORTAL_H);
    const d = img.data;
    for (let j = 0, i = 0; j < th.length; j++, i += 4) {
      if (d[i + 3] === 0) continue;
      if (th[j] < dissolve) d[i + 3] = 0;
      else if (th[j] < dissolve + 0.12) { d[i] = 220; d[i + 1] = 245; d[i + 2] = 255; }
    }
    c.putImageData(img, 0, 0);
  }
  ctx.drawImage(portalTmp.c, x - ox, y - oy);
}

/** 地图用：静态的门（门洞透明），k 为缩放 */
export function paintWinterPortal(k = 0.6): HTMLCanvasElement {
  const full = canvas(WPORTAL_W, WPORTAL_H);
  full.ctx.drawImage(gateImage(), 0, 0);
  gateAnim(full.ctx, WPORTAL_W / 2, WPORTAL_FOOT, 0.4);
  const out = canvas(Math.round(WPORTAL_W * k), Math.round(WPORTAL_H * k));
  out.ctx.imageSmoothingEnabled = false;
  out.ctx.drawImage(full.c, 0, 0, out.c.width, out.c.height);
  return out.c;
}
/** 地图用：门洞里的漩涡（正圆，放在门后自己转），k 跟 paintWinterPortal 一致 */
export function paintWinterPortalSwirl(k = 0.6): HTMLCanvasElement {
  const r = WPORTAL_RY;
  const full = canvas(r * 2 + 2, r * 2 + 2);
  drawWinterSwirl(full.ctx, r + 1, r + 1, r, r, 0.3, 0.6);
  const out = canvas(Math.round(full.c.width * k), Math.round(full.c.height * k));
  out.ctx.imageSmoothingEnabled = false;
  out.ctx.drawImage(full.c, 0, 0, out.c.width, out.c.height);
  return out.c;
}
