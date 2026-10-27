import Phaser from 'phaser';
import { CROPS } from '../core/data';
import { paintCrop } from './fxArt';
import { T } from './tiles';

/** 田里的土、作物、熟了的闪光：大地图的田和家园农田共用 */
export function cropTex(sc: Phaser.Scene, crop: string, stage: number) {
  const key = `crop-${crop}-${stage}`;
  if (!sc.textures.exists(key)) {
    const c = CROPS.find((x) => x[0] === crop)!;
    sc.textures.addCanvas(key, paintCrop(c[3], c[5], stage));
  }
  return key;
}

/**
 * 地块的土（用户 10-23：种上种子田要有变化）：
 * 空地 = 平整的浅色松土，四角插着小木桩；种下 = 翻成一条条土垄，中间一个埋了种子的小土包；
 * 浇过水 = 土色变深、垄沟里有一点水光
 */
export function soilTex(sc: Phaser.Scene, kind: 'empty' | 'dry' | 'wet') {
  const key = `plot-${kind}`;
  if (!sc.textures.exists(key)) {
    const c = document.createElement('canvas');
    c.width = T;
    c.height = T;
    const g = c.getContext('2d')!;
    const px = (x: number, y: number, col: string) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
    if (kind === 'empty') {
      g.fillStyle = '#6e5232';
      g.fillRect(1, 1, T - 2, T - 2);
      g.fillStyle = '#86663e';
      g.fillRect(2, 2, T - 4, T - 4);
      // 松土的颗粒
      for (let i = 0; i < 18; i++) px(2 + ((i * 7) % (T - 4)), 2 + ((i * 5 + (i >> 2)) % (T - 4)), i % 3 ? '#9a7848' : '#6a4e2e');
      // 四角的小木桩
      for (const [x, y] of [[1, 1], [T - 2, 1], [1, T - 2], [T - 2, T - 2]]) { px(x, y, '#c8a060'); px(x, y + (y < 8 ? 1 : -1), '#7a5a30'); }
    } else {
      const wet = kind === 'wet';
      const [edge, base, ridge, lit] = wet ? ['#1e120a', '#352010', '#4a2c18', '#7a8ca8'] : ['#3a2616', '#563a20', '#6e4a2a', '#94693a'];
      g.fillStyle = edge;
      g.fillRect(1, 1, T - 2, T - 2);
      g.fillStyle = base;
      g.fillRect(2, 2, T - 4, T - 4);
      // 三条土垄：上沿亮、下沿暗
      for (const y of [4, 8, 12]) {
        g.fillStyle = ridge;
        g.fillRect(3, y, T - 6, 1);
        g.fillStyle = edge;
        g.fillRect(3, y + 1, T - 6, 1);
        for (let x = 3 + (y % 3); x < T - 3; x += 4) px(x, y - 1, lit);
      }
      // 中间埋种子的小土包
      g.fillStyle = wet ? '#4a2c18' : '#7a5430';
      g.fillRect(6, 9, 4, 2);
      g.fillRect(7, 8, 2, 1);
      if (wet) { px(4, 13, '#a8c8e8'); px(11, 5, '#a8c8e8'); }
    }
    sc.textures.addCanvas(key, c);
  }
  return key;
}

export function glintTex(sc: Phaser.Scene) {
  if (!sc.textures.exists('plot-glint')) {
    const c = document.createElement('canvas');
    c.width = 5;
    c.height = 5;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff3a0';
    g.fillRect(2, 0, 1, 5);
    g.fillRect(0, 2, 5, 1);
    g.fillStyle = '#ffffff';
    g.fillRect(2, 2, 1, 1);
    sc.textures.addCanvas('plot-glint', c);
  }
  return 'plot-glint';
}

