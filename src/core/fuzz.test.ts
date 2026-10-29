import { describe, expect, it } from 'vitest';
import * as sim from './sim';
import * as farm from './farm';
import * as home from './home';
import { ACTIONS, ITEMS, NODES, FARM_NODES, KEY_SHOP, MAT_SHOP, SCROLL_TOWN, standOf } from './data';
import { HW_POINT, HW_REVEAL } from './halloween';
import type { GameState, TaskMode } from './types';

/** 随机操作压力测试：乱点一通之后存档不能出现负数、小数、NaN、超格背包等坏数据 */
function rng(seed: number) {
  return () => ((seed = (Math.imul(seed ^ (seed >>> 15), 2246822519) + 0x9e3779b9) | 0) >>> 0) / 4294967296;
}
const pick = <T,>(r: () => number, a: readonly T[]) => a[Math.floor(r() * a.length)];

function check(s: GameState, ctx: string) {
  const bad: string[] = [];
  for (const box of ['bank', 'bag'] as const)
    for (const [k, v] of Object.entries(s[box])) if (!Number.isInteger(v) || v <= 0 || !ITEMS[k]) bad.push(`${box}.${k}=${v}`);
  if (sim.bagSlotsUsed(s.bag) > sim.BAG_SLOTS) bad.push(`bag slots ${sim.bagSlotsUsed(s.bag)}`);
  for (const [k, v] of Object.entries(s.xp)) if (!Number.isFinite(v) || v < 0) bad.push(`xp.${k}=${v}`);
  if (!Number.isFinite(s.hp) || s.hp < 0 || s.hp > sim.maxHp(s)) bad.push(`hp=${s.hp}/${sim.maxHp(s)}`);
  if (!Number.isFinite(s.progressMs)) bad.push(`progress=${s.progressMs}`);
  if (!Number.isFinite(s.loc.x) || !Number.isFinite(s.loc.y)) bad.push(`loc=${JSON.stringify(s.loc)}`);
  for (const t of s.queue) if (!ACTIONS[t.action]) bad.push(`queue ${t.action}`);
  for (const [slot, id] of Object.entries(s.equipment)) if (id && !ITEMS[id]) bad.push(`equip.${slot}=${id}`);
  for (const [slot, b] of Object.entries(s.belt ?? {})) if (b && (!ITEMS[b.id] || !Number.isInteger(b.qty) || b.qty <= 0)) bad.push(`belt.${slot}=${JSON.stringify(b)}`);
  if (s.travel && (!Number.isFinite(s.travel.ms) || s.travel.ms < 0)) bad.push(`travel=${JSON.stringify(s.travel)}`);
  if (s.walk && (!Number.isFinite(s.walk.ms) || s.walk.ms < 0)) bad.push(`walk=${JSON.stringify(s.walk)}`);
  for (const [k, b] of Object.entries(s.buffs ?? {})) if (b && (!Number.isFinite(b.ms) || !Number.isFinite(b.pct))) bad.push(`buff.${k}`);
  if (s.combat && (!Number.isFinite(s.combat.monsterHp) )) bad.push(`combat=${JSON.stringify(s.combat)}`);
  if (bad.length) throw new Error(`${ctx}: ${bad.join(', ')}`);
}

/** 所有东西加起来（仓库、背包、身上、补给栏、岛上摆的折算成材料） */
function total(s: GameState) {
  const t: Record<string, number> = {};
  const add = (id: string, n: number) => { t[id] = (t[id] ?? 0) + n; };
  for (const box of [s.bank, s.bag]) for (const [k, v] of Object.entries(box)) add(k, v);
  for (const id of Object.values(s.equipment)) if (id) add(id, 1);
  for (const b of Object.values(s.belt ?? {})) if (b) add(b.id, b.qty);
  for (const th of s.home?.things ?? []) for (const c of home.buildDef(th.id)?.cost ?? []) add(c.item, c.qty);
  for (const id of Object.values(s.home?.floors ?? {})) for (const c of home.BUILD_BY_ID[id]?.cost ?? []) add(c.item, c.qty);
  for (const k of Object.keys(t)) if (!t[k]) delete t[k];
  return t;
}
const CONSERVE = new Set([6, 7, 8, 10, 11, 16, 17, 18, 19, 21]);

const actionIds = Object.keys(ACTIONS);
const itemIds = Object.keys(ITEMS);
const qtys = [1, 2, 5, 37, 100, 1e6, 0, -3, 2.5, NaN, Infinity];

