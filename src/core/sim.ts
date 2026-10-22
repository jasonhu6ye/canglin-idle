import { ACTIONS, ITEMS, MAP_W, MONSTERS, nodeOfAction, NODES, SKILLS, SPAWN_TILE, standOf, TOWN_CENTER, travelMs } from './data';
import { nextRandom } from './rng';
import { BONUS_PER_LEVEL, levelForXp, SPEED_PER_LEVEL, XP_TABLE } from './xp';
import type {
  CombatAction, CombatStyle, EquipSlot, GameState, MonsterDef, SkillAction, SkillId, Summary, Task, TaskEndReason, TaskMode,
} from './types';

/** 离线收益上限 24 小时 */
export const OFFLINE_CAP_MS = 24 * 60 * 60 * 1000;
export const MAX_QUEUE = 3;
export const PLAYER_ATTACK_MS = 2400;
export const RESPAWN_MS = 1500;
const REGEN_MS = 1000;
export const MONSTER_DAMAGE_SCALE = 3;

/** 存档是纯 JSON；不用 structuredClone，iOS 15.4 以下没有 */
const clone = (s: GameState): GameState => JSON.parse(JSON.stringify(s));

export const BAG_SLOTS = 20;
/** 背包每格最多叠多少个 */
export const BAG_STACK = 100;
export const DEFAULT_CARRY_FOOD = 100;

const ALL_SKILLS = Object.keys(SKILLS) as SkillId[];

export function newGame(now: number, seed = Math.floor(Math.random() * 2 ** 31)): GameState {
  const xp = Object.fromEntries(ALL_SKILLS.map((k) => [k, 0])) as Record<SkillId, number>;
  xp.hitpoints = XP_TABLE[10];
  return {
    version: 3,
    lastTick: now,
    rng: seed,
    xp,
    hp: 100,
    bank: { coins: 50, minnow: 10 },
    bag: {},
    equipment: { weapon: 'wood_sword' },
    queue: [],
    progressMs: 0,
    combat: null,
    settings: { eatThreshold: 0.5, carryFood: DEFAULT_CARRY_FOOD },
    regenMs: 0,
    stats: { kills: 0, deaths: 0 },
    loc: { ...SPAWN_TILE },
    mapSize: MAP_W,
    travel: null,
    seen: { minnow: 1, wood_sword: 1 },
  };
}

/** 旧存档升级到当前版本；认不出的物品和任务直接丢掉，避免读档崩溃 */
/** 连续阵亡这么多次（中间没打死一只）就停止战斗 */
export const MAX_DEATH_STREAK = 3;

/** 地图扩大后换算旧存档的位置：城镇里的跟着镇中心平移（建筑大小不变），野外的按比例放大 */
function rescaleLoc(loc: { x: number; y: number }, old: number) {
  if (old === MAP_W) return loc;
  const k = MAP_W / old;
  const oldCenter = { x: Math.round(TOWN_CENTER.x / k), y: Math.round(TOWN_CENTER.y / k) };
  if (Math.abs(loc.x - oldCenter.x) < 60 && Math.abs(loc.y - oldCenter.y) < 60) {
    return { x: loc.x - oldCenter.x + TOWN_CENTER.x, y: loc.y - oldCenter.y + TOWN_CENTER.y };
  }
  return { x: Math.round(loc.x * k), y: Math.round(loc.y * k) };
}

export function migrate(raw: unknown): GameState | null {
  const s = raw as Omit<Partial<GameState>, "version"> & { version?: number };
  if (!s || typeof s !== 'object' || ![1, 2, 3].includes(s.version ?? 0)) return null;
  const fresh = newGame(s.lastTick ?? Date.now(), s.rng);
  const keep = (rec: Record<string, number> | undefined) =>
    Object.fromEntries(Object.entries(rec ?? {}).filter(([id, q]) => ITEMS[id] && q > 0));
  const equipment: GameState['equipment'] = {};
  for (const [slot, id] of Object.entries(s.equipment ?? {})) {
    if (id && ITEMS[id]?.equip?.slot === slot) equipment[slot as EquipSlot] = id;
  }
  const queue = (s.queue ?? []).filter((t) => ACTIONS[t.action]);
  return {
    ...fresh,
    lastTick: s.lastTick ?? fresh.lastTick,
    xp: { ...fresh.xp, ...s.xp },
    hp: s.hp ?? fresh.hp,
    bank: keep(s.bank),
    bag: keep(s.bag),
    equipment,
    queue,
    progressMs: queue[0] === s.queue?.[0] ? s.progressMs ?? 0 : 0,
    combat: queue[0] === s.queue?.[0] ? s.combat ?? null : null,
    settings: { ...fresh.settings, ...s.settings },
    regenMs: s.regenMs ?? 0,
    stats: { ...fresh.stats, ...s.stats },
    // 旧存档没有位置：当作已经站在当前任务的地点
    loc: s.loc ? rescaleLoc(s.loc, s.mapSize ?? 1080) : nodeOfAction(queue[0]?.action) ? standOf(nodeOfAction(queue[0]?.action)!) : fresh.loc,
    mapSize: MAP_W,
    travel: (s.mapSize ?? 1080) === MAP_W ? s.travel ?? null : null,
    walk: (s.mapSize ?? 1080) === MAP_W ? s.walk ?? null : null,
    bestiary: s.bestiary ?? {},
    // 旧存档：现在拥有的东西都算获得过
    seen: s.seen ?? Object.fromEntries(
      [...Object.keys(keep(s.bank)), ...Object.keys(keep(s.bag)), ...Object.values(equipment)].filter((id) => id && ITEMS[id]).map((id) => [id, 1 as const]),
    ),
  };
}

