import { useEffect, useState } from 'react';
import { ITEMS } from '../core/data';
import type { GameState } from '../core/types';
import { CodexDetail } from './Codex';
import { onOpenItem, openItem } from './itemOpen';

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
