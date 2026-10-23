import { CROP_DEFS, cropsOfField, FARM_NODES, ITEMS, PLOT_BY_ID, plotsOf, WATER_SPEEDUP } from './data';
import { isRaining } from './weather';
import { stepQuests } from './quests';
import { nextRandom } from './rng';
import { bagRoomFor, buffPct, emptySummary, level, LOG_CAP, levelSpeed, toolSpeed } from './sim';
import { BONUS_PER_LEVEL } from './xp';
import type { CombatLogEntry, GameState, Plot, Summary } from './types';

/**
 * 地块制种田（用户 10-23 要求做成星露谷那样）：
 * 站在田边一格一格地种、浇水、收获，也可以一键种满 / 浇水 / 收获；
 * 作物按现实时间长大，离线也长。开了「自动补种」的田熟了会自己收、再种同一种（种子先用背包再用仓库）。
 */
export type FarmResult = { state: GameState; summary: Summary };

/** 站在田里（不在走路）才能动手；田左右各 8 格、上下各 3 格 */
export function nearField(s: GameState, field: string): boolean {
  const n = FARM_NODES.find((x) => x.id === field);
  return !!n && !s.travel && !s.walk && Math.abs(s.loc.x - n.x) <= 10 && Math.abs(s.loc.y - n.y) <= 5;
}

/** 种下到成熟要多久：锄头和种植等级都能加快 */
export const growMs = (s: GameState, crop: string, fert = 0) =>
  Math.round(CROP_DEFS[crop].growMs / (1 + toolSpeed(s, 'farming') + levelSpeed(s, 'farming') + (fert ? FERT_SPEEDUP[fert] : 0)));

/** 施肥长得快多少：普通 20%、高级 35% */
export const FERT_SPEEDUP = [0, 0.2, 0.35];
export const FERTS = ['fert_basic', 'fert_rich'] as const;
const count = (s: GameState, id: string) => (s.bag[id] ?? 0) + (s.bank[id] ?? 0);
export const fertCount = count;


export const seedOf = (crop: string) => `seed_${crop}`;
export const seedCount = (s: GameState, crop: string) => (s.bag[seedOf(crop)] ?? 0) + (s.bank[seedOf(crop)] ?? 0);

export type PlotPhase = 'empty' | 'growing' | 'ripe';
export function plotPhase(p: Plot | undefined, now: number): PlotPhase {
  if (!p) return 'empty';
  return now >= p.ripe ? 'ripe' : 'growing';
}
/** 长到几成了（0-1） */
export const plotGrowth = (p: Plot, now: number) => Math.max(0, Math.min(1, (now - p.at) / Math.max(1, p.ripe - p.at)));

export const canPlantCrop = (s: GameState, field: string, crop: string) =>
  !!CROP_DEFS[crop] && cropsOfField(field).some((c) => c.id === crop) && level(s, 'farming') >= CROP_DEFS[crop].level;

/** 点空地种什么：这块田选好的种子；没选或种子用完了，就挑有种子的里面等级最高的 */
export function pickSeed(s: GameState, field: string): string | undefined {
  const want = s.settings.farmSeed?.[field];
  if (want && canPlantCrop(s, field, want) && seedCount(s, want) > 0) return want;
  return cropsOfField(field).filter((c) => canPlantCrop(s, field, c.id) && seedCount(s, c.id) > 0).pop()?.id;
}

/** 在一份可改的存档上操作，最后统一结算新手任务 */
function run(prev: GameState, fn: (s: GameState, sum: Summary) => void): FarmResult {
  const s: GameState = JSON.parse(JSON.stringify(prev));
  const sum = emptySummary();
  fn(s, sum);
  const before = s.quest?.i ?? 0;
  if (stepQuests(s, sum).length) sum.quests = Array.from({ length: (s.quest?.i ?? 0) - before }, (_, k) => before + k);
  return { state: s, summary: sum };
}

/** 字符串 → 32 位整数（FNV-1a） */
function hash(str: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
  return h | 0;
}

const useSeed = (s: GameState, crop: string) => useOne(s, seedOf(crop));

function useOne(s: GameState, id: string): boolean {
  for (const box of [s.bag, s.bank]) {
    if ((box[id] ?? 0) > 0) {
      box[id]--;
      if (box[id] <= 0) delete box[id];
      return true;
    }
  }
  return false;
}