export function emptySummary(): Summary {
  return { elapsedMs: 0, xp: {}, items: {}, levelUps: [], kills: {}, deaths: 0, foodEaten: 0, ammoUsed: 0, bankTrips: 0, taskEnds: [] };
}

export const level = (s: GameState, skill: SkillId) => levelForXp(s.xp[skill]);
export const maxHp = (s: GameState) => level(s, 'hitpoints') * 10;

export function combatLevel(s: GameState) {
  const atk = Math.max(level(s, 'melee'), level(s, 'ranged'), level(s, 'magic'));
  return Math.max(1, Math.floor((atk * 1.3 + level(s, 'defence') + level(s, 'hitpoints')) / 3.3));
}

export const weaponStyle = (s: GameState): CombatStyle => ITEMS[s.equipment.weapon ?? '']?.equip?.style ?? 'melee';

export function playerBonuses(s: GameState, style = weaponStyle(s)) {
  const b = { attack: 0, strength: 0, defence: 0 };
  for (const id of Object.values(s.equipment)) {
    const e = id && ITEMS[id]?.equip;
    if (!e) continue;
    b.defence += e.defence;
    // 皮甲只加远程，法袍只加魔法
    if (e.style && e.style !== style) continue;
    b.attack += e.attack;
    b.strength += e.strength;
  }
  return b;
}

export const TOOL_FOR: Partial<Record<SkillId, EquipSlot>> = {
  mining: 'pickaxe', woodcutting: 'axe', fishing: 'rod', farming: 'hoe', hunting: 'knife', smithing: 'hammer', crafting: 'needle',
};

/** 某个工具栏位当前的速度加成 */
export const slotSpeed = (s: GameState, slot: EquipSlot) => ITEMS[s.equipment[slot] ?? '']?.equip?.speed || 0;

export function toolSpeed(s: GameState, skill: SkillId, tool?: EquipSlot) {
  const slot = tool ?? TOOL_FOR[skill];
  return slot ? slotSpeed(s, slot) : 0;
}

/** 工具加速后的单次耗时 */
/** 等级加速：非战斗技能每级 +0.5% 动作速度，没有上限 */
export const levelSpeed = (s: GameState, skill: SkillId) => level(s, skill) * SPEED_PER_LEVEL;
/** 等级高出动作要求的部分：采集类是双倍产出几率，生产类是不消耗材料几率 */
export const levelBonus = (s: GameState, a: SkillAction) => Math.max(0, level(s, a.skill) - a.level) * BONUS_PER_LEVEL;

export const actionDuration = (s: GameState, a: SkillAction) =>
  Math.round(a.durationMs / (1 + toolSpeed(s, a.skill, a.tool) + levelSpeed(s, a.skill)));

/** 玩家攻击间隔：看武器，匕首快、长枪和弩慢 */
export const playerAttackMs = (s: GameState) => ITEMS[s.equipment.weapon ?? '']?.equip?.attackMs ?? PLAYER_ATTACK_MS;

const healOf = (id: string) => ITEMS[id]?.heals ?? 0;
/** 每格能叠多少个：装备和工具一件占一格，其余 100 个一格 */
export const stackOf = (id: string) => (ITEMS[id]?.equip ? 1 : BAG_STACK);

export function bagSlotsUsed(bag: Record<string, number>) {
  return Object.entries(bag).reduce((n, [id, q]) => n + Math.ceil(q / stackOf(id)), 0);
}

