import { ACTIONS, ITEMS, MONSTERS, nodeOfAction, NODES, SKILLS, SPAWN_TILE, standOf, travelMs } from './data';
import { nextRandom } from './rng';
import { levelForXp, XP_TABLE } from './xp';
import type {
  CombatAction, CombatStyle, EquipSlot, GameState, MonsterDef, SkillAction, SkillId, Summary, Task, TaskEndReason, TaskMode,
} from './types';

/** 离线收益上限 24 小时 */
export const OFFLINE_CAP_MS = 24 * 60 * 60 * 1000;
export const MAX_QUEUE = 3;
export const PLAYER_ATTACK_MS = 2400;
export const RESPAWN_MS = 1500;
const REGEN_MS = 1000;
const MONSTER_DAMAGE_SCALE = 3;

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
    travel: null,
    seen: { minnow: 1, wood_sword: 1 },
  };
}

/** 旧存档升级到当前版本；认不出的物品和任务直接丢掉，避免读档崩溃 */
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
    loc: s.loc ?? (nodeOfAction(queue[0]?.action) ? standOf(nodeOfAction(queue[0]?.action)!) : fresh.loc),
    travel: s.travel ?? null,
    // 旧存档：现在拥有的东西都算获得过
    seen: s.seen ?? Object.fromEntries(
      [...Object.keys(keep(s.bank)), ...Object.keys(keep(s.bag)), ...Object.values(equipment)].filter((id) => id && ITEMS[id]).map((id) => [id, 1 as const]),
    ),
  };
}

