import { ACTIONS, ITEMS, MONSTERS, NODES, nodeOfAction } from './data';
import { SPECIES, TRAITS } from './bestiary';

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

describe('怪物图鉴', () => {
  it('192 种，每阶 24 种（17 普通 5 精英 2 首领），id 不重复，特性都有定义', () => {
    expect(SPECIES).toHaveLength(192);
    expect(new Set(SPECIES.map((s) => s.id)).size).toBe(192);
    for (let t = 0; t < 8; t++) {
      const tier = SPECIES.filter((s) => s.tier === t);
      expect(tier).toHaveLength(24);
      expect(tier.filter((s) => s.rank === 'elite')).toHaveLength(5);
      expect(tier.filter((s) => s.rank === 'boss')).toHaveLength(2);
    }
    for (const s of SPECIES) for (const tr of s.traits) expect(TRAITS[tr], `${s.id} ${tr}`).toBeDefined();
  });

  it('每种怪物都有刷新点，掉落物都存在且有用处', () => {
    for (const s of SPECIES) {
      expect(nodeOfAction(`fight_${s.id}`), s.id).toBeDefined();
      for (const d of MONSTERS[s.id].drops) expect(ITEMS[d.item], `${s.id} → ${d.item}`).toBeDefined();
    }
    const used = new Set(Object.values(ACTIONS).flatMap((a) => (a.kind === 'skill' ? a.inputs?.map((i) => i.item) ?? [] : [])));
    for (const id of ['bones', 'meat_1', 'meat_8', 'core_1', 'core_8']) expect(used.has(id), id).toBe(true);
  });
});
