import { actionDuration, advance, atBank, bankStand, toBank, depositLoot, leaveWork, resumeWork, setLoc, bagSlotsUsed, enqueue, equip, migrate, newGame, startNow, toBag, unequip, xpPerHour } from './sim';
import { levelForXp, XP_TABLE } from './xp';
import type { GameState, SkillAction, TaskMode } from './types';
import { ACTIONS, nodeOfAction, standOf, travelMs } from './data';

/** 测试默认已经站在任务地点、补给也带好了，不算走路时间 */
function startHere(s: GameState, action: string, mode: TaskMode) {
  const r = startNow(s, action, mode);
  r.loc = standOf(nodeOfAction(action)!);
  r.queue[0].stocked = true;
  return r;
}

const T0 = 1_700_000_000_000;
/** 背包加仓库里一共有多少 */
const owned = (s: GameState, id: string) => (s.bag[id] ?? 0) + (s.bank[id] ?? 0) || undefined;
const HOUR = 3_600_000;

describe('经验曲线', () => {
  it('没有 99 级上限，140 级约 6 亿经验，且单调', () => {
    expect(XP_TABLE[95]).toBeGreaterThan(15_000_000);
    expect(XP_TABLE[140]).toBeGreaterThan(500_000_000);
    expect(levelForXp(XP_TABLE[140])).toBe(140);
    expect(levelForXp(XP_TABLE[150] + 1)).toBe(150);
    for (let l = 2; l < 300; l++) expect(XP_TABLE[l + 1] - XP_TABLE[l]).toBeGreaterThan(XP_TABLE[l] - XP_TABLE[l - 1]);
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(XP_TABLE[50])).toBe(50);
    expect(levelForXp(XP_TABLE[50] - 1)).toBe(49);
  });
});

describe('采集', () => {
  it('挖石头 1 小时 = 1200 次', () => {
    const s = startHere(newGame(T0, 1), 'mine_stone', { type: 'infinite' });
    const { state, summary } = advance(s, T0 + HOUR);
    // 等级加速让它比 1200 次多一点；背包满了还要回仓库一趟
    expect(summary.items.stone).toBe(owned(state, 'stone'));
    expect(owned(state, 'stone')).toBeGreaterThan(1150);
    expect(owned(state, 'stone')).toBeLessThan(1400);
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
    expect(levelForXp(state.xp.melee)).toBeGreaterThan(5);
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
    s.loc = bankStand();
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
    // 不在仓库旁：背包满了卸不下
    expect(unequip(s, 'weapon').equipment.weapon).toBe('wood_sword');
    s.loc = bankStand();
    s = unequip(s, 'weapon');
    expect(s.bank.wood_sword).toBe(1);
  });

  it('仓库的东西要走到仓库旁才能存取', () => {
    let s = newGame(T0, 1);
    s.bank.minnow = 10;
    s.bag.copper_ore = 5;
    expect(atBank(s)).toBe(false);
    expect(toBag(s, 'minnow', 10)).toBe(s);
    expect(toBank(s, 'copper_ore', 5)).toBe(s);
    expect(depositLoot(s)).toBe(s);
    s.loc = bankStand();
    s = toBag(s, 'minnow', 10);
    expect(s.bag.minnow).toBe(10);
    s = depositLoot(s);
    expect(s.bank.copper_ore).toBe(5);
  });
});

describe('背包与战斗方式', () => {
  it('开战前食物不够会先回仓库按设置拿，只吃背包里的', () => {
    let s = newGame(T0, 9);
    s.bank.minnow = 300;
    s.settings.carryFood = 50;
    s = startNow(s, 'fight_grey_wolf', { type: 'time', ms: 10 * 60_000 });
    s.loc = standOf(nodeOfAction('fight_grey_wolf')!);
    // 刚开始在往仓库走，东西还没拿
    const mid = advance(s, T0 + 1000).state;
    expect(mid.travel?.to).toBe('bank');
    expect(mid.bag.minnow).toBeUndefined();
    const { state, summary } = advance(s, T0 + 10 * 60_000);
    expect(summary.bankTrips).toBe(1);
    expect(state.bank.minnow).toBe(250);
    expect((state.bag.minnow ?? 0) + summary.foodEaten).toBe(50);
  });

  it('背包食物够了就不回仓库', () => {
    let s = newGame(T0, 9);
    s.bank = {};
    s.bag.minnow = 60;
    s.settings.carryFood = 50;
    s = startNow(s, 'fight_grey_wolf', { type: 'time', ms: 1000 });
    s.loc = standOf(nodeOfAction('fight_grey_wolf')!);
    expect(advance(s, T0 + 500).state.travel).toBeNull();
  });

  it('背包 20 格、每格 100 个', () => {
    let s = newGame(T0, 1);
    s.bank.minnow = 5000;
    s.loc = bankStand();
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

  it('工具和等级都加快动作', () => {
    const s = newGame(T0, 1);
    const a = ACTIONS.mine_stone as SkillAction;
    const base = actionDuration(s, a);
    s.equipment.pickaxe = 'wood_pickaxe';
    expect(actionDuration(s, a)).toBe(Math.round(a.durationMs / (1 + 0.04 + 0.005)));
    s.xp.mining = XP_TABLE[140];
    expect(actionDuration(s, a)).toBe(Math.round(a.durationMs / (1 + 0.04 + 0.7)));
    expect(actionDuration(s, a)).toBeLessThan(base);
  });

  it('高出要求等级时：采集有双倍产出，生产会省材料', () => {
    let s = newGame(T0, 5);
    s.xp.mining = XP_TABLE[140];
    s = startHere(s, 'mine_stone', { type: 'count', count: 1000 });
    const { state } = advance(s, T0 + 24 * HOUR);
    // 139 级 × 0.2% ≈ 28% 双倍
    expect(owned(state, 'stone')!).toBeGreaterThan(1200);
    expect(owned(state, 'stone')!).toBeLessThan(1350);

    let c = newGame(T0, 5);
    c.xp.smithing = XP_TABLE[140];
    c.bank.tin_ore = 200;
    c = startHere(c, 'smelt_tin', { type: 'infinite' });
    const r = advance(c, T0 + HOUR).state;
    expect(owned(r, 'tin_bar')!).toBeGreaterThan(110);
  });});

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

describe('手动走开', () => {
  it('点地图走开后停下工作，继续工作后先走回去再干', () => {
    const s = startHere(newGame(T0, 1), 'mine_stone', { type: 'infinite' });
    let p = advance(s, T0 + 30_000).state;
    const got = owned(p, 'stone');
    p = setLoc(leaveWork(p), p.loc.x + 20, p.loc.y);
    expect(p.paused).toBe(true);
    p = advance(p, T0 + HOUR).state;
    expect(owned(p, 'stone')).toBe(got);
    expect(p.queue).toHaveLength(1);
    p = resumeWork(p);
    p = advance(p, T0 + HOUR + 3000).state;
    expect(p.travel?.to).toBe(nodeOfAction('mine_stone')!.id);
    p = advance(p, T0 + 2 * HOUR).state;
    expect(owned(p, 'stone')!).toBeGreaterThan(got!);
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
