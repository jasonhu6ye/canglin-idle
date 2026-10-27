import { describe, expect, it } from 'vitest';
import { OUTFITS, outfitOf } from './hero';

describe('外观', () => {
  it('暂未开放的外观穿不上，退回原皮', () => {
    const sealed = OUTFITS.find((o) => o.sealed)!;
    expect(sealed.id).toBe('frostfire');
    expect(outfitOf(sealed.id).id).toBe(OUTFITS[0].id);
    expect(outfitOf('ranger').id).toBe('ranger');
    expect(outfitOf('nope').id).toBe(OUTFITS[0].id);
  });
});
