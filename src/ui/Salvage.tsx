import { useMemo, useState } from 'react';
import { ITEMS, type MapNode } from '../core/data';
import { QUALITY_NAME, qClass } from '../core/quality';
import { atSalvage, canSalvage, salvage, SALVAGE_BONUS, salvageValue } from '../core/sim';
import type { GameState } from '../core/types';
import { store } from '../store';
import { tl } from '../i18n';
import { fmtNum } from './format';
import { Icon } from './icons';
import { gearStats } from './panels';

/*
 * 城镇分解台（用户 10-25）：把仓库里的装备和工具拆掉换金币，
 * 给的钱是售价的 1.2 倍，比直接去集市卖划算一点。
 */

export function SalvageSheet({ s, node, onClose }: { s: GameState; node: MapNode; onClose: () => void }) {
  const near = !!atSalvage(s);
  const [q, setQ] = useState<number | 'all'>('all');
  const [pick, setPick] = useState<Record<string, number>>({});
  const [got, setGot] = useState(0);
  const list = useMemo(() => Object.entries(s.bank)
    .filter(([id, n]) => n > 0 && canSalvage(id))
    .sort(([a], [b]) => (ITEMS[a].tier ?? 0) - (ITEMS[b].tier ?? 0) || (ITEMS[a].quality ?? 0) - (ITEMS[b].quality ?? 0) || (a < b ? -1 : 1)), [s.bank]);
  const shown = list.filter(([id]) => q === 'all' || (ITEMS[id].quality ?? 0) === q);
  const sel = Object.entries(pick).filter(([id, n]) => n > 0 && (s.bank[id] ?? 0) > 0).map(([id, n]) => [id, Math.min(n, s.bank[id])] as [string, number]);
  const total = sel.reduce((t, [id, n]) => t + n * salvageValue(id), 0);
  const count = sel.reduce((t, [, n]) => t + n, 0);
  const set = (id: string, n: number) => setPick((p) => ({ ...p, [id]: Math.max(0, Math.min(n, s.bank[id] ?? 0)) }));
  const pickAll = (rows: [string, number][]) => setPick((p) => ({ ...p, ...Object.fromEntries(rows) }));
  const go = () => {
    const rare = sel.filter(([id]) => (ITEMS[id].quality ?? 0) >= 3);
    if (rare.length && !window.confirm(tl`要分解的里面有 ${rare.length} 种史诗以上品质的装备，确定吗？`)) return;
    let coins = 0;
    store.dispatch((g) => {
      const [next, c] = salvage(g, Object.fromEntries(sel));
      coins = c;
      return next;
    });
    if (coins) { setGot(coins); setPick({}); }
  };
  return (
    <div className="sheet salvage-sheet">
      <div className="sheet-head">
        <button className="back" onClick={onClose}>{tl('‹ 返回')}</button>
        <h2>{node.name}</h2>
        <small className="muted">{tl`分解仓库里的装备和工具，得到售价 ${SALVAGE_BONUS} 倍的金币`}</small>
      </div>
      <div className="ranch-stats">
        <span>{tl('仓库金币 ')}<b>{fmtNum(s.bank.coins ?? 0)}</b></span>
        {got > 0 && <span className="salv-got">{tl`+${fmtNum(got)} 金币`}</span>}
        {!near && <button className="primary" onClick={() => { store.requestWalk(node.id); onClose(); }}>{tl('寻路到分解台')}</button>}
      </div>
      <div className="chips-row">
        <button className={`pill ${q === 'all' ? 'on' : ''}`} onClick={() => setQ('all')}>{tl('全部')} {list.length}</button>
        {QUALITY_NAME.map((name, i) => {
          const n = list.filter(([id]) => (ITEMS[id].quality ?? 0) === i).length;
          if (!n) return null;
          return <button key={i} className={`pill ${q === i ? 'on' : ''}`} onClick={() => setQ(i)}><span className={qClass(i) || 'qn0'}>{name}</span> {n}</button>;
        })}
      </div>
      {!list.length && <p className="muted pad">{tl('仓库里没有能分解的装备或工具。身上穿着的不会被分解。')}</p>}
      {shown.length > 0 && (
        <div className="salv-quick">
          <button className="pill" onClick={() => pickAll(shown)}>{tl('全选这一页')}</button>
          <button className="pill" onClick={() => pickAll(list.filter(([id]) => !ITEMS[id].quality))}>{tl('选上所有普通品质')}</button>
          {count > 0 && <button className="pill" onClick={() => setPick({})}>{tl('清空')}</button>}
        </div>
      )}
      <div className="salv-list">
        {shown.map(([id, n]) => {
          const it = ITEMS[id];
          const k = Math.min(pick[id] ?? 0, n);
          return (
            <div key={id} className={`salv-row ${k ? 'on' : ''}`}>
              <Icon item={id} size={32} />
              <div className="salv-info">
                <b className={qClass(it.quality) || 'qn0'}>{it.name}</b>
                <small className="muted">{gearStats(id)}</small>
                <small>{tl`仓库 ${n} 件 · 每件 ${fmtNum(salvageValue(id))} 金币`}</small>
              </div>
              <div className="salv-qty">
                <button onClick={() => set(id, k - 1)} disabled={!k}>−</button>
                <span>{k}</span>
                <button onClick={() => set(id, k + 1)} disabled={k >= n}>+</button>
                <button className="pill" onClick={() => set(id, k >= n ? 0 : n)}>{k >= n ? tl('不要') : tl('全部')}</button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="salv-foot">
        <span>{tl`已选 ${count} 件，可得 `}<b>{fmtNum(total)}</b>{tl(' 金币')}</span>
        <button className="primary" disabled={!near || !count} onClick={go}>{near ? tl('分解') : tl('要站在分解台旁')}</button>
      </div>
    </div>
  );
}
