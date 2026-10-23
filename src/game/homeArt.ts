import { mix, phash, Pix } from './pix';

/**
 * 家园岛屿的建造物（用户 10-23）：全部逐像素画。
 * 摆件的画布宽 = 占地宽 × 16，高 = 占地高 × 16 + 往上冒出来的高度（UP），贴图底边对齐占地的底边。
 */
const T = 16;

/** 每件东西往上冒多高（墙、柜子、灯之类比地面高） */
export const UP: Record<string, number> = {
  wall_wood: 10, wall_stone: 10, wall_brick: 10, wall_white: 10, fence: 6,
  door_wood: 10, door_iron: 10,
  bed: 4, bed_double: 4, table: 4, chair: 6, chest: 4, shelf: 16, wardrobe: 16, lamp: 16, fireplace: 14, plant_pot: 8,
  st_kitchen: 10, st_furnace: 14, st_smithy: 4, st_workshop: 8, st_bowyer: 8, st_apothecary: 10,
  tree: 26, flowerbed: 4, bench: 4, streetlamp: 22, well: 14, statue: 22,
};

const WOOD = ['#3a2416', '#5e3a22', '#7e5232', '#a06c40', '#c48a56'];
const DARKWOOD = ['#22140c', '#3a2216', '#523020', '#6a402a', '#86563a'];
const STONE = ['#2e2c34', '#4a4752', '#6a6672', '#8e8a96', '#b4b0ba'];
const BRICK = ['#4a1a14', '#7a2a1e', '#a03a26', '#c05a3a', '#d87a56'];
const PLASTER = ['#7a7468', '#a8a294', '#cfc9ba', '#e6e1d4', '#f6f2e8'];
const IRON = ['#24282e', '#3c434c', '#5a646e', '#7e8a94', '#aab4bc'];
const COPPER = ['#4a2414', '#7a3e20', '#b06a3a', '#d8925a', '#f0b880'];
const LEAF = ['#1e3a1a', '#2e5a26', '#468232', '#68a840', '#8ac85a'];

const WALLS: Record<string, string[]> = { wall_wood: WOOD, wall_stone: STONE, wall_brick: BRICK, wall_white: PLASTER };

/**
 * 墙：16 宽、16+UP 高。mask 是上右下左哪边连着墙（1/2/4/8）。
 * 墙顶是一条亮色的压顶，正面（下边没连墙时）露出墙面和纹理。
 */
export function paintWall(id: string, mask: number): HTMLCanvasElement {
  const up = UP[id] ?? 10;
  const H = T + up;
  const p = new Pix(T, H);
  if (id === 'fence') return paintFence(mask);
  const pal = WALLS[id] ?? STONE;
  const n = mask & 1, e = mask & 2, s = mask & 4, w = mask & 8;
  // 墙体占整格（顶部往上冒 up）；连着墙的方向一直画到边，否则留 2 像素
  const x0 = w ? 0 : 2;
  const x1 = e ? T : T - 2;
  const top = n ? 0 : 2;
  const faceH = s ? 0 : 9;
  const capBottom = H - faceH;
  for (let y = top; y < H; y++) {
    for (let x = x0; x < x1; x++) {
      if (y < capBottom) {
        // 压顶：亮一些，边上一圈高光
        const edge = (!n && y === top) || (!w && x === x0);
        p.set(x, y, edge ? pal[4] : phash(x, y, 3) < 0.15 ? pal[2] : pal[3]);
      } else {
        // 正面：按材质画纹理，越往下越暗
        const fy = y - capBottom;
        let col = fy < 2 ? pal[2] : pal[1];
        if (id === 'wall_wood' && (x % 5 === 0)) col = pal[0];
        if (id === 'wall_stone' && (fy === 4 || (fy < 4 ? (x + 1) % 6 === 0 : (x + 4) % 6 === 0))) col = pal[0];
        if (id === 'wall_brick' && (fy % 3 === 2 || ((Math.floor(fy / 3) % 2 ? x + 2 : x) % 5 === 0))) col = mix(pal[1], '#d8c8b0', 0.35);
        if (id === 'wall_white' && fy >= faceH - 2) col = WOOD[2];
        p.set(x, y, col);
      }
    }
  }
  if (!s) for (let x = x0; x < x1; x++) p.set(x, H - 1, pal[0]);
  return p.outlineTinted().canvas();
}

