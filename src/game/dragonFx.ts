import Phaser from 'phaser';
import type { PkState } from './pumpkinFx';

/*
 * 白龙坐骑「守护者的曙光」的特效（用户 11-02：要有特效，照参考图——身后一圈金色的光环、蓝色的火焰）：
 * - 脚下一圈金色的圣光，一呼一吸；隔两三秒从脚下扩开一道金色光环；
 * - 身边绕着三颗蓝水晶碎片慢慢转；
 * - 翅尖和尾巴不断冒出蓝焰，跑起来往身后拖成一条蓝火尾迹，洒下金色的光尘；
 * - 眼睛一团蓝光，跑起来拉出两道光尾；
 * - 召唤、收起时炸开一圈金环、金尘和蓝焰。
 * 贴图都是第一次用到时现画的小像素图。主角和别的玩家共用。
 */

const GLOW = 'dr-glow';
const RING = 'dr-ring';
const SPARK = 'dr-spark';
const SHARD = 'dr-shard';
const FLAME = 'dr-flame';
const EYEFIRE = 'dr-eyefire';

function ensureTex(scene: Phaser.Scene) {
  if (scene.textures.exists(GLOW)) return;
  const glow = document.createElement('canvas');
  glow.width = 64;
  glow.height = 64;
  const g = glow.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 1, 32, 32, 31);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  scene.textures.addCanvas(GLOW, glow);
  // 光环：一圈亮边，里面淡
  const ring = document.createElement('canvas');
  ring.width = 96;
  ring.height = 96;
  const r = ring.getContext('2d')!;
  const rg = r.createRadialGradient(48, 48, 30, 48, 48, 47);
  rg.addColorStop(0, 'rgba(255,255,255,0)');
  rg.addColorStop(0.75, 'rgba(255,255,255,0.35)');
  rg.addColorStop(0.9, 'rgba(255,255,255,1)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  r.fillStyle = rg;
  r.fillRect(0, 0, 96, 96);
  scene.textures.addCanvas(RING, ring);
  const px = (key: string, w: number, h: number, rows: string[], pal: Record<string, string>) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const x = c.getContext('2d')!;
    rows.forEach((row, j) => [...row].forEach((ch, i) => {
      if (!pal[ch]) return;
      x.fillStyle = pal[ch];
      x.fillRect(i, j, 1, 1);
    }));
    scene.textures.addCanvas(key, c);
  };
  px(SPARK, 3, 3, ['.a.', 'aba', '.a.'], { a: '#ffd040', b: '#fff8d0' });
  px(SHARD, 3, 5, ['.a.', 'aba', 'bcb', 'aba', '.a.'], { a: '#2488e8', b: '#58ccff', c: '#ffffff' });
  px(FLAME, 5, 7, ['..a..', '..a..', '.aba.', '.aba.', 'abcba', 'abcba', '.aba.'], { a: '#2a94f0', b: '#50d8ff', c: '#f0ffff' });
  px(EYEFIRE, 3, 4, ['.a.', 'aba', 'aba', '.a.'], { a: '#40d8ff', b: '#f0ffff' });
}

export class DragonFx {
  private glow?: Phaser.GameObjects.Image;
  private glow2?: Phaser.GameObjects.Image;
  private shards: Phaser.GameObjects.Image[] = [];
  private eyeGlow: Phaser.GameObjects.Image[] = [];
  private nextSpark = 0;
  private nextFlame = 0;
  private nextRing = 0;
  private nextEye = 0;
  constructor(private scene: Phaser.Scene) {
    ensureTex(scene);
  }

