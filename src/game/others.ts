import Phaser from 'phaser';
import { levelSnapshot, online, type Presence } from '../net';
import { rallyTime } from '../net/social';
import { maxHp } from '../core/sim';
import type { GameState } from '../core/types';
import { FIGHT_RANGE, FRAME_H, FRAME_W, HERO_ANIMS, type FightWeapon, HERO_FEET, HERO_PAD, outfitOf, paintHeroSheet } from './hero';
import { besideXOf, ensureMountTex, mountKindOf, saddleBob, seatOf } from './mounts';
import { T } from './tiles';
import { WOLF_FEET, WOLF_H } from './wolfArt';

/**
 * 地图上的其他在线玩家（10-25）：位置每几秒同步一次，这边平滑走过去。
 * 能看到对方在干什么（挖矿、砍树、打怪的动作）和骑的坐骑；不能互相碰撞。
 */
const FONT = 'system-ui, sans-serif';
/** 太远的人不画，省得满地图都是 */
const VIEW_TILES = 80;
/** 自己的位置多久发一次（没变化时） */
const KEEPALIVE_MS = 15_000;

/** 同一格的站位：第 0 个是原位，往后排在左上、左下、更靠后 */
const CROWD: [number, number][] = [[0, 0], [-6, -10], [-6, 10], [-14, 0], [-14, -14], [-14, 14], [-22, -6], [-22, 8]];

interface Other {
  box: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Sprite;
  name: Phaser.GameObjects.Text;
  key: string;
  tx: number;
  ty: number;
  dir: 'down' | 'up' | 'side';
  /** 坐骑两层（人夹在中间），没骑就没有 */
  mk?: string;
  back?: Phaser.GameObjects.Sprite;
  front?: Phaser.GameObjects.Sprite;
  anim?: string;
  flip: boolean;
}

export class OtherPlayers {
  private others = new Map<string, Other>();
  private latest: Presence[] = [];
  private off: () => void;
  private sent = { x: -1, y: -1, key: '', at: 0 };
  private checked = 0;

  constructor(private scene: Phaser.Scene) {
    this.off = online.onPresence((all) => { this.latest = all; });
  }

  destroy() {
    this.off();
    this.others.forEach((o) => o.box.destroy());
    this.others.clear();
  }

  /** 每个外观一张贴图，第一次见到时现画 */
  private sheet(outfit?: string) {
    const key = `hero-o-${outfit ?? 'default'}`;
    if (this.scene.textures.exists(key)) return key;
    const sheet = paintHeroSheet(outfitOf(outfit));
    const t = this.scene.textures.addCanvas(key, sheet.canvas)!;
    for (const f of sheet.frames) t.add(f.name, 0, f.x, f.y, FRAME_W, FRAME_H);
    for (const a of HERO_ANIMS) {
      if (/^(walk|idle|ride|rideidle|work|fight)-/.test(a.key)) {
        this.scene.anims.create({
          key: `${key}:${a.key}`, frameRate: a.rate, repeat: -1,
          frames: Array.from({ length: a.frames }, (_, i) => ({ key, frame: `${a.key}-${i}` })),
        });
      }
    }
    return key;
  }

  /** 把自己的位置、装备和等级发出去：格子变了、换了东西或隔了一阵才发；每半秒最多看一次 */
  publish(st: GameState, x: number, y: number, work?: { anim: string; flip: boolean }) {
    if (!online.me()) return;
    const now = Date.now();
    if (now - this.checked < 500) return;
    this.checked = now;
    const action = st.paused ? undefined : st.queue[0]?.action;
    const mounted = st.mounted ? st.equipment.mount : undefined;
    const snap = levelSnapshot(st);
    const max = maxHp(st);
    const hp = Math.max(0, Math.round(st.hp));
    // 血量按 5% 一档比较，打怪时不用每下都发
    const key = JSON.stringify([st.settings.skin, action, mounted, st.equipment, snap.total, snap.combat, Math.round((hp / max) * 20), rallyTime(), work?.anim, work?.flip, (st.gates ?? []).map((g) => g.id).join()]);
    const moved = Math.abs(x - this.sent.x) + Math.abs(y - this.sent.y) >= 2;
    if (!moved && key === this.sent.key && now - this.sent.at < KEEPALIVE_MS) return;
    this.sent = { x, y, key, at: now };
    online.publishPresence({ x, y, outfit: st.settings.skin, action, mounted, equip: { ...st.equipment }, total: snap.total, combat: snap.combat, hp, maxHp: max, rally: rallyTime() || undefined, anim: work?.anim, flip: work?.flip, gates: st.gates?.length ? st.gates : undefined });
  }

  /** 换坐骑或上下坐骑：坐骑两层精灵，人夹在中间 */
  private setMount(o: Other, mk: string | undefined) {
    if (o.mk === mk) return;
    o.back?.destroy(); o.front?.destroy();
    o.back = o.front = undefined;
    o.mk = mk;
    if (!mk) return;
    ensureMountTex(this.scene, mk);
    const mk2 = (y: number) => this.scene.add.sprite(0, y, `mount-${mk}`).setOrigin(0.5, WOLF_FEET / WOLF_H);
    o.back = mk2(0);
    o.front = mk2(0);
    o.box.addAt(o.back, 0);
    o.box.addAt(o.front, 2);
  }

