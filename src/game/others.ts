import Phaser from 'phaser';
import { levelSnapshot, online, type Presence } from '../net';
import type { GameState } from '../core/types';
import { FRAME_H, FRAME_W, HERO_ANIMS, HERO_FEET, HERO_PAD, outfitOf, paintHeroSheet } from './hero';
import { T } from './tiles';

/**
 * 地图上的其他在线玩家（10-25）：位置每几秒同步一次，这边平滑走过去。
 * 只是看得见，不能互相碰撞或交易。
 */
const FONT = 'system-ui, sans-serif';
/** 太远的人不画，省得满地图都是 */
const VIEW_TILES = 80;
/** 自己的位置多久发一次（没变化时） */
const KEEPALIVE_MS = 15_000;

interface Other {
  box: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Sprite;
  name: Phaser.GameObjects.Text;
  key: string;
  tx: number;
  ty: number;
  dir: 'down' | 'up' | 'side';
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
      if (a.key.startsWith('walk-') || a.key.startsWith('idle-')) {
        this.scene.anims.create({
          key: `${key}:${a.key}`, frameRate: a.rate, repeat: -1,
          frames: Array.from({ length: a.frames }, (_, i) => ({ key, frame: `${a.key}-${i}` })),
        });
      }
    }
    return key;
  }

  /** 把自己的位置、装备和等级发出去：格子变了、换了东西或隔了一阵才发；每半秒最多看一次 */
  publish(st: GameState, x: number, y: number) {
    if (!online.me()) return;
    const now = Date.now();
    if (now - this.checked < 500) return;
    this.checked = now;
    const action = st.paused ? undefined : st.queue[0]?.action;
    const mounted = st.mounted ? st.equipment.mount : undefined;
    const snap = levelSnapshot(st);
    const key = JSON.stringify([st.settings.skin, action, mounted, st.equipment, snap.total, snap.combat]);
    const moved = Math.abs(x - this.sent.x) + Math.abs(y - this.sent.y) >= 2;
    if (!moved && key === this.sent.key && now - this.sent.at < KEEPALIVE_MS) return;
    this.sent = { x, y, key, at: now };
    online.publishPresence({ x, y, outfit: st.settings.skin, action, mounted, equip: { ...st.equipment }, total: snap.total, combat: snap.combat });
  }

  step(delta: number, near: { x: number; y: number }) {
    const seen = new Set<string>();
    for (const p of this.latest) {
      if (Math.abs(p.x - near.x) > VIEW_TILES || Math.abs(p.y - near.y) > VIEW_TILES) continue;
      seen.add(p.playerId);
      const tx = p.x * T + T / 2, ty = p.y * T + T / 2 + 7;
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
        o = { box, body, name, key, tx, ty, dir: 'down' };
        this.others.set(p.playerId, o);
      }
      o.name.setText(p.guildTag ? `[${p.guildTag}] ${p.name}` : p.name);
      o.tx = tx; o.ty = ty;
    }
    for (const [id, o] of this.others) {
      if (!seen.has(id)) { o.box.destroy(); this.others.delete(id); continue; }
      const dx = o.tx - o.box.x, dy = o.ty - o.box.y;
      const d = Math.hypot(dx, dy);
      // 隔太远（刚传送或刚出现）直接放过去
      if (d > T * 30) o.box.setPosition(o.tx, o.ty);
      else if (d > 1) {
        // 每秒 4 格，落后多了走快些追上
        const v = (T * 4 * Math.max(1, d / (T * 8)) * delta) / 1000;
        const k = Math.min(1, v / d);
        o.box.setPosition(o.box.x + dx * k, o.box.y + dy * k);
        o.dir = Math.abs(dx) > Math.abs(dy) ? 'side' : dy > 0 ? 'down' : 'up';
        if (o.dir === 'side') o.body.setFlipX(dx < 0);
        o.body.play(`${o.key}:walk-${o.dir}`, true);
      } else o.body.play(`${o.key}:idle-${o.dir}`, true);
      o.box.setDepth(o.box.y + 999);
    }
  }
}
