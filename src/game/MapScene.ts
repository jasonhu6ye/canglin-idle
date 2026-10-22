import Phaser from 'phaser';
import { ACTIONS, ITEMS, MAP_H, MAP_W, MONSTERS, NODES, SKILLS, DANGER, dangerLevel, type MapNode } from '../core/data';
import { combatLevel } from '../core/sim';
import type { RegionId, Summary } from '../core/types';
import { store } from '../store';
import { paintBuilding, paintDot, paintGlow, paintProp, paintWindmillBlades, PROP_GLOW } from './art';
import { DPR } from './dpr';
import { paintResNode, resGlow, resOf, type ResKind } from './resArt';
import { NODE_MARKER, paintSprite, SPRITE_VARIANTS, SPRITES } from './sprites';
import { animateTileset, liquidIndex, paintTileset, T, TILESET, tileIndex, VARIANTS } from './tiles';
import {
  BUILDINGS, CHUNK, findPath, GROUNDS, groundIndex, hash, isWalkable, LIQUIDS, propsInChunk, regionAt, SPAWN, standTile,
  WANDERERS, type PropKind,
} from './world';

/** 步行速度（格/秒）。以后的坐骑在这上面乘倍率 */
export const WALK_TILES_PER_SEC = 4;
let speedMultiplier = 1;
export const setSpeedMultiplier = (m: number) => {
  speedMultiplier = m;
};

const DRAG_THRESHOLD = 8;
const FONT = '"PingFang SC","Microsoft YaHei",sans-serif';
const CHIMNEY: Record<string, boolean> = { hall: true, smithy: true, inn: true, house: true, house3: true };

export const NODE_CLICK = 'node-click';
export const REGION_CHANGE = 'region-change';

/** 角色当前所在格子，世界地图要用 */
export const playerPos = { x: SPAWN.x, y: SPAWN.y };

export function nodeForAction(actionId: string | undefined): MapNode | undefined {
  return actionId ? NODES.find((n) => n.actions.includes(actionId)) : undefined;
}

type Particle = { img: Phaser.GameObjects.Image; vx: number; vy: number; life: number; max: number; kind: Ambient };
type Ambient = 'snow' | 'ember' | 'firefly' | 'spore' | 'mote' | 'dust' | 'leaf';
const AMBIENT: Partial<Record<RegionId, Ambient>> = {
  snow: 'snow', lava: 'ember', woodland: 'firefly', giantwood: 'leaf', abyss: 'spore', swamp: 'mote', coast: 'dust',
};

