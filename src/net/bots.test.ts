import { describe, expect, it } from 'vitest';
import { ITEMS, MAP_H, MAP_W } from '../core/data';
import { botChat, botDoing, botReplies, isEnglish, botName, botPresence, botProfile, mergeBoard, withBots } from './bots';
import { LocalApi } from './local';
import type { AiPlayer } from './api';

const T0 = Date.UTC(2026, 10, 1, 12);
const bots: AiPlayer[] = Array.from({ length: 30 }, (_, i) => ({ id: `id${i}`, name: `Bot${i}`, seed: 1000 + i * 7919, at: T0 - 3 * 86_400_000 }));

describe('AI 玩家', () => {
  it('同一时间各家算出来的一样', () => {
    for (const b of bots) expect(botPresence(b, T0 + 12345)).toEqual(botPresence({ ...b }, T0 + 12345));
  });
  it('名字合规、不重名', () => {
    const taken = new Set<string>();
    let s = 1;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const names = Array.from({ length: 300 }, () => botName(r, taken));
    for (const n of names) expect(n).toMatch(/^[\p{L}\p{N}_]{2,12}$/u);
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(300);
  });
  it('等级、装备合理，都有地方去', () => {
    for (const b of bots) {
      const p = botProfile(b, T0);
      expect(p.total).toBeGreaterThan(20);
      expect(p.combat).toBeGreaterThanOrEqual(1);
      expect(p.spots.length).toBeGreaterThan(0);
      for (const id of Object.values(p.equip)) expect(ITEMS[id!]).toBeTruthy();
      expect(p.pid).toBeGreaterThanOrEqual(20000000);
      expect(p.pid).toBeLessThan(100000000);
      expect(p.joined).toBeLessThan(b.at);
    }
  });
  it('一天里位置都在地图上，会干活、走路，也会在城里挂机', () => {
    let work = 0, walk = 0, idle = 0;
    for (const b of bots.slice(0, 8)) {
      const p = botProfile(b, T0);
      let prev: { x: number; y: number } | null = null;
      for (let t = T0; t < T0 + 86_400_000; t += 20_000) {
        const at = botPresence(b, t)!;
        expect(at.x).toBeGreaterThanOrEqual(0);
        expect(at.y).toBeGreaterThanOrEqual(0);
        expect(at.x).toBeLessThan(MAP_W);
        expect(at.y).toBeLessThan(MAP_H);
        const d = botDoing(p, b.seed, t)!;
        if (d.action) work++; else if (d.idle) idle++; else walk++;
        prev = at;
      }
      expect(prev).toBeTruthy();
    }
    expect(work).toBeGreaterThan(walk);
    expect(walk).toBeGreaterThan(0);
    expect(idle).toBeGreaterThan(0);
    expect(idle).toBeLessThan(work);
  });
  it('排行榜混进 AI 并重排名次', () => {
    const real = [{ rank: 1, playerId: 'a', name: 'Real', value: 99999 }, { rank: 2, playerId: 'b', name: 'Low', value: 1 }];
    const rows = mergeBoard(real, bots, 'total', 10, T0);
    expect(rows.length).toBe(10);
    expect(rows[0].name).toBe('Real');
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (let i = 1; i < rows.length; i++) expect(rows[i].value).toBeLessThanOrEqual(rows[i - 1].value);
  });
  it('世界频道说英文，一小时有一些', () => {
    const msgs = botChat(bots, T0, T0 + 3600_000);
    expect(msgs.length).toBeGreaterThan(15);
    for (const m of msgs) {
      expect(m.channel).toBe('world');
      expect(m.text).not.toMatch(/[一-鿿]/);
    }
    // 分两段取和一次取一样（不重复不漏）
    const a = botChat(bots, T0, T0 + 1800_000), b = botChat(bots, T0 + 1800_001, T0 + 3600_000);
    expect([...a, ...b].map((m) => m.id)).toEqual(msgs.map((m) => m.id));
  });
  it('接真人的话：英文回英文，别的语言只回问号', () => {
    const msg = (i: number, text: string) => ({ id: `m${i}`, channel: 'world' as const, playerId: 'real', name: 'Jay', text, at: T0 });
    expect(isEnglish('hi guys, where r u from?')).toBe(true);
    expect(isEnglish('大家好')).toBe(false);
    expect(isEnglish('hello 大家')).toBe(false);
    let zh = 0, en = 0;
    for (let i = 0; i < 200; i++) {
      for (const r of botReplies(msg(i, '有人一起打副本吗'), bots)) { zh++; expect(['?', '??', 'huh?', 'what?', 'wut', 'english pls?', 'sorry i only speak english', 'idk what that means lol', '???', 'eng?']).toContain(r.text); }
      for (const r of botReplies(msg(i, 'hey everyone'), bots)) { en++; expect(r.text).not.toMatch(/[\u4e00-\u9fff]/); expect(r.at).toBeGreaterThan(T0); }
    }
    expect(zh).toBeGreaterThan(40);
    expect(en).toBeGreaterThan(80);
    // 点名一定回，而且是被点到的那个
    const r = botReplies(msg(1, 'Bot7 thx for the help'), bots);
    expect(r.length).toBe(1);
    expect(r[0].name).toBe('Bot7');
    expect(botReplies(msg(1, 'Bot7 thx for the help'), bots)).toEqual(r);
    // AI 不回 AI
    expect(botReplies({ ...msg(2, 'hi'), playerId: 'bot-x' }, bots)).toEqual([]);
  });
  it('withBots：在线人数、名片、加好友', async () => {
    const mem = new Map<string, string>();
    const base = new LocalApi({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v) });
    const api = withBots(base);
    await api.aiAdd([{ name: 'Kaira', seed: 42 }, { name: 'mossy_fern', seed: 43 }]);
    const { refreshBots, aiPlayers } = await import('./bots');
    await refreshBots(true);
    expect(aiPlayers().map((b) => b.name)).toEqual(['Kaira', 'mossy_fern']);
    const p = api.presenceOf(`bot-${aiPlayers()[0].id}`);
    expect(p?.name).toBe('Kaira');
    expect(await api.addFriend(p!.pid!)).toBe('sent');
    expect(await api.joinedAt(p!.playerId)).toBeGreaterThan(0);
    await api.aiDelete(aiPlayers().map((b) => b.id));
    await refreshBots(true);
    expect(aiPlayers().length).toBe(0);
  });
});
