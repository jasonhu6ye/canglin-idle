import Phaser from 'phaser';
import { NODES, WALK_TILES_PER_SEC } from '../core/data';
import {
  buildDef, canPlace, collectHome, homeCan, homePlotCells, produceReady, homePlots, HOME_PORTAL, HOME_SPAWN, homeSize, ISLAND, ISLAND_C, islandGround, leaveHome, placeBuild, removeAt, thingGrid,
} from '../core/home';
import { CROP_DEFS, CROPS, ITEMS } from '../core/data';
import { fieldOfPlot, pickSeed, plotGrowth, plotPhase, tendPlot } from '../core/farm';
import { cropTex, glintTex, soilTex } from './farmArt';
import type { HomeThing } from '../core/types';
import { gameHour } from '../core/weather';
import { store } from '../store';
import { darkness } from './ambience';
import { DPR } from './dpr';
import { FRAME_H, HERO_FEET, HERO_PAD, type HeroDir } from './hero';
import { paintFloor, paintPedestal, paintPortal, paintPortalSwirl, paintThing, paintWall, PORTAL_H, UP } from './homeArt';
import { liquidIndex, T, tileIndex, VARIANTS } from './tiles';
import { GROUNDS, LIQUIDS, type PropKind } from './world';
import { paintProp } from './art';
import { tl } from '../i18n';

/** 岛上用的工具：建造某件东西 / 拆除 / 无（走路） */
export type HomeTool = { kind: 'build'; id: string } | { kind: 'demolish' } | null;
export const HOME_TOOL = 'home-tool';
/** 场景 → 界面：点了岛上的制作台、储物箱（地点 id），或者建造失败的原因 */
export const HOME_CLICK = 'home-click';
export const HOME_MSG = 'home-msg';

/** 物品图标的图片地址（界面那边注册进来，战利品摆件用） */
export const homeIcons = { url: (_id: string): string | undefined => undefined };

const DRAG = 8;
const FONT = '"PingFang SC","Microsoft YaHei",sans-serif';
const SPEED = WALK_TILES_PER_SEC * 2;

