import { describe, expect, it } from 'vitest';
import { runSync } from './sync';
import { advance, newGame } from '../core/sim';
import { applyCmd, type Cmd, type CmdName } from '../core/commands';
import { NODES, WALK_TILES_PER_SEC, WAYSTONES, standOf } from '../core/data';
import type { GameState } from '../core/types';

const EX = { gmBuffs: [], guildLv: 0, mails: [] };
const t0 = 1_700_000_000_000;
const pine = standOf(NODES.find((n) => n.id === 'town_lake')!);

/** 模拟本机：每 200 毫秒结算一次，到点执行指令，同时记下指令 */
function client(s: GameState, plan: [number, CmdName, unknown[]][], until: number) {
  const cmds: Cmd[] = [];
  let q = 0, i = 0;
  for (let t = t0 + 200; t <= until; t += 200) {
    s = advance(s, t).state;
    while (i < plan.length && t0 + plan[i][0] <= t) {
      const [, n, a] = plan[i++];
      const r = applyCmd(s, n, a, t);
      if (r.state !== s) cmds.push({ n, a, t, q: ++q });
      s = r.state;
    }
  }
  return { s, cmds };
}
const spawn = newGame(t0, 5).loc;
/** 从出生点走到湖边要多久（直线，放宽两成） */
const walkMs = Math.ceil((Math.hypot(pine.x - spawn.x, pine.y - spawn.y) / WALK_TILES_PER_SEC) * 1200);
const PLAN: [number, CmdName, unknown[]][] = [
  [1000, 'walk', [spawn, pine, walkMs]],
  [1200 + walkMs, 'setLoc', [pine.x, pine.y]],
  [1400 + walkMs, 'startNow', ['fish_minnow', { type: 'infinite' }]],
  [600_000, 'leaveWork', []],
];

describe('服务器结算', () => {
  it('诚实玩家：服务器算出来和本机一样', () => {
    const base = newGame(t0, 5);
    const end = t0 + 20 * 60_000;
    const { s, cmds } = client(base, PLAN, end);
    const r = runSync(JSON.parse(JSON.stringify(base)), cmds, end, EX, 'dev');
    expect(r.applied).toBe(cmds.length);
    expect(r.state.bank).toEqual(s.bank);
    expect(r.state.bag).toEqual(s.bag);
    expect(r.state.xp).toEqual(s.xp);
    expect(r.state.loc).toEqual(s.loc);
    expect(r.state.xp.fishing).toBeGreaterThan(0);
    expect(r.flags).toEqual([]);
  });

  it('变速：指令时间跑在服务器前面也只算到服务器的现在', () => {
    const base = newGame(t0, 5);
    // 本机时间快了 10 倍：20 分钟的进度，服务器只过了 2 分钟
    const { s, cmds } = client(base, PLAN, t0 + 20 * 60_000);
    const r = runSync(JSON.parse(JSON.stringify(base)), cmds, t0 + 2 * 60_000, EX, 'dev');
    expect(r.state.lastTick).toBe(t0 + 2 * 60_000);
    expect(r.state.xp.fishing).toBeLessThan(s.xp.fishing / 3);
  });

  it('存档时间在服务器前面的老存档：从服务器的现在接着算', () => {
    const base = { ...newGame(t0, 5), lastTick: t0 + 3600_000 };
    const r = runSync(base, [], t0, EX, 'dev');
    expect(r.state.lastTick).toBe(t0);
  });

  it('重发的指令不会执行两次', () => {
    const base = newGame(t0, 5);
    base.bank.minnow = 10;
    const sell: Cmd[] = [{ n: 'setLoc', a: [spawn.x + 2, spawn.y], t: t0 + 1, q: 1 }];
    const r1 = runSync(base, sell, t0 + 1000, EX, 'dev');
    const r2 = runSync(r1.state, sell, t0 + 2000, EX, 'dev');
    expect(r1.ack).toBe(1);
    expect(r2.applied).toBe(0);
    expect(r2.ack).toBe(1);
  });

  it('乱传的指令不会让服务器出错', () => {
    const base = newGame(t0, 5);
    const junk = [null, 1, { n: 'nope', a: [], t: t0, q: 1 }, { n: 'equip', a: 'x', t: 'y', q: 2 }, { n: 'toBag', a: ['coins', -5], t: t0, q: 3 },
      { n: 'walk', a: [null, { x: 'a' }, -1], t: t0, q: 4 }, { n: 'settings', a: [{ skin: 1, foo: 2 }], t: t0, q: 5 }];
    const r = runSync(base, junk, t0 + 1000, EX, 'dev');
    expect(r.state.bank.coins).toBe(base.bank.coins);
  });

  it('GM 邮件只放进邮箱一次，新档用资料里的外观', () => {
    const r = runSync(null, [], t0, { ...EX, outfit: 'ranger', mails: [{ id: 'm1', title: '礼物', body: '', items: [{ item: 'minnow', qty: 3 }] }] }, 'dev');
    expect(r.mailIds).toEqual(['m1']);
    expect(r.state.mail?.[0]?.items).toEqual([{ item: 'minnow', qty: 3 }]);
  });
});

