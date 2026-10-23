import { mix, phash, Pix } from './pix';

/*
 * 8848 外圈的四条新材料线（晶石、香料、树脂、羽毛，用户 10-23）：每一阶都是不同的东西，
 * 所以每阶单独画一个造型，不是同一张图换颜色。背包图标 16×16，地图上的资源物件另画。
 */

export type MatKind = 'crystal' | 'spice' | 'resin' | 'feather';
export const MAT_KINDS: MatKind[] = ['crystal', 'spice', 'resin', 'feather'];

/** 竖直的晶柱：底宽 2hw，尖顶在 top；左亮右暗，中线一道高光 */
function prism(p: Pix, cx: number, top: number, bottom: number, hw: number, pal: string[], tilt = 0) {
  for (let y = top; y <= bottom; y++) {
    const t = Math.min(1, (y - top) / Math.max(1, hw * 1.4));
    const half = Math.max(0.5, hw * t);
    const ox = tilt * (bottom - y);
    for (let x = Math.round(cx + ox - half); x <= Math.round(cx + ox + half); x++) {
      const s = x - (cx + ox);
      p.set(x, y, s < -0.6 ? pal[2] : s > 0.6 ? pal[0] : pal[1]);
    }
  }
  p.set(cx + tilt * (bottom - top), top, pal[3]);
}

function crystalIcon(p: Pix, t: number) {
  switch (t) {
    case 0: { // 石英：一簇透明白晶柱
      const pal = ['#a8b0b8', '#dce4ec', '#ffffff', '#ffffff'];
      p.blob(7.5, 13, 6, 2, ['#4a4a4e', '#6e6e72', '#94949a', '#b8b8bc'], 3);
      prism(p, 5, 4, 13, 1.8, pal, -0.15);
      prism(p, 8, 1, 13, 2.2, pal);
      prism(p, 11, 5, 13, 1.6, pal, 0.18);
      break;
    }
    case 1: { // 紫晶：剖开的晶洞，外面是石壳，里面一圈紫色晶牙
      p.blob(7.5, 8.5, 7, 6.5, ['#4a3e38', '#6a5a50', '#8a786c', '#a8968a'], 5);
      p.blob(7.5, 8.5, 5, 4.5, ['#3a1a5a', '#5a2a8a', '#8a4ac8', '#c8a0ff'], 6);
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        p.set(7.5 + Math.cos(a) * 4, 8.5 + Math.sin(a) * 3.6, k % 2 ? '#e0c8ff' : '#a070e0');
      }
      p.blob(7.5, 8.5, 2, 1.6, ['#1a0a2a', '#2a1440', '#3a1e58', '#5a2a8a'], 7);
      break;
    }
    case 2: { // 黄晶：一颗双尖的长晶体，斜放
      const pal = ['#a07010', '#e0b030', '#fff070', '#ffffff'];
      for (let i = 0; i < 12; i++) {
        const x = 2 + i;
        const y = 13 - i;
        const w = i < 3 ? i : i > 8 ? 11 - i : 2.5;
        for (let k = -w; k <= w; k++) p.set(x + k * 0.5, y + k * 0.5, k < -0.5 ? pal[2] : k > 0.5 ? pal[0] : pal[1]);
      }
      p.set(13, 2, pal[3]);
      p.set(7, 8, pal[3]);
      break;
    }
    case 3: { // 碧玉：打磨过的圆润卵石，一道道带状纹
      p.blob(7.5, 8.5, 6.5, 5.5, ['#1e5a3a', '#2e7a4e', '#4aa068', '#8ad0a0'], 9);
      for (let x = 1; x < 15; x++) {
        p.paint(x, 6 + Math.sin(x * 0.7) * 1.2, '#1a4a30');
        p.paint(x, 10 + Math.sin(x * 0.7 + 1) * 1.2, '#a8e0b8');
      }
      p.set(4, 5, '#ffffff');
      break;
    }
    case 4: { // 蓝晶：扁平的刀片状晶体，几片交叉
      const pal = ['#1a4a8a', '#3a7ad0', '#8ac0ff', '#ffffff'];
      for (const [x0, y0, x1, y1] of [[2, 13, 9, 2], [6, 14, 13, 4], [4, 14, 6, 6]]) {
        p.line(x0, y0, x1, y1, pal[1]);
        p.line(x0 + 1, y0, x1 + 1, y1, pal[0]);
        p.line(x0 - 1, y0, x1 - 1, y1, pal[2]);
        p.set(x1, y1, pal[3]);
      }
      break;
    }
    case 5: { // 星辉晶：八角星形，中心发亮
      const pal = ['#5a4a9a', '#8a7ae0', '#d0c8ff', '#ffffff'];
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const r = k % 2 ? 4 : 7;
        for (let d = 0; d <= r; d++) p.set(7.5 + Math.cos(a) * d, 7.5 + Math.sin(a) * d, d < 2 ? pal[3] : d < r * 0.6 ? pal[2] : pal[1]);
      }
      p.blob(7.5, 7.5, 2.5, 2.5, [pal[1], pal[2], pal[3], pal[3]], 11);
      p.set(2, 2, '#ffffff');
      p.set(13, 12, '#ffffff');
      break;
    }
    case 6: { // 日耀晶：橙红的八面体，四周放射光芒
      const pal = ['#a83a10', '#ff7a2a', '#ffc860', '#fff8d0'];
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2 + 0.4;
        p.set(7.5 + Math.cos(ang) * 7, 7.5 + Math.sin(ang) * 7, '#ffd870');
      }
      for (let y = 2; y <= 13; y++) {
        const half = y <= 7 ? (y - 2) * 0.9 : (13 - y) * 0.9;
        for (let x = Math.round(7.5 - half); x <= Math.round(7.5 + half); x++) {
          const upper = y <= 7;
          p.set(x, y, x < 7.5 ? (upper ? pal[3] : pal[1]) : upper ? pal[2] : pal[0]);
        }
      }
      break;
    }
    default: { // 虚空晶：悬空的黑紫碎片，中间一个吞光的黑核，下面一圈紫雾
      const pal = ['#1a0a2a', '#3a1a5a', '#7a3ad0', '#e0b0ff'];
      p.blob(7.5, 14, 5, 1.2, ['#2a0a4a', '#4a1a7a', '#6a2aa0', '#8a4ac0'], 13);
      for (const [cx, top, bot, hw] of [[7.5, 1, 11, 3], [3.5, 5, 10, 1.4], [11.5, 4, 9, 1.4]] as const) {
        for (let y = top; y <= bot; y++) {
          const half = y < (top + bot) / 2 ? (y - top) * (hw / ((bot - top) / 2)) : (bot - y) * (hw / ((bot - top) / 2));
          for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) p.set(x, y, x < cx ? pal[2] : pal[1]);
        }
        p.set(cx, top, pal[3]);
      }
      p.rect(7, 5, 2, 3, '#000000');
      p.set(6, 4, pal[3]);
    }
  }
}

