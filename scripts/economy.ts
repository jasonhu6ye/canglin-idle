// 经济分析：npx vite-node scripts/economy.ts
// 每阶采集 / 制作 / 打怪按集市价卖掉，一小时能换多少金币；找出亏本的配方和异常高的收入
import { ACTIONS, ITEMS, MONSTERS } from '../src/core/data';
import { actionDuration, combatEstimate, newGame } from '../src/core/sim';
import { XP_TABLE } from '../src/core/xp';
import type { GameState, SkillAction } from '../src/core/types';

const val = (id: string) => ITEMS[id]?.value ?? 0;
const exp = (d: { item: string; qty: number; chance?: number }) => val(d.item) * d.qty * (d.chance ?? 1);

function at(level: number, skill: string): GameState {
  const s = newGame(0, 1);
  (s.xp as Record<string, number>)[skill] = XP_TABLE[Math.min(level, XP_TABLE.length - 1)];
  return s;
}

const rows: { kind: string; id: string; lv: number; perHour: number; note: string }[] = [];
for (const a of Object.values(ACTIONS)) {
  if (a.kind !== 'skill') continue;
  const sa = a as SkillAction;
  const s = at(sa.level, sa.skill);
  const ms = actionDuration(s, sa);
  const out = sa.outputs.reduce((n, d) => n + exp(d), 0);
  const inp = (sa.inputs ?? []).reduce((n, i) => n + val(i.item) * i.qty, 0);
  const per = ((out - inp) * 3_600_000) / ms;
  rows.push({ kind: sa.inputs?.length ? 'craft' : 'gather', id: sa.id, lv: sa.level, perHour: Math.round(per), note: sa.inputs?.length ? `out ${out.toFixed(0)} in ${inp.toFixed(0)}` : `out ${out.toFixed(1)}` });
}
for (const a of Object.values(ACTIONS)) {
  if (a.kind !== 'combat') continue;
  const m = MONSTERS[a.monster];
  if (!m) continue;
  const s = at(m.level + 5, 'melee');
  s.xp.hitpoints = XP_TABLE[Math.min(m.level + 5, XP_TABLE.length - 1)];
  s.hp = 9999;
  const est = combatEstimate(s, m);
  const coins = m.drops.filter((d) => d.item === 'coins').reduce((n, d) => n + d.qty * (d.chance ?? 1), 0);
  const loot = m.drops.filter((d) => d.item !== 'coins').reduce((n, d) => n + exp(d), 0);
  rows.push({ kind: 'combat', id: a.id, lv: m.level, perHour: Math.round((coins + loot) * (Number.isFinite(est.perHour) ? est.perHour : 0)), note: `coins ${coins.toFixed(0)} loot ${loot.toFixed(0)} /kill, ${Math.round(est.perHour)}/h ${m.rank}` });
}

const band = (lv: number) => (lv < 10 ? 1 : lv < 20 ? 2 : lv < 30 ? 3 : lv < 40 ? 4 : lv < 55 ? 5 : lv < 70 ? 6 : lv < 95 ? 7 : 8);
const mode = process.argv[2] ?? 'summary';
if (mode === 'summary') {
  for (const kind of ['gather', 'craft', 'combat']) {
    console.log(`\n== ${kind}: 每阶金币/小时 中位数 / 最高`);
    for (let t = 1; t <= 8; t++) {
      const r = rows.filter((x) => x.kind === kind && band(x.lv) === t).sort((a, b) => a.perHour - b.perHour);
      if (!r.length) continue;
      const med = r[Math.floor(r.length / 2)];
      const top = r[r.length - 1];
      console.log(`T${t}  n=${String(r.length).padStart(3)}  med ${String(med.perHour).padStart(8)}  top ${String(top.perHour).padStart(8)} ${top.id} (${top.note})`);
    }
  }
  const loss = rows.filter((x) => x.kind === 'craft' && x.perHour < 0);
  console.log(`\n亏本配方 ${loss.length} 个（产出卖价低于材料卖价）`);
  for (const r of loss.slice(0, 40)) console.log(`  ${r.id} lv${r.lv} ${r.perHour}/h ${r.note}`);
} else {
  for (const r of rows.filter((x) => x.kind === mode).sort((a, b) => a.lv - b.lv)) console.log(`${r.id.padEnd(30)} lv${String(r.lv).padStart(3)} ${String(r.perHour).padStart(9)} ${r.note}`);
}
