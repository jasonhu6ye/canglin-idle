import { useEffect, useRef, useState } from 'react';
import { REGIONS } from '../core/data';
import type { RegionId } from '../core/types';
import { DAY_MS, gameHour, isRaining } from '../game/ambience';
import { mix, phash } from '../game/pix';

/**
 * 右上角的昼夜时钟（用户 10-23 要求，参考《饥荒》的圆盘，但按本游戏的像素风画）：
 * 逐像素画的圆盘，木框金边；按游戏里的一天分成夜晚、清晨、白天、黄昏几段，指针转到现在的时刻，中间是太阳或月亮。
 * 下面一块木牌写时间和昼夜。一天 = 现实 24 分钟，和地图上的明暗同一个钟。
 */
const SEGS: { from: number; to: number; color: string; name: string }[] = [
  { from: 0, to: 5, color: '#2c3466', name: '夜晚' },
  { from: 5, to: 7, color: '#c8703a', name: '清晨' },
  { from: 7, to: 17.5, color: '#d8a83e', name: '白天' },
  { from: 17.5, to: 20, color: '#a8443a', name: '黄昏' },
  { from: 20, to: 24, color: '#2c3466', name: '夜晚' },
];
const phaseOf = (h: number) => SEGS.find((s) => h >= s.from && h < s.to)!;

const N = 36;
const C = N / 2;
const OUTER = 17;
const DIAL = 14.5;

/** 画一帧：36×36 像素，CSS 放大显示 */
function paint(ctx: CanvasRenderingContext2D, h: number) {
  const img = ctx.createImageData(N, N);
  const put = (x: number, y: number, hex: string) => {
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    const i = (y * N + x) * 4;
    img.data[i] = parseInt(hex.slice(1, 3), 16);
    img.data[i + 1] = parseInt(hex.slice(3, 5), 16);
    img.data[i + 2] = parseInt(hex.slice(5, 7), 16);
    img.data[i + 3] = 255;
  };
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = x + 0.5 - C;
      const dy = y + 0.5 - C;
      const d = Math.hypot(dx, dy);
      if (d > OUTER) continue;
      if (d > DIAL + 1.2) {
        // 外框：外圈黑边，木头，内侧一道金线；左上亮右下暗
        const lit = (-dx - dy) / (d * 1.4);
        if (d > OUTER - 1) put(x, y, '#0e0805');
        else if (d > DIAL + 2.2) put(x, y, mix('#5a3a20', lit > 0 ? '#8a6232' : '#2b1d14', Math.abs(lit) * 0.8 + phash(x, y, 3) * 0.15));
        else put(x, y, lit > -0.2 ? '#e8b84a' : '#8a6232');
        continue;
      }
      if (d > DIAL) { put(x, y, '#1d130c'); continue; }
      // 表盘：0 点在正上方，顺时针
      let a = Math.atan2(dy, dx) + Math.PI / 2;
      if (a < 0) a += Math.PI * 2;
      const hour = (a / (Math.PI * 2)) * 24;
      const seg = phaseOf(hour);
      // 外缘亮一点、里面暗一点，带一点颗粒
      let c = mix(seg.color, '#000000', 0.28 - (d / DIAL) * 0.28 + phash(x, y, 9) * 0.06);
      // 每 3 小时一道刻度；分段交界处一道暗线
      const nearTick = Math.abs(((hour + 1.5) % 3) - 1.5) < 0.22 && d > DIAL - 3;
      const edge = SEGS.some((g) => Math.abs(hour - g.from) < 0.25 && d > 6);
      if (nearTick || edge) c = mix(c, '#000000', 0.45);
      put(x, y, c);
    }
  }
  // 指针：从中心到表盘边缘，亮色带暗边
  const a = (h / 24) * Math.PI * 2 - Math.PI / 2;
  const hand: [number, number][] = [];
  for (let r = 4; r <= DIAL - 1; r += 0.5) hand.push([Math.floor(C + Math.cos(a) * r), Math.floor(C + Math.sin(a) * r)]);
  for (const [x, y] of hand) for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(x + ox, y + oy, '#1d130c');
  for (const [x, y] of hand) put(x, y, '#fff3c4');
  const [tx, ty] = hand[hand.length - 1];
  put(tx, ty, '#ffffff');
  // 中心：太阳或月亮
  const phase = phaseOf(h);
  for (let y = -6; y <= 6; y++) {
    for (let x = -6; x <= 6; x++) {
      const d = Math.hypot(x, y);
      if (d > 5.6) continue;
      const px = Math.floor(C) + x;
      const py = Math.floor(C) + y;
      if (d > 4.6) { put(px, py, '#e8b84a'); continue; }
      put(px, py, '#2a1c12');
    }
  }
  if (phase.name === '夜晚') {
    // 月牙
    for (let y = -3; y <= 3; y++) {
      for (let x = -3; x <= 3; x++) {
        if (Math.hypot(x, y) > 3.2 || Math.hypot(x - 1.6, y + 1) < 2.6) continue;
        put(Math.floor(C) + x, Math.floor(C) + y, x + y < -1 ? '#ffffff' : '#c8d4ff');
      }
    }
  } else {
    // 太阳：圆心加四个方向的光芒
    const sun = phase.name === '白天' ? '#ffd86a' : '#ff9a5a';
    for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) if (Math.hypot(x, y) <= 2.2) put(Math.floor(C) + x, Math.floor(C) + y, x + y < 0 ? '#fff3c4' : sun);
    for (const [x, y] of [[0, -4], [0, 4], [-4, 0], [4, 0], [-3, -3], [3, -3], [-3, 3], [3, 3]]) put(Math.floor(C) + x, Math.floor(C) + y, sun);
  }
  ctx.putImageData(img, 0, 0);
}

export function DayClock({ region }: { region: RegionId }) {
  const [now, setNow] = useState(Date.now());
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const h = gameHour(now);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (ctx) paint(ctx, h);
  }, [h]);
  const phase = phaseOf(h);
  const rain = isRaining(region, now);
  const hh = String(Math.floor(h)).padStart(2, '0');
  const mm = String(Math.floor((h % 1) * 60)).padStart(2, '0');
  const left = Math.ceil((((phase.to - h) / 24) * DAY_MS) / 60000);
  const next = phase.to === 24 ? '' : `，约 ${left} 分钟后进入${phaseOf(phase.to % 24).name}`;
  return (
    <div className="day-clock" title={`游戏时间 ${hh}:${mm} · ${phase.name}${next} · ${REGIONS[region].name}${rain ? ' · 下雨' : ''}`}>
      <canvas ref={ref} width={N} height={N} />
      <span className="day-clock-label">
        <b>{hh}:{mm}</b> {phase.name}{rain && <i className="rain-dot" title="下雨" />}
      </span>
    </div>
  );
}