function spiceIcon(p: Pix, t: number) {
  switch (t) {
    case 0: { // 薄荷叶：两片带锯齿的嫩叶
      const L = ['#2a6a2a', '#3e9a3a', '#6ac860', '#b0f0a0'];
      p.blob(5, 7, 4, 5, L, 21);
      p.blob(10.5, 9, 4, 4.5, L, 22);
      p.line(5, 12, 5, 3, L[0]);
      p.line(10, 13, 11, 5, L[0]);
      for (let y = 3; y < 13; y += 2) { p.paint(1, y, L[0]); p.paint(14, y + 1, L[0]); }
      p.line(5, 13, 8, 15, '#5a3a22');
      break;
    }
    case 1: { // 野茴香：细羽状的伞形花序，顶上一把黄色小花
      p.line(7, 15, 7, 6, '#4a7a2a');
      for (let k = -3; k <= 3; k++) p.line(7, 6, 7 + k * 2, 2 + Math.abs(k) * 0.4, '#6a9a3a');
      for (let k = -3; k <= 3; k++) { p.set(7 + k * 2, 2 + Math.abs(k) * 0.4, '#f0e050'); p.set(7 + k * 2, 1 + Math.abs(k) * 0.4, '#d8c030'); }
      for (const y of [9, 12]) { p.line(7, y, 3, y - 2, '#8ac050'); p.line(7, y, 11, y - 2, '#8ac050'); }
      break;
    }
    case 2: { // 肉桂皮：两卷卷起的树皮
      for (const [x, y] of [[2, 4], [5, 8]]) {
        for (let i = 0; i < 10; i++) {
          p.set(x + i, y + i * 0.3, '#8a4a22');
          p.set(x + i, y + 1 + i * 0.3, '#b0642e');
          p.set(x + i, y + 2 + i * 0.3, '#c87a3a');
          p.set(x + i, y + 3 + i * 0.3, '#7a3e1a');
        }
        p.set(x + 10, y + 3 + 1, '#5a2a10');
        p.set(x + 10, y + 1 + 3, '#e0a060');
      }
      break;
    }
    case 3: { // 丁香：一把钉子形的花蕾，圆头长柄
      for (let k = 0; k < 4; k++) {
        const x = 3 + k * 3;
        const y = 4 + (k % 2) * 2;
        p.line(x, y + 2, x + (k - 1.5) * 0.6, y + 9, '#5a2a1a');
        p.blob(x, y, 1.6, 1.6, ['#3a1a10', '#6a3420', '#8a4a2a', '#b06a3a'], 30 + k);
      }
      break;
    }
    case 4: { // 豆蔻：三颗绿色的纺锤形豆荚
      const G = ['#4a6a2a', '#6a9a3a', '#8ac050', '#c8e890'];
      p.blob(5, 9, 2.5, 4.5, G, 41);
      p.blob(10, 8, 2.5, 4.5, G, 42);
      p.blob(7.5, 11, 4.5, 2.2, G, 43);
      for (const [x, y] of [[5, 5], [10, 4], [12, 11]]) p.set(x, y, '#3a4a1a');
      break;
    }
    case 5: { // 藏红花：紫色花瓣托着三根红色柱头
      p.blob(7.5, 11, 5, 3, ['#4a1a6a', '#7a3aa0', '#a868d0', '#d8b0f0'], 51);
      for (const dx of [-2, 0, 2]) {
        p.line(7.5, 10, 7.5 + dx * 1.6, 2, '#c02a1a');
        p.set(7.5 + dx * 1.6, 2, '#ff6a3a');
      }
      p.line(7, 13, 7, 15, '#4a7a2a');
      break;
    }
    case 6: { // 雪域花椒：一枝结满红色花椒粒，上面落着雪
      p.line(2, 14, 13, 3, '#5a3a22');
      for (let k = 0; k < 9; k++) {
        const x = 3 + k * 1.2 + (k % 2 ? 1.5 : -1.5);
        const y = 13 - k * 1.1;
        p.blob(x, y, 1.3, 1.3, ['#6a0a0a', '#a01a1a', '#e03a2a', '#ff8a6a'], 60 + k);
      }
      for (let k = 0; k < 5; k++) p.set(3 + k * 2.4, 11 - k * 2.2, '#ffffff');
      break;
    }
    default: { // 虚空星椒：发光的紫色八角，星芒形
      const pal = ['#2a0a4a', '#5a2a8a', '#9a5ad8', '#f0d0ff'];
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        p.blob(7.5 + Math.cos(a) * 4, 7.5 + Math.sin(a) * 4, 2, 1.4, pal, 70 + k);
        p.set(7.5 + Math.cos(a) * 4.5, 7.5 + Math.sin(a) * 4.5, pal[3]);
      }
      p.blob(7.5, 7.5, 2, 2, ['#1a0a2a', '#000000', '#3a1a5a', '#ffffff'], 79);
    }
  }
}

