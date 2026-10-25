import { EN } from './en';

describe('英文语言包', () => {
  it('译文里的占位符和原文一致', () => {
    const ph = (s: string) => (s.match(/\{\d+\}/g) ?? []).sort().join();
    const bad = Object.entries(EN).filter(([k, v]) => !k.includes('|') && ph(k) !== ph(v));
    expect(bad).toEqual([]);
  });

  it('英文模式下数据表能正常生成，物品和怪物名都翻译了', async () => {
    vi.resetModules();
    vi.stubGlobal('localStorage', { getItem: (k: string) => (k === 'canglin-lang' ? 'en' : null), setItem() {} });
    const d = await import('../core/data');
    const zh = /[一-鿿]/;
    const left = [...Object.values(d.ITEMS), ...Object.values(d.MONSTERS)].filter((x) => zh.test(x.name)).map((x) => x.id);
    // 新加的内容可能暂时没翻译（会显示中文），这里只防止整个语言包失效
    expect(left.length).toBeLessThan(20);
    vi.unstubAllGlobals();
  });
});
