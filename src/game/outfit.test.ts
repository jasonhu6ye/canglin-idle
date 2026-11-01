import { describe, expect, it } from 'vitest';
import { OUTFITS, outfitOf } from './hero';

describe('外观', () => {
  it('暂未开放的外观穿不上，退回原皮', () => {
    const sealed = OUTFITS.filter((o) => o.sealed).map((o) => o.id);
    expect(sealed).toEqual(['frostfire', 'frostlord']);
    for (const id of sealed) expect(outfitOf(id).id).toBe(OUTFITS[0].id);
    expect(outfitOf('ranger').id).toBe('ranger');
    expect(outfitOf('nope').id).toBe(OUTFITS[0].id);
  });
});
