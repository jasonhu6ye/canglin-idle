import { describe, it, expect, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * 野外组队整条链路（11-02，用户反馈队友伤害不显示）：两台客户端 + 服务器各用一份独立的模块（全局的一起打人数互不影响），
 * 位置互相看得到 → updateAggro 发 coop → 新刷的怪带 crew → presence 带 fd → takeFieldHits 记到对方的怪上
 */

type Cli = { id: string; mods: any; store: any; pres: any };
const T0 = Date.UTC(2026, 10, 2, 8);

async function client(id: string, other: string, share: { all: Record<string, any> }): Promise<Cli> {
  vi.resetModules();
  const sim = await import('../core/sim');
  const cmds = await import('../core/commands');
  const data = await import('../core/data');
  const grove = data.standOf(data.NODES.find((n: any) => n.id === 'starter_grove')!);
  const st0 = { ...sim.newGame(T0, id === 'a' ? 1 : 2), loc: grove, queue: [{ action: 'fight_rabbit', mode: { type: 'infinite' }, done: 0, elapsedMs: 0, stocked: true }] };
  const store: any = {
    state: st0,
    pending: [] as any[], q: 0,
    run(n: string, ...a: unknown[]) { const now = Date.now(); this.state = sim.advance(this.state, now).state; const r = cmds.applyCmd(this.state, n, a, now); if (r.state !== this.state) this.pending.push({ n, a: JSON.parse(JSON.stringify(a)), t: now, q: ++this.q }); this.state = r.state; return r.out; },
    adopt(server: any, ack: number) { this.pending = this.pending.filter((c: any) => c.q > ack); let s: any = sim.migrate(server); for (const c of this.pending) { s = sim.advance(s, c.t).state; s = cmds.applyCmd(s, c.n, c.a, Math.max(c.t, s.lastTick)).state; } this.state = sim.advance(s, Date.now()).state; },
  };
  const party = { id: 'p', leader: 'a', members: [{ playerId: 'a', name: 'A' }, { playerId: 'b', name: 'B' }] };
  vi.doMock('../store', () => ({ store }));
  vi.doMock('./sync', () => ({ pushNow: async () => {} }));
  vi.doMock('./bots', () => ({ worldResetAt: () => 0 }));
  vi.doMock('./index', () => ({
    online: {
      me: () => ({ id, name: id.toUpperCase() }),
      presenceOf: (pid: string) => share.all[pid],
      onPresence: () => () => {}, onSocial: () => () => {}, onChat: () => () => {},
      friends: async () => [], party: async () => party, partyInvites: async () => [], trades: async () => [],
    },
  }));
  const social = await import('./social');
  await social.refreshSocial();
  return { id, mods: { social, sim }, store, pres: null };
}

describe('野外组队伤害', () => {
  it('两个队友隔几格一起打：服务器每 4 秒结算一次，两边都一直看得到对方的伤害', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const share = { all: {} as Record<string, any> };
    const A = await client('a', 'b', share);
    const B = await client('b', 'a', share);
    vi.resetModules();
    const srv = await import('../server/sync');
    const saved: Record<string, any> = { a: JSON.parse(JSON.stringify(A.store.state)), b: JSON.parse(JSON.stringify(B.store.state)) };
    const hits: Record<string, number> = { a: 0, b: 0 };
    for (let t = 0; t < 60_000; t += 100) {
      vi.setSystemTime(T0 + t);
      if (t % 4000 === 2000) for (const C of [A, B]) {
        const r = srv.runSync(saved[C.id], C.store.pending, Date.now(), { gmBuffs: [], guildLv: 0, mails: [], me: C.id, party: ['a', 'b'], partySize: 2 } as any, 'dev');
        saved[C.id] = JSON.parse(JSON.stringify(r.state));
        C.store.adopt(r.state, r.ack);
      }
      for (const C of [A, B]) {
        C.store.state = C.mods.sim.advance(C.store.state, Date.now()).state;
        const s = C.store.state;
        const c = s.combat;
        const fd = c?.crew ? { k: 'fight_rabbit', n: c.copy ?? 0, dmg: c.pTotal ?? 0 } : undefined;
        share.all[C.id] = { playerId: C.id, name: C.id.toUpperCase(), x: s.loc.x + (C.id === 'a' ? 0 : 3), y: s.loc.y, action: 'fight_rabbit', anim: 'fight-sword-ready', at: Date.now(), fd };
      }
      for (const C of [A, B]) {
        const s = C.store.state;
        C.mods.social.updateAggro(s, s.loc.x, s.loc.y, true);
        const other = C.id === 'a' ? 'b' : 'a';
        hits[C.id] += C.mods.social.takeFieldHits([share.all[other]]).length;
      }
    }
    expect(A.store.state.combat?.crew).toBe(1);
    expect(B.store.state.combat?.crew).toBe(1);
    expect(hits.a).toBeGreaterThan(0);
    expect(hits.b).toBeGreaterThan(0);
    vi.useRealTimers();
  });
});
