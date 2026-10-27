import { hash, type BuildingKind, type PropKind } from './world';
import type { TownTheme } from '../core/towns';
import { Pix, mix, phash } from './pix';

/*
 * 程序画的像素装饰物和建筑：先在一个颜色数组上画形状，最后统一描一圈深色描边，
 * 这样所有东西都有一致的「描边像素画」观感。正式美术到位后替换成 sprite sheet 即可。
 */

const BARK = ['#4a2e1a', '#6a4426', '#8a5c34'];
const LEAF = ['#2a5a26', '#3c7a32', '#58a040', '#7cc456'];

function tree(w: number, h: number, leaf: string[], bark = BARK, seed = 0) {
  const p = new Pix(w, h);
  const cx = w / 2 - 0.5;
  p.trunk(cx, h - 9, h - 2, 3, bark);
  p.set(cx - 2, h - 2, bark[1]);
  p.set(cx + 2, h - 2, bark[0]);
  p.blob(cx - 3, h - 13, 5, 4.5, leaf, seed + 1);
  p.blob(cx + 3, h - 13, 5, 4.5, leaf, seed + 2);
  p.blob(cx, h - 17, 6.5, 5.5, leaf, seed + 3);
  return p.outline();
}

function pine(snow: boolean) {
  const w = 16;
  const h = 26;
  const p = new Pix(w, h);
  p.trunk(7.5, 20, 24, 2, BARK);
  const pal = ['#1e4a2e', '#2a6038', '#3a7a46', '#4e9658'];
  for (let t = 0; t < 4; t++) {
    const top = 1 + t * 5;
    const half = 2.5 + t * 1.4;
    for (let y = 0; y < 7; y++) {
      const hw = (half * (y + 1)) / 7;
      for (let x = Math.round(7.5 - hw); x <= Math.round(7.5 + hw); x++) {
        const s = (7.5 - x) / (hw + 0.5) - y / 7;
        let c = s > 0.3 ? pal[2] : s > -0.3 ? pal[1] : pal[0];
        if (y === 0 && hash(x, t, 3) < 0.6) c = pal[3];
        if (snow && y < 2 + (hash(x, t) < 0.5 ? 1 : 0)) c = y === 0 ? '#ffffff' : '#dfe8f2';
        p.set(x, top + y, c);
      }
    }
  }
  return p.outline();
}

function redwood() {
  const p = new Pix(18, 36);
  p.trunk(8.5, 14, 34, 4, ['#5a2418', '#8a3a26', '#b05a3a']);
  p.set(5, 34, '#8a3a26');
  p.set(12, 34, '#5a2418');
  const pal = ['#1a3e26', '#245030', '#32663c', '#4a8048'];
  p.blob(8.5, 20, 6, 3, pal, 7);
  p.blob(8.5, 13, 7, 4, pal, 8);
  p.blob(8.5, 6, 5, 4, pal, 9);
  return p.outline();
}

function giant() {
  const p = new Pix(46, 60);
  const bark = ['#4a2818', '#6e3c22', '#94583a'];
  // 粗大的树干和根
  p.trunk(22.5, 30, 57, 10, bark);
  for (let i = 0; i < 6; i++) {
    p.line(22 - i, 52 + i * 0.6, 12 - i, 58, bark[i % 2]);
    p.line(23 + i, 52 + i * 0.6, 34 + i, 58, bark[(i + 1) % 2]);
  }
  p.rect(20, 40, 3, 6, '#2a160c');
  const pal = ['#1c4426', '#28582e', '#3a7038', '#5a9448'];
  p.blob(12, 28, 10, 8, pal, 21);
  p.blob(34, 27, 10, 8, pal, 22);
  p.blob(22, 18, 15, 11, pal, 23);
  p.blob(14, 12, 8, 6, pal, 24);
  p.blob(31, 10, 8, 6, pal, 25);
  return p.outline();
}

function deadtree(bark = ['#3a3028', '#55473a', '#6e5e4e']) {
  const p = new Pix(16, 22);
  p.trunk(7.5, 8, 20, 2, bark);
  p.line(8, 12, 13, 6, bark[1]);
  p.line(12, 8, 14, 3, bark[1]);
  p.line(7, 10, 2, 4, bark[2]);
  p.line(4, 6, 3, 2, bark[2]);
  p.line(8, 8, 8, 1, bark[1]);
  return p.outline();
}

function palm() {
  const p = new Pix(20, 28);
  for (let y = 10; y < 27; y++) {
    const x = 9 + Math.sin((y - 10) / 7) * 2;
    p.set(x, y, y % 3 ? '#9a7044' : '#6a4a2a');
    p.set(x + 1, y, '#7a5432');
  }
  const leaf = ['#2e6a2a', '#43903a', '#62b04a'];
  for (const [dx, dy] of [[-8, 3], [8, 3], [-6, -3], [6, -3], [0, -6], [-9, 7], [9, 7]]) {
    const n = 10;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = 10 + dx * t;
      const y = 9 + dy * t + t * t * 4;
      p.set(x, y, leaf[i % 3]);
      p.set(x, y + 1, leaf[0]);
    }
  }
  p.blob(10, 9, 2, 1.5, ['#5a3a1a', '#7a5028', '#9a6a3a', '#b08048']);
  return p.outline();
}

function cactus() {
  const p = new Pix(12, 18);
  const pal = ['#2e5e2a', '#3e7a34', '#58983e'];
  p.trunk(5.5, 2, 16, 4, pal);
  p.trunk(1.5, 6, 10, 2, pal);
  p.rect(2, 10, 2, 1, pal[1]);
  p.trunk(9.5, 4, 9, 2, pal);
  p.rect(8, 9, 2, 1, pal[1]);
  p.set(5, 1, '#f070a0');
  return p.outline();
}

function rock(w: number, h: number, pal: string[], snowCap = false, seed = 0) {
  const p = new Pix(w, h);
  p.blob(w / 2 - 0.5, h / 2 + 0.5, w / 2 - 1.5, h / 2 - 1.5, pal, seed);
  if (snowCap) {
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        if (p.get(x, y)) {
          p.set(x, y, '#f4f8fc');
          if (hash(x, 1, 2) < 0.6) p.set(x, y + 1, '#dfe8f2');
          break;
        }
      }
    }
  }
  return p.outline();
}

function shards(w: number, h: number, pal: string[]) {
  const p = new Pix(w, h);
  const spikes = [[w / 2, 1, 2.5], [w / 2 - 3, 5, 2], [w / 2 + 3, 4, 2], [w / 2 - 1, 7, 1.5]];
  for (const [cx, top, hw] of spikes) {
    for (let y = top; y < h - 1; y++) {
      const t = (y - top) / (h - 1 - top);
      const half = Math.max(0.5, hw * Math.min(1, t * 2.5));
      for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
        const s = cx - x;
        p.set(x, y, s > 0.5 ? pal[2] : s > -0.5 ? pal[1] : pal[0]);
      }
    }
    p.set(cx, top, pal[3]);
  }
  return p.outline();
}

function small(w: number, h: number, draw: (p: Pix) => void, outline = true) {
  const p = new Pix(w, h);
  draw(p);
  return outline ? p.outline() : p;
}

/** 金合欢：细长的干，顶上一把扁平的伞状树冠 */
function acacia() {
  const p = new Pix(30, 26);
  const bark = ['#4a3020', '#6a4630', '#8a6044'];
  p.line(14, 25, 14, 14, bark[1]);
  p.line(15, 25, 15, 14, bark[0]);
  p.line(14, 15, 9, 9, bark[1]);
  p.line(15, 15, 21, 8, bark[0]);
  p.line(14, 18, 18, 12, bark[2]);
  const pal = ['#4a5a1e', '#6a7a2a', '#8a9a3a', '#aabc54'];
  p.blob(9, 7, 7, 2.6, pal, 51);
  p.blob(20, 6, 8, 2.8, pal, 52);
  p.blob(15, 5, 6, 2.2, pal, 53);
  return p.outline();
}

/** 金叶树：圆胖的金黄树冠，落叶季 */
function goldtree() {
  const p = tree(20, 24, ['#8a6a14', '#c09a20', '#e8c43a', '#fff07a'], BARK, 61);
  p.set(4, 23, '#e8c43a');
  p.set(15, 23, '#c09a20');
  return p;
}

/** 雨林大树：板根 + 高树干 + 层层叠叠的大叶冠，垂着藤 */
function jungletree() {
  const p = new Pix(26, 38);
  const bark = ['#3a2a1a', '#5a4228', '#7a5a3a'];
  p.trunk(12.5, 14, 36, 4, bark);
  p.line(10, 32, 6, 37, bark[1]);
  p.line(15, 32, 19, 37, bark[0]);
  const pal = ['#123a1a', '#1c5226', '#2a6a32', '#46904a'];
  p.blob(6, 15, 6, 4, pal, 71);
  p.blob(19, 14, 6, 4, pal, 72);
  p.blob(12.5, 9, 10, 6, pal, 73);
  p.blob(12.5, 4, 6, 3.5, pal, 74);
  for (const x of [4, 9, 17, 21]) {
    const len = 6 + Math.floor(hash(x, 7, 75) * 8);
    for (let k = 0; k < len; k++) p.set(x + Math.sin(k / 2) * 0.6, 17 + k, k % 3 ? '#3a7a2a' : '#2a5a20');
  }
  return p.outline();
}

/** 雨林地上的大叶藤丛 */
function vine() {
  const p = new Pix(14, 10);
  for (let i = -3; i <= 3; i++) p.line(7, 9, 7 + i * 2, 3 + Math.abs(i) * 0.7, i % 2 ? '#2a6a2a' : '#3e8a36');
  p.blob(4, 5, 2.5, 1.6, ['#1c4a1e', '#2a6a2a', '#3e8a36', '#5aac4a'], 76);
  p.blob(10, 4, 2.5, 1.6, ['#1c4a1e', '#2a6a2a', '#3e8a36', '#5aac4a'], 77);
  p.set(7, 2, '#e04a6a');
  return p.outline();
}

/** 珊瑚：分叉的枝状，粉红或橙色 */
function coral() {
  const p = new Pix(14, 14);
  const pal = ['#a83a4a', '#d85a6a', '#f08a8a', '#ffc0b8'];
  const branch = (x0: number, y0: number, x1: number, y1: number, c: string) => { p.line(x0, y0, x1, y1, c); p.line(x0 + 1, y0, x1 + 1, y1, pal[0]); };
  branch(6, 13, 6, 6, pal[1]);
  branch(6, 9, 2, 4, pal[2]);
  branch(6, 8, 10, 2, pal[1]);
  branch(9, 5, 12, 4, pal[2]);
  branch(3, 6, 2, 1, pal[1]);
  for (const [x, y] of [[2, 1], [10, 2], [12, 4], [6, 5]]) p.set(x, y, pal[3]);
  return p.outline();
}

/** 红砂岩：层理分明的方墩石 */
function redrock() {
  const p = new Pix(18, 16);
  p.blob(8.5, 9, 8, 6.5, ['#6a2a1a', '#8a3e26', '#a85232', '#c87a50'], 81);
  for (let y = 3; y < 16; y += 3) for (let x = 0; x < 18; x++) p.paint(x, y, '#6a2a1a');
  p.paint(6, 4, '#e09a6a');
  p.paint(5, 4, '#e09a6a');
  return p.outline();
}

