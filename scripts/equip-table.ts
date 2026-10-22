// 打印装备属性和配方的 Markdown 表：npx vite-node scripts/equip-table.ts
import { ACTIONS, EQUIP_TYPES, ITEMS, SKILLS, TIERS } from '../src/core/data';

const out: string[] = [];
const head = `| 装备 | ${TIERS.map((_, i) => `T${i + 1}`).join(' | ')} |\n|---|${TIERS.map(() => '---').join('|')}|`;
const groups = [...new Set(EQUIP_TYPES.map((e) => e.group))];
for (const g of groups) {
  out.push(`### ${g}\n`);
  out.push(head);
  for (const e of EQUIP_TYPES.filter((x) => x.group === g)) {
    const cells = TIERS.map((t) => {
      const q = ITEMS[`${t.id}_${e.key}`].equip!;
      if (q.speed) return `+${Math.round(q.speed * 100)}%`;
      const parts = [q.attack && `攻${q.attack}`, q.strength && `力${q.strength}`, q.defence && `防${q.defence}`].filter(Boolean);
      return parts.join(' ');
    });
    out.push(`| ${e.name} | ${cells.join(' | ')} |`);
  }
  out.push('');
}
out.push('### 配方（以 T1 为例，其他阶换成同阶材料）\n');
out.push('| 装备 | 制作技能 | 材料 | 制作等级 | 穿戴要求 | 攻速 |\n|---|---|---|---|---|---|');
for (const e of EQUIP_TYPES) {
  const a = Object.values(ACTIONS).find((x) => x.kind === 'skill' && x.outputs[0]?.item === `wood_${e.key}`)!;
  if (a.kind !== 'skill') continue;
  const mats = a.inputs!.map((i) => `${ITEMS[i.item].name}×${i.qty}`).join(' + ');
  const ms = e.stats.attackMs ? `${(e.stats.attackMs / 1000).toFixed(1)} 秒` : '';
  out.push(`| ${e.name} | ${SKILLS[e.maker].name} | ${mats} | 本阶 +${e.plus} | ${SKILLS[e.skill].name} | ${ms} |`);
}
console.log(out.join('\n'));
