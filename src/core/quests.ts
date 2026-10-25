import { ITEMS, SKILLS } from './data';
import type { GameState, SkillId, Summary } from './types';
import { level } from './sim';
import { baseOf } from './quality';
import { sendMail } from './mail';
import { tl } from '../i18n';

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
    | { kind: 'equip'; item: string; n: 1 }
    | { kind: 'stones'; n: number };
}

export const QUESTS: QuestDef[] = [
  { hint: 'chop_plain', reward: 30, goal: { kind: 'gain', item: 'plain_log', n: 10 },
    tip: tl('点「去做」打开树林的页面，原木已经选好了，点「立即开始」角色会自己走过去砍树，之后一直自动进行，你可以去干别的。') },
  { hint: 'mine_stone', reward: 30, goal: { kind: 'gain', item: 'stone', n: 10 },
    tip: tl('采集的东西先进背包，背包满了角色会自动走回仓库存好，再回来接着干。') },
  { hint: 'fish_minnow', reward: 30, goal: { kind: 'gain', item: 'raw_minnow', n: 10 },
    tip: tl('任务可以排队：在地点里点「加入队列」，做完一个自动做下一个。') },
  { hint: 'cook_minnow', reward: 50, goal: { kind: 'gain', item: 'minnow', n: 10 },
    tip: tl('到城镇的灶台把生鱼做成熟鱼。熟食能在战斗中回血，制作会直接用仓库里的材料。') },
  { hint: 'mine_stone', reward: 50, goal: { kind: 'level', skill: 'mining', n: 10 },
    tip: tl('技能等级越高，动作越快，还能解锁更高阶的资源。离线时角色也会继续干活。') },
  { hint: 'mine_copper', reward: 60, goal: { kind: 'gain', item: 'copper_ore', n: 10 },
    tip: tl('采矿 10 级可以挖铜矿了。资源分 T1 到 T8，越往外走等级越高。') },
  { hint: 'smelt_copper', reward: 80, goal: { kind: 'gain', item: 'copper_bar', n: 3 },
    tip: tl('矿石要在城镇东边的熔炉炼成锭，锭是打造装备的材料。') },
  { hint: 'smith_copper_pickaxe', reward: 120, goal: { kind: 'gain', item: 'copper_pickaxe', n: 1 },
    tip: tl('去铁匠铺打一把铜镐。好工具能让对应的技能更快。') },
  { hint: 'smith_copper_pickaxe', reward: 100, goal: { kind: 'equip', item: 'copper_pickaxe', n: 1 },
    tip: tl('打开背包（Tab 或第 3 个标签），点铜镐再点「装备」；电脑上也可以直接右键它。') },
  { hint: 'fight_rabbit', reward: 150, goal: { kind: 'kills', n: 5 },
    tip: tl('点地图上的生物可以查看信息并开打。战斗前会自动从仓库带上食物，血少了会自己吃。') },
  { hint: 'hunt_1', reward: 80, goal: { kind: 'gain', item: 'hide_1', n: 5 },
    tip: tl('狩猎能拿到兽皮，兽皮做成皮革，可以缝制远程职业的皮甲。') },
  { hint: 'fight_rabbit', reward: 80, goal: { kind: 'gain', item: 'meat_1', n: 5 },
    tip: tl('打动物会掉兽肉，打怪物会掉魔核。精英和首领还会掉福袋、宝箱。') },
  { hint: 'cook_meat_1', reward: 100, goal: { kind: 'gain', item: 'steak_1', n: 5 },
    tip: tl('烤兽肉比同阶的鱼回血更多。装备栏里有食物栏和药水栏，不占背包。') },
  { hint: 'gather_green_herb_orchard', reward: 80, goal: { kind: 'gain', item: 'green_herb', n: 5 },
    tip: tl('采集能拿到草药，草药在药剂铺做成药水，战斗时血量低会先喝药水。') },
  { hint: 'farm', reward: 100, goal: { kind: 'gain', item: 'potato', n: 6 },
    tip: tl('去城镇农田点空地种土豆（也能一键种满），浇水长得快，熟了再点一下收获。离线也会长，收获时会多收回种子。') },
  { hint: 'chop_plain', reward: 120, goal: { kind: 'level', skill: 'woodcutting', n: 10 },
    tip: tl('伐木 10 级能砍桦木。每个技能都没有等级上限，前 50 级升得很快。') },
  { hint: 'smith_copper_sword', reward: 200, goal: { kind: 'equip', item: 'copper_sword', n: 1 },
    tip: tl('锻造到 11 级能打铜剑，打好后装备上。武器决定你是近战、远程还是魔法。') },
  { hint: 'fight_rabbit', reward: 200, goal: { kind: 'level', skill: 'melee', n: 10 },
    tip: tl('战斗经验会同时提升攻击方式、防御和生命。卡关了就回去练级、换更好的装备。') },
  { hint: 'fight_rabbit', reward: 300, goal: { kind: 'kills', n: 30 },
    tip: tl('按 M 打开世界地图，可以看到所有地点和首领。首领血条在屏幕顶部，打赢有机会掉专属战旗。') },
  // 往后只能在末尾加，插在中间会让老存档的任务进度错位
  { hint: 'stone_woodland', reward: 200, goal: { kind: 'stones', n: 2 },
    tip: tl('野外每个区域都有一座传说石碑，走近就会点亮。站在石碑旁能传到别的石碑；自动寻路走远路时也会顺路传送，石碑点得越多走得越快。') },
  { hint: 'mine_copper', reward: 300, goal: { kind: 'level', skill: 'mining', n: 20 },
    tip: tl('任务停下时（材料不够、连续阵亡、队列做完）屏幕上会出现红色提示条，点里面的按钮可以直接去补材料或再来一轮。') },
  { hint: 'stone_town2', reward: 400, goal: { kind: 'stones', n: 3 },
    tip: tl('西边草原上有第二座城「落霞城」，有仓库、集市和全套生产建筑，仓库和主城是同一份。到那里点亮城里的石碑，以后就能来回传送。') },
];

