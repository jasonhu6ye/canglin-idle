import { describe, expect, it } from 'vitest';
import { applyCmd, COMMANDS } from './commands';
import { advance, newGame } from './sim';
import { ACTIONS, ITEMS, NODES } from './data';
import { BUILDS } from './home';
import type { GameState } from './types';

/** 指令乱传参数压力测试（11-13 漏洞检查）：随便发什么指令、什么参数，存档都不能坏、之后结算不能出错 */
function rng(seed: number) {
  return () => ((seed = (Math.imul(seed ^ (seed >>> 15), 2246822519) + 0x9e3779b9) | 0) >>> 0) / 4294967296;
}
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
function bad(s: GameState): string[] {
  const out: string[] = [];
  for (const box of ['bank', 'bag'] as const) for (const [k, v] of Object.entries(s[box])) if (!Number.isInteger(v) || v <= 0 || !own(ITEMS, k)) out.push(`${box}.${k}=${v}`);
  for (const t of s.queue) if (!own(ACTIONS, t.action)) out.push(`queue ${t.action}`);
  for (const [k, v] of Object.entries(s.equipment)) if (v && !own(ITEMS, v)) out.push(`equip.${k}=${v}`);
  if (!Number.isFinite(s.hp)) out.push(`hp ${s.hp}`);
  if (!Number.isFinite(s.loc.x) || !Number.isFinite(s.loc.y)) out.push('loc');
  for (const t of s.home?.things ?? []) if (!Number.isFinite(t.x) || !Number.isFinite(t.y)) out.push('home thing');
  return out;
}

describe('指令乱传参数', () => {
  it('500 轮随机指令后存档完好，结算不出错', () => {
    const names = Object.keys(COMMANDS).filter((n) => n !== 'reset');
    const itemIds = Object.keys(ITEMS);
    const actIds = Object.keys(ACTIONS);
    const strs = ['constructor', '__proto__', 'toString', 'hasOwnProperty', '', 'all', 'bank', 'bag', 'potion', 'weapon', 'portal_home', 'jam_pot', 'home_grove', 'deco:conch'];
    for (let seed = 1; seed <= 12; seed++) {
      const r = rng(seed);
      const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
      const junk = (): unknown => {
        const k = r();
        if (k < 0.2) return pick(itemIds);
        if (k < 0.35) return pick(actIds);
        if (k < 0.5) return pick(strs);
        if (k < 0.65) return pick([0, 1, -1, 3, 1e9, 2.5, NaN, Infinity, -Infinity, 1e300]);
        if (k < 0.75) return { x: pick([0, 170, 180, -5, NaN, 1e9]), y: pick([0, 179, 180, NaN]) };
        if (k < 0.82) return { type: pick(['count', 'time', 'infinite', 'x']), count: pick([1, -1, NaN, 1e9]), ms: pick([0, 1000, NaN]) };
        if (k < 0.88) return pick(NODES).id;
        if (k < 0.92) return pick(BUILDS).id;
        if (k < 0.96) return { [pick(itemIds)]: pick([1, -5, 1e9, NaN]), constructor: 3 };
        return pick([null, undefined, [], {}, true, false]);
      };
      let s = newGame(1_700_000_000_000);
      s.bank = { coins: 1e6, plank_1: 500, stone: 500, copper_bar: 100, apple: 50, honey: 50, plain_log: 100, green_herb: 100, fert_basic: 20 };
      let t = 1_700_000_000_000;
      for (let i = 0; i < 500; i++) {
        t += Math.floor(r() * 120_000);
        const n = pick(names);
        const args = Array.from({ length: Math.floor(r() * 5) }, junk);
        const res = applyCmd(s, n, args, t);
        s = res.state;
        expect(bad(s), `${seed}#${i} ${n} ${JSON.stringify(args)}`).toEqual([]);
        if (i % 25 === 0) {
          t += 600_000;
          s = advance(s, t).state;
          expect(bad(s), `${seed}#${i} advance after ${n}`).toEqual([]);
        }
      }
    }
  });
});