/** 晶柱：一根高高的发光晶体，带几根小晶 */
function crystalspire() {
  const p = new Pix(16, 30);
  const pal = ['#2a5a8a', '#4a8ad0', '#8ad0ff', '#ffffff'];
  const spike = (cx: number, top: number, bottom: number, hw: number) => {
    for (let y = top; y <= bottom; y++) {
      const t = Math.min(1, (y - top) / 5);
      const half = Math.max(0.5, hw * t);
      for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) p.set(x, y, x < cx - 0.5 ? pal[2] : x > cx + 0.5 ? pal[0] : pal[1]);
    }
    p.set(cx, top, pal[3]);
  };
  spike(8, 1, 28, 2.6);
  spike(3.5, 15, 28, 1.6);
  spike(12.5, 12, 28, 1.8);
  p.line(7, 6, 7, 20, pal[3]);
  return p.outline();
}

// ---- 12080 最外圈新群系和新城镇的装饰（10-24） ----

/** 垂柳：弯弯的干，长长下垂的蓝绿枝条 */
function willow() {
  const p = new Pix(22, 28);
  p.trunk(10.5, 12, 26, 3, BARK);
  const pal = ['#2a5a46', '#3a7a5a', '#58a070', '#8ccc94'];
  p.blob(10.5, 9, 9, 6, pal, 61);
  for (let i = 0; i < 9; i++) {
    const x = 3 + i * 2 + (hash(i, 1, 62) < 0.5 ? 0 : 1);
    const len = 8 + Math.floor(hash(i, 2, 62) * 9);
    for (let k = 0; k < len; k++) p.set(x + Math.sin(k / 3 + i) * 0.6, 11 + k, k % 4 === 3 ? pal[3] : k % 2 ? pal[1] : pal[2]);
  }
  return p.outline();
}

/** 古藤：粗大扭曲的藤干缠成一团，顶上挂着叶子和发光的果子 */
function ancientvine() {
  const p = new Pix(24, 32);
  const bark = ['#2a3a1e', '#3e5428', '#587236'];
  for (let k = 0; k < 3; k++) {
    for (let y = 8; y < 31; y++) {
      const x = 11.5 + Math.sin(y / 4 + k * 2.1) * (3 + k);
      p.set(x, y, bark[k]);
      p.set(x + 1, y, bark[(k + 1) % 3]);
    }
  }
  p.blob(8, 8, 7, 5, ['#1a4a1e', '#2a6a2a', '#3e8a36', '#62b04a'], 63);
  p.blob(16, 6, 7, 5, ['#1a4a1e', '#2a6a2a', '#3e8a36', '#62b04a'], 64);
  for (const [x, y] of [[5, 11], [19, 10], [12, 3]]) { p.set(x, y, '#f0e060'); p.set(x, y + 1, '#c0a030'); }
  return p.outline();
}

/** 雷击石柱：一根黑色石尖，上面缠着蓝白的电纹 */
function stormspire() {
  const p = new Pix(14, 32);
  const pal = ['#1a1a28', '#2a2a3e', '#3e3e58', '#5a5a7a'];
  for (let y = 1; y < 31; y++) {
    const half = 1 + (y / 31) * 5;
    for (let x = Math.round(7 - half); x <= Math.round(7 + half); x++) p.set(x, y, x < 6 ? pal[2] : x > 8 ? pal[0] : pal[1]);
  }
  let x = 7;
  for (let y = 3; y < 28; y++) {
    x += hash(y, 3, 65) < 0.5 ? -1 : 1;
    x = Math.max(4, Math.min(10, x));
    p.paint(x, y, y % 5 === 0 ? '#ffffff' : '#8ad0ff');
  }
  return p.outline();
}

/** 晶海星屑：一簇从地里冒出来的紫白晶石，带闪光 */
function starshard() {
  const p = shards(14, 18, ['#3a2a7a', '#6a4ad0', '#b8a0ff', '#ffffff']);
  p.set(3, 4, '#ffffff');
  p.set(11, 7, '#ffffff');
  return p;
}

/** 尖木栅栏：一格一根削尖的木桩 */
function palisade() {
  const p = new Pix(16, 26);
  for (const [x, top] of [[1, 2], [6, 0], [11, 3]]) {
    for (let y = top; y < 25; y++) {
      const tip = y - top;
      for (let i = 0; i < 4; i++) {
        if (tip < 3 && (i < 2 - tip || i > 1 + tip)) continue;
        p.set(x + i, y, i === 0 ? '#9a7044' : i === 3 ? '#4a3020' : '#7a5432');
      }
    }
  }
  p.rect(0, 10, 16, 2, '#3a2a1a');
  p.rect(0, 19, 16, 2, '#3a2a1a');
  return p.outline();
}

/** 晶墙：半透明的紫色晶块砌成，顶上一排晶尖 */
function crystalwall() {
  const p = new Pix(16, 26);
  const pal = ['#3a2a6a', '#5a44a0', '#8a70d8', '#d8ccff'];
  for (let y = 8; y < 25; y++) {
    for (let x = 0; x < 16; x++) {
      const row = Math.floor((y - 8) / 5);
      const joint = (y - 8) % 5 === 4 || (x + (row % 2) * 4) % 8 === 7;
      p.set(x, y, joint ? pal[0] : (x + y) % 9 === 0 ? pal[3] : x < 8 ? pal[2] : pal[1]);
    }
  }
  for (const cx of [3, 8, 13]) {
    for (let y = 1; y < 8; y++) {
      const half = (y - 1) * 0.4;
      for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) p.set(x, y, x < cx ? pal[3] : pal[2]);
    }
  }
  return p.outline();
}

/** 纸灯笼：挂在木杆上的红灯笼 */
function lantern() {
  const p = new Pix(10, 24);
  p.rect(4, 6, 2, 17, '#3a2a1e');
  p.rect(2, 22, 6, 1, '#2a1e17');
  p.rect(4, 3, 4, 1, '#3a2a1e');
  p.blob(5, 9, 3.5, 3.5, ['#8a1a1a', '#c02a2a', '#e8503a', '#ffb070'], 66);
  p.rect(3, 5, 4, 1, '#2a1e17');
  p.rect(3, 13, 4, 1, '#2a1e17');
  p.set(5, 14, '#e8b84a');
  p.set(5, 15, '#e8b84a');
  p.set(4, 8, '#fff0b0');
  return p.outline();
}

/** 小渔船：停在水上的木船，船头翘起，桅杆收着帆 */
function boat() {
  const p = new Pix(30, 22);
  for (let y = 12; y < 20; y++) {
    const t = (y - 12) / 8;
    const x0 = Math.round(2 + t * 4 - (y < 14 ? 2 : 0));
    const x1 = Math.round(28 - t * 5);
    for (let x = x0; x <= x1; x++) p.set(x, y, y === 12 ? '#c89a62' : y < 15 ? '#8a6238' : y % 3 ? '#6a4a2a' : '#5a3a22');
  }
  p.rect(14, 1, 2, 12, '#5a3a22');
  p.rect(10, 3, 10, 2, '#e8dcc0');
  p.rect(11, 5, 8, 6, '#d8ccb0');
  p.rect(11, 5, 1, 6, '#f4ead8');
  return p.outline();
}

/** 遗迹石柱：带凹槽的白石柱，柱头、柱础各一块 */
function pillar(broken: boolean) {
  const p = new Pix(12, 34);
  const pal = ['#8a867c', '#b8b4a8', '#dcd8cc', '#f4f0e8'];
  const top = broken ? 14 : 4;
  for (let y = top; y < 31; y++) for (let x = 2; x < 10; x++) p.set(x, y, x === 2 ? pal[3] : x === 9 ? pal[0] : x % 3 === 1 ? pal[1] : pal[2]);
  if (broken) {
    for (let x = 2; x < 10; x++) for (let y = top - Math.floor(hash(x, 4, 67) * 4); y < top; y++) p.set(x, y, pal[1]);
  } else {
    p.rect(0, 1, 12, 3, pal[2]);
    p.rect(0, 1, 12, 1, pal[3]);
  }
  p.rect(0, 31, 12, 3, pal[1]);
  p.rect(0, 31, 12, 1, pal[3]);
  if (broken) p.blob(10, 31, 2.5, 1.5, pal, 68);
  return p.outline();
}