describe('改过的客户端乱传参数', () => {
  const far = standOf(NODES.find((n) => n.id === 'town_lake')!);
  const run = (base: GameState, cmds: Omit<Cmd, 'q'>[], now: number, ex = {}) =>
    runSync({ ...JSON.parse(JSON.stringify(base)), _seq: {} }, cmds.map((c, i) => ({ ...c, q: i + 1 })), now, { ...EX, ...ex }, 'dev').state;

  it('瞬移：一下报到很远的地方不认，走够时间才认', () => {
    const base = newGame(t0, 5);
    const d = Math.hypot(far.x - base.loc.x, far.y - base.loc.y);
    expect(d).toBeGreaterThan(30);
    expect(run(base, [{ n: 'setLoc', a: [far.x, far.y], t: t0 + 500 }], t0 + 1000).loc).toEqual(base.loc);
    expect(run(base, [{ n: 'leaveAndSetLoc', a: [far.x, far.y], t: t0 + 500 }], t0 + 1000).loc).toEqual(base.loc);
    // 走路说 1 毫秒走完：按最快速度算，2 秒后还在半路
    const w = run(base, [{ n: 'walk', a: [base.loc, far, 1], t: t0 + 100 }], t0 + 2000);
    expect(w.loc).toEqual(base.loc);
    expect(w.walk?.to).toEqual(far);
    // 走够了时间
    const ok = run(base, [{ n: 'walk' as CmdName, a: [base.loc, far, walkMs] }, { n: 'setLoc' as CmdName, a: [far.x, far.y] }].map((c, i) => ({ ...c, t: t0 + 100 + i * (walkMs + 500) })), t0 + 2 * walkMs);
    expect(ok.loc).toEqual(far);
  });

  it('诚实：自动寻路走到一半点地面换路，起点认画面上的位置', () => {
    const base = newGame(t0, 5);
    const dx = far.x - base.loc.x, dy = far.y - base.loc.y, d = Math.hypot(dx, dy);
    const k = (WALK_TILES_PER_SEC * 10) / d;
    const mid = { x: Math.round(base.loc.x + dx * k), y: Math.round(base.loc.y + dy * k) };
    const s = run(base, [
      { n: 'startAt', a: ['fish_minnow', 'town_lake'], t: t0 + 100 },
      { n: 'leaveWork', a: [], t: t0 + 10_100 },
      { n: 'walk', a: [mid, { x: mid.x + 3, y: mid.y }, 3000], t: t0 + 10_110 },
    ], t0 + 11_000);
    expect(s.walk?.from).toEqual(mid);
  });

  it('隔空激活石碑、回城传送不认', () => {
    const base = newGame(t0, 5);
    const stone = WAYSTONES.find((n) => Math.hypot(n.x - base.loc.x, n.y - base.loc.y) > 40)!;
    const s = run(base, [{ n: 'unlockWaystone', a: [{ x: stone.x, y: stone.y + 1 }], t: t0 + 500 }, { n: 'teleport', a: [stone.id], t: t0 + 600 }], t0 + 1000);
    expect(s.waystones ?? []).not.toContain(stone.id);
    expect(s.loc).toEqual(base.loc);
  });

  it('伪造的洞口进不去；队友存档里真开着的可以进', () => {
    const base = newGame(t0, 5);
    const gate = { id: 'fake1', kind: 'blue', tier: 6, x: base.loc.x, y: base.loc.y, at: t0, expires: t0 + 3600_000, seed: 1, floors: 9 };
    expect(run(base, [{ n: 'enterDungeon', a: [gate, 5, { members: [{ id: 'me', name: 'a' }, { id: 'x', name: 'b' }], me: 'me' }], t: t0 + 500 }], t0 + 1000).dungeon ?? null).toBeNull();
    const real = { ...gate, id: 'real1', kind: 'green', floors: 2 };
    const s = run(base, [{ n: 'enterDungeon', a: [{ ...real, floors: 20, tier: 6 }, 1], t: t0 + 500 }], t0 + 1000, { me: 'me', party: ['me', 'mate'], mateGates: [real] });
    expect(s.dungeon?.gate.floors).toBe(2);
    // 队友进度：队友存档里没打到那里就不拉
    const sync = (runs: unknown[]) => run(s, [{ n: 'syncDungeon', a: [{ gate: 'real1', floor: 1, idx: 0, phase: 'walk' }], t: t0 + 1100 }], t0 + 1200, { me: 'me', party: ['me', 'mate'], mateGates: [real], mateRuns: runs });
    expect(sync([]).dungeon?.floor).toBe(0);
    expect(sync([{ gate: 'real1', floor: 1, idx: 0, phase: 'walk' }]).dungeon?.floor).toBe(1);
  });

  it('没组队时报的队友伤害不算', () => {
    const grove = standOf(NODES.find((n) => n.id === 'starter_grove')!);
    const base = { ...newGame(t0, 5), loc: grove };
    const cmds: Omit<Cmd, 'q'>[] = [{ n: 'startNow', a: ['fight_rabbit', { type: 'infinite' }], t: t0 + 100 }];
    for (let t = 600; t < 60_000; t += 500) cmds.push({ n: 'coop', a: [{ crew: 4, dg: 4, mates: [9999], hits: [['field:fight_rabbit', 1e9]] }], t: t0 + t });
    const plain = run(base, cmds.slice(0, 1), t0 + 60_000);
    const hacked = run(base, cmds, t0 + 60_000);
    expect(hacked.stats.kills).toBeLessThanOrEqual(plain.stats.kills + 1);
  });

  it('攒着不发、把指令时间填成几小时前：最多往回算半小时', () => {
    const base = { ...newGame(t0, 5), loc: far };
    const now = t0 + 3 * 3600_000;
    const back = run(base, [{ n: 'startNow', a: ['fish_minnow', { type: 'infinite' }], t: t0 + 1 }], now);
    const honest = run(base, [{ n: 'startNow', a: ['fish_minnow', { type: 'infinite' }], t: now - 30 * 60_000 }], now);
    expect(back.xp.fishing).toBe(honest.xp.fishing);
  });

  it('不存在的指令名、原型上的名字不会弄坏存档', () => {
    const base = newGame(t0, 5);
    const s = run(base, ['toString', '__proto__', 'constructor', 'hasOwnProperty'].map((n, i) => ({ n: n as CmdName, a: [], t: t0 + i })), t0 + 1000);
    expect(s.bank).toEqual(base.bank);
    expect(typeof s).toBe('object');
    const bad = run(base, [{ n: 'startNow', a: ['__proto__', {}], t: t0 + 1 }, { n: 'startNow', a: ['nope', {}], t: t0 + 2 }], t0 + 1000);
    expect(bad.queue).toEqual([]);
  });

  it('可疑操作记下来：瞬移、伪造洞口、改走路速度', () => {
    const base = newGame(t0, 5);
    const gate = { id: 'fake9', kind: 'blue', tier: 6, x: base.loc.x, y: base.loc.y, at: t0, expires: t0 + 3600_000, seed: 1, floors: 9 };
    const r = runSync(base, [
      { n: 'setLoc', a: [far.x, far.y], t: t0 + 100, q: 1 },
      { n: 'enterDungeon', a: [gate, 1], t: t0 + 200, q: 2 },
      { n: 'walk', a: [base.loc, far, 1], t: t0 + 300, q: 3 },
      { n: 'nope' as CmdName, a: [], t: t0 + 400, q: 4 },
    ], t0 + 1000, EX, 'dev');
    const k = Object.fromEntries((r.flags ?? []).map((f) => [f.kind, f.severe]));
    expect(k).toEqual({ move: false, fake_gate: true, walk_fast: true, bad_cmd: false });
  });

  it('封禁：进度冻结，指令不执行，解封后也不补', () => {
    const base = { ...newGame(t0, 5), loc: far };
    const r = runSync(base, [{ n: 'startNow', a: ['fish_minnow', { type: 'infinite' }], t: t0 + 100, q: 5 }], t0 + 3600_000, { ...EX, frozen: true }, 'dev');
    expect(r.ack).toBe(5);
    expect(r.state.queue).toEqual([]);
    expect(r.state.lastTick).toBe(t0 + 3600_000);
    expect(r.state.xp.fishing).toBe(base.xp.fishing);
    expect(r.flags?.map((f) => f.kind)).toEqual(['banned_play']);
  });

  it('全服赠礼、每日礼物由服务器发，领了就是领了，不会再发', () => {
    const r1 = runSync(null, [], t0, EX, 'dev');
    const gift = r1.state.mail?.find((m) => m.kind === 'gift');
    expect(gift).toBeTruthy();
    const r2 = runSync(r1.state, [{ n: 'claimMail', a: [gift!.id], t: t0 + 500, q: 1 }], t0 + 1000, EX, 'dev');
    expect(r2.state.mail?.find((m) => m.id === gift!.id)?.claimed).toBe(true);
    const keys = (st: GameState) => (st.bag.dkey_g4 ?? 0) + (st.bank.dkey_g4 ?? 0);
    expect(keys(r2.state)).toBe(5);
    const r3 = runSync(r2.state, [{ n: 'claimMail', a: [gift!.id], t: t0 + 1500, q: 2 }], t0 + 86_400_000 * 2, EX, 'dev');
    expect(keys(r3.state)).toBe(5);
    expect(r3.state.mail?.filter((m) => m.kind === 'gift').length).toBe(1);
  });
});

