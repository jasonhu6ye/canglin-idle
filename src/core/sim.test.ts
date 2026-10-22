import { advance, enqueue, equip, migrate, newGame, startNow, toBag, xpPerHour } from './sim';
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
  it('挖石头 1 小时 = 1200 次', () => {
    const s = startNow(newGame(T0, 1), 'mine_stone', { type: 'infinite' });
    const { state, summary } = advance(s, T0 + HOUR);
    expect(state.bank.stone).toBe(1200);
    expect(summary.xp.mining).toBe(12_000);
    expect(state.queue).toHaveLength(1);
  });

  it('数量模式完成后自动进入下一个队列', () => {
    let s = startNow(newGame(T0, 1), 'mine_stone', { type: 'count', count: 10 });
    s = enqueue(s, 'chop_plain', { type: 'count', count: 5 });
    const { state, summary } = advance(s, T0 + HOUR);
    expect(state.bank.stone).toBe(10);
    expect(state.bank.plain_log).toBe(5);
    expect(state.queue).toHaveLength(0);
    expect(summary.taskEnds.map((t) => t.reason)).toEqual(['complete', 'complete']);
  });

  it('等级不够时任务直接结束', () => {
    const s = startNow(newGame(T0, 1), 'mine_copper', { type: 'infinite' });
    const { state, summary } = advance(s, T0 + 10_000);
    expect(state.bank.copper_ore).toBeUndefined();
    expect(summary.taskEnds[0].reason).toBe('level');
  });
});

describe('制作', () => {
  it('材料用完就停', () => {
    let s = newGame(T0, 1);
    s.xp.smithing = XP_TABLE[20];
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
    expect(summary.kills.rabbit).toBeGreaterThan(60);
    expect(levelForXp(state.xp.melee)).toBeGreaterThan(10);
    expect(state.queue).toHaveLength(0);
  });

  it('越级打怪且没有食物会死亡并停止', () => {
    let s = newGame(T0, 3);
    s.bank = {};
    s = startNow(s, 'fight_crystal_dragon', { type: 'infinite' });
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
    s = enqueue(s, 'fight_reef_crab', { type: 'time', ms: 2 * HOUR });
    s = enqueue(s, 'chop_plain', { type: 'infinite' });
    const total = 8 * HOUR;
    const once = advance(s, T0 + total).state;
    const many = chunked(s, total, 250);
    expect(many).toEqual(once);
  });

  it('离线最多结算 24 小时', () => {
    const s = startNow(newGame(T0, 1), 'mine_stone', { type: 'infinite' });
    const { state } = advance(s, T0 + 48 * HOUR);
    expect(state.bank.stone).toBe(24 * 1200);
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
    s.bank.copper_sword = 1;
    expect(equip(s, 'copper_sword').equipment.weapon).toBe('stone_sword');
    s.xp.melee = XP_TABLE[10];
    const e = equip(s, 'copper_sword');
    expect(e.equipment.weapon).toBe('copper_sword');
    expect(e.bank.stone_sword).toBe(1);
  });
});

describe('背包与战斗方式', () => {
  it('开战时按设置把仓库的食物带进背包，只吃背包里的', () => {
    let s = newGame(T0, 9);
    s.bank.minnow = 300;
    s.settings.carryFood = 50;
    s = startNow(s, 'fight_grey_wolf', { type: 'time', ms: 60_000 });
    const { state, summary } = advance(s, T0 + 60_000);
    expect(state.bank.minnow).toBe(250);
    expect((state.bag.minnow ?? 0) + summary.foodEaten).toBe(50);
  });

  it('背包 20 格、每格 100 个', () => {
    let s = newGame(T0, 1);
    s.bank.minnow = 5000;
    s = toBag(s, 'minnow', 5000);
    expect(s.bag.minnow).toBe(2000);
    expect(toBag(s, 'copper_ore', 1)).toBe(s);
  });

  it('远程没有箭就停止，有箭会消耗并练远程', () => {
    let s = newGame(T0, 2);
    s.equipment.weapon = 'pine_bow';
    const none = advance(startNow(s, 'fight_dummy', { type: 'infinite' }), T0 + 10_000);
    expect(none.summary.taskEnds[0].reason).toBe('noAmmo');
    s.bank.bronze_arrow = 20;
    const { state, summary } = advance(startNow(s, 'fight_dummy', { type: 'infinite' }), T0 + HOUR);
    expect(summary.ammoUsed).toBe(20);
    expect(state.bank.bronze_arrow).toBeUndefined();
    expect(summary.xp.ranged).toBeGreaterThan(0);
    expect(summary.xp.melee).toBeUndefined();
    expect(summary.taskEnds[0].reason).toBe('noAmmo');
  });

  it('工具加快采集', () => {
    const s = newGame(T0, 1);
    s.equipment.pickaxe = 'stone_pickaxe';
    const { state } = advance(startNow(s, 'mine_stone', { type: 'infinite' }), T0 + HOUR);
    expect(state.bank.stone).toBe(Math.floor(HOUR / Math.round(3000 / 1.04)));
  });
});

describe('存档迁移', () => {
  it('v1 存档补齐新技能和背包，丢掉不认识的物品', () => {
    const v1 = { ...newGame(T0, 1), version: 1, bank: { coins: 9, copper_ore: 3, ash_core: 2 }, xp: { mining: 500 } } as unknown;
    delete (v1 as { bag?: unknown }).bag;
    const s = migrate(v1)!;
    expect(s.version).toBe(3);
    expect(s.xp.hunting).toBe(0);
    expect(s.bank).toEqual({ coins: 9, copper_ore: 3 });
    expect(s.bag).toEqual({});
    expect(s.xp.mining).toBe(500);
    expect(s.xp.magic).toBe(0);
    expect(s.settings.carryFood).toBeGreaterThan(0);
  });
});
