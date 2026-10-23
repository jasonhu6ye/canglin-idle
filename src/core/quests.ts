import { ITEMS, SKILLS } from './data';
import type { GameState, SkillId, Summary } from './types';
import { level } from './sim';

/** 新手任务：一条线带新玩家走一遍采集 → 加工 → 打造 → 战斗（用户 10-22 要求） */
export interface QuestDef {
  /** 去做：打开这个动作所在的地点 */
  hint: string;
  reward: number;
  /** 新手指引：这一步教什么、怎么做（用户 10-23 要求加更多指引） */
  tip: string;
  goal:
    | { kind: 'gain'; item: string; n: number }
    | { kind: 'level'; skill: SkillId; n: number }
    | { kind: 'kills'; n: number }
    | { kind: 'equip'; item: string; n: 1 };
}

export const QUESTS: QuestDef[] = [
  { hint: 'chop_plain', reward: 30, goal: { kind: 'gain', item: 'plain_log', n: 10 },
    tip: '点「去做」，角色会自己走到树林。到了以后点「立即开始」，砍树会一直自动进行，你可以去干别的。' },
  { hint: 'mine_stone', reward: 30, goal: { kind: 'gain', item: 'stone', n: 10 },
    tip: '采集的东西先进背包，背包满了角色会自动走回仓库存好，再回来接着干。' },
  { hint: 'fish_minnow', reward: 30, goal: { kind: 'gain', item: 'raw_minnow', n: 10 },
    tip: '任务可以排队：在地点里点「加入队列」，做完一个自动做下一个。' },
  { hint: 'cook_minnow', reward: 50, goal: { kind: 'gain', item: 'minnow', n: 10 },
    tip: '到城镇的灶台把生鱼做成熟鱼。熟食能在战斗中回血，制作会直接用仓库里的材料。' },
  { hint: 'mine_stone', reward: 50, goal: { kind: 'level', skill: 'mining', n: 10 },
    tip: '技能等级越高，动作越快，还能解锁更高阶的资源。离线时角色也会继续干活。' },
  { hint: 'mine_copper', reward: 60, goal: { kind: 'gain', item: 'copper_ore', n: 10 },
    tip: '采矿 10 级可以挖铜矿了。资源分 T1 到 T8，越往外走等级越高。' },
  { hint: 'smelt_copper', reward: 80, goal: { kind: 'gain', item: 'copper_bar', n: 3 },
    tip: '矿石要在城镇东边的熔炉炼成锭，锭是打造装备的材料。' },
  { hint: 'smith_copper_pickaxe', reward: 120, goal: { kind: 'gain', item: 'copper_pickaxe', n: 1 },
    tip: '去铁匠铺打一把铜镐。好工具能让对应的技能更快。' },
  { hint: 'smith_copper_pickaxe', reward: 100, goal: { kind: 'equip', item: 'copper_pickaxe', n: 1 },
    tip: '打开背包（Tab 或第 3 个标签），点铜镐再点「装备」；电脑上也可以直接右键它。' },
  { hint: 'fight_rabbit', reward: 150, goal: { kind: 'kills', n: 5 },
    tip: '点地图上的生物可以查看信息并开打。战斗前会自动从仓库带上食物，血少了会自己吃。' },
  { hint: 'hunt_1', reward: 80, goal: { kind: 'gain', item: 'hide_1', n: 5 },
    tip: '狩猎能拿到兽皮，兽皮做成皮革，可以缝制远程职业的皮甲。' },
  { hint: 'fight_rabbit', reward: 80, goal: { kind: 'gain', item: 'meat_1', n: 5 },
    tip: '打动物会掉兽肉，打怪物会掉魔核。精英和首领还会掉福袋、宝箱。' },
  { hint: 'cook_meat_1', reward: 100, goal: { kind: 'gain', item: 'steak_1', n: 5 },
    tip: '烤兽肉比同阶的鱼回血更多。装备栏里有食物栏和药水栏，不占背包。' },
  { hint: 'gather_green_herb_orchard', reward: 80, goal: { kind: 'gain', item: 'green_herb', n: 5 },
    tip: '采集能拿到草药，草药在药剂铺做成药水，战斗时血量低会先喝药水。' },
  { hint: 'farm_potato', reward: 100, goal: { kind: 'gain', item: 'potato', n: 6 },
    tip: '种地要消耗种子，收获时会多收回种子。没种子了可以去集市的种子摊买。' },
  { hint: 'chop_plain', reward: 120, goal: { kind: 'level', skill: 'woodcutting', n: 10 },
    tip: '伐木 10 级能砍桦木。每个技能都没有等级上限，前 50 级升得很快。' },
  { hint: 'smith_copper_sword', reward: 200, goal: { kind: 'equip', item: 'copper_sword', n: 1 },
    tip: '锻造到 11 级能打铜剑，打好后装备上。武器决定你是近战、远程还是魔法。' },
  { hint: 'fight_rabbit', reward: 200, goal: { kind: 'level', skill: 'melee', n: 10 },
    tip: '战斗经验会同时提升攻击方式、防御和生命。卡关了就回去练级、换更好的装备。' },
  { hint: 'fight_rabbit', reward: 300, goal: { kind: 'kills', n: 30 },
    tip: '按 M 打开世界地图，可以看到所有地点和首领。首领血条在屏幕顶部，打赢有机会掉专属战旗。' },
];

const equipped = (s: GameState, item: string) => Object.values(s.equipment).includes(item);

export function questText(q: QuestDef): string {
  const g = q.goal;
  if (g.kind === 'gain') return `获得 ${g.n} 个${ITEMS[g.item].name}`;
  if (g.kind === 'level') return `${SKILLS[g.skill].name}升到 ${g.n} 级`;
  if (g.kind === 'equip') return `装备${ITEMS[g.item].name}`;
  return `击败 ${g.n} 只怪物或生物`;
}

/** 当前任务的进度（0..n） */
export function questProgress(s: GameState): { q: QuestDef; have: number } | null {
  const st = s.quest ?? { i: 0, n: 0 };
  const q = QUESTS[st.i];
  if (!q) return null;
  const have = q.goal.kind === 'level' ? level(s, q.goal.skill) : q.goal.kind === 'equip' ? +equipped(s, q.goal.item) : st.n;
  return { q, have: Math.min(have, q.goal.n) };
}

/** advance 结束时调用：累计进度，完成就发奖励、进入下一个。返回完成的任务 */
export function stepQuests(s: GameState, sum: Summary): QuestDef[] {
  const done: QuestDef[] = [];
  s.quest ??= { i: 0, n: 0 };
  for (;;) {
    const q = QUESTS[s.quest.i];
    if (!q) break;
    const g = q.goal;
    if (g.kind === 'gain') s.quest.n += Math.max(0, sum.items[g.item] ?? 0);
    else if (g.kind === 'kills') s.quest.n += Object.values(sum.kills).reduce((a, b) => a + b, 0);
    const have = g.kind === 'level' ? level(s, g.skill) : g.kind === 'equip' ? +equipped(s, g.item) : s.quest.n;
    if (have < g.n) break;
    s.bank.coins = (s.bank.coins ?? 0) + q.reward;
    done.push(q);
    s.quest = { i: s.quest.i + 1, n: 0 };
    // 同一批收获不重复算到下一个任务
    sum = { ...sum, items: {}, kills: {} };
  }
  return done;
}
