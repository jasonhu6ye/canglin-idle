import { ACTIONS, ITEMS, MONSTERS } from './data';
import { nextRandom } from './rng';
import { levelForXp, XP_TABLE } from './xp';
import type {
  CombatAction, GameState, MonsterDef, SkillAction, SkillId, Summary, Task, TaskEndReason, TaskMode,
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

export function newGame(now: number, seed = Math.floor(Math.random() * 2 ** 31)): GameState {
  return {
    version: 1,
    lastTick: now,
    rng: seed,
    xp: { mining: 0, woodcutting: 0, fishing: 0, smithing: 0, cooking: 0, melee: 0, hitpoints: XP_TABLE[10] },
    hp: 100,
    bank: { coins: 50, minnow: 10 },
    equipment: { weapon: 'bronze_sword' },
    queue: [],
    progressMs: 0,
    combat: null,
    settings: { eatThreshold: 0.5 },
    regenMs: 0,
    stats: { kills: 0, deaths: 0 },
  };
}

export function emptySummary(): Summary {
  return { elapsedMs: 0, xp: {}, items: {}, levelUps: [], kills: {}, deaths: 0, foodEaten: 0, taskEnds: [] };
}

export const level = (s: GameState, skill: SkillId) => levelForXp(s.xp[skill]);
export const maxHp = (s: GameState) => level(s, 'hitpoints') * 10;

export function playerBonuses(s: GameState) {
  const b = { attack: 0, strength: 0, defence: 0 };
  for (const id of Object.values(s.equipment)) {
    const e = id && ITEMS[id]?.equip;
    if (!e) continue;
    b.attack += e.attack;
    b.strength += e.strength;
    b.defence += e.defence;
  }
  return b;
}

/** RuneScape 式命中率：攻击值与防御值对抗 */
function hitChance(attackRoll: number, defenceRoll: number): number {
  return attackRoll > defenceRoll
    ? 1 - (defenceRoll + 2) / (2 * (attackRoll + 1))
    : attackRoll / (2 * (defenceRoll + 1));
}

export function combatStats(s: GameState, m: MonsterDef) {
  const lvl = level(s, 'melee');
  const b = playerBonuses(s);
  return {
    playerHit: hitChance((lvl + 8) * (b.attack + 64), (m.defence + 8) * 64),
    playerMaxHit: Math.floor(0.5 + ((lvl + 8) * (b.strength + 64)) / 640) * 10,
    monsterHit: hitChance((m.attack + 8) * 64, (lvl + 8) * (b.defence + 64)),
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
  };

  const isFinished = (task: Task) =>
    (task.mode.type === 'count' && task.done >= task.mode.count) ||
    (task.mode.type === 'time' && task.elapsedMs >= task.mode.ms);

  const timeLeft = (task: Task) => (task.mode.type === 'time' ? task.mode.ms - task.elapsedMs : Infinity);

  const eatIfNeeded = () => {
    const limit = maxHp(s) * s.settings.eatThreshold;
    while (s.hp < limit) {
      const food = bestFood(s);
      if (!food) return;
      addItem(food, -1);
      sum.foodEaten++;
      s.hp = Math.min(maxHp(s), s.hp + ITEMS[food].heals!);
    }
  };

  const stepSkill = (task: Task, a: SkillAction, budget: number): number => {
    if (s.progressMs === 0) {
      if (level(s, a.skill) < a.level) return endTask('level'), 0;
      if (a.inputs && !a.inputs.every((i) => (s.bank[i.item] ?? 0) >= i.qty)) return endTask('noInput'), 0;
    }
    const step = Math.min(budget, a.durationMs - s.progressMs);
    s.progressMs += step;
    if (s.progressMs >= a.durationMs) {
      s.progressMs = 0;
      a.inputs?.forEach((i) => addItem(i.item, -i.qty));
      const failChance = a.fail
        ? Math.max(0, a.fail.chance * (a.fail.noFailLevel - level(s, a.skill)) / (a.fail.noFailLevel - a.level))
        : 0;
      if (a.fail && rand() < failChance) {
        addItem(a.fail.item, 1);
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
    if (!s.combat) s.combat = { monsterHp: m.hp, playerTimerMs: PLAYER_ATTACK_MS, monsterTimerMs: m.attackMs, respawnMs: 0 };
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
      c.playerTimerMs += PLAYER_ATTACK_MS;
      if (rand() < st.playerHit) {
        const dmg = Math.min(c.monsterHp, 1 + Math.floor(rand() * st.playerMaxHit));
        c.monsterHp -= dmg;
        addXp('melee', dmg);
        addXp('hitpoints', dmg / 3);
      }
      if (c.monsterHp <= 0) {
        for (const d of m.drops) if (d.chance === undefined || rand() < d.chance) addItem(d.item, d.qty);
        sum.kills[m.id] = (sum.kills[m.id] ?? 0) + 1;
        s.stats.kills++;
        task.done++;
        s.combat = { monsterHp: m.hp, playerTimerMs: PLAYER_ATTACK_MS, monsterTimerMs: m.attackMs, respawnMs: RESPAWN_MS };
        return step;
      }
    }
    if (c.monsterTimerMs <= 0) {
      c.monsterTimerMs += m.attackMs;
      if (rand() < st.monsterHit) {
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

export function bestFood(s: GameState): string | undefined {
  let best: string | undefined;
  for (const [id, qty] of Object.entries(s.bank)) {
    const heals = ITEMS[id]?.heals;
    if (qty > 0 && heals && (!best || heals > ITEMS[best].heals!)) best = id;
  }
  return best;
}

// ---- 玩家操作（都返回新存档，不修改旧存档） ----

/** 立即开始：替换当前任务 */
export function startNow(prev: GameState, action: string, mode: TaskMode): GameState {
  const s = clone(prev);
  s.queue = [{ action, mode, done: 0, elapsedMs: 0 }, ...s.queue.slice(1)];
  s.progressMs = 0;
  s.combat = null;
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
  }
  return s;
}

export function equip(prev: GameState, item: string): GameState {
  const e = ITEMS[item]?.equip;
  if (!e || !prev.bank[item] || level(prev, 'melee') < e.level) return prev;
  const s = clone(prev);
  const old = s.equipment[e.slot];
  if (old) s.bank[old] = (s.bank[old] ?? 0) + 1;
  s.bank[item] -= 1;
  if (s.bank[item] <= 0) delete s.bank[item];
  s.equipment[e.slot] = item;
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

/** 某个动作每小时的经验（战斗为估算期望值），用于列表上的「经验/小时」 */
export function xpPerHour(s: GameState, actionId: string): number {
  const a = ACTIONS[actionId];
  if (a.kind === 'skill') return Math.round((a.xp * 3600000) / a.durationMs);
  const m = MONSTERS[a.monster];
  const st = combatStats(s, m);
  const avgDmg = st.playerHit * (1 + st.playerMaxHit) / 2;
  const killMs = (m.hp / Math.max(avgDmg, 0.01)) * PLAYER_ATTACK_MS + RESPAWN_MS;
  return Math.round((m.hp * 3600000) / killMs);
}
