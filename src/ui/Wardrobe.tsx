import { useEffect, useMemo, useRef, useState } from 'react';
import { setSettings } from '../core/sim';
import type { GameState } from '../core/types';
import { HERO_ANIMS, HERO_H, HERO_W, OUTFITS, paintHeroSheet, type Outfit } from '../game/hero';
import { store } from '../store';

const PREVIEW = ['walk-down', 'idle-side', 'walk-side', 'walk-up', 'work-chop', 'fight-sword'];

/** 衣橱里的小人：轮流播放几段动作 */
function HeroPreview({ outfit, scale = 3 }: { outfit: Outfit; scale?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const sheet = useMemo(() => paintHeroSheet(outfit), [outfit]);
  useEffect(() => {
    const anims = HERO_ANIMS.filter((a) => PREVIEW.includes(a.key));
    let tick = 0;
    const draw = () => {
      const ctx = ref.current?.getContext('2d');
      if (!ctx) return;
      const a = anims[Math.floor(tick / 24) % anims.length];
      const f = sheet.frames.find((x) => x.name === `${a.key}-${tick % a.frames}`)!;
      ctx.clearRect(0, 0, HERO_W, HERO_H);
      ctx.drawImage(sheet.canvas, f.x, f.y, HERO_W, HERO_H, 0, 0, HERO_W, HERO_H);
      tick++;
    };
    draw();
    const id = setInterval(draw, 125);
    return () => clearInterval(id);
  }, [sheet]);
  return <canvas ref={ref} width={HERO_W} height={HERO_H} className="pix" style={{ width: HERO_W * scale, height: HERO_H * scale }} />;
}

export function Wardrobe({ s, onClose }: { s: GameState; onClose: () => void }) {
  const cur = s.settings.skin ?? OUTFITS[0].id;
  const [pick, setPick] = useState(cur);
  const sel = OUTFITS.find((o) => o.id === pick) ?? OUTFITS[0];
  return (
    <div className="page wardrobe">
      <div className="sheet-head">
        <button className="back" onClick={onClose}>‹ 返回</button>
        <h2>衣橱</h2>
      </div>
      <div className="wardrobe-stage frame">
        <HeroPreview outfit={sel} scale={5} />
        <div>
          <b>{sel.name}</b>{sel.id === OUTFITS[0].id && <small className="muted"> · 原皮</small>}
          <p className="muted">{sel.desc}</p>
          <button className="primary" disabled={sel.id === cur} onClick={() => store.dispatch((g) => setSettings(g, { skin: sel.id }))}>
            {sel.id === cur ? '穿着中' : '换上'}
          </button>
        </div>
      </div>
      <div className="wardrobe-grid">
        {OUTFITS.map((o) => (
          <button key={o.id} className={`slot ${o.id === pick ? 'on' : ''}`} onClick={() => setPick(o.id)}>
            <HeroPreview outfit={o} scale={2} />
            <span>{o.name}</span>
            {o.id === cur && <small className="gold">穿着中</small>}
          </button>
        ))}
      </div>
    </div>
  );
}