const PROP_ART: Record<PropKind, () => Pix> = {
  willow,
  ancientvine,
  stormspire,
  starshard,
  palisade,
  crystalwall,
  lantern,
  boat,
  pillar: () => pillar(false),
  brokenpillar: () => pillar(true),
  moonflower: () => small(10, 8, (p) => {
    for (let i = 0; i < 3; i++) {
      const x = 2 + i * 3;
      const y = 2 + (i % 2) * 2;
      p.line(x, 7, x, y + 1, '#4a6a5a');
      p.set(x, y, '#e8e0ff');
      p.set(x - 1, y, '#b8a8f0');
      p.set(x + 1, y, '#b8a8f0');
      p.set(x, y - 1, '#b8a8f0');
    }
  }),
  ashrock: () => rock(16, 13, ['#1a1416', '#2c2426', '#40363a', '#e06a2a'], false, 69),
  acacia,
  goldtree,
  jungletree,
  vine,
  coral,
  redrock,
  crystalspire,
  dunegrass: () => small(10, 7, (p) => {
    for (const [x, h, c] of [[1, 3, '#b8a050'], [3, 6, '#d4bc64'], [5, 4, '#a08a40'], [7, 5, '#c8b058'], [8, 2, '#a08a40']] as const) p.line(x, 6, x + (x < 4 ? -1 : 1), 6 - h, c);
  }, false),
  skull: () => small(8, 6, (p) => {
    p.blob(3.5, 2.5, 3, 2.3, ['#a8a090', '#c8c0ac', '#e4dcc8', '#ffffff'], 82);
    p.set(2, 2, '#2a1e17');
    p.set(5, 2, '#2a1e17');
    p.rect(2, 5, 4, 1, '#c8c0ac');
  }),
  alpineflower: () => small(10, 6, (p) => {
    for (let i = 0; i < 4; i++) {
      const x = 1 + Math.floor(hash(i, 3, 83) * 8);
      const y = 1 + Math.floor(hash(3, i, 83) * 3);
      p.set(x, y + 1, '#4a6a3a');
      p.set(x, y, i % 2 ? '#a8c8ff' : '#ffffff');
    }
  }, false),
  wall: () => small(16, 24, (p) => {
    // 城墙：一格一段的石墙，上面带垛口
    for (let y = 6; y < 24; y++) {
      for (let x = 0; x < 16; x++) {
        const row = Math.floor((y - 6) / 4);
        const joint = (y - 6) % 4 === 3 || (x + (row % 2) * 4) % 8 === 7;
        p.set(x, y, joint ? '#6a5e4a' : (y - 6) % 4 === 0 ? '#c8b894' : '#b0a07c');
      }
    }
    p.rect(0, 2, 6, 4, '#b0a07c');
    p.rect(10, 2, 6, 4, '#b0a07c');
    p.rect(0, 2, 6, 1, '#d8caa4');
    p.rect(10, 2, 6, 1, '#d8caa4');
    p.rect(0, 22, 16, 2, '#5a5040');
  }, false),
  oak: () => tree(20, 24, LEAF, BARK, 1),
  birch: () => tree(16, 24, ['#5a7a2a', '#7a9a38', '#9cbc4a', '#c4dc6a'], ['#8a8a80', '#e8e4d8', '#ffffff'], 2),
  maple: () => tree(20, 24, ['#8a2a18', '#c04a20', '#e07a2a', '#f4b04a'], BARK, 3),
  pine: () => pine(false),
  snowpine: () => pine(true),
  redwood,
  giant,
  deadtree: () => deadtree(),
  charred: () => {
    const p = deadtree(['#120c0c', '#241a1a', '#3a2c2a']);
    for (let i = 0; i < 4; i++) p.set(7 + (i % 2), 10 + i * 3, '#ff7a2a');
    return p;
  },
  palm,
  cactus,
  rock: () => rock(14, 10, ['#5a5a58', '#7a7a76', '#9a9a94', '#bcbcb4'], false, 1),
  boulder: () => rock(18, 14, ['#4e4e52', '#6a6a6e', '#86868a', '#a8a8ac'], false, 2),
  snowrock: () => rock(14, 10, ['#5a6270', '#7a8494', '#9aa4b4', '#c4ccd8'], true, 3),
  spike: () => shards(12, 16, ['#120a18', '#2a1a36', '#4a3a5e', '#9a8ac0']),
  crystal: () => shards(12, 18, ['#4a2a8a', '#7a4ad0', '#b48af0', '#ffffff']),
  stalagmite: () => shards(10, 16, ['#2e2638', '#463c52', '#5e546e', '#7a7090']),
  icecrystal: () => shards(12, 14, ['#5a9ac8', '#8ac4ea', '#c4e8ff', '#ffffff']),
  bush: () => small(14, 10, (p) => p.blob(6.5, 5, 5.5, 4, LEAF, 4)),
  flowers: () => small(10, 6, (p) => {
    const cols = ['#f4d24a', '#f07090', '#ffffff', '#a080f0'];
    for (let i = 0; i < 5; i++) {
      const x = 1 + Math.floor(hash(i, 1, 9) * 8);
      const y = 1 + Math.floor(hash(1, i, 9) * 4);
      p.set(x, y + 1, '#3c7a32');
      p.set(x, y, cols[i % 4]);
    }
  }, false),
  tuft: () => small(8, 6, (p) => {
    for (const [x, h] of [[1, 3], [3, 5], [5, 4], [6, 2]]) p.line(x, 5, x + (x > 3 ? 1 : -0), 5 - h, x % 2 ? '#74b350' : '#4b8536');
  }, false),
  fern: () => small(12, 9, (p) => {
    for (let i = -3; i <= 3; i++) p.line(6, 8, 6 + i * 1.6, 2 + Math.abs(i), i % 2 ? '#3a7a3a' : '#5a9a48');
  }, false),
  mushroom: () => small(8, 8, (p) => {
    p.rect(3, 4, 2, 3, '#e8dcc0');
    p.blob(3.5, 3, 3.5, 2.2, ['#8a1a1a', '#c02a2a', '#e04a3a', '#ff7a6a'], 5);
    p.set(2, 2, '#ffffff');
    p.set(5, 3, '#ffffff');
  }),
  glowshroom: () => small(8, 9, (p) => {
    p.rect(3, 5, 2, 3, '#9ad8d0');
    p.blob(3.5, 3.5, 3.5, 2.5, ['#1a6a7a', '#2aa0b0', '#5ad8e0', '#c4ffff'], 6);
  }),
  reeds: () => small(10, 12, (p) => {
    for (const x of [1, 3, 5, 7, 8]) {
      const top = 1 + Math.floor(hash(x, 2) * 4);
      p.line(x, 11, x, top, '#6a7a3a');
      p.set(x, top, '#5a3a22');
      p.set(x, top + 1, '#5a3a22');
    }
  }, false),
  shell: () => small(6, 5, (p) => p.blob(2.5, 2.5, 2.5, 2, ['#c08a7a', '#e8b8a8', '#f8d8cc', '#ffffff'], 7)),
  bones: () => small(10, 6, (p) => {
    p.line(1, 4, 8, 1, '#e8e0cc');
    p.set(1, 3, '#e8e0cc');
    p.set(8, 2, '#e8e0cc');
    p.blob(6, 4, 1.5, 1.2, ['#bcb4a0', '#d8d0bc', '#ece4d0', '#ffffff']);
  }),
  drift: () => small(14, 6, (p) => p.blob(6.5, 4, 6.5, 2.5, ['#b8c8dc', '#d8e2ee', '#eef4fa', '#ffffff'], 8), false),
  ember: () => small(10, 6, (p) => {
    p.blob(4.5, 3.5, 4.5, 2.5, ['#1a1010', '#2e1e1a', '#3e2a24', '#4e342c'], 9);
    p.set(3, 3, '#ff8a2a');
    p.set(5, 2, '#ffd04a');
    p.set(6, 4, '#ff5a1a');
  }),
  grave: () => small(10, 12, (p) => {
    p.rect(2, 2, 6, 9, '#8a8a90');
    p.rect(3, 1, 4, 1, '#8a8a90');
    p.rect(2, 2, 1, 9, '#a8a8ae');
    p.rect(7, 2, 1, 9, '#6a6a70');
    p.rect(4, 4, 2, 1, '#5a5a60');
    p.rect(4, 6, 2, 1, '#5a5a60');
    p.rect(1, 11, 8, 1, '#4a5a32');
  }),
  cross: () => small(8, 12, (p) => {
    p.rect(3, 1, 2, 10, '#6a4a2e');
    p.rect(1, 3, 6, 2, '#6a4a2e');
    p.set(3, 1, '#8a6a46');
  }),
  lamp: () => small(6, 22, (p) => {
    p.rect(2, 7, 2, 14, '#2e2a2a');
    p.rect(1, 20, 4, 1, '#4a4444');
    p.rect(1, 2, 4, 5, '#ffd25e');
    p.rect(0, 1, 6, 1, '#2e2a2a');
    p.rect(1, 7, 4, 1, '#2e2a2a');
    p.set(2, 3, '#fff3c4');
  }),
  barrel: () => small(10, 12, (p) => {
    p.blob(4.5, 6, 4.5, 5.5, ['#5a3a22', '#7a5232', '#9a6a40', '#b48250'], 10);
    p.rect(0, 3, 10, 1, '#3a3a3e');
    p.rect(0, 8, 10, 1, '#3a3a3e');
  }),
  crate: () => small(12, 12, (p) => {
    p.rect(0, 0, 12, 12, '#9a6e40');
    p.rect(0, 0, 12, 1, '#b8884e');
    p.line(1, 1, 10, 10, '#7a5230');
    p.line(10, 1, 1, 10, '#7a5230');
    p.rect(0, 11, 12, 1, '#5a3a22');
  }),
  bench: () => small(14, 7, (p) => {
    p.rect(0, 1, 14, 2, '#9a6e40');
    p.rect(0, 1, 14, 1, '#b8884e');
    p.rect(1, 3, 1, 3, '#5a3a22');
    p.rect(12, 3, 1, 3, '#5a3a22');
  }),
  fence: () => small(16, 10, (p) => {
    p.rect(0, 3, 16, 2, '#8a6238');
    p.rect(0, 6, 16, 1, '#6a4a2a');
    for (const x of [1, 8, 14]) p.rect(x, 1, 2, 9, x === 8 ? '#9a7044' : '#7a5432');
  }),
  hay: () => small(14, 11, (p) => {
    p.blob(6.5, 5.5, 6.5, 5, ['#a07a2a', '#c8a03a', '#e0c058', '#f4dc7a'], 11);
    p.rect(1, 4, 12, 1, '#7a5a1a');
  }),
  scarecrow: () => small(12, 20, (p) => {
    p.rect(5, 6, 2, 13, '#6a4a2a');
    p.rect(0, 8, 12, 2, '#6a4a2a');
    p.rect(3, 8, 6, 6, '#8a3a2a');
    p.blob(5.5, 4, 3, 3, ['#b08a40', '#d0aa58', '#e8c470', '#fff0a0'], 12);
    p.rect(2, 0, 8, 2, '#4a3a2a');
  }),
  dummy: () => small(10, 18, (p) => {
    p.rect(4, 8, 2, 10, '#6a4a2a');
    p.blob(4.5, 9, 3.5, 4, ['#a0803a', '#c09a50', '#d8b468', '#ecd088'], 13);
    p.blob(4.5, 3, 2.5, 2.5, ['#a0803a', '#c09a50', '#d8b468', '#ecd088'], 14);
    p.rect(1, 8, 8, 1, '#8a2a2a');
  }),
  banner: () => small(8, 22, (p) => {
    p.rect(1, 0, 1, 22, '#4a3a2a');
    p.rect(2, 1, 5, 10, '#2a4a9a');
    p.rect(2, 1, 5, 1, '#e8b84a');
    p.set(4, 5, '#e8b84a');
    p.set(3, 11, '#2a4a9a');
    p.set(5, 11, '#2a4a9a');
  }),
  cart: () => small(20, 14, (p) => {
    p.rect(2, 3, 16, 6, '#8a6238');
    p.rect(2, 3, 16, 1, '#a87a48');
    p.blob(6, 6, 4, 2.5, ['#a07a2a', '#c8a03a', '#e0c058', '#f4dc7a'], 15);
    for (const cx of [5, 15]) p.blob(cx, 10, 2.5, 2.5, ['#3a2a1a', '#5a4026', '#7a5634', '#8a6a44'], cx);
  }),
};

export function paintProp(kind: PropKind): HTMLCanvasElement {
  return PROP_ART[kind]().canvas();
}

/** 会发光的装饰物：光晕颜色和半径 */
export const PROP_GLOW: Partial<Record<PropKind, { color: number; r: number; dy: number }>> = {
  lamp: { color: 0xffc860, r: 22, dy: -17 },
  crystal: { color: 0xa070ff, r: 18, dy: -8 },
  glowshroom: { color: 0x40e0e0, r: 12, dy: -4 },
  ember: { color: 0xff6a20, r: 12, dy: -3 },
  charred: { color: 0xff5a1a, r: 10, dy: -8 },
  icecrystal: { color: 0x9ad8ff, r: 12, dy: -6 },
  crystalspire: { color: 0x8ad0ff, r: 20, dy: -14 },
  lantern: { color: 0xff8a4a, r: 20, dy: -15 },
  stormspire: { color: 0x8ad0ff, r: 16, dy: -16 },
  starshard: { color: 0xb090ff, r: 16, dy: -8 },
  moonflower: { color: 0xc8b0ff, r: 10, dy: -4 },
};

// ---- 建筑 ----

interface HouseStyle {
  wall: 'wood' | 'stone' | 'plaster' | 'whitewash' | 'charred' | 'crystalstone' | 'marble';
  /** 屋顶积雪（雪隘堡） */
  snowCap?: boolean;
  /** 屋檐挂两盏红灯笼（岩灯城） */
  lanterns?: boolean;
  /** 屋顶塌了几块（虚辉遗都） */
  ruined?: boolean;
  roof: string[];
  windows: number;
  door?: 'single' | 'double' | 'arch';
  sign?: string;
  chimney?: boolean;
}

