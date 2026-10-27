import Phaser from 'phaser';

/*
 * 南瓜坐骑的特效（用户 10-27 要求做好一点）：
 * - 脚下一圈暖橙色的光，跟着鬼火一明一暗；
 * - 跑起来身后一路洒火星、冒幽紫/幽绿的鬼火，隔几秒惊起一只小蝙蝠；
 * - 站着时蒂上慢慢飘鬼火；召唤、收起时炸开一团火星和鬼火，飞出几只蝙蝠。
 * 贴图都是第一次用到时现画的小像素图。主角和别的玩家共用。
 */

const GLOW = 'pk-glow';
const EMBER = 'pk-ember';
const WISP = ['pk-wisp-p', 'pk-wisp-g'];
const BAT = 'pk-bat';

function ensureTex(scene: Phaser.Scene) {
  if (scene.textures.exists(GLOW)) return;
  const glow = document.createElement('canvas');
  glow.width = 64;
  glow.height = 64;
  const g = glow.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 1, 32, 32, 31);
  grad.addColorStop(0, 'rgba(255,190,70,0.9)');
  grad.addColorStop(0.45, 'rgba(255,120,30,0.4)');
  grad.addColorStop(1, 'rgba(255,90,20,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  scene.textures.addCanvas(GLOW, glow);
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
  px(EMBER, 3, 3, ['.a.', 'aba', '.a.'], { a: '#ff9a1a', b: '#fff2a0' });
  // 鬼火：一小簇往上尖的火苗
  const flame = ['..a..', '.aa..', '.aba.', 'abcba', 'abcba', '.aba.'];
  px(WISP[0], 5, 6, flame, { a: '#7a3ad8', b: '#b878ff', c: '#f0dcff' });
  px(WISP[1], 5, 6, flame, { a: '#2a9a5a', b: '#6ae09a', c: '#e0ffe8' });
  // 蝙蝠两帧：翅膀张开、收起
  const bat = scene.textures.createCanvas(BAT, 14, 5)!;
  const bc = bat.getContext();
  const draw = (ox: number, rows: string[]) => rows.forEach((r, j) => [...r].forEach((ch, i) => {
    if (ch === '.') return;
    bc.fillStyle = ch === 'e' ? '#ff5a2a' : '#1a1020';
    bc.fillRect(ox + i, j, 1, 1);
  }));
  draw(0, ['x.....x', 'xx.x.xx', '.xxexx.', '..xxx..', '.......']);
  draw(7, ['.......', '...x...', '.xxexx.', 'xx.x.xx', 'x.....x']);
  bat.refresh();
  bat.add('0', 0, 0, 0, 7, 5);
  bat.add('1', 0, 7, 0, 7, 5);
}

export interface PkState {
  x: number;
  /** 脚底 */
  y: number;
  moving: boolean;
  /** 朝哪边跑：1 右，-1 左，0 上下 */
  dir: number;
  depth: number;
  /** 少一点粒子（别的玩家用） */
  lite?: boolean;
}

export class PumpkinFx {
  private glow?: Phaser.GameObjects.Image;
  private nextEmber = 0;
  private nextWisp = 0;
  private nextBat = 0;
  constructor(private scene: Phaser.Scene) {
    ensureTex(scene);
  }

