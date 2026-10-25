import { useMemo, useState } from 'react';
import { ACTIONS, buffText, CROP_DEFS, fieldOfCrop, ITEMS, MONSTERS, nodeOfAction, SKILLS, TIERS, tierName } from '../core/data';
import { maxHp, POTION_AT } from '../core/sim';
import type { GameState, ItemDef } from '../core/types';
import { Icon } from './icons';
import { Bestiary } from './Bestiary';
import { tl } from '../i18n';

/** 图鉴的类型分类：按顺序匹配，第一个符合的就是它的类型 */
const ORE_IDS = new Set(TIERS.map((t) => t.ore));
const TYPES: { id: string; name: string; test: (it: ItemDef) => boolean }[] = [
  { id: 'ore', name: tl('矿石'), test: (it) => ORE_IDS.has(it.id) },
  { id: 'log', name: tl('木头'), test: (it) => it.id.endsWith('_log') },
  { id: 'cotton', name: tl('棉花'), test: (it) => it.id.startsWith('cotton_') },
  { id: 'hide', name: tl('兽皮'), test: (it) => it.id.startsWith('hide_') },
  { id: 'gem', name: tl('宝石'), test: (it) => ['sapphire', 'ruby', 'diamond'].includes(it.id) },
  { id: 'gather', name: tl('鱼·作物·草药'), test: (it) => it.category === 'resource' },
  { id: 'bar', name: tl('精炼锭'), test: (it) => it.id.endsWith('_bar') },
  { id: 'cloth', name: tl('板材·皮革·布料'), test: (it) => /^(plank|leather|cloth)_\d$/.test(it.id) },
  { id: 'material', name: tl('其他材料'), test: (it) => it.category === 'material' },
  { id: 'weapon', name: tl('武器'), test: (it) => it.equip?.slot === 'weapon' },
  { id: 'armor', name: tl('护甲'), test: (it) => ['head', 'body', 'feet', 'hands'].includes(it.equip?.slot ?? '') },
  { id: 'jewel', name: tl('首饰'), test: (it) => it.equip?.slot === 'ring' || it.equip?.slot === 'neck' },
  { id: 'tool', name: tl('工具'), test: (it) => it.category === 'tool' },
  { id: 'ammo', name: tl('弹药'), test: (it) => it.category === 'ammo' },
  { id: 'food', name: tl('食物·药水'), test: (it) => it.category === 'food' || it.category === 'potion' },
  { id: 'loot', name: tl('宝箱·福袋·战利品'), test: (it) => it.category === 'loot' },
  { id: 'deco', name: tl('首领战旗'), test: (it) => it.category === 'deco' },
  { id: 'misc', name: tl('其他'), test: () => true },
];
const typeOf = (it: ItemDef) => TYPES.find((t) => t.test(it))!.id;
const STYLE_NAME = { melee: tl('近战'), ranged: tl('远程'), magic: tl('魔法') };

/** 物品的来源和用途 */
function sourcesOf(id: string) {
  const make: string[] = [];
  const use: string[] = [];
  for (const a of Object.values(ACTIONS)) {
    if (a.kind !== 'skill') continue;
    const node = nodeOfAction(a.id);
    const where = node ? `${node.name}` : '';
    if (a.outputs.some((o) => o.item === id) || a.fail?.item === id) {
      make.push(tl`${SKILLS[a.skill].name} ${a.level} 级 · ${a.name}${where ? ` @ ${where}` : ''}`);
    }
    if (a.inputs?.some((i) => i.item === id)) {
      const out = a.outputs[0] ? ITEMS[a.outputs[0].item].name : a.name;
      use.push(tl`${SKILLS[a.skill].name} ${a.level} 级 · ${out}`);
    }
  }
  // 种田：作物和种子来自地块收获，种子种在地块里
  for (const c of Object.values(CROP_DEFS)) {
    const field = fieldOfCrop(c.id)?.name ?? '';
    if (c.outputs.some((o) => o.item === id)) make.push(tl`种植 ${c.level} 级 · 种${c.name} @ ${field}`);
    if (id === `seed_${c.id}`) use.push(tl`种植 ${c.level} 级 · 种${c.name} @ ${field}`);
  }
  const drops = Object.values(MONSTERS)
    .filter((m) => m.drops.some((d) => d.item === id))
    .map((m) => {
      const d = m.drops.find((x) => x.item === id)!;
      return tl`${m.name}（${m.level} 级）掉落${d.chance ? ` ${Math.round(d.chance * 1000) / 10}%` : ''}`;
    });
  return { make: [...new Set(make)], drops, use: [...new Set(use)] };
}