const ROOF_RED = ['#5a1e1a', '#8a2e26', '#b0443a', '#d0644e'];
const ROOF_BLUE = ['#1e2e5a', '#2a4482', '#3a5ca8', '#5a7cc8'];
const ROOF_GREEN = ['#1e4a2e', '#2a6640', '#3a8452', '#5aa46a'];
const ROOF_BROWN = ['#3a2416', '#5a3a22', '#7a5232', '#9a6e44'];
const ROOF_PURPLE = ['#3a1e4a', '#54306a', '#704490', '#9060b0'];
const ROOF_TEAL = ['#16444a', '#226066', '#327e84', '#4aa0a4'];

/** 招牌上的小图标 */
const SIGNS: Record<string, string[]> = {
  coin: ['..gggg..', '.gyyyyg.', 'gyyggyyg', 'gygyyyyg', 'gyyggyyg', 'gyyyygyg', '.gyggyg.', '..gggg..'],
  anvil: ['........', 'hhhhhhh.', '.hhhhhhh', '..hhhh..', '...hh...', '..hhhh..', '.hhhhhh.', '........'],
  pot: ['........', '..k..k..', '.kkkkkk.', 'kffffffk', 'kffffffk', '.kffffk.', '..kkkk..', '........'],
  bow: ['..o.....', '.o.k....', 'o..k....', 'o..k....', 'o..k....', 'o..k....', '.o.k....', '..o.....'],
  potion: ['...kk...', '...ww...', '..kwwk..', '.kppppk.', 'kppPppPk', 'kpPppppk', '.kppppk.', '..kkkk..'],
  hammer: ['.hhhh...', '.hhhh...', '..oo....', '..oo....', '..oo....', '..oo....', '..oo....', '........'],
  gem: ['........', '..cccc..', '.cwccCc.', 'cccCCCCc', '.cCCCCc.', '..cCCc..', '...cc...', '........'],
};
const SIGN_PAL: Record<string, string> = {
  g: '#a07a1a', y: '#f4d24a', h: '#9aa0a8', k: '#2a1e17', f: '#ff8a2e', o: '#8a5c34', w: '#ffffff', p: '#c04ae0', P: '#8a2ab0',
  c: '#8ad8ff', C: '#3a8ad0',
};

/** 建筑的高清倍数（10-28 画质升级）：画布按 2 倍像素画，显示时缩回原大小，砖缝、木纹、瓦片都能画到半个像素 */
export const BUILDING_RES = 2;

/**
 * 按真像素填一块区域：回调拿到逻辑坐标（带小数，步长 1/res）和这个真像素的噪声，返回颜色。
 * 低清画布上 lx/ly 就是整数，所以同一段画法两种分辨率都能用。
 */
function fillArea(p: Pix, x0: number, y0: number, w: number, h: number, f: (lx: number, ly: number, n: number) => string | null) {
  const r = p.res;
  for (let sy = 0; sy < h * r; sy++) {
    for (let sx = 0; sx < w * r; sx++) {
      const c = f(sx / r, sy / r, phash(sx + x0 * r, sy + y0 * r, 21));
      if (c) p.sub(sx + x0 * r, sy + y0 * r, c);
    }
  }
}
/** 一块砖、一块木板自己的明暗差：同一块里固定，块与块之间不同 */
const vary = (c: string, k: number) => (k < 0.33 ? mix(c, '#000000', 0.08) : k > 0.75 ? mix(c, '#ffffff', 0.07) : c);

function drawWall(p: Pix, x0: number, y0: number, w: number, h: number, kind: HouseStyle['wall']) {
  const hd = p.res > 1;
  /** 真像素的半格 */
  const q = 1 / p.res;
  fillArea(p, x0, y0, w, h, (lx, ly, n) => {
    let c: string;
    if (kind === 'stone') {
      // 砌石：每块 8×4，隔行错开；高清时砖缝半格，砖面左上亮边、右下暗边，带一点麻点
      const row = Math.floor(ly / 4);
      const off = row % 2 ? 4 : 0;
      const bx = Math.floor((lx + off) / 8);
      const ix = (lx + off) % 8;
      const iy = ly % 4;
      const joint = iy >= 4 - q || ix >= 8 - q;
      const t = hash(bx, row, 3);
      c = joint ? '#5a564e' : vary(t < 0.3 ? '#8a8478' : t > 0.8 ? '#aaa496' : '#9a9486', hash(bx, row, 9));
      if (!joint && hd) {
        if (iy < q || ix < q) c = mix(c, '#ffffff', 0.18);
        else if (iy >= 4 - 2 * q || ix >= 8 - 2 * q) c = mix(c, '#000000', 0.16);
        else if (n < 0.08) c = mix(c, '#000000', 0.1);
        else if (n > 0.95) c = mix(c, '#ffffff', 0.1);
        // 墙脚长一点青苔
        if (ly > h - 6 && n < 0.05 + (ly - h + 6) * 0.02) c = '#5a7a46';
      } else if (!joint && iy === 0) c = '#b4ae9e';
    } else if (kind === 'whitewash' || kind === 'marble') {
      // 白墙：珊瑚港的石灰墙、遗都的白石墙（带一点裂纹）
      c = kind === 'marble' ? (n < 0.1 ? '#c8c4b8' : '#dcd8cc') : n < 0.06 ? '#e4e0d4' : '#f2eee4';
      if (ly < 1) c = kind === 'marble' ? '#a8a49a' : '#c8c4b8';
      if (kind === 'marble' && hd) {
        // 大理石：细细的灰纹
        const vein = Math.sin(lx * 0.9 + Math.sin(ly * 0.6) * 2.5 + ly * 0.35);
        if (vein > 0.96) c = '#a8a498';
        else if (vein > 0.9) c = '#c0bcb0';
      } else if (kind === 'marble' && (Math.floor(lx) * 3 + Math.floor(ly) * 5) % 41 === 0) c = '#8a867c';
      if (kind === 'whitewash') {
        if (ly > h - 5) c = ly > h - 5 + q ? '#5a8ab0' : '#4a7aa0';
        else if (hd && n < 0.04) c = '#d8d0c0';
        // 灰泥的粗糙感：淡淡的横向刷痕
        else if (hd && Math.sin(ly * 9 + Math.floor(lx / 5)) > 0.85) c = '#e8e4d8';
      }
    } else if (kind === 'charred') {
      // 熏黑的木板
      const plank = Math.floor(ly / 4);
      c = ly % 4 >= 4 - q ? '#1a1412' : hash(0, plank, x0) < 0.5 ? '#3a2c24' : '#4a382c';
      if (ly % 4 < q) c = '#5a463a';
      if (hd && Math.sin(lx * 1.7 + plank * 3 + Math.sin(lx * 0.3) * 2) > 0.8) c = mix(c, '#000000', 0.25);
      if (lx < q || lx >= w - q) c = '#1a1412';
      if (n < 0.02) c = '#c84a1a';
      else if (hd && n < 0.035) c = '#8a3a14';
    } else if (kind === 'crystalstone') {
      // 紫晶砖
      const row = Math.floor(ly / 5);
      const off = row % 2 ? 5 : 0;
      const bx = Math.floor((lx + off) / 10);
      const ix = (lx + off) % 10;
      const iy = ly % 5;
      const joint = iy >= 5 - q || ix >= 10 - q;
      c = joint ? '#3a2a6a' : hash(bx, row, 8) < 0.3 ? '#7a62c8' : '#6a54b0';
      if (!joint && iy < q) c = '#a890f0';
      else if (!joint && hd) {
        if (ix < q) c = mix(c, '#c8b8ff', 0.3);
        else if (iy >= 5 - 2 * q || ix >= 10 - 2 * q) c = mix(c, '#000000', 0.2);
        // 晶面的斜向反光
        else if (((ix + iy) * 2) % 7 < 0.6 && n > 0.4) c = mix(c, '#d8ccff', 0.35);
      }
    } else if (kind === 'plaster') {
      // 灰泥墙加木框：竖梁、顶梁、斜撑；高清时梁有亮边，灰泥有颗粒，墙脚泛黄
      c = n < 0.08 ? '#d4c4a0' : '#e6d8b8';
      if (hd && ly > h - 7) c = mix(c, '#b89c6a', (ly - h + 7) / 7 * 0.35);
      const beamW = hd ? 1.5 : 1;
      const post = lx % 12 < beamW || lx >= w - beamW || ly < beamW;
      const brace = ((Math.floor(lx) + Math.floor(ly)) % 12 === 0 || (hd && (lx + ly) % 12 < 0.5)) && ly > 2 && ly < h - 2 && lx % 12 < 6;
      if (post || brace) {
        c = '#6a4426';
        if (hd && (lx % 12 < q || ly < q)) c = '#8a5c36';
        else if (hd && Math.sin(ly * 7 + lx) > 0.7) c = '#5a3820';
      }
    } else {
      // 横向木板：高清时每块板有木纹、偶尔一个木节，板缝半格
      const plank = Math.floor(ly / 4);
      const iy = ly % 4;
      const base = hash(0, plank, x0) < 0.5 ? '#8a6238' : '#9a7044';
      c = iy >= 4 - q ? '#5a3a22' : base;
      if (iy < q) c = '#a87a4c';
      else if (hd && iy < 4 - q) {
        const grain = Math.sin(lx * 1.4 + plank * 7 + Math.sin(lx * 0.25 + plank) * 2.2 + iy * 1.5);
        if (grain > 0.82) c = mix(base, '#000000', 0.18);
        else if (grain < -0.9) c = mix(base, '#ffffff', 0.08);
        const kx = (hash(plank, Math.floor(lx / 14), x0 + 5) * 10 + 2) + Math.floor(lx / 14) * 14;
        const d = Math.hypot(lx - kx, (iy - 2) * 1.6);
        if (hash(plank, Math.floor(lx / 14), x0 + 6) < 0.35 && d < 1.3) c = d < 0.6 ? '#4a2e18' : '#6a4628';
      }
      if (lx < q || lx >= w - q) c = '#5a3a22';
    }
    return c;
  });
  // 地基
  p.rect(x0, y0 + h - 2, w, 2, '#5a5650');
  p.rect(x0, y0 + h - 2, w, 1, '#7a766e');
  if (hd) fillArea(p, x0, y0 + h - 2, w, 2, (lx, ly, n) => (ly < 0.5 ? '#8a867e' : (lx * 2) % 6 < 0.5 ? '#4a4640' : n < 0.1 ? '#6a665e' : null));
}

