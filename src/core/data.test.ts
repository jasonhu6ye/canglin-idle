import { ACTIONS, CROP_DEFS, ITEMS, MONSTERS, NODES, nodeOfAction } from './data';
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
      // 两座城的同类建筑可以重复，野外地点的动作只在一处
      const prev = seen.get(id);
      if (prev && NODES.find((x) => x.id === prev)?.town && n.town) continue;
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
    for (const it of Object.values(ITEMS)) it.opens?.pool.forEach((e) => made.add(e.item));
    // 兑换码送的坐骑
    made.add('mount_danmark');
    // 品质版本由制作随机出（用户 10-25）
    for (const it of Object.values(ITEMS)) if (it.quality) made.add(it.id);
    // 畜牧站养大的马；小马崽放进马栏
    for (let a = 50; a <= 200; a++) made.add(`mount_horse_${a}`);
    used.add('foal');
    // 种田：作物来自地块收获，种子种在地块里
    for (const c of Object.values(CROP_DEFS)) {
      c.outputs.forEach((o) => made.add(o.item));
      used.add(`seed_${c.id}`);
    }
    // 肥料种地时用、洒水器装在田里
    for (const id of ['fert_basic', 'fert_rich', 'sprinkler']) used.add(id);
    for (const it of Object.values(ITEMS)) {
      expect(made.has(it.id), `${it.name} 没有来源`).toBe(true);
      const usable = used.has(it.id) || !!it.equip || !!it.heals || !!it.ammo || !!it.opens || it.category === 'loot' || it.category === 'deco';
      // 南瓜积分留给以后的兑换商店（用户 10-24）
      if (!['coins', 'bones', 'burnt_food', 'pumpkin_pt'].includes(it.id) && !it.id.startsWith('enh_') && !/^(crystal|resin|feather)_\d$/.test(it.id)) expect(usable, `${it.name} 没有用途`).toBe(true);
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
        expect(q.attack + q.strength + q.defence + (q.speed ?? 0) + (q.haste ?? 0), `${it.name} 没有属性`).toBeGreaterThan(0);
      }
    }
  });
});

describe('怪物图鉴', () => {
  it('原 192 种 + 新地点 20 种生物和 8 个首领 + 外圈 70 种和 4 个首领，id 不重复，特性都有定义', () => {
    const base = SPECIES.filter((s) => !s.home);
    const fresh = SPECIES.filter((s) => s.home && !s.ring && !s.outer && !s.world && !s.event && !s.horse);
    const ring = SPECIES.filter((s) => s.ring);
    // 12080 最外圈（用户 10-24）：43 种新生物 + 8 个首领，每个新群系一个首领
    const outer = SPECIES.filter((s) => s.outer);
    expect(outer.filter((s) => s.rank !== 'boss')).toHaveLength(43);
    expect(outer.filter((s) => s.rank === 'boss')).toHaveLength(8);
    expect(new Set(outer.filter((s) => s.rank === 'boss').map((s) => s.region)).size).toBe(8);
    for (const s of outer) expect(NODES.find((n) => n.id === s.home), s.id).toBeDefined();
    // 8848 外圈（用户 10-23）：70 种新生物 + 4 个新首领，都绑在外圈的地点上
    expect(ring.filter((s) => s.rank !== 'boss')).toHaveLength(70);
    expect(ring.filter((s) => s.rank === 'boss')).toHaveLength(4);
    for (const s of ring) expect(NODES.find((n) => n.id === s.home), s.id).toBeDefined();
    // 世界首领（用户 10-24）：5 个，各住一个巢穴，必掉宝库
    const world = SPECIES.filter((s) => s.world);
    expect(world).toHaveLength(5);
    for (const s of world) {
      const lair = NODES.find((n) => n.id === s.home);
      expect(lair?.world, s.id).toBe(true);
      expect(lair!.actions).toContain(`fight_${s.id}`);
      const m = MONSTERS[s.id];
      expect(m.world).toBe(true);
      const chest = m.drops.find((d) => d.item === `worldchest_${s.id}`);
      expect(chest && (chest.chance ?? 1)).toBe(1);
      expect(ITEMS[`worldchest_${s.id}`].opens).toBeDefined();
    }
    expect(new Set(SPECIES.map((s) => s.name)).size, '名字不重复').toBe(SPECIES.length);
    expect(base).toHaveLength(192);
    expect(fresh.filter((s) => s.rank !== 'boss')).toHaveLength(20);
    expect(fresh.filter((s) => s.rank === 'boss')).toHaveLength(8);
    expect(new Set(SPECIES.map((s) => s.id)).size).toBe(SPECIES.length);
    for (let t = 0; t < 8; t++) {
      const tier = base.filter((s) => s.tier === t);
      expect(tier).toHaveLength(24);
      expect(tier.filter((s) => s.rank === 'elite')).toHaveLength(5);
      expect(tier.filter((s) => s.rank === 'boss')).toHaveLength(2);
    }
    // 每处新地点都有自己的首领
    for (const n of NODES.filter((x) => x.site)) {
      const own = SPECIES.filter((s) => s.home === n.id);
      if (fresh.some((s) => s.home === n.id)) expect(own.some((s) => s.rank === 'boss'), n.name).toBe(true);
      else expect(own.length, n.name).toBeGreaterThan(0);
    }
    for (const s of SPECIES) for (const tr of s.traits) expect(TRAITS[tr], `${s.id} ${tr}`).toBeDefined();
  });

  it('每种怪物都有刷新点，掉落物都存在且有用处', () => {
    for (const s of SPECIES) {
      // 海岛上的生物要等航行系统开放（用户 10-24），暂时没有能去的刷新点
      const home = NODES.find((n) => n.id === s.home);
      if (!home?.sea) expect(nodeOfAction(`fight_${s.id}`), s.id).toBeDefined();
      for (const d of MONSTERS[s.id].drops) expect(ITEMS[d.item], `${s.id} → ${d.item}`).toBeDefined();
    }
    const used = new Set(Object.values(ACTIONS).flatMap((a) => (a.kind === 'skill' ? a.inputs?.map((i) => i.item) ?? [] : [])));
    for (const id of ['bones', 'meat_1', 'meat_8', 'core_1', 'core_8']) expect(used.has(id), id).toBe(true);
  });

  it('宝箱、福袋奖池里的东西都存在；每个首领都有专属战利品和战旗', () => {
    for (const it of Object.values(ITEMS)) it.opens?.pool.forEach((e) => expect(ITEMS[e.item], `${it.name} 奖池里的 ${e.item}`).toBeTruthy());
    for (const m of Object.values(MONSTERS)) {
      if (m.rank !== 'boss' || m.event) continue;
      expect(m.drops.some((d) => d.item === `banner_${m.id}`), `${m.name} 没有战旗`).toBe(true);
      expect(m.drops.some((d) => d.item === `trophy_${m.id}`), `${m.name} 没有战利品`).toBe(true);
    }
  });
});
