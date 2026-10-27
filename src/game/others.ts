import Phaser from 'phaser';
import { levelSnapshot, online, type DungeonPresence, type Presence } from '../net';
import { moveCadence } from '../net/presenceSync';
import { rallyTime, takeFieldHits, updateAggro, type FieldMateHit } from '../net/social';
import { maxHp } from '../core/sim';
import type { GameState } from '../core/types';
import { FIGHT, FIGHT_RANGE, FRAME_H, FRAME_W, HERO_ANIMS, type FightWeapon, HERO_FEET, HERO_PAD, outfitOf, paintHeroSheet } from './hero';
import { besideXOf, ensureMountTex, mountKindOf, saddleBob, seatOf } from './mounts';
import { PumpkinFx } from './pumpkinFx';
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

/** 别的在线玩家（看附近有没有人，决定发位置发多勤） */
let everyone: Presence[] = [];
let listening = false;
/** 野外组队：队友打中了我也在打的怪（地图场景订阅，画队友出手和伤害数字） */
type FieldHitFn = (h: FieldMateHit) => void;
const fieldSubs = new Set<FieldHitFn>();
export function onFieldHit(f: FieldHitFn) {
  fieldSubs.add(f);
  return () => { fieldSubs.delete(f); };
}
/** 有几个人看得到我：副本里是同一个洞口的人，大地图上是视野范围里的人 */
function watchers(x: number, y: number, dg?: DungeonPresence) {
  let n = 0;
  for (const p of everyone) {
    if (dg ? p.dg?.gate === dg.gate : !p.dg && Math.abs(p.x - x) <= VIEW_TILES + 10 && Math.abs(p.y - y) <= VIEW_TILES + 10) n++;
  }
  return n;
}

/**
 * 把自己的位置、装备和等级发出去：格子变了、换了东西或隔了一阵才发。副本里带上 dg（大地图和副本场景都调）。
 * 附近有人看时发得勤（大地图每 0.25 秒、副本每 0.15 秒，人多了稍慢），没人看时 1.5 秒一次（10-26 优化延迟）
 */
let sent = { x: -1, y: -1, key: '', at: 0 };
let checked = 0;
export function publishSelf(st: GameState, x: number, y: number, work?: { anim: string; flip: boolean }, dg?: DungeonPresence) {
  if (!online.me()) return;
  if (!listening) {
    listening = true;
    online.onPresence((all) => {
      everyone = all;
      for (const h of takeFieldHits(all)) fieldSubs.forEach((f) => f(h));
    });
  }
  updateAggro(st, x, y, !!work?.anim.startsWith('fight-'), dg);
  const now = Date.now();
  const [gap, step] = moveCadence(watchers(x, y, dg), !!dg);
  if (now - checked < Math.min(gap, 150)) return;
  checked = now;
  const action = st.paused ? undefined : st.queue[0]?.action;
  const mounted = st.mounted ? st.equipment.mount : undefined;
  const snap = levelSnapshot(st);
  const max = maxHp(st);
  const hp = Math.max(0, Math.round(st.hp));
  // 野外组队打同一只怪：带上自己对这一只累计打了多少（队友那边记到同一只怪上）
  const c = st.combat;
  const fd = !dg && action && c?.crew && work?.anim.startsWith('fight-') ? { k: action, n: c.copy ?? 0, dmg: c.pTotal ?? 0, crit: c.pCrit || undefined } : undefined;
  // 血量按 5% 一档比较，打怪时不用每下都发
  const key = JSON.stringify([st.settings.skin, action, mounted, st.equipment, snap.total, snap.combat, Math.round((hp / max) * 20), rallyTime(), work?.anim, work?.flip, (st.gates ?? []).map((g) => g.id).join(),
    dg && [dg.gate, dg.floor, dg.idx, dg.phase, dg.kills, dg.anim, dg.flip, dg.dmg], fd && [fd.n, fd.dmg]]);
  const px = dg ? dg.x / T : x;
  const py = dg ? dg.y / T : y;
  const moved = Math.abs(px - sent.x) + Math.abs(py - sent.y) >= step && now - sent.at >= gap;
  // 打怪、换装备这类变化马上发（副本里队友要立刻看到伤害），只是走路才按节奏
  if (!moved && key === sent.key && now - sent.at < KEEPALIVE_MS) return;
  sent = { x: px, y: py, key, at: now };
  online.publishPresence({ x, y, outfit: st.settings.skin, action, mounted, equip: { ...st.equipment }, total: snap.total, combat: snap.combat, hp, maxHp: max, rally: rallyTime() || undefined, anim: work?.anim, flip: work?.flip, gates: st.gates?.length ? st.gates : undefined,
    dg: dg ? { ...dg, x: Math.round(dg.x), y: Math.round(dg.y) } : undefined, fd });
}

