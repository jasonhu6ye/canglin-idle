/*
 * 地图氛围：昼夜明暗、下雨、走路扬尘、飞鸟和蝴蝶。
 * 纯画面效果，不影响存档；时间和天气都按现实时钟算，所以刷新页面也连续。
 */
import { fxScale, gfxLevel } from './gfx';
import Phaser from 'phaser';
import type { RegionId } from '../core/types';
import { paintBird, paintButterfly, paintRain, paintSplash } from './fxArt';
import { hash } from './world';
import { gameHour, isRaining } from '../core/weather';

export { DAY_MS, gameHour, isRaining, RAIN_FISH } from '../core/weather';

/** 所有世界里的东西深度都在 y+1000 以内（地图最大 81408 像素），特效层放在这上面 */
export const TOP = 200_000;
export const D_SMOKE = TOP;
export const D_NIGHT = TOP + 10;
export const D_GLOW = TOP + 20;
export const D_PARTICLE = TOP + 30;
export const D_LABEL = TOP + 40;
export const D_FLOAT = TOP + 50;


const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** 0 = 白天，1 = 深夜 */
export function darkness(h: number) {
  return h < 12 ? 1 - smooth(4.5, 6.5, h) : smooth(18, 20.5, h);
}

/** 晨昏的暖色：日出 5-7 点、日落 17-19.5 点最浓 */
function duskGlow(h: number) {
  const bell = (c: number, w: number) => Math.max(0, 1 - Math.abs(h - c) / w);
  return Math.max(bell(6, 1.4), bell(18.6, 1.6));
}

interface Drop { img: Phaser.GameObjects.Image; vx: number; vy: number; until: number }
interface Critter { img: Phaser.GameObjects.Sprite; shadow?: Phaser.GameObjects.Ellipse; vx: number; vy: number; life: number; max: number; phase: number; kind: 'bird' | 'fly' }

const BUTTERFLIES: [string, string, string][] = [['bf-0', '#f0d040', '#b08a20'], ['bf-1', '#f0f0f0', '#a8a8b8'], ['bf-2', '#ff8ac0', '#c0508a'], ['bf-3', '#7ab8ff', '#3a70c0']];

export class Ambience {
  /** 当前黑夜程度，场景拿去调灯光 */
  dark = 0;
  private night: Phaser.GameObjects.Rectangle;
  private warm: Phaser.GameObjects.Rectangle;
  private drops: Drop[] = [];
  private critters: Critter[] = [];
  private dustMs = 0;
  private nextCritter = 0;

  constructor(private scene: Phaser.Scene) {
    const tex = scene.textures;
    if (!tex.exists('fx-rain')) {
      tex.addCanvas('fx-rain', paintRain());
      tex.addCanvas('fx-splash', paintSplash());
      const bird = tex.addCanvas('fx-bird', paintBird())!;
      bird.add('0', 0, 0, 0, 9, 6);
      bird.add('1', 0, 9, 0, 9, 6);
      for (const [key, c, d] of BUTTERFLIES) {
        const t = tex.addCanvas(key, paintButterfly(c, d))!;
        t.add('0', 0, 0, 0, 5, 5);
        t.add('1', 0, 5, 0, 5, 5);
      }
    }
    if (!scene.anims.exists('fx-bird')) {
      scene.anims.create({ key: 'fx-bird', frameRate: 6, repeat: -1, frames: [{ key: 'fx-bird', frame: '0' }, { key: 'fx-bird', frame: '1' }] });
      for (const [key] of BUTTERFLIES) scene.anims.create({ key, frameRate: 10, repeat: -1, frames: [{ key, frame: '0' }, { key, frame: '1' }] });
    }
    // 盖住整个屏幕的两层：夜色和晨昏暖光。不跟镜头滚动，尺寸给足以应付缩放
    this.night = scene.add.rectangle(0, 0, 40000, 40000, 0x0a1038).setScrollFactor(0).setDepth(D_NIGHT).setAlpha(0);
    this.warm = scene.add.rectangle(0, 0, 40000, 40000, 0xff7a30).setScrollFactor(0).setDepth(D_NIGHT).setAlpha(0);
  }

  update(time: number, dt: number, region: RegionId, hero: { x: number; y: number; walking: boolean }) {
    const now = Date.now();
    const h = gameHour(now);
    const rain = isRaining(region, now);
    this.dark = darkness(h);
    this.night.setAlpha(Math.min(0.62, this.dark * 0.52 + (rain ? 0.14 : 0)));
    this.warm.setAlpha(duskGlow(h) * 0.13);
    this.updateRain(dt, rain);
    this.updateDust(dt, hero);
    this.updateCritters(time, dt, region, rain);
  }

