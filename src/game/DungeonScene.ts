import Phaser from 'phaser';
import { MONSTERS } from '../core/data';
import { buffMob, DG_TILE_MS, dungeonFloor, type DgFloor, type DgStop } from '../core/dungeon';
import { baseOf } from '../core/quality';
import { combatStats } from '../core/sim';
import type { DungeonRun, MonsterDef } from '../core/types';
import { store } from '../store';
import { tl } from '../i18n';
import { DPR } from './dpr';
import { paintDgChest, paintDgDecor, paintDgFloor, paintDgWall, paintStairs, themeAccent, themeFog, type DgThemeId } from './dungeonArt';
import { FIGHT, FIGHT_RANGE, fightWeapon, FRAME_H, HERO_FEET, HERO_PAD } from './hero';
import { animsOf, monsterFrameSize, paintMonsterSheet } from './monsterArt';
import { T } from './tiles';
import { OtherPlayers, publishSelf } from './others';

/** 场景 → 界面：点了宝箱（界面去开箱、弹战利品） */
export const DG_CHEST = 'dg-chest';
/** 场景 → 界面：飘一条提示 */
export const DG_MSG = 'dg-msg';

/** 组队站位：[横向错开, 往后退]（像素） */
const SLOTS: [number, number][] = [[0, 0], [-11, 4], [11, 4], [-6, 14], [6, 14]];

