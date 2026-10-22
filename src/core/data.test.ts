import { ACTIONS, ITEMS, MONSTERS, NODES } from './data';

describe('数据闭环', () => {
  it('动作和掉落引用的物品都存在', () => {
    for (const a of Object.values(ACTIONS)) {
      if (a.kind === 'combat') {
        expect(MONSTERS[a.monster], a.id).toBeDefined();
        continue;
      }
      for (const s of [...(a.inputs ?? []), ...a.outputs]) expect(ITEMS[s.item], `${a.id} ${s.item}`).toBeDefined();
      if (a.fail?.item) expect(ITEMS[a.fail.item]).toBeDefined();
    }
    for (const m of Object.values(MONSTERS)) for (const d of m.drops) expect(ITEMS[d.item], `${m.id} ${d.item}`).toBeDefined();
  });

  it('每个动作都在且只在一个地点', () => {
    const seen = new Map<string, string>();
    for (const n of NODES) for (const id of n.actions) {
      expect(seen.get(id), `${id} 同时在 ${seen.get(id)} 和 ${n.id}`).toBeUndefined();
      seen.set(id, n.id);
    }
    expect([...seen.keys()].sort()).toEqual(Object.keys(ACTIONS).sort());
  });

  it('除金币、骨头、烧焦食物、强化石外，每样东西都有来源和用途', () => {
    const made = new Set<string>();
    const used = new Set<string>();
    for (const a of Object.values(ACTIONS)) {
      if (a.kind !== 'skill') continue;
      a.outputs.forEach((o) => made.add(o.item));
      a.inputs?.forEach((i) => used.add(i.item));
      if (a.fail?.item) made.add(a.fail.item);
    }
    for (const m of Object.values(MONSTERS)) m.drops.forEach((d) => made.add(d.item));
    for (const it of Object.values(ITEMS)) {
      expect(made.has(it.id), `${it.name} 没有来源`).toBe(true);
      const usable = used.has(it.id) || !!it.equip || !!it.heals || !!it.ammo;
      if (!['coins', 'bones', 'burnt_food'].includes(it.id) && !it.id.startsWith('enh_')) expect(usable, `${it.name} 没有用途`).toBe(true);
    }
  });
});

describe('装备体系', () => {
  it('每阶每种装备都存在、能做出来、有属性', async () => {
    const { EQUIP_TYPES, TIERS } = await import('./data');
    const makers = new Set<string>();
    for (const a of Object.values(ACTIONS)) if (a.kind === 'skill') a.outputs.forEach((o) => makers.add(o.item));
    for (const t of TIERS) {
      for (const e of EQUIP_TYPES) {
        const it = ITEMS[`${t.id}_${e.key}`];
        expect(it?.equip, `${t.id}_${e.key}`).toBeDefined();
        expect(makers.has(it.id), `${it.name} 做不出来`).toBe(true);
        const q = it.equip!;
        expect(q.attack + q.strength + q.defence + (q.speed ?? 0), `${it.name} 没有属性`).toBeGreaterThan(0);
      }
    }
  });
});
