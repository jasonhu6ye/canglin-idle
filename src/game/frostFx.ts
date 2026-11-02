import Phaser from 'phaser';

/**
 * 永霜之弓、永霜盾（11-02）的冻结特效：怪物身上罩一层冰壳（几块淡蓝冰晶 + 冷光），
 * 1 秒后碎成冰屑散开。野外和副本场景共用。
 */
export function frostBurst(scene: Phaser.Scene, spr: Phaser.GameObjects.Sprite, size: number, depth: number, ms = 1000) {
  if (!spr.active) return;
  const cx = spr.x, cy = spr.y - size * 0.4;
  const glow = scene.textures.exists('glow')
    ? scene.add.image(cx, cy, 'glow').setTint(0x8fdcff).setBlendMode(Phaser.BlendModes.ADD).setDepth(depth).setScale((size * 1.6) / 64).setAlpha(0)
    : undefined;
  if (glow) scene.tweens.add({ targets: glow, alpha: 0.8, duration: 120, yoyo: true, hold: ms - 240, onComplete: () => glow.destroy() });
  // 冰壳：围着怪的一圈尖冰晶，逐个长出来
  const g = scene.add.graphics().setDepth(depth + 1);
  const n = 7;
  const shards: [number, number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI * 0.95 + (i / (n - 1)) * Math.PI * 0.9 + Math.PI;
    const r = size * 0.42;
    shards.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.9 + size * 0.15, 2 + (i % 3), 5 + ((i * 5) % 4)]);
  }
  const draw = (k: number) => {
    g.clear();
    for (const [x, y, w, h] of shards) {
      const hh = h * k;
      g.fillStyle(0xcff4ff, 0.85);
      g.fillTriangle(x - w, y, x + w, y, x, y - hh);
      g.fillStyle(0x6ec8f0, 0.9);
      g.fillTriangle(x, y, x + w, y, x, y - hh);
      g.fillStyle(0xffffff, 1);
      g.fillRect(Math.round(x - 1), Math.round(y - hh + 1), 1, 1);
    }
  };
  const t = { k: 0 };
  scene.tweens.add({ targets: t, k: 1, duration: 140, ease: 'Back.easeOut', onUpdate: () => draw(t.k) });
  scene.time.delayedCall(ms, () => {
    g.destroy();
    // 碎冰：几粒冰屑往外飞
    for (const [x, y] of shards) {
      const p = scene.add.rectangle(x, y - 2, 2, 2, 0xcff4ff).setDepth(depth + 1);
      scene.tweens.add({ targets: p, x: x + (x - cx) * 0.6, y: y - 4 + Math.random() * 8, alpha: 0, duration: 380, onComplete: () => p.destroy() });
    }
  });
}