  private updateRain(dt: number, rain: boolean) {
    const v = this.scene.cameras.main.worldView;
    if (rain) {
      const want = Math.min(220, Math.round(((v.width * v.height) / 900) * fxScale()));
      for (let i = 0; i < 6 && this.drops.length < want; i++) {
        const img = this.scene.add.image(v.x + Math.random() * (v.width + 60), v.y - 10 + Math.random() * v.height * 0.3, 'fx-rain').setDepth(D_PARTICLE);
        this.drops.push({ img, vx: -0.09, vy: 0.42 + Math.random() * 0.1, until: v.y + Math.random() * v.height });
      }
    }
    this.drops = this.drops.filter((d) => {
      d.img.x += d.vx * dt;
      d.img.y += d.vy * dt;
      if (d.img.y < d.until) return true;
      if (Math.random() < 0.35) {
        const s = this.scene.add.image(d.img.x, d.img.y, 'fx-splash').setDepth(D_PARTICLE).setAlpha(0.8);
        this.scene.tweens.add({ targets: s, alpha: 0, scaleX: 1.6, duration: 260, onComplete: () => s.destroy() });
      }
      // 停雨后不再补，剩下的落完就没了
      if (!rain) { d.img.destroy(); return false; }
      d.img.setPosition(v.x + Math.random() * (v.width + 60), v.y - 10);
      d.until = v.y + Math.random() * v.height;
      return true;
    });
  }

  /** 走路时脚下扬起一点尘土 */
  private updateDust(dt: number, hero: { x: number; y: number; walking: boolean }) {
    if (!hero.walking || gfxLevel() === 0) { this.dustMs = 0; return; }
    this.dustMs -= dt;
    if (this.dustMs > 0) return;
    this.dustMs = 170;
    const p = this.scene.add.image(hero.x + (Math.random() - 0.5) * 6, hero.y + 7, 'p-smoke').setDepth(hero.y + 999).setAlpha(0.45).setScale(0.5);
    this.scene.tweens.add({ targets: p, y: p.y - 3, alpha: 0, scale: 1.1, duration: 450, onComplete: () => p.destroy() });
  }

  /** 白天偶尔飞过一只鸟（地上带影子）；草地多的地方有蝴蝶 */
  private updateCritters(time: number, dt: number, region: RegionId, rain: boolean) {
    const v = this.scene.cameras.main.worldView;
    if (time > this.nextCritter && this.critters.length < (gfxLevel() === 0 ? 0 : 6)) {
      this.nextCritter = time + 2500 + Math.random() * 4000;
      const day = this.dark < 0.5 && !rain;
      const bugs = day && (region === 'town' || region === 'woodland' || region === 'giantwood' || region === 'highland' || region === 'savanna' || region === 'autumn' || region === 'jungle' || region === 'tropic');
      if (day && Math.random() < 0.45) {
        const fromLeft = Math.random() < 0.5;
        const y = v.y + v.height * (0.15 + Math.random() * 0.6);
        const img = this.scene.add.sprite(fromLeft ? v.x - 10 : v.right + 10, y, 'fx-bird').play('fx-bird').setFlipX(!fromLeft).setDepth(D_PARTICLE);
        const shadow = this.scene.add.ellipse(img.x, y + 34, 6, 2, 0x000000, 0.22).setDepth(D_SMOKE - 1);
        const sp = (0.05 + Math.random() * 0.03) * (fromLeft ? 1 : -1);
        this.critters.push({ img, shadow, vx: sp, vy: (Math.random() - 0.5) * 0.01, life: 0, max: (v.width + 40) / Math.abs(sp), phase: 0, kind: 'bird' });
      } else if (bugs) {
        const key = BUTTERFLIES[Math.floor(Math.random() * BUTTERFLIES.length)][0];
        const img = this.scene.add.sprite(v.x + Math.random() * v.width, v.y + Math.random() * v.height, key).play(key).setDepth(D_PARTICLE).setAlpha(0);
        this.critters.push({ img, vx: (Math.random() - 0.5) * 0.02, vy: 0, life: 0, max: 9000 + Math.random() * 6000, phase: Math.random() * 6, kind: 'fly' });
      }
    }
    this.critters = this.critters.filter((c) => {
      c.life += dt;
      if (c.kind === 'bird') {
        c.img.x += c.vx * dt;
        c.img.y += c.vy * dt + Math.sin(c.life / 300) * 0.05;
        c.shadow!.setPosition(c.img.x, c.img.y + 34);
      } else {
        // 蝴蝶：忽上忽下地乱飘
        c.img.x += c.vx * dt + Math.sin(c.life / 500 + c.phase) * 0.15;
        c.img.y += Math.sin(c.life / 170 + c.phase) * 0.25 + Math.cos(c.life / 900) * 0.05;
        const t = c.life / c.max;
        c.img.setAlpha(Math.min(1, t * 8, (1 - t) * 8));
      }
      if (c.life < c.max) return true;
      c.img.destroy();
      c.shadow?.destroy();
      return false;
    });
  }

  destroy() {
    this.drops.forEach((d) => d.img.destroy());
    this.critters.forEach((c) => { c.img.destroy(); c.shadow?.destroy(); });
    this.drops = [];
    this.critters = [];
  }
}
