import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Presence } from './api';
import { SupabaseApi } from './supabase';

/** 假的 Realtime：一个 world 频道，记下每个客户端 track 和广播了多少次 */
function fakeBus() {
  const subs: { id: string; presence: Map<string, Presence>; onSync?: () => void; onMv?: (e: { payload: unknown }) => void }[] = [];
  const state = new Map<string, Presence>();
  const stats = { track: 0, mv: 0 };
  const client = (id: string) => {
    const me = { id, presence: state, onSync: undefined as undefined | (() => void), onMv: undefined as undefined | ((e: { payload: unknown }) => void) };
    subs.push(me);
    const ch = {
      on(kind: string, f: { event: string }, cb: never) {
        if (kind === 'presence') me.onSync = cb;
        else if (f.event === 'mv') me.onMv = cb;
        return ch;
      },
      subscribe(cb: (s: string) => void) { setTimeout(() => cb('SUBSCRIBED'), 0); return ch; },
      presenceState: () => Object.fromEntries([...state].map(([k, v]) => [k, [v]])),
      async track(p: Presence) { stats.track++; state.set(id, p); subs.forEach((s) => s.onSync?.()); return 'ok'; },
      async send(m: { event: string; payload: unknown }) {
        if (m.event === 'mv') { stats.mv++; subs.filter((s) => s.id !== id).forEach((s) => s.onMv?.({ payload: m.payload })); }
        return 'ok';
      },
    };
    return {
      channel: () => ch,
      removeChannel: async () => {},
      rpc: async (name: string) => ({ data: name === 'online_positions' ? [] : null, error: null }),
    };
  };
  return { client, stats };
}

function make(bus: ReturnType<typeof fakeBus>, id: string, name: string) {
  const api = new SupabaseApi('https://example.invalid', 'k');
  Object.assign(api, { sb: bus.client(id), profile: { id, pid: 1, name, guildId: null } });
  return api;
}

describe('SupabaseApi 位置同步（10-26 优化延迟）', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('走路只发广播，不反复 track；对方马上看到新位置', async () => {
    const bus = fakeBus();
    const a = make(bus, 'a', '甲');
    const b = make(bus, 'b', '乙');
    let seen: Presence[] = [];
    b.onPresence((all) => { seen = all; });
    a.onPresence(() => {});
    await vi.advanceTimersByTimeAsync(10);
    for (let i = 0; i < 40; i++) {
      a.publishPresence({ x: 100 + i, y: 50, outfit: 'ranger', total: 10 });
      await vi.advanceTimersByTimeAsync(250);
    }
    // 10 秒走了 40 格：track 只有一开始那次（外观等慢变字段没变），其余都是广播
    expect(bus.stats.track).toBe(1);
    expect(bus.stats.mv).toBe(40);
    await vi.advanceTimersByTimeAsync(100);
    expect(seen.find((p) => p.playerId === 'a')?.x).toBe(139);
  });

  it('换装备会重新 track，但 4 秒内最多一次，攒着发最后的', async () => {
    const bus = fakeBus();
    const a = make(bus, 'a', '甲');
    a.onPresence(() => {});
    await vi.advanceTimersByTimeAsync(10);
    for (let i = 0; i < 10; i++) {
      a.publishPresence({ x: 1, y: 1, equip: { weapon: `w${i}` } });
      await vi.advanceTimersByTimeAsync(200);
    }
    await vi.advanceTimersByTimeAsync(5000);
    expect(bus.stats.track).toBeLessThanOrEqual(3);
    const b = make(bus, 'b', '乙');
    let seen: Presence[] = [];
    b.onPresence((all) => { seen = all; });
    await vi.advanceTimersByTimeAsync(10);
    b.publishPresence({ x: 2, y: 2 });
    await vi.advanceTimersByTimeAsync(100);
    expect(seen.find((p) => p.playerId === 'a')?.equip?.weapon).toBe('w9');
  });
});
