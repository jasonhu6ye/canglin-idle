import { describe, expect, it } from 'vitest';
import { joinSkin, NO_LOOK, OUTFITS, outfitOf, splitSkin } from './hero';

describe('自定义造型', () => {
  it('外观串来回转换不丢信息', () => {
    const look = { style: 2, tone: 4, hair: 9, coat: 3, scarf: 1, pants: 6 };
    const id = joinSkin('ranger', look);
    expect(splitSkin(id)).toEqual({ base: 'ranger', look });
    expect(joinSkin('ranger', NO_LOOK)).toBe('ranger');
  });
  it('换上的颜色生效，原色和特殊外观不受影响', () => {
    const o = outfitOf('adventurer~210000');
    expect(o.hairStyle).toBe(2);
    expect(o.skin).not.toEqual(OUTFITS[0].skin);
    expect(o.hair).toEqual(OUTFITS[0].hair);
    expect(outfitOf('pumpkin~123456').id).toBe('pumpkin');
    expect(outfitOf('nope').id).toBe('adventurer');
  });
});
