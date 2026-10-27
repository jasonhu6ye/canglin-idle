import { writeFileSync } from 'node:fs';
import { guildDataSql } from '../src/core/guildSql';

// 重新生成 supabase/guild-data.sql（物品价格表和公会商店）
writeFileSync(new URL('../supabase/guild-data.sql', import.meta.url), guildDataSql());
console.log('supabase/guild-data.sql 已更新');
