import { describe, expect, it } from 'vitest';
import { ACTIONS, ITEMS, KEY_SHOP, standOf, MAT_PRICE, MAT_SHOP, SCROLL_PRICE, SCROLL_TOWN, SEED_SHOP, seedPrice } from './data';
import { qid, qualityOdds, QUALITY_VALUE } from './quality';
import { buyGoods, buySeed, canSalvage, marketStand, newGame, SALVAGE_BONUS, SHOP_NODES, shopBought } from './sim';
import type { GameState, SkillAction } from './types';
import { XP_TABLE } from './xp';

/** 做出来随机品质的装备平均值多少倍（按出好货最多的 T1 算，偏保守） */
const odds = qualityOdds(0);
const avgQ = odds.reduce((n, p, q) => n + (p / 100) * QUALITY_VALUE[q], 0);

/**
 * 一个物品最多能换多少金币：直接卖、分解，或者拿去做东西再卖（沿配方链往下找最赚的那条）。
 * 配方的转化倍数 = 产出最多能换的金币 ÷ 材料卖价，材料按这个倍数折算
 */
function bestCoins(): Record<string, number> {
  const best: Record<string, number> = {};
  const unit = (id: string) => best[id] ?? ITEMS[id]?.value ?? 0;
  for (const id of Object.keys(ITEMS)) {
    const it = ITEMS[id];
    const q = ITEMS[qid(id, 1)] ? avgQ : 1;
    best[id] = it.value * q * (canSalvage(id) ? SALVAGE_BONUS : 1);
  }
  const recipes = Object.values(ACTIONS).filter((a): a is SkillAction => a.kind === 'skill' && !!a.inputs?.length);
  for (let round = 0; round < 8; round++) {
    for (const r of recipes) {
      const cost = r.inputs!.reduce((n, i) => n + (ITEMS[i.item]?.value ?? 0) * i.qty, 0);
      if (cost <= 0) continue;
      const out = r.outputs.reduce((n, o) => n + unit(o.item) * o.qty * (o.chance ?? 1), 0);
      const k = out / cost;
      for (const i of r.inputs!) best[i.item] = Math.max(unit(i.item), (ITEMS[i.item]?.value ?? 0) * k);
    }
  }
  return best;
}

function rich(): GameState {
  const s = newGame(0, 1);
  s.bank.coins = 10_000_000;
  return s;
}

describe('经济（10-27）', () => {
  it('商人卖的材料比加工后最多能换的金币还贵，买来倒卖一定亏', () => {
    const best = bestCoins();
    for (const id of MAT_SHOP) {
      const ratio = best[id] / ITEMS[id].value;
      expect(ratio, id).toBeLessThan(MAT_PRICE * 0.85);
    }
    expect(SCROLL_PRICE).toBeGreaterThan(ITEMS[SCROLL_TOWN].value * 2);
    for (const [id, price] of KEY_SHOP) expect(price, id).toBeGreaterThan(ITEMS[id].value * 2);
    for (const id of SEED_SHOP) expect(seedPrice(id), id).toBeGreaterThan(ITEMS[id].value * 3);
  });

  it('材料柜台每天限购，种子要种植等级够才能买', () => {
    let s = rich();
    s.loc = standOf(SHOP_NODES[0]);
    const id = MAT_SHOP[0];
    const t = Date.UTC(2026, 9, 27, 12);
    s = buyGoods(s, id, 150, t);
    expect(s.bank[id]).toBe(150);
    expect(shopBought(s, id, t)).toBe(150);
    expect(buyGoods(s, id, 51, t)).toBe(s);
    s = buyGoods(s, id, 50, t);
    expect(s.bank[id]).toBe(200);
    // 第二天重新算
    expect(shopBought(s, id, t + 86_400_000)).toBe(0);
    expect(buyGoods(s, id, 10, t + 86_400_000).bank[id]).toBe(210);
    // 高阶种子：等级不够买不了
    const hi = SEED_SHOP[SEED_SHOP.length - 1];
    let m = rich();
    m.loc = marketStand();
    expect(buySeed(m, hi, 1)).toBe(m);
    m = { ...m, xp: { ...m.xp, farming: XP_TABLE[120] } };
    expect(buySeed(m, hi, 1).bank[hi]).toBe(1);
  });
});
