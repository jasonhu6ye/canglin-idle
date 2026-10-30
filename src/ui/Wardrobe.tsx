import { useEffect, useMemo, useRef, useState } from 'react';
import { setSettings } from '../core/sim';
import type { GameState } from '../core/types';
import { HERO_ANIMS, HERO_H, HERO_PAD, HERO_W, OUTFITS, paintHeroSheet, type Outfit } from '../game/hero';
import { store } from '../store';
import { tl } from '../i18n';

const PREVIEW = ['walk-down', 'idle-side', 'walk-side', 'walk-up', 'work-chop', 'fight-sword'];

/** 衣橱里的小人：轮流播放几段动作 */
export function HeroPreview({ outfit, scale = 3 }: { outfit: Outfit; scale?: number }) {
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
      ctx.drawImage(sheet.canvas, f.x + HERO_PAD.l, f.y + HERO_PAD.t, HERO_W, HERO_H, 0, 0, HERO_W, HERO_H);
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
  // 兑换码外观：领过对应兑换码才能穿（用户 10-23）
  const locked = (o: Outfit) => !!o.sealed || (!!o.code && !s.redeemed?.includes(o.code)) || (o.event === 'halloween' && !s.halloween?.skin);
  return (
    <div className="page wardrobe">
      <div className="sheet-head">
        <button className="back" onClick={onClose}>{tl('‹ 返回')}</button>
        <h2>{tl('衣橱')}</h2>
      </div>
      <div className="wardrobe-stage frame">
        <HeroPreview outfit={sel} scale={5} />
        <div>
          <b>{sel.name}</b>{sel.id === OUTFITS[0].id && <small className="muted">{tl(' · 原皮')}</small>}
          <p className="muted">{sel.desc}</p>
          {(sel.code || sel.fx) && <p className="gold small-note">{tl('限定外观 · 自带动态特效')}</p>}
          <button className="primary" disabled={sel.id === cur || locked(sel)} onClick={() => store.dispatch((g) => setSettings(g, { skin: sel.id }))}>
            {sel.id === cur ? tl('穿着中') : sel.sealed ? tl('暂未开放') : locked(sel) ? (sel.event ? tl('需要在祭坛兑换') : tl('需要兑换码解锁')) : tl('换上')}
          </button>
          {sel.sealed ? <p className="muted small-note">{tl('这套外观还没开放获取途径，先看看效果')}</p> : locked(sel) && <p className="muted small-note">{sel.event ? tl('万圣节限定：在苍岭城东门外的活动祭坛用南瓜积分兑换') : tl('在「更多」页输入兑换码领取')}</p>}
        </div>
      </div>
      <div className="wardrobe-grid">
        {OUTFITS.map((o) => (
          <button key={o.id} className={`slot ${o.id === pick ? 'on' : ''}`} onClick={() => setPick(o.id)}>
            <HeroPreview outfit={o} scale={2} />
            <span>{o.name}</span>
            {o.id === cur && <small className="gold">{tl('穿着中')}</small>}
            {locked(o) && <small className="muted">{o.sealed ? tl('🔒 暂未开放') : tl('🔒 未解锁')}</small>}
          </button>
        ))}
      </div>
    </div>
  );
}