// 任务要的装备不分品质（用户 10-25 加了品质）
const equipped = (s: GameState, item: string) => Object.values(s.equipment).some((id) => id && baseOf(id) === item);
const gained = (items: Record<string, number>, item: string) => Object.entries(items).reduce((n, [id, k]) => n + (baseOf(id) === item ? Math.max(0, k) : 0), 0);
const plain = (id: string) => ITEMS[id].baseName ?? ITEMS[id].name;

export function questText(q: QuestDef): string {
  const g = q.goal;
  if (g.kind === 'gain') return tl`获得 ${g.n} 个${plain(g.item)}`;
  if (g.kind === 'level') return tl`${SKILLS[g.skill].name}升到 ${g.n} 级`;
  if (g.kind === 'equip') return tl`装备${plain(g.item)}`;
  if (g.kind === 'stones') return tl`点亮 ${g.n} 座传说石碑（含主城）`;
  return tl`击败 ${g.n} 只怪物或生物`;
}

/** 看存档状态就知道进度的目标（等级、装备、石碑）；累计型的返回 undefined */
function stateGoal(s: GameState, q: QuestDef): number | undefined {
  const g = q.goal;
  if (g.kind === 'level') return level(s, g.skill);
  if (g.kind === 'equip') return +equipped(s, g.item);
  if (g.kind === 'stones') return s.waystones?.length ?? 1;
  return undefined;
}

/** 当前任务的进度（0..n） */
export function questProgress(s: GameState): { q: QuestDef; have: number } | null {
  const st = s.quest ?? { i: 0, n: 0 };
  const q = QUESTS[st.i];
  if (!q) return null;
  const have = stateGoal(s, q) ?? st.n;
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
    if (g.kind === 'gain') s.quest.n += gained(sum.items, g.item);
    else if (g.kind === 'kills') s.quest.n += Object.values(sum.kills).reduce((a, b) => a + b, 0);
    const have = stateGoal(s, q) ?? s.quest.n;
    if (have < g.n) break;
    // 奖励发到邮箱（用户 10-25）
    sendMail(s, 'quest', [{ item: 'coins', qty: q.reward }], s.lastTick, { arg: String(s.quest.i) });
    done.push(q);
    s.quest = { i: s.quest.i + 1, n: 0 };
    // 同一批收获不重复算到下一个任务
    sum = { ...sum, items: {}, kills: {} };
  }
  return done;
}
