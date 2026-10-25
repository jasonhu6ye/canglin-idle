import { useEffect, useState } from 'react';
import { tl } from '../i18n';

/**
 * 发现线上有新版本时提示刷新：GitHub Pages 的页面会被缓存一阵，手机上尤其容易看到旧版。
 * 10-25 用户反馈提示刷新后消不掉：
 * - 只在线上版本比当前更新时才提示（CDN 偶尔给到旧的 version.json，不能把它当成新版本）；
 * - 刷新前先强制重新拉一次页面，绕过浏览器缓存；
 * - 已经为这个版本刷新过、拿到的还是旧页面（CDN 还没更新），就先不再提示，几分钟后再说；
 * - 提示可以手动关掉。
 */
const TRIED_KEY = 'canglin-update-tried';
const RETRY_MS = 5 * 60_000;

function triedRecently(build: string) {
  try {
    const t = JSON.parse(sessionStorage.getItem(TRIED_KEY) ?? 'null') as { build: string; at: number } | null;
    return !!t && t.build === build && Date.now() - t.at < RETRY_MS;
  } catch {
    return false;
  }
}

export function UpdateBanner() {
  const [next, setNext] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string | null>(null);
  useEffect(() => {
    if (location.hostname === 'localhost') return;
    const check = () => {
      fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((v: { build?: string } | null) => {
          if (!v?.build || !(Number(v.build) > Number(__BUILD__))) return setNext(null);
          if (triedRecently(v.build)) return;
          setNext(v.build);
        })
        .catch(() => { /* 离线就算了 */ });
    };
    check();
    const id = setInterval(check, 60_000);
    const onVis = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, []);
  if (!next || hidden === next) return null;
  const reload = async () => {
    try { sessionStorage.setItem(TRIED_KEY, JSON.stringify({ build: next, at: Date.now() })); } catch { /* 存不了就算了 */ }
    // 先强制重新拉一次页面，把浏览器里缓存的旧 index.html 换掉
    try { await fetch(`${location.pathname}?v=${next}`, { cache: 'reload' }); } catch { /* 离线 */ }
    // 再带上版本号换个网址打开，绕过 CDN 的缓存
    const u = new URL(location.href);
    u.searchParams.set('v', next);
    location.replace(u.toString());
  };
  return (
    <div className="update-banner">
      <button className="ub-go" onClick={reload}>{tl('游戏有新版本，点这里刷新')}</button>
      <button className="ub-x" aria-label={tl('关闭')} onClick={() => setHidden(next)}>×</button>
    </div>
  );
}