describe('开箱随机数（11-02）', () => {
  it('服务器用密钥混过随机数：本机按存档算的结果对不上，服务器结果按序号带回来', () => {
    const base = newGame(t0, 5);
    base.bag.luckybag_3 = 20;
    const cmds: Cmd[] = Array.from({ length: 5 }, (_, i) => ({ n: 'openContainer', a: ['luckybag_3', 'bag', 1], t: t0 + 1000 + i, q: i + 1 }));
    // 本机预测（没有密钥）
    let local = base;
    const predicted: unknown[] = [];
    for (const c of cmds) { const r = applyCmd(local, c.n, c.a, c.t); local = r.state; predicted.push(r.out); }
    const a = runSync(JSON.parse(JSON.stringify(base)), cmds, t0 + 5000, { ...EX, salt: 'secret-A' }, 'dev');
    const b = runSync(JSON.parse(JSON.stringify(base)), cmds, t0 + 5000, { ...EX, salt: 'secret-A' }, 'dev');
    const c = runSync(JSON.parse(JSON.stringify(base)), cmds, t0 + 5000, { ...EX, salt: 'secret-B' }, 'dev');
    expect(a.results!.map((r) => r.q)).toEqual([1, 2, 3, 4, 5]);
    expect(a.results).toEqual(b.results);
    expect(JSON.stringify(a.results!.map((r) => r.out))).not.toBe(JSON.stringify(predicted));
    expect(JSON.stringify(a.results)).not.toBe(JSON.stringify(c.results));
    expect(a.state.bag.luckybag_3).toBe(15);
    // 没有密钥（本机测试服）就和本机一样
    const d = runSync(JSON.parse(JSON.stringify(base)), cmds, t0 + 5000, EX, 'dev');
    expect(d.results).toEqual([]);
  });
});