function drawRoof(p: Pix, x0: number, y0: number, w: number, h: number, pal: string[]) {
  const hd = p.res > 1;
  const q = 1 / p.res;
  const ridge = Math.floor(h * 0.35);
  const thatch = pal === ROOF_THATCH;
  fillArea(p, x0, y0, w, h, (lx, ly, n) => {
    // 顶部两角收一点，像一个斜屋顶
    const inset = ly < 3 ? 3 - Math.floor(ly) : 0;
    if (lx < inset || lx >= w - inset) return null;
    const upper = ly < ridge;
    let c = upper ? pal[2] : pal[1];
    const row = Math.floor(ly / 3);
    const iy = ly % 3;
    if (thatch && hd) {
      // 茅草：一缕缕竖着的草茎，每排压着下一排
      const strand = Math.sin(lx * 5.1 + row * 1.7 + Math.sin(lx * 0.8) * 1.5);
      c = strand > 0.5 ? pal[upper ? 3 : 2] : strand < -0.6 ? pal[upper ? 1 : 0] : c;
      if (iy >= 3 - q) c = mix(c, '#000000', 0.3);
      if (n < 0.03) c = pal[0];
    } else {
      const off = (row % 2) * 3;
      const sx = (lx + off) % 6;
      const shade = hash(Math.floor((lx + off) / 6), row, 17);
      c = vary(c, shade);
      if (iy >= 3 - q) c = upper ? pal[1] : pal[0];
      else if (sx >= 6 - q) c = upper ? pal[1] : pal[0];
      else if (hd) {
        // 瓦片：下沿两角削圆、上沿一道亮边
        if (iy >= 3 - 2 * q && (sx < q || sx >= 6 - 2 * q)) c = upper ? pal[1] : pal[0];
        else if (iy < q) c = mix(c, '#ffffff', 0.14);
        else if (n < 0.04) c = mix(c, '#000000', 0.12);
      }
    }
    if (ly >= ridge - 1 && ly < ridge + 1) c = pal[3];
    if (ly < 1) c = pal[3];
    if (hd && ly >= ridge + 1 && ly < ridge + 1 + q) c = pal[0];
    return c;
  });
  // 屋檐阴影
  p.rect(x0, y0 + h, w, 2, '#2a1e17');
}

function drawWindow(p: Pix, x: number, y: number) {
  if (p.res < 2) {
    p.rect(x, y, 8, 8, '#4a3020');
    p.rect(x + 1, y + 1, 6, 6, '#ffd87a');
    p.rect(x + 1, y + 1, 3, 3, '#fff0b8');
    p.rect(x + 4, y + 1, 1, 6, '#4a3020');
    p.rect(x + 1, y + 4, 6, 1, '#4a3020');
    p.rect(x - 1, y + 8, 10, 1, '#6a4a2e');
    return;
  }
  // 高清：窗框、四格玻璃（上亮下暖、一道斜的反光）、窗台和窗台下的阴影
  fillArea(p, x, y, 8, 8, (lx, ly) => {
    const frame = lx < 1 || ly < 1 || lx >= 7 || ly >= 7 || (lx >= 3.5 && lx < 4.5) || (ly >= 3.5 && ly < 4.5);
    if (frame) return lx < 0.5 || ly < 0.5 ? '#5a3a28' : '#4a3020';
    const glow = 1 - ly / 8;
    let c = mix('#ffb850', '#fff0b8', glow);
    const d = lx - ly;
    if (d > 1.5 && d < 2.5) c = mix(c, '#ffffff', 0.55);
    if (lx < 1.5 || ly < 1.5) c = mix(c, '#ffffff', 0.25);
    return c;
  });
  fillArea(p, x - 1, y + 8, 10, 1.5, (lx, ly) => (ly < 1 ? (ly < 0.5 ? '#8a6a46' : '#6a4a2e') : lx > 0.5 && lx < 9.5 ? '#2a1e17' : null));
}

function drawDoor(p: Pix, cx: number, bottom: number, kind: HouseStyle['door']) {
  const w = kind === 'double' ? 14 : 9;
  const h = kind === 'double' ? 16 : 13;
  const x = Math.round(cx - w / 2);
  const y = bottom - h;
  p.rect(x - 1, y - 1, w + 2, h + 1, '#3a2416');
  if (p.res < 2) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) p.set(x + i, y + j, i % 3 === 0 ? '#5a3a22' : '#7a5232');
    if (kind === 'arch' || kind === 'double') p.rect(x, y, w, 2, '#3a2416');
    if (kind === 'double') p.rect(Math.round(cx) - 1, y, 1, h, '#3a2416');
    p.set(x + w - 3, y + Math.floor(h / 2), '#e8b84a');
    p.rect(x - 2, bottom, w + 4, 1, '#7a766e');
    return;
  }
  // 高清：竖木板带木纹、两道铁箍带铆钉、圆门环；拱门顶上削圆
  fillArea(p, x, y, w, h, (lx, ly, n) => {
    if (kind === 'arch' || kind === 'double') {
      const dx = (lx - w / 2) / (w / 2);
      const top = 2.5 * (1 - Math.sqrt(Math.max(0, 1 - dx * dx)));
      if (ly < top) return '#3a2416';
    }
    const plank = Math.floor(lx / 3);
    const ix = lx % 3;
    let c = ix >= 3 - 0.5 ? '#4a2e1a' : hash(plank, 0, x) < 0.5 ? '#7a5232' : '#845a38';
    if (ix < 0.5 && c !== '#4a2e1a') c = '#8a6040';
    const grain = Math.sin(ly * 1.6 + plank * 5 + Math.sin(ly * 0.4) * 2);
    if (ix >= 0.5 && ix < 2.5 && grain > 0.85) c = '#64422a';
    if (kind === 'double' && lx >= w / 2 - 0.5 && lx < w / 2 + 0.5) c = '#3a2416';
    // 铁箍
    const band = (ly >= 3 && ly < 4.5) || (ly >= h - 5 && ly < h - 3.5);
    if (band) {
      c = ly % 1 < 0.5 ? '#4a4a52' : '#34343a';
      if ((lx * 2) % 5 < 0.5 && ly % 1 >= 0.5) c = '#6a6a72';
    }
    // 底边的阴影
    if (ly >= h - 1) c = mix(c, '#000000', 0.3);
    if (n < 0.03) c = mix(c, '#000000', 0.15);
    return c;
  });
  // 门环：一圈金色，左上高光
  const kx = x + w - 2.5, ky = y + Math.floor(h / 2) + 0.5;
  fillArea(p, x + w - 4, y + Math.floor(h / 2) - 1, 3, 3, (lx, ly) => {
    const d = Math.hypot(x + w - 4 + lx + 0.25 - kx, y + Math.floor(h / 2) - 1 + ly + 0.25 - ky);
    return d < 1.1 ? (d < 0.5 ? '#5a3a22' : lx + ly < 2.5 ? '#f8d870' : '#c89a30') : null;
  });
  // 门槛石
  p.rect(x - 2, bottom, w + 4, 1, '#7a766e');
  fillArea(p, x - 2, bottom, w + 4, 1, (lx, ly) => (ly < 0.5 ? '#8e8a82' : (lx * 2) % 4 < 0.5 ? '#5a564e' : null));
}

function drawSign(p: Pix, x: number, y: number, icon: string) {
  p.rect(x, y - 2, 1, 3, '#3a2416');
  p.rect(x - 1, y, 12, 1, '#3a2416');
  p.rect(x, y + 1, 11, 11, '#3a2416');
  p.rect(x + 1, y + 2, 9, 9, '#c8a068');
  if (p.res > 1) {
    // 木牌的纹理和一圈内阴影
    fillArea(p, x + 1, y + 2, 9, 9, (lx, ly, n) => (lx < 0.5 || ly < 0.5 ? '#dcb880' : lx >= 8.5 || ly >= 8.5 ? '#a8824e' : n < 0.05 ? '#b8905a' : Math.sin(ly * 6 + lx * 0.5) > 0.9 ? '#bc9460' : null));
  }
  SIGNS[icon].forEach((row, j) => {
    for (let i = 0; i < 8; i++) if (SIGN_PAL[row[i]]) p.set(x + 1.5 + i, y + 2.5 + j, SIGN_PAL[row[i]]);
  });
}

/** 正面朝南的房子：上半是屋顶，下半是墙、门、窗 */
function house(wTiles: number, hTiles: number, s: HouseStyle) {
  const W = wTiles * 16;
  const H = hTiles * 16 + 18;
  const p = new Pix(W + 2, H, BUILDING_RES);
  const wallH = Math.min(34, Math.round(hTiles * 16 * 0.5));
  const roofH = H - wallH - 2;
  drawWall(p, 2, roofH + 1, W - 2, wallH, s.wall);
  drawRoof(p, 0, 0, W + 2, roofH, s.roof);
  if (s.snowCap) {
    // 屋顶上半积雪，雪边参差
    for (let x = 0; x < W + 2; x++) {
      const depth = Math.floor(roofH * 0.35) + Math.floor(hash(x, 3, 11) * 3);
      for (let y = 0; y < depth; y++) if (p.get(x, y)) p.set(x, y, y === depth - 1 ? '#c4d0e0' : hash(x, y, 12) < 0.1 ? '#dfe8f2' : '#f4f8fc');
    }
  }
  if (s.ruined) {
    // 塌掉的屋顶：几个窟窿露出黑洞洞的屋里
    for (let k = 0; k < 3; k++) {
      const cx0 = 6 + Math.floor(hash(k, wTiles, 13) * (W - 12));
      const cy0 = 3 + Math.floor(hash(wTiles, k, 14) * (roofH - 8));
      p.blob(cx0, cy0, 4 + k, 3, ['#1a1418', '#241c22', '#2e252c', '#3a3038'], 15 + k);
    }
  }
  if (s.chimney) {
    p.rect(W - 14, 0, 7, 10, '#6a625a');
    p.rect(W - 14, 0, 7, 2, '#3a3632');
    if (p.res > 1) {
      // 烟囱：小砖、顶上一圈压顶石、黑黑的烟道口
      fillArea(p, W - 14, 2, 7, 8, (lx, ly) => {
        const row = Math.floor(ly / 2);
        const ix = (lx + (row % 2) * 1.5) % 3;
        return ly % 2 >= 1.5 || ix >= 2.5 ? '#4a443e' : ix < 0.5 ? '#8a8278' : '#6e665e';
      });
      fillArea(p, W - 15, 0, 9, 2, (lx, ly) => (ly < 0.5 ? '#5a5650' : lx < 0.5 || lx >= 8.5 ? '#2a2624' : '#3a3632'));
      fillArea(p, W - 13, 0.5, 5, 1, () => '#1a1614');
    }
  }
  const bottom = H - 2;
  const cx = W / 2 + 1;
  drawDoor(p, cx, bottom, s.door ?? 'single');
  const wy = roofH + 6;
  const slots = s.windows;
  for (let i = 0; i < slots; i++) {
    const side = i % 2 ? 1 : -1;
    const k = Math.floor(i / 2) + 1;
    const wx = Math.round(cx + side * (k * 16 + 2) - 4);
    if (wx > 3 && wx < W - 10) drawWindow(p, wx, wy);
    // 10-28：窄房子以前一扇窗都放不下；高清版把窗挪到门两侧的墙上（有招牌的那边留给招牌）
    else if (p.res > 1 && k === 1 && !(side > 0 && s.sign)) {
      const nx = Math.round(cx + side * (W / 2 - 6) - 4);
      if (nx >= 3 && nx <= W - 9) drawWindow(p, nx, wy);
    }
  }
  if (s.sign) drawSign(p, Math.round(cx + 9), roofH + 4, s.sign);
  if (s.lanterns) {
    for (const lx of [4, W - 4]) {
      p.rect(lx, roofH, 1, 3, '#2a1e17');
      p.blob(lx, roofH + 5, 2.2, 2.6, ['#8a1a1a', '#c02a2a', '#e8503a', '#ffb070'], lx);
    }
  }
  return p.outline();
}

