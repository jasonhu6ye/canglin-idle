import { actionDuration, advance, buySeed, eat, toBelt, sell, marketStand, startWalk, walkPos, MAX_DEATH_STREAK, atBank, bankStand, toBank, depositLoot, leaveWork, resumeWork, setLoc, bagSlotsUsed, enqueue, equip, migrate, newGame, startNow, toBag, unequip, xpPerHour, openContainer, redeemCode, toggleMount, moveSpeed, rainBonus } from './sim';
import { levelForXp, speedForLevel, XP_TABLE } from './xp';
import type { GameState, SkillAction, TaskMode } from './types';
import { ACTIONS, CROP_DEFS, FARM_NODES, nodeOfAction, plotsOf, standOf, travelMs, WATER_SPEEDUP } from './data';
import { fieldCounts, harvestAll, plantAll, tendPlot, waterAll } from './farm';

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
    expect(owned(state, 'stone')).toBeLessThan(1500);
    expect(state.queue).toHaveLength(1);
  });

  it('采集每完成一次都记进日志', () => {
    const s = startHere(newGame(T0, 1), 'mine_stone', { type: 'infinite' });
    const { summary } = advance(s, T0 + 60_000);
    const work = summary.log!.filter((e) => e.kind === 'skill' && e.action === 'mine_stone');
    expect(work.length).toBeGreaterThan(10);
    expect(work.reduce((n, e) => n + (e.items.stone ?? 0), 0)).toBe(summary.items.stone);
    expect(work.every((e) => (e.xp.mining ?? 0) > 0)).toBe(true);
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

  it('战斗日志记下每只怪的经验和掉落，经验合计与总数一致', () => {
    const s = startHere(newGame(T0, 7), 'fight_rabbit', { type: 'time', ms: 10 * 60_000 });
    const { summary } = advance(s, T0 + 10 * 60_000);
    const kills = summary.log!.filter((e) => e.kind === 'kill');
    expect(kills.length).toBe(summary.kills.rabbit);
    expect(kills.every((e) => (e.xp.melee ?? 0) > 0 && Object.keys(e.items).length > 0)).toBe(true);
    const logged = kills.reduce((n, e) => n + (e.xp.melee ?? 0), 0);
    expect(logged).toBeLessThanOrEqual(summary.xp.melee!);
    expect(logged).toBeGreaterThan(summary.xp.melee! * 0.9);
  });

  it('阵亡后回城复活再走回去打，连死 3 次才停止', () => {
    let s = newGame(T0, 3);
    s.bank = {};
    s = startHere(s, 'fight_crystal_dragon', { type: 'infinite' });
    const first = advance(s, T0 + 60_000).state;
    expect(first.stats.deaths).toBe(1);
    expect(first.queue).toHaveLength(1);
    expect(first.travel?.to).toBe(nodeOfAction('fight_crystal_dragon')!.id);
    const { state, summary } = advance(s, T0 + 24 * HOUR);
    expect(summary.deaths).toBe(MAX_DEATH_STREAK);
    expect(summary.taskEnds[0].reason).toBe('death');
    expect(state.queue).toHaveLength(0);
  });

  it('经验/小时估算和实际同一数量级', () => {
    const g = newGame(T0, 11);
    g.xp.melee = XP_TABLE[35];
    const s = startHere(g, 'fight_rabbit', { type: 'infinite' });
    const { summary } = advance(s, T0 + HOUR);
    const est = xpPerHour(s, 'fight_rabbit');
    // 估算不含背包满了回仓库的路程；地图越大这趟越远，所以只要求同一数量级
    expect(summary.xp.melee! / est).toBeGreaterThan(0.3);
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
    s.xp.melee = s.xp.defence = s.xp.hitpoints = XP_TABLE[40];
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

  it('选了不带食物、不带药水：不回仓库补给，战斗中也不吃', () => {
    let s = newGame(T0, 9);
    s.xp.melee = s.xp.defence = s.xp.hitpoints = XP_TABLE[40];
    s.bank.minnow = 300;
    s.bag.minnow = 5;
    s.belt = { potion: { id: 'green_herb_potion', qty: 3 } };
    s.bank.green_herb_potion = 50;
    s.settings.carryFood = 0;
    s.settings.carryPotion = false;
    s = startNow(s, 'fight_grey_wolf', { type: 'time', ms: 10 * 60_000 });
    s.loc = standOf(nodeOfAction('fight_grey_wolf')!);
    expect(advance(s, T0 + 1000).state.travel).toBeNull();
    const { state, summary } = advance(s, T0 + 10 * 60_000);
    expect(summary.bankTrips).toBe(0);
    expect(summary.foodEaten).toBe(0);
    expect(state.bag.minnow).toBe(5);
    expect(state.belt?.potion?.qty).toBe(3);
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

  it('等级加速前快后慢', () => {
    expect(speedForLevel(10)).toBeCloseTo(0.082, 2);
    expect(speedForLevel(100)).toBeCloseTo(0.5, 1);
    expect(speedForLevel(500)).toBeLessThan(0.7);
    expect(speedForLevel(20) - speedForLevel(10)).toBeGreaterThan(speedForLevel(110) - speedForLevel(100));
  });

  it('工具和等级都加快动作', () => {
    const s = newGame(T0, 1);
    const a = ACTIONS.mine_stone as SkillAction;
    const base = actionDuration(s, a);
    s.equipment.pickaxe = 'wood_pickaxe';
    expect(actionDuration(s, a)).toBe(Math.round(a.durationMs / (1 + 0.04 + speedForLevel(1))));
    s.xp.mining = XP_TABLE[140];
    expect(actionDuration(s, a)).toBe(Math.round(a.durationMs / (1 + 0.04 + speedForLevel(140))));
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

  it('5088 地图的存档：位置整体平移进 8848 中间的老方框', async () => {
    const { OLD_BOX } = await import('./data');
    const old = { ...newGame(T0, 1), mapSize: 5088, loc: { x: 2500, y: 2600 } };
    const s = migrate(old)!;
    expect(s.loc).toEqual({ x: 2500 + OLD_BOX.x, y: 2600 + OLD_BOX.y });
    expect(s.mapSize).toBe(8848);
  });

  it('两座城的仓库、集市都能用，背包满了回最近的仓库', async () => {
    const { NODES } = await import('./data');
    const { nearestBank, atMarket } = await import('./sim');
    const bank2 = NODES.find((n) => n.id === 'bank2')!;
    const market2 = NODES.find((n) => n.id === 'market2')!;
    const s = newGame(T0, 1);
    s.loc = standOf(bank2);
    expect(atBank(s)).toBe(true);
    s.loc = standOf(market2);
    expect(atMarket(s)).toBe(true);
    expect(nearestBank(standOf(NODES.find((n) => n.id === 'golden_plain')!)).id).toBe('bank2');
    expect(nearestBank(bankStand()).id).toBe('bank');
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

describe('手动寻路', () => {
  it('关掉游戏也会走完', () => {
    let s = newGame(T0, 1);
    s = startWalk(s, { x: 100, y: 100 }, { x: 140, y: 100 }, 10_000);
    const mid = advance(s, T0 + 5000).state;
    expect(walkPos(mid)).toEqual({ x: 120, y: 100 });
    const end = advance(s, T0 + 60_000).state;
    expect(end.walk).toBeNull();
    expect(end.loc).toEqual({ x: 140, y: 100 });
  });

  it('开始干活时从走到的地方出发', () => {
    let s = newGame(T0, 1);
    s = startWalk(s, { x: 100, y: 100 }, { x: 140, y: 100 }, 10_000);
    s = advance(s, T0 + 5000).state;
    s = startNow(s, 'chop_plain', { type: 'infinite' });
    const r = advance(s, T0 + 5001).state;
    expect(r.walk).toBeNull();
    expect(r.travel?.total).toBe(travelMs({ x: 120, y: 100 }, standOf(nodeOfAction('chop_plain')!)));
  });
});

describe('集市', () => {
  it('只有站在集市旁才能卖', () => {
    let s = newGame(T0, 1);
    s.bank.copper_ore = 10;
    expect(sell(s, 'copper_ore', 10)).toBe(s);
    s.loc = marketStand();
    s = sell(s, 'copper_ore', 10);
    expect(s.bank.copper_ore).toBeUndefined();
  });
});

describe('新手任务', () => {
  it('砍够 10 个原木就完成第一个任务并发金币', () => {
    let s = newGame(T0, 1);
    const coins = s.bank.coins ?? 0;
    s = startHere(s, 'chop_plain', { type: 'infinite' });
    const { state, summary } = advance(s, T0 + HOUR);
    expect(state.quest!.i).toBeGreaterThanOrEqual(1);
    expect(summary.quests).toContain(0);
    expect(state.bank.coins).toBeGreaterThanOrEqual(coins + 30);
  });
});

describe('料理与栏位', () => {
  it('吃料理回血并挂上增益，增益随时间消失', () => {
    let s = newGame(T0, 1);
    s.bag.dish_loach = 1;
    s.hp = 10;
    s = eat(s, 'dish_loach');
    expect(s.hp).toBeGreaterThan(10);
    expect(s.buffs?.def?.pct).toBeGreaterThan(0);
    const later = advance(s, T0 + 60 * 60_000).state;
    expect(later.buffs?.def).toBeUndefined();
  });

  it('食物栏不占背包格子，战斗先吃食物栏', () => {
    let s = newGame(T0, 9);
    s.bag = { minnow: 50 };
    s = toBelt(s, 'minnow');
    expect(s.belt?.food).toEqual({ id: 'minnow', qty: 50 });
    expect(bagSlotsUsed(s.bag)).toBe(0);
    s.bank = {};
    s = startHere(s, 'fight_grey_wolf', { type: 'time', ms: 10 * 60_000 });
    const { state, summary } = advance(s, T0 + 10 * 60_000);
    expect(summary.foodEaten).toBeGreaterThan(0);
    expect(state.belt?.food?.qty ?? 0).toBe(50 - summary.foodEaten);
  });
});

describe('种植', () => {
  const atFarm = (g: ReturnType<typeof newGame>) => {
    const n = FARM_NODES[0];
    g.loc = { x: n.x, y: n.y };
    return g;
  };

  it('站在田边一格一格地种，种子先用背包再用仓库；离田太远种不了', () => {
    const g = newGame(T0, 3);
    const plot = plotsOf('farm')[0].id;
    expect(tendPlot(g, plot, 'potato', T0).state.farm?.[plot]).toBeUndefined();
    const { state } = tendPlot(atFarm(g), plot, 'potato', T0);
    expect(state.farm?.[plot]?.crop).toBe('potato');
    expect(state.bank.seed_potato).toBe(9);
    // 等级不够的作物种不了
    state.bank.seed_lingzhi = 1;
    const other = plotsOf('farm')[1].id;
    expect(tendPlot(state, other, 'carrot', T0).state.farm?.[other]).toBeUndefined();
  });

  it('浇水长得快，熟了收获拿作物、经验和日志；没熟收不了', () => {
    const s = atFarm(newGame(T0, 3));
    let r = plantAll(s, 'farm', 'potato', T0);
    expect(fieldCounts(r.state, 'farm', T0).growing).toBe(10);
    const plot = Object.keys(r.state.farm!)[0];
    const dry = r.state.farm![plot].ripe;
    r = waterAll(r.state, 'farm', T0);
    const wet = r.state.farm![plot].ripe;
    expect(wet - T0).toBeCloseTo((dry - T0) * (1 - WATER_SPEEDUP), -1);
    expect(harvestAll(r.state, 'farm', T0 + 1000).summary.items.potato).toBeUndefined();
    const h = harvestAll(r.state, 'farm', wet);
    expect(h.summary.items.potato).toBeGreaterThanOrEqual(20);
    expect(h.summary.xp.farming).toBeGreaterThan(0);
    expect(h.summary.log?.length).toBe(1);
    expect(h.summary.log?.[0].n).toBe(10);
    expect(Object.keys(h.state.farm ?? {}).length).toBe(0);
  });

  it('一整块田种满时，每小时经验和别的采集差不多', () => {
    const c = CROP_DEFS.potato;
    const perHour = (56 * c.xp * 3_600_000) / c.growMs;
    expect(perHour).toBeGreaterThan(xpPerHour(newGame(T0, 3), 'chop_plain') * 0.5);
  });

  it('自动补种：离线时熟了自己收、再种，作物进仓库，种子用完就停', () => {
    const g = atFarm(newGame(T0, 3));
    g.settings.autoFarm = { farm: true };
    const r = plantAll(g, 'farm', 'potato', T0);
    expect(r.state.bank.seed_potato ?? 0).toBe(0);
    const s = { ...r.state, loc: bankStand() };
    const { state, summary } = advance(s, T0 + 3 * 3_600_000);
    expect(summary.items.potato).toBeGreaterThan(20);
    expect(state.bank.potato).toBe(summary.items.potato);
    expect(summary.log?.every((e) => e.crop === 'potato' && e.auto)).toBe(true);
    // 分几次结算结果一样
    const a = advance(advance(s, T0 + 3_600_000).state, T0 + 3 * 3_600_000).state;
    expect(a.bank.potato).toBe(state.bank.potato);
    expect(a.farm).toEqual(state.farm);
  });

  it('集市才能买种子，金币从仓库扣', () => {
    const g = newGame(T0, 3);
    expect(buySeed(g, 'seed_carrot', 1)).toBe(g);
    g.loc = marketStand();
    const s = buySeed(g, 'seed_carrot', 1);
    expect(s.bank.seed_carrot).toBe(1);
    expect(s.bank.coins).toBeLessThan(g.bank.coins);
    expect(buySeed(g, 'seed_lingzhi', 1)).toBe(g);
  });
});

describe('漏洞排查', () => {
  it('系统时间往回调不会再结算一次离线收益', () => {
    const log = (ACTIONS.chop_plain as SkillAction).outputs[0].item;
    let s = startHere(newGame(T0), 'chop_plain', { type: 'infinite' });
    s = advance(s, T0 + HOUR).state;
    const logs = owned(s, log) ?? 0;
    expect(logs).toBeGreaterThan(0);
    // 往回调一小时：什么都不发生，时间也不倒退
    const back = advance(s, T0).state;
    expect(back.lastTick).toBe(s.lastTick);
    // 再调回原来的时间：没有多出来的收益
    expect(owned(advance(back, T0 + HOUR).state, log) ?? 0).toBe(logs);
  });

  it('随机乱点一通：仓库背包不会出现负数、小数或 NaN，血量不越界', () => {
    const ids = Object.keys(ACTIONS);
    let seed = 12345;
    const r = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    let s = newGame(T0);
    let now = T0;
    for (let i = 0; i < 400; i++) {
      const k = r();
      const anyItem = Object.keys({ ...s.bank, ...s.bag })[Math.floor(r() * 20)] ?? 'coins';
      if (k < 0.2) s = startNow(s, ids[Math.floor(r() * ids.length)], { type: 'infinite' });
      else if (k < 0.3) s = setLoc(s, marketStand().x, marketStand().y);
      else if (k < 0.4) s = setLoc(s, bankStand().x, bankStand().y);
      else if (k < 0.5) s = sell(s, anyItem, Math.floor(r() * 50) - 5);
      else if (k < 0.55) s = buySeed(s, 'seed_potato', Math.floor(r() * 5) - 1);
      else if (k < 0.6) s = toBag(s, anyItem, Math.floor(r() * 300));
      else if (k < 0.65) s = toBank(s, anyItem, Math.floor(r() * 300));
      else if (k < 0.7) s = equip(s, anyItem);
      else if (k < 0.72) s = unequip(s, 'weapon');
      else if (k < 0.75) s = toBelt(s, anyItem);
      else if (k < 0.78) s = eat(s, anyItem);
      else if (k < 0.8) s = leaveWork(s);
      else if (k < 0.82) s = resumeWork(s);
      else if (k < 0.85) s = depositLoot(s);
      else {
        now += Math.floor(r() * 20 * 60_000);
        s = advance(s, now).state;
      }
      for (const rec of [s.bank, s.bag]) {
        for (const [id, q] of Object.entries(rec)) expect(Number.isInteger(q) && q > 0, `${i} ${id}=${q}`).toBe(true);
      }
      expect(s.hp > 0 && Number.isFinite(s.hp)).toBe(true);
      expect(Number.isFinite(s.rng)).toBe(true);
    }
  });

  it('打开宝箱：扣掉宝箱，金币进仓库，东西进背包', () => {
    const s0 = newGame(0, 7);
    s0.bag = { chest_1: 3 };
    const [s1, got] = openContainer(s0, 'chest_1', 'bag', 2);
    expect(s1.bag.chest_1).toBe(1);
    expect(got.coins).toBeGreaterThan(0);
    expect(s1.bank.coins).toBe((s0.bank.coins ?? 0) + got.coins);
    const items = Object.keys(got).filter((k) => k !== 'coins');
    expect(items.length).toBeGreaterThan(0);
    for (const k of items) expect((s1.bag[k] ?? 0) + (s1.bank[k] ?? 0) - (s0.bank[k] ?? 0)).toBe(got[k]);
  });
});

describe('坐骑和兑换码', () => {
  it('兑换码只能领一次，装上坐骑骑乘后移动速度翻倍', () => {
    let s = newGame(0, 1);
    expect(redeemCode(s, '乱写的').ok).toBe(false);
    const r = redeemCode(s, ' 中国人能飞 ');
    expect(r.ok).toBe(true);
    s = r.state;
    expect(s.bag.mount_danmark).toBe(1);
    expect(redeemCode(s, '中国人能飞').ok).toBe(false);
    expect(toggleMount(s)).toBe(s);
    s = equip(s, 'mount_danmark');
    expect(s.equipment.mount).toBe('mount_danmark');
    const walk = moveSpeed(s);
    s = toggleMount(s);
    expect(moveSpeed(s)).toBeCloseTo(walk * 2.6);
    s = unequip(s, 'mount');
    expect(s.mounted).toBe(false);
    expect(moveSpeed(s)).toBe(walk);
  });
});

describe('传说石碑', () => {
  it('城里那座一开始就激活；走到别的石碑旁才激活，之后能在石碑之间传送', async () => {
    const { WAYSTONES, standOf: st } = await import('./data');
    const { unlockWaystone, useWaystone, atWaystone } = await import('./sim');
    const g = newGame(T0, 3);
    expect(g.waystones).toEqual(['stone_town']);
    const far = WAYSTONES.find((n) => n.id !== 'stone_town')!;
    // 没激活：传不过去
    g.loc = st(WAYSTONES[0]);
    expect(atWaystone(g)?.id).toBe('stone_town');
    expect(useWaystone(g, far.id)).toBe(g);
    // 走到那边激活（离线寻路到达也算）
    const walked = advance({ ...g, walk: { from: g.loc, to: st(far), ms: 1000, total: 1000 } }, T0 + 2000);
    expect(walked.summary.waystones).toEqual([far.id]);
    expect(unlockWaystone(g, { x: 0, y: 0 }).got).toEqual([]);
    // 回到城里石碑旁，再传过去；正在做的工作暂停
    const s = startHere({ ...walked.state, loc: st(WAYSTONES[0]) }, 'fish_minnow', { type: 'infinite' });
    s.loc = st(WAYSTONES[0]);
    const t = useWaystone(s, far.id);
    expect(t.loc).toEqual(st(far));
    expect(t.paused).toBe(true);
    expect(t.queue.length).toBe(1);
    // 不站在石碑旁传不了
    expect(useWaystone({ ...t, loc: { x: 0, y: 0 } }, 'stone_town').loc).toEqual({ x: 0, y: 0 });
  });
});

describe('雨天钓鱼', () => {
  it('钓点下雨时钓鱼更快，别的技能不受影响', async () => {
    const { isRaining, RAIN_FISH } = await import('./weather');
    const s = newGame(T0, 1);
    const fish = ACTIONS.fish_minnow as SkillAction;
    const region = nodeOfAction('fish_minnow', s.loc)!.region;
    let wet = T0;
    while (!isRaining(region, wet)) wet += 8 * 60_000;
    let dry = T0;
    while (isRaining(region, dry)) dry += 8 * 60_000;
    expect(actionDuration(s, fish, wet)).toBeLessThan(actionDuration(s, fish, dry));
    expect(rainBonus(s, fish, wet)).toBe(RAIN_FISH);
    expect(rainBonus(s, ACTIONS.mine_stone as SkillAction, wet)).toBe(0);
  });
});

describe('界面传来的数量', () => {
  it('NaN、负数、小数不会把仓库弄坏', () => {
    let s = newGame(0);
    s.loc = marketStand();
    s.bank.copper_ore = 10;
    for (const q of [NaN, -3, 0]) expect(sell(s, 'copper_ore', q)).toBe(s);
    s = sell(s, 'copper_ore', 2.7);
    expect(s.bank.copper_ore).toBe(8);
    expect(Number.isInteger(s.bank.coins)).toBe(true);
    expect(enqueue(s, 'mine_stone', { type: 'count', count: NaN })).toBe(s);
  });
  it('换食物栏时背包满了不会留下数量为 0 的格子', () => {
    let s = newGame(0);
    s.loc = bankStand();
    s.belt = { food: { id: 'minnow', qty: 5 } };
    for (let i = 0; i < 40; i++) s.bag[`copper_ore`] = 2000;
    s.bank.steak_1 = 5;
    s = toBelt(s, 'steak_1');
    expect(Object.values(s.bag).every((q) => q > 0)).toBe(true);
  });
});

