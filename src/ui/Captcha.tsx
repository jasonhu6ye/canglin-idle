import { useEffect, useRef } from 'react';
import { CAPTCHA_KEY } from '../net';
import { LANG } from '../i18n';

/** Cloudflare Turnstile 人机验证框（11-02）。CAPTCHA_KEY 为空时什么都不显示 */
type Turnstile = {
  render: (el: HTMLElement, o: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global { interface Window { turnstile?: Turnstile } }

let loading: Promise<void> | null = null;
function load() {
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise<void>((ok, fail) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => ok();
    s.onerror = () => { loading = null; fail(new Error('captcha')); };
    document.head.appendChild(s);
  });
  return loading;
}

/** 通过验证后 onToken(令牌)；令牌只能用一次，用过以后 nonce 变一下就会重新验证 */
/** 验证框加载不出来（网络连不上 Cloudflare）时 onFail：先不拦着登录，由服务器决定要不要验证 */
export function Captcha({ onToken, nonce, onFail }: { onToken: (t: string) => void; nonce: number; onFail?: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);
  const cb = useRef(onToken);
  cb.current = onToken;
  useEffect(() => {
    if (!CAPTCHA_KEY) return;
    let dead = false;
    load().then(() => {
      if (dead || !box.current || !window.turnstile) return;
      id.current = window.turnstile.render(box.current, {
        sitekey: CAPTCHA_KEY,
        language: LANG === 'en' ? 'en' : 'zh-cn',
        theme: 'dark',
        callback: (t: string) => cb.current(t),
        'expired-callback': () => cb.current(''),
        'error-callback': () => cb.current(''),
      });
    }, () => { if (!dead) onFail?.(); });
    return () => {
      dead = true;
      if (id.current && window.turnstile) window.turnstile.remove(id.current);
      id.current = null;
    };
  }, []);
  useEffect(() => {
    if (nonce && id.current && window.turnstile) { cb.current(''); window.turnstile.reset(id.current); }
  }, [nonce]);
  if (!CAPTCHA_KEY) return null;
  return <div className="captcha" ref={box} />;
}