function tower() {
  const p = new Pix(50, 112, BUILDING_RES);
  drawWall(p, 6, 30, 38, 80, 'stone');
  p.rect(4, 26, 42, 6, '#5a564e');
  for (let x = 4; x < 46; x += 6) p.rect(x, 22, 4, 5, '#6a665e');
  drawWindow(p, 21, 44);
  drawWindow(p, 21, 66);
  drawDoor(p, 25, 110, 'arch');
  // 顶上的强化水晶
  const crystal = ['#4a2a8a', '#7a4ad0', '#b48af0', '#ffffff'];
  for (let y = 2; y < 22; y++) {
    const half = y < 12 ? (y - 2) * 0.6 : (22 - y) * 0.6;
    for (let x = Math.round(25 - half); x <= Math.round(25 + half); x++) p.set(x, y, x < 24 ? crystal[2] : x > 25 ? crystal[0] : crystal[1]);
  }
  p.set(24, 6, crystal[3]);
  return p.outline();
}

function fountain() {
  const p = new Pix(64, 64, BUILDING_RES);
  p.blob(31.5, 36, 30, 22, ['#5a564e', '#7a766e', '#9a968c', '#b8b4a8'], 31);
  p.blob(31.5, 37, 25, 17, ['#2f68b0', '#3c7cc4', '#5a9ad8', '#cfe8ff'], 32);
  p.blob(31.5, 30, 7, 6, ['#5a564e', '#7a766e', '#9a968c', '#b8b4a8'], 33);
  p.rect(30, 12, 4, 18, '#8a867c');
  p.blob(31.5, 12, 6, 3, ['#5a564e', '#7a766e', '#9a968c', '#b8b4a8'], 34);
  return p.outline();
}

function stall(seed: number) {
  const p = new Pix(48, 44, BUILDING_RES);
  const stripes = [['#c03a2a', '#f4ead8'], ['#2a5ac0', '#f4ead8'], ['#3a9a4a', '#f4ead8']][seed % 3];
  p.rect(3, 14, 2, 28, '#5a3a22');
  p.rect(43, 14, 2, 28, '#5a3a22');
  for (let y = 4; y < 16; y++) for (let x = 0; x < 48; x++) p.set(x, y, stripes[Math.floor(x / 6) % 2]);
  for (let x = 0; x < 48; x += 6) p.rect(x, 16, 3, 2, stripes[0]);
  p.rect(2, 28, 44, 10, '#8a6238');
  p.rect(2, 28, 44, 2, '#a87a48');
  const goods = ['#e04a3a', '#f4d24a', '#7ac04a', '#e08a2a', '#a060d0'];
  for (let i = 0; i < 8; i++) p.blob(6 + i * 5, 26, 2, 1.8, ['#2a1e17', goods[(i + seed) % 5], goods[(i + seed) % 5], '#ffffff'], i);
  return p.outline();
}

function windmill() {
  const p = new Pix(48, 82, BUILDING_RES);
  for (let y = 18; y < 80; y++) {
    const half = 12 + (y - 18) * 0.12;
    for (let x = Math.round(24 - half); x <= Math.round(24 + half); x++) {
      const lx = x - (24 - half);
      p.set(x, y, lx < 3 ? '#e8dcc0' : (y % 6 === 0 ? '#b8a888' : '#d8caa8'));
    }
  }
  drawRoof(p, 8, 4, 32, 16, ROOF_BROWN);
  drawDoor(p, 24, 80, 'arch');
  drawWindow(p, 20, 40);
  return p.outline();
}

function windmillBlades() {
  const p = new Pix(64, 64, BUILDING_RES);
  for (let a = 0; a < 4; a++) {
    const ang = (a * Math.PI) / 2;
    const cx = Math.cos(ang);
    const cy = Math.sin(ang);
    for (let r = 4; r < 30; r++) {
      p.set(32 + cx * r, 32 + cy * r, '#5a3a22');
      if (r > 8) for (let k = 1; k < 6; k++) p.set(32 + cx * r - cy * k, 32 + cy * r + cx * k, (r + k) % 4 ? '#f4ead8' : '#c8b898');
    }
  }
  p.blob(31.5, 31.5, 3, 3, ROOF_BROWN, 9);
  return p.outline();
}

function barn() {
  const p = house(5, 4, { wall: 'wood', roof: ROOF_BROWN, windows: 0, door: 'double' });
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      const c = p.get(x, y);
      if (c === '#8a6238' || c === '#9a7044' || c === '#a87a4c') p.set(x, y, y % 4 === 0 ? '#c04a3a' : '#a03a2e');
    }
  }
  return p;
}

/** 熔炉：砖砌窑身 + 发光炉口 + 高烟囱，左边棚下堆煤，右边码着锭（用户 10-23 要求单独一座炼锭建筑） */
function furnace(wTiles: number, hTiles: number) {
  const W = wTiles * 16;
  const H = hTiles * 16 + 18;
  const p = new Pix(W + 2, H, BUILDING_RES);
  const bottom = H - 2;
  const cx = W / 2 + 1;
  const BRICK = ['#4a2e26', '#6e4232', '#8a5640', '#a8704e'];
  const STONE = ['#3e3a36', '#5a5650', '#7a766e', '#9a968c'];
  // 烟囱（右上，和 MapScene 的冒烟位置对齐）
  for (let y = 0; y < bottom - 20; y++) {
    for (let x = W - 14; x < W - 6; x++) {
      const lx = x - (W - 14);
      const brick = (y % 4 === 3) || ((lx + (Math.floor(y / 4) % 2) * 2) % 4 === 0);
      p.set(x, y, lx === 0 ? STONE[3] : lx === 7 ? STONE[0] : brick ? STONE[1] : STONE[2]);
    }
  }
  p.rect(W - 15, 0, 10, 3, STONE[0]);
  p.rect(W - 15, 0, 10, 1, STONE[3]);
  // 窑身：下宽上窄的梯形，顶部圆拱
  const top = 18;
  const baseHalf = W * 0.36;
  const topHalf = W * 0.22;
  for (let y = top; y < bottom; y++) {
    const t = (y - top) / (bottom - top);
    let half = topHalf + (baseHalf - topHalf) * t;
    if (y < top + 8) half *= Math.sqrt(1 - ((top + 8 - y) / 9) ** 2);
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
      const lx = x - (cx - half);
      const s = lx / (half * 2);
      const row = Math.floor((y - top) / 4);
      const mortar = (y - top) % 4 === 3 || (Math.round(x + (row % 2) * 3) % 6 === 0);
      const shade = s < 0.18 ? 3 : s > 0.8 ? 0 : 2;
      p.set(x, y, mortar ? BRICK[Math.max(0, shade - 2)] : BRICK[shade === 2 && phash(x, y, 77) < 0.25 ? 1 : shade]);
    }
  }
  // 窑顶的铁箍
  p.rect(Math.round(cx - topHalf - 2), top + 9, Math.round(topHalf * 2 + 5), 2, '#3a3a40');
  p.rect(Math.round(cx - topHalf - 2), top + 9, Math.round(topHalf * 2 + 5), 1, '#7a7a88');
  // 炉口：拱形，里面从白热到橙红
  const mw = 20;
  const mh = 18;
  const my = bottom - mh - 2;
  for (let j = -2; j < mh + 2; j++) {
    for (let i = -2; i < mw + 2; i++) {
      const dx = (i - mw / 2 + 0.5) / (mw / 2 + 2);
      const arch = j < 6 ? (j + 2) / 8 : 1;
      if (Math.abs(dx) > Math.sqrt(Math.max(0, 1 - (1 - arch) ** 2)) + 0.02) continue;
      p.set(cx - mw / 2 + i, my + j, STONE[j < 0 || i < 0 || i >= mw ? 3 : 1]);
    }
  }
  for (let j = 0; j < mh; j++) {
    for (let i = 0; i < mw; i++) {
      const dx = (i - mw / 2 + 0.5) / (mw / 2);
      const arch = j < 6 ? j / 6 : 1;
      if (Math.abs(dx) > Math.sqrt(Math.max(0, 1 - (1 - arch) ** 2))) continue;
      const heat = 1 - Math.abs(dx) * 0.6 - (1 - j / mh) * 0.5 + (phash(i, j, 91) - 0.5) * 0.25;
      p.set(cx - mw / 2 + i, my + j, heat > 0.7 ? '#fff4b0' : heat > 0.5 ? '#ffc840' : heat > 0.3 ? '#ff8a2a' : heat > 0.12 ? '#d04a1e' : '#6a1e14');
    }
  }
  // 炉口下的炭火和铁炉门
  for (let i = 0; i < mw; i += 3) p.rect(cx - mw / 2 + i, bottom - 4, 2, 2, phash(i, 3, 5) < 0.5 ? '#2a1a14' : '#ff6a20');
  p.rect(cx - mw / 2 - 4, bottom - 2, mw + 8, 2, STONE[0]);
  p.rect(cx + mw / 2 + 2, my + 4, 3, mh - 4, '#3a3a40');
  p.rect(cx + mw / 2 + 2, my + 4, 1, mh - 4, '#7a7a88');
  // 左边的棚子 + 煤堆
  p.rect(3, bottom - 22, 2, 22, '#5a3a22');
  drawRoof(p, 0, bottom - 30, 22, 8, ROOF_BROWN);
  p.blob(12, bottom - 4, 8, 4, ['#121014', '#24202a', '#3a3440', '#5a5468'], 31);
  // 右边码锭：三层金属锭
  const bars = ['#c87a4a', '#b8bcc4', '#8a8f99'];
  for (let k = 0; k < 3; k++) {
    for (let i = 0; i < 3 - k; i++) {
      const x = W - 20 + i * 6 + k * 3;
      const y = bottom - 3 - k * 3;
      p.rect(x, y, 5, 3, bars[k]);
      p.rect(x, y, 5, 1, mix(bars[k], '#ffffff', 0.5));
      p.rect(x, y + 2, 5, 1, mix(bars[k], '#000000', 0.35));
    }
  }
  // 门口的铁砧小件：坩埚
  p.blob(W - 5, bottom - 14, 3.5, 3, ['#2a2a30', '#4a4a52', '#6a6a74', '#9a9aa8'], 33);
  p.rect(W - 7, bottom - 16, 5, 1, '#ffb030');
  return p.outline();
}

/** 草原游牧帐篷：圆顶，彩色布条，门帘卷起 */
function tent(wTiles: number, hTiles: number, seed: number) {
  const W = wTiles * 16;
  const H = hTiles * 16 + 18;
  const p = new Pix(W + 2, H, BUILDING_RES);
  const cx = W / 2 + 1;
  const bottom = H - 2;
  const cloth = [['#c8b48a', '#e8d8b0', '#f4e8c8'], ['#a8885a', '#c8a878', '#e0c494']][seed % 2];
  const band = ['#b03a2a', '#2a6aa8', '#3a8a4a'][seed % 3];
  const rx = W / 2 - 2;
  const top = 8;
  for (let y = top; y < bottom; y++) {
    const t = (y - top) / (bottom - top);
    const half = rx * Math.sqrt(Math.min(1, t * 1.8));
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
      const s = (x - cx) / (half + 0.5);
      let c = s < -0.35 ? cloth[2] : s > 0.4 ? cloth[0] : cloth[1];
      if (Math.abs(y - (top + (bottom - top) * 0.45)) < 2) c = band;
      if (x === Math.round(cx) && y < top + 6) c = cloth[0];
      p.set(x, y, c);
    }
  }
  p.rect(cx - 1, 2, 2, 7, '#5a3a22');
  p.rect(cx + 1, 2, 5, 3, band);
  // 门帘
  for (let y = bottom - 16; y < bottom; y++) for (let x = Math.round(cx - 6); x < Math.round(cx + 6); x++) p.set(x, y, '#3a2416');
  p.rect(Math.round(cx - 7), bottom - 17, 14, 3, cloth[0]);
  return p.outline();
}

