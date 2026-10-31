import { actionDuration, advance, buySeed, eat, toBelt, sell, marketStand, startWalk, walkPos, MAX_DEATH_STREAK, atBank, bankStand, toBank, depositLoot, leaveWork, resumeWork, setLoc, bagSlotsUsed, enqueue, equip, migrate, newGame, startNow, toBag, unequip, xpPerHour, openContainer, redeemCode, toggleMount, moveSpeed, rainBonus, summonPumpkin, buyPumpkinMount, buyReaperSkin, buyHwSkin, placeFoal, collectHorse, RANCH_NODE, bagRoomFor, playerAttackMs, playerBonuses, salvage, salvageValue, sortBank, SALVAGE_NODES, SALVAGE_BONUS, startAt } from './sim';
import { baseOf, qid, qualityOdds, rollQuality } from './quality';
import { claimMail, clearMail, GIFTS, HW_DAILY_BOXES, stepMail, unreadMail } from './mail';
import { HW_BOX, HW_END, HW_MOUNT, HW_MOUNT_COST, HW_POINT, HW_REVEAL, HW_SKIN_COST, HW_TIERS, hwFight } from './halloween';
import { APT_MAX, APT_MIN, aptOf, FOAL, FOAL_MS, growMs, HORSE_XP } from './ranch';
import { SPECIES } from './bestiary';
import { levelForXp, speedForLevel, XP_TABLE } from './xp';
import type { GameState, SkillAction, TaskMode } from './types';
import { MONSTERS, ACTIONS, ITEMS, CROP_DEFS, FARM_NODES, NODES, nodeOfAction, nodesOfAction, plotsOf, standOf, travelMs, WATER_SPEEDUP } from './data';
import { fieldCounts, harvestAll, installSprinkler, plantAll, stepRain, tendPlot, waterAll } from './farm';
import { isRaining } from './weather';

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
  it('物品来源点寻路：去指定的那个点位并直接开工（不是只走过去发呆）', () => {
    const s = newGame(0, 1);
    const ns = nodesOfAction('mine_stone');
    const far = ns[ns.length - 1];
    const s1 = startAt(s, 'mine_stone', far.id);
    expect(s1.queue[0].action).toBe('mine_stone');
    expect(s1.travel?.to).toBe(far.id);
    const r = advance(s1, s1.travel!.ms + 60_000);
    expect(r.state.loc).toEqual(standOf(far));
    expect(r.state.xp.mining).toBeGreaterThan(0);
  });
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

  it('阵亡后在离得最近的城镇复活（10-27 以前总回苍岭城）', () => {
    const bank2 = NODES.find((n) => n.id === 'bank2')!;
    const strong = (id: string) => { const a = ACTIONS[id]; return a.kind === 'combat' && MONSTERS[a.monster].level >= 40 && !MONSTERS[a.monster].event; };
    const near = NODES.filter((n) => n.actions.some(strong) && !n.sea)
      .sort((a, b) => Math.hypot(a.x - bank2.x, a.y - bank2.y) - Math.hypot(b.x - bank2.x, b.y - bank2.y))[0];
    const fight = near.actions.find(strong)!;
    let s = newGame(T0, 3);
    s.bank = {};
    s.hp = 1;
    s = startAt(s, fight, near.id);
    s.loc = standOf(near);
    s.travel = null;
    let t = T0;
    while (s.stats.deaths === 0 && t < T0 + HOUR) { t += 1000; s = advance(s, t).state; s.hp = Math.min(s.hp, 1); }
    expect(s.stats.deaths).toBe(1);
    const banks = NODES.filter((n) => n.opens === 'bank').sort((a, b) => travelMs(standOf(near), standOf(a)) - travelMs(standOf(near), standOf(b)));
    expect(banks[0].id).not.toBe('bank');
    expect(s.loc).toEqual(standOf(banks[0]));
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
    // 邮件时间只是显示用（任务奖励按结算到的时刻记），比较时去掉
    const noAt = (g: GameState) => ({ ...g, mail: g.mail?.map((m) => ({ ...m, at: 0 })) });
    const once = advance(s, T0 + total).state;
    const many = chunked(s, total, 250);
    expect(noAt(many)).toEqual(noAt(once));
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
    for (const [i, id] of ['minnow', 'shrimp', 'carp', 'trout', 'bass', 'cod', 'salmon', 'eel', 'lava_eel', 'ghostfish', 'abyssfish', 'loach'].entries()) s.bag[`raw_${id}`] = 200;
    expect(bagSlotsUsed(s.bag)).toBe(24);
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

  it('背包 24 格、每格 100 个', () => {
    let s = newGame(T0, 1);
    s.bank.minnow = 5000;
    s.loc = bankStand();
    s = toBag(s, 'minnow', 5000);
    expect(s.bag.minnow).toBe(2400);
  });

  it('远程和魔法不用带弹药，直接打并练对应技能（弹药 10-25 删掉）', () => {
    for (const [weapon, skill] of [['wood_shortbow', 'ranged'], ['wood_staff', 'magic']] as const) {
      const s = newGame(T0, 2);
      s.equipment.weapon = weapon;
      const { summary } = advance(startHere(s, 'fight_dummy', { type: 'infinite' }), T0 + HOUR);
      expect(summary.taskEnds).toEqual([]);
      expect(summary.xp[skill]).toBeGreaterThan(0);
      expect(summary.xp.melee).toBeUndefined();
    }
  });

  it('旧存档里的箭和符文折成金币存进仓库', () => {
    const old = { ...newGame(T0, 1), bank: { wood_arrow: 80, runic_rune: 10, crystal_rune_3: 5, coins: 0 }, bag: { copper_arrowhead: 24, shaft: 30 } };
    const s = migrate(JSON.parse(JSON.stringify(old)))!;
    expect(s.bank.wood_arrow).toBeUndefined();
    expect(s.bag.shaft).toBeUndefined();
    // 80×1 + 10×32 + 5×6 + 24×1 + 30×1
    expect(s.bank.coins).toBe(80 + 10 * 32 + 5 * 6 + 24 + 30);
    // 再读一次不会重复退钱
    expect(migrate(JSON.parse(JSON.stringify(s)))!.bank.coins).toBe(s.bank.coins);
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
    expect(s.mapSize).toBe(12080);
  });

  it('8848 地图的存档：位置整体平移进 12080 中间', async () => {
    const { MID_BOX } = await import('./data');
    const old = { ...newGame(T0, 1), mapSize: 8848, loc: { x: 4000, y: 5000 } };
    const s = migrate(old)!;
    expect(s.loc).toEqual({ x: 4000 + MID_BOX.x, y: 5000 + MID_BOX.y });
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
    s.bag = { sapphire: 2300 };
    const { state, summary } = advance(s, T0 + HOUR);
    expect(summary.bankTrips).toBeGreaterThan(0);
    expect(state.bank.sapphire).toBe(2300);
    expect(owned(state, 'stone')).toBe(summary.items.stone);
    expect(Object.values(state.bag).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(2400);
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
  it('砍够 10 个原木就完成第一个任务，金币奖励发到邮箱', () => {
    let s = newGame(T0, 1);
    const coins = s.bank.coins ?? 0;
    s = startHere(s, 'chop_plain', { type: 'infinite' });
    const { state, summary } = advance(s, T0 + HOUR);
    expect(state.quest!.i).toBeGreaterThanOrEqual(1);
    expect(summary.quests).toContain(0);
    const m = state.mail!.find((x) => x.kind === 'quest' && x.arg === '0')!;
    expect(m.items).toEqual([{ item: 'coins', qty: 30 }]);
    const [after] = claimMail(state, 'all', bagRoomFor);
    expect(after.bank.coins).toBeGreaterThanOrEqual(coins + 30);
    expect(claimMail(after, 'all', bagRoomFor)[0]).toBe(after);
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

  it('每块田 24 格；去掉的格子里种着的作物读档时退回仓库', () => {
    expect(plotsOf('farm').length).toBe(24);
    const g = newGame(T0, 3) as GameState;
    g.farm = { 'farm:0': { crop: 'potato', at: T0, ripe: T0 + 1 } };
    const m = migrate(JSON.parse(JSON.stringify(g)))!;
    expect(m.farm?.['farm:0']).toBeUndefined();
    expect(m.bank.potato).toBe(2);
  });

  it('施肥长得快、用掉肥料；高级肥料多收 1 个', () => {
    const s = atFarm(newGame(T0, 3));
    s.bank.fert_basic = 1;
    s.bank.fert_rich = 1;
    s.bank.seed_potato = 3;
    s.settings.farmFert = { farm: 'fert_rich' };
    const plain = plantAll({ ...s, settings: { ...s.settings, farmFert: {} } }, 'farm', 'potato', T0).state;
    const r = plantAll(s, 'farm', 'potato', T0).state;
    const ids = plotsOf('farm').map((p) => p.id).filter((id) => r.farm?.[id]);
    const fed = ids.find((id) => r.farm![id].fert === 2)!;
    expect(r.bank.fert_rich).toBeUndefined();
    expect(r.farm![fed].ripe - T0).toBeLessThan(plain.farm![fed].ripe - T0);
    const one = (st: GameState, id: string) => tendPlot(st, id, undefined, T0 + 1e9).summary.items.potato ?? 0;
    // 同一格同一时刻种下，收获随机数一样，只差肥料那 1 个
    expect(one(r, fed) - one(plain, fed)).toBe(1);
  });

  it('洒水器：装上后新种的自动浇水，已经种着的也浇一遍', () => {
    const s = atFarm(newGame(T0, 3));
    s.bank.sprinkler = 1;
    let r = plantAll(s, 'farm', 'potato', T0).state;
    r = installSprinkler(r, 'farm', T0).state;
    expect(r.sprinklers).toEqual(['farm']);
    expect(r.bank.sprinkler).toBeUndefined();
    expect(Object.values(r.farm!).every((p) => p.water)).toBe(true);
  });

  it('下雨自动浇水', () => {
    let t = T0;
    while (!isRaining(FARM_NODES[0].region, t)) t += 8 * 60_000;
    const s = plantAll(atFarm(newGame(t, 3)), 'farm', 'potato', t).state;
    stepRain(s, t, t + 1000);
    expect(Object.values(s.farm!).every((p) => p.water)).toBe(true);
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
    expect(s.bag.mount_danmark).toBeUndefined();
    s = claimMail(s, s.mail![0].id, bagRoomFor)[0];
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
  it('自动寻路在所有已激活石碑里挑最快的一对，只要比走路快就用', async () => {
    const { WAYSTONES, planRoute, standOf: st, STONE_JUMP_MS } = await import('./data');
    const all = WAYSTONES.map((n) => n.id);
    for (const from of WAYSTONES.slice(0, 6)) for (const to of WAYSTONES.slice(-6)) {
      const a = st(from);
      const b = { x: st(to).x + 3, y: st(to).y };
      const r = planRoute(all, a, b);
      // 至少不比「起点石碑直接传到终点石碑」慢
      expect(r.ms).toBeLessThanOrEqual(Math.min(travelMs(a, b), STONE_JUMP_MS + travelMs(st(to), b)));
      if (from !== to) expect(r.via).toBeDefined();
    }
    // 只激活一座：只能走路
    expect(planRoute(['stone_town'], st(WAYSTONES[0]), st(WAYSTONES[WAYSTONES.length - 1])).via).toBeUndefined();
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


describe('读档保留', () => {
  it('暂停状态和停工提示刷新后还在', () => {
    let s = newGame(T0);
    s = startNow(s, 'cook_minnow', { type: 'infinite' });
    s.paused = true;
    s.lastStop = { action: 'cook_minnow', reason: 'noInput', mode: { type: 'infinite' }, item: 'raw_minnow', at: T0 };
    const m = migrate(JSON.parse(JSON.stringify(s)))!;
    expect(m.paused).toBe(true);
    expect(m.lastStop?.item).toBe('raw_minnow');
  });
});

describe('补给带太多不会卡住', () => {
  it('仓库里食物种类很多、设成全部带上，打怪照样能打，结算也不会卡', () => {
    let s = newGame(T0, 1);
    for (const id of Object.keys(ITEMS).filter((i) => ITEMS[i].heals).slice(0, 25)) s.bank[id] = 50;
    s.settings.carryFood = -1;
    s = startNow(s, 'fight_old_ram', { type: 'infinite' });
    const t = performance.now();
    const r = advance(s, T0 + HOUR).state;
    expect(performance.now() - t).toBeLessThan(1500);
    expect(r.stats.kills).toBeGreaterThan(0);
  });
});

describe('弹药很多时不来回跑', () => {
  it('界面每 0.2 秒结算一次，带满背包的箭也能正常打，不会存箭、拿箭来回跑', () => {
    const bow = Object.keys(ITEMS).find((i) => ITEMS[i].equip?.style === 'ranged')!;
    const arrows = Object.keys(ITEMS).filter((i) => ITEMS[i].ammo?.style === 'ranged').slice(0, 3);
    let s = newGame(T0, 1);
    s.equipment.weapon = bow;
    for (const a of arrows) s.bank[a] = 3000;
    s.settings.carryFood = 0;
    s = startNow(s, 'fight_field_mouse', { type: 'infinite' });
    let trips = 0;
    for (let t = 200; t <= 600_000; t += 200) { const r = advance(s, T0 + t); s = r.state; trips += r.summary.bankTrips; }
    expect(s.stats.kills).toBeGreaterThan(10);
    expect(trips).toBeLessThan(4);
  });
});

describe('战斗优化（10-24）', () => {
  it('暴击基础 5%，皮甲加闪避，板甲减伤', async () => {
    const { combatStats, armorPerks, combatEstimate } = await import('./sim');
    const { MONSTERS } = await import('./data');
    const m = MONSTERS.field_mouse;
    let s = newGame(T0, 1);
    s.equipment.weapon = 'wood_dagger';
    expect(combatStats(s, m).crit).toBeCloseTo(0.05);
    const leather = Object.keys(ITEMS).filter((i) => ITEMS[i].equip?.armor === 'leather');
    const plate = Object.keys(ITEMS).filter((i) => ITEMS[i].equip?.armor === 'plate');
    s.equipment.body = leather.find((i) => ITEMS[i].equip!.slot === 'body');
    expect(armorPerks(s).dodge).toBeCloseTo(0.05);
    s.equipment.body = plate.find((i) => ITEMS[i].equip!.slot === 'body');
    expect(armorPerks(s).reduce).toBeCloseTo(0.03);
    const e = combatEstimate(s, m);
    expect(['轻松', '适中']).toContain(e.rating);
    expect(e.perHour).toBeGreaterThan(100);
  });
  it('打一阵会出暴击', () => {
    let s = newGame(T0, 3);
    s.equipment.weapon = 'wood_sword';
    s = startHere(s, 'fight_field_mouse', { type: 'infinite' });
    let crit = false;
    for (let t = 500; t < 600_000 && !crit; t += 500) {
      s = advance(s, T0 + t).state;
      if (s.combat?.pCrit) crit = true;
    }
    expect(crit).toBe(true);
  });
});

describe('怪物招式', () => {
  it('首领会用毁灭一击、残血狂怒', async () => {
    const { MONSTERS } = await import('./data');
    const boss = Object.values(MONSTERS).find((m) => m.rank === 'boss')!;
    let b = newGame(T0, 6);
    for (const k of Object.keys(b.xp)) (b.xp as Record<string, number>)[k] = 5_000_000;
    b.hp = 10_000;
    b = startHere(b, `fight_${boss.id}`, { type: 'infinite' });
    let big = false, enrage = false;
    for (let t = 500; t < 1_800_000 && !(big && enrage); t += 500) { b = advance(b, T0 + t).state; if (b.combat?.mArt === 'boss') big = true; if (b.combat?.enraged) enrage = true; }
    expect(big).toBe(true);
    expect(enrage).toBe(true);
  });
});

describe('万圣节南瓜王', () => {
  const strong = () => {
    const s = newGame(T0, 1);
    for (const k of ['melee', 'defence', 'hitpoints', 'ranged', 'magic'] as const) s.xp[k] = XP_TABLE[120];
    s.hp = 9999;
    return s;
  };
  it('召唤后排成当前任务；冷却 1 小时内不能再召唤；活动结束后不能召唤', () => {
    const s = summonPumpkin(strong(), 0, T0);
    expect(s.queue[0].action).toBe(hwFight(0));
    expect(s.halloween).toEqual({ summoned: 0, last: T0 });
    expect(summonPumpkin(s, 1, T0 + HOUR - 1)).toBe(s);
    expect(summonPumpkin(s, 1, T0 + HOUR).halloween?.summoned).toBe(1);
    expect(summonPumpkin(strong(), 0, HW_END)).toEqual(strong());
  });
  it('死神皮肤：公开后用南瓜积分换一次，换完直接穿上，积分不够或已经换过都不动', () => {
    const s = strong();
    s.bank[HW_POINT] = HW_SKIN_COST + 3;
    expect(buyReaperSkin(s, HW_REVEAL - 1)).toBe(s);
    const a = buyReaperSkin(s, HW_REVEAL);
    expect(a.bank[HW_POINT]).toBe(3);
    expect(a.halloween?.skins).toEqual(['reaper']);
    expect(a.settings.skin).toBe('reaper');
    a.bank[HW_POINT] = HW_SKIN_COST;
    expect(buyReaperSkin(a, HW_END + 1)).toBe(a);
    const poor = strong();
    poor.bank[HW_POINT] = HW_SKIN_COST - 1;
    expect(buyReaperSkin(poor, HW_REVEAL)).toBe(poor);
    // 第二套棺材伯爵另算，老存档上 skin: true 的死神不会被再卖一次
    const old = strong();
    old.halloween = { skin: true };
    old.bank[HW_POINT] = HW_SKIN_COST * 2;
    expect(buyHwSkin(old, 'reaper', HW_REVEAL)).toBe(old);
    const c = buyHwSkin(old, 'coffin', HW_REVEAL);
    expect(c.halloween?.skins).toEqual(['coffin']);
    expect(c.settings.skin).toBe('coffin');
    expect(buyHwSkin(c, 'coffin', HW_REVEAL)).toBe(c);
    expect(buyHwSkin(c, 'nope', HW_REVEAL)).toBe(c);
  });
  it('南瓜坐骑：公开前换不了，公开后积分够才能换，每个存档一只，移速 +200%', () => {
    const s = strong();
    s.bank[HW_POINT] = HW_MOUNT_COST + 5;
    expect(buyPumpkinMount(s, HW_REVEAL - 1)).toBe(s);
    const a = buyPumpkinMount(s, HW_REVEAL);
    expect(a.bank[HW_MOUNT]).toBe(1);
    expect(a.bank[HW_POINT]).toBe(5);
    expect(a.halloween?.mount).toBe(true);
    a.bank[HW_POINT] = HW_MOUNT_COST;
    expect(buyPumpkinMount(a, HW_END + 1)).toBe(a);
    const poor = strong();
    poor.bank[HW_POINT] = HW_MOUNT_COST - 1;
    expect(buyPumpkinMount(poor, HW_REVEAL)).toBe(poor);
    // 召唤南瓜王不会把兑换记录冲掉
    expect(summonPumpkin(a, 0, T0).halloween?.mount).toBe(true);
    a.bag[HW_MOUNT] = 1;
    let r = equip(a, HW_MOUNT);
    r = toggleMount(r, true);
    expect(moveSpeed(r)).toBeCloseTo(moveSpeed(strong()) * 3);
  });
  it('打赢一次就离开，掉对应数量的礼盒；礼盒开出的积分直接进仓库', () => {
    let s = summonPumpkin(strong(), 0, T0);
    s.loc = standOf(nodeOfAction(hwFight(0))!);
    s.queue[0].stocked = true;
    s = advance(s, T0 + 30 * 60_000).state;
    expect(s.lastStop?.reason ?? 'none').toBe('complete');
    expect(s.halloween?.summoned).toBeUndefined();
    expect(s.queue.length).toBe(0);
    expect(owned(s, HW_BOX)).toBe(HW_TIERS[0].boxes);
    const [o] = openContainer(s, HW_BOX, s.bag[HW_BOX] ? 'bag' : 'bank');
    expect(o.bank[HW_POINT]).toBeGreaterThanOrEqual(8);
    expect(o.bag[HW_POINT]).toBeUndefined();
  });
  it('没召唤就排南瓜王：任务直接停下', () => {
    let s = startHere(strong(), hwFight(0), { type: 'infinite' });
    s = advance(s, T0 + 60_000).state;
    expect(s.queue.length).toBe(0);
    expect(s.lastStop?.reason).toBe('summon');
  });
});

describe('畜牧站养马', () => {
  const atRanch = () => {
    const s = newGame(T0, 7);
    s.loc = standOf(RANCH_NODE);
    s.bag[FOAL] = 2;
    s.bank[FOAL] = 1;
    return s;
  };
  it('野马会掉小马崽', () => {
    const horses = SPECIES.filter((x) => x.horse);
    expect(horses.length).toBe(3);
    for (const h of horses) expect(MONSTERS[h.id].drops.map((d) => d.item)).toContain(FOAL);
  });
  it('放进马栏：先用背包，栏满或不在畜牧站不能放；1 级要 1 小时，养殖等级越高越快', () => {
    let s = placeFoal(atRanch(), 0, T0);
    expect(s.bag[FOAL]).toBe(1);
    expect(s.ranch?.pens[0]).toEqual({ start: T0, ms: FOAL_MS });
    expect(placeFoal(s, 0, T0)).toBe(s);
    const far = { ...atRanch(), loc: { x: 0, y: 0 } };
    expect(placeFoal(far, 0, T0)).toBe(far);
    s = placeFoal(placeFoal(s, 1, T0), 2, T0);
    expect(s.bag[FOAL]).toBeUndefined();
    expect(s.bank[FOAL]).toBeUndefined();
    expect(growMs(50)).toBeLessThan(growMs(10));
    expect(growMs(1000)).toBe(FOAL_MS * 0.4);
  });
  it('没长大不能牵走；长大后资质在 50-200 之间，给养殖经验，马能装备加移速', () => {
    const s = placeFoal(atRanch(), 0, T0);
    expect(collectHorse(s, 0, T0 + FOAL_MS - 1)[1]).toBe(0);
    const apts = new Set<number>();
    let g = s;
    for (let i = 0; i < 40; i++) {
      const [n, apt] = collectHorse(g, 0, T0 + FOAL_MS);
      expect(apt).toBeGreaterThanOrEqual(APT_MIN);
      expect(apt).toBeLessThanOrEqual(APT_MAX);
      expect(n.xp.husbandry).toBe(HORSE_XP);
      expect(n.ranch?.pens[0]).toBeNull();
      const id = Object.keys(n.bag).find((k) => aptOf(k))!;
      expect(aptOf(id)).toBe(apt);
      expect(ITEMS[id].equip?.move).toBeCloseTo(apt / 100);
      apts.add(apt);
      g = { ...s, rng: n.rng };
    }
    expect(apts.size).toBeGreaterThan(10);
  });
  it('旧存档没有马栏也能读', () => {
    const s = migrate(JSON.parse(JSON.stringify({ ...newGame(T0, 1), ranch: undefined })))!;
    expect(placeFoal({ ...s, loc: standOf(RANCH_NODE), bag: { [FOAL]: 1 } }, 0, T0).ranch?.pens[0]?.ms).toBe(FOAL_MS);
  });
});

describe('首领再生（10-25）', () => {
  it('高出 5 级、穿同阶板甲拿剑，每个首领都打得动（以前带再生的首领回血比输出快）', async () => {
    const { combatEstimate } = await import('./sim');
    const { TIERS } = await import('./data');
    for (const m of Object.values(MONSTERS)) {
      if (m.rank !== 'boss') continue;
      const lv = m.level + 5;
      const s = newGame(T0, 1);
      for (const k of Object.keys(s.xp) as (keyof typeof s.xp)[]) s.xp[k] = XP_TABLE[lv];
      const t = [...TIERS].reverse().find((x) => x.level <= lv)!;
      for (const [id, it] of Object.entries(ITEMS)) {
        const e = it.equip;
        if (!e || !id.startsWith(`${t.id}_`) || id.startsWith('mount')) continue;
        if (e.slot === 'weapon' ? !id.includes('sword') : e.defence && !id.includes('plate')) continue;
        s.equipment[e.slot] = id;
      }
      const est = combatEstimate(s, m);
      expect(est.killMs, m.id).toBeLessThan(Infinity);
      expect(est.rating, m.id).not.toBe('打不动');
    }
  });
});

describe('组队经验加成', () => {
  it('每个队员 +5%，5 人满队 +25%，离开队伍就没了', async () => {
    const { setPartySize, partyXpPct } = await import('./party');
    const run = () => {
      const s = startHere(newGame(T0, 1), 'fish_minnow', { type: 'infinite' });
      return advance(s, T0 + 10 * 60_000).state.xp.fishing;
    };
    const base = run();
    setPartySize(5);
    expect(partyXpPct()).toBeCloseTo(0.25);
    const full = run();
    setPartySize(9);
    expect(partyXpPct()).toBeCloseTo(0.25);
    setPartySize(2);
    expect(partyXpPct()).toBeCloseTo(0.1);
    setPartySize(0);
    expect(full / base).toBeGreaterThan(1.2);
    // 经验多了升级快、动作也快一点，所以会略高于 1.25
    expect(full / base).toBeLessThan(1.4);
    expect(run()).toBe(base);
  });
});

describe('回仓库存东西', () => {
  it('采集时背包满了回仓库，食物也一起存掉；打怪时食物留在身上', () => {
    const s0 = newGame(T0, 4);
    const food = Object.keys(ITEMS).find((id) => ITEMS[id].heals && ITEMS[id].category === 'food')!;
    let s = startHere(s0, 'mine_stone', { type: 'infinite' });
    s.bag = { [food]: 500, copper_ore: 100 * 20 };
    s = advance(s, T0 + 30 * 60_000).state;
    expect(s.bag[food] ?? 0).toBe(0);
    expect(s.bank[food]).toBe(500);
  });
});

describe('装备品质、分解台、仓库整理（10-25）', () => {
  it('T1 出货率 60/26/9.5/3.2/1/0.3，阶级越高高品质越少，加起来都是 100', () => {
    expect(qualityOdds(0)).toEqual([60, 26, 9.5, 3.2, 1, 0.3]);
    for (let t = 0; t < 8; t++) {
      const o = qualityOdds(t);
      expect(o.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 6);
      if (t) for (let q = 1; q < 6; q++) expect(o[q]).toBeLessThan(qualityOdds(t - 1)[q]);
    }
    const n = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 100_000; i++) n[rollQuality(0, i / 100_000)]++;
    expect(n.map((k) => k / 1000)).toEqual([60, 26, 9.5, 3.2, 1, 0.3]);
  });

  it('每件装备都有 6 个品质，属性和售价逐级变高；做出来的装备随机品质', () => {
    const gear = Object.values(ITEMS).filter((it) => it.equip && !it.equip.move && it.equip.slot !== 'pack' && !it.quality);
    for (const it of gear) for (let q = 1; q < 6; q++) {
      const lo = ITEMS[qid(it.id, q - 1)];
      const hi = ITEMS[qid(it.id, q)];
      expect(hi, it.id).toBeDefined();
      expect(hi.value).toBeGreaterThan(lo.value);
      expect(hi.equip!.attack + hi.equip!.strength + hi.equip!.defence).toBeGreaterThanOrEqual(lo.equip!.attack + lo.equip!.strength + lo.equip!.defence);
    }
    const a = Object.values(ACTIONS).find((x) => x.kind === 'skill' && x.outputs.some((o) => ITEMS[o.item]?.equip && ITEMS[o.item].tier === 0 && !ITEMS[o.item].equip!.move && ITEMS[o.item].equip!.slot !== 'pack')) as SkillAction;
    let s = newGame(T0, 3);
    for (const st of a.inputs ?? []) s.bank[st.item] = st.qty * 400;
    s.xp[a.skill] = XP_TABLE[a.level];
    s = startHere(s, a.id, { type: 'count', count: 300 });
    s = advance(s, T0 + 100 * HOUR).state;
    const out = a.outputs.find((o) => ITEMS[o.item]?.equip)!.item;
    const made = [...new Set([...Object.keys(s.bank), ...Object.keys(s.bag)])].filter((id) => baseOf(id) === out);
    expect(made.length).toBeGreaterThan(2);
    expect(made.reduce((t, id) => t + (owned(s, id) ?? 0), 0)).toBe(300);
    expect(owned(s, out)).toBeGreaterThan(130);
  });

  it('分解台：每座城镇一个，要站在旁边，金币是售价 1.2 倍，不能分解非装备', () => {
    expect(SALVAGE_NODES.length).toBeGreaterThanOrEqual(10);
    const s = newGame(T0, 1);
    s.bank.wood_pickaxe = 3;
    s.bank[qid('wood_pickaxe', 4)] = 1;
    s.bank.raw_minnow = 5;
    const items = { wood_pickaxe: 5, [qid('wood_pickaxe', 4)]: 1, raw_minnow: 5 };
    expect(salvage(s, items)[1]).toBe(0);
    s.loc = standOf(SALVAGE_NODES[0]);
    const coins0 = s.bank.coins ?? 0;
    const [n, got] = salvage(s, items);
    expect(got).toBe(3 * salvageValue('wood_pickaxe') + salvageValue(qid('wood_pickaxe', 4)));
    expect(salvageValue(qid('wood_pickaxe', 4))).toBe(Math.round(ITEMS[qid('wood_pickaxe', 4)].value * SALVAGE_BONUS));
    expect(n.bank.wood_pickaxe).toBeUndefined();
    expect(n.bank.raw_minnow).toBe(5);
    expect(n.bank.coins).toBe(coins0 + got);
  });

  it('整理仓库：数量不变，装备在前，同一件按品质从高到低', () => {
    const s = newGame(T0, 1);
    s.bank = { coins: 9, raw_minnow: 4, wood_pickaxe: 1, [qid('wood_pickaxe', 2)]: 2, copper_ore: 7 };
    const n = sortBank(s);
    expect(n.bank).toEqual(s.bank);
    const keys = Object.keys(n.bank);
    expect(keys[0]).toBe('coins');
    expect(keys.indexOf(qid('wood_pickaxe', 2))).toBeLessThan(keys.indexOf('wood_pickaxe'));
    expect(keys.indexOf('wood_pickaxe')).toBeLessThan(keys.indexOf('raw_minnow'));
  });
});

describe('邮箱（10-25）', () => {
  /** 先当作全服赠礼已经领过，只测活动邮件 */
  const noGift = (s: GameState) => { s.mailKeys = GIFTS.map((g) => `gift-${g.key}`); return s; };
  it('全服赠礼：副本上线送 5 把 T4 绿洞钥匙，每个存档只送一次', () => {
    const t = HW_END + 3 * HOUR;
    let s = stepMail(newGame(t, 1), t);
    const gift = s.mail!.find((m) => m.kind === 'gift');
    expect(gift?.items).toEqual([{ item: 'dkey_g4', qty: 5 }]);
    expect(stepMail(s, t + HOUR)).toBe(s);
    s = claimMail(s, gift!.id, bagRoomFor)[0];
    expect(s.bag.dkey_g4).toBe(5);
  });
  it('万圣节期间每天上线送 3 个礼盒，同一天只送一次；领取进背包；活动结束礼盒全部销毁', () => {
    const day1 = new Date(2026, 9, 26, 9).getTime();
    let s = noGift(newGame(day1, 1));
    s = stepMail(s, day1);
    expect(s.mail).toHaveLength(1);
    expect(s.mail![0].items).toEqual([{ item: HW_BOX, qty: HW_DAILY_BOXES }]);
    expect(unreadMail(s)).toBe(1);
    expect(stepMail(s, day1 + 3 * HOUR)).toBe(s);
    s = stepMail(s, new Date(2026, 9, 27, 1).getTime());
    expect(s.mail).toHaveLength(2);
    s = claimMail(s, s.mail![1].id, bagRoomFor)[0];
    expect(s.bag[HW_BOX]).toBe(HW_DAILY_BOXES);
    s.bank[HW_BOX] = 5;
    const after = stepMail(s, HW_END + 1000);
    expect(after.bag[HW_BOX]).toBeUndefined();
    expect(after.bank[HW_BOX]).toBeUndefined();
    expect(after.mail!.some((m) => m.items.some((i) => i.item === HW_BOX))).toBe(false);
    expect(after.mail!.some((m) => m.kind === 'hw_expired')).toBe(true);
    expect(stepMail(after, HW_END + 2 * HOUR)).toBe(after);
    expect(clearMail(after).mail!.every((m) => !m.claimed)).toBe(true);
  });
  it('邮件读档保留，坏数据丢掉', () => {
    let s = stepMail(noGift(newGame(new Date(2026, 9, 26).getTime(), 1)), new Date(2026, 9, 26).getTime());
    const raw = JSON.parse(JSON.stringify(s));
    raw.mail.push({ id: 'x' }, { id: 9, kind: 'quest', at: 1, items: [{ item: 'nope', qty: 1 }] });
    s = migrate(raw)!;
    expect(s.mail).toHaveLength(2);
    expect(s.mail![1].items).toEqual([]);
    expect(s.mailSeq).toBe(9);
  });
});

describe('副手和新武器（10-25）', () => {
  const give = (s: GameState, ...ids: string[]) => { for (const id of ids) s.bag[id] = (s.bag[id] ?? 0) + 1; return s; };
  it('火把加攻速，箭袋只在用远程武器时加攻击', () => {
    let s = newGame(T0, 1);
    s.xp.defence = XP_TABLE[99]; s.xp.ranged = XP_TABLE[99]; s.xp.melee = XP_TABLE[99];
    give(s, 'wood_torch', 'wood_quiver', 'wood_shortbow');
    const base = playerAttackMs(s);
    s = equip(s, 'wood_torch');
    expect(s.equipment.offhand).toBe('wood_torch');
    expect(playerAttackMs(s)).toBeLessThan(base);
    s = equip(s, 'wood_quiver');
    expect(s.bag.wood_torch).toBe(1);
    const melee = playerBonuses(s).attack;
    s = equip(s, 'wood_shortbow');
    expect(playerBonuses(s).attack).toBeGreaterThan(melee);
  });
  it('双手大盾和副手不能同时装', () => {
    let s = newGame(T0, 1);
    s.xp.defence = XP_TABLE[99]; s.xp.melee = XP_TABLE[99];
    give(s, 'wood_buckler', 'wood_greatshield');
    s = equip(s, 'wood_buckler');
    s = equip(s, 'wood_greatshield');
    expect(s.equipment.weapon).toBe('wood_greatshield');
    expect(s.equipment.offhand).toBeUndefined();
    expect(s.bag.wood_buckler).toBe(1);
    s = equip(s, 'wood_buckler');
    expect(s.equipment.offhand).toBe('wood_buckler');
    expect(s.equipment.weapon).toBeUndefined();
    expect(s.bag.wood_greatshield).toBe(1);
  });
});

describe('野外组队同打一只怪（10-27）', () => {
  it('队友在一起打时怪血加厚，队友的伤害记到同一只怪上，打死了一起算击杀', async () => {
    const { fieldKey, pushMateHit, setFieldCrew } = await import('./aggro');
    setFieldCrew(1);
    let s = startHere(newGame(T0, 7), 'fight_rabbit', { type: 'infinite' });
    let t = T0;
    s = advance(s, (t += 10)).state;
    const m = MONSTERS[(ACTIONS.fight_rabbit as { monster: string }).monster];
    expect(s.combat!.crew).toBe(1);
    expect(s.combat!.monsterMax).toBe(Math.round(m.hp * 1.6));
    const kills = s.stats.kills;
    pushMateHit(fieldKey('fight_rabbit'), s.combat!.monsterHp + 3);
    s = advance(s, (t += 10)).state;
    expect(s.stats.kills).toBe(kills + 1);
    expect(s.combat!.respawnMs).toBeGreaterThan(0);
    setFieldCrew(0);
  });

  it('离线补算按单人算，不受队友人数影响', async () => {
    const { setFieldCrew } = await import('./aggro');
    setFieldCrew(3);
    const s = startHere(newGame(T0, 7), 'fight_rabbit', { type: 'time', ms: HOUR });
    const { summary, state } = advance(s, T0 + HOUR);
    setFieldCrew(0);
    expect(summary.kills.rabbit).toBeGreaterThan(60);
    expect(state.combat?.crew).toBeUndefined();
  });
});

describe('离开期间的收获合并（10-27）', () => {
  it('物品、击杀、经验相加，同一技能升级只留最高等级', async () => {
    const { mergeSummary, emptySummary } = await import('./sim');
    const a = { ...emptySummary(), elapsedMs: 1000, items: { stone: 3 }, kills: { rabbit: 1 }, xp: { mining: 10 }, levelUps: [{ skill: 'mining' as const, level: 5 }] };
    const b = { ...emptySummary(), elapsedMs: 2000, items: { stone: 2, copper_ore: 1 }, kills: { rabbit: 2 }, xp: { mining: 5 }, levelUps: [{ skill: 'mining' as const, level: 6 }], deaths: 1 };
    const m = mergeSummary(a, b);
    expect(m.elapsedMs).toBe(3000);
    expect(m.items).toEqual({ stone: 5, copper_ore: 1 });
    expect(m.kills).toEqual({ rabbit: 3 });
    expect(m.xp).toEqual({ mining: 15 });
    expect(m.levelUps).toEqual([{ skill: 'mining', level: 6 }]);
    expect(m.deaths).toBe(1);
  });
});
