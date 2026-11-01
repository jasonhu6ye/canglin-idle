/**
 * 游戏时钟（11-01 防作弊）：离线收益按「现在 - 上次结算」算，以前直接用手机/电脑的系统时间，
 * 把系统时间往后调就能白拿离线收益。现在登录后向服务器对一次时间，记下本机时钟差了多少（offset），
 * 结算都用 gameNow()。本机时间准（差 1 分钟以内）就当没差，正常玩家完全不受影响；
 * 离线玩（连不上服务器）时用上次对过的差值。
 */
const KEY = 'canglin-clock-off';
/** 差这么多以内当作本机时间是准的 */
const TRUST_MS = 60_000;

let offset = (() => {
  try { return Number(localStorage.getItem(KEY)) || 0; } catch { return 0; }
})();
let known = false;

export const gameNow = () => Date.now() + (Math.abs(offset) > TRUST_MS ? offset : 0);
export const clockOffset = () => offset;
export const clockKnown = () => known;

/**
 * 用服务器时间校准。serverMs 是服务器返回的时间，sentAt / gotAt 是本机发请求、收到回复的时间。
 * 返回这次和上次的差值变了多少（毫秒）：变了很多 = 这段时间里本机时钟被调过。
 */
export function calibrate(serverMs: number, sentAt: number, gotAt: number): number {
  if (!Number.isFinite(serverMs) || serverMs <= 0) return 0;
  const next = serverMs - (sentAt + gotAt) / 2;
  const jump = known ? offset - next : 0;
  offset = next;
  known = true;
  try { localStorage.setItem(KEY, String(Math.round(next))); } catch { /* 存不了就算了 */ }
  return jump;
}

/** 存档签名：存档字符串加盐算个哈希，读档时对不上 = 本地存档被手动改过 */
const SALT = 'cl-idle/7f3a91';
export function saveSig(raw: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ raw.length;
  const s = SALT + raw;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x5bd1e995);
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}
