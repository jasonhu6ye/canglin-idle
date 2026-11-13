import { describe, expect, it } from 'vitest';
import { digTreasure, enterHome, HOME_GATHER, HOME_GATHER_SPEED, homeCan, homeGathers, homeNode, migrateHome, placeBuild, treasureCount, treasureDug, treasureLeft, treasureLoot, treasureSpots, TREASURE_DECO } from './home';
import { ACTIONS, ITEMS, NODES } from './data';
import { actionDuration, newGame } from './sim';
import type { GameState, SkillAction } from './types';
import { applyCmd } from './commands';
import { dayKey } from './mail';

const portal = NODES.find((n) => n.id === 'portal_home')!;
function island(bank: Record<string, number> = {}): GameState {
  const s = newGame(1_700_000_000_000);
  s.loc = { x: portal.x, y: portal.y + 1 };
  s.travel = null; s.walk = null;
  s.bank = { green_herb: 20, plank_1: 20, plain_log: 40, fert_basic: 5, stone: 100, copper_bar: 10, plank_2: 50, ...bank };
  return enterHome(s);
}
const NOW = Date.UTC(2026, 10, 13, 8);

describe('岛上资源点', () => {
  it('四种技能都有能做的采集，都是不耗材料的', () => {
    for (const sk of ['gathering', 'woodcutting', 'mining', 'fishing'] as const) {
      expect(HOME_GATHER[sk]!.length).toBeGreaterThan(8);
      for (const id of HOME_GATHER[sk]!) {
        const a = ACTIONS[id] as SkillAction;
        expect(a.skill).toBe(sk);
        expect(a.inputs?.length ?? 0).toBe(0);
      }
    }
  });

  it('盖了小树林才能在岛上砍树，速度是野外的 70%，出岛就不行', () => {
    const s = island();
    const chop = 'chop_plain';
    expect(homeCan(s, chop)).toBe(false);
    const a = placeBuild(s, 'home_grove', 160, 160);
    expect(a.home!.things.some((t) => t.id === 'home_grove')).toBe(true);
    expect(homeCan(a, chop)).toBe(true);
    expect(homeCan(a, 'mine_stone')).toBe(false);
    const act = ACTIONS[chop] as SkillAction;
    const out = { ...a, home: { ...a.home!, inside: false } };
    expect(actionDuration(a, act)).toBe(Math.round(actionDuration(out, act) / HOME_GATHER_SPEED));
    expect(homeGathers(out, chop)).toBe(false);
    expect(homeNode('home_home_grove')?.actions).toContain(chop);
  });

  it('小矿脉要声望 1 级', () => {
    const s = island();
    expect(placeBuild(s, 'home_vein', 160, 160)).toBe(s);
    s.home!.rep = 30;
    const a = placeBuild(s, 'home_vein', 160, 160);
    expect(homeCan(a, 'mine_stone')).toBe(true);
  });
});

describe('每日寻宝', () => {
  it('每天 3 处，位置固定、在草地上互相不挨着', () => {
    const s = island();
    const a = treasureSpots(s, NOW);
    expect(a).toHaveLength(3);
    expect(treasureSpots(s, NOW + 60_000)).toEqual(a);
    expect(treasureSpots(s, NOW + 86_400_000)).not.toEqual(a);
    expect(treasureCount(s)).toBe(3);
  });

  it('挖一处进仓库，同一处一天只能挖一次，第二天重新来', () => {
    const s = island();
    const coins = s.bank.coins ?? 0;
    const r = digTreasure(s, NOW, 1);
    expect(r.got.length).toBe(2);
    expect(r.state.bank.coins).toBeGreaterThan(coins);
    expect(treasureDug(r.state, NOW, 1)).toBe(true);
    expect(treasureLeft(r.state, NOW)).toBe(2);
    expect(digTreasure(r.state, NOW, 1).state).toBe(r.state);
    expect(digTreasure(r.state, NOW, 5).state).toBe(r.state);
    expect(digTreasure({ ...r.state, home: { ...r.state.home!, inside: false } }, NOW, 2).got).toEqual([]);
    expect(treasureLeft(r.state, NOW + 86_400_000)).toBe(3);
    expect(migrateHome(structuredClone(r.state.home))!.dig).toEqual({ day: dayKey(NOW), got: [1] });
  });

  it('奖励都是存在的物品，很多天里能挖到摆件', () => {
    const seen = new Set<string>();
    for (let d = 0; d < 400; d++) for (let i = 0; i < 4; i++) {
      const loot = treasureLoot(dayKey(NOW + d * 86_400_000), i, 200);
      for (const g of loot) { expect(g.item === 'coins' || !!ITEMS[g.item], g.item).toBe(true); expect(g.qty).toBeGreaterThan(0); seen.add(g.item); }
    }
    for (const id of TREASURE_DECO) expect(seen.has(id), id).toBe(true);
  });

  it('指令 homeDig 能用', () => {
    const s = island();
    const r = applyCmd(s, 'homeDig', [0], NOW);
    expect(treasureDug(r.state, NOW, 0)).toBe(true);
  });
});

import { OUTFITS } from '../game/hero';
import { SKIN_LOCKS, SKIN_CODE } from './sim';
describe('漏洞检查（11-13）', () => {
  it('constructor 这类名字排不进队列，存档不会坏', () => {
    const s = newGame(1);
    for (const a of ['constructor', 'hasOwnProperty', '__proto__', 'toString']) {
      const r = applyCmd(s, 'enqueue', [a, { type: 'infinite' }], 1000);
      expect(r.state.queue).toHaveLength(0);
    }
  });
  it('没解锁的外观发设置指令也穿不上', () => {
    const s = newGame(1);
    expect(applyCmd(s, 'settings', [{ skin: 'pumpkin' }], 1000).state.settings.skin).toBeUndefined();
    expect(applyCmd(s, 'settings', [{ skin: 'frostfire' }], 1000).state.settings.skin).toBeUndefined();
    const ok = OUTFITS.find((o) => !SKIN_LOCKS[o.id])!.id;
    expect(applyCmd(s, 'settings', [{ skin: ok }], 1000).state.settings.skin).toBe(ok);
  });
  it('外观锁表和衣橱一致', () => {
    for (const o of OUTFITS) {
      const want = o.sealed ? 'sealed' : o.code === SKIN_CODE ? 'code' : o.event === 'halloween' ? 'halloween' : undefined;
      expect(SKIN_LOCKS[o.id], o.id).toBe(want);
    }
  });
});
