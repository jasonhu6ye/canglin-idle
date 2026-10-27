import { useEffect, useMemo, useRef, useState } from 'react';
import { setSettings } from '../core/sim';
import type { GameState } from '../core/types';
import { COAT_COLORS, customizable, HAIR_COLORS, HAIR_STYLES, HERO_ANIMS, HERO_H, HERO_PAD, HERO_W, joinSkin, NO_LOOK, OUTFITS, outfitOf, paintHeroSheet, PANTS_COLORS, SCARF_COLORS, SKIN_TONES, splitSkin, type Look, type Outfit } from '../game/hero';
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
  const start = splitSkin(cur);
  const [pick, setPick] = useState(start.base || OUTFITS[0].id);
  const [look, setLook] = useState<Look>(start.look);
  const base = OUTFITS.find((o) => o.id === pick) ?? OUTFITS[0];
  const can = customizable(base);
  const want = can ? joinSkin(base.id, look) : base.id;
  const sel = outfitOf(want);
  // 兑换码外观：领过对应兑换码才能穿（用户 10-23）
  const locked = (o: Outfit) => !!o.code && !s.redeemed?.includes(o.code);
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
          {sel.code && <p className="gold small-note">{tl('限定外观 · 自带动态特效')}</p>}
          <button className="primary" disabled={want === cur || locked(sel)} onClick={() => store.dispatch((g) => setSettings(g, { skin: want }))}>
            {want === cur ? tl('穿着中') : locked(sel) ? tl('需要兑换码解锁') : tl('换上')}
          </button>
          {locked(sel) && <p className="muted small-note">{tl('在「更多」页输入兑换码领取')}</p>}
        </div>
      </div>
      {can ? <LookEditor look={look} onChange={setLook} /> : <p className="muted small-note">{tl('这套限定外观是特殊造型，不能自定义发型和颜色')}</p>}
      <div className="wardrobe-grid">
        {OUTFITS.map((o) => (
          <button key={o.id} className={`slot ${o.id === pick ? 'on' : ''}`} onClick={() => setPick(o.id)}>
            <HeroPreview outfit={o} scale={2} />
            <span>{o.name}</span>
            {o.id === start.base && <small className="gold">{tl('穿着中')}</small>}
            {locked(o) && <small className="muted">{tl('🔒 未解锁')}</small>}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 一排色块：第一个是「原色」，用这套外观自己的颜色 */
function Swatches({ label, value, colors, onPick }: { label: string; value: number; colors: string[][]; onPick: (i: number) => void }) {
  return (
    <div className="look-row">
      <span>{label}</span>
      <div>
        <button className={`swatch orig ${value === 0 ? 'on' : ''}`} onClick={() => onPick(0)}>{tl('原')}</button>
        {colors.map((c, i) => (
          <button key={i} className={`swatch ${value === i + 1 ? 'on' : ''}`} style={{ background: `linear-gradient(135deg, ${c[c.length - 1]}, ${c[Math.floor(c.length / 2)]} 55%, ${c[0]})` }} onClick={() => onPick(i + 1)} />
        ))}
      </div>
    </div>
  );
}

/** 自定义造型：发型、肤色、发色、外衣、围巾、裤子（用户 10-27 画面线程） */
function LookEditor({ look, onChange }: { look: Look; onChange: (l: Look) => void }) {
  const set = (k: keyof Look) => (i: number) => onChange({ ...look, [k]: i });
  return (
    <div className="look-editor frame">
      <div className="look-row">
        <span>{tl('发型')}</span>
        <div>
          {HAIR_STYLES.map((n, i) => <button key={i} className={`pill ${look.style === i ? 'on' : ''}`} onClick={() => set('style')(i)}>{n}</button>)}
        </div>
      </div>
      <Swatches label={tl('发色')} value={look.hair} colors={HAIR_COLORS} onPick={set('hair')} />
      <Swatches label={tl('肤色')} value={look.tone} colors={SKIN_TONES} onPick={set('tone')} />
      <Swatches label={tl('外衣')} value={look.coat} colors={COAT_COLORS} onPick={set('coat')} />
      <Swatches label={tl('围巾')} value={look.scarf} colors={SCARF_COLORS} onPick={set('scarf')} />
      <Swatches label={tl('裤子')} value={look.pants} colors={PANTS_COLORS} onPick={set('pants')} />
      <button className="pill reset" onClick={() => onChange({ ...NO_LOOK })}>{tl('恢复原样')}</button>
    </div>
  );
}