function paintFence(mask: number): HTMLCanvasElement {
  const up = UP.fence;
  const p = new Pix(T, T + up);
  const base = T + up - 3;
  const post = (x: number) => { for (let y = base - 12; y <= base; y++) { p.set(x, y, WOOD[3]); p.set(x + 1, y, WOOD[2]); } p.set(x, base - 12, WOOD[4]); };
  post(7);
  if (mask & 2) for (let x = 8; x < T; x++) { p.set(x, base - 9, WOOD[3]); p.set(x, base - 4, WOOD[2]); }
  if (mask & 8) for (let x = 0; x < 7; x++) { p.set(x, base - 9, WOOD[3]); p.set(x, base - 4, WOOD[2]); }
  if (mask & 1) for (let y = 0; y < base - 12; y++) p.set(7, y + up - 2, WOOD[2]);
  if (mask & 4) for (let y = base; y < T + up; y++) p.set(7, y, WOOD[2]);
  return p.outlineTinted().canvas();
}

/** 地板：16×16，铺满整格，相邻的同种地板接缝自然 */
export function paintFloor(id: string, x: number, y: number): HTMLCanvasElement {
  const p = new Pix(T, T);
  for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) {
    const n = phash(x * T + i, y * T + j, 9);
    let col = '#888';
    switch (id) {
      case 'floor_wood': {
        const plank = Math.floor(j / 4);
        const seam = (i + plank * 7 + x * 3) % 16 === 0;
        col = j % 4 === 3 || seam ? WOOD[1] : n < 0.12 ? WOOD[2] : WOOD[3];
        break;
      }
      case 'floor_dark': {
        const plank = Math.floor(j / 4);
        const seam = (i + plank * 5 + x * 7) % 16 === 0;
        col = j % 4 === 3 || seam ? DARKWOOD[0] : n < 0.12 ? DARKWOOD[1] : DARKWOOD[2];
        break;
      }
      case 'floor_stone':
        col = i % 8 === 7 || j % 8 === 7 ? STONE[1] : n < 0.15 ? STONE[2] : STONE[3];
        break;
      case 'floor_marble':
        col = i === 15 || j === 15 ? '#b8b4ae' : n < 0.06 ? '#c8c0d8' : (i + j) % 11 === 0 ? '#ddd8e6' : '#eeeaf2';
        break;
      case 'carpet_red':
        col = i === 0 || j === 0 || i === 15 || j === 15 ? '#e0b050' : (i + j) % 6 === 0 ? '#9a2026' : '#b8303a';
        break;
      case 'carpet_blue':
        col = i === 0 || j === 0 || i === 15 || j === 15 ? '#d8c890' : (i - j + 16) % 6 === 0 ? '#2a3a7a' : '#3a4e9a';
        break;
      case 'path': {
        const cell = (Math.floor((i + (Math.floor(j / 5) % 2) * 3) / 6) + Math.floor(j / 5) * 3) % 4;
        col = j % 5 === 4 || (i + (Math.floor(j / 5) % 2) * 3) % 6 === 5 ? '#5a5248' : ['#9a9284', '#a8a090', '#8e877a', '#b0a898'][cell];
        break;
      }
    }
    p.set(i, j, col);
  }
  return p.canvas();
}