function plantAt(s: GameState, plotId: string, crop: string, t: number): boolean {
  if ((s.farm ??= {})[plotId] || !useSeed(s, crop)) return false;
  const field = PLOT_BY_ID[plotId]?.field;
  // 选了肥料、手上还有就施一份
  const want = field ? s.settings.farmFert?.[field] : undefined;
  const fert = want && useOne(s, want) ? (want === 'fert_rich' ? 2 : 1) : 0;
  const p: Plot = { crop, at: t, ripe: t + growMs(s, crop, fert), ...(fert ? { fert: fert as 1 | 2 } : {}) };
  s.farm[plotId] = p;
  // 装了洒水器的田，种下就浇好水
  if (field && s.sprinklers?.includes(field)) waterAt(s, plotId, t);
  return true;
}

/** 站在田里装洒水器：用掉一个，这块田以后新种的都自动浇水 */
export function installSprinkler(prev: GameState, field: string, now: number): FarmResult {
  return run(prev, (s) => {
    if (!nearField(s, field) || s.sprinklers?.includes(field) || !useOne(s, 'sprinkler')) return;
    s.sprinklers = [...(s.sprinklers ?? []), field];
    // 已经种着的也顺手浇一遍
    for (const p of plotsOf(field)) waterAt(s, p.id, now);
  });
}

/**
 * 下雨自动浇水（用户 10-23）：天气按 8 分钟一段，这次结算经过的每段雨里，
 * 田里还没熟、没浇过的作物都算浇过水（按那段雨开始的时刻算）
 */
const RAIN_SEG = 8 * 60 * 1000;
export function stepRain(s: GameState, from: number, now: number) {
  if (!s.farm || !Object.keys(s.farm).length) return;
  const region = FARM_NODES[0]?.region;
  if (!region) return;
  const start = Math.max(from, now - 24 * 3600_000);
  for (let seg = Math.floor(start / RAIN_SEG) * RAIN_SEG; seg < now; seg += RAIN_SEG) {
    if (!isRaining(region, seg)) continue;
    const t = Math.max(seg, start);
    for (const [id, p] of Object.entries(s.farm)) if (p.at <= Math.min(now, seg + RAIN_SEG)) waterAt(s, id, Math.max(t, p.at));
  }
}

/**
 * 收一格熟了的地：产出、经验、日志。toBank：自动补种收的直接进仓库，人不在旁边。
 * 等级高出作物要求的部分是双倍收成的几率，和别的采集一样
 */
function harvestAt(s: GameState, sum: Summary, plotId: string, t: number, toBank: boolean): boolean {
  const p = s.farm?.[plotId];
  if (!p || t < p.ripe) return false;
  const c = CROP_DEFS[p.crop];
  delete s.farm![plotId];
  if (!c) return true;
  // 每格每次收获用自己的随机数（按地块和种下时刻），和别的结算怎么交错都不影响结果
  let seed = hash(`${plotId}@${p.at}`);
  const rand = () => {
    const [r, next] = nextRandom(seed);
    seed = next;
    return r;
  };
  const items: Record<string, number> = {};
  const add = (item: string, qty: number) => {
    const n = toBank ? 0 : Math.min(qty, bagRoomFor(s.bag, item));
    if (n > 0) s.bag[item] = (s.bag[item] ?? 0) + n;
    if (qty > n) s.bank[item] = (s.bank[item] ?? 0) + qty - n;
    s.seen[item] = 1;
    sum.items[item] = (sum.items[item] ?? 0) + qty;
    items[item] = (items[item] ?? 0) + qty;
  };
  for (const o of c.outputs) if (o.chance === undefined || rand() < o.chance) add(o.item, o.qty);
  const bonus = Math.max(0, level(s, 'farming') - c.level) * BONUS_PER_LEVEL;
  if (rand() < bonus) c.outputs.forEach((o) => o.chance === undefined && add(o.item, o.qty));
  // 高级肥料：多收 1 个
  if (p.fert === 2) add(c.id, 1);
  const xp = Math.round(c.xp * (1 + buffPct(s, 'xp')));
  const before = level(s, 'farming');
  s.xp.farming += xp;
  sum.xp.farming = (sum.xp.farming ?? 0) + xp;
  const after = level(s, 'farming');
  if (after > before) sum.levelUps.push({ skill: 'farming', level: after });
  // 同一种作物一分钟内收的几格并成一条日志，免得一键收获把日志刷满
  const l = (sum.log ??= []);
  const last = l[l.length - 1];
  if (last && last.crop === c.id && !!last.auto === toBank && t - last.t < 60_000) {
    last.n = (last.n ?? 1) + 1;
    last.xp.farming = (last.xp.farming ?? 0) + xp;
    for (const [k, q] of Object.entries(items)) last.items[k] = (last.items[k] ?? 0) + q;
  } else {
    l.push({ t, kind: 'skill', crop: c.id, xp: { farming: xp }, items, ...(toBank ? { auto: true } : {}) } satisfies CombatLogEntry);
    if (l.length > LOG_CAP) l.shift();
  }
  return true;
}

