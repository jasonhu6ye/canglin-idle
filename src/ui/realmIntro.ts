import { CG_H, CG_LEN, CG_W, drawRealmIntroFrame, realmIntroTitleAlpha, warmRealmIntro } from '../game/realmIntroArt';

/**
 * 永冬冰原入场 CG（用户 11-01）：点传送门「进入」后、搬人之前播一段；全屏盖住，右下角可以跳过。
 * 画面是 320×180 的像素画，按屏幕放大（能整数倍就整数倍，手机上铺满宽度），上下留黑边。
 * 返回的 Promise 在播完或跳过时兑现。
 */
export interface RealmIntroOpts { from: 'canglin' | 'duskhaven'; lang: 'zh' | 'en'; outfit?: string }

const TEXT = {
  zh: { title: '永冬冰原', sub: '永冬之裔 · 限时活动', skip: '跳过 ›', from: { canglin: '自苍岭城出发', duskhaven: '自落霞城出发' } }, // i18n-ignore
  en: { title: 'Everwinter Icefield', sub: 'Scions of Everwinter · Limited Event', skip: 'Skip ›', from: { canglin: 'From Canglin', duskhaven: 'From Duskhaven' } },
};

let playing: (() => void) | null = null;

export function playRealmIntro(opts: RealmIntroOpts): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  playing?.();
  const T = TEXT[opts.lang] ?? TEXT.zh;
  return new Promise<void>((resolve) => {
    const root = document.createElement('div');
    root.className = 'realm-intro';
    root.style.cssText = 'position:fixed;inset:0;z-index:60;background:#000;display:grid;place-items:center;overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none;';
    const stage = document.createElement('div');
    stage.style.cssText = 'position:relative;';
    const c = document.createElement('canvas');
    c.width = CG_W;
    c.height = CG_H;
    c.style.cssText = 'display:block;image-rendering:pixelated;image-rendering:crisp-edges;';
    const title = document.createElement('div');
    title.style.cssText = 'position:absolute;left:0;right:0;top:18%;text-align:center;color:#eafaff;opacity:0;pointer-events:none;text-shadow:0 0 12px rgba(90,200,255,0.9),0 2px 0 #0a2040,0 0 2px #000;font-family:inherit;';
    const h = document.createElement('div');
    h.textContent = T.title;
    h.style.cssText = 'font-size:min(9vw,46px);font-weight:900;letter-spacing:0.18em;line-height:1.1;';
    const sub = document.createElement('div');
    sub.textContent = T.sub;
    sub.style.cssText = 'font-size:min(3.6vw,16px);letter-spacing:0.2em;margin-top:0.6em;color:#bafcff;';
    const from = document.createElement('div');
    from.textContent = T.from[opts.from] ?? '';
    from.style.cssText = 'position:absolute;left:0;right:0;bottom:12%;text-align:center;color:rgba(200,230,255,0.85);font-size:min(3.4vw,14px);letter-spacing:0.12em;opacity:0;pointer-events:none;text-shadow:0 1px 0 #000;';
    title.append(h, sub);
    const skip = document.createElement('button');
    skip.type = 'button';
    skip.textContent = T.skip;
    skip.style.cssText = 'position:fixed;right:max(14px,env(safe-area-inset-right));bottom:max(14px,env(safe-area-inset-bottom));padding:8px 14px;border:1px solid rgba(160,220,255,0.6);border-radius:999px;background:rgba(10,30,60,0.7);color:#eafaff;font-size:14px;letter-spacing:0.1em;opacity:0;transition:opacity .4s;cursor:pointer;';
    stage.append(c, title, from);
    root.append(stage, skip);
    document.body.appendChild(root);

    const ctx = c.getContext('2d')!;
    const fit = () => {
      const vw = root.clientWidth, vh = root.clientHeight;
      const raw = Math.min(vw / CG_W, vh / CG_H);
      const k = raw >= 2 ? Math.floor(raw) : raw;
      c.style.width = `${Math.round(CG_W * k)}px`;
      c.style.height = `${Math.round(CG_H * k)}px`;
    };
    fit();
    window.addEventListener('resize', fit);

    let done = false;
    let raf = 0;
    warmRealmIntro({ outfit: opts.outfit, from: opts.from });
    const start = performance.now();
    const finish = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', fit);
      root.remove();
      if (playing === finish) playing = null;
      resolve();
    };
    playing = finish;
    skip.addEventListener('click', (e) => { e.stopPropagation(); finish(); });
    const tick = () => {
      if (done) return;
      const t = (performance.now() - start) / 1000;
      if (t >= CG_LEN) return finish();
      drawRealmIntroFrame(ctx, t, { outfit: opts.outfit, from: opts.from });
      const a = Math.max(0, realmIntroTitleAlpha(t));
      title.style.opacity = a.toFixed(2);
      from.style.opacity = (a * 0.9).toFixed(2);
      if (t > 0.8 && skip.style.opacity !== '1') skip.style.opacity = '1';
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });
}