/** 摆件：家具、制作台、户外装饰 */
export function paintThing(id: string, w: number, h: number): HTMLCanvasElement {
  const up = UP[id] ?? 4;
  const W = w * T;
  const H = h * T + up;
  const p = new Pix(W, H);
  const B = H - 1; // 底边
  const box = (x: number, y: number, bw: number, bh: number, pal: string[], topH = 3) => {
    for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
      p.set(x + i, y + j, j < topH ? (j === 0 ? pal[4] : pal[3]) : i === 0 ? pal[2] : j === bh - 1 ? pal[0] : pal[1]);
    }
  };
  switch (id) {
    case 'door_wood':
    case 'door_iron': {
      const pal = id === 'door_wood' ? WOOD : IRON;
      box(1, 2, 14, H - 2, STONE, 2);
      for (let y = 4; y < H - 1; y++) for (let x = 3; x < 13; x++) p.set(x, y, x === 3 ? pal[3] : (x - 3) % 3 === 0 ? pal[1] : pal[2]);
      p.set(11, Math.floor(H / 2) + 2, '#f0c850');
      p.set(11, Math.floor(H / 2) + 3, '#a07a1a');
      break;
    }
    case 'bed':
    case 'bed_double': {
      const cloth = id === 'bed' ? ['#6a1e22', '#8a2a2e', '#b03a3e', '#d05a5a', '#e88a86'] : ['#1e2a5a', '#2a3a7a', '#3a5aa8', '#5a7ac8', '#8aa8e8'];
      box(0, 0, W, 8, WOOD, 3); // 床头板
      box(1, 6, W - 2, H - 7, WOOD, 1);
      for (let y = 7; y < H - 2; y++) for (let x = 2; x < W - 2; x++) p.set(x, y, '#ece6d6');
      // 枕头
      const pillows = id === 'bed' ? [W / 2 - 4] : [3, W / 2 + 1];
      for (const px of pillows) for (let y = 8; y < 12; y++) for (let x = px; x < px + (id === 'bed' ? 8 : 12); x++) p.set(x, y, y === 8 ? '#ffffff' : '#dcd6c6');
      // 被子
      for (let y = 13; y < H - 2; y++) for (let x = 2; x < W - 2; x++) p.set(x, y, y === 13 ? cloth[4] : (x + y) % 7 === 0 ? cloth[1] : x < 4 ? cloth[3] : cloth[2]);
      break;
    }
    case 'table':
      box(1, up, W - 2, 8, WOOD, 4);
      for (const lx of [2, W - 4]) for (let y = up + 8; y < H; y++) { p.set(lx, y, WOOD[1]); p.set(lx + 1, y, WOOD[0]); }
      p.set(W / 2 - 3, up + 1, '#e8e0c8'); p.set(W / 2 - 2, up + 1, '#e8e0c8'); p.set(W / 2 + 4, up + 2, '#c04a4a');
      break;
    case 'chair':
      box(3, 0, 10, 8, WOOD, 2);
      box(3, 8, 10, 4, WOOD, 2);
      for (const lx of [3, 11]) for (let y = 12; y < H; y++) { p.set(lx, y, WOOD[1]); p.set(lx + 1, y, WOOD[0]); }
      break;
    case 'chest':
      box(1, 2, 14, H - 3, WOOD, 6);
      for (let y = 2; y < H - 1; y++) { p.set(3, y, IRON[3]); p.set(12, y, IRON[2]); }
      for (let x = 1; x < 15; x++) p.set(x, 8, IRON[1]);
      p.rect(7, 7, 2, 3, '#f0c850');
      break;
    case 'shelf': {
      box(0, 0, W, H, DARKWOOD, 2);
      const books = ['#b03a3a', '#3a6ab0', '#3a9a5a', '#d8a040', '#8a4ab0', '#e0e0d0'];
      for (let row = 0; row < 3; row++) {
        const y0 = 3 + row * Math.floor((H - 4) / 3);
        const bh = Math.floor((H - 4) / 3) - 2;
        for (let x = 2; x < W - 2; x++) p.set(x, y0 + bh, DARKWOOD[3]);
        for (let x = 2; x < W - 2; x += 2) {
          const c = books[Math.floor(phash(x, row, 4) * books.length)];
          const hh = bh - Math.floor(phash(x, row, 7) * 3);
          for (let y = y0 + bh - hh; y < y0 + bh; y++) { p.set(x, y, c); p.set(x + 1, y, mix(c, '#000000', 0.3)); }
        }
      }
      break;
    }
    case 'wardrobe':
      box(1, 0, 14, H, WOOD, 2);
      for (let y = 3; y < H - 2; y++) p.set(8, y, WOOD[0]);
      p.set(6, Math.floor(H / 2), '#f0c850'); p.set(10, Math.floor(H / 2), '#f0c850');
      break;
    case 'lamp':
      for (let y = 10; y < H - 1; y++) { p.set(7, y, IRON[3]); p.set(8, y, IRON[1]); }
      p.rect(5, H - 2, 6, 2, IRON[2]);
      for (let y = 2; y < 10; y++) for (let x = 7 - Math.floor((y - 2) / 2) - 2; x <= 8 + Math.floor((y - 2) / 2) + 2; x++) p.set(x, y, y < 4 ? '#fff4c0' : '#f0d070');
      break;
    case 'fireplace':
      box(0, 0, W, H, STONE, 3);
      for (let y = H - 13; y < H - 1; y++) for (let x = 7; x < W - 7; x++) p.set(x, y, '#140c0a');
      for (let x = 9; x < W - 9; x++) {
        const fh = 3 + Math.floor(phash(x, 1, 2) * 6);
        for (let y = H - 2 - fh; y < H - 2; y++) p.set(x, y, y < H - fh ? '#ffe070' : '#ff7a2a');
      }
      for (let x = 0; x < W; x++) p.set(x, 3, STONE[4]);
      break;
    case 'plant_pot':
      p.blob(8, 7, 5, 5, LEAF, 3);
      for (let y = H - 8; y < H; y++) for (let x = 4 + (y - (H - 8) > 5 ? 1 : 0); x < 12 - (y - (H - 8) > 5 ? 1 : 0); x++) p.set(x, y, y === H - 8 ? '#d0784a' : '#a85a36');
      break;
    case 'rug_round': {
      const cx = W / 2 - 0.5;
      const cy = H / 2 + 1;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const d = Math.hypot((x - cx) / (W / 2 - 1), (y - cy) / (H / 2 - 3));
        if (d > 1) continue;
        p.set(x, y, d > 0.86 ? '#e0b050' : d > 0.62 ? '#7a3a6a' : d > 0.5 ? '#e0b050' : '#a04a8a');
      }
      break;
    }
    case 'st_kitchen':
      box(0, 4, W, H - 4, STONE, 4);
      for (let y = H - 9; y < H - 2; y++) for (let x = 3; x < 12; x++) p.set(x, y, '#1a0c08');
      for (let x = 4; x < 11; x++) p.set(x, H - 3 - Math.floor(phash(x, 3, 1) * 3), '#ff8a2a');
      // 锅
      for (let y = 0; y < 6; y++) for (let x = 18; x < 28; x++) p.set(x, y, y === 0 ? IRON[4] : IRON[2]);
      p.set(20, 0, '#ffffff');
      break;
    case 'st_furnace':
      box(1, 0, W - 2, H, STONE, 4);
      for (let y = H - 14; y < H - 3; y++) for (let x = 9; x < W - 9; x++) {
        const k = (y - (H - 14)) / 11;
        p.set(x, y, k > 0.6 ? '#ffd060' : k > 0.3 ? '#ff8a2a' : '#7a2010');
      }
      for (let y = 0; y < 6; y++) for (let x = W / 2 - 3; x < W / 2 + 3; x++) p.set(x, y, STONE[1]);
      break;
    case 'st_smithy': {
      // 树墩上一块铁砧
      for (let y = H - 9; y < H; y++) for (let x = 9; x < 23; x++) p.set(x, y, x < 11 ? WOOD[3] : WOOD[1]);
      box(5, H - 15, 22, 6, IRON, 2);
      for (let y = H - 15; y < H - 12; y++) for (let x = 1; x < 6; x++) p.set(x + (y - (H - 15)), y, IRON[3]);
      break;
    }
    case 'st_workshop':
      box(0, up, W, 8, WOOD, 4);
      for (const lx of [1, W - 3]) for (let y = up + 8; y < H; y++) { p.set(lx, y, WOOD[1]); p.set(lx + 1, y, WOOD[0]); }
      // 锤子、锯子
      for (let x = 4; x < 12; x++) p.set(x, up - 1, IRON[3]);
      p.rect(4, up - 3, 3, 2, IRON[2]);
      for (let x = 17; x < 28; x++) p.set(x, up, x % 2 ? IRON[4] : IRON[2]);
      p.rect(26, up - 2, 3, 3, WOOD[3]);
      break;
    case 'st_bowyer':
      box(0, up, W, 8, WOOD, 4);
      for (const lx of [1, W - 3]) for (let y = up + 8; y < H; y++) { p.set(lx, y, WOOD[1]); p.set(lx + 1, y, WOOD[0]); }
      // 一张弓和几支箭
      for (let i = 0; i < 12; i++) p.set(6 + i, up - 1 - Math.round(Math.sin((i / 11) * Math.PI) * 4), WOOD[4]);
      for (let x = 6; x < 18; x++) p.set(x, up - 1, '#e8e0c8');
      for (let k = 0; k < 3; k++) for (let x = 21; x < 29; x++) p.set(x, up - 1 - k * 2, x === 28 ? IRON[4] : WOOD[3]);
      break;
    case 'st_apothecary': {
      box(0, up, W, 8, DARKWOOD, 4);
      for (const lx of [1, W - 3]) for (let y = up + 8; y < H; y++) { p.set(lx, y, DARKWOOD[2]); p.set(lx + 1, y, DARKWOOD[1]); }
      const bottles: [number, string][] = [[4, '#d84a5a'], [11, '#4ab8d8'], [18, '#7ad84a'], [25, '#c070e0']];
      for (const [bx, col] of bottles) {
        for (let y = up - 6; y < up; y++) for (let x = bx; x < bx + 4; x++) p.set(x, y, y < up - 4 ? '#c8d8e0' : col);
        p.set(bx + 1, up - 7, '#8a6a3a');
      }
      break;
    }
    case 'tree':
      p.trunk(8, H - 14, H - 1, 4, WOOD);
      p.blob(8, H - 26, 7.5, 9, LEAF, 11);
      p.blob(4.5, H - 19, 4.5, 4, LEAF, 12);
      p.blob(11.5, H - 19, 4.5, 4, LEAF, 13);
      break;
    case 'flowerbed': {
      box(0, H - 8, W, 8, STONE, 2);
      for (let x = 2; x < W - 2; x++) p.set(x, H - 7, '#4a3020');
      const cols = ['#e84a6a', '#f0c850', '#ffffff', '#a070e0', '#ff8a3a'];
      for (let x = 2; x < W - 2; x += 3) {
        const hh = 3 + Math.floor(phash(x, 2, 6) * 4);
        for (let y = H - 7 - hh; y < H - 7; y++) p.set(x, y, LEAF[2]);
        p.set(x, H - 8 - hh, cols[x % cols.length]);
        p.set(x + 1, H - 8 - hh, cols[(x + 2) % cols.length]);
      }
      break;
    }
    case 'bench':
      box(1, H - 12, W - 2, 3, WOOD, 1);
      box(1, H - 8, W - 2, 3, WOOD, 1);
      for (const lx of [3, W - 5]) for (let y = H - 5; y < H; y++) { p.set(lx, y, IRON[2]); p.set(lx + 1, y, IRON[1]); }
      break;
    case 'streetlamp':
      for (let y = 6; y < H - 1; y++) { p.set(7, y, IRON[3]); p.set(8, y, IRON[1]); }
      p.rect(5, H - 3, 6, 3, IRON[2]);
      p.rect(4, 0, 8, 2, IRON[2]);
      for (let y = 2; y < 7; y++) for (let x = 5; x < 11; x++) p.set(x, y, x === 5 || x === 10 ? IRON[1] : '#fff0a0');
      break;
    case 'well': {
      const cx = W / 2;
      for (let y = H - 14; y < H; y++) for (let x = 3; x < W - 3; x++) {
        const top = y < H - 11;
        p.set(x, y, top ? (x > 7 && x < W - 8 && y > H - 14 ? '#2a4a7a' : STONE[4]) : (x + Math.floor(y / 3)) % 5 === 0 ? STONE[1] : STONE[2]);
      }
      for (const lx of [5, W - 7]) for (let y = 4; y < H - 12; y++) { p.set(lx, y, WOOD[3]); p.set(lx + 1, y, WOOD[1]); }
      for (let y = 0; y < 5; y++) for (let x = 2 + (4 - y); x < W - 2 - (4 - y); x++) p.set(x, y, y === 0 ? BRICK[4] : BRICK[2]);
      p.set(cx, 8, IRON[3]);
      for (let y = 6; y < 12; y++) p.set(cx, y, '#c8b088');
      p.rect(cx - 2, 12, 4, 3, WOOD[2]);
      break;
    }
    case 'statue': {
      box(6, H - 8, W - 12, 8, STONE, 2);
      const cx = W / 2;
      p.blob(cx, 8, 4, 4, STONE, 21);
      for (let y = 12; y < H - 8; y++) {
        const half = 4 + (y - 12) * 0.25;
        for (let x = Math.floor(cx - half); x < cx + half; x++) p.set(x, y, x < cx - half + 2 ? STONE[3] : STONE[2]);
      }
      for (let y = 10; y < 30; y++) p.set(cx + 7, y, STONE[3]);
      break;
    }
    default:
      box(1, 1, W - 2, H - 2, COPPER, 3);
  }
  return p.outlineTinted().canvas();
}