/** 背包里还能放下多少个这种物品 */
export function bagRoomFor(bag: Record<string, number>, item: string) {
  const stack = stackOf(item);
  const have = bag[item] ?? 0;
  const partial = have % stack ? stack - (have % stack) : 0;
  return partial + Math.max(0, BAG_SLOTS - bagSlotsUsed(bag)) * stack;
}

/** 放一件东西回身上：背包放得下就进背包，否则进仓库。返回去了哪里 */
function stow(s: GameState, id: string): 'bag' | 'bank' {
  if (bagRoomFor(s.bag, id) > 0) {
    s.bag[id] = (s.bag[id] ?? 0) + 1;
    return 'bag';
  }
  s.bank[id] = (s.bank[id] ?? 0) + 1;
  return 'bank';
}

/** 背包里回复最多的食物或药水 */
export function bestFood(s: GameState, from: Record<string, number> = s.bag): string | undefined {
  let best: string | undefined;
  for (const [id, qty] of Object.entries(from)) {
    if (qty > 0 && healOf(id) && (!best || healOf(id) > healOf(best))) best = id;
  }
  return best;
}

/** 当前武器能用的最好的弹药。战斗里只用背包的；withBank 用来估算（开战前会回仓库补） */
export function bestAmmo(s: GameState, style = weaponStyle(s), withBank = false): { id: string; inBag: boolean } | undefined {
  if (style === 'melee') return undefined;
  let best: { id: string; inBag: boolean } | undefined;
  for (const [store, inBag] of [[s.bag, true], [s.bank, false]] as const) {
    if (!inBag && !withBank) continue;
    for (const [id, qty] of Object.entries(store)) {
      const a = ITEMS[id]?.ammo;
      if (!a || a.style !== style || qty <= 0) continue;
      if (!best || a.power > ITEMS[best.id].ammo!.power) best = { id, inBag };
    }
  }
  return best;
}

/** RuneScape 式命中率：攻击值与防御值对抗 */
function hitChance(attackRoll: number, defenceRoll: number): number {
  return attackRoll > defenceRoll
    ? 1 - (defenceRoll + 2) / (2 * (attackRoll + 1))
    : attackRoll / (2 * (defenceRoll + 1));
}

export function combatStats(s: GameState, m: MonsterDef) {
  const style = weaponStyle(s);
  const lvl = level(s, style);
  const b = playerBonuses(s, style);
  const ammo = bestAmmo(s, style, true);
  const strength = b.strength + (ammo ? ITEMS[ammo.id].ammo!.power : 0);
  const has = (t: string) => m.traits.includes(t);
  // 抗性和弱点只影响对应战斗方式的伤害
  const dmgMult = (has(`resist_${style}`) ? 0.7 : 1) * (has(`weak_${style}`) ? 1.3 : 1);
  return {
    style,
    ammo: ammo?.id,
    playerHit: hitChance((lvl + 8) * (b.attack + 64), (m.defence + 8) * 64) * (has('evasive') ? 0.8 : 1),
    playerMaxHit: Math.max(1, Math.round(Math.floor(0.5 + ((lvl + 8) * (strength + 64)) / 640) * 10 * dmgMult)),
    monsterHit: m.maxHit > 0 ? hitChance((m.attack + 8) * 64, (level(s, 'defence') + 8) * (b.defence + 64)) : 0,
    monsterMaxHit: m.maxHit * MONSTER_DAMAGE_SCALE,
  };
}

