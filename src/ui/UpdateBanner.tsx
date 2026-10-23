import { useEffect, useState } from 'react';

/** 发现线上有新版本时提示刷新：GitHub Pages 的页面会被缓存一阵，手机上尤其容易看到旧版 */
export function UpdateBanner() {
  const [next, setNext] = useState<string | null>(null);
  useEffect(() => {
    if (location.hostname === 'localhost') return;
    const check = () => {
      fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((v: { build?: string } | null) => { if (v?.build && v.build !== __BUILD__) setNext(v.build); })
        .catch(() => { /* 离线就算了 */ });
    };
    check();
    const id = setInterval(check, 60_000);
    const onVis = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, []);
  if (!next) return null;
  const reload = () => {
    // 带上版本号换个网址，绕过浏览器对旧页面的缓存
    const u = new URL(location.href);
    u.searchParams.set('v', next);
    location.replace(u.toString());
  };
  return <button className="update-banner" onClick={reload}>游戏有新版本，点这里刷新</button>;
}