function waterAt(s: GameState, plotId: string, now: number): boolean {
  const p = s.farm?.[plotId];
  if (!p || p.water || now >= p.ripe) return false;
  p.water = true;
  p.ripe = now + Math.round((p.ripe - now) * (1 - WATER_SPEEDUP));
  return true;
}

/** 点一格地：空地种下、长着的浇水、熟了的收获 */
export function tendPlot(prev: GameState, plotId: string, crop: string | undefined, now: number): FarmResult {
  const plot = PLOT_BY_ID[plotId];
  return run(prev, (s, sum) => {
    if (!plot || !nearField(s, plot.field)) return;
    const p = s.farm?.[plotId];
    const ph = plotPhase(p, now);
    if (ph === 'ripe') {
      harvestAt(s, sum, plotId, now, false);
      // 开了自动补种：收完马上种回去
      const again = s.settings.autoFarm?.[plot.field] ? p!.crop : undefined;
      if (again && canPlantCrop(s, plot.field, again)) plantAt(s, plotId, again, now);
    } else if (ph === 'growing') waterAt(s, plotId, now);
    else if (crop && canPlantCrop(s, plot.field, crop)) plantAt(s, plotId, crop, now);
  });
}

/** 一键种满：空地全种上这块田选的种子，种子不够就种到用完 */
export function plantAll(prev: GameState, field: string, crop: string, now: number): FarmResult {
  return run(prev, (s) => {
    if (!nearField(s, field) || !canPlantCrop(s, field, crop)) return;
    for (const p of plotsOf(field)) if (!plantAt(s, p.id, crop, now) && seedCount(s, crop) === 0) break;
  });
}

export function waterAll(prev: GameState, field: string, now: number): FarmResult {
  return run(prev, (s) => {
    if (!nearField(s, field)) return;
    for (const p of plotsOf(field)) waterAt(s, p.id, now);
  });
}

export function harvestAll(prev: GameState, field: string, now: number): FarmResult {
  return run(prev, (s, sum) => {
    if (!nearField(s, field)) return;
    const auto = !!s.settings.autoFarm?.[field];
    for (const p of plotsOf(field)) {
      const crop = s.farm?.[p.id]?.crop;
      if (!harvestAt(s, sum, p.id, now, false)) continue;
      if (auto && crop && canPlantCrop(s, field, crop)) plantAt(s, p.id, crop, now);
    }
  });
}

/** 田里各种状态的格数 */
export function fieldCounts(s: GameState, field: string, now: number) {
  const n = { empty: 0, growing: 0, ripe: 0, dry: 0, total: 0, next: Infinity };
  for (const p of plotsOf(field)) {
    const plot = s.farm?.[p.id];
    const ph = plotPhase(plot, now);
    n[ph]++;
    n.total++;
    if (plot && ph === 'growing') {
      if (!plot.water) n.dry++;
      n.next = Math.min(n.next, plot.ripe - now);
    }
  }
  return n;
}

/**
 * 自动补种（advance 里调用）：开了自动的田，熟了的按成熟时刻收进仓库并马上种回去，
 * 离线时一轮接一轮地补算。floor：这次结算的起点，更早熟的按起点算（离线最多补算一天）
 */
export function stepAutoFarm(s: GameState, sum: Summary, floor: number, now: number) {
  const auto = s.settings.autoFarm;
  if (!s.farm || !auto || !Object.values(auto).some(Boolean)) return;
  // 按成熟先后一格一格地收：等级在中途升上去时，不管分几次结算顺序都一样
  for (let guard = 0; guard < 200_000; guard++) {
    let id: string | undefined;
    let best = Infinity;
    for (const [k, p] of Object.entries(s.farm)) {
      const field = PLOT_BY_ID[k]?.field;
      if (!field || !auto[field] || p.ripe > now) continue;
      const t = Math.max(p.ripe, floor);
      if (t < best || (t === best && k < id!)) { best = t; id = k; }
    }
    if (!id) return;
    const field = PLOT_BY_ID[id].field;
    const crop = s.farm[id].crop;
    harvestAt(s, sum, id, best, true);
    if (ITEMS[seedOf(crop)] && canPlantCrop(s, field, crop)) plantAt(s, id, crop, best);
  }
}