/** 主循环：把存档推进到 now。在线每帧调用和离线补算用的是同一个函数，结果与调用的分段方式无关。 */
export function advance(prev: GameState, now: number): { state: GameState; summary: Summary } {
  const s = clone(prev);
  const sum = emptySummary();
  let dt = Math.min(Math.max(0, now - s.lastTick), OFFLINE_CAP_MS);
  s.lastTick = now;
  sum.elapsedMs = dt;

  const rand = () => {
    const [r, next] = nextRandom(s.rng);
    s.rng = next;
    return r;
  };

  /** 采集、制作、打怪的产出进背包；万一放不下，多出来的才进仓库 */
  const addLoot = (item: string, qty: number) => {
    const n = Math.min(qty, bagRoomFor(s.bag, item));
    if (n > 0) s.bag[item] = (s.bag[item] ?? 0) + n;
    if (qty > n) s.bank[item] = (s.bank[item] ?? 0) + qty - n;
    s.seen[item] = 1;
    sum.items[item] = (sum.items[item] ?? 0) + qty;
  };

  /** 材料先用背包里的，不够再从仓库扣 */
  const haveItem = (item: string) => (s.bag[item] ?? 0) + (s.bank[item] ?? 0);
  const useItem = (item: string, qty: number) => {
    const fromBag = Math.min(qty, s.bag[item] ?? 0);
    if (fromBag) {
      addBag(item, -fromBag);
      sum.items[item] = (sum.items[item] ?? 0) - fromBag;
    }
    if (qty > fromBag) addItem(item, -(qty - fromBag));
  };

  /** 背包能不能把这些东西一起装下 */
  const fits = (items: string[]) => {
    const bag = { ...s.bag };
    for (const id of items) {
      if (bagRoomFor(bag, id) < 1) return false;
      bag[id] = (bag[id] ?? 0) + 1;
    }
    return true;
  };
  const lootOf = (a: SkillAction | CombatAction) => {
    const out: string[] = [];
    const push = (id: string, q: number) => { for (let i = 0; i < Math.min(q, 100); i++) out.push(id); };
    if (a.kind === 'skill') {
      a.outputs.forEach((o) => push(o.item, o.qty));
      if (a.fail?.item) push(a.fail.item, 1);
    } else MONSTERS[a.monster].drops.forEach((d) => push(d.item, d.qty));
    return out;
  };

  /** 背包满了：走回仓库，存下除食物和弹药外的东西，再走回来接着干。
   *  supply：开战前回仓库按设置拿食物和药水 */
  const stepBankTrip = (budget: number, supply = false): number => {
    const bank = NODES.find((n) => n.id === 'bank')!;
    const dest = standOf(bank);
    if (!s.travel || s.travel.to !== 'bank') {
      const ms = travelMs(s.loc, dest);
      s.travel = { to: 'bank', ms, total: ms };
    }
    const step = Math.min(budget, s.travel.ms);
    s.travel.ms -= step;
    if (s.travel.ms <= 0) {
      s.loc = dest;
      s.travel = null;
      const keep = (id: string) => healOf(id) > 0 || !!ITEMS[id]?.ammo;
      for (const pass of [false, true]) {
        for (const [id, q] of Object.entries(s.bag)) {
          if (!pass && keep(id)) continue;
          s.bank[id] = (s.bank[id] ?? 0) + q;
          delete s.bag[id];
        }
        if (!pass && BAG_SLOTS - bagSlotsUsed(s.bag) >= 5) break;
      }
      if (supply) {
        carryFood();
        carryAmmo();
        s.queue[0].stocked = true;
      }
      sum.bankTrips++;
    }
    return Math.max(step, 1);
  };

  const addItem = (item: string, qty: number) => {
    s.bank[item] = (s.bank[item] ?? 0) + qty;
    if (s.bank[item] <= 0) delete s.bank[item];
    if (qty > 0) s.seen[item] = 1;
    sum.items[item] = (sum.items[item] ?? 0) + qty;
  };

  const addXp = (skill: SkillId, amount: number) => {
    const before = level(s, skill);
    s.xp[skill] += amount;
    sum.xp[skill] = (sum.xp[skill] ?? 0) + amount;
    const after = level(s, skill);
    if (after > before) sum.levelUps.push({ skill, level: after });
  };

  const endTask = (reason: TaskEndReason) => {
    const task = s.queue.shift()!;
    sum.taskEnds.push({ action: task.action, reason });
    s.progressMs = 0;
    s.combat = null;
    s.travel = null;
  };

  /** 还没到任务地点就先走路，返回走了多久 */
  const stepTravel = (task: Task, budget: number): number => {
    const node = nodeOfAction(task.action);
    if (!node) return 0;
    const dest = standOf(node);
    if (s.loc.x === dest.x && s.loc.y === dest.y) return 0;
    if (!s.travel || s.travel.to !== node.id) {
      const ms = travelMs(s.loc, dest);
      s.travel = { to: node.id, ms, total: ms };
    }
    const step = Math.min(budget, s.travel.ms);
    s.travel.ms -= step;
    if (s.travel.ms <= 0) {
      s.loc = dest;
      s.travel = null;
    }
    return Math.max(step, 1);
  };

  const isFinished = (task: Task) =>
    (task.mode.type === 'count' && task.done >= task.mode.count) ||
    (task.mode.type === 'time' && task.elapsedMs >= task.mode.ms);

  const timeLeft = (task: Task) => (task.mode.type === 'time' ? task.mode.ms - task.elapsedMs : Infinity);

  const addBag = (item: string, qty: number) => {
    s.bag[item] = (s.bag[item] ?? 0) + qty;
    if (s.bag[item] <= 0) delete s.bag[item];
  };

  /** 只吃背包里的东西 */
  const eatIfNeeded = () => {
    const limit = maxHp(s) * s.settings.eatThreshold;
    while (s.hp < limit) {
      const food = bestFood(s);
      if (!food) return;
      addBag(food, -1);
      sum.foodEaten++;
      s.hp = Math.min(maxHp(s), s.hp + healOf(food));
    }
  };

  const foodTarget = () => (s.settings.carryFood < 0 ? Infinity : s.settings.carryFood);
  const bagFood = () => Object.entries(s.bag).reduce((n, [id, q]) => n + (healOf(id) ? q : 0), 0);
  /** 背包里的食物不够设定数量，仓库里又有：要先回仓库拿 */
  const needSupply = () =>
    (bagFood() < foodTarget() && Object.keys(s.bank).some((id) => healOf(id) > 0 && bagRoomFor(s.bag, id) > 0))
    || (!bestAmmo(s) && !!bestAmmo(s, weaponStyle(s), true));

  /** 在仓库旁把当前武器能用的弹药全部带上，好的先拿 */
  const carryAmmo = () => {
    const style = weaponStyle(s);
    const ids = Object.keys(s.bank).filter((id) => ITEMS[id]?.ammo?.style === style).sort((a, b) => ITEMS[b].ammo!.power - ITEMS[a].ammo!.power);
    for (const id of ids) {
      const n = Math.min(s.bank[id], bagRoomFor(s.bag, id));
      if (n <= 0) continue;
      s.bank[id] -= n;
      if (s.bank[id] <= 0) delete s.bank[id];
      addBag(id, n);
    }
  };

  /** 在仓库旁按设置把食物和药水补进背包，好的先拿 */
  const carryFood = () => {
    const target = foodTarget();
    let have = bagFood();
    const foods = Object.keys(s.bank).filter((id) => healOf(id)).sort((a, b) => healOf(b) - healOf(a));
    for (const id of foods) {
      const n = Math.min(s.bank[id], target - have, bagRoomFor(s.bag, id));
      if (n <= 0) continue;
      s.bank[id] -= n;
      if (s.bank[id] <= 0) delete s.bank[id];
      addBag(id, n);
      have += n;
    }
  };

  const stepSkill = (task: Task, a: SkillAction, budget: number): number => {
    if (s.progressMs === 0) {
      if (level(s, a.skill) < a.level) return endTask('level'), 0;
      if (a.inputs && !a.inputs.every((i) => haveItem(i.item) >= i.qty)) return endTask('noInput'), 0;
    }
    // 进度为负表示偷窃失败后的晕眩，先走完晕眩停在 0，再做下一次的条件检查
    const duration = actionDuration(s, a);
    const step = Math.min(budget, s.progressMs < 0 ? -s.progressMs : Math.max(0, duration - s.progressMs));
    s.progressMs += step;
    if (s.progressMs >= duration) {
      s.progressMs = 0;
      const bonus = levelBonus(s, a);
      const gatherer = SKILLS[a.skill].group === 'gather';
      if (!(a.inputs && !gatherer && rand() < bonus)) a.inputs?.forEach((i) => useItem(i.item, i.qty));
      const failChance = a.fail
        ? Math.max(0, a.fail.chance * (a.fail.noFailLevel - level(s, a.skill)) / (a.fail.noFailLevel - a.level))
        : 0;
      if (a.fail && rand() < failChance) {
        if (a.fail.item) addLoot(a.fail.item, 1);
        if (a.fail.stunMs) s.progressMs = -a.fail.stunMs;
      } else {
        for (const o of a.outputs) if (o.chance === undefined || rand() < o.chance) addLoot(o.item, o.qty);
        if (gatherer && rand() < bonus) a.outputs.forEach((o) => o.chance === undefined && addLoot(o.item, o.qty));
        addXp(a.skill, a.xp);
      }
      task.done++;
    }
    return step;
  };

  const stepCombat = (task: Task, a: CombatAction, budget: number): number => {
    const m = MONSTERS[a.monster];
    if (!s.combat) {
      // 交过手就记下来：之后追踪能找到准确位置（图鉴仍要击败才解锁）
      if (s.bestiary?.[m.id] === undefined) s.bestiary = { ...s.bestiary, [m.id]: 0 };
      s.combat = { monsterHp: m.hp, playerTimerMs: playerAttackMs(s), monsterTimerMs: m.attackMs, respawnMs: 0 };
    }
    const c = s.combat;
    const has = (t: string) => m.traits.includes(t);
    /** 玩家掉血，死了回城复活。返回是否死亡 */
    const hurt = (dmg: number) => {
      if (dmg <= 0) return false;
      s.hp -= dmg;
      eatIfNeeded();
      if (s.hp > 0) return false;
      s.hp = maxHp(s);
      s.stats.deaths++;
      sum.deaths++;
      // 阵亡：回城复活，补给后自动走回去接着打；连死 3 次没打死一只才放弃（用户 10-22 要求）
      task.deathStreak = (task.deathStreak ?? 0) + 1;
      if (task.deathStreak >= MAX_DEATH_STREAK) {
        endTask('death');
        return true;
      }
      s.combat = null;
      s.loc = { ...SPAWN_TILE };
      s.travel = null;
      task.stocked = false;
      return true;
    };
    if (c.respawnMs > 0) {
      const step = Math.min(budget, c.respawnMs);
      c.respawnMs -= step;
      return step;
    }
    const step = Math.min(budget, c.playerTimerMs, c.monsterTimerMs);
    c.playerTimerMs -= step;
    c.monsterTimerMs -= step;
    const st = combatStats(s, m);

    if (c.playerTimerMs <= 0) {
      if (st.style !== 'melee') {
        const ammo = bestAmmo(s, st.style);
        if (!ammo) {
          // 背包打空了：仓库还有就回去补，没有才停
          if (bestAmmo(s, st.style, true)) {
            s.combat = null;
            task.stocked = false;
            return step;
          }
          return endTask('noAmmo'), step;
        }
        addBag(ammo.id, -1);
        sum.ammoUsed++;
      }
      c.playerTimerMs += playerAttackMs(s);
      if (rand() < st.playerHit) {
        const dmg = Math.min(c.monsterHp, 1 + Math.floor(rand() * st.playerMaxHit));
        c.monsterHp -= dmg;
        addXp(st.style, dmg);
        addXp('defence', dmg / 3);
        addXp('hitpoints', dmg / 3);
        // 荆棘：打它会被反伤
        if (has('thorns') && hurt(Math.floor(dmg * 0.15))) return step;
      }
      if (c.monsterHp <= 0) {
        for (const d of m.drops) if (d.chance === undefined || rand() < d.chance) addLoot(d.item, d.qty);
        sum.kills[m.id] = (sum.kills[m.id] ?? 0) + 1;
        s.stats.kills++;
        task.deathStreak = 0;
        s.bestiary = { ...s.bestiary, [m.id]: (s.bestiary?.[m.id] ?? 0) + 1 };
        task.done++;
        s.combat = { monsterHp: m.hp, playerTimerMs: playerAttackMs(s), monsterTimerMs: m.attackMs, respawnMs: m.respawnMs ?? RESPAWN_MS };
        return step;
      }
    }
    if (c.monsterTimerMs <= 0) {
      c.monsterTimerMs += m.attackMs;
      if (has('regen')) c.monsterHp = Math.min(m.hp, c.monsterHp + Math.ceil(m.hp * 0.03));
      if (st.monsterMaxHit > 0 && rand() < st.monsterHit) {
        const rage = has('berserk') && c.monsterHp < m.hp / 2 ? 1.5 : 1;
        let dmg = 1 + Math.floor(rand() * st.monsterMaxHit * rage);
        if (has('venom')) dmg += Math.ceil(m.level / 8);
        if (has('lifesteal')) c.monsterHp = Math.min(m.hp, c.monsterHp + Math.ceil(dmg / 2));
        hurt(dmg);
      }
    }
    return step;
  };

  while (dt > 0) {
    const task = s.queue[0];
    if (!task || s.paused) {
      // 手动寻路：离线也照样走完
      if (s.walk) {
        const step = Math.min(dt, s.walk.ms);
        s.walk.ms -= step;
        if (s.walk.ms <= 0) {
          s.loc = { ...s.walk.to };
          s.walk = null;
        }
      }
      regen(s, dt);
      break;
    }
    // 开始干活了：手动寻路作废，从走到的地方出发
    if (s.walk) {
      s.loc = walkPos(s);
      s.walk = null;
    }
    const a0 = ACTIONS[task.action];
    // 开战前：背包食物不够设定数量就先回仓库拿（用户 10-22 要求）
    if (a0.kind === 'combat' && !task.stocked && !s.combat) {
      if (s.travel?.to === 'bank' || needSupply()) {
        const used = stepBankTrip(Math.min(dt, timeLeft(task)), true);
        dt -= used;
        regen(s, used);
        task.elapsedMs += used;
        if (isFinished(task)) endTask('complete');
        continue;
      }
      task.stocked = true;
    }
    // 新一轮开始前（采集一次 / 打下一只怪前）检查背包，装不下就先回仓库
    const between = a0.kind === 'skill' ? s.progressMs === 0 : !s.combat || s.combat.respawnMs > 0;
    if (s.travel?.to === 'bank' || (between && !s.travel && !fits(lootOf(a0)))) {
      // 定时任务的时间也算上来回仓库的路
      const used = stepBankTrip(Math.min(dt, timeLeft(task)));
      dt -= used;
      regen(s, used);
      task.elapsedMs += used;
      if (isFinished(task)) endTask('complete');
      continue;
    }
    const walked = stepTravel(task, Math.min(dt, timeLeft(task)));
    if (walked) {
      dt -= walked;
      regen(s, walked);
      task.elapsedMs += walked;
      if (isFinished(task)) endTask('complete');
      continue;
    }
    const a = ACTIONS[task.action];
    const budget = Math.min(dt, timeLeft(task));
    const used = a.kind === 'skill' ? stepSkill(task, a, budget) : stepCombat(task, a, budget);
    dt -= used;
    if (s.queue[0] === task) {
      task.elapsedMs += used;
      regen(s, used);
      if (isFinished(task)) endTask('complete');
    }
  }
  return { state: s, summary: sum };
}

