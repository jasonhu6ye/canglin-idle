import { leaveHome } from '../core/home';
import Phaser from 'phaser';
import { ACTIONS, CROP_DEFS, CROPS, cropsOfField, FARM_PLOTS, PLOT_BY_ID, ITEMS, MAP_H, MAP_W, MONSTERS, NODES, SKILLS, DANGER, dangerLevel, nodeOfAction, nodesOfAction, planRoute, standOf, STONE_JUMP_MS, WAYSTONES, travelMs, WALK_TILES_PER_SEC, type MapNode, type Route } from '../core/data';
import { unlockWaystone, useWaystone, WAYSTONE_REACH, actionDuration, combatLevel, combatStats, MONSTER_MOVES, isBankId, leaveWork, maxHp, moveSpeed, resumeWork, setLoc, startWalk, teleport as teleportState, walkPos } from '../core/sim';
import { pickSeed, plotGrowth, plotPhase, tendPlot } from '../core/farm';
import { paintWaystone } from './waystoneArt';
import { paintPortal, paintPortalSwirl, PORTAL_H } from './homeArt';
import { animsOf, monsterFrameSize, paintMonsterSheet, type MonAnim } from './monsterArt';
import { paintSkull } from './skullArt';
import { paintAltar } from './halloweenArt';
import { WORLD_SKILL } from '../core/bestiary';
import { paintWolfSheet, wolfSaddle, WOLF_ANIMS, WOLF_FEET, WOLF_H, WOLF_W } from './wolfArt';
import { coatOf, horseKind, horseSaddle, HORSE_ANIMS, paintHorseSheet, paintFoal, paintRanch, PADDOCK_SPOTS, RANCH_H, RANCH_W } from './horseArt';
import { aptOf, RANCH } from '../core/ranch';
import { FRAME_H, FRAME_W, HERO_ANIMS, HERO_FEET, HERO_PAD, NPC_ANIMS, NPC_OUTFITS, outfitOf, paintHeroSheet, type HeroDir } from './hero';
import type { MonsterDef, RegionId, Summary } from '../core/types';
import { store } from '../store';
import { Ambience, D_FLOAT, D_GLOW, D_LABEL, D_PARTICLE, D_SMOKE } from './ambience';
import { paintArrow, paintCrop, paintHit, paintSlash } from './fxArt';
import { paintBuilding, paintCave, paintDot, paintGlow, paintProp, paintWindmillBlades, PROP_GLOW } from './art';
import { DPR } from './dpr';
import { paintResNode, resGlow, resOf, type ResKind } from './resArt';
import { NODE_MARKER, paintSprite, SPRITE_VARIANTS, SPRITES } from './sprites';
import { animateTileset, liquidIndex, paintTileset, T, TILESET, tileIndex, VARIANTS } from './tiles';
import {
  BUILDINGS, CHUNK, FIELDS, findPath, GROUNDS, groundIndex, hash, isWalkable, LIQUIDS, propsInChunk, reachableNear, regionAt, SPAWN, standTile,
  WANDERERS, type PropKind,
} from './world';

/** 步行速度（格/秒）。以后的坐骑在这上面乘倍率 */
export { WALK_TILES_PER_SEC };
let speedMultiplier = 1;
export const setSpeedMultiplier = (m: number) => {
  speedMultiplier = m;
};

const DRAG_THRESHOLD = 8;
const FONT = '"PingFang SC","Microsoft YaHei",sans-serif';
const CHIMNEY: Record<string, boolean> = { furnace: true, hall: true, smithy: true, inn: true, house: true, house3: true, atelier: true, manor: true, thatch: true };

export const NODE_CLICK = 'node-click';

/** 点位周围第 i 种怪的刷新点；地图扩大后怪物也散开些，不挤在点位旁边 */
const spotCache = new Map<string, { x: number; y: number }>();
function spawnSpot(n: MapNode, i: number, total: number) {
  const key = `${n.id}/${i}/${total}`;
  const hit = spotCache.get(key);
  if (hit) return hit;
  const ring = 8 + (i % 4) * 4;
  const ang = (i / Math.max(1, total)) * Math.PI * 2 + 0.6;
  const at = { x: Math.round(n.x + Math.cos(ang) * ring), y: Math.round(n.y + 2 + Math.sin(ang) * ring * 0.6) };
  // 挪到角色走得到的地方
  const spot = reachableNear(standTile(n), at) ?? at;
  spotCache.set(key, spot);
  return spot;
}

/** 首领在地图上额外放大 */
const BOSS_SCALE = 1.35;
/** 世界首领的图本身就画得很大（96×96），不再放大 */
/** 世界首领和活动首领用 96×96 的大图 */
const big96 = (m: MonsterDef) => !!(m.world || m.event);
const monScale = (m: MonsterDef) => (big96(m) ? 1 : m.rank === 'boss' ? BOSS_SCALE : 1);
const exactTrack = (id: string) => MONSTERS[id].rank === 'boss' || store.state.bestiary?.[id] !== undefined;

/** 追踪：Boss 给准确的刷新点，其他怪只给附近一个大概位置 */
function trackSpot(monsterId: string, exact = exactTrack(monsterId)): { x: number; y: number } | null {
  const n = nodeOfAction(`fight_${monsterId}`);
  if (!n) return null;
  const ids = n.actions.map((id) => ACTIONS[id]).filter((a) => a.kind === 'combat').map((a) => (a as { monster: string }).monster);
  const at = { ...spawnSpot(n, ids.indexOf(monsterId), ids.length) };
  // Boss 和交过手的怪给准确位置
  if (!exact) {
    at.x += Math.round((Math.random() * 2 - 1) * 7);
    at.y += Math.round((Math.random() * 2 - 1) * 7);
  }
  // 找最近的、走得到的格子
  return exact ? at : reachableNear(standTile(n), at);
}
export const REGION_CHANGE = 'region-change';
/** 开打首领时在屏幕上打出名字 */
export const BOSS_BANNER = 'boss-banner';

/** 角色当前所在格子，世界地图要用 */
export const playerPos = { x: SPAWN.x, y: SPAWN.y };

/** 任务现在对应的地点：正在走去的那个，否则离存档位置最近的那个（好几处都能做的动作，和存档算的是同一处） */
export const nodeForAction = (id: string | undefined): MapNode | undefined => {
  const st = store.state;
  return nodesOfAction(id).find((n) => n.id === st.travel?.to) ?? nodeOfAction(id, st.loc);
};
/** 能钓鱼的水面 */
const FISH_WATER = new Set<string>(['water', 'ocean', 'swampwater', 'shallows']);

/** 路线总长（格） */
/** 离 p 最近的能走的格子（按存档估出来的位置可能落在水里或墙里） */
function nearestWalkable(p: { x: number; y: number }) {
  const x0 = Math.round(p.x);
  const y0 = Math.round(p.y);
  for (let r = 0; r <= 24; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (isWalkable(x0 + dx, y0 + dy)) return { x: x0 + dx, y: y0 + dy };
      }
    }
  }
  return { x: x0, y: y0 };
}

