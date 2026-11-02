import Phaser from 'phaser';
import type { PkState } from './pumpkinFx';

/*
 * 独角兽坐骑的特效（用户 11-02）：
 * - 脚下一圈淡粉的柔光，一明一暗；
 * - 跑起来身后一路洒星光（白、粉、薰衣草、淡蓝的小四角星），偶尔飘出几瓣花；
 * - 角尖一团金白的光晕，不停往上飘细小的光尘，隔几秒亮一下；
 * - 召唤、收起时炸开一圈星光和花瓣。
 * 贴图第一次用到时现画。主角和别的玩家共用（PkState 和南瓜坐骑同一个结构）。
 */

const GLOW = 'un-glow';
const HORN = 'un-horn';
const STAR = ['un-star-w', 'un-star-p', 'un-star-l', 'un-star-b'];
const MOTE = 'un-mote';
const PETAL = ['un-petal-0', 'un-petal-1'];

function ensureTex(scene: Phaser.Scene) {
  if (scene.textures.exists(GLOW)) return;
  const radial = (key: string, stops: [number, string][]) => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 1, 32, 32, 31);
    for (const [k, col] of stops) grad.addColorStop(k, col);
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    scene.textures.addCanvas(key, c);
  };
  radial(GLOW, [[0, 'rgba(255,200,235,0.85)'], [0.45, 'rgba(255,150,210,0.35)'], [1, 'rgba(240,120,200,0)']]);
  radial(HORN, [[0, 'rgba(255,250,220,1)'], [0.3, 'rgba(255,220,130,0.6)'], [1, 'rgba(255,200,100,0)']]);
  const px = (key: string, w: number, h: number, rows: string[], pal: Record<string, string>) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const x = c.getContext('2d')!;
    rows.forEach((r, j) => [...r].forEach((ch, i) => {
      if (!pal[ch]) return;
      x.fillStyle = pal[ch];
      x.fillRect(i, j, 1, 1);
    }));
    scene.textures.addCanvas(key, c);
  };
  const star = ['..a..', '..b..', 'abcba', '..b..', '..a..'];
  px(STAR[0], 5, 5, star, { a: '#fff0f8', b: '#ffffff', c: '#ffffff' });
  px(STAR[1], 5, 5, star, { a: '#ff8ad0', b: '#ffc0e8', c: '#fff4fa' });
  px(STAR[2], 5, 5, star, { a: '#b890ff', b: '#dcc8ff', c: '#f8f4ff' });
  px(STAR[3], 5, 5, star, { a: '#7ec8ff', b: '#c0e8ff', c: '#f0faff' });
  px(MOTE, 2, 2, ['ab', 'ba'], { a: '#fff6d0', b: '#ffe08a' });
  px(PETAL[0], 4, 3, ['.ab.', 'abba', '.ab.'], { a: '#ff9ad6', b: '#ffd6ec' });
  px(PETAL[1], 4, 3, ['.ab.', 'abba', '.ab.'], { a: '#d0a8ff', b: '#eee0ff' });
}

export class UnicornFx {
  private glow?: Phaser.GameObjects.Image;
  private hornGlow?: Phaser.GameObjects.Image;
  private nextStar = 0;
  private nextMote = 0;
  private nextPetal = 0;
  constructor(private scene: Phaser.Scene) {
    ensureTex(scene);
  }

  /** 每帧调一次；o=null 时把光收起来 */
  step(time: number, o: PkState | null) {
    if (!o) {
      this.glow?.setVisible(false);
      this.hornGlow?.setVisible(false);
      return;
    }
    if (!this.glow) this.glow = this.scene.add.image(0, 0, GLOW).setBlendMode(Phaser.BlendModes.ADD);
    const pulse = 0.42 + Math.sin(time / 230) * 0.1 + Math.sin(time / 71) * 0.04;
    this.glow.setVisible(true).setPosition(o.x, o.y - 1).setDepth(o.depth - 1).setAlpha(pulse).setScale(o.moving ? 0.8 : 0.7, 0.32);
    this.stepHorn(time, o);
    const k = o.lite ? 2.2 : 1;
    if (time >= this.nextStar) {
      this.nextStar = time + (o.moving ? 55 : 420) * k;
      const back = o.moving ? -o.dir * (6 + Math.random() * 10) : (Math.random() - 0.5) * 20;
      this.star(o.x + back + (Math.random() - 0.5) * 6, o.y - 3 - Math.random() * 20, o.depth, o.moving ? -o.dir : 0);
    }
    if (o.moving && !o.lite && time >= this.nextPetal) {
      this.nextPetal = time + 380 + Math.random() * 400;
      this.petal(o.x - o.dir * 12, o.y - 14 - Math.random() * 8, o.depth, o.dir ? -o.dir : Math.random() < 0.5 ? -1 : 1);
    }
  }