function regen(s: GameState, ms: number) {
  s.regenMs += ms;
  const ticks = Math.floor(s.regenMs / REGEN_MS);
  s.regenMs -= ticks * REGEN_MS;
  s.hp = Math.min(maxHp(s), s.hp + ticks);
}

// ---- 玩家操作（都返回新存档，不修改旧存档） ----

/** 立即开始：替换当前任务 */
export function startNow(prev: GameState, action: string, mode: TaskMode): GameState {
  const s = clone(prev);
  s.queue = [{ action, mode, done: 0, elapsedMs: 0 }, ...s.queue.slice(1)];
  s.paused = false;
  s.progressMs = 0;
  s.combat = null;
  s.travel = null;
  return s;
}

/** 传送：直接站到地点上，取消正在走的路 */
export function teleport(prev: GameState, nodeId: string): GameState {
  const n = NODES.find((x) => x.id === nodeId);
  if (!n) return prev;
  const s = clone(prev);
  s.loc = standOf(n);
  s.travel = null;
  return s;
}

/** 手动走开：当前工作停下（进度清零），队列留着等「继续工作」 */
export function leaveWork(prev: GameState): GameState {
  if (!prev.queue.length || prev.paused) return prev;
  const s = clone(prev);
  s.paused = true;
  s.progressMs = Math.min(0, s.progressMs);
  s.combat = null;
  s.travel = null;
  return s;
}