export function emptySummary(): Summary {
  return { elapsedMs: 0, xp: {}, items: {}, levelUps: [], kills: {}, deaths: 0, foodEaten: 0, ammoUsed: 0, taskEnds: [] };
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
export const actionDuration = (s: GameState, a: SkillAction) => Math.round(a.durationMs / (1 + toolSpeed(s, a.skill, a.tool)));

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

/** 当前武器能用的最好的弹药：先找背包，再找仓库 */
export function bestAmmo(s: GameState, style = weaponStyle(s)): { id: string; inBag: boolean } | undefined {
  if (style === 'melee') return undefined;
  let best: { id: string; inBag: boolean } | undefined;
  for (const [store, inBag] of [[s.bag, true], [s.bank, false]] as const) {
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
  const ammo = bestAmmo(s, style);
  const strength = b.strength + (ammo ? ITEMS[ammo.id].ammo!.power : 0);
  return {
    style,
    ammo: ammo?.id,
    playerHit: hitChance((lvl + 8) * (b.attack + 64), (m.defence + 8) * 64),
    playerMaxHit: Math.floor(0.5 + ((lvl + 8) * (strength + 64)) / 640) * 10,
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

  /** 开战时按设置从仓库把食物补进背包，好的先拿 */
  const carryFood = () => {
    const target = s.settings.carryFood < 0 ? Infinity : s.settings.carryFood;
    let have = Object.entries(s.bag).reduce((n, [id, q]) => n + (healOf(id) ? q : 0), 0);
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
      if (a.inputs && !a.inputs.every((i) => (s.bank[i.item] ?? 0) >= i.qty)) return endTask('noInput'), 0;
    }
    // 进度为负表示偷窃失败后的晕眩，先走完晕眩停在 0，再做下一次的条件检查
    const duration = actionDuration(s, a);
    const step = Math.min(budget, s.progressMs < 0 ? -s.progressMs : Math.max(0, duration - s.progressMs));
    s.progressMs += step;
    if (s.progressMs >= duration) {
      s.progressMs = 0;
      a.inputs?.forEach((i) => addItem(i.item, -i.qty));
      const failChance = a.fail
        ? Math.max(0, a.fail.chance * (a.fail.noFailLevel - level(s, a.skill)) / (a.fail.noFailLevel - a.level))
        : 0;
      if (a.fail && rand() < failChance) {
        if (a.fail.item) addItem(a.fail.item, 1);
        if (a.fail.stunMs) s.progressMs = -a.fail.stunMs;
      } else {
        for (const o of a.outputs) if (o.chance === undefined || rand() < o.chance) addItem(o.item, o.qty);
        addXp(a.skill, a.xp);
      }
      task.done++;
    }
    return step;
  };

  const stepCombat = (task: Task, a: CombatAction, budget: number): number => {
    const m = MONSTERS[a.monster];
    if (!s.combat) {
      carryFood();
      s.combat = { monsterHp: m.hp, playerTimerMs: playerAttackMs(s), monsterTimerMs: m.attackMs, respawnMs: 0 };
    }
    const c = s.combat;
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
        if (!ammo) return endTask('noAmmo'), step;
        if (ammo.inBag) addBag(ammo.id, -1);
        else addItem(ammo.id, -1);
        sum.ammoUsed++;
      }
      c.playerTimerMs += playerAttackMs(s);
      if (rand() < st.playerHit) {
        const dmg = Math.min(c.monsterHp, 1 + Math.floor(rand() * st.playerMaxHit));
        c.monsterHp -= dmg;
        addXp(st.style, dmg);
        addXp('defence', dmg / 3);
        addXp('hitpoints', dmg / 3);
      }
      if (c.monsterHp <= 0) {
        for (const d of m.drops) if (d.chance === undefined || rand() < d.chance) addItem(d.item, d.qty);
        sum.kills[m.id] = (sum.kills[m.id] ?? 0) + 1;
        s.stats.kills++;
        task.done++;
        s.combat = { monsterHp: m.hp, playerTimerMs: playerAttackMs(s), monsterTimerMs: m.attackMs, respawnMs: RESPAWN_MS };
        return step;
      }
    }
    if (c.monsterTimerMs <= 0) {
      c.monsterTimerMs += m.attackMs;
      if (st.monsterMaxHit > 0 && rand() < st.monsterHit) {
        s.hp -= 1 + Math.floor(rand() * st.monsterMaxHit);
        eatIfNeeded();
        if (s.hp <= 0) {
          s.hp = maxHp(s);
          s.stats.deaths++;
          sum.deaths++;
          endTask('death');
        }
      }
    }
    return step;
  };

  while (dt > 0) {
    const task = s.queue[0];
    if (!task) {
      regen(s, dt);
      break;
    }
    const walked = stepTravel(task, dt);
    if (walked) {
      dt -= walked;
      regen(s, walked);
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

/** 没有任务时手动走到某个格子，记下位置 */
export function setLoc(prev: GameState, x: number, y: number): GameState {
  if (prev.queue.length || (prev.loc.x === x && prev.loc.y === y)) return prev;
  const s = clone(prev);
  s.loc = { x, y };
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
  const from = prev.bag[item] ? 'bag' : prev.bank[item] ? 'bank' : null;
  if (!e || !from || level(prev, e.skill) < e.level) return prev;
  const s = clone(prev);
  s[from][item] -= 1;
  if (s[from][item] <= 0) delete s[from][item];
  const old = s.equipment[e.slot];
  s.equipment[e.slot] = item;
  if (old) stow(s, old);
  return s;
}

/** 卸下装备：放进背包，背包满了才回仓库 */
export function unequip(prev: GameState, slot: EquipSlot): GameState {
  const id = prev.equipment[slot];
  if (!id) return prev;
  const s = clone(prev);
  delete s.equipment[slot];
  stow(s, id);
  return s;
}

/** 仓库 → 背包，什么都能放，放不下的留在仓库 */
export function toBag(prev: GameState, item: string, qty: number): GameState {
  const n = Math.min(prev.bank[item] ?? 0, qty, bagRoomFor(prev.bag, item));
  if (item === 'coins' || n <= 0) return prev;
  const s = clone(prev);
  s.bank[item] -= n;
  if (s.bank[item] <= 0) delete s.bank[item];
  s.bag[item] = (s.bag[item] ?? 0) + n;
  return s;
}

export function toBank(prev: GameState, item: string, qty: number): GameState {
  const n = Math.min(prev.bag[item] ?? 0, qty);
  if (n <= 0) return prev;
  const s = clone(prev);
  s.bag[item] -= n;
  if (s.bag[item] <= 0) delete s.bag[item];
  s.bank[item] = (s.bank[item] ?? 0) + n;
  return s;
}

export function sell(prev: GameState, item: string, qty: number): GameState {
  const have = prev.bank[item] ?? 0;
  const n = Math.min(have, qty);
  if (item === 'coins' || n <= 0) return prev;
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
  const killMs = (m.hp / Math.max(avgDmg, 0.01)) * playerAttackMs(s) + RESPAWN_MS;
  return Math.round((m.hp * 3600000) / killMs);
}
