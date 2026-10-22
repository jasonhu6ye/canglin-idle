import { useState } from 'react';
import { ACTIONS, ITEMS, NODES, SKILLS } from '../core/data';
import { equip, level, playerBonuses, sell } from '../core/sim';
import type { EquipSlot, GameState, SkillId, Summary } from '../core/types';
import { XP_TABLE, levelProgress, MAX_LEVEL } from '../core/xp';
import { store } from '../store';
import { fmtDuration, fmtNum } from './format';

const SLOT_NAMES: Record<EquipSlot, string> = { weapon: '武器', head: '头部', body: '身体' };

export function BagPanel({ s }: { s: GameState }) {
  const [sel, setSel] = useState<string | null>(null);
  const items = Object.entries(s.bank).filter(([id]) => id !== 'coins');
  const b = playerBonuses(s);
  const item = sel ? ITEMS[sel] : null;
  const qty = sel ? s.bank[sel] ?? 0 : 0;

  return (
    <div className="page">
      <h2>装备</h2>
      <div className="equip">
        {(Object.keys(SLOT_NAMES) as EquipSlot[]).map((slot) => (
          <div key={slot} className="slot">
            <small>{SLOT_NAMES[slot]}</small>
            {s.equipment[slot] ? ITEMS[s.equipment[slot]!].name : '—'}
          </div>
        ))}
      </div>
      <p className="muted">攻击 +{b.attack} · 力量 +{b.strength} · 防御 +{b.defence}</p>

      <h2>仓库 <small className="muted">（{items.length} 种）</small></h2>
      <div className="grid">
        {items.map(([id, n]) => (
          <button key={id} className={`cell ${sel === id ? 'sel' : ''}`} onClick={() => setSel(id)}>
            <span>{ITEMS[id].name}</span>
            <b>{fmtNum(n)}</b>
          </button>
        ))}
        {!items.length && <p className="muted">还没有东西，去挖矿或钓鱼吧。</p>}
      </div>

      {item && qty > 0 && (
        <div className="item-detail">
          <b>{item.name}</b> ×{fmtNum(qty)} · 单价 {item.value} 金币
          {item.heals && <span> · 回复 {item.heals} 生命</span>}
          {item.equip && (
            <span> · 需要近战 {item.equip.level} · 攻 +{item.equip.attack} 力 +{item.equip.strength} 防 +{item.equip.defence}</span>
          )}
          <div className="go">
            {item.equip && (
              <button className="primary" disabled={level(s, 'melee') < item.equip.level}
                onClick={() => store.dispatch((g) => equip(g, item.id))}>装备</button>
            )}
            <button onClick={() => store.dispatch((g) => sell(g, item.id, 1))}>卖 1 个</button>
            <button onClick={() => store.dispatch((g) => sell(g, item.id, qty))}>全部卖出</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function SkillsPanel({ s }: { s: GameState }) {
  return (
    <div className="page">
      <h2>技能</h2>
      {(Object.keys(SKILLS) as SkillId[]).map((k) => {
        const lvl = level(s, k);
        const xp = s.xp[k];
        return (
          <div key={k} className="skill">
            <div className="row1">
              <b style={{ color: SKILLS[k].color }}>{SKILLS[k].name}</b>
              <span>{lvl} / {MAX_LEVEL}</span>
            </div>
            <span className="bar wide"><i style={{ width: `${levelProgress(xp) * 100}%`, background: SKILLS[k].color }} /></span>
            <small className="muted">
              {fmtNum(xp)} 经验{lvl < MAX_LEVEL && ` · 距下一级 ${fmtNum(XP_TABLE[lvl + 1] - xp)}`}
            </small>
          </div>
        );
      })}
    </div>
  );
}

export function MorePanel() {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="page">
      <h2>关于</h2>
      <p>苍岭放置（暂定名）M1 单机原型。角色会一直执行队列里的任务，关掉网页也会在下次打开时结算离线收益，最多 24 小时。</p>
      <p className="muted">美术是程序生成的占位像素图，后续会替换成正式素材。存档保存在本浏览器里。</p>
      <h2>存档</h2>
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

/** 每个技能只显示最终等级，避免逐级刷屏 */
function finalLevels(sum: Summary): [SkillId, number][] {
  const last = new Map<SkillId, number>();
  for (const l of sum.levelUps) last.set(l.skill, l.level);
  return [...last];
}

export function OfflineModal({ sum }: { sum: Summary }) {
  const xp = Object.entries(sum.xp) as [SkillId, number][];
  const items = Object.entries(sum.items).filter(([, q]) => q !== 0);
  const kills = Object.values(sum.kills).reduce((a, b) => a + b, 0);
  return (
    <div className="modal-bg">
      <div className="modal">
        <h2>离开期间的收获</h2>
        <p className="muted">你离开了 {fmtDuration(sum.elapsedMs)}</p>
        {!xp.length && !items.length && <p>角色一直在发呆……下次离开前记得安排任务。</p>}
        {xp.map(([k, v]) => (
          <div key={k} className="row1"><span style={{ color: SKILLS[k].color }}>{SKILLS[k].name}</span><b>+{fmtNum(v)} 经验</b></div>
        ))}
        {sum.levelUps.length > 0 && (
          <p className="gold">升级：{finalLevels(sum).map(([k, l]) => `${SKILLS[k].name} → ${l} 级`).join('、')}</p>
        )}
        {kills > 0 && <p>击败 {kills} 只怪物{sum.foodEaten > 0 && `，吃掉 ${sum.foodEaten} 份食物`}</p>}
        {sum.deaths > 0 && <p className="warn">阵亡 {sum.deaths} 次，战斗已停止</p>}
        <div className="loot">
          {items.map(([id, q]) => (
            <span key={id} className={q < 0 ? 'neg' : ''}>{ITEMS[id].name} {q > 0 ? '+' : ''}{fmtNum(q)}</span>
          ))}
        </div>
        <button className="primary" onClick={() => store.dismissOffline()}>收下</button>
      </div>
    </div>
  );
}

/** 宽屏右侧的地点列表：电脑上不用在地图里找点 */
export function NodeList({ onPick }: { onPick: (id: string) => void }) {
  return (
    <div className="page">
      <h2>地点</h2>
      <p className="muted">点地图上的地点或下面的列表选择任务；点空地可以让角色走过去。</p>
      <ul className="node-list">
        {NODES.map((n) => {
          const kinds = [...new Set(n.actions.map((id) => {
            const a = ACTIONS[id];
            return a.kind === 'skill' ? SKILLS[a.skill].name : '战斗';
          }))];
          return (
            <li key={n.id}>
              <button onClick={() => onPick(n.id)}>
                <b>{n.name}</b>
                <small className="muted">{kinds.join(' · ')} · {n.actions.length} 项</small>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