  /** 每帧调一次；on=false 时把光收起来 */
  step(time: number, o: PkState | null) {
    if (!o) {
      this.glow?.setVisible(false);
      this.glow2?.setVisible(false);
      for (const g of this.eyeGlow) g.setVisible(false);
      for (const sh of this.shards) sh.setVisible(false);
      return;
    }
    if (!this.glow) {
      this.glow = this.scene.add.image(0, 0, GLOW).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffd040);
      this.glow2 = this.scene.add.image(0, 0, GLOW).setBlendMode(Phaser.BlendModes.ADD).setTint(0x40a0ff);
    }
    const pulse = 0.55 + Math.sin(time / 210) * 0.12 + Math.sin(time / 61) * 0.05;
    this.glow.setVisible(true).setPosition(o.x, o.y - 1).setDepth(o.depth - 1).setAlpha(pulse).setScale(o.moving ? 1.25 : 1.1, 0.42);
    this.glow2!.setVisible(true).setPosition(o.x, o.y - 2).setDepth(o.depth - 1).setAlpha(pulse * 0.4).setScale(1.9, 0.6);
    this.stepShards(time, o);
    this.stepEyes(time, o);
    const k = o.lite ? 2.2 : 1;
    if (time >= this.nextRing) {
      this.nextRing = time + (o.moving ? 1500 : 2600) * k;
      this.ring(o.x, o.y - 1, o.depth, o.moving ? 1.1 : 0.9);
    }
    if (time >= this.nextSpark) {
      this.nextSpark = time + (o.moving ? 40 : 200) * k;
      this.spark(o.x - o.dir * 12 + (Math.random() - 0.5) * 30, o.y - 6 - Math.random() * 30, o.depth, o.moving ? -o.dir : 0);
    }
    if (time >= this.nextFlame) {
      this.nextFlame = time + (o.moving ? 70 : 380) * k;
      // 翅尖和尾巴：站着时从背后上方冒，跑起来从身后拖出来
      const back = o.moving ? -o.dir * (16 + Math.random() * 10) : -o.dir * 10 + (Math.random() - 0.5) * 24;
      this.flame(o.x + back, o.y - (o.moving ? 8 + Math.random() * 22 : 20 + Math.random() * 24), o.depth, o.moving, o.dir);
    }
  }

  /** 三颗蓝晶碎片绕着身子慢慢转，转到后面时画在龙后面 */
  private stepShards(time: number, o: PkState) {
    while (this.shards.length < 3) this.shards.push(this.scene.add.image(0, 0, SHARD).setBlendMode(Phaser.BlendModes.ADD).setVisible(false));
    this.shards.forEach((sh, k) => {
      const a = time / 1400 + (k * Math.PI * 2) / 3;
      const rx = o.moving ? 20 : 24, ry = 7;
      const x = o.x + Math.cos(a) * rx;
      const y = o.y - 24 + Math.sin(a) * ry + Math.sin(time / 300 + k) * 2;
      sh.setVisible(true).setPosition(x, y).setDepth(o.depth + (Math.sin(a) > 0 ? 2 : -2)).setAlpha(0.75 + Math.sin(time / 120 + k) * 0.2).setScale(1 + (Math.sin(a) + 1) * 0.25);
    });
  }

  /** 眼睛：一团蓝光，跑起来往后拉出光尾 */
  private stepEyes(time: number, o: PkState) {
    const eyes = o.eyes ?? [];
    while (this.eyeGlow.length < 2) this.eyeGlow.push(this.scene.add.image(0, 0, GLOW).setBlendMode(Phaser.BlendModes.ADD).setTint(0x40d8ff).setVisible(false));
    const flash = (time % 3600) < 240 ? 1 - (time % 3600) / 240 : 0;
    this.eyeGlow.forEach((g, k) => {
      const e = eyes[k];
      if (!e) return g.setVisible(false);
      const a = 0.7 + Math.sin(time / 100 + k * 2) * 0.12 + flash * 0.4;
      g.setVisible(true).setPosition(e[0], e[1]).setDepth(o.depth + 2).setAlpha(Math.min(1, a)).setScale(0.16 + flash * 0.12, 0.13 + flash * 0.1);
    });
    if (!eyes.length || !o.moving || time < this.nextEye) return;
    this.nextEye = time + 50 * (o.lite ? 2 : 1);
    for (const [x, y] of eyes) {
      const p = this.scene.add.image(x, y, EYEFIRE).setDepth(o.depth + 3).setBlendMode(Phaser.BlendModes.ADD).setScale(0.8);
      this.scene.tweens.add({
        targets: p, x: x - o.dir * (10 + Math.random() * 8), y: y - 2 - Math.random() * 3, alpha: 0, scaleX: 0.3,
        duration: 260 + Math.random() * 120, ease: 'Quad.easeOut', onComplete: () => p.destroy(),
      });
    }
  }

  private ring(x: number, y: number, depth: number, size: number) {
    const r = this.scene.add.image(x, y, RING).setDepth(depth - 1).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffd040).setAlpha(0.9).setScale(0.25 * size, 0.1 * size);
    this.scene.tweens.add({ targets: r, scaleX: 1.3 * size, scaleY: 0.5 * size, alpha: 0, duration: 900, ease: 'Quad.easeOut', onComplete: () => r.destroy() });
  }

  private spark(x: number, y: number, depth: number, drift: number) {
    const p = this.scene.add.image(x, y, SPARK).setDepth(depth + (Math.random() < 0.5 ? -2 : 2)).setBlendMode(Phaser.BlendModes.ADD).setScale(Math.random() < 0.3 ? 1 : 0.67);
    this.scene.tweens.add({
      targets: p, x: x + drift * (8 + Math.random() * 10) + (Math.random() - 0.5) * 4, y: y - 10 - Math.random() * 12, alpha: 0,
      duration: 500 + Math.random() * 400, ease: 'Quad.easeOut', onComplete: () => p.destroy(),
    });
  }

  private flame(x: number, y: number, depth: number, moving: boolean, dir: number) {
    const p = this.scene.add.image(x, y, FLAME).setDepth(depth - 2).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.95).setScale(moving ? 1.1 : 0.9);
    this.scene.tweens.add({
      targets: p, y: y - 12 - Math.random() * 8, x: x - (moving ? dir * (8 + Math.random() * 8) : 0) + Math.sin(x) * 2, alpha: 0, scaleX: 0.3, scaleY: 0.5,
      duration: 600 + Math.random() * 300, ease: 'Sine.easeOut', onComplete: () => p.destroy(),
    });
  }

  /** 召唤、收起：炸开一圈金色光环、金尘和蓝焰 */
  burst(x: number, y: number, depth: number) {
    this.ring(x, y, depth, 1.6);
    this.scene.time.delayedCall(140, () => this.ring(x, y, depth, 1.2));
    const fl = this.scene.add.image(x, y - 16, GLOW).setDepth(depth + 3).setBlendMode(Phaser.BlendModes.ADD).setTint(0xfff0a0).setScale(1.6);
    this.scene.tweens.add({ targets: fl, alpha: 0, scale: 2.4, duration: 420, onComplete: () => fl.destroy() });
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      const p = this.scene.add.image(x, y - 14, SPARK).setDepth(depth + 2).setBlendMode(Phaser.BlendModes.ADD);
      this.scene.tweens.add({
        targets: p, x: x + Math.cos(a) * (22 + Math.random() * 10), y: y - 14 + Math.sin(a) * 12 - 8, alpha: 0,
        duration: 550 + Math.random() * 300, ease: 'Quad.easeOut', onComplete: () => p.destroy(),
      });
    }
    for (let i = 0; i < 10; i++) this.flame(x + (Math.random() - 0.5) * 36, y - Math.random() * 24, depth + 3, true, Math.random() < 0.5 ? -1 : 1);
  }

  destroy() {
    for (const g of this.eyeGlow) g.destroy();
    for (const sh of this.shards) sh.destroy();
    this.eyeGlow = [];
    this.shards = [];
    this.glow?.destroy();
    this.glow2?.destroy();
    this.glow = this.glow2 = undefined;
  }
}