  /** 角尖：金白光晕一呼一吸，往上冒光尘，隔几秒亮一下 */
  private stepHorn(time: number, o: PkState) {
    const tip = o.eyes?.[0];
    if (!this.hornGlow) this.hornGlow = this.scene.add.image(0, 0, HORN).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    if (!tip) return this.hornGlow.setVisible(false);
    const flash = (time % 2800) < 220 ? 1 - (time % 2800) / 220 : 0;
    const a = 0.7 + Math.sin(time / 120) * 0.12 + flash * 0.3;
    this.hornGlow.setVisible(true).setPosition(tip[0], tip[1]).setDepth(o.depth + 2).setAlpha(Math.min(1, a)).setScale(0.22 + flash * 0.2);
    if (time < this.nextMote) return;
    this.nextMote = time + (o.moving ? 60 : 140) * (o.lite ? 2 : 1);
    const p = this.scene.add.image(tip[0] + (Math.random() - 0.5) * 3, tip[1], MOTE).setDepth(o.depth + 3).setBlendMode(Phaser.BlendModes.ADD);
    const back = o.moving ? -o.dir * (8 + Math.random() * 8) : (Math.random() - 0.5) * 4;
    this.scene.tweens.add({
      targets: p, x: p.x + back, y: p.y - 6 - Math.random() * 6, alpha: 0,
      duration: 400 + Math.random() * 300, ease: 'Quad.easeOut', onComplete: () => p.destroy(),
    });
  }

  private star(x: number, y: number, depth: number, drift: number) {
    const key = STAR[Math.random() < 0.4 ? 0 : 1 + Math.floor(Math.random() * 3)];
    const p = this.scene.add.image(x, y, key).setDepth(depth + (Math.random() < 0.5 ? -2 : 2)).setBlendMode(Phaser.BlendModes.ADD).setScale(Math.random() < 0.3 ? 1 : 0.6).setAlpha(0);
    this.scene.tweens.add({ targets: p, alpha: 1, scale: p.scale * 1.3, duration: 120, yoyo: true, hold: 160 + Math.random() * 200, onComplete: () => p.destroy() });
    this.scene.tweens.add({ targets: p, x: x + drift * (4 + Math.random() * 6), y: y - 4 - Math.random() * 6, duration: 520, ease: 'Sine.easeOut' });
  }

  private petal(x: number, y: number, depth: number, dir: number) {
    const p = this.scene.add.image(x, y, PETAL[Math.random() < 0.6 ? 0 : 1]).setDepth(depth + 3).setAlpha(0.95);
    this.scene.tweens.add({ targets: p, angle: (Math.random() < 0.5 ? -1 : 1) * 360, duration: 1200, repeat: 1 });
    this.scene.tweens.add({
      targets: p, x: x + dir * (18 + Math.random() * 16), y: y + 14 + Math.random() * 8, alpha: 0,
      duration: 1400 + Math.random() * 500, ease: 'Sine.easeIn', onComplete: () => p.destroy(),
    });
  }

  /** 召唤、收起：炸开一圈星光和花瓣 */
  burst(x: number, y: number, depth: number) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const p = this.scene.add.image(x, y - 10, STAR[i % 4]).setDepth(depth + 2).setBlendMode(Phaser.BlendModes.ADD);
      this.scene.tweens.add({
        targets: p, x: x + Math.cos(a) * (18 + Math.random() * 8), y: y - 10 + Math.sin(a) * 11 - 6, alpha: 0, scale: 0.4,
        duration: 550 + Math.random() * 300, ease: 'Quad.easeOut', onComplete: () => p.destroy(),
      });
    }
    for (let i = 0; i < 6; i++) this.petal(x + (Math.random() - 0.5) * 20, y - 16 - Math.random() * 8, depth, Math.random() < 0.5 ? -1 : 1);
  }

  destroy() {
    this.glow?.destroy();
    this.hornGlow?.destroy();
    this.glow = this.hornGlow = undefined;
  }
}