export function resumeWork(prev: GameState): GameState {
  if (!prev.paused) return prev;
  return { ...prev, paused: false };
}

/** 手动寻路走到哪了（按直线插值的大概格子） */
export function walkPos(s: GameState): { x: number; y: number } {
  const w = s.walk;
  if (!w) return s.loc;
  const k = w.total > 0 ? 1 - w.ms / w.total : 1;
  return { x: Math.round(w.from.x + (w.to.x - w.from.x) * k), y: Math.round(w.from.y + (w.to.y - w.from.y) * k) };
}

/** 开始手动寻路：ms 是这条路走完要多久（地图场景按真实路线算好传进来） */
export function startWalk(prev: GameState, from: { x: number; y: number }, to: { x: number; y: number }, ms: number): GameState {
  if (prev.queue.length && !prev.paused) return prev;
  const s = clone(prev);
  s.loc = { ...from };
  s.walk = ms > 0 ? { from: { ...from }, to: { ...to }, ms, total: ms } : null;
  if (ms <= 0) s.loc = { ...to };
  return s;
}

/** 没有任务或已暂停时，手动走到某个格子，记下位置 */
export function setLoc(prev: GameState, x: number, y: number): GameState {
  if ((prev.queue.length && !prev.paused) || (prev.loc.x === x && prev.loc.y === y)) return prev;
  const s = clone(prev);
  s.loc = { x, y };
  s.walk = null;
  return s;
}

