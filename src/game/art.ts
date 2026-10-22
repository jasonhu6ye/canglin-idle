import { hash, type BuildingKind, type PropKind } from './world';

/*
 * 程序画的像素装饰物和建筑：先在一个颜色数组上画形状，最后统一描一圈深色描边，
 * 这样所有东西都有一致的「描边像素画」观感。正式美术到位后替换成 sprite sheet 即可。
 */

const OUTLINE = '#1a120e';

class Pix {
  data: (string | null)[];
  constructor(public w: number, public h: number) {
    this.data = new Array(w * h).fill(null);
  }
  set(x: number, y: number, c: string | null) {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.data[y * this.w + x] = c;
  }
  get(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.data[y * this.w + x] : null;
  }
  rect(x: number, y: number, w: number, h: number, c: string) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
  /** 有明暗的团块：左上亮右下暗，边缘带一点噪声 */
  blob(cx: number, cy: number, rx: number, ry: number, pal: string[], seed = 0) {
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) {
      for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        const d = dx * dx + dy * dy;
        const n = hash(x, y, seed);
        if (d > 1 + (n - 0.5) * 0.35) continue;
        const s = -dx * 0.55 - dy * 0.8 + (n - 0.5) * 0.6;
        this.set(x, y, s > 0.75 ? pal[3] : s > 0.2 ? pal[2] : s > -0.45 ? pal[1] : pal[0]);
      }
    }
  }
  /** 树干：左亮右暗 */
  trunk(cx: number, top: number, bottom: number, width: number, pal: string[]) {
    for (let y = top; y <= bottom; y++) {
      for (let i = 0; i < width; i++) {
        const x = Math.round(cx - width / 2 + i);
        this.set(x, y, i === 0 ? pal[2] : i === width - 1 ? pal[0] : hash(x, y, 5) < 0.2 ? pal[0] : pal[1]);
      }
    }
  }
  line(x0: number, y0: number, x1: number, y1: number, c: string) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) this.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c);
  }
  outline(c = OUTLINE) {
    const add: number[] = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y)) continue;
        if (this.get(x + 1, y) || this.get(x - 1, y) || this.get(x, y + 1) || this.get(x, y - 1)) add.push(y * this.w + x);
      }
    }
    for (const i of add) this.data[i] = c;
    return this;
  }
  canvas(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = this.w;
    c.height = this.h;
    const ctx = c.getContext('2d')!;
    this.data.forEach((col, i) => {
      if (!col) return;
      ctx.fillStyle = col;
      ctx.fillRect(i % this.w, Math.floor(i / this.w), 1, 1);
    });
    return c;
  }
}

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

const PROP_ART: Record<PropKind, () => Pix> = {
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
};

// ---- 建筑 ----

interface HouseStyle {
  wall: 'wood' | 'stone' | 'plaster';
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

function drawWall(p: Pix, x0: number, y0: number, w: number, h: number, kind: HouseStyle['wall']) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const lx = x - x0;
      const ly = y - y0;
      let c: string;
      if (kind === 'stone') {
        const row = Math.floor(ly / 4);
        const off = row % 2 ? 4 : 0;
        const joint = ly % 4 === 3 || (lx + off) % 8 === 7;
        const t = hash(Math.floor((lx + off) / 8), row, 3);
        c = joint ? '#5a564e' : t < 0.3 ? '#8a8478' : t > 0.8 ? '#aaa496' : '#9a9486';
        if (!joint && ly % 4 === 0) c = '#b4ae9e';
      } else if (kind === 'plaster') {
        c = '#e6d8b8';
        if (hash(x, y, 4) < 0.08) c = '#d4c4a0';
        if (lx % 12 === 0 || lx === w - 1 || ly === 0) c = '#6a4426';
        if ((lx + ly) % 12 === 0 && ly > 2 && ly < h - 2 && lx % 12 < 6) c = '#6a4426';
      } else {
        // 横向木板
        c = ly % 4 === 3 ? '#5a3a22' : hash(0, Math.floor(ly / 4), x0) < 0.5 ? '#8a6238' : '#9a7044';
        if (ly % 4 === 0) c = '#a87a4c';
        if (lx === 0 || lx === w - 1) c = '#5a3a22';
      }
      p.set(x, y, c);
    }
  }
  // 地基
  p.rect(x0, y0 + h - 2, w, 2, '#5a5650');
  p.rect(x0, y0 + h - 2, w, 1, '#7a766e');
}

