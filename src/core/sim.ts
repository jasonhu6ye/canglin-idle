import { ACTIONS, CROP_DEFS, PLOT_BY_ID, WAYSTONE_HOME, WAYSTONES, ITEMS, MAP_W, WALK_TILES_PER_SEC, MONSTERS, nodeOfAction, nodesOfAction, NODES, OLD_BOX, SEED_PRICE, SEED_SHOP, SKILLS, SPAWN_TILE, standOf, TOWN_CENTER, planRoute, travelMs, type MapNode } from './data';
import { nextRandom } from './rng';
import { stepQuests } from './quests';
import { stepAutoFarm } from './farm';
import { isRaining, RAIN_FISH } from './weather';
import { BONUS_PER_LEVEL, levelForXp, speedForLevel, XP_TABLE } from './xp';
import type {
  CombatLogEntry,
  BeltSlot, BuffKind, CombatAction, CombatStyle, EquipSlot, GameState, MonsterDef, SkillAction, SkillId, Summary, Task, TaskEndReason, TaskMode,
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
    bank: { coins: 50, minnow: 10, seed_potato: 10 },
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
    seen: { minnow: 1, wood_sword: 1, seed_potato: 1 },
    waystones: [WAYSTONE_HOME],
  };
}

/** 旧存档升级到当前版本；认不出的物品和任务直接丢掉，避免读档崩溃 */
/** 连续阵亡这么多次（中间没打死一只）就停止战斗 */
export const MAX_DEATH_STREAK = 3;

/**
 * 地图扩大后换算旧存档的位置。5088 以前：城镇里的跟着镇中心平移（建筑大小不变），野外的按比例放大到 5088；
 * 8848（10-23）：老地图原样放在中间的方框里，整体平移
 */
