import { advance, bagSlotsUsed, enqueue, equip, migrate, newGame, startNow, toBag, unequip, xpPerHour } from './sim';
import { levelForXp, XP_TABLE } from './xp';
import type { GameState, TaskMode } from './types';
import { nodeOfAction, standOf, travelMs } from './data';

/** 测试默认已经站在任务地点，不算走路时间 */
function startHere(s: GameState, action: string, mode: TaskMode) {
  const r = startNow(s, action, mode);
  r.loc = standOf(nodeOfAction(action)!);
  return r;
}

const T0 = 1_700_000_000_000;
/** 背包加仓库里一共有多少 */
const owned = (s: GameState, id: string) => (s.bag[id] ?? 0) + (s.bank[id] ?? 0) || undefined;
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
    const s = startHere(newGame(T0, 1), 'mine_stone', { type: 'infinite' });
    const { state, summary } = advance(s, T0 + HOUR);
    // 背包装满 2000 个后要回仓库存一趟，所以略少于 1200 次
    expect(summary.items.stone).toBe(owned(state, 'stone'));
    expect(owned(state, 'stone')).toBeLessThanOrEqual(1200);
    expect(owned(state, 'stone')).toBeGreaterThan(1100);
    expect(state.queue).toHaveLength(1);
  });

  it('数量模式完成后自动进入下一个队列', () => {
    let s = startHere(newGame(T0, 1), 'mine_stone', { type: 'count', count: 10 });
    s = enqueue(s, 'chop_plain', { type: 'count', count: 5 });
    const { state, summary } = advance(s, T0 + HOUR);
    expect(state.bag.stone).toBe(10);
    expect(state.bag.plain_log).toBe(5);
    expect(state.queue).toHaveLength(0);
    expect(summary.taskEnds.map((t) => t.reason)).toEqual(['complete', 'complete']);
  });

  it('等级不够时任务直接结束', () => {
    const s = startHere(newGame(T0, 1), 'mine_copper', { type: 'infinite' });
    const { state, summary } = advance(s, T0 + 10_000);
    expect(state.bank.copper_ore).toBeUndefined();
    expect(summary.taskEnds[0].reason).toBe('level');
  });
});

describe('制作', () => {
  it('材料用完就停', () => {
    let s = newGame(T0, 1);
    s.xp.smithing = XP_TABLE[20];
    s.bank.tin_ore = 5;
    s = startHere(s, 'smelt_tin', { type: 'infinite' });
    const { state, summary } = advance(s, T0 + HOUR);
    expect(state.bag.tin_bar).toBe(2);
    expect(state.bank.tin_ore).toBe(1);
    expect(summary.taskEnds[0].reason).toBe('noInput');
  });
});

describe('战斗', () => {
  it('打野兔能升级，低血量会吃东西', () => {
    const s = startHere(newGame(T0, 7), 'fight_rabbit', { type: 'time', ms: HOUR });
    const { state, summary } = advance(s, T0 + HOUR);
    expect(summary.kills.rabbit).toBeGreaterThan(60);
    expect(levelForXp(state.xp.melee)).toBeGreaterThan(10);
    expect(state.queue).toHaveLength(0);
  });

  it('越级打怪且没有食物会死亡并停止', () => {
    let s = newGame(T0, 3);
    s.bank = {};
    s = startHere(s, 'fight_crystal_dragon', { type: 'infinite' });
    const { state, summary } = advance(s, T0 + HOUR);
    expect(summary.deaths).toBe(1);
    expect(summary.taskEnds[0].reason).toBe('death');
    expect(state.queue).toHaveLength(0);
  });

  it('经验/小时估算和实际同一数量级', () => {
    const g = newGame(T0, 11);
    g.xp.melee = XP_TABLE[35];
    const s = startHere(g, 'fight_rabbit', { type: 'infinite' });
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
    s = startHere(s, 'cook_minnow', { type: 'count', count: 300 });
    s = enqueue(s, 'fight_reef_crab', { type: 'time', ms: 2 * HOUR });
    s = enqueue(s, 'chop_plain', { type: 'infinite' });
    const total = 8 * HOUR;
    const once = advance(s, T0 + total).state;
    const many = chunked(s, total, 250);
    expect(many).toEqual(once);
  });

  it('离线最多结算 24 小时', () => {
    const s = startHere(newGame(T0, 1), 'mine_stone', { type: 'infinite' });
    expect(advance(s, T0 + 48 * HOUR).state).toEqual({ ...advance(s, T0 + 24 * HOUR).state, lastTick: T0 + 48 * HOUR });
  });

  it('时间倒退不会产出', () => {
    const s = startHere(newGame(T0, 1), 'mine_copper', { type: 'infinite' });
    const { state } = advance(s, T0 - HOUR);
    expect(state.bank.copper_ore).toBeUndefined();
  });
});