/** 战利品展台：一块小石座，上面摆物品图标 */
export function paintPedestal(): HTMLCanvasElement {
  const p = new Pix(T, T + 4);
  for (let y = T - 4; y < T + 4; y++) for (let x = 2; x < 14; x++) p.set(x, y, y === T - 4 ? STONE[4] : x === 2 ? STONE[3] : STONE[2]);
  return p.outlineTinted().canvas();
}

/** 家园传送门：石拱门，中间一团旋转的紫青色光（城里和岛上共用） */
export const PORTAL_W = 40;
export const PORTAL_H = 46;
export function paintPortal(): HTMLCanvasElement {
  const p = new Pix(PORTAL_W, PORTAL_H);
  const cx = PORTAL_W / 2 - 0.5;
  const cy = 22;
  for (let y = 0; y < PORTAL_H; y++) for (let x = 0; x < PORTAL_W; x++) {
    const dx = x - cx;
    const dy = y - cy;
    const r = Math.hypot(dx / 1.0, dy / 1.15);
    // 拱：上半圆 + 两根柱子
    const pillar = Math.abs(dx) >= 13 && Math.abs(dx) <= 19 && y >= cy && y < PORTAL_H - 4;
    const arch = y < cy && r >= 13 && r <= 19;
    if (pillar || arch) p.set(x, y, STONE[(dx < 0 ? 3 : 2) - (phash(x, y, 2) < 0.2 ? 1 : 0)]);
  }
  // 台阶
  for (let y = PORTAL_H - 4; y < PORTAL_H; y++) for (let x = 1; x < PORTAL_W - 1; x++) p.set(x, y, y === PORTAL_H - 4 ? STONE[4] : STONE[2]);
  // 拱顶嵌一颗晶石
  p.rect(cx - 1, 2, 3, 3, '#8ae8ff');
  p.set(cx, 2, '#ffffff');
  return p.outlineTinted().canvas();
}
/** 传送门里的光（单独一张图，场景里旋转、闪烁） */
export function paintPortalSwirl(): HTMLCanvasElement {
  const S = 26;
  const p = new Pix(S, S);
  const c = S / 2 - 0.5;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x - c;
    const dy = y - c;
    const r = Math.hypot(dx, dy) / (S / 2);
    if (r > 1) continue;
    const a = Math.atan2(dy, dx) + r * 5;
    const band = (Math.sin(a * 3) + 1) / 2;
    p.set(x, y, mix(mix('#3a1a7a', '#8a5af0', band), '#c8fbff', Math.max(0, 1 - r * 1.4)));
  }
  return p.canvas();
}
