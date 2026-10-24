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
  wall_log: 10, wall_dark: 10, wall_window: 10, wall_moss: 10, wall_marble: 10, hedge: 8, fence_iron: 8, door_gold: 10, door_arch: 14,
  sofa: 6, armchair: 8, stool: 2, dining_table: 4, desk: 6, cabinet: 12, nightstand: 4, dresser: 12, mirror: 16, clock: 20,
  piano: 10, bathtub: 4, candelabra: 12, globe: 10, easel: 16, weapon_rack: 12, armor_stand: 16, barrel: 6, crates: 10, vase: 8,
  fishtank: 8, cat_bed: 0, rug_long: 0, st_atelier: 10,
  fountain: 14, pond: 0, pine_tree: 30, cherry_tree: 26, bush: 4, rock: 4, haystack: 8, scarecrow: 16, signpost: 12, mailbox: 8,
  campfire: 2, torch: 14, stone_lantern: 14, tent: 10, beehive: 6, dog_house: 10, birdbath: 6, garden_bed: 2, windmill: 34,
};

const WOOD = ['#3a2416', '#5e3a22', '#7e5232', '#a06c40', '#c48a56'];
const DARKWOOD = ['#22140c', '#3a2216', '#523020', '#6a402a', '#86563a'];
const STONE = ['#2e2c34', '#4a4752', '#6a6672', '#8e8a96', '#b4b0ba'];
const BRICK = ['#4a1a14', '#7a2a1e', '#a03a26', '#c05a3a', '#d87a56'];
const PLASTER = ['#7a7468', '#a8a294', '#cfc9ba', '#e6e1d4', '#f6f2e8'];
const IRON = ['#24282e', '#3c434c', '#5a646e', '#7e8a94', '#aab4bc'];
const COPPER = ['#4a2414', '#7a3e20', '#b06a3a', '#d8925a', '#f0b880'];
const LEAF = ['#1e3a1a', '#2e5a26', '#468232', '#68a840', '#8ac85a'];
const GOLD = ['#5a3a0a', '#8a6014', '#c0901e', '#e8b84a', '#fff0a0'];
const MARBLE = ['#8a8494', '#b4aec0', '#d8d2e2', '#ece8f2', '#ffffff'];
const BIRCH = ['#6a5a40', '#a8946a', '#cdb88a', '#e2d2a8', '#f4ead0'];
const PINE = ['#0e2a1e', '#1a4030', '#285a40', '#3a7652', '#58966a'];
const SAKURA = ['#8a3a5a', '#c05a82', '#e888aa', '#f8b4cc', '#ffe0ea'];
const CLOTH_R = ['#4a1418', '#7a2228', '#a8343a', '#c85a5a', '#e88a86'];
const CLOTH_G = ['#14361e', '#22502c', '#34703e', '#4e9456', '#7ab87a'];
const WATER = ['#1a3a6a', '#2a5a9a', '#3a7ac0', '#6aa8e0', '#b8e0ff'];
const HAY = ['#6a4a14', '#9a7424', '#c8a03a', '#e2c45a', '#f4e08a'];

const WALLS: Record<string, string[]> = {
  wall_wood: WOOD, wall_stone: STONE, wall_brick: BRICK, wall_white: PLASTER,
  wall_log: WOOD, wall_dark: DARKWOOD, wall_window: WOOD, wall_moss: STONE, wall_marble: MARBLE, hedge: LEAF,
};

/**
 * 墙：16 宽、16+UP 高。mask 是上右下左哪边连着墙（1/2/4/8）。
 * 墙顶是一条亮色的压顶，正面（下边没连墙时）露出墙面和纹理。
 */
export function paintWall(id: string, mask: number): HTMLCanvasElement {
  const up = UP[id] ?? 10;
  const H = T + up;
  const p = new Pix(T, H);
  if (id === 'fence') return paintFence(mask);
  if (id === 'fence_iron') return paintIronFence(mask);
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
        if (id === 'wall_log') col = fy % 3 === 2 ? pal[0] : fy % 3 === 0 ? pal[3] : pal[2];
        if (id === 'wall_dark' && x % 4 === 0) col = pal[0];
        if (id === 'wall_window') {
          col = x % 5 === 0 ? pal[0] : pal[1];
          if (fy >= 1 && fy <= 6 && x >= 4 && x <= 11) col = fy === 1 || fy === 6 || x === 4 || x === 11 ? pal[3] : fy === 4 || x === 8 ? pal[3] : (x + fy) % 5 === 0 ? '#d8f0ff' : '#7ab0d8';
        }
        if (id === 'wall_moss') {
          if (fy === 4 || (fy < 4 ? (x + 1) % 6 === 0 : (x + 4) % 6 === 0)) col = pal[0];
          if (phash(x, y, 11) < (fy < 3 ? 0.45 : 0.18)) col = phash(x, y, 12) < 0.5 ? LEAF[2] : LEAF[1];
        }
        if (id === 'wall_marble') col = fy === 0 ? pal[4] : fy >= faceH - 1 ? pal[1] : (x * 3 + fy * 5) % 13 === 0 ? pal[1] : pal[3];
        if (id === 'hedge') col = phash(x, y, 13) < 0.3 ? pal[1] : phash(x, y, 14) < 0.2 ? pal[3] : pal[2];
        p.set(x, y, col);
      }
    }
  }
  if (!s) for (let x = x0; x < x1; x++) p.set(x, H - 1, pal[0]);
  return p.outlineTinted().canvas();
}

