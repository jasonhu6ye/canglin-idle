import { useState } from 'react';
import { ACTIONS, buffText, ITEMS, NODES, tierName, REGIONS, SKILL_GROUPS, SKILLS, type MapNode } from '../core/data';
import {
  atBank, atMarket, BAG_SLOTS, BELT_CAP, beltSlotOf, eat, fromBelt, POTION_AT, toBelt, BAG_STACK, bagRoomFor, stackOf, bagSlotsUsed, combatLevel, equip, level, playerBonuses, sell, setSettings, toBag, toBank, depositLoot, slotSpeed, unequip,
  weaponStyle,
} from '../core/sim';
import type { EquipSlot, GameState, ItemCategory, SkillId, Summary } from '../core/types';
import { XP_TABLE, levelProgress, speedForLevel, SPEED_CAP, BONUS_PER_LEVEL } from '../core/xp';
import { store } from '../store';
import { fmtDuration, fmtNum } from './format';
import { Codex } from './Codex';
import { Wardrobe } from './Wardrobe';
import { exportSave, importSave } from '../saveCode';
import { outfitOf } from '../game/hero';
import { Icon, SkillIcon } from './icons';

const GEAR_SLOTS: [EquipSlot, string][] = [
  ['head', '头部'], ['neck', '项链'], ['weapon', '武器'], ['body', '身体'], ['hands', '手部'], ['feet', '脚部'], ['ring', '戒指'],
];
const TOOL_SLOTS: [EquipSlot, string, SkillId][] = [
  ['axe', '斧头', 'woodcutting'], ['pickaxe', '镐子', 'mining'], ['sickle', '镰刀', 'gathering'], ['knife', '刮皮刀', 'hunting'],
  ['rod', '鱼竿', 'fishing'], ['hoe', '锄头', 'farming'], ['hammer', '锻造锤', 'smithing'], ['needle', '缝纫针', 'crafting'],
];
const STYLE_NAME = { melee: '近战', ranged: '远程', magic: '魔法' };

const CATEGORIES: [ItemCategory | 'all', string][] = [
  ['all', '全部'], ['resource', '资源'], ['material', '材料'], ['food', '食物'], ['potion', '药水'], ['ammo', '弹药'],
  ['gear', '装备'], ['tool', '工具'], ['misc', '其他'],
];

/** 不在仓库旁时的提示和寻路按钮 */
function FarFromBank() {
  return (
    <div className="go far-bank">
      <span className="muted">要走到城镇的仓库旁边才能存取</span>
      <button onClick={() => store.requestWalk('bank')}>寻路去仓库</button>
    </div>
  );
}