function rescaleLoc(loc: { x: number; y: number }, old: number) {
  if (old === MAP_W) return loc;
  let p = loc;
  if (old !== OLD_BOX.size) {
    const k = OLD_BOX.size / old;
    const center = { x: TOWN_CENTER.x - OLD_BOX.x, y: TOWN_CENTER.y - OLD_BOX.y };
    const oldCenter = { x: Math.round(center.x / k), y: Math.round(center.y / k) };
    p = Math.abs(loc.x - oldCenter.x) < 60 && Math.abs(loc.y - oldCenter.y) < 60
      ? { x: loc.x - oldCenter.x + center.x, y: loc.y - oldCenter.y + center.y }
      : { x: Math.round(loc.x * k), y: Math.round(loc.y * k) };
  }
  return { x: p.x + OLD_BOX.x, y: p.y + OLD_BOX.y };
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
  // 采草药的动作 id 从 farm_ 改成 gather_（10-23 采集和种植彻底分开），旧队列照着改名
  const renamed = (id: string) => (!ACTIONS[id] && id.startsWith('farm_') && ACTIONS[`gather_${id.slice(5)}`] ? `gather_${id.slice(5)}` : id);
  const queue = (s.queue ?? []).map((t) => ({ ...t, action: renamed(t.action) })).filter((t) => ACTIONS[t.action]);
  return {
    ...fresh,
    lastTick: s.lastTick ?? fresh.lastTick,
    // 采集从种植里拆出来（10-23）：旧存档的种植经验两边都保留
    xp: { ...fresh.xp, ...s.xp, gathering: s.xp?.gathering ?? s.xp?.farming ?? 0 },
    hp: s.hp ?? fresh.hp,
    // 种植改成要种子：旧存档送 10 颗土豆种子
    bank: s.seen?.seed_potato ? keep(s.bank) : { ...keep(s.bank), seed_potato: (s.bank?.seed_potato ?? 0) + 10 },
    bag: keep(s.bag),
    equipment,
    queue,
    progressMs: queue[0] && queue[0].action === s.queue?.[0]?.action ? s.progressMs ?? 0 : 0,
    combat: queue[0] && queue[0].action === s.queue?.[0]?.action ? s.combat ?? null : null,
    settings: { ...fresh.settings, ...s.settings },
    regenMs: s.regenMs ?? 0,
    stats: { ...fresh.stats, ...s.stats },
    // 旧存档没有位置：当作已经站在当前任务的地点
    loc: s.loc ? rescaleLoc(s.loc, s.mapSize ?? 1080) : nodeOfAction(queue[0]?.action) ? standOf(nodeOfAction(queue[0]?.action)!) : fresh.loc,
    mapSize: MAP_W,
    travel: (s.mapSize ?? 1080) === MAP_W ? s.travel ?? null : null,
    walk: (s.mapSize ?? 1080) === MAP_W ? s.walk ?? null : null,
    bestiary: s.bestiary ?? {},
    quest: s.quest ?? { i: 0, n: 0 },
    buffs: s.buffs ?? {},
    mounted: !!s.mounted && !!equipment.mount,
    redeemed: s.redeemed ?? [],
    waystones: [...new Set([WAYSTONE_HOME, ...(s.waystones ?? []).filter((id) => WAYSTONES.some((n) => n.id === id))])],
    // 地块里种的作物改过名或删掉了就清掉
    farm: Object.fromEntries(Object.entries(s.farm ?? {}).filter(([id, p]) => PLOT_BY_ID[id] && p && CROP_DEFS[p.crop])),
    // 栏位里的东西改过名或删掉了就丢掉，免得界面读不到物品
    belt: Object.fromEntries(Object.entries(s.belt ?? {}).filter(([slot, b]) => b && ITEMS[b.id] && beltSlotOf(b.id) === slot && b.qty > 0)),
    // 旧存档：现在拥有的东西都算获得过
    seen: {
      ...(s.seen ?? Object.fromEntries(
        [...Object.keys(keep(s.bank)), ...Object.keys(keep(s.bag)), ...Object.values(equipment)].filter((id) => id && ITEMS[id]).map((id) => [id, 1 as const]),
      )),
      seed_potato: 1,
    },
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
  mining: 'pickaxe', woodcutting: 'axe', fishing: 'rod', gathering: 'sickle', farming: 'hoe', hunting: 'knife', smithing: 'hammer', crafting: 'needle',
};

/** 移动速度（格/秒）：骑着坐骑时按坐骑加成 */
export function moveSpeed(s: GameState): number {
  const m = s.mounted ? ITEMS[s.equipment.mount ?? '']?.equip?.move ?? 0 : 0;
  return WALK_TILES_PER_SEC * (1 + m);
}

/** 上下坐骑：正在走的路按新速度换算剩下的时间 */
export function toggleMount(prev: GameState, on = !prev.mounted): GameState {
  if (on && !prev.equipment.mount) return prev;
  if (!!prev.mounted === on) return prev;
  const s = clone(prev);
  const before = moveSpeed(s);
  s.mounted = on;
  const k = before / moveSpeed(s);
  for (const t of [s.travel, s.walk]) {
    if (!t) continue;
    t.ms = Math.round(t.ms * k);
    t.total = Math.round(t.total * k);
  }
  return s;
}

/** 兑换码（测试服）：每个存档每个码只能领一次，东西放进背包，满了放仓库 */
const CODES: Record<string, { item: string; qty: number }[]> = {
  中国人能飞: [{ item: 'mount_danmark', qty: 1 }],
};
/** 解锁衣橱外观的兑换码（外观本身在 game/hero.ts 的 OUTFITS，用 code 字段对上） */
const SKIN_CODES: Record<string, string> = {
  为爱发电: '衣橱新外观：南瓜提灯人、幽蓝南瓜、白发魔骑、红黑小丑、骸骨术士',
};
export function redeemCode(prev: GameState, raw: string): { state: GameState; msg: string; ok: boolean } {
  const code = raw.trim();
  if (SKIN_CODES[code]) {
    if (prev.redeemed?.includes(code)) return { state: prev, msg: '这个兑换码已经领过了', ok: false };
    const s = clone(prev);
    s.redeemed = [...(s.redeemed ?? []), code];
    return { state: s, msg: `兑换成功：解锁${SKIN_CODES[code]}，去「更多 → 衣橱」换上`, ok: true };
  }
  const gifts = CODES[code];
  if (!gifts) return { state: prev, msg: '兑换码无效', ok: false };
  if (prev.redeemed?.includes(code)) return { state: prev, msg: '这个兑换码已经领过了', ok: false };
  const s = clone(prev);
  s.redeemed = [...(s.redeemed ?? []), code];
  for (const g of gifts) {
    const n = Math.min(g.qty, bagRoomFor(s.bag, g.item));
    if (n > 0) s.bag[g.item] = (s.bag[g.item] ?? 0) + n;
    if (g.qty > n) s.bank[g.item] = (s.bank[g.item] ?? 0) + g.qty - n;
  }
  return { state: s, msg: `兑换成功：获得 ${gifts.map((g) => `${ITEMS[g.item].name}${g.qty > 1 ? ` ×${g.qty}` : ''}`).join('、')}`, ok: true };
}

/** 某个工具栏位当前的速度加成 */
export const slotSpeed = (s: GameState, slot: EquipSlot) => ITEMS[s.equipment[slot] ?? '']?.equip?.speed || 0;

export function toolSpeed(s: GameState, skill: SkillId, tool?: EquipSlot) {
  const slot = tool ?? TOOL_FOR[skill];
  return slot ? slotSpeed(s, slot) : 0;
}

/** 工具加速后的单次耗时 */
/** 等级加速：非战斗技能，前快后慢，见 speedForLevel */
export const levelSpeed = (s: GameState, skill: SkillId) => speedForLevel(level(s, skill));
/** 等级高出动作要求的部分：采集类是双倍产出几率，生产类是不消耗材料几率 */
export const levelBonus = (s: GameState, a: SkillAction) => Math.max(0, level(s, a.skill) - a.level) * BONUS_PER_LEVEL;

/** 当前生效的料理增益比例 */
export const buffPct = (s: GameState, k: BuffKind) => s.buffs?.[k]?.pct ?? 0;

/** 吃下一份食物：回血，有增益就挂上（同类只留一个，新的覆盖旧的） */
export function applyFood(s: GameState, id: string) {
  const it = ITEMS[id];
  s.hp = Math.min(maxHp(s), s.hp + (it?.heals ?? 0));
  if (it?.buff) s.buffs = { ...s.buffs, [it.buff.kind]: { pct: it.buff.pct, ms: it.buff.ms } };
}

/** 食物栏、药水栏每栏最多放多少 */
export const BELT_CAP = 100;
/** 血量低于这个比例时先喝药水栏的药水 */
export const POTION_AT = 0.3;
export const beltSlotOf = (id: string): BeltSlot | null =>
  ITEMS[id]?.category === 'potion' ? 'potion' : ITEMS[id]?.category === 'food' && ITEMS[id]?.heals ? 'food' : null;

/** 放进食物栏/药水栏：先拿背包里的，在仓库旁也能拿仓库的；原来放的别的东西退回背包 */
export function toBelt(prev: GameState, id: string): GameState {
  const slot = beltSlotOf(id);
  if (!slot) return prev;
  const s = clone(prev);
  s.belt ??= {};
  const cur = s.belt[slot];
  if (cur && cur.id !== id) {
    const back = Math.min(cur.qty, bagRoomFor(s.bag, cur.id));
    if (back < cur.qty && !atBank(s)) return prev;
    s.bag[cur.id] = (s.bag[cur.id] ?? 0) + back;
    if (cur.qty > back) s.bank[cur.id] = (s.bank[cur.id] ?? 0) + cur.qty - back;
    delete s.belt[slot];
  }
  let have = s.belt[slot]?.qty ?? 0;
  for (const src of atBank(s) ? [s.bag, s.bank] : [s.bag]) {
    const n = Math.min(src[id] ?? 0, BELT_CAP - have);
    if (n <= 0) continue;
    src[id] -= n;
    if (src[id] <= 0) delete src[id];
    have += n;
  }
  if (have > 0) s.belt[slot] = { id, qty: have };
  return s;
}

/** 从栏位取下来放回背包（背包放不下、人又在仓库旁就放仓库） */
export function fromBelt(prev: GameState, slot: BeltSlot): GameState {
  const cur = prev.belt?.[slot];
  if (!cur) return prev;
  const room = bagRoomFor(prev.bag, cur.id);
  if (room < cur.qty && !atBank(prev)) return prev;
  const s = clone(prev);
  const n = Math.min(room, cur.qty);
  if (n > 0) s.bag[cur.id] = (s.bag[cur.id] ?? 0) + n;
  if (cur.qty > n) s.bank[cur.id] = (s.bank[cur.id] ?? 0) + cur.qty - n;
  delete s.belt![slot];
  return s;
}

/** 手动吃背包里的一份食物 */
export function eat(prev: GameState, id: string): GameState {
  if (!(prev.bag[id] > 0) || !ITEMS[id]?.heals) return prev;
  const s = clone(prev);
  s.bag[id] -= 1;
  if (s.bag[id] <= 0) delete s.bag[id];
  applyFood(s, id);
  return s;
}

export const actionDuration = (s: GameState, a: SkillAction, t = Date.now()) =>
  Math.round(a.durationMs / (1 + toolSpeed(s, a.skill, a.tool) + levelSpeed(s, a.skill) + buffPct(s, 'speed') + rainBonus(s, a, t)));

/** 雨天钓鱼增益：钓点所在区域正在下雨时，钓鱼更快（用户 10-23） */
export function rainBonus(s: GameState, a: SkillAction, t = Date.now()) {
  if (a.skill !== 'fishing') return 0;
  const n = nodeOfAction(a.id, s.loc);
  return n && isRaining(n.region, t) ? RAIN_FISH : 0;
}

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
    playerHit: hitChance((lvl + 8) * (b.attack + 64) * (1 + buffPct(s, 'atk')), (m.defence + 8) * 64) * (has('evasive') ? 0.8 : 1),
    playerMaxHit: Math.max(1, Math.round((((lvl + 8) * (strength + 64)) / 64) * dmgMult * (1 + buffPct(s, 'str')))),
    monsterHit: m.maxHit > 0 ? hitChance((m.attack + 8) * 64, (level(s, 'defence') + 8) * (b.defence + 64) * (1 + buffPct(s, 'def'))) : 0,
    monsterMaxHit: m.maxHit * MONSTER_DAMAGE_SCALE,
  };
}