function drawRoof(p: Pix, x0: number, y0: number, w: number, h: number, pal: string[]) {
  const ridge = Math.floor(h * 0.35);
  for (let y = y0; y < y0 + h; y++) {
    const ly = y - y0;
    // 顶部两角收一点，像一个斜屋顶
    const inset = ly < 3 ? 3 - ly : 0;
    for (let x = x0 + inset; x < x0 + w - inset; x++) {
      const lx = x - x0;
      const upper = ly < ridge;
      let c = upper ? pal[2] : pal[1];
      const row = Math.floor(ly / 3);
      if (ly % 3 === 2) c = upper ? pal[1] : pal[0];
      else if ((lx + (row % 2) * 3) % 6 === 0) c = upper ? pal[1] : pal[0];
      if (ly === ridge || ly === ridge - 1) c = pal[3];
      if (ly === 0) c = pal[3];
      p.set(x, y, c);
    }
  }
  // 屋檐阴影
  p.rect(x0, y0 + h, w, 2, '#2a1e17');
}

function drawWindow(p: Pix, x: number, y: number) {
  p.rect(x, y, 8, 8, '#4a3020');
  p.rect(x + 1, y + 1, 6, 6, '#ffd87a');
  p.rect(x + 1, y + 1, 3, 3, '#fff0b8');
  p.rect(x + 4, y + 1, 1, 6, '#4a3020');
  p.rect(x + 1, y + 4, 6, 1, '#4a3020');
  p.rect(x - 1, y + 8, 10, 1, '#6a4a2e');
}

function drawDoor(p: Pix, cx: number, bottom: number, kind: HouseStyle['door']) {
  const w = kind === 'double' ? 14 : 9;
  const h = kind === 'double' ? 16 : 13;
  const x = Math.round(cx - w / 2);
  const y = bottom - h;
  p.rect(x - 1, y - 1, w + 2, h + 1, '#3a2416');
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) p.set(x + i, y + j, i % 3 === 0 ? '#5a3a22' : '#7a5232');
  if (kind === 'arch' || kind === 'double') p.rect(x, y, w, 2, '#3a2416');
  if (kind === 'double') p.rect(Math.round(cx) - 1, y, 1, h, '#3a2416');
  p.set(x + w - 3, y + Math.floor(h / 2), '#e8b84a');
  p.rect(x - 2, bottom, w + 4, 1, '#7a766e');
}

function drawSign(p: Pix, x: number, y: number, icon: string) {
  p.rect(x, y - 2, 1, 3, '#3a2416');
  p.rect(x - 1, y, 12, 1, '#3a2416');
  p.rect(x, y + 1, 11, 11, '#3a2416');
  p.rect(x + 1, y + 2, 9, 9, '#c8a068');
  SIGNS[icon].forEach((row, j) => {
    for (let i = 0; i < 8; i++) if (SIGN_PAL[row[i]]) p.set(x + 1.5 + i, y + 2.5 + j, SIGN_PAL[row[i]]);
  });
}

