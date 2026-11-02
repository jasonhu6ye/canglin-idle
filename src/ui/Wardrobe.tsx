import { useEffect, useMemo, useRef, useState } from 'react';
import { hasCode, setSettings } from '../core/sim';
import type { GameState } from '../core/types';
import { hwHasSkin } from '../core/halloween';
import { FRAME_H, FRAME_W, HERO_ANIMS, HERO_H, HERO_PAD, HERO_W, OUTFITS, paintHeroSheet, type Outfit } from '../game/hero';
import { store } from '../store';
import { tl } from '../i18n';

/** 衣橱只展示正面待机（用户 10-30：不用轮播其他动作） */
const PREVIEW = 'idle-down';

/**
 * 衣橱里的小人：正面待机动作循环播放。
 * 有的外观带长柄武器/翅膀（镰刀、棺材、冰火法杖），会伸出人物格子外面，
 * 以前只截人物格子会把武器头剪掉（用户 11-01），现在按这套外观实际画到的范围来截。
 */
function previewBox(sheet: ReturnType<typeof paintHeroSheet>, key: string) {
  let x0 = HERO_PAD.l, y0 = HERO_PAD.t, x1 = HERO_PAD.l + HERO_W - 1, y1 = HERO_PAD.t + HERO_H - 1;
  const ctx = sheet.canvas.getContext('2d');
  if (ctx) {
    for (const f of sheet.frames) {
      if (!f.name.startsWith(`${key}-`)) continue;
      const d = ctx.getImageData(f.x, f.y, FRAME_W, FRAME_H).data;
      for (let y = 0; y < FRAME_H; y++) {
        for (let x = 0; x < FRAME_W; x++) {
          if (!d[(y * FRAME_W + x) * 4 + 3]) continue;
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
  }
  // 左右对称地放宽，人物保持在正中间
  const c = HERO_PAD.l + HERO_W / 2;
  const half = Math.max(c - x0, x1 + 1 - c);
  const x = Math.max(0, Math.floor(c - half));
  return { x, y: y0, w: Math.min(FRAME_W, Math.ceil(c + half)) - x, h: y1 + 1 - y0 };
}

export function HeroPreview({ outfit, scale = 3 }: { outfit: Outfit; scale?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const sheet = useMemo(() => paintHeroSheet(outfit), [outfit]);
  const box = useMemo(() => previewBox(sheet, PREVIEW), [sheet]);
  useEffect(() => {
    const a = HERO_ANIMS.find((x) => x.key === PREVIEW)!;
    let tick = 0;
    const draw = () => {
      const ctx = ref.current?.getContext('2d');
      if (!ctx) return;
      const f = sheet.frames.find((x) => x.name === `${a.key}-${tick % a.frames}`)!;
      ctx.clearRect(0, 0, box.w, box.h);
      ctx.drawImage(sheet.canvas, f.x + box.x, f.y + box.y, box.w, box.h, 0, 0, box.w, box.h);
      tick++;
    };
    draw();
    const id = setInterval(draw, 1000 / a.rate);
    return () => clearInterval(id);
  }, [sheet, box]);
  // 特别宽/高的外观稍微缩小一点，不把旁边的文字和格子挤开
  const k = scale * Math.min(1, (HERO_W * 1.6) / box.w, (HERO_H * 1.3) / box.h);
  return <canvas ref={ref} width={box.w} height={box.h} className="pix" style={{ width: box.w * k, height: box.h * k }} />;
}

export function Wardrobe({ s, onClose }: { s: GameState; onClose: () => void }) {
  const cur = s.settings.skin ?? OUTFITS[0].id;
  const [pick, setPick] = useState(cur);
  const sel = OUTFITS.find((o) => o.id === pick) ?? OUTFITS[0];
  // 兑换码外观：领过对应兑换码才能穿（用户 10-23）
  const locked = (o: Outfit) => !!o.sealed || (!!o.code && !hasCode(s, o.code)) || (o.event === 'halloween' && !hwHasSkin(s.halloween, o.id));
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
          <button className="primary" disabled={sel.id === cur || locked(sel)} onClick={() => store.run('settings', { skin: sel.id })}>
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