export function Codex({ s, onClose }: { s: GameState; onClose: () => void }) {
  const [tier, setTier] = useState<number | 'all' | 'none'>('all');
  const [type, setType] = useState('all');
  const [sel, setSel] = useState<string | null>(null);
  const [tab, setTab] = useState<'items' | 'monsters'>('items');
  const all = useMemo(() => Object.values(ITEMS).filter((it) => it.id !== 'coins'), []);
  const got = all.filter((it) => s.seen[it.id]).length;
  const shown = all.filter((it) =>
    (tier === 'all' || (tier === 'none' ? it.tier === undefined : it.tier === tier)) && (type === 'all' || typeOf(it) === type));
  const shownGot = shown.filter((it) => s.seen[it.id]).length;
  const typeCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const it of all) c[typeOf(it)] = (c[typeOf(it)] ?? 0) + 1;
    return c;
  }, [all]);

  return (
    <div className="page codex">
      <div className="sheet-head">
        <button className="back" onClick={onClose}>{tl('‹ 返回')}</button>
        <h2>{tab === 'items' ? tl('物品图鉴') : tl('怪物图鉴')}</h2>
        {tab === 'items' && <small className="muted">{tl`已收集 ${got}/${all.length}`}</small>}
      </div>
      <div className="tabs-row">
        <button className={`pill ${tab === 'items' ? 'on' : ''}`} onClick={() => setTab('items')}>{tl('物品图鉴')}</button>
        <button className={`pill ${tab === 'monsters' ? 'on' : ''}`} onClick={() => setTab('monsters')}>{tl('怪物图鉴')}</button>
      </div>
      {tab === 'monsters' ? <Bestiary s={s} /> : <>
      <div className="bag-meter"><i style={{ width: `${(got / all.length) * 100}%` }} /></div>

      <div className="chips-row">
        <button className={`pill ${tier === 'all' ? 'on' : ''}`} onClick={() => setTier('all')}>{tl('全部阶级')}</button>
        {TIERS.map((t, i) => (
          <button key={t.id} className={`pill ${tier === i ? 'on' : ''}`} onClick={() => setTier(i)}>
            {tierName(i)} {t.metal}
          </button>
        ))}
        <button className={`pill ${tier === 'none' ? 'on' : ''}`} onClick={() => setTier('none')}>{tl('无阶级')}</button>
      </div>
      <div className="chips-row">
        <button className={`pill ${type === 'all' ? 'on' : ''}`} onClick={() => setType('all')}>{tl('全部类型')}</button>
        {TYPES.filter((t) => typeCounts[t.id]).map((t) => (
          <button key={t.id} className={`pill ${type === t.id ? 'on' : ''}`} onClick={() => setType(t.id)}>{t.name}</button>
        ))}
      </div>
      <p className="muted">{tl`当前筛选 ${shownGot}/${shown.length} · 没获得过的物品只显示剪影`}</p>

      <div className="grid">
        {shown.map((it) => {
          const known = !!s.seen[it.id];
          return (
            <button key={it.id} className={`cell ${known ? '' : 'unknown'} ${sel === it.id ? 'sel' : ''}`} onClick={() => setSel(it.id)}>
              <Icon item={it.id} info={false} />
              <span className="nm">{known ? it.name : tl('？？？')}</span>
            </button>
          );
        })}
      </div>
      {!shown.length && <p className="muted">{tl('这个分类下没有物品。')}</p>}
      {sel && <CodexDetail s={s} id={sel} />}
      </>}
    </div>
  );
}