/** 选中物品后的详情和操作 */
function ItemDetail({ s, id, from }: { s: GameState; id: string; from: 'bank' | 'bag' }) {
  const item = ITEMS[id];
  const qty = (from === 'bank' ? s.bank[id] : s.bag[id]) ?? 0;
  if (!item || qty <= 0) return null;
  const e = item.equip;
  const near = atBank(s);
  const canEquip = e && level(s, e.skill) >= e.level && (from === 'bag' || near);
  return (
    <div className="item-detail frame">
      <div className="row1">
        <span className="with-icon"><Icon item={id} size={28} /> <b>{item.tier !== undefined && `${tierName(item.tier)} `}{item.name}</b></span>
        <span className="muted">×{fmtNum(qty)} · 单价 {item.value}</span>
      </div>
      {item.heals && <span>回复 {item.heals} 生命{item.buff && <b className="gold"> · {buffText(item.buff)}</b>}</span>}
      {item.desc && <span className="muted">{item.desc}</span>}
      {item.ammo && <span>{item.ammo.style === 'ranged' ? '箭矢' : '符文'} · 威力 +{item.ammo.power}</span>}
      {e && (
        <span className={canEquip ? '' : 'warn'}>
          需要{SKILLS[e.skill].name} {e.level} 级
          {e.speed ? ` · ${SKILLS[e.skill].name}速度 +${Math.round(e.speed * 100)}%` : ` · 攻 +${e.attack} 力 +${e.strength} 防 +${e.defence}${e.attackMs ? ` · 攻速 ${(e.attackMs / 1000).toFixed(1)} 秒` : ''}`}
          {e.style && e.slot !== 'weapon' && `（攻、力只对${STYLE_NAME[e.style]}生效）`}
        </span>
      )}
      <div className="go">
        {e && <button className="primary" disabled={!canEquip} onClick={() => store.dispatch((g) => equip(g, id))}>装备</button>}
        {from === 'bag' && item.heals && <button className="primary" onClick={() => store.dispatch((g) => eat(g, id))}>吃一个</button>}
        {beltSlotOf(id) && (from === 'bag' || near) && (
          <button onClick={() => store.dispatch((g) => toBelt(g, id))}>放进{beltSlotOf(id) === 'food' ? '食物栏' : '药水栏'}</button>
        )}
        {from === 'bank' && id !== 'coins' && (
          <button disabled={!near || bagRoomFor(s.bag, id) <= 0} onClick={() => store.dispatch((g) => toBag(g, id, qty))}>
            {bagRoomFor(s.bag, id) > 0 ? '放入背包' : '背包已满'}
          </button>
        )}
        {from === 'bank' && id !== 'coins' && (
          <>
            <button disabled={!atMarket(s)} onClick={() => store.dispatch((g) => sell(g, id, 1))}>卖 1 个</button>
            <button disabled={!atMarket(s)} onClick={() => store.dispatch((g) => sell(g, id, qty))}>全部卖出</button>
          </>
        )}
      </div>
      {from === 'bank' && id !== 'coins' && !atMarket(s) && (
        <div className="go far-bank">
          <span className="muted">卖东西要走到城镇的集市</span>
          <button onClick={() => store.requestWalk('market')}>寻路去集市</button>
        </div>
      )}
      <div className="go">
        {from === 'bag' && <button className="primary" disabled={!near} onClick={() => store.dispatch((g) => toBank(g, id, qty))}>放回仓库</button>}
      </div>
    </div>
  );
}

function ItemGrid({ items, sel, onSel, empty = 0, split = false }: { items: [string, number][]; sel: string | null; onSel: (id: string) => void; empty?: number; split?: boolean }) {
  // 背包按格子拆开：每格最多放一叠（物品 100 个，装备 1 件），多出来的占下一格
  const cells: [string, number, number][] = split
    ? items.flatMap(([id, n]) => {
      const k = stackOf(id);
      return Array.from({ length: Math.ceil(n / k) }, (_, i) => [id, Math.min(k, n - i * k), i] as [string, number, number]);
    })
    : items.map(([id, n]) => [id, n, 0]);
  return (
    <div className="grid">
      {cells.map(([id, n, i]) => (
        <button key={`${id}#${i}`} className={`cell ${sel === id ? 'sel' : ''}`} onClick={() => onSel(id)} title={ITEMS[id].name}>
          <Icon item={id} info={false} />
          <span className="qty">{fmtNum(n)}</span>
          <span className="nm">{ITEMS[id].name}</span>
        </button>
      ))}
      {Array.from({ length: empty }, (_, i) => <span key={`e${i}`} className="cell empty-cell" />)}
    </div>
  );
}