const FONT = '"PingFang SC","Microsoft YaHei",sans-serif';
const D_FLOAT = 9e5;
const hash = (x: number, y: number, salt = 0) => {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/**
 * 地下副本场景（用户 10-25）：进副本后从大地图切过来。
 * 地形按洞口的随机种子现生成（core/dungeon.ts），每层不一样；角色按存档里的进度自动走路、打怪、下楼，
 * 最后一层的首领守着宝箱建筑，清完所有怪后点宝箱打开。
 */
export class DungeonScene extends Phaser.Scene {
  constructor() {
    super('dungeon');
  }

  private player!: Phaser.GameObjects.Container;
  private body!: Phaser.GameObjects.Sprite;
  private floorKey = '';
  private objs: Phaser.GameObjects.GameObject[] = [];
  private mobs = new Map<number, Phaser.GameObjects.Sprite>();
  private bars = new Map<number, Phaser.GameObjects.Graphics>();
  private chest?: Phaser.GameObjects.Image;
  private chestState = '';
  private F?: DgFloor;
  private unsub: (() => void)[] = [];
  private leaving = false;
  /** 收到存档的时刻：走路进度按真实时间往前推，画面不会一跳一跳 */
  private seenAt = 0;
  private seen?: { idx: number; floor: number; p: number; m: number; hp: number };
  private anim = '';
  /** 同一个副本、同一层的队友（10-25 同步） */
  private mates?: OtherPlayers;

  create() {
    this.cameras.main.setBackgroundColor('#06060a');
    this.player = this.add.container(0, 0);
    const shadow = this.add.ellipse(0, 6, 12, 5, 0x000000, 0.35);
    this.body = this.add.sprite(0, 7, 'hero').setOrigin(0.5, (HERO_FEET + HERO_PAD.t) / FRAME_H);
    const name = this.add.text(0, 7 - HERO_FEET + 1, tl('[苍岭] 你'), { fontFamily: FONT, fontSize: '7px', color: '#ffffff', stroke: '#000', strokeThickness: 2, resolution: 4 }).setOrigin(0.5);
    // 角色周围一圈暖光，洞里其他地方暗一些
    const light = this.add.image(0, 0, 'glow').setTint(0xffd8a0).setAlpha(0.18).setScale(1.6).setBlendMode(Phaser.BlendModes.ADD);
    this.player.add([light, shadow, this.body, name]);
    const cam = this.cameras.main;
    const cssWidth = () => this.scale.width / DPR;
    cam.setZoom(Phaser.Math.Clamp((cssWidth() / (cssWidth() > 700 ? 24 : 14)) / T, 1.5, 4) * DPR);
    cam.startFollow(this.player, false, 0.12, 0.12);
    this.input.mouse?.disableContextMenu();
    this.unsub.push(store.subscribe(() => this.onStore()));
    this.events.on('wake', () => this.arrive());
    this.mates = new OtherPlayers(this, (p) => {
      const run = store.state.dungeon;
      const d = p.dg;
      if (!run || !d || d.gate !== run.gate.id || d.floor !== run.floor) return null;
      if (run.members && !run.members.some((m) => m.id === p.playerId)) return null;
      return { x: d.x, y: d.y, anim: d.anim, flip: d.flip };
    });
    const cleanup = () => { this.unsub.forEach((u) => u()); this.unsub = []; this.mates?.destroy(); };
    this.events.once('shutdown', cleanup);
    this.events.once('destroy', cleanup);
    this.arrive();
  }

  private arrive() {
    this.leaving = false;
    this.floorKey = '';
    this.seen = undefined;
    this.onStore();
    const p = this.heroPos();
    if (p) this.player.setPosition(p.x, p.y);
    this.cameras.main.centerOn(this.player.x, this.player.y);
  }

  private onStore() {
    if (!this.scene.isActive() || this.leaving) return;
    const run = store.state.dungeon;
    if (!run) {
      // 离开副本（打完、阵亡、回城卷轴）：切回大地图
      this.leaving = true;
      this.scene.switch('map');
      return;
    }
    const key = `${run.gate.id}:${run.floor}`;
    if (key !== this.floorKey) this.buildFloor(run);
    this.seenAt = this.time.now;
    this.syncMobs(run);
    this.syncChest(run);
    this.syncFight(run);
  }

  // ───────── 画一层 ─────────
  private buildFloor(run: DungeonRun) {
    for (const o of this.objs) o.destroy();
    this.objs = [];
    for (const s of this.mobs.values()) s.destroy();
    this.mobs.clear();
    for (const b of this.bars.values()) b.destroy();
    this.bars.clear();
    this.chest = undefined;
    this.chestState = '';
    const F = (this.F = dungeonFloor(run.gate, run.floor));
    this.floorKey = `${run.gate.id}:${run.floor}`;
    const th = F.theme as DgThemeId;
    this.cameras.main.setBackgroundColor(themeFog(th));
    const tex = `dg-map-${this.floorKey}`;
    if (!this.textures.exists(tex)) {
      const floors = [0, 1, 2, 3].map((v) => paintDgFloor(th, v));
      const faces = [0, 1, 2].map((v) => paintDgWall(th, true, v));
      const tops = [0, 1].map((v) => paintDgWall(th, false, v));
      const c = document.createElement('canvas');
      c.width = F.w * T;
      c.height = F.h * T;
      const ctx = c.getContext('2d')!;
      const at = (x: number, y: number) => (x < 0 || y < 0 || x >= F.w || y >= F.h ? 0 : F.grid[y * F.w + x]);
      for (let y = 0; y < F.h; y++) {
        for (let x = 0; x < F.w; x++) {
          const h = hash(x, y, 3);
          if (at(x, y)) ctx.drawImage(floors[h < 0.55 ? 0 : h < 0.75 ? 1 : h < 0.9 ? 2 : 3], x * T, y * T);
          else if (at(x, y + 1)) ctx.drawImage(faces[Math.floor(h * 3)], x * T, y * T);
          else {
            // 离地面越远越暗，洞外是一片黑
            let near = false;
            for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) if (at(x + dx, y + dy)) { near = true; break; }
            if (near) ctx.drawImage(tops[h < 0.5 ? 0 : 1], x * T, y * T);
          }
        }
      }
      this.textures.addCanvas(tex, c);
    }
    this.objs.push(this.add.image(0, 0, tex).setOrigin(0).setDepth(-10));
    for (const d of F.decor) {
      const k = `dg-decor-${th}-${d.kind}`;
      if (!this.textures.exists(k)) this.textures.addCanvas(k, paintDgDecor(th, d.kind));
      this.objs.push(this.add.image(d.x * T + T / 2, d.y * T + T / 2, k).setDepth(d.y * T + T));
    }
    // 起点一圈光，楼梯
    const glow = this.add.image(F.start.x * T + T / 2, F.start.y * T + T / 2, 'glow').setTint(Phaser.Display.Color.HexStringToColor(themeAccent(th)).color).setAlpha(0.25).setBlendMode(Phaser.BlendModes.ADD);
    this.objs.push(glow);
    if (F.stairs) {
      if (!this.textures.exists('dg-stairs')) this.textures.addCanvas('dg-stairs', paintStairs());
      const s = this.add.image(F.stairs.x * T + T / 2, F.stairs.y * T + T / 2, 'dg-stairs').setDepth(-5);
      const t = this.add.text(s.x, s.y - 18, tl('下一层'), { fontFamily: FONT, fontSize: '8px', color: '#ffe8a0', stroke: '#000', strokeThickness: 2, resolution: 4 }).setOrigin(0.5).setDepth(D_FLOAT - 10);
      this.objs.push(s, t);
    }
    const p = this.heroPos();
    if (p) this.player.setPosition(p.x, p.y);
  }

  private stopXY(i: number) {
    const st = this.F!.stops[i];
    return { x: st.x * T + T / 2, y: st.y * T + T / 2 + 4 };
  }

  /** 这一层还活着的怪：idx 之前的都打死了 */
  private syncMobs(run: DungeonRun) {
    const F = this.F!;
    F.stops.forEach((st, i) => {
      if (st.kind !== 'mob') return;
      const dead = i < run.idx;
      const spr = this.mobs.get(i);
      if (dead) {
        if (spr) {
          this.mobs.delete(i);
          this.bars.get(i)?.destroy();
          this.bars.delete(i);
          this.puff(spr.x, spr.y);
          this.tweens.add({ targets: spr, alpha: 0, duration: 300, onComplete: () => spr.destroy() });
        }
        return;
      }
      if (spr) return;
      const m = MONSTERS[st.monster!];
      if (!m) return;
      const { x, y } = this.stopXY(i);
      const look = MONSTERS[m.dungeon?.base ?? m.id] ?? m;
      const key = this.monTex(look);
      const S = monsterFrameSize(look);
      const s = this.add.sprite(x, y, key, 'idle-0').setOrigin(0.5, (S - 3) / S).setDepth(y + 1000);
      if (m.rank === 'boss') s.setScale(1.25);
      s.play({ key: `${key}-idle`, startFrame: Math.floor(Math.random() * 6) });
      s.setData('look', look.id);
      this.mobs.set(i, s);
      if (m.rank !== 'normal') {
        const label = this.add.text(x, y - S * s.scaleY - 4, m.rank === 'boss' ? tl`首领 ${m.name}` : tl`精英 ${m.name}`, {
          fontFamily: FONT, fontSize: '7px', color: m.rank === 'boss' ? '#ff8a6a' : '#ffd86a', stroke: '#000', strokeThickness: 2, resolution: 4,
        }).setOrigin(0.5).setDepth(D_FLOAT - 5);
        this.objs.push(label);
        s.once('destroy', () => label.destroy());
      }
    });
  }

  private monTex(m: MonsterDef) {
    const key = `mon-${m.id}`;
    if (this.textures.exists(key)) return key;
    const sheet = paintMonsterSheet(m);
    const tex = this.textures.addCanvas(key, sheet.canvas)!;
    for (const f of sheet.frames) tex.add(f.name, 0, f.x, f.y, sheet.size, sheet.size);
    for (const a of animsOf(m)) {
      if (this.anims.exists(`${key}-${a.key}`)) continue;
      this.anims.create({ key: `${key}-${a.key}`, frameRate: a.rate, repeat: a.repeat, frames: Array.from({ length: a.frames }, (_, i) => ({ key, frame: `${a.key}-${i}` })) });
    }
    return key;
  }

  /** 宝箱建筑：最后一层终点。清完怪之前是锁着的，点了提示还剩几只 */
  private syncChest(run: DungeonRun) {
    const F = this.F!;
    if (!F.chest) return;
    const q = run.chest ?? 0;
    const open = run.phase === 'open';
    const st = `${q}${open}`;
    if (st === this.chestState) return;
    this.chestState = st;
    const k = `dg-chest-${q}-${open}`;
    if (!this.textures.exists(k)) this.textures.addCanvas(k, paintDgChest(q, open));
    const x = F.chest.x * T + T / 2;
    const y = F.chest.y * T + T;
    if (!this.chest) {
      this.chest = this.add.image(x, y, k).setOrigin(0.5, 1).setDepth(y + 900).setInteractive({ useHandCursor: true });
      this.chest.on('pointerdown', () => this.game.events.emit(DG_CHEST));
      const glow = this.add.image(x, y - 14, 'glow').setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.4).setDepth(y + 899);
      this.tweens.add({ targets: glow, alpha: 0.15, yoyo: true, repeat: -1, duration: 900 });
      this.chest.setData('glow', glow);
      this.objs.push(this.chest, glow);
    } else this.chest.setTexture(k);
    const glow = this.chest.getData('glow') as Phaser.GameObjects.Image;
    // 首领倒下之前看不出品质，先是暗的
    glow.setTint(run.chest === undefined ? 0x806040 : [0x5ad06a, 0x4a9aff, 0xc06aff, 0xffc840][q]);
  }

  // ───────── 角色 ─────────
  /** 现在角色应该在哪：走路按真实时间往前推，打怪站在怪旁边 */
  private heroPos(): { x: number; y: number; dx: number } | null {
    const run = store.state.dungeon;
    const F = this.F;
    if (!run || !F) return null;
    const legEnd = (i: number) => {
      for (let k = i; k >= 0; k--) {
        const l = F.legs[k];
        if (l?.length) return l[l.length - 1];
      }
      return F.start;
    };
    const px = (p: { x: number; y: number }) => ({ x: p.x * T + T / 2, y: p.y * T + T / 2 });
    if (run.phase === 'walk') {
      const leg = F.legs[run.idx] ?? [];
      const from = run.idx > 0 ? legEnd(run.idx - 1) : F.start;
      const pts = [from, ...leg];
      const msNow = Math.max(0, run.ms - (this.time.now - this.seenAt));
      const total = Math.max(1, leg.length * DG_TILE_MS);
      const done = Math.max(0, Math.min(1, 1 - msNow / Math.max(total, run.total || total)));
      const f = done * (pts.length - 1);
      const i = Math.min(pts.length - 2, Math.floor(f));
      if (pts.length < 2) return { ...px(from), dx: 0 };
      const a = px(pts[i]);
      const b = px(pts[i + 1]);
      const k = f - i;
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, dx: b.x - a.x || b.y - a.y ? b.x - a.x : 0 };
    }
    const st = F.stops[run.idx];
    if (run.phase === 'fight' && st) return this.fightSpot(st, legEnd(run.idx));
    const at = px(legEnd(run.idx));
    return { ...at, dx: st ? st.x * T + T / 2 - at.x : 0 };
  }

  /**
   * 打怪站位（用户 10-25）：尽量站在怪的左右两侧（不压住怪），
   * 远程武器顺着这个方向往后退几格，退到墙为止。
   */
  private fightSpot(st: DgStop, from: { x: number; y: number }) {
    const F = this.F!;
    const open = (x: number, y: number) => x >= 0 && y >= 0 && x < F.w && y < F.h && F.grid[Math.round(y) * F.w + Math.round(x)] === 1;
    let dx = Math.sign(from.x - st.x);
    let dy = Math.sign(from.y - st.y);
    if (dx === 0) {
      // 从上下方走过来：挪到侧面
      const side = open(st.x - 1, st.y) ? -1 : open(st.x + 1, st.y) ? 1 : 0;
      if (side) { dx = side; dy = 0; }
    }
    if (!dx && !dy) dx = -1;
    // 近战也要隔开一点，不和怪的身子叠在一起（大块头隔得更开）
    const spr = this.mobs.get(this.F!.stops.indexOf(st));
    const look = spr ? MONSTERS[spr.getData('look') as string] : undefined;
    const body = look ? monsterFrameSize(look) * (spr?.scaleX ?? 1) : 24;
    const melee = Math.max(1.75, (body * 0.6) / T);
    const want = melee + FIGHT_RANGE[this.weapon()];
    let k = 1;
    for (let r = 1; r <= want + 1e-6; r = Math.min(want, r + 0.25)) {
      if (!open(st.x + dx * r, st.y + dy * r)) break;
      k = r;
      if (r >= want) break;
    }
    // 组队：每个人按名单顺序错开站，不叠在一起（队友那边也按同样的规则算）
    const [side, back] = SLOTS[this.slot() % SLOTS.length];
    const x = (st.x + dx * k) * T + T / 2 - dx * back + dy * side;
    const y = (st.y + dy * k) * T + T / 2 - dy * back + (dx ? side : 0);
    return { x, y, dx: -dx || 1 };
  }

  /** 自己在队伍名单里排第几（单人是 0） */
  private slot() {
    const run = store.state.dungeon;
    return Math.max(0, run?.members?.findIndex((m) => m.id === run.me) ?? 0);
  }

  private faceLeft = false;
  update(_t: number, delta: number) {
    const run = store.state.dungeon;
    if (!run || !this.F) return;
    this.mates?.step(delta, { x: 0, y: 0 });
    publishSelf(store.state, run.gate.x, run.gate.y, undefined, {
      gate: run.gate.id, floor: run.floor, idx: run.idx, phase: run.phase, kills: run.kills,
      x: this.player.x, y: this.player.y + 7, anim: this.anim.startsWith('fight-') ? `fight-${this.weapon()}-ready` : this.anim, flip: this.body.flipX,
    });
    const p = this.heroPos();
    if (!p) return;
    const moving = run.phase === 'walk' && (Math.abs(p.x - this.player.x) > 0.05 || Math.abs(p.y - this.player.y) > 0.05);
    const vx = p.x - this.player.x;
    const vy = p.y - this.player.y;
    // 开打时从路口走到站位（远程往后退几格），不瞬移
    const adjust = run.phase === 'fight' && Math.hypot(vx, vy) > 1;
    if (adjust) {
      const step = Math.min(1, (90 * this.game.loop.delta / 1000) / Math.hypot(vx, vy));
      this.player.setPosition(this.player.x + vx * step, this.player.y + vy * step).setDepth(this.player.y + 1000);
      const back = Math.sign(vx) === Math.sign(p.dx) || !vx;
      this.body.setFlipX(back ? p.dx < 0 : vx < 0);
      this.play(Math.abs(vy) > Math.abs(vx) * 1.2 ? (vy > 0 ? 'walk-down' : 'walk-up') : 'walk-side');
      return;
    }
    this.player.setPosition(p.x, p.y).setDepth(p.y + 1000);
    if (run.phase === 'walk') {
      if (Math.abs(vx) > 0.01) this.faceLeft = vx < 0;
      const dir = Math.abs(vy) > Math.abs(vx) * 1.2 ? (vy > 0 ? 'down' : 'up') : 'side';
      this.play(moving ? `walk-${dir}` : `idle-${dir}`);
      this.body.setFlipX(dir === 'side' && this.faceLeft);
    } else if (run.phase === 'fight') {
      this.faceLeft = p.dx < 0;
      this.body.setFlipX(this.faceLeft);
      if (!this.anim.startsWith('fight-') || this.anim.endsWith('-ready') || !this.body.anims.isPlaying) this.play(`fight-${this.weapon()}-ready`);
    } else {
      this.play('idle-down');
      this.body.setFlipX(false);
    }
    // 精英、首领头顶血条
    const c = store.state.combat;
    for (const [i, spr] of this.mobs) {
      const m0 = MONSTERS[this.F.stops[i].monster!];
      if (!m0 || (m0.rank === 'normal' && i !== run.idx)) continue;
      const m = buffMob(m0, run.party);
      let g = this.bars.get(i);
      if (!g) { g = this.add.graphics().setDepth(D_FLOAT - 6); this.bars.set(i, g); }
      const hp = i === run.idx && c && run.phase === 'fight' ? c.monsterHp : m.hp;
      const w = m.rank === 'boss' ? 30 : 16;
      g.clear();
      g.fillStyle(0x000000, 0.7).fillRect(spr.x - w / 2 - 1, spr.y - monsterFrameSize(MONSTERS[spr.getData('look')] ?? m) * spr.scaleY - 1, w + 2, 4);
      g.fillStyle(m.rank === 'boss' ? 0xe04a3a : 0xe0a03a).fillRect(spr.x - w / 2, spr.y - monsterFrameSize(MONSTERS[spr.getData('look')] ?? m) * spr.scaleY, Math.max(0, (w * hp) / m.hp), 2);
    }
  }

  private play(key: string) {
    if (this.anim === key && this.body.anims.isPlaying) return;
    this.anim = key;
    this.body.play(key, true);
  }

  private weapon() {
    return fightWeapon(baseOf(store.state.equipment.weapon ?? ''));
  }

  /** 打怪的特效：主角出手挥一下、飘伤害数字；怪出手播攻击动画、主角掉血飘红字 */
  private syncFight(run: DungeonRun) {
    const c = store.state.combat;
    const prev = this.seen;
    this.seen = { idx: run.idx, floor: run.floor, p: c?.pSwings ?? 0, m: c?.mSwings ?? 0, hp: store.state.hp };
    if (!prev || prev.idx !== run.idx || prev.floor !== run.floor || run.phase !== 'fight' || !c) return;
    const spr = this.mobs.get(run.idx);
    const m = MONSTERS[this.F!.stops[run.idx]?.monster ?? ''];
    if (!spr || !m) return;
    const look = spr.getData('look') as string;
    if ((c.pSwings ?? 0) > prev.p) {
      const w = this.weapon();
      const f = FIGHT[w];
      const st = combatStats(store.state, m);
      const dur = Math.min(f.ms, Math.max(200, (store.state.combat?.playerTimerMs ?? 2000) * 0.85));
      const key = `fight-${w}`;
      this.anim = key;
      this.body.play({ key, frameRate: (this.anims.get(key).frames.length * 1000) / dur }, false);
      const dmg = c.pDmg ?? -1;
      const crit = !!c.pCrit;
      const leech = c.pLeech ?? 0;
      const shoot = (land: () => void) => {
        const from = { x: this.player.x + (this.body.flipX ? -6 : 6), y: this.player.y - 4 };
        const to = { x: spr.x, y: spr.y - 8 };
        const far = Math.hypot(to.x - from.x, to.y - from.y);
        if (FIGHT_RANGE[w] < 1 || far < T * 1.5) return land();
        const magic = w === 'staff';
        const heavy = w === 'arbalest' && this.textures.exists('fx-bolt');
        const ang = Math.atan2(to.y - from.y, to.x - from.x);
        const pr = magic
          ? this.add.image(from.x, from.y - 4, 'glow').setTint(0x7ac8ff).setBlendMode(Phaser.BlendModes.ADD).setScale(0.18)
          : this.add.image(from.x, from.y, heavy ? 'fx-bolt' : 'fx-arrow').setRotation(ang);
        pr.setDepth(D_FLOAT - 2);
        // 战弓箭快、带残影；十字弩弩矢快、打中把怪顶退一下（10-26）
        const k = magic ? 3.6 : w === 'warbow' ? 1.9 : heavy ? 1.7 : 2.6;
        if (w === 'warbow') {
          const ghost = this.add.image(from.x, from.y, 'fx-arrow').setRotation(ang).setAlpha(0.35).setTint(0xfff0c0).setDepth(D_FLOAT - 3);
          this.tweens.add({ targets: ghost, x: to.x, y: to.y, delay: 40, duration: far * k, onComplete: () => ghost.destroy() });
        }
        this.tweens.add({
          targets: pr, x: to.x, y: to.y, duration: far * k, ease: magic ? 'Quad.easeIn' : 'Linear',
          onComplete: () => {
            pr.destroy();
            land();
            if (heavy && dmg > 0 && spr.active && !this.tweens.isTweening(spr)) {
              const x0 = spr.x;
              this.tweens.add({ targets: spr, x: x0 + (spr.x > this.player.x ? 4 : -4), duration: 80, yoyo: true, onComplete: () => { spr.x = x0; } });
              this.cameras.main.shake(70, 0.0018);
            }
          },
        });
      };
      this.time.delayedCall(dur * f.hit, () => shoot(() => {
        if (!spr.active) return;
        if (dmg < 0) return this.popText(spr.x + 4, spr.y - 22, tl('未命中'), '#b8b8c0', 7);
        spr.setTintFill(0xffffff);
        this.time.delayedCall(70, () => spr.active && spr.clearTint());
        const heavy = crit || dmg >= Math.max(3, st.playerMaxHit * 0.85);
        this.popText(spr.x + 4, spr.y - 22, crit ? tl`暴击 ${dmg}!` : `${dmg}`, crit ? '#ff7a30' : heavy ? '#ffb030' : '#ffffff', crit ? 11 : heavy ? 10 : 8);
        if (leech > 0) this.popText(this.player.x + 6, this.player.y - 30, `+${leech}`, '#6ee86a', 8);
        if (crit) this.cameras.main.shake(110, 0.003);
      }));
    }
    if ((c.mSwings ?? 0) > prev.m) {
      if (this.anims.exists(`mon-${look}-attack`)) {
        spr.play(`mon-${look}-attack`, true);
        spr.once('animationcomplete', () => spr.active && spr.play(`mon-${look}-idle`));
      }
      const d = c.mDmg ?? -1;
      // 主角站远了：怪扑过去打一下再退回原位（这一下打的是队友就不扑向自己，10-26 嘲讽）
      const gx = d === -2 ? 0 : this.player.x - spr.x;
      const gy = d === -2 ? 0 : this.player.y - spr.y;
      const gap = Math.hypot(gx, gy);
      if (gap > T * 1.5 && !this.tweens.isTweening(spr)) {
        const x0 = spr.x;
        const y0 = spr.y;
        const k = (gap - T) / gap;
        this.tweens.add({ targets: spr, x: x0 + gx * k, y: y0 + gy * k, duration: 160, ease: 'Quad.easeOut', yoyo: true, hold: 120, onComplete: () => spr.setPosition(x0, y0) });
      }
      if (d !== -2) this.popText(this.player.x - 6, this.player.y - 30, d < 0 ? tl('闪避') : `-${d}`, d < 0 ? '#a8d8ff' : '#ff5a4a', 8);
      if (d > 0) {
        this.body.setTintFill(0xff4a4a);
        this.time.delayedCall(80, () => this.body.clearTint());
      }
    }
  }

  private popText(x: number, y: number, text: string, color: string, size: number) {
    const t = this.add.text(x + (Math.random() - 0.5) * 4, y, text, {
      fontFamily: FONT, fontSize: `${size}px`, fontStyle: 'bold', color, stroke: '#000', strokeThickness: 2, resolution: 4,
    }).setOrigin(0.5).setDepth(D_FLOAT).setScale(0.6);
    this.tweens.add({ targets: t, scale: 1, y: y - 10, duration: 180, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, y: y - 16, alpha: 0, delay: 500, duration: 450, onComplete: () => t.destroy() });
  }

  private puff(x: number, y: number) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const p = this.add.image(x, y - 2, 'p-smoke').setDepth(D_FLOAT - 3).setAlpha(0.7).setScale(0.6);
      this.tweens.add({ targets: p, x: x + Math.cos(a) * 12, y: y - 2 + Math.sin(a) * 5, alpha: 0, scale: 1.3, duration: 500, onComplete: () => p.destroy() });
    }
  }
}
