// 数值平衡模拟：npx vite-node scripts/balance.ts
import { advance, newGame, startNow, xpPerHour } from '../src/core/sim';
import { XP_TABLE, levelForXp } from '../src/core/xp';

const T0 = 0;
const HOUR = 3_600_000;
const gear: Record<number, Record<string, string>> = {
  1: { weapon: 'bronze_sword' },
  10: { weapon: 'bronze_sword', head: 'bronze_helm', body: 'bronze_body' },
  20: { weapon: 'iron_sword', head: 'iron_helm', body: 'iron_body' },
  35: { weapon: 'steel_sword', head: 'iron_helm', body: 'steel_body' },
};
for (const [lvlStr, eq] of Object.entries(gear)) {
  const lvl = Number(lvlStr);
  for (const area of ['fight_rabbit', 'fight_crab', 'fight_slime', 'fight_wolf', 'fight_ash']) {
    let s = newGame(T0, 5);
    s.xp.melee = XP_TABLE[lvl];
    s.xp.hitpoints = XP_TABLE[Math.max(10, lvl)];
    s.hp = Math.max(10, lvl) * 10;
    s.equipment = eq as any;
    s.bank = { trout: 100 };
    s = startNow(s, area, { type: 'time', ms: HOUR });
    const est = xpPerHour(s, area);
    const { state, summary } = advance(s, T0 + HOUR);
    const kills = Object.values(summary.kills)[0] ?? 0;
    console.log(`L${lvl} ${area.padEnd(13)} kills=${String(kills).padStart(4)} xp=${Math.round(summary.xp.melee ?? 0).toString().padStart(6)} est=${String(est).padStart(6)} food=${summary.foodEaten} deaths=${summary.deaths} -> L${levelForXp(state.xp.melee)}`);
  }
}
