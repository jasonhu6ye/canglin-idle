import { EN } from './en';

/*
 * 语言包（用户 10-25 要求加英文）。源码里的中文就是键：tl('背包')、tl`获得 ${n} 金币`。
 * 语言在页面加载时定下来，切换语言会刷新页面，所以模块顶层的数据表也能直接用 t()。
 * 新加中文文案后跑 node scripts/i18n/wrap.mjs 包起来，再 node scripts/i18n/check.mjs 看缺哪些翻译。
 */
export type Lang = 'zh' | 'en';
const KEY = 'canglin-lang';

function readLang(): Lang {
  try {
    const v = globalThis.localStorage?.getItem(KEY);
    if (v === 'en' || v === 'zh') return v;
  } catch { /* 隐私模式读不到就用中文 */ }
  return 'zh';
}

export const LANG: Lang = readLang();
// 页面语言跟着切，CSS 里用 html[lang="en"] 调英文排版
if (LANG === 'en' && typeof document !== 'undefined') document.documentElement.lang = 'en';
const dict: Record<string, string> | null = LANG === 'en' ? EN : null;

export function setLang(l: Lang) {
  try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
  location.reload();
}

function fill(strings: TemplateStringsArray, vals: unknown[], tr?: string): string {
  if (tr !== undefined) return tr.replace(/\{(\d+)\}/g, (_, i) => String(vals[+i]));
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += String(vals[i]) + strings[i + 1];
  return out;
}

/**
 * 翻译：tl('背包') 普通文案，返回类型保持字面量，方便赋给联合类型字段；
 * tl`获得 ${n} 金币` 带插值，键里的 ${…} 换成 {0} {1} …，译文里按编号放回去。
 */
export function tl<S extends string>(s: S): S;
export function tl(strings: TemplateStringsArray, ...vals: unknown[]): string;
export function tl(s: string | TemplateStringsArray, ...vals: unknown[]): string {
  if (typeof s === 'string') return dict ? dict[s] ?? s : s;
  if (!dict) return fill(s, vals);
  let key = s[0];
  for (let i = 0; i < vals.length; i++) key += `{${i}}` + s[i + 1];
  return fill(s, vals, dict[key]);
}

/** 同一个中文在不同地方要不同英文时，用 tlc('上下文', '中文')，英文包里的键写成「上下文|中文」 */
export function tlc<S extends string>(ctx: string, s: S): S {
  return (dict ? dict[`${ctx}|${s}`] ?? dict[s] ?? s : s) as S;
}

export const isEn = LANG === 'en';
/** 拼名字用的分隔：中文直接连写，英文中间加空格 */
export const SP = isEn ? ' ' : '';
