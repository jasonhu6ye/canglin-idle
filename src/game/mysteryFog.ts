import Phaser from 'phaser';
import { MYSTERY_BOX } from '../core/realm';
import { tl } from '../i18n';
import { T } from './tiles';

/**
 * 神秘区域（用户 11-01：暂未揭晓）：场景里盖一大片翻涌的黑雾，边上淡出；
 * 空气墙那条线上飘几个「暂未开放」的字。走路被 world.ts 的空气墙挡住。
 */
const FOG_PAD = 28; // 黑雾往外多盖多少格（淡出的那一圈）

/** 一张低分辨率的雾：一格代表 8×8 地块，放大时线性插值，看起来软 */
function paintFog(seed: number, w: number, h: number, pad: number, wisp: boolean) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const hash = (x: number, y: number) => {
    let n = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const vn = (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hash(xi, yi), b = hash(xi + 1, yi), cc = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * sx + (cc - a) * sy + (a - b - cc + d) * sx * sy;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = vn(x / 9, y / 9) * 0.55 + vn(x / 4, y / 4) * 0.3 + vn(x / 2, y / 2) * 0.15;
      // 离方框边多远：里面全黑，外面 pad 格内淡出
      const dx = Math.max(pad - x, x - (w - 1 - pad), 0);
      const dy = Math.max(pad - y, y - (h - 1 - pad), 0);
      const out = Math.hypot(dx, dy);
      // 方框外：几格内从透明到半黑；方框里：再往里几格就全黑
      const inner = Math.min(x - pad, w - 1 - pad - x, y - pad, h - 1 - pad - y);
      const o = (y * w + x) * 4;
      if (wisp) {
        // 上层：一缕缕发光的紫雾，只在雾浓的地方
        const k = Math.max(0, Math.min(1, (n - 0.52) / 0.25));
        const fade = out > 0 ? Math.max(0, 1 - out / pad) : 1;
        img.data[o] = 110;
        img.data[o + 1] = 86;
        img.data[o + 2] = 190;
        img.data[o + 3] = k * k * 0.55 * fade * 255;
        continue;
      }
      const a = out > 0 ? Math.max(0, 1 - out / pad) * (0.6 + n * 0.3) : Math.min(1, 0.9 + inner / 3);
      img.data[o] = 6 + n * 22;
      img.data[o + 1] = 5 + n * 14;
      img.data[o + 2] = 14 + n * 34;
      img.data[o + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function addMysteryFog(scene: Phaser.Scene) {
  const M = MYSTERY_BOX;
  const CELL = 4;
  const pad = Math.round(FOG_PAD / CELL);
  const w = Math.round(M.size / CELL) + pad * 2;
  const h = Math.round(M.size / CELL) + pad * 2;
  const x0 = (M.x - FOG_PAD) * T, y0 = (M.y - FOG_PAD) * T;
  const size = (M.size + FOG_PAD * 2) * T;
  const layers: Phaser.GameObjects.Image[] = [];
  for (const [i, seed] of [[0, 11], [1, 29]] as const) {
    const key = `mystery-fog-${i}`;
    if (!scene.textures.exists(key)) scene.textures.addCanvas(key, paintFog(seed, w, h, pad, i === 1))!.setFilter(Phaser.Textures.FilterMode.LINEAR);
    const img = scene.add.image(x0 + size / 2, y0 + size / 2, key).setDisplaySize(size, size).setDepth(9e6 + i);
    layers.push(img);
  }
  // 上面一层慢慢漂，雾在翻涌
  scene.tweens.add({ targets: layers[1], x: layers[1].x + 14 * T, y: layers[1].y - 4 * T, duration: 26000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  // 空气墙这条线上（南边接冰原）每隔一段立一个提示
  const wallY = (M.y + M.size) * T;
  for (let k = 0; k < 5; k++) {
    const tx = (M.x + ((k + 0.5) / 5) * M.size) * T;
    const t = scene.add.text(tx, wallY + 2 * T, tl('神秘区域 · 暂未开放'), {
      fontFamily: '"PingFang SC","Microsoft YaHei",sans-serif', fontSize: '8px', color: '#d8ccff', stroke: '#140a2a', strokeThickness: 3, resolution: 4,
    }).setOrigin(0.5).setDepth(9e6 + 5).setAlpha(0.9);
    scene.tweens.add({ targets: t, alpha: 0.45, y: t.y - 4, duration: 2200 + k * 300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }
}