/** 同一格的站位：第 0 个是原位，往后排在左上、左下、更靠后 */
const CROWD: [number, number][] = [[0, 0], [-6, -10], [-6, 10], [-14, 0], [-14, -14], [-14, 14], [-22, -6], [-22, 8]];

/**
 * 野外组队打同一只怪的站位（用户 10-27）：围着怪站，不叠在一起。
 * 近战的在怪的两侧（右边那个朝左打），[横向 × 贴身距离, 纵向像素]；远程的在自己身后错开，[往后退, 纵向]。
 * 自己永远在怪的左边，所以自己是近战就不占左边正中，自己是远程就不占远程正中。
 */
const MELEE_SPOTS: [number, number][] = [[1, 0], [-0.85, -11], [0.85, 11], [-0.85, 11], [0.85, -11], [1.5, -6], [1.5, 6]];
const RANGED_SPOTS: [number, number][] = [[0, -12], [0, 12], [-10, -22], [-10, 22], [-18, 0]];
const meleeRange = (w?: FightWeapon) => (w ? FIGHT_RANGE[w] ?? 0 : 0) < 0.75;
const weaponOfAnim = (anim?: string) => /^fight-(\w+?)(-ready)?$/.exec(anim ?? '')?.[1] as FightWeapon | undefined;

/** 队友伤害数字的颜色，按队伍名单顺序 */
export const MATE_COLORS = ['#6ac8ff', '#c08aff', '#7aeea0', '#ff9ad0', '#ffe07a'];

/** 自己正在打的怪：画面上的位置（脚底像素）、贴身距离、自己的武器 */
export interface FightAnchor {
  action: string;
  x: number;
  y: number;
  melee: number;
  weapon: FightWeapon;
}

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
  /** 副本里队友头顶的小血条（10-26） */
  bar?: Phaser.GameObjects.Graphics;
  /** 估出来的对方移动速度（像素/秒）、目标上次变的时间、上次真在走的时间（10-27 插值） */
  spd: number;
  tAt: number;
  movedAt: number;
  hp?: number;
  maxHp?: number;
  /** 骑南瓜坐骑时的特效 */
  fx?: PumpkinFx;
}

export class OtherPlayers {
  private others = new Map<string, Other>();
  private latest: Presence[] = [];
  private off: () => void;
  /** 大地图上自己正在打的怪（地图场景每帧设），一起打它的人围着它站 */
  fight?: FightAnchor;
  private swingAt = new Map<string, number>();
  /** place：这个人画在哪（像素，脚底），不画就返回 null。默认是大地图：按格子摆，在副本里的人不画 */
  constructor(private scene: Phaser.Scene, private place?: (p: Presence) => { x: number; y: number; anim?: string; flip?: boolean } | null) {
    this.off = online.onPresence((all) => { this.latest = all; });
  }