/** 一滴水滴形 */
function drop(p: Pix, cx: number, top: number, r: number, pal: string[]) {
  for (let y = top; y <= top + r * 3; y++) {
    const q = (y - top) / (r * 3);
    const half = q < 0.55 ? q / 0.55 * r * 0.85 : Math.sqrt(Math.max(0, 1 - ((q - 0.67) / 0.33) ** 2)) * r;
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
      const s = (x - cx) / (half + 0.5);
      p.set(x, y, s < -0.3 && q > 0.4 ? pal[2] : s > 0.4 ? pal[0] : pal[1]);
    }
  }
  p.set(cx - r * 0.4, top + r * 1.9, pal[3]);
}

function resinIcon(p: Pix, t: number) {
  switch (t) {
    case 0: // 松脂：一团不规则的琥珀色块，贴在一小片树皮上
      p.rect(2, 10, 12, 4, '#5a3a22');
      p.rect(2, 10, 12, 1, '#7a5232');
      p.blob(7.5, 8, 5, 3.5, ['#a0601a', '#d08a2a', '#f0b850', '#fff0b0'], 81);
      drop(p, 10, 9, 1.4, ['#a0601a', '#d08a2a', '#f0b850', '#fff0b0']);
      break;
    case 1: // 桦胶：卷成小碗的白桦皮，里面盛着乳白的胶
      for (let x = 2; x <= 13; x++) {
        const d = Math.abs(x - 7.5) / 5.5;
        const bot = 13 - Math.round(d * d * 3);
        for (let y = 8; y <= bot; y++) p.set(x, y, y === bot || x === 2 || x === 13 ? '#a8a49a' : (x + y) % 4 ? '#e8e4d8' : '#2a2a2a');
      }
      p.blob(7.5, 8, 5, 1.5, ['#c8c0a0', '#e8e0c4', '#f8f2dc', '#ffffff'], 82);
      break;
    case 2: // 枫脂：小玻璃瓶装着红褐色的枫糖浆，挂一片枫叶签
      p.rect(5, 1, 6, 2, '#8a5a30');
      p.rect(6, 3, 4, 2, '#c8dce8');
      for (let y = 5; y < 15; y++) for (let x = 3; x < 13; x++) {
        const edge = x === 3 || x === 12 || y === 14;
        p.set(x, y, edge ? '#a8c0d0' : y < 7 ? '#d8eaf4' : x < 6 ? '#e07a3a' : '#b04a1a');
      }
      p.set(5, 8, '#ffd0a0');
      p.blob(12, 6, 2, 2, ['#8a1a10', '#c03a1a', '#e85a2a', '#ff9a60'], 83);
      break;
    case 3: { // 琥珀脂：打磨过的蜜色宝石，里面封着一只小虫
      p.blob(7.5, 8, 6, 6, ['#9a5a10', '#d08a20', '#f0b440', '#fff0a0'], 84);
      p.set(7, 8, '#2a1a10');
      p.set(8, 8, '#2a1a10');
      p.set(6, 7, '#5a3a20');
      p.set(9, 7, '#5a3a20');
      p.set(9, 9, '#5a3a20');
      p.set(4, 4, '#ffffff');
      break;
    }
    case 4: // 龙血脂：三滴暗红发亮的树脂
      drop(p, 4.5, 2, 2, ['#4a0808', '#8a1414', '#c82a2a', '#ff8080']);
      drop(p, 10.5, 0, 2.4, ['#4a0808', '#8a1414', '#c82a2a', '#ff8080']);
      drop(p, 8, 7, 2, ['#4a0808', '#8a1414', '#c82a2a', '#ff8080']);
      break;
    case 5: { // 烈阳脂：一块晶状的橙色树脂，里面有火苗一样的纹路
      for (let y = 3; y < 14; y++) for (let x = 2; x < 14; x++) {
        const d = Math.abs(x - 7.5) + Math.abs(y - 8.5) * 1.1;
        if (d > 6.5) continue;
        p.set(x, y, d > 5.5 ? '#a83a0a' : y < 7 ? '#ffd870' : '#ff8a2a');
      }
      for (let k = 0; k < 4; k++) p.line(5 + k * 2, 12, 6 + k * 2 + (k % 2 ? 1 : -1), 6, '#fff4b0');
      break;
    }
    case 6: // 霜华脂：冰柱一样往下挂的淡蓝树脂，表面结霜
      p.rect(1, 1, 14, 2, '#6a8aa0');
      for (const [x, len] of [[3, 8], [6, 12], [9, 9], [12, 6]] as const) {
        for (let y = 3; y < 3 + len; y++) {
          const half = (1 - (y - 3) / len) * 1.6;
          for (let k = Math.round(x - half); k <= Math.round(x + half); k++) p.set(k, y, k < x ? '#e0f4ff' : '#9ad0f0');
        }
      }
      for (let k = 0; k < 6; k++) p.paint(2 + k * 2.2, 4 + (k % 3) * 2, '#ffffff');
      break;
    default: { // 白玉脂：一颗温润的白玉珠，托在小小的金座上
      p.rect(4, 12, 8, 2, '#c8a040');
      p.rect(5, 11, 6, 1, '#f0d070');
      p.blob(7.5, 7, 5, 5, ['#c8c4b0', '#e8e4d4', '#f8f6ec', '#ffffff'], 88);
      p.paint(9, 9, mix('#e8e4d4', '#a8d8b8', 0.4));
      p.paint(10, 8, mix('#e8e4d4', '#a8d8b8', 0.4));
    }
  }
}

