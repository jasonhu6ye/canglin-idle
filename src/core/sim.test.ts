import { advance, enqueue, equip, newGame, startNow, xpPerHour } from './sim';
import { levelForXp, XP_TABLE } from './xp';
import type { GameState } from './types';

const T0 = 1_700_000_000_000;
const HOUR = 3_600_000;

describe('经验曲线', () => {
  it('99 级约 1300 万经验，且单调', () => {
    expect(XP_TABLE[99]).toBeGreaterThan(13_000_000);
    expect(XP_TABLE[99]).toBeLessThan(13_100_000);
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(XP_TABLE[50])).toBe(50);
    expect(levelForXp(XP_TABLE[50] - 1)).toBe(49);
  });
});

describe('采集', () => {
  it('挖铜矿 1 小时 = 1200 次', () => {
    const s = startNow(newGame(T0, 1), 'mine_copper', { type: 'infinite' });
    const { state, summary } = advance(s, T0 + HOUR);
    expect(state.bank.copper_ore).toBe(1200);
    expect(summary.xp.mining).toBe(12_000);
    expect(state.queue).toHaveLength(1);
  });

  it('数量模式完成后自动进入下一个队列', () => {
    let s = startNow(newGame(T0, 1), 'mine_copper', { type: 'count', count: 10 });
    s = enqueue(s, 'mine_tin', { type: 'count', count: 5 });
    const { state, summary } = advance(s, T0 + HOUR);
    expect(state.bank.copper_ore).toBe(10);
    expect(state.bank.tin_ore).toBe(5);
    expect(state.queue).toHaveLength(0);
    expect(summary.taskEnds.map((t) => t.reason)).toEqual(['complete', 'complete']);
  });

  it('等级不够时任务直接结束', () => {
    const s = startNow(newGame(T0, 1), 'mine_coal', { type: 'infinite' });
    const { state, summary } = advance(s, T0 + 10_000);
    expect(state.bank.coal).toBeUndefined();
    expect(summary.taskEnds[0].reason).toBe('level');
  });
});

describe('制作', () => {
  it('材料用完就停', () => {
    let s = newGame(T0, 1);
    s.bank.copper_ore = 7;
    s.bank.tin_ore = 5;
    s = startNow(s, 'smelt_bronze', { type: 'infinite' });
    const { state, summary } = advance(s, T0 + HOUR);
    expect(state.bank.bronze_bar).toBe(5);
    expect(state.bank.copper_ore).toBe(2);
    expect(state.bank.tin_ore).toBeUndefined();
    expect(summary.taskEnds[0].reason).toBe('noInput');
  });
});

describe('战斗', () => {
  it('打野兔能升级，低血量会吃东西', () => {
    const s = startNow(newGame(T0, 7), 'fight_rabbit', { type: 'time', ms: HOUR });
    const { state, summary } = advance(s, T0 + HOUR);
    expect(summary.kills.rabbit).toBeGreaterThan(100);
    expect(levelForXp(state.xp.melee)).toBeGreaterThan(10);
    expect(state.queue).toHaveLength(0);
  });

  it('越级打怪且没有食物会死亡并停止', () => {
    let s = newGame(T0, 3);
    s.bank = {};
    s = startNow(s, 'fight_ash', { type: 'infinite' });
    const { state, summary } = advance(s, T0 + HOUR);
    expect(summary.deaths).toBe(1);
    expect(summary.taskEnds[0].reason).toBe('death');
    expect(state.queue).toHaveLength(0);
  });

  it('经验/小时估算和实际同一数量级', () => {
    const g = newGame(T0, 11);
    g.xp.melee = XP_TABLE[35];
    const s = startNow(g, 'fight_rabbit', { type: 'infinite' });
    const { summary } = advance(s, T0 + HOUR);
    const est = xpPerHour(s, 'fight_rabbit');
    expect(summary.xp.melee! / est).toBeGreaterThan(0.6);
    expect(summary.xp.melee! / est).toBeLessThan(1.6);
  });
});

describe('离线结算', () => {
  function chunked(s: GameState, total: number, chunk: number) {
    for (let t = chunk; t <= total; t += chunk) s = advance(s, T0 + t).state;
    return s;
  }

  it('一次结算 8 小时 与 每 250ms 结算一次 结果完全一致', () => {
    let s = newGame(T0, 42);
    s.bank.raw_minnow = 500;
    s = startNow(s, 'cook_minnow', { type: 'count', count: 300 });
    s = enqueue(s, 'fight_crab', { type: 'time', ms: 2 * HOUR });
    s = enqueue(s, 'chop_pine', { type: 'infinite' });
    const total = 8 * HOUR;
    const once = advance(s, T0 + total).state;
    const many = chunked(s, total, 250);
    expect(many).toEqual(once);
  });

  it('离线最多结算 24 小时', () => {
    const s = startNow(newGame(T0, 1), 'mine_copper', { type: 'infinite' });
    const { state } = advance(s, T0 + 48 * HOUR);
    expect(state.bank.copper_ore).toBe(24 * 1200);
  });

  it('时间倒退不会产出', () => {
    const s = startNow(newGame(T0, 1), 'mine_copper', { type: 'infinite' });
    const { state } = advance(s, T0 - HOUR);
    expect(state.bank.copper_ore).toBeUndefined();
  });
});

describe('装备', () => {
  it('等级不够不能装备', () => {
    let s = newGame(T0, 1);
    s.bank.iron_sword = 1;
    expect(equip(s, 'iron_sword').equipment.weapon).toBe('bronze_sword');
    s.xp.melee = XP_TABLE[15];
    const e = equip(s, 'iron_sword');
    expect(e.equipment.weapon).toBe('iron_sword');
    expect(e.bank.bronze_sword).toBe(1);
  });
});