describe('装备', () => {
  it('等级不够不能装备', () => {
    let s = newGame(T0, 1);
    s.bank.copper_sword = 1;
    expect(equip(s, 'copper_sword').equipment.weapon).toBe('wood_sword');
    s.xp.melee = XP_TABLE[10];
    const e = equip(s, 'copper_sword');
    expect(e.equipment.weapon).toBe('copper_sword');
    expect(e.bag.wood_sword).toBe(1);
  });

  it('卸下的装备进背包，背包满了才回仓库', () => {
    let s = newGame(T0, 1);
    s = unequip(s, 'weapon');
    expect(s.bag.wood_sword).toBe(1);
    s = equip(s, 'wood_sword');
    expect(s.equipment.weapon).toBe('wood_sword');
    expect(s.bag.wood_sword).toBeUndefined();
    for (let i = 0; i < 20; i++) s.bag[`raw_${['minnow', 'shrimp', 'carp', 'trout', 'bass', 'cod', 'salmon', 'eel', 'lava_eel', 'ghostfish', 'abyssfish'][i % 11]}`] = 100 * (i < 11 ? 1 : 2);
    expect(bagSlotsUsed(s.bag)).toBe(20);
    s = unequip(s, 'weapon');
    expect(s.bank.wood_sword).toBe(1);
  });
});

describe('背包与战斗方式', () => {
  it('开战时按设置把仓库的食物带进背包，只吃背包里的', () => {
    let s = newGame(T0, 9);
    s.bank.minnow = 300;
    s.settings.carryFood = 50;
    s = startHere(s, 'fight_grey_wolf', { type: 'time', ms: 60_000 });
    const { state, summary } = advance(s, T0 + 60_000);
    expect(state.bank.minnow).toBe(250);
    expect((state.bag.minnow ?? 0) + summary.foodEaten).toBe(50);
  });

  it('背包 20 格、每格 100 个', () => {
    let s = newGame(T0, 1);
    s.bank.minnow = 5000;
    s = toBag(s, 'minnow', 5000);
    expect(s.bag.minnow).toBe(2000);
  });

  it('远程没有箭就停止，有箭会消耗并练远程', () => {
    let s = newGame(T0, 2);
    s.equipment.weapon = 'wood_shortbow';
    const none = advance(startHere(s, 'fight_dummy', { type: 'infinite' }), T0 + 10_000);
    expect(none.summary.taskEnds[0].reason).toBe('noAmmo');
    s.bank.wood_arrow = 20;
    const { state, summary } = advance(startHere(s, 'fight_dummy', { type: 'infinite' }), T0 + HOUR);
    expect(summary.ammoUsed).toBe(20);
    expect(state.bank.wood_arrow).toBeUndefined();
    expect(summary.xp.ranged).toBeGreaterThan(0);
    expect(summary.xp.melee).toBeUndefined();
    expect(summary.taskEnds[0].reason).toBe('noAmmo');
  });

  it('工具加快采集', () => {
    const s = newGame(T0, 1);
    s.equipment.pickaxe = 'wood_pickaxe';
    const { state } = advance(startHere(s, 'mine_stone', { type: 'count', count: 300 }), T0 + 300 * 2885);
    expect(state.bag.stone).toBe(300);
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

describe('自动寻路', () => {
  it('先走到地点再开始干活，走路时间按距离算', () => {
    const s = startNow(newGame(T0, 1), 'mine_stone', { type: 'infinite' });
    const walk = travelMs(s.loc, standOf(nodeOfAction('mine_stone')!));
    expect(walk).toBeGreaterThan(10_000);
    const mid = advance(s, T0 + walk - 1000).state;
    expect(mid.travel?.to).toBe(nodeOfAction('mine_stone')!.id);
    expect(mid.bank.stone).toBeUndefined();
    const { state } = advance(s, T0 + walk + 3000);
    expect(state.travel).toBeNull();
    expect(state.loc).toEqual(standOf(nodeOfAction('mine_stone')!));
    expect(state.bag.stone).toBe(1);
  });

  it('背包满了自动回仓库存东西，再走回去接着干', () => {
    const s = startHere(newGame(T0, 1), 'mine_stone', { type: 'infinite' });
    s.bag = { sapphire: 1900 };
    const { state, summary } = advance(s, T0 + HOUR);
    expect(summary.bankTrips).toBeGreaterThan(0);
    expect(state.bank.sapphire).toBe(1900);
    expect(owned(state, 'stone')).toBe(summary.items.stone);
    expect(Object.values(state.bag).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(2000);
  });
});

describe('图鉴', () => {
  it('采到的东西记为获得过，旧存档按现有物品补上', () => {
    const { state } = advance(startHere(newGame(T0, 1), 'mine_stone', { type: 'count', count: 1 }), T0 + HOUR);
    expect(state.seen.stone).toBe(1);
    expect(state.seen.copper_ore).toBeUndefined();
    const old = { ...newGame(T0, 1), version: 2, bank: { tin_ore: 3 } } as unknown as Partial<GameState>;
    delete old.seen;
    expect(migrate(old)!.seen.tin_ore).toBe(1);
  });
});