/** 一根羽毛：沿着弧线画羽轴，两边是羽片 */
function featherShape(p: Pix, x0: number, y0: number, x1: number, y1: number, width: number, col: (q: number, side: number) => string, shaft = '#e8e0d0') {
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const q = i / n;
    const x = x0 + (x1 - x0) * q + Math.sin(q * Math.PI) * 1.5;
    const y = y0 + (y1 - y0) * q;
    const w = width * Math.sin(Math.min(1, q * 1.15) * Math.PI) * (q < 0.12 ? 0 : 1);
    for (let k = 1; k <= w; k++) {
      p.set(x - k, y + k * 0.3, col(q, -k / w));
      p.set(x + k, y + k * 0.3, col(q, k / w));
    }
    p.set(x, y, shaft);
  }
}

function featherIcon(p: Pix, t: number) {
  switch (t) {
    case 0: // 雀羽：一根小小的褐色短羽
      featherShape(p, 5, 14, 10, 3, 2.5, (q, s) => (s < 0 ? '#a07a50' : q > 0.7 ? '#c8a070' : '#8a6038'), '#e0d0b0');
      break;
    case 1: // 鸦羽：黑色长羽，泛着蓝紫光泽
      featherShape(p, 4, 15, 11, 1, 3, (q, s) => (s < -0.5 ? '#3a3a5a' : s > 0.5 ? '#141420' : q > 0.5 ? '#2a2a40' : '#1e1e2a'), '#4a4a5a');
      break;
    case 2: // 鹰羽：褐白相间的横纹
      featherShape(p, 4, 15, 11, 1, 3.5, (q) => (Math.floor(q * 9) % 2 ? '#e8dcc0' : '#7a5232'), '#f0e8d8');
      break;
    case 3: // 鹤羽：洁白的大羽，羽尖一截黑
      featherShape(p, 3, 15, 12, 1, 3.5, (q, s) => (q > 0.78 ? '#1a1a1a' : s > 0.6 ? '#d0d4dc' : '#ffffff'), '#c8c8c8');
      break;
    case 4: { // 孔雀羽：细长羽杆，顶上一枚眼斑
      featherShape(p, 4, 15, 9, 5, 1.2, () => '#3a8a4a', '#8ac060');
      p.blob(10, 4, 3.5, 3.5, ['#1a6a5a', '#2aa08a', '#4ad0b0', '#a0f0d0'], 91);
      p.blob(10, 4.5, 2.2, 2, ['#c8a020', '#e8c840', '#f0e070', '#fff8a0'], 92);
      p.blob(10, 4.5, 1.2, 1.1, ['#0a1a5a', '#1a3a9a', '#2a5ad0', '#6a9aff'], 93);
      break;
    }
    case 5: { // 雷鸟羽：深蓝羽片上一道金色闪电纹
      featherShape(p, 4, 15, 11, 1, 3.5, (q, s) => (s > 0.4 ? '#1a2a6a' : '#3a5ab0'), '#f0f070');
      for (const [x, y] of [[9, 3], [8, 5], [10, 6], [8, 9], [9, 10]]) p.set(x, y, '#ffe040');
      break;
    }
    case 6: { // 冰凰羽：半透明的冰蓝长羽，末端凝成冰晶
      featherShape(p, 3, 15, 12, 2, 3.5, (q, s) => (s < -0.4 ? '#ffffff' : q > 0.6 ? '#c4ecff' : '#8ad0f0'), '#ffffff');
      for (const [x, y] of [[12, 1], [13, 2], [11, 1], [12, 0]]) p.set(x, y, '#ffffff');
      p.set(5, 12, '#e0f8ff');
      break;
    }
    default: { // 天凤羽：金红渐变的火羽，边缘飘着火星
      featherShape(p, 3, 15, 12, 1, 4, (q, s) => (q > 0.7 ? '#fff0a0' : q > 0.45 ? (s > 0.3 ? '#ff8a2a' : '#ffc040') : s > 0.3 ? '#c02a1a' : '#ff5a2a'), '#fff8d0');
      for (let k = 0; k < 4; k++) p.set(2 + phash(k, 1, 95) * 12, 1 + phash(k, 2, 95) * 8, '#ffe070');
    }
  }
}

