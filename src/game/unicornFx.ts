import Phaser from 'phaser';
import type { PkState } from './pumpkinFx';

/*
 * 独角兽坐骑的特效（用户 11-02）：
 * - 脚下一圈淡粉的柔光，一明一暗；
 * - 跑起来身后一路洒星光（白、粉、薰衣草、淡蓝的小四角星），偶尔飘出几瓣花；
 * - 角尖一团金白的光晕，不停往上飘细小的光尘，隔几秒亮一下；
 * - 跑起来特效拉满（用户 11-02）：身后拖一条五色彩虹光带（每帧留一段，渐渐变淡下沉），蹄下溅彩虹星火，
 *   地面光环按彩虹色循环，角尖光尘也变成彩虹色；
 * - 召唤、收起时炸开一圈星光和花瓣。
 * 贴图第一次用到时现画。主角和别的玩家共用（PkState 和南瓜坐骑同一个结构）。
 */

const GLOW = 'un-glow';
const HORN = 'un-horn';
const STAR = ['un-star-w', 'un-star-p', 'un-star-l', 'un-star-b'];
const MOTE = 'un-mote';
const PETAL = ['un-petal-0', 'un-petal-1'];
const RIBBON = 'un-ribbon';
const SPARK = 'un-spark';
/** 彩虹五色（和鬃毛一致）：粉、紫、蓝、薄荷、奶黄 */
const RAINBOW = [0xff6ac0, 0xc08cff, 0x7ecbff, 0x9af0dc, 0xfff0a0];

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
  // 彩虹光带的一段：五色横条，两头各留一行浅色让它柔一点
  px(RIBBON, 3, 12, ['.w.', 'aaa', 'aaa', 'bbb', 'bbb', 'ccc', 'ccc', 'ddd', 'ddd', 'eee', 'eee', '.w.'], { a: '#ff6ac0', b: '#c08cff', c: '#7ecbff', d: '#9af0dc', e: '#fff0a0', w: '#ffffff' });
  px(SPARK, 3, 3, ['.a.', 'aba', '.a.'], { a: '#ffffff', b: '#ffffff' });
}

export class UnicornFx {
  private glow?: Phaser.GameObjects.Image;
  private hornGlow?: Phaser.GameObjects.Image;
  private nextStar = 0;
  private nextMote = 0;
  private nextPetal = 0;
  private nextRibbon = 0;
  private nextSpark = 0;
  /** 上一段光带的锚点，新的一段从那里接到现在的位置，跑多快带子都连着 */
  private lastRibbon?: [number, number, number];
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
    // 跑起来光环按彩虹色循环（两种相邻色混着闪），站着是粉色
    const hue = o.moving ? RAINBOW[Math.floor(time / 160) % RAINBOW.length] : 0xffffff;
    this.glow.setVisible(true).setPosition(o.x, o.y - 1).setDepth(o.depth - 1).setAlpha(o.moving ? pulse + 0.25 : pulse).setScale(o.moving ? 1 : 0.7, o.moving ? 0.4 : 0.32).setTint(hue);
    this.stepHorn(time, o);
    const k = o.lite ? 2.2 : 1;
    if (o.moving) this.stepRun(time, o, k);
    if (time >= this.nextStar) {
      this.nextStar = time + (o.moving ? 30 : 420) * k;
      const back = o.moving ? -o.dir * (6 + Math.random() * 10) : (Math.random() - 0.5) * 20;
      this.star(o.x + back + (Math.random() - 0.5) * 6, o.y - 3 - Math.random() * 20, o.depth, o.moving ? -o.dir : 0);
    }
    if (o.moving && !o.lite && time >= this.nextPetal) {
      this.nextPetal = time + 380 + Math.random() * 400;
      this.petal(o.x - o.dir * 12, o.y - 14 - Math.random() * 8, o.depth, o.dir ? -o.dir : Math.random() < 0.5 ? -1 : 1);
    }
  }

  /** 跑动特效：彩虹光带 + 蹄下星火 */
  private stepRun(time: number, o: PkState, k: number) {
    if (time >= this.nextRibbon) {
      this.nextRibbon = time + 16;
      // 光带从屁股后面拖出来：侧面锚在身后 12 像素、上下跑时锚在身体中间；每段接着上一段，留在原地慢慢下沉变淡
      const rx = o.x - o.dir * 12;
      const ry = o.y - 15;
      const last = this.lastRibbon && time - this.lastRibbon[2] < 200 ? this.lastRibbon : [rx, ry, time];
      this.lastRibbon = [rx, ry, time];
      const dx = rx - last[0];
      const dy = ry - last[1];
      const len = Math.hypot(dx, dy);
      if (len > 0.5 || !o.dir) {
        // 带子顺着跑的方向转：颜色条始终垂直于路线，斜着跑也是一条平滑的彩虹
        const r = this.scene.add.image((rx + last[0]) / 2, (ry + last[1]) / 2, RIBBON).setDepth(o.depth - 3).setAlpha(0.85).setScale(Math.max(1, len / 3 + 0.5), 1);
        if (len > 0.5) r.setRotation(Math.atan2(dy, dx));
        else if (!o.dir) r.setAngle(90);
        this.scene.tweens.add({
          targets: r, y: r.y + 5, alpha: 0, scaleY: 0.4,
          duration: 700 + Math.random() * 150, ease: 'Quad.easeIn', onComplete: () => r.destroy(),
        });
      }
      // 光带外侧再飘一层淡的碎光，让带子毛茸茸的
      if (!o.lite && Math.random() < 0.5) {
        const c = RAINBOW[Math.floor(Math.random() * RAINBOW.length)];
        const m = this.scene.add.image(rx + (Math.random() - 0.5) * 4, ry + (Math.random() - 0.5) * 12, MOTE).setDepth(o.depth - 2).setBlendMode(Phaser.BlendModes.ADD).setTint(c);
        this.scene.tweens.add({ targets: m, x: m.x - o.dir * (6 + Math.random() * 10), y: m.y - 4 - Math.random() * 8, alpha: 0, duration: 500 + Math.random() * 300, onComplete: () => m.destroy() });
      }
    }
    if (time >= this.nextSpark) {
      this.nextSpark = time + 45 * k;
      // 蹄下溅起彩虹星火：从脚底往后上方飞
      for (let i = 0; i < (o.lite ? 1 : 2); i++) {
        const c = RAINBOW[Math.floor(Math.random() * RAINBOW.length)];
        const sx = o.x + (Math.random() - 0.5) * 16;
        const p = this.scene.add.image(sx, o.y - 1, Math.random() < 0.5 ? SPARK : STAR[0]).setDepth(o.depth + 2).setBlendMode(Phaser.BlendModes.ADD).setTint(c).setScale(0.6 + Math.random() * 0.6);
        this.scene.tweens.add({
          targets: p, x: sx - o.dir * (10 + Math.random() * 14) + (Math.random() - 0.5) * 8, y: o.y - 8 - Math.random() * 14, alpha: 0, scale: 0.2,
          duration: 380 + Math.random() * 260, ease: 'Quad.easeOut', onComplete: () => p.destroy(),
        });
      }
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
    this.nextMote = time + (o.moving ? 35 : 140) * (o.lite ? 2 : 1);
    const p = this.scene.add.image(tip[0] + (Math.random() - 0.5) * 3, tip[1], MOTE).setDepth(o.depth + 3).setBlendMode(Phaser.BlendModes.ADD);
    // 跑起来角尖的光尘是彩虹色的
    if (o.moving) p.setTint(RAINBOW[Math.floor(Math.random() * RAINBOW.length)]).setScale(1.3);
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