/** 洞窟入口：一座岩石小山，下面黑洞洞的拱门；pal 跟着区域换（用户 10-23：洞窟先占位） */
export function paintCave(region: string): HTMLCanvasElement {
  const PALS: Record<string, string[]> = {
    snow: ['#5a6270', '#7a8494', '#9aa4b4', '#e4ebf3'], alpine: ['#5a6270', '#7a8494', '#9aa4b4', '#e4ebf3'],
    lava: ['#241c1e', '#3a2c2c', '#55403e', '#b84a2a'], canyon: ['#5a2418', '#8a3e26', '#a85232', '#c87a50'],
    desert: ['#8a6a3a', '#b08a50', '#c8a466', '#e8cc8a'], crystal: ['#2e2650', '#46407a', '#5e58a0', '#a8f0ff'],
    abyss: ['#221b33', '#3a3050', '#524670', '#7a5ac0'], swamp: ['#3a3a2a', '#525240', '#6a6a54', '#8a8a6a'],
    jungle: ['#2a3a2a', '#405440', '#587058', '#6aa04a'], tropic: ['#7a7060', '#9a9078', '#b8ae94', '#e8dcc0'],
  };
  const pal = PALS[region] ?? ['#4e4e52', '#6a6a6e', '#86868a', '#a8a8ac'];
  const p = new Pix(64, 48, BUILDING_RES);
  p.blob(32, 28, 30, 19, pal, 91);
  p.blob(14, 34, 12, 12, pal, 92);
  p.blob(50, 34, 12, 12, pal, 93);
  p.blob(30, 14, 14, 10, pal, 94);
  // 拱形洞口，越往里越黑
  for (let y = 22; y < 47; y++) {
    for (let x = 18; x < 46; x++) {
      const dx = (x - 31.5) / 13;
      const dy = (y - 47) / 24;
      if (dx * dx + dy * dy > 1) continue;
      const depth = 1 - Math.sqrt(dx * dx + dy * dy);
      p.set(x, y, depth > 0.45 ? '#020104' : depth > 0.2 ? '#0c0810' : '#1c1420');
    }
  }
  // 洞口一圈石块
  for (let a = 0; a <= Math.PI; a += 0.26) {
    const x = 31.5 - Math.cos(a) * 14;
    const y = 47 - Math.sin(a) * 25;
    p.blob(x, y, 2.4, 2, [pal[0], pal[1], pal[2], pal[3]], Math.round(a * 10));
  }
  // 门口立一块木牌
  p.rect(52, 34, 2, 13, '#5a3a22');
  p.rect(47, 32, 12, 6, '#8a6238');
  p.rect(47, 32, 12, 1, '#a87a48');
  p.rect(49, 34, 8, 1, '#3a2416');
  p.rect(49, 36, 6, 1, '#3a2416');
  return p.outline().canvas();
}

function well() {
  const p = new Pix(20, 30, BUILDING_RES);
  p.blob(9.5, 23, 9, 5, ['#5a564e', '#7a766e', '#9a968c', '#b8b4a8'], 41);
  p.blob(9.5, 22, 6, 3, ['#0e1a2a', '#1a2a44', '#22385a', '#3a5a8a'], 42);
  p.rect(2, 6, 2, 16, '#5a3a22');
  p.rect(16, 6, 2, 16, '#5a3a22');
  drawRoof(p, 0, 0, 20, 7, ROOF_RED);
  return p.outline();
}

// ---- 12080 新城镇的建筑（10-24：每座城一种风格） ----

const ROOF_THATCH = ['#6a4a18', '#9a742e', '#c09a48', '#e4c470'];
const ROOF_SLATE = ['#262c3a', '#363e52', '#4a546c', '#66728c'];
const ROOF_LACQUER = ['#4a0e0e', '#7a1a16', '#a42a20', '#d04a30'];
const ROOF_ASH = ['#1a1616', '#2a2424', '#3c3434', '#584c48'];
const ROOF_CRYSTAL = ['#3a2a6a', '#5a44a0', '#8a70d8', '#cfc0ff'];
const ROOF_MOSS = ['#203424', '#2e4a34', '#426644', '#62885a'];
const ROOF_SEA = ['#163a5a', '#1e5080', '#2e6aa4', '#5a92c8'];

/** 每座新城的建筑风格：墙、屋顶和附加装饰 */
const THEMES: Record<TownTheme, Partial<HouseStyle>> = {
  village: { wall: 'plaster', roof: ROOF_THATCH },
  snowfort: { wall: 'stone', roof: ROOF_SLATE, snowCap: true },
  lantern: { wall: 'stone', roof: ROOF_LACQUER, lanterns: true },
  port: { wall: 'whitewash', roof: ROOF_SEA },
  ashcamp: { wall: 'charred', roof: ROOF_ASH },
  crystal: { wall: 'crystalstone', roof: ROOF_CRYSTAL },
  stilt: { wall: 'wood', roof: ROOF_MOSS },
  ruins: { wall: 'marble', roof: ROOF_SLATE, ruined: true },
};

/** 把一张画好的房子垫高：底下加一排木桩和一架梯子（遗忘哨塔的高脚屋） */
function onStilts(src: Pix, lift = 10) {
  const p = new Pix(src.w, src.h + lift, src.res);
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) { const c = src.get(x, y); if (c) p.set(x, y, c); }
  for (let x = 3; x < src.w - 3; x += 10) p.rect(x, src.h - 2, 3, lift + 2, x % 20 ? '#4a3a2a' : '#5a4632');
  p.rect(1, src.h - 2, src.w - 2, 2, '#3a2a1e');
  const cx = Math.round(src.w / 2);
  for (let y = src.h; y < src.h + lift; y += 3) p.rect(cx - 3, y, 6, 1, '#8a6a46');
  p.rect(cx - 4, src.h, 1, lift, '#6a4a2e');
  p.rect(cx + 3, src.h, 1, lift, '#6a4a2e');
  return p.outline();
}

/** 堡垒主楼：中间高大的石楼，两侧带垛口的塔楼 */
function keep(wTiles: number, hTiles: number) {
  const W = wTiles * 16;
  const H = hTiles * 16 + 30;
  const p = new Pix(W + 2, H, BUILDING_RES);
  const bottom = H - 2;
  drawWall(p, 14, 26, W - 26, bottom - 26, 'stone');
  drawRoof(p, 10, 8, W - 18, 20, ROOF_SLATE);
  for (const tx of [0, W - 16]) {
    drawWall(p, tx, 14, 18, bottom - 14, 'stone');
    for (let x = tx; x < tx + 18; x += 6) p.rect(x, 8, 4, 6, '#9a9486');
    p.rect(tx, 13, 18, 2, '#5a564e');
    drawWindow(p, tx + 5, 30);
  }
  for (let x = 10; x < W - 8; x++) for (let y = 8; y < 13; y++) if (p.get(x, y)) p.set(x, y, y < 11 ? '#f4f8fc' : '#c4d0e0');
  drawDoor(p, W / 2 + 1, bottom, 'double');
  drawWindow(p, W / 2 - 16, 38);
  drawWindow(p, W / 2 + 10, 38);
  p.rect(W / 2 - 2, 26, 6, 10, '#2a4a9a');
  p.rect(W / 2 - 2, 26, 6, 1, '#e8b84a');
  return p.outline();
}

/** 哨塔：高高的木塔，顶上带棚子的瞭望台 */
function watchtower(wTiles: number, hTiles: number, stone: boolean) {
  const W = wTiles * 16;
  const H = hTiles * 16 + 22;
  const p = new Pix(W + 2, H, BUILDING_RES);
  const bottom = H - 2;
  const cx = W / 2 + 1;
  const legW = Math.max(3, Math.round(W * 0.1));
  for (const lx of [4, W - 4 - legW]) p.rect(lx, 24, legW, bottom - 24, stone ? '#8a8478' : '#6a4a2e');
  for (let y = 34; y < bottom - 6; y += 14) { p.line(4 + legW, y, W - 4 - legW, y + 10, '#5a3a22'); p.line(W - 4 - legW, y, 4 + legW, y + 10, '#5a3a22'); }
  drawWall(p, 0, 16, W + 2, 12, stone ? 'stone' : 'wood');
  for (let x = 0; x < W + 2; x += 5) p.rect(x, 12, 3, 4, stone ? '#9a9486' : '#7a5432');
  drawRoof(p, 2, 0, W - 2, 12, stone ? ROOF_SLATE : ROOF_BROWN);
  p.rect(cx - 3, 18, 6, 6, '#2a1e17');
  p.set(cx, 20, '#ffd25e');
  return p.outline();
}

/** 灯塔楼：三层叠起来的红漆宝塔，每层屋檐挂灯笼 */
function lanterntower(wTiles: number, hTiles: number) {
  const W = wTiles * 16;
  const H = hTiles * 16 + 22;
  const p = new Pix(W + 2, H, BUILDING_RES);
  const bottom = H - 2;
  const cx = W / 2 + 1;
  const tiers = 4;
  const tierH = Math.floor((bottom - 6) / tiers);
  for (let t = 0; t < tiers; t++) {
    const y0 = 6 + t * tierH;
    const half = W * (0.22 + t * 0.07);
    drawWall(p, Math.round(cx - half * 0.7), y0 + 8, Math.round(half * 1.4), tierH - 8, 'plaster');
    drawRoof(p, Math.round(cx - half), y0, Math.round(half * 2), 9, ROOF_LACQUER);
    for (const lx of [Math.round(cx - half) + 1, Math.round(cx + half) - 2]) p.blob(lx, y0 + 12, 1.8, 2.2, ['#8a1a1a', '#c02a2a', '#e8503a', '#ffb070'], lx + t);
    if (t > 0) drawWindow(p, Math.round(cx - 4), y0 + 12);
  }
  p.rect(cx - 1, 0, 2, 7, '#e8b84a');
  p.blob(cx, 2, 2.5, 2.5, ['#a07a1a', '#e8b84a', '#ffe070', '#ffffff'], 7);
  drawDoor(p, cx, bottom, 'arch');
  return p.outline();
}

