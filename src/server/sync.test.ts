import { describe, expect, it } from 'vitest';
import { runSync } from './sync';
import { advance, newGame } from '../core/sim';
import { applyCmd, type Cmd, type CmdName } from '../core/commands';
import { NODES, standOf } from '../core/data';
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
const PLAN: [number, CmdName, unknown[]][] = [
  [1000, 'setLoc', [pine.x, pine.y]],
  [1200, 'startNow', ['fish_minnow', { type: 'infinite' }]],
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
    const sell: Cmd[] = [{ n: 'setLoc', a: [pine.x, pine.y], t: t0 + 1, q: 1 }];
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
