import { jewelLine } from './format';
import { qClass, qid, QUALITY_NAME } from '../core/quality';
import { QualityTable } from './Quality';
import { useSticky } from './sticky';
import { useMemo, useState } from 'react';
import { ACTIONS, buffText, CROP_DEFS, fieldOfCrop, ITEMS, MONSTERS, nodeOfAction, nodesOfAction, SKILLS, TIERS, tierName } from '../core/data';
import { maxHp, POTION_AT, startAt, toolSkillNames } from '../core/sim';
import type { GameState, ItemDef } from '../core/types';
import { Icon } from './icons';
import { Bestiary } from './Bestiary';
import { tl } from '../i18n';
import { store } from '../store';
import { openItem } from './itemOpen';

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
  { id: 'food', name: tl('食物·药水'), test: (it) => it.category === 'food' || it.category === 'potion' },
  { id: 'loot', name: tl('宝箱·福袋·战利品'), test: (it) => it.category === 'loot' },
  { id: 'deco', name: tl('首领战旗'), test: (it) => it.category === 'deco' },
  { id: 'misc', name: tl('其他'), test: () => true },
];
const typeOf = (it: ItemDef) => TYPES.find((t) => t.test(it))!.id;
const STYLE_NAME = { melee: tl('近战'), ranged: tl('远程'), magic: tl('魔法') };

/** 物品的来源和用途 */
/** 来源一行：能寻路的带上地点和动作，点了直接走过去（用户 10-25） */
type Src = { text: string; node?: string; action?: string; monster?: string };
function sourcesOf(id: string) {
  const make: Src[] = [];
  const use: string[] = [];
  for (const a of Object.values(ACTIONS)) {
    if (a.kind !== 'skill') continue;
    if (a.outputs.some((o) => o.item === id) || a.fail?.item === id) {
      const nodes = nodesOfAction(a.id).filter((n) => !n.closed);
      if (!nodes.length) make.push({ text: tl`${SKILLS[a.skill].name} ${a.level} 级 · ${a.name}` });
      for (const n of nodes) make.push({ text: tl`${SKILLS[a.skill].name} ${a.level} 级 · ${a.name}${` @ ${n.name}`}`, node: n.id, action: a.id });
    }
    if (a.inputs?.some((i) => i.item === id)) {
      const out = a.outputs[0] ? ITEMS[a.outputs[0].item].name : a.name;
      use.push(tl`${SKILLS[a.skill].name} ${a.level} 级 · ${out}`);
    }
  }
  // 种田：作物和种子来自地块收获，种子种在地块里
  for (const c of Object.values(CROP_DEFS)) {
    const field = fieldOfCrop(c.id)?.name ?? '';
    if (c.outputs.some((o) => o.item === id)) make.push({ text: tl`种植 ${c.level} 级 · 种${c.name} @ ${field}`, node: fieldOfCrop(c.id)?.id });
    if (id === `seed_${c.id}`) use.push(tl`种植 ${c.level} 级 · 种${c.name} @ ${field}`);
  }
  const drops = Object.values(MONSTERS)
    .filter((m) => m.drops.some((d) => d.item === id))
    .map((m) => {
      const d = m.drops.find((x) => x.item === id)!;
      return { text: tl`${m.name}（${m.level} 级）掉落${d.chance ? ` ${Math.round(d.chance * 1000) / 10}%` : ''}`, monster: nodeOfAction(`fight_${m.id}`) ? m.id : undefined } as Src;
    });
  const seen = new Set<string>();
  return { make: make.filter((x) => !seen.has(x.text) && !!seen.add(x.text)), drops, use: [...new Set(use)] };
}

/** 点来源：资源点直接开工（自己走过去），种田等只走过去打开页面；怪物就追踪过去 */
function goSource(x: Src) {
  if (x.monster) store.track(x.monster);
  // 用户 10-26：以前只走过去打开页面，角色站着发呆；现在直接开工（会自己走过去）
  else if (x.node && x.action) store.dispatch((s) => startAt(s, x.action!, x.node!));
  else if (x.node) store.requestWalk(x.node);
  else return;
  openItem(null);
}

/** 装备任何品质拿到过都算见过 */
const seenAny = (s: GameState, id: string) => !!s.seen[id] || (!!ITEMS[id]?.equip && QUALITY_NAME.some((_, q) => s.seen[qid(id, q)]));

export function Codex({ s, onClose }: { s: GameState; onClose: () => void }) {
  const [tier, setTier] = useSticky<number | 'all' | 'none'>('codex.tier', 'all');
  const [type, setType] = useSticky('codex.type', 'all');
  const [sel, setSel] = useSticky<string | null>('codex.sel', null);
  const [tab, setTab] = useSticky<'items' | 'monsters'>('codex.tab', 'items');
  const all = useMemo(() => Object.values(ITEMS).filter((it) => it.id !== 'coins' && !it.quality), []);
  const got = all.filter((it) => seenAny(s, it.id)).length;
  const shown = all.filter((it) =>
    (tier === 'all' || (tier === 'none' ? it.tier === undefined : it.tier === tier)) && (type === 'all' || typeOf(it) === type));
  const shownGot = shown.filter((it) => seenAny(s, it.id)).length;
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
          const known = seenAny(s, it.id);
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
  // 图鉴里只列普通版，任何品质拿到过都算见过
  const known = reveal || seenAny(s, id);
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
        <span className="with-icon"><Icon item={id} size={28} /> <b className={qClass(it.quality)}>{it.tier !== undefined && !/^T\d/.test(it.name) && `${tierName(it.tier)} `}{it.name}</b></span>
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
      {e && (
        <span>
          {e.move ? tl`坐骑 · 骑乘时移动速度 +${Math.round(e.move * 100)}%` : tl`需要${SKILLS[e.skill].name} ${e.level} 级`}
          {e.slot === 'ring' || e.slot === 'neck' ? ` · ${jewelLine(e)}` : e.move ? '' : e.speed ? tl` · ${toolSkillNames(e.slot) || SKILLS[e.skill].name}速度 +${Math.round(e.speed * 100)}%` : tl` · 攻 +${e.attack} 力 +${e.strength} 防 +${e.defence}`}
          {!e.move && !e.speed && e.haste && e.slot !== 'neck' ? tl` · 攻速 +${Math.round(e.haste * 100)}%` : ''}{e.twoHanded ? tl(' · 双手持握，不能用副手') : ''}{e.leech ? tl` · 吸血 ${Math.round(e.leech * 100)}%（打出伤害的 ${Math.round(e.leech * 100)}% 回成生命）` : ''}
          {e.attackMs ? tl` · 攻速 ${(e.attackMs / 1000).toFixed(1)} 秒` : ''}
          {e.style && e.slot !== 'weapon' && tl`（攻、力只对${STYLE_NAME[e.style]}生效）`}
        </span>
      )}
      {e && !e.move && <QualityTable id={id} />}
      {(src.make.length > 0 || src.drops.length > 0) && <b className="sub">{tl('来源')}</b>}
      {[...src.make, ...src.drops].map((x) => (x.node || x.monster
        ? <button key={x.text} className="src-go" onClick={() => goSource(x)}><span>· {x.text}</span><b>{tl('寻路 ›')}</b></button>
        : <span key={x.text} className="muted">· {x.text}</span>))}
      {src.use.length > 0 && <b className="sub">{tl('用途')}</b>}
      {src.use.slice(0, 12).map((t) => <span key={t} className="muted">· {t}</span>)}
      {src.use.length > 12 && <span className="muted">{tl`· 还有 ${src.use.length - 12} 种配方`}</span>}
    </div>
  );
}