/** 正面朝南的房子：上半是屋顶，下半是墙、门、窗 */
function house(wTiles: number, hTiles: number, s: HouseStyle) {
  const W = wTiles * 16;
  const H = hTiles * 16 + 18;
  const p = new Pix(W + 2, H);
  const wallH = Math.min(34, Math.round(hTiles * 16 * 0.5));
  const roofH = H - wallH - 2;
  drawWall(p, 2, roofH + 1, W - 2, wallH, s.wall);
  drawRoof(p, 0, 0, W + 2, roofH, s.roof);
  if (s.chimney) {
    p.rect(W - 14, 0, 7, 10, '#6a625a');
    p.rect(W - 14, 0, 7, 2, '#3a3632');
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
  }
  if (s.sign) drawSign(p, Math.round(cx + 9), roofH + 4, s.sign);
  return p.outline();
}

function tower() {
  const p = new Pix(50, 112);
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
  const p = new Pix(64, 64);
  p.blob(31.5, 36, 30, 22, ['#5a564e', '#7a766e', '#9a968c', '#b8b4a8'], 31);
  p.blob(31.5, 37, 25, 17, ['#2f68b0', '#3c7cc4', '#5a9ad8', '#cfe8ff'], 32);
  p.blob(31.5, 30, 7, 6, ['#5a564e', '#7a766e', '#9a968c', '#b8b4a8'], 33);
  p.rect(30, 12, 4, 18, '#8a867c');
  p.blob(31.5, 12, 6, 3, ['#5a564e', '#7a766e', '#9a968c', '#b8b4a8'], 34);
  return p.outline();
}

function stall(seed: number) {
  const p = new Pix(48, 44);
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
  const p = new Pix(48, 82);
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
  const p = new Pix(64, 64);
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

function well() {
  const p = new Pix(20, 30);
  p.blob(9.5, 23, 9, 5, ['#5a564e', '#7a766e', '#9a968c', '#b8b4a8'], 41);
  p.blob(9.5, 22, 6, 3, ['#0e1a2a', '#1a2a44', '#22385a', '#3a5a8a'], 42);
  p.rect(2, 6, 2, 16, '#5a3a22');
  p.rect(16, 6, 2, 16, '#5a3a22');
  drawRoof(p, 0, 0, 20, 7, ROOF_RED);
  return p.outline();
}

export function paintBuilding(kind: BuildingKind, w: number, h: number, seed = 0): HTMLCanvasElement {
  switch (kind) {
    case 'bank': return house(w, h, { wall: 'stone', roof: ROOF_GREEN, windows: 2, door: 'double', sign: 'coin' }).canvas();
    case 'hall': return house(w, h, { wall: 'stone', roof: ROOF_BLUE, windows: 4, door: 'double', chimney: true }).canvas();
    case 'smithy': return house(w, h, { wall: 'stone', roof: ROOF_BROWN, windows: 2, door: 'double', sign: 'anvil', chimney: true }).canvas();
    case 'inn': return house(w, h, { wall: 'plaster', roof: ROOF_RED, windows: 2, sign: 'pot', chimney: true }).canvas();
    case 'workshop': return house(w, h, { wall: 'wood', roof: ROOF_TEAL, windows: 2, sign: 'hammer' }).canvas();
    case 'bowyer': return house(w, h, { wall: 'wood', roof: ROOF_GREEN, windows: 2, sign: 'bow' }).canvas();
    case 'apothecary': return house(w, h, { wall: 'plaster', roof: ROOF_PURPLE, windows: 2, sign: 'potion' }).canvas();
    case 'tower': return tower().canvas();
    case 'house': return house(w, h, { wall: 'plaster', roof: ROOF_RED, windows: 2, chimney: true }).canvas();
    case 'house2': return house(w, h, { wall: 'wood', roof: ROOF_BLUE, windows: 2 }).canvas();
    case 'house3': return house(w, h, { wall: 'stone', roof: ROOF_BROWN, windows: 2, chimney: true }).canvas();
    case 'stall': return stall(seed).canvas();
    case 'windmill': return windmill().canvas();
    case 'fountain': return fountain().canvas();
    case 'barn': return barn().canvas();
    case 'well': return well().canvas();
  }
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