/** 灯塔：红白相间的圆塔，顶上玻璃灯室 */
function lighthouse(wTiles: number, hTiles: number) {
  const W = wTiles * 16;
  const H = hTiles * 16 + 24;
  const p = new Pix(W + 2, H, BUILDING_RES);
  const bottom = H - 2;
  const cx = W / 2 + 1;
  for (let y = 22; y < bottom; y++) {
    const half = W * 0.22 + ((y - 22) / (bottom - 22)) * W * 0.18;
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
      const band = Math.floor((y - 22) / 10) % 2;
      const sh = (x - cx) / half;
      const base = band ? ['#f4ead8', '#dcd0bc', '#b8ac98'] : ['#d0443a', '#b03a2e', '#8a2a22'];
      p.set(x, y, sh < -0.4 ? base[0] : sh > 0.5 ? base[2] : base[1]);
    }
  }
  p.rect(Math.round(cx - W * 0.3), 18, Math.round(W * 0.6) + 1, 4, '#3a3a40');
  p.rect(Math.round(cx - W * 0.2), 8, Math.round(W * 0.4) + 1, 10, '#ffe890');
  p.rect(Math.round(cx - W * 0.2), 8, Math.round(W * 0.4) + 1, 1, '#3a3a40');
  p.rect(Math.round(cx), 8, 1, 10, '#3a3a40');
  drawRoof(p, Math.round(cx - W * 0.26), 0, Math.round(W * 0.52) + 1, 8, ROOF_RED);
  drawDoor(p, cx, bottom, 'arch');
  return p.outline();
}

/** 仓库：宽大的木棚，正中一扇大拉门，门口堆着木箱 */
function warehouse(wTiles: number, hTiles: number) {
  const p = house(wTiles, hTiles, { wall: 'wood', roof: ROOF_SEA, windows: 0, door: 'double' });
  const W = wTiles * 16;
  const bottom = p.h - 2;
  p.rect(Math.round(W / 2) - 10, bottom - 20, 22, 20, '#3a2416');
  for (let x = Math.round(W / 2) - 9; x < Math.round(W / 2) + 11; x += 4) p.rect(x, bottom - 19, 1, 19, '#5a3a22');
  for (const [x, w] of [[4, 10], [W - 14, 10]]) {
    p.rect(x, bottom - 10, w, 10, '#9a6e40');
    p.rect(x, bottom - 10, w, 1, '#b8884e');
    p.line(x, bottom - 10, x + w - 1, bottom - 1, '#7a5230');
  }
  return p.outline();
}

/** 篝火：一圈石头围着交叉的木柴，火苗由场景加动画 */
function bonfire(wTiles: number) {
  const W = wTiles * 16;
  const p = new Pix(W + 2, 40, BUILDING_RES);
  const cx = W / 2 + 1;
  for (let a = 0; a < Math.PI * 2; a += 0.5) p.blob(cx + Math.cos(a) * (W / 2 - 4), 30 + Math.sin(a) * 6, 3, 2.2, ['#3a3a40', '#5a5a62', '#7a7a84', '#9a9aa4'], Math.round(a * 10));
  p.line(cx - 12, 33, cx + 10, 22, '#5a3a22');
  p.line(cx + 12, 33, cx - 10, 22, '#6a4a2a');
  p.line(cx - 12, 32, cx + 10, 21, '#7a5432');
  p.blob(cx, 22, 7, 9, ['#c8401a', '#ff8a2a', '#ffc840', '#fff4b0'], 21);
  p.blob(cx, 18, 4, 7, ['#ff8a2a', '#ffc840', '#fff4b0', '#ffffff'], 22);
  return p.outline();
}

/** 晶塔：石台上立着一根巨大的发光晶柱，周围几根小晶 */
function crystaltower(wTiles: number, hTiles: number) {
  const W = wTiles * 16;
  const H = hTiles * 16 + 30;
  const p = new Pix(W + 2, H, BUILDING_RES);
  const bottom = H - 2;
  const cx = W / 2 + 1;
  drawWall(p, 6, bottom - 22, W - 10, 22, 'crystalstone');
  for (let x = 4; x < W - 2; x += 6) p.rect(x, bottom - 26, 4, 4, '#6a54b0');
  const pal = ['#3a2a8a', '#6a4ad0', '#a888f8', '#ffffff'];
  const spike = (sx: number, top: number, bot: number, hw: number) => {
    for (let y = top; y <= bot; y++) {
      const t = Math.min(1, (y - top) / 14);
      const half = Math.max(0.5, hw * t);
      for (let x = Math.round(sx - half); x <= Math.round(sx + half); x++) p.set(x, y, x < sx - 1 ? pal[2] : x > sx + 1 ? pal[0] : pal[1]);
    }
    p.set(sx, top, pal[3]);
  };
  spike(cx, 2, bottom - 24, W * 0.18);
  spike(cx - W * 0.3, bottom - 70, bottom - 24, W * 0.08);
  spike(cx + W * 0.3, bottom - 60, bottom - 24, W * 0.08);
  p.line(cx - 2, 12, cx - 2, bottom - 40, pal[3]);
  drawDoor(p, cx, bottom, 'arch');
  return p.outline();
}

/** 断壁残垣：只剩半截墙，没有屋顶，墙头参差 */
function ruin(wTiles: number, hTiles: number) {
  const W = wTiles * 16;
  const H = hTiles * 16 + 10;
  const p = new Pix(W + 2, H, BUILDING_RES);
  const bottom = H - 2;
  drawWall(p, 2, 10, W - 2, bottom - 10, 'marble');
  for (let x = 2; x < W; x++) {
    const cut = 10 + Math.floor(Math.abs(Math.sin(x * 0.21 + wTiles)) * 18 + hash(x, 5, 17) * 4);
    for (let y = 10; y < cut; y++) p.set(x, y, null);
  }
  p.rect(Math.round(W / 2) - 6, bottom - 18, 12, 18, '#1a1418');
  for (let i = 0; i < 4; i++) p.blob(6 + hash(i, 1, 18) * (W - 12), bottom - 1, 3, 1.6, ['#8a867c', '#b8b4a8', '#dcd8cc', '#f4f0e8'], i);
  return p.outline();
}

/** 神殿：台阶、一排石柱、三角形山花，中间挂着仓库的招牌 */
function temple(wTiles: number, hTiles: number) {
  const W = wTiles * 16;
  const H = hTiles * 16 + 26;
  const p = new Pix(W + 2, H, BUILDING_RES);
  const bottom = H - 2;
  const cx = W / 2 + 1;
  const pal = ['#8a867c', '#b8b4a8', '#dcd8cc', '#f4f0e8'];
  for (let k = 0; k < 3; k++) p.rect(k * 3, bottom - 3 - k * 3, W + 2 - k * 6, 3, pal[k + 1]);
  const colTop = 30;
  const colBot = bottom - 9;
  p.rect(8, colTop, W - 14, colBot - colTop, '#2a2430');
  for (let x = 6; x < W - 4; x += 14) for (let y = colTop; y < colBot; y++) for (let i = 0; i < 7; i++) p.set(x + i, y, i === 0 ? pal[3] : i === 6 ? pal[0] : i % 2 ? pal[1] : pal[2]);
  p.rect(2, colTop - 6, W - 2, 6, pal[2]);
  p.rect(2, colTop - 6, W - 2, 1, pal[3]);
  for (let y = 4; y < colTop - 6; y++) {
    const half = ((y - 4) / (colTop - 10)) * (W / 2);
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) p.set(x, y, y === Math.round(colTop - 7) ? pal[0] : pal[2]);
  }
  p.blob(cx, colTop - 12, 3, 3, ['#4a2a8a', '#7a4ad0', '#b48af0', '#ffffff'], 23);
  drawSign(p, Math.round(cx - 5), colTop + 4, 'coin');
  return p.outline();
}

export function paintBuilding(kind: BuildingKind, w: number, h: number, seed = 0, theme?: TownTheme): HTMLCanvasElement {
  const T = theme ? THEMES[theme] : {};
  // 新城镇里的设施和民居：同样的招牌，换成这座城的墙和屋顶
  const H = (base: HouseStyle) => {
    const p = house(w, h, { ...base, ...T, roof: theme ? T.roof! : base.roof });
    return theme === 'stilt' ? onStilts(p) : p;
  };
  switch (kind) {
    case 'bank': return H({ wall: 'stone', roof: ROOF_GREEN, windows: 2, door: 'double', sign: 'coin' }).canvas();
    case 'hall': return H({ wall: 'stone', roof: ROOF_BLUE, windows: 4, door: 'double', chimney: true }).canvas();
    case 'smithy': return H({ wall: 'stone', roof: ROOF_BROWN, windows: 2, door: 'double', sign: 'anvil', chimney: true }).canvas();
    case 'inn': return H({ wall: 'plaster', roof: ROOF_RED, windows: 2, sign: 'pot', chimney: true }).canvas();
    case 'workshop': return H({ wall: 'wood', roof: ROOF_TEAL, windows: 2, sign: 'hammer' }).canvas();
    case 'bowyer': return H({ wall: 'wood', roof: ROOF_GREEN, windows: 2, sign: 'bow' }).canvas();
    case 'apothecary': return H({ wall: 'plaster', roof: ROOF_PURPLE, windows: 2, sign: 'potion' }).canvas();
    case 'tower': return tower().canvas();
    case 'house': return H({ wall: 'plaster', roof: ROOF_RED, windows: 2, chimney: true }).canvas();
    case 'house2': return H({ wall: 'wood', roof: ROOF_BLUE, windows: 2 }).canvas();
    case 'house3': return H({ wall: 'stone', roof: ROOF_BROWN, windows: 2, chimney: true }).canvas();
    case 'stall': return stall(seed).canvas();
    case 'windmill': return windmill().canvas();
    case 'fountain': return fountain().canvas();
    case 'barn': return barn().canvas();
    case 'well': return well().canvas();
    case 'furnace': return furnace(w, h).canvas();
    case 'atelier': return H({ wall: 'plaster', roof: ROOF_TEAL, windows: 2, door: 'arch', sign: 'gem', chimney: true }).canvas();
    case 'manor': return H({ wall: 'stone', roof: ROOF_PURPLE, windows: 4, door: 'double', chimney: true }).canvas();
    case 'tent': return (theme === 'ashcamp' ? darkTent(w, h, seed) : tent(w, h, seed)).canvas();
    case 'thatch': return house(w, h, { wall: 'plaster', roof: ROOF_THATCH, windows: 2, chimney: seed % 2 === 0 }).canvas();
    case 'keep': return keep(w, h).canvas();
    case 'watchtower': return watchtower(w, h, theme === 'snowfort').canvas();
    case 'lanterntower': return lanterntower(w, h).canvas();
    case 'lighthouse': return lighthouse(w, h).canvas();
    case 'warehouse': return warehouse(w, h).canvas();
    case 'bonfire': return bonfire(w).canvas();
    case 'crystaltower': return crystaltower(w, h).canvas();
    case 'stilthouse': return onStilts(house(w, h, { wall: 'wood', roof: ROOF_MOSS, windows: 2, chimney: seed % 3 === 0 })).canvas();
    case 'ruin': return ruin(w, h).canvas();
    case 'temple': return temple(w, h).canvas();
  }
}

/** 灰烬营地的帐篷：熏黑的帆布，红色布条 */
function darkTent(w: number, h: number, seed: number) {
  const p = tent(w, h, seed);
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      const c = p.get(x, y);
      if (!c || c === '#1a120e' || c === '#3a2416' || c === '#5a3a22') continue;
      if (['#b03a2a', '#2a6aa8', '#3a8a4a'].includes(c)) p.set(x, y, '#a02a1a');
      else p.set(x, y, mix(c, '#2a2020', 0.6));
    }
  }
  return p;
}

export const paintWindmillBlades = () => windmillBlades().canvas();

/** 柔和的圆形光晕，叠加模式用 */
export function paintGlow(size = 64): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

/** 粒子：小方块 */
export function paintDot(size: number, color: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  return c;
}
