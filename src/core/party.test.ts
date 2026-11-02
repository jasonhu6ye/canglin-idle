import { afterEach, describe, expect, it } from 'vitest';
import { advance, newGame, startNow } from './sim';
import { ASSIST_XP, onlinePartySize, setPartySize } from './party';
import { fieldKey, pushMateHit, setFieldCrew } from './aggro';

const T0 = 1_800_000_000_000;
afterEach(() => { setPartySize(0); setFieldCrew(0); });

describe('组队经验（11-02）', () => {
  it('只算在线的队员，只有自己在线不加成，最多 5 人', () => {
    const on = (ids: string[]) => (id: string) => ids.includes(id);
    expect(onlinePartySize(['me', 'a', 'b'], 'me', on(['a']))).toBe(2);
    expect(onlinePartySize(['me', 'a', 'b'], 'me', on([]))).toBe(0);
    expect(onlinePartySize(['me', 'a', 'b', 'c', 'd', 'e'], 'me', on(['a', 'b', 'c', 'd', 'e']))).toBe(5);
  });

  it('组队加成只在在线结算时算，下线补算的那段不加', () => {
    const base = startNow(newGame(T0, 3), 'mine_stone', { type: 'infinite' });
    const run = (party: number, stepMs: number) => {
      setPartySize(party);
      let s = base;
      for (let t = T0 + stepMs; t <= T0 + 3600_000; t += stepMs) s = advance(s, t).state;
      return s.xp.mining;
    };
    const solo = run(0, 60_000);
    expect(run(3, 60_000) / solo).toBeGreaterThan(1.12);
    expect(run(3, 3600_000)).toBe(run(0, 3600_000));
  });

  it('助攻经验：自己打过的怪被队友打死，队友打的那部分按比例也给经验', () => {
    setFieldCrew(1);
    let s = startNow(newGame(T0, 7), 'fight_rabbit', { type: 'infinite' });
    let t = T0;
    // 走到怪旁边、自己先打中几下
    for (let i = 0; i < 2000 && !((s.combat?.pTotal ?? 0) > 0); i++) s = advance(s, (t += 500)).state;
    const c = s.combat!;
    expect(c.pTotal).toBeGreaterThan(0);
    const mine = c.pTotal!, max = c.monsterMax!;
    const xp0 = s.xp.melee;
    pushMateHit(fieldKey('fight_rabbit'), c.monsterHp + 5);
    s = advance(s, (t += 10)).state;
    expect(s.xp.melee - xp0).toBeGreaterThanOrEqual(Math.round((max - mine) * ASSIST_XP) - 1);
    expect(s.xp.melee - xp0).toBeLessThanOrEqual(Math.round((max - mine) * ASSIST_XP) + 1);
  });

  it('没打过的怪被队友打死，没有助攻经验', () => {
    setFieldCrew(1);
    let s = startNow(newGame(T0, 7), 'fight_rabbit', { type: 'infinite' });
    let t = T0;
    for (let i = 0; i < 2000 && !s.combat; i++) s = advance(s, (t += 500)).state;
    expect(s.combat?.pTotal ?? 0).toBe(0);
    const xp0 = s.xp.melee;
    pushMateHit(fieldKey('fight_rabbit'), s.combat!.monsterHp + 5);
    s = advance(s, (t += 10)).state;
    expect(s.xp.melee).toBe(xp0);
  });
});