export function enqueue(prev: GameState, action: string, mode: TaskMode): GameState {
  if (prev.queue.length >= MAX_QUEUE) return prev;
  const s = clone(prev);
  s.queue.push({ action, mode, done: 0, elapsedMs: 0 });
  return s;
}

export function removeTask(prev: GameState, index: number): GameState {
  const s = clone(prev);
  s.queue.splice(index, 1);
  if (!s.queue.length) s.paused = false;
  if (index === 0) {
    s.progressMs = 0;
    s.combat = null;
    s.travel = null;
  }
  return s;
}

/** 穿上装备：优先用背包里的，没有再从仓库拿；换下来的旧装备放进背包，背包满了才回仓库 */
export function equip(prev: GameState, item: string): GameState {
  const e = ITEMS[item]?.equip;
  const from = prev.bag[item] ? 'bag' : prev.bank[item] && atBank(prev) ? 'bank' : null;
  if (!e || !from || level(prev, e.skill) < e.level) return prev;
  const s = clone(prev);
  s[from][item] -= 1;
  if (s[from][item] <= 0) delete s[from][item];
  const old = s.equipment[e.slot];
  s.equipment[e.slot] = item;
  if (old) stow(s, old);
  return s;
}

/** 站在仓库旁边多少格以内才能存取（用户 10-22 要求：仓库的东西要到仓库才能拿） */
export const BANK_REACH = 5;
const BANK_STAND = standOf(NODES.find((n) => n.id === 'bank')!);
export const bankStand = () => ({ ...BANK_STAND });
export function atBank(s: GameState): boolean {
  return !s.travel && !s.walk && Math.hypot(s.loc.x - BANK_STAND.x, s.loc.y - BANK_STAND.y) <= BANK_REACH;
}

