import { useEffect, useMemo, useRef, useState } from 'react';
import { hasCode, setSettings } from '../core/sim';
import type { GameState } from '../core/types';
import { hwHasSkin } from '../core/halloween';
import { FRAME_H, FRAME_W, HERO_ANIMS, HERO_H, HERO_PAD, HERO_W, OUTFITS, paintHeroSheet, type Outfit } from '../game/hero';
import { store } from '../store';
import { tl } from '../i18n';
import { ITEMS } from '../core/data';
import { mountFrameOf, mountPreviewFrame, MOUNT_GALLERY } from '../game/mounts';

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

/** 衣橱「坐骑」栏里的坐骑：侧面待机循环播放（后层 + 前层） */
export function MountPreview({ kind, scale = 2 }: { kind: string; scale?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const fr = mountFrameOf(kind);
  const frames = useMemo(() => Array.from({ length: 24 }, (_, i) => mountPreviewFrame(kind, i).map((p) => p.canvas())), [kind]);
  useEffect(() => {
    let tick = 0;
    const draw = () => {
      const ctx = ref.current?.getContext('2d');
      if (!ctx) return;
      const [b, f] = frames[tick % 24];
      ctx.clearRect(0, 0, fr.w, fr.h);
      ctx.drawImage(b, 0, 0);
      ctx.drawImage(f, 0, 0);
      tick++;
    };
    draw();
    const id = setInterval(draw, 100);
    return () => clearInterval(id);
  }, [frames, fr]);
  return <canvas ref={ref} width={fr.w} height={fr.h} className="pix" style={{ width: fr.w * scale, height: fr.h * scale }} />;
}

/** 限定坐骑图鉴（用户 11-02：新坐骑先放衣橱展示，获取方式暂无） */
function MountGallery({ s }: { s: GameState }) {
  const [pick, setPick] = useState(MOUNT_GALLERY[MOUNT_GALLERY.length - 1].kind);
  const sel = MOUNT_GALLERY.find((m) => m.kind === pick) ?? MOUNT_GALLERY[0];
  const owned = (id: string) => !!(s.bank[id] || s.bag[id]) || s.equipment.mount === id;
  const how = (kind: string, id: string) => (owned(id) ? tl('已拥有') : kind === 'unicorn' ? tl('🔒 暂未开放') : kind === 'pumpkin' ? tl('🔒 祭坛积分兑换') : tl('🔒 兑换码'));
  const it = ITEMS[sel.id];
  return (
    <>
      <h3 className="wardrobe-sub">{tl('坐骑')}</h3>
      <div className="wardrobe-stage mount frame">
        <MountPreview kind={sel.kind} scale={3.5} />
        <div>
          <b>{it.name}</b>
          <p className="muted">{it.desc}</p>
          {(sel.kind === 'unicorn' || sel.kind === 'pumpkin') && <p className="gold small-note">{tl('限定坐骑 · 自带动态特效')}</p>}
          <p className="muted small-note">{sel.kind === 'unicorn' ? tl('这只坐骑还没开放获取途径，先看看效果') : how(sel.kind, sel.id)}</p>
        </div>
      </div>
      <div className="wardrobe-grid">
        {MOUNT_GALLERY.map((m) => (
          <button key={m.kind} className={`slot ${m.kind === pick ? 'on' : ''}`} onClick={() => setPick(m.kind)}>
            <MountPreview kind={m.kind} scale={1.6} />
            <span>{ITEMS[m.id].name}</span>
            <small className={owned(m.id) ? 'gold' : 'muted'}>{how(m.kind, m.id)}</small>
          </button>
        ))}
      </div>
      <p className="muted small-note">{tl('坐骑马在城镇畜牧站养大，装在角色页的坐骑栏。')}</p>
    </>
  );
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
      <MountGallery s={s} />
    </div>
  );
}
