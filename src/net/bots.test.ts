import { describe, expect, it, vi } from 'vitest';
import { ITEMS, MAP_H, MAP_W } from '../core/data';
import { botChat, botDoing, botOnline, botReplies, isEnglish, botName, botPresence, botProfile, mergeBoard, withBots } from './bots';
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
    // 偶尔玩的可能一整天都不上线，挑这天上过线的
    const days = bots.filter((b) => Array.from({ length: 96 }, (_, k) => botOnline(b, T0 + k * 900_000)).some(Boolean));
    expect(days.length).toBeGreaterThan(8);
    for (const b of days) {
      const p = botProfile(b, T0);
      let prev: { x: number; y: number } | null = null;
      for (let t = T0; t < T0 + 86_400_000; t += 20_000) {
        const at = botPresence(b, t);
        if (!at) { expect(botOnline(b, t)).toBe(false); continue; }
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
      for (const r of botReplies(msg(i, '有人一起打副本吗'), bots)) { zh++; expect(r.text).not.toMatch(/[\u4e00-\u9fff]/); if (r.id.startsWith('bot-re-')) expect(['?', '??', 'huh?', 'what?', 'wut', 'english pls?', 'sorry i only speak english', 'idk what that means lol', '???', 'eng?'].some((x) => r.text.startsWith(x))).toBe(true); }
      for (const r of botReplies(msg(i, 'hey everyone'), bots)) { en++; expect(r.text).not.toMatch(/[\u4e00-\u9fff]/); expect(r.at).toBeGreaterThan(T0); }
    }
    expect(zh).toBeGreaterThan(40);
    expect(en).toBeGreaterThan(80);
    // 点名一定回，而且是被点到的那个
    // 点名的得在线：挑一个这时在线的
    const nm = bots.find((b) => botOnline(b, T0) && botOnline(b, T0 + 60_000))!.name;
    const r = botReplies(msg(1, `${nm} thx for the help`), bots);
    expect(r.length).toBeGreaterThanOrEqual(1);
    expect(r[0].name).toBe(nm);
    expect(botReplies(msg(1, `${nm} thx for the help`), bots)).toEqual(r);
    // 真人说的话大多有人接（用户 10-31 截图：没人理）
    let got = 0;
    for (let i = 0; i < 200; i++) if (botReplies(msg(i, 'man did u see discord  i post next update'), bots).length) got++;
    expect(got).toBeGreaterThan(150);
    // 刚和某个 AI 聊过，接着说多半还是它回
    const b0 = bots.find((b) => b.name === nm)!;
    let same = 0;
    for (let i = 0; i < 100; i++) { const rs = botReplies({ ...msg(i, 'so what do u do for work'), at: T0 + 60_000 }, bots, { bot: b0.id, at: T0 }); if (rs[0]?.name === nm) same++; }
    expect(same).toBeGreaterThan(80);
    // AI 不回 AI
    expect(botReplies({ ...msg(2, 'hi'), playerId: 'bot-x' }, bots)).toEqual([]);
  });
  it('AI 说的每一句都有中文翻译', () => {
    const msgs = botChat(bots, T0, T0 + 3 * 86_400_000);
    expect(msgs.length).toBeGreaterThan(300);
    const miss = [...new Set(msgs.filter((m) => !m.zh).map((m) => m.text))];
    expect(miss).toEqual([]);
    for (const m of msgs) expect(m.zh).not.toMatch(/\{\w+\}/);
    for (let i = 0; i < 300; i++) {
      for (const t of ['hey everyone', 'thx', 'where r u from?', '你好', 'lol', 'any guild?', 'ok']) {
        for (const r of botReplies({ id: `q${i}`, channel: 'world', playerId: 'real', name: 'Jay', text: t, at: T0 }, bots)) expect(r.zh).toBeTruthy();
      }
    }
  });
  it('withBots：在线人数、名片、加好友', async () => {
    const mem = new Map<string, string>();
    const base = new LocalApi({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v) });
    const api = withBots(base);
    // 挑两个 T0 在线的种子，把时钟拨到 T0
    const always: number[] = [];
    for (let sd = 1; always.length < 2; sd++) if (botOnline({ id: 'x', name: 'x', seed: sd, at: 0 }, T0) && botOnline({ id: 'x', name: 'x', seed: sd, at: 0 }, T0 + 600_000)) always.push(sd);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    await api.aiAdd([{ name: 'Kaira', seed: always[0] }, { name: 'mossy_fern', seed: always[1] }]);
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
    vi.useRealTimers();
  });
});