/** 卸下装备：放进背包；背包满了，人在仓库旁才能放回仓库 */
export function unequip(prev: GameState, slot: EquipSlot): GameState {
  const id = prev.equipment[slot];
  if (!id) return prev;
  if (bagRoomFor(prev.bag, id) <= 0 && !atBank(prev)) return prev;
  const s = clone(prev);
  delete s.equipment[slot];
  stow(s, id);
  return s;
}

/** 仓库 → 背包，什么都能放，放不下的留在仓库 */
export function toBag(prev: GameState, item: string, qty: number): GameState {
  const n = Math.min(prev.bank[item] ?? 0, qty, bagRoomFor(prev.bag, item));
  if (item === 'coins' || n <= 0 || !atBank(prev)) return prev;
  const s = clone(prev);
  s.bank[item] -= n;
  if (s.bank[item] <= 0) delete s.bank[item];
  s.bag[item] = (s.bag[item] ?? 0) + n;
  return s;
}

export function toBank(prev: GameState, item: string, qty: number): GameState {
  const n = Math.min(prev.bag[item] ?? 0, qty);
  if (n <= 0 || !atBank(prev)) return prev;
  const s = clone(prev);
  s.bag[item] -= n;
  if (s.bag[item] <= 0) delete s.bag[item];
  s.bank[item] = (s.bank[item] ?? 0) + n;
  return s;
}

/** 背包里除了食物和弹药，全部存进仓库 */
export function depositLoot(prev: GameState): GameState {
  if (!atBank(prev)) return prev;
  const s = clone(prev);
  for (const [id, q] of Object.entries(s.bag)) {
    if (healOf(id) > 0 || ITEMS[id]?.ammo) continue;
    s.bank[id] = (s.bank[id] ?? 0) + q;
    delete s.bag[id];
  }
  return s;
}

/** 卖东西要站在城镇集市旁 */
const MARKET_STAND = standOf(NODES.find((n) => n.id === 'market')!);
export const marketStand = () => ({ ...MARKET_STAND });
export function atMarket(s: GameState): boolean {
  return !s.travel && !s.walk && Math.hypot(s.loc.x - MARKET_STAND.x, s.loc.y - MARKET_STAND.y) <= BANK_REACH;
}

export function sell(prev: GameState, item: string, qty: number): GameState {
  const have = prev.bank[item] ?? 0;
  const n = Math.min(have, qty);
  if (item === 'coins' || n <= 0 || !atMarket(prev)) return prev;
  const s = clone(prev);
  s.bank[item] = have - n;
  if (s.bank[item] <= 0) delete s.bank[item];
  s.bank.coins = (s.bank.coins ?? 0) + n * ITEMS[item].value;
  return s;
}

export function setSettings(prev: GameState, patch: Partial<GameState['settings']>): GameState {
  return { ...prev, settings: { ...prev.settings, ...patch } };
}

/** 某个动作每小时的经验（战斗为武器对应技能的估算期望值），用于列表上的「经验/小时」 */
export function xpPerHour(s: GameState, actionId: string): number {
  const a = ACTIONS[actionId];
  if (a.kind === 'skill') return Math.round((a.xp * 3600000) / actionDuration(s, a));
  const m = MONSTERS[a.monster];
  const st = combatStats(s, m);
  const avgDmg = st.playerHit * (1 + st.playerMaxHit) / 2;
  const killMs = (m.hp / Math.max(avgDmg, 0.01)) * playerAttackMs(s) + m.respawnMs;
  return Math.round((m.hp * 3600000) / killMs);
}