function pathLength(from: { x: number; y: number }, path: { x: number; y: number }[]) {
  let len = 0;
  let prev = from;
  for (const p of path) {
    len += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  return len;
}

type Particle = { img: Phaser.GameObjects.Image; vx: number; vy: number; life: number; max: number; kind: Ambient };
type Ambient = 'snow' | 'ember' | 'firefly' | 'spore' | 'mote' | 'dust' | 'leaf';
const AMBIENT: Partial<Record<RegionId, Ambient>> = {
  snow: 'snow', lava: 'ember', woodland: 'firefly', giantwood: 'leaf', abyss: 'spore', swamp: 'mote', coast: 'dust',
  savanna: 'dust', autumn: 'leaf', jungle: 'firefly', canyon: 'dust', desert: 'dust', alpine: 'snow', crystal: 'spore',
};

export class MapScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Container;
  private playerBody!: Phaser.GameObjects.Sprite;
  private facing: HeroDir = 'down';
  private foe?: Phaser.GameObjects.Sprite;
  /** 精英和 Boss 头顶的血条（用户 10-22 要求） */
  private monSprites: Phaser.GameObjects.Sprite[] = [];
  private bars: {
    spr: Phaser.GameObjects.Sprite; m: MonsterDef; bg: Phaser.GameObjects.Rectangle; trail: Phaser.GameObjects.Rectangle; fill: Phaser.GameObjects.Rectangle;
    w: number; h: number; live: boolean; shown: number; label?: Phaser.GameObjects.Text; aura?: Phaser.GameObjects.GameObject[];
  }[] = [];
  /** 上一帧的战斗状态，用来判断怪物刚出手、刚挨打、刚死 */
  private foeSeen?: { hp: number; timer: number; respawn: number; p: number; m: number };
  private workTween?: Phaser.Tweens.Tween;
  private marker?: Phaser.GameObjects.Graphics;
  private currentAction?: string;
  /** 玩家手动点地面走开了（任务仍在后台进行） */
  private manual = false;
  private following = true;
  private unsub: (() => void)[] = [];
  private tilesetCanvas!: HTMLCanvasElement;
  private tilesetTex!: Phaser.Textures.CanvasTexture;
  private chunks = new Map<number, { destroy(): void }[]>();
  private glows: { img: Phaser.GameObjects.Image; phase: number; base: number }[] = [];
  private particles: Particle[] = [];
  private region: RegionId = 'town';
  private nodeLabels: { node: MapNode; text: Phaser.GameObjects.Text }[] = [];
  private lastCombatLevel = -1;
  private frame = 0;
  private amb!: Ambience;

  constructor() {
    super('map');
  }

  create() {
    this.makeTextures();
    this.buildTown();
    this.buildFields();
    for (const n of NODES) this.addNode(n);
    for (const w of WANDERERS) this.addWanderer(w.kind, w.x, w.y, w.radius);
    this.addMonsters();

    const task = store.state.queue[0];
    // 地图改版后旧存档的位置可能落在水里或新盖的房子里：挪到最近能站的格子
    const saved = store.state.walk ? walkPos(store.state) : store.state.loc ?? SPAWN;
    const start = nearestWalkable(saved);
    if (!store.state.walk && (start.x !== saved.x || start.y !== saved.y)) store.dispatch((g) => setLoc(g, start.x, start.y));
    this.player = this.add.container(start.x * T + T / 2, start.y * T + T / 2);
    const ring = this.add.ellipse(0, 6, 14, 6).setStrokeStyle(1, 0xe8b84a).setFillStyle(0xe8b84a, 0.25);
    this.playerBody = this.add.sprite(0, 7, 'hero').setOrigin(0.5, (HERO_FEET + HERO_PAD.t) / FRAME_H);
    this.playerBody.play('idle-down');
    const name = this.add.text(0, 7 - HERO_FEET + 1, '[苍岭] 你', { fontFamily: FONT, fontSize: '7px', color: '#ffffff', stroke: '#000', strokeThickness: 2, resolution: 4 }).setOrigin(0.5);
    this.wolfBack = this.add.sprite(0, 7, 'mount-wolf').setOrigin(0.5, WOLF_FEET / WOLF_H).setVisible(false);
    this.wolfFront = this.add.sprite(0, 7, 'mount-wolf').setOrigin(0.5, WOLF_FEET / WOLF_H).setVisible(false);
    // 头顶小血条：打怪时或没满血时显示，红字飘在它上面，不和名字叠在一起
    const hpBg = this.add.rectangle(0, name.y - 7, 22, 4, 0x1b120c).setStrokeStyle(1, 0x000000).setVisible(false);
    const hpFill = this.add.rectangle(-10, name.y - 7, 20, 2, 0x5ad04a).setOrigin(0, 0.5).setVisible(false);
    this.heroHp = [hpBg, hpFill];
    this.player.add([ring, this.wolfBack, this.playerBody, this.wolfFront, name, hpBg, hpFill]).setDepth(this.player.y + 1000);
    this.heroName = name;
    this.tweens.add({ targets: ring, alpha: 0.4, yoyo: true, repeat: -1, duration: 700 });

    this.setupCamera();
    this.amb = new Ambience(this);
    this.currentAction = task?.action;
    this.travelTo = store.state.travel?.to;
    if (task && store.state.paused) this.manual = true;
    else if (task) {
      if (isBankId(store.state.travel?.to)) this.goToTask(NODES.find((n) => n.id === store.state.travel!.to));
      else if (store.state.travel) this.goToTask();
      else this.startWorking();
    }
    if (!task || store.state.paused) this.resumeWalk();
    this.updateLabels();
    this.syncStones();
    this.unsub.push(store.subscribe(() => {
      // 进了家园岛屿：切到岛屿场景（这边睡着，存档照常推进）
      if (this.toIsland) return;
      if (store.state.home?.inside && this.scene.isActive()) {
        this.toIsland = true;
        this.walker = undefined;
        this.scene.switch('island');
        return;
      }
      // 人在岛上（这边睡着）：等回来 wake 时再统一同步，免得寻路请求被吃掉
      if (!this.scene.isActive()) return;
      this.syncStones();
      this.syncSkin();
      this.takeWalk();
      this.syncTask();
      this.updateLabels();
    }));
    this.unsub.push(store.onGain((s) => this.showGain(s)));
    // 从岛上回来：人站在城里的传送门前
    this.events.on('wake', () => {
      this.toIsland = false;
      this.resync();
      this.syncStones();
      this.syncSkin();
      this.takeWalk();
      this.updateLabels();
    });
    if (store.state.home?.inside) {
      this.toIsland = true;
      this.time.delayedCall(0, () => this.scene.switch('island'));
    }
    // 人在家园岛屿上点了石碑、传送、寻路：先出岛，等大地图醒了再做
    const awake = <A extends unknown[]>(fn: (...a: A) => void) => (...a: A) => {
      if (this.scene.isActive() && !this.toIsland) return fn(...a);
      if (store.state.home?.inside) store.dispatch(leaveHome);
      this.events.once('wake', () => fn(...a));
    };
    const onStone = awake((id: string) => this.stoneJump(id));
    this.game.events.on('waystone', onStone);
    this.unsub.push(() => this.game.events.off('waystone', onStone));
    this.time.addEvent({ delay: 300, loop: true, callback: () => this.checkStones() });
    const onTeleport = awake((id: string) => this.teleport(id));
    this.game.events.on('teleport', onTeleport);
    this.unsub.push(() => this.game.events.off('teleport', onTeleport));
    // 世界地图上的「寻路前往」
    const onWalkTo = awake((id: string) => {
      const n = NODES.find((x) => x.id === id);
      if (!n) return;
      // 寻路去的就是当前工作的地点：等于继续工作
      if (n === nodeForAction(this.currentAction) && store.state.paused) return store.dispatch(resumeWork);
      const old = this.walker;
      const dest = standTile(n);
      // 走到建筑、资源点、石碑旁边：自动打开它的页面（用户 10-23）
      const opens = n.town || n.waystone || n.farm || n.actions.some((a) => ACTIONS[a].kind !== 'combat');
      const onArrive = () => this.game.events.emit(NODE_CLICK, n.id);
      // 远路自动顺路用已激活的传送石碑（用户 10-23）
      const r: Route = n.waystone ? { ms: 0 } : planRoute(store.state.waystones, this.playerTile(), dest, moveSpeed(store.state));
      if (r.via) {
        const A = WAYSTONES.find((x) => x.id === r.via![0])!;
        const a = standTile(A);
        this.moveTo(a.x, a.y);
        if (!this.walker || this.walker === old) return;
        this.float(`顺路去${A.name}传送`, '#8ae8ff');
        this.arrive = () => {
          this.stoneJump(r.via![1]);
          this.time.delayedCall(500, () => {
            const before = this.walker;
            this.moveTo(dest.x, dest.y);
            if (opens && this.walker && this.walker !== before) this.arrive = onArrive;
          });
        };
        return;
      }
      this.moveTo(dest.x, dest.y);
      if (opens && this.walker && this.walker !== old) this.arrive = onArrive;
    });
    this.game.events.on('walkto', onWalkTo);
    this.takeWalk = () => {
      const id = store.pendingWalk;
      if (!id) return;
      store.pendingWalk = null;
      const spot = store.tracking ? trackSpot(store.tracking) : null;
      // 只有能准确定位的才一直标箭头
      if (store.tracking && !exactTrack(store.tracking)) store.tracking = null;
      if (spot) this.moveTo(spot.x, spot.y);
      else onWalkTo(id);
    };
    this.unsub.push(() => this.game.events.off('walkto', onWalkTo));
    // 切到后台时浏览器会停掉画面，但存档照常按时间推进；切回来把角色摆到存档里的位置
    let hiddenAt = 0;
    const onVis = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 1500) this.resync();
    };
    document.addEventListener('visibilitychange', onVis);
    this.unsub.push(() => document.removeEventListener('visibilitychange', onVis));
    // 切到别的标签时整个游戏被销毁，只会触发 destroy，不会触发 shutdown
    const cleanup = () => { this.unsub.forEach((u) => u()); this.unsub = []; this.amb.destroy(); };
    this.events.once('shutdown', cleanup);
    this.events.once('destroy', cleanup);

    // 水面和岩浆动画：重画图集里的液体格子
    this.time.addEvent({
      delay: 220, loop: true, callback: () => {
        animateTileset(this.tilesetCanvas, ++this.frame);
        this.tilesetTex.refresh();
      },
    });
    this.time.addEvent({ delay: 400, loop: true, callback: () => this.checkRegion() });
    this.checkRegion();
  }

  // ---- 纹理 ----

  /** 处理界面发来的寻路请求（create 里赋值） */
  private takeWalk = () => {};
  /** 已经在切去家园岛屿的路上（同一帧只能切一次） */
  private toIsland = false;
  private heroSkin?: string;
  private heroCanvas!: HTMLCanvasElement;
  private heroTex!: Phaser.Textures.CanvasTexture;

  /** 衣橱换装：同一张画布重画，帧坐标不变 */
  private syncSkin() {
    const skin = store.state.settings.skin;
    if (skin === this.heroSkin) return;
    this.heroSkin = skin;
    paintHeroSheet(outfitOf(skin), this.heroCanvas);
    this.heroTex.refresh();
  }

  private makeTextures() {
    for (const [key, rows] of Object.entries(SPRITES)) this.textures.addCanvas(key, paintSprite(rows));
    for (const [key, v] of Object.entries(SPRITE_VARIANTS)) this.textures.addCanvas(key, paintSprite(SPRITES[v.base], 1, v.swap));
    this.textures.addCanvas('glow', paintGlow());
    // 主角多帧动画
    this.heroSkin = store.state.settings.skin;
    const hero = paintHeroSheet(outfitOf(this.heroSkin));
    this.heroCanvas = hero.canvas;
    const tex = this.heroTex = this.textures.addCanvas('hero', hero.canvas)!;
    for (const f of hero.frames) tex.add(f.name, 0, f.x, f.y, FRAME_W, FRAME_H);
    for (const a of HERO_ANIMS) {
      if (this.anims.exists(a.key)) continue;
      this.anims.create({
        key: a.key, frameRate: a.rate, repeat: -1,
        frames: Array.from({ length: a.frames }, (_, i) => ({ key: 'hero', frame: `${a.key}-${i}` })),
      });
    }
    // 坐骑：每帧分后层和前层，骑手夹在中间
    // 名字别和怪物「狼」的贴图撞了
    this.ensureMount('wolf');
    // 村民：和主角同样大小、同样画法
    for (const [kind, o] of Object.entries(NPC_OUTFITS)) {
      const key = `npc-${kind}`;
      if (this.textures.exists(key)) continue;
      const sheet = paintHeroSheet(o, undefined, NPC_ANIMS);
      const t = this.textures.addCanvas(key, sheet.canvas)!;
      for (const f of sheet.frames) t.add(f.name, 0, f.x, f.y, FRAME_W, FRAME_H);
      for (const an of NPC_ANIMS) {
        this.anims.create({
          key: `${key}:${an.key}`, frameRate: an.rate * 0.8, repeat: -1,
          frames: Array.from({ length: an.frames }, (_, i) => ({ key, frame: `${an.key}-${i}` })),
        });
      }
    }
    this.textures.addCanvas('windmill-blades', paintWindmillBlades());
    const dots: [string, number, string][] = [
      ['p-snow', 2, '#ffffff'], ['p-ember', 1, '#ffa040'], ['p-firefly', 1, '#e8ff7a'], ['p-spore', 1, '#c8a0ff'],
      ['p-mote', 1, '#a8d070'], ['p-dust', 1, '#f0dca0'], ['p-leaf', 2, '#6aa040'], ['p-smoke', 3, '#b0aaa4'], ['p-spark', 1, '#cfe8ff'],
    ];
    for (const [k, size, c] of dots) this.textures.addCanvas(k, paintDot(size, c));
    this.textures.addCanvas('fx-slash', paintSlash());
    this.textures.addCanvas('fx-arrow', paintArrow());
    this.textures.addCanvas('fx-hit', paintHit());
    this.tilesetCanvas = document.createElement('canvas');
    paintTileset(this.tilesetCanvas);
    this.tilesetTex = this.textures.addCanvas('tiles', this.tilesetCanvas)!;
  }

  private propTexture(kind: PropKind) {
    const key = `prop-${kind}`;
    if (!this.textures.exists(key)) this.textures.addCanvas(key, paintProp(kind));
    return key;
  }

  // ---- 地面：每块一个小 tilemap，共用同一张会动的图集 ----

  private liquidIdx = new Map(LIQUIDS.map((g, i) => [GROUNDS.indexOf(g), i]));

  private tileFor(x: number, y: number) {
    const g = groundIndex(x, y);
    const v = Math.floor(hash(x, y, 99) * VARIANTS);
    const li = this.liquidIdx.get(g);
    if (li === undefined) return tileIndex(g, v);
    const group = (k: number) => (GROUNDS[k] === 'ocean' || GROUNDS[k] === 'starwater' ? 'water' : GROUNDS[k]);
    const me = group(g);
    const land = (nx: number, ny: number) => nx >= 0 && ny >= 0 && nx < MAP_W && ny < MAP_H && group(groundIndex(nx, ny)) !== me;
    const mask = (land(x, y - 1) ? 1 : 0) | (land(x + 1, y) ? 2 : 0) | (land(x, y + 1) ? 4 : 0) | (land(x - 1, y) ? 8 : 0);
    return mask ? liquidIndex(li, mask, v) : tileIndex(g, v);
  }

  private groundChunk(cx: number, cy: number) {
    const data: number[][] = [];
    for (let y = cy * CHUNK; y < Math.min(MAP_H, (cy + 1) * CHUNK); y++) {
      const row: number[] = [];
      for (let x = cx * CHUNK; x < Math.min(MAP_W, (cx + 1) * CHUNK); x++) row.push(this.tileFor(x, y));
      data.push(row);
    }
    const map = this.make.tilemap({ data, tileWidth: T, tileHeight: T });
    const ts = map.addTilesetImage('tiles', 'tiles', T, T, TILESET.margin, TILESET.spacing)!;
    map.createLayer(0, ts, cx * CHUNK * T, cy * CHUNK * T)!.setDepth(-10);
    return map;
  }

  // ---- 城镇建筑 ----

  private buildTown() {
    BUILDINGS.forEach((b, i) => {
      // 同样大小、同样风格的房子共用一张图（12080 有十座城，几百栋房子）
      const key = `bld-${b.kind}-${b.w}x${b.h}-${b.theme ?? ''}-${i % 3}`;
      if (!this.textures.exists(key)) this.textures.addCanvas(key, paintBuilding(b.kind, b.w, b.h, i % 3, b.theme));
      const bx = (b.x + b.w / 2) * T;
      const by = (b.y + b.h) * T;
      const img = this.add.image(bx, by, key).setOrigin(0.5, 1).setDepth(by + 1000);
      if (b.kind === 'windmill') {
        const blades = this.add.image(bx, by - img.height + 16, 'windmill-blades').setDepth(by + 1001);
        this.tweens.add({ targets: blades, angle: 360, duration: 9000, repeat: -1 });
      }
      if (b.kind === 'fountain') this.sparkle(bx, by - 26, 18);
      if (b.kind === 'tower') this.addGlow(bx, by - img.height + 12, 0xa070ff, 30);
      if (b.kind === 'smithy') this.addGlow(bx - 26, by - 10, 0xff7a2a, 26);
      if (b.kind === 'furnace') this.furnaceFx(bx + 1, by - 13);
      if (b.kind === 'bonfire') this.furnaceFx(bx, by - 18);
      if (b.kind === 'lighthouse') this.addGlow(bx, by - img.height + 14, 0xfff0a0, 46);
      if (b.kind === 'crystaltower') { this.addGlow(bx, by - img.height * 0.6, 0xa080ff, 50); this.sparkle(bx, by - img.height * 0.6, 20); }
      if (b.kind === 'lanterntower') this.addGlow(bx, by - img.height + 6, 0xffb060, 30);
      if (CHIMNEY[b.kind]) this.smoke(bx - img.width / 2 + img.width - 11, by - img.height + 2);
    });
  }

  /** 熔炉口：一闪一闪的火光，偶尔蹦火星 */
  private furnaceFx(x: number, y: number) {
    this.addGlow(x, y, 0xff8a2a, 34).base = 0.8;
    this.time.addEvent({
      delay: 380, loop: true, callback: () => {
        if (this.offCam(x, y)) return;
        const p = this.add.image(x + (Math.random() - 0.5) * 14, y + 4, 'p-ember').setDepth(D_PARTICLE);
        this.tweens.add({ targets: p, y: y - 10 - Math.random() * 14, x: p.x + (Math.random() - 0.5) * 16, alpha: 0, duration: 700 + Math.random() * 400, onComplete: () => p.destroy() });
      },
    });
  }

  // ---- 田里的作物（地块制种田，用户 10-23 要求做成星露谷那样） ----

  /** 能种的地块：一格一张土和一张作物，按存档里的状态换图 */
  private plots: { id: string; field: string; x: number; y: number; soil: Phaser.GameObjects.Image; crop: Phaser.GameObjects.Image; glint: Phaser.GameObjects.Image; key: string }[] = [];
  private plotAt = new Map<number, string>();

  private cropTex(crop: string, stage: number) {
    const key = `crop-${crop}-${stage}`;
    if (!this.textures.exists(key)) {
      const c = CROPS.find((x) => x[0] === crop)!;
      this.textures.addCanvas(key, paintCrop(c[3], c[5], stage));
    }
    return key;
  }

  /**
   * 地块的土（用户 10-23：种上种子田要有变化）：
   * 空地 = 平整的浅色松土，四角插着小木桩；种下 = 翻成一条条土垄，中间一个埋了种子的小土包；
   * 浇过水 = 土色变深、垄沟里有一点水光
   */
  private soilTex(kind: 'empty' | 'dry' | 'wet') {
    const key = `plot-${kind}`;
    if (!this.textures.exists(key)) {
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
      this.textures.addCanvas(key, c);
    }
    return key;
  }

  private glintTex() {
    if (!this.textures.exists('plot-glint')) {
      const c = document.createElement('canvas');
      c.width = 5;
      c.height = 5;
      const g = c.getContext('2d')!;
      g.fillStyle = '#fff3a0';
      g.fillRect(2, 0, 1, 5);
      g.fillRect(0, 2, 5, 1);
      g.fillStyle = '#ffffff';
      g.fillRect(2, 2, 1, 1);
      this.textures.addCanvas('plot-glint', c);
    }
    return 'plot-glint';
  }

  /** 田里：能种的地块按存档画；其余耕地上隔一格种一株装饰作物（这块田最低阶的作物，长势随机） */
  private buildFields() {
    for (const p of FARM_PLOTS) this.plotAt.set(p.y * MAP_W + p.x, p.id);
    for (const f of FIELDS) {
      const first = cropsOfField(f.nodeId)[0]?.id;
      if (!first) continue;
      for (let y = f.y0; y <= f.y1; y++) {
        if ((y - f.y0) % 3 === 2) continue;
        for (let x = f.x0 + ((y - f.y0) % 3); x <= f.x1; x += 2) {
          if (Math.abs(x - f.node.x) <= 2 && y >= f.node.y - 2 && y <= f.node.y + 2) continue;
          if (this.plotAt.has(y * MAP_W + x)) continue;
          const stage = Math.floor(hash(x, y, 77) * 4);
          this.add.image(x * T + T / 2, y * T + T + 1, this.cropTex(first, stage)).setOrigin(0.5, 1).setDepth(y * T + T + 1000).setAlpha(0.85);
        }
      }
    }
    for (const p of FARM_PLOTS) {
      const soil = this.add.image(p.x * T + T / 2, p.y * T + T / 2, this.soilTex('empty')).setDepth(1);
      const crop = this.add.image(p.x * T + T / 2, p.y * T + T + 1, this.cropTex('potato', 0)).setOrigin(0.5, 1).setDepth(p.y * T + T + 1000).setVisible(false);
      const glint = this.add.image(p.x * T + T / 2 + 4, p.y * T + 3, this.glintTex()).setDepth(D_FLOAT - 5).setVisible(false);
      this.plots.push({ id: p.id, field: p.field, x: p.x, y: p.y, soil, crop, glint, key: '' });
    }
    this.growFields();
    this.time.addEvent({ delay: 500, loop: true, callback: () => this.growFields() });
    this.time.addEvent({ delay: 250, loop: true, callback: () => this.tickPlotInfo() });
  }

  /** 装了洒水器的田：牌子旁边立一个洒水器，隔一会儿喷一圈水花 */
  private sprinklerSprites = new Map<string, Phaser.GameObjects.Image>();
  private sprinklerTex() {
    if (this.textures.exists('sprinkler')) return 'sprinkler';
    const c = document.createElement('canvas');
    c.width = 8;
    c.height = 14;
    const g = c.getContext('2d')!;
    const px = (x: number, y: number, w: number, h: number, col: string) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    px(3, 4, 2, 9, '#4a5058');
    px(3, 4, 1, 9, '#8a96a2');
    px(1, 2, 6, 3, '#2a3038');
    px(2, 2, 4, 2, '#7ab0d8');
    px(1, 12, 6, 2, '#3a3e44');
    this.textures.addCanvas('sprinkler', c);
    return 'sprinkler';
  }
  private syncSprinklers() {
    for (const id of store.state.sprinklers ?? []) {
      if (this.sprinklerSprites.has(id)) continue;
      const f = FIELDS.find((x) => x.nodeId === id);
      if (!f) continue;
      const x = (f.node.x + 2) * T + T / 2;
      const y = (f.node.y - 1) * T + T;
      const spr = this.add.image(x, y, this.sprinklerTex()).setOrigin(0.5, 1).setDepth(y + 1000);
      this.sprinklerSprites.set(id, spr);
      // 水花：几颗水珠往外抛
      this.time.addEvent({
        delay: 1600, loop: true, callback: () => {
          if (!spr.active) return;
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 + Math.random() * 0.5;
            const d = this.add.rectangle(x, y - 12, 1.5, 1.5, 0xaee0ff).setDepth(y + 1001).setAlpha(0.9);
            this.tweens.add({ targets: d, x: x + Math.cos(a) * 26, y: y - 4 + Math.sin(a) * 12, alpha: 0, duration: 900, ease: 'Quad.easeOut', onComplete: () => d.destroy() });
          }
        },
      });
    }
  }

  /** 按存档把每格地换成对应的图：空地 / 长到第几阶段 / 熟了闪光 */
  private growFields() {
    this.syncSprinklers();
    const now = Date.now();
    const farm = store.state.farm ?? {};
    const blink = Math.floor(now / 500) % 2 === 0;
    for (const p of this.plots) {
      const plot = farm[p.id];
      const ph = plotPhase(plot, now);
      const stage = !plot ? -1 : ph === 'ripe' ? 3 : Math.min(2, Math.floor(plotGrowth(plot, now) * 3));
      const key = `${plot?.crop ?? ''}:${stage}:${plot?.water ? 1 : 0}`;
      p.glint.setVisible(ph === 'ripe' && blink);
      if (key === p.key) continue;
      p.key = key;
      p.crop.setScale(ph === 'ripe' ? 1.15 : 1);
      p.soil.setTexture(this.soilTex(!plot ? 'empty' : plot.water ? 'wet' : 'dry'));
      const known = !!plot && CROPS.some((c) => c[0] === plot.crop);
      p.crop.setVisible(known);
      if (known) p.crop.setTexture(this.cropTex(plot!.crop, stage));
    }
  }

  /** 地块头顶的小牌子：种的什么、长到几成、还要多久熟、浇没浇水（用户 10-23） */
  private plotInfo?: { id: string; text: Phaser.GameObjects.Text; until: number };
  private plotInfoText(id: string) {
    const p = store.state.farm?.[id];
    const now = Date.now();
    if (!p) {
      const seed = pickSeed(store.state, PLOT_BY_ID[id].field);
      return seed ? `空地 · 点一下种${CROP_DEFS[seed].name}` : '空地 · 没有能种的种子';
    }
    const c = CROP_DEFS[p.crop];
    if (plotPhase(p, now) === 'ripe') return `${c?.name ?? ''} · 熟了，点一下收获`;
    const left = Math.max(0, Math.ceil((p.ripe - now) / 1000));
    const t = left >= 60 ? `${Math.floor(left / 60)}分${left % 60}秒` : `${left}秒`;
    return `${c?.name ?? ''} · ${Math.floor(plotGrowth(p, now) * 100)}% · ${t}后熟\n${p.water ? '已浇水（快 25%）' : '没浇水 · 点一下浇水'}`;
  }
  private showPlotInfo(id: string, ms: number) {
    const plot = PLOT_BY_ID[id];
    if (!plot) return;
    if (!this.plotInfo) {
      const text = this.add.text(0, 0, '', {
        fontFamily: FONT, fontSize: '7px', color: '#fff3c4', backgroundColor: '#1b120cdd', padding: { x: 3, y: 1 }, resolution: 4, align: 'center',
      }).setOrigin(0.5, 1).setDepth(D_LABEL + 1);
      this.plotInfo = { id, text, until: 0 };
    }
    this.plotInfo.id = id;
    this.plotInfo.until = this.time.now + ms;
    this.plotInfo.text.setText(this.plotInfoText(id)).setPosition(plot.x * T + T / 2, plot.y * T - 8).setVisible(true);
  }
  private tickPlotInfo() {
    const pi = this.plotInfo;
    if (!pi || !pi.text.visible) return;
    if (this.time.now > pi.until) pi.text.setVisible(false);
    else pi.text.setText(this.plotInfoText(pi.id));
  }

  /** 电脑端鼠标移到地块上：描一圈框，提示能点 */
  private plotHover?: Phaser.GameObjects.Graphics;
  private hoverPlot(p: Phaser.Input.Pointer) {
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    const x = Math.floor(wp.x / T);
    const y = Math.floor(wp.y / T);
    const id = this.plotIdAt(x, y);
    if (!id) {
      this.plotHover?.setVisible(false);
      return;
    }
    this.showPlotInfo(id, 1500);
    this.plotHover ??= this.add.graphics().setDepth(2);
    const ripe = plotPhase(store.state.farm?.[id], Date.now()) === 'ripe';
    this.plotHover.clear().lineStyle(1, ripe ? 0xffe070 : 0xfff3c4, 0.9).strokeRect(x * T + 0.5, y * T + 0.5, T - 1, T - 1).setVisible(true);
  }

  /** 这一格是不是能种的地块 */
  plotIdAt(tx: number, ty: number) {
    return this.plotAt.get(ty * MAP_W + tx);
  }

  /** 点了一格地：走到旁边的走道，再种 / 浇水 / 收获 */
  private tendPlotAt(id: string) {
    const plot = PLOT_BY_ID[id];
    if (!plot || this.mountBusy) return;
    const me = this.playerTile();
    const act = () => {
      const st = store.state;
      const p = st.farm?.[id];
      const now = Date.now();
      let crop: string | undefined;
      if (!p) {
        crop = pickSeed(st, plot.field);
        if (!crop) {
          this.float('没有能种的种子', '#ff9a7a');
          this.game.events.emit(NODE_CLICK, plot.field);
          return;
        }
      }
      const before = store.state;
      store.farm((g, t) => tendPlot(g, id, crop, t));
      this.showPlotInfo(id, 3000);
      if (store.state === before) return;
      const ph = plotPhase(p, now);
      this.facePlot(plot);
      if (ph === 'growing') this.float('浇水', '#8ad0ff');
      else if (ph === 'empty') this.float(`种下 ${CROP_DEFS[crop!].name}`, '#b8e07a');
      this.farmPose();
    };
    if (Math.abs(me.x - plot.x) + Math.abs(me.y - plot.y) <= 1 && !this.walker && !store.state.walk) return act();
    // 站到地块上方或下方的走道（不踩在别的地块上），都不行就站到这一格
    const spots = [[0, 1], [0, -1], [-1, 0], [1, 0]].map(([dx, dy]) => ({ x: plot.x + dx, y: plot.y + dy }))
      .filter((q) => isWalkable(q.x, q.y) && !this.plotIdAt(q.x, q.y));
    const to = spots.sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0] ?? { x: plot.x, y: plot.y };
    if (to.x === me.x && to.y === me.y && !this.walker) return act();
    store.tracking = null;
    const old = this.walker;
    this.moveTo(to.x, to.y);
    if (this.walker && this.walker !== old) this.arrive = act;
  }

  /** 走到了要干的事（点了地块之后） */
  private arrive?: () => void;

  private facePlot(p: { x: number; y: number }) {
    const dx = p.x * T + T / 2 - this.player.x;
    const dy = p.y * T + T / 2 - this.player.y;
    this.facing = Math.abs(dx) > Math.abs(dy) ? 'side' : dy < 0 ? 'up' : 'down';
    if (this.facing === 'side') this.playerBody.setFlipX(dx < 0);
  }

  /** 弯腰种地的动作做一下再站好 */
  private farmPose() {
    if (this.mountMode === 'ride' || this.mountBusy || this.working) return;
    this.facing = 'side';
    this.playerBody.play('work-farm', true);
    this.time.delayedCall(700, () => {
      if (!this.walker && !this.working) this.idle();
    });
  }

  /** 离镜头远的烟、火星不生成（十座城几百个烟囱，屏幕外也一直冒烟太费） */
  private offCam(x: number, y: number) {
    const v = this.cameras.main.worldView;
    return x < v.x - 120 || x > v.right + 120 || y < v.y - 120 || y > v.bottom + 160;
  }

  private smoke(x: number, y: number) {
    this.time.addEvent({
      delay: 700, loop: true, callback: () => {
        if (this.offCam(x, y)) return;
        const p = this.add.image(x + (Math.random() - 0.5) * 3, y, 'p-smoke').setDepth(D_SMOKE).setAlpha(0.7);
        this.tweens.add({ targets: p, y: y - 26, x: p.x + 8, alpha: 0, scale: 2.2, duration: 2600, onComplete: () => p.destroy() });
      },
    });
  }

  private sparkle(x: number, y: number, r: number) {
    this.time.addEvent({
      delay: 260, loop: true, callback: () => {
        if (this.offCam(x, y)) return;
        const p = this.add.image(x + (Math.random() - 0.5) * r * 2, y + (Math.random() - 0.5) * r, 'p-spark').setDepth(D_SMOKE);
        this.tweens.add({ targets: p, y: p.y - 6, alpha: 0, duration: 700, onComplete: () => p.destroy() });
      },
    });
  }

  private addGlow(x: number, y: number, color: number, r: number) {
    const img = this.add.image(x, y, 'glow').setTint(color).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_GLOW).setScale((r * 2) / 64);
    const g = { img, phase: Math.random() * 6, base: 0.55 };
    this.glows.push(g);
    return g;
  }

  // ---- 装饰物分块加载 ----

  private loadChunk(cx: number, cy: number) {
    const objs: { destroy(): void }[] = [this.groundChunk(cx, cy)];
    for (const p of propsInChunk(cx, cy)) {
      const px = p.x * T + T / 2;
      const py = p.y * T + T;
      const img = this.add.image(px, py, this.propTexture(p.kind)).setOrigin(0.5, 1).setDepth(py + 1000);
      if (hash(p.x, p.y, 12) < 0.5 && p.kind !== 'lamp' && p.kind !== 'fence') img.setFlipX(true);
      objs.push(img);
      const glow = PROP_GLOW[p.kind];
      if (glow) {
        const g = this.addGlow(px, py + glow.dy, glow.color, glow.r);
        objs.push(g.img);
      }
    }
    this.chunks.set(cy * 1000 + cx, objs);
  }

  private updateChunks() {
    const v = this.cameras.main.worldView;
    // 提前加载视野外几格，走到之前就画好，避免边走边卡
    const pad = 8 * T;
    const x0 = Math.floor((v.x - pad) / (CHUNK * T));
    const x1 = Math.floor((v.right + pad) / (CHUNK * T));
    const y0 = Math.floor((v.y - pad) / (CHUNK * T));
    // 高的树会从下一块伸上来，下边多加载一块
    const y1 = Math.floor((v.bottom + pad + 4 * T) / (CHUNK * T));
    let budget = this.chunks.size === 0 ? Infinity : 1;
    const maxX = Math.ceil(MAP_W / CHUNK) - 1;
    const maxY = Math.ceil(MAP_H / CHUNK) - 1;
    for (let cy = Math.max(0, y0); cy <= Math.min(maxY, y1); cy++) {
      for (let cx = Math.max(0, x0); cx <= Math.min(maxX, x1); cx++) {
        // 每帧最多生成几块，避免一下子卡住；第一次进入时全部加载
        if (this.chunks.has(cy * 1000 + cx) || budget-- <= 0) continue;
        this.loadChunk(cx, cy);
      }
    }
    for (const [key, objs] of this.chunks) {
      const cx = key % 1000;
      const cy = Math.floor(key / 1000);
      if (cx < x0 - 2 || cx > x1 + 2 || cy < y0 - 2 || cy > y1 + 2) {
        for (const o of objs) o.destroy();
        this.chunks.delete(key);
      }
    }
    this.glows = this.glows.filter((g) => g.img.active);
  }

  /** 电脑端：WASD / 方向键走路（用户 10-23 要求优化电脑端操作） */
  private keys?: Record<string, Phaser.Input.Keyboard.Key>;
  private nextKeyStep = 0;
  private stepKeys(time: number) {
    if (!this.keys) {
      if (!this.input.keyboard) return;
      this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT', false) as Record<string, Phaser.Input.Keyboard.Key>;
    }
    const k = this.keys;
    const tag = (document.activeElement?.tagName ?? '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    const dx = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    const dy = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    if (!dx && !dy) return;
    if (time < this.nextKeyStep) return;
    this.nextKeyStep = time + 280;
    store.tracking = null;
    const p = this.playerTile();
    for (const r of [4, 3, 2, 1]) {
      if (isWalkable(p.x + dx * r, p.y + dy * r)) { this.moveTo(p.x + dx * r, p.y + dy * r, false); return; }
    }
  }

  private holdStart = 0;
  private holdWalked = false;
  private nextHoldStep = 0;
  /** 按住鼠标：每隔一会儿朝光标的方向再走几格，镜头跟着角色，光标不动就一直往那边走 */
  private stepHold(time: number) {
    const p = this.input.activePointer;
    if (!this.holdStart || !p.isDown || this.input.pointer2?.isDown || time - this.holdStart < 300 || time < this.nextHoldStep) return;
    this.nextHoldStep = time + 260;
    this.holdWalked = true;
    if (!this.following) this.recenterCameraOnly();
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    const me = this.playerTile();
    const tx = Math.floor(wp.x / T);
    const ty = Math.floor(wp.y / T);
    const d = Math.hypot(tx - me.x, ty - me.y);
    if (d < 1) return;
    store.tracking = null;
    const k = Math.min(1, 5 / d);
    for (const f of [1, 0.6, 0.3]) {
      const x = Math.round(me.x + (tx - me.x) * k * f);
      const y = Math.round(me.y + (ty - me.y) * k * f);
      if (isWalkable(x, y)) { this.moveTo(x, y, false); return; }
    }
  }

  /** 上一帧镜头中心（画布尺寸变化时保持画面不动） */
  private camMid = { x: 0, y: 0 };

  update(time: number, delta: number) {
    this.camMid.x = this.cameras.main.midPoint.x;
    this.camMid.y = this.cameras.main.midPoint.y;
    this.syncMount();
    this.stepRider();
    this.stepKeys(time);
    this.stepHold(time);
    this.stepWalker(delta);
    this.syncFoe();
    this.updateHeroHp();
    this.updateBars();
    this.updateTracking(time);
    this.updateChunks();
    this.amb.update(time, delta, this.region, { x: this.player.x, y: this.player.y, walking: !!this.walker });
    // 天黑后灯火更亮
    const lit = 1 + this.amb.dark * 0.7;
    for (const g of this.glows) g.img.setAlpha((g.base + Math.sin(time / 380 + g.phase) * 0.12 + (hash(Math.floor(time / 90), g.phase * 100) - 0.5) * 0.08) * lit);
    this.updateParticles();
    const px = Math.floor(this.player.x / T);
    const py = Math.floor(this.player.y / T);
    if (px !== playerPos.x || py !== playerPos.y) this.fadeNearLabel(px, py);
    playerPos.x = px;
    playerPos.y = py;
  }

  /** 角色站在地点旁边干活时，地点名牌正好压在角色名字上：把它调淡 */
  private nearLabel: Phaser.GameObjects.Text | null = null;
  private fadeNearLabel(x: number, y: number) {
    const hit = this.nodeLabels.find(({ node }) => Math.abs(node.x - x) <= 2 && y - node.y >= 0 && y - node.y <= 3)?.text ?? null;
    if (hit === this.nearLabel) return;
    this.nearLabel?.setAlpha(1);
    hit?.setAlpha(0.25);
    this.nearLabel = hit;
  }

  // ---- 区域氛围 ----

  private checkRegion() {
    const c = this.cameras.main;
    const r = regionAt(c.midPoint.x / T, c.midPoint.y / T);
    if (r === this.region) return;
    this.region = r;
    this.game.events.emit(REGION_CHANGE, r);
  }

  private updateParticles() {
    const kind = AMBIENT[this.region];
    const v = this.cameras.main.worldView;
    if (kind && this.particles.length < (kind === 'snow' ? 70 : 34) && Math.random() < 0.5) {
      const img = this.add.image(v.x + Math.random() * v.width, v.y + Math.random() * v.height, `p-${kind}`).setDepth(D_PARTICLE);
      if (kind === 'firefly' || kind === 'ember' || kind === 'spore') img.setBlendMode(Phaser.BlendModes.ADD);
      const max = 2000 + Math.random() * 3000;
      const p: Particle = { img, vx: 0, vy: 0, life: 0, max, kind };
      if (kind === 'snow') {
        img.y = v.y - 4;
        p.vx = -0.2 + Math.random() * 0.15;
        p.vy = 0.5 + Math.random() * 0.4;
        p.max = 9000;
      } else if (kind === 'ember') {
        p.vx = (Math.random() - 0.5) * 0.2;
        p.vy = -0.3 - Math.random() * 0.3;
      } else if (kind === 'leaf') {
        img.y = v.y - 4;
        p.vx = 0.15 + Math.random() * 0.2;
        p.vy = 0.3 + Math.random() * 0.2;
        p.max = 9000;
      } else {
        p.vx = (Math.random() - 0.5) * 0.15;
        p.vy = (Math.random() - 0.5) * 0.15 - (kind === 'spore' ? 0.1 : 0);
      }
      this.particles.push(p);
    }
    const dt = this.game.loop.delta;
    this.particles = this.particles.filter((p) => {
      p.life += dt;
      p.img.x += p.vx * dt * 0.06 + (p.kind === 'snow' || p.kind === 'leaf' ? Math.sin(p.life / 400) * 0.15 : 0);
      p.img.y += p.vy * dt * 0.06;
      const t = p.life / p.max;
      const fade = Math.min(1, t * 5, (1 - t) * 5);
      p.img.setAlpha(p.kind === 'firefly' ? fade * (0.5 + Math.sin(p.life / 180) * 0.5) : fade * 0.85);
      if (t >= 1 || p.img.y > v.bottom + 8 || (kind !== p.kind && t > 0.2)) {
        p.img.destroy();
        return false;
      }
      return true;
    });
  }

  // ---- 资源点 ----

  /** 资源点周围摆上对应阶级的矿石堆、树、棉株、晒皮架 */
  private addResources(n: MapNode) {
    const seen = new Set<string>();
    const res: { kind: ResKind; tier: number }[] = [];
    for (const id of n.actions) {
      const a = ACTIONS[id];
      if (a.kind !== 'skill' || !a.outputs[0]) continue;
      const r = resOf(a.outputs[0].item);
      if (!r || seen.has(`${r.kind}${r.tier}`)) continue;
      seen.add(`${r.kind}${r.tier}`);
      res.push(r);
    }
    if (!res.length) return;
    // 站位格在节点正下方，钓鱼点北边是水，都要让开
    const slots = n.pond
      ? [[-2.6, 0.4], [2.6, 0.4], [-2.8, 2.2], [2.8, 2.2], [-1.6, 2.6], [1.6, 2.6]]
      : [[-2.4, -0.4], [2.4, -0.4], [-2.6, 1.8], [2.6, 1.8], [-1.2, -1.8], [1.2, -1.8]];
    const per = res.length <= 2 ? 2 : 1;
    slots.slice(0, res.length * per).forEach(([dx, dy], i) => {
      const r = res[Math.floor(i / per) % res.length];
      const key = `res-${r.kind}-${r.tier}`;
      if (!this.textures.exists(key)) this.textures.addCanvas(key, paintResNode(r.kind, r.tier));
      const x = (n.x + dx) * T + T / 2;
      const y = (n.y + dy) * T + T;
      this.add.image(x, y, key).setOrigin(0.5, 1).setScale(1.25).setDepth(y + 1000).setFlipX(i % 2 === 1 && r.kind !== 'hide');
      const glow = resGlow(r.kind, r.tier);
      if (glow) this.addGlow(x, y - 8, glow[0], glow[1]);
    });
  }

  // ───────── 传说石碑 ─────────
  private stones = new Map<string, { img: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image; text: Phaser.GameObjects.Text; lit?: boolean }>();

  private addStone(n: MapNode) {
    for (const lit of [false, true]) {
      const key = `waystone-${lit ? 'on' : 'off'}`;
      if (!this.textures.exists(key)) this.textures.addCanvas(key, paintWaystone(lit));
    }
    const cx = n.x * T + T / 2;
    const cy = n.y * T + T / 2;
    const img = this.add.image(cx, cy + T / 2 + 2, 'waystone-off').setOrigin(0.5, 1).setScale(1.2).setDepth(cy + T / 2 + 1000);
    const glow = this.add.image(cx, cy - 20, 'glow').setTint(0x6ad8f0).setBlendMode(Phaser.BlendModes.ADD).setDepth(cy + T / 2 + 1001).setScale(0.9).setAlpha(0);
    this.tweens.add({ targets: glow, scale: 1.15, yoyo: true, repeat: -1, duration: 1400, ease: 'Sine.inOut' });
    const text = this.add.text(cx, cy - 46, '', {
      fontFamily: FONT, fontSize: '7px', color: '#c8f4ff', backgroundColor: '#1b120ccc', padding: { x: 3, y: 1 }, resolution: 4, align: 'center',
    }).setOrigin(0.5, 1).setDepth(D_LABEL);
    this.add.zone(cx, cy - 12, T * 2.5, T * 3.5).setInteractive({ useHandCursor: true }).setData('node', n.id);
    this.stones.set(n.id, { img, glow, text });
    // 激活的石碑周围飘几点青色的光
    this.time.addEvent({
      delay: 900, loop: true, callback: () => {
        if (!this.stones.get(n.id)?.lit || !this.cameras.main.worldView.contains(cx, cy)) return;
        const p = this.add.image(cx + (Math.random() - 0.5) * 18, cy + 6, 'p-ember').setTint(0x8ae8ff).setDepth(D_PARTICLE);
        this.tweens.add({ targets: p, y: cy - 30 - Math.random() * 16, alpha: 0, duration: 1600, onComplete: () => p.destroy() });
      },
    });
  }

  /** 家园传送门：石拱门里一团旋转的紫光，点它进家园岛屿 */
  private addPortal(n: MapNode) {
    if (!this.textures.exists('home-portal')) this.textures.addCanvas('home-portal', paintPortal());
    if (!this.textures.exists('home-swirl')) this.textures.addCanvas('home-swirl', paintPortalSwirl());
    const cx = n.x * T + T / 2;
    const by = n.y * T + T + 2;
    this.add.image(cx, by, 'home-portal').setOrigin(0.5, 1).setDepth(by + 1000);
    const swirl = this.add.image(cx, by - PORTAL_H + 22, 'home-swirl').setDepth(by + 999);
    this.tweens.add({ targets: swirl, angle: -360, duration: 4000, repeat: -1 });
    this.tweens.add({ targets: swirl, scale: 1.08, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.inOut' });
    const glow = this.add.image(cx, by - 24, 'glow').setTint(0x8a6af0).setBlendMode(Phaser.BlendModes.ADD).setDepth(by + 1001).setAlpha(0.45);
    this.tweens.add({ targets: glow, alpha: 0.7, yoyo: true, repeat: -1, duration: 1300 });
    this.add.text(cx, by - PORTAL_H - 4, n.name.replace('落霞城·', ''), {
      fontFamily: FONT, fontSize: '7px', color: '#e8d8ff', backgroundColor: '#1b120ccc', padding: { x: 3, y: 1 }, resolution: 4,
    }).setOrigin(0.5, 1).setDepth(D_LABEL);
    this.add.zone(cx, by - 22, T * 3, T * 3).setInteractive({ useHandCursor: true }).setData('node', n.id);
  }

  /** 按存档换石碑的样子：激活过的亮起来 */
  private syncStones() {
    const on = store.state.waystones ?? [];
    for (const [id, st] of this.stones) {
      const lit = on.includes(id);
      if (st.lit === lit) continue;
      st.lit = lit;
      st.img.setTexture(`waystone-${lit ? 'on' : 'off'}`);
      st.glow.setAlpha(lit ? 0.55 : 0);
      const n = WAYSTONES.find((x) => x.id === id)!;
      st.text.setText(lit ? n.name : `${n.name}\n（未激活）`).setColor(lit ? '#c8f4ff' : '#b0a898');
    }
  }

  /** 角色走到没激活的石碑旁边：激活它（走路途中路过也算） */
  private checkStones() {
    const me = this.playerTile();
    const on = store.state.waystones ?? [];
    if (!WAYSTONES.some((n) => !on.includes(n.id) && Math.hypot(n.x - me.x, n.y + 1 - me.y) <= WAYSTONE_REACH)) return;
    let got: string[] = [];
    store.dispatch((g) => {
      const r = unlockWaystone(g, me);
      got = r.got;
      return r.state;
    });
    this.stonesUnlocked(got);
  }

  private stonesUnlocked(ids: string[]) {
    for (const id of ids) {
      const n = WAYSTONES.find((x) => x.id === id);
      if (!n) continue;
      this.float(`激活了${n.name}`, '#8ae8ff', true);
      const flash = this.add.image(n.x * T + T / 2, n.y * T - 12, 'glow').setTint(0x6ad8f0).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_FLOAT).setScale(0.3);
      this.tweens.add({ targets: flash, scale: 2.2, alpha: 0, duration: 900, onComplete: () => flash.destroy() });
    }
  }

  /** 用石碑传送到另一座石碑：一道光，人出现在那边，镜头跟过去 */
  private stoneJump(id: string) {
    const dest = WAYSTONES.find((n) => n.id === id);
    if (!dest || this.mountBusy) return;
    const before = store.state.loc;
    store.dispatch((g) => useWaystone(g, id));
    const st = store.state;
    const to = standTile(dest);
    if (st.loc.x !== to.x || st.loc.y !== to.y || (before.x === to.x && before.y === to.y)) return;
    const out = this.add.image(this.player.x, this.player.y - 8, 'glow').setTint(0x6ad8f0).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_FLOAT).setScale(0.2);
    this.tweens.add({ targets: out, scale: 2, alpha: 0, duration: 600, onComplete: () => out.destroy() });
    this.walker = undefined;
    this.clearRoute();
    this.stopWorking();
    this.manual = st.queue.length > 0;
    this.wasPaused = !!st.paused;
    this.travelTo = undefined;
    this.player.setPosition(to.x * T + T / 2, to.y * T + T / 2).setDepth(to.y * T + T / 2 + 1000);
    this.cameras.main.centerOn(this.player.x, this.player.y);
    this.recenterCameraOnly();
    const flash = this.add.image(this.player.x, this.player.y - 8, 'glow').setTint(0x9ae8ff).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_FLOAT).setScale(0.2);
    this.tweens.add({ targets: flash, scale: 1.8, alpha: 0, duration: 700, onComplete: () => flash.destroy() });
    this.float(`传送到${dest.name}`, '#8ae8ff', true);
    this.idle();
  }

  private addNode(n: MapNode) {
    if (n.waystone) {
      this.addStone(n);
      return;
    }
    if (n.portal) {
      this.addPortal(n);
      return;
    }
    this.addResources(n);
    const cx = n.x * T + T / 2;
    const cy = n.y * T + T / 2;
    const boss = n.sprite === 'boss';
    if (n.cave) {
      // 洞窟入口：一座带黑洞口的石山，暂未开放
      const key = `cave-${n.region}`;
      if (!this.textures.exists(key)) this.textures.addCanvas(key, paintCave(n.region));
      this.add.image(cx, cy + T / 2 - T * 2, key).setOrigin(0.5, 1).setScale(1.3).setDepth(cy + 1000 - T * 2);
      this.add.text(cx, cy - 64, `${n.name}\n（未开放）`, {
        fontFamily: FONT, fontSize: '8px', color: '#d8c8f0', backgroundColor: '#1b120ccc', padding: { x: 3, y: 1 }, resolution: 4, align: 'center',
      }).setOrigin(0.5, 1).setDepth(D_LABEL);
      this.add.zone(cx, cy - T * 2, T * 4, T * 4).setInteractive({ useHandCursor: true }).setData('node', n.id);
      return;
    }
    if (n.world) {
      this.addLair(n, cx, cy);
      return;
    }
    if (n.event) {
      this.addAltar(n, cx, cy);
      return;
    }
    if (n.id === RANCH) {
      this.addRanch(n, cx, cy);
      return;
    }
    const img = this.add.image(cx, cy + T / 2, NODE_MARKER[n.sprite]).setOrigin(0.5, 1).setDepth(cy + T / 2 + 1000);
    img.setScale(boss ? 1.8 : 1.4);
    if (n.sprite === 'stove') this.tweens.add({ targets: img, scaleY: 1.12, yoyo: true, repeat: -1, duration: 300 });
    if (n.sprite === 'stove' || n.sprite === 'potion') this.addGlow(cx, cy, 0xff8a2a, 16);
    if (n.sprite === 'enhance') this.addGlow(cx, cy - 4, 0xa070ff, 16);
    if (n.sprite === 'fish') {
      // 鱼漂一圈圈的涟漪
      this.time.addEvent({
        delay: 1400, loop: true, callback: () => {
          const r = this.add.ellipse(cx + 6, cy - 6, 4, 2).setStrokeStyle(1, 0xffffff, 0.8).setDepth(cy + 999);
          this.tweens.add({ targets: r, scaleX: 3, scaleY: 3, alpha: 0, duration: 1200, onComplete: () => r.destroy() });
        },
      });
    }
    const text = this.add
      .text(cx, cy - 14 - (boss ? 6 : 0), '', {
        fontFamily: FONT, fontSize: '7px', color: '#fff3c4', backgroundColor: '#1b120ccc', padding: { x: 3, y: 1 }, resolution: 4, align: 'center',
      })
      .setOrigin(0.5, 1)
      .setDepth(D_LABEL);
    this.nodeLabels.push({ node: n, text });
    // 特色地点：头顶再标一个大字地名，远远就能看到
    if (n.site) {
      this.add.text(cx, cy - 34, `「${n.name}」`, {
        fontFamily: FONT, fontSize: '13px', color: '#ffd86a', stroke: '#1b120c', strokeThickness: 4, resolution: 4,
      }).setOrigin(0.5, 1).setDepth(D_LABEL);
    }
    // 纯打怪的点位不弹页面：点它附近的怪物才弹（用户 10-22 要求）
    if (n.town || n.actions.some((id) => ACTIONS[id].kind !== 'combat')) {
      this.add.zone(cx, cy, T * 2.5, T * 2.5).setInteractive({ useHandCursor: true }).setData('node', n.id);
    }
    this.tweens.add({ targets: text, y: text.y - 2, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.inOut' });
  }

  /** 万圣节活动祭坛（用户 10-24）：四帧动画（鬼火跳、召唤阵转），点它打开召唤面板 */
  private addAltar(n: MapNode, cx: number, cy: number) {
    for (let f = 0; f < 4; f++) if (!this.textures.exists(`altar-${f}`)) this.textures.addCanvas(`altar-${f}`, paintAltar(f));
    const img = this.add.image(cx, cy - T / 2, 'altar-0').setOrigin(0.5, 1).setScale(1.5).setDepth(cy - T / 2 + 1000);
    let f = 0;
    this.time.addEvent({ delay: 220, loop: true, callback: () => img.setTexture(`altar-${(f = (f + 1) % 4)}`) });
    this.addGlow(cx, cy - 70, 0xa050ff, 44);
    this.addGlow(cx, cy - 30, 0xff8a20, 30);
    this.add.text(cx, cy - 108, `🎃 ${n.name}\n召唤南瓜王 · Lv30-120`, {
      fontFamily: FONT, fontSize: '9px', color: '#ffb050', stroke: '#1a0820', strokeThickness: 3, resolution: 4, align: 'center',
    }).setOrigin(0.5, 1).setDepth(D_LABEL);
    this.add.zone(cx, cy - 50, T * 6, T * 6).setInteractive({ useHandCursor: true }).setData('node', n.id);
  }

  /** 城镇畜牧站（用户 10-24）：马厩 + 马场，栏里有小马崽时马场里就站着小马，会抬头甩尾 */
  private addRanch(n: MapNode, cx: number, cy: number) {
    if (!this.textures.exists('ranch')) this.textures.addCanvas('ranch', paintRanch());
    for (let f = 0; f < 24; f += 3) if (!this.textures.exists(`foal-${f}`)) this.textures.addCanvas(`foal-${f}`, paintFoal(f, 0, 32));
    const S = 1.4;
    const left = cx - (RANCH_W * S) / 2;
    const top = cy + T / 2 - RANCH_H * S;
    this.add.image(cx, cy + T / 2, 'ranch').setOrigin(0.5, 1).setScale(S).setDepth(cy + T / 2 + 1000);
    const foals = PADDOCK_SPOTS.map(([x, y], i) => {
      const img = this.add.image(left + x * S, top + y * S, 'foal-0').setOrigin(0.5, 1).setDepth(cy + T / 2 + 1001).setVisible(false);
      if (i === 1) img.setFlipX(true);
      return img;
    });
    let f = 0;
    this.time.addEvent({
      delay: 160, loop: true, callback: () => {
        f = (f + 3) % 24;
        const pens = store.state.ranch?.pens ?? [];
        foals.forEach((img, i) => img.setVisible(!!pens[i]).setTexture(`foal-${(f + i * 9) % 24 - ((f + i * 9) % 24) % 3}`));
      },
    });
    // 名字挂在马场栅栏上方，不压到北边的房子
    this.add.text(left + 87 * S, top + 40 * S, `🐴 ${n.name}`, {
      fontFamily: FONT, fontSize: '8px', color: '#ffe8b0', backgroundColor: '#1b120ccc', padding: { x: 3, y: 1 }, resolution: 4, align: 'center',
    }).setOrigin(0.5, 1).setDepth(D_LABEL);
    this.add.zone(cx, top + (RANCH_H * S) / 2, RANCH_W * S, RANCH_H * S).setInteractive({ useHandCursor: true }).setData('node', n.id);
  }

  /** 世界首领的巢穴：头顶飘一个红色骷髅头（用户 10-24），地上一圈暗红光，远远就能看到 */
  private addLair(n: MapNode, cx: number, cy: number) {
    if (!this.textures.exists('skullmark')) this.textures.addCanvas('skullmark', paintSkull(2));
    const m = Object.values(MONSTERS).find((x) => x.world && n.actions.includes(`fight_${x.id}`));
    const skull = this.add.image(cx, cy - 134, 'skullmark').setDepth(D_LABEL);
    const halo = this.add.image(cx, cy - 134, 'glow').setTint(0xff2010).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_LABEL - 1).setScale(1.1).setAlpha(0.7);
    this.tweens.add({ targets: [skull, halo], y: cy - 140, yoyo: true, repeat: -1, duration: 1100, ease: 'Sine.inOut' });
    this.tweens.add({ targets: halo, alpha: 0.3, scale: 1.4, yoyo: true, repeat: -1, duration: 800, ease: 'Sine.inOut' });
    this.add.text(cx, cy - 154, `☠ 世界首领 ☠\n「${n.name}」${m ? `  Lv${m.level}` : ''}`, {
      fontFamily: FONT, fontSize: '11px', color: '#ff6a5a', stroke: '#1a0404', strokeThickness: 4, resolution: 4, align: 'center',
    }).setOrigin(0.5, 1).setDepth(D_LABEL);
  }

  /** 标签上的等级范围按危险度上色，战斗等级变化时重画 */
  private updateLabels() {
    const cl = combatLevel(store.state);
    if (cl === this.lastCombatLevel) return;
    this.lastCombatLevel = cl;
    for (const { node, text } of this.nodeLabels) {
      if (node.town && !node.pond) {
        text.setText(node.closed ? `${node.name}（未开放）` : node.name);
        continue;
      }
      const d = DANGER[dangerLevel(node, cl)];
      const lv = node.lv[0] === node.lv[1] ? `Lv${node.lv[0]}` : `Lv${node.lv[0]}-${node.lv[1]}`;
      text.setText(`${node.name}\n${lv}`);
      text.setColor('#fff3c4');
      // Phaser 的 Text 不支持分段颜色，用描边颜色提示危险度
      text.setStroke(d.color, 1);
    }
  }

  /** 怪物精灵表按需生成：镜头靠近哪个点位，才画那里的怪 */
  private monTex(m: MonsterDef) {
    const key = `mon-${m.id}`;
    if (this.textures.exists(key)) return key;
    const sheet = paintMonsterSheet(m);
    const tex = this.textures.addCanvas(key, sheet.canvas)!;
    for (const f of sheet.frames) tex.add(f.name, 0, f.x, f.y, sheet.size, sheet.size);
    for (const a of animsOf(m)) {
      this.anims.create({
        key: `${key}-${a.key}`, frameRate: a.rate, repeat: a.repeat,
        frames: Array.from({ length: a.frames }, (_, i) => ({ key, frame: `${a.key}-${i}` })),
      });
    }
    return key;
  }

  private monSprite(m: MonsterDef, x: number, y: number) {
    const key = this.monTex(m);
    const S = monsterFrameSize(m);
    // 原点放在脚底那一行
    const spr = this.add.sprite(x, y, key, 'idle-0').setOrigin(0.5, (S - (big96(m) ? 4 : 3)) / S);
    // 首领再放大一圈，更有压迫感（用户 10-23）
    spr.setScale(monScale(m));
    // 点怪物弹出它的信息页
    spr.setInteractive({ useHandCursor: true }).setData('monster', `fight_${m.id}`);
    this.monSprites = this.monSprites.filter((x) => x.active);
    this.monSprites.push(spr);
    if (m.rank !== 'normal') this.addBar(spr, m);
    spr.play({ key: `${key}-idle`, startFrame: Math.floor(Math.random() * 6) });
    return spr;
  }

  private playMon(spr: Phaser.GameObjects.Sprite, m: MonsterDef, anim: MonAnim, thenIdle = false) {
    spr.play(`mon-${m.id}-${anim}`, anim === 'idle' || anim === 'move');
    if (thenIdle) spr.once('animationcomplete', () => spr.active && spr.play(`mon-${m.id}-idle`));
  }

  private spawnedNodes = new Set<string>();
  private spawnQueue: MapNode[] = [];

  /** 每个战斗点周围放几只怪在游荡；首领站在中间不动 */
  private addMonsters() {
    this.time.addEvent({
      delay: 400, loop: true, callback: () => {
        const cam = this.cameras.main;
        const cx = cam.midPoint.x / T;
        const cy = cam.midPoint.y / T;
        for (const n of NODES) {
          if (n.town || this.spawnedNodes.has(n.id)) continue;
          if (Math.abs(n.x - cx) < 55 && Math.abs(n.y - cy) < 55) {
            this.spawnedNodes.add(n.id);
            this.spawnQueue.push(n);
          }
        }
        // 每次只生成一个点位，避免一下子卡住
        const n = this.spawnQueue.shift();
        if (n) this.spawnNode(n);
      },
    });
  }

  private spawnNode(n: MapNode) {
    // 活动祭坛的南瓜王要召唤了才出现，开打时再放出来
    if (n.event) return;
    const mons = n.actions.map((id) => ACTIONS[id]).filter((a) => a.kind === 'combat').map((a) => MONSTERS[(a as { monster: string }).monster]);
    mons.forEach((m, i) => {
      // 世界首领就站在骷髅头标记正下方
      const { x: ox, y: oy } = n.world ? { x: n.x, y: n.y + 1 } : spawnSpot(n, i, mons.length);
      const count = m.rank === 'normal' ? 2 : 1;
      for (let k = 0; k < count; k++) this.addMonWanderer(m, ox + k * 3, oy + (k ? 2 : 0), m.rank === 'boss' ? 2 : 4);
    });
  }

  /** 怪物游荡：走的时候播移动动画，停下来播待机 */
  private addMonWanderer(m: MonsterDef, x: number, y: number, radius: number) {
    const spr = this.monSprite(m, x * T + T / 2, y * T + T / 2).setDepth(y * T + 1000);
    let i = 0;
    const wander = () => {
      if (!spr.active) return;
      i++;
      const nx = (x + (hash(i, x, y) * 2 - 1) * radius) * T + T / 2;
      const ny = (y + (hash(y, i, x) * 2 - 1) * radius) * T + T / 2;
      const dist = Math.hypot(nx - spr.x, ny - spr.y);
      const pause = 800 + hash(x, i) * 3000;
      this.time.delayedCall(pause, () => {
        if (!spr.active) return;
        spr.setFlipX(nx < spr.x);
        this.playMon(spr, m, 'move');
        this.tweens.add({
          targets: spr, x: nx, y: ny, duration: (dist / T) * (m.traits.includes('swift') ? 350 : m.traits.includes('slow') ? 900 : 600),
          onUpdate: () => spr.setDepth(spr.y + 1000),
          onComplete: () => {
            this.playMon(spr, m, 'idle');
            wander();
          },
        });
      });
    };
    wander();
    return spr;
  }

  /** 在中心附近随机游荡的小怪或村民 */
  private addWanderer(key: string, x: number, y: number, radius: number) {
    if (NPC_OUTFITS[key]) return this.addVillager(key, x, y, radius);
    const img = this.add.image(x * T + T / 2, y * T + T / 2, key).setDepth(y * T + 1000);
    let i = 0;
    const wander = () => {
      i++;
      const nx = (x + (hash(i, x, y) * 2 - 1) * radius) * T + T / 2;
      const ny = (y + (hash(y, i, x) * 2 - 1) * radius) * T + T / 2;
      img.setFlipX(nx < img.x);
      this.tweens.add({
        targets: img, x: nx, y: ny, duration: 1500 + hash(i, i) * 1500, delay: 500 + hash(x, i) * 2500,
        onUpdate: () => img.setDepth(img.y + 1000),
        onComplete: wander,
      });
    };
    wander();
    return img;
  }

  /** 镇上的人：走路时按方向播走路动画，停下来播待机 */
  private addVillager(kind: string, x: number, y: number, radius: number) {
    const key = `npc-${kind}`;
    const spr = this.add.sprite(x * T + T / 2, y * T + T / 2 + 7, key).setOrigin(0.5, (HERO_FEET + HERO_PAD.t) / FRAME_H).setDepth(y * T + 1000);
    spr.play(`${key}:idle-down`);
    let i = 0;
    const wander = () => {
      i++;
      const nx = (x + (hash(i, x, y) * 2 - 1) * radius) * T + T / 2;
      const ny = (y + (hash(y, i, x) * 2 - 1) * radius) * T + T / 2 + 7;
      const dx = nx - spr.x;
      const dy = ny - spr.y;
      const dir = Math.abs(dx) > Math.abs(dy) ? 'side' : dy > 0 ? 'down' : 'up';
      this.tweens.add({
        targets: spr, x: nx, y: ny, delay: 800 + hash(x, i) * 3000,
        // 村民走得比主角慢一点：每秒 2 格
        duration: Math.max(400, (Math.hypot(dx, dy) / T / 2) * 1000),
        onStart: () => {
          spr.setFlipX(dir === 'side' && dx < 0);
          spr.play(`${key}:walk-${dir}`, true);
        },
        onUpdate: () => spr.setDepth(spr.y + 1000),
        onComplete: () => {
          spr.play(`${key}:idle-${dir}`, true);
          wander();
        },
      });
    };
    wander();
    return spr;
  }

  // ---- 镜头与输入 ----

  private setupCamera() {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, MAP_W * T, MAP_H * T);
    cam.setBackgroundColor('#1b140f');
    // 画布按设备像素比渲染，镜头缩放要乘回 DPR，否则手机上会糊
    const cssWidth = () => this.scale.width / DPR;
    const minZoom = () => Math.max(cssWidth() / (70 * T), 0.75) * DPR;
    const fit = () => cam.setZoom(Phaser.Math.Clamp((cssWidth() / (cssWidth() > 700 ? 26 : 15)) / T, 1.5, 4) * DPR);
    fit();
    // 电脑端展开、收起右侧面板时画布会变宽变窄：不重新算缩放，镜头直接对准角色，
    // 否则镜头会先停在原处再慢慢追回角色，看起来弹一下（用户 10-23）
    let lastW = cssWidth();
    this.scale.on('resize', () => {
      const w = cssWidth();
      if (Math.min(w, lastW) <= 700) fit();
      lastW = w;
      if (this.following) cam.centerOn(this.player.x, this.player.y);
      else cam.centerOn(this.camMid.x, this.camMid.y);
    });
    cam.startFollow(this.player, false, 0.12, 0.12);

    this.input.addPointer(1);
    this.input.mouse?.disableContextMenu();
    let pinchStart = 0;
    let zoomStart = 1;
    let gesture = false; // 本次触摸是否拖动或双指缩放过，若是则抬手时不算点击

    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      // 电脑端右键走路（按住一直走），左键只选目标；手机端点地面走、按住一直走（用户 10-23）
      const walkPress = p.wasTouch ? !over.length : p.button === 2;
      this.holdStart = walkPress ? this.time.now : 0;
      this.holdWalked = false;
      if (!this.input.pointer1.isDown || !this.input.pointer2.isDown) return;
      this.holdStart = 0;
      gesture = true;
      pinchStart = Phaser.Math.Distance.BetweenPoints(this.input.pointer1.position, this.input.pointer2.position);
      zoomStart = cam.zoom;
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.wasTouch) this.hoverPlot(p);
      const p1 = this.input.pointer1;
      const p2 = this.input.pointer2;
      if (p1.isDown && p2.isDown && pinchStart > 0) {
        const d = Phaser.Math.Distance.BetweenPoints(p1.position, p2.position);
        cam.setZoom(Phaser.Math.Clamp((zoomStart * d) / pinchStart, minZoom(), 5 * DPR));
        return;
      }
      if (!p.isDown || p.getDistance() < DRAG_THRESHOLD * DPR) return;
      if (this.holdWalked || (!p.wasTouch && p.rightButtonDown())) return;
      this.holdStart = 0;
      gesture = true;
      if (this.following) {
        cam.stopFollow();
        this.following = false;
      }
      cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
      cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
    });

    this.input.on('pointerup', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      const held = this.holdWalked;
      this.holdStart = 0;
      this.holdWalked = false;
      const tapped = !gesture && !held && p.getDistance() < DRAG_THRESHOLD * DPR;
      if (!this.input.pointer1.isDown && !this.input.pointer2.isDown) {
        gesture = false;
        pinchStart = 0;
      }
      if (!tapped) return;
      const mouse = !p.wasTouch;
      if (mouse && p.button === 2) {
        store.tracking = null;
        const wp = cam.getWorldPoint(p.x, p.y);
        this.moveTo(Math.floor(wp.x / T), Math.floor(wp.y / T));
        return;
      }
      const node = over.map((o) => (o.getData('monster') ?? o.getData('node')) as string | undefined).find(Boolean);
      if (node) {
        this.game.events.emit(NODE_CLICK, node);
        return;
      }
      // 点田里的地块：种 / 浇水 / 收获（电脑端左键、手机端点）
      const tp = cam.getWorldPoint(p.x, p.y);
      const plot = this.plotIdAt(Math.floor(tp.x / T), Math.floor(tp.y / T));
      if (plot) {
        this.tendPlotAt(plot);
        return;
      }
      if (mouse) return; // 电脑端左键点空地不走路
      store.tracking = null;
      const wp = cam.getWorldPoint(p.x, p.y);
      this.moveTo(Math.floor(wp.x / T), Math.floor(wp.y / T));
    });

    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => this.zoomBy(dy > 0 ? -0.25 : 0.25));
    const onZoom = (d: number) => { if (this.scene.isActive()) this.zoomBy(d); };
    const onRecenter = () => { if (this.scene.isActive()) this.recenter(); };
    this.game.events.on('zoom', onZoom);
    this.game.events.on('recenter', onRecenter);
    this.unsub.push(() => {
      this.game.events.off('zoom', onZoom);
      this.game.events.off('recenter', onRecenter);
    });
    this.zoomLimits = { min: minZoom, max: () => 5 * DPR };
  }

  private zoomLimits = { min: () => 1, max: () => 5 };

  private zoomBy(d: number) {
    const cam = this.cameras.main;
    cam.setZoom(Phaser.Math.Clamp(cam.zoom + d * DPR, this.zoomLimits.min(), this.zoomLimits.max()));
  }

  /** 镜头回到角色 */
  private recenter() {
    this.recenterCameraOnly();
  }

  private recenterCameraOnly() {
    this.following = true;
    this.cameras.main.startFollow(this.player, false, 0.12, 0.12);
  }

  private playerTile() {
    return { x: Math.floor(this.player.x / T), y: Math.floor(this.player.y / T) };
  }

  /** 世界地图上的传送：直接出现在资源点前 */
  private teleport(nodeId: string) {
    const n = NODES.find((x) => x.id === nodeId);
    if (!n) return;
    this.walker = undefined;
    this.clearRoute();
    this.stopWorking();
    store.dispatch((g) => teleportState(g, nodeId));
    const s = standTile(n);
    this.player.setPosition(s.x * T + T / 2, s.y * T + T / 2).setDepth(s.y * T + T / 2 + 1000);
    this.cameras.main.centerOn(this.player.x, this.player.y);
    this.recenterCameraOnly();
    const flash = this.add.image(this.player.x, this.player.y, 'glow').setTint(0x9ad8ff).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_FLOAT).setScale(0.2);
    this.tweens.add({ targets: flash, scale: 1.6, alpha: 0, duration: 600, onComplete: () => flash.destroy() });
    this.manual = nodeForAction(this.currentAction) !== n;
    // 传送到别处等于离开了工作地点；传回工作地点就接着干
    store.dispatch((g) => (this.manual ? leaveWork(g) : resumeWork(g)));
    if (!this.manual) this.startWorking();
  }

  /** 点地面：角色走过去。任务照常在后台进行，只是不再播放干活动画 */
  private moveTo(tx: number, ty: number, marker = true) {
    if (this.mountBusy) return;
    const path = findPath(this.playerTile(), { x: tx, y: ty });
    if (marker) this.showMarker(tx, ty, !!path);
    if (!path) return;
    this.manual = true;
    this.stopWorking();
    store.dispatch(leaveWork);
    // 记进存档：关掉游戏也会在后台走完
    const from = this.playerTile();
    const ms = (pathLength(from, path) / (WALK_TILES_PER_SEC * speedMultiplier)) * 1000;
    store.dispatch((g) => startWalk(g, from, { x: tx, y: ty }, ms));
    if (!this.following) this.recenterCameraOnly();
    this.followWalk(path, { x: tx, y: ty });
  }

  private followWalk(path: { x: number; y: number }[], to: { x: number; y: number }, speed?: number) {
    this.drawRoute(path);
    this.arrive = undefined;
    this.walkPath(path, () => {
      this.clearRoute();
      store.dispatch((g) => setLoc(g, to.x, to.y));
      const then = this.arrive;
      this.arrive = undefined;
      then?.();
    }, speed);
  }

  /** 读档时还在手动寻路：从走到的大概位置接着走，剩余时间和存档一致 */
  private resumeWalk() {
    const w = store.state.walk;
    if (!w) return;
    // 找不到路就直线走过去，不能直接瞬移到终点（那样会把剩下的路程吞掉）
    const path = findPath(this.playerTile(), w.to) ?? [w.to];
    this.manual = true;
    this.followWalk(path, w.to, pathLength(this.playerTile(), path) / (w.ms / 1000));
  }

  private showMarker(tx: number, ty: number, ok: boolean) {
    this.marker?.destroy();
    const g = this.add.graphics().setDepth(999);
    const cx = tx * T + T / 2;
    const cy = ty * T + T / 2;
    if (ok) {
      g.lineStyle(1, 0xe8b84a, 1).strokeRect(cx - 6, cy - 6, 12, 12);
    } else {
      g.lineStyle(1.5, 0xd0566b, 1).lineBetween(cx - 4, cy - 4, cx + 4, cy + 4).lineBetween(cx + 4, cy - 4, cx - 4, cy + 4);
    }
    this.marker = g;
    this.tweens.add({ targets: g, alpha: 0, duration: 900, delay: 300, onComplete: () => g.destroy() });
  }

  /** 队列首个任务变化时，角色走到对应资源点 */
  private travelTo?: string;

  private wasPaused = !!store.state.paused;

  private seenDeaths = store.state.stats.deaths;

  private syncTask() {
    // 阵亡：瞬间回到城里复活，之后照常寻路回去
    if (store.state.stats.deaths !== this.seenDeaths) {
      const died = store.state.stats.deaths > this.seenDeaths;
      this.seenDeaths = store.state.stats.deaths;
      if (died) {
        this.stopWorking();
        this.walker = undefined;
        this.clearRoute();
        this.player.setPosition(SPAWN.x * T + T / 2, SPAWN.y * T + T / 2);
        this.float('阵亡，回城复活', '#ff7a6a', true);
        if (!this.following) this.recenterCameraOnly();
        this.travelTo = undefined;
        if (store.state.queue[0]?.action === this.currentAction) {
          const to = store.state.travel?.to;
          this.travelTo = to;
          if (isBankId(to)) this.goToTask(NODES.find((n) => n.id === to));
          else if (to) this.goToTask();
          return;
        }
      }
    }
    const action = store.state.queue[0]?.action;
    const to = store.state.travel?.to;
    const paused = !!store.state.paused;
    if (paused !== this.wasPaused) {
      this.wasPaused = paused;
      // 点了「继续工作」：走回任务地点
      if (!paused && action && action === this.currentAction && this.manual) {
        this.travelTo = to;
        this.goToTask();
        this.recenterCameraOnly();
        return;
      }
    }
    if (action === this.currentAction) {
      // 背包满了回仓库，或者存完东西走回资源点
      if (to !== this.travelTo) {
        this.travelTo = to;
        if (isBankId(to)) this.goToTask(NODES.find((n) => n.id === to));
        else if (to && !this.manual) this.goToTask();
      }
      return;
    }
    this.travelTo = to;
    const sameNode = nodeForAction(action) === nodeForAction(this.currentAction);
    this.currentAction = action;
    if (!action) {
      this.stopWorking();
      return;
    }
    if (sameNode && !this.manual) {
      this.stopWorking();
      this.startWorking();
      return;
    }
    this.goToTask();
    this.recenterCameraOnly();
  }

  /** 从后台切回来：丢掉画面上没演完的走路，按存档的当前状态重新摆位、接着演 */
  private resync() {
    const st = store.state;
    this.walker = undefined;
    this.clearRoute();
    this.stopWorking();
    const place = (p: { x: number; y: number }) => {
      const q = nearestWalkable(p);
      this.player.setPosition(q.x * T + T / 2, q.y * T + T / 2);
    };
    const task = st.queue[0];
    this.currentAction = task?.action;
    this.travelTo = st.travel?.to;
    this.wasPaused = !!st.paused;
    this.seenDeaths = st.stats.deaths;
    if (!task || st.paused) {
      this.manual = !!task;
      place(st.walk ? walkPos(st) : st.loc);
      this.resumeWalk();
    } else if (st.travel) {
      const bank = isBankId(st.travel.to) ? NODES.find((n) => n.id === st.travel!.to) : undefined;
      const node = bank ?? nodeForAction(task.action);
      if (node) {
        // 存档只记剩余时间，按比例估一个路上的位置
        const to = standTile(node);
        const k = st.travel.total ? 1 - st.travel.ms / st.travel.total : 1;
        const via = st.travel.via && WAYSTONES.find((n) => n.id === st.travel!.via![1]);
        // 走石碑的路线：传过去以前从起点算，传过去以后从第二座石碑算
        const from = via && st.travel.total - st.travel.ms >= travelMs(st.loc, standOf(WAYSTONES.find((n) => n.id === st.travel!.via![0])!), moveSpeed(st)) + STONE_JUMP_MS ? standTile(via) : st.loc;
        place(via ? from : { x: st.loc.x + (to.x - st.loc.x) * k, y: st.loc.y + (to.y - st.loc.y) * k });
      }
      this.goToTask(bank);
    } else {
      const a = ACTIONS[task.action];
      const node = nodeForAction(task.action);
      place((a.kind === 'combat' && trackSpot(a.monster, true)) || (node ? standTile(node) : st.loc));
      this.manual = false;
      this.startWorking();
    }
    this.player.setDepth(this.player.y + 1000);
    this.recenterCameraOnly();
  }

  /** 自动寻路去任务地点：走路时间和存档里的一致，到了才开始干活 */
  private goToTask(target?: MapNode) {
    const node = target ?? nodeForAction(this.currentAction);
    if (!node) return;
    const toBank = !!target;
    this.manual = false;
    this.stopWorking();
    // 打怪直接走到那只怪的刷新点（交过手的都能准确找到）
    const a = toBank ? undefined : ACTIONS[this.currentAction ?? ''];
    const dest = (a?.kind === 'combat' && trackSpot(a.monster, true)) || standTile(node);
    const st = store.state;
    const t0 = st.queue[0];
    const supply = toBank && t0 && ACTIONS[t0.action]?.kind === 'combat' && !t0.stocked;
    const done = () => {
      this.clearRoute();
      if (toBank) this.float(supply ? '补给完毕' : '已存入仓库', '#9ad8ff', true);
      else this.startWorking();
    };
    // 顺路用传送石碑（存档里算好的路线）：先走到第一座石碑，传过去，再走完剩下的
    const via = st.travel?.to === node.id ? st.travel.via : undefined;
    if (via) {
      if (toBank) this.float(supply ? '回仓库拿食物' : '背包满了，回仓库', '#e8b84a');
      this.goViaStones(via, dest, done);
      return;
    }
    const path = findPath(this.playerTile(), dest) ?? [];
    const stand = standTile(node);
    const atDest = st.loc.x === stand.x && st.loc.y === stand.y;
    // 存档里还在路上：按剩余时间匀速走完这条路
    const ms = st.travel?.to === node.id ? st.travel.ms : atDest ? 0 : travelMs(st.loc, stand, moveSpeed(st));
    let speed: number | undefined;
    if (ms > 500 && path.length) {
      let len = 0;
      let prev = this.playerTile();
      for (const p of path) {
        len += Math.hypot(p.x - prev.x, p.y - prev.y);
        prev = p;
      }
      speed = len / (ms / 1000);
    }
    this.drawRoute(path);
    if (toBank) this.float(supply ? '回仓库拿食物' : '背包满了，回仓库', '#e8b84a');
    this.walkPath(path, done, speed);
  }

  /** 自动寻路经过石碑：走到 a，传到 b，再走到 dest；快慢按存档里剩下的时间来，和离线结算一致 */
  private goViaStones(via: [string, string], dest: { x: number; y: number }, done: () => void) {
    const A = WAYSTONES.find((n) => n.id === via[0]);
    const B = WAYSTONES.find((n) => n.id === via[1]);
    const tr = store.state.travel;
    if (!A || !B || !tr) return;
    const elapsed = tr.total - tr.ms;
    const t1 = travelMs(store.state.loc, standOf(A), moveSpeed(store.state));
    const speedFor = (path: { x: number; y: number }[], ms: number) => (ms > 500 && path.length ? pathLength(this.playerTile(), path) / (ms / 1000) : undefined);
    const leg2 = () => {
      const path = findPath(this.playerTile(), dest) ?? [];
      this.drawRoute(path);
      this.walkPath(path, done, speedFor(path, store.state.travel?.ms ?? 0));
    };
    if (elapsed >= t1 + STONE_JUMP_MS) {
      const b = standTile(B);
      if (Math.hypot(this.playerTile().x - b.x, this.playerTile().y - b.y) > 40) this.player.setPosition(b.x * T + T / 2, b.y * T + T / 2);
      leg2();
      return;
    }
    const path = findPath(this.playerTile(), standTile(A)) ?? [];
    this.drawRoute(path);
    this.float(`顺路去${A.name}传送`, '#8ae8ff');
    this.walkPath(path, () => {
      this.clearRoute();
      // 一道光，人出现在另一座石碑旁
      const out = this.add.image(this.player.x, this.player.y - 8, 'glow').setTint(0x6ad8f0).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_FLOAT).setScale(0.2);
      this.tweens.add({ targets: out, scale: 2, alpha: 0, duration: 600, onComplete: () => out.destroy() });
      const b = standTile(B);
      this.player.setPosition(b.x * T + T / 2, b.y * T + T / 2).setDepth(b.y * T + T / 2 + 1000);
      this.cameras.main.centerOn(this.player.x, this.player.y);
      this.recenterCameraOnly();
      const flash = this.add.image(this.player.x, this.player.y - 8, 'glow').setTint(0x9ae8ff).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_FLOAT).setScale(0.2);
      this.tweens.add({ targets: flash, scale: 1.8, alpha: 0, duration: 700, onComplete: () => flash.destroy() });
      this.float(`传送到${B.name}`, '#8ae8ff', true);
      this.idle();
      this.time.delayedCall(500, leg2);
    }, speedFor(path, t1 - elapsed));
  }

  private route?: Phaser.GameObjects.Graphics;

  /** 地图上画出要走的路线（金色虚点） */
  private drawRoute(path: { x: number; y: number }[]) {
    this.clearRoute();
    if (path.length < 2) return;
    const g = this.add.graphics().setDepth(998);
    g.fillStyle(0xe8b84a, 0.85);
    path.forEach((p, i) => {
      if (i % 2) return;
      g.fillRect(p.x * T + T / 2 - 1.5, p.y * T + T / 2 - 1.5, 3, 3);
    });
    const end = path[path.length - 1];
    g.lineStyle(1, 0xe8b84a, 1).strokeRect(end.x * T + 2, end.y * T + 2, T - 4, T - 4);
    this.route = g;
  }

  private clearRoute() {
    this.route?.destroy();
    this.route = undefined;
  }

  /** 拉直路径：能直线走过去的拐点都去掉，斜着走不再走锯齿 */
  private smoothPath(path: { x: number; y: number }[]) {
    const clear = (a: { x: number; y: number }, b: { x: number; y: number }) => {
      const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 3);
      for (let i = 1; i < n; i++) {
        const x = a.x + ((b.x - a.x) * i) / n;
        const y = a.y + ((b.y - a.y) * i) / n;
        // 角色有身宽，检查四个角
        for (const [ox, oy] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) {
          if (!isWalkable(Math.round(x + ox), Math.round(y + oy))) return false;
        }
      }
      return true;
    };
    const out: { x: number; y: number }[] = [];
    let from = this.playerTile();
    let i = 0;
    while (i < path.length) {
      let j = Math.min(path.length - 1, i + 16);
      while (j > i && !clear(from, path[j])) j--;
      out.push(path[j]);
      from = path[j];
      i = j + 1;
    }
    return out;
  }

  private walker?: { pts: { x: number; y: number }[]; i: number; speed: number; done: () => void };

  /** 沿路径匀速走：每帧按经过的时间移动，不再一格一个补间 */
  private walkPath(path: { x: number; y: number }[], done: () => void, speed?: number) {
    this.walker = undefined;
    if (!path.length) return done();
    const tps = speed ?? WALK_TILES_PER_SEC * speedMultiplier;
    this.working = false;
    this.walker = {
      pts: this.smoothPath(path).map((p) => ({ x: p.x * T + T / 2, y: p.y * T + T / 2 })),
      i: 0, speed: tps * T, done,
    };
  }

  private stepWalker(delta: number) {
    const w = this.walker;
    // 上下坐骑的动作做完之前原地不动（用户 10-23）
    if (!w || this.mountBusy) return;
    let move = (w.speed * Math.min(delta, 100)) / 1000;
    let dx = 0;
    let dy = 0;
    while (move > 0 && w.i < w.pts.length) {
      const t = w.pts[w.i];
      dx = t.x - this.player.x;
      dy = t.y - this.player.y;
      const d = Math.hypot(dx, dy);
      if (d <= move) {
        this.player.setPosition(t.x, t.y);
        move -= d;
        w.i++;
      } else {
        this.player.setPosition(this.player.x + (dx / d) * move, this.player.y + (dy / d) * move);
        move = 0;
      }
    }
    this.player.setDepth(this.player.y + 1000);
    if (dx || dy) {
      // 朝向带一点迟滞，斜着走时不会在侧面和正面之间来回闪
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      const next: HeroDir = this.facing === 'side' ? (ay > ax * 1.6 ? (dy > 0 ? 'down' : 'up') : 'side')
        : ax > ay * 1.6 ? 'side' : dy > 0 ? 'down' : 'up';
      this.facing = next;
      if (next === 'side' && ax > 0.01) this.playerBody.setFlipX(dx < 0);
      this.heroAnim('walk');
    }
    if (w.i >= w.pts.length) {
      this.walker = undefined;
      this.idle();
      w.done();
    }
  }

  private addBar(spr: Phaser.GameObjects.Sprite, m: MonsterDef) {
    const boss = m.rank === 'boss';
    const w = big96(m) ? 96 : boss ? 64 : 18;
    const h = big96(m) ? 7 : boss ? 6 : 2;
    const bg = this.add.rectangle(0, 0, w + 2, h + 2, 0x1b120c).setStrokeStyle(boss ? 1.5 : 1, boss ? 0xe8b84a : 0x6b5132).setOrigin(0.5, 1);
    // 掉血时先掉红条，后面一截浅色残影慢慢跟上
    const trail = this.add.rectangle(0, 0, w, h, boss ? 0xffb08a : 0xfff0c0).setOrigin(0, 1);
    const fill = this.add.rectangle(0, 0, w, h, boss ? 0xe8161a : 0xe08a2c).setOrigin(0, 1);
    const bar: (typeof this.bars)[number] = { spr, m, bg, trail, fill, w, h, live: false, shown: 1 };
    if (boss) {
      // 首领：血条上方常驻名字，脚下一圈暗红光环和阴影
      bar.label = this.add.text(0, 0, m.event ? `🎃 万圣节限定 · ${m.name}  Lv${m.level}` : m.world ? `☠ 世界首领 · ${m.name}  Lv${m.level}` : `首领 · ${m.name}  Lv${m.level}`, {
        fontFamily: FONT, fontSize: big96(m) ? '11px' : '10px', color: m.event ? '#ffa040' : m.world ? '#ff7a6a' : '#ffd86a', stroke: '#2a0808', strokeThickness: 3, resolution: 4,
      }).setOrigin(0.5, 1);
      const S = monsterFrameSize(m) * monScale(m) * (big96(m) ? 0.8 : 1);
      const shadow = this.add.ellipse(spr.x, spr.y, S * 0.9, S * 0.28, 0x000000, 0.35);
      const ring = this.add.ellipse(spr.x, spr.y, S * 1.1, S * 0.36).setStrokeStyle(1.5, 0xff4a2a, 0.8);
      const glow = this.add.image(spr.x, spr.y - S * 0.3, 'glow').setTint(0xc02010).setBlendMode(Phaser.BlendModes.ADD).setScale((S * 1.6) / 64).setAlpha(0.45);
      this.tweens.add({ targets: ring, scaleX: 1.15, scaleY: 1.15, alpha: 0.35, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.inOut' });
      this.tweens.add({ targets: glow, alpha: 0.2, yoyo: true, repeat: -1, duration: 1300, ease: 'Sine.inOut' });
      bar.aura = [shadow, ring, glow];
    }
    this.bars.push(bar);
  }

  /** 血条跟着怪走；正在打的那只按战斗里的血量显示 */
  private trackArrow?: Phaser.GameObjects.Text;
  /** 追踪中的怪：离角色最近的那只头顶加个跳动的箭头 */
  private updateTracking(time: number) {
    const id = store.tracking;
    // 普通怪不标；Boss 开打后也不用再标
    if (id && (!exactTrack(id) || this.currentAction === `fight_${id}`)) store.tracking = null;
    let target: Phaser.GameObjects.Sprite | undefined;
    if (id) {
      let best = Infinity;
      for (const b of this.monSprites) {
        if (!b.active || b.getData('monster') !== `fight_${id}`) continue;
        const d = Phaser.Math.Distance.Between(b.x, b.y, this.player.x, this.player.y);
        if (d < best) { best = d; target = b; }
      }
    }
    if (!target) { this.trackArrow?.setVisible(false); return; }
    this.trackArrow ??= this.add.text(0, 0, '▼', { fontFamily: FONT, fontSize: '10px', color: '#ffd84a', stroke: '#000', strokeThickness: 2, resolution: 4 }).setOrigin(0.5, 1);
    const S = monsterFrameSize(MONSTERS[id!]);
    this.trackArrow.setVisible(true).setPosition(target.x, target.y - (S - 3) * target.scaleY - 8 + Math.sin(time / 180) * 2).setDepth(D_LABEL);
  }

  private updateBars() {
    const c = store.state.combat;
    this.bars = this.bars.filter((b) => {
      if (!b.spr.active) {
        b.bg.destroy();
        b.trail.destroy();
        b.fill.destroy();
        b.label?.destroy();
        b.aura?.forEach((o) => o.destroy());
        return false;
      }
      const S = monsterFrameSize(b.m) * b.spr.scaleY;
      const top = b.spr.y - (S - 3 * b.spr.scaleY) + 6;
      // 首领的血条和名字压在所有东西上面，远处也看得清
      const depth = b.label ? D_LABEL - 1 : b.spr.depth + 1;
      b.bg.setPosition(b.spr.x, top).setDepth(depth).setAlpha(b.spr.alpha);
      const ratio = b.live && c ? (c.respawnMs > 0 ? 0 : Math.max(0, c.monsterHp / b.m.hp)) : 1;
      b.fill.setPosition(b.spr.x - b.w / 2, top - 1).setDepth(depth).setAlpha(b.spr.alpha).setScale(ratio, 1);
      b.shown = ratio >= b.shown ? ratio : Math.max(ratio, b.shown - this.game.loop.delta / 900);
      b.trail.setPosition(b.spr.x - b.w / 2, top - 1).setDepth(depth).setAlpha(b.spr.alpha * 0.85).setScale(b.shown, 1);
      b.label?.setPosition(b.spr.x, top - b.h - 3).setDepth(depth).setAlpha(b.spr.alpha);
      if (b.aura) {
        const [shadow, ring, glow] = b.aura as [Phaser.GameObjects.Ellipse, Phaser.GameObjects.Ellipse, Phaser.GameObjects.Image];
        shadow.setPosition(b.spr.x, b.spr.y).setDepth(b.spr.depth - 2).setAlpha(0.35 * b.spr.alpha);
        ring.setPosition(b.spr.x, b.spr.y).setDepth(b.spr.depth - 1);
        glow.setPosition(b.spr.x, b.spr.y - S * 0.3).setDepth(D_GLOW);
        ring.setVisible(b.spr.alpha > 0.1);
        glow.setVisible(b.spr.alpha > 0.1);
      }
      return true;
    });
  }

  /** 战斗中让对面的怪跟着战斗状态动：出手、挨打、倒下、重新刷出来 */
  private syncFoe() {
    const foe = this.foe;
    const c = store.state.combat;
    const a = this.currentAction ? ACTIONS[this.currentAction] : undefined;
    if (!foe || !c || a?.kind !== 'combat') return;
    const m = MONSTERS[a.monster];
    const prev = this.foeSeen;
    this.foeSeen = { hp: c.monsterHp, timer: c.monsterTimerMs, respawn: c.respawnMs, p: c.pSwings ?? 0, m: c.mSwings ?? 0 };
    if (!prev) return;
    if (this.foeSeen.p > prev.p) this.playerSwingFx(foe, m, c.pDmg ?? -1, !!c.pCrit);
    const big = this.foeSeen.m > prev.m && c.mArt === 'world';
    if (this.foeSeen.m > prev.m) this.monsterSwingFx(c.mDmg ?? -1, c.mArt, foe, m);
    if (c.respawnMs > 0 && prev.respawn <= 0) {
      this.playMon(foe, m, 'death');
      this.deathPuff(foe);
    } else if (c.respawnMs <= 0 && prev.respawn > 0) {
      foe.setAlpha(0);
      this.playMon(foe, m, 'idle');
      this.tweens.add({ targets: foe, alpha: 1, duration: 300 });
    } else if (c.respawnMs <= 0) {
      if (big) this.playMon(foe, m, 'skill', true);
      else if (c.monsterTimerMs > prev.timer + 200) this.playMon(foe, m, 'attack', true);
      else if (c.monsterHp < prev.hp) this.playMon(foe, m, 'hurt', true);
    }
  }

  // ---- 战斗特效 ----

  /** 主角出手：按武器放刀光 / 箭 / 法球，打到之后再闪白、击退、飘数字 */
  private playerSwingFx(foe: Phaser.GameObjects.Sprite, m: MonsterDef, dmg: number, crit = false) {
    const w = store.state.equipment.weapon ?? '';
    const key = w.slice(w.indexOf('_') + 1);
    const S = monsterFrameSize(m);
    const tx = foe.x;
    const ty = foe.y - S * 0.35;
    // 数字飘在怪物右上方，不和主角头顶的名字叠在一起
    const nx = foe.x + 5;
    const ny = foe.y - S * 0.55;
    const land = () => {
      if (!foe.active) return;
      if (dmg < 0) return this.popText(nx, ny, '未命中', '#b8b8c0', 7);
      this.hitFlash(foe, 1);
      const spark = this.add.image(tx + (Math.random() - 0.5) * 6, ty + (Math.random() - 0.5) * 6, 'fx-hit').setDepth(D_FLOAT - 1).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: spark, scale: 1.8, alpha: 0, angle: 45, duration: 220, onComplete: () => spark.destroy() });
      const heavy = crit || dmg >= Math.max(3, combatStats(store.state, m).playerMaxHit * 0.85);
      this.popText(nx, ny, crit ? `暴击 ${dmg}!` : heavy ? `${dmg}!` : `${dmg}`, crit ? '#ff7a30' : heavy ? '#ffb030' : '#ffffff', crit ? 11 : heavy ? 10 : 8);
      if (heavy) this.cameras.main.shake(crit ? 130 : 90, crit ? 0.003 : 0.002);
    };
    const from = { x: this.player.x + 6, y: this.player.y - 4 };
    if (['shortbow', 'longbow', 'crossbow'].includes(key)) {
      const a = this.add.image(from.x, from.y, 'fx-arrow').setDepth(D_FLOAT - 2).setRotation(Math.atan2(ty - from.y, tx - from.x));
      this.tweens.add({ targets: a, x: tx - 3, y: ty, duration: 160, onComplete: () => { a.destroy(); land(); } });
    } else if (key === 'staff') {
      const orb = this.add.image(from.x, from.y - 4, 'glow').setTint(0x7ac8ff).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_FLOAT - 2).setScale(0.18);
      this.tweens.add({
        targets: orb, x: tx, y: ty, duration: 260, ease: 'Quad.easeIn',
        onUpdate: () => {
          if (Math.random() < 0.5) return;
          const p = this.add.image(orb.x, orb.y, 'p-spark').setDepth(D_FLOAT - 3).setBlendMode(Phaser.BlendModes.ADD);
          this.tweens.add({ targets: p, alpha: 0, y: p.y + 3, duration: 300, onComplete: () => p.destroy() });
        },
        onComplete: () => { orb.destroy(); land(); },
      });
    } else {
      const sl = this.add.image(tx - 2, ty, 'fx-slash').setDepth(D_FLOAT - 2).setAngle(-30 + Math.random() * 60).setBlendMode(Phaser.BlendModes.ADD);
      if (key === 'spear' || key === 'dagger') sl.setScale(0.7, 0.45);
      this.tweens.add({ targets: sl, alpha: 0, scale: sl.scaleX * 1.3, duration: 200, onComplete: () => sl.destroy() });
      this.time.delayedCall(60, land);
    }
  }

  /** 怪物出手：打中主角就闪红、往后一顿、飘红字；没打中飘「闪避」 */
  private monsterSwingFx(dmg: number, art?: string, foe?: Phaser.GameObjects.Sprite, m?: MonsterDef) {
    // 飘在主角头顶血条上面，不压住名字
    const x = this.player.x - 6;
    const y = this.player.y - 36;
    // 精英、首领的大招和首领狂怒：在怪头上喊出来
    const world = art === 'world' && m ? WORLD_SKILL[m.id] : undefined;
    const shout = world ? `${world.name}！` : art === 'enrage' ? '狂怒！' : art === 'boss' ? MONSTER_MOVES.boss.name : art === 'elite' ? MONSTER_MOVES.elite.name : '';
    if (world && foe?.active && m) this.worldSkillFx(m, foe);
    if (shout && foe?.active) {
      this.popText(foe.x, foe.y - (world ? 72 : 30), shout, world ? '#ff5a3a' : art === 'enrage' ? '#ff3a3a' : '#ff8a5a', world ? 13 : art === 'elite' ? 8 : 10);
      if (art !== 'elite' && dmg > 0) this.cameras.main.shake(160, 0.004);
    }
    if (dmg < 0) return this.popText(x - 4, y, '闪避', '#9ad8ff', 7);
    if (dmg === 0) return;
    this.hitFlash(this.playerBody, -1, 0xff5040);
    this.popText(x - 4, y, `-${dmg}`, '#ff5a4a', 8);
    if (store.state.hp < maxHp(store.state) * 0.25) this.cameras.main.flash(120, 120, 0, 0);
  }

  /** 世界首领的大招：场景里再配一层特效，和精灵表里画好的大招动作一起播 */
  private worldSkillFx(m: MonsterDef, foe: Phaser.GameObjects.Sprite) {
    const px = this.player.x;
    const py = this.player.y - 6;
    const D = D_FLOAT - 2;
    const glow = (x: number, y: number, tint: number, scale: number) =>
      this.add.image(x, y, 'glow').setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setDepth(D).setScale(scale);
    const burst = (x: number, y: number, tint: number) => {
      const h = this.add.image(x, y, 'fx-hit').setTint(tint).setDepth(D).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: h, scale: 2.4, alpha: 0, angle: 60, duration: 320, onComplete: () => h.destroy() });
      for (let k = 0; k < 5; k++) {
        const a = Math.random() * Math.PI * 2;
        const p = this.add.image(x, y, 'p-smoke').setDepth(D - 1).setAlpha(0.6).setScale(0.5);
        this.tweens.add({ targets: p, x: x + Math.cos(a) * 10, y: y + Math.sin(a) * 4 - 3, alpha: 0, scale: 1.2, duration: 500, onComplete: () => p.destroy() });
      }
    };
    switch (m.event ? 'pumpkin' : m.id) {
      case 'pumpkin': {
        // 南瓜炸弹：一串南瓜灯从天上落下来，落地炸出橙紫两色的火花
        for (let k = 0; k < 5; k++) {
          const tx = px + (Math.random() - 0.5) * 34;
          const ty = py + (Math.random() - 0.5) * 12;
          const ball = glow(tx, ty - 120, 0xff8a10, 0.22).setAlpha(0);
          const wisp = glow(tx, ty - 126, 0xa050ff, 0.12).setAlpha(0);
          this.tweens.add({
            targets: [ball, wisp], y: `+=${120}`, alpha: 1, delay: 380 + k * 150, duration: 420, ease: 'Quad.easeIn',
            onComplete: () => { ball.destroy(); wisp.destroy(); burst(tx, ty, k % 2 ? 0xa050ff : 0xff8a20); this.cameras.main.shake(70, 0.003); },
          });
        }
        break;
      }
      case 'wb_flame_dragon': {
        // 天火流星：一串火球从天上斜着砸下来
        for (let k = 0; k < 7; k++) {
          const tx = px + (Math.random() - 0.5) * 40;
          const ty = py + (Math.random() - 0.5) * 14;
          const ball = glow(tx + 50, ty - 140, 0xff6a1a, 0.35).setAlpha(0);
          this.tweens.add({
            targets: ball, x: tx, y: ty, alpha: 1, delay: 300 + k * 120, duration: 360, ease: 'Quad.easeIn',
            onUpdate: () => {
              if (Math.random() < 0.4) return;
              const e = this.add.image(ball.x, ball.y, 'p-spark').setTint(0xffc040).setDepth(D - 1).setBlendMode(Phaser.BlendModes.ADD);
              this.tweens.add({ targets: e, alpha: 0, y: e.y - 4, duration: 260, onComplete: () => e.destroy() });
            },
            onComplete: () => { ball.destroy(); burst(tx, ty, 0xff8a2a); this.cameras.main.shake(80, 0.003); },
          });
        }
        break;
      }
      case 'wb_soul_tree': {
        // 噬魂缠根：脚下紫圈收紧，魂火从主角身上被吸回魔树
        const ring = this.add.ellipse(px, this.player.y, 60, 20).setStrokeStyle(2, 0xc070ff, 0.9).setDepth(D);
        this.tweens.add({ targets: ring, scaleX: 0.3, scaleY: 0.3, alpha: 0.2, duration: 700, ease: 'Quad.easeIn', onComplete: () => ring.destroy() });
        for (let k = 0; k < 5; k++) {
          const orb = glow(px + (Math.random() - 0.5) * 10, py - Math.random() * 10, 0xc070ff, 0.16);
          this.tweens.add({
            targets: orb, x: foe.x, y: foe.y - 40, delay: 500 + k * 110, duration: 600, ease: 'Sine.easeInOut',
            onComplete: () => orb.destroy(),
          });
        }
        break;
      }
      case 'wb_frost_colossus': {
        // 永冬崩裂：冰刺从魔像脚下一路炸到主角身上，画面泛白
        const n = 6;
        for (let k = 0; k < n; k++) {
          const q = (k + 1) / n;
          const x = foe.x + (px - foe.x) * q;
          const y = foe.y + (this.player.y - foe.y) * q;
          this.time.delayedCall(350 + k * 70, () => {
            const sp = glow(x, y - 6, 0xbfeaff, 0.12).setScale(0.08, 0.35);
            this.tweens.add({ targets: sp, alpha: 0, scaleY: 0.5, duration: 450, onComplete: () => sp.destroy() });
            burst(x, y - 2, 0xe0f8ff);
          });
        }
        this.time.delayedCall(800, () => this.cameras.main.flash(180, 200, 230, 255));
        break;
      }
      case 'wb_thunder_roc': {
        // 天罚雷霆：三道闪电劈在主角附近
        for (let k = 0; k < 3; k++) {
          this.time.delayedCall(350 + k * 200, () => {
            const g = this.add.graphics().setDepth(D).setBlendMode(Phaser.BlendModes.ADD);
            const tx = px + (k - 1) * 14 + (Math.random() - 0.5) * 6;
            let x = tx + (Math.random() - 0.5) * 20;
            let y = py - 150;
            const pts: [number, number][] = [[x, y]];
            while (y < py) {
              y = Math.min(py, y + 14 + Math.random() * 10);
              x = y >= py ? tx : x + (Math.random() - 0.5) * 16;
              pts.push([x, y]);
            }
            for (const [w, c, a] of [[5, 0xfff060, 0.45], [2, 0xffffff, 1]] as const) {
              g.lineStyle(w, c, a).beginPath().moveTo(pts[0][0], pts[0][1]);
              for (const [ax, ay] of pts.slice(1)) g.lineTo(ax, ay);
              g.strokePath();
            }
            this.tweens.add({ targets: g, alpha: 0, duration: 260, onComplete: () => g.destroy() });
            burst(tx, py, 0xfff060);
            this.cameras.main.flash(70, 255, 250, 200);
          });
        }
        break;
      }
      case 'wb_void_eye': {
        // 虚无凝视：瞳孔射出一道粉紫光束打在主角身上
        const ey = foe.y - 52;
        const dx = px - foe.x;
        const dy = py - ey;
        const len = Math.hypot(dx, dy);
        const beam = this.add.rectangle(foe.x, ey, len, 8, 0xff40a0, 0.75).setOrigin(0, 0.5).setRotation(Math.atan2(dy, dx))
          .setBlendMode(Phaser.BlendModes.ADD).setDepth(D).setScale(1, 0);
        const core = this.add.rectangle(foe.x, ey, len, 2, 0xffffff, 1).setOrigin(0, 0.5).setRotation(Math.atan2(dy, dx)).setDepth(D).setScale(1, 0);
        this.tweens.add({ targets: [beam, core], scaleY: 1, delay: 380, duration: 120, yoyo: true, hold: 520, onComplete: () => { beam.destroy(); core.destroy(); } });
        this.time.delayedCall(500, () => { burst(px, py, 0xff60c0); this.cameras.main.shake(200, 0.004); });
        break;
      }
    }
  }

  /** 受击：整张图闪一下纯色，并往后退两像素再弹回 */
  private hitFlash(spr: Phaser.GameObjects.Sprite, dir: number, color = 0xffffff) {
    spr.setTintFill(color);
    this.time.delayedCall(70, () => spr.active && spr.clearTint());
    const x0 = spr.getData('x0') ?? spr.x;
    spr.setData('x0', x0);
    this.tweens.add({ targets: spr, x: x0 + dir * 2, duration: 50, yoyo: true, onComplete: () => spr.active && spr.setX(x0) });
  }

  /** 弹跳的伤害数字：先往上蹦，再落一点淡出 */
  private popText(x: number, y: number, text: string, color: string, size: number) {
    const t = this.add.text(x + (Math.random() - 0.5) * 4, y, text, {
      fontFamily: FONT, fontSize: `${size}px`, fontStyle: 'bold', color, stroke: '#000', strokeThickness: 2, resolution: 4,
    }).setOrigin(0.5).setDepth(D_FLOAT).setScale(0.6);
    this.tweens.add({ targets: t, scale: 1, y: y - 10, duration: 180, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, y: y - 16, alpha: 0, delay: 500, duration: 450, onComplete: () => t.destroy() });
  }

  /** 怪物倒下：一圈烟尘 */
  private deathPuff(foe: Phaser.GameObjects.Sprite) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const p = this.add.image(foe.x, foe.y - 2, 'p-smoke').setDepth(D_FLOAT - 3).setAlpha(0.7).setScale(0.6);
      this.tweens.add({ targets: p, x: foe.x + Math.cos(a) * 12, y: foe.y - 2 + Math.sin(a) * 5, alpha: 0, scale: 1.3, duration: 500, onComplete: () => p.destroy() });
    }
  }

  /** 钓鱼的水在哪边：从站的地方往四个方向找最近的水 */
  private waterDir(): 'left' | 'right' | 'up' | 'down' | undefined {
    const me = this.playerTile();
    const wet = (x: number, y: number) => FISH_WATER.has(GROUNDS[groundIndex(x, y)]);
    for (let r = 1; r <= 4; r++) {
      this.waterDist = r;
      if (wet(me.x, me.y - r)) return 'up';
      if (wet(me.x + r, me.y)) return 'right';
      if (wet(me.x - r, me.y)) return 'left';
      if (wet(me.x, me.y + r)) return 'down';
    }
    return undefined;
  }
  private waterDist = 1;

  /** 背对 / 面朝镜头钓鱼：竿从手里伸出去，鱼线垂到水里，浮漂一沉一浮 */
  private fishGfx?: Phaser.GameObjects.Graphics;
  private fishTimer?: Phaser.Time.TimerEvent;
  private drawFishLine(dir: 'up' | 'down') {
    this.clearFishLine();
    const g = this.add.graphics();
    this.fishGfx = g;
    const sgn = dir === 'up' ? -1 : 1;
    let t = 0;
    const draw = () => {
      g.clear();
      const px = Math.round(this.player.x);
      const py = Math.round(this.player.y);
      // 手的位置：举竿时在肩膀上方
      const hx = px + 3;
      const hy = py - (dir === 'up' ? 17 : 13);
      const tipX = px + 7;
      const tipY = hy + sgn * 13 - (dir === 'down' ? 4 : 0);
      const bob = Math.sin(t * 0.25) > 0.7 ? 1 : 0;
      const bx = px + 9;
      // 浮漂落在最近那格水再往里一格
      const by = py + sgn * (this.waterDist + 0.4) * T + bob;
      g.lineStyle(1.2, 0x5a3c22, 1).lineBetween(hx, hy, tipX, tipY);
      g.lineStyle(0.6, 0xd8dce0, 0.9).lineBetween(tipX, tipY, bx, by - 1);
      g.fillStyle(0xe04a4a, 1).fillRect(bx - 1, by - 1, 2, 2);
      g.fillStyle(0xffffff, 1).fillRect(bx - 1, by - 2, 2, 1);
      // 水波：一圈淡淡的涟漪
      g.lineStyle(0.5, 0xffffff, 0.35 + (bob ? 0.2 : 0)).strokeEllipse(bx, by + 0.5, 6 + (t % 8), 2.5 + (t % 8) * 0.3);
      g.setDepth(dir === 'up' ? this.player.depth - 1 : this.player.depth + 1);
      t++;
    };
    draw();
    this.fishTimer = this.time.addEvent({ delay: 120, loop: true, callback: draw });
  }

  private clearFishLine() {
    this.fishTimer?.remove();
    this.fishTimer = undefined;
    this.fishGfx?.destroy();
    this.fishGfx = undefined;
  }

  private stopWorking() {
    this.clearFishLine();
    this.working = false;
    this.foe?.destroy();
    this.foe = undefined;
    this.workTween?.stop();
    this.idle();
  }

  private idle() {
    this.heroAnim('idle');
  }

  // ───────── 坐骑 ─────────
  private wolfBack!: Phaser.GameObjects.Sprite;
  private wolfFront!: Phaser.GameObjects.Sprite;
  private heroName!: Phaser.GameObjects.Text;
  private heroHp!: [Phaser.GameObjects.Rectangle, Phaser.GameObjects.Rectangle];
  private lastHp?: number;

  /** 主角头顶血条，吃东西回血时飘绿字 */
  private updateHeroHp() {
    const s = store.state;
    const max = maxHp(s);
    const a = this.currentAction ? ACTIONS[this.currentAction] : undefined;
    const show = (this.working && a?.kind === 'combat') || s.hp < max;
    const r = Math.max(0, Math.min(1, s.hp / max));
    const [bg, fill] = this.heroHp;
    bg.setVisible(show);
    fill.setVisible(show).setScale(r, 1).setFillStyle(r < 0.3 ? 0xe8161a : r < 0.6 ? 0xe8b84a : 0x5ad04a);
    // 一下回了很多血 = 吃了东西或喝了药（自然回血每次只有一点点）
    if (this.lastHp !== undefined && s.hp - this.lastHp >= Math.max(3, max * 0.04) && this.working) {
      this.popText(this.player.x + 10, this.player.y - 34, `+${s.hp - this.lastHp}`, '#7aff6a', 8);
    }
    this.lastHp = s.hp;
  }
  private working = false;
  /** 画面上的坐骑状态：没召唤 / 骑着 / 在旁边坐着等（干活、战斗时） */
  private mountMode: 'none' | 'ride' | 'beside' = 'none';
  private mountBusy = false;
  private mountMult = 1;

  /** 骑手坐在狼背上的位置（相对脚底，侧面按朝右算） */
  private seat(dir: HeroDir) {
    // 马背比狼背高
    const up = this.mk === 'wolf' ? 0 : 5;
    return dir === 'side' ? { x: -3, y: -16 - up } : dir === 'down' ? { x: 0, y: -19 - up } : { x: 0, y: -17 - up };
  }

  /** 当前坐骑的种类：狼 wolf，马按毛色 horse0…horse3（用户 10-24 加了坐骑马） */
  private mk = 'wolf';
  private mountKind(id = store.state.equipment.mount) {
    const apt = aptOf(id);
    return apt ? horseKind(coatOf(apt)) : 'wolf';
  }
  /** 第一次用到某种坐骑时才画它的精灵表；动画名 mount:<种类>-<动作>-<层> */
  private ensureMount(kind: string) {
    const tex = `mount-${kind}`;
    if (this.textures.exists(tex)) return;
    const horse = kind !== 'wolf';
    const sheet = horse ? paintHorseSheet(Number(kind.slice(5))) : paintWolfSheet();
    const t = this.textures.addCanvas(tex, sheet.canvas)!;
    for (const f of sheet.frames) t.add(f.name, 0, f.x, f.y, WOLF_W, WOLF_H);
    const list = horse ? HORSE_ANIMS : WOLF_ANIMS.map((a) => ({ ...a, key: a.key.slice(5) }));
    for (const a of list) {
      for (const layer of ['b', 'f']) {
        const key = `mount:${kind}-${a.key}-${layer}`;
        if (this.anims.exists(key)) continue;
        this.anims.create({
          key, frameRate: a.rate, repeat: a.key === 'howl' ? 0 : -1,
          frames: Array.from({ length: a.frames }, (_, i) => ({ key: tex, frame: `${kind}-${a.key}-${i}-${layer}` })),
        });
      }
    }
  }

  private playWolf(key: string) {
    this.wolfBack.play(`mount:${this.mk}-${key}-b`, true);
    this.wolfFront.play(`mount:${this.mk}-${key}-f`, true);
  }
  /** 坐骑在旁边等的时候离人多远（马比狼大） */
  private get besideX() {
    return this.mk === 'wolf' ? -22 : -26;
  }

  /** 按当前状态播放走路、待机动画（骑着时人和狼一起） */
  private heroAnim(kind: 'walk' | 'idle') {
    const dir = this.facing;
    const tps = this.walker ? this.walker.speed / T : WALK_TILES_PER_SEC;
    if (this.mountBusy) return;
    if (this.mountMode !== 'ride') {
      if (kind === 'idle') {
        // 连续点地面走时两段路之间会先调一次待机：等一小会儿还没接着走才真的停下，步子不会从头开始
        if (!this.idleAt) this.idleAt = this.time.now + 150;
        if (this.time.now < this.idleAt) return;
        this.idleAt = 0;
        this.playerBody.anims.timeScale = 1;
        this.playerBody.play(`idle-${dir}`, true);
        return;
      }
      this.idleAt = 0;
      this.playerBody.anims.timeScale = tps / WALK_TILES_PER_SEC;
      // 转向时接着当前的步子走
      const prev = this.playerBody.anims.currentAnim?.key ?? '';
      const p = prev.startsWith('walk-') && prev !== `walk-${dir}` ? this.playerBody.anims.getProgress() : 0;
      this.playerBody.play(`walk-${dir}`, true);
      if (p > 0) this.playerBody.anims.setProgress(p);
      return;
    }
    const flip = dir === 'side' && this.playerBody.flipX;
    const seat = this.seat(dir);
    this.playerBody.setPosition(flip ? -seat.x : seat.x, 7 + seat.y);
    for (const w of [this.wolfBack, this.wolfFront]) w.setPosition(0, 7).setFlipX(flip);
    // 侧面：骑手画在整只狼前面（看得到跨在狼背上的腿）；正面、背面：夹在两层中间
    if (dir === 'side') this.player.moveAbove(this.playerBody, this.wolfFront);
    else this.player.moveBelow(this.playerBody, this.wolfFront);
    this.heroName.setY(7 - HERO_FEET + 1 + seat.y);
    if (kind === 'walk') {
      this.idleAt = 0;
      const ts = tps / (WALK_TILES_PER_SEC * 2);
      this.playerBody.anims.timeScale = this.wolfBack.anims.timeScale = this.wolfFront.anims.timeScale = ts;
      // 转向时接着当前的步子跑，不从第一帧重来
      const prev = this.wolfFront.anims.currentAnim?.key ?? '';
      const p = prev.includes('-run-') ? this.wolfFront.anims.getProgress() : 0;
      const changed = !prev.includes(`${this.mk}-run-${dir}`);
      this.playerBody.play(`ride-${dir}`, true);
      this.playWolf(`run-${dir}`);
      if (changed && p > 0) {
        for (const w of [this.wolfBack, this.wolfFront]) w.anims.setProgress(p);
      }
    } else {
      // 连续点地面走时，两段路之间会先调一次待机：等一小会儿还没接着走才真的停下，免得步子从头开始
      if (!this.idleAt) this.idleAt = this.time.now + 150;
      if (this.time.now < this.idleAt) return;
      this.idleAt = 0;
      this.playerBody.anims.timeScale = this.wolfBack.anims.timeScale = this.wolfFront.anims.timeScale = 1;
      this.playerBody.play(`rideidle-${dir}`, true);
      this.playWolf(`idle-${dir}`);
    }
  }

  private idleAt = 0;

  /** 骑着时：骑手跟着狼背起伏；延后的待机到点了就停下 */
  private stepRider() {
    if (this.mountBusy) return;
    if (this.idleAt && !this.walker && !this.working && this.time.now >= this.idleAt) this.heroAnim('idle');
    if (this.mountMode !== 'ride') return;
    const name = (this.wolfFront.anims.currentFrame?.frame.name ?? '') as string;
    const m = /^([a-z]+\d?)-(.+)-(\d+)-f$/.exec(name);
    const dy = !m ? 0 : m[1] === 'wolf' ? wolfSaddle(`wolf-${m[2]}`, +m[3]) : horseSaddle(m[2], +m[3]);
    const seat = this.seat(this.facing);
    this.playerBody.y = 7 + seat.y + dy;
  }

  /** 人回到地上（脚底在容器原点） */
  private heroGround() {
    this.playerBody.setPosition(0, 7);
    this.heroName.setY(7 - HERO_FEET + 1);
    this.player.moveBelow(this.playerBody, this.wolfFront);
  }

  /** 狼在主角左边坐着等 */
  private wolfSitBeside() {
    for (const w of [this.wolfBack, this.wolfFront]) w.setVisible(true).setAlpha(1).setPosition(this.besideX, 5).setFlipX(false);
    this.wolfBack.anims.timeScale = this.wolfFront.anims.timeScale = 1;
    this.playWolf('sit');
    // 坐在旁边的狼整只画在人后面
    this.player.moveAbove(this.playerBody, this.wolfFront);
  }

  private puff(x: number, y: number) {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const p = this.add.image(this.player.x + x, this.player.y + y, 'p-smoke').setDepth(D_FLOAT - 3).setAlpha(0.85).setScale(0.8);
      this.tweens.add({
        targets: p, x: p.x + Math.cos(a) * 14, y: p.y + Math.sin(a) * 7 - 6, alpha: 0, scale: 1.8,
        duration: 520 + i * 20, ease: 'Quad.easeOut', onComplete: () => p.destroy(),
      });
    }
  }

  /** 人跳一下：从 (x0,y0) 跳到 (x1,y1)，跳完回调 */
  private hop(x1: number, y1: number, done: () => void) {
    const x0 = this.playerBody.x;
    const y0 = this.playerBody.y;
    this.playerBody.anims.timeScale = 1;
    this.playerBody.play('jump-side', true);
    if (x1 !== x0) this.playerBody.setFlipX(x1 < x0);
    const o = { t: 0 };
    this.tweens.add({
      targets: o, t: 1, duration: 380, ease: 'Sine.easeInOut',
      onUpdate: () => this.playerBody.setPosition(x0 + (x1 - x0) * o.t, y0 + (y1 - y0) * o.t - Math.sin(o.t * Math.PI) * 12),
      onComplete: done,
    });
  }

  /** 每帧对一下：存档里骑没骑、现在是不是在干活，画面跟着换状态（带上下坐骑的动作） */
  private syncMount() {
    const st = store.state;
    const mult = moveSpeed(st) / WALK_TILES_PER_SEC;
    if (mult !== this.mountMult) {
      // 路走到一半上下坐骑：剩下的路按新速度走
      if (this.walker) this.walker.speed *= mult / this.mountMult;
      this.mountMult = mult;
      setSpeedMultiplier(mult);
    }
    if (this.mountBusy) return;
    // 换了坐骑（狼换马、换了一匹马）：换精灵表，正在骑/在旁边等的话马上换成新的
    const kind = this.mountKind();
    if (kind !== this.mk) {
      this.ensureMount(kind);
      this.mk = kind;
      if (this.mountMode === 'ride') { this.heroAnim(this.walker ? 'walk' : 'idle'); this.stepRider(); }
      else if (this.mountMode === 'beside') this.wolfSitBeside();
    }
    const want = st.mounted && st.equipment.mount ? (this.working ? 'beside' : 'ride') : 'none';
    if (want === this.mountMode) return;
    const from = this.mountMode;
    this.mountMode = want;
    this.mountBusy = true;
    const finish = () => {
      this.mountBusy = false;
      if (this.mountMode === 'ride') this.heroAnim(this.walker ? 'walk' : 'idle');
      else if (this.mountMode === 'beside') {
        this.heroGround();
        this.wolfSitBeside();
        this.playerBody.setFlipX(false);
        this.playerBody.play(this.workAnim(), true);
      } else {
        this.heroGround();
        if (this.working) this.playerBody.play(this.workAnim(), true);
        else this.heroAnim(this.walker ? 'walk' : 'idle');
      }
    };
    const wolves = [this.wolfBack, this.wolfFront];
    if (want === 'none') {
      // 下坐骑：从狼背上跳下来，狼化成一团烟
      const off = () => {
        this.puff(this.wolfBack.x, 0);
        this.tweens.add({ targets: wolves, alpha: 0, duration: 300, onComplete: () => { wolves.forEach((w) => w.setVisible(false)); finish(); } });
      };
      if (from === 'ride') {
        this.heroName.setY(7 - HERO_FEET + 1);
        this.hop(14, 7, () => {
          this.player.setPosition(this.player.x + 14, this.player.y);
          for (const w of wolves) w.x -= 14;
          this.playerBody.setPosition(0, 7);
          off();
        });
      } else off();
      return;
    }
    if (from === 'none') {
      // 召唤：烟里冒出来，仰头长嚎一声
      for (const w of wolves) w.setVisible(true).setAlpha(0).setPosition(this.besideX, 7).setFlipX(false);
      this.player.moveAbove(this.playerBody, this.wolfFront);
      this.puff(this.besideX, 0);
      this.wolfBack.anims.timeScale = this.wolfFront.anims.timeScale = 1;
      this.playWolf('howl');
      this.tweens.add({ targets: wolves, alpha: 1, duration: 250 });
      this.time.delayedCall(want === 'ride' ? 900 : 700, () => {
        if (want === 'beside') return finish();
        this.mountUp(finish);
      });
      return;
    }
    if (from === 'beside' && want === 'ride') return this.mountUp(finish);
    // 骑着 → 开始干活：跳下来，狼走到旁边坐下
    this.heroName.setY(7 - HERO_FEET + 1);
    this.tweens.add({ targets: wolves, x: this.besideX, duration: 380 });
    this.hop(0, 7, finish);
  }

  /** 跳上狼背：狼在左边，人跳过去，然后整体挪回原位 */
  private mountUp(done: () => void) {
    const wx = this.wolfBack.x;
    this.playerBody.setPosition(0, 7);
    this.player.moveAbove(this.playerBody, this.wolfFront);
    this.wolfBack.anims.timeScale = this.wolfFront.anims.timeScale = 1;
    this.playWolf('idle-side');
    const seat = this.seat('side');
    this.hop(wx + seat.x, 7 + seat.y, () => {
      // 人和狼一起挪回容器原点（狼往前走一小步）
      const shift = -wx;
      this.tweens.add({ targets: [this.wolfBack, this.wolfFront], x: 0, duration: 260 });
      this.tweens.add({ targets: this.playerBody, x: this.playerBody.x + shift, duration: 260, onComplete: () => {
        this.facing = 'side';
        this.playerBody.setFlipX(false);
        done();
      } });
    });
  }

  /** 当前任务对应的动作动画 */
  private workAnim(): string {
    const a = this.currentAction ? ACTIONS[this.currentAction] : undefined;
    if (!a) return `idle-${this.facing}`;
    if (a.kind === 'combat') {
      const w = store.state.equipment.weapon ?? '';
      const key = w.slice(w.indexOf('_') + 1);
      if (key === 'spear' || key === 'dagger') return `fight-${key}`;
      if (['shortbow', 'longbow', 'crossbow'].includes(key)) return 'fight-bow';
      if (key === 'staff') return 'fight-staff';
      return 'fight-sword';
    }
    const bySkill: Partial<Record<string, string>> = {
      mining: 'work-mine', woodcutting: 'work-chop', fishing: 'work-fish', hunting: 'work-skin', thieving: 'work-steal',
    };
    if (a.skill === 'gathering') return 'work-gather';
    if (a.skill === 'farming') return 'work-farm';
    return bySkill[a.skill] ?? 'work-craft';
  }

  private startWorking() {
    const a = this.currentAction ? ACTIONS[this.currentAction] : undefined;
    if (!a || this.manual) return;
    if (a.kind === 'combat') {
      const m = MONSTERS[a.monster];
      const gap = Math.max(26, monsterFrameSize(m) * monScale(m) * (big96(m) ? 0.4 : 0.55));
      this.foe = this.monSprite(m, this.player.x + gap, this.player.y + 7).setFlipX(true);
      this.foe.setDepth(this.foe.y + 1000);
      this.foeSeen = undefined;
      // 普通怪平时不挂血条，正在打的这只也挂一条，看得出还剩多少血
      if (!this.bars.some((b) => b.spr === this.foe)) this.addBar(this.foe, m);
      const bar = this.bars.find((b) => b.spr === this.foe);
      if (bar) bar.live = true;
      if (m.rank === 'boss') {
        this.game.events.emit(BOSS_BANNER, m.name, m.event ? 'event' : !!m.world);
        this.cameras.main.shake(big96(m) ? 500 : 300, big96(m) ? 0.007 : 0.004);
      }
    }
    // 干活时侧身朝右（怪物也站在右边）；钓鱼朝着水
    this.working = true;
    this.facing = 'side';
    this.playerBody.setFlipX(false);
    this.playerBody.anims.timeScale = 1;
    const fishTo = a.kind === 'skill' && a.skill === 'fishing' ? this.waterDir() : undefined;
    if (fishTo === 'left') this.playerBody.setFlipX(true);
    if (this.mountMode === 'ride' || this.mountBusy) return;
    if (fishTo === 'up' || fishTo === 'down') {
      this.facing = fishTo;
      this.playerBody.play(`work-fish-${fishTo}`, true);
      this.drawFishLine(fishTo);
      return;
    }
    this.playerBody.play(this.workAnim(), true);
  }

  private float(text: string, color: string, big = false) {
    const t = this.add
      .text(this.player.x, this.player.y - 26, text, {
        fontFamily: FONT, fontSize: big ? '10px' : '7px', color, stroke: '#000', strokeThickness: 2, resolution: 4,
      })
      .setOrigin(0.5)
      .setDepth(D_FLOAT);
    this.tweens.add({ targets: t, y: t.y - 16, alpha: 0, duration: big ? 2200 : 1200, onComplete: () => t.destroy() });
  }

  private showGain(s: Summary) {
    if (s.waystones?.length) this.stonesUnlocked(s.waystones);
    const gained = Object.entries(s.items).filter(([id, q]) => q > 0 && id !== 'coins');
    if (gained.length) {
      const [item, qty] = gained[0];
      this.float(`+${qty} ${ITEMS[item].name}`, '#ffffff');
    } else if (s.items.coins > 0) {
      this.float(`+${s.items.coins} 金币`, '#ffd25e');
    }
    for (const lu of s.levelUps) this.float(`${SKILLS[lu.skill].name} 升到 ${lu.level} 级！`, '#ffd25e', true);
  }
}

/** 判断地图上一格能否走（世界地图点击用） */
export { isWalkable };