export class MapScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Container;
  private playerBody!: Phaser.GameObjects.Image;
  private foe?: Phaser.GameObjects.Image;
  private walkTween?: Phaser.Tweens.Tween;
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

  constructor() {
    super('map');
  }

  create() {
    this.makeTextures();
    this.buildTown();
    for (const n of NODES) this.addNode(n);
    for (const w of WANDERERS) this.addWanderer(w.kind, w.x, w.y, w.radius);
    this.addMonsters();

    const task = store.state.queue[0];
    const start = (task && nodeForAction(task.action)) ? standTile(nodeForAction(task.action)!) : SPAWN;
    this.player = this.add.container(start.x * T + T / 2, start.y * T + T / 2);
    const ring = this.add.ellipse(0, 6, 14, 6).setStrokeStyle(1, 0xe8b84a).setFillStyle(0xe8b84a, 0.25);
    this.playerBody = this.add.image(0, 0, 'player');
    const name = this.add.text(0, -14, '[苍岭] 你', { fontFamily: FONT, fontSize: '7px', color: '#ffffff', stroke: '#000', strokeThickness: 2, resolution: 4 }).setOrigin(0.5);
    this.player.add([ring, this.playerBody, name]).setDepth(this.player.y + 1000);
    this.tweens.add({ targets: ring, alpha: 0.4, yoyo: true, repeat: -1, duration: 700 });

    this.setupCamera();
    this.currentAction = task?.action;
    if (task) this.startWorking();
    this.updateLabels();
    this.unsub.push(store.subscribe(() => {
      this.syncTask();
      this.updateLabels();
    }));
    this.unsub.push(store.onGain((s) => this.showGain(s)));
    const onTeleport = (id: string) => this.teleport(id);
    this.game.events.on('teleport', onTeleport);
    this.unsub.push(() => this.game.events.off('teleport', onTeleport));
    this.events.once('shutdown', () => this.unsub.forEach((u) => u()));

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

  private makeTextures() {
    for (const [key, rows] of Object.entries(SPRITES)) this.textures.addCanvas(key, paintSprite(rows));
    for (const [key, v] of Object.entries(SPRITE_VARIANTS)) this.textures.addCanvas(key, paintSprite(SPRITES[v.base], 1, v.swap));
    this.textures.addCanvas('glow', paintGlow());
    this.textures.addCanvas('windmill-blades', paintWindmillBlades());
    const dots: [string, number, string][] = [
      ['p-snow', 2, '#ffffff'], ['p-ember', 1, '#ffa040'], ['p-firefly', 1, '#e8ff7a'], ['p-spore', 1, '#c8a0ff'],
      ['p-mote', 1, '#a8d070'], ['p-dust', 1, '#f0dca0'], ['p-leaf', 2, '#6aa040'], ['p-smoke', 3, '#b0aaa4'], ['p-spark', 1, '#cfe8ff'],
    ];
    for (const [k, size, c] of dots) this.textures.addCanvas(k, paintDot(size, c));
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
    const group = (k: number) => (GROUNDS[k] === 'ocean' ? 'water' : GROUNDS[k]);
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
      const key = `bld-${i}`;
      this.textures.addCanvas(key, paintBuilding(b.kind, b.w, b.h, i));
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
      if (CHIMNEY[b.kind]) this.smoke(bx - img.width / 2 + img.width - 11, by - img.height + 2);
    });
  }

  private smoke(x: number, y: number) {
    this.time.addEvent({
      delay: 700, loop: true, callback: () => {
        const p = this.add.image(x + (Math.random() - 0.5) * 3, y, 'p-smoke').setDepth(8000).setAlpha(0.7);
        this.tweens.add({ targets: p, y: y - 26, x: p.x + 8, alpha: 0, scale: 2.2, duration: 2600, onComplete: () => p.destroy() });
      },
    });
  }

  private sparkle(x: number, y: number, r: number) {
    this.time.addEvent({
      delay: 260, loop: true, callback: () => {
        const p = this.add.image(x + (Math.random() - 0.5) * r * 2, y + (Math.random() - 0.5) * r, 'p-spark').setDepth(8000);
        this.tweens.add({ targets: p, y: p.y - 6, alpha: 0, duration: 700, onComplete: () => p.destroy() });
      },
    });
  }

  private addGlow(x: number, y: number, color: number, r: number) {
    const img = this.add.image(x, y, 'glow').setTint(color).setBlendMode(Phaser.BlendModes.ADD).setDepth(7000).setScale((r * 2) / 64);
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
    const pad = 2 * T;
    const x0 = Math.floor((v.x - pad) / (CHUNK * T));
    const x1 = Math.floor((v.right + pad) / (CHUNK * T));
    const y0 = Math.floor((v.y - pad) / (CHUNK * T));
    // 高的树会从下一块伸上来，下边多加载一块
    const y1 = Math.floor((v.bottom + pad + 4 * T) / (CHUNK * T));
    let budget = this.chunks.size === 0 ? Infinity : 2;
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
      if (cx < x0 - 1 || cx > x1 + 1 || cy < y0 - 1 || cy > y1 + 1) {
        for (const o of objs) o.destroy();
        this.chunks.delete(key);
      }
    }
    this.glows = this.glows.filter((g) => g.img.active);
  }

  update(time: number) {
    this.updateChunks();
    for (const g of this.glows) g.img.setAlpha(g.base + Math.sin(time / 380 + g.phase) * 0.12 + (hash(Math.floor(time / 90), g.phase * 100) - 0.5) * 0.08);
    this.updateParticles();
    playerPos.x = Math.floor(this.player.x / T);
    playerPos.y = Math.floor(this.player.y / T);
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
      const img = this.add.image(v.x + Math.random() * v.width, v.y + Math.random() * v.height, `p-${kind}`).setDepth(9000);
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

  private addNode(n: MapNode) {
    this.addResources(n);
    const cx = n.x * T + T / 2;
    const cy = n.y * T + T / 2;
    const boss = n.sprite === 'boss';
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
      .setDepth(8500);
    this.nodeLabels.push({ node: n, text });
    this.add.zone(cx, cy, T * 2.5, T * 2.5).setInteractive({ useHandCursor: true }).setData('node', n.id);
    this.tweens.add({ targets: text, y: text.y - 2, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.inOut' });
  }

  /** 标签上的等级范围按危险度上色，战斗等级变化时重画 */
  private updateLabels() {
    const cl = combatLevel(store.state);
    if (cl === this.lastCombatLevel) return;
    this.lastCombatLevel = cl;
    for (const { node, text } of this.nodeLabels) {
      if (node.town && !node.pond) {
        text.setText(node.name);
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

  /** 每个战斗点周围放几只怪在游荡 */
  private addMonsters() {
    for (const n of NODES) {
      if (n.town) continue;
      n.actions.forEach((id, i) => {
        const a = ACTIONS[id];
        if (a.kind !== 'combat') return;
        const m = MONSTERS[a.monster];
        const count = m.boss ? 1 : 2;
        for (let k = 0; k < count; k++) {
          const ox = n.x + (i % 2 ? 5 : -5) + k * 2;
          const oy = n.y + 3 + (i >> 1) * 2;
          const img = this.addWanderer(m.sprite, ox, oy, m.boss ? 1 : 3);
          if (m.tint) img.setTint(m.tint);
          if (m.boss) img.setScale(1.8);
        }
      });
    }
  }

  /** 在中心附近随机游荡的小怪或村民 */
  private addWanderer(key: string, x: number, y: number, radius: number) {
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
    this.scale.on('resize', fit);
    cam.startFollow(this.player, true, 0.08, 0.08);

    this.input.addPointer(1);
    let pinchStart = 0;
    let zoomStart = 1;
    let gesture = false; // 本次触摸是否拖动或双指缩放过，若是则抬手时不算点击

    this.input.on('pointerdown', () => {
      if (!this.input.pointer1.isDown || !this.input.pointer2.isDown) return;
      gesture = true;
      pinchStart = Phaser.Math.Distance.BetweenPoints(this.input.pointer1.position, this.input.pointer2.position);
      zoomStart = cam.zoom;
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const p1 = this.input.pointer1;
      const p2 = this.input.pointer2;
      if (p1.isDown && p2.isDown && pinchStart > 0) {
        const d = Phaser.Math.Distance.BetweenPoints(p1.position, p2.position);
        cam.setZoom(Phaser.Math.Clamp((zoomStart * d) / pinchStart, minZoom(), 5 * DPR));
        return;
      }
      if (!p.isDown || p.getDistance() < DRAG_THRESHOLD * DPR) return;
      gesture = true;
      if (this.following) {
        cam.stopFollow();
        this.following = false;
      }
      cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
      cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
    });

    this.input.on('pointerup', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      const tapped = !gesture && p.getDistance() < DRAG_THRESHOLD * DPR;
      if (!this.input.pointer1.isDown && !this.input.pointer2.isDown) {
        gesture = false;
        pinchStart = 0;
      }
      if (!tapped) return;
      const node = over.map((o) => o.getData('node') as string | undefined).find(Boolean);
      if (node) {
        this.game.events.emit(NODE_CLICK, node);
        return;
      }
      const wp = cam.getWorldPoint(p.x, p.y);
      this.moveTo(Math.floor(wp.x / T), Math.floor(wp.y / T));
    });

    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => this.zoomBy(dy > 0 ? -0.25 : 0.25));
    const onZoom = (d: number) => this.zoomBy(d);
    const onRecenter = () => this.recenter();
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

  /** 镜头回到角色；有任务时角色也走回任务地点 */
  private recenter() {
    this.recenterCameraOnly();
    if (this.currentAction && this.manual) this.goToTask();
  }

  private recenterCameraOnly() {
    this.following = true;
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
  }

  private playerTile() {
    return { x: Math.floor(this.player.x / T), y: Math.floor(this.player.y / T) };
  }

  /** 世界地图上的传送：直接出现在资源点前 */
  private teleport(nodeId: string) {
    const n = NODES.find((x) => x.id === nodeId);
    if (!n) return;
    this.walkTween?.stop();
    this.stopWorking();
    const s = standTile(n);
    this.player.setPosition(s.x * T + T / 2, s.y * T + T / 2).setDepth(s.y * T + T / 2 + 1000);
    this.cameras.main.centerOn(this.player.x, this.player.y);
    this.recenterCameraOnly();
    const flash = this.add.image(this.player.x, this.player.y, 'glow').setTint(0x9ad8ff).setBlendMode(Phaser.BlendModes.ADD).setDepth(9500).setScale(0.2);
    this.tweens.add({ targets: flash, scale: 1.6, alpha: 0, duration: 600, onComplete: () => flash.destroy() });
    this.manual = nodeForAction(this.currentAction) !== n;
    if (!this.manual) this.startWorking();
  }

  /** 点地面：角色走过去。任务照常在后台进行，只是不再播放干活动画 */
  private moveTo(tx: number, ty: number) {
    const path = findPath(this.playerTile(), { x: tx, y: ty });
    this.showMarker(tx, ty, !!path);
    if (!path) return;
    this.manual = true;
    this.stopWorking();
    if (!this.following) this.recenterCameraOnly();
    this.walkPath(path, () => {});
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
  private syncTask() {
    const action = store.state.queue[0]?.action;
    if (action === this.currentAction) return;
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

  private goToTask() {
    const node = nodeForAction(this.currentAction);
    if (!node) return;
    this.manual = false;
    this.stopWorking();
    const path = findPath(this.playerTile(), standTile(node)) ?? [];
    this.walkPath(path, () => this.startWorking());
  }

  private walkPath(path: { x: number; y: number }[], done: () => void) {
    this.walkTween?.stop();
    if (!path.length) return done();
    const [step, ...rest] = path;
    const px = step.x * T + T / 2;
    const py = step.y * T + T / 2;
    if (px !== this.player.x) this.playerBody.setFlipX(px < this.player.x);
    const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, px, py);
    this.walkTween = this.tweens.add({
      targets: this.player, x: px, y: py,
      duration: (dist / T / (WALK_TILES_PER_SEC * speedMultiplier)) * 1000,
      onUpdate: () => {
        this.player.setDepth(this.player.y + 1000);
        this.playerBody.y = Math.sin(this.time.now / 60) > 0 ? -1 : 0;
      },
      onComplete: () => {
        this.playerBody.y = 0;
        this.walkPath(rest, done);
      },
    });
  }

  private stopWorking() {
    this.foe?.destroy();
    this.foe = undefined;
    this.workTween?.stop();
    this.playerBody.setPosition(0, 0);
  }

  private startWorking() {
    const a = this.currentAction ? ACTIONS[this.currentAction] : undefined;
    if (!a || this.manual) return;
    if (a.kind === 'combat') {
      const m = MONSTERS[a.monster];
      this.foe = this.add.image(this.player.x + 16, this.player.y, m.sprite).setFlipX(true);
      if (m.tint) this.foe.setTint(m.tint);
      if (m.boss) this.foe.setScale(1.6).setX(this.player.x + 20);
      this.foe.setDepth(this.foe.y + 1000);
      this.workTween = this.tweens.add({ targets: this.playerBody, x: 3, yoyo: true, repeat: -1, duration: 160, repeatDelay: 2080 });
    } else {
      this.workTween = this.tweens.add({ targets: this.playerBody, y: -2, yoyo: true, repeat: -1, duration: 220, repeatDelay: 300 });
    }
  }

  private float(text: string, color: string, big = false) {
    const t = this.add
      .text(this.player.x, this.player.y - 18, text, {
        fontFamily: FONT, fontSize: big ? '10px' : '7px', color, stroke: '#000', strokeThickness: 2, resolution: 4,
      })
      .setOrigin(0.5)
      .setDepth(9600);
    this.tweens.add({ targets: t, y: t.y - 16, alpha: 0, duration: big ? 2200 : 1200, onComplete: () => t.destroy() });
  }

  private showGain(s: Summary) {
    const gained = Object.entries(s.items).filter(([id, q]) => q > 0 && id !== 'coins');
    if (gained.length) {
      const [item, qty] = gained[0];
      this.float(`+${qty} ${ITEMS[item].name}`, '#ffffff');
    } else if (s.items.coins > 0) {
      this.float(`+${s.items.coins} 金币`, '#ffd25e');
    }
    if (this.foe && Object.keys(s.kills).length) {
      this.tweens.add({ targets: this.foe, alpha: 0, yoyo: true, duration: 300, hold: 900 });
    }
    for (const lu of s.levelUps) this.float(`${SKILLS[lu.skill].name} 升到 ${lu.level} 级！`, '#ffd25e', true);
  }
}

/** 判断地图上一格能否走（世界地图点击用） */
export { isWalkable };
