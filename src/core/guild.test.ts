import { describe, expect, it } from 'vitest';
import { ITEMS } from './data';
import { GUILD_XP, dailyTasks, guildLevelOf, guildPct, setGuildLv, utcWeek } from './guild';
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
    expect(await api.exchangeItems('stone', 100000, 2)).toBe(10000);
    await expect(api.exchangeItems('stone', 5, 2)).rejects.toThrow();
    await api.ensureGuildTasks(dailyTasks(g.id, '2026-10-26', 1));
    const [t] = await api.guildTasks();
    expect(await api.contribute(t.id, t.need + 5)).toBe(t.need);
    const me = (await api.guildMembers(g.id))[0];
    expect(me.contrib).toBe(2000 + t.need * t.per);
    const g2 = (await api.guild())!;
    expect(g2.xp).toBe(2000 + t.need * t.per + t.reward);
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
  });
});
