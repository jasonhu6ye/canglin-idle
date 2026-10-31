import { afterEach, describe, expect, it, vi } from 'vitest';
import { targetOf, translate } from './translate';

afterEach(() => { vi.unstubAllGlobals(); });
describe('聊天翻译', () => {
  it('中文翻英文，其余翻中文', () => {
    expect(targetOf('hello there')).toBe('zh');
    expect(targetOf('大家好')).toBe('en');
    expect(targetOf('gg 大佬')).toBe('en');
  });
  it('AI 自带中文时不联网', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect(await translate('gm everyone', '大家早')).toBe('大家早');
    expect(f).not.toHaveBeenCalled();
  });
  it('先用 Google，失败换 MyMemory，结果缓存', async () => {
    const f = vi.fn(async (url: string) => {
      if (url.includes('googleapis')) return { ok: false, status: 429, json: async () => null };
      return { ok: true, status: 200, json: async () => ({ responseStatus: 200, responseData: { translatedText: 'Hello everyone' } }) };
    });
    vi.stubGlobal('fetch', f);
    expect(await translate('大家好呀')).toBe('Hello everyone');
    expect(f).toHaveBeenCalledTimes(2);
    expect(String(f.mock.calls[1][0])).toContain('zh-CN%7Cen');
    expect(await translate('大家好呀')).toBe('Hello everyone');
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('Google 返回分段时拼起来', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [[['你好，', 'hi, '], ['朋友', 'friend']]] })));
    expect(await translate('hi, friend')).toBe('你好，朋友');
  });
});