export function CodexDetail({ s, id, reveal = false }: { s: GameState; id: string; reveal?: boolean }) {
  const it = ITEMS[id];
  const known = reveal || !!s.seen[id];
  const type = TYPES.find((t) => t.id === typeOf(it))!.name;
  if (!known) {
    return (
      <div className="item-detail frame">
        <div className="row1"><b>{tl('？？？')}</b><span className="muted">{it.tier !== undefined && `${tierName(it.tier)} · `}{type}</span></div>
        <span className="muted">{tl('尚未获得。采集、制作或打怪拿到一次后就能查看详细信息。')}</span>
      </div>
    );
  }
  const src = sourcesOf(id);
  const e = it.equip;
  const owned = (s.bank[id] ?? 0) + (s.bag[id] ?? 0) + (Object.values(s.equipment).includes(id) ? 1 : 0);
  return (
    <div className="item-detail frame">
      <div className="row1">
        <span className="with-icon"><Icon item={id} size={28} /> <b>{it.tier !== undefined && `${tierName(it.tier)} `}{it.name}</b></span>
        <span className="muted">{tl`${type} · 单价 ${it.value} · 拥有 ${owned}`}</span>
      </div>
      {it.heals && (
        <span>{tl('回复 ')}<b className="gold">{it.heals}</b>{tl` 生命（你的生命上限 ${maxHp(s)}，约 ${Math.min(100, Math.round((it.heals / maxHp(s)) * 100))}%）`}{it.buff && <b className="gold"> · {buffText(it.buff)}</b>}
        </span>
      )}
      {it.category === 'potion' && (
        <span className="muted">{tl`用法：在背包里点它「放进药水栏」，或回仓库补给时自动带上。战斗中血量低于 ${Math.round(POTION_AT * 100)}% 会先喝药水救急，然后才吃食物；药水栏不占背包。`}</span>
      )}
      {it.category === 'food' && it.heals && (
        <span className="muted">{tl`用法：放进食物栏或背包，战斗中血量低于设定的进食阈值时自动吃${it.buff ? tl('，吃下后获得限时增益') : ''}。`}</span>
      )}
      {it.desc && <span className="muted">{it.desc}</span>}
      {it.ammo && <span>{tl`${it.ammo.style === 'ranged' ? tl('箭矢') : tl('符文')} · 威力 +${it.ammo.power}`}</span>}
      {e && (
        <span>
          {e.move ? tl`坐骑 · 骑乘时移动速度 +${Math.round(e.move * 100)}%` : tl`需要${SKILLS[e.skill].name} ${e.level} 级`}
          {e.move ? '' : e.speed ? tl` · ${SKILLS[e.skill].name}速度 +${Math.round(e.speed * 100)}%` : tl` · 攻 +${e.attack} 力 +${e.strength} 防 +${e.defence}`}
          {e.attackMs ? tl` · 攻速 ${(e.attackMs / 1000).toFixed(1)} 秒` : ''}
          {e.style && e.slot !== 'weapon' && tl`（攻、力只对${STYLE_NAME[e.style]}生效）`}
        </span>
      )}
      {(src.make.length > 0 || src.drops.length > 0) && <b className="sub">{tl('来源')}</b>}
      {src.make.map((t) => <span key={t} className="muted">· {t}</span>)}
      {src.drops.map((t) => <span key={t} className="muted">· {t}</span>)}
      {src.use.length > 0 && <b className="sub">{tl('用途')}</b>}
      {src.use.slice(0, 12).map((t) => <span key={t} className="muted">· {t}</span>)}
      {src.use.length > 12 && <span className="muted">{tl`· 还有 ${src.use.length - 12} 种配方`}</span>}
    </div>
  );
}