export function BankPanel({ s }: { s: GameState }) {
  const [cat, setCat] = useState<ItemCategory | 'all'>('all');
  const [sel, setSel] = useState<string | null>(null);
  const all = Object.entries(s.bank).filter(([id]) => id !== 'coins' && ITEMS[id]);
  const items = all.filter(([id]) => cat === 'all' || ITEMS[id].category === cat);
  const value = all.reduce((n, [id, q]) => n + ITEMS[id].value * q, 0);
  return (
    <div className="page">
      <h2>仓库 <small className="muted">{all.length} 种 · 估值 {fmtNum(value)} 金币</small></h2>
      {!atBank(s) && <FarFromBank />}
      <div className="chips-row">
        {CATEGORIES.map(([c, name]) => {
          const n = c === 'all' ? all.length : all.filter(([id]) => ITEMS[id].category === c).length;
          if (c !== 'all' && !n) return null;
          return <button key={c} className={`pill ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{name} {n}</button>;
        })}
      </div>
      <ItemGrid items={items} sel={sel} onSel={setSel} />
      {!all.length && <p className="muted">仓库是空的。采集、制作和打怪得到的东西都会放进这里，容量不限。</p>}
      {sel && <ItemDetail s={s} id={sel} from="bank" />}
    </div>
  );
}

/** 角色：身上的装备和工具，点一下卸下到背包 */
export function CharacterPanel({ s }: { s: GameState }) {
  const style = weaponStyle(s);
  const b = playerBonuses(s, style);
  const slot = (slotId: EquipSlot, name: string) => {
    const id = s.equipment[slotId];
    return (
      <button key={slotId} className={`slot ${id ? 'full' : ''}`} onClick={() => id && store.dispatch((g) => unequip(g, slotId))} title={id ? '点击卸下' : ''}>
        {id ? <Icon item={id} size={28} info={false} /> : <span className="empty" />}
        <small>{id ? ITEMS[id].name : name}</small>
      </button>
    );
  };
  const weapon = ITEMS[s.equipment.weapon ?? '']?.equip;
  return (
    <div className="page">
      <h2>装备 <small className="muted">战斗等级 {combatLevel(s)} · {STYLE_NAME[style]}</small></h2>
      <div className="equip">{GEAR_SLOTS.map(([id, name]) => slot(id, name))}</div>
      <p className="muted">
        攻击 +{b.attack} · 力量 +{b.strength} · 防御 +{b.defence} · 攻速 {((weapon?.attackMs ?? 2400) / 1000).toFixed(1)} 秒
      </p>
      <h2>补给栏 <small className="muted">各放一种，最多 {BELT_CAP} 个，不占背包</small></h2>
      <div className="equip tools">
        {(['food', 'potion'] as const).map((k) => {
          const b = s.belt?.[k];
          return (
            <button key={k} className={`slot ${b ? 'full' : ''}`} onClick={() => b && store.dispatch((g) => fromBelt(g, k))} title={b ? '点击取下放回背包' : ''}>
              {b ? <Icon item={b.id} size={28} info={false} /> : <span className="empty" />}
              <small>{b ? `${ITEMS[b.id].name} ×${b.qty}` : k === 'food' ? '食物栏' : '药水栏'}</small>
            </button>
          );
        })}
      </div>
      <p className="muted">战斗时先吃食物栏，血量低于 {Math.round(POTION_AT * 100)}% 先喝药水栏。回仓库补给时会把这两栏补满。在背包里点食物或药水，可以放进栏位。</p>
      <h2>工具</h2>
      <div className="equip tools">{TOOL_SLOTS.map(([id, name]) => slot(id, name))}</div>
      <p className="muted">{TOOL_SLOTS.map(([slot, name]) => `${name} +${Math.round(slotSpeed(s, slot) * 100)}%`).join(' · ')}</p>
      <p className="muted">点击身上的装备会卸下放进背包，背包满了才会送回仓库。背包里的装备随时能穿；仓库里的要站在仓库旁才能穿。</p>
    </div>
  );
}

/** 背包：随身带的东西，20 格 */
export function BagPanel({ s }: { s: GameState }) {
  const [sel, setSel] = useState<string | null>(null);
  const items = Object.entries(s.bag).filter(([id]) => ITEMS[id]);
  const used = bagSlotsUsed(s.bag);
  return (
    <div className="page">
      <h2>背包 <small className="muted">{used}/{BAG_SLOTS} 格 · 物品每格 {BAG_STACK} 个，装备每件一格</small></h2>
      <div className="bag-meter"><i style={{ width: `${(used / BAG_SLOTS) * 100}%` }} /></div>
      <ItemGrid items={items} sel={sel} onSel={setSel} empty={Math.max(0, BAG_SLOTS - used)} split />
      {sel && <ItemDetail s={s} id={sel} from="bag" />}
      {items.length > 0 && <button className="primary" disabled={!atBank(s)} onClick={() => store.dispatch(depositLoot)}>全部存入仓库（保留食物和弹药）</button>}
      {items.length > 0 && !atBank(s) && <FarFromBank />}
      <div className="opts">
        <span className="lbl">开战自动从仓库带食物</span>
        {[0, 20, 50, 100, -1].map((n) => (
          <button key={n} className={s.settings.carryFood === n ? 'on' : ''} onClick={() => store.dispatch((g) => setSettings(g, { carryFood: n }))}>
            {n < 0 ? '全部' : n === 0 ? '不带' : n}
          </button>
        ))}
      </div>
      <p className="muted">开战前背包里的食物不够设定数量，会先回仓库拿；战斗只吃背包里的食物。阵亡后回城复活，自动走回去接着打，连死 3 次才停。采集、制作和打怪的产出先放进背包；背包满了，角色会自动走回仓库存好（食物和弹药留在身上），再走回去接着干。制作时材料先用背包里的，不够再用仓库的。手动把东西在背包和仓库之间搬，要先走到城镇的仓库旁边。</p>
    </div>
  );
}

/** 每个技能能在哪些地点练 */
function whereToTrain(skill: SkillId): { node: MapNode; min: number; max: number }[] {
  const out: { node: MapNode; min: number; max: number }[] = [];
  for (const n of NODES) {
    const lv = n.actions.map((id) => ACTIONS[id]).filter((a) => a.kind === 'skill' && a.skill === skill).map((a) => a.level);
    if (lv.length) out.push({ node: n, min: Math.min(...lv), max: Math.max(...lv) });
  }
  return out.sort((a, b) => a.min - b.min);
}

export function SkillsPanel({ s, onPick }: { s: GameState; onPick: (nodeId: string) => void }) {
  const [open, setOpen] = useState<SkillId | null>(null);
  const total = (Object.keys(SKILLS) as SkillId[]).reduce((n, k) => n + level(s, k), 0);
  return (
    <div className="page">
      <h2>技能 <small className="muted">总等级 {total} · 战斗等级 {combatLevel(s)}</small></h2>
      {SKILL_GROUPS.map((g) => (
        <section key={g.id}>
          <h3>{g.name}</h3>
          <div className="skill-grid">
            {(Object.keys(SKILLS) as SkillId[]).filter((k) => SKILLS[k].group === g.id).map((k) => {
              const lvl = level(s, k);
              const xp = s.xp[k];
              return (
                <button key={k} className={`skill-card ${open === k ? 'sel' : ''}`} onClick={() => setOpen(open === k ? null : k)}>
                  <SkillIcon skill={k} size={30} />
                  <span className="sk-body">
                    <span className="row1"><b style={{ color: SKILLS[k].color }}>{SKILLS[k].name}</b><span>Lv {lvl}</span></span>
                    <span className="bar wide"><i style={{ width: `${levelProgress(xp) * 100}%`, background: SKILLS[k].color }} /></span>
                    <small className="muted">{fmtNum(xp)} 经验 · 还差 {fmtNum(XP_TABLE[lvl + 1] - xp)}</small>
                  </span>
                </button>
              );
            })}
          </div>
          {open && SKILLS[open].group === g.id && <SkillDetail s={s} skill={open} onPick={onPick} />}
        </section>
      ))}
    </div>
  );
}

const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;

function SkillDetail({ s, skill, onPick }: { s: GameState; skill: SkillId; onPick: (nodeId: string) => void }) {
  const places = whereToTrain(skill);
  const info = SKILLS[skill];
  const lvl = level(s, skill);
  return (
    <div className="skill-detail frame">
      <p>{info.desc}</p>
      {info.group !== 'combat' && (
        <p className="muted">
          等级没有上限。动作速度随等级提升，前期涨得快、后期慢，最多接近 +{pct(SPEED_CAP)}；当前 +{pct(speedForLevel(lvl))}，下一级 +{pct(speedForLevel(lvl + 1))}；
          等级每高出动作要求 1 级，{info.group === 'gather' ? '双倍产出' : '不消耗材料'}几率 +{pct(BONUS_PER_LEVEL)}。
        </p>
      )}
      {info.group === 'combat' && (
        <p className="muted">
          等级没有上限。{skill === 'hitpoints' ? `每级 +10 生命上限，当前 ${lvl * 10}。` : skill === 'defence' ? '每级降低被怪物命中的几率。' : '每级提高命中率和最大伤害。'}
        </p>
      )}
      {info.group === 'combat' && (
        <p className="muted">
          {skill === 'defence' || skill === 'hitpoints' ? '每次造成伤害都会获得 1/3 的经验。' : `装备${info.name}武器后在任意战斗点获得经验。`}
        </p>
      )}
      {places.map(({ node, min, max }) => (
        <button key={node.id} className="place" onClick={() => onPick(node.id)}>
          <span>{node.name} <small className="muted">{REGIONS[node.region].name}</small></span>
          <small>{min === max ? `${min} 级` : `${min}-${max} 级`} ›</small>
        </button>
      ))}
    </div>
  );
}

export function MorePanel({ s }: { s: GameState }) {
  const [confirming, setConfirming] = useState(false);
  const [codex, setCodex] = useState(false);
  const [wardrobe, setWardrobe] = useState(false);
  if (codex) return <Codex s={s} onClose={() => setCodex(false)} />;
  if (wardrobe) return <Wardrobe s={s} onClose={() => setWardrobe(false)} />;
  const total = Object.keys(ITEMS).length - 1;
  const got = Object.keys(s.seen).filter((id) => id !== 'coins' && ITEMS[id]).length;
  return (
    <div className="page">
      <h2>物品图鉴 <small className="muted">已收集 {got}/{total}</small></h2>
      <div className="bag-meter"><i style={{ width: `${(got / total) * 100}%` }} /></div>
      <button className="primary" onClick={() => setCodex(true)}>打开图鉴</button>
      <h2>衣橱 <small className="muted">当前：{outfitOf(s.settings.skin).name}</small></h2>
      <button className="primary" onClick={() => setWardrobe(true)}>打开衣橱</button>
      <h2>关于</h2>
      <p>苍岭放置（暂定名）v2 单机版。角色会一直执行队列里的任务，关掉网页也会在下次打开时结算离线收益，最多 24 小时。</p>
      <p className="muted">世界 2188×2188 格，9 个区域。资源、装备和 192 种怪物都是正式数值；美术是程序生成的像素图。存档保存在本浏览器里。</p>
      <h2>存档</h2>
      <SaveBackup s={s} />
      {confirming ? (
        <div className="go">
          <button className="danger" onClick={() => { store.reset(); setConfirming(false); }}>确定删除</button>
          <button onClick={() => setConfirming(false)}>取消</button>
        </div>
      ) : (
        <button className="danger" onClick={() => setConfirming(true)}>删除存档，重新开始</button>
      )}
    </div>
  );
}

/** 存档码导出/导入：换手机或浏览器清了数据时用 */
function SaveBackup({ s }: { s: GameState }) {
  const [mode, setMode] = useState<'none' | 'export' | 'import'>('none');
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const doExport = async () => {
    setMode('export');
    setMsg('');
    setCode(await exportSave(s));
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setMsg('已复制，找个地方（备忘录、聊天）存好');
    } catch {
      setMsg('复制失败，请长按文本框手动全选复制');
    }
  };
  const doImport = async () => {
    const next = await importSave(code);
    if (!next) return setMsg('存档码不对，请检查是否复制完整');
    store.replace(next);
  };
  return (
    <div className="save-backup">
      <p className="muted">存档只保存在这个浏览器里。iOS 长时间不打开网站可能会被清掉，建议定期导出存档码保存。</p>
      <div className="go">
        <button onClick={doExport}>导出存档码</button>
        <button onClick={() => { setMode('import'); setCode(''); setMsg(''); }}>导入存档码</button>
      </div>
      {mode !== 'none' && (
        <>
          <textarea className="save-code" value={code} readOnly={mode === 'export'} placeholder={mode === 'import' ? '把存档码粘贴到这里' : '生成中…'}
            onChange={(e) => setCode(e.target.value)} onFocus={(e) => mode === 'export' && e.target.select()} />
          <div className="go">
            {mode === 'export' ? <button className="primary" disabled={!code} onClick={copy}>复制</button>
              : <button className="danger" disabled={!code.trim()} onClick={doImport}>导入并覆盖当前存档</button>}
            <button onClick={() => setMode('none')}>收起</button>
          </div>
        </>
      )}
      {msg && <p className="warn">{msg}</p>}
    </div>
  );
}

/** 每个技能只显示最终等级，避免逐级刷屏 */
function finalLevels(sum: Summary): [SkillId, number][] {
  const last = new Map<SkillId, number>();
  for (const l of sum.levelUps) last.set(l.skill, l.level);
  return [...last];
}

export function OfflineModal({ sum }: { sum: Summary }) {
  const xp = Object.entries(sum.xp) as [SkillId, number][];
  const items = Object.entries(sum.items).filter(([id, q]) => q !== 0 && ITEMS[id]);
  const kills = Object.values(sum.kills).reduce((a, b) => a + b, 0);
  return (
    <div className="modal-bg">
      <div className="modal frame">
        <h2>离开期间的收获</h2>
        <p className="muted">你离开了 {fmtDuration(sum.elapsedMs)}</p>
        {!xp.length && !items.length && <p>角色一直在发呆……下次离开前记得安排任务。</p>}
        {xp.map(([k, v]) => (
          <div key={k} className="row1"><span className="with-icon"><SkillIcon skill={k} size={18} /> <span style={{ color: SKILLS[k].color }}>{SKILLS[k].name}</span></span><b>+{fmtNum(v)} 经验</b></div>
        ))}
        {sum.levelUps.length > 0 && (
          <p className="gold">升级：{finalLevels(sum).map(([k, l]) => `${SKILLS[k].name} → ${l} 级`).join('、')}</p>
        )}
        {kills > 0 && <p>击败 {kills} 只怪物{sum.foodEaten > 0 && `，吃掉 ${sum.foodEaten} 份食物`}{sum.ammoUsed > 0 && `，用掉 ${sum.ammoUsed} 发弹药`}</p>}
        {sum.deaths > 0 && <p className="warn">阵亡 {sum.deaths} 次{sum.taskEnds.some((t) => t.reason === 'death') ? '，连续阵亡太多次，战斗已停止' : '，每次都回城复活后走回去接着打'}</p>}
        <div className="loot">
          {items.map(([id, q]) => (
            <span key={id} className={q < 0 ? 'neg' : ''}><Icon item={id} size={18} /> {ITEMS[id].name} {q > 0 ? '+' : ''}{fmtNum(q)}</span>
          ))}
        </div>
        <button className="primary" onClick={() => store.dismissOffline()}>收下</button>
      </div>
    </div>
  );
}

/** 宽屏右侧的地点列表，按区域分组 */
export function NodeList({ onPick }: { onPick: (id: string) => void }) {
  const regions = Object.keys(REGIONS) as (keyof typeof REGIONS)[];
  return (
    <div className="page">
      <h2>地点</h2>
      <p className="muted">点地图上的地点或下面的列表选择任务；点空地让角色走过去；右下角 ▦ 打开世界地图，可以寻路前往各个地点。</p>
      {regions.map((r) => {
        const nodes = NODES.filter((n) => n.region === r);
        if (!nodes.length) return null;
        return (
          <section key={r}>
            <h3>{REGIONS[r].name}</h3>
            <ul className="node-list">
              {nodes.map((n) => {
                const kinds = [...new Set(n.actions.map((id) => {
                  const a = ACTIONS[id];
                  return a.kind === 'skill' ? SKILLS[a.skill].name : '战斗';
                }))];
                return (
                  <li key={n.id}>
                    <button onClick={() => onPick(n.id)}>
                      <span className="row1"><b>{n.name}</b>{!n.town && <small className="muted">Lv{n.lv[0]}{n.lv[1] !== n.lv[0] && `-${n.lv[1]}`}</small>}</span>
                      <small className="muted">{n.opens === 'bank' ? '打开仓库' : `${kinds.join(' · ')} · ${n.actions.length} 项`}</small>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
