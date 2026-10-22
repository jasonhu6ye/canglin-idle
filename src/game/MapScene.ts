import Phaser from 'phaser';
import { ACTIONS, ITEMS, MAP_H, MAP_W, NODES, SKILLS, type MapNode } from '../core/data';
import type { Summary } from '../core/types';
import { store } from '../store';
import { MONSTER_SPRITE, paintSprite, SPRITES } from './sprites';
import { decorations, hash, HOUSES, MONSTER_ZONES, SPAWN, TILE_COLORS, tileAt, type Tile } from './world';

const T = 16;
const WALK_TILES_PER_SEC = 5;
const FONT = '"PingFang SC","Microsoft YaHei",sans-serif';

export const NODE_CLICK = 'node-click';

export function nodeForAction(actionId: string | undefined): MapNode | undefined {
  return actionId ? NODES.find((n) => n.actions.includes(actionId)) : undefined;
}

export class MapScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Container;
  private playerBody!: Phaser.GameObjects.Image;
  private foe?: Phaser.GameObjects.Image;
  private walkTween?: Phaser.Tweens.Tween;
  private workTween?: Phaser.Tweens.Tween;
  private target: { x: number; y: number } = { ...SPAWN };
  private currentAction?: string;
  private following = true;
  private unsub: (() => void)[] = [];

  constructor() {
    super('map');
  }

  create() {
    this.makeTextures();
    this.drawGround();
    this.drawHouses();
    for (const d of decorations()) this.addProp(d.kind, d.x, d.y);
    for (const n of NODES) this.addNode(n);
    for (const z of MONSTER_ZONES) this.addWanderer(MONSTER_SPRITE[z.monster], z.x, z.y, 2);
    for (let i = 0; i < 4; i++) this.addWanderer('villager', 16 + i * 2, 12 + (i % 2) * 4, 3);

    this.player = this.add.container(SPAWN.x * T + T / 2, SPAWN.y * T + T / 2);
    const ring = this.add.ellipse(0, 6, 14, 6).setStrokeStyle(1, 0xe8b84a).setFillStyle(0xe8b84a, 0.25);
    this.playerBody = this.add.image(0, 0, 'player');
    const name = this.add.text(0, -14, '[苍岭] 你', { fontFamily: FONT, fontSize: '7px', color: '#ffffff', stroke: '#000', strokeThickness: 2, resolution: 4 }).setOrigin(0.5);
    this.player.add([ring, this.playerBody, name]).setDepth(this.player.y + 1000);
    this.tweens.add({ targets: ring, alpha: 0.4, yoyo: true, repeat: -1, duration: 700 });

    this.setupCamera();
    this.syncTask();
    this.unsub.push(store.subscribe(() => this.syncTask()));
    this.unsub.push(store.onGain((s) => this.showGain(s)));
    this.events.once('shutdown', () => this.unsub.forEach((u) => u()));
  }

  /** 把字符画和地块噪点生成成纹理 */
  private makeTextures() {
    for (const [key, rows] of Object.entries(SPRITES)) this.textures.addCanvas(key, paintSprite(rows));
    for (const [tile, [base, dark, light]] of Object.entries(TILE_COLORS)) {
      for (let v = 0; v < 3; v++) {
        const c = document.createElement('canvas');
        c.width = c.height = T;
        const ctx = c.getContext('2d')!;
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, T, T);
        for (let i = 0; i < 10; i++) {
          const r = hash(i, v, tile.length);
          ctx.fillStyle = r < 0.5 ? dark : light;
          ctx.fillRect(Math.floor(hash(i, v, 7) * T), Math.floor(hash(v, i, 9) * T), tile === 'water' ? 3 : 1, 1);
        }
        this.textures.addCanvas(`tile-${tile}-${v}`, c);
      }
    }
  }

  private drawGround() {
    const rt = this.add.renderTexture(0, 0, MAP_W * T, MAP_H * T).setOrigin(0).setDepth(-10);
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const tile: Tile = tileAt(x, y);
        rt.draw(`tile-${tile}-${Math.floor(hash(x, y) * 3)}`, x * T, y * T);
      }
    }
    // 水面波光
    const water = this.add.graphics().setDepth(-9);
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        if (tileAt(x, y) === 'water' && hash(x, y, 3) < 0.15) {
          water.fillStyle(0xbfe0ff, 0.7).fillRect(x * T + 4, y * T + 8, 5, 1);
        }
      }
    }
    this.tweens.add({ targets: water, alpha: 0.2, yoyo: true, repeat: -1, duration: 1500 });
  }

  private drawHouses() {
    for (const h of HOUSES) {
      const g = this.add.graphics().setDepth((h.y + 3) * T + 1000);
      const px = h.x * T;
      const py = h.y * T;
      const roof = Phaser.Display.Color.HexStringToColor(h.roof).color;
      g.fillStyle(0x2a1e17).fillRect(px + 1, py + 13, 46, 34);
      g.fillStyle(0x8a6240).fillRect(px + 3, py + 15, 42, 30);
      for (let i = 0; i < 5; i++) g.fillStyle(0x6e4b30).fillRect(px + 3, py + 18 + i * 6, 42, 1);
      g.fillStyle(0x2a1e17).fillRect(px - 1, py + 1, 50, 16);
      g.fillStyle(roof).fillRect(px + 1, py + 3, 46, 12);
      g.fillStyle(0x000000, 0.2).fillRect(px + 1, py + 11, 46, 4);
      g.fillStyle(0x2a1e17).fillRect(px + 19, py + 33, 10, 14);
      g.fillStyle(0x5a3a22).fillRect(px + 20, py + 34, 8, 13);
      for (const wx of [px + 7, px + 33]) {
        g.fillStyle(0x2a1e17).fillRect(wx, py + 22, 9, 9);
        g.fillStyle(0x9fd0f0).fillRect(wx + 1, py + 23, 7, 7);
        g.fillStyle(0x2a1e17).fillRect(wx + 4, py + 23, 1, 7);
      }
    }
  }

  private addProp(kind: string, x: number, y: number) {
    const img = this.add.image(x * T + T / 2, y * T + T / 2, kind);
    img.setDepth(img.y + 1000);
    return img;
  }

  private addNode(n: MapNode) {
    const cx = n.x * T + T / 2;
    const cy = n.y * T + T / 2;
    const sprite = { rock: 'rock', tree: 'tree', water: 'sign', anvil: 'anvil', campfire: 'fire', monster: 'sign' }[n.sprite];
    if (n.sprite === 'water') {
      const g = this.add.graphics().setDepth(cy + 990);
      g.fillStyle(0x2a1e17).fillRect(cx - 9, cy + 6, 18, 30);
      g.fillStyle(0x9a7046).fillRect(cx - 8, cy + 7, 16, 28);
      for (let i = 0; i < 7; i++) g.fillStyle(0x7a5233).fillRect(cx - 8, cy + 10 + i * 4, 16, 1);
    }
    const img = this.add.image(cx, cy, sprite).setDepth(cy + 1000);
    if (n.sprite === 'campfire') this.tweens.add({ targets: img, scaleY: 1.12, yoyo: true, repeat: -1, duration: 300 });
    const label = this.add
      .text(cx, cy - 13, n.name, { fontFamily: FONT, fontSize: '7px', color: '#fff3c4', backgroundColor: '#2a1e17cc', padding: { x: 2, y: 1 }, resolution: 4 })
      .setOrigin(0.5)
      .setDepth(5000);
    const hit = this.add.zone(cx, cy, T * 2.5, T * 2.5).setInteractive({ useHandCursor: true });
    hit.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.getDistance() < 8) this.game.events.emit(NODE_CLICK, n.id);
    });
    this.tweens.add({ targets: label, y: cy - 15, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.inOut' });
  }

  /** 在中心附近随机游荡的小怪或村民 */
  private addWanderer(key: string, x: number, y: number, radius: number) {
    const img = this.addProp(key, x, y);
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
  }

  private setupCamera() {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, MAP_W * T, MAP_H * T);
    cam.setBackgroundColor('#1b140f');
    const fit = () => cam.setZoom(Phaser.Math.Clamp(this.scale.width / (15 * T), 1.5, 4));
    fit();
    this.scale.on('resize', fit);
    cam.startFollow(this.player, true, 0.08, 0.08);

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown || p.getDistance() < 8) return;
      if (this.following) {
        cam.stopFollow();
        this.following = false;
      }
      cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
      cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
    });
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => this.zoomBy(dy > 0 ? -0.5 : 0.5));
    this.game.events.on('zoom', (d: number) => this.zoomBy(d));
    this.game.events.on('recenter', () => this.recenter());
  }

  private zoomBy(d: number) {
    const cam = this.cameras.main;
    cam.setZoom(Phaser.Math.Clamp(cam.zoom + d, 1, 5));
  }

  private recenter() {
    this.following = true;
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
  }

  /** 队列首个任务变化时，角色走到对应资源点 */
  private syncTask() {
    const action = store.state.queue[0]?.action;
    if (action === this.currentAction) return;
    this.currentAction = action;
    const node = nodeForAction(action);
    this.target = node ? { x: node.x, y: node.y + 1 } : { ...SPAWN };
    this.foe?.destroy();
    this.foe = undefined;
    this.workTween?.stop();
    this.playerBody.y = 0;
    this.walkTo(this.target.x * T + T / 2, this.target.y * T + T / 2, () => this.startWorking());
    if (action) this.recenter();
  }

  private walkTo(px: number, py: number, done: () => void) {
    this.walkTween?.stop();
    const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, px, py);
    this.playerBody.setFlipX(px < this.player.x);
    this.walkTween = this.tweens.add({
      targets: this.player, x: px, y: py,
      duration: (dist / T / WALK_TILES_PER_SEC) * 1000,
      onUpdate: () => {
        this.player.setDepth(this.player.y + 1000);
        this.playerBody.y = Math.sin(this.time.now / 60) > 0 ? -1 : 0;
      },
      onComplete: () => {
        this.playerBody.y = 0;
        done();
      },
    });
  }

  private startWorking() {
    const a = this.currentAction ? ACTIONS[this.currentAction] : undefined;
    if (!a) return;
    if (a.kind === 'combat') {
      this.foe = this.add.image(this.player.x + 14, this.player.y, MONSTER_SPRITE[a.monster]).setFlipX(true);
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
      .setDepth(6000);
    this.tweens.add({ targets: t, y: t.y - 16, alpha: 0, duration: big ? 2200 : 1200, onComplete: () => t.destroy() });
  }

  private showGain(s: Summary) {
    const gained = Object.entries(s.items).filter(([, q]) => q > 0);
    if (gained.length) {
      const [item, qty] = gained[0];
      this.float(`+${qty} ${ITEMS[item].name}`, '#ffffff');
    }
    if (this.foe && Object.keys(s.kills).length) {
      this.tweens.add({ targets: this.foe, alpha: 0, yoyo: true, duration: 300, hold: 900 });
    }
    for (const lu of s.levelUps) this.float(`${SKILLS[lu.skill].name} 升到 ${lu.level} 级！`, '#ffd25e', true);
  }
}