describe('随机操作压力测试', () => {
  for (let seed = 1; seed <= 40; seed++) {
    it(`种子 ${seed}`, () => {
      const r = rng(seed * 7919);
      let now = 1_700_000_000_000;
      let s = sim.newGame(now, seed);
      // 起手给点东西
      for (let i = 0; i < 40; i++) s.bank[pick(r, itemIds)] = 1 + Math.floor(r() * 200);
      s.bank.coins = 100_000;
      const log: string[] = [];
      for (let step = 0; step < 250; step++) {
        const op = Math.floor(r() * 32);
        const item = pick(r, itemIds);
        const q = pick(r, qtys);
        const mode: TaskMode = pick(r, [{ type: 'infinite' }, { type: 'count', count: 1 + Math.floor(r() * 5) }, { type: 'time', ms: 60_000 }] as TaskMode[]);
        const node = pick(r, NODES);
        let what = `${op}`;
        const before = total(s);
        switch (op) {
          case 0: case 1: { const a = pick(r, actionIds); what = `startNow ${a}`; s = sim.startNow(s, a, mode); break; }
          case 2: { const a = pick(r, actionIds); what = `enqueue ${a}`; s = sim.enqueue(s, a, mode); break; }
          case 3: case 4: case 5: { const dt = pick(r, [500, 3000, 60_000, 600_000, 3 * 3_600_000]); now += dt; what = `advance ${dt}`; s = sim.advance(s, now).state; break; }
          case 6: what = `setLoc ${node.id}`; { const st = standOf(node); s = sim.setLoc(s, st.x, st.y); } break;
          case 7: what = `toBag ${item} ${q}`; s = sim.toBag(s, item, q); break;
          case 8: what = `toBank ${item} ${q}`; s = sim.toBank(s, item, q); break;
          case 9: { const e = pick(r, itemIds.filter((i) => ITEMS[i].equip)); what = `equip ${e}`; s.bag[e] = (s.bag[e] ?? 0) + (sim.bagSlotsUsed(s.bag) < sim.BAG_SLOTS ? 1 : 0); if (!s.bag[e]) delete s.bag[e]; s = sim.equip(s, e); break; }
          case 10: { const slot = pick(r, Object.keys(s.equipment)); what = `unequip ${slot}`; if (slot) s = sim.unequip(s, slot as never); break; }
          case 11: what = `toBelt ${item}`; s = sim.toBelt(s, item); break;
          case 12: what = `eat ${item}`; s = sim.eat(s, item); break;
          case 13: what = `sell ${item} ${q}`; s = sim.sell(s, item, q); break;
          case 14: what = `buySeed ${item} ${q}`; s = sim.buySeed(s, item, q); break;
          case 15: { const from = pick(r, ['bag', 'bank'] as const); what = `open ${item} ${from} ${q}`; s = sim.openContainer(s, item, from, q)[0]; break; }
          case 16: what = 'leaveWork'; s = sim.leaveWork(s); break;
          case 17: what = 'resumeWork'; s = sim.resumeWork(s); break;
          case 18: what = 'removeTask'; s = sim.removeTask(s, Math.floor(r() * 3)); break;
          case 19: what = 'toggleMount'; s = sim.toggleMount(s); break;
          case 20: {
            const f = pick(r, FARM_NODES); const st = standOf(f); s = { ...s, loc: st, walk: null, travel: null };
            const crop = pick(r, ['potato', 'wheat', 'carrot', 'nope']);
            const fn = pick(r, [() => farm.plantAll(s, f.id, crop, now), () => farm.waterAll(s, f.id, now), () => farm.harvestAll(s, f.id, now), () => farm.installSprinkler(s, f.id, now)]);
            what = `farm ${f.id}`; s = fn().state; break;
          }
          case 21: {
            const pid = pick(r, home.PORTAL_IDS); const p = NODES.find((n) => n.id === pid)!; s = { ...s, loc: { x: p.x, y: p.y + 1 }, walk: null, travel: null };
            what = 'enterHome'; s = home.enterHome(s); break;
          }
          case 22: {
            const b = pick(r, home.BUILDS); const x = home.HOME_SPAWN.x + Math.floor(r() * 30) - 15; const y = home.HOME_SPAWN.y - Math.floor(r() * 30);
            const k = Math.floor(r() * 4); what = `${['place', 'remove', 'leave', 'upgrade'][k]} ${b.id} ${x},${y}`;
            s = [() => home.placeBuild(s, b.id, x, y), () => home.removeAt(s, x, y), () => home.leaveHome(s), () => home.upgradeHome(s)][k](); break;
          }
          case 23: what = `walk`; s = sim.startWalk(s, s.loc, standOf(node), pick(r, [0, 1000, -5, NaN])); break;
          // 10-28 全面检查补上：商人、钥匙、南瓜坐骑兑换、家园产出、召唤南瓜王、分解
          case 24: { const shop = sim.SHOP_NODES[0]; s = { ...s, loc: standOf(shop), walk: null, travel: null }; const it = pick(r, [...MAT_SHOP, SCROLL_TOWN, 'nope']); what = `buyGoods ${it} ${q}`; s = sim.buyGoods(s, it, q, now); break; }
          case 25: { const shop = sim.SHOP_NODES[0]; s = { ...s, loc: standOf(shop), walk: null, travel: null }; const k = pick(r, KEY_SHOP)[0]; what = `buyKey ${k} ${q}`; s = sim.buyKey(s, k, q); break; }
          case 26: { what = 'buyPumpkinMount'; s.bank[HW_POINT] = (s.bank[HW_POINT] ?? 0) + 600; s = sim.buyPumpkinMount(s, Math.max(now, HW_REVEAL)); break; }
          case 27: { what = 'collectHome'; s = home.collectHome(s, now).state; break; }
          case 28: { what = 'summonPumpkin'; s = sim.summonPumpkin(s, Math.floor(r() * 6) - 1, now); break; }
          case 29: { what = `salvage ${item} ${q}`; s = sim.salvage(s, { [item]: q })[0]; break; }
          case 30: { const i = Math.floor(r() * 4); what = `deliverOrder ${i}`; s = home.deliverOrder(s, i, now); break; }
          case 31: { const k = pick(r, ['cat', 'dog', 'nope']); what = `petPet ${k}`; s = home.petPet(s, k, now); break; }
        }
        log.push(what);
        if (CONSERVE.has(op) || (op === 22 && !what.includes('upgrade'))) {
          const after = total(s);
          const diff = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => (before[k] ?? 0) !== (after[k] ?? 0)).map((k) => `${k} ${before[k] ?? 0}→${after[k] ?? 0}`);
          if (diff.length) throw new Error(`东西凭空变了：${diff.join(', ')}\n最近操作：${log.slice(-6).join(' | ')}`);
        }
        try { check(s, `step ${step}`); } catch (e) { throw new Error(`${(e as Error).message}\n最近操作：${log.slice(-6).join(' | ')}`); }
        // 存档往返
        if (step % 50 === 49) { s = sim.migrate(JSON.parse(JSON.stringify(s)))!; check(s, `migrate ${step}`); }
      }
      expect(true).toBe(true);
    });
  }
});