/** 战斗日志最多留多少条 */
export const LOG_CAP = 300;

/** 主循环：把存档推进到 now。在线每帧调用和离线补算用的是同一个函数，结果与调用的分段方式无关。 */
export function advance(prev: GameState, now: number): { state: GameState; summary: Summary } {
  const s = clone(prev);
  const sum = emptySummary();
  // 系统时间被往回调：不结算也不把时间往回记，否则来回改时间能反复白拿离线收益。
  // 存档时间比现在晚一天以上就当是坏数据，直接从现在算起
  if (now < s.lastTick) {
    if (s.lastTick - now > OFFLINE_CAP_MS) s.lastTick = now;
    return { state: s, summary: sum };
  }
  let dt = Math.min(now - s.lastTick, OFFLINE_CAP_MS);
  s.lastTick = now;
  sum.elapsedMs = dt;
  const from = now - dt;

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
    if (tally) tally.items[item] = (tally.items[item] ?? 0) + qty;
  };
  /** 正在记日志的这一次动作拿到了什么 */
  let tally: { items: Record<string, number>; xp: Partial<Record<SkillId, number>> } | null = null;

  const log = (e: CombatLogEntry) => {
    const l = (sum.log ??= []);
    l.push(e);
    if (l.length > LOG_CAP) l.shift();
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
    // 回最近的仓库（落霞城也有一个）
    const bank = s.travel && isBankId(s.travel.to) ? NODES.find((n) => n.id === s.travel!.to)! : nearestBank(s.loc);
    const dest = standOf(bank);
    if (!s.travel || s.travel.to !== bank.id) {
      const r = planRoute(s.waystones, s.loc, dest, moveSpeed(s));
      s.travel = { to: bank.id, ms: r.ms, total: r.ms, ...(r.via && { via: r.via }) };
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
        refillBelt();
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
    amount = Math.round(amount * (1 + buffPct(s, 'xp')));
    if (tally) tally.xp[skill] = (tally.xp[skill] ?? 0) + amount;
    // 打怪的经验记在这只怪头上，打死时一起写进战斗日志
    if (s.combat && amount > 0) {
      const g = (s.combat.gain ??= {});
      g[skill] = (g[skill] ?? 0) + amount;
    }
    const before = level(s, skill);
    s.xp[skill] += amount;
    sum.xp[skill] = (sum.xp[skill] ?? 0) + amount;
    const after = level(s, skill);
    if (after > before) sum.levelUps.push({ skill, level: after });
  };

  const endTask = (reason: TaskEndReason, item?: string) => {
    const task = s.queue.shift()!;
    sum.taskEnds.push({ action: task.action, reason });
    // 做完了且后面没任务、或者中途卡住：记下来，顶部提示为什么停了
    if (reason !== 'complete' || !s.queue.length) s.lastStop = { action: task.action, reason, mode: task.mode, at: now, ...(item && { item }) };
    s.progressMs = 0;
    s.combat = null;
    s.travel = null;
  };

  /** 还没到任务地点就先走路，返回走了多久 */
  const stepTravel = (task: Task, budget: number): number => {
    // 两座城都有的建筑：已经在走的就接着走，否则去最近的那座
    const cands = nodesOfAction(task.action);
    if (!cands.length) return 0;
    if (cands.some((n) => { const d = standOf(n); return d.x === s.loc.x && d.y === s.loc.y; })) return 0;
    const node = cands.find((n) => n.id === s.travel?.to) ?? nodeOfAction(task.action, s.loc)!;
    const dest = standOf(node);
    if (!s.travel || s.travel.to !== node.id) {
      const r = planRoute(s.waystones, s.loc, dest, moveSpeed(s));
      s.travel = { to: node.id, ms: r.ms, total: r.ms, ...(r.via && { via: r.via }) };
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
  /** 从食物栏/药水栏吃一份，吃空了清掉栏位 */
  const useBelt = (slot: BeltSlot) => {
    const b = s.belt?.[slot];
    if (!b) return false;
    b.qty--;
    if (b.qty <= 0) delete s.belt![slot];
    sum.foodEaten++;
    applyFood(s, b.id);
    return true;
  };
  const eatIfNeeded = () => {
    // 血很低先喝药水栏的药水
    // 选了「不带药水」「不带食物」：战斗中一口都不吃（用户 10-23）
    if (s.settings.carryPotion !== false) while (s.hp < maxHp(s) * POTION_AT && useBelt('potion'));
    if (s.settings.carryFood === 0) return;
    const limit = maxHp(s) * s.settings.eatThreshold;
    while (s.hp < limit) {
      if (useBelt('food')) continue;
      const food = bestFood(s);
      if (!food) return;
      addBag(food, -1);
      sum.foodEaten++;
      applyFood(s, food);
    }
  };

  /** 在仓库旁把食物栏、药水栏补满（同一种） */
  const refillBelt = () => {
    for (const b of beltInUse()) {
      const n = Math.min(s.bank[b.id] ?? 0, BELT_CAP - b.qty);
      if (n <= 0) continue;
      s.bank[b.id] -= n;
      if (s.bank[b.id] <= 0) delete s.bank[b.id];
      b.qty += n;
    }
  };
  /** 这次要用的栏位：不带食物/药水时对应的栏位不补 */
  const beltInUse = () => (['food', 'potion'] as const)
    .filter((k) => (k === 'food' ? s.settings.carryFood !== 0 : s.settings.carryPotion !== false))
    .map((k) => s.belt?.[k]).filter((b): b is NonNullable<typeof b> => !!b);
  const beltNeeds = () => beltInUse().some((b) => b.qty < BELT_CAP && (s.bank[b.id] ?? 0) > 0);

  const foodTarget = () => (s.settings.carryFood < 0 ? Infinity : s.settings.carryFood);
  const bagFood = () => Object.entries(s.bag).reduce((n, [id, q]) => n + (healOf(id) && beltSlotOf(id) !== 'potion' ? q : 0), 0) + (s.belt?.food?.qty ?? 0);
  /** 背包里的食物不够设定数量，仓库里又有：要先回仓库拿 */
  const needSupply = () =>
    beltNeeds() || (bagFood() < foodTarget() && Object.keys(s.bank).some((id) => healOf(id) > 0 && bagRoomFor(s.bag, id) > 0))
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
    const foods = Object.keys(s.bank).filter((id) => healOf(id) && (beltSlotOf(id) !== 'potion' || s.settings.carryPotion !== false)).sort((a, b) => healOf(b) - healOf(a));
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
      if (a.inputs && !a.inputs.every((i) => haveItem(i.item) >= i.qty)) return endTask('noInput', a.inputs.find((i) => haveItem(i.item) < i.qty)!.item), 0;
    }
    // 进度为负表示偷窃失败后的晕眩，先走完晕眩停在 0，再做下一次的条件检查
    const duration = actionDuration(s, a, now - dt);
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
      tally = { items: {}, xp: {} };
      const failed = !!a.fail && rand() < failChance;
      if (failed) {
        if (a.fail!.item) addLoot(a.fail!.item, 1);
        if (a.fail!.stunMs) s.progressMs = -a.fail!.stunMs;
      } else {
        for (const o of a.outputs) if (o.chance === undefined || rand() < o.chance) addLoot(o.item, o.qty);
        if (gatherer && rand() < bonus) a.outputs.forEach((o) => o.chance === undefined && addLoot(o.item, o.qty));
        addXp(a.skill, a.xp);
      }
      log({ t: now - dt, kind: failed ? 'fail' : 'skill', action: a.id, xp: tally.xp, items: tally.items });
      tally = null;
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
      log({ t: now - dt, kind: 'death', monster: m.id, xp: {}, items: {} });
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
      c.pSwings = (c.pSwings ?? 0) + 1;
      c.pDmg = -1;
      if (rand() < st.playerHit) {
        const dmg = Math.min(c.monsterHp, 1 + Math.floor(rand() * st.playerMaxHit));
        c.monsterHp -= dmg;
        c.pDmg = dmg;
        addXp(st.style, dmg);
        addXp('defence', dmg / 3);
        addXp('hitpoints', dmg / 3);
        // 荆棘：打它会被反伤
        if (has('thorns') && hurt(Math.floor(dmg * 0.15))) return step;
      }
      if (c.monsterHp <= 0) {
        const got: Record<string, number> = {};
        for (const d of m.drops) {
          if (d.chance === undefined || rand() < d.chance) {
            addLoot(d.item, d.qty);
            got[d.item] = (got[d.item] ?? 0) + d.qty;
          }
        }
        log({ t: now - dt, kind: 'kill', monster: m.id, xp: c.gain ?? {}, items: got });
        sum.kills[m.id] = (sum.kills[m.id] ?? 0) + 1;
        s.stats.kills++;
        task.deathStreak = 0;
        s.bestiary = { ...s.bestiary, [m.id]: (s.bestiary?.[m.id] ?? 0) + 1 };
        task.done++;
        s.combat = { monsterHp: m.hp, playerTimerMs: playerAttackMs(s), monsterTimerMs: m.attackMs, respawnMs: m.respawnMs ?? RESPAWN_MS, pSwings: c.pSwings, pDmg: c.pDmg, mSwings: c.mSwings };
        return step;
      }
    }
    if (c.monsterTimerMs <= 0) {
      c.monsterTimerMs += m.attackMs;
      if (has('regen')) c.monsterHp = Math.min(m.hp, c.monsterHp + Math.ceil(m.hp * 0.03));
      c.mSwings = (c.mSwings ?? 0) + 1;
      c.mDmg = -1;
      if (st.monsterMaxHit > 0 && rand() < st.monsterHit) {
        const rage = has('berserk') && c.monsterHp < m.hp / 2 ? 1.5 : 1;
        let dmg = 1 + Math.floor(rand() * st.monsterMaxHit * rage);
        if (has('venom')) dmg += Math.ceil(m.level / 8);
        if (has('lifesteal')) c.monsterHp = Math.min(m.hp, c.monsterHp + Math.ceil(dmg / 2));
        c.mDmg = dmg;
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
      if (isBankId(s.travel?.to) || needSupply()) {
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
    if (isBankId(s.travel?.to) || (between && !s.travel && !fits(lootOf(a0)))) {
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
  stepAutoFarm(s, sum, from, now);
  // 走到（或寻路到）石碑旁边就激活
  if (!s.travel && !s.walk) {
    const got = unlockNear(s, s.loc);
    if (got.length) sum.waystones = got;
  }
  const before = s.quest?.i ?? 0;
  if (stepQuests(s, sum).length) sum.quests = Array.from({ length: (s.quest?.i ?? 0) - before }, (_, k) => before + k);
  return { state: s, summary: sum };
}

function regen(s: GameState, ms: number) {
  // 料理增益跟着经过的时间流逝（所有耗时都会走到这里）
  if (s.buffs) {
    for (const k of Object.keys(s.buffs) as BuffKind[]) {
      const b = s.buffs[k]!;
      b.ms -= ms;
      if (b.ms <= 0) delete s.buffs[k];
    }
  }
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

/** 激活 at 附近（4 格内）还没激活的石碑，返回激活了哪些 */
export const WAYSTONE_REACH = 4;
function unlockNear(s: GameState, at: { x: number; y: number }): string[] {
  const got: string[] = [];
  for (const n of WAYSTONES) {
    if (s.waystones?.includes(n.id)) continue;
    const st = standOf(n);
    if (Math.hypot(at.x - st.x, at.y - st.y) > WAYSTONE_REACH) continue;
    (s.waystones ??= []).push(n.id);
    got.push(n.id);
  }
  return got;
}

/** 地图上角色路过石碑：按画面上的位置激活（走路途中也算） */
export function unlockWaystone(prev: GameState, at: { x: number; y: number }): { state: GameState; got: string[] } {
  const s = clone(prev);
  const got = unlockNear(s, at);
  return got.length ? { state: s, got } : { state: prev, got };
}

/** 站在哪座激活过的石碑旁边 */
export function atWaystone(s: GameState): MapNode | undefined {
  return WAYSTONES.find((n) => s.waystones?.includes(n.id) && nearNode(s, n));
}

/** 用石碑传送：要站在一座激活过的石碑旁，目的地也要激活过。正在做的工作暂停（队列留着） */
export function useWaystone(prev: GameState, to: string): GameState {
  const dest = WAYSTONES.find((n) => n.id === to);
  const from = atWaystone(prev);
  if (!dest || !from || from === dest || !prev.waystones?.includes(to)) return prev;
  const s = clone(leaveWork(prev));
  s.loc = standOf(dest);
  s.walk = null;
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
  if ((prev.queue.length && !prev.paused) || (prev.loc.x === x && prev.loc.y === y && !prev.walk)) return prev;
  const s = clone(prev);
  s.loc = { x, y };
  s.walk = null;
  return s;
}

export function enqueue(prev: GameState, action: string, mode: TaskMode): GameState {
  if (prev.queue.length >= MAX_QUEUE) return prev;
  const s = clone(prev);
  s.queue.push({ action, mode, done: 0, elapsedMs: 0 });
  s.lastStop = null;
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
/** 所有仓库和集市（两座城各有一个，存的是同一份仓库） */
const BANKS = NODES.filter((n) => n.opens === 'bank');
const MARKETS = NODES.filter((n) => n.sprite === 'market');
const BANK_IDS = new Set(BANKS.map((n) => n.id));
export const isBankId = (id: string | undefined) => !!id && BANK_IDS.has(id);
const nearest = (list: MapNode[], loc: { x: number; y: number }) => {
  let best = list[0];
  let bestD = Infinity;
  for (const n of list) {
    const d = travelMs(loc, standOf(n));
    if (d < bestD) { bestD = d; best = n; }
  }
  return best;
};
export const nearestBank = (loc: { x: number; y: number }) => nearest(BANKS, loc);
export const nearestMarket = (loc: { x: number; y: number }) => nearest(MARKETS, loc);
const within = (s: GameState, list: MapNode[]) => !s.travel && !s.walk && list.some((n) => {
  const st = standOf(n);
  return Math.hypot(s.loc.x - st.x, s.loc.y - st.y) <= BANK_REACH;
});
export function atBank(s: GameState): boolean {
  return within(s, BANKS);
}
/** 主城仓库、集市的站位（测试和默认用） */
export const bankStand = () => standOf(BANKS[0]);
export const marketStand = () => standOf(MARKETS[0]);

/** 城镇设施（灶台、熔炉、工坊…）也要站在旁边才能直接开工（用户 10-23 要求） */
export function nearNode(s: GameState, node: MapNode): boolean {
  const st = standOf(node as MapNode);
  return !s.travel && !s.walk && Math.hypot(s.loc.x - st.x, s.loc.y - st.y) <= BANK_REACH;
}

/** 卸下装备：放进背包；背包满了，人在仓库旁才能放回仓库 */
export function unequip(prev: GameState, slot: EquipSlot): GameState {
  const id = prev.equipment[slot];
  if (!id) return prev;
  if (bagRoomFor(prev.bag, id) <= 0 && !atBank(prev)) return prev;
  const s = clone(prev);
  delete s.equipment[slot];
  if (slot === 'mount') s.mounted = false;
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

/** 卖东西要站在集市旁（哪座城的都行） */
export function atMarket(s: GameState): boolean {
  return within(s, MARKETS);
}

export function sell(prev: GameState, item: string, qty: number): GameState {
  const have = prev.bank[item] ?? 0;
  const n = Math.floor(Math.min(have, qty));
  if (item === 'coins' || !ITEMS[item] || n <= 0 || !atMarket(prev)) return prev;
  const s = clone(prev);
  s.bank[item] = have - n;
  if (s.bank[item] <= 0) delete s.bank[item];
  s.bank.coins = (s.bank.coins ?? 0) + n * ITEMS[item].value;
  return s;
}

/** 集市种子摊：花仓库里的金币买种子，买到的直接进仓库（种田会从仓库扣种子） */
export function buySeed(prev: GameState, item: string, qty: number): GameState {
  const cost = ITEMS[item]?.value * SEED_PRICE * qty;
  if (!SEED_SHOP.includes(item) || !Number.isInteger(qty) || qty <= 0 || !atMarket(prev) || (prev.bank.coins ?? 0) < cost) return prev;
  const s = clone(prev);
  s.bank.coins -= cost;
  s.bank[item] = (s.bank[item] ?? 0) + qty;
  s.seen[item] = 1;
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

/**
 * 打开宝箱、福袋（用户 10-23）：背包里的随时能开，仓库里的要站在仓库旁。
 * 金币直接进仓库；开出来的东西放回原处（背包放不下的进仓库）。返回新状态和开出了什么。
 */
export function openContainer(prev: GameState, id: string, from: 'bag' | 'bank', count = 1): [GameState, Record<string, number>] {
  const table = ITEMS[id]?.opens;
  const have = (from === 'bag' ? prev.bag[id] : prev.bank[id]) ?? 0;
  const n = Math.min(have, Math.max(1, Math.floor(count)));
  if (!table || n <= 0 || (from === 'bank' && !atBank(prev))) return [prev, {}];
  const s = clone(prev);
  const rand = () => {
    const [r, next] = nextRandom(s.rng);
    s.rng = next;
    return r;
  };
  const roll = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const src = from === 'bag' ? s.bag : s.bank;
  src[id] -= n;
  if (src[id] <= 0) delete src[id];
  const got: Record<string, number> = {};
  const total = table.pool.reduce((a, e) => a + e.w, 0);
  for (let k = 0; k < n; k++) {
    got.coins = (got.coins ?? 0) + roll(table.coins[0], table.coins[1]);
    for (let r = 0; r < table.rolls && total > 0; r++) {
      let x = rand() * total;
      const e = table.pool.find((p) => (x -= p.w) < 0) ?? table.pool[table.pool.length - 1];
      got[e.item] = (got[e.item] ?? 0) + roll(e.min, e.max);
    }
  }
  for (const [item, q] of Object.entries(got)) {
    s.seen[item] = 1;
    if (item === 'coins' || from === 'bank') {
      s.bank[item] = (s.bank[item] ?? 0) + q;
      continue;
    }
    const fit = Math.min(q, bagRoomFor(s.bag, item));
    if (fit > 0) s.bag[item] = (s.bag[item] ?? 0) + fit;
    if (q > fit) s.bank[item] = (s.bank[item] ?? 0) + q - fit;
  }
  return [s, got];
}

/** 点掉顶部的「任务停了」提示 */
export function dismissStop(prev: GameState): GameState {
  return prev.lastStop ? { ...prev, lastStop: null } : prev;
}
