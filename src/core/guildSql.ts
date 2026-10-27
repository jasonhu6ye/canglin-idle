import { ITEMS, TIERS } from './data';
import { GUILD_SHOP, taskPool } from './guild';

/**
 * 生成 supabase/guild-data.sql（10-27）：服务器上的物品价格表和公会商店。
 * 兑换贡献、每日任务、取物上限都按这张表算，不再信客户端给的价格。
 * 物品或价格改了就跑 npx vite-node scripts/guild-data.ts 重新生成，再到 SQL Editor 跑一遍；guild.test 会检查文件是不是最新的。
 */
export function guildDataSql() {
  const tierOf = new Map<string, number>();
  TIERS.forEach((_, i) => taskPool(i).forEach((id) => tierOf.set(id, i)));
  const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
  const rows = Object.keys(ITEMS).sort().map((id) => `(${q(id)},${Math.max(0, Math.round(ITEMS[id].value))},${tierOf.get(id) ?? 'null'})`);
  const shop = GUILD_SHOP.map((x) => `(${q(x.item)},${x.price},${x.lv},${x.daily})`);
  return [
    '-- 由 src/core/guildSql.ts 生成，不要手改（npx vite-node scripts/guild-data.ts）', // i18n-ignore
    '-- 物品价格（公会兑换、任务、取物上限用）和公会商店，可以重复运行', // i18n-ignore
    'begin;',
    'delete from public.item_values;',
    `insert into public.item_values (id, value, task_tier) values\n${rows.join(',\n')};`,
    'delete from public.guild_shop;',
    `insert into public.guild_shop (item, price, lv, daily) values\n${shop.join(',\n')};`,
    'commit;',
    '',
  ].join('\n');
}