describe('坏存档读档', () => {
  it('缺字段、类型不对的存档读出来要么是 null，要么能正常跑', () => {
    const base = sim.newGame(1_700_000_000_000, 3);
    base.queue = [{ action: 'cook_minnow', mode: { type: 'infinite' } } as never];
    base.home = { lv: 0, floors: {}, things: [], inside: true };
    const keys = Object.keys(base) as (keyof GameState)[];
    const junk = [undefined, null, 0, -1, 'x', [], {}, NaN];
    const r = rng(99);
    for (let i = 0; i < 3000; i++) {
      const raw: Record<string, unknown> = JSON.parse(JSON.stringify(base));
      for (let j = 0; j < 1 + Math.floor(r() * 3); j++) {
        const k = pick(r, keys);
        if (r() < 0.5) delete raw[k]; else raw[k] = pick(r, junk);
      }
      let s: GameState | null = null;
      try { s = sim.migrate(JSON.parse(JSON.stringify(raw))); } catch (e) { throw new Error(`migrate 崩了：${JSON.stringify(Object.keys(base).filter((k) => JSON.stringify(raw[k]) !== JSON.stringify((base as never)[k])).map((k) => [k, raw[k]]))} ${(e as Error).message}`); }
      if (!s) continue;
      try {
        check(s, 'migrate');
        const a = sim.advance(s, 1_700_000_000_000 + 3_600_000).state;
        check(a, 'advance');
      } catch (e) { throw new Error(`${JSON.stringify(Object.keys(base).filter((k) => JSON.stringify(raw[k]) !== JSON.stringify((base as never)[k])).map((k) => [k, raw[k]]))} → ${(e as Error).message}`); }
    }
  });
});