function paintIronFence(mask: number): HTMLCanvasElement {
  const up = UP.fence_iron;
  const p = new Pix(T, T + up);
  const base = T + up - 3;
  const bar = (x: number) => { for (let y = base - 13; y <= base; y++) p.set(x, y, IRON[2]); p.set(x, base - 14, IRON[4]); p.set(x - 1, base - 13, IRON[3]); p.set(x + 1, base - 13, IRON[3]); };
  for (const x of [3, 7, 11]) bar(x);
  const x0 = mask & 8 ? 0 : 2;
  const x1 = mask & 2 ? T : 14;
  for (let x = x0; x < x1; x++) { p.set(x, base - 10, IRON[3]); p.set(x, base - 2, IRON[1]); }
  if (mask & 1) for (let y = up - 2; y < base - 13; y++) p.set(7, y, IRON[2]);
  if (mask & 4) for (let y = base; y < T + up; y++) p.set(7, y, IRON[2]);
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
      case 'floor_birch': {
        const plank = Math.floor(i / 4);
        const seam = (j + plank * 5 + y * 3) % 16 === 0;
        col = i % 4 === 3 || seam ? BIRCH[1] : n < 0.1 ? BIRCH[2] : BIRCH[3];
        break;
      }
      case 'floor_herring': {
        const k = (i + j) % 8;
        const d = (Math.floor((i - j + 64) / 4) + Math.floor((i + j) / 8)) % 2;
        col = k === 7 || (i - j + 64) % 4 === 0 ? DARKWOOD[2] : d ? WOOD[3] : WOOD[2];
        break;
      }
      case 'floor_check':
        col = (Math.floor(i / 8) + Math.floor(j / 8)) % 2 ? (n < 0.1 ? '#2a2830' : '#36343c') : n < 0.1 ? '#dcd8e0' : '#ece8f0';
        break;
      case 'floor_mosaic': {
        const cols = ['#3a6ab0', '#e0c050', '#c84a4a', '#ece6d6', '#4a9a7a'];
        const ci = (i % 4 === 3 || j % 4 === 3) ? -1 : Math.floor(phash(x * 4 + Math.floor(i / 4), y * 4 + Math.floor(j / 4), 17) * 5);
        col = ci < 0 ? '#5a5248' : cols[ci];
        break;
      }
      case 'carpet_green':
        col = i === 0 || j === 0 || i === 15 || j === 15 ? '#c8a050' : (i % 8 === 4 && j % 8 === 4) || ((i + 4) % 8 === 0 && (j + 4) % 8 === 0) ? '#e8d07a' : n < 0.1 ? CLOTH_G[1] : CLOTH_G[2];
        break;
      case 'carpet_purple':
        col = i === 0 || j === 0 || i === 15 || j === 15 ? '#e0c060' : Math.abs((i % 8) - 3.5) + Math.abs((j % 8) - 3.5) < 2 ? '#e0c060' : (i + j) % 4 === 0 ? '#4a2a6a' : '#5e3a86';
        break;
      case 'floor_hay':
        col = n < 0.25 ? HAY[1] : n < 0.5 ? HAY[3] : (i * 3 + j) % 7 === 0 ? HAY[4] : HAY[2];
        break;
      case 'gravel':
        col = n < 0.2 ? '#6a645a' : n < 0.45 ? '#9a9488' : n < 0.7 ? '#b4aea0' : '#8a8478';
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
      if (!paintMore(id, p, W, H, up, box)) box(1, 1, W - 2, H - 2, COPPER, 3);
  }
  return p.outlineTinted().canvas();
}

