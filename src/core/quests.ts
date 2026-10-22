import { ITEMS } from './data';
import type { GameState, SkillId, Summary } from './types';
import { level } from './sim';

/** 新手任务：一条线带新玩家走一遍采集 → 加工 → 打造 → 战斗（用户 10-22 要求） */
export interface QuestDef {
  /** 去做：打开这个动作所在的地点 */
  hint: string;
  reward: number;
  goal:
    | { kind: 'gain'; item: string; n: number }
    | { kind: 'level'; skill: SkillId; n: number }
    | { kind: 'kills'; n: number };
}

export const QUESTS: QuestDef[] = [
  { hint: 'chop_plain', reward: 30, goal: { kind: 'gain', item: 'plain_log', n: 10 } },
  { hint: 'mine_stone', reward: 30, goal: { kind: 'gain', item: 'stone', n: 10 } },
  { hint: 'fish_minnow', reward: 30, goal: { kind: 'gain', item: 'raw_minnow', n: 10 } },
  { hint: 'cook_minnow', reward: 50, goal: { kind: 'gain', item: 'minnow', n: 10 } },
  { hint: 'mine_stone', reward: 50, goal: { kind: 'level', skill: 'mining', n: 10 } },
  { hint: 'mine_copper', reward: 60, goal: { kind: 'gain', item: 'copper_ore', n: 10 } },
  { hint: 'smelt_copper', reward: 80, goal: { kind: 'gain', item: 'copper_bar', n: 3 } },
  { hint: 'smith_copper_pickaxe', reward: 120, goal: { kind: 'gain', item: 'copper_pickaxe', n: 1 } },
  { hint: 'fight_rabbit', reward: 150, goal: { kind: 'kills', n: 5 } },
];

export function questText(q: QuestDef): string {
  const g = q.goal;
  if (g.kind === 'gain') return `获得 ${g.n} 个${ITEMS[g.item].name}`;
  if (g.kind === 'level') return `${{ mining: '采矿' }[g.skill as 'mining'] ?? g.skill}升到 ${g.n} 级`;
  return `击败 ${g.n} 只怪物或生物`;
}

/** 当前任务的进度（0..n） */
export function questProgress(s: GameState): { q: QuestDef; have: number } | null {
  const st = s.quest ?? { i: 0, n: 0 };
  const q = QUESTS[st.i];
  if (!q) return null;
  const have = q.goal.kind === 'level' ? level(s, q.goal.skill) : st.n;
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
    const have = g.kind === 'level' ? level(s, g.skill) : s.quest.n;
    if (have < g.n) break;
    s.bank.coins = (s.bank.coins ?? 0) + q.reward;
    done.push(q);
    s.quest = { i: s.quest.i + 1, n: 0 };
    // 同一批收获不重复算到下一个任务
    sum = { ...sum, items: {}, kills: {} };
  }
  return done;
}