const k = (x: number, y: number) => `${x},${y}`;
const hash = (x: number, y: number, salt = 0) => {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/**
 * 家园岛屿（用户 10-23）：从城里的传送门进来的一座海岛，自己盖房子。
 * 地面复用大地图的图集；墙、地板、家具都是 homeArt 里逐像素画的。
 */
export class IslandScene extends Phaser.Scene {
  constructor() {
    super('island');
  }

  private player!: Phaser.GameObjects.Container;
  private body!: Phaser.GameObjects.Sprite;
  private facing: HeroDir = 'down';
  private walker?: { pts: { x: number; y: number }[]; i: number };
  private groundLayer?: Phaser.Tilemaps.Tilemap;
  private decor: Phaser.GameObjects.Image[] = [];
  private sizeDrawn = 0;
  private objs: Phaser.GameObjects.GameObject[] = [];
  private lamps: Phaser.GameObjects.Image[] = [];
  private sigThings?: HomeThing[];
  private sigFloors?: Record<string, string>;
  /** 家园农田的每格地：土、作物、熟了的闪光 */
  private cells: { id: string; soil: Phaser.GameObjects.Image; crop: Phaser.GameObjects.Image; glint: Phaser.GameObjects.Image; key: string }[] = [];
  private cellAt = new Map<string, string>();
  /** 会产出东西的建筑头顶的小图标：攒了东西才显示 */
  private bubbles: { t: HomeThing; img: Phaser.GameObjects.Image }[] = [];
  private tool: HomeTool = null;
  private ghost?: Phaser.GameObjects.Image;
  private ghostBox?: Phaser.GameObjects.Graphics;
  private painted = new Set<string>();
  private night!: Phaser.GameObjects.Rectangle;
  private keys?: Record<string, Phaser.Input.Keyboard.Key>;
  private following = true;
  private unsub: (() => void)[] = [];
  private leaving = false;
  /** 正在岛上制作台干的活；玩家自己走开了就不再自动走回去，换了活才重新走 */
  private workFor?: string;
  private workManual = false;
  private workSpot?: { x: number; y: number; faceLeft: boolean } | null;

  create() {
    this.cameras.main.setBackgroundColor('#1a4a6a');
    this.makeTextures();
    this.drawGround();
    this.addPortal();
    const start = HOME_SPAWN;
    this.player = this.add.container(start.x * T + T / 2, start.y * T + T / 2);
    const ring = this.add.ellipse(0, 6, 14, 6).setStrokeStyle(1, 0xe8b84a).setFillStyle(0xe8b84a, 0.25);
    this.body = this.add.sprite(0, 7, 'hero').setOrigin(0.5, (HERO_FEET + HERO_PAD.t) / FRAME_H);
    this.body.play('idle-down');
    const name = this.add.text(0, 7 - HERO_FEET + 1, tl('[苍岭] 你'), { fontFamily: FONT, fontSize: '7px', color: '#ffffff', stroke: '#000', strokeThickness: 2, resolution: 4 }).setOrigin(0.5);
    this.player.add([ring, this.body, name]).setDepth(this.player.y + 1000);
    this.night = this.add.rectangle(0, 0, ISLAND * T, ISLAND * T, 0x0a1430, 0).setOrigin(0).setDepth(9e6);
    this.setupCamera();
    this.redraw(true);
    this.unsub.push(store.subscribe(() => this.onStore()));
    this.time.addEvent({ delay: 500, loop: true, callback: () => this.growCells() });
    const onTool = (t: HomeTool) => this.setTool(t);
    this.game.events.on(HOME_TOOL, onTool);
    this.unsub.push(() => this.game.events.off(HOME_TOOL, onTool));
    if (this.input.keyboard) this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT', false) as Record<string, Phaser.Input.Keyboard.Key>;
    // 每次从城里进来：站到传送门前，镜头对准
    this.events.on('wake', () => this.arrive());
    const cleanup = () => { this.unsub.forEach((u) => u()); this.unsub = []; };
    this.events.once('shutdown', cleanup);
    this.events.once('destroy', cleanup);
    this.arrive();
  }

  private arrive() {
    this.leaving = false;
    this.workFor = undefined;
    this.walker = undefined;
    this.player.setPosition(HOME_SPAWN.x * T + T / 2, HOME_SPAWN.y * T + T / 2);
    this.facing = 'down';
    this.body.play('idle-down', true);
    this.redraw(true);
    this.recenter(true);
    this.cameras.main.centerOn(this.player.x, this.player.y);
  }

  /** 存档变了：出岛了就切回大地图；扩建了重画地面；摆的东西变了重画 */
  private onStore() {
    // 睡着（人在城里）时什么都不做：在这里 switch 会把大地图场景整个重启，画面卡死
    if (!this.scene.isActive() || this.leaving) return;
    const h = store.state.home;
    if (!h?.inside) {
      this.setTool(null);
      // 同一帧里存档可能连着变好几次，只能切一次（第二次会把大地图重启）
      this.leaving = true;
      this.scene.switch('map');
      return;
    }
    this.redraw(false);
  }

  // ───────── 贴图 ─────────
  private makeTextures() {
    if (!this.textures.exists('home-portal')) this.textures.addCanvas('home-portal', paintPortal());
    if (!this.textures.exists('home-swirl')) this.textures.addCanvas('home-swirl', paintPortalSwirl());
    if (!this.textures.exists('home-pedestal')) this.textures.addCanvas('home-pedestal', paintPedestal());
  }
  private wallTex(id: string, mask: number) {
    const key = `hw-${id}-${mask}`;
    if (!this.textures.exists(key)) this.textures.addCanvas(key, paintWall(id, mask));
    return key;
  }
  private floorTex(id: string, x: number, y: number) {
    const v = `${x % 4}-${y % 4}`;
    const key = `hf-${id}-${v}`;
    if (!this.textures.exists(key)) this.textures.addCanvas(key, paintFloor(id, x % 4, y % 4));
    return key;
  }
  private thingTex(id: string) {
    const d = buildDef(id)!;
    const key = `ht-${id}`;
    if (!this.textures.exists(key)) this.textures.addCanvas(key, paintThing(id, d.w, d.h));
    return key;
  }
  /** 战利品摆件：石座上放物品图标（图标是界面那边画好的 data URL） */
  private trophyTex(itemId: string, url: string | undefined, then: () => void) {
    const key = `htr-${itemId}`;
    if (this.textures.exists(key) || !url) return key;
    const img = new Image();
    img.onload = () => {
      if (!this.textures.exists(key)) this.textures.addImage(key, img);
      then();
    };
    img.src = url;
    return key;
  }

  // ───────── 地面 ─────────
  private liquidIdx = new Map(LIQUIDS.map((g, i) => [GROUNDS.indexOf(g), i]));
  private drawGround() {
    const size = homeSize(store.state);
    if (size === this.sizeDrawn) return;
    this.sizeDrawn = size;
    this.groundLayer?.destroy();
    const gIdx = (x: number, y: number) => GROUNDS.indexOf(islandGround(x, y, size));
    const group = (g: number) => (GROUNDS[g] === 'ocean' ? 'water' : GROUNDS[g]);
    const data: number[][] = [];
    for (let y = 0; y < ISLAND; y++) {
      const row: number[] = [];
      for (let x = 0; x < ISLAND; x++) {
        const g = gIdx(x, y);
        const v = Math.floor(hash(x, y, 99) * VARIANTS);
        const li = this.liquidIdx.get(g);
        if (li === undefined) { row.push(tileIndex(g, v)); continue; }
        const me = group(g);
        const other = (nx: number, ny: number) => nx >= 0 && ny >= 0 && nx < ISLAND && ny < ISLAND && group(gIdx(nx, ny)) !== me;
        const mask = (other(x, y - 1) ? 1 : 0) | (other(x + 1, y) ? 2 : 0) | (other(x, y + 1) ? 4 : 0) | (other(x - 1, y) ? 8 : 0);
        row.push(mask ? liquidIndex(li, mask, v) : tileIndex(g, v));
      }
      data.push(row);
    }
    const map = this.make.tilemap({ data, tileWidth: T, tileHeight: T });
    const ts = map.addTilesetImage('tiles', 'tiles', T, T, 1, 2)!;
    map.createLayer(0, ts, 0, 0)!.setDepth(-10);
    this.groundLayer = map;
    // 草地上零星的草丛、野花，沙滩上的贝壳（只是装饰，铺了地板就盖住）
    this.decor.forEach((o) => o.destroy());
    this.decor = [];
    for (let y = 0; y < ISLAND; y++) for (let x = 0; x < ISLAND; x++) {
      const r = hash(x, y, 41);
      if (r > 0.03) continue;
      const g = islandGround(x, y, size);
      const kind: PropKind | null = g === 'grass' ? (r < 0.012 ? 'tuft' : r < 0.022 ? 'flowers' : 'fern') : g === 'sand' && r < 0.01 ? 'shell' : null;
      if (!kind) continue;
      const key = `prop-${kind}`;
      if (!this.textures.exists(key)) this.textures.addCanvas(key, paintProp(kind));
      this.decor.push(this.add.image(x * T + T / 2, (y + 1) * T, key).setOrigin(0.5, 1).setDepth(-6));
    }
  }

  private addPortal() {
    const cx = (HOME_PORTAL.x + HOME_PORTAL.w / 2) * T;
    const by = (HOME_PORTAL.y + HOME_PORTAL.h) * T;
    this.add.image(cx, by, 'home-portal').setOrigin(0.5, 1).setDepth(by + 1000);
    const swirl = this.add.image(cx, by - PORTAL_H + 22, 'home-swirl').setDepth(by + 999).setAlpha(0.95);
    this.tweens.add({ targets: swirl, angle: -360, duration: 4000, repeat: -1 });
    this.tweens.add({ targets: swirl, scale: 1.08, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.inOut' });
    this.add.image(cx, by - 24, 'glow').setTint(0x8a6af0).setBlendMode(Phaser.BlendModes.ADD).setDepth(by + 1001).setAlpha(0.5);
    this.add.text(cx, by - PORTAL_H - 4, tl('回城传送门'), { fontFamily: FONT, fontSize: '7px', color: '#e8d8ff', backgroundColor: '#1b120ccc', padding: { x: 3, y: 1 }, resolution: 4 })
      .setOrigin(0.5, 1).setDepth(9e5);
    this.add.zone(cx, by - 20, T * 3, T * 3).setInteractive({ useHandCursor: true }).setData('portal', true);
  }

  // ───────── 建造物 ─────────
  private redraw(force: boolean) {
    const h = store.state.home;
    this.drawGround();
    // 只比数量的话，拆一件再摆一件（数量不变）画面就不刷新：换成比对象本身（存档每次改都换新数组）
    if (!force && h?.things === this.sigThings && h?.floors === this.sigFloors) return;
    this.sigThings = h?.things;
    this.sigFloors = h?.floors;
    this.rebuild();
  }

  private rebuild() {
    this.objs.forEach((o) => o.destroy());
    this.objs = [];
    this.lamps = [];
    this.bubbles = [];
    this.workSpot = undefined;
    const h = store.state.home;
    if (!h) return;
    for (const [key, id] of Object.entries(h.floors)) {
      const [x, y] = key.split(',').map(Number);
      this.objs.push(this.add.image(x * T, y * T, this.floorTex(id, x, y)).setOrigin(0).setDepth(-5));
    }
    const walls = new Set<string>();
    for (const t of h.things) {
      const d = buildDef(t.id);
      if (d?.wall || d?.walk) walls.add(k(t.x, t.y));
    }
    for (const t of h.things) this.drawThing(t, walls);
    this.buildCells();
  }

  // ───────── 家园农田（10-27）：每块 4×4 格，和城里的田一样点地块种 / 浇水 / 收获 ─────────
  private buildCells() {
    this.cells = [];
    this.cellAt.clear();
    for (const t of homePlots(store.state)) for (const c of homePlotCells(t)) {
      const cx = c.x * T + T / 2;
      const soil = this.add.image(cx, c.y * T + T / 2, soilTex(this, 'empty')).setDepth(-3);
      const crop = this.add.image(cx, c.y * T + T + 1, cropTex(this, 'potato', 0)).setOrigin(0.5, 1).setDepth(c.y * T + T + 1000).setVisible(false);
      const glint = this.add.image(cx + 4, c.y * T + 3, glintTex(this)).setDepth(9e5).setVisible(false);
      this.objs.push(soil, crop, glint);
      this.cells.push({ id: c.id, soil, crop, glint, key: '' });
      this.cellAt.set(k(c.x, c.y), c.id);
    }
    this.growCells();
  }
  private growCells() {
    const now = Date.now();
    const home = store.state.home;
    for (const b of this.bubbles) b.img.setVisible(produceReady(home, b.t, now) > 0);
    const farm = store.state.farm ?? {};
    const blink = Math.floor(now / 500) % 2 === 0;
    for (const p of this.cells) {
      const plot = farm[p.id];
      const ph = plotPhase(plot, now);
      const stage = !plot ? -1 : ph === 'ripe' ? 3 : Math.min(2, Math.floor(plotGrowth(plot, now) * 3));
      const key = `${plot?.crop ?? ''}:${stage}:${plot?.water ? 1 : 0}`;
      p.glint.setVisible(ph === 'ripe' && blink);
      if (key === p.key) continue;
      p.key = key;
      p.crop.setScale(ph === 'ripe' ? 1.15 : 1);
      p.soil.setTexture(soilTex(this, !plot ? 'empty' : plot.water ? 'wet' : 'dry'));
      const known = !!plot && CROPS.some((c) => c[0] === plot.crop);
      p.crop.setVisible(known);
      if (known) p.crop.setTexture(cropTex(this, plot!.crop, stage));
    }
  }
  /** 点了一格地：空地种下、长着的浇水、熟了收获；什么都没变（浇过水了）就打开这块田的面板 */
  private tendCell(id: string) {
    const st = store.state;
    const field = fieldOfPlot(id)!;
    const p = st.farm?.[id];
    const ph = plotPhase(p, Date.now());
    const crop = p ? undefined : pickSeed(st, field);
    if (!p && !crop) {
      this.game.events.emit(HOME_MSG, tl('没有能种的种子'));
      this.game.events.emit(HOME_CLICK, field);
      return;
    }
    store.farm((g, t) => tendPlot(g, id, crop, t));
    if (store.state === st) { this.game.events.emit(HOME_CLICK, field); return; }
    this.growCells();
    if (ph === 'growing') this.game.events.emit(HOME_MSG, tl('浇水'));
    else if (ph === 'empty') this.game.events.emit(HOME_MSG, tl`种下 ${CROP_DEFS[crop!].name}`);
  }

  private drawThing(t: HomeThing, walls: Set<string>) {
    const d = buildDef(t.id);
    if (!d) return;
    const bx = t.x * T;
    const by = (t.y + d.h) * T;
    let img: Phaser.GameObjects.Image;
    if (d.wall) {
      const same = (x: number, y: number) => walls.has(k(x, y));
      const mask = (same(t.x, t.y - 1) ? 1 : 0) | (same(t.x + 1, t.y) ? 2 : 0) | (same(t.x, t.y + 1) ? 4 : 0) | (same(t.x - 1, t.y) ? 8 : 0);
      img = this.add.image(bx, by, this.wallTex(t.id, mask)).setOrigin(0, 1).setDepth(by + 1000);
    } else if (t.id.startsWith('deco:')) {
      const item = t.id.slice(5);
      this.objs.push(this.add.image(bx, by + 4, 'home-pedestal').setOrigin(0, 1).setDepth(by + 999));
      const key = this.trophyTex(item, homeIcons.url(item), () => this.rebuild());
      if (!this.textures.exists(key)) return;
      img = this.add.image(bx + T / 2, by - 6, key).setOrigin(0.5, 1).setDisplaySize(16, 16).setDepth(by + 1000);
    } else {
      img = this.add.image(bx, by, this.thingTex(t.id)).setOrigin(0, 1).setDepth(d.floor || d.plot ? -4 : by + 1000);
    }
    this.objs.push(img);
    if (d.produce) {
      const item = d.produce.item;
      const key = this.trophyTex(item, homeIcons.url(item), () => this.rebuild());
      if (this.textures.exists(key)) {
        const top = by - d.h * T - (UP[t.id] ?? 0);
        const img = this.add.image(bx + (d.w * T) / 2, top - 2, key).setOrigin(0.5, 1).setDisplaySize(12, 12).setDepth(9e5).setVisible(false);
        this.tweens.add({ targets: img, y: top - 5, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        this.objs.push(img);
        this.bubbles.push({ t, img });
      }
      const zone = this.add.zone(bx + (d.w * T) / 2, by - (d.h * T) / 2 - (UP[t.id] ?? 0) / 2, d.w * T, d.h * T + (UP[t.id] ?? 0))
        .setInteractive({ useHandCursor: true }).setData('collect', { x: t.x, y: t.y });
      this.objs.push(zone);
    }
    if (d.station || d.chest) {
      const zone = this.add.zone(bx + (d.w * T) / 2, by - (d.h * T) / 2 - (UP[t.id] ?? 0) / 2, d.w * T, d.h * T + (UP[t.id] ?? 0))
        .setInteractive({ useHandCursor: true }).setData('home', `home_${t.id}`);
      this.objs.push(zone);
    }
    if (d.light) {
      const glow = this.add.image(bx + (d.w * T) / 2, by - d.h * T - (UP[t.id] ?? 0) + 6, 'glow').setTint(0xffc870).setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(by + 1001).setScale(d.station ? 0.7 : 1).setAlpha(0);
      this.objs.push(glow);
      this.lamps.push(glow);
    }
  }

  // ───────── 建造工具 ─────────
  private setTool(t: HomeTool) {
    this.tool = t;
    this.ghost?.destroy();
    this.ghost = undefined;
    this.ghostBox?.clear();
    if (t?.kind === 'build') {
      const d = buildDef(t.id);
      if (!d) return;
      const key = d.wall ? this.wallTex(t.id, 0) : d.cat === 'floor' ? this.floorTex(t.id, 0, 0) : t.id.startsWith('deco:') ? 'home-pedestal' : this.thingTex(t.id);
      this.ghost = this.add.image(0, 0, key).setOrigin(0, d.cat === 'floor' ? 0 : 1).setAlpha(0.65).setDepth(8e5).setVisible(false);
    }
  }
  private tileAt(p: Phaser.Input.Pointer) {
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    return { x: Math.floor(wp.x / T), y: Math.floor(wp.y / T) };
  }
  private showGhost(p: Phaser.Input.Pointer) {
    if (!this.tool) return;
    const { x, y } = this.tileAt(p);
    this.ghostBox ??= this.add.graphics().setDepth(8e5 + 1);
    this.ghostBox.clear();
    if (this.tool.kind === 'demolish') {
      this.ghostBox.lineStyle(1, 0xff5a4a, 1).strokeRect(x * T + 0.5, y * T + 0.5, T - 1, T - 1);
      return;
    }
    const d = buildDef(this.tool.id);
    if (!d || !this.ghost) return;
    const ok = !canPlace(store.state, this.tool.id, x, y);
    this.ghost.setVisible(true).setPosition(x * T, d.cat === 'floor' ? y * T : (y + d.h) * T).setTint(ok ? 0xffffff : 0xff6a5a);
    this.ghostBox.lineStyle(1, ok ? 0x8aff8a : 0xff5a4a, 1).strokeRect(x * T + 0.5, y * T + 0.5, d.w * T - 1, d.h * T - 1);
  }
  /** 在一格上用工具；拖动铺墙、铺地板时同一格只放一次 */
  private applyTool(x: number, y: number) {
    const t = this.tool;
    if (!t || this.painted.has(k(x, y))) return;
    this.painted.add(k(x, y));
    if (t.kind === 'demolish') {
      const before = store.state;
      store.dispatch((g) => removeAt(g, x, y));
      if (store.state !== before) this.redraw(true);
      return;
    }
    let why = canPlace(store.state, t.id, x, y);
    const d = buildDef(t.id);
    const px = Math.floor(this.player.x / T);
    const py = Math.floor(this.player.y / T);
    if (!why && d && !d.walk && !d.floor && !d.plot && px >= x && px < x + d.w && py >= y && py < y + d.h) why = tl('你站在这里，先走开');
    if (why) {
      if (this.painted.size === 1) this.game.events.emit(HOME_MSG, why);
      return;
    }
    store.dispatch((g) => placeBuild(g, t.id, x, y));
    this.redraw(true);
  }
  private dragTool() {
    const t = this.tool;
    if (!t) return false;
    if (t.kind === 'demolish') return true;
    const d = buildDef(t.id);
    return !!d && (d.wall || d.cat === 'floor');
  }

  // ───────── 镜头和操作 ─────────
  private setupCamera() {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, ISLAND * T, ISLAND * T);
    const cssWidth = () => this.scale.width / DPR;
    cam.setZoom(Phaser.Math.Clamp((cssWidth() / (cssWidth() > 700 ? 26 : 15)) / T, 1.5, 4) * DPR);
    const minZoom = () => Math.max(cssWidth() / (90 * T), 0.5) * DPR;
    this.input.addPointer(1);
    this.input.mouse?.disableContextMenu();
    let pinch = 0;
    let zoom0 = 1;
    let gesture = false;
    let painting = false;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const two = this.input.pointer1.isDown && this.input.pointer2.isDown;
      if (two) {
        gesture = true;
        painting = false;
        pinch = Phaser.Math.Distance.BetweenPoints(this.input.pointer1.position, this.input.pointer2.position);
        zoom0 = cam.zoom;
        return;
      }
      // 建造：左键 / 单指按下就开始铺（墙、地板可以拖着连续铺）
      if (this.tool && (p.wasTouch || p.button === 0)) {
        painting = true;
        this.painted.clear();
        this.showGhost(p);
      }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const p1 = this.input.pointer1;
      const p2 = this.input.pointer2;
      if (p1.isDown && p2.isDown && pinch > 0) {
        const d = Phaser.Math.Distance.BetweenPoints(p1.position, p2.position);
        cam.setZoom(Phaser.Math.Clamp((zoom0 * d) / pinch, minZoom(), 5 * DPR));
        // 两指一起拖：平移镜头
        cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom / 2;
        cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom / 2;
        return;
      }
      if (this.tool) this.showGhost(p);
      if (painting && this.dragTool() && p.isDown) {
        const { x, y } = this.tileAt(p);
        this.applyTool(x, y);
        return;
      }
      if (!p.isDown || p.getDistance() < DRAG * DPR || painting) return;
      gesture = true;
      if (this.following) { cam.stopFollow(); this.following = false; }
      cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
      cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      const wasPainting = painting;
      painting = false;
      const tapped = !gesture && p.getDistance() < DRAG * DPR;
      if (!this.input.pointer1.isDown && !this.input.pointer2.isDown) { gesture = false; pinch = 0; }
      if (wasPainting) {
        // 点一下（没拖）也算放一个
        const { x, y } = this.tileAt(p);
        if (!this.painted.size || !this.dragTool()) { this.painted.clear(); this.applyTool(x, y); }
        this.painted.clear();
        return;
      }
      if (!tapped) return;
      // 右键：退出建造；没在建造就走路
      if (!p.wasTouch && p.button === 2) {
        if (this.tool) { this.game.events.emit(HOME_TOOL, null); return; }
        this.workManual = true;
        this.walkTo(this.tileAt(p));
        return;
      }
      if (over.some((o) => o.getData('portal'))) {
        store.dispatch(leaveHome);
        return;
      }
      const spot = !this.tool && over.map((o) => o.getData('collect') as { x: number; y: number } | undefined).find(Boolean);
      if (spot) {
        let got: Record<string, number> = {};
        store.dispatch((g) => { const r = collectHome(g, Date.now(), spot); got = r.got; return r.state; });
        if (Object.keys(got).length) {
          this.game.events.emit(HOME_MSG, Object.entries(got).map(([id, n]) => tl`收取 ${ITEMS[id]?.name ?? id} ×${n}`).join(tl('、')));
          this.growCells();
        } else this.game.events.emit(HOME_MSG, tl('还没有东西可以收'));
        return;
      }
      const home = over.map((o) => o.getData('home') as string | undefined).find(Boolean);
      if (home) {
        this.game.events.emit(HOME_CLICK, home);
        return;
      }
      const cell = !this.tool && this.cellAt.get(k(this.tileAt(p).x, this.tileAt(p).y));
      if (cell) { this.tendCell(cell); return; }
      this.workManual = true;
      this.walkTo(this.tileAt(p));
    });
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) =>
      cam.setZoom(Phaser.Math.Clamp(cam.zoom + (dy > 0 ? -0.25 : 0.25) * DPR, minZoom(), 5 * DPR)));
    const onZoom = (d: number) => { if (this.scene.isActive()) cam.setZoom(Phaser.Math.Clamp(cam.zoom + d * DPR, minZoom(), 5 * DPR)); };
    const onRecenter = () => this.recenter();
    this.game.events.on('zoom', onZoom);
    this.game.events.on('recenter', onRecenter);
    this.unsub.push(() => { this.game.events.off('zoom', onZoom); this.game.events.off('recenter', onRecenter); });
  }
  /** 镜头跟着人；按钮触发时岛屿场景睡着就不管（进岛时场景还在 create，不能用 isActive 拦） */
  private recenter(force = false) {
    if (!force && !this.scene.isActive()) return;
    this.following = true;
    this.cameras.main.startFollow(this.player, false, 0.15, 0.15);
  }

  // ───────── 走路 ─────────
  private blockedGrid(): Uint8Array {
    const size = homeSize(store.state);
    const g = new Uint8Array(ISLAND * ISLAND);
    for (let y = 0; y < ISLAND; y++) for (let x = 0; x < ISLAND; x++) {
      const ground = islandGround(x, y, size);
      if (ground === 'ocean') g[y * ISLAND + x] = 1;
    }
    const grid = thingGrid(store.state.home);
    const things = store.state.home?.things ?? [];
    for (const [key, i] of grid) {
      const d = buildDef(things[i].id);
      if (!d || d.walk || d.floor || d.plot) continue;
      const [x, y] = key.split(',').map(Number);
      if (x >= 0 && y >= 0 && x < ISLAND && y < ISLAND) g[y * ISLAND + x] = 1;
    }
    // 传送门的两根柱子
    g[HOME_PORTAL.y * ISLAND + HOME_PORTAL.x] = 1;
    g[HOME_PORTAL.y * ISLAND + HOME_PORTAL.x + HOME_PORTAL.w - 1] = 1;
    return g;
  }

  /** 岛不大：整张图上 A*，八方向、不切墙角 */
  private findPath(from: { x: number; y: number }, to: { x: number; y: number }) {
    const g = this.blockedGrid();
    const N = ISLAND;
    const ok = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N && !g[y * N + x];
    if (!ok(to.x, to.y)) {
      // 点在墙上、家具上：走到旁边最近的空地
      let best: { x: number; y: number } | null = null;
      for (let r = 1; r <= 3 && !best; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (!best && ok(to.x + dx, to.y + dy)) best = { x: to.x + dx, y: to.y + dy };
      if (!best) return null;
      to = best;
    }
    const cost = new Float32Array(N * N).fill(Infinity);
    const prev = new Int32Array(N * N).fill(-1);
    const heap: [number, number][] = [];
    const push = (f: number, i: number) => {
      heap.push([f, i]);
      let c = heap.length - 1;
      while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let c = 0;
        for (;;) {
          const l = c * 2 + 1, r = l + 1;
          let m = c;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === c) break;
          [heap[m], heap[c]] = [heap[c], heap[m]];
          c = m;
        }
      }
      return top;
    };
    const s = from.y * N + from.x;
    const goal = to.y * N + to.x;
    const hx = (i: number) => { const dx = Math.abs((i % N) - to.x); const dy = Math.abs(Math.floor(i / N) - to.y); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
    cost[s] = 0;
    push(hx(s), s);
    let n = 0;
    while (heap.length && n++ < 200_000) {
      const [, i] = pop();
      if (i === goal) break;
      const x = i % N;
      const y = Math.floor(i / N);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (!ok(nx, ny)) continue;
        if (dx && dy && (!ok(x + dx, y) || !ok(x, y + dy))) continue;
        const j = ny * N + nx;
        const c = cost[i] + (dx && dy ? 1.414 : 1);
        if (c >= cost[j]) continue;
        cost[j] = c;
        prev[j] = i;
        push(c + hx(j), j);
      }
    }
    if (cost[goal] === Infinity) return null;
    const out: { x: number; y: number }[] = [];
    for (let i = goal; i !== s; i = prev[i]) out.push({ x: i % N, y: Math.floor(i / N) });
    return out.reverse();
  }

  private walkTo(to: { x: number; y: number }) {
    const from = { x: Math.floor(this.player.x / T), y: Math.floor(this.player.y / T) };
    const path = this.findPath(from, to);
    if (!path) return false;
    this.walker = { pts: path.map((p) => ({ x: p.x * T + T / 2, y: p.y * T + T / 2 })), i: 0 };
    if (!this.following) this.recenter();
    return true;
  }

  /** 干这个活的制作台旁边站人的格子（离人最近的那台；左右两侧优先，面朝它） */
  private findWorkSpot(action: string) {
    const g = this.blockedGrid();
    const free = (x: number, y: number) => x >= 0 && y >= 0 && x < ISLAND && y < ISLAND && !g[y * ISLAND + x];
    const px = this.player.x / T;
    const py = this.player.y / T;
    let best: { x: number; y: number; faceLeft: boolean } | null = null;
    let bestD = Infinity;
    for (const t of store.state.home?.things ?? []) {
      const d = buildDef(t.id);
      if (!d?.station || !NODES.find((n) => n.id === d.station)?.actions.includes(action)) continue;
      const row = t.y + d.h - 1;
      const cands = [
        { x: t.x - 1, y: row, faceLeft: false }, { x: t.x + d.w, y: row, faceLeft: true },
        ...Array.from({ length: d.w }, (_, i) => ({ x: t.x + i, y: t.y + d.h, faceLeft: t.x + i >= t.x + d.w / 2 })),
      ];
      for (const c of cands) {
        if (!free(c.x, c.y)) continue;
        const dist = Math.hypot(c.x + 0.5 - px, c.y + 0.5 - py);
        if (dist < bestD) { bestD = dist; best = c; }
      }
    }
    return best;
  }

  /** 岛上制作台有活干：走过去，到了就播敲打动画 */
  private autoWork() {
    const st = store.state;
    const task = st.queue[0];
    const action = task && !st.paused && !st.travel && homeCan(st, task.action) ? task.action : undefined;
    if (action !== this.workFor) {
      this.workFor = action;
      this.workManual = false;
      this.workSpot = undefined;
      if (!action && !this.walker) this.anim('idle');
    }
    if (!action || this.workManual || this.walker || this.tool) return;
    if (this.workSpot === undefined) this.workSpot = this.findWorkSpot(action);
    const spot = this.workSpot;
    if (!spot) return;
    if (Math.floor(this.player.x / T) !== spot.x || Math.floor(this.player.y / T) !== spot.y) {
      if (!this.walkTo(spot)) this.workManual = true;
      return;
    }
    this.facing = 'side';
    this.body.setFlipX(spot.faceLeft);
    this.body.play('work-craft', true);
  }

  private anim(kind: 'walk' | 'idle') {
    this.body.play(`${kind}-${this.facing}`, true);
  }

  update(_time: number, delta: number) {
    // 键盘走路
    const kk = this.keys;
    if (kk) {
      const dx = (kk.D.isDown || kk.RIGHT.isDown ? 1 : 0) - (kk.A.isDown || kk.LEFT.isDown ? 1 : 0);
      const dy = (kk.S.isDown || kk.DOWN.isDown ? 1 : 0) - (kk.W.isDown || kk.UP.isDown ? 1 : 0);
      if (dx || dy) {
        const tx = Math.floor(this.player.x / T) + dx;
        const ty = Math.floor(this.player.y / T) + dy;
        this.workManual = true;
        if (!this.walker || this.walker.i >= this.walker.pts.length - 1) this.walkTo({ x: tx, y: ty });
      }
    }
    const w = this.walker;
    if (w) {
      let move = (SPEED * T * Math.min(delta, 100)) / 1000;
      let dx = 0;
      let dy = 0;
      while (move > 0 && w.i < w.pts.length) {
        const t = w.pts[w.i];
        dx = t.x - this.player.x;
        dy = t.y - this.player.y;
        const d = Math.hypot(dx, dy);
        if (d <= move) { this.player.setPosition(t.x, t.y); move -= d; w.i++; }
        else { this.player.setPosition(this.player.x + (dx / d) * move, this.player.y + (dy / d) * move); move = 0; }
      }
      this.player.setDepth(this.player.y + 1000);
      if (dx || dy) {
        const ax = Math.abs(dx);
        const ay = Math.abs(dy);
        this.facing = ax > ay ? 'side' : dy > 0 ? 'down' : 'up';
        if (this.facing === 'side') this.body.setFlipX(dx < 0);
        this.anim('walk');
      }
      if (w.i >= w.pts.length) { this.walker = undefined; this.anim('idle'); }
    }
    this.autoWork();
    // 昼夜：和大地图同一个钟，晚上灯亮起来
    const dark = darkness(gameHour());
    this.night.setFillStyle(0x0a1430, dark * 0.5);
    for (const l of this.lamps) l.setAlpha(dark * 0.8);
  }
}
