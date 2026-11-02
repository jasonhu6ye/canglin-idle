import { describe, expect, it } from 'vitest';
import { betaAudit, oweTotal } from './beta';
import { newProv } from './prov';
import { newGame } from './sim';
import { ITEMS } from './data';
import { qualityOf } from './quality';

describe('公测审查（11-02）', () => {
  const t0 = new Date(2026, 10, 2).getTime();
  it('GM 发的回收、交易来的待看、自己打的保留；查不到来历的传说装备待看', () => {
    const s = newGame(t0, 1);
    const hiGear = Object.keys(ITEMS).find((id) => ITEMS[id].equip && qualityOf(id) >= 4)!;
    s.prov = newProv(s, t0);
    s.prov.mats.dkey_g4 = { 'mail:gm': 2, outside: 1, 'drop:wolf': 10 };
    s.prov.mats.coins = { 'cmd:sell': 100 };
    s.bank = { dkey_g4: 5, coins: 500, [hiGear]: 1 };
    const lines = betaAudit({ ...s, prov: s.prov, gmGot: { coins: 300 }, grants: { coins: 350 }, mail: [] });
    const of = (id: string) => lines.find((l) => l.item === id)!;
    expect(of('dkey_g4')).toMatchObject({ held: 5, recall: 2, review: 1, keep: 2 });
    expect(of('coins')).toMatchObject({ recall: 350, review: 0, keep: 150 });
    expect(of(hiGear)).toMatchObject({ review: 1, why: ['old_hi'] });
    // 还在邮箱没领的不算已经领到的
    const l2 = betaAudit({ ...s, prov: s.prov, grants: { coins: 350 }, mail: [{ id: 1, kind: 'custom', at: t0, items: [{ item: 'coins', qty: 350 }], gm: 'gm' }] });
    expect(l2.find((l) => l.item === 'coins')!.recall).toBe(0);
  });

  it('防偷跑：GM 发的东西不在身上了按价值记欠款，转给过别人的标出接收人', () => {
    const s = newGame(t0, 1);
    s.prov = newProv(s, t0);
    s.bank = { coins: 10 };
    const lines = betaAudit({ ...s, prov: s.prov, gmGot: { dkey_g4: 4, coins: 50 }, sent: [{ to: 'Alt#22222222', items: { dkey_g4: 4 } }] });
    const key = lines.find((l) => l.item === 'dkey_g4')!;
    expect(key).toMatchObject({ held: 0, short: 4, owe: 4 * ITEMS.dkey_g4.value, to: ['Alt#22222222'] });
    expect(key.why).toContain('sent');
    expect(lines.find((l) => l.item === 'coins')).toMatchObject({ recall: 10, short: 40, owe: 40 });
    expect(oweTotal(lines)).toBe(4 * ITEMS.dkey_g4.value + 40);
  });
});
