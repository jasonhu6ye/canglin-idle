/**
 * 聊天逐句翻译（用户 10-31）：英文翻成中文，中文翻成英文。
 * AI 玩家的话自带中文（ChatMsg.zh），不联网；真人的话点「译」时才发给免费翻译接口（先 Google，失败再 MyMemory），结果缓存
 */
export const hasCjk = (t: string) => /[㐀-鿿豈-﫿]/.test(t);
/** 翻成哪种：带中文的翻成英文，其余翻成中文 */
export const targetOf = (t: string): 'en' | 'zh' => (hasCjk(t) ? 'en' : 'zh');

const cache = new Map<string, string>();
const TIMEOUT_MS = 8000;

async function getJson(url: string) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(String(r.status));
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

async function viaGoogle(text: string, to: 'en' | 'zh') {
  const j = await getJson(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${to === 'zh' ? 'zh-CN' : 'en'}&dt=t&q=${encodeURIComponent(text)}`);
  const out = (j?.[0] as [string][] | undefined)?.map((x) => x[0]).join('') ?? '';
  if (!out) throw new Error('empty');
  return out;
}
async function viaMyMemory(text: string, to: 'en' | 'zh') {
  const pair = to === 'zh' ? 'en|zh-CN' : 'zh-CN|en';
  const j = await getJson(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(pair)}`);
  const out = String(j?.responseData?.translatedText ?? '');
  if (!out || Number(j?.responseStatus) !== 200) throw new Error('empty');
  return out;
}

/** 翻译一句：zh 是 AI 自带的中文 */
export async function translate(text: string, zh?: string): Promise<string> {
  const to = targetOf(text);
  if (to === 'zh' && zh) return zh;
  const key = `${to}:${text}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let out: string;
  try {
    out = await viaGoogle(text, to);
  } catch {
    out = await viaMyMemory(text, to);
  }
  if (cache.size > 500) cache.clear();
  cache.set(key, out);
  return out;
}
