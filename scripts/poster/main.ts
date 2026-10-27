import { canvas, scene } from './scene';

const q = new URLSearchParams(location.search);
const OUT_W = Number(q.get('w') ?? 1920);
const OUT_H = Number(q.get('h') ?? 1080);
const K = 4;
const W = Math.round(OUT_W / K);
const H = Math.round(OUT_H / K);

// ---------- 文字 ----------
const FONT = '"WenQuanYi Zen Hei", "PingFang SC", "Microsoft YaHei", sans-serif';
function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, fill: string | CanvasGradient, stroke = '#120a06', lw = size / 7, weight = 'bold') {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.lineJoin = 'round';
  ctx.textBaseline = 'alphabetic';
  if (lw > 0) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.strokeText(s, x, y); }
  ctx.fillStyle = fill;
  ctx.fillText(s, x, y);
  return ctx.measureText(s).width;
}

function poster() {
  const { c, ctx } = canvas(OUT_W, OUT_H);
  const out = document.getElementById('poster') as HTMLCanvasElement;
  ctx.drawImage(scene(W, H), 0, 0, W * K, H * K);

  const x = Math.round(OUT_W * 0.055);
  let y = Math.round(OUT_H * 0.25);
  const S = OUT_H / 1080;
  // 标题：金色描边大字，带一层像素硬阴影
  const tSize = Math.round(150 * S);
  ctx.font = `bold ${tSize}px ${FONT}`;
  const gold = ctx.createLinearGradient(0, y - tSize, 0, y);
  gold.addColorStop(0, '#fff6c8');
  gold.addColorStop(0.5, '#ffd25a');
  gold.addColorStop(1, '#e8862a');
  text(ctx, '苍岭放置', x + 8 * S, y + 8 * S, tSize, '#3a1408', '#3a1408', tSize / 6);
  text(ctx, '苍岭放置', x, y, tSize, gold, '#2a1006', tSize / 6);
  y += Math.round(64 * S);
  text(ctx, '一款像素风放置挂机 MMORPG', x + 6 * S, y, Math.round(40 * S), '#f4ead0', '#0a0610', 6 * S);
  y += Math.round(78 * S);

  const feats = [
    ['⛏', '19 项技能 · 等级无上限', '采矿 伐木 钓鱼 种植 烹饪 锻造…'],
    ['☾', '离线也在挂机', '下线后角色继续干活、打怪、升级'],
    ['⚔', '世界首领与副本', '随机地形洞窟，组队开宝箱'],
    ['⚑', '公会 · 家园 · 坐骑', '和朋友一起冒险，建造自己的小岛'],
  ];
  for (const [icon, head, sub] of feats) {
    ctx.fillStyle = 'rgba(255,210,90,0.95)';
    ctx.fillRect(x, y - 30 * S, 8 * S, 8 * S);
    ctx.fillRect(x + 8 * S, y - 22 * S, 8 * S, 8 * S);
    ctx.fillRect(x, y - 14 * S, 8 * S, 8 * S);
    void icon;
    text(ctx, head, x + 34 * S, y, Math.round(36 * S), '#ffe7a0', '#0a0610', 5 * S);
    text(ctx, sub, x + 34 * S, y + 36 * S, Math.round(24 * S), '#c8d0e8', '#0a0610', 4 * S, 'normal');
    y += Math.round(86 * S);
  }

  // 底部：计划 11 月登陆 Steam
  const bh = Math.round(104 * S);
  const by = OUT_H - bh - Math.round(60 * S);
  const bw = Math.round(720 * S);
  ctx.fillStyle = 'rgba(10,14,30,0.88)';
  ctx.fillRect(x, by, bw, bh);
  ctx.fillStyle = '#ffd25a';
  for (const [rx, ry, rw, rh] of [[0, 0, bw, 4], [0, bh - 4, bw, 4], [0, 0, 4, bh], [bw - 4, 0, 4, bh]]) ctx.fillRect(x + rx * (rx > 4 ? 1 : S), by + ry, rw, rh * S);
  ctx.fillStyle = '#ffd25a';
  ctx.fillRect(x + 12 * S, by + 12 * S, 8 * S, bh - 24 * S);
  text(ctx, '计划 11 月登陆 Steam', x + 44 * S, by + 66 * S, Math.round(46 * S), '#ffffff', '#000000', 0);
  text(ctx, '敬请期待', x + 44 * S + ctx.measureText('计划 11 月登陆 Steam').width + 28 * S, by + 66 * S, Math.round(30 * S), '#ffd25a', '#000', 0, 'normal');

  out.width = OUT_W;
  out.height = OUT_H;
  out.getContext('2d')!.drawImage(c, 0, 0);
  (window as unknown as { posterReady: boolean }).posterReady = true;
}

document.fonts.load(`bold 40px ${FONT}`).finally(poster);
