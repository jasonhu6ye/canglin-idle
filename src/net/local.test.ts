import { describe, expect, it } from 'vitest';
import { newGame } from '../core/sim';
import { LocalApi } from './local';

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };

describe('LocalApi', () => {
  it('登录、上传存档、排行榜、公会一套走通', async () => {
    const api = new LocalApi(mem());
    expect(api.me()).toBeNull();
    expect(await api.signUp('a@b.c', 'x')).toBeNull();
    expect(api.signedIn()).toBe(true);
    await api.createProfile('测试员', 'ranger');
    await api.pushSave(newGame(0));
    const [row] = await api.leaderboard('total');
    expect(row.name).toBe('测试员');
    expect(row.value).toBeGreaterThan(0);
    const g = await api.createGuild('苍岭之心', '苍岭');
    expect((await api.guild())?.id).toBe(g.id);
    expect(await api.guildMembers(g.id)).toHaveLength(1);
    await api.leaveGuild();
    expect(await api.guild()).toBeNull();
  });
});
