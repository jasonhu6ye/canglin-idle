import { describe, expect, it } from 'vitest';
import { ITEMS } from './data';
// @ts-expect-error 没装 node 的类型，测试在 node 里跑
import { readFileSync } from 'node:fs';
import { GUILD_SHOP, GUILD_XP, VALUE_PER_CONTRIB, dailyTasks, guildLevelOf, guildPct, setGuildLv, techCap, techCost, utcWeek } from './guild';
import { guildDataSql } from './guildSql';
import { boostPct, migrate, newGame } from './sim';
import { LocalApi } from '../net/local';

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };

describe('公会', () => {
  it('等级按经验算，加成存进存档、读档保留', () => {
    expect(guildLevelOf(0)).toBe(1);
    expect(guildLevelOf(GUILD_XP[1] - 1)).toBe(1);
    expect(guildLevelOf(GUILD_XP[1])).toBe(2);
    expect(guildLevelOf(1e9)).toBe(GUILD_XP.length);
    const s = setGuildLv(newGame(0), 5);
    expect(guildPct(s, 'xp')).toBeCloseTo(0.04);
    expect(boostPct(s, 'xp')).toBeCloseTo(0.04);
    expect(boostPct(s, 'atk')).toBe(0);
    expect(migrate(JSON.parse(JSON.stringify(s)))!.guildLv).toBe(5);
    expect(setGuildLv(s, 0).guildLv).toBeUndefined();
  });

  it('科技加成存进存档；商店比兑换贵（买了再换回去会亏）；服务器价格表是最新的', () => {
    const s = setGuildLv(newGame(0), 4, { xp: 2, drop: 1, bogus: 3 });
    expect(s.guildTech).toEqual({ xp: 2, drop: 1 });
    expect(guildPct(s, 'xp')).toBeCloseTo(0.03 + 0.02);
    expect(guildPct(s, 'drop')).toBeCloseTo(0.02);
    expect(migrate(JSON.parse(JSON.stringify(s)))!.guildTech).toEqual({ xp: 2, drop: 1 });
    expect(setGuildLv(s, 0).guildTech).toBeUndefined();
    expect(techCap(1)).toBe(0);
    expect(techCap(10)).toBe(5);
    expect(techCost(2)).toBe(12000);
    for (const x of GUILD_SHOP) {
      expect(ITEMS[x.item]).toBeTruthy();
      expect(x.price * VALUE_PER_CONTRIB).toBeGreaterThan(ITEMS[x.item].value);
    }
    // 物品或价格改了要跑 npx vite-node scripts/guild-data.ts，再让用户在 SQL Editor 跑 guild-data.sql
    expect(readFileSync(new URL('../../supabase/guild-data.sql', import.meta.url), 'utf8')).toBe(guildDataSql());
  });

  it('每日任务按公会和日期固定，物品都存在', () => {
    const a = dailyTasks('g1', '2026-10-26', 3);
    expect(a).toEqual(dailyTasks('g1', '2026-10-26', 3));
    expect(a).toHaveLength(3);
    expect(dailyTasks('g1', '2026-10-27', 3)).not.toEqual(a);
    for (const t of a) { expect(ITEMS[t.target]).toBeTruthy(); expect(t.need).toBeGreaterThan(0); expect(t.per).toBeGreaterThan(0); }
    expect(utcWeek(Date.UTC(2026, 9, 28, 12))).toBe('2026-10-26');
  });

  it('捐献、任务、仓库（本地后端）', async () => {
    const store = mem();
    const api = new LocalApi(store);
    await api.signUp('a@b.c', 'x');
    await api.createProfile('测试员', 'ranger');
    const g = await api.createGuild('苍岭之心', '苍岭');
    expect(await api.exchangeItems('stone', 100000)).toBe(10000);
    await expect(api.exchangeItems('stone', 5)).rejects.toThrow();
    expect(await api.guildCheckin()).toBe(15);
    await expect(api.guildCheckin()).rejects.toThrow();
    expect((await api.guildDay()).exchanged).toBe(2000);
    await api.ensureGuildTasks(dailyTasks(g.id, '2026-10-26', 1));
    const [t] = await api.guildTasks();
    expect(await api.contribute(t.id, t.need + 5)).toBe(t.need);
    const me = (await api.guildMembers(g.id))[0];
    expect(me.contrib).toBe(2015 + t.need * t.per);
    const g2 = (await api.guild())!;
    expect(g2.xp).toBe(2015 + t.need * t.per + t.reward);
    expect(g2.points).toBe(g2.xp);
    await api.guildDeposit('stone', 50, 0);
    await api.guildDeposit('copper_ore', 5, 0);
    await api.sortGuildBank(0, ['copper_ore', 'stone']);
    expect((await api.guildBank(0)).map(([id]) => id)).toEqual(['copper_ore', 'stone']);
    expect(await api.guildWithdraw('stone', 80, 0)).toBe(50);
    const log = await api.guildBankLog();
    expect(log.map((l) => l.qty)).toEqual([-50, 5, 50]);
    expect(log[0].name).toBe('测试员');
    // 私人仓库：贡献值够才能开，开了扣掉
    expect(g2.points).toBeLessThan(5000);
    await expect(api.openVault('材料')).rejects.toThrow();
    const db = JSON.parse(store.getItem('canglin-net-local')!);
    db.guilds[0].points = 6000;
    store.setItem('canglin-net-local', JSON.stringify(db));
    const api2 = new LocalApi(store);
    expect(await api2.openVault('材料')).toBe(1);
    expect((await api2.guild())!.points).toBe(1000);
    await api2.guildDeposit('stone', 1, 1);
    expect(await api2.guildBank(1)).toEqual([['stone', 1]]);
    expect((await api2.guildVaults())[0].name).toBe('材料');
    // 商店：花可用贡献，限购
    expect(await api2.buyGuildItem('scroll_town', 99)).toBe(5);
    await expect(api2.buyGuildItem('scroll_town', 1)).rejects.toThrow();
    expect((await api2.guildMembers(g.id))[0].spent).toBe(5 * GUILD_SHOP[0].price);
  });
});