  /** 每帧调一次；on=false 时把光收起来 */
  step(time: number, o: PkState | null) {
    if (!o) {
      this.glow?.setVisible(false);
      return;
    }
    if (!this.glow) this.glow = this.scene.add.image(0, 0, GLOW).setBlendMode(Phaser.BlendModes.ADD);
    const pulse = 0.5 + Math.sin(time / 170) * 0.12 + Math.sin(time / 53) * 0.06;
    this.glow.setVisible(true).setPosition(o.x, o.y - 1).setDepth(o.depth - 1).setAlpha(pulse).setScale(o.moving ? 0.85 : 0.75, 0.36);
    const k = o.lite ? 2.2 : 1;
    if (time >= this.nextEmber) {
      this.nextEmber = time + (o.moving ? 45 : 260) * k;
      this.ember(o.x - o.dir * 10 + (Math.random() - 0.5) * 12, o.y - 4 - Math.random() * 14, o.depth, o.moving ? -o.dir : 0);
    }
    if (time >= this.nextWisp) {
      this.nextWisp = time + (o.moving ? 110 : 520) * k;
      const back = o.moving ? -o.dir * (12 + Math.random() * 4) : -4 + (Math.random() - 0.5) * 4;
      this.wisp(o.x + back, o.y - (o.moving ? 6 + Math.random() * 10 : 22), o.depth, o.moving);
    }
    if (o.moving && !o.lite && time >= this.nextBat) {
      this.nextBat = time + 2600 + Math.random() * 2200;
      this.bat(o.x - o.dir * 8, o.y - 18, o.depth, o.dir ? -o.dir : Math.random() < 0.5 ? -1 : 1);
    }
  }

  private ember(x: number, y: number, depth: number, drift: number) {
    const p = this.scene.add.image(x, y, EMBER).setDepth(depth + (Math.random() < 0.5 ? -2 : 2)).setBlendMode(Phaser.BlendModes.ADD).setScale(Math.random() < 0.3 ? 1 : 0.67);
    this.scene.tweens.add({
      targets: p, x: x + drift * (6 + Math.random() * 8) + (Math.random() - 0.5) * 4, y: y - 8 - Math.random() * 10, alpha: 0,
      duration: 450 + Math.random() * 350, ease: 'Quad.easeOut', onComplete: () => p.destroy(),
    });
  }

  private wisp(x: number, y: number, depth: number, moving: boolean) {
    const p = this.scene.add.image(x, y, WISP[Math.random() < 0.7 ? 0 : 1]).setDepth(depth - 2).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.95).setScale(moving ? 1 : 0.8);
    this.scene.tweens.add({
      targets: p, y: y - 14 - Math.random() * 8, x: x + Math.sin(x) * 3, alpha: 0, scaleX: 0.3, scaleY: 0.5,
      duration: 700 + Math.random() * 400, ease: 'Sine.easeOut', onComplete: () => p.destroy(),
    });
  }

  private bat(x: number, y: number, depth: number, dir: number) {
    const b = this.scene.add.sprite(x, y, BAT, '0').setDepth(depth + 3).setFlipX(dir < 0);
    let f = 0;
    const flap = this.scene.time.addEvent({ delay: 70, loop: true, callback: () => b.setFrame(String(++f % 2)) });
    this.scene.tweens.add({
      targets: b, x: x + dir * (40 + Math.random() * 30), y: y - 30 - Math.random() * 20, alpha: 0,
      duration: 1300, ease: 'Sine.easeIn', onComplete: () => { flap.remove(); b.destroy(); },
    });
  }

  /** 召唤、收起：炸开一团火星和鬼火，飞出几只蝙蝠 */
  burst(x: number, y: number, depth: number) {
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const p = this.scene.add.image(x, y - 10, EMBER).setDepth(depth + 2).setBlendMode(Phaser.BlendModes.ADD);
      this.scene.tweens.add({
        targets: p, x: x + Math.cos(a) * (16 + Math.random() * 8), y: y - 10 + Math.sin(a) * 10 - 6, alpha: 0,
        duration: 500 + Math.random() * 300, ease: 'Quad.easeOut', onComplete: () => p.destroy(),
      });
    }
    for (let i = 0; i < 8; i++) this.wisp(x + (Math.random() - 0.5) * 24, y - Math.random() * 16, depth + 3, true);
    for (let i = 0; i < 3; i++) this.bat(x + (i - 1) * 6, y - 14, depth, i === 1 ? (Math.random() < 0.5 ? -1 : 1) : i - 1);
  }

  destroy() {
    this.glow?.destroy();
    this.glow = undefined;
  }
}