  /** 按状态摆姿势：干活（坐骑在旁边坐着）、骑着跑/站、走路、站着 */
  private pose(o: Other, moving: boolean) {
    const play = (anim: string) => o.body.play(`${o.key}:${anim}`, true);
    const mount = (anim: string, flip: boolean, x: number) => {
      for (const w of [o.back!, o.front!]) w.setPosition(x, x ? -2 : 0).setFlipX(flip).play(`mount:${o.mk}-${anim}-${w === o.back ? 'b' : 'f'}`, true);
    };
    const ground = () => { o.body.setPosition(0, 0); o.name.setY(-HERO_FEET + 1); };
    if (o.anim && !moving) {
      ground();
      o.body.setFlipX(o.flip);
      play(o.anim);
      if (o.mk) { mount('sit', false, besideXOf(o.mk)); o.box.bringToTop(o.body); o.box.bringToTop(o.name); }
      return;
    }
    if (o.mk) {
      const dir = o.dir;
      const flip = dir === 'side' && o.flip;
      mount(moving ? `run-${dir}` : `idle-${dir}`, flip, 0);
      const seat = seatOf(o.mk, dir);
      const bob = saddleBob((o.front!.anims.currentFrame?.frame.name ?? '') as string);
      o.body.setPosition(flip ? -seat.x : seat.x, seat.y + bob).setFlipX(flip);
      o.name.setY(-HERO_FEET + 1 + seat.y);
      play(moving ? `ride-${dir}` : `rideidle-${dir}`);
      // 侧面：人画在整只坐骑前面；正面、背面：夹在两层中间
      if (dir === 'side') o.box.moveAbove(o.body, o.front!);
      else o.box.moveBelow(o.body, o.front!);
      o.box.bringToTop(o.name);
      return;
    }
    ground();
    o.body.setFlipX(o.dir === 'side' && o.flip);
    play(moving ? `walk-${o.dir}` : `idle-${o.dir}`);
  }

  step(delta: number, near: { x: number; y: number }) {
    const seen = new Set<string>();
    // 同一格上一起干活、打怪的人各站各的位置（自己占第 0 个位置），远程往后站（用户 10-25）
    const crowd = new Map<string, number>();
    crowd.set(`${Math.round(near.x)},${Math.round(near.y)}`, 1);
    for (const p of this.latest) {
      if (Math.abs(p.x - near.x) > VIEW_TILES || Math.abs(p.y - near.y) > VIEW_TILES) continue;
      seen.add(p.playerId);
      let tx = p.x * T + T / 2, ty = p.y * T + T / 2 + 7;
      if (p.anim) {
        const cell = `${p.x},${p.y}`;
        const i = crowd.get(cell) ?? 0;
        crowd.set(cell, i + 1);
        const [ox, oy] = CROWD[i % CROWD.length];
        const w = /^fight-(\w+)-ready$/.exec(p.anim)?.[1] as FightWeapon | undefined;
        tx += ox - (w ? (FIGHT_RANGE[w] ?? 0) * T : 0);
        ty += oy;
      }
      const key = this.sheet(p.outfit);
      let o = this.others.get(p.playerId);
      if (o && o.key !== key) { o.box.destroy(); o = undefined; }
      if (!o) {
        const body = this.scene.add.sprite(0, 0, key).setOrigin(0.5, (HERO_FEET + HERO_PAD.t) / FRAME_H);
        // 点别的玩家弹出菜单（查看信息、装备、加好友、交易…）
        body.setInteractive({ useHandCursor: true, pixelPerfect: false }).setData('player', p.playerId);
        body.play(`${key}:idle-down`);
        const name = this.scene.add.text(0, -HERO_FEET + 1, '', { fontFamily: FONT, fontSize: '7px', color: '#cfe0ff', stroke: '#000', strokeThickness: 2, resolution: 4 }).setOrigin(0.5);
        const box = this.scene.add.container(tx, ty, [body, name]).setAlpha(0.92);
        o = { box, body, name, key, tx, ty, dir: 'down', flip: false };
        this.others.set(p.playerId, o);
      }
      o.name.setText(p.guildTag ? `[${p.guildTag}] ${p.name}` : p.name);
      o.tx = tx; o.ty = ty;
      this.setMount(o, p.mounted ? mountKindOf(p.mounted) : undefined);
      o.anim = p.anim && this.scene.anims.exists(`${key}:${p.anim}`) ? p.anim : undefined;
      if (o.anim) o.flip = !!p.flip;
    }
    for (const [id, o] of this.others) {
      if (!seen.has(id)) { o.box.destroy(); this.others.delete(id); continue; }
      const dx = o.tx - o.box.x, dy = o.ty - o.box.y;
      const d = Math.hypot(dx, dy);
      let moving = false;
      // 隔太远（刚传送或刚出现）直接放过去
      if (d > T * 30) o.box.setPosition(o.tx, o.ty);
      else if (d > 1) {
        // 每秒 4 格（骑着快些），落后多了走快些追上
        const base = T * (o.mk ? 8 : 4);
        const v = (base * Math.max(1, d / (T * 8)) * delta) / 1000;
        const k = Math.min(1, v / d);
        o.box.setPosition(o.box.x + dx * k, o.box.y + dy * k);
        o.dir = Math.abs(dx) > Math.abs(dy) ? 'side' : dy > 0 ? 'down' : 'up';
        o.flip = o.dir === 'side' && dx < 0;
        moving = true;
      }
      this.pose(o, moving);
      o.box.setDepth(o.box.y + 999);
    }
  }
}