type Box = (x: number, y: number, bw: number, bh: number, pal: string[], topH?: number) => void;
/** 10-24 新增的家具和户外摆件 */
function paintMore(id: string, p: Pix, W: number, H: number, up: number, box: Box): boolean {
  const legs = (xs: number[], from: number, pal = WOOD) => { for (const lx of xs) for (let y = from; y < H; y++) { p.set(lx, y, pal[1]); p.set(lx + 1, y, pal[0]); } };
  const cx = Math.floor(W / 2);
  switch (id) {
    case 'door_gold':
      box(1, 2, 14, H - 2, MARBLE, 2);
      for (let y = 4; y < H - 1; y++) for (let x = 3; x < 13; x++) p.set(x, y, x === 3 ? DARKWOOD[4] : (x - 3) % 3 === 0 ? DARKWOOD[1] : DARKWOOD[3]);
      for (let x = 3; x < 13; x++) { p.set(x, 7, GOLD[3]); p.set(x, H - 6, GOLD[3]); }
      p.rect(10, Math.floor(H / 2) + 1, 2, 3, GOLD[4]);
      return true;
    case 'door_arch': {
      // 两根木柱，上面一圈开花的藤蔓
      for (const lx of [1, 13]) for (let y = 6; y < H; y++) { p.set(lx, y, WOOD[3]); p.set(lx + 1, y, WOOD[1]); }
      for (let i = 0; i <= 14; i++) {
        const x = 1 + i;
        const y = 7 - Math.round(Math.sin((i / 14) * Math.PI) * 6);
        p.set(x, y, LEAF[2]); p.set(x, y + 1, LEAF[1]);
        if (i % 3 === 0) p.set(x, y - 1, ['#ff8aaa', '#ffffff', '#f0c850'][i % 9 === 0 ? 0 : i % 2]);
      }
      for (const lx of [0, 14]) for (let y = 8; y < H - 2; y += 3) { p.set(lx + (y % 2), y, LEAF[3]); if (y % 6 === 2) p.set(lx + 1, y + 1, '#ff8aaa'); }
      return true;
    }
    case 'sofa':
      box(0, 0, W, 9, CLOTH_R, 2);
      box(0, 7, W, H - 9, CLOTH_R, 3);
      for (const ax of [0, W - 4]) box(ax, 4, 4, H - 7, CLOTH_R, 2);
      for (let x = 5; x < W - 5; x++) p.set(x, 11, CLOTH_R[1]);
      p.set(cx, 11, CLOTH_R[0]);
      legs([2, W - 4], H - 3, DARKWOOD);
      return true;
    case 'armchair':
      box(2, 0, 12, 10, CLOTH_G, 2);
      box(2, 9, 12, H - 12, CLOTH_G, 3);
      box(0, 6, 3, H - 9, CLOTH_G, 2);
      box(13, 6, 3, H - 9, CLOTH_G, 2);
      legs([2, 12], H - 3, DARKWOOD);
      return true;
    case 'stool':
      for (let y = H - 9; y < H - 6; y++) for (let x = 3; x < 13; x++) p.set(x, y, y === H - 9 ? WOOD[4] : WOOD[3]);
      legs([4, 10], H - 6);
      return true;
    case 'dining_table':
      box(0, up, W, H - up - 6, WOOD, H - up - 9);
      legs([2, W - 4], H - 6);
      // 桌上几只盘子和一根蜡烛
      for (const px of [8, 22, 36]) for (const py of [up + 5, up + 18]) { p.rect(px - 2, py, 5, 3, '#ece6d6'); p.set(px, py + 1, '#c86a3a'); }
      p.rect(cx, up + 9, 2, 5, '#f4ead0'); p.set(cx, up + 8, '#ffd060');
      return true;
    case 'desk':
      box(0, up, W, 7, WOOD, 3);
      box(W - 11, up + 7, 10, H - up - 7, WOOD, 1);
      p.set(W - 6, up + 11, GOLD[3]);
      legs([1], up + 7);
      // 书和墨水瓶
      p.rect(4, up - 3, 7, 3, '#3a6ab0'); p.rect(5, up - 4, 5, 1, '#ece6d6');
      p.rect(14, up - 3, 3, 3, '#1a1a2a'); p.set(15, up - 5, '#ece6d6'); p.set(16, up - 6, '#ece6d6');
      return true;
    case 'cabinet':
      box(0, 0, W, H, WOOD, 3);
      for (const dx of [2, cx + 1]) { for (let y = 5; y < H - 3; y++) for (let x = dx; x < dx + cx - 3; x++) p.set(x, y, x === dx || y === 5 ? WOOD[3] : WOOD[2]); }
      p.set(cx - 2, Math.floor(H / 2), GOLD[3]); p.set(cx + 2, Math.floor(H / 2), GOLD[3]);
      p.rect(3, 0, 4, 1, '#ece6d6'); p.rect(W - 8, 0, 3, 1, '#c86a3a');
      return true;
    case 'nightstand':
      box(2, up, 12, H - up, WOOD, 3);
      for (let x = 4; x < 12; x++) p.set(x, up + 7, WOOD[0]);
      p.set(8, up + 5, GOLD[3]); p.set(8, up + 10, GOLD[3]);
      p.rect(9, up - 3, 3, 3, '#f4ead0'); p.set(10, up - 4, '#ffd060');
      return true;
    case 'dresser':
      box(0, 9, W, H - 9, DARKWOOD, 3);
      for (const dy of [14, 20]) { for (let x = 2; x < W - 2; x++) p.set(x, dy, DARKWOOD[0]); p.set(cx, dy + 2, GOLD[3]); }
      // 镜子
      for (let y = 0; y < 10; y++) for (let x = cx - 6; x < cx + 6; x++) {
        const edge = y === 0 || x === cx - 6 || x === cx + 5;
        p.set(x, y, edge ? GOLD[3] : (x + y) % 6 === 0 ? '#ffffff' : '#b8d8e8');
      }
      return true;
    case 'mirror':
      for (let y = 0; y < H - 3; y++) for (let x = 3; x < 13; x++) {
        const edge = y === 0 || x === 3 || x === 12 || y === H - 4;
        p.set(x, y, edge ? WOOD[3] : (x - y + 40) % 7 === 0 ? '#ffffff' : '#a8cce0');
      }
      legs([4, 10], H - 3);
      return true;
    case 'clock':
      box(3, 0, 10, H, DARKWOOD, 2);
      for (let y = 3; y < 11; y++) for (let x = 5; x < 11; x++) p.set(x, y, Math.hypot(x - 7.5, y - 6.5) < 3.2 ? '#f4ead0' : DARKWOOD[2]);
      p.set(8, 5, '#1a1a1a'); p.set(8, 6, '#1a1a1a'); p.set(9, 7, '#1a1a1a');
      for (let y = 13; y < H - 4; y++) p.set(8, y, GOLD[2]);
      p.rect(7, H - 7, 3, 3, GOLD[3]);
      return true;
    case 'piano':
      box(0, 0, W, H - 3, ['#08080c', '#14141a', '#22222a', '#3a3a46', '#5a5a6a'], 3);
      for (let x = 2; x < W - 2; x++) { p.set(x, 13, '#f4f0e8'); p.set(x, 14, '#f4f0e8'); if (x % 3 === 0) { p.set(x, 13, '#14141a'); } }
      p.rect(cx - 4, 4, 8, 5, '#f4ead0'); for (let x = cx - 3; x < cx + 3; x += 2) p.set(x, 6, '#1a1a1a');
      legs([2, W - 4], H - 3, IRON);
      return true;
    case 'bathtub':
      for (let y = up; y < H - 2; y++) for (let x = 0; x < W; x++) {
        const rim = y === up || x === 0 || x === W - 1 || y === H - 3;
        const inner = !rim && y < up + 7 && x > 1 && x < W - 2;
        p.set(x, y, rim ? '#ffffff' : inner ? (phash(x, y, 4) < 0.15 ? '#ffffff' : WATER[3]) : '#e4e0ea');
      }
      legs([2, W - 4], H - 2, GOLD);
      p.rect(W - 5, up - 3, 2, 3, GOLD[3]);
      return true;
    case 'candelabra':
      for (let y = 8; y < H - 2; y++) p.set(8, y, GOLD[3]);
      p.rect(5, H - 2, 7, 2, GOLD[2]);
      for (let x = 4; x <= 12; x++) p.set(x, 9, GOLD[2]);
      for (const x of [4, 8, 12]) { p.rect(x, 5, 1, 4, '#f4ead0'); p.set(x, 4, '#ffd060'); p.set(x, 3, '#fff4c0'); }
      return true;
    case 'globe':
      for (let y = 0; y < 12; y++) for (let x = 2; x < 14; x++) {
        const d = Math.hypot(x - 7.5, y - 5.5);
        if (d > 5.6) continue;
        p.set(x, y, phash(Math.floor(x / 2), Math.floor(y / 2), 23) < 0.4 ? LEAF[2] : WATER[2]);
      }
      for (let y = -1; y < 12; y++) p.set(13 - Math.floor(y / 6), y, GOLD[3]);
      for (let y = 12; y < H - 2; y++) p.set(8, y, WOOD[2]);
      p.rect(4, H - 2, 9, 2, WOOD[3]);
      return true;
    case 'easel':
      p.line(4, H - 1, 8, 0, WOOD[2]); p.line(12, H - 1, 8, 0, WOOD[2]); p.line(8, 6, 8, H - 1, WOOD[1]);
      for (let y = 3; y < 15; y++) for (let x = 2; x < 14; x++) p.set(x, y, y === 3 || y === 14 || x === 2 || x === 13 ? WOOD[3] : '#f4ead0');
      p.blob(6, 9, 2.5, 2, ['#2a6a3a', '#3a8a4a', '#5aaa5a', '#8ad87a'], 2);
      p.rect(9, 6, 3, 2, '#e8b84a'); p.rect(4, 12, 8, 1, '#3a6ab0');
      for (let x = 2; x < 14; x++) p.set(x, 16, WOOD[3]);
      return true;
    case 'weapon_rack':
      box(0, H - 4, W, 4, WOOD, 1);
      for (const lx of [1, W - 3]) for (let y = 2; y < H - 4; y++) { p.set(lx, y, WOOD[3]); p.set(lx + 1, y, WOOD[1]); }
      for (let x = 1; x < W - 1; x++) { p.set(x, 4, WOOD[3]); p.set(x, H - 9, WOOD[2]); }
      // 剑、长枪、斧
      for (let y = 2; y < H - 5; y++) p.set(8, y, IRON[4]); p.rect(6, H - 11, 5, 1, GOLD[3]);
      for (let y = 0; y < H - 5; y++) p.set(16, y, WOOD[2]); p.rect(15, 0, 3, 3, IRON[3]);
      for (let y = 3; y < H - 5; y++) p.set(24, y, WOOD[2]); p.rect(24, 4, 5, 5, IRON[3]); p.set(28, 5, IRON[4]);
      return true;
    case 'armor_stand':
      for (let y = 10; y < H - 2; y++) p.set(8, y, WOOD[2]);
      p.rect(4, H - 2, 9, 2, WOOD[3]);
      p.blob(8, 4, 3.5, 3.5, IRON.slice(1), 7); // 头盔
      p.rect(6, 5, 5, 1, '#14141a');
      for (let y = 9; y < 20; y++) for (let x = 3 + Math.floor((y - 9) / 5); x < 13 - Math.floor((y - 9) / 5); x++) p.set(x, y, x < 6 ? IRON[4] : y === 14 ? IRON[1] : IRON[3]);
      p.rect(1, 9, 3, 6, IRON[2]); p.rect(12, 9, 3, 6, IRON[2]);
      return true;
    case 'barrel':
      for (let y = up - 4; y < H - 1; y++) {
        const half = 5 + Math.round(Math.sin(((y - (up - 4)) / (H - up + 3)) * Math.PI) * 1.5);
        for (let x = 8 - half; x < 8 + half; x++) p.set(x, y, x === 8 - half ? WOOD[4] : (x + 1) % 3 === 0 ? WOOD[1] : WOOD[3]);
      }
      for (let x = 2; x < 14; x++) { p.set(x, up - 1, IRON[2]); p.set(x, H - 5, IRON[2]); }
      for (let x = 4; x < 12; x++) p.set(x, up - 4, WOOD[4]);
      return true;
    case 'crates':
      box(1, H - 13, 14, 13, WOOD, 3); box(15, H - 11, 16, 11, WOOD, 3); box(5, H - 23, 12, 10, WOOD, 3);
      for (const [x0, y0, w0, h0] of [[1, H - 13, 14, 13], [15, H - 11, 16, 11], [5, H - 23, 12, 10]]) { p.line(x0 + 1, y0 + 3, x0 + w0 - 2, y0 + h0 - 2, WOOD[0]); }
      return true;
    case 'vase':
      for (let y = H - 10; y < H; y++) {
        const k = (y - (H - 10)) / 10;
        const half = 2 + Math.round(Math.sin(k * Math.PI) * 3);
        for (let x = 8 - half; x < 8 + half; x++) p.set(x, y, x < 8 - half + 2 ? '#7ab0e8' : y === H - 6 ? '#ffffff' : '#3a6ab0');
      }
      for (const [fx, fy, c] of [[6, 4, '#ff8aaa'], [9, 3, '#ffffff'], [11, 6, '#f0c850'], [5, 7, '#e84a6a']] as [number, number, string][]) {
        p.line(8, H - 10, fx, fy + 1, LEAF[1]); p.rect(fx - 1, fy - 1, 3, 3, c); p.set(fx, fy, '#fff4c0');
      }
      return true;
    case 'fishtank':
      for (let y = up - 4; y < H - 4; y++) for (let x = 1; x < W - 1; x++) {
        const edge = x === 1 || x === W - 2 || y === up - 4;
        p.set(x, y, edge ? '#c8e0ee' : y > H - 8 ? '#d8c890' : phash(x, y, 31) < 0.05 ? '#ffffff' : WATER[2]);
      }
      box(0, H - 4, W, 4, DARKWOOD, 1);
      for (const [fx, fy, c] of [[8, up + 2, '#ff8a3a'], [20, up + 6, '#f0c850'], [14, up, '#e84a6a']] as [number, number, string][]) { p.rect(fx, fy, 3, 2, c); p.set(fx - 1, fy, c); p.set(fx + 3, fy + 1, '#000000'); }
      for (let y = up + 2; y < H - 7; y++) p.set(26 + (y % 2), y, LEAF[3]);
      return true;
    case 'cat_bed': {
      for (let y = 4; y < 15; y++) for (let x = 1; x < 15; x++) {
        const d = Math.hypot((x - 7.5) / 6.5, (y - 9.5) / 5);
        if (d > 1) continue;
        p.set(x, y, d > 0.7 ? CLOTH_R[3] : CLOTH_R[1]);
      }
      // 一只蜷着的橘猫
      p.blob(8, 9, 3.5, 2.5, ['#8a4a1a', '#c8742a', '#e8984a', '#f8c080'], 9);
      p.set(5, 7, '#c8742a'); p.set(6, 6, '#c8742a'); p.set(5, 6, '#e8984a'); p.set(6, 8, '#1a1a1a');
      return true;
    }
    case 'rug_long':
      for (let y = 3; y < H - 3; y++) for (let x = 2; x < W - 2; x++) {
        const edge = y === 3 || y === H - 4 || x === 2 || x === W - 3;
        const inner = y === 6 || y === H - 7 || x === 5 || x === W - 6;
        p.set(x, y, edge ? '#e0c060' : inner ? '#e0c060' : Math.abs(((x - 2) % 12) - 6) + Math.abs(((y - 3) % 12) - 6) < 3 ? '#c84a4a' : CLOTH_G[2]);
      }
      for (let x = 2; x < W - 2; x += 2) { p.set(x, 2, '#e0c060'); p.set(x, H - 3, '#e0c060'); }
      return true;
    case 'st_atelier':
      box(0, up, W, 8, MARBLE, 4);
      legs([1, W - 3], up + 8, IRON);
      // 一颗大水晶和几样珍材
      for (let y = 0; y < up; y++) { const half = Math.floor((y < 4 ? y : up - y) * 0.9); for (let x = 9 - half; x <= 9 + half; x++) p.set(x, y, x < 9 ? '#c8a8ff' : '#8a5af0'); }
      p.set(9, 1, '#ffffff');
      p.rect(17, up - 3, 4, 3, '#e8b84a'); p.rect(23, up - 4, 2, 4, '#a0e0a0'); p.rect(26, up - 2, 4, 2, '#d86a3a');
      return true;
    case 'fountain': {
      // 圆形石池（俯视略扁），中间两层水盘往下淌水
      const c0 = W / 2 - 0.5;
      const cy = H - 17;
      const rx = 22;
      const ry = 13;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const d = Math.hypot((x - c0) / rx, (y - cy) / ry);
        const front = Math.abs(x - c0) <= rx && y > cy && y <= cy + ry * Math.sqrt(Math.max(0, 1 - ((x - c0) / rx) ** 2)) + 5;
        if (d <= 1) p.set(x, y, d > 0.84 ? (y < cy ? STONE[4] : STONE[3]) : phash(x, y, 8) < 0.05 ? '#ffffff' : WATER[d < 0.45 ? 3 : 2]);
        else if (front) p.set(x, y, (x + Math.floor(y / 3)) % 7 === 0 ? STONE[1] : STONE[2]);
      }
      const col = (y0: number, y1: number, w = 2) => { for (let y = y0; y < y1; y++) for (let x = -w; x <= w; x++) p.set(c0 + x, y, x <= -w + 1 ? STONE[4] : x >= w ? STONE[1] : STONE[3]); };
      const dish = (y: number, r: number) => { for (let x = Math.ceil(c0 - r); x <= c0 + r; x++) { p.set(x, y, STONE[4]); p.set(x, y + 1, STONE[2]); p.set(x, y - 1, Math.abs(x - c0) < r - 1 ? WATER[3] : STONE[3]); } };
      col(14, cy + 2, 3);
      dish(cy - 4, 8);
      col(6, 14, 1);
      dish(13, 5);
      for (let i = 0; i < 6; i++) { p.set(c0 - 6 - i * 0.3, 14 + i * 2, WATER[4]); p.set(c0 + 6 + i * 0.3, 14 + i * 2, WATER[4]); }
      p.blob(c0, cy + 4, 9, 3, WATER.slice(1), 6);
      for (let i = 0; i < 5; i++) { p.set(c0 - 9 - i * 0.4, cy - 3 + i * 2, WATER[4]); p.set(c0 + 9 + i * 0.4, cy - 3 + i * 2, WATER[4]); }
      p.rect(c0 - 1, 1, 3, 4, '#d8f0ff'); p.set(c0, 0, '#ffffff');
      return true;
    }
    case 'pond':
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const d = Math.hypot((x - W / 2 + 0.5) / (W / 2 - 1), (y - H / 2 + 0.5) / (H / 2 - 2)) + (phash(x, y, 3) - 0.5) * 0.08;
        if (d > 1) continue;
        p.set(x, y, d > 0.85 ? STONE[3] : phash(x, y, 9) < 0.04 ? '#ffffff' : WATER[d > 0.6 ? 2 : 1]);
      }
      p.blob(10, 12, 3, 2, LEAF, 4); p.set(10, 11, '#ff8aaa');
      p.blob(22, 20, 2.5, 1.5, LEAF, 5);
      p.rect(19, 9, 3, 1, '#ff8a3a');
      return true;
    case 'pine_tree':
      p.trunk(8, H - 12, H - 1, 3, WOOD);
      for (let k = 0; k < 4; k++) {
        const top = 2 + k * 8 + (H - 46);
        for (let y = top; y < top + 10; y++) {
          const half = Math.min(7.5, 1 + (y - top) * (0.55 + k * 0.08));
          for (let x = Math.floor(8 - half); x <= 8 + half; x++) p.set(x, y, x < 8 - half + 2 ? PINE[3] : phash(x, y, 7) < 0.2 ? PINE[1] : PINE[2]);
        }
      }
      p.set(8, 1, PINE[4]);
      return true;
    case 'cherry_tree':
      p.trunk(8, H - 14, H - 1, 4, DARKWOOD);
      p.line(8, H - 12, 3, H - 18, DARKWOOD[2]); p.line(8, H - 12, 13, H - 19, DARKWOOD[2]);
      p.blob(8, H - 26, 7.5, 9, SAKURA, 11);
      p.blob(4, H - 19, 4.5, 4, SAKURA, 12);
      p.blob(12, H - 19, 4.5, 4, SAKURA, 13);
      for (const [x, y] of [[2, H - 3], [12, H - 2], [6, H - 1]]) p.set(x, y, SAKURA[3]);
      return true;
    case 'bush':
      p.blob(8, H - 7, 7, 6, LEAF, 17);
      p.set(5, H - 9, '#e84a6a'); p.set(10, H - 10, '#e84a6a'); p.set(11, H - 6, '#e84a6a');
      return true;
    case 'rock':
      p.blob(8, H - 7, 7, 6, STONE.slice(1), 19);
      p.blob(12, H - 4, 3, 3, STONE.slice(1), 20);
      p.set(6, H - 10, LEAF[2]); p.set(7, H - 10, LEAF[3]);
      return true;
    case 'haystack':
      for (let y = 2; y < H; y++) {
        const half = Math.min(7, 2 + (y - 2) * 0.55);
        for (let x = Math.floor(8 - half); x <= 8 + half; x++) p.set(x, y, phash(x, y, 2) < 0.3 ? HAY[1] : x < 8 - half + 2 ? HAY[4] : HAY[2]);
      }
      p.line(3, H - 1, 1, H - 3, HAY[3]); p.line(13, H - 1, 15, H - 4, HAY[3]);
      return true;
    case 'scarecrow':
      for (let y = 4; y < H; y++) p.set(8, y, WOOD[2]);
      for (let x = 1; x < 15; x++) p.set(x, 11, WOOD[2]);
      for (let y = 10; y < 19; y++) for (let x = 4; x < 12; x++) p.set(x, y, (x + y) % 5 === 0 ? '#6a8ac8' : '#4a6aa8');
      for (const x of [1, 2, 13, 14]) p.set(x, 12, HAY[3]);
      p.blob(8, 6, 3, 3, HAY, 3);
      p.set(7, 6, '#1a1a1a'); p.set(9, 6, '#1a1a1a');
      for (let x = 3; x < 14; x++) p.set(x, 3, '#6a4a2a'); p.rect(5, 0, 7, 3, '#7a5a3a');
      return true;
    case 'signpost':
      for (let y = 4; y < H; y++) { p.set(7, y, WOOD[3]); p.set(8, y, WOOD[1]); }
      for (let y = 4; y < 9; y++) for (let x = 1; x < 15 - (y === 4 || y === 8 ? 1 : 0); x++) p.set(x, y, y === 4 ? WOOD[4] : WOOD[3]);
      for (let y = 11; y < 15; y++) for (let x = 2 + (y === 11 || y === 14 ? 1 : 0); x < 14; x++) p.set(x, y, WOOD[2]);
      for (let x = 3; x < 12; x += 2) { p.set(x, 6, WOOD[0]); p.set(x + 1, 13, WOOD[0]); }
      return true;
    case 'mailbox':
      for (let y = 10; y < H; y++) { p.set(7, y, WOOD[3]); p.set(8, y, WOOD[1]); }
      for (let y = 2; y < 11; y++) for (let x = 3; x < 13; x++) p.set(x, y, y < 4 ? '#3a6ab0' : x === 3 ? '#4a7ac0' : '#2a5a9a');
      for (let y = 2; y < 7; y++) p.set(13, y, '#c84a4a'); p.rect(13, 2, 3, 2, '#c84a4a');
      p.rect(5, 7, 6, 1, '#1a2a4a');
      return true;
    case 'campfire':
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; p.blob(8 + Math.cos(a) * 6, H - 6 + Math.sin(a) * 3, 1.6, 1.4, STONE.slice(1), k); }
      p.line(3, H - 4, 13, H - 8, WOOD[2]); p.line(3, H - 8, 13, H - 4, WOOD[1]);
      for (let x = 5; x < 12; x++) { const fh = 3 + Math.floor(phash(x, 5, 1) * 7); for (let y = H - 6 - fh; y < H - 5; y++) p.set(x, y, y < H - 5 - fh + 2 ? '#ffe070' : '#ff7a2a'); }
      return true;
    case 'torch':
      for (let y = 8; y < H; y++) { p.set(7, y, WOOD[3]); p.set(8, y, WOOD[1]); }
      p.rect(6, 7, 4, 3, '#5a4a3a');
      for (let y = 0; y < 7; y++) { const half = y < 2 ? 0 : y < 4 ? 1 : 2; for (let x = 8 - half; x <= 8 + half - 1 + (y > 2 ? 1 : 0); x++) p.set(x, y, y < 3 ? '#ffe070' : '#ff8a2a'); }
      return true;
    case 'stone_lantern':
      p.rect(3, H - 3, 10, 3, STONE[2]);
      p.rect(6, H - 12, 4, 9, STONE[3]);
      box(3, 9, 10, 8, STONE, 1);
      p.rect(5, 11, 6, 4, '#ffd070'); p.rect(7, 11, 2, 4, STONE[1]);
      for (let y = 3; y < 9; y++) for (let x = 8 - (y - 2); x <= 7 + (y - 2); x++) p.set(x, y, y === 8 ? STONE[4] : STONE[3]);
      p.set(8, 2, STONE[4]);
      return true;
    case 'tent':
      for (let y = 0; y < H - 1; y++) {
        const half = Math.min(W / 2 - 1, 1 + y * 0.62);
        for (let x = Math.floor(cx - half); x < cx + half; x++) {
          const side = x < cx ? '#d86a3a' : '#b84a2a';
          p.set(x, y, (x + y) % 9 === 0 ? '#f0d0a0' : side);
        }
      }
      for (let y = H - 14; y < H - 1; y++) { const half = (y - (H - 14)) * 0.35; for (let x = Math.floor(cx - half); x < cx + half; x++) p.set(x, y, '#2a140c'); }
      p.line(cx, 0, cx, -3, WOOD[2]); p.set(cx + 1, 0, '#f0c850');
      return true;
    case 'beehive':
      for (let y = 2; y < H - 3; y++) for (let x = 3; x < 13; x++) p.set(x, y, (y - 2) % 4 === 3 ? HAY[1] : x === 3 ? HAY[4] : HAY[3]);
      for (let x = 2; x < 14; x++) p.set(x, 1, WOOD[3]);
      legs([3, 11], H - 3);
      p.rect(7, H - 7, 2, 1, '#1a1a1a');
      for (const [x, y] of [[1, 4], [14, 8], [12, 0]]) { p.set(x, y, '#f0c850'); p.set(x + 1, y, '#1a1a1a'); }
      return true;
    case 'dog_house':
      for (let y = 9; y < H - 1; y++) for (let x = 3; x < W - 3; x++) p.set(x, y, (x + 1) % 5 === 0 ? WOOD[1] : WOOD[3]);
      for (let y = 0; y < 11; y++) { const half = 2 + y * 1.3; for (let x = Math.floor(cx - half); x < cx + half; x++) p.set(x, y, y === 10 ? BRICK[1] : BRICK[2 + (x < cx ? 1 : 0)]); }
      for (let y = H - 11; y < H - 1; y++) { const half = 4 - Math.max(0, (H - 8 - y)) * 0.6; for (let x = Math.floor(cx - half); x < cx + half; x++) p.set(x, y, '#1a0e08'); }
      p.rect(cx - 3, 12, 6, 2, '#f0e0b0');
      return true;
    case 'birdbath':
      for (let y = 4; y < 8; y++) for (let x = 1 + (y - 4); x < 15 - (y - 4); x++) p.set(x, y, y === 4 ? STONE[4] : STONE[3]);
      p.rect(3, 4, 10, 1, WATER[3]);
      p.rect(6, 8, 4, H - 11, STONE[2]);
      p.rect(4, H - 3, 8, 3, STONE[3]);
      p.rect(10, 1, 3, 3, '#6a8ac8'); p.set(13, 2, '#f0c850'); p.set(11, 1, '#1a1a1a');
      return true;
    case 'garden_bed':
      box(0, 3, W, H - 3, WOOD, 1);
      for (let y = 5; y < H - 2; y++) for (let x = 2; x < W - 2; x++) p.set(x, y, (y % 3 === 0) ? '#3a2416' : '#5a3a22');
      for (let x = 4; x < W - 4; x += 5) { p.set(x, 3, LEAF[3]); p.set(x - 1, 4, LEAF[2]); p.set(x + 1, 4, LEAF[2]); p.set(x, 8, LEAF[3]); p.set(x + 1, 9, LEAF[2]); p.set(x, 12, '#e86a2a'); }
      return true;
    case 'windmill': {
      // 塔身 + 四片风叶
      for (let y = 16; y < H; y++) { const half = 6 + (y - 16) * 0.12; for (let x = Math.floor(cx - half); x < cx + half; x++) p.set(x, y, x < cx - half + 3 ? PLASTER[4] : (x + y) % 9 === 0 ? PLASTER[1] : PLASTER[3]); }
      for (let y = 10; y < 17; y++) { const half = (y - 10) * 1.1; for (let x = Math.floor(cx - half); x < cx + half; x++) p.set(x, y, BRICK[2]); }
      p.rect(cx - 2, H - 7, 4, 7, WOOD[1]);
      p.rect(cx - 2, 22, 4, 4, '#7ab0d8');
      for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        for (let i = 2; i < 15; i++) {
          const x = cx + dx * i;
          const y = 12 + dy * i * 0.75;
          p.set(x, y, WOOD[2]);
          if (i > 4) { p.set(x + dy * 1, y - dx * 0.75, '#ece6d6'); p.set(x + dy * 2, y - dx * 1.5, '#d8d0c0'); }
        }
      }
      p.rect(cx - 1, 11, 3, 3, WOOD[4]);
      return true;
    }
  }
  return false;
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
