import { NODES, REGIONS, WAYSTONES } from '../core/data';
import { atWaystone } from '../core/sim';
import type { GameState } from '../core/types';
import { store } from '../store';
import { emitToGame } from './GameCanvas';

/**
 * 传说石碑面板（用户 10-23）：第一次要走到石碑旁边激活；
 * 站在任意一座激活过的石碑旁，就能传送到别的激活过的石碑。正在做的工作会暂停。
 */
export function WaystoneSheet({ s, nodeId, onClose }: { s: GameState; nodeId: string; onClose: () => void }) {
  const node = NODES.find((n) => n.id === nodeId)!;
  const on = s.waystones ?? [];
  const here = atWaystone(s);
  const lit = on.includes(nodeId);
  const go = () => { store.requestWalk(nodeId); onClose(); };
  return (
    <div className="sheet stone-sheet">
      <div className="sheet-head">
        <button className="back" onClick={onClose}>‹ 返回</button>
        <h2>{node.name}</h2>
        <small className="muted">{REGIONS[node.region].name} · 已激活 {on.length}/{WAYSTONES.length} 座</small>
      </div>
      {!lit && (
        <div className="go far-bank">
          <span className="muted">这座石碑还没激活。走到它旁边就会自动激活，以后就能传送过来。</span>
          <button onClick={go}>寻路去{node.name.replace('传说石碑·', '')}</button>
        </div>
      )}
      {lit && !here && (
        <div className="go far-bank">
          <span className="muted">要站在任意一座激活过的石碑旁边才能传送。</span>
          <button onClick={go}>寻路去这座石碑</button>
        </div>
      )}
      {here && <p className="pad">你正站在<b className="gold">{here.name}</b>旁边，选一座要去的石碑。传送后正在做的工作会暂停。</p>}
      <ul className="action-list stone-list">
        {WAYSTONES.map((n) => {
          const ok = on.includes(n.id);
          const cur = here?.id === n.id;
          return (
            <li key={n.id} className={`${ok ? '' : 'locked'} ${cur ? 'sel' : ''}`}>
              <span className={`stone-dot ${ok ? 'on' : ''}`} />
              <span className="act-body">
                <span className="row1"><b>{n.name.replace('传说石碑·', '')}</b></span>
                <span className="row2">{REGIONS[n.region].name}{ok ? '' : ' · 未激活'}{cur ? ' · 你在这里' : ''}</span>
              </span>
              {ok && !cur && (
                <button className="primary" disabled={!here} onClick={() => { emitToGame('waystone', n.id); onClose(); }}>传送</button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