  destroy() {
    this.off();
    this.others.forEach((o) => { o.box.destroy(); o.fx?.destroy(); });
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

  /** 队友打中了一下：播一遍出手动作。返回多少毫秒后打中（飘字用），这人没画出来就是 -1 */
  swing(id: string): number {
    const o = this.others.get(id);
    const w = weaponOfAnim(o?.anim);
    if (!o || !w) return -1;
    this.swingAt.set(id, this.scene.time.now);
    return Math.round(FIGHT[w].ms * FIGHT[w].hit);
  }

  /** 和自己打同一只怪的人各站哪（按 id 排序，各家算出来的顺序一样） */
  private fightSpots(near: { x: number; y: number }) {
    const out = new Map<string, { x: number; y: number; flip: boolean }>();
    const f = this.fight;
    if (!f) return out;
    const crew = this.latest
      .filter((p) => !p.dg && p.action === f.action && p.anim?.startsWith('fight-') && Math.abs(p.x - near.x) + Math.abs(p.y - near.y) <= 10)
      .sort((a, b) => (a.playerId < b.playerId ? -1 : 1));
    const meMelee = meleeRange(f.weapon);
    const melee = meMelee ? MELEE_SPOTS : [[-1, 0] as [number, number], ...MELEE_SPOTS];
    const ranged = meMelee ? [[0, 0] as [number, number], ...RANGED_SPOTS] : RANGED_SPOTS;
    let mi = 0, ri = 0;
    for (const p of crew) {
      const w = weaponOfAnim(p.anim);
      if (meleeRange(w)) {
        const [sx, sy] = melee[mi++ % melee.length];
        out.set(p.playerId, { x: f.x + sx * f.melee, y: f.y + sy, flip: sx > 0 });
      } else {
        const [bx, sy] = ranged[ri++ % ranged.length];
        out.set(p.playerId, { x: f.x - f.melee - (w ? FIGHT_RANGE[w] : 0) * T + bx, y: f.y + sy, flip: false });
      }
    }
    return out;
  }

  publish(st: GameState, x: number, y: number, work?: { anim: string; flip: boolean }) {
    publishSelf(st, x, y, work);
  }

  /** 换坐骑或上下坐骑：坐骑两层精灵，人夹在中间 */
  private setMount(o: Other, mk: string | undefined) {
    if (o.mk === mk) return;
    o.back?.destroy(); o.front?.destroy();
    o.fx?.destroy();
    o.back = o.front = undefined;
    o.fx = mk === 'pumpkin' ? new PumpkinFx(this.scene) : undefined;
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

  /** 副本里队友头顶画一条小血条，一眼看出谁快不行了 */
  private drawBar(o: Other) {
    if (!o.maxHp || o.hp == null) { o.bar?.setVisible(false); return; }
    if (!o.bar) { o.bar = this.scene.add.graphics(); o.box.add(o.bar); }
    const k = Math.max(0, Math.min(1, o.hp / o.maxHp));
    const w = 16, y = o.name.y - 7;
    o.bar.clear().setVisible(true)
      .fillStyle(0x000000, 0.7).fillRect(-w / 2 - 1, y - 1, w + 2, 4)
      .fillStyle(k < 0.3 ? 0xe04040 : k < 0.6 ? 0xe0b040 : 0x50d060, 1).fillRect(-w / 2, y, Math.max(k > 0 ? 1 : 0, Math.round(w * k)), 2);
    o.box.bringToTop(o.bar);
  }

  step(delta: number, near: { x: number; y: number }) {
    const seen = new Set<string>();
    // 同一格上一起干活、打怪的人各站各的位置（自己占第 0 个位置），远程往后站（用户 10-25）
    const crowd = new Map<string, number>();
    crowd.set(`${Math.round(near.x)},${Math.round(near.y)}`, 1);
    const spots = this.place ? undefined : this.fightSpots(near);
    const now = this.scene.time.now;
    const onMap = (p: Presence) => {
      if (p.dg) return null;
      if (Math.abs(p.x - near.x) > VIEW_TILES || Math.abs(p.y - near.y) > VIEW_TILES) return null;
      const spot = spots?.get(p.playerId);
      if (spot) {
        // 刚打中一下：播出手动作，播完回到架势
        const w = weaponOfAnim(p.anim);
        const swing = w && now - (this.swingAt.get(p.playerId) ?? -1e9) < Math.min(FIGHT[w].ms, 700);
        return { x: spot.x, y: spot.y, anim: swing ? `fight-${w}` : p.anim, flip: spot.flip };
      }
      let x = p.x * T + T / 2, y = p.y * T + T / 2 + 7;
      if (p.anim) {
        const cell = `${p.x},${p.y}`;
        const i = crowd.get(cell) ?? 0;
        crowd.set(cell, i + 1);
        const [ox, oy] = CROWD[i % CROWD.length];
        const w = /^fight-(\w+)-ready$/.exec(p.anim)?.[1] as FightWeapon | undefined;
        x += ox - (w ? (FIGHT_RANGE[w] ?? 0) * T : 0);
        y += oy;
      }
      return { x, y, anim: p.anim, flip: p.flip };
    };
    for (const p of this.latest) {
      const at = (this.place ?? onMap)(p);
      if (!at) continue;
      seen.add(p.playerId);
      const tx = at.x, ty = at.y;
      const key = this.sheet(p.outfit);
      let o = this.others.get(p.playerId);
      if (o && o.key !== key) { o.box.destroy(); o.fx?.destroy(); o = undefined; }
      if (!o) {
        const body = this.scene.add.sprite(0, 0, key).setOrigin(0.5, (HERO_FEET + HERO_PAD.t) / FRAME_H);
        // 点别的玩家弹出菜单（查看信息、装备、加好友、交易…）
        body.setInteractive({ useHandCursor: true, pixelPerfect: false }).setData('player', p.playerId);
        body.play(`${key}:idle-down`);
        const name = this.scene.add.text(0, -HERO_FEET + 1, '', { fontFamily: FONT, fontSize: '7px', color: '#cfe0ff', stroke: '#000', strokeThickness: 2, resolution: 4 }).setOrigin(0.5);
        const box = this.scene.add.container(tx, ty, [body, name]).setAlpha(0.92);
        o = { box, body, name, key, tx, ty, dir: 'down', flip: false, spd: 0, tAt: 0, movedAt: 0 };
        this.others.set(p.playerId, o);
      }
      o.name.setText(p.guildTag ? `[${p.guildTag}] ${p.name}` : p.name);
      if (tx !== o.tx || ty !== o.ty) {
        // 按两次同步之间走了多远估对方的速度（骑快马时比走路快两三倍），平滑一下免得忽快忽慢
        const now = this.scene.time.now;
        const dt = now - o.tAt;
        const jump = Math.hypot(tx - o.tx, ty - o.ty);
        if (o.tAt && dt > 60 && dt < 3000 && jump < T * 30) o.spd = o.spd ? o.spd * 0.6 + (jump / dt) * 1000 * 0.4 : (jump / dt) * 1000;
        o.tAt = now;
      }
      o.tx = tx; o.ty = ty;
      o.hp = p.hp; o.maxHp = p.maxHp;
      this.setMount(o, p.mounted ? mountKindOf(p.mounted) : undefined);
      o.anim = at.anim && this.scene.anims.exists(`${key}:${at.anim}`) ? at.anim : undefined;
      if (o.anim) o.flip = !!at.flip;
    }
    for (const [id, o] of this.others) {
      if (!seen.has(id)) { o.box.destroy(); o.fx?.destroy(); this.others.delete(id); continue; }
      const dx = o.tx - o.box.x, dy = o.ty - o.box.y;
      const d = Math.hypot(dx, dy);
      let moving = false;
      // 隔太远（刚传送或刚出现）直接放过去
      if (d > T * 30) o.box.setPosition(o.tx, o.ty);
      else if (d > 0.5) {
        // 按估出来的对方速度匀速走（10-27：以前固定每秒 4 格，骑马的人越落越远再猛追，一顿一顿的）；
        // 落后多了就在约半秒内追上。副本里（自定义摆位）追得更紧，约 0.15 秒
        const base = Math.max(T * (o.mk ? 6 : 3.5), Math.min(T * 16, o.spd));
        const v = (Math.max(base, d / (this.place ? 0.15 : 0.5)) * delta) / 1000;
        const k = Math.min(1, v / d);
        o.box.setPosition(o.box.x + dx * k, o.box.y + dy * k);
        o.dir = Math.abs(dx) > Math.abs(dy) ? 'side' : dy > 0 ? 'down' : 'up';
        o.flip = o.dir === 'side' && dx < 0;
        o.movedAt = now;
        moving = true;
      }
      // 刚走到上一个同步点、下一个还在路上：多播一小会儿走路动画，不在每格之间站一下又走
      else if (now - o.movedAt < 300 && now - o.tAt < 600) moving = true;
      this.pose(o, moving);
      if (this.place) this.drawBar(o);
      o.box.setDepth(o.box.y + 999);
      o.fx?.step(now, { x: o.box.x + (o.back?.x ?? 0), y: o.box.y + (o.back?.y ?? 0), moving: moving && !o.anim, dir: o.dir === 'side' ? (o.flip ? -1 : 1) : 0, depth: o.box.depth, lite: true });
    }
  }
}