const iconCache = new Map<string, string>();

/** 新材料的背包图标（16×16） */
export function matIconUrl(kind: MatKind, tier: number): string {
  const key = `${kind}${tier}`;
  const hit = iconCache.get(key);
  if (hit) return hit;
  const p = new Pix(16, 16);
  if (kind === 'crystal') crystalIcon(p, tier);
  if (kind === 'spice') spiceIcon(p, tier);
  if (kind === 'resin') resinIcon(p, tier);
  if (kind === 'feather') featherIcon(p, tier);
  const url = p.outline().canvas().toDataURL();
  iconCache.set(key, url);
  return url;
}

/**
 * 地图上的资源物件：晶石长在一块岩石上，香料是一丛灌木挂着果实，
 * 树脂是割了口的树桩下面接着小桶，羽毛是一个鸟窝里插着几根羽毛
 */
export function paintMatNode(kind: MatKind, t: number): HTMLCanvasElement {
  const p = new Pix(24, 22);
  const icon = new Pix(16, 16);
  if (kind === 'crystal') {
    p.blob(12, 17, 10, 4.5, ['#3a3a3e', '#5a5a5e', '#7a7a7e', '#9a9a9e'], 101 + t);
    crystalIcon(icon, t);
    stamp(p, icon, 4, 2);
  } else if (kind === 'spice') {
    p.blob(12, 15, 10, 6, ['#1e4a1e', '#2e6a2a', '#4a8a3a', '#6aaa4a'], 111 + t);
    spiceIcon(icon, t);
    stamp(p, icon, 4, 3, true);
  } else if (kind === 'resin') {
    // 树桩，侧面一道割口，下面接一个小木桶
    p.trunk(9, 4, 20, 8, ['#4a2e1a', '#6a4426', '#8a5c34']);
    p.blob(9, 4, 4, 1.5, ['#8a6a40', '#b08a58', '#c8a070', '#e0c090'], 121);
    p.line(8, 9, 11, 12, '#2a1a10');
    resinIcon(icon, t);
    stamp(p, icon, 9, 7, true, 0.6);
    p.rect(15, 15, 6, 6, '#7a5232');
    p.rect(15, 16, 6, 1, '#3a3a3e');
    p.rect(15, 19, 6, 1, '#3a3a3e');
  } else {
    // 鸟窝：一圈草枝编的碗
    p.blob(12, 17, 10, 4, ['#5a3a1a', '#7a5228', '#9a6e3a', '#b88a50'], 131);
    for (let k = 0; k < 12; k++) p.line(3 + k * 1.6, 15 + (k % 2), 5 + k * 1.6, 19 - (k % 2), '#4a2e14');
    p.blob(10, 15, 1.6, 1.3, ['#c8c0a8', '#e8e0c8', '#f4eedc', '#ffffff'], 132);
    p.blob(13, 15.5, 1.6, 1.3, ['#c8c0a8', '#e8e0c8', '#f4eedc', '#ffffff'], 133);
    featherIcon(icon, t);
    stamp(p, icon, 6, 0, true, 0.85);
  }
  return p.outline().canvas();
}

/** 把一张 16×16 的小图贴到大图上（可选缩小） */
function stamp(dst: Pix, src: Pix, ox: number, oy: number, keep = false, scale = 1) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const c = src.get(Math.floor(x / scale), Math.floor(y / scale));
    if (!c || (x >= 16 * scale || y >= 16 * scale)) continue;
    if (keep || dst.get(ox + x, oy + y) !== undefined) dst.set(ox + x, oy + y, c);
  }
}

/** 会发光的高阶新材料：[颜色, 半径] */
export function matGlow(kind: MatKind, t: number): [number, number] | null {
  if (kind === 'crystal' && t >= 4) return [[0x8ac0ff, 0xd0c8ff, 0xffa040, 0xb070ff][t - 4], 14];
  if (kind === 'feather' && t >= 5) return [[0xf0f070, 0xa8e0ff, 0xff8a2a][t - 5], 12];
  if (kind === 'resin' && t === 5) return [0xff8a2a, 10];
  if (kind === 'spice' && t === 7) return [0xb070ff, 10];
  return null;
}
