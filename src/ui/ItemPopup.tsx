import { useEffect, useState } from 'react';
import { ITEMS } from '../core/data';
import type { GameState } from '../core/types';
import { CodexDetail } from './Codex';
import { onOpenItem, onShowLoot, openItem, showLoot } from './itemOpen';
import { Icon } from './icons';
import { fmtNum } from './format';

/** 全局物品详情弹窗：属性、来源、用途。点背景或「关闭」收起 */
export function ItemPopup({ s }: { s: GameState }) {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => onOpenItem(setId), []);
  if (!id || !ITEMS[id]) return null;
  return (
    <div className="item-popup" onClick={() => openItem(null)}>
      <div className="item-popup-body" onClick={(e) => e.stopPropagation()}>
        <CodexDetail s={s} id={id} reveal />
        <button className="primary close" onClick={() => openItem(null)}>关闭</button>
      </div>
    </div>
  );
}

/** 打开宝箱、福袋后弹出开到的东西 */
export function LootReveal() {
  const [r, setR] = useState<{ from: string; got: Record<string, number> } | null>(null);
  useEffect(() => onShowLoot(setR), []);
  if (!r) return null;
  const list = Object.entries(r.got).sort(([a], [b]) => (a === 'coins' ? -1 : b === 'coins' ? 1 : ITEMS[b].value - ITEMS[a].value));
  return (
    <div className="item-popup" onClick={() => showLoot(null)}>
      <div className="item-popup-body loot-reveal frame" onClick={(e) => e.stopPropagation()}>
        <h3>打开 {r.from}</h3>
        <div className="loot-grid">
          {list.map(([id, q]) => (
            <div key={id} className={`loot-cell ${ITEMS[id].equip || ITEMS[id].category === 'loot' || ITEMS[id].value >= 150 ? 'rare' : ''}`}>
              <Icon item={id} size={30} />
              <span>{ITEMS[id].name}</span>
              <b>×{fmtNum(q)}</b>
            </div>
          ))}
        </div>
        <button className="primary close" onClick={() => showLoot(null)}>收下</button>
      </div>
    </div>
  );
}
